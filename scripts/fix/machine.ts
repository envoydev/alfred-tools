// @ts-nocheck - typed in Task 12
// The machine fixes: a problem on this machine, not in a registration. The fix changes the machine (a plugin uninstalled,
// a data folder's .gitignore, a broken npx cache folder removed), so it runs only when the user picked it, and is read
// back by running the detector again. A fix that changes nothing a running session uses returns `restart: false`; one
// that leaves a package to download again returns its `fetch` step, which fix.js hands to fetch.js.
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

// ---- retired-plugin (spec D8, D9, 0.5.0) -------------------------------------------------------------------------------
// typescript-lsp, csharp-lsp and claude-hud work in Claude Code alone, so the catalog no longer lists them. Each id the row
// names, installed at a scope, is offered once for `claude plugin uninstall`: one finding per id and scope. A decline is
// kept in <plugin data>/retired-declined.json (declines.js); a declined one is shown as advice, never applied. Where
// alfred-code is set up it installs the same plugins, so fix.js keeps those out of 'Apply all found' (`alfred`).

export function retiredPluginDetect(ctx)
{
    const ids = C.fixOf(ctx, 'retired-plugin').ids || [];
    const declined = declines.read(ctx.data);
    const alfred = Boolean(ctx.inv.alfredCodeEnabled);
    return (ctx.inv.plugins || []).filter((p) => ids.includes(p.id)).map((p) =>
    {
        const base = {
            id: 'retired-plugin', name: p.id, scope: p.scope, alfred,
            found: `${p.id} is installed at ${p.scope} scope; preferred-tools no longer lists it - it works in Claude Code alone${alfred ? `; ${p.id} - alfred-code also installs it, and this removes it for both` : ''}`,
            proposal: { command: `claude plugin uninstall ${p.id} --scope ${p.scope}` },
        };
        if (!declined.some((d) => declines.same(d, p))) return base;
        return { ...base, declined: true, blocked: `${p.id} is kept at ${p.scope}; remove it with claude plugin uninstall ${p.id} --scope ${p.scope}` };
    });
}

// `claude plugin uninstall <id> --scope <scope>`, read back from the plugin list. claude-hud's statusLine goes with the
// last claude-hud: the account line is shared by every scope, so it stays while another scope still has the plugin.
export function retiredPluginFix(f, ctx)
{
    const command = `claude plugin uninstall ${f.name} --scope ${f.scope}`;
    const r = cli.run(['plugin', 'uninstall', f.name, '--scope', f.scope], { cwd: ctx.inv.project, env: ctx.env });
    if (r.error || r.status !== 0) return { ok: false, detail: `${command} failed - ${String(`${r.stderr || ''}${r.stdout || ''}` || (r.error && r.error.message) || 'no output').trim().split('\n').slice(-1)[0]}` };
    const left = inventory.buildInventory({ project: ctx.inv.project, env: ctx.env, data: ctx.data }).plugins;
    if (left.some((p) => p.id === f.name && p.scope === f.scope)) return { ok: false, detail: `${f.name} is still listed at ${f.scope} after ${command}` };
    let detail = `uninstalled ${f.name} (${f.scope})`;
    if (f.name.startsWith('claude-hud@'))
    {
        if (left.some((p) => p.id === f.name)) detail += `; claude-hud's statusLine is kept - claude-hud is still installed at ${left.filter((p) => p.id === f.name).map((p) => p.scope).join(', ')}`;
        else detail += `; ${hud.removeHudStatusLine(hud.resolveConfigDir({ env: ctx.env }), { platform: ctx.platform, env: ctx.env }).detail}`;
    }
    return { ok: true, detail };
}

// ---- data-folder-ignore ---------------------------------------------------------------------------------------------
// A project-scope registration writes its data folder relative, so it lands in whichever folder Claude starts in: a
// child or a subfolder gets its own copy, which nothing there keeps out of git. This row reads every registration that
// starts here - this folder's own project-scope ones and those inherited from a parent's .mcp.json (the other rows
// leave those to fix run in the parent) - and finds each relative data folder whose contents git does not ignore. In a
// git work tree git decides (`git check-ignore` on a file inside the folder, as keys.js tests a key file); where git
// cannot answer, the folder's own .gitignore, or alfred-code's .alfred/.gitignore under .alfred/, counts as covering.
const PROBE = 'preferred-tools-probe';
function ignoredByGit(ctx, rel)
{
    const r = ctx.machine.run('git', ['check-ignore', '-q', `${rel}/${PROBE}`], { cwd: ctx.inv.project });
    return r && (r.status === 0 || r.status === 1) ? r.status === 0 : null;
}

