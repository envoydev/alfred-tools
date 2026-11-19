// ROOT FOLDERS (spec D2) - one root per scope family: the project root serves project and local scope, the global root
// serves global (user) scope. A root holds each tool's data folder `<root>/<name>`, the key file, the header helper, the
// record of the user's answers and, unless it is `.alfred`, a `.gitignore`. The roots map in the plugin's data folder
// finds a named root again when no registration points into it.
//
// Nothing here writes but writeMap, the roots map in the plugin's data folder: the apply's file steps write the roots.
// A context stands in for the machine - { project, home, platform, exists, catalog } - so the options and the root in
// use are tested without a disk.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as account from '../core/account.ts';
import { ALFRED_DATA, FILES, FORMER_ROOT_NAME, ROOT_NAME } from '../core/constants.ts';
import { replaceFile } from '../core/replace-file.ts';
import { errorCode, isRecord } from '../core/guards.ts';
import { rootOfEntry, alfredData } from '../entries/locations.ts';
import { pathFor } from '../entries/platform.ts';
import { helperParts, bridgeParts, helperNameOf } from '../entries/entry.ts';
import * as helper from '../copied/mcp-headers.js';
import { load } from '../catalog/catalog.ts';
import { BRIDGE_VERSION } from '../copied/mcp-bridge.js';
import type { Catalog, CatalogRow } from '../catalog/types.ts';
import type { ServerEntry } from '../core/types.ts';
import type { Machine, Roots } from '../entries/types.ts';
import type { Family, IgnoreGap, InUse, InventoryView, KnownRootsView, MapRead, PendingMove, RecordEntry, Resolved, RootAnswer, RootOption, RootReg, RootsCtx, RootsMap, ShippedKind, ShippedState, StandardRoot } from './types.ts';

// A root folder's names: their home is core/constants.ts, which entries/ and keys/ can import (this file imports both).
export { FILES, FORMER_ROOT_NAME, ROOT_NAME };
// The file git is asked about inside mcp-remote's sign-in folder: whether git would commit it says whether the folder's
// contents are ignored.
export const SIGN_IN_PROBE = 'tokens';
// The plugin's data folder under its former id is named with this prefix (spec D4).
export const FORMER_DATA_PREFIX = 'preferred-tools-';
// The two scope families, each with its root folder: project (project and local scope) and global (user scope).
export const FAMILIES: readonly Family[] = ['project', 'global'];
// The names that make a folder a root that holds something (spec D3 'holds root files'); its contents are never read.
const ROOT_FILE_NAMES = [FILES.secrets, FILES.helper, FILES.bridge, FILES.list, FILES.record, FILES.serenaContext, '.secrets'];
export function holdsRootFiles(dir: string): boolean
{
    let names: string[];
    try { names = fs.readdirSync(dir); }
    catch { return false; }
    return names.some((name) => ROOT_FILE_NAMES.includes(name));
}

// Each default root still under the former name, one per folder (a project that is the home folder is both families),
// read by fix and update's root-move and by install and configure's stop. Names only, never a file's contents.
export function pendingMoves(context: { project: string; home: string; platform: string }): PendingMove[]
{
    const pathApi = pathFor(context.platform);
    const bases: { base: string; families: Family[] }[] = [];
    for (const [base, family] of [[context.project, 'project'], [context.home, 'global']] as const)
    {
        const same = bases.find((candidate) => pathApi.resolve(candidate.base) === pathApi.resolve(base));
        if (same) same.families.push(family);
        else bases.push({ base, families: [family] });
    }
    const out: PendingMove[] = [];
    for (const { base, families } of bases)
    {
        const from = pathApi.join(base, FORMER_ROOT_NAME);
        const to = pathApi.join(base, ROOT_NAME);
        let stat: fs.Stats;
        try { stat = fs.lstatSync(from); }
        catch { continue; }
        if (stat.isSymbolicLink()) { out.push({ families, from, to, state: 'link' }); continue; }
        if (!stat.isDirectory()) continue;
        let beside: string[] | null;
        try { beside = fs.readdirSync(to); }
        catch { beside = null; }
        const state = !beside || !beside.length ? 'move' : holdsRootFiles(from) ? 'both' : 'came-back';
        out.push({ families, from, to, state });
    }
    return out;
}
// The read guard (0.5.0, ruling 13): two deny rules in Claude Code's settings that keep a session's Read tool out of
// mcp-remote's sign-in tokens and the key file, wherever a root sits.
export const READ_GUARD = { signIns: `Read(//**/${FILES.signIns}/**)`, secrets: `Read(//**/${FILES.secrets})` };
export const GITIGNORE = '*\n!.gitignore\n!mcp-headers.js\n!mcp-bridge.js\n!serena-context.yml\n!macos-mcp.toml\n';
// serena's context file (spec D7): its number, on its first line
export const SERENA_CONTEXT_VERSION = 2;
const MAP_VERSION = 1;

