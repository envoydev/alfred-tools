// The file steps of an apply (spec D2-D4, D6, D8): each skips what is in place, so a re-run after a failed add writes
// nothing again.
import fs from 'node:fs';
import path from 'node:path';
import { stripBom } from '../core/json-file.ts';
import { isRecord } from '../core/shapes.ts';
import { replaceFile } from '../core/replace-file.ts';
import { ALFRED_DATA } from '../core/constants.ts';
import { errorCode, errorMessage } from '../core/guards.ts';
import * as keys from '../keys/keys.ts';
import * as catalogLib from '../catalog/catalog.ts';
import * as roots from '../roots/roots.ts';
import * as lists from '../mcps-list/mcps-list.ts';
import * as cursorMcp from '../cursor/cursor-mcp.ts';
import { readRegistration, rowOf } from './cli-steps.ts';
import { writeMinimalConfig } from './serena-config.ts';
import { GITIGNORE_ALL } from './constants.ts';
import { HELPER_VERSION } from '../copied/mcp-headers.js';
import { BRIDGE_VERSION } from '../copied/mcp-bridge.js';
import type { ListServer, McpsList } from '../mcps-list/types.ts';
import type { ShippedKind } from '../roots/types.ts';
import type { ListWriteStep, RecordRootStep, RetireShippedStep } from '../plan/types.ts';
import type { ApplyCtx, ApplyPlan, ApplyReport, StepResult } from './types.ts';

// A text file's line ending, and the text with each line appended in it; existing bytes are never rewritten.
const eolOf = (text: string): string => (/\r\n/.test(text) ? '\r\n' : '\n');
const appendLines = (text: string, lines: string[]): string => { const lineEnd = eolOf(text); return `${text}${text && !/\r?\n$/.test(text) ? lineEnd : ''}${lines.map((line) => `${line}${lineEnd}`).join('')}`; };

// What the plugin itself writes in a root (R13): a folder holding anything else holds the user's files. package.json is the
// one ensureCommonjs writes (0.4.0 Ruling 12).
const PLUGIN_FILES = new Set(['.gitignore', 'package.json', ...Object.values(roots.FILES), ['.', 'secrets'].join(''), `${roots.FILES.record}.0.4.bak`, `${roots.FILES.list}.bak`]);
function pluginWritten(root: string, name: string): boolean
{
    if (PLUGIN_FILES.has(name)) return true;
    try { return fs.readFileSync(path.join(root, name, '.gitignore'), 'utf8').trim() === '*'; }
    catch { return false; }
}

// What rootIgnore would do in `root`, read only: { file, text (null when absent), mine, want, lack } - `mine` false for a
// folder holding the user's own files.
export function rootIgnoreLines(root: string): { file: string; text: string | null; mine: boolean; want: string[]; lack: string[] }
{
    let names: string[] = [];
    try { names = fs.readdirSync(root); } catch { /* a new root */ }
    const mine = names.every((name) => pluginWritten(root, name));
    const want = mine ? roots.GITIGNORE.trim().split('\n') : [roots.FILES.secrets, roots.FILES.record, roots.FILES.list, `${roots.FILES.signIns}/`];
    const file = path.join(root, '.gitignore');
    let text: string | null = null;
    try { text = fs.readFileSync(file, 'utf8'); } catch { /* absent */ }
    const have = new Set((text || '').split(/\r?\n/).map((line) => line.trim()));
    return { file, text, mine, want, lack: want.filter((line) => !have.has(line)) };
}

