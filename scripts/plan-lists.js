'use strict';
// THE LIST STEPS - what a plan writes into each family's <root>/mcps.json (spec D1, 0.5.0). Nothing here changes
// anything: apply.js's list-write step does, and only for the registrations the apply wrote and read back.
//
// One list-write per list file the plan touches: an upsert per mcp-add, mcp-replace and mcp-move (filled at apply from
// the registration as read), a drop per mcp-remove and per server that leaves a list (a move, a root change), and the
// servers the user left on their own (`own`), with this run's answers applied - the 0.4.x record's rules (spec F4).
const E = require('./entries.js');
const roots = require('./roots.js');
const keys = require('./keys.js');
const lists = require('./mcps-list.js');

const REG_OPS = ['mcp-add', 'mcp-replace', 'mcp-move', 'mcp-remove'];

// A list as found: the inventory's read for its file, else the disk's; a family with no list yet reads its 0.4.x record
// beside it. -> null | { servers, own, state? }
function foundList(inv, file, P)
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

const ownChanged = (rec, next) => (!rec || rec.state ? next.length > 0 : JSON.stringify(next) !== JSON.stringify(rec.own));

// The list-write steps of a plan. `regSteps`: the plan's steps; its registration steps give the upserts and drops. The
// own part runs only for a plan that read the answers (`ctx.recordLive`): fix.js has none.
function listSteps(inv, ctx, out, regSteps = [])
{
    const P = E.pathFor(ctx.platform);
    const fileIn = (dir) => P.join(dir, roots.FILES.list);
    const map = (inv.roots && inv.roots.map) || null;
    const mapped = map && map.projects ? map.projects[roots.mapKey(ctx.project)] : null;
    const inUse = inv.roots && inv.roots.project ? inv.roots.project.path : null;
    const mine = new Set([mapped, inUse, ctx.roots && ctx.roots.project, ...roots.standard('project', ctx).map((x) => x.root)].filter(Boolean).map(fileIn));
    const targets = { project: null, global: null };
    for (const family of Object.keys(targets)) if (ctx.roots && ctx.roots[family]) targets[family] = fileIn(ctx.roots[family]);
    const current = (family) => (inv.lists && inv.lists[family] && !inv.lists[family].note ? inv.lists[family] : null);

    // every list file this run may touch, with the family it belongs to
    const found = new Map();
    const seen = (file, family) => { if (file && !found.has(file)) found.set(file, { rec: foundList(inv, file, P), family }); };
    for (const family of Object.keys(targets)) seen(targets[family], family);
    if (ctx.recordLive)
        for (const family of ['project', 'global'])
        {
            seen(inv.lists && inv.lists[family] && inv.lists[family].file, family);
            for (const file of lists.listFiles(inv, family, ctx)) seen(file, family);
        }
    const plans = new Map();
    const at = (file, family) =>
    {
        if (!plans.has(file)) plans.set(file, { family, upserts: [], drops: [], own: null });
        return plans.get(file);
    };

    // the registrations this plan writes or removes
    for (const s of regSteps.filter((x) => REG_OPS.includes(x.op)))
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
        if (prior && (cur.file !== (targets[fam] || cur.file) || fromKey !== after)) at(cur.file, fromFam).drops.push({ key: fromKey, after });
        const file = targets[fam] || (current(fam) && current(fam).file);
        if (!file) continue;
        const { entry: _entry, ...was } = prior || {};
        const server = { ...was, name: to.name, scope: to.scope, row: s.row || was.row || null, route: s.route || was.route || null, clients: was.clients || ['claude'], entry: null, key: was.key === undefined ? null : was.key };
        const keyFiles = keys.stdioChain({ scope: to.scope, projectRoot: ctx.roots && ctx.roots.project, globalRoot: ctx.roots && ctx.roots.global });
        at(file, fam).upserts.push({ server, after, cursorFile: null, ...(keyFiles.length ? { keyFiles } : {}) });
        if (!found.has(file)) found.set(file, { rec: foundList(inv, file, P), family: fam });
    }

    // the servers left on their own (spec F4): each list's own entries, with this run's answers applied, go to their
    // family's list; a project entry in a list that is not this project's own stays where it is, named in a note
    if (ctx.recordLive)
    {
        const entries = new Map();
        const keep = new Map();
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
                if (e.choice === 'own') entries.set(key, { e, from: null });
                else entries.delete(key);
            }
        const planned = new Map([...found.keys()].map((f) => [f, { entries: [], keep: keep.get(f) || [] }]));
        for (const { e, from } of entries.values())
        {
            // a family with no root this run (the roots answer's error is in the plan): the entry stays in its file
            const file = targets[roots.recordFamily(e)] || from;
            if (file) planned.get(file).entries.push(e);
        }
        for (const [file, want] of planned)
        {
            const own = { entries: want.entries, keep: want.keep, live: ctx.recordLive };
            const next = lists.ownOf(own);
            const { rec, family } = found.get(file);
            if (ownChanged(rec, next)) at(file, family).own = own;
            if (plans.has(file)) plans.get(file).next = next;
        }
    }

    const steps = [];
    for (const [file, p] of plans)
    {
        const { rec } = found.get(file) || { rec: null };
        const target = targets[p.family] === file;
        const dropped = new Set(p.drops.map((d) => d.key));
        const left = ((rec && rec.servers) || []).filter((x) => !dropped.has(lists.serverKey(x)));
        const own = p.next || (rec && rec.own) || [];
        const empty = !p.upserts.length && !left.length && !own.length;
        if (target && !empty) ctx.uses.push({ family: p.family, root: ctx.roots[p.family] });
        steps.push({ op: 'list-write', file, family: p.family, upserts: p.upserts, drops: p.drops, own: p.own, ...(empty ? { empty: true } : {}), why: `${file}: the servers preferred-tools manages, and the ones you left on their own - configure, update and fix skip those. Remove an entry from its own list, or the file, to hand them back.` });
    }
    return steps;
}

// The plan line of a list-write step.
const renderLine = (s) => (s.empty ? `   removes ${s.file}  (no server is listed)` : `   writes ${s.file}  (the servers preferred-tools manages, and the ones left on their own)`);

module.exports = { listSteps, renderLine, foundList };
