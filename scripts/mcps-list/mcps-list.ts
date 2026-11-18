// THE LIST - <root>/mcps.json (spec D1, 0.5.0). One per scope family's root folder: every server the plugin manages in
// that family, the apps each one is written to, and the servers the user left on their own (`own`, the record's entries
// unchanged). Read and written only here. A server's entry never holds a key value: a stdio key field holds kept.MARKER
// and `key` names its variable in .mcps-secrets.
//
// The write follows the record's rules (D8 of 0.2.0): a temporary file then a rename; an unchanged list is not rewritten;
// a list from a newer version, or one that cannot be read, is never replaced; a file that is not JSON is kept as
// <file>.bak first; the file goes when both arrays are empty.
import fs from 'node:fs';
import path from 'node:path';
import * as roots from '../roots/roots.ts';
import * as keys from '../keys/keys.ts';
import * as kept from '../core/kept.ts';
import { deepEqual, stripBom } from '../core/json-file.ts';
import { replaceFile } from '../core/replace-file.ts';
import { pathFor } from '../entries/platform.ts';
import type { Outcome, ServerEntry } from '../core/types.ts';
import type { CatalogRow } from '../catalog/types.ts';
import type { TokenField } from '../keys/types.ts';
import type { Registration } from '../entries/types.ts';
import type { Family, InventoryView, RootsCtx } from '../roots/types.ts';
import type { ListChanges, ListRead, ListServer, Live, McpsList, OldRecord, OwnEntry, RawDoc, ReadState, StepEnd, StepLike } from './types.ts';

export const LIST_VERSION = 1;

const newerOrBad = (version: unknown): ReadState => (typeof version === 'number' && version > LIST_VERSION ? 'newer' : 'bad');
const empty = (file: string, note: string, state: ReadState): ListRead => ({ version: LIST_VERSION, servers: [], own: [], note: `${file} ${note} - read as empty`, state });

// The list file. Missing: null. Unreadable, not JSON, another version or another shape: empty with a note and its state
// (readOldRecord's meanings). Never throws.
export function readList(file: string): ListRead | null
{
    let text: string;
    try { text = fs.readFileSync(file, 'utf8'); }
    catch (caught) { const err = caught as NodeJS.ErrnoException;  return err.code === 'ENOENT' || err.code === 'ENOTDIR' ? null : empty(file, `cannot be read (${err.code})`, 'unreadable'); }
    let doc: RawDoc | null;
    // the former name's marker (spec D2) - it is JSON-safe, so the text is swapped before the parse
    try { doc = JSON.parse(stripBom(text).replaceAll(kept.OLD_MARKER, kept.MARKER)) as RawDoc | null; }
    catch { return empty(file, 'is not JSON', 'bad'); }
    if (doc && typeof doc === 'object' && doc.version !== LIST_VERSION && newerOrBad(doc.version) === 'newer')
        return empty(file, `is version ${doc.version}, newer than this plugin's ${LIST_VERSION}`, 'newer');
    if (!doc || typeof doc !== 'object' || doc.version !== LIST_VERSION || !Array.isArray(doc.servers))
        return empty(file, `is version ${JSON.stringify(doc && doc.version)} or has no servers list`, 'bad');
    const out: McpsList = {
        version: LIST_VERSION,
        servers: (doc.servers as ListServer[]).filter((server) => server && typeof server === 'object' && typeof server.name === 'string' && typeof server.scope === 'string'),
        own: Array.isArray(doc.own) ? (doc.own as OwnEntry[]).filter((ownEntry) => ownEntry && typeof ownEntry === 'object') : [],
    };
    if (doc.cursorOffer === 'declined') out.cursorOffer = 'declined';
    return out;
}

export const listFile = (root: string): string => path.join(root, roots.FILES.list);

// Where the commands look for a family's list: oldRecordFiles' folders, in its order, with the list's name.
export function listFiles(inventory: InventoryView, family: Family, context: RootsCtx): string[]
{
    const pathApi = pathFor(context.platform);
    return oldRecordFiles(inventory, family, context).map((file) => pathApi.join(pathApi.dirname(file), roots.FILES.list));
}

export const serverKey = (server: { name: string; scope: string }): string => `mcp:${server.name}~${server.scope}`;

// The registration a plan step leaves in place: a move's destination, else its own name and scope. null for a step that
// is no registration step.
export function regKey(step: StepLike | null | undefined): string | null
{
    if (!step || typeof step.op !== 'string' || !step.op.startsWith('mcp-')) return null;
    if (step.op === 'mcp-move' && step.to) return serverKey(step.to as StepEnd);
    return typeof step.name === 'string' && typeof step.scope === 'string' ? serverKey({ name: step.name, scope: step.scope }) : null;
}

