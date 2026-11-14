// EVERY QUESTION THE WALK ASKS, as data. A question is { id, header, question, multiSelect, options: [{ label, description }] }:
// 2 to 4 options, exactly one marked '(Recommended)' and listed first on a single-select; a call carries 1 to 4 questions.
// 'Other' is added by AskUserQuestion itself and never listed here.
import fs from 'node:fs';
import { currentOf } from '../entries/entry.ts';
import { installedOf, targetOf } from '../inventory/inventory.ts';
import * as keys from '../keys/keys.ts';
import * as roots from '../roots/roots.ts';
import { liveReader, keyNameQuestion, urlNameQuestions, settingsQuestion, heldKey, keyStateOf } from './asks-keys.ts';
import { pickQuestions, rootInUse } from './asks-picks.ts';
import { changeQuestions, routeQuestion, scopeOrder } from './asks-tool.ts';
import { STATIC, removeQuestions, clientsQuestion, toolAsk, targetClientsQuestion } from './asks-other.ts';
import { rootQuestion, rootsBlock } from './asks-roots.ts';
import { homeDir } from '../core/account.ts';
import { cursorFound } from '../cursor/cursor-mcp.ts';
import { ownItems, ownQuestion } from '../inventory/existing.ts';

// picks: { rows: [<row id>], routes: { <row id>: route } } for install, { targets: [<key>], routes: { <key>: route } }
// for configure; both may carry `scopes` ({ <row id or key>: scope }) and `names` ({ <row id or key>: 'keep' | <name> }),
// the answers to `first`, which place the data folder. A target's questions start from what it has now: its route,
// scope, name and data folder are 'Keep'. `env` and `home`: what the key state reads (the shell's variables, the home
// key file). plan.js --questions passes the real ones; a caller that passes none reads neither, so a test never depends
// on the shell that runs it.
export function all(inv, picks, catalog, { env = {}, home = null, connectors = null } = {})
{
    const out = {
        static: { ...STATIC, prereqMissing: STATIC.prereqMissing('<tool>', '<prerequisite>'), settingsOne: STATIC.settingsOne('<tool>'), 'cursor-name-taken': STATIC['cursor-name-taken']('<file>', '<name>') },
        pick: pickQuestions(inv, catalog, picks && picks.existing, connectors), change: null, remove: removeQuestions(inv, catalog), tools: {}, targets: {},
    };
    // `exists` reads the disk: alfred-code's .alfred/.gitignore and its 2.x data decide which folders are offered
    const ctx = { project: inv.project, platform: inv.os, arch: inv.arch, home: home || homeDir(process.env), env, keyHome: home, exists: (p) => fs.existsSync(p) };
    // the roots answered so far (the walk asks them before a tool's folder), else the recommended ones
    ctx.roots = roots.resolve(inv, picks && picks.roots, { ...ctx, catalog }).roots;
    out.change = changeQuestions(inv, catalog, ctx);
    // which apps (spec D3): asked once an install run, when it picked something
    out.clients = picks && (picks.rows || []).length ? clientsQuestion(cursorFound(ctx, inv)) : null;
    const routes = (picks && picks.routes) || {};
    const scopes = (picks && picks.scopes) || {};
    const names = (picks && picks.names) || {};
    for (const id of (picks && picks.rows) || [])
    {
        const row = catalog.byId.get(id);
        if (!row) continue;
        // install only adds, so its questions never start from an installed registration
        out.tools[id] = { route: row.kind === 'mcp' ? routeQuestion(row) : null, ...toolAsk(row, inv, { route: routes[id], scope: scopes[id], name: names[id], ctx, catalog, copyOf: installedOf(inv, id) }) };
    }
    const own = new Map(ownItems(inv, catalog).map((it) => [it.key, it]));
    for (const key of (picks && picks.targets) || [])
    {
        // a root folder: D2's question, the root in use recommended (spec D7)
        const rm = /^root:(project|global)$/.exec(key);
        if (rm)
        {
            const used = rootInUse(inv, rm[1], { ...ctx, catalog });
            out.targets[key] = used ? { kind: 'root', family: rm[1], current: { path: used.path }, root: rootQuestion(inv, rm[1], { ...ctx, catalog }) } : { error: `no ${rm[1]} root is in use here` };
            continue;
        }
        // a server left on its own: one question, keep it so or hand it over (spec D6)
        if (own.has(key))
        {
            const it = own.get(key);
            out.targets[key] = { row: it.rowId, kind: 'own', current: { name: it.name || it.server || it.connector, scope: it.scope || null, route: null }, own: ownQuestion(it) };
            continue;
        }
        const t = targetOf(inv, key);
        const row = t && t.item.rowId && !t.item.alfredRetired ? catalog.byId.get(t.item.rowId) : null;
        if (!row) { out.targets[key] = { error: `'${key}' is not a catalog tool installed here` }; continue; }
        // required here, not at the top: plan.js requires this file
        const current = t.kind === 'mcp' ? currentOf(row, t.item) : { scope: t.item.scope };
        const listed = t.kind === 'mcp' ? listedOf(inv, t.item) : null;
        out.targets[key] = {
            row: row.id, kind: t.kind, current: { name: t.item.name || t.item.id, scope: t.item.scope, route: current.route || null, ...(t.kind === 'mcp' ? { clients: listed ? listed.clients : ['claude'] } : {}) },
            route: t.kind === 'mcp' ? routeQuestion(row, current.route) : null,
            ...(t.kind === 'mcp' ? { clients: targetClientsQuestion(key, t.item.name, listed ? listed.clients : ['claude']) } : {}),
            ...toolAsk(row, inv, { route: routes[key], scope: scopes[key], name: names[key], current, ctx, catalog }),
        };
    }
    out.roots = rootsBlock(inv, picks, catalog, ctx);
    // D9, asked after the tool's questions: the key's name for each route that can use one, the settings of each stdio one
    out.keyNames = {};
    out.settings = {};
    // a bridge's URL names (0.4.0): { <row id or target key>: { <VAR>: { question, answers } } }
    out.urlNames = {};
    const urlBlock = (list) => Object.fromEntries(list.map((u) => [u.var, { question: u.question, answers: u.answers }]));
    const live = liveReader(inv.project, env);
    for (const id of (picks && picks.rows) || [])
    {
        const row = catalog.byId.get(id);
        if (!row || row.kind !== 'mcp') continue;
        const routeId = routes[id] || row.recommendedRoute;
        if (!row.routes[routeId]) continue;
        const scope = scopes[id] || scopeOrder(row, inv, { route: routeId, ctx, copyOf: installedOf(inv, id) })[0];
        const k = keyNameQuestion(row, routeId, scope, ctx);
        if (k) out.keyNames[id] = k;
        const u = urlNameQuestions(row, routeId, scope, ctx);
        if (u.length) out.urlNames[id] = urlBlock(u);
        const st = settingsQuestion(row, routeId);
        if (st) out.settings[id] = st;
    }
    for (const key of (picks && picks.targets) || [])
    {
        if (own.has(key)) continue;
        const t = targetOf(inv, key);
        const row = t && t.kind === 'mcp' && t.item.rowId && !t.item.alfredRetired ? catalog.byId.get(t.item.rowId) : null;
        if (!row) continue;
        const current = currentOf(row, t.item);
        const routeId = routes[key] || current.route;
        const route = row.routes[routeId];
        if (!route) continue;
        const scope = scopes[key] || current.scope;
        const same = routeId === current.route;
        // the name it uses: the helper's argument; for a stdio key, the name whose value equals the key it holds in the
        // chain's .mcps-secrets (the 0.1.x key files are read for names only)
        let name = same && route.helper ? current.keyName : null;
        if (same && !route.helper && route.tokenVar)
        {
            const held = heldKey(live(t.item.name, t.item.scope) || {}, route);
            const ks = keyStateOf(row, routeId, ctx, null, scope);
            name = held && ks ? keys.nameOfValue(ks.files, held) : null;
        }
        const k = keyNameQuestion(row, routeId, scope, ctx, { current: name });
        if (k) out.keyNames[key] = k;
        const u = urlNameQuestions(row, routeId, scope, ctx, { current: same ? current.urlNames : null, keyName: name });
        if (u.length) out.urlNames[key] = urlBlock(u);
        const st = settingsQuestion(row, routeId, { entry: same ? t.item.entry : null });
        if (st) out.settings[key] = st;
    }
    return out;
}

// The family list's entry for a registration, or null.
function listedOf(inv, item)
{
    const l = inv.lists && inv.lists[roots.familyOf(item.scope)];
    return l && !l.note ? (l.servers || []).find((x) => x.name === item.name && x.scope === item.scope) || null : null;
}

