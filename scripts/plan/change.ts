// One configure change: an installed registration by its key, and a root folder's change.
import fs from 'node:fs';
import { pathFor } from '../entries/platform.ts';
import { logicalRoot, formatRoot } from '../entries/locations.ts';
import { currentOf, helperParts } from '../entries/entry.ts';
import { heldKey } from './asks-keys.ts';
import * as keys from '../keys/keys.ts';
import * as roots from '../roots/roots.ts';
import * as existing from '../inventory/existing.ts';
import { keyOf, targetOf } from '../inventory/inventory.ts';
import { planMcp } from './pick.ts';
import type { Catalog } from '../catalog/types.ts';
import type { Inventory, InvList, InvRegistration, PluginRow } from '../inventory/types.ts';
import type { Family } from '../roots/types.ts';
import type { Answers, PickAnswer, Plan, PlanCtx, RemoveAnswer, RootMove } from './types.ts';

// ---- one configure change: an installed registration, by its key ----------------------------------------------------

export function planChange(key: string, pick: PickAnswer, inventory: Inventory, context: PlanCtx, catalog: Catalog, out: Plan): number | undefined
{
    const target = targetOf(inventory, key);
    if (!target) return out.errors.push(`change: nothing is installed as '${key}' (a key is mcp:<name>~<scope>)`);
    if (target.kind !== 'mcp') return out.errors.push(`change: '${key}' is a plugin - the catalog lists none since 0.5.0, so it is not changed here`);
    if (!target.item.rowId) return out.errors.push(`change: '${(target.item as InvRegistration).name || (target.item as PluginRow).id}' is your own (it matches no catalog row) - left alone`);
    if (target.item.alfredRetired) return out.errors.push(`change: '${(target.item as InvRegistration).name || (target.item as PluginRow).id}' is alfred-code's (retired) - left alone`);
    const row = catalog.byId.get(target.item.rowId);
    const { row: _row, ...answers } = pick;
    return planMcp(row!, { ...answers, target: { name: (target.item as InvRegistration).name, scope: target.item.scope } }, inventory, context, catalog, out);
}

// configure's 'Change the root' (spec D7, R3): each managed registration of the family is re-added as read, its data
// folder - when it sits in the old root - and its helper in the new root; the new root gets its .gitignore, the helper,
// the names in use (names only) and the record, and the roots map points at it. No data and no key value moves.
export function planRootChange(answers: Answers, inventory: Inventory, context: PlanCtx, catalog: Catalog, out: Plan): void
{
    const pathApi = pathFor(context.platform);
    for (const family of answers.rootChange || [])
    {
        if (!['project', 'global'].includes(family)) { out.errors.push(`rootChange: '${family}' is not a root family - project or global`); continue; }
        const next = context.roots && context.roots[family as Family];
        if (!next) continue; // the roots answer's error is already in the plan
        const used = inventory.roots && Object.hasOwn(inventory.roots, family) ? inventory.roots[family as Family] : roots.inUse(inventory, family as Family, { ...context, catalog });
        if (!used) { out.unchanged.push(`rootChange: no ${family} root is in use here - nothing to move`); continue; }
        if (used.path === next) { out.unchanged.push(`rootChange: the ${family} root is already ${next}`); continue; }
        const inOld = (filePath: string): boolean => { const rel = pathApi.relative(used.path, filePath); return rel === '' || (!rel.startsWith('..') && !pathApi.isAbsolute(rel)); };
        // the root's own files move with it (D1): the list, serena's context and mcp-remote's sign-in folder - each that is
        // there, renamed whole, before any registration names the new root
        const exists = context.exists || ((filePath: string) => fs.existsSync(filePath));
        const list = inventory.lists && inventory.lists[family];
        for (const fileName of [roots.FILES.list, roots.FILES.serenaContext, roots.FILES.signIns])
        {
            const from = pathApi.join(used.path, fileName);
            if (fileName === roots.FILES.list && (!list || list.note || list.old || list.file !== from)) continue;
            if (exists(from)) context.rootMoves.push({ family, name: fileName, from, to: pathApi.join(next, fileName) });
        }
        const scopes = family === 'global' ? ['user'] : ['project', 'local'];
        const secretsOld = pathApi.join(used.path, roots.FILES.secrets);
        const secretsNew = pathApi.join(next, roots.FILES.secrets);
        let keyed = false;
        context.uses.push({ family, root: next });
        for (const registration of inventory.registrations.filter((candidate) => candidate.rowId && !candidate.own && !candidate.alfredRetired && candidate.choice !== 'own' && scopes.includes(candidate.scope)))
        {
            const row = catalog.byId.get(registration.rowId!);
            // a target changed in this run is planned there, into the new root as well
            if (!row || row.kind !== 'mcp' || context.changing.has(keyOf('mcp', registration.name, registration.scope))) continue;
            const current = currentOf(row, registration);
            const dataAbs = row.locations && current.rootStr ? formatRoot(logicalRoot(current.rootStr, context), 'local', context).value : null;
            const moves = Boolean(dataAbs) && inOld(dataAbs!);
            planMcp(row, { target: { name: registration.name, scope: registration.scope }, ...(moves ? { location: { side: family === 'global' ? 'account' : 'project' } } : {}) }, inventory, context, catalog, out);
            // the name its key goes under: the helper's argument, else the name holding the key it holds, else the catalog's
            const route = row.routes[current.route!];
            let name = route && route.helper ? current.keyName : null;
            if (route && !route.helper && route.tokenVar && keys.tokenFields(registration.entry, route).length)
            {
                const held = heldKey(context.readLive(registration.name, registration.scope) || registration.entry, route);
                name = held ? keys.nameOfValue([secretsOld], held) || route.tokenVar : null;
            }
            if (!name) continue;
            context.uses.push({ family, root: next, key: { file: secretsNew, name } });
            keyed = true;
        }
        if (keyed) out.notes.push(`copy the values from ${secretsOld} to ${secretsNew} yourself - until then those servers connect without their keys`);
        // a local helper's third argument names a named global root: this project's are re-pointed (or lose it, for a
        // standard root the helper reads itself); a local server elsewhere is configured in its own project
        if (family === 'global' && !roots.standard('global', context).some((standardRoot) => standardRoot.root === used.path))
        {
            for (const registration of inventory.registrations.filter((candidate) => candidate.rowId && !candidate.own && !candidate.alfredRetired && candidate.choice !== 'own' && candidate.scope === 'local'))
            {
                const parts = helperParts(registration.entry && registration.entry.headersHelper);
                const row = catalog.byId.get(registration.rowId!);
                if (!row || !parts || parts.args.length < 3 || context.changing.has(keyOf('mcp', registration.name, registration.scope))) continue;
                if (pathApi.resolve(roots.absOf(parts.args[2], context)) !== pathApi.resolve(used.path)) continue;
                planMcp(row, { target: { name: registration.name, scope: registration.scope } }, inventory, context, catalog, out);
            }
            out.notes.push(`a local server in another project whose helper names ${used.path} keeps reading its .mcps-secrets until /preferred-tools:configure runs there`);
        }
    }
}

