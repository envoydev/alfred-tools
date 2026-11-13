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
const workspace = require('./workspace.js');
const kept = require('./kept.js');
const { deepEqual } = require('./json-file.js');

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
        const clients = (ctx.clientsFor && ctx.clientsFor.get(after)) || was.clients || ['claude'];
        const form = ctx.formFor ? ctx.formFor.get(after) : undefined;
        const server = { ...was, name: to.name, scope: to.scope, row: s.row || was.row || null, route: s.route || was.route || null, clients, entry: null, key: was.key === undefined ? null : was.key, ...(form !== undefined ? { form } : {}) };
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
        const file = prior ? cur.file : targets[fam] || (cur && cur.file);
        if (!file) continue;
        let server = prior ? { ...prior, clients } : null;
        if (!server)
        {
            const reg = (inv.registrations || []).find((x) => x.name === name && x.scope === scope && x.rowId && !x.own);
            const catalog = ctx.catalog || catalogLib.load();
            if (!reg) continue;
            server = lists.fromRegistration(reg, catalog.byId.get(reg.rowId), clients, keys.stdioChain({ scope, projectRoot: ctx.roots && ctx.roots.project, globalRoot: ctx.roots && ctx.roots.global }));
        }
        if (form !== undefined) server.form = form;
        at(file, fam).upserts.push({ server, after: null, cursorFile: null });
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
    const taken = new Set([...regSteps.filter((x) => REG_OPS.includes(x.op)).flatMap((x) => [lists.regKey(x), x.op === 'mcp-move' && x.from ? lists.serverKey(x.from) : null]), ...(ctx.clientsOnly || []).map((c) => c.key)].filter(Boolean));
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

// A workspace folder's list, as a member's cursor-write reads it (D4a): the first mcps.json the commands' order finds for
// that folder. A folder with none has no root, and none is made. -> { file, servers } | null
function folderList(inv, folder, ctx)
{
    const fctx = { project: folder, home: ctx.home, platform: ctx.platform };
    for (const file of lists.listFiles({ roots: inv.roots, registrations: [] }, 'project', fctx))
    {
        const l = lists.readList(file);
        if (l && !l.state) return { file, servers: l.servers };
    }
    return null;
}

// The lists a workspace folder's Cursor file is composed from: its own (local and project scope), then each folder
// above's project scope, the nearest first. `own` overrides the folder's own list (the one this plan writes);
// `listed` overrides a folder above's list. -> { sources: [{ file, scopes, servers }], lists: [{ file, scopes }] }
function sourcesOf(inv, ctx, folder, ancestors, { own, listed } = {})
{
    const sources = [];
    const mine = own !== undefined ? own : folderList(inv, folder, ctx);
    if (mine && mine.file) sources.push({ file: mine.file, scopes: SCOPES.project, servers: mine.servers || [] });
    for (const up of ancestors)
    {
        const l = listed && listed.has(up) ? listed.get(up) : folderList(inv, up, ctx);
        if (l && l.file) sources.push({ file: l.file, scopes: ['project'], servers: l.servers || [] });
    }
    return { sources, lists: sources.map((x) => ({ file: x.file, scopes: x.scopes })) };
}

const sameKeys = (a, b) => a.size === b.size && [...a.keys()].every((n) => b.has(n));

