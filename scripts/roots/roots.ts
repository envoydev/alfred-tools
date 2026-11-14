// ROOT FOLDERS (spec D2) - one root per scope family: the project root serves project and local scope, the global root
// serves global (user) scope. A root holds each tool's data folder `<root>/<name>`, the key file, the header helper, the
// record of the user's answers and, unless it is `.alfred`, a `.gitignore`. The roots map in the plugin's data folder
// finds a named root again when no registration points into it.
//
// Nothing here writes: the apply's file steps do. A ctx stands in for the machine - { project, home, platform, exists,
// catalog } - so the options and the root in use are tested without a disk.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as account from '../core/account.ts';
import { rootOfEntry, alfredData } from '../entries/locations.ts';
import { helperParts, bridgeParts, helperNameOf } from '../entries/entry.ts';
import * as helper from '../copied/mcp-headers.js';
import { load } from '../catalog/catalog.ts';
import { BRIDGE_VERSION } from '../copied/mcp-bridge.js';
import type { Catalog } from '../catalog/types.ts';
import type { Machine, Roots } from '../entries/types.ts';
import type { Family, IgnoreGap, InUse, InventoryView, MapRead, RecordEntry, Resolved, RootAnswer, RootOption, RootReg, RootsCtx, RootsMap, ShippedKind, ShippedState } from './types.ts';

export const FILES = { secrets: '.mcps-secrets', helper: 'mcp-headers.js', record: 'preferred-tools.json', map: 'roots.json', bridge: 'mcp-bridge.js', list: 'mcps.json', signIns: 'mcp-remote-v1', serenaContext: 'serena-context.yml' };
// The read guard (0.5.0, ruling 13): two deny rules in Claude Code's settings that keep a session's Read tool out of
// mcp-remote's sign-in tokens and the key file, wherever a root sits.
export const READ_GUARD = { signIns: 'Read(//**/mcp-remote-v1/**)', secrets: 'Read(//**/.mcps-secrets)' };
export const GITIGNORE = '*\n!.gitignore\n!mcp-headers.js\n!mcp-bridge.js\n!serena-context.yml\n';
// serena's context file (spec D7): its number, on its first line
export const SERENA_CONTEXT_VERSION = 1;
const MAP_VERSION = 1;

const pathFor = (platform: string) => (platform === 'win32' ? path.win32 : path.posix);
export const familyOf = (scope: string): Family => (scope === 'user' ? 'global' : 'project');
const SCOPES_OF: Record<Family, string[]> = { project: ['project', 'local'], global: ['user'] };
const existsOf = (context: Machine) => context.exists || ((filePath: string) => fs.existsSync(filePath));
let loaded: Catalog | null = null;
const catalogOf = (context: RootsCtx): Catalog => context.catalog || (loaded = loaded || load());

// ---- the roots map --------------------------------------------------------------------------------------------------

const emptyMap = (): RootsMap => ({ version: MAP_VERSION, global: null, projects: {} });

// A file read as empty says why (`state`, beside the note): 'newer' - a later version of this plugin wrote it, so it is
// never replaced; 'unreadable' - it cannot be opened; 'bad' - not JSON, not this shape, or an older version, so a write
// keeps it as <file>.bak first.
const newerOrBad = (version: unknown, current: number): 'newer' | 'bad' => (typeof version === 'number' && version > current ? 'newer' : 'bad');
const versionNote = (file: string, version: unknown, current: number): string => (newerOrBad(version, current) === 'newer' ? `${file} is version ${version}, newer than this plugin's ${current}` : `${file} is version ${JSON.stringify(version)}, not ${current}`);

