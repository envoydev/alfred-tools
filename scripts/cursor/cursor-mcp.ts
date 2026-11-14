// CURSOR'S FILES - <project>/.cursor/mcp.json and ~/.cursor/mcp.json, written from the lists (spec D2, 0.5.0). Cursor has
// no CLI that adds a server, so this is the one writer of those files besides the user: it replaces only the names it
// manages, keeps every other entry with its keys and values in their order, and refuses a file it does not recognise -
// a symbolic link, text that is not JSON (comments and trailing commas included), or no mcpServers object - writing
// nothing. A write goes through a temporary file and a rename, and is read back.
import fs from 'node:fs';
import path from 'node:path';
import * as account from '../core/account.ts';
import * as lists from '../mcps-list/mcps-list.ts';
import { stripBom, deepEqual } from '../core/json-file.ts';
import { bridgeParts, helperParts } from '../entries/entry.ts';
import * as kept from '../core/kept.ts';
import * as keys from '../keys/keys.ts';
import { load } from '../catalog/catalog.ts';
import { matchesFingerprint } from '../inventory/inventory.ts';
import type { Env, Outcome, ServerEntry, ServerMap } from '../core/types.ts';
import type { Catalog, CatalogRow } from '../catalog/types.ts';
import type { ListServer } from '../mcps-list/types.ts';
import type { CursorCtx, CursorDoc, CursorOf, CursorPlace, CursorRead, CursorWriteStep, ListSource, Managed } from './types.ts';

const pathFor = (platform: string) => (platform === 'win32' ? path.win32 : path.posix);

// The Cursor file of a scope family: the project's for project and local scope, the home's for user scope.
export function fileFor(family: string, context: CursorPlace): string
{
    const pathApi = pathFor(context.platform);
    return family === 'global' ? pathApi.join(context.home || account.homeDir(context.env || process.env), '.cursor', 'mcp.json') : pathApi.join(context.project!, '.cursor', 'mcp.json');
}

// -> { state: 'absent' | 'ok' | 'symlink' | 'bad' | 'shape', doc, eol }
export function readCursor(file: string): CursorRead
{
    let stats: fs.Stats;
    try { stats = fs.lstatSync(file); }
    catch (caught) { const err = caught as NodeJS.ErrnoException;  return err.code === 'ENOENT' || err.code === 'ENOTDIR' ? { state: 'absent', doc: { mcpServers: {} }, lineEnd: '\n' } : { state: 'bad', doc: null, lineEnd: '\n', error: err.code }; }
    if (stats.isSymbolicLink()) return { state: 'symlink', doc: null, lineEnd: '\n' };
    let text: string;
    try { text = fs.readFileSync(file, 'utf8'); }
    catch (caught) { const err = caught as NodeJS.ErrnoException;  return { state: 'bad', doc: null, lineEnd: '\n', error: err.code }; }
    const lineEnd = text.includes('\r\n') ? '\r\n' : '\n';
    let doc: CursorDoc | null;
    try { doc = JSON.parse(stripBom(text)) as CursorDoc | null; }
    catch { return { state: 'bad', doc: null, lineEnd: lineEnd }; }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc) || !doc.mcpServers || typeof doc.mcpServers !== 'object' || Array.isArray(doc.mcpServers)) return { state: 'shape', doc, lineEnd: lineEnd };
    return { state: 'ok', doc, lineEnd: lineEnd, text };
}

// Why a file is left as it is, or null when it can be written.
export function refusal(read: CursorRead): string | null
{
    if (read.state === 'symlink') return 'is a symbolic link - alfred-tools writes no file through a link; replace it with the file itself';
    if (read.state === 'bad') return read.error ? `cannot be read (${read.error})` : 'is not JSON (Cursor reads comments and trailing commas, alfred-tools does not) - remove them, then run the command again';
    if (read.state === 'shape') return 'has no mcpServers object - not a file alfred-tools recognises';
    return null;
}

// The servers this file holds from the lists: those set up for Cursor, the nearest list first. `lists`: [{ file,
// scopes, servers }] - the family's own list (local and project scope; local wins one name) and, for a project, the
// lists above it (project scope only). -> Map<name, { entry, scope, list, row }>
export function managedSet(sources: ListSource[]): Map<string, Managed>
{
    const out = new Map<string, Managed>();
    for (const src of sources)
    {
        const rank = (server: ListServer) => (server.scope === 'local' ? 0 : 1);
        const mine = (src.servers || []).filter((server) => (server.clients || []).includes('cursor') && (src.scopes || []).includes(server.scope)).sort((first, second) => rank(first) - rank(second));
        for (const server of mine) if (!out.has(server.name)) out.set(server.name, { entry: server.cursorEntry || server.entry, scope: server.scope, list: src.file, row: server.row, route: server.route, key: server.key || null });
    }
    return out;
}

