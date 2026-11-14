// @ts-nocheck - typed in Task 12
// The fixes for the list, <root>/mcps.json (spec D1, D9). A row of kind `file` names no `fix` function: its `steps`
// function plans list-write and the rest, which fix.js's file pass runs through apply.js as one plan.
//
// list-import: a managed registration with no entry in its family's list, or a 0.4.x preferred-tools.json, moves onto
// the list - each registration as read with clients claude, the record's own entries as they are, and the record moved
// aside as preferred-tools.json.0.4.bak. Install and configure do the same the first time they write a family
// (plan-lists.js), with the same importUnlisted.
import fs from 'node:fs';
import path from 'node:path';
import * as roots from '../roots/roots.ts';
import * as lists from '../mcps-list/mcps-list.ts';
import { importUnlisted } from '../plan/lists.ts';
import { SCOPES, folderList } from '../plan/cursor-steps.ts';
import { readGuardOf, denyReadStep } from '../plan/repair-tail.ts';
import * as kept from '../core/kept.ts';
import * as keys from '../keys/keys.ts';
import * as cursorMcp from '../cursor/cursor-mcp.ts';
import * as workspace from '../roots/workspace.ts';
import { deepEqual } from '../core/json-file.ts';
import * as serenaConfig from '../apply/serena-config.ts';

const pathOf = (ctx) => (ctx.platform === 'win32' ? path.win32 : path.posix);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The family's roots as install would take them: the root in use, else the recommended one.
const rootsOf = (ctx) => roots.resolve(ctx.inv, null, { project: ctx.inv.project, home: ctx.home, platform: ctx.platform, catalog: ctx.catalog }).roots;

// -> [{ id, name: <list file>, scope: null, family, servers, record: <preferred-tools.json> | null, found }]
export function listImportDetect(ctx)
{
    const P = pathOf(ctx);
    const r = rootsOf(ctx);
    const out = [];
    for (const family of ['project', 'global'])
    {
        const l = ctx.inv.lists && ctx.inv.lists[family];
        // a list or record this plugin cannot read, or one a newer plugin wrote, is left as it is
        if (l && l.note) continue;
        const servers = importUnlisted(ctx.inv, family, ctx.catalog, { roots: r });
        const file = l ? l.file : r[family] ? P.join(r[family], roots.FILES.list) : null;
        if (!file) continue;
        const beside = P.join(P.dirname(file), roots.FILES.record);
        const record = l && l.old ? l.old : fs.existsSync(beside) ? beside : null;
        if (!servers.length && !record) continue;
        const what = [servers.length ? `${plural(servers.length, 'managed server')} not in it (${servers.map((s) => s.name).join(', ')})` : null, record ? `${record} still holds the servers left on their own` : null].filter(Boolean);
        out.push({ id: 'list-import', name: file, scope: null, family, servers, record, found: `${file}: ${what.join('; ')}` });
    }
    return out;
}

// The plan for one family: its root's .gitignore when the root is new, the list-write (the servers as read, `after:
// null`, and the own entries the list and the record hold, as they are), the record moved aside, the roots map.
export function listImportSteps(f, ctx)
{
    const P = pathOf(ctx);
    const root = P.dirname(f.name);
    const existed = fs.existsSync(root);
    const steps = [];
    if (!existed && P.basename(root) !== '.alfred')
        steps.push({ op: 'root-ignore', path: root, why: `the new root ${root}: its .gitignore keeps the key file, the list and the data out of git` });
    const read = lists.readList(f.name);
    const own = read && !read.state ? read.own : [];
    const old = f.record ? roots.ownOnly((lists.readOldRecord(f.record) || {}).servers) : [];
    const have = new Set(own.map(roots.recordKey));
    const keep = [...own, ...old.filter((e) => !have.has(roots.recordKey(e)))];
    steps.push({
        op: 'list-write', file: f.name, family: f.family,
        upserts: f.servers.map((server) => ({ server, after: null, cursorFile: null })), drops: [],
        own: f.record ? { entries: [], keep, live: null } : null,
        why: `${f.name}: the servers preferred-tools manages, as read, and the ones left on their own`,
    });
    if (f.record) steps.push({ op: 'retire-record', file: f.record, why: `${f.record}: the 0.4.x record - its entries are in ${f.name} now` });
    const map = (ctx.inv.roots && ctx.inv.roots.map) || null;
    const mapped = !map ? null : f.family === 'global' ? map.global : (map.projects || {})[roots.mapKey(ctx.inv.project)];
    if (mapped !== root) steps.push({ op: 'record-root', family: f.family, project: ctx.inv.project, root, why: `the ${f.family} root ${root}: written to the roots map, so the commands find it again` });
    return steps;
}

