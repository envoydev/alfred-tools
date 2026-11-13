'use strict';
// THE LIST - <root>/mcps.json (spec D1, 0.5.0). One per scope family's root folder: every server the plugin manages in
// that family, the apps each one is written to, and the servers the user left on their own (`own`, the record's entries
// unchanged). Read and written only here. A server's entry never holds a key value: a stdio key field holds kept.MARKER
// and `key` names its variable in .mcps-secrets.
//
// The write follows the record's rules (D8 of 0.2.0): a temporary file then a rename; an unchanged list is not rewritten;
// a list from a newer version, or one that cannot be read, is never replaced; a file that is not JSON is kept as
// <file>.bak first; the file goes when both arrays are empty. apply.js's own helpers are not required here, since
// apply.js requires the planner, which requires this module.
const fs = require('node:fs');
const path = require('node:path');
const roots = require('./roots.js');
const keys = require('./keys.js');
const kept = require('./kept.js');

const LIST_VERSION = 1;

const newerOrBad = (version) => (typeof version === 'number' && version > LIST_VERSION ? 'newer' : 'bad');
const empty = (file, note, state) => ({ version: LIST_VERSION, servers: [], own: [], note: `${file} ${note} - read as empty`, state });

// The list file. Missing: null. Unreadable, not JSON, another version or another shape: empty with a note and its state
// (roots.readRecord's meanings). Never throws.
function readList(file)
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

const listFile = (root) => path.join(root, roots.FILES.list);

// Where the commands look for a family's list: roots.recordFiles' folders, in its order, with the list's name.
function listFiles(inv, family, ctx)
{
    const P = ctx.platform === 'win32' ? path.win32 : path.posix;
    return roots.recordFiles(inv, family, ctx).map((f) => P.join(P.dirname(f), roots.FILES.list));
}

const serverKey = (s) => `mcp:${s.name}~${s.scope}`;

// The registration a plan step leaves in place: a move's destination, else its own name and scope. null for a step that
// is no registration step.
function regKey(step)
{
    if (!step || typeof step.op !== 'string' || !step.op.startsWith('mcp-')) return null;
    if (step.op === 'mcp-move' && step.to) return `mcp:${step.to.name}~${step.to.scope}`;
    return typeof step.name === 'string' && typeof step.scope === 'string' ? `mcp:${step.name}~${step.scope}` : null;
}

// The list with this plan's changes: each upsert replaces the server with its key in place or is appended, each drop
// removes its key, `own` (roots.ownOnly's result) replaces the own entries when given, and `cursorOffer` is set when
// given. -> a new doc
function mergeList(list, { upserts = [], drops = [], own, cursorOffer } = {})
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

function sortKeys(v)
{
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
    return v;
}
const same = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));

// Writes `doc` over `file`, `read` being readList(file) as the plan or apply found it. -> { ok, detail }
function writeList(file, doc, read)
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
function fromRegistration(reg, row, clients, files = [])
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

module.exports = { LIST_VERSION, readList, listFile, listFiles, serverKey, regKey, mergeList, writeList, fromRegistration };