// The file's document with the managed servers in place: a name in `before` the set no longer holds goes, a `skip` name
// keeps the file's own value (or stays out when the file lacks it), the managed names come first in catalog.order and
// the user's after them in their order.
// Every other top-level key keeps its place and value.
export function compose(doc: CursorDoc | null, managed: Map<string, Managed>, { before = [], skip = [], order = [] }: { before?: string[]; skip?: string[]; order?: string[] } = {}): Record<string, unknown>
{
    const servers = (doc && doc.mcpServers) || {};
    const at = (name: string) => { const i = order.indexOf((managed.get(name) || ({} as Partial<Managed>)).row as string); return i < 0 ? order.length : i; };
    const names = [...managed.keys()].sort((first, second) => at(first) - at(second));
    const next: ServerMap = {};
    for (const name of names)
    {
        // a skipped name keeps the file's own value, and one the file lacks stays out (spec D1: never re-added)
        if (!skip.includes(name)) next[name] = managed.get(name)!.entry;
        else if (Object.hasOwn(servers, name)) next[name] = servers[name]!;
    }
    for (const [name, value] of Object.entries(servers))
    {
        if (Object.hasOwn(next, name)) continue;
        if (before.includes(name) && !skip.includes(name)) continue;
        next[name] = value;
    }
    const base = doc && typeof doc === 'object' ? doc : {};
    const out: Record<string, unknown> = Object.hasOwn(base, 'mcpServers') ? {} : { mcpServers: next };
    for (const [key, value] of Object.entries(base)) out[key] = key === 'mcpServers' ? next : value;
    return out;
}

const textOf = (doc: unknown, lineEnd: string): string => `${JSON.stringify(doc, null, 2)}\n`.replace(/\n/g, lineEnd);

// The cursor-write step: the managed set from its lists, composed into the file, written, read back.
// step: { file, family, lists: [{ file, scopes }], before, skip, replace, only? }. A name the file holds as the user's own
// (not in `before`) is replaced only when `replace` names it.
export function cursorWrite(step: CursorWriteStep, context: CursorCtx | null | undefined): Outcome
{
    const read = readCursor(step.file);
    const why = refusal(read);
    if (why) return { ok: false, detail: `${step.file} ${why} - left as it is` };
    const sources = (step.lists || []).map((list) => ({ file: list.file, scopes: list.scopes, servers: ((list.file && lists.readList(list.file)) || { servers: [] }).servers }));
    const managed = managedSet(sources);
    const notes = fillStdioKeys(managed, context);
    const servers = read.doc!.mcpServers;
    const before = step.before || [];
    const theirs = [...managed.keys()].filter((name) => Object.hasOwn(servers, name) && !before.includes(name) && !(step.replace || []).includes(name));
    // `only`: the names this write may change (fix's client-drift); every other managed name keeps the file's value
    const others = step.only ? [...managed.keys()].filter((name) => !step.only!.includes(name)) : [];
    const skip = [...new Set([...(step.skip || []), ...theirs, ...others])];
    const order = (context && context.catalog && context.catalog.order) || [];
    const doc = compose(read.doc, managed, { before, skip, order });
    const text = textOf(doc, read.lineEnd);
    const said = notes.length ? `; ${notes.join('; ')}` : '';
    if (read.state === 'ok' && read.text === text) return { ok: true, detail: `${step.file} already holds these servers - left as it is${said}` };
    fs.mkdirSync(path.dirname(step.file), { recursive: true });
    const tmp = `${step.file}.${process.pid}.tmp`;
    // the file's own mode is kept: ~/.cursor/mcp.json can hold a stdio route's key (D6), and a user's 0600 stays 0600
    let mode: number | undefined;
    try { mode = fs.statSync(step.file).mode & 0o777; } catch { /* a new file takes the default */ }
    fs.writeFileSync(tmp, text, mode === undefined ? undefined : { mode });
    if (mode !== undefined) fs.chmodSync(tmp, mode);
    fs.renameSync(tmp, step.file);
    const back = readCursor(step.file);
    const wrong = back.state !== 'ok' ? [...managed.keys()] : [...managed.keys()].filter((name) => !skip.includes(name) && !deepEqual(back.doc!.mcpServers[name], managed.get(name)!.entry));
    if (wrong.length) return { ok: false, detail: `${step.file}: ${wrong.join(', ')} did not read back as written` };
    const kept = theirs.length ? ` - ${theirs.join(', ')} left as your own` : '';
    return { ok: true, detail: `wrote ${step.file} (${managed.size - theirs.length} server${managed.size - theirs.length === 1 ? '' : 's'} from the list)${kept}${said}` };
}