// read-guard (0.5.0): a root that holds the key file or mcp-remote's sign-in folder, and Claude Code's settings that do
// not deny an AI session's Read tool there (rulings 12 and 13). Both are checked by name only - fs.existsSync, never
// opened. One finding per settings file, naming every rule it lacks; its plan is one deny-read.
export function readGuardDetect(ctx)
{
    const P = pathOf(ctx);
    const r = rootsOf(ctx);
    const seen = [...new Set([r.project, r.global].filter(Boolean))];
    const why = [];
    const want = [];
    const has = (name) => seen.find((root) => fs.existsSync(P.join(root, name)));
    const secrets = has(roots.FILES.secrets);
    if (secrets) { want.push(roots.READ_GUARD.secrets); why.push(`${P.join(secrets, roots.FILES.secrets)}`); }
    const signIns = has(roots.FILES.signIns);
    if (signIns) { want.push(roots.READ_GUARD.signIns); why.push(`${P.join(signIns, roots.FILES.signIns)}/`); }
    if (!want.length) return [];
    const g = readGuardOf(ctx, want);
    if (g.bad) return [{ id: 'read-guard', name: g.file, scope: null, rules: want, found: `${g.file}: not a settings object preferred-tools can read`, blocked: `add ${want.join(' and ')} to permissions.deny yourself` }];
    if (!g.rules.length) return [];
    return [{ id: 'read-guard', name: g.file, scope: null, rules: g.rules, found: `${g.file} does not deny ${g.rules.join(' or ')} - an AI session's Read tool can open ${why.join(' and ')}` }];
}

export const readGuardSteps = (f) => [denyReadStep(f.name, f.rules)];

// serena-base-modes (0.5.0, D7): a managed serena's home, other than an alfred-code 2.x one, whose serena_config.yml
// lists base modes. Read by serena-config.js, which reads that key alone and never the file's other lines.
export function serenaBaseModesDetect(ctx)
{
    const out = [];
    const seen = new Set();
    for (const reg of (ctx.inv.registrations || []).filter((r) => r.rowId === 'serena' && !r.own && !r.alfredRetired && r.choice !== 'own' && r.scope !== 'inherited'))
    {
        const home = reg.entry && reg.entry.env && reg.entry.env.SERENA_HOME;
        if (!home) continue;
        const e = serenaConfig.editableHome(home, { platform: ctx.platform });
        const file = serenaConfig.configOf(home);
        if (!e.ok || seen.has(file)) continue;
        seen.add(file);
        if (serenaConfig.baseModesState(file) !== 'set') continue;
        out.push({ id: 'serena-base-modes', name: file, scope: null, file, shared: Boolean(e.shared), found: `${file} lists base modes - serena's manual names edit tools its context leaves out`, ...(e.shared ? { note: serenaConfig.planNote(reg.entry, { platform: ctx.platform }) } : {}) });
    }
    return out;
}

export const serenaBaseModesSteps = (f) => [{ op: 'serena-base-modes', file: f.file, shared: f.shared, why: `${f.file}: base_modes: [], so serena's manual names only the tools it has` }];

// ---- client-drift and cursor-file (0.5.0, D9) -------------------------------------------------------------------------
// A list entry whose copy in Claude Code or in Cursor was edited or removed by hand. Both sides are compared after
// kept.keep, each app with its own form (cursorEntry || entry for Cursor), so a stdio keyed route whose copies hold the
// value while the list holds the marker is not drift. Never applied without an answer: --input drift:<app>:<name>~<scope>.

const APP = { claude: 'Claude Code', cursor: 'Cursor' };
const cursorCtx = (ctx) => ({ platform: ctx.platform, project: ctx.inv.project, home: ctx.home, env: ctx.env || {} });
const usableList = (ctx, family) => { const l = ctx.inv.lists && ctx.inv.lists[family]; return l && !l.note && !l.old ? l : null; };

// Does a copy hold a key-shaped string outside its route's key field? Tested here, never returned.
function keyGuardOf(copy, row, routeId)
{
    const route = row && row.routes ? row.routes[routeId] : null;
    const field = new Set(keys.tokenFields(copy, route).map((f) => f.at.join('.')));
    let hit = false;
    const walk = (node, at) =>
    {
        if (hit) return;
        if (typeof node === 'string') { if (!field.has(at.join('.')) && kept.looksLikeKey(node)) hit = true; return; }
        if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, [...at, k]);
    };
    walk(copy, []);
    return hit;
}

function driftOf(s, app, change, { list, family, file = null, inherited = null, keyGuard = false, keyEmpty = false, rowGone = false })
{
    const found = inherited
        ? (change === 'missing' ? `${s.name} from ${inherited} is no longer in Cursor's ${file}` : `Cursor's copy in ${file} differs from ${inherited}'s list`)
        : (change === 'missing' ? `on ${list} for ${APP[app]}, which no longer has it` : `${APP[app]}'s copy differs from ${list}`);
    return { id: 'client-drift', name: s.name, scope: s.scope, row: s.row, route: s.route, app, change, inherited, keyGuard, keyEmpty, rowGone, family, list, file, driftKey: `drift:${app}:${s.name}~${s.scope}`, found };
}

