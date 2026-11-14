'use strict';
// CURSOR'S FILES - <project>/.cursor/mcp.json and ~/.cursor/mcp.json, written from the lists (spec D2, 0.5.0). Cursor has
// no CLI that adds a server, so this is the one writer of those files besides the user: it replaces only the names it
// manages, keeps every other entry with its keys and values in their order, and refuses a file it does not recognise -
// a symbolic link, text that is not JSON (comments and trailing commas included), or no mcpServers object - writing
// nothing. A write goes through a temporary file and a rename, and is read back.
const fs = require('node:fs');
const path = require('node:path');
const account = require('../core/account.js');
const lists = require('../mcps-list/mcps-list.js');
const { stripBom, deepEqual } = require('../core/json-file.js');
const { bridgeParts, helperParts } = require('../entries/entry.js');
const kept = require('../core/kept.js');
const keys = require('../keys/keys.js');

const pathFor = (platform) => (platform === 'win32' ? path.win32 : path.posix);

// The Cursor file of a scope family: the project's for project and local scope, the home's for user scope.
function fileFor(family, ctx)
{
    const P = pathFor(ctx.platform);
    return family === 'global' ? P.join(ctx.home || account.homeDir(ctx.env || process.env), '.cursor', 'mcp.json') : P.join(ctx.project, '.cursor', 'mcp.json');
}

// -> { state: 'absent' | 'ok' | 'symlink' | 'bad' | 'shape', doc, eol }
function readCursor(file)
{
    let st;
    try { st = fs.lstatSync(file); }
    catch (err) { return err.code === 'ENOENT' || err.code === 'ENOTDIR' ? { state: 'absent', doc: { mcpServers: {} }, eol: '\n' } : { state: 'bad', doc: null, eol: '\n', error: err.code }; }
    if (st.isSymbolicLink()) return { state: 'symlink', doc: null, eol: '\n' };
    let text;
    try { text = fs.readFileSync(file, 'utf8'); }
    catch (err) { return { state: 'bad', doc: null, eol: '\n', error: err.code }; }
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    let doc;
    try { doc = JSON.parse(stripBom(text)); }
    catch { return { state: 'bad', doc: null, eol }; }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc) || !doc.mcpServers || typeof doc.mcpServers !== 'object' || Array.isArray(doc.mcpServers)) return { state: 'shape', doc, eol };
    return { state: 'ok', doc, eol, text };
}

// Why a file is left as it is, or null when it can be written.
function refusal(read)
{
    if (read.state === 'symlink') return 'is a symbolic link - preferred-tools writes no file through a link; replace it with the file itself';
    if (read.state === 'bad') return read.error ? `cannot be read (${read.error})` : 'is not JSON (Cursor reads comments and trailing commas, preferred-tools does not) - remove them, then run the command again';
    if (read.state === 'shape') return 'has no mcpServers object - not a file preferred-tools recognises';
    return null;
}

// The servers this file holds from the lists: those set up for Cursor, the nearest list first. `lists`: [{ file,
// scopes, servers }] - the family's own list (local and project scope; local wins one name) and, for a project, the
// lists above it (project scope only). -> Map<name, { entry, scope, list, row }>
function managedSet(sources)
{
    const out = new Map();
    for (const src of sources)
    {
        const rank = (s) => (s.scope === 'local' ? 0 : 1);
        const mine = (src.servers || []).filter((s) => (s.clients || []).includes('cursor') && (src.scopes || []).includes(s.scope)).sort((a, b) => rank(a) - rank(b));
        for (const s of mine) if (!out.has(s.name)) out.set(s.name, { entry: s.cursorEntry || s.entry, scope: s.scope, list: src.file, row: s.row, route: s.route, key: s.key || null });
    }
    return out;
}

