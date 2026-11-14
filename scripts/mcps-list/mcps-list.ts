// @ts-nocheck - typed in Task 10
// THE LIST - <root>/mcps.json (spec D1, 0.5.0). One per scope family's root folder: every server the plugin manages in
// that family, the apps each one is written to, and the servers the user left on their own (`own`, the record's entries
// unchanged). Read and written only here. A server's entry never holds a key value: a stdio key field holds kept.MARKER
// and `key` names its variable in .mcps-secrets.
//
// The write follows the record's rules (D8 of 0.2.0): a temporary file then a rename; an unchanged list is not rewritten;
// a list from a newer version, or one that cannot be read, is never replaced; a file that is not JSON is kept as
// <file>.bak first; the file goes when both arrays are empty. apply.js's own helpers are not required here, since
// apply.js requires the planner, which requires this module.
import fs from 'node:fs';
import path from 'node:path';
import * as roots from '../roots/roots.ts';
import * as keys from '../keys/keys.ts';
import * as kept from '../core/kept.ts';
import { deepEqual } from '../core/json-file.ts';

export const LIST_VERSION = 1;

const newerOrBad = (version) => (typeof version === 'number' && version > LIST_VERSION ? 'newer' : 'bad');
const empty = (file, note, state) => ({ version: LIST_VERSION, servers: [], own: [], note: `${file} ${note} - read as empty`, state });

// The list file. Missing: null. Unreadable, not JSON, another version or another shape: empty with a note and its state
// (readOldRecord's meanings). Never throws.
export function readList(file)
{
    let text;
    try { text = fs.readFileSync(file, 'utf8'); }
    catch (err) { return err.code === 'ENOENT' || err.code === 'ENOTDIR' ? null : empty(file, `cannot be read (${err.code})`, 'unreadable'); }
    let doc;
    try { doc = JSON.parse(text.replace(/^﻿/, '')); }
    catch { return empty(file, 'is not JSON', 'bad'); }
    if (doc && typeof doc === 'object' && doc.version !== LIST_VERSION && newerOrBad(doc.version) === 'newer')
        return empty(file, `is version ${doc.version}, newer than this plugin's ${LIST_VERSION}`, 'newer');
    if (!doc || typeof doc !== 'object' || doc.version !== LIST_VERSION || !Array.isArray(doc.servers))
        return empty(file, `is version ${JSON.stringify(doc && doc.version)} or has no servers list`, 'bad');
    const out = {
        version: LIST_VERSION,
        servers: doc.servers.filter((s) => s && typeof s === 'object' && typeof s.name === 'string' && typeof s.scope === 'string'),
        own: Array.isArray(doc.own) ? doc.own.filter((e) => e && typeof e === 'object') : [],
    };
    if (doc.cursorOffer === 'declined') out.cursorOffer = 'declined';
    return out;
}

export const listFile = (root) => path.join(root, roots.FILES.list);

// Where the commands look for a family's list: oldRecordFiles' folders, in its order, with the list's name.
export function listFiles(inv, family, ctx)
{
    const P = ctx.platform === 'win32' ? path.win32 : path.posix;
    return oldRecordFiles(inv, family, ctx).map((f) => P.join(P.dirname(f), roots.FILES.list));
}

export const serverKey = (s) => `mcp:${s.name}~${s.scope}`;

// The registration a plan step leaves in place: a move's destination, else its own name and scope. null for a step that
// is no registration step.
export function regKey(step)
{
    if (!step || typeof step.op !== 'string' || !step.op.startsWith('mcp-')) return null;
    if (step.op === 'mcp-move' && step.to) return `mcp:${step.to.name}~${step.to.scope}`;
    return typeof step.name === 'string' && typeof step.scope === 'string' ? `mcp:${step.name}~${step.scope}` : null;
}