// <root>/.gitignore: GITIGNORE when absent, else each of its lines the file lacks appended; in a folder holding the
// user's own files, only the key file and the record - never `*`, so their files stay visible to git. Never under .alfred.
export function rootIgnore(root: string): StepResult
{
    if (path.basename(root) === ALFRED_DATA) return { ok: true, detail: `${root} is alfred-code's - its own .gitignore covers it; nothing written` };
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
export function ensureCommonjs(root: string): { wrote: boolean; note: string | null }
{
    const file = path.join(root, 'package.json');
    let text: string | null = null;
    try { text = fs.readFileSync(file, 'utf8'); } catch { /* absent */ }
    if (text === null)
    {
        fs.mkdirSync(root, { recursive: true });
        fs.writeFileSync(file, '{"type":"commonjs"}\n');
        return { wrote: true, note: null };
    }
    let type: unknown = null;
    try { type = JSON.parse(stripBom(text)).type; } catch { /* not this plugin's to judge */ }
    return { wrote: false, note: type === 'module' ? `${file} says "type": "module" - mcp-headers.js and mcp-bridge.js cannot load there; set it to "commonjs", or remove it` : null };
}

// A file this plugin copies into a root - <root>/mcp-headers.js (D4) or <root>/mcp-bridge.js (0.4.0): copied when absent
// or its number is lower; a hand edit or a newer copy is left. package.json beside it either way.
const SHIPPED: Record<ShippedKind, { word: string; version: () => number; plain?: boolean }> = {
    helper: { word: 'helper', version: () => HELPER_VERSION },
    bridge: { word: 'bridge', version: () => BRIDGE_VERSION },
    // serena's context (D7): YAML, so no package.json beside it
    serenaContext: { word: 'context', version: () => roots.SERENA_CONTEXT_VERSION, plain: true },
};
export function writeShipped(kind: ShippedKind, root: string): StepResult
{
    const file = path.join(root, roots.FILES[kind]);
    const { state, number } = roots.shippedState(kind, file);
    const { word, version, plain } = SHIPPED[kind];
    // serena's home is made here before its data-folder step runs (which leaves a folder that exists as it is): a folder this
    // write creates gets the same .gitignore holding * so serena_config.yml, with its auth_secret, is never committed
    if (plain && !fs.existsSync(root))
    {
        fs.mkdirSync(root, { recursive: true });
        fs.writeFileSync(path.join(root, '.gitignore'), GITIGNORE_ALL);
    }
    const packageJsonResult = plain ? { wrote: false, note: null } : ensureCommonjs(root);
    const withPkg = (detail: string): StepResult => ({ ok: true, detail: [detail, packageJsonResult.wrote ? `wrote ${path.join(root, 'package.json')} (type commonjs)` : null, packageJsonResult.note].filter(Boolean).join('; ') });
    if (state === 'same') return withPkg(`${file} is up to date - left as it is`);
    if (state === 'higher') return withPkg(`${roots.FILES[kind]} in ${root} is newer than this plugin - update alfred-tools`);
    if (state === 'edited') return withPkg(`${file} changed since alfred-tools wrote it - left; /alfred-tools:fix rewrites it`);
    fs.writeFileSync(file, roots.shippedSource(kind));
    return withPkg(state === 'lower' ? `rewrote ${file} (${word} ${number} -> ${version()})` : `wrote ${file} (${word} ${version()})`);
}
// serena's settings file for a home it has not started in. A failure is a line, never a failed apply: serena's first start
// writes its own file, and the fetch step sets the key after it.
export function serenaConfigInit(file: string, home: string): StepResult
{
    try
    {
        // a home this step creates gets the .gitignore writeShipped gives one, so the file's auth_secret is never committed
        if (!fs.existsSync(home))
        {
            fs.mkdirSync(home, { recursive: true });
            fs.writeFileSync(path.join(home, '.gitignore'), GITIGNORE_ALL);
        }
        return { ok: true, detail: writeMinimalConfig(file, home).detail };
    }
    catch (error)
    {
        return { ok: true, detail: `${file} not written (${error instanceof Error ? error.message : String(error)}) - the project folder key is set after serena's first start` };
    }
}
export const writeHelper = (root: string): StepResult => writeShipped('helper', root);

// The key file's names (D3): created with its comment line, readable by its owner only; `NAME=` appended for each name it
// lacks. Its values are never read out of this process, and no line is rewritten. Refused where git would commit it.
const KEY_HEAD = '# alfred-tools MCP keys - fill in each value; this file is never committed';
export function ensureKeyName(file: string, names: string[]): StepResult
{
    if (roots.gitIgnores(file) === false) return { ok: false, detail: `git would commit ${file} - not written; /alfred-tools:fix (root-ignore) covers it` };
    let buffer: Buffer | null = null;
    try { buffer = fs.readFileSync(file); } catch { /* absent */ }
    // a UTF-16 file (Windows PowerShell 5.1's `>`) is read by both readers but never appended to in UTF-8: the user adds the
    // line, as the plan's Key: line says, and the apply goes on
    if (buffer && buffer[0] === 0xff && buffer[1] === 0xfe) return { ok: true, detail: `${file} is UTF-16 - add ${names.map((name) => `${name}=`).join(', ')} to it yourself; nothing written` };
    const text = buffer ? buffer.toString('utf8') : null;
    const have = new Set(keys.namesIn(file));
    const lack = [...new Set(names)].filter((name) => !have.has(name));
    const list = lack.map((name) => `${name}=`).join(', ');
    if (text === null)
    {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, appendLines('', [KEY_HEAD, ...lack.map((name) => `${name}=`)]), process.platform === 'win32' ? {} : { mode: 0o600 });
        return { ok: true, detail: `created ${file} with ${list || 'no name'} - names only, you fill in each value` };
    }
    if (!lack.length) return { ok: true, detail: `${file} has ${names.join(', ')} - left as it is` };
    fs.writeFileSync(file, appendLines(text, lack.map((name) => `${name}=`)));
    return { ok: true, detail: `appended ${list} to ${file} - names only, you fill in each value` };
}