// The file's document with the managed servers in place: a name in `before` the set no longer holds goes, a `skip` name
// keeps the file's own value (or stays out when the file lacks it), the managed names come first in catalog.order and
// the user's after them in their order.
// Every other top-level key keeps its place and value.
function compose(doc, managed, { before = [], skip = [], order = [] } = {})
{
    const servers = (doc && doc.mcpServers) || {};
    const at = (name) => { const i = order.indexOf((managed.get(name) || {}).row); return i < 0 ? order.length : i; };
    const names = [...managed.keys()].sort((a, b) => at(a) - at(b));
    const next = {};
    for (const name of names)
    {
        // a skipped name keeps the file's own value, and one the file lacks stays out (spec D1: never re-added)
        if (!skip.includes(name)) next[name] = managed.get(name).entry;
        else if (Object.hasOwn(servers, name)) next[name] = servers[name];
    }
    for (const [name, value] of Object.entries(servers))
    {
        if (Object.hasOwn(next, name)) continue;
        if (before.includes(name) && !skip.includes(name)) continue;
        next[name] = value;
    }
    const base = doc && typeof doc === 'object' ? doc : {};
    const out = Object.hasOwn(base, 'mcpServers') ? {} : { mcpServers: next };
    for (const [k, v] of Object.entries(base)) out[k] = k === 'mcpServers' ? next : v;
    return out;
}

const textOf = (doc, eol) => `${JSON.stringify(doc, null, 2)}\n`.replace(/\n/g, eol);

// The cursor-write step: the managed set from its lists, composed into the file, written, read back.
// step: { file, family, lists: [{ file, scopes }], before, skip, replace, only? }. A name the file holds as the user's own
// (not in `before`) is replaced only when `replace` names it.
function cursorWrite(step, ctx)
{
    const read = readCursor(step.file);
    const why = refusal(read);
    if (why) return { ok: false, detail: `${step.file} ${why} - left as it is` };
    const sources = (step.lists || []).map((l) => ({ file: l.file, scopes: l.scopes, servers: ((l.file && lists.readList(l.file)) || { servers: [] }).servers }));
    const managed = managedSet(sources);
    const notes = fillStdioKeys(managed, ctx);
    const servers = read.doc.mcpServers;
    const before = step.before || [];
    const theirs = [...managed.keys()].filter((n) => Object.hasOwn(servers, n) && !before.includes(n) && !(step.replace || []).includes(n));
    // `only`: the names this write may change (fix's client-drift); every other managed name keeps the file's value
    const others = step.only ? [...managed.keys()].filter((n) => !step.only.includes(n)) : [];
    const skip = [...new Set([...(step.skip || []), ...theirs, ...others])];
    const order = (ctx && ctx.catalog && ctx.catalog.order) || [];
    const doc = compose(read.doc, managed, { before, skip, order });
    const text = textOf(doc, read.eol);
    const said = notes.length ? `; ${notes.join('; ')}` : '';
    if (read.state === 'ok' && read.text === text) return { ok: true, detail: `${step.file} already holds these servers - left as it is${said}` };
    fs.mkdirSync(path.dirname(step.file), { recursive: true });
    const tmp = `${step.file}.${process.pid}.tmp`;
    // the file's own mode is kept: ~/.cursor/mcp.json can hold a stdio route's key (D6), and a user's 0600 stays 0600
    let mode;
    try { mode = fs.statSync(step.file).mode & 0o777; } catch { /* a new file takes the default */ }
    fs.writeFileSync(tmp, text, mode === undefined ? undefined : { mode });
    if (mode !== undefined) fs.chmodSync(tmp, mode);
    fs.renameSync(tmp, step.file);
    const back = readCursor(step.file);
    const wrong = back.state !== 'ok' ? [...managed.keys()] : [...managed.keys()].filter((n) => !skip.includes(n) && !deepEqual(back.doc.mcpServers[n], managed.get(n).entry));
    if (wrong.length) return { ok: false, detail: `${step.file}: ${wrong.join(', ')} did not read back as written` };
    const kept = theirs.length ? ` - ${theirs.join(', ')} left as your own` : '';
    return { ok: true, detail: `wrote ${step.file} (${managed.size - theirs.length} server${managed.size - theirs.length === 1 ? '' : 's'} from the list)${kept}${said}` };
}