// ---- stdio routes that hold their key (spec D6) -----------------------------------------------------------------------

// Does this entry carry its key in the registration? The rule, not a list: the route has a tokenVar and the entry holds
// a field keys.tokenFields reads (github's Docker route, sentry's npm route, context7 local with --api-key).
export function stdioKeyed(entry: ServerEntry, row: CatalogRow | null | undefined, routeId: string | null | undefined): boolean
{
    const route = row && row.routes ? row.routes[routeId!] : null;
    return Boolean(route && route.tokenVar && keys.tokenFields(entry, route).length);
}

// At user scope a stdio keyed entry goes into ~/.cursor/mcp.json with its value, from the global root's .mcps-secrets
// (the list's own folder) under the list's key name, as apply's fillStep writes ~/.claude.json's copy; the list keeps
// kept.MARKER. When the key files lack it - a 0.2.x/0.3.x key kept in the registration, the old key files read for
// names only - the value comes from Claude Code's registration as read, beside which Cursor's copy sits (D6). With
// neither, the name is written empty, with fillStep's note. Changes `managed` in place. -> [note]
function fillStdioKeys(managed: Map<string, Managed>, context: CursorCtx | null | undefined): string[]
{
    const catalog = (context && context.catalog) || load();
    const notes: string[] = [];
    for (const [name, managedServer] of managed)
    {
        if (managedServer.scope !== 'user' || !managedServer.key || !managedServer.list) continue;
        const row = catalog.byId.get(managedServer.row!);
        if (!stdioKeyed(managedServer.entry, row, managedServer.route)) continue;
        const files = keys.stdioChain({ scope: 'user', globalRoot: path.dirname(managedServer.list) });
        const found = keys.valueIn(files, managedServer.key);
        const route = row!.routes[managedServer.route!];
        if (!found)
        {
            const registration = context && context.env ? account.readRegistration(name, 'user', context.project || process.cwd(), context.env) : undefined;
            const back = registration ? kept.restore(managedServer.entry, registration, row) : null;
            const filled = back && !back.error ? keys.tokenFields(back.entry!, route).map((field) => keys.valueAt(back.entry!, field.at)) : [];
            if (filled.length && filled.every((value) => typeof value === 'string' && value.trim() && !value.includes(kept.MARKER))) { managed.set(name, { ...managedServer, entry: back!.entry! }); continue; }
        }
        managed.set(name, { ...managedServer, entry: keys.fillKeys(managedServer.entry, row, managedServer.route!, 'user', { [route!.tokenVar!]: found ? found.value : '' }) });
        if (!found) notes.push(`${managedServer.key} for '${name}' (user) is in none of ${files.join(', ')} - written empty: fill ${managedServer.key} in ${files[0]}, then run /alfred-tools:configure and keep ${managedServer.key} as the key's name - it writes the key in`);
    }
    return notes;
}

// Is this Cursor entry the row's server? A bridge copy (D5) is matched by its URL, as a plain http entry, against the
// row's fingerprints, and by itself against a `bridge` fingerprint: inventory.matchesFingerprint alone returns false for
// every bridge entry against a host or path fingerprint. inventory.ts requires this file, so it is required here, late.
export function matchesRow(entry: ServerEntry, row: CatalogRow | null | undefined): boolean
{
    const fingerprints = Object.values((row && row.routes) || {}).flatMap((route) => route.fingerprints || []);
    const bridge = bridgeParts(entry);
    if (!bridge) return fingerprints.some((fingerprint) => matchesFingerprint(entry, fingerprint));
    const asHttp = { type: 'http', url: bridge.template };
    return fingerprints.some((fingerprint) => (fingerprint.bridge ? matchesFingerprint(entry, fingerprint) : matchesFingerprint(asHttp, fingerprint)));
}

