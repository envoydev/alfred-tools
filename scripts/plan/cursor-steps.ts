// The Cursor steps of a plan: what it writes into each Cursor file, from the list.
import fs from 'node:fs';
import { realpathSync } from 'node:fs';
import { pathFor } from '../entries/platform.ts';
import * as catalogLib from '../catalog/catalog.ts';
import * as roots from '../roots/roots.ts';
import * as lists from '../mcps-list/mcps-list.ts';
import * as cursorMcp from '../cursor/cursor-mcp.ts';
import * as workspace from '../roots/workspace.ts';
import * as kept from '../core/kept.ts';
import { deepEqual } from '../core/json-file.ts';
import { foundList, REG_OPS } from './lists.ts';
import type path from 'node:path';
import type { ServerEntry } from '../core/types.ts';
import type { Catalog } from '../catalog/types.ts';
import type { Machine } from '../entries/types.ts';
import type { Inventory } from '../inventory/types.ts';
import type { ListServer } from '../mcps-list/types.ts';
import type { ListSource, Managed } from '../cursor/types.ts';
import type { Family } from '../roots/types.ts';
import type { Answers, CursorPlaceCtx, CursorWritePlanStep, Endpoint, FoundList, ListCtx, ListUpsert, ListWriteStep, PlannedServer, PlanOut, RegistrationStep, Taken } from './types.ts';

// ---- Cursor's files (spec D2, D4, D4a) ------------------------------------------------------------------------------

const forCursor = (s: { clients?: string[] | undefined }): boolean => (s.clients || []).includes('cursor');
export const SCOPES = { project: ['local', 'project'], global: ['user'] };

// A list's servers after a list-write step: its drops out, its upserts in, as apply's mergeList does.
function afterWrite(servers: ListServer[], step: ListWriteStep | undefined): ListServer[]
{
    if (!step) return servers;
    const drops = new Set((step.drops || []).map((d) => d.key));
    const up = new Map((step.upserts || []).map((u): [string, ListServer] => [lists.serverKey(u.server), u.server as ListServer]));
    return [...servers.filter((x) => !drops.has(lists.serverKey(x)) && !up.has(lists.serverKey(x))), ...up.values()];
}

// The names a Cursor file already holds that its list does not mark for Cursor, among the upserts set up for Cursor:
// each the user's own, or one from before this design. `sameRow`: the entry there is the upsert's row's server.
// upserts: [{ server, cursorFile }] -> [{ file, name, sameRow }]
export function takenNames(inv: Inventory, ctx: CursorPlaceCtx, upserts: { server: PlannedServer; cursorFile: string | null }[] | null | undefined): Taken[]
{
    const catalog = ctx.catalog || catalogLib.load();
    const reads = new Map<string, ReturnType<typeof cursorMcp.readCursor>>();
    const docOf = (file: string) => { if (!reads.has(file)) reads.set(file, cursorMcp.readCursor(file)); return reads.get(file)!; };
    const out: Taken[] = [];
    for (const u of upserts || [])
    {
        if (!forCursor(u.server)) continue;
        const family = roots.familyOf(u.server.scope);
        const file = u.cursorFile || cursorMcp.fileFor(family, ctx);
        const read = docOf(file);
        if (read.state !== 'ok' || !Object.hasOwn(read.doc!.mcpServers, u.server.name)) continue;
        const l = inv.lists && inv.lists[family];
        if (l && !l.note && (l.servers || []).some((x) => x.name === u.server.name && forCursor(x))) continue;
        if (out.some((t) => t.file === file && t.name === u.server.name)) continue;
        out.push({ file, name: u.server.name, sameRow: cursorMcp.matchesRow(read.doc!.mcpServers[u.server.name]!, catalog.byId.get(u.server.row!)) });
    }
    return out;
}

const hasGit = (dir: string, P: path.PlatformPath): boolean => fs.existsSync(P.join(dir, '.git'));