// The inventory with each moved list at its new path (planRootChange's moves).
export function movedLists(inventory: Inventory, moves: RootMove[] | null | undefined): Inventory
{
    const listMoves = (moves || []).filter((move) => move.name === roots.FILES.list);
    if (!listMoves.length) return inventory;
    const next = { ...inventory, lists: { ...inventory.lists } } as Inventory;
    for (const move of listMoves) next.lists![move.family] = { ...inventory.lists![move.family], file: move.to } as InvList;
    return next;
}

// The answers about the servers already set up (spec D6, F4), from configure: 'own' puts the server in its family's
// list's own, 'manage' or 'add' takes it out (plan/lists.ts). What is here now, so a list drops a server gone since.
export function planExisting(answers: Answers, inventory: Inventory, context: PlanCtx, catalog: Catalog, out: Plan, connectors: string[] | null): void
{
    context.recordEntries = { project: [], global: [] };
    for (const [key, choice] of Object.entries(answers.existing || {}))
    {
        const item = existing.itemOf(inventory, key, catalog);
        if (!item) { out.errors.push(`existing: '${key}' is not a server found here`); continue; }
        const allowed = existing.CHOICES[item.kind];
        if (!allowed.includes(choice)) { out.errors.push(`existing: '${choice}' is not an answer for ${key} - ${allowed.join(' or ')}`); continue; }
        context.recordEntries[item.family]!.push(existing.recordEntry(item, choice));
    }
    context.recordLive = existing.liveOf(inventory, catalog, connectors);
}

export function planRemove(removeAnswer: RemoveAnswer, inventory: Inventory, _catalog: Catalog, out: Plan): number | undefined
{
    if (removeAnswer.kind === 'plugin') return out.errors.push(`remove: ${removeAnswer.id} is a plugin - the catalog lists none since 0.5.0; claude plugin uninstall ${removeAnswer.id} --scope ${removeAnswer.scope} removes it`);
    const registration = inventory.registrations.find((candidate) => candidate.name === removeAnswer.name && candidate.scope === removeAnswer.scope);
    if (!registration) return out.errors.push(`remove: no registration '${removeAnswer.name}' at ${removeAnswer.scope} scope`);
    if (registration.own) return out.errors.push(`remove: '${removeAnswer.name}' is your own server (it matches no catalog row) - left alone`);
    if (registration.alfredRetired) return out.errors.push(`remove: '${removeAnswer.name}' is alfred-code's (retired) - left alone`);
    out.steps.push({ op: 'mcp-remove', name: removeAnswer.name!, scope: removeAnswer.scope, old: registration.entry, row: registration.rowId, why: `remove '${removeAnswer.name}' (${registration.rowId}) at ${removeAnswer.scope} scope` });
    return undefined;
}