// The map in the plugin's data folder. Missing: empty. Malformed or another version: empty with a note and its state.
// Never throws.
export function readMap(dataDir: string | null | undefined): MapRead
{
    if (!dataDir) return emptyMap();
    const file = path.join(dataDir, FILES.map);
    let text: string;
    try { text = fs.readFileSync(file, 'utf8'); }
    catch (caught) { const err = caught as NodeJS.ErrnoException; return err.code === 'ENOENT' ? emptyMap() : { ...emptyMap(), note: `${file} cannot be read (${err.code}) - read as empty`, state: 'unreadable' }; }
    let doc: { version?: unknown; projects?: unknown; global?: unknown } | null;
    try { doc = JSON.parse(text) as typeof doc; }
    catch { return { ...emptyMap(), note: `${file} is not JSON - read as empty`, state: 'bad' }; }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { ...emptyMap(), note: `${file} is not a roots map - read as empty`, state: 'bad' };
    if (doc.version !== MAP_VERSION) return { ...emptyMap(), note: `${versionNote(file, doc.version, MAP_VERSION)} - read as empty`, state: newerOrBad(doc.version, MAP_VERSION) };
    const projects: Record<string, string> = {};
    if (doc.projects && typeof doc.projects === 'object' && !Array.isArray(doc.projects))
        for (const [projectPath, value] of Object.entries(doc.projects)) if (typeof value === 'string' && value) projects[projectPath] = value;
    return { version: MAP_VERSION, global: typeof doc.global === 'string' && doc.global ? doc.global : null, projects };
}

// The map's key for a project: its trust root (the git root, else the folder), as the account file keys it.
export const mapKey = (project: string): string => account.projectKey(account.localRoot(project));

// A new map with the family's root set; the input is left as it was.
export function withRoot(map: RootsMap | null | undefined, family: string, project: string, root: string): RootsMap
{
    const base = map && map.version === MAP_VERSION ? map : emptyMap();
    if (family === 'global') return { version: MAP_VERSION, global: root, projects: { ...base.projects } };
    return { version: MAP_VERSION, global: base.global, projects: { ...base.projects, [mapKey(project)]: root } };
}

// ---- the root in use ------------------------------------------------------------------------------------------------

// The family's standard folders, in option order before alfred-code's set-up decides: [{ id, root }]
export function standard(family: string, context: Machine): { id: string; root: string }[]
{
    const pathApi = pathFor(context.platform);
    if (family === 'global') return [{ id: 'preferred-tools', root: pathApi.join(context.home, '.preferred-tools') }, { id: 'home-alfred', root: pathApi.join(context.home, '.alfred') }];
    return [{ id: 'alfred', root: pathApi.join(context.project, '.alfred') }, { id: 'preferred-tools', root: pathApi.join(context.project, '.preferred-tools') }];
}

// A written path as an absolute one: `~`, `${HOME}` / `${USERPROFILE}`, absolute, else relative to the project.
export function absOf(text: unknown, context: Machine): string
{
    const pathApi = pathFor(context.platform);
    const trimmed = String(text).trim().replace(/^\.[\\/]/, '');
    const home = /^(?:~|\$\{(?:HOME|USERPROFILE)\})(?=[\\/]|$)/.exec(trimmed);
    if (home) return pathApi.join(context.home, trimmed.slice(home[0].length));
    if (path.win32.isAbsolute(trimmed) && /^([A-Za-z]:|\\\\)/.test(trimmed)) return pathApi.normalize(trimmed);
    if (path.posix.isAbsolute(trimmed)) return pathApi.normalize(trimmed);
    return pathApi.join(context.project, trimmed);
}

// The helper file a `headersHelper` command names, or null.
export function helperPathOf(command: unknown): string | null
{
    const parsed = helperParts(command);
    return parsed ? parsed.path : null;
}

const managed = (registration: RootReg, family: Family) => registration.rowId && !registration.alfredRetired && registration.choice !== 'own' && SCOPES_OF[family].includes(registration.scope);