// The list with this plan's changes: each upsert replaces the server with its key in place or is appended, each drop
// removes its key, `own` (roots.ownOnly's result) replaces the own entries when given, and `cursorOffer` is set when
// given. -> a new doc
export function mergeList(list: Omit<McpsList, 'version'> | null | undefined, { upserts = [], drops = [], own, cursorOffer }: ListChanges = {}): McpsList
{
    const servers = ((list && list.servers) || []).slice();
    for (const server of upserts)
    {
        const at = servers.findIndex((existing) => serverKey(existing) === serverKey(server));
        if (at >= 0) servers[at] = server;
        else servers.push(server);
    }
    const dropped = new Set(drops);
    const doc: McpsList = { version: LIST_VERSION, servers: servers.filter((server) => !dropped.has(serverKey(server))), own: own !== undefined ? own : (list && list.own) || [] };
    const offer = cursorOffer !== undefined ? cursorOffer : list && list.cursorOffer;
    if (offer === 'declined') doc.cursorOffer = 'declined';
    return doc;
}

// Writes `doc` over `file`, `read` being readList(file) as the plan or apply found it. -> { ok, detail }
export function writeList(file: string, doc: { version?: number | undefined; servers?: ListServer[] | undefined; own?: OwnEntry[] | undefined; cursorOffer?: string | undefined }, read: ListRead | null | undefined): Outcome
{
    if (read && (read.state === 'newer' || read.state === 'unreadable'))
        return { ok: true, detail: `${read.note!.replace(/ - read as empty$/, '')} - left as it is; ${read.state === 'newer' ? 'update alfred-tools' : 'check its permissions'}, then run the command again` };
    const servers = doc.servers || [];
    const own = doc.own || [];
    if (!servers.length && !own.length)
    {
        if (!read) return { ok: true, detail: `${file}: no server is listed - nothing to write` };
        if (read.state) return { ok: true, detail: `${read.note!.replace(/ - read as empty$/, '')} - not this plugin's list, left as it is` };
        fs.rmSync(file, { force: true });
        return { ok: true, detail: `removed ${file} - no server is listed` };
    }
    const out: McpsList = { version: LIST_VERSION, servers, own };
    if (doc.cursorOffer === 'declined') out.cursorOffer = 'declined';
    if (read && !read.state && deepEqual(out, { version: read.version, servers: read.servers, own: read.own, ...(read.cursorOffer ? { cursorOffer: read.cursorOffer } : {}) }))
        return { ok: true, detail: `${file} already holds these servers - left as it is` };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let backup: string | null = null;
    if (read && read.state === 'bad' && fs.existsSync(file)) { backup = `${file}.bak`; fs.copyFileSync(file, backup); }
    replaceFile(file, `${JSON.stringify(out, null, 2)}\n`);
    const count = servers.length;
    return { ok: true, detail: `wrote ${file} (${count} server${count === 1 ? '' : 's'})${backup ? ` - the old file kept as ${backup}` : ''}` };
}

// The value a token field holds, from its template: '${VAR}' -> the whole value, 'Bearer ${VAR}' -> what follows.
function valueOf(entry: ServerEntry, field: TokenField, tokenVar: string): string | null
{
    const value = keys.valueAt(entry, field.at);
    if (typeof value !== 'string') return null;
    const [before, after] = field.template.split(`\${${tokenVar}}`);
    if (after === undefined || !value.startsWith(before!) || !value.endsWith(after)) return null;
    return value.slice(before!.length, value.length - after.length);
}

// A list item from a registration as read: `entry` kept (every key value the kept marker), `key` the variable a stdio key
// field holds, named by the key files that hold its value when given (`files`, keys.stdioChain's), else the route's own
// variable; null when the entry holds no key field.
export function fromRegistration(registration: Registration, row: CatalogRow | null | undefined, clients: string[], files: string[] = []): ListServer
{
    const route = row && row.routes ? row.routes[registration.route!] : null;
    let key: string | null = null;
    const fields = keys.tokenFields(registration.entry, route);
    if (fields.length)
    {
        const value = valueOf(registration.entry, fields[0]!, route!.tokenVar!);
        key = (value && keys.nameOfValue(files, value)) || route!.tokenVar!;
    }
    return { name: registration.name, scope: registration.scope, row: row ? row.id : null, route: registration.route, clients: clients.slice(), entry: kept.maskCredentials(registration.entry, row), key };
}

// ---- the 0.4.x record, <root>/<roots.FILES.record> ----------------------------------------------------------------
// Read only: the servers the user left on their own until list-import moves them into a list's `own` (0.5.0).

const OLD_RECORD_VERSION = 1;
const versionNote = (file: string, version: unknown, current: number): string => (newerOrBad(version) === 'newer' ? `${file} is version ${version}, newer than this plugin's ${current}` : `${file} is version ${JSON.stringify(version)}, not ${current}`);

