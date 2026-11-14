'use strict';
// One configure change: an installed registration by its key, and a root folder's change.
const fs = require('node:fs');
const { pathFor } = require('../entries/platform.js');
const { logicalRoot, formatRoot } = require('../entries/locations.js');
const { currentOf, helperParts } = require('../entries/entry.js');
const { heldKey } = require('./asks-keys.js');
const keys = require('../keys/keys.js');
const roots = require('../roots/roots.js');
const existing = require('../inventory/existing.js');
const { keyOf, targetOf } = require('../inventory/inventory.js');
const { planMcp } = require('./pick.js');

// ---- one configure change: an installed registration, by its key ----------------------------------------------------

function planChange(key, pick, inv, ctx, catalog, out)
{
    const t = targetOf(inv, key);
    if (!t) return out.errors.push(`change: nothing is installed as '${key}' (a key is mcp:<name>~<scope>)`);
    if (t.kind !== 'mcp') return out.errors.push(`change: '${key}' is a plugin - the catalog lists none since 0.5.0, so it is not changed here`);
    if (!t.item.rowId) return out.errors.push(`change: '${t.item.name || t.item.id}' is your own (it matches no catalog row) - left alone`);
    if (t.item.alfredRetired) return out.errors.push(`change: '${t.item.name || t.item.id}' is alfred-code's (retired) - left alone`);
    const row = catalog.byId.get(t.item.rowId);
    const { row: _row, ...answers } = pick;
    return planMcp(row, { ...answers, target: { name: t.item.name, scope: t.item.scope } }, inv, ctx, catalog, out);
}

// configure's 'Change the root' (spec D7, R3): each managed registration of the family is re-added as read, its data
// folder - when it sits in the old root - and its helper in the new root; the new root gets its .gitignore, the helper,
// the names in use (names only) and the record, and the roots map points at it. No data and no key value moves.
function planRootChange(answers, inv, ctx, catalog, out)
{
    const P = pathFor(ctx.platform);
    for (const family of answers.rootChange || [])
    {
        if (!['project', 'global'].includes(family)) { out.errors.push(`rootChange: '${family}' is not a root family - project or global`); continue; }
        const next = ctx.roots && ctx.roots[family];
        if (!next) continue; // the roots answer's error is already in the plan
        const used = inv.roots && Object.hasOwn(inv.roots, family) ? inv.roots[family] : roots.inUse(inv, family, { ...ctx, catalog });
        if (!used) { out.unchanged.push(`rootChange: no ${family} root is in use here - nothing to move`); continue; }
        if (used.path === next) { out.unchanged.push(`rootChange: the ${family} root is already ${next}`); continue; }
        const inOld = (p) => { const rel = P.relative(used.path, p); return rel === '' || (!rel.startsWith('..') && !P.isAbsolute(rel)); };
        // the root's own files move with it (D1): the list, serena's context and mcp-remote's sign-in folder - each that is
        // there, renamed whole, before any registration names the new root
        const exists = ctx.exists || ((x) => fs.existsSync(x));
        const list = inv.lists && inv.lists[family];
        for (const f of [roots.FILES.list, roots.FILES.serenaContext, roots.FILES.signIns])
        {
            const from = P.join(used.path, f);
            if (f === roots.FILES.list && (!list || list.note || list.old || list.file !== from)) continue;
            if (exists(from)) ctx.rootMoves.push({ family, name: f, from, to: P.join(next, f) });
        }
        const scopes = family === 'global' ? ['user'] : ['project', 'local'];
        const secretsOld = P.join(used.path, roots.FILES.secrets);
        const secretsNew = P.join(next, roots.FILES.secrets);
        let keyed = false;
        ctx.uses.push({ family, root: next });
        for (const r of inv.registrations.filter((x) => x.rowId && !x.own && !x.alfredRetired && x.choice !== 'own' && scopes.includes(x.scope)))
        {
            const row = catalog.byId.get(r.rowId);
            // a target changed in this run is planned there, into the new root as well
            if (!row || row.kind !== 'mcp' || ctx.changing.has(keyOf('mcp', r.name, r.scope))) continue;
            const cur = currentOf(row, r);
            const dataAbs = row.locations && cur.rootStr ? formatRoot(logicalRoot(cur.rootStr, ctx), 'local', ctx).value : null;
            const moves = Boolean(dataAbs) && inOld(dataAbs);
            planMcp(row, { target: { name: r.name, scope: r.scope }, ...(moves ? { location: { side: family === 'global' ? 'account' : 'project' } } : {}) }, inv, ctx, catalog, out);
            // the name its key goes under: the helper's argument, else the name holding the key it holds, else the catalog's
            const route = row.routes[cur.route];
            let name = route && route.helper ? cur.keyName : null;
            if (route && !route.helper && route.tokenVar && keys.tokenFields(r.entry, route).length)
            {
                const held = heldKey(ctx.readLive(r.name, r.scope) || r.entry, route);
                name = held ? keys.nameOfValue([secretsOld], held) || route.tokenVar : null;
            }
            if (!name) continue;
            ctx.uses.push({ family, root: next, key: { file: secretsNew, name } });
            keyed = true;
        }
        if (keyed) out.notes.push(`copy the values from ${secretsOld} to ${secretsNew} yourself - until then those servers connect without their keys`);
        // a local helper's third argument names a named global root: this project's are re-pointed (or lose it, for a
        // standard root the helper reads itself); a local server elsewhere is configured in its own project
        if (family === 'global' && !roots.standard('global', ctx).some((x) => x.root === used.path))
        {
            for (const r of inv.registrations.filter((x) => x.rowId && !x.own && !x.alfredRetired && x.choice !== 'own' && x.scope === 'local'))
            {
                const parts = helperParts(r.entry && r.entry.headersHelper);
                const row = catalog.byId.get(r.rowId);
                if (!row || !parts || parts.args.length < 3 || ctx.changing.has(keyOf('mcp', r.name, r.scope))) continue;
                if (P.resolve(roots.absOf(parts.args[2], ctx)) !== P.resolve(used.path)) continue;
                planMcp(row, { target: { name: r.name, scope: r.scope } }, inv, ctx, catalog, out);
            }
            out.notes.push(`a local server in another project whose helper names ${used.path} keeps reading its .mcps-secrets until /preferred-tools:configure runs there`);
        }
    }
}