// The roots the family's managed registrations point into, helpers first, then data folders: [{ path }]. A data folder
// counts only when its parent is a standard folder or holds one of the root's files - a tool's default folder in the home
// (~/.serena) is not a root.
export function registrationRoots(inventory: InventoryView, family: Family, context: RootsCtx): string[]
{
    const pathApi = pathFor(context.platform);
    const exists = existsOf(context);
    const regs = (inventory.registrations || []).filter((registration) => managed(registration, family));
    const out: string[] = [];
    for (const registration of regs)
    {
        const file = helperPathOf(registration.entry && registration.entry.headersHelper);
        if (file) out.push(pathApi.dirname(absOf(file, context)));
    }
    const known = standard(family, context).map((standardRoot) => standardRoot.root);
    const catalog = catalogOf(context);
    for (const registration of regs)
    {
        const row = catalog.byId.get(registration.rowId!);
        if (!row || !row.locations || !registration.entry) continue;
        let rootStr: string | null;
        try { rootStr = rootOfEntry(row, registration.entry); }
        catch { rootStr = null; }
        if (!rootStr || rootStr.includes('${') && !/^\$\{(?:HOME|USERPROFILE)\}/.test(rootStr)) continue;
        const parent = pathApi.dirname(absOf(rootStr, context));
        if (known.includes(parent) || Object.values(FILES).some((fileName) => fileName !== FILES.map && exists(pathApi.join(parent, fileName)))) out.push(parent);
    }
    return [...new Set(out)];
}

// The root already in use for a family (D2's order): the roots map's, else the folder a managed registration's helper or
// data folder sits in, else the standard folder that holds the key file. -> { path, from } | null
export function inUse(inventory: InventoryView, family: Family, context: RootsCtx): InUse | null
{
    const exists = existsOf(context);
    const map = (inventory.roots && inventory.roots.map) || emptyMap();
    const mapped = family === 'global' ? map.global : (Object.keys(map.projects || {}).length ? map.projects[mapKey(context.project)] : null);
    if (mapped && exists(mapped)) return { path: mapped, from: 'map' };
    const [registrationRoot] = registrationRoots(inventory, family, context);
    if (registrationRoot) return { path: registrationRoot, from: 'registration' };
    const pathApi = pathFor(context.platform);
    const held = standard(family, context).find((standardRoot) => exists(pathApi.join(standardRoot.root, FILES.secrets)));
    return held ? { path: held.root, from: 'secrets' } : null;
}

// ---- the options ----------------------------------------------------------------------------------------------------

const NAMED_GLOBAL_TAIL = "a project-scope helper does not read keys here - keep a key a committed server uses in the project's root";

// The root question's options, the recommended first (D2's table): [{ id, label, description, root }]. Labels name the
// place in words; descriptions give the exact folder on this machine. 'A folder you name' has no root: it is asked next.
export function options(inventory: InventoryView, family: Family, context: RootsCtx): RootOption[]
{
    const exists = existsOf(context);
    const [alfred, preferred] = standard('project', context) as [{ id: string; root: string }, { id: string; root: string }];
    const [homePt, homeAlfred] = standard('global', context) as [{ id: string; root: string }, { id: string; root: string }];
    const list: RootOption[] = family === 'global'
        ? [
            { ...homePt, label: '~/.preferred-tools', description: `${homePt.root} - one folder for every project on this machine` },
            ...(exists(homeAlfred.root) ? [{ ...homeAlfred, label: '~/.alfred', description: `${homeAlfred.root} - alfred-code's folder in your home, shared with it` }] : []),
            { id: 'named', root: null, label: 'A folder you name', description: `a folder of yours, asked next - ${NAMED_GLOBAL_TAIL}` },
        ]
        : [
            ...(alfredData(context, inventory.alfredCodeEnabled) ? [{ ...alfred, label: '.alfred in this project', description: `${alfred.root} - kept out of git by alfred-code` }] : []),
            { ...preferred, label: '.preferred-tools in this project', description: `${preferred.root} - its own .gitignore keeps the keys, the record and the data out of git` },
            { id: 'named', root: null, label: 'A folder you name', description: 'a folder of yours inside this project, asked next' },
        ];
    const used = inUse(inventory, family, context);
    if (!used) return list;
    const at = list.findIndex((option) => option.root === used.path);
    if (at >= 0) return [list[at]!, ...list.filter((_, i) => i !== at)];
    const where = family === 'global' ? 'the keys and data for every project' : "this project's keys and data";
    const tail = family === 'global' && !standard('global', context).some((standardRoot) => standardRoot.root === used.path) ? ` - ${NAMED_GLOBAL_TAIL}` : '';
    return [{ id: 'in-use', root: used.path, label: 'The folder in use', description: `${used.path} - where ${where} are now${tail}` }, ...list].slice(0, 4);
}