// D4a's 'No workspace' check: the project is a folder of a parent folder's git repo, or holds child git repos.
function outsideItsRepo(project: string, P: path.PlatformPath): boolean
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
export function folderList(inv: Pick<Inventory, 'roots'>, folder: string, ctx: Pick<Machine, 'home' | 'platform'>): { file: string; servers: ListServer[] } | null
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
function sourcesOf(inv: Inventory, ctx: ListCtx, folder: string, ancestors: string[], { own, listed }: { own?: { file: string | null | undefined; servers: ListServer[] } | undefined; listed?: Map<string, { file: string | null | undefined; servers: ListServer[] }> | undefined } = {}): { sources: ListSource[]; lists: { file: string; scopes: string[] }[] }
{
    const sources: ListSource[] = [];
    const mine = own !== undefined ? own : folderList(inv, folder, ctx);
    if (mine && mine.file) sources.push({ file: mine.file, scopes: SCOPES.project, servers: mine.servers || [] });
    for (const up of ancestors)
    {
        const l = listed && listed.has(up) ? listed.get(up) : folderList(inv, up, ctx);
        if (l && l.file) sources.push({ file: l.file, scopes: ['project'], servers: l.servers || [] });
    }
    return { sources, lists: sources.map((x) => ({ file: x.file, scopes: x.scopes })) };
}

const sameKeys = (a: Map<string, unknown>, b: Map<string, unknown>): boolean => a.size === b.size && [...a.keys()].every((n) => b.has(n));

// The cursor-write steps of a plan (spec D2): one per Cursor file whose managed set the plan's list-write steps change,
// `before` from the lists as they stand. A name Cursor's file already holds as the user's is written only on an answer
// (answers.cursorNames['<name>@<file>']: 'replace' | 'keep'); with none it is a plan error, and `out.taken` names it. A file Cursor's writer
// refuses is a note: no step, and the entries new to Cursor are recorded without it. Reads `out.steps`' list-write
// steps, and marks each upsert set up for Cursor with the file it waits on.
//
// In a workspace (D4a, alfred-code's record), the project file also takes the project scope of each folder above, and
// a change to this folder's project scope writes each member below it too: no member gets a root or a list.
export function cursorSteps(inv: Inventory, ctx: ListCtx, out: PlanOut, answers: Answers = {}): CursorWritePlanStep[]
{
    const P = pathFor(ctx.platform);
    const named = answers.cursorNames || {};
    const steps: CursorWritePlanStep[] = [];
    const ws = inv.workspace !== undefined ? inv.workspace : (ctx.project ? workspace.of(ctx.project, ctx.env || {}) : null);
    const inWs = Boolean(ws && ws.root);
    const strip = (u: ListUpsert) => { u.server = { ...u.server, clients: (u.server.clients || []).filter((c) => c !== 'cursor') }; };
    // a taken name in `file`: 'keep' runs `onKeep`, 'replace' is pushed to `replace`, no answer is a plan error
    const settle = (taken: Taken[], replace: string[], onKeep: (t: Taken) => void) =>
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
    for (const family of ['project', 'global'] as Family[])
    {
        const writes = out.steps.filter((s): s is ListWriteStep => s.op === 'list-write' && s.family === family);
        if (!writes.length) continue;
        const cur = inv.lists && inv.lists[family] && !inv.lists[family].note && !inv.lists[family].old ? inv.lists[family] : null;
        const target = ctx.roots && ctx.roots[family] ? P.join(ctx.roots[family], roots.FILES.list) : cur ? cur.file : null;
        if (!target) continue;
        const scopes = SCOPES[family];
        const beforeServers = cur ? cur.servers || [] : [];
        const above: string[] = family === 'project' && inWs ? ws!.ancestors : [];
        const base = cur && cur.file === target ? beforeServers : (((foundList(inv, target, P) || {}) as Partial<FoundList>).servers || []);
        const beforeSrc = sourcesOf(inv, ctx, ctx.project, above, { own: { file: cur && cur.file, servers: beforeServers } });
        const before = cursorMcp.managedSet(family === 'project' ? beforeSrc.sources : [{ file: (cur && cur.file) as string, scopes, servers: beforeServers }]);
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

        const replace: string[] = [];
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
        const projectOnly = (servers: ListServer[]) => cursorMcp.managedSet([{ file: target, scopes: ['project'], servers }]);
        const projectTouched = upserts.some((u) => forCursor(u.server) && u.server.scope === 'project');
        if (inWs && (projectTouched || !sameKeys(projectOnly(beforeServers), projectOnly(afterServers))))
            for (const m of workspace.below(ws!, ctx.project))
            {
                const mfile = cursorMcp.fileFor('project', { ...ctx, project: m.folder });
                const mwhy = cursorMcp.refusal(cursorMcp.readCursor(mfile));
                if (mwhy) { out.notes.push(`Cursor: ${mfile} ${mwhy} - not written; ${ctx.project}'s servers do not reach it`); continue; }
                const ups = new Map([[ctx.project, { file: cur && cur.file, servers: beforeServers }]]);
                const mbefore = cursorMcp.managedSet(sourcesOf(inv, ctx, m.folder, m.ancestors, { listed: ups }).sources);
                const msrc = sourcesOf(inv, ctx, m.folder, m.ancestors, { listed: new Map([[ctx.project, { file: target, servers: afterServers }]]) });
                const mreplace: string[] = [];
                const mskip: string[] = [];
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
            const top = ctx.project !== ws!.root && own.size ? workspace.gitTop(ctx.project) : null;
            let rootReal: string | null = null;
            try { rootReal = realpathSync(ws!.root!); } catch { /* none */ }
            if (top && top === rootReal)
                out.notes.push(`${ctx.project} is a folder of ${ws!.root}'s git repo; Cursor's CLI reads ${P.join(ws!.root!, '.cursor', 'mcp.json')} there, so these servers reach the editor opened at ${ctx.project} only. Install them at the root or at Global scope for the CLI`);
        }
        else if (outsideItsRepo(ctx.project, P))
            out.notes.push(`Cursor reads .cursor/mcp.json only from the folder it opens (its git root for the CLI), never a parent's: open Cursor at ${ctx.project}, or install at Global scope for servers every folder needs`);
    }
    const again = [...new Set(steps.flatMap((x) => x.reapprove || []))];
    if (again.length) out.notes.push(reapproveLine(again));
    return steps;
}

