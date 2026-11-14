// The machine fixes: a problem on this machine, not in a registration. The fix changes the machine (a plugin uninstalled,
// a data folder's .gitignore, a broken npx cache folder removed), so it runs only when the user picked it, and is read
// back by running the detector again. A fix that changes nothing a running session uses returns `restart: false`; one
// that leaves a package to download again returns its `fetch` step, which fix.ts hands to fetch.ts.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as C from './common.ts';
import { rootOfEntry } from '../entries/locations.ts';
import { bridgeParts } from '../entries/entry.ts';
import { fetchStep } from '../entries/names.ts';
import * as declines from '../core/declines.ts';
import * as cli from '../core/claude-cli.ts';
import * as inventory from '../inventory/inventory.ts';
import * as hud from '../hud/hud-statusline.ts';
import type { InvRegistration } from '../inventory/types.ts';
import type { Finding, FixCtx, MachineFixResult, RunResult } from './types.ts';

// ---- retired-plugin (spec D8, D9, 0.5.0) -------------------------------------------------------------------------------
// typescript-lsp, csharp-lsp and claude-hud work in Claude Code alone, so the catalog no longer lists them. Each id the row
// names, installed at a scope, is offered once for `claude plugin uninstall`: one finding per id and scope. A decline is
// kept in <plugin data>/retired-declined.json (declines.ts); a declined one is shown as advice, never applied. Where
// alfred-code is set up it installs the same plugins, so fix.ts keeps those out of 'Apply all found' (`alfred`).

export function retiredPluginDetect(context: FixCtx): Finding[]
{
    const ids = C.fixOf(context, 'retired-plugin')!.ids || [];
    const declined = declines.read(context.data);
    const alfred = Boolean(context.inventory.alfredCodeEnabled);
    return (context.inventory.plugins || []).filter((plugin) => ids.includes(plugin.id)).map((plugin) =>
    {
        const base = {
            id: 'retired-plugin', name: plugin.id, scope: plugin.scope, alfred,
            found: `${plugin.id} is installed at ${plugin.scope} scope; preferred-tools no longer lists it - it works in Claude Code alone${alfred ? `; ${plugin.id} - alfred-code also installs it, and this removes it for both` : ''}`,
            proposal: { command: `claude plugin uninstall ${plugin.id} --scope ${plugin.scope}` },
        };
        if (!declined.some((declinedPlugin) => declines.same(declinedPlugin, plugin))) return base;
        return { ...base, declined: true, blocked: `${plugin.id} is kept at ${plugin.scope}; remove it with claude plugin uninstall ${plugin.id} --scope ${plugin.scope}` };
    });
}

// `claude plugin uninstall <id> --scope <scope>`, read back from the plugin list. claude-hud's statusLine goes with the
// last claude-hud: the account line is shared by every scope, so it stays while another scope still has the plugin.
export function retiredPluginFix(finding: Finding, context: FixCtx): MachineFixResult
{
    const command = `claude plugin uninstall ${finding.name} --scope ${finding.scope}`;
    const result = cli.runClaude(['plugin', 'uninstall', finding.name, '--scope', finding.scope!], { cwd: context.inventory.project, env: context.env });
    if (result.error || result.status !== 0) return { ok: false, detail: `${command} failed - ${String(`${result.stderr || ''}${result.stdout || ''}` || (result.error && result.error.message) || 'no output').trim().split('\n').slice(-1)[0]}` };
    const left = inventory.buildInventory({ project: context.inventory.project, env: context.env, data: context.data }).plugins;
    if (left.some((plugin) => plugin.id === finding.name && plugin.scope === finding.scope)) return { ok: false, detail: `${finding.name} is still listed at ${finding.scope} after ${command}` };
    let detail = `uninstalled ${finding.name} (${finding.scope})`;
    if (finding.name.startsWith('claude-hud@'))
    {
        if (left.some((plugin) => plugin.id === finding.name)) detail += `; claude-hud's statusLine is kept - claude-hud is still installed at ${left.filter((plugin) => plugin.id === finding.name).map((plugin) => plugin.scope).join(', ')}`;
        else detail += `; ${hud.removeHudStatusLine(hud.resolveConfigDir({ env: context.env }), { platform: context.platform, env: context.env }).detail}`;
    }
    return { ok: true, detail };
}