// A folder the user named for a root. Project: inside the project - relative, no `..`, not `.git` or `.claude`. Global:
// absolute or under `~`, `~` expanded. -> { root } | { error }
export function resolveNamed(family: string, text: unknown, context: Machine): { root: string; error?: undefined } | { error: string; root?: undefined }
{
    const pathApi = pathFor(context.platform);
    const trimmed = String(text == null ? '' : text).trim();
    if (!trimmed) return { error: `the ${family} root needs a folder name` };
    if (family === 'global')
    {
        if (trimmed === '~' || /^~[\\/]/.test(trimmed)) return { root: pathApi.join(context.home, trimmed.slice(1)).replace(/[\\/]+$/, '') || pathApi.sep };
        if (pathApi.isAbsolute(trimmed)) return { root: pathApi.normalize(trimmed).replace(/(.)[\\/]+$/, '$1') };
        return { error: `the global root '${trimmed}' must be an absolute folder or one under ~` };
    }
    if (trimmed.startsWith('~') || path.posix.isAbsolute(trimmed) || path.win32.isAbsolute(trimmed))
        return { error: `the project root '${trimmed}' must lie inside the project - name a folder relative to it, not an absolute path` };
    const parts = trimmed.split(/[\\/]+/).filter((part) => part && part !== '.');
    if (parts.includes('..')) return { error: `the project root '${trimmed}' must lie inside the project - no '..'` };
    if (!parts.length) return { error: `the project root '${trimmed}' must lie inside the project, not be the project itself` };
    if (['.git', '.claude'].includes(parts[0]!.toLowerCase())) return { error: `the project root '${trimmed}' cannot be under ${parts[0]} - .git and .claude are not roots` };
    return { root: pathApi.join(context.project, ...parts) };
}

// A root as a registration writes it: relative to the project with `/` at project scope, absolute otherwise.
export function rootStrFor(root: string, scope: string, context: Machine): string
{
    if (scope !== 'project') return root;
    const pathApi = pathFor(context.platform);
    return pathApi.relative(context.project, root).split(pathApi.sep).join('/') || '.';
}

// The roots a run uses. `answers`: { project: { id, path? }, global: { id, path? } } - an option id from the root
// question, `path` the folder typed for 'named'. No answer: the family's recommended root (D2's first option). ->
// { roots: { project, global, globalNamed }, errors: [reason] }, the roots absolute.
export function resolveRoots(inventory: InventoryView, answers: Partial<Record<Family, RootAnswer | null>> | null | undefined, context: RootsCtx): Resolved
{
    const out: Roots = {};
    const errors: string[] = [];
    for (const family of ['project', 'global'] as const)
    {
        const answer = (answers && answers[family]) || null;
        const rootOptions = options(inventory, family, context);
        if (!answer || !answer.id) { out[family] = rootOptions[0]!.root; continue; }
        if (answer.id === 'named')
        {
            const named = resolveNamed(family, answer.path, context);
            if (named.error) errors.push(`roots: ${named.error}`);
            out[family] = named.root || null;
            continue;
        }
        const option = rootOptions.find((candidate) => candidate.id === answer.id && candidate.root);
        if (!option) { errors.push(`roots: '${answer.id}' is not a ${family} root offered here (${rootOptions.filter((candidate) => candidate.root).map((candidate) => candidate.id).join(', ')}, or named with a path)`); out[family] = null; continue; }
        out[family] = option.root;
    }
    out.globalNamed = Boolean(out.global) && !standard('global', context).some((standardRoot) => standardRoot.root === out.global);
    return { roots: out, errors };
}

// ---- the record -----------------------------------------------------------------------------------------------------