// ---- stdio routes that hold their key (spec D6) -----------------------------------------------------------------------

// Does this entry carry its key in the registration? The rule, not a list: the route has a tokenVar and the entry holds
// a field keys.tokenFields reads (github's Docker route, sentry's npm route, context7 local with --api-key).
function stdioKeyed(entry, row, routeId)
{
    const route = row && row.routes ? row.routes[routeId] : null;
    return Boolean(route && route.tokenVar && keys.tokenFields(entry, route).length);
}

// At user scope a stdio keyed entry goes into ~/.cursor/mcp.json with its value, from the global root's .mcps-secrets
// (the list's own folder) under the list's key name, as apply's fillStep writes ~/.claude.json's copy; the list keeps
// kept.MARKER. When the key files lack it - a 0.2.x/0.3.x key kept in the registration, the old key files read for
// names only - the value comes from Claude Code's registration as read, beside which Cursor's copy sits (D6). With
// neither, the name is written empty, with fillStep's note. Changes `managed` in place. -> [note]
function fillStdioKeys(managed, ctx)
{
    const catalog = (ctx && ctx.catalog) || require('../catalog/catalog.js').load();
    const notes = [];
    for (const [name, m] of managed)
    {
        if (m.scope !== 'user' || !m.key || !m.list) continue;
        const row = catalog.byId.get(m.row);
        if (!stdioKeyed(m.entry, row, m.route)) continue;
        const files = keys.stdioChain({ scope: 'user', globalRoot: path.dirname(m.list) });
        const found = keys.valueIn(files, m.key);
        const route = row.routes[m.route];
        if (!found)
        {
            const reg = ctx && ctx.env ? account.readRegistration(name, 'user', ctx.project || process.cwd(), ctx.env) : undefined;
            const back = reg ? kept.restore(m.entry, reg, row) : null;
            const filled = back && !back.error ? keys.tokenFields(back.entry, route).map((f) => keys.valueAt(back.entry, f.at)) : [];
            if (filled.length && filled.every((v) => typeof v === 'string' && v.trim() && !v.includes(kept.MARKER))) { managed.set(name, { ...m, entry: back.entry }); continue; }
        }
        managed.set(name, { ...m, entry: keys.fillKeys(m.entry, row, m.route, 'user', { [route.tokenVar]: found ? found.value : '' }) });
        if (!found) notes.push(`${m.key} for '${name}' (user) is in none of ${files.join(', ')} - written empty: fill ${m.key} in ${files[0]}, then run /preferred-tools:configure and keep ${m.key} as the key's name - it writes the key in`);
    }
    return notes;
}

// Is this Cursor entry the row's server? A bridge copy (D5) is matched by its URL, as a plain http entry, against the
// row's fingerprints, and by itself against a `bridge` fingerprint: inventory.matchesFingerprint alone returns false for
// every bridge entry against a host or path fingerprint. inventory.js requires this file, so it is required here, late.
function matchesRow(entry, row)
{
    const { matchesFingerprint } = require('../inventory/inventory.js');
    const fps = Object.values((row && row.routes) || {}).flatMap((r) => r.fingerprints || []);
    const bridge = bridgeParts(entry);
    if (!bridge) return fps.some((f) => matchesFingerprint(entry, f));
    const asHttp = { type: 'http', url: bridge.template };
    return fps.some((f) => (f.bridge ? matchesFingerprint(entry, f) : matchesFingerprint(asHttp, f)));
}