// Where the commands look for the record (D6): the mapped root, the two standard folders, then every root a managed
// registration points into.
export function oldRecordFiles(inventory: InventoryView, family: Family, context: RootsCtx): string[]
{
    const pathApi = pathFor(context.platform);
    const map = ((inventory.roots && inventory.roots.map) || { projects: {} }) as { global?: string | null; projects: Record<string, string> };
    const mapped = family === 'global' ? map.global : (Object.keys(map.projects || {}).length ? map.projects[roots.mapKey(context.project)] : null);
    const order = family === 'global' ? roots.standard('global', context) : [...roots.standard('project', context)].reverse();
    const dirs = [mapped, ...order.map((standardRoot) => standardRoot.root), ...roots.registrationRoots(inventory, family, context)].filter(Boolean) as string[];
    return [...new Set(dirs)].map((dir) => pathApi.join(dir, roots.FILES.record));
}

// The record file. Missing: null. Malformed or another version: empty with a note and its state. Never throws.
export function readOldRecord(file: string): OldRecord | null
{
    let text: string;
    try { text = fs.readFileSync(file, 'utf8'); }
    catch (caught) { const err = caught as NodeJS.ErrnoException;  return err.code === 'ENOENT' || err.code === 'ENOTDIR' ? null : { version: OLD_RECORD_VERSION, servers: [], note: `${file} cannot be read (${err.code}) - read as empty`, state: 'unreadable' }; }
    let doc: RawDoc | null;
    try { doc = JSON.parse(text) as RawDoc | null; }
    catch { return { version: OLD_RECORD_VERSION, servers: [], note: `${file} is not JSON - read as empty`, state: 'bad' }; }
    if (doc && typeof doc === 'object' && doc.version !== OLD_RECORD_VERSION && newerOrBad(doc.version) === 'newer')
        return { version: OLD_RECORD_VERSION, servers: [], note: `${versionNote(file, doc.version, OLD_RECORD_VERSION)} - read as empty`, state: 'newer' };
    if (!doc || typeof doc !== 'object' || doc.version !== OLD_RECORD_VERSION || !Array.isArray(doc.servers))
        return { version: OLD_RECORD_VERSION, servers: [], note: `${file} is version ${JSON.stringify(doc && doc.version)} or has no servers list - read as empty`, state: 'bad' };
    return { version: OLD_RECORD_VERSION, servers: (doc.servers as OwnEntry[]).filter((entry) => entry && typeof entry === 'object') };
}

// The own entries with this run's merged in (D6). An entry replaces the one with its key, in place; a new key is
// appended. Then an entry is dropped when its server is gone: a server's key missing from `live.servers`, or there with
// another fingerprint (null: present, not compared); a connector only when `live.connectors` is a list that lacks it -
// a run that did not pass the connectors keeps every one (R14). An entry of no known shape is dropped.
// live: { servers: { <key>: fingerprint | null }, connectors: string[] | null }
function mergeOwn(record: { servers?: OwnEntry[] | undefined } | null | undefined, entries: OwnEntry[] | null | undefined, live: Live | null | undefined): OldRecord
{
    const out: OwnEntry[] = [];
    const at = new Map<string, number>();
    for (const entry of [...((record && record.servers) || []), ...(entries || [])])
    {
        const key = roots.recordKey(entry);
        if (!key) continue;
        if (at.has(key)) out[at.get(key)!] = entry;
        else { at.set(key, out.length); out.push(entry); }
    }
    const servers = (live && live.servers) || {};
    const connectors = live && Array.isArray(live.connectors) ? live.connectors : null;
    const kept = out.filter((entry) =>
    {
        if (typeof entry.connector === 'string') return !connectors || connectors.includes(entry.connector);
        const key = roots.recordKey(entry);
        if (!Object.hasOwn(servers, key!)) return false;
        return servers[key!] === null || deepEqual(servers[key!], entry.fingerprint);
    });
    return { version: OLD_RECORD_VERSION, servers: kept };
}

// The own entries a list-write step leaves (recordClean's rules of 0.4.x): `keep` as it is, then the `entries` a server
// still has (a key in both takes the entries one), the servers left on their own only.
export function ownOf({ entries, keep, live }: { entries?: OwnEntry[] | null | undefined; keep?: OwnEntry[] | null | undefined; live?: Live | null | undefined }): OwnEntry[]
{
    const fresh = roots.ownOnly(mergeOwn({ servers: [] }, entries, live).servers);
    const keys = new Set(fresh.map(roots.recordKey));
    return [...roots.ownOnly(keep).filter((entry) => !keys.has(roots.recordKey(entry))), ...fresh];
}