// D6's 'not asked': the root a registration's helper or data folder points into - a standard root, a mapped one, or a
// folder holding one of a root's files - else null. A tool's default folder in the home (~/.serena) is not a root.
export function pointsIntoRoot(registration: RootReg, inventory: InventoryView, context: RootsCtx): string | null
{
    const pathApi = pathFor(context.platform);
    // a bridge (0.4.0): this plugin's when its file has a number line, or - no file yet - when its launch names a key
    const bridge = bridgeParts(registration.entry);
    if (bridge)
    {
        const absolutePath = absOf(bridge.path, context);
        const { state, number } = shippedState('bridge', absolutePath, context.exists || ((filePath: string) => fs.existsSync(filePath)));
        const ours = state === 'absent' ? Boolean(bridge.keyName && /^[A-Za-z_][A-Za-z0-9_]*$/.test(bridge.keyName)) : number !== null;
        return ours ? pathApi.dirname(absolutePath) : null;
    }
    const command = registration.entry && registration.entry.headersHelper;
    const file = helperPathOf(command);
    if (file)
    {
        // this plugin's helper: its number line in the file, or - no file yet - this plugin's `<NAME> <SCHEME>`; a helper
        // of the user's own under the same name is asked about
        const absolutePath = absOf(file, context);
        const { state, number } = helperState(absolutePath, context.exists || ((filePath: string) => fs.existsSync(filePath)));
        const ours = state === 'absent' ? Boolean(helperNameOf(command)) : number !== null;
        return ours ? pathApi.dirname(absolutePath) : null;
    }
    const row = registration.rowId ? catalogOf(context).byId.get(registration.rowId) : null;
    if (!row || !row.locations || !registration.entry) return null;
    let rootStr: string | null;
    try { rootStr = rootOfEntry(row, registration.entry); }
    catch { rootStr = null; }
    if (!rootStr || rootStr.includes('${') && !/^\$\{(?:HOME|USERPROFILE)\}/.test(rootStr)) return null;
    const parent = pathApi.dirname(absOf(rootStr, context));
    const map = (inventory.roots && inventory.roots.map) || emptyMap();
    const known = [...standard('project', context), ...standard('global', context)].map((standardRoot) => standardRoot.root).concat([map.global, ...Object.values(map.projects || {})].filter(Boolean) as string[]);
    const exists = existsOf(context);
    return known.includes(parent) || [FILES.secrets, FILES.helper, FILES.record, FILES.list].some((fileName) => exists(pathApi.join(parent, fileName))) ? parent : null;
}

// The record's key for one entry (R6): `mcp:<name>~<scope>`, `plugin-mcp:<plugin>/<server>`, `connector:<Name>`; null
// for an entry of none of those shapes.
export function recordKey(entry: RecordEntry | null | undefined): string | null
{
    if (!entry || typeof entry !== 'object') return null;
    if (typeof entry.name === 'string' && typeof entry.scope === 'string') return `mcp:${entry.name}~${entry.scope}`;
    if (typeof entry.plugin === 'string' && typeof entry.server === 'string') return `plugin-mcp:${entry.plugin}/${entry.server}`;
    if (typeof entry.connector === 'string') return `connector:${entry.connector}`;
    return null;
}

// The scope family whose root holds an entry's record (spec F4): a user registration and a connector the global root's, a
// project or local registration and a plugin's server the project root's.
export const recordFamily = (entry: RecordEntry): Family => (typeof entry.connector === 'string' || entry.scope === 'user' ? 'global' : 'project');
// The entries a record keeps (spec F4): the servers left on their own.
export const ownOnly = <Entry extends RecordEntry>(servers: Entry[] | null | undefined): Entry[] => (servers || []).filter((entry) => entry && typeof entry === 'object' && entry.choice === 'own');

// ---- git and the helper on disk -------------------------------------------------------------------------------------

const isDir = (filePath: string): boolean => { try { return fs.statSync(filePath).isDirectory(); } catch { return false; } };

// Would git ignore this path? Run from its nearest folder on disk, so a file not written yet is asked about too. -> true,
// false, or null outside a git work tree or with git absent.
export function gitIgnores(file: string): boolean | null
{
    let dir = path.dirname(file);
    while (!isDir(dir))
    {
        const up = path.dirname(dir);
        if (up === dir) return null;
        dir = up;
    }
    const result = spawnSync('git', ['-C', dir, 'check-ignore', '-q', '--', path.relative(dir, file)], { windowsHide: true });
    if (result.error) return null;
    return result.status === 0 ? true : result.status === 1 ? false : null;
}

