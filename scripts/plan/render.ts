// Printing a plan: each step as the command it runs, and the notes.
import { pathFor } from '../entries/platform.ts';
import * as roots from '../roots/roots.ts';
import { renderLine } from './repair-tail.ts';

// ---- printing -------------------------------------------------------------------------------------------------------

const shq = (s) => (/^[A-Za-z0-9_\-./:=@,+]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`);

export function argvOf(step)
{
    switch (step.op)
    {
        case 'mcp-add': return ['mcp', 'add-json', step.name, JSON.stringify(step.entry), '-s', step.scope];
        case 'mcp-remove': return ['mcp', 'remove', step.name, '-s', step.scope];
        default: return null;
    }
}

// The plan's line for one key: who reads it, from which files, and whether its name is filled there - never a value.
function keyLine(k)
{
    const reader = k.kind === 'helper' ? 'mcp-headers.js reads it each time Claude Code connects' : k.kind === 'bridge' ? 'mcp-bridge.js reads it each time the server starts' : 'the apply writes it into the registration';
    const parts = [`Key: ${k.name} (${k.scope} scope) - ${k.variable}; ${reader}, from ${k.files.join(', then ')}. The key is never printed.`];
    if (k.filled) parts.push('Filled.');
    else if (k.old) parts.push(`${k.variable} is in ${k.old}, which preferred-tools no longer reads: move it to ${k.files[0]}`);
    else parts.push(`Not filled yet: add ${k.variable}=<your key> to ${k.files[0]}${k.kind === 'helper' ? ' - until then the server connects without its key' : k.kind === 'bridge' ? ' - until then the server does not start' : ' before the apply, or after it run /preferred-tools:configure and keep the name - it writes the key in'}.`);
    return parts.join(' ');
}

// How a hosted keyed server connects once written (spec F3). The line makes no claim about what /mcp's Authenticate does
// for a server whose helper printed {}: nothing has measured it. An unfilled one names what the key must be - the
// route's hint (atlassian's email:api_token, gitlab's fine-grained token) - since the recommended path asks nothing
// that would show it (0.3.0 review, Important 1).
export function reconnectLine({ name, variable, file, filled, anonymous, hint = null })
{
    if (filled) return `${name}: connects with its key at the next session start; in a session already running, /mcp -> ${name} -> Reconnect`;
    return `${name}: fill ${variable} in ${file}${hint ? ` (${hint})` : ''}, then Reconnect it in /mcp - until then ${anonymous ? 'it runs without the key, at lower rate limits' : 'it connects without the key, and /mcp shows needs authentication'}`;
}

export function render(p)
{
    const lines = [];
    const P = pathFor(p.os);
    if ((p.outside || []).length) lines.push(...p.outside, '');
    if (p.errors.length) lines.push('Cannot plan:', ...p.errors.map((e) => `  ! ${e}`), '');
    if (!p.steps.length && !p.errors.length) lines.push('Nothing to do: every answer already matches what is installed - no claude call, no file written.');
    // which apps (spec D3): stated once, with the Cursor file each scope writes
    if (p.apps)
    {
        lines.push(`Apps: ${p.apps.includes('cursor') ? 'Claude Code and Cursor' : 'Claude Code'}`);
        for (const s of p.steps.filter((x) => x.op === 'cursor-write')) lines.push(`  ${s.family === 'global' ? 'Global scope' : 'Project and Local scope'} in Cursor: ${s.file}`);
        lines.push('');
    }
    p.steps.forEach((s, i) =>
    {
        lines.push(`${i + 1}. ${s.why || s.op}`);
        const argv = argvOf(s);
        if (argv) lines.push(`   claude ${argv.map(shq).join(' ')}`);
        else if (s.op === 'mcp-move') lines.push(`   claude mcp add-json ${shq(s.to.name)} ${shq(JSON.stringify(s.entry))} -s ${s.to.scope}`, '   (read back)', `   claude mcp remove ${shq(s.from.name)} -s ${s.from.scope}`);
        else if (s.op === 'mcp-replace') lines.push(`   claude mcp remove ${shq(s.name)} -s ${s.scope}`, `   claude mcp add-json ${shq(s.name)} ${shq(JSON.stringify(s.entry))} -s ${s.scope}`, `   (the old entry is saved to rollback.json and re-added if the add fails)`);
        else if (s.op === 'ensure-dir') lines.push(`   writes ${s.path}/.gitignore  (contents: *)`);
        else if (s.op === 'root-ignore') lines.push(`   writes ${P.join(s.path, '.gitignore')}  (${roots.GITIGNORE.trim().split('\n').join(', ')} - or the lines it lacks, appended)`);
        else if (s.op === 'write-helper') lines.push(`   writes ${P.join(s.path, roots.FILES.helper)}  (this plugin's header helper)`, `   (and package.json, type commonjs, when absent)`);
        else if (s.op === 'write-bridge') lines.push(`   writes ${P.join(s.path, roots.FILES.bridge)}  (this plugin's URL bridge)`, `   (and package.json, type commonjs, when absent)`);
        else if (s.op === 'move-root-file') lines.push(`   moves ${s.from} to ${s.to}  (the root's own file goes with it)`);
        else if (s.op === 'write-serena-context') lines.push(`   writes ${P.join(s.path, roots.FILES.serenaContext)}  (serena's context: code navigation only)`);
        else if (s.op === 'ensure-key-name') lines.push(`   writes ${s.file}  (names only: ${s.names.join(', ')} - you fill in each value)`);
        else if (s.op === 'list-write' || s.op === 'retire-record' || s.op === 'cursor-write' || s.op === 'deny-read') lines.push(renderLine(s));
        else if (s.op === 'order-mcp-json') lines.push(`   reorders ${s.file}  (no value changes)`);
        else if (s.op === 'record-root') lines.push(`   writes ${roots.FILES.map} in the plugin's data folder  (the ${s.family} root: ${s.root})`);
        else if (s.op === 'fetch') lines.push(`   ${s.argv.map(shq).join(' ')}`, '   (after the apply, in the background: fills the cache only; if it fails the registration stays and the first start tries again)');
    });
    if (p.keys.length) lines.push('', ...p.keys.map(keyLine));
    if ((p.reconnect || []).length) lines.push('', ...p.reconnect.map(reconnectLine));
    // the shared sign-in (D5) opens the browser at the first start in either app; the rest sign in through /mcp
    for (const o of p.oauth.filter((x) => x.signin)) lines.push('', `OAuth: ${o.name}: your browser opens to sign in the first time it starts, in Claude Code or Cursor; the sign-in is kept in ${P.join(o.root, roots.FILES.signIns)}/ and serves both.`);
    const viaMcp = p.oauth.filter((x) => !x.signin);
    if (viaMcp.length) lines.push('', `OAuth: run /mcp once in a session to log in to ${viaMcp.map((o) => o.name).join(', ')}.`);
    if (p.dangerous.length) lines.push('', ...p.dangerous.map((d) => `Code-running tool on '${d.name}': ${d.tools.map((t) => `${t.tool} (${t.why})`).join('; ')}. This plugin adds no guard.`));
    if (p.notes.length) lines.push('', ...p.notes.map((n) => `Note: ${n}`));
    if (p.unchanged.length) lines.push('', ...p.unchanged.map((n) => `Unchanged: ${n}`));
    return globalWords(lines.join('\n'));
}

// The prose says Global for user scope (spec D1): 'global (user scope)' the first time, 'global scope' after. The commands
// keep the value (`-s user`, `--scope user`).
export function globalWords(text)
{
    let first = true;
    return text.replace(/\buser scope\b/g, () => { if (!first) return 'global scope'; first = false; return 'global (user scope)'; });
}

