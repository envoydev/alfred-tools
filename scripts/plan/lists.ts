// THE LIST STEPS - what a plan writes into each family's <root>/mcps.json (spec D1, 0.5.0). Nothing here changes
// anything: apply.ts's list-write step does, and only for the registrations the apply wrote and read back.
//
// One list-write per list file the plan touches: an upsert per mcp-add, mcp-replace and mcp-move (filled at apply from
// the registration as read), a drop per mcp-remove and per server that leaves a list (a move, a root change), and the
// servers the user left on their own (`own`), with this run's answers applied - the 0.4.x record's rules (spec F4).
// The first plan that writes a family with no list yet imports it, as list-import does: every managed registration of
// the family joins the list as read, and the 0.4.x record's own entries move into it, the record itself moved aside.
import { pathFor } from '../entries/platform.ts';
import * as catalogLib from '../catalog/catalog.ts';
import * as roots from '../roots/roots.ts';
import * as keys from '../keys/keys.ts';
import * as lists from '../mcps-list/mcps-list.ts';
import type path from 'node:path';
import type { Catalog } from '../catalog/types.ts';
import type { Inventory } from '../inventory/types.ts';
import type { ListServer, OwnEntry } from '../mcps-list/types.ts';
import type { Family } from '../roots/types.ts';
import type { FileStep, ListWriteStep, FoundList, ListCtx, ListPlan, PlannedServer, PlanOut, PlanStep, RegistrationStep } from './types.ts';

export const REG_OPS = ['mcp-add', 'mcp-replace', 'mcp-move', 'mcp-remove'];

// A list as found: the inventory's read for its file, else the disk's; a family with no list yet reads its 0.4.x record
// beside it. -> null | { servers, own, state? }
export function foundList(inventory: Inventory, file: string, pathApi: path.PlatformPath): FoundList | null
{
    for (const family of ['project', 'global'])
    {
        const familyList = inventory.lists && inventory.lists[family];
        if (familyList && familyList.file === file) return familyList.note ? { servers: [], own: [], state: 'noted' } : { servers: familyList.servers || [], own: familyList.own || [] };
    }
    const list = lists.readList(file);
    if (list) return list.state ? { servers: [], own: [], state: list.state } : { servers: list.servers, own: list.own };
    const old = lists.readOldRecord(pathApi.join(pathApi.dirname(file), roots.FILES.record));
    if (old) return old.state ? { servers: [], own: [], state: old.state } : { servers: [], own: old.servers };
    return null;
}

// The managed registrations of a family that its list does not name yet (list-import, and a plan's first touch): each
// as read, kept (every key value the marker), with clients claude. A registration on its own is not one, unless this
// run's `answers` (mcp key -> 'own' | 'manage') hand it back. opts: { answers, roots: { project, global } }
export function importUnlisted(inventory: Inventory, family: Family, catalog: Catalog, { answers = {}, roots: rootFolders = {} }: { answers?: Record<string, string | undefined>; roots?: { project?: string | null | undefined; global?: string | null | undefined } } = {}): ListServer[]
{
    const familyList = inventory.lists && inventory.lists[family];
    const listed = new Set(familyList && !familyList.old && !familyList.note ? (familyList.servers || []).map(lists.serverKey) : []);
    return (inventory.registrations || [])
        .filter((registration) => registration.rowId && !registration.own && !registration.alfredRetired && registration.scope !== 'inherited' && roots.familyOf(registration.scope) === family)
        .filter((registration) =>
        {
            const key = lists.serverKey(registration);
            const answer = answers[key];
            return !listed.has(key) && (answer ? answer !== 'own' : registration.choice !== 'own');
        })
        .map((registration) => lists.fromRegistration(registration, catalog.byId.get(registration.rowId!), ['claude'], keys.stdioChain({ scope: registration.scope, projectRoot: rootFolders.project, globalRoot: rootFolders.global })));
}

const ownChanged = (foundEntry: FoundList | null, next: OwnEntry[]): boolean => (!foundEntry || foundEntry.state ? next.length > 0 : JSON.stringify(next) !== JSON.stringify(foundEntry.own));