// The scope family a scope belongs to: entries/locations.ts's, read here by plan/, update/ and fix/.
export { familyOf } from '../entries/locations.ts';
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
    catch (caught) { const code = errorCode(caught); return code === 'ENOENT' ? emptyMap() : { ...emptyMap(), note: `${file} cannot be read (${code}) - read as empty`, state: 'unreadable' }; }
    let doc: unknown;
    try { doc = JSON.parse(text); }
    catch { return { ...emptyMap(), note: `${file} is not JSON - read as empty`, state: 'bad' }; }
    if (!isRecord(doc)) return { ...emptyMap(), note: `${file} is not a roots map - read as empty`, state: 'bad' };
    const version = doc['version'];
    if (version !== MAP_VERSION) return { ...emptyMap(), note: `${versionNote(file, version, MAP_VERSION)} - read as empty`, state: newerOrBad(version, MAP_VERSION) };
    const projects: Record<string, string> = {};
    const mapped = doc['projects'];
    if (isRecord(mapped))
        for (const [projectPath, value] of Object.entries(mapped)) if (typeof value === 'string' && value) projects[projectPath] = value;
    const global = doc['global'];
    return { version: MAP_VERSION, global: typeof global === 'string' && global ? global : null, projects };
}

// The map written whole, through a temporary file beside it.
export function writeMap(dataDir: string, map: RootsMap): void
{
    fs.mkdirSync(dataDir, { recursive: true });
    replaceFile(path.join(dataDir, FILES.map), `${JSON.stringify({ version: MAP_VERSION, global: map.global, projects: map.projects }, null, 2)}\n`);
}

