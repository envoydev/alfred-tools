// Location roots: a logical root, where it is written, and the entry's location arguments and env.
import fs from 'node:fs';
import path from 'node:path';
import { slashes, pathFor } from './platform.ts';
import type { Env, ServerEntry } from '../core/types.ts';
import type { CatalogRow } from '../catalog/types.ts';
import type { DefaultRoot, Machine, Root } from './types.ts';

// ---- location roots -------------------------------------------------------------------------------------------------
// A root is logical until it is written: { kind: 'project', rel } (under the project), { kind: 'home', rel } (under the
// account home) or { kind: 'abs', path }.

export function parseRoot(text: string, _context?: unknown): Root
{
    const trimmed = String(text).trim();
    if (trimmed === '~' || /^~[\\/]/.test(trimmed)) return { kind: 'home', rel: slashes(trimmed.slice(2)) };
    if (/^\$\{(HOME|USERPROFILE)\}[\\/]/.test(trimmed)) return { kind: 'home', rel: slashes(trimmed.replace(/^\$\{[A-Z]+\}[\\/]/, '')) };
    if (path.win32.isAbsolute(trimmed) || path.posix.isAbsolute(trimmed)) return { kind: 'abs', path: trimmed };
    return { kind: 'project', rel: slashes(trimmed.replace(/^\.[\\/]/, '')) };
}

// A written root read back as a logical one: an absolute path under the project or the account home becomes that side
// again, so a move to project scope can write it relative.
export function logicalRoot(text: string, context: Machine): Root
{
    const root = parseRoot(text, context);
    if (root.kind !== 'abs') return root;
    const pathApi = pathFor(context.platform);
    const rel = pathApi.relative(context.project, root.path);
    if (rel && !rel.startsWith('..') && !pathApi.isAbsolute(rel)) return { kind: 'project', rel: slashes(rel) };
    const homeRel = pathApi.relative(context.home, root.path);
    if (homeRel && !homeRel.startsWith('..') && !pathApi.isAbsolute(homeRel)) return { kind: 'home', rel: slashes(homeRel) };
    return root;
}

export const homeVar = (platform: string): string => (platform === 'win32' ? '${USERPROFILE}' : '${HOME}');

// ${NAME} and ${NAME:-fallback} in an MCP entry, as Claude Code expands them (2.1.322, read from its own expander): a
// variable that is set gives its value, an empty one included; the fallback is used only when it is unset; an unset
// ${NAME} with no fallback stays as written and is named. -> { value, unset: [NAME] }
export function expandVars(text: unknown, env: Env): { value: string; unset: string[] }
{
    const unset: string[] = [];
    const value = String(text).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (match: string, name: string, fallback: string | undefined) =>
    {
        if (typeof env[name] === 'string') return env[name]!;
        if (fallback !== undefined) return fallback;
        unset.push(name);
        return match;
    });
    return { value, unset };
}

// The string written into the registration: an absolute path at every scope, project scope included (the user's ruling,
// 2026-11-11: the .mcp.json names this machine's paths), with `~` expanded here, never left for the server. `scope` is
// kept for the callers that pass it.
export function formatRoot(root: Root, _scope: string, context: Machine): { value: string }
{
    const pathApi = pathFor(context.platform);
    if (root.kind === 'abs') return { value: pathApi.normalize(root.path) };
    if (root.kind === 'home') return { value: pathApi.join(context.home, ...root.rel.split('/')) };
    return { value: pathApi.resolve(context.project, ...root.rel.split('/')) };
}

// root + sub, in the written form: joined with the OS's separator at every scope
export function withSub(rootStr: string, sub: string, _scope: string, context: Machine): string
{
    if (!sub) return rootStr;
    return pathFor(context.platform).join(rootStr, sub);
}

// serena on Windows: SERENA_HOME absolute, in backslashes and space-free (fix row serena-windows-home).
export function serenaWindowsHome(context: Pick<Machine, 'home'>): DefaultRoot
{
    const profile = context.home || '';
    if (profile && !/\s/.test(profile)) return { root: { kind: 'abs', path: path.win32.join(profile, '.serena') } };
    return { needsInput: `the profile path ${profile || '(unknown)'} has a space, and serena's home must be space-free on Windows: type an absolute folder without spaces (for example C:\\serena-home)` };
}

