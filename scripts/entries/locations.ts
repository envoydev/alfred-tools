// @ts-nocheck - typed in Task 10
// Location roots: a logical root, where it is written, and the entry's location arguments and env.
import fs from 'node:fs';
import path from 'node:path';
import { slashes, pathFor } from './platform.ts';

// ---- location roots -------------------------------------------------------------------------------------------------
// A root is logical until it is written: { kind: 'project', rel } (under the project), { kind: 'home', rel } (under the
// account home) or { kind: 'abs', path }.

export function parseRoot(text, ctx)
{
    const t = String(text).trim();
    if (t === '~' || /^~[\\/]/.test(t)) return { kind: 'home', rel: slashes(t.slice(2)) };
    if (/^\$\{(HOME|USERPROFILE)\}[\\/]/.test(t)) return { kind: 'home', rel: slashes(t.replace(/^\$\{[A-Z]+\}[\\/]/, '')) };
    if (path.win32.isAbsolute(t) || path.posix.isAbsolute(t)) return { kind: 'abs', path: t };
    return { kind: 'project', rel: slashes(t.replace(/^\.[\\/]/, '')) };
}

// A written root read back as a logical one: an absolute path under the project or the account home becomes that side
// again, so a move to project scope can write it relative.
export function logicalRoot(text, ctx)
{
    const root = parseRoot(text, ctx);
    if (root.kind !== 'abs') return root;
    const P = pathFor(ctx.platform);
    const rel = P.relative(ctx.project, root.path);
    if (rel && !rel.startsWith('..') && !P.isAbsolute(rel)) return { kind: 'project', rel: slashes(rel) };
    const homeRel = P.relative(ctx.home, root.path);
    if (homeRel && !homeRel.startsWith('..') && !P.isAbsolute(homeRel)) return { kind: 'home', rel: slashes(homeRel) };
    return root;
}

export const homeVar = (platform) => (platform === 'win32' ? '${USERPROFILE}' : '${HOME}');

// ${NAME} and ${NAME:-fallback} in an MCP entry, as Claude Code expands them (2.1.322, read from its own expander): a
// variable that is set gives its value, an empty one included; the fallback is used only when it is unset; an unset
// ${NAME} with no fallback stays as written and is named. -> { value, unset: [NAME] }
export function expandVars(text, env)
{
    const unset = [];
    const value = String(text).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (m, name, fallback) =>
    {
        if (typeof env[name] === 'string') return env[name];
        if (fallback !== undefined) return fallback;
        unset.push(name);
        return m;
    });
    return { value, unset };
}

// The string written into the registration: an absolute path at every scope, project scope included (the user's ruling,
// 2026-11-11: the .mcp.json names this machine's paths), with `~` expanded here, never left for the server. `scope` is
// kept for the callers that pass it.
export function formatRoot(root, scope, ctx)
{
    const P = pathFor(ctx.platform);
    if (root.kind === 'abs') return { value: P.normalize(root.path) };
    if (root.kind === 'home') return { value: P.join(ctx.home, ...root.rel.split('/')) };
    return { value: P.resolve(ctx.project, ...root.rel.split('/')) };
}

// root + sub, in the written form: joined with the OS's separator at every scope
export function withSub(rootStr, sub, scope, ctx)
{
    if (!sub) return rootStr;
    return pathFor(ctx.platform).join(rootStr, sub);
}

// serena on Windows: SERENA_HOME absolute, in backslashes and space-free (fix row serena-windows-home).
export function serenaWindowsHome(ctx)
{
    const profile = ctx.home || '';
    if (profile && !/\s/.test(profile)) return { root: { kind: 'abs', path: path.win32.join(profile, '.serena') } };
    return { needsInput: `the profile path ${profile || '(unknown)'} has a space, and serena's home must be space-free on Windows: type an absolute folder without spaces (for example C:\\serena-home)` };
}

// A profile path with a space leaves serena no home under it: the space-free folder offered and taken by default in its
// place, on the system drive.
export function serenaSpaceFree(ctx)
{
    const drive = (ctx.env && ctx.env.SystemDrive) || '';
    return { kind: 'abs', path: `${/^[A-Za-z]:$/.test(drive) ? drive : 'C:'}\\serena-home` };
}

export function validWindowsSerenaHome(rootStr)
{
    return path.win32.isAbsolute(rootStr) && !/\s/.test(rootStr) && !rootStr.includes('/') && /^[A-Za-z]:\\/.test(rootStr);
}

// The default root for a row (before the user's answer), as a logical root: the project folder (memory: the account
// folder), never alfred-code's - the plugin stands alone. alfred-code data already on disk comes back as `alfred`, an
// answer of its own. serena on Windows overrides both.
export function defaultRoot(row, name, ctx)
{
    const loc = row.locations;
    if (loc.windowsAbsolute && ctx.platform === 'win32') return serenaWindowsHome(ctx);
    const out = { root: otherPlace(row, name, loc.defaultSide, ctx) };
    const old = alfredRoot(row, ctx);
    if (old) out.alfred = old;
    return out;
}

// The row's alfred-code data folder when it is on disk (its old root from original-mcps.json), else null.
export function alfredRoot(row, ctx)
{
    if (!row.locations || !row.locations.alfred) return null;
    const exists = ctx.exists || ((p) => fs.existsSync(p));
    const old = parseRoot(row.locations.alfred, ctx);
    const abs = old.kind === 'home' ? pathFor(ctx.platform).join(ctx.home, ...old.rel.split('/')) : pathFor(ctx.platform).resolve(ctx.project, ...old.rel.split('/'));
    return exists(abs) ? old : null;
}

