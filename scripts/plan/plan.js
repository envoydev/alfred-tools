#!/usr/bin/env node
'use strict';
// THE PLAN - answers in, an ordered list of operations out. Nothing here changes anything.
//
//   node plan.js <inventory.json> <answers.json> [--out <plan.json>]     the plan, printed, and written for apply.js
//   node plan.js --questions <inventory.json> [<picks.json>]              every ask the walk makes, as data
//   either takes --data <plugin data dir> after its files: the roots map (spec D2)
//
// A fresh add builds its entry from catalog/tools.json. A rename, a move, a route or location change (configure) starts
// from the registration as read - its pin, its cut-off, the args and env the user added - and changes only what the
// answer names, so an updated pin is never downgraded. The same answers twice plan nothing.
//
// Answers: { picks: { <row id>: { route, scope, name, location, executablePath, token, params } },
//            change: { <key>: { row, <the same answers as a pick> } },
//            remove: [{ kind: 'mcp', name, scope }],
//            machine: { docker } (from prereq.js --json) }
//   name: 'keep' | 'prefixed' | any literal name       location: { side: 'keep' | 'default' | 'project' | 'account' | 'path', path }
//   picks come from install and only ADD: a pick already there under its name and scope is left unchanged, and a
//   registration of the row at another scope or name is left as it is, so a project gets its own copy beside one
//   installed for every project. change comes from configure, keyed `mcp:<name>~<scope>`: it
//   renames, moves or rewrites that ONE registration, and another of the same row is left. Its `row` is for prereq.js.
const catalogLib = require('../catalog/catalog.js');
const { alsoProvided } = require('./asks-picks.js');
const { cursorNameQuestion } = require('./asks-other.js');
const roots = require('../roots/roots.js');
const existing = require('../inventory/existing.js');
const mcpOrder = require('../mcps-list/mcp-order.js');
const { cursorSteps } = require('./cursor-steps.js');
const { changedOutside, denyReadSteps } = require('./repair-tail.js');
const { deepEqual } = require('../core/json-file.js');
const { makeCtx } = require('./context.js');
const { planMcp, fileSteps } = require('./pick.js');
const { planChange, planRemove, planExisting, planRootChange, movedLists } = require('./change.js');

// ---- the plan -------------------------------------------------------------------------------------------------------

function plan(inv, answers, opts = {})
{
    const catalog = opts.catalog || catalogLib.load();
    // answers.machine: what prereq.js found (docker: false picks github's binary fallback); an explicit option wins
    const ctx = { ...makeCtx(inv, { ...opts, machine: opts.machine || answers.machine }), changing: new Set(Object.keys(answers.change || {})), uses: [], rootMoves: [] };
    const out = { version: 1, project: inv.project, os: inv.os, alfredCodeEnabled: Boolean(inv.alfredCodeEnabled), steps: [], notes: [], errors: [], unchanged: [], keys: [], reconnect: [], oauth: [], dangerous: [], expect: [] };
    // the root folders (spec D2): every data folder, key file and helper of a family sits in its root
    const resolved = roots.resolve(inv, answers.roots, { ...ctx, catalog });
    out.errors.push(...resolved.errors);
    ctx.roots = resolved.roots;
    out.roots = ctx.roots;
    // what changed outside preferred-tools since its last write (spec D1): named first, only fix changes it
    out.outside = changedOutside(inv, catalog);

    // the key's name and the settings (spec D9, R4): top-level maps keyed by row id (install) or target key (configure)
    const keyNames = answers.keyNames || {};
    const settings = answers.settings || {};
    // a bridge's URL names (0.4.0): { <row id or target key>: { <VAR>: <NAME> } }
    const urlNamesOf = answers.urlNames || {};
    const connectors = opts.connectors === undefined ? null : opts.connectors;
    // which apps (spec D3): install's one answer for every pick, configure's per target. The registration steps a pick
    // plans carry it into the list (ctx.clientsFor); a configure change of the apps alone is a list entry, no CLI call.
    // planMcp decides each registration's clients and Cursor form (D5) and records them here
    ctx.clientsFor = new Map();
    ctx.formFor = new Map();
    ctx.clientsOnly = [];
    if (answers.clients && Object.keys(answers.picks || {}).length) out.apps = answers.clients;
    for (const [rowId, pick] of Object.entries(answers.picks || {}))
    {
        const row = catalog.byId.get(rowId);
        if (!row) { out.errors.push(`unknown tool '${rowId}'`); continue; }
        planMcp(row, { ...(pick || {}), clients: answers.clients, keyName: keyNames[rowId], settings: settings[rowId], urlNames: urlNamesOf[rowId] || (pick || {}).urlNames }, inv, ctx, catalog, out);
        // a claude.ai connector or an enabled plugin's server provides it too (spec F4)
        for (const a of alsoProvided(inv, rowId, connectors)) out.notes.push(existing.twoServers(row.label, a.owner));
    }
    // a target answered 'Leave it on its own' gets no change (Ruling 9)
    const leftNow = new Set(Object.entries(answers.existing || {}).filter(([, choice]) => choice === 'own').map(([key]) => key));
    for (const [key, pick] of Object.entries(answers.change || {}))
    {
        if (leftNow.has(key)) { out.unchanged.push(`${key}: left on its own`); continue; }
        planChange(key, { ...(pick || {}), keyName: keyNames[key], settings: settings[key], urlNames: urlNamesOf[key] || (pick || {}).urlNames }, inv, ctx, catalog, out);
    }
    for (const r of answers.remove || []) planRemove(r, inv, catalog, out);
    planExisting(answers, inv, ctx, catalog, out, connectors);
    planRootChange(answers, inv, ctx, catalog, out);
    // the file steps first, the records last (D8): a failed add leaves files a re-run finds in place
    // a root change's moved list is the list from here on: its writes and Cursor's read it at its new path
    const listInv = movedLists(inv, ctx.rootMoves);
    const files = fileSteps(listInv, ctx, out, out.steps);
    const moves = ctx.rootMoves.map((m) => ({ op: 'move-root-file', from: m.from, to: m.to, why: `the ${m.family} root moves: ${m.name} goes with it` }));
    const ignores = files.before.filter((x) => x.op === 'root-ignore');
    out.steps = [...ignores, ...moves, ...files.before.filter((x) => x.op !== 'root-ignore'), ...out.steps, ...files.after];
    // Cursor's files from the lists, after the list-write steps they read (spec D2)
    const cursor = cursorSteps(listInv, { ...ctx, catalog }, out, answers);
    // the read guard (ruling 13): one deny-read, last before the list-write steps
    const deny = denyReadSteps(out.steps, ctx, out);
    if (deny.length) { const at = out.steps.findIndex((x) => x.op === 'list-write'); out.steps.splice(at < 0 ? out.steps.length : at, 0, ...deny); }
    // each name Cursor's file holds that no answer settles: its question, which the command asks before planning again
    if (out.taken) { out.cursorNames = out.taken.map((t) => cursorNameQuestion(t)); delete out.taken; }
    // .mcp.json in the catalog's order, last of all (spec F5, F8)
    out.steps = mcpOrder.withOrderStep([...out.steps, ...cursor], inv.project, mcpOrder.ownProjectNames(inv, answers.existing));
    out.noop = out.steps.length === 0 && out.errors.length === 0;
    return out;
}

module.exports = { plan, deepEqual };
