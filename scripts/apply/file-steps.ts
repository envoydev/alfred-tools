// @ts-nocheck - typed in Task 11
// The file steps of an apply (spec D2-D4, D6, D8): each skips what is in place.
import fs from 'node:fs';
import path from 'node:path';
import { stripBom } from '../core/json-file.ts';
import * as keys from '../keys/keys.ts';
import * as catalogLib from '../catalog/catalog.ts';
import * as roots from '../roots/roots.ts';
import * as lists from '../mcps-list/mcps-list.ts';
import * as cursorMcp from '../cursor/cursor-mcp.ts';
import { readRegistration, rowOf } from './cli-steps.ts';
import { HELPER_VERSION } from '../copied/mcp-headers.js';
import { BRIDGE_VERSION } from '../copied/mcp-bridge.js';

// ---- the file steps (spec D2-D4, D6, D8): each skips what is in place, so a re-run after a failed add writes nothing again

// A text file's line ending, and the text with each line appended in it; existing bytes are never rewritten.
const eolOf = (text) => (/\r\n/.test(text) ? '\r\n' : '\n');
const appendLines = (text, lines) => { const eol = eolOf(text); return `${text}${text && !/\r?\n$/.test(text) ? eol : ''}${lines.map((l) => `${l}${eol}`).join('')}`; };

// What the plugin itself writes in a root (R13): a folder holding anything else holds the user's files. package.json is the
// one ensureCommonjs writes (0.4.0 Ruling 12).
const PLUGIN_FILES = new Set(['.gitignore', 'package.json', ...Object.values(roots.FILES), ['.', 'secrets'].join(''), `${roots.FILES.record}.0.4.bak`, `${roots.FILES.list}.bak`]);
function pluginWritten(root, name)
{
    if (PLUGIN_FILES.has(name)) return true;
    try { return fs.readFileSync(path.join(root, name, '.gitignore'), 'utf8').trim() === '*'; }
    catch { return false; }
}

// What rootIgnore would do in `root`, read only: { file, text (null when absent), mine, want, lack } - `mine` false for a
// folder holding the user's own files.
export function rootIgnoreLines(root)
{
    let names = [];
    try { names = fs.readdirSync(root); } catch { /* a new root */ }
    const mine = names.every((n) => pluginWritten(root, n));
    const want = mine ? roots.GITIGNORE.trim().split('\n') : [roots.FILES.secrets, roots.FILES.record, roots.FILES.list, `${roots.FILES.signIns}/`];
    const file = path.join(root, '.gitignore');
    let text = null;
    try { text = fs.readFileSync(file, 'utf8'); } catch { /* absent */ }
    const have = new Set((text || '').split(/\r?\n/).map((l) => l.trim()));
    return { file, text, mine, want, lack: want.filter((l) => !have.has(l)) };
}

// <root>/.gitignore: GITIGNORE when absent, else each of its lines the file lacks appended; in a folder holding the
// user's own files, only the key file and the record - never `*`, so their files stay visible to git. Never under .alfred.
export function rootIgnore(root)
{
    if (path.basename(root) === '.alfred') return { ok: true, detail: `${root} is alfred-code's - its own .gitignore covers it; nothing written` };
    const { file, text, want, lack } = rootIgnoreLines(root);
    if (text === null)
    {
        fs.mkdirSync(root, { recursive: true });
        fs.writeFileSync(file, appendLines('', want));
        return { ok: true, detail: `wrote ${file} (${want.join(', ')})` };
    }
    if (!lack.length) return { ok: true, detail: `${file} has every line it needs - left as it is` };
    fs.writeFileSync(file, appendLines(text, lack));
    return { ok: true, detail: `appended ${lack.join(', ')} to ${file}` };
}

// <root>/package.json, {"type":"commonjs"}, when absent (0.4.0 Ruling 12): a package.json above the root that says
// "type": "module" would load mcp-headers.js and mcp-bridge.js as ES modules, where `require` does not exist. One that is
// there is never changed; a "module" one is named. -> { wrote, note }
export function ensureCommonjs(root)
{
    const file = path.join(root, 'package.json');
    let text = null;
    try { text = fs.readFileSync(file, 'utf8'); } catch { /* absent */ }
    if (text === null)
    {
        fs.mkdirSync(root, { recursive: true });
        fs.writeFileSync(file, '{"type":"commonjs"}\n');
        return { wrote: true, note: null };
    }
    let type = null;
    try { type = JSON.parse(text.replace(/^\uFEFF/, '')).type; } catch { /* not this plugin's to judge */ }
    return { wrote: false, note: type === 'module' ? `${file} says "type": "module" - mcp-headers.js and mcp-bridge.js cannot load there; set it to "commonjs", or remove it` : null };
}