// The Cursor file of a family as the inventory gives it: its state, every name it holds, and the entries of the names
// its list marks for Cursor, kept (every key value the marker) - what update and drift read Cursor's copy from.
// `marked`: [{ name, row }] -> { file, state, names, entries }
function cursorOf(file, marked, catalog)
{
    const read = readCursor(file);
    const servers = read.state === 'ok' ? read.doc.mcpServers : {};
    const entries = {};
    for (const m of marked)
        if (Object.hasOwn(servers, m.name) && !Object.hasOwn(entries, m.name)) entries[m.name] = kept.keep(servers[m.name], catalog.byId.get(m.row));
    return { file, state: read.state, names: Object.keys(servers), entries };
}

// ---- hosted keyed routes: two forms (spec D5) -------------------------------------------------------------------------

// The headers an entry sends besides the helper's: Cursor's bridge has no place for them.
const otherHeaders = (entry) => Object.keys((entry && entry.headers) || {});

// Cursor's copy of a hosted keyed entry: Cursor runs no headersHelper (F5), so it gets the bridge, which sends the key
// (F6) - `node <root>/mcp-bridge.js <url> <NAME> <SCHEME> mcp-remote@<pin> [<global root>]`, the object buildEntry makes
// for sentry's bridge route. The URL, the helper's arguments and the bridge path come from `entry`; a `prior` bridge
// copy (the list's cursorEntry, or Cursor's copy as read) keeps its pin, its cut-off and every env pair and argument the
// form does not set, so a pin update moved or an edit the user kept survives a Claude-side rewrite. -> entry | null
function bridgeFormOf(entry, catalog, prior = null)
{
    if (!entry || typeof entry.headersHelper !== 'string' || otherHeaders(entry).length) return null;
    const h = helperParts(entry.headersHelper);
    if (!h || h.args.length < 2) return null;
    const P = /^(?:[A-Za-z]:[\\/]|\\\\)/.test(h.path) ? path.win32 : path.posix;
    const own = [P.join(P.dirname(h.path), 'mcp-bridge.js'), entry.url, h.args[0], h.args[1]];
    const globalRoot = h.args[2] ? [h.args[2]] : [];
    const pp = prior ? bridgeParts(prior) : null;
    if (pp && pp.pkg)
    {
        const at = prior.args.findIndex((a) => String(a) === pp.path);
        const rest = pp.globalRoot !== null ? prior.args.slice(at + 6) : [];
        return { ...prior, command: 'node', args: [...prior.args.slice(0, at), ...own, pp.pkg, ...globalRoot, ...rest], env: { ...(prior.env || {}) } };
    }
    const p = catalog.byId.get('sentry').routes.bridge.package;
    return { command: 'node', args: [...own, `${p.name}@${p.version}`, ...globalRoot], env: { npm_config_before: p.cutoff } };
}

// Is Cursor on this machine (spec D3)? `~/.cursor` exists, `cursor-agent` or `cursor` is on PATH (with .exe or .cmd on
// Windows), or a list already sets a server up for Cursor. Bare `agent` does not count: the name is too common.
function cursorFound(ctx, inv)
{
    const P = pathFor(ctx.platform);
    const env = ctx.env || {};
    const home = ctx.home || account.homeDir(env);
    if (home && fs.existsSync(P.join(home, '.cursor'))) return true;
    const exts = ctx.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
    const dirs = String(env.PATH || env.Path || '').split(ctx.platform === 'win32' ? ';' : ':').filter(Boolean);
    for (const dir of dirs) for (const name of ['cursor-agent', 'cursor']) for (const ext of exts) if (fs.existsSync(P.join(dir, `${name}${ext}`))) return true;
    return ['project', 'global'].some((f) => { const l = inv && inv.lists && inv.lists[f]; return Boolean(l) && (l.servers || []).some((x) => (x.clients || []).includes('cursor')); });
}

module.exports = { fileFor, readCursor, refusal, managedSet, compose, cursorWrite, matchesRow, cursorOf, cursorFound, bridgeFormOf, otherHeaders, stdioKeyed };
