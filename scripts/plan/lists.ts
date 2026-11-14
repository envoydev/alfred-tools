// THE LIST STEPS - what a plan writes into each family's <root>/mcps.json (spec D1, 0.5.0). Nothing here changes
// anything: apply.js's list-write step does, and only for the registrations the apply wrote and read back.
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
export function foundList(inv: Inventory, file: string, P: path.PlatformPath): FoundList | null
{
    for (const family of ['project', 'global'])
    {
        const l = inv.lists && inv.lists[family];
        if (l && l.file === file) return l.note ? { servers: [], own: [], state: 'noted' } : { servers: l.servers || [], own: l.own || [] };
    }
    const l = lists.readList(file);
    if (l) return l.state ? { servers: [], own: [], state: l.state } : { servers: l.servers, own: l.own };
    const old = lists.readOldRecord(P.join(P.dirname(file), roots.FILES.record));
    if (old) return old.state ? { servers: [], own: [], state: old.state } : { servers: [], own: old.servers };
    return null;
}

// The managed registrations of a family that its list does not name yet (list-import, and a plan's first touch): each
// as read, kept (every key value the marker), with clients claude. A registration on its own is not one, unless this
// run's `answers` (mcp key -> 'own' | 'manage') hand it back. opts: { answers, roots: { project, global } }
export function importUnlisted(inv: Inventory, family: Family, catalog: Catalog, { answers = {}, roots: r = {} }: { answers?: Record<string, string | undefined>; roots?: { project?: string | null | undefined; global?: string | null | undefined } } = {}): ListServer[]
{
    const l = inv.lists && inv.lists[family];
    const listed = new Set(l && !l.old && !l.note ? (l.servers || []).map(lists.serverKey) : []);
    return (inv.registrations || [])
        .filter((x) => x.rowId && !x.own && !x.alfredRetired && x.scope !== 'inherited' && roots.familyOf(x.scope) === family)
        .filter((x) =>
        {
            const key = lists.serverKey(x);
            const answer = answers[key];
            return !listed.has(key) && (answer ? answer !== 'own' : x.choice !== 'own');
        })
        .map((x) => lists.fromRegistration(x, catalog.byId.get(x.rowId!), ['claude'], keys.stdioChain({ scope: x.scope, projectRoot: r.project, globalRoot: r.global })));
}

const ownChanged = (rec: FoundList | null, next: OwnEntry[]): boolean => (!rec || rec.state ? next.length > 0 : JSON.stringify(next) !== JSON.stringify(rec.own));

