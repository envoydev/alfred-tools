'use strict';
// THE LIST STEPS - what a plan writes into each family's <root>/mcps.json (spec D1, 0.5.0). Nothing here changes
// anything: apply.js's list-write step does, and only for the registrations the apply wrote and read back.
//
// One list-write per list file the plan touches: an upsert per mcp-add, mcp-replace and mcp-move (filled at apply from
// the registration as read), a drop per mcp-remove and per server that leaves a list (a move, a root change), and the
// servers the user left on their own (`own`), with this run's answers applied - the 0.4.x record's rules (spec F4).
// The first plan that writes a family with no list yet imports it, as list-import does: every managed registration of
// the family joins the list as read, and the 0.4.x record's own entries move into it, the record itself moved aside.
const fs = require('node:fs');
const E = require('./entries.js');
const catalogLib = require('./catalog.js');
const roots = require('./roots.js');
const keys = require('./keys.js');
const lists = require('./mcps-list.js');
const cursorMcp = require('./cursor-mcp.js');

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

// The managed registrations of a family that its list does not name yet (list-import, and a plan's first touch): each
// as read, kept (every key value the marker), with clients claude. A registration on its own is not one, unless this
// run's `answers` (mcp key -> 'own' | 'manage') hand it back. opts: { answers, roots: { project, global } }
function importUnlisted(inv, family, catalog, { answers = {}, roots: r = {} } = {})
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
        .map((x) => lists.fromRegistration(x, catalog.byId.get(x.rowId), ['claude'], keys.stdioChain({ scope: x.scope, projectRoot: r.project, globalRoot: r.global })));
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

    // the first touch: a family this plan writes that has no list yet is imported as list-import does
    const retire = [];
    const answers = {};
    for (const family of ['project', 'global']) for (const e of (ctx.recordEntries && ctx.recordEntries[family]) || []) answers[roots.recordKey(e)] = e.choice;
    const taken = new Set(regSteps.filter((x) => REG_OPS.includes(x.op)).flatMap((x) => [lists.regKey(x), x.op === 'mcp-move' && x.from ? lists.serverKey(x.from) : null]).filter(Boolean));
    for (const family of ['project', 'global'])
    {
        const l = inv.lists && inv.lists[family];
        if (!targets[family] || !plans.has(targets[family]) || (l && (!l.old || l.note))) continue;
        const p = plans.get(targets[family]);
        for (const server of importUnlisted(inv, family, ctx.catalog || catalogLib.load(), { answers, roots: ctx.roots || {} }))
            if (!taken.has(lists.serverKey(server))) p.upserts.push({ server, after: null, cursorFile: null });
        if (l && l.old) retire.push({ op: 'retire-record', file: l.old, why: `${l.old}: the 0.4.x record - its entries are in ${targets[family]} now, so it is moved aside as ${roots.FILES.record}.0.4.bak` });
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
    return [...steps, ...retire];
}

// ---- Cursor's files (spec D2, D4, D4a) ------------------------------------------------------------------------------

const forCursor = (s) => (s.clients || []).includes('cursor');
const SCOPES = { project: ['local', 'project'], global: ['user'] };

// A list's servers after a list-write step: its drops out, its upserts in, as apply's mergeList does.
function afterWrite(servers, step)
{
    if (!step) return servers;
    const drops = new Set((step.drops || []).map((d) => d.key));
    const up = new Map((step.upserts || []).map((u) => [lists.serverKey(u.server), u.server]));
    return [...servers.filter((x) => !drops.has(lists.serverKey(x)) && !up.has(lists.serverKey(x))), ...up.values()];
}

// The names a Cursor file already holds that its list does not mark for Cursor, among the upserts set up for Cursor:
// each the user's own, or one from before this design. `sameRow`: the entry there is the upsert's row's server.
// upserts: [{ server, cursorFile }] -> [{ file, name, sameRow }]
function takenNames(inv, ctx, upserts)
{
    const catalog = ctx.catalog || catalogLib.load();
    const reads = new Map();
    const docOf = (file) => { if (!reads.has(file)) reads.set(file, cursorMcp.readCursor(file)); return reads.get(file); };
    const out = [];
    for (const u of upserts || [])
    {
        if (!forCursor(u.server)) continue;
        const family = roots.familyOf(u.server.scope);
        const file = u.cursorFile || cursorMcp.fileFor(family, ctx);
        const read = docOf(file);
        if (read.state !== 'ok' || !Object.hasOwn(read.doc.mcpServers, u.server.name)) continue;
        const l = inv.lists && inv.lists[family];
        if (l && !l.note && (l.servers || []).some((x) => x.name === u.server.name && forCursor(x))) continue;
        if (out.some((t) => t.file === file && t.name === u.server.name)) continue;
        out.push({ file, name: u.server.name, sameRow: cursorMcp.matchesRow(read.doc.mcpServers[u.server.name], catalog.byId.get(u.server.row)) });
    }
    return out;
}

const hasGit = (dir, P) => fs.existsSync(P.join(dir, '.git'));