// The cursor-write steps of a plan (spec D2): one per Cursor file whose managed set the plan's list-write steps change,
// `before` from the lists as they stand. A name Cursor's file already holds as the user's is written only on an answer
// (answers.cursorNames['<name>@<file>']: 'replace' | 'keep'); with none it is a plan error, and `out.taken` names it. A file Cursor's writer
// refuses is a note: no step, and the entries new to Cursor are recorded without it. Reads `out.steps`' list-write
// steps, and marks each upsert set up for Cursor with the file it waits on.
//
// In a workspace (D4a, alfred-code's record), the project file also takes the project scope of each folder above, and
// a change to this folder's project scope writes each member below it too: no member gets a root or a list.
function cursorSteps(inv, ctx, out, answers = {})
{
    const P = E.pathFor(ctx.platform);
    const named = answers.cursorNames || {};
    const steps = [];
    const ws = inv.workspace !== undefined ? inv.workspace : (ctx.project ? workspace.of(ctx.project, ctx.env || {}) : null);
    const inWs = Boolean(ws && ws.root);
    const strip = (u) => { u.server = { ...u.server, clients: (u.server.clients || []).filter((c) => c !== 'cursor') }; };
    // a taken name in `file`: 'keep' runs `onKeep`, 'replace' is pushed to `replace`, no answer is a plan error
    const settle = (taken, replace, onKeep) =>
    {
        for (const t of taken)
        {
            const answer = named[`${t.name}@${t.file}`];
            if (answer === 'keep') onKeep(t);
            else if (answer === 'replace') replace.push(t.name);
            else
            {
                out.errors.push(`cursor: ${t.file} already has ${t.name} - answer cursor-name-${t.name}@${t.file}`);
                out.taken = [...(out.taken || []), t];
            }
        }
    };
    for (const family of ['project', 'global'])
    {
        const writes = out.steps.filter((s) => s.op === 'list-write' && s.family === family);
        if (!writes.length) continue;
        const cur = inv.lists && inv.lists[family] && !inv.lists[family].note && !inv.lists[family].old ? inv.lists[family] : null;
        const target = ctx.roots && ctx.roots[family] ? P.join(ctx.roots[family], roots.FILES.list) : cur ? cur.file : null;
        if (!target) continue;
        const scopes = SCOPES[family];
        const beforeServers = cur ? cur.servers || [] : [];
        const above = family === 'project' && inWs ? ws.ancestors : [];
        const base = cur && cur.file === target ? beforeServers : ((foundList(inv, target, P) || {}).servers || []);
        const beforeSrc = sourcesOf(inv, ctx, ctx.project, above, { own: { file: cur && cur.file, servers: beforeServers } });
        const before = cursorMcp.managedSet(family === 'project' ? beforeSrc.sources : [{ file: cur && cur.file, scopes, servers: beforeServers }]);
        const wasForCursor = new Set(beforeServers.filter(forCursor).map(lists.serverKey));
        const upserts = writes.flatMap((w) => w.upserts || []);
        const file = cursorMcp.fileFor(family, ctx);

        const why = cursorMcp.refusal(cursorMcp.readCursor(file));
        if (why)
        {
            if (upserts.some((u) => forCursor(u.server))) out.notes.push(`Cursor: ${file} ${why} - not written; Claude Code is`);
            for (const u of upserts) if (forCursor(u.server) && !wasForCursor.has(lists.serverKey(u.server))) strip(u);
            continue;
        }

        const replace = [];
        const fresh = upserts.filter((u) => forCursor(u.server) && !before.has(u.server.name)).map((u) => ({ ...u, cursorFile: file }));
        settle(takenNames(inv, ctx, fresh), replace, (t) => { for (const u of upserts) if (u.server.name === t.name && forCursor(u.server)) strip(u); });
        for (const u of upserts) if (forCursor(u.server)) u.cursorFile = file;

        // after the answers: a kept name is no longer set up for Cursor
        const afterServers = afterWrite(base, writes.find((w) => w.file === target));
        const afterSrc = sourcesOf(inv, ctx, ctx.project, above, { own: { file: target, servers: afterServers } });
        const after = cursorMcp.managedSet(family === 'project' ? afterSrc.sources : [{ file: target, scopes, servers: afterServers }]);
        const touched = upserts.some((u) => forCursor(u.server));
        if (sameKeys(before, after) && !touched) continue;
        const listsOf = family === 'project' ? afterSrc.lists : [{ file: target, scopes }];
        // a copy Cursor lacks or one edited by hand is left as it is (spec D1): fix's client-drift settles it
        const hold = heldCopies(file, before, after, ctx, out);
        const reapprove = changedCopies(file, before, after, hold, upserts, ctx, out);
        steps.push({ op: 'cursor-write', file, family, lists: listsOf, before: [...before.keys()], skip: hold, replace, reapprove, why: `${file}: Cursor's servers from ${target}, the user's own kept as they are` });
        // why a workspace record was read as none, said once (D4a)
        if (family === 'project' && ws && ws.notes) for (const n of ws.notes) if (!out.notes.includes(n)) out.notes.push(n);

        if (family !== 'project') continue;
        // the members below this folder, when its project scope changed for Cursor (D4a)
        const projectOnly = (servers) => cursorMcp.managedSet([{ file: target, scopes: ['project'], servers }]);
        const projectTouched = upserts.some((u) => forCursor(u.server) && u.server.scope === 'project');
        if (inWs && (projectTouched || !sameKeys(projectOnly(beforeServers), projectOnly(afterServers))))
            for (const m of workspace.below(ws, ctx.project))
            {
                const mfile = cursorMcp.fileFor('project', { ...ctx, project: m.folder });
                const mwhy = cursorMcp.refusal(cursorMcp.readCursor(mfile));
                if (mwhy) { out.notes.push(`Cursor: ${mfile} ${mwhy} - not written; ${ctx.project}'s servers do not reach it`); continue; }
                const ups = new Map([[ctx.project, { file: cur && cur.file, servers: beforeServers }]]);
                const mbefore = cursorMcp.managedSet(sourcesOf(inv, ctx, m.folder, m.ancestors, { listed: ups }).sources);
                const msrc = sourcesOf(inv, ctx, m.folder, m.ancestors, { listed: new Map([[ctx.project, { file: target, servers: afterServers }]]) });
                const mreplace = [];
                const mskip = [];
                const mfresh = upserts.filter((u) => forCursor(u.server) && u.server.scope === 'project' && !mbefore.has(u.server.name)).map((u) => ({ ...u, cursorFile: mfile }));
                settle(takenNames(inv, ctx, mfresh), mreplace, (t) => mskip.push(t.name));
                // a member's copy edited or removed by hand is left as it is, as in the project's own file (spec D1, D4a)
                const mafter = cursorMcp.managedSet(msrc.sources);
                const mhold = heldCopies(mfile, mbefore, mafter, ctx, out);
                const mreapprove = changedCopies(mfile, mbefore, mafter, mhold, upserts, ctx, out);
                steps.push({ op: 'cursor-write', file: mfile, family, lists: msrc.lists, before: [...mbefore.keys()], skip: [...new Set([...mskip, ...mhold])], replace: mreplace, reapprove: mreapprove, why: `${mfile}: the workspace member's servers, with ${ctx.project}'s project servers` });
            }

        if (!after.size) continue;
        if ([...after.values()].some((v) => v.scope === 'local') && roots.gitIgnores(file) === false)
            out.notes.push('.cursor/mcp.json now holds this machine\'s local servers; add it to .gitignore to keep them private');
        if (inWs)
        {
            // a member that is a plain folder of the root's repo: Cursor's CLI reads the root's file there (D4a)
            const own = cursorMcp.managedSet([{ file: target, scopes, servers: afterServers }]);
            const top = ctx.project !== ws.root && own.size ? workspace.gitTop(ctx.project) : null;
            let rootReal = null;
            try { rootReal = require('node:fs').realpathSync(ws.root); } catch { /* none */ }
            if (top && top === rootReal)
                out.notes.push(`${ctx.project} is a folder of ${ws.root}'s git repo; Cursor's CLI reads ${P.join(ws.root, '.cursor', 'mcp.json')} there, so these servers reach the editor opened at ${ctx.project} only. Install them at the root or at Global scope for the CLI`);
        }
        else if (outsideItsRepo(ctx.project, P))
            out.notes.push(`Cursor reads .cursor/mcp.json only from the folder it opens (its git root for the CLI), never a parent's: open Cursor at ${ctx.project}, or install at Global scope for servers every folder needs`);
    }
    const again = [...new Set(steps.flatMap((x) => x.reapprove || []))];
    if (again.length) out.notes.push(reapproveLine(again));
    return steps;
}