// ---- alfred-code's folder -------------------------------------------------------------------------------------------
// alfred-code's own entries under .alfred, never a data folder (3.9.2 stack/hooks/layout.js: the docs root, state and
// statistics, the workspace link file, and flow, a 2.x folder its migration still reads).
export const ALFRED_ENTRIES = ['docs', 'state', 'statistics', 'workspace', 'flow'];

// alfred-code is set up in this project: enabled for it AND <project>/.alfred/.gitignore is there, the file that keeps
// its data out of git.
// A value that names this machine: an absolute path (POSIX, a drive, UNC) or ~, with no ${VAR} in it. Every scope
// takes one since 0.3.0 (project scope names this machine's paths); fix rows still read it to tell such a value apart.
export function machinePath(value)
{
    if (typeof value !== 'string' || value.includes('${')) return false;
    return /^(\/|~|\\\\)/.test(value) || /^[A-Za-z]:[\\/]/.test(value);
}

export function alfredData(ctx, enabled)
{
    if (!enabled) return false;
    const exists = ctx.exists || ((p) => fs.existsSync(p));
    return Boolean(exists(pathFor(ctx.platform).join(ctx.project, '.alfred', '.gitignore')));
}

// Why .alfred/<name> cannot hold this tool's data, or null.
export function alfredNameProblem(name, ctx)
{
    // macOS and Windows file systems ignore case: '.alfred/Docs' is alfred-code's docs folder there
    if (ALFRED_ENTRIES.includes(String(name).toLowerCase())) return `'${name}' is one of alfred-code's own entries under .alfred (${ALFRED_ENTRIES.join(', ')}) - pick another name or folder`;
    const at = pathFor(ctx.platform).join(ctx.project, '.alfred', name);
    const exists = ctx.exists || ((p) => fs.existsSync(p));
    if (!exists(at)) return null;
    // a path that cannot be read is not reported as a file
    const isDir = ctx.isDir || ((p) => { try { return fs.statSync(p).isDirectory(); } catch { return true; } });
    return isDir(at) ? null : `.alfred/${name} exists and is not a folder - pick another name or folder`;
}

// The root of a scope family (spec D2): ctx.roots when the plan or the questions resolved them, else the recommended
// ones without alfred-code - <project>/.preferred-tools and <home>/.preferred-tools.
export function rootOf(family, ctx)
{
    const P = pathFor(ctx.platform);
    const set = ctx.roots && ctx.roots[family];
    if (set) return set;
    return family === 'global' ? P.join(ctx.home, '.preferred-tools') : P.join(ctx.project, '.preferred-tools');
}

// The location side recommended for a row at a scope (spec D2, F6): the data folder sits in the root of the scope's
// family - 'project' (the project root) at project and local scope, 'account' (the global root) at global scope. serena
// on Windows needs an absolute, space-free home: a root with a space gives 'default' (the profile's .serena, else a
// space-free folder).
export function recommendedSide(row, scope, ctx)
{
    const side = scope === 'user' ? 'account' : 'project';
    if (row.locations.windowsAbsolute && ctx.platform === 'win32') return validWindowsSerenaHome(rootOf(side === 'account' ? 'global' : 'project', ctx)) ? side : 'default';
    return side;
}

// A tool's folder in a root, as a logical root: 'account' - the global root's, else the project root's (spec D2).
export function otherPlace(row, name, side, ctx = null)
{
    if (ctx && ctx.platform && (ctx.roots || ctx.project)) return logicalRoot(pathFor(ctx.platform).join(rootOf(side === 'account' ? 'global' : 'project', ctx), name), ctx);
    return side === 'account' ? { kind: 'home', rel: `.preferred-tools/${name}` } : { kind: 'project', rel: `.preferred-tools/${name}` };
}

// The other place from 'Locations': the account folder for a project default, the project folder for memory.
export const otherSide = (row, name, ctx = null) => otherPlace(row, name, row.locations.defaultSide === 'account' ? 'project' : 'account', ctx);

// The root an installed entry carries, in written form, from the row's first derived key.
export function rootOfEntry(row, entry)
{
    const d = row.locations.derived[0];
    let value;
    if (d.in === 'env') value = (entry.env || {})[d.key];
    else
    {
        const args = entry.args || [];
        const i = args.indexOf(d.key);
        value = i >= 0 ? args[i + 1] : undefined;
    }
    if (typeof value !== 'string') return null;
    if (!d.sub) return value;
    const cut = value.replace(/[\\/]+$/, '');
    const tail = cut.slice(-d.sub.length);
    return tail === d.sub ? cut.slice(0, -d.sub.length).replace(/[\\/]+$/, '') : value;
}

// Write the location root into an entry (fresh build or an edit of an installed one): every derived key.
export function applyRoot(entry, row, rootStr, scope, ctx)
{
    const out = { ...entry, env: { ...(entry.env || {}) } };
    if (entry.args) out.args = [...entry.args];
    for (const d of row.locations.derived)
    {
        const value = withSub(rootStr, d.sub, scope, ctx);
        if (d.in === 'env') out.env[d.key] = value;
        else
        {
            const i = out.args.indexOf(d.key);
            if (i >= 0) out.args[i + 1] = value; else out.args.push(d.key, value);
        }
    }
    if (!Object.keys(out.env).length) delete out.env;
    return out;
}