// The list-write steps of a plan. `regSteps`: the plan's steps; its registration steps give the upserts and drops. The
// own part runs only for a plan that read the answers (`ctx.recordLive`): fix.ts has none.
export function listSteps(inventory: Inventory, context: ListCtx, out: Pick<PlanOut, 'notes'>, regSteps: PlanStep[] = []): (ListWriteStep | FileStep)[]
{
    const pathApi = pathFor(context.platform);
    const fileIn = (dir: string): string => pathApi.join(dir, roots.FILES.list);
    const map = (inventory.roots && inventory.roots.map) || null;
    const mapped = map && map.projects ? map.projects[roots.mapKey(context.project)] : null;
    const inUse = inventory.roots && inventory.roots.project ? inventory.roots.project.path : null;
    const mine = new Set(([mapped, inUse, context.roots && context.roots.project, ...roots.standard('project', context).map((standardRoot) => standardRoot.root)].filter(Boolean) as string[]).map(fileIn));
    const targets: Record<string, string | null> = { project: null, global: null };
    for (const family of Object.keys(targets)) if (context.roots && context.roots[family as Family]) targets[family] = fileIn(context.roots[family as Family]!);
    const current = (family: string) => (inventory.lists && inventory.lists[family] && !inventory.lists[family].note ? inventory.lists[family] : null);

    // every list file this run may touch, with the family it belongs to
    const found = new Map<string, { list: FoundList | null; family: string }>();
    const seen = (file: string | null | undefined, family: string) => { if (file && !found.has(file)) found.set(file, { list: foundList(inventory, file, pathApi), family }); };
    for (const family of Object.keys(targets)) seen(targets[family], family);
    if (context.recordLive)
        for (const family of ['project', 'global'])
        {
            seen(inventory.lists && inventory.lists[family] && inventory.lists[family].file, family);
            for (const file of lists.listFiles(inventory, family as Family, context)) seen(file, family);
        }
    const plans = new Map<string, ListPlan>();
    const at = (file: string, family: string): ListPlan =>
    {
        if (!plans.has(file)) plans.set(file, { family, upserts: [], drops: [], own: null });
        return plans.get(file)!;
    };

    // the registrations this plan writes or removes
    for (const step of regSteps.filter((candidate): candidate is RegistrationStep => REG_OPS.includes(candidate.op)))
    {
        const after = lists.regKey(step);
        if (!after) continue;
        if (step.op === 'mcp-remove')
        {
            const removedFamily = roots.familyOf(step.scope);
            const removedList = current(removedFamily);
            if (removedList && removedList.servers.some((candidate) => lists.serverKey(candidate) === after)) at(removedList.file, removedFamily).drops.push({ key: after, after });
            continue;
        }
        const to = step.op === 'mcp-move' ? step.to : { name: step.name, scope: step.scope };
        const from = step.op === 'mcp-move' ? step.from : to;
        const family = roots.familyOf(to.scope);
        const fromFam = roots.familyOf(from.scope);
        const fromKey = lists.serverKey(from);
        const currentList = current(fromFam);
        const prior = currentList ? currentList.servers.find((candidate) => lists.serverKey(candidate) === fromKey) : null;
        if (prior && (currentList!.file !== (targets[family] || currentList!.file) || fromKey !== after)) at(currentList!.file, fromFam).drops.push({ key: fromKey, after });
        const file = targets[family] || (current(family) && current(family)!.file);
        if (!file) continue;
        const { entry: _entry, ...was } = (prior || {}) as Partial<ListServer>;
        const clients = (context.clientsFor && context.clientsFor.get(after)) || was.clients || ['claude'];
        const form = context.formFor ? context.formFor.get(after) : undefined;
        const server: PlannedServer = { ...was, name: to.name, scope: to.scope, row: step.row || was.row || null, route: step.route || was.route || null, clients, entry: null, key: was.key === undefined ? null : was.key, ...(form !== undefined ? { form } : {}) };
        const keyFiles = keys.stdioChain({ scope: to.scope, projectRoot: context.roots && context.roots.project, globalRoot: context.roots && context.roots.global });
        at(file, family).upserts.push({ server, after, cursorFile: null, ...(keyFiles.length ? { keyFiles } : {}) });
        if (!found.has(file)) found.set(file, { list: foundList(inventory, file, pathApi), family: family });
    }

    // a configure change of the apps alone (spec D3): the list entry with its new clients, no registration step - the
    // entry as listed, or the registration as read when the list does not hold it yet
    for (const { key, clients, form } of context.clientsOnly || [])
    {
        const cut = key.lastIndexOf('~');
        if (!key.startsWith('mcp:') || cut < 0) continue;
        const name = key.slice(4, cut);
        const scope = key.slice(cut + 1);
        const family = roots.familyOf(scope);
        const currentList = current(family);
        const prior = currentList ? currentList.servers.find((candidate) => lists.serverKey(candidate) === key) : null;
        const file = prior ? currentList!.file : targets[family] || (currentList && currentList.file);
        if (!file) continue;
        let server: PlannedServer | null = prior ? { ...prior, clients } : null;
        if (!server)
        {
            const registration = (inventory.registrations || []).find((candidate) => candidate.name === name && candidate.scope === scope && candidate.rowId && !candidate.own);
            const catalog = context.catalog || catalogLib.load();
            if (!registration) continue;
            server = lists.fromRegistration(registration, catalog.byId.get(registration.rowId!), clients, keys.stdioChain({ scope, projectRoot: context.roots && context.roots.project, globalRoot: context.roots && context.roots.global }));
        }
        if (form !== undefined) server.form = form;
        at(file, family).upserts.push({ server, after: null, cursorFile: null });
        if (!found.has(file)) found.set(file, { list: foundList(inventory, file, pathApi), family: family });
    }

    // the servers left on their own (spec F4): each list's own entries, with this run's answers applied, go to their
    // family's list; a project entry in a list that is not this project's own stays where it is, named in a note
    if (context.recordLive)
    {
        const entries = new Map<string, { ownEntry: OwnEntry; from: string | null }>();
        const keep = new Map<string, OwnEntry[]>();
        for (const [file, { list: foundEntry }] of found)
        {
            if (!foundEntry || foundEntry.state) continue;
            for (const ownEntry of roots.ownOnly(foundEntry.own))
            {
                const key = roots.recordKey(ownEntry);
                if (!key) continue;
                if (roots.recordFamily(ownEntry) === 'project' && !mine.has(file))
                {
                    keep.set(file, [...(keep.get(file) || []), ownEntry]);
                    out.notes.push(`${file} holds ${ownEntry.name || `${ownEntry.plugin}/${ownEntry.server}`} (${ownEntry.scope || 'a plugin'}), left on its own in another project - it stays there; remove it there to hand it back`);
                    continue;
                }
                entries.set(key, { ownEntry: ownEntry, from: file });
            }
        }
        for (const family of ['project', 'global'])
            for (const ownEntry of (context.recordEntries && context.recordEntries[family]) || [])
            {
                const key = roots.recordKey(ownEntry);
                if (ownEntry.choice === 'own') entries.set(key!, { ownEntry: ownEntry, from: null });
                else entries.delete(key!);
            }
        const planned = new Map([...found.keys()].map((file): [string, { entries: OwnEntry[]; keep: OwnEntry[] }] => [file, { entries: [], keep: keep.get(file) || [] }]));
        for (const { ownEntry: ownEntry, from } of entries.values())
        {
            // a family with no root this run (the roots answer's error is in the plan): the entry stays in its file
            const file = targets[roots.recordFamily(ownEntry)] || from;
            if (file) planned.get(file)!.entries.push(ownEntry);
        }
        for (const [file, want] of planned)
        {
            const own = { entries: want.entries, keep: want.keep, live: context.recordLive };
            const next = lists.ownOf(own);
            const { list: foundEntry, family } = found.get(file)!;
            if (ownChanged(foundEntry, next)) at(file, family).own = own;
            if (plans.has(file)) plans.get(file)!.next = next;
        }
    }

    // the first touch: a family this plan writes that has no list yet is imported as list-import does
    const retire: FileStep[] = [];
    const answers: Record<string, string | undefined> = {};
    for (const family of ['project', 'global']) for (const ownEntry of (context.recordEntries && context.recordEntries[family]) || []) answers[roots.recordKey(ownEntry)!] = ownEntry.choice;
    const taken = new Set([...regSteps.filter((step): step is RegistrationStep => REG_OPS.includes(step.op)).flatMap((step) => [lists.regKey(step), step.op === 'mcp-move' && step.from ? lists.serverKey(step.from) : null]), ...(context.clientsOnly || []).map((clientsChange) => clientsChange.key)].filter(Boolean));
    for (const family of ['project', 'global'])
    {
        const familyList = inventory.lists && inventory.lists[family];
        if (!targets[family] || !plans.has(targets[family]!) || (familyList && (!familyList.old || familyList.note))) continue;
        const listPlan = plans.get(targets[family]!)!;
        for (const server of importUnlisted(inventory, family as Family, context.catalog || catalogLib.load(), { answers, roots: context.roots || {} }))
            if (!taken.has(lists.serverKey(server))) listPlan.upserts.push({ server, after: null, cursorFile: null });
        if (familyList && familyList.old) retire.push({ op: 'retire-record', file: familyList.old, why: `${familyList.old}: the 0.4.x record - its entries are in ${targets[family]} now, so it is moved aside as ${roots.FILES.record}.0.4.bak` });
    }

    const steps: ListWriteStep[] = [];
    for (const [file, listPlan] of plans)
    {
        const { list: foundEntry } = found.get(file) || { list: null };
        const target = targets[listPlan.family] === file;
        const dropped = new Set(listPlan.drops.map((drop) => drop.key));
        const left = ((foundEntry && foundEntry.servers) || []).filter((server) => !dropped.has(lists.serverKey(server)));
        const own = listPlan.next || (foundEntry && foundEntry.own) || [];
        const empty = !listPlan.upserts.length && !left.length && !own.length;
        if (target && !empty) context.uses.push({ family: listPlan.family, root: context.roots![listPlan.family as Family]! });
        steps.push({ op: 'list-write', file, family: listPlan.family, upserts: listPlan.upserts, drops: listPlan.drops, own: listPlan.own, ...(empty ? { empty: true } : {}), why: `${file}: the servers preferred-tools manages, and the ones you left on their own - configure, update and fix skip those. Remove an entry from its own list, or the file, to hand them back.` });
    }
    return [...steps, ...retire];
}