// R13's check for a root that exists: git would commit its key file (`secrets`), or - a project root other than .alfred -
// would ignore the helper a project-scope server needs committed (`helper`; `excluded` when a .gitignore above excludes
// the root folder itself, which no line inside it can undo). -> null | { reason, secrets?, helper?, excluded? }; null
// outside a work tree or with no git.
export function ignoreGap(root: string, family: string, { writes = [] }: { writes?: string[] } = {}): IgnoreGap | null
{
    const secrets = path.join(root, FILES.secrets);
    const ignored = gitIgnores(secrets);
    if (ignored === false) return { reason: `git would commit ${secrets}`, secrets: true };
    if (ignored === null) return null;
    // mcp-remote's sign-in folder (0.5.0, D5): its tokens are as private as the key file
    const signIns = gitIgnores(path.join(root, FILES.signIns, 'tokens')) === false;
    const file = path.join(root, FILES.helper);
    const projectRoot = family === 'project' && path.basename(root) !== '.alfred';
    // the bridge and serena's context (0.5.0, D7): a committed entry names them too, when they are there or this plan
    // writes them
    const unignore = projectRoot ? [FILES.bridge, FILES.serenaContext].filter((fileName) => (writes.includes(fileName) || fs.existsSync(path.join(root, fileName))) && gitIgnores(path.join(root, fileName)) === true) : [];
    const extra = { ...(signIns ? { signIns: true } : {}), ...(unignore.length ? { unignore } : {}) };
    if (projectRoot && gitIgnores(file) === true)
        return { reason: `git ignores ${file}, which a project-scope server needs committed`, helper: true, excluded: gitIgnores(root) === true, ...extra };
    const why = [signIns && `git would commit ${path.join(root, FILES.signIns)}/`, unignore.length && `git ignores ${unignore.map((fileName) => path.join(root, fileName)).join(' and ')}, which a committed entry names`].filter(Boolean);
    return why.length ? { reason: why.join('; '), ...extra, ...(unignore.length ? { excluded: gitIgnores(root) === true } : {}) } : null;
}

// The files this plugin copies into a root: the key helper (D4), the URL bridge (0.4.0) and serena's context (0.5.0,
// D7). Each carries its version on its first line.
const SHIPPED_LINE: Record<ShippedKind, RegExp> = { helper: /^\/\/ preferred-tools mcp-headers (\d+)\s*$/, bridge: /^\/\/ preferred-tools mcp-bridge (\d+)\s*$/, serenaContext: /^# preferred-tools serena-context (\d+)\s*$/ };
const shippedVersion = (kind: ShippedKind): number => (kind === 'bridge' ? BRIDGE_VERSION : kind === 'serenaContext' ? SERENA_CONTEXT_VERSION : helper.HELPER_VERSION);
const shippedText: Partial<Record<ShippedKind, string>> = {};
export const shippedSource = (kind: ShippedKind): string => (shippedText[kind] = shippedText[kind] || fs.readFileSync(path.join(import.meta.dirname, '..', 'copied', FILES[kind]), 'utf8'));
export const helperSource = () => shippedSource('helper');

// The file at `file` against this plugin's copy of `kind` ('helper' or 'bridge'): 'absent', 'lower' (rewrite it), 'same',
// 'edited' (the same number with other bytes, or no number line - a hand edit, left), 'higher' (a newer plugin wrote it -
// left). A CRLF copy of the same text is the same file (digestOf). -> { state, number }
export function shippedState(kind: ShippedKind, file: string, exists: (filePath: string) => boolean = (filePath) => fs.existsSync(filePath)): ShippedState
{
    if (!exists(file)) return { state: 'absent', number: null };
    let text: string;
    try { text = fs.readFileSync(file, 'utf8'); }
    catch { return { state: 'absent', number: null }; }
    const match = SHIPPED_LINE[kind].exec(text.split('\n')[0]!);
    if (!match) return { state: 'edited', number: null };
    const number = Number(match[1]);
    const version = shippedVersion(kind);
    if (number < version) return { state: 'lower', number };
    if (number > version) return { state: 'higher', number };
    return { state: helper.digestOf(text) === helper.digestOf(shippedSource(kind)) ? 'same' : 'edited', number };
}
export const helperState = (file: string, exists?: (filePath: string) => boolean): ShippedState => shippedState('helper', file, exists);