// ---- data-folder-ignore ---------------------------------------------------------------------------------------------
// A project-scope registration writes its data folder relative, so it lands in whichever folder Claude starts in: a
// child or a subfolder gets its own copy, which nothing there keeps out of git. This row reads every registration that
// starts here - this folder's own project-scope ones and those inherited from a parent's .mcp.json (the other rows
// leave those to fix run in the parent) - and finds each relative data folder whose contents git does not ignore. In a
// git work tree git decides (`git check-ignore` on a file inside the folder, as keys.ts tests a key file); where git
// cannot answer, the folder's own .gitignore, or alfred-code's .alfred/.gitignore under .alfred/, counts as covering.
const PROBE = 'preferred-tools-probe';
function ignoredByGit(context: FixCtx, rel: string): boolean | null
{
    const result = context.machine.run('git', ['check-ignore', '-q', `${rel}/${PROBE}`], { cwd: context.inventory.project });
    return result && (result.status === 0 || result.status === 1) ? result.status === 0 : null;
}

export function dataFolderIgnoreDetect(context: FixCtx): Finding[]
{
    const pathApi = context.platform === 'win32' ? path.win32 : path.posix;
    const tools = C.fixOf(context, 'data-folder-ignore')!.tool;
    const seen = new Set<string>();
    const out: Finding[] = [];
    for (const registration of context.inventory.registrations)
    {
        if (registration.own || registration.alfredRetired || registration.choice === 'own' || !tools.includes(registration.rowId!)) continue;
        // starts here: a project-scope one not rejected, or a parent's not rejected and not shadowed by a nearer one
        if (registration.scope === 'inherited' ? registration.approval === 'rejected' || registration.shadowed : registration.scope !== 'project' || registration.approval === 'rejected') continue;
        const row = C.rowOf(context, registration.rowId!)!;
        const root = row.locations ? rootOfEntry(row, registration.entry) : null;
        if (!root || root.includes('${') || root.startsWith('~')) continue;
        if (path.posix.isAbsolute(root) || path.win32.isAbsolute(root))
        {
            const copy = leftoverCopy(context, registration, root, pathApi);
            if (copy && !seen.has(copy.folder)) { seen.add(copy.folder); out.push(copy.finding); }
            continue;
        }
        const rel = root.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
        const folder = pathApi.resolve(context.inventory.project, ...rel.split('/'));
        if (seen.has(folder)) continue;
        seen.add(folder);
        const own = pathApi.join(folder, '.gitignore');
        const gitIgnores = ignoredByGit(context, rel);
        if (gitIgnores === true) continue;
        if (gitIgnores === null && context.machine.exists(own)) continue;
        if (gitIgnores === null && /^\.alfred\//.test(rel) && context.machine.exists(pathApi.join(context.inventory.project, '.alfred', '.gitignore'))) continue;
        // a .gitignore of the user's that leaves the data out is theirs to change: the fix never writes over it
        if (gitIgnores === false && context.machine.exists(own))
        {
            out.push({
                id: 'data-folder-ignore', row: registration.rowId, name: registration.name, scope: registration.scope,
                found: `${rel} - its data folder when Claude starts here - is not git-ignored`,
                blocked: `${rel}/.gitignore is there but does not ignore the folder's data - add * to it, or ignore ${rel}/ in the project's .gitignore`,
            });
            continue;
        }
        out.push({
            id: 'data-folder-ignore', row: registration.rowId, name: registration.name, scope: registration.scope,
            found: `${rel} - its data folder when Claude starts here - is not git-ignored: ${folder} gets no .gitignore of its own${/^\.alfred\//.test(rel) ? ' and no .alfred/.gitignore covers it' : ''}`,
            proposal: { path: folder },
        });
    }
    return out;
}

// A data root written absolute under the folder that declares it (0.3.0, spec F7): a session started in a child folder
// under 0.2.0, when the path was relative, made its own copy there. Found when this folder is not the declaring one, the
// copy is on disk and git does not ignore it; the fix gives it the same .gitignore. Its data is never moved or deleted.
function leftoverCopy(context: FixCtx, registration: InvRegistration, root: string, pathApi: path.PlatformPath): { folder: string; finding: Finding } | null
{
    const declared = registration.scope === 'inherited' ? registration.from : context.inventory.project;
    if (!declared || pathApi.resolve(declared) === pathApi.resolve(context.inventory.project)) return null;
    const rel = pathApi.relative(declared, root);
    if (!rel || rel.startsWith('..') || pathApi.isAbsolute(rel)) return null;
    const folder = pathApi.join(context.inventory.project, rel);
    if (!context.machine.exists(folder)) return null;
    const slashed = rel.split(pathApi.sep).join('/');
    const gitIgnores = ignoredByGit(context, slashed);
    if (gitIgnores === true) return null;
    if (gitIgnores === null && (context.machine.exists(pathApi.join(folder, '.gitignore')) || (/^\.alfred\//.test(slashed) && context.machine.exists(pathApi.join(context.inventory.project, '.alfred', '.gitignore'))))) return null;
    return {
        folder,
        finding: {
            id: 'data-folder-ignore', row: registration.rowId, name: registration.name, scope: registration.scope,
            found: `${slashed} - a 0.2.0 copy no server uses any more - its data is left, never moved or deleted; it is not git-ignored`,
            proposal: { path: folder },
        },
    };
}

// Create the folder with a .gitignore holding `*`, as the plan's ensure-dir step does; a .gitignore already there is left.
export function dataFolderIgnoreFix(finding: Finding, _context: FixCtx): MachineFixResult
{
    const file = path.join(finding.proposal!.path!, '.gitignore');
    try
    {
        if (fs.existsSync(file)) return { ok: true, restart: false, detail: `${file} exists - left as it is` };
        fs.mkdirSync(finding.proposal!.path!, { recursive: true });
        fs.writeFileSync(file, '*\n');
        return { ok: true, restart: false, detail: `wrote ${file} holding *` };
    }
    catch (caught) { const error = caught as NodeJS.ErrnoException; return { ok: false, detail: `could not write ${file}: ${error.message}` }; }
}

// ---- npx-cache-entry ------------------------------------------------------------------------------------------------
// npx installs a package into <npm cache>/_npx/<hash>, named by libnpmexec as sha512 of the package specs (sorted, one per
// line), hex, the first 16 characters (read in npm 11.6.1's lib/index.js). Two first installs of one package at once - a
// session started while fetch.ts runs - can leave that folder without its package.json, and from then on every start
// fails with ENOENT: npx never repairs it (measured, docs/sources.md). The fix removes that one folder and hands the
// package to fetch.ts, which fills it again the way the registration resolves it.
const NPX_FOLDER = /^[0-9a-f]{16}$/;

// The cache in force, from `npm config ls -l`: npm 10 and 11 refuse `npm config get cache` ('The cache option is
// protected'), and the long list prints each source's value as a JSON string, all but the one in force commented out
// (measured, docs/sources.md). npm prints a UUID-shaped part of a path as ***, so a redacted value is no folder.
// -> the folder, or null when npm cannot say
function cacheInForce(result: RunResult | null): string | null
{
    if (!result || result.status !== 0) return null;
    const line = String(result.stdout || '').split('\n').map((rawLine) => rawLine.trim()).find((trimmedLine) => trimmedLine.startsWith('cache = '));
    let value: unknown = null;
    try { value = line ? JSON.parse(line.slice('cache = '.length)) : null; } catch { /* not a JSON string: npm cannot say */ }
    return typeof value === 'string' && value && !value.includes('***') ? value : null;
}

// npm_config_cache in an environment, as npm reads it: the name in any case, an empty value skipped
const cacheVar = (env: object | null | undefined) => Object.entries(env || {}).find(([variableName, value]) => variableName.toLowerCase() === 'npm_config_cache' && value !== '');

// The npm cache a registration's npx uses: its own npm_config_cache, else the environment's (npm's first source, ahead
// of any .npmrc), else npm's, asked once per run.
function npmCacheOf(context: FixCtx, registration: InvRegistration, memo: Map<string, string | null>): string | null
{
    const own = cacheVar(registration.entry.env);
    if (own) return C.expandVars(own[1], context.env);
    const inEnv = cacheVar(context.env);
    if (inEnv) return inEnv[1];
    if (!memo.has('cache')) memo.set('cache', cacheInForce(context.machine.run('npm', ['config', 'ls', '-l'], { cwd: context.inventory.project })));
    return memo.get('cache')!;
}

// Every server that starts in this folder, a parent folder's included: the npx cache is the machine's, so fix run in a
// child folder repairs the parent's server too. One rejected here, or a parent's that a nearer server of its name
// shadows, does not start here.
const startsHere = (context: FixCtx, registration: InvRegistration) => !registration.own && !registration.alfredRetired && registration.choice !== 'own' && registration.approval !== 'rejected' && !(registration.scope === 'inherited' && registration.shadowed)
    && C.fixOf(context, 'npx-cache-entry')!.tool.includes(registration.rowId!);

export function npxCacheEntryDetect(context: FixCtx): Finding[]
{
    const pathApi = context.platform === 'win32' ? path.win32 : path.posix;
    const memo = new Map<string, string | null>();
    const seen = new Set<string>();
    const out: Finding[] = [];
    for (const registration of context.inventory.registrations)
    {
        // npx, or a bridge (0.4.0), which runs its pinned mcp-remote through npx
        if (!startsHere(context, registration) || (C.launcher(registration.entry) !== 'npx' && !bridgeParts(registration.entry))) continue;
        const step = fetchStep(registration.name, registration.entry, registration.rowId);
        if (!step) continue;
        const cache = npmCacheOf(context, registration, memo);
        if (!cache) continue;
        const folder = pathApi.join(cache, '_npx', crypto.createHash('sha512').update(step.what).digest('hex').slice(0, 16));
        if (seen.has(folder) || !context.machine.exists(folder) || context.machine.exists(pathApi.join(folder, 'package.json'))) continue;
        seen.add(folder);
        // the finding carries no env: a key can sit in it, and --detect --json prints findings
        out.push(C.finding('npx-cache-entry', registration, `npx's cache folder for ${step.what}, ${folder}, has no package.json - every start fails with ENOENT until it is removed`, { proposal: { path: folder, what: step.what } }));
    }
    return out;
}

// Remove that folder, never another: it must be a 16-hex folder directly under an _npx folder. -> { ok, detail, fetch }
export function npxCacheEntryFix(finding: Finding, context: FixCtx): MachineFixResult
{
    const pathApi = context.platform === 'win32' ? path.win32 : path.posix;
    const folder = finding.proposal!.path!;
    if (!NPX_FOLDER.test(pathApi.basename(folder)) || pathApi.basename(pathApi.dirname(folder)) !== '_npx') return { ok: false, detail: `${folder} is not an npx cache folder - left as it is` };
    try { fs.rmSync(folder, { recursive: true, force: true }); }
    catch (caught) { const error = caught as NodeJS.ErrnoException; return { ok: false, detail: `could not remove ${folder}: ${error.message}` }; }
    const registration = context.inventory.registrations.find((candidate) => candidate.name === finding.name && candidate.scope === finding.scope && !candidate.shadowed);
    const step = registration ? fetchStep(registration.name, registration.entry, registration.rowId) : null;
    // a parent's server is read from the parent's .mcp.json and started here, as this folder's session starts it
    const where = registration && registration.scope === 'inherited' ? { scope: 'project', from: registration.from } : { scope: registration && registration.scope };
    return { ok: true, detail: `removed ${folder} - npx installs ${finding.proposal!.what} into it again`, fetch: step ? { ...step, ...where } : null };
}