// A profile path with a space leaves serena no home under it: the space-free folder offered and taken by default in its
// place, on the system drive.
export function serenaSpaceFree(context: Pick<Machine, 'env'>): Root
{
    const drive = (context.env && context.env.SystemDrive) || '';
    return { kind: 'abs', path: `${/^[A-Za-z]:$/.test(drive) ? drive : 'C:'}\\serena-home` };
}

export function validWindowsSerenaHome(rootStr: string): boolean
{
    return path.win32.isAbsolute(rootStr) && !/\s/.test(rootStr) && !rootStr.includes('/') && /^[A-Za-z]:\\/.test(rootStr);
}

// The default root for a row (before the user's answer), as a logical root: the project folder (memory: the account
// folder), never alfred-code's - the plugin stands alone. alfred-code data already on disk comes back as `alfred`, an
// answer of its own. serena on Windows overrides both.
export function defaultRoot(row: CatalogRow, name: string, context: Machine): DefaultRoot
{
    const locations = row.locations!;
    if (locations.windowsAbsolute && context.platform === 'win32') return serenaWindowsHome(context);
    const out: { root: Root; alfred?: Root } = { root: otherPlace(row, name, locations.defaultSide, context) };
    const old = alfredRoot(row, context);
    if (old) out.alfred = old;
    return out;
}

// The row's alfred-code data folder when it is on disk (its old root from original-mcps.json), else null.
export function alfredRoot(row: CatalogRow, context: Machine): Root | null
{
    if (!row.locations || !row.locations.alfred) return null;
    const exists = context.exists || ((filePath: string) => fs.existsSync(filePath));
    const old = parseRoot(row.locations.alfred, context);
    const absolutePath = old.kind === 'home' ? pathFor(context.platform).join(context.home, ...old.rel.split('/')) : pathFor(context.platform).resolve(context.project, ...(old as { rel: string }).rel.split('/'));
    return exists(absolutePath) ? old : null;
}

// ---- alfred-code's folder -------------------------------------------------------------------------------------------
// alfred-code's own entries under .alfred, never a data folder (3.9.2 stack/hooks/layout.js: the docs root, state and
// statistics, the workspace link file, and flow, a 2.x folder its migration still reads).
export const ALFRED_ENTRIES = ['docs', 'state', 'statistics', 'workspace', 'flow'];

// alfred-code is set up in this project: enabled for it AND <project>/.alfred/.gitignore is there, the file that keeps
// its data out of git.
// A value that names this machine: an absolute path (POSIX, a drive, UNC) or ~, with no ${VAR} in it. Every scope
// takes one since 0.3.0 (project scope names this machine's paths); fix rows still read it to tell such a value apart.
export function machinePath(value: unknown): boolean
{
    if (typeof value !== 'string' || value.includes('${')) return false;
    return /^(\/|~|\\\\)/.test(value) || /^[A-Za-z]:[\\/]/.test(value);
}

export function alfredData(context: Machine, enabled: unknown): boolean
{
    if (!enabled) return false;
    const exists = context.exists || ((filePath: string) => fs.existsSync(filePath));
    return Boolean(exists(pathFor(context.platform).join(context.project, '.alfred', '.gitignore')));
}

// Why .alfred/<name> cannot hold this tool's data, or null.
export function alfredNameProblem(name: string, context: Machine): string | null
{
    // macOS and Windows file systems ignore case: '.alfred/Docs' is alfred-code's docs folder there
    if (ALFRED_ENTRIES.includes(String(name).toLowerCase())) return `'${name}' is one of alfred-code's own entries under .alfred (${ALFRED_ENTRIES.join(', ')}) - pick another name or folder`;
    const at = pathFor(context.platform).join(context.project, '.alfred', name);
    const exists = context.exists || ((filePath: string) => fs.existsSync(filePath));
    if (!exists(at)) return null;
    // a path that cannot be read is not reported as a file
    const isDir = context.isDir || ((filePath: string) => { try { return fs.statSync(filePath).isDirectory(); } catch { return true; } });
    return isDir(at) ? null : `.alfred/${name} exists and is not a folder - pick another name or folder`;
}