// The inventory with each moved list at its new path (planRootChange's moves).
function movedLists(inv, moves)
{
    const listMoves = (moves || []).filter((m) => m.name === roots.FILES.list);
    if (!listMoves.length) return inv;
    const next = { ...inv, lists: { ...inv.lists } };
    for (const m of listMoves) next.lists[m.family] = { ...inv.lists[m.family], file: m.to };
    return next;
}

// The answers about the servers already set up (spec D6, F4), from configure: 'own' puts the server in its family's
// list's own, 'manage' or 'add' takes it out (plan-lists.js). What is here now, so a list drops a server gone since.
function planExisting(answers, inv, ctx, catalog, out, connectors)
{
    ctx.recordEntries = { project: [], global: [] };
    for (const [key, choice] of Object.entries(answers.existing || {}))
    {
        const item = existing.itemOf(inv, key, catalog);
        if (!item) { out.errors.push(`existing: '${key}' is not a server found here`); continue; }
        const allowed = existing.CHOICES[item.kind];
        if (!allowed.includes(choice)) { out.errors.push(`existing: '${choice}' is not an answer for ${key} - ${allowed.join(' or ')}`); continue; }
        ctx.recordEntries[item.family].push(existing.recordEntry(item, choice));
    }
    ctx.recordLive = existing.liveOf(inv, catalog, connectors);
}

function planRemove(r, inv, catalog, out)
{
    if (r.kind === 'plugin') return out.errors.push(`remove: ${r.id} is a plugin - the catalog lists none since 0.5.0; claude plugin uninstall ${r.id} --scope ${r.scope} removes it`);
    const reg = inv.registrations.find((x) => x.name === r.name && x.scope === r.scope);
    if (!reg) return out.errors.push(`remove: no registration '${r.name}' at ${r.scope} scope`);
    if (reg.own) return out.errors.push(`remove: '${r.name}' is your own server (it matches no catalog row) - left alone`);
    if (reg.alfredRetired) return out.errors.push(`remove: '${r.name}' is alfred-code's (retired) - left alone`);
    out.steps.push({ op: 'mcp-remove', name: r.name, scope: r.scope, old: reg.entry, row: reg.rowId, why: `remove '${r.name}' (${reg.rowId}) at ${r.scope} scope` });
    return undefined;
}

module.exports = { planChange, planRemove, planExisting, planRootChange, movedLists };