// A file this plugin copies into a root - <root>/mcp-headers.js (D4) or <root>/mcp-bridge.js (0.4.0): copied when absent
// or its number is lower; a hand edit or a newer copy is left. package.json beside it either way.
const SHIPPED = {
    helper: { word: 'helper', version: () => HELPER_VERSION },
    bridge: { word: 'bridge', version: () => BRIDGE_VERSION },
    // serena's context (D7): YAML, so no package.json beside it
    serenaContext: { word: 'context', version: () => roots.SERENA_CONTEXT_VERSION, plain: true },
};
export function writeShipped(kind, root)
{
    const file = path.join(root, roots.FILES[kind]);
    const { state, number } = roots.shippedState(kind, file);
    const { word, version, plain } = SHIPPED[kind];
    if (plain) fs.mkdirSync(root, { recursive: true });
    const pkg = plain ? { wrote: false, note: null } : ensureCommonjs(root);
    const withPkg = (detail) => ({ ok: true, detail: [detail, pkg.wrote ? `wrote ${path.join(root, 'package.json')} (type commonjs)` : null, pkg.note].filter(Boolean).join('; ') });
    if (state === 'same') return withPkg(`${file} is up to date - left as it is`);
    if (state === 'higher') return withPkg(`${roots.FILES[kind]} in ${root} is newer than this plugin - update preferred-tools`);
    if (state === 'edited') return withPkg(`${file} changed since preferred-tools wrote it - left; /preferred-tools:fix rewrites it`);
    fs.writeFileSync(file, roots.shippedSource(kind));
    return withPkg(state === 'lower' ? `rewrote ${file} (${word} ${number} -> ${version()})` : `wrote ${file} (${word} ${version()})`);
}
export const writeHelper = (root) => writeShipped('helper', root);

// The key file's names (D3): created with its comment line, readable by its owner only; `NAME=` appended for each name it
// lacks. Its values are never read out of this process, and no line is rewritten. Refused where git would commit it.
const KEY_HEAD = '# preferred-tools MCP keys - fill in each value; this file is never committed';
export function ensureKeyName(file, names)
{
    if (roots.gitIgnores(file) === false) return { ok: false, detail: `git would commit ${file} - not written; /preferred-tools:fix (root-ignore) covers it` };
    let buf = null;
    try { buf = fs.readFileSync(file); } catch { /* absent */ }
    // a UTF-16 file (Windows PowerShell 5.1's `>`) is read by both readers but never appended to in UTF-8: the user adds the
    // line, as the plan's Key: line says, and the apply goes on
    if (buf && buf[0] === 0xff && buf[1] === 0xfe) return { ok: true, detail: `${file} is UTF-16 - add ${names.map((n) => `${n}=`).join(', ')} to it yourself; nothing written` };
    const text = buf ? buf.toString('utf8') : null;
    const have = new Set(keys.namesIn(file));
    const lack = [...new Set(names)].filter((n) => !have.has(n));
    const list = lack.map((n) => `${n}=`).join(', ');
    if (text === null)
    {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, appendLines('', [KEY_HEAD, ...lack.map((n) => `${n}=`)]), process.platform === 'win32' ? {} : { mode: 0o600 });
        return { ok: true, detail: `created ${file} with ${list || 'no name'} - names only, you fill in each value` };
    }
    if (!lack.length) return { ok: true, detail: `${file} has ${names.join(', ')} - left as it is` };
    fs.writeFileSync(file, appendLines(text, lack.map((n) => `${n}=`)));
    return { ok: true, detail: `appended ${list} to ${file} - names only, you fill in each value` };
}

// A record or map read as empty that a write must not replace: a later version's, or one that cannot be opened.
// -> null | { ok, detail }
function keepAsIs(read)
{
    if (!read || (read.state !== 'newer' && read.state !== 'unreadable')) return null;
    const what = read.note.replace(/ - read as empty$/, '');
    return { ok: true, detail: `${what} - left as it is; ${read.state === 'newer' ? 'update preferred-tools' : 'check its permissions'}, then run the command again` };
}

