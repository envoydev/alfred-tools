// Printing a plan: each step as the command it runs, and the notes.
import { pathFor } from '../entries/platform.ts';
import * as roots from '../roots/roots.ts';
import { renderLine } from './repair-tail.ts';
import type { CursorWritePlanStep, KeyLine, Plan, PlanStep, Reconnect } from './types.ts';

// ---- printing -------------------------------------------------------------------------------------------------------

const shellQuote = (text: string): string => (/^[A-Za-z0-9_\-./:=@,+]+$/.test(text) ? text : `'${text.replace(/'/g, "'\\''")}'`);

export function argvOf(step: PlanStep): string[] | null
{
    switch (step.op)
    {
        case 'mcp-add': return ['mcp', 'add-json', step.name, JSON.stringify(step.entry), '-s', step.scope];
        case 'mcp-remove': return ['mcp', 'remove', step.name, '-s', step.scope];
        default: return null;
    }
}

// The plan's line for one key: who reads it, from which files, and whether its name is filled there - never a value.
function keyLine(planKey: KeyLine): string
{
    const reader = planKey.kind === 'helper' ? 'mcp-headers.js reads it each time Claude Code connects' : planKey.kind === 'bridge' ? 'mcp-bridge.js reads it each time the server starts' : 'the apply writes it into the registration';
    const parts = [`Key: ${planKey.name} (${planKey.scope} scope) - ${planKey.variable}; ${reader}, from ${planKey.files.join(', then ')}. The key is never printed.`];
    if (planKey.filled) parts.push('Filled.');
    else if (planKey.old) parts.push(`${planKey.variable} is in ${planKey.old}, which alfred-tools no longer reads: move it to ${planKey.files[0]}`);
    else parts.push(`Not filled yet: add ${planKey.variable}=<your key> to ${planKey.files[0]}${planKey.kind === 'helper' ? ' - until then the server connects without its key' : planKey.kind === 'bridge' ? ' - until then the server does not start' : ' before the apply, or after it run /alfred-tools:configure and keep the name - it writes the key in'}.`);
    return parts.join(' ');
}

// How a hosted keyed server connects once written (spec F3). The line makes no claim about what /mcp's Authenticate does
// for a server whose helper printed {}: nothing has measured it. An unfilled one names what the key must be - the
// route's hint (atlassian's email:api_token, gitlab's fine-grained token) - since the recommended path asks nothing
// that would show it (0.3.0 review, Important 1).
export function reconnectLine({ name, variable, file, filled, anonymous, hint = null }: Pick<Reconnect, 'name' | 'variable' | 'file' | 'filled' | 'anonymous'> & { hint?: string | null }): string
{
    if (filled) return `${name}: connects with its key at the next session start; in a session already running, /mcp -> ${name} -> Reconnect`;
    return `${name}: fill ${variable} in ${file}${hint ? ` (${hint})` : ''}, then Reconnect it in /mcp - until then ${anonymous ? 'it runs without the key, at lower rate limits' : 'it connects without the key, and /mcp shows needs authentication'}`;
}