const reapproveLine = (names) => `Cursor asks you to approve ${names.join(', ')} again - it re-asks whenever an entry changes`;
const keepOf = (catalog, value, row) => kept.keep(value, catalog.byId.get(row));

// The managed names a cursor-write leaves alone (spec D1, D9): each the file lacks (a hand removal) or holds with another
// value than its list, compared after kept.keep. Named in the plan; the names this plan drops are not held.
function heldCopies(file, before, after, ctx, out)
{
    const catalog = ctx.catalog || catalogLib.load();
    const read = cursorMcp.readCursor(file);
    if (read.state !== 'ok') return [];
    const have = read.doc.mcpServers;
    const hold = [];
    for (const [name, m] of before)
    {
        if (!after.has(name)) continue;
        if (!Object.hasOwn(have, name))
        {
            hold.push(name);
            out.notes.push(`${name} is on the list for Cursor but not in ${file} - left; run /preferred-tools:fix`);
        }
        else if (!deepEqual(keepOf(catalog, have[name], m.row), keepOf(catalog, m.entry, m.row)))
        {
            hold.push(name);
            out.notes.push(`${name}: Cursor's copy was changed by hand - left; run /preferred-tools:fix`);
        }
    }
    return hold;
}

// The names Cursor already has whose value this write changes (spec Risks: Cursor asks to approve a changed entry
// again). The value an upsert will hold: its entry when the plan has it, else the registration step's entry, as Cursor's
// bridge copy when the entry has two forms.
function changedCopies(file, before, after, hold, upserts, ctx, out)
{
    const catalog = ctx.catalog || catalogLib.load();
    const read = cursorMcp.readCursor(file);
    if (read.state !== 'ok') return [];
    const have = read.doc.mcpServers;
    const regOf = new Map((out.steps || []).filter((x) => REG_OPS.includes(x.op)).map((x) => [lists.regKey(x), x]));
    const names = [];
    for (const name of after.keys())
    {
        if (!before.has(name) || hold.includes(name) || !Object.hasOwn(have, name)) continue;
        const u = upserts.find((x) => x.server.name === name && forCursor(x.server));
        if (!u) continue;
        const row = u.server.row;
        let next = u.server.entry ? (u.server.cursorEntry || u.server.entry) : null;
        if (!next && u.after && regOf.has(u.after))
        {
            const entry = regOf.get(u.after).entry || (regOf.get(u.after).to && regOf.get(u.after).entry);
            const two = u.server.form === 'two' || (u.server.form === undefined && u.server.cursorEntry);
            next = two ? cursorMcp.bridgeFormOf(entry, catalog, u.server.cursorEntry || null) || entry : entry;
        }
        if (next && !deepEqual(keepOf(catalog, have[name], row), keepOf(catalog, next, row))) names.push(name);
    }
    return names;
}