export function dataFolderIgnoreDetect(ctx)
{
    const P = ctx.platform === 'win32' ? path.win32 : path.posix;
    const tools = C.fixOf(ctx, 'data-folder-ignore').tool;
    const seen = new Set();
    const out = [];
    for (const r of ctx.inv.registrations)
    {
        if (r.own || r.alfredRetired || r.choice === 'own' || !tools.includes(r.rowId)) continue;
        // starts here: a project-scope one not rejected, or a parent's not rejected and not shadowed by a nearer one
        if (r.scope === 'inherited' ? r.approval === 'rejected' || r.shadowed : r.scope !== 'project' || r.approval === 'rejected') continue;
        const row = C.rowOf(ctx, r.rowId);
        const root = row.locations ? rootOfEntry(row, r.entry) : null;
        if (!root || root.includes('${') || root.startsWith('~')) continue;
        if (path.posix.isAbsolute(root) || path.win32.isAbsolute(root))
        {
            const copy = leftoverCopy(ctx, r, root, P);
            if (copy && !seen.has(copy.folder)) { seen.add(copy.folder); out.push(copy.finding); }
            continue;
        }
        const rel = root.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
        const folder = P.resolve(ctx.inv.project, ...rel.split('/'));
        if (seen.has(folder)) continue;
        seen.add(folder);
        const own = P.join(folder, '.gitignore');
        const git = ignoredByGit(ctx, rel);
        if (git === true) continue;
        if (git === null && ctx.machine.exists(own)) continue;
        if (git === null && /^\.alfred\//.test(rel) && ctx.machine.exists(P.join(ctx.inv.project, '.alfred', '.gitignore'))) continue;
        // a .gitignore of the user's that leaves the data out is theirs to change: the fix never writes over it
        if (git === false && ctx.machine.exists(own))
        {
            out.push({
                id: 'data-folder-ignore', row: r.rowId, name: r.name, scope: r.scope,
                found: `${rel} - its data folder when Claude starts here - is not git-ignored`,
                blocked: `${rel}/.gitignore is there but does not ignore the folder's data - add * to it, or ignore ${rel}/ in the project's .gitignore`,
            });
            continue;
        }
        out.push({
            id: 'data-folder-ignore', row: r.rowId, name: r.name, scope: r.scope,
            found: `${rel} - its data folder when Claude starts here - is not git-ignored: ${folder} gets no .gitignore of its own${/^\.alfred\//.test(rel) ? ' and no .alfred/.gitignore covers it' : ''}`,
            proposal: { path: folder },
        });
    }
    return out;
}

// A data root written absolute under the folder that declares it (0.3.0, spec F7): a session started in a child folder
// under 0.2.0, when the path was relative, made its own copy there. Found when this folder is not the declaring one, the
// copy is on disk and git does not ignore it; the fix gives it the same .gitignore. Its data is never moved or deleted.
function leftoverCopy(ctx, r, root, P)
{
    const declared = r.scope === 'inherited' ? r.from : ctx.inv.project;
    if (!declared || P.resolve(declared) === P.resolve(ctx.inv.project)) return null;
    const rel = P.relative(declared, root);
    if (!rel || rel.startsWith('..') || P.isAbsolute(rel)) return null;
    const folder = P.join(ctx.inv.project, rel);
    if (!ctx.machine.exists(folder)) return null;
    const slashed = rel.split(P.sep).join('/');
    const git = ignoredByGit(ctx, slashed);
    if (git === true) return null;
    if (git === null && (ctx.machine.exists(P.join(folder, '.gitignore')) || (/^\.alfred\//.test(slashed) && ctx.machine.exists(P.join(ctx.inv.project, '.alfred', '.gitignore'))))) return null;
    return {
        folder,
        finding: {
            id: 'data-folder-ignore', row: r.rowId, name: r.name, scope: r.scope,
            found: `${slashed} - a 0.2.0 copy no server uses any more - its data is left, never moved or deleted; it is not git-ignored`,
            proposal: { path: folder },
        },
    };
}

// Create the folder with a .gitignore holding `*`, as the plan's ensure-dir step does; a .gitignore already there is left.
export function dataFolderIgnoreFix(f, ctx)
{
    const file = path.join(f.proposal.path, '.gitignore');
    try
    {
        if (fs.existsSync(file)) return { ok: true, restart: false, detail: `${file} exists - left as it is` };
        fs.mkdirSync(f.proposal.path, { recursive: true });
        fs.writeFileSync(file, '*\n');
        return { ok: true, restart: false, detail: `wrote ${file} holding *` };
    }
    catch (e) { return { ok: false, detail: `could not write ${file}: ${e.message}` }; }
}

// ---- npx-cache-entry ------------------------------------------------------------------------------------------------
// npx installs a package into <npm cache>/_npx/<hash>, named by libnpmexec as sha512 of the package specs (sorted, one per
// line), hex, the first 16 characters (read in npm 11.6.1's lib/index.js). Two first installs of one package at once - a
// session started while fetch.js runs - can leave that folder without its package.json, and from then on every start
// fails with ENOENT: npx never repairs it (measured, docs/sources.md). The fix removes that one folder and hands the
// package to fetch.js, which fills it again the way the registration resolves it.
const NPX_FOLDER = /^[0-9a-f]{16}$/;

// The cache in force, from `npm config ls -l`: npm 10 and 11 refuse `npm config get cache` ('The cache option is
// protected'), and the long list prints each source's value as a JSON string, all but the one in force commented out
// (measured, docs/sources.md). npm prints a UUID-shaped part of a path as ***, so a redacted value is no folder.
// -> the folder, or null when npm cannot say
function cacheInForce(r)
{
    if (!r || r.status !== 0) return null;
    const line = String(r.stdout || '').split('\n').map((l) => l.trim()).find((l) => l.startsWith('cache = '));
    let value = null;
    try { value = line ? JSON.parse(line.slice('cache = '.length)) : null; } catch { /* not a JSON string: npm cannot say */ }
    return typeof value === 'string' && value && !value.includes('***') ? value : null;
}

// npm_config_cache in an environment, as npm reads it: the name in any case, an empty value skipped
const cacheVar = (env) => Object.entries(env || {}).find(([k, v]) => k.toLowerCase() === 'npm_config_cache' && v !== '');

// The npm cache a registration's npx uses: its own npm_config_cache, else the environment's (npm's first source, ahead
// of any .npmrc), else npm's, asked once per run.
function npmCacheOf(ctx, reg, memo)
{
    const own = cacheVar(reg.entry.env);
    if (own) return C.expandVars(own[1], ctx.env);
    const inEnv = cacheVar(ctx.env);
    if (inEnv) return inEnv[1];
    if (!memo.has('cache')) memo.set('cache', cacheInForce(ctx.machine.run('npm', ['config', 'ls', '-l'], { cwd: ctx.inv.project })));
    return memo.get('cache');
}

// Every server that starts in this folder, a parent folder's included: the npx cache is the machine's, so fix run in a
// child folder repairs the parent's server too. One rejected here, or a parent's that a nearer server of its name
// shadows, does not start here.
const startsHere = (ctx, r) => !r.own && !r.alfredRetired && r.choice !== 'own' && r.approval !== 'rejected' && !(r.scope === 'inherited' && r.shadowed)
    && C.fixOf(ctx, 'npx-cache-entry').tool.includes(r.rowId);

export function npxCacheEntryDetect(ctx)
{
    const P = ctx.platform === 'win32' ? path.win32 : path.posix;
    const memo = new Map();
    const seen = new Set();
    const out = [];
    for (const reg of ctx.inv.registrations)
    {
        // npx, or a bridge (0.4.0), which runs its pinned mcp-remote through npx
        if (!startsHere(ctx, reg) || (C.launcher(reg.entry) !== 'npx' && !bridgeParts(reg.entry))) continue;
        const step = fetchStep(reg.name, reg.entry, reg.rowId);
        if (!step) continue;
        const cache = npmCacheOf(ctx, reg, memo);
        if (!cache) continue;
        const folder = P.join(cache, '_npx', crypto.createHash('sha512').update(step.what).digest('hex').slice(0, 16));
        if (seen.has(folder) || !ctx.machine.exists(folder) || ctx.machine.exists(P.join(folder, 'package.json'))) continue;
        seen.add(folder);
        // the finding carries no env: a key can sit in it, and --detect --json prints findings
        out.push(C.finding('npx-cache-entry', reg, `npx's cache folder for ${step.what}, ${folder}, has no package.json - every start fails with ENOENT until it is removed`, { proposal: { path: folder, what: step.what } }));
    }
    return out;
}

// Remove that folder, never another: it must be a 16-hex folder directly under an _npx folder. -> { ok, detail, fetch }
export function npxCacheEntryFix(f, ctx)
{
    const P = ctx.platform === 'win32' ? path.win32 : path.posix;
    const folder = f.proposal.path;
    if (!NPX_FOLDER.test(P.basename(folder)) || P.basename(P.dirname(folder)) !== '_npx') return { ok: false, detail: `${folder} is not an npx cache folder - left as it is` };
    try { fs.rmSync(folder, { recursive: true, force: true }); }
    catch (e) { return { ok: false, detail: `could not remove ${folder}: ${e.message}` }; }
    const reg = ctx.inv.registrations.find((r) => r.name === f.name && r.scope === f.scope && !r.shadowed);
    const step = reg ? fetchStep(reg.name, reg.entry, reg.rowId) : null;
    // a parent's server is read from the parent's .mcp.json and started here, as this folder's session starts it
    const where = reg && reg.scope === 'inherited' ? { scope: 'project', from: reg.from } : { scope: reg && reg.scope };
    return { ok: true, detail: `removed ${folder} - npx installs ${f.proposal.what} into it again`, fetch: step ? { ...step, ...where } : null };
}