// The data folder the plugin had under its former name (spec D4): `<plugins>/data/preferred-tools-<marketplace>` beside
// this one. Null when this folder is not alfred-tools'.
export function dataSibling(dataDir: string | null | undefined): string | null
{
    if (!dataDir) return null;
    const base = path.basename(dataDir);
    return /^alfred-tools-/.test(base) ? path.join(path.dirname(dataDir), base.replace(/^alfred-tools-/, FORMER_DATA_PREFIX)) : null;
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
export function standard(family: string, context: Machine): [StandardRoot, StandardRoot]
{
    const pathApi = pathFor(context.platform);
    if (family === 'global') return [{ id: 'alfred-tools', root: pathApi.join(context.home, ROOT_NAME) }, { id: 'home-alfred', root: pathApi.join(context.home, ALFRED_DATA) }];
    return [{ id: 'alfred', root: pathApi.join(context.project, ALFRED_DATA) }, { id: 'alfred-tools', root: pathApi.join(context.project, ROOT_NAME) }];
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

// The folder above a registration's data folder, which may be a root: null with no data folder, or with one under a
// variable other than the home's.
function dataParentOf(row: CatalogRow | null | undefined, entry: ServerEntry | undefined, context: Machine): string | null
{
    if (!row || !row.locations || !entry) return null;
    let rootText: string | null;
    try { rootText = rootOfEntry(row, entry); }
    catch { rootText = null; }
    if (!rootText || rootText.includes('${') && !/^\$\{(?:HOME|USERPROFILE)\}/.test(rootText)) return null;
    return pathFor(context.platform).dirname(absOf(rootText, context));
}

// The roots the family's managed registrations point into, helpers first, then data folders: [{ path }]. A data folder
// counts only when its parent is a standard folder or holds one of the root's files - a tool's default folder in the home
// (~/.serena) is not a root.
export function registrationRoots(inventory: InventoryView, family: Family, context: RootsCtx): string[]
{
    const pathApi = pathFor(context.platform);
    const exists = existsOf(context);
    const managedRegistrations = (inventory.registrations || []).filter((registration) => managed(registration, family));
    const out: string[] = [];
    for (const registration of managedRegistrations)
    {
        const file = helperPathOf(registration.entry && registration.entry.headersHelper);
        if (file) out.push(pathApi.dirname(absOf(file, context)));
    }
    const known = standard(family, context).map((standardRoot) => standardRoot.root);
    const catalog = catalogOf(context);
    for (const registration of managedRegistrations)
    {
        const parent = dataParentOf(registration.rowId ? catalog.byId.get(registration.rowId) : null, registration.entry, context);
        if (parent && (known.includes(parent) || Object.values(FILES).some((fileName) => fileName !== FILES.map && exists(pathApi.join(parent, fileName))))) out.push(parent);
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

// The roots a registration may name as the plugin's (spec D4): this run's resolved roots of both families, and each
// family's root in use - the old one during a root change, so its files are recognised and re-pointed.
export function knownRoots(inventory: KnownRootsView, resolved: Partial<Record<Family, string | null | undefined>> | null | undefined, context: RootsCtx): string[]
{
    const inUseOf = (family: Family) => (inventory.roots && Object.hasOwn(inventory.roots, family) ? inventory.roots[family] : inUse(inventory, family, context));
    const found = [...FAMILIES.map((family) => resolved && resolved[family]), ...FAMILIES.map((family) => inUseOf(family)?.path)];
    return [...new Set(found.filter((root): root is string => typeof root === 'string' && root !== ''))];
}

// ---- the options ----------------------------------------------------------------------------------------------------

const NAMED_GLOBAL_TAIL = "a project-scope helper does not read keys here - keep a key a committed server uses in the project's root";

// The root question's options, the recommended first (D2's table): [{ id, label, description, root }]. Labels name the
// place in words; descriptions give the exact folder on this machine. 'A folder you name' has no root: it is asked next.
export function options(inventory: InventoryView, family: Family, context: RootsCtx): RootOption[]
{
    const exists = existsOf(context);
    const [alfred, projectAlfredTools] = standard('project', context);
    const [homeAlfredTools, homeAlfred] = standard('global', context);
    const list: RootOption[] = family === 'global'
        ? [
            { ...homeAlfredTools, label: '~/.alfred-tools', description: `${homeAlfredTools.root} - one folder for every project on this machine` },
            ...(exists(homeAlfred.root) ? [{ ...homeAlfred, label: '~/.alfred', description: `${homeAlfred.root} - alfred-code's folder in your home, shared with it` }] : []),
            { id: 'named', root: null, label: 'A folder you name', description: `a folder of yours, asked next - ${NAMED_GLOBAL_TAIL}` },
        ]
        : [
            ...(alfredData(context, inventory.alfredCodeEnabled) ? [{ ...alfred, label: '.alfred in this project', description: `${alfred.root} - kept out of git by alfred-code` }] : []),
            { ...projectAlfredTools, label: '.alfred-tools in this project', description: `${projectAlfredTools.root} - its own .gitignore keeps the keys, the record and the data out of git` },
            { id: 'named', root: null, label: 'A folder you name', description: 'a folder of yours inside this project, asked next' },
        ];
    const used = inUse(inventory, family, context);
    if (!used) return list;
    const usedOption = list.find((option) => option.root === used.path);
    if (usedOption) return [usedOption, ...list.filter((option) => option !== usedOption)];
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
    const [first = ''] = parts;
    if (['.git', '.claude'].includes(first.toLowerCase())) return { error: `the project root '${trimmed}' cannot be under ${first} - .git and .claude are not roots` };
    return { root: pathApi.join(context.project, ...parts) };
}

// The roots a run uses. `answers`: { project: { id, path? }, global: { id, path? } } - an option id from the root
// question, `path` the folder typed for 'named'. No answer: the family's recommended root (D2's first option). ->
// { roots: { project, global, globalNamed }, errors: [reason] }, the roots absolute.
export function resolveRoots(inventory: InventoryView, answers: Partial<Record<Family, RootAnswer | null>> | null | undefined, context: RootsCtx): Resolved
{
    const out: Roots = {};
    const errors: string[] = [];
    for (const family of FAMILIES)
    {
        const answer = (answers && answers[family]) || null;
        const rootOptions = options(inventory, family, context);
        // options always ends on 'A folder you name': the first is there
        const [recommended] = rootOptions;
        if (!answer || !answer.id) { out[family] = recommended ? recommended.root : null; continue; }
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
    const parent = dataParentOf(registration.rowId ? catalogOf(context).byId.get(registration.rowId) : null, registration.entry, context);
    if (!parent) return null;
    const map = (inventory.roots && inventory.roots.map) || emptyMap();
    const known = [...standard('project', context), ...standard('global', context)].map((standardRoot) => standardRoot.root).concat([map.global, ...Object.values(map.projects || {})].filter((root): root is string => Boolean(root)));
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
    const signIns = gitIgnores(path.join(root, FILES.signIns, SIGN_IN_PROBE)) === false;
    const file = path.join(root, FILES.helper);
    const projectRoot = family === 'project' && path.basename(root) !== ALFRED_DATA;
    // the bridge, serena's context (0.5.0, D7) and macos-mcp's exclude file: a committed entry names them too, when they
    // are there or this plan writes them
    const unignore = projectRoot ? [FILES.bridge, FILES.serenaContext, FILES.macosExclude].filter((fileName) => (writes.includes(fileName) || fs.existsSync(path.join(root, fileName))) && gitIgnores(path.join(root, fileName)) === true) : [];
    const extra = { ...(signIns ? { signIns: true } : {}), ...(unignore.length ? { unignore } : {}) };
    if (projectRoot && gitIgnores(file) === true)
        return { reason: `git ignores ${file}, which a project-scope server needs committed`, helper: true, excluded: gitIgnores(root) === true, ...extra };
    const why = [signIns && `git would commit ${path.join(root, FILES.signIns)}/`, unignore.length && `git ignores ${unignore.map((fileName) => path.join(root, fileName)).join(' and ')}, which a committed entry names`].filter(Boolean);
    return why.length ? { reason: why.join('; '), ...extra, ...(unignore.length ? { excluded: gitIgnores(root) === true } : {}) } : null;
}

// The files this plugin copies into a root: the key helper (D4), the URL bridge (0.4.0) and serena's context (0.5.0,
// D7). Each carries its version on its first line, under this plugin's name or its former one (preferred-tools until
// 0.4.0 - spec D2): a former-name copy is always older, so one at or above the shipped number was edited by hand.
const SHIPPED_LINE: Record<ShippedKind, RegExp> = { helper: /^\/\/ (alfred|preferred)-tools mcp-headers (\d+)\s*$/, bridge: /^\/\/ (alfred|preferred)-tools mcp-bridge (\d+)\s*$/, serenaContext: /^# (alfred|preferred)-tools serena-context (\d+)\s*$/ };
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
    const [firstLine = ''] = text.split('\n');
    const match = SHIPPED_LINE[kind].exec(firstLine);
    if (!match) return { state: 'edited', number: null };
    const number = Number(match[2]);
    const version = shippedVersion(kind);
    if (number < version) return { state: 'lower', number };
    if (match[1] === 'preferred') return { state: 'edited', number };
    if (number > version) return { state: 'higher', number };
    return { state: helper.digestOf(text) === helper.digestOf(shippedSource(kind)) ? 'same' : 'edited', number };
}
export const helperState = (file: string, exists?: (filePath: string) => boolean): ShippedState => shippedState('helper', file, exists);