// The list-write steps of a plan. `regSteps`: the plan's steps; its registration steps give the upserts and drops. The
// own part runs only for a plan that read the answers (`ctx.recordLive`): fix.js has none.
export function listSteps(inv: Inventory, ctx: ListCtx, out: Pick<PlanOut, 'notes'>, regSteps: PlanStep[] = []): (ListWriteStep | FileStep)[]
{
    const P = pathFor(ctx.platform);
    const fileIn = (dir: string): string => P.join(dir, roots.FILES.list);
    const map = (inv.roots && inv.roots.map) || null;
    const mapped = map && map.projects ? map.projects[roots.mapKey(ctx.project)] : null;
    const inUse = inv.roots && inv.roots.project ? inv.roots.project.path : null;
    const mine = new Set(([mapped, inUse, ctx.roots && ctx.roots.project, ...roots.standard('project', ctx).map((x) => x.root)].filter(Boolean) as string[]).map(fileIn));
    const targets: Record<string, string | null> = { project: null, global: null };
    for (const family of Object.keys(targets)) if (ctx.roots && ctx.roots[family as Family]) targets[family] = fileIn(ctx.roots[family as Family]!);
    const current = (family: string) => (inv.lists && inv.lists[family] && !inv.lists[family].note ? inv.lists[family] : null);

    // every list file this run may touch, with the family it belongs to
    const found = new Map<string, { rec: FoundList | null; family: string }>();
    const seen = (file: string | null | undefined, family: string) => { if (file && !found.has(file)) found.set(file, { rec: foundList(inv, file, P), family }); };
    for (const family of Object.keys(targets)) seen(targets[family], family);
    if (ctx.recordLive)
        for (const family of ['project', 'global'])
        {
            seen(inv.lists && inv.lists[family] && inv.lists[family].file, family);
            for (const file of lists.listFiles(inv, family as Family, ctx)) seen(file, family);
        }
    const plans = new Map<string, ListPlan>();
    const at = (file: string, family: string): ListPlan =>
    {
        if (!plans.has(file)) plans.set(file, { family, upserts: [], drops: [], own: null });
        return plans.get(file)!;
    };

    // the registrations this plan writes or removes
    for (const s of regSteps.filter((x): x is RegistrationStep => REG_OPS.includes(x.op)))
    {
        const after = lists.regKey(s);
        if (!after) continue;
        if (s.op === 'mcp-remove')
        {
            const fam = roots.familyOf(s.scope);
            const cur = current(fam);
            if (cur && cur.servers.some((x) => lists.serverKey(x) === after)) at(cur.file, fam).drops.push({ key: after, after });
            continue;
        }
        const to = s.op === 'mcp-move' ? s.to : { name: s.name, scope: s.scope };
        const from = s.op === 'mcp-move' ? s.from : to;
        const fam = roots.familyOf(to.scope);
        const fromFam = roots.familyOf(from.scope);
        const fromKey = lists.serverKey(from);
        const cur = current(fromFam);
        const prior = cur ? cur.servers.find((x) => lists.serverKey(x) === fromKey) : null;
        if (prior && (cur!.file !== (targets[fam] || cur!.file) || fromKey !== after)) at(cur!.file, fromFam).drops.push({ key: fromKey, after });
        const file = targets[fam] || (current(fam) && current(fam)!.file);
        if (!file) continue;
        const { entry: _entry, ...was } = (prior || {}) as Partial<ListServer>;
        const clients = (ctx.clientsFor && ctx.clientsFor.get(after)) || was.clients || ['claude'];
        const form = ctx.formFor ? ctx.formFor.get(after) : undefined;
        const server: PlannedServer = { ...was, name: to.name, scope: to.scope, row: s.row || was.row || null, route: s.route || was.route || null, clients, entry: null, key: was.key === undefined ? null : was.key, ...(form !== undefined ? { form } : {}) };
        const keyFiles = keys.stdioChain({ scope: to.scope, projectRoot: ctx.roots && ctx.roots.project, globalRoot: ctx.roots && ctx.roots.global });
        at(file, fam).upserts.push({ server, after, cursorFile: null, ...(keyFiles.length ? { keyFiles } : {}) });
        if (!found.has(file)) found.set(file, { rec: foundList(inv, file, P), family: fam });
    }

    // a configure change of the apps alone (spec D3): the list entry with its new clients, no registration step - the
    // entry as listed, or the registration as read when the list does not hold it yet
    for (const { key, clients, form } of ctx.clientsOnly || [])
    {
        const cut = key.lastIndexOf('~');
        if (!key.startsWith('mcp:') || cut < 0) continue;
        const name = key.slice(4, cut);
        const scope = key.slice(cut + 1);
        const fam = roots.familyOf(scope);
        const cur = current(fam);
        const prior = cur ? cur.servers.find((x) => lists.serverKey(x) === key) : null;
        const file = prior ? cur!.file : targets[fam] || (cur && cur.file);
        if (!file) continue;
        let server: PlannedServer | null = prior ? { ...prior, clients } : null;
        if (!server)
        {
            const reg = (inv.registrations || []).find((x) => x.name === name && x.scope === scope && x.rowId && !x.own);
            const catalog = ctx.catalog || catalogLib.load();
            if (!reg) continue;
            server = lists.fromRegistration(reg, catalog.byId.get(reg.rowId!), clients, keys.stdioChain({ scope, projectRoot: ctx.roots && ctx.roots.project, globalRoot: ctx.roots && ctx.roots.global }));
        }
        if (form !== undefined) server.form = form;
        at(file, fam).upserts.push({ server, after: null, cursorFile: null });
        if (!found.has(file)) found.set(file, { rec: foundList(inv, file, P), family: fam });
    }

    // the servers left on their own (spec F4): each list's own entries, with this run's answers applied, go to their
    // family's list; a project entry in a list that is not this project's own stays where it is, named in a note
    if (ctx.recordLive)
    {
        const entries = new Map<string, { e: OwnEntry; from: string | null }>();
        const keep = new Map<string, OwnEntry[]>();
        for (const [file, { rec }] of found)
        {
            if (!rec || rec.state) continue;
            for (const e of roots.ownOnly(rec.own))
            {
                const key = roots.recordKey(e);
                if (!key) continue;
                if (roots.recordFamily(e) === 'project' && !mine.has(file))
                {
                    keep.set(file, [...(keep.get(file) || []), e]);
                    out.notes.push(`${file} holds ${e.name || `${e.plugin}/${e.server}`} (${e.scope || 'a plugin'}), left on its own in another project - it stays there; remove it there to hand it back`);
                    continue;
                }
                entries.set(key, { e, from: file });
            }
        }
        for (const family of ['project', 'global'])
            for (const e of (ctx.recordEntries && ctx.recordEntries[family]) || [])
            {
                const key = roots.recordKey(e);
                if (e.choice === 'own') entries.set(key!, { e, from: null });
                else entries.delete(key!);
            }
        const planned = new Map([...found.keys()].map((f): [string, { entries: OwnEntry[]; keep: OwnEntry[] }] => [f, { entries: [], keep: keep.get(f) || [] }]));
        for (const { e, from } of entries.values())
        {
            // a family with no root this run (the roots answer's error is in the plan): the entry stays in its file
            const file = targets[roots.recordFamily(e)] || from;
            if (file) planned.get(file)!.entries.push(e);
        }
        for (const [file, want] of planned)
        {
            const own = { entries: want.entries, keep: want.keep, live: ctx.recordLive };
            const next = lists.ownOf(own);
            const { rec, family } = found.get(file)!;
            if (ownChanged(rec, next)) at(file, family).own = own;
            if (plans.has(file)) plans.get(file)!.next = next;
        }
    }

    // the first touch: a family this plan writes that has no list yet is imported as list-import does
    const retire: FileStep[] = [];
    const answers: Record<string, string | undefined> = {};
    for (const family of ['project', 'global']) for (const e of (ctx.recordEntries && ctx.recordEntries[family]) || []) answers[roots.recordKey(e)!] = e.choice;
    const taken = new Set([...regSteps.filter((x): x is RegistrationStep => REG_OPS.includes(x.op)).flatMap((x) => [lists.regKey(x), x.op === 'mcp-move' && x.from ? lists.serverKey(x.from) : null]), ...(ctx.clientsOnly || []).map((c) => c.key)].filter(Boolean));
    for (const family of ['project', 'global'])
    {
        const l = inv.lists && inv.lists[family];
        if (!targets[family] || !plans.has(targets[family]!) || (l && (!l.old || l.note))) continue;
        const p = plans.get(targets[family]!)!;
        for (const server of importUnlisted(inv, family as Family, ctx.catalog || catalogLib.load(), { answers, roots: ctx.roots || {} }))
            if (!taken.has(lists.serverKey(server))) p.upserts.push({ server, after: null, cursorFile: null });
        if (l && l.old) retire.push({ op: 'retire-record', file: l.old, why: `${l.old}: the 0.4.x record - its entries are in ${targets[family]} now, so it is moved aside as ${roots.FILES.record}.0.4.bak` });
    }

    const steps: ListWriteStep[] = [];
    for (const [file, p] of plans)
    {
        const { rec } = found.get(file) || { rec: null };
        const target = targets[p.family] === file;
        const dropped = new Set(p.drops.map((d) => d.key));
        const left = ((rec && rec.servers) || []).filter((x) => !dropped.has(lists.serverKey(x)));
        const own = p.next || (rec && rec.own) || [];
        const empty = !p.upserts.length && !left.length && !own.length;
        if (target && !empty) ctx.uses.push({ family: p.family, root: ctx.roots![p.family as Family]! });
        steps.push({ op: 'list-write', file, family: p.family, upserts: p.upserts, drops: p.drops, own: p.own, ...(empty ? { empty: true } : {}), why: `${file}: the servers preferred-tools manages, and the ones you left on their own - configure, update and fix skip those. Remove an entry from its own list, or the file, to hand them back.` });
    }
    return [...steps, ...retire];
}