// Is the copy's key field empty where the list holds the key (kept.MARKER)? A copy written before its value was found -
// Keeping it would blank the other app's working key, so only Restore and Leave are offered.
function keyEmptyOf(copy, want, row, routeId)
{
    const route = row && row.routes ? row.routes[routeId] : null;
    const fields = keys.tokenFields(copy, route);
    return fields.length > 0 && fields.every((f) =>
    {
        const v = keys.valueAt(copy, f.at);
        const w = keys.valueAt(want, f.at);
        return typeof v === 'string' && !v.trim() && typeof w === 'string' && w.includes(kept.MARKER);
    });
}

// -> [finding], each entry's Claude Code finding before its Cursor one
export function clientDriftDetect(ctx)
{
    const catalog = ctx.catalog;
    const cctx = cursorCtx(ctx);
    const out = [];
    const regs = (ctx.inv.registrations || []).filter((r) => r.scope !== 'inherited');
    const same = (a, b) => deepEqual(a, b);
    const compare = (copy, want, s, app, where) =>
    {
        const row = catalog.byId.get(s.row);
        if (copy === undefined) return out.push(driftOf(s, app, 'missing', where));
        if (same(kept.keep(copy, row), kept.keep(want, row))) return undefined;
        return out.push(driftOf(s, app, 'differs', { ...where, keyGuard: keyGuardOf(copy, row, s.route), keyEmpty: keyEmptyOf(copy, want, row, s.route), rowGone: !cursorMcp.matchesRow(copy, row) }));
    };
    for (const family of ['project', 'global'])
    {
        const l = usableList(ctx, family);
        if (!l) continue;
        const servers = l.servers || [];
        const where = { list: l.file, family };
        for (const s of servers.filter((x) => (x.clients || ['claude']).includes('claude')))
        {
            const reg = regs.find((r) => r.name === s.name && r.scope === s.scope);
            compare(reg ? reg.entry : undefined, s.entry, s, 'claude', where);
        }
        // Cursor's file of the family; one Cursor's writer refuses is cursor-file's
        const file = cursorMcp.fileFor(family, cctx);
        const read = cursorMcp.readCursor(file);
        if (read.state !== 'ok' && read.state !== 'absent') continue;
        const have = read.doc.mcpServers;
        for (const [name, m] of cursorMcp.managedSet([{ file: l.file, scopes: SCOPES[family], servers }]))
        {
            const s = servers.find((x) => x.name === name && x.scope === m.scope);
            compare(Object.hasOwn(have, name) ? have[name] : undefined, m.entry, s, 'cursor', { ...where, file });
        }
    }
    // a workspace member's copies of the folders above's project servers (D4a): compared with the folder above's entry
    const ws = ctx.inv.workspace !== undefined ? ctx.inv.workspace : workspace.of(ctx.inv.project, ctx.env || {});
    if (ws && ws.root && (ws.ancestors || []).length)
    {
        const file = cursorMcp.fileFor('project', cctx);
        const read = cursorMcp.readCursor(file);
        if (read.state === 'ok' || read.state === 'absent')
        {
            const own = usableList(ctx, 'project');
            const seen = new Set(own ? cursorMcp.managedSet([{ file: own.file, scopes: SCOPES.project, servers: own.servers || [] }]).keys() : []);
            for (const up of ws.ancestors)
            {
                const fl = folderList(ctx.inv, up, cctx);
                if (!fl) continue;
                for (const [name, m] of cursorMcp.managedSet([{ file: fl.file, scopes: ['project'], servers: fl.servers }]))
                {
                    if (seen.has(name)) continue;
                    seen.add(name);
                    const s = fl.servers.find((x) => x.name === name && x.scope === m.scope);
                    const before = out.length;
                    compare(Object.hasOwn(read.doc.mcpServers, name) ? read.doc.mcpServers[name] : undefined, m.entry, s, 'cursor', { list: fl.file, family: 'project', file, inherited: up });
                    // an inherited copy is the folder above's to change: Restore or Leave only
                    for (const f of out.slice(before)) { f.keyGuard = false; f.rowGone = false; }
                }
            }
        }
    }
    const order = [...new Set(out.map((f) => `${f.name}~${f.scope}`))];
    return out.sort((a, b) => order.indexOf(`${a.name}~${a.scope}`) - order.indexOf(`${b.name}~${b.scope}`) || (a.app === 'claude' ? -1 : 1) - (b.app === 'claude' ? -1 : 1));
}