// The Cursor file of a family as the inventory gives it: its state, every name it holds, and the entries of the names
// its list marks for Cursor, kept (every key value the marker) - what update and drift read Cursor's copy from.
// `marked`: [{ name, row }] -> { file, state, names, entries }
export function cursorOf(file: string, marked: { name: string; row: string | null }[], catalog: Catalog): CursorOf
{
    const read = readCursor(file);
    const servers: ServerMap = read.state === 'ok' ? read.doc!.mcpServers : {};
    const entries: Record<string, ServerEntry> = {};
    for (const markedServer of marked)
        if (Object.hasOwn(servers, markedServer.name) && !Object.hasOwn(entries, markedServer.name)) entries[markedServer.name] = kept.maskCredentials(servers[markedServer.name]!, catalog.byId.get(markedServer.row!));
    return { file, state: read.state, names: Object.keys(servers), entries };
}

// ---- hosted keyed routes: two forms (spec D5) -------------------------------------------------------------------------

// The headers an entry sends besides the helper's: Cursor's bridge has no place for them.
export const otherHeaders = (entry: ServerEntry | null | undefined): string[] => Object.keys((entry && entry.headers) || {});

// Cursor's copy of a hosted keyed entry: Cursor runs no headersHelper (F5), so it gets the bridge, which sends the key
// (F6) - `node <root>/mcp-bridge.js <url> <NAME> <SCHEME> mcp-remote@<pin> [<global root>]`, the object buildEntry makes
// for sentry's bridge route. The URL, the helper's arguments and the bridge path come from `entry`; a `prior` bridge
// copy (the list's cursorEntry, or Cursor's copy as read) keeps its pin, its cut-off and every env pair and argument the
// form does not set, so a pin update moved or an edit the user kept survives a Claude-side rewrite. -> entry | null
export function bridgeFormOf(entry: ServerEntry | null | undefined, catalog: Catalog, prior: ServerEntry | null = null): ServerEntry | null
{
    if (!entry || typeof entry.headersHelper !== 'string' || otherHeaders(entry).length) return null;
    const helper = helperParts(entry.headersHelper);
    if (!helper || helper.args.length < 2) return null;
    const pathApi = /^(?:[A-Za-z]:[\\/]|\\\\)/.test(helper.path) ? path.win32 : path.posix;
    const own = [pathApi.join(pathApi.dirname(helper.path), 'mcp-bridge.js'), entry.url!, helper.args[0]!, helper.args[1]!];
    const globalRoot = helper.args[2] ? [helper.args[2]] : [];
    const priorParts = prior ? bridgeParts(prior) : null;
    if (priorParts && priorParts.packageSpec)
    {
        const at = prior!.args!.findIndex((argument) => String(argument) === priorParts.path);
        const rest = priorParts.globalRoot !== null ? prior!.args!.slice(at + 6) : [];
        return { ...prior, command: 'node', args: [...prior!.args!.slice(0, at), ...own, priorParts.packageSpec, ...globalRoot, ...rest], env: { ...(prior!.env || {}) } };
    }
    const packageSpec = catalog.byId.get('sentry')!.routes.bridge!.package!;
    return { command: 'node', args: [...own, `${packageSpec.name}@${packageSpec.version}`, ...globalRoot], env: { npm_config_before: packageSpec.cutoff } };
}

// Is Cursor on this machine (spec D3)? `~/.cursor` exists, `cursor-agent` or `cursor` is on PATH (with .exe or .cmd on
// Windows), or a list already sets a server up for Cursor. Bare `agent` does not count: the name is too common.
export function cursorFound(context: CursorPlace, inventory: { lists?: Record<string, { servers?: ListServer[] | undefined } | null | undefined> | undefined } | null | undefined): boolean
{
    const pathApi = pathFor(context.platform);
    const env: Env = context.env || {};
    const home = context.home || account.homeDir(env);
    if (home && fs.existsSync(pathApi.join(home, '.cursor'))) return true;
    const exts = context.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
    const dirs = String(env.PATH || env.Path || '').split(context.platform === 'win32' ? ';' : ':').filter(Boolean);
    for (const dir of dirs) for (const name of ['cursor-agent', 'cursor']) for (const extension of exts) if (fs.existsSync(pathApi.join(dir, `${name}${extension}`))) return true;
    return ['project', 'global'].some((family) => { const list = inventory && inventory.lists && inventory.lists[family]; return Boolean(list) && (list!.servers || []).some((server) => (server.clients || []).includes('cursor')); });
}