// A record or map read as empty that a write must not replace: a later version's, or one that cannot be opened.
// -> null | { ok, detail }
function keepAsIs(read: { state?: undefined; note?: undefined } | { state: string; note: string } | null | undefined): StepResult | null
{
    if (!read || (read.state !== 'newer' && read.state !== 'unreadable')) return null;
    const what = read.note.replace(/ - read as empty$/, '');
    return { ok: true, detail: `${what} - left as it is; ${read.state === 'newer' ? 'update alfred-tools' : 'check its permissions'}, then run the command again` };
}

// A JSON file written whole: through a temporary file and a rename, so a stop midway never leaves half a file. A file
// read as 'bad' (not JSON, not this shape) is kept as <file>.bak first. -> the .bak path | null
function writeJson(file: string, doc: unknown, read: { state?: string | undefined } | null): string | null
{
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let backupPath: string | null = null;
    if (read && read.state === 'bad' && fs.existsSync(file)) { backupPath = `${file}.bak`; fs.copyFileSync(file, backupPath); }
    replaceFile(file, `${JSON.stringify(doc, null, 2)}\n`);
    return backupPath;
}
const readNote = (read: { note?: string | undefined } | null | undefined, backupPath: string | null): string => (read && read.note ? ` - ${read.note}${backupPath ? `; the old file kept as ${backupPath}` : ''}` : '');