// ---- a repair's tail (spec D1, D9) -------------------------------------------------------------------------------------

// What a fix or an update writes after its registration steps: each list the steps' servers sit in, from the
// registrations as read back, and Cursor's files from those lists - a copy Cursor lacks or one changed by hand left out
// and named. Only lists that exist are written: a family with none waits for list-import. `refresh`: [{ name, scope }]
// whose Cursor copy is refilled from .mcps-secrets at apply with no list change (token-sync). Notes go to ctx.notes.
// -> [step]
function repairTail(inv, ctx, regSteps, { refresh = [] } = {})
{
    const catalog = ctx.catalog || catalogLib.load();
    const notes = ctx.notes || [];
    const usable = (fam) => { const l = inv.lists && inv.lists[fam]; return l && !l.note && !l.old ? l : null; };
    // a two-form entry keeps two forms: apply builds Cursor's bridge again from the entry as read, its pin kept
    const formFor = new Map();
    for (const s of regSteps.filter((x) => REG_OPS.includes(x.op)))
    {
        const key = lists.regKey(s);
        const l = usable(roots.familyOf(s.op === 'mcp-move' ? s.to.scope : s.scope));
        const prior = l ? (l.servers || []).find((x) => lists.serverKey(x) === key) : null;
        if (prior && prior.cursorEntry) formFor.set(key, 'two');
    }
    const tctx = { platform: ctx.platform, project: ctx.project || inv.project, home: ctx.home, env: ctx.env || {}, catalog, roots: null, uses: [], formFor, exists: ctx.exists };
    const out = { steps: [], notes, errors: [] };
    const listW = listSteps(inv, tctx, out, regSteps);
    // the key's name, from the key files of the roots in use
    const r = { project: inv.roots && inv.roots.project ? inv.roots.project.path : null, global: inv.roots && inv.roots.global ? inv.roots.global.path : null };
    for (const w of listW)
        for (const u of w.upserts || [])
            if (!u.keyFiles)
            {
                const files = keys.stdioChain({ scope: u.server.scope, projectRoot: r.project, globalRoot: r.global });
                if (files.length) u.keyFiles = files;
            }
    out.steps = [...regSteps, ...listW];
    const cursor = cursorSteps(inv, tctx, out, {});
    for (const e of out.errors) notes.push(`${e} - Cursor's file is left; run /preferred-tools:configure`);
    const blocked = new Set(out.errors.length ? cursor.map((x) => x.file) : []);
    const written = cursor.filter((x) => !blocked.has(x.file));
    // a Cursor copy refilled from .mcps-secrets with the list as it is
    for (const fam of [...new Set(refresh.map((x) => roots.familyOf(x.scope)))])
    {
        const l = usable(fam);
        const file = cursorMcp.fileFor(fam, tctx);
        if (!l || written.some((x) => x.file === file)) continue;
        const why = cursorMcp.refusal(cursorMcp.readCursor(file));
        if (why) { notes.push(`Cursor: ${file} ${why} - not written`); continue; }
        const scopes = SCOPES[fam];
        const before = cursorMcp.managedSet([{ file: l.file, scopes, servers: l.servers || [] }]);
        const hold = heldCopies(file, before, before, tctx, out);
        written.push({ op: 'cursor-write', file, family: fam, lists: [{ file: l.file, scopes }], before: [...before.keys()], skip: hold, replace: [], reapprove: refresh.filter((x) => roots.familyOf(x.scope) === fam && !hold.includes(x.name)).map((x) => x.name), why: `${file}: the key refilled from .mcps-secrets` });
    }
    return [...listW, ...written];
}