export const reapproveLine = (names: string[]): string => `Cursor asks you to approve ${names.join(', ')} again - it re-asks whenever an entry changes`;
export const keepOf = (catalog: Catalog, value: ServerEntry, row: string | null): ServerEntry => kept.keep(value, catalog.byId.get(row!));

// The managed names a cursor-write leaves alone (spec D1, D9): each the file lacks (a hand removal) or holds with another
// value than its list, compared after kept.keep. Named in the plan; the names this plan drops are not held.
export function heldCopies(file: string, before: Map<string, Managed>, after: Map<string, Managed>, ctx: { catalog?: Catalog | undefined }, out: Pick<PlanOut, 'notes'>): string[]
{
    const catalog = ctx.catalog || catalogLib.load();
    const read = cursorMcp.readCursor(file);
    if (read.state !== 'ok') return [];
    const have = read.doc!.mcpServers;
    const hold: string[] = [];
    for (const [name, m] of before)
    {
        if (!after.has(name)) continue;
        if (!Object.hasOwn(have, name))
        {
            hold.push(name);
            out.notes.push(`${name} is on the list for Cursor but not in ${file} - left; run /preferred-tools:fix`);
        }
        else if (!deepEqual(keepOf(catalog, have[name]!, m.row), keepOf(catalog, m.entry, m.row)))
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
function changedCopies(file: string, before: Map<string, Managed>, after: Map<string, Managed>, hold: string[], upserts: ListUpsert[], ctx: ListCtx, out: PlanOut): string[]
{
    const catalog = ctx.catalog || catalogLib.load();
    const read = cursorMcp.readCursor(file);
    if (read.state !== 'ok') return [];
    const have = read.doc!.mcpServers;
    const regOf = new Map((out.steps || []).filter((x): x is RegistrationStep => REG_OPS.includes(x.op)).map((x): [string | null, { entry?: ServerEntry; to?: Endpoint }] => [lists.regKey(x), x as { entry?: ServerEntry; to?: Endpoint }]));
    const names: string[] = [];
    for (const name of after.keys())
    {
        if (!before.has(name) || hold.includes(name) || !Object.hasOwn(have, name)) continue;
        const u = upserts.find((x) => x.server.name === name && forCursor(x.server));
        if (!u) continue;
        const row = u.server.row;
        let next: ServerEntry | null | undefined = u.server.entry ? (u.server.cursorEntry || u.server.entry) : null;
        if (!next && u.after && regOf.has(u.after))
        {
            const entry = regOf.get(u.after)!.entry || (regOf.get(u.after)!.to && regOf.get(u.after)!.entry);
            const two = u.server.form === 'two' || (u.server.form === undefined && u.server.cursorEntry);
            next = two ? cursorMcp.bridgeFormOf(entry, catalog, u.server.cursorEntry || null) || entry : entry;
        }
        if (next && !deepEqual(keepOf(catalog, have[name]!, row), keepOf(catalog, next, row))) names.push(name);
    }
    return names;
}