// The root of a scope family (spec D2): context.roots when the plan or the questions resolved them, else the recommended
// ones without alfred-code - <project>/.preferred-tools and <home>/.preferred-tools.
export function rootOf(family: string, context: Machine): string
{
    const pathApi = pathFor(context.platform);
    const set = context.roots && context.roots[family as 'project' | 'global'];
    if (set) return set;
    return family === 'global' ? pathApi.join(context.home, '.preferred-tools') : pathApi.join(context.project, '.preferred-tools');
}

// The location side recommended for a row at a scope (spec D2, F6): the data folder sits in the root of the scope's
// family - 'project' (the project root) at project and local scope, 'account' (the global root) at global scope. serena
// on Windows needs an absolute, space-free home: a root with a space gives 'default' (the profile's .serena, else a
// space-free folder).
export function recommendedSide(row: CatalogRow, scope: string, context: Machine): string
{
    const side = scope === 'user' ? 'account' : 'project';
    if (row.locations!.windowsAbsolute && context.platform === 'win32') return validWindowsSerenaHome(rootOf(side === 'account' ? 'global' : 'project', context)) ? side : 'default';
    return side;
}

// A tool's folder in a root, as a logical root: 'account' - the global root's, else the project root's (spec D2).
export function otherPlace(_row: CatalogRow, name: string, side: string, context: Machine | null = null): Root
{
    if (context && context.platform && (context.roots || context.project)) return logicalRoot(pathFor(context.platform).join(rootOf(side === 'account' ? 'global' : 'project', context), name), context);
    return side === 'account' ? { kind: 'home', rel: `.preferred-tools/${name}` } : { kind: 'project', rel: `.preferred-tools/${name}` };
}

// The other place from 'Locations': the account folder for a project default, the project folder for memory.
export const otherSide = (row: CatalogRow, name: string, context: Machine | null = null): Root => otherPlace(row, name, row.locations!.defaultSide === 'account' ? 'project' : 'account', context);

// The root an installed entry carries, in written form, from the row's first derived key.
export function rootOfEntry(row: CatalogRow, entry: ServerEntry): string | null
{
    const derivedLocation = row.locations!.derived[0]!;
    let value: string | undefined;
    if (derivedLocation.in === 'env') value = (entry.env || {})[derivedLocation.key];
    else
    {
        const args = entry.args || [];
        const i = args.indexOf(derivedLocation.key);
        value = i >= 0 ? args[i + 1] : undefined;
    }
    if (typeof value !== 'string') return null;
    if (!derivedLocation.sub) return value;
    const cut = value.replace(/[\\/]+$/, '');
    const tail = cut.slice(-derivedLocation.sub.length);
    return tail === derivedLocation.sub ? cut.slice(0, -derivedLocation.sub.length).replace(/[\\/]+$/, '') : value;
}

// Write the location root into an entry (fresh build or an edit of an installed one): every derived key.
export function applyRoot(entry: ServerEntry, row: CatalogRow, rootStr: string, scope: string, context: Machine): ServerEntry
{
    const out: ServerEntry = { ...entry, env: { ...(entry.env || {}) } };
    if (entry.args) out.args = [...entry.args];
    for (const derivedLocation of row.locations!.derived)
    {
        const value = withSub(rootStr, derivedLocation.sub, scope, context);
        if (derivedLocation.in === 'env') out.env![derivedLocation.key] = value;
        else
        {
            const i = out.args!.indexOf(derivedLocation.key);
            if (i >= 0) out.args![i + 1] = value; else out.args!.push(derivedLocation.key, value);
        }
    }
    if (!Object.keys(out.env!).length) delete out.env;
    return out;
}