// What changed outside preferred-tools (spec D1): each list entry whose Claude registration differs after kept.keep,
// then each the list names that Claude Code no longer has. Install, configure and update print these first; only fix
// changes either. -> [line]
function changedOutside(inv, catalog = catalogLib.load())
{
    const changed = [];
    const missing = [];
    for (const family of ['project', 'global'])
    {
        const l = inv.lists && inv.lists[family];
        if (!l || l.note || l.old) continue;
        for (const s of l.servers || [])
        {
            if (!(s.clients || ['claude']).includes('claude')) continue;
            const reg = (inv.registrations || []).find((x) => x.name === s.name && x.scope === s.scope);
            if (!reg) missing.push(`${s.name} is on the list but not in Claude Code - run /preferred-tools:fix`);
            else if (!deepEqual(keepOf(catalog, reg.entry, s.row), s.entry)) changed.push(`${s.name} was changed outside preferred-tools`);
        }
    }
    return [...changed, ...missing];
}

// The read guard (ruling 13): one deny-read for the plan, with the sign-in rule when it writes the shared sign-in form
// and the key-file rule when it writes a key name - each only when Claude Code's settings file lacks it. A settings file
// that is not a JSON object is a note: the rest of the plan is still written. -> [deny-read step]
// The settings file the deny rules go in, and which of `want` it lacks: { file, rules } | { file, bad: true }. Shared by
// install and configure (denyReadSteps) and fix's read-guard row. Claude Code's own settings: CLAUDE_CONFIG_DIR, else
// ~/.claude - from ctx.home, so a test never reads the real one.
function readGuardOf(ctx, want)
{
    const P = E.pathFor(ctx.platform);
    const env = ctx.env || {};
    const file = env.CLAUDE_CONFIG_DIR ? P.resolve(env.CLAUDE_CONFIG_DIR, 'settings.json') : P.join(ctx.home, '.claude', 'settings.json');
    let text = null;
    try { text = fs.readFileSync(file, 'utf8'); } catch { /* absent: {} */ }
    let deny = [];
    if (text !== null)
    {
        let doc = null;
        try { doc = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { /* below */ }
        const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
        if (!isObject(doc) || (doc.permissions !== undefined && !isObject(doc.permissions)) || (doc.permissions && doc.permissions.deny !== undefined && !Array.isArray(doc.permissions.deny))) return { file, bad: true };
        deny = (doc.permissions && doc.permissions.deny) || [];
    }
    return { file, rules: want.filter((r) => !deny.includes(r)) };
}

// The deny-read step as one plan line - or none when the file has every rule.
function denyReadStep(file, rules)
{
    return { op: 'deny-read', file, rules, why: `${file}: keeps an AI session's Read tool out of ${rules.map((r) => (r === roots.READ_GUARD.signIns ? 'the sign-in tokens' : 'the key file')).join(' and ')}` };
}

function denyReadSteps(steps, ctx, out)
{
    const want = [
        steps.some((x) => ['mcp-add', 'mcp-replace', 'mcp-move'].includes(x.op) && E.signInParts(x.entry)) && roots.READ_GUARD.signIns,
        steps.some((x) => x.op === 'ensure-key-name') && roots.READ_GUARD.secrets,
    ].filter(Boolean);
    if (!want.length) return [];
    const g = readGuardOf(ctx, want);
    if (g.bad)
    {
        out.notes.push(`${g.file} is not a settings object preferred-tools can read - add ${want.join(' and ')} to permissions.deny yourself`);
        return [];
    }
    return g.rules.length ? [denyReadStep(g.file, g.rules)] : [];
}

// The plan line of a list-write, retire-record, cursor-write or deny-read step.
function renderLine(s)
{
    if (s.op === 'deny-read') return `   adds ${s.rules.join(' and ')} to permissions.deny in ${s.file}  (keeps AI sessions out of the sign-in tokens and the key file)`;
    if (s.op === 'cursor-write') return [`   writes ${s.file}  (Cursor: the servers set up for it; your own entries kept)`, ...(s.replace || []).map((n) => `   replaces your own ${n} in ${s.file}`)].join('\n');
    if (s.op === 'retire-record') return `   moves ${s.file} aside as ${roots.FILES.record}.0.4.bak  (its entries are in mcps.json now)`;
    return s.empty ? `   removes ${s.file}  (no server is listed)` : `   writes ${s.file}  (the servers preferred-tools manages, and the ones left on their own)`;
}

module.exports = { listSteps, renderLine, foundList, importUnlisted, cursorSteps, takenNames, denyReadSteps, readGuardOf, denyReadStep, repairTail, changedOutside, reapproveLine, folderList, SCOPES };