// The list with this plan's changes: each upsert replaces the server with its key in place or is appended, each drop
// removes its key, `own` (roots.ownOnly's result) replaces the own entries when given, and `cursorOffer` is set when
// given. -> a new doc
export function mergeList(list, { upserts = [], drops = [], own, cursorOffer } = {})
{
    const servers = ((list && list.servers) || []).slice();
    for (const s of upserts)
    {
        const at = servers.findIndex((x) => serverKey(x) === serverKey(s));
        if (at >= 0) servers[at] = s;
        else servers.push(s);
    }
    const dropped = new Set(drops);
    const doc = { version: LIST_VERSION, servers: servers.filter((s) => !dropped.has(serverKey(s))), own: own !== undefined ? own : (list && list.own) || [] };
    const offer = cursorOffer !== undefined ? cursorOffer : list && list.cursorOffer;
    if (offer === 'declined') doc.cursorOffer = 'declined';
    return doc;
}

const same = deepEqual;

// Writes `doc` over `file`, `read` being readList(file) as the plan or apply found it. -> { ok, detail }
export function writeList(file, doc, read)
{
    if (read && (read.state === 'newer' || read.state === 'unreadable'))
        return { ok: true, detail: `${read.note.replace(/ - read as empty$/, '')} - left as it is; ${read.state === 'newer' ? 'update preferred-tools' : 'check its permissions'}, then run the command again` };
    const servers = doc.servers || [];
    const own = doc.own || [];
    if (!servers.length && !own.length)
    {
        if (!read) return { ok: true, detail: `${file}: no server is listed - nothing to write` };
        if (read.state) return { ok: true, detail: `${read.note.replace(/ - read as empty$/, '')} - not this plugin's list, left as it is` };
        fs.rmSync(file, { force: true });
        return { ok: true, detail: `removed ${file} - no server is listed` };
    }
    const out = { version: LIST_VERSION, servers, own };
    if (doc.cursorOffer === 'declined') out.cursorOffer = 'declined';
    if (read && !read.state && same(out, { version: read.version, servers: read.servers, own: read.own, ...(read.cursorOffer ? { cursorOffer: read.cursorOffer } : {}) }))
        return { ok: true, detail: `${file} already holds these servers - left as it is` };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let bak = null;
    if (read && read.state === 'bad' && fs.existsSync(file)) { bak = `${file}.bak`; fs.copyFileSync(file, bak); }
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(out, null, 2)}\n`);
    fs.renameSync(tmp, file);
    const n = servers.length;
    return { ok: true, detail: `wrote ${file} (${n} server${n === 1 ? '' : 's'})${bak ? ` - the old file kept as ${bak}` : ''}` };
}

// The value a token field holds, from its template: '${VAR}' -> the whole value, 'Bearer ${VAR}' -> what follows.
function valueOf(entry, field, tokenVar)
{
    const v = field.at.reduce((o, k) => (o == null ? undefined : o[k]), entry);
    if (typeof v !== 'string') return null;
    const [before, after] = field.template.split(`\${${tokenVar}}`);
    if (after === undefined || !v.startsWith(before) || !v.endsWith(after)) return null;
    return v.slice(before.length, v.length - after.length);
}

// A list item from a registration as read: `entry` kept (every key value the kept marker), `key` the variable a stdio key
// field holds, named by the key files that hold its value when given (`files`, keys.stdioChain's), else the route's own
// variable; null when the entry holds no key field.
export function fromRegistration(reg, row, clients, files = [])
{
    const route = row && row.routes ? row.routes[reg.route] : null;
    let key = null;
    const fields = keys.tokenFields(reg.entry, route);
    if (fields.length)
    {
        const value = valueOf(reg.entry, fields[0], route.tokenVar);
        key = (value && keys.nameOfValue(files, value)) || route.tokenVar;
    }
    return { name: reg.name, scope: reg.scope, row: row ? row.id : null, route: reg.route, clients: clients.slice(), entry: kept.keep(reg.entry, row), key };
}

// ---- the 0.4.x record, <root>/preferred-tools.json -------------------------------------------------------------------
// Read only: the servers the user left on their own until list-import moves them into a list's `own` (0.5.0). Moved here
// from roots.js unchanged, under the names the list's code reads them by.

export const OLD_RECORD_VERSION = 1;
const pathFor = (platform) => (platform === 'win32' ? path.win32 : path.posix);
const versionNote = (file, version, current) => (newerOrBad(version) === 'newer' ? `${file} is version ${version}, newer than this plugin's ${current}` : `${file} is version ${JSON.stringify(version)}, not ${current}`);