// D4a's 'No workspace' check: the project is a folder of a parent folder's git repo, or holds child git repos.
function outsideItsRepo(project, P)
{
    if (!hasGit(project, P))
        for (let dir = P.dirname(project); ; dir = P.dirname(dir))
        {
            if (hasGit(dir, P)) return true;
            if (P.dirname(dir) === dir) break;
        }
    try { return fs.readdirSync(project, { withFileTypes: true }).some((d) => d.isDirectory() && hasGit(P.join(project, d.name), P)); }
    catch { return false; }
}

// The cursor-write steps of a plan (spec D2): one per Cursor file whose managed set the plan's list-write steps change,
// `before` from the lists as they stand. A name Cursor's file already holds as the user's is written only on an answer
// (answers.cursorNames['<name>@<file>']: 'replace' | 'keep'); with none it is a plan error, and `out.taken` names it. A file Cursor's writer
// refuses is a note: no step, and the entries new to Cursor are recorded without it. Reads `out.steps`' list-write
// steps, and marks each upsert set up for Cursor with the file it waits on.
function cursorSteps(inv, ctx, out, answers = {})
{
    const P = E.pathFor(ctx.platform);
    const named = answers.cursorNames || {};
    const steps = [];
    for (const family of ['project', 'global'])
    {
        const writes = out.steps.filter((s) => s.op === 'list-write' && s.family === family);
        if (!writes.length) continue;
        const cur = inv.lists && inv.lists[family] && !inv.lists[family].note && !inv.lists[family].old ? inv.lists[family] : null;
        const target = ctx.roots && ctx.roots[family] ? P.join(ctx.roots[family], roots.FILES.list) : cur ? cur.file : null;
        if (!target) continue;
        const scopes = SCOPES[family];
        const beforeServers = cur ? cur.servers || [] : [];
        const before = cursorMcp.managedSet([{ file: cur && cur.file, scopes, servers: beforeServers }]);
        const wasForCursor = new Set(beforeServers.filter(forCursor).map(lists.serverKey));
        const upserts = writes.flatMap((w) => w.upserts || []);
        const file = cursorMcp.fileFor(family, ctx);
        const strip = (u) => { u.server = { ...u.server, clients: (u.server.clients || []).filter((c) => c !== 'cursor') }; };

        const why = cursorMcp.refusal(cursorMcp.readCursor(file));
        if (why)
        {
            if (upserts.some((u) => forCursor(u.server))) out.notes.push(`Cursor: ${file} ${why} - not written; Claude Code is`);
            for (const u of upserts) if (forCursor(u.server) && !wasForCursor.has(lists.serverKey(u.server))) strip(u);
            continue;
        }

        const replace = [];
        const fresh = upserts.filter((u) => forCursor(u.server) && !before.has(u.server.name)).map((u) => ({ ...u, cursorFile: file }));
        for (const t of takenNames(inv, ctx, fresh))
        {
            const answer = named[`${t.name}@${t.file}`];
            if (answer === 'keep') { for (const u of upserts) if (u.server.name === t.name && forCursor(u.server)) strip(u); }
            else if (answer === 'replace') replace.push(t.name);
            else
            {
                out.errors.push(`cursor: ${t.file} already has ${t.name} - answer cursor-name-${t.name}@${t.file}`);
                out.taken = [...(out.taken || []), t];
            }
        }
        for (const u of upserts) if (forCursor(u.server)) u.cursorFile = file;

        const base = cur && cur.file === target ? beforeServers : ((foundList(inv, target, P) || {}).servers || []);
        const after = cursorMcp.managedSet([{ file: target, scopes, servers: afterWrite(base, writes.find((w) => w.file === target)) }]);
        const same = before.size === after.size && [...before.keys()].every((n) => after.has(n));
        if (same && !upserts.some((u) => forCursor(u.server))) continue;
        steps.push({ op: 'cursor-write', file, family, lists: [{ file: target, scopes }], before: [...before.keys()], skip: [], replace, why: `${file}: Cursor's servers from ${target}, the user's own kept as they are` });

        if (family !== 'project' || !after.size) continue;
        if ([...after.values()].some((v) => v.scope === 'local') && roots.gitIgnores(file) === false)
            out.notes.push('.cursor/mcp.json now holds this machine\'s local servers; add it to .gitignore to keep them private');
        if (outsideItsRepo(ctx.project, P))
            out.notes.push(`Cursor reads .cursor/mcp.json only from the folder it opens (its git root for the CLI), never a parent's: open Cursor at ${ctx.project}, or install at Global scope for servers every folder needs`);
    }
    return steps;
}

// The plan line of a list-write, retire-record or cursor-write step.
function renderLine(s)
{
    if (s.op === 'cursor-write') return [`   writes ${s.file}  (Cursor: the servers set up for it; your own entries kept)`, ...(s.replace || []).map((n) => `   replaces your own ${n} in ${s.file}`)].join('\n');
    if (s.op === 'retire-record') return `   moves ${s.file} aside as ${roots.FILES.record}.0.4.bak  (its entries are in mcps.json now)`;
    return s.empty ? `   removes ${s.file}  (no server is listed)` : `   writes ${s.file}  (the servers preferred-tools manages, and the ones left on their own)`;
}

module.exports = { listSteps, renderLine, foundList, importUnlisted, cursorSteps, takenNames };
