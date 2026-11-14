#!/usr/bin/env node
// THE PLAN - answers in, an ordered list of operations out. Nothing here changes anything.
//
//   node plan.ts <inventory.json> <answers.json> [--out <plan.json>]     the plan, printed, and written for apply.ts
//   node plan.ts --questions <inventory.json> [<picks.json>]              every ask the walk makes, as data
//   either takes --data <plugin data dir> after its files: the roots map (spec D2)
//
// A fresh add builds its entry from catalog/tools.json. A rename, a move, a route or location change (configure) starts
// from the registration as read - its pin, its cut-off, the args and env the user added - and changes only what the
// answer names, so an updated pin is never downgraded. The same answers twice plan nothing.
//
// Answers: { picks: { <row id>: { route, scope, name, location, executablePath, token, params } },
//            change: { <key>: { row, <the same answers as a pick> } },
//            remove: [{ kind: 'mcp', name, scope }],
//            machine: { docker } (from prereq.ts --json) }
//   name: 'keep' | 'prefixed' | any literal name       location: { side: 'keep' | 'default' | 'project' | 'account' | 'path', path }
//   picks come from install and only ADD: a pick already there under its name and scope is left unchanged, and a
//   registration of the row at another scope or name is left as it is, so a project gets its own copy beside one
//   installed for every project. change comes from configure, keyed `mcp:<name>~<scope>`: it
//   renames, moves or rewrites that ONE registration, and another of the same row is left. Its `row` is for prereq.ts.
import * as catalogLib from '../catalog/catalog.ts';
import { alsoProvided } from './asks-picks.ts';
import { cursorNameQuestion } from './asks-other.ts';
import * as roots from '../roots/roots.ts';
import * as existing from '../inventory/existing.ts';
import * as mcpOrder from '../mcps-list/mcp-order.ts';
import { cursorSteps } from './cursor-steps.ts';
import { changedOutside, denyReadSteps } from './repair-tail.ts';
import { deepEqual } from '../core/json-file.ts';
import { makeCtx } from './context.ts';
import { planMcp } from './pick.ts';
import { fileSteps } from './root-files.ts';
import { planChange, planRemove, planExisting, planRootChange, movedLists } from './change.ts';
export { deepEqual };
import type { Inventory } from '../inventory/types.ts';
import type { Answers, Plan, PlanCtx, PlanOptions, PlanStep } from './types.ts';

// ---- the plan -------------------------------------------------------------------------------------------------------

export function plan(inventory: Inventory, answers: Answers, options: PlanOptions = {}): Plan
{
    const catalog = options.catalog || catalogLib.load();
    // answers.machine: what prereq.ts found (docker: false picks github's binary fallback); an explicit option wins
    const context: PlanCtx = { ...makeCtx(inventory, { ...options, machine: options.machine || answers.machine }), changing: new Set(Object.keys(answers.change || {})), uses: [], rootMoves: [] };
    const out: Plan = { version: 1, project: inventory.project, os: inventory.os, alfredCodeEnabled: Boolean(inventory.alfredCodeEnabled), steps: [], notes: [], errors: [], unchanged: [], keys: [], reconnect: [], oauth: [], dangerous: [], expect: [] };
    // the root folders (spec D2): every data folder, key file and helper of a family sits in its root
    const resolved = roots.resolveRoots(inventory, answers.roots, { ...context, catalog });
    out.errors.push(...resolved.errors);
    context.roots = resolved.roots;
    out.roots = context.roots;
    // what changed outside preferred-tools since its last write (spec D1): named first, only fix changes it
    out.outside = changedOutside(inventory, catalog);

    // the key's name and the settings (spec D9, R4): top-level maps keyed by row id (install) or target key (configure)
    const keyNames = answers.keyNames || {};
    const settings = answers.settings || {};
    // a bridge's URL names (0.4.0): { <row id or target key>: { <VAR>: <NAME> } }
    const urlNamesOf = answers.urlNames || {};
    const connectors = options.connectors === undefined ? null : options.connectors;
    // which apps (spec D3): install's one answer for every pick, configure's per target. The registration steps a pick
    // plans carry it into the list (ctx.clientsFor); a configure change of the apps alone is a list entry, no CLI call.
    // planMcp decides each registration's clients and Cursor form (D5) and records them here
    context.clientsFor = new Map();
    context.formFor = new Map();
    context.clientsOnly = [];
    if (answers.clients && Object.keys(answers.picks || {}).length) out.apps = answers.clients;
    for (const [rowId, pick] of Object.entries(answers.picks || {}))
    {
        const row = catalog.byId.get(rowId);
        if (!row) { out.errors.push(`unknown tool '${rowId}'`); continue; }
        planMcp(row, { ...(pick || {}), clients: answers.clients, keyName: keyNames[rowId], settings: settings[rowId], urlNames: urlNamesOf[rowId] || (pick || {}).urlNames }, inventory, context, catalog, out);
        // a claude.ai connector or an enabled plugin's server provides it too (spec F4)
        for (const provider of alsoProvided(inventory, rowId, connectors)) out.notes.push(existing.twoServers(row.label, provider.owner));
    }
    // a target answered 'Leave it on its own' gets no change (Ruling 9)
    const leftNow = new Set(Object.entries(answers.existing || {}).filter(([, choice]) => choice === 'own').map(([key]) => key));
    for (const [key, pick] of Object.entries(answers.change || {}))
    {
        if (leftNow.has(key)) { out.unchanged.push(`${key}: left on its own`); continue; }
        planChange(key, { ...(pick || {}), keyName: keyNames[key], settings: settings[key], urlNames: urlNamesOf[key] || (pick || {}).urlNames }, inventory, context, catalog, out);
    }
    for (const removeAnswer of answers.remove || []) planRemove(removeAnswer, inventory, catalog, out);
    planExisting(answers, inventory, context, catalog, out, connectors);
    planRootChange(answers, inventory, context, catalog, out);
    // the file steps first, the records last (D8): a failed add leaves files a re-run finds in place
    // a root change's moved list is the list from here on: its writes and Cursor's read it at its new path
    const listInv = movedLists(inventory, context.rootMoves);
    const files = fileSteps(listInv, context, out, out.steps);
    const moves = context.rootMoves.map((move): PlanStep => ({ op: 'move-root-file', from: move.from, to: move.to, why: `the ${move.family} root moves: ${move.name} goes with it` }));
    const ignores = files.before.filter((step) => step.op === 'root-ignore');
    out.steps = [...ignores, ...moves, ...files.before.filter((step) => step.op !== 'root-ignore'), ...out.steps, ...files.after];
    // Cursor's files from the lists, after the list-write steps they read (spec D2)
    const cursor = cursorSteps(listInv, { ...context, catalog }, out, answers);
    // the read guard (ruling 13): one deny-read, last before the list-write steps
    const deny = denyReadSteps(out.steps, context, out);
    if (deny.length) { const at = out.steps.findIndex((step) => step.op === 'list-write'); out.steps.splice(at < 0 ? out.steps.length : at, 0, ...deny); }
    // each name Cursor's file holds that no answer settles: its question, which the command asks before planning again
    if (out.taken) { out.cursorNames = out.taken.map((taken) => cursorNameQuestion(taken)); delete out.taken; }
    // .mcp.json in the catalog's order, last of all (spec F5, F8)
    out.steps = mcpOrder.withOrderStep([...out.steps, ...cursor], inventory.project, mcpOrder.ownProjectNames(inventory, answers.existing));
    out.noop = out.steps.length === 0 && out.errors.length === 0;
    return out;
}