// <root>/mcps.json as the plan computed it (spec D1): each upsert whose registration step was applied (`after` in
// report.appliedKeys, or none), its entry the registration as read back through kept.maskCredentials; each drop whose step was
// applied; the own entries by the 0.4.x record's rules (mcpsList.ownOf), or the list's own as it is. A family with no list
// yet carries its 0.4.x record's own entries. After a failure (`failure`), cursor comes off a server whose Cursor file
// was not written. Never names a key value: a stdio key field holds kept.MARKER.
export function listWrite(step: ListWriteStep, context: ApplyCtx, { failure = false }: { failure?: boolean } = {}): StepResult
{
    const read = lists.readList(step.file);
    let base: Omit<McpsList, 'version'> | null = read;
    if (!read)
    {
        const old = lists.readOldRecord(path.join(path.dirname(step.file), roots.FILES.record));
        base = old && !old.state ? { servers: [], own: roots.ownOnly(old.servers) } : null;
    }
    const applied = (context.report && context.report.appliedKeys) || new Set<string>();
    const cursorDone = (context.report && context.report.cursorFiles) || new Set<string>();
    const upserts: ListServer[] = [];
    for (const upsert of step.upserts || [])
    {
        if (upsert.after && !applied.has(upsert.after)) continue;
        let server = { ...upsert.server };
        if (upsert.after)
        {
            const got = readRegistration(server.name, server.scope, context.project, context.env);
            if (!got) continue;
            server = { ...server, ...lists.fromRegistration({ name: server.name, scope: server.scope, route: server.route, entry: got }, rowOf(context, server), server.clients || ['claude'], upsert.keyFiles || []) };
        }
        if (failure && upsert.cursorFile && !cursorDone.has(upsert.cursorFile)) server.clients = (server.clients || []).filter((client) => client !== 'cursor');
        // Cursor's copy of a two-form entry (D5): the bridge built from Claude's entry as read back, keeping the prior
        // copy's pin and the pairs it does not set; the form itself is the plan's, never stored
        const { form } = server;
        delete server.form;
        const forCursor = (server.clients || []).includes('cursor');
        if (form === 'two' && forCursor)
        {
            const listed = ((base && base.servers) || []).find((listServer) => lists.serverKey(listServer) === lists.serverKey(server));
            const prior = server.cursorEntry || (listed && listed.cursorEntry) || null;
            const copy = cursorMcp.bridgeFormOf(server.entry, context.catalog || catalogLib.load(), prior);
            if (copy) server.cursorEntry = copy;
            else delete server.cursorEntry;
        }
        else if (form !== undefined || !forCursor) delete server.cursorEntry;
        // the plan leaves an entry empty only for a server filled from its registration above
        const { entry } = server;
        if (entry === null) continue;
        upserts.push({ ...server, entry });
    }
    const drops = (step.drops || []).filter((drop) => !drop.after || applied.has(drop.after)).map((drop) => drop.key);
    const doc = lists.mergeList(base, { upserts, drops, own: step.own ? lists.ownOf(step.own) : undefined, cursorOffer: step.cursorOffer });
    return lists.writeList(step.file, doc, read);
}

// The read guard (ruling 13): each rule permissions.deny lacks, appended in Claude Code's settings file - every other key,
// value and order kept, written through a temporary file and a rename. An absent file reads as {}; one that is not a JSON
// object is left as it is. -> { ok, detail, unchanged? }
export function denyRead(file: string, rules: string[]): StepResult
{
    let text: string | null = null;
    try { text = fs.readFileSync(file, 'utf8'); } catch (caught) { const code = errorCode(caught); if (code !== 'ENOENT') return { ok: false, detail: `${file} cannot be read (${code}) - left as it is` }; }
    let doc: { permissions?: { deny?: string[] } } | null = {};
    if (text !== null)
    {
        try { doc = JSON.parse(stripBom(text)); } catch { doc = null; }
        const isObject = isRecord;
        if (!isObject(doc) || (doc.permissions !== undefined && !isObject(doc.permissions)) || (doc.permissions && doc.permissions.deny !== undefined && !Array.isArray(doc.permissions.deny)))
            return { ok: false, detail: `${file} is not a settings object alfred-tools can read - left as it is; add ${rules.join(' and ')} to permissions.deny yourself` };
    }
    const deny = (doc.permissions && doc.permissions.deny) || [];
    const lack = rules.filter((rule) => !deny.includes(rule));
    if (!lack.length) return { ok: true, unchanged: true, detail: `${file} already denies ${rules.join(' and ')} - left as it is` };
    const next = { ...doc, permissions: { ...(doc.permissions || {}), deny: [...deny, ...lack] } };
    writeJson(file, next, null);
    return { ok: true, detail: `added ${lack.join(' and ')} to permissions.deny in ${file}` };
}