// The steps of one answered finding. answer: keep | restore | leave | drop.
export function clientDriftSteps(f, ctx, input = {})
{
    const answer = input[f.driftKey];
    const catalog = ctx.catalog;
    const row = catalog.byId.get(f.row);
    const read = lists.readList(f.list);
    const s = read && !read.state ? read.servers.find((x) => x.name === f.name && x.scope === f.scope) : null;
    if (!s || answer === 'leave') return [];
    const key = `mcp:${f.name}~${f.scope}`;
    const why = `${f.name} (${f.scope}): ${answer === 'keep' ? `the change in ${APP[f.app]} kept` : answer === 'drop' ? `${APP[f.app]} taken off its list entry` : `${APP[f.app]}'s copy restored from the list`}`;
    const listStep = (server) => ({ op: 'list-write', file: f.list, family: f.family, upserts: server ? [{ server, after: null, cursorFile: null }] : [], drops: server ? [] : [{ key, after: null }], own: null, why: `${f.list}: ${why}` });
    // Cursor's copy of this one name, the file's other entries as they are
    const cursorStep = () => ({ op: 'cursor-write', file: f.file || cursorMcp.fileFor(f.family, cursorCtx(ctx)), family: f.family, lists: [{ file: f.list, scopes: f.inherited ? ['project'] : SCOPES[f.family] }], before: [f.name], only: [f.name], skip: [], replace: [], why: `${f.file || 'Cursor'}: ${why}` });
    const reg = (ctx.inv.registrations || []).find((r) => r.name === f.name && r.scope === f.scope && r.scope !== 'inherited');
    const claudeStep = (entry) => (reg
        ? { op: 'mcp-replace', name: f.name, scope: f.scope, old: reg.entry, entry, row: f.row, route: f.route, why }
        : { op: 'mcp-add', name: f.name, scope: f.scope, entry, row: f.row, route: f.route, why });
    const cursorCopy = () => { const c = cursorMcp.readCursor(f.file); return c.state === 'ok' ? c.doc.mcpServers[f.name] : undefined; };
    if (f.inherited) return answer === 'restore' ? [cursorStep()] : [];
    if (answer === 'restore')
    {
        if (f.app === 'cursor') return [cursorStep()];
        // the list holds each key value as the marker: from the registration as read, else from the key files
        let entry = s.entry;
        if (kept.holdsKept(entry) && reg) { const r = kept.restore(entry, reg.entry, row); if (!r.error) entry = r.entry; }
        if (kept.holdsKept(entry) && s.key && row && row.routes[s.route] && row.routes[s.route].tokenVar)
        {
            const r = roots.resolve(ctx.inv, null, { project: ctx.inv.project, home: ctx.home, platform: ctx.platform, catalog }).roots;
            const at = keys.valueIn(keys.stdioChain({ scope: f.scope, projectRoot: r.project, globalRoot: r.global }), s.key);
            if (at) entry = keys.fillKeys(entry, row, s.route, f.scope, { [row.routes[s.route].tokenVar]: at.value });
        }
        if (kept.holdsKept(entry)) throw new Error(`${f.name} (${f.scope}): the list's entry holds a key ${s.key ? `named ${s.key} ` : ''}that is filled nowhere - fill it, then run fix again`);
        return [claudeStep(entry)];
    }
    if (answer === 'drop')
    {
        const clients = (s.clients || ['claude']).filter((c) => c !== f.app);
        return [listStep(clients.length ? { ...s, clients } : null)];
    }
    // keep: the copy no longer the row's server is the user's own, and leaves the list
    if (f.rowGone) return [listStep(null)];
    if (f.app === 'claude')
    {
        const server = { ...s, entry: kept.keep(reg.entry, row) };
        if (s.cursorEntry) server.cursorEntry = cursorMcp.bridgeFormOf(reg.entry, catalog, s.cursorEntry) || s.cursorEntry;
        return [listStep(server), ...((s.clients || []).includes('cursor') ? [cursorStep()] : [])];
    }
    const copy = cursorCopy();
    if (s.cursorEntry) return [listStep({ ...s, cursorEntry: kept.keep(copy, row) })];
    // a one-form entry: Claude Code takes Cursor's copy, its key fields from the registration as read
    const back = reg ? kept.restore(kept.keep(copy, row), reg.entry, row) : { error: 'none' };
    return [claudeStep(back.error ? copy : back.entry), listStep({ ...s, entry: kept.keep(copy, row) })];
}

// cursor-file (advice): a Cursor file preferred-tools will not write, with what to do.
export function cursorFileDetect(ctx)
{
    const cctx = cursorCtx(ctx);
    const out = [];
    for (const family of ['project', 'global'])
    {
        const file = cursorMcp.fileFor(family, cctx);
        const why = cursorMcp.refusal(cursorMcp.readCursor(file));
        if (why) out.push({ id: 'cursor-file', name: file, scope: null, found: `${file} ${why}` });
    }
    return out;
}

