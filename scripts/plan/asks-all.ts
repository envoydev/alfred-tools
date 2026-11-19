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
import { isRegistration } from './files/shapes.ts';
import { required } from './required.ts';
import type { Catalog } from '../catalog/types.ts';
import type { Current } from '../entries/types.ts';
import type { InvRegistration, Inventory } from '../inventory/types.ts';
import type { AskCtx, AskOptions, Asked, Picks, Questions } from './types.ts';

// picks: { rows: [<row id>], routes: { <row id>: route } } for install, { targets: [<key>], routes: { <key>: route } }
// for configure; both may carry `scopes` ({ <row id or key>: scope }) and `names` ({ <row id or key>: 'keep' | <name> }),
// the answers to `first`, which place the data folder. A target's questions start from what it has now: its route,
// scope, name and data folder are 'Keep'. `env` and `home`: what the key state reads (the shell's variables, the home
// key file). plan.ts --questions passes the real ones; a caller that passes none reads neither, so a test never depends
// on the shell that runs it.
export function allQuestions(inventory: Inventory, picks: Picks | null | undefined, catalog: Catalog, { env = {}, home = null, connectors = null }: AskOptions = {}): Questions
{
    const out: Questions = {
        static: { ...STATIC, prereqMissing: STATIC.prereqMissing('<tool>', '<prerequisite>'), prereqInstalled: STATIC.prereqInstalled('<tool>', '<prerequisite>'), settingsOne: STATIC.settingsOne('<tool>'), 'cursor-name-taken': STATIC['cursor-name-taken']('<file>', '<name>') },
        pick: pickQuestions(inventory, catalog, picks && picks.existing, connectors), change: null, remove: removeQuestions(inventory, catalog), tools: {}, targets: {},
    };
    // `exists` reads the disk: alfred-code's .alfred/.gitignore and its 2.x data decide which folders are offered
    const context: AskCtx = { project: inventory.project, platform: inventory.os, arch: inventory.arch, home: home || homeDir(process.env), env, keyHome: home, exists: (filePath: string) => fs.existsSync(filePath) };
    // the roots answered so far (the walk asks them before a tool's folder), else the recommended ones
    context.roots = roots.resolveRoots(inventory, picks && picks.roots, { ...context, catalog }).roots;
    out.change = changeQuestions(inventory, catalog, context);
    // which apps (spec D3): asked once an install run, when it picked something
    out.clients = picks && (picks.rows || []).length ? clientsQuestion(cursorFound(context, inventory)) : null;
    const routes = (picks && picks.routes) || {};
    const scopes = (picks && picks.scopes) || {};
    const names = (picks && picks.names) || {};
    for (const id of (picks && picks.rows) || [])
    {
        const row = catalog.byId.get(id);
        if (!row) continue;
        // install only adds, so its questions never start from an installed registration
        out.tools[id] = { route: row.kind === 'mcp' ? routeQuestion(row) : null, ...toolAsk(row, inventory, { route: routes[id], scope: scopes[id], name: names[id], context: context, catalog, copyOf: installedOf(inventory, id) }) };
    }
    const own = new Map(ownItems(inventory, catalog).map((ownItem) => [ownItem.key, ownItem]));
    for (const key of (picks && picks.targets) || [])
    {
        // a root folder: D2's question, the root in use recommended (spec D7)
        const rootFamily = roots.FAMILIES.find((family) => key === `root:${family}`);
        if (rootFamily)
        {
            const used = rootInUse(inventory, rootFamily, { ...context, catalog });
            out.targets[key] = used ? { kind: 'root', family: rootFamily, current: { path: used.path }, root: rootQuestion(inventory, rootFamily, { ...context, catalog }) } : { error: `no ${rootFamily} root is in use here` };
            continue;
        }
        // a server left on its own: one question, keep it so or hand it over (spec D6)
        const ownItem = own.get(key);
        if (ownItem)
        {
            out.targets[key] = { row: ownItem.rowId, kind: 'own', current: { name: ownItem.name || ownItem.server || ownItem.connector, scope: ownItem.scope || null, route: null }, own: ownQuestion(ownItem) };
            continue;
        }
        const target = targetOf(inventory, key);
        const item = target?.item;
        const row = item && item.rowId && !item.alfredRetired ? catalog.byId.get(item.rowId) : null;
        if (!target || !item || !row) { out.targets[key] = { error: `'${key}' is not a catalog tool installed here` }; continue; }
        // an `mcp:` key names a registration, a `plugin:` key a plugin row
        const registration = isRegistration(item) ? item : null;
        const current: Partial<Current> = registration ? currentOf(row, registration) : { scope: item.scope };
        const listed = registration ? listedOf(inventory, registration) : null;
        out.targets[key] = {
            row: row.id, kind: target.kind, current: { name: isRegistration(item) ? item.name : item.id, scope: item.scope, route: current.route || null, ...(registration ? { clients: listed ? listed.clients : ['claude'] } : {}) },
            route: registration ? routeQuestion(row, current.route) : null,
            ...(registration ? { clients: targetClientsQuestion(key, registration.name, listed ? listed.clients : ['claude']) } : {}),
            ...toolAsk(row, inventory, { route: routes[key], scope: scopes[key], name: names[key], current, context: context, catalog }),
        };
    }
    out.roots = rootsBlock(inventory, picks, catalog, context);
    // D9, asked after the tool's questions: the key's name for each route that can use one, the settings of each stdio one
    out.keyNames = {};
    out.settings = {};
    // a bridge's URL names (0.4.0): { <row id or target key>: { <VAR>: { question, answers } } }
    out.urlNames = {};
    const urlBlock = (list: (Asked<string> & { var: string })[]) => Object.fromEntries(list.map((urlQuestion) => [urlQuestion.var, { question: urlQuestion.question, answers: urlQuestion.answers }]));
    const live = liveReader(inventory.project, env);
    for (const id of (picks && picks.rows) || [])
    {
        const row = catalog.byId.get(id);
        if (!row || row.kind !== 'mcp') continue;
        const routeId = routes[id] || row.recommendedRoute;
        if (!row.routes[routeId]) continue;
        const scope = scopes[id] || required(scopeOrder(row, inventory, { route: routeId, context: context, copyOf: installedOf(inventory, id) })[0], `${id}: its ${routeId} route offers no scope`);
        const keyNameAsk = keyNameQuestion(row, routeId, scope, context);
        if (keyNameAsk) out.keyNames[id] = keyNameAsk;
        const urlQuestions = urlNameQuestions(row, routeId, scope, context);
        if (urlQuestions.length) out.urlNames[id] = urlBlock(urlQuestions);
        const settings = settingsQuestion(row, routeId);
        if (settings) out.settings[id] = settings;
    }
    for (const key of (picks && picks.targets) || [])
    {
        if (own.has(key)) continue;
        const target = targetOf(inventory, key);
        const registration = target && isRegistration(target.item) ? target.item : null;
        const row = registration && registration.rowId && !registration.alfredRetired ? catalog.byId.get(registration.rowId) : null;
        if (!registration || !row) continue;
        const current = currentOf(row, registration);
        const routeId = routes[key] || current.route;
        const route = routeId ? row.routes[routeId] : undefined;
        if (!routeId || !route) continue;
        const scope = scopes[key] || current.scope;
        const same = routeId === current.route;
        // the name it uses: the helper's argument; for a stdio key, the name whose value equals the key it holds in the
        // chain's .mcps-secrets (the 0.1.x key files are read for names only)
        let name: string | null = same && route.helper ? current.keyName : null;
        if (same && !route.helper && route.tokenVar)
        {
            const held = heldKey(live(registration.name, registration.scope) || {}, route);
            const keyState = keyStateOf(row, routeId, context, null, scope);
            name = held && keyState ? keys.nameOfValue(keyState.files, held) : null;
        }
        const keyNameAsk = keyNameQuestion(row, routeId, scope, context, { current: name });
        if (keyNameAsk) out.keyNames[key] = keyNameAsk;
        const urlQuestions = urlNameQuestions(row, routeId, scope, context, { current: same ? current.urlNames : null, keyName: name });
        if (urlQuestions.length) out.urlNames[key] = urlBlock(urlQuestions);
        const settings = settingsQuestion(row, routeId, { entry: same ? registration.entry : null });
        if (settings) out.settings[key] = settings;
    }
    return out;
}

// The family list's entry for a registration, or null.
function listedOf(inventory: Inventory, item: InvRegistration)
{
    const familyList = inventory.lists && inventory.lists[roots.familyOf(item.scope)];
    return familyList && !familyList.note ? (familyList.servers || []).find((server) => server.name === item.name && server.scope === item.scope) || null : null;
}