// Where the commands look for the record (D6): the mapped root, the two standard folders, then every root a managed
// registration points into.
export function oldRecordFiles(inv, family, ctx)
{
    const P = pathFor(ctx.platform);
    const map = (inv.roots && inv.roots.map) || { projects: {} };
    const mapped = family === 'global' ? map.global : (Object.keys(map.projects || {}).length ? map.projects[roots.mapKey(ctx.project)] : null);
    const order = family === 'global' ? roots.standard('global', ctx) : [...roots.standard('project', ctx)].reverse();
    const dirs = [mapped, ...order.map((s) => s.root), ...roots.registrationRoots(inv, family, ctx)].filter(Boolean);
    return [...new Set(dirs)].map((d) => P.join(d, roots.FILES.record));
}

// The record file. Missing: null. Malformed or another version: empty with a note and its state. Never throws.
export function readOldRecord(file)
{
    let text;
    try { text = fs.readFileSync(file, 'utf8'); }
    catch (err) { return err.code === 'ENOENT' || err.code === 'ENOTDIR' ? null : { version: OLD_RECORD_VERSION, servers: [], note: `${file} cannot be read (${err.code}) - read as empty`, state: 'unreadable' }; }
    let doc;
    try { doc = JSON.parse(text); }
    catch { return { version: OLD_RECORD_VERSION, servers: [], note: `${file} is not JSON - read as empty`, state: 'bad' }; }
    if (doc && typeof doc === 'object' && doc.version !== OLD_RECORD_VERSION && newerOrBad(doc.version) === 'newer')
        return { version: OLD_RECORD_VERSION, servers: [], note: `${versionNote(file, doc.version, OLD_RECORD_VERSION)} - read as empty`, state: 'newer' };
    if (!doc || typeof doc !== 'object' || doc.version !== OLD_RECORD_VERSION || !Array.isArray(doc.servers))
        return { version: OLD_RECORD_VERSION, servers: [], note: `${file} is version ${JSON.stringify(doc && doc.version)} or has no servers list - read as empty`, state: 'bad' };
    return { version: OLD_RECORD_VERSION, servers: doc.servers.filter((s) => s && typeof s === 'object') };
}

// The own entries with this run's merged in (D6). An entry replaces the one with its key, in place; a new key is
// appended. Then an entry is dropped when its server is gone: a server's key missing from `live.servers`, or there with
// another fingerprint (null: present, not compared); a connector only when `live.connectors` is a list that lacks it -
// a run that did not pass the connectors keeps every one (R14). An entry of no known shape is dropped.
// live: { servers: { <key>: fingerprint | null }, connectors: string[] | null }
export function mergeOwn(record, entries, live)
{
    const out = [];
    const at = new Map();
    for (const e of [...((record && record.servers) || []), ...(entries || [])])
    {
        const key = roots.recordKey(e);
        if (!key) continue;
        if (at.has(key)) out[at.get(key)] = e;
        else { at.set(key, out.length); out.push(e); }
    }
    const servers = (live && live.servers) || {};
    const connectors = live && Array.isArray(live.connectors) ? live.connectors : null;
    const kept = out.filter((e) =>
    {
        if (typeof e.connector === 'string') return !connectors || connectors.includes(e.connector);
        const key = roots.recordKey(e);
        if (!Object.hasOwn(servers, key)) return false;
        return servers[key] === null || deepEqual(servers[key], e.fingerprint);
    });
    return { version: OLD_RECORD_VERSION, servers: kept };
}

// The own entries a list-write step leaves (recordClean's rules of 0.4.x): `keep` as it is, then the `entries` a server
// still has (a key in both takes the entries one), the servers left on their own only.
export function ownOf({ entries, keep, live })
{
    const fresh = roots.ownOnly(mergeOwn({ servers: [] }, entries, live).servers);
    const keys = new Set(fresh.map(roots.recordKey));
    return [...roots.ownOnly(keep).filter((e) => !keys.has(roots.recordKey(e))), ...fresh];
}