export function renderPlan(plan: Plan): string
{
    const lines: string[] = [];
    const pathApi = pathFor(plan.os);
    if (plan.outside?.length) lines.push(...plan.outside, '');
    if (plan.errors.length) lines.push('Cannot plan:', ...plan.errors.map((error) => `  ! ${error}`), '');
    if (!plan.steps.length && !plan.errors.length) lines.push('Nothing to do: every answer already matches what is installed - no claude call, no file written.');
    // which apps (spec D3): stated once, with the Cursor file each scope writes
    if (plan.apps)
    {
        lines.push(`Apps: ${plan.apps.includes('cursor') ? 'Claude Code and Cursor' : 'Claude Code'}`);
        for (const step of plan.steps.filter((candidate): candidate is CursorWritePlanStep => candidate.op === 'cursor-write')) lines.push(`  ${step.family === 'global' ? 'Global scope' : 'Project and Local scope'} in Cursor: ${step.file}`);
        lines.push('');
    }
    plan.steps.forEach((step, i) =>
    {
        lines.push(`${i + 1}. ${step.why || step.op}`);
        const argv = argvOf(step);
        if (argv) lines.push(`   claude ${argv.map(shellQuote).join(' ')}`);
        else if (step.op === 'mcp-move') lines.push(`   claude mcp add-json ${shellQuote(step.to.name)} ${shellQuote(JSON.stringify(step.entry))} -s ${step.to.scope}`, '   (read back)', `   claude mcp remove ${shellQuote(step.from.name)} -s ${step.from.scope}`);
        else if (step.op === 'mcp-replace') lines.push(`   claude mcp remove ${shellQuote(step.name)} -s ${step.scope}`, `   claude mcp add-json ${shellQuote(step.name)} ${shellQuote(JSON.stringify(step.entry))} -s ${step.scope}`, `   (the old entry is saved to rollback.json and re-added if the add fails)`);
        else if (step.op === 'ensure-dir') lines.push(`   writes ${step.path}/.gitignore  (contents: *)`);
        else if (step.op === 'root-ignore') lines.push(`   writes ${pathApi.join(step.path, '.gitignore')}  (${roots.GITIGNORE.trim().split('\n').join(', ')} - or the lines it lacks, appended)`);
        else if (step.op === 'write-helper') lines.push(`   writes ${pathApi.join(step.path, roots.FILES.helper)}  (this plugin's header helper)`, `   (and package.json, type commonjs, when absent)`);
        else if (step.op === 'write-bridge') lines.push(`   writes ${pathApi.join(step.path, roots.FILES.bridge)}  (this plugin's URL bridge)`, `   (and package.json, type commonjs, when absent)`);
        else if (step.op === 'move-root-file') lines.push(`   moves ${step.from} to ${step.to}  (the root's own file goes with it)`);
        else if (step.op === 'write-serena-context') lines.push(`   writes ${pathApi.join(step.path, roots.FILES.serenaContext)}  (serena's context: code navigation only)`);
        else if (step.op === 'retire-shipped') lines.push(`   removes ${step.file}  (only when it is this plugin's own, unedited copy and no registration names it)`);
        else if (step.op === 'serena-config-init') lines.push(`   writes ${step.file}  (projects: [], base_modes: [] and project_serena_folder_location - only when it is not there)`);
        else if (step.op === 'serena-project-folder') lines.push(`   sets project_serena_folder_location in ${step.file}  (no other line changes; in-tree .serena folders are named, never moved)`);
        else if (step.op === 'ensure-key-name') lines.push(`   writes ${step.file}  (names only: ${step.names.join(', ')} - you fill in each value)`);
        else if (step.op === 'list-write' || step.op === 'retire-record' || step.op === 'cursor-write' || step.op === 'deny-read') lines.push(renderLine(step));
        else if (step.op === 'order-mcp-json') lines.push(`   reorders ${step.file}  (no value changes)`);
        else if (step.op === 'record-root') lines.push(`   writes ${roots.FILES.map} in the plugin's data folder  (the ${step.family} root: ${step.root})`);
        else if (step.op === 'fetch') lines.push(`   ${step.argv.map(shellQuote).join(' ')}`, '   (after the apply, in the background: fills the cache only; if it fails the registration stays and the first start tries again)');
    });
    if (plan.keys.length) lines.push('', ...plan.keys.map(keyLine));
    if ((plan.reconnect || []).length) lines.push('', ...plan.reconnect.map(reconnectLine));
    // the shared sign-in (D5) opens the browser at the first start in either app; the rest sign in through /mcp
    for (const oauthEntry of plan.oauth) if (oauthEntry.signin) lines.push('', `OAuth: ${oauthEntry.name}: your browser opens to sign in the first time it starts, in Claude Code or Cursor; the sign-in is kept in ${pathApi.join(oauthEntry.root, roots.FILES.signIns)}/ and serves both.`);
    const viaMcp = plan.oauth.filter((candidate) => !candidate.signin);
    if (viaMcp.length) lines.push('', `OAuth: run /mcp once in a session to log in to ${viaMcp.map((oauthEntry) => oauthEntry.name).join(', ')}.`);
    if (plan.dangerous.length) lines.push('', ...plan.dangerous.map((dangerous) => `Code-running tool on '${dangerous.name}': ${dangerous.tools.map((tool) => `${tool.tool} (${tool.why})`).join('; ')}. This plugin adds no guard.`));
    if (plan.notes.length) lines.push('', ...plan.notes.map((note) => `Note: ${note}`));
    if (plan.unchanged.length) lines.push('', ...plan.unchanged.map((note) => `Unchanged: ${note}`));
    return globalWords(lines.join('\n'));
}

// The prose says Global for user scope (spec D1): 'global (user scope)' the first time, 'global scope' after. The commands
// keep the value (`-s user`, `--scope user`).
function globalWords(text: string): string
{
    let first = true;
    return text.replace(/\buser scope\b/g, () => { if (!first) return 'global scope'; first = false; return 'global (user scope)'; });
}