// A root's own file or folder to its new root (configure's root change, D1): renamed when the new one is absent; a file the
// new root holds with the same bytes is the same file, so the old one goes; anything else stops the apply with both named,
// before any registration moves. A folder (mcp-remote-v1, whose files are sign-in tokens) is renamed whole, never opened.
export function moveRootFile(from: string, to: string): StepResult
{
    let fromStats: fs.Stats;
    try { fromStats = fs.lstatSync(from); } catch { return { ok: true, detail: `${from}: not there - nothing to move` }; }
    let there: fs.Stats | null = null;
    try { there = fs.lstatSync(to); } catch { /* absent */ }
    if (!there)
    {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        try { fs.renameSync(from, to); }
        catch (caught)
        {
            if (errorCode(caught) !== 'EXDEV') throw caught;
            fs.cpSync(from, to, { recursive: true });
            fs.rmSync(from, { recursive: true, force: true });
        }
        return { ok: true, detail: `moved ${from} to ${to}` };
    }
    if (fromStats.isFile() && there.isFile() && fs.readFileSync(from).equals(fs.readFileSync(to)))
    {
        fs.rmSync(from);
        return { ok: true, detail: `${to} holds the same as ${from} - removed ${from}` };
    }
    return { ok: false, detail: `${to} is there already and is not ${from} - nothing moved; move or remove one of them, then run the command again` };
}

// The 0.4.x record whose entries the list holds now: moved aside as <file>.0.4.bak, or .0.4.bak.2 and on
// when an earlier backup is there - never over one, so the record always leaves and list-import finds nothing next run.
export function retireRecord(file: string): StepResult
{
    if (!fs.existsSync(file)) return { ok: true, detail: `${file}: not there - nothing to move` };
    let to = `${file}.0.4.bak`;
    for (let suffix = 2; fs.existsSync(to); suffix++) to = `${file}.0.4.bak.${suffix}`;
    fs.renameSync(file, to);
    return { ok: true, detail: `moved ${file} to ${to} - its entries are in the list now` };
}

// The root's old copy of a shipped file: removed only when it is this plugin's own, unedited copy and no registration still
// names it - else left, with the reason. The state is read now, when the step runs. Nothing but `file` is ever touched.
export function retireShipped(step: RetireShippedStep): StepResult
{
    const { state } = roots.shippedState(step.kind, step.file);
    if (state === 'absent') return { ok: true, detail: `${step.file} is already gone` };
    if (state === 'edited') return { ok: true, detail: `left ${step.file} - edited by hand` };
    if (state !== 'same') return { ok: true, detail: `left ${step.file} - not this plugin's current copy` };
    if (step.namedBy.length) return { ok: true, detail: `left ${step.file} - still named by ${step.namedBy.join(', ')}` };
    fs.rmSync(step.file);
    return { ok: true, detail: `removed ${step.file}` };
}

// After a stop: every list-write of the plan again, so each list holds what was applied before the stop and nothing
// after it. A failure here is reported and never masks the stop's. -> [{ ok, detail }]
export function failureLists(plan: ApplyPlan, report: ApplyReport, context: ApplyCtx, log: (line: string) => void = () => {}): StepResult[]
{
    const out: StepResult[] = [];
    for (const step of plan.steps.filter((planStep): planStep is ListWriteStep => planStep.op === 'list-write'))
    {
        let result: StepResult;
        try { result = listWrite(step, { ...context, report }, { failure: true }); }
        catch (caught) { result = { ok: false, detail: `${step.file}: ${errorMessage(caught)}` }; }
        log(`   list: ${result.detail}`);
        out.push(result);
    }
    return out;
}

// <data>/roots.json: the family's root for this project (D2). No data folder given: nothing to write (R8).
export function recordRoot(step: RecordRootStep, data: string | null): StepResult
{
    if (!data) return { ok: true, detail: `${step.family} root ${step.root}: no plugin data folder given - the root is found from its files next time` };
    const map = roots.readMap(data);
    const kept = keepAsIs(map);
    if (kept) return kept;
    const file = path.join(data, roots.FILES.map);
    const next = roots.withRoot(map, step.family, path.resolve(step.project), step.root);
    if (!map.state && fs.existsSync(file) && JSON.stringify(next) === JSON.stringify(map)) return { ok: true, detail: `${file} already names the ${step.family} root ${step.root} - left as it is` };
    const backupPath = writeJson(file, next, map);
    return { ok: true, detail: `recorded the ${step.family} root ${step.root} in ${file}${readNote(map, backupPath)}` };
}