// A JSON file written whole: through a temporary file and a rename, so a stop midway never leaves half a file. A file
// read as 'bad' (not JSON, not this shape) is kept as <file>.bak first. -> the .bak path | null
function writeJson(file, doc, read)
{
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let bak = null;
    if (read && read.state === 'bad' && fs.existsSync(file)) { bak = `${file}.bak`; fs.copyFileSync(file, bak); }
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`);
    fs.renameSync(tmp, file);
    return bak;
}
const readNote = (read, bak) => (read && read.note ? ` - ${read.note}${bak ? `; the old file kept as ${bak}` : ''}` : '');

// <root>/mcps.json as the plan computed it (spec D1): each upsert whose registration step was applied (`after` in
// report.appliedKeys, or none), its entry the registration as read back through kept.keep; each drop whose step was
// applied; the own entries by the 0.4.x record's rules (mcpsList.ownOf), or the list's own as it is. A family with no list
// yet carries its 0.4.x record's own entries. After a failure (`failure`), cursor comes off a server whose Cursor file
// was not written. Never names a key value: a stdio key field holds kept.MARKER.
export function listWrite(step, ctx, { failure = false } = {})
{
    const read = lists.readList(step.file);
    let base = read;
    if (!read)
    {
        const old = lists.readOldRecord(path.join(path.dirname(step.file), roots.FILES.record));
        base = old && !old.state ? { servers: [], own: roots.ownOnly(old.servers) } : null;
    }
    const applied = (ctx.report && ctx.report.appliedKeys) || new Set();
    const cursorDone = (ctx.report && ctx.report.cursorFiles) || new Set();
    const upserts = [];
    for (const u of step.upserts || [])
    {
        if (u.after && !applied.has(u.after)) continue;
        let server = { ...u.server };
        if (u.after)
        {
            const got = readRegistration(server.name, server.scope, ctx.project, ctx.env);
            if (!got) continue;
            server = { ...server, ...lists.fromRegistration({ name: server.name, scope: server.scope, route: server.route, entry: got }, rowOf(ctx, server), server.clients || ['claude'], u.keyFiles || []) };
        }
        if (failure && u.cursorFile && !cursorDone.has(u.cursorFile)) server.clients = (server.clients || []).filter((c) => c !== 'cursor');
        // Cursor's copy of a two-form entry (D5): the bridge built from Claude's entry as read back, keeping the prior
        // copy's pin and the pairs it does not set; the form itself is the plan's, never stored
        const { form } = server;
        delete server.form;
        const forCursor = (server.clients || []).includes('cursor');
        if (form === 'two' && forCursor)
        {
            const prior = server.cursorEntry || (((base && base.servers) || []).find((x) => lists.serverKey(x) === lists.serverKey(server)) || {}).cursorEntry || null;
            const copy = cursorMcp.bridgeFormOf(server.entry, ctx.catalog || catalogLib.load(), prior);
            if (copy) server.cursorEntry = copy;
            else delete server.cursorEntry;
        }
        else if (form !== undefined || !forCursor) delete server.cursorEntry;
        upserts.push(server);
    }
    const drops = (step.drops || []).filter((d) => !d.after || applied.has(d.after)).map((d) => d.key);
    const doc = lists.mergeList(base, { upserts, drops, own: step.own ? lists.ownOf(step.own) : undefined, cursorOffer: step.cursorOffer });
    return lists.writeList(step.file, doc, read);
}

// The read guard (ruling 13): each rule permissions.deny lacks, appended in Claude Code's settings file - every other key,
// value and order kept, written through a temporary file and a rename. An absent file reads as {}; one that is not a JSON
// object is left as it is. -> { ok, detail, unchanged? }
export function denyRead(file, rules)
{
    let text = null;
    try { text = fs.readFileSync(file, 'utf8'); } catch (err) { if (err.code !== 'ENOENT') return { ok: false, detail: `${file} cannot be read (${err.code}) - left as it is` }; }
    let doc = {};
    if (text !== null)
    {
        try { doc = JSON.parse(stripBom(text)); } catch { doc = null; }
        const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
        if (!isObject(doc) || (doc.permissions !== undefined && !isObject(doc.permissions)) || (doc.permissions && doc.permissions.deny !== undefined && !Array.isArray(doc.permissions.deny)))
            return { ok: false, detail: `${file} is not a settings object preferred-tools can read - left as it is; add ${rules.join(' and ')} to permissions.deny yourself` };
    }
    const deny = (doc.permissions && doc.permissions.deny) || [];
    const lack = rules.filter((r) => !deny.includes(r));
    if (!lack.length) return { ok: true, unchanged: true, detail: `${file} already denies ${rules.join(' and ')} - left as it is` };
    const next = { ...doc, permissions: { ...(doc.permissions || {}), deny: [...deny, ...lack] } };
    writeJson(file, next, null);
    return { ok: true, detail: `added ${lack.join(' and ')} to permissions.deny in ${file}` };
}

// A root's own file or folder to its new root (configure's root change, D1): renamed when the new one is absent; a file the
// new root holds with the same bytes is the same file, so the old one goes; anything else stops the apply with both named,
// before any registration moves. A folder (mcp-remote-v1, whose files are sign-in tokens) is renamed whole, never opened.
export function moveRootFile(from, to)
{
    let st;
    try { st = fs.lstatSync(from); } catch { return { ok: true, detail: `${from}: not there - nothing to move` }; }
    let there = null;
    try { there = fs.lstatSync(to); } catch { /* absent */ }
    if (!there)
    {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        try { fs.renameSync(from, to); }
        catch (err)
        {
            if (err.code !== 'EXDEV') throw err;
            fs.cpSync(from, to, { recursive: true });
            fs.rmSync(from, { recursive: true, force: true });
        }
        return { ok: true, detail: `moved ${from} to ${to}` };
    }
    if (st.isFile() && there.isFile() && fs.readFileSync(from).equals(fs.readFileSync(to)))
    {
        fs.rmSync(from);
        return { ok: true, detail: `${to} holds the same as ${from} - removed ${from}` };
    }
    return { ok: false, detail: `${to} is there already and is not ${from} - nothing moved; move or remove one of them, then run the command again` };
}

// A 0.4.x preferred-tools.json whose entries the list holds now: moved aside as <file>.0.4.bak, or .0.4.bak.2 and on
// when an earlier backup is there - never over one, so the record always leaves and list-import finds nothing next run.
export function retireRecord(file)
{
    if (!fs.existsSync(file)) return { ok: true, detail: `${file}: not there - nothing to move` };
    let to = `${file}.0.4.bak`;
    for (let n = 2; fs.existsSync(to); n++) to = `${file}.0.4.bak.${n}`;
    fs.renameSync(file, to);
    return { ok: true, detail: `moved ${file} to ${to} - its entries are in the list now` };
}

// After a stop: every list-write of the plan again, so each list holds what was applied before the stop and nothing
// after it. A failure here is reported and never masks the stop's. -> [{ ok, detail }]
export function failureLists(plan, report, ctx, log = () => {})
{
    const out = [];
    for (const step of plan.steps.filter((s) => s.op === 'list-write'))
    {
        let r;
        try { r = listWrite(step, { ...ctx, report }, { failure: true }); }
        catch (err) { r = { ok: false, detail: `${step.file}: ${err.message}` }; }
        log(`   list: ${r.detail}`);
        out.push(r);
    }
    return out;
}

// <data>/roots.json: the family's root for this project (D2). No data folder given: nothing to write (R8).
export function recordRoot(step, data)
{
    if (!data) return { ok: true, detail: `${step.family} root ${step.root}: no plugin data folder given - the root is found from its files next time` };
    const map = roots.readMap(data);
    const kept = keepAsIs(map);
    if (kept) return kept;
    const file = path.join(data, roots.FILES.map);
    const next = roots.withRoot(map, step.family, path.resolve(step.project), step.root);
    if (!map.state && fs.existsSync(file) && JSON.stringify(next) === JSON.stringify(map)) return { ok: true, detail: `${file} already names the ${step.family} root ${step.root} - left as it is` };
    const bak = writeJson(file, next, map);
    return { ok: true, detail: `recorded the ${step.family} root ${step.root} in ${file}${readNote(map, bak)}` };
}

