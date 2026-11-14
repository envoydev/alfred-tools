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

const forCursor = (server: { clients?: string[] | undefined }): boolean => (server.clients || []).includes('cursor');
export const SCOPES = { project: ['local', 'project'], global: ['user'] };

// A list's servers after a list-write step: its drops out, its upserts in, as apply's mergeList does.
function afterWrite(servers: ListServer[], step: ListWriteStep | undefined): ListServer[]
{
    if (!step) return servers;
    const drops = new Set((step.drops || []).map((drop) => drop.key));
    const up = new Map((step.upserts || []).map((upsert): [string, ListServer] => [lists.serverKey(upsert.server), upsert.server as ListServer]));
    return [...servers.filter((server) => !drops.has(lists.serverKey(server)) && !up.has(lists.serverKey(server))), ...up.values()];
}

// The names a Cursor file already holds that its list does not mark for Cursor, among the upserts set up for Cursor:
// each the user's own, or one from before this design. `sameRow`: the entry there is the upsert's row's server.
// upserts: [{ server, cursorFile }] -> [{ file, name, sameRow }]
export function takenNames(inventory: Inventory, context: CursorPlaceCtx, upserts: { server: PlannedServer; cursorFile: string | null }[] | null | undefined): Taken[]
{
    const catalog = context.catalog || catalogLib.load();
    const reads = new Map<string, ReturnType<typeof cursorMcp.readCursor>>();
    const docOf = (file: string) => { if (!reads.has(file)) reads.set(file, cursorMcp.readCursor(file)); return reads.get(file)!; };
    const out: Taken[] = [];
    for (const upsert of upserts || [])
    {
        if (!forCursor(upsert.server)) continue;
        const family = roots.familyOf(upsert.server.scope);
        const file = upsert.cursorFile || cursorMcp.fileFor(family, context);
        const read = docOf(file);
        if (read.state !== 'ok' || !Object.hasOwn(read.doc!.mcpServers, upsert.server.name)) continue;
        const familyList = inventory.lists && inventory.lists[family];
        if (familyList && !familyList.note && (familyList.servers || []).some((server) => server.name === upsert.server.name && forCursor(server))) continue;
        if (out.some((taken) => taken.file === file && taken.name === upsert.server.name)) continue;
        out.push({ file, name: upsert.server.name, sameRow: cursorMcp.matchesRow(read.doc!.mcpServers[upsert.server.name]!, catalog.byId.get(upsert.server.row!)) });
    }
    return out;
}

const hasGit = (dir: string, pathApi: path.PlatformPath): boolean => fs.existsSync(pathApi.join(dir, '.git'));

// D4a's 'No workspace' check: the project is a folder of a parent folder's git repo, or holds child git repos.
function outsideItsRepo(project: string, pathApi: path.PlatformPath): boolean
{
    if (!hasGit(project, pathApi))
        for (let dir = pathApi.dirname(project); ; dir = pathApi.dirname(dir))
        {
            if (hasGit(dir, pathApi)) return true;
            if (pathApi.dirname(dir) === dir) break;
        }
    try { return fs.readdirSync(project, { withFileTypes: true }).some((dirent) => dirent.isDirectory() && hasGit(pathApi.join(project, dirent.name), pathApi)); }
    catch { return false; }
}

// A workspace folder's list, as a member's cursor-write reads it (D4a): the first mcps.json the commands' order finds for
// that folder. A folder with none has no root, and none is made. -> { file, servers } | null
export function folderList(inventory: Pick<Inventory, 'roots'>, folder: string, context: Pick<Machine, 'home' | 'platform'>): { file: string; servers: ListServer[] } | null
{
    const fctx = { project: folder, home: context.home, platform: context.platform };
    for (const file of lists.listFiles({ roots: inventory.roots, registrations: [] }, 'project', fctx))
    {
        const list = lists.readList(file);
        if (list && !list.state) return { file, servers: list.servers };
    }
    return null;
}

// The lists a workspace folder's Cursor file is composed from: its own (local and project scope), then each folder
// above's project scope, the nearest first. `own` overrides the folder's own list (the one this plan writes);
// `listed` overrides a folder above's list. -> { sources: [{ file, scopes, servers }], lists: [{ file, scopes }] }
function sourcesOf(inventory: Inventory, context: ListCtx, folder: string, ancestors: string[], { own, listed }: { own?: { file: string | null | undefined; servers: ListServer[] } | undefined; listed?: Map<string, { file: string | null | undefined; servers: ListServer[] }> | undefined } = {}): { sources: ListSource[]; lists: { file: string; scopes: string[] }[] }
{
    const sources: ListSource[] = [];
    const mine = own !== undefined ? own : folderList(inventory, folder, context);
    if (mine && mine.file) sources.push({ file: mine.file, scopes: SCOPES.project, servers: mine.servers || [] });
    for (const up of ancestors)
    {
        const ancestorList = listed && listed.has(up) ? listed.get(up) : folderList(inventory, up, context);
        if (ancestorList && ancestorList.file) sources.push({ file: ancestorList.file, scopes: ['project'], servers: ancestorList.servers || [] });
    }
    return { sources, lists: sources.map((source) => ({ file: source.file, scopes: source.scopes })) };
}

const sameKeys = (before: Map<string, unknown>, after: Map<string, unknown>): boolean => before.size === after.size && [...before.keys()].every((key) => after.has(key));

// The cursor-write steps of a plan (spec D2): one per Cursor file whose managed set the plan's list-write steps change,
// `before` from the lists as they stand. A name Cursor's file already holds as the user's is written only on an answer
// (answers.cursorNames['<name>@<file>']: 'replace' | 'keep'); with none it is a plan error, and `out.taken` names it. A file Cursor's writer
// refuses is a note: no step, and the entries new to Cursor are recorded without it. Reads `out.steps`' list-write
// steps, and marks each upsert set up for Cursor with the file it waits on.
//
// In a workspace (D4a, alfred-code's record), the project file also takes the project scope of each folder above, and
// a change to this folder's project scope writes each member below it too: no member gets a root or a list.
export function cursorSteps(inventory: Inventory, context: ListCtx, out: PlanOut, answers: Answers = {}): CursorWritePlanStep[]
{
    const pathApi = pathFor(context.platform);
    const named = answers.cursorNames || {};
    const steps: CursorWritePlanStep[] = [];
    const workspaceRecord = inventory.workspace !== undefined ? inventory.workspace : (context.project ? workspace.workspaceOf(context.project, context.env || {}) : null);
    const inWs = Boolean(workspaceRecord && workspaceRecord.root);
    const strip = (upsert: ListUpsert) => { upsert.server = { ...upsert.server, clients: (upsert.server.clients || []).filter((client) => client !== 'cursor') }; };
    // a taken name in `file`: 'keep' runs `onKeep`, 'replace' is pushed to `replace`, no answer is a plan error
    const settle = (taken: Taken[], replace: string[], onKeep: (takenEntry: Taken) => void) =>
    {
        for (const takenEntry of taken)
        {
            const answer = named[`${takenEntry.name}@${takenEntry.file}`];
            if (answer === 'keep') onKeep(takenEntry);
            else if (answer === 'replace') replace.push(takenEntry.name);
            else
            {
                out.errors.push(`cursor: ${takenEntry.file} already has ${takenEntry.name} - answer cursor-name-${takenEntry.name}@${takenEntry.file}`);
                out.taken = [...(out.taken || []), takenEntry];
            }
        }
    };
    for (const family of ['project', 'global'] as Family[])
    {
        const writes = out.steps.filter((step): step is ListWriteStep => step.op === 'list-write' && step.family === family);
        if (!writes.length) continue;
        const current = inventory.lists && inventory.lists[family] && !inventory.lists[family].note && !inventory.lists[family].old ? inventory.lists[family] : null;
        const target = context.roots && context.roots[family] ? pathApi.join(context.roots[family], roots.FILES.list) : current ? current.file : null;
        if (!target) continue;
        const scopes = SCOPES[family];
        const beforeServers = current ? current.servers || [] : [];
        const above: string[] = family === 'project' && inWs ? workspaceRecord!.ancestors : [];
        const base = current && current.file === target ? beforeServers : (((foundList(inventory, target, pathApi) || {}) as Partial<FoundList>).servers || []);
        const beforeSrc = sourcesOf(inventory, context, context.project, above, { own: { file: current && current.file, servers: beforeServers } });
        const before = cursorMcp.managedSet(family === 'project' ? beforeSrc.sources : [{ file: (current && current.file) as string, scopes, servers: beforeServers }]);
        const wasForCursor = new Set(beforeServers.filter(forCursor).map(lists.serverKey));
        const upserts = writes.flatMap((write) => write.upserts || []);
        const file = cursorMcp.fileFor(family, context);

        const why = cursorMcp.refusal(cursorMcp.readCursor(file));
        if (why)
        {
            if (upserts.some((upsert) => forCursor(upsert.server))) out.notes.push(`Cursor: ${file} ${why} - not written; Claude Code is`);
            for (const upsert of upserts) if (forCursor(upsert.server) && !wasForCursor.has(lists.serverKey(upsert.server))) strip(upsert);
            continue;
        }

        const replace: string[] = [];
        const fresh = upserts.filter((upsert) => forCursor(upsert.server) && !before.has(upsert.server.name)).map((upsert) => ({ ...upsert, cursorFile: file }));
        settle(takenNames(inventory, context, fresh), replace, (takenEntry) => { for (const upsert of upserts) if (upsert.server.name === takenEntry.name && forCursor(upsert.server)) strip(upsert); });
        for (const upsert of upserts) if (forCursor(upsert.server)) upsert.cursorFile = file;

        // after the answers: a kept name is no longer set up for Cursor
        const afterServers = afterWrite(base, writes.find((write) => write.file === target));
        const afterSrc = sourcesOf(inventory, context, context.project, above, { own: { file: target, servers: afterServers } });
        const after = cursorMcp.managedSet(family === 'project' ? afterSrc.sources : [{ file: target, scopes, servers: afterServers }]);
        const touched = upserts.some((upsert) => forCursor(upsert.server));
        if (sameKeys(before, after) && !touched) continue;
        const listsOf = family === 'project' ? afterSrc.lists : [{ file: target, scopes }];
        // a copy Cursor lacks or one edited by hand is left as it is (spec D1): fix's client-drift settles it
        const hold = heldCopies(file, before, after, context, out);
        const reapprove = changedCopies(file, before, after, hold, upserts, context, out);
        steps.push({ op: 'cursor-write', file, family, lists: listsOf, before: [...before.keys()], skip: hold, replace, reapprove, why: `${file}: Cursor's servers from ${target}, the user's own kept as they are` });
        // why a workspace record was read as none, said once (D4a)
        if (family === 'project' && workspaceRecord && workspaceRecord.notes) for (const note of workspaceRecord.notes) if (!out.notes.includes(note)) out.notes.push(note);

        if (family !== 'project') continue;
        // the members below this folder, when its project scope changed for Cursor (D4a)
        const projectOnly = (servers: ListServer[]) => cursorMcp.managedSet([{ file: target, scopes: ['project'], servers }]);
        const projectTouched = upserts.some((upsert) => forCursor(upsert.server) && upsert.server.scope === 'project');
        if (inWs && (projectTouched || !sameKeys(projectOnly(beforeServers), projectOnly(afterServers))))
            for (const member of workspace.below(workspaceRecord!, context.project))
            {
                const mfile = cursorMcp.fileFor('project', { ...context, project: member.folder });
                const mwhy = cursorMcp.refusal(cursorMcp.readCursor(mfile));
                if (mwhy) { out.notes.push(`Cursor: ${mfile} ${mwhy} - not written; ${context.project}'s servers do not reach it`); continue; }
                const listedByFolder = new Map([[context.project, { file: current && current.file, servers: beforeServers }]]);
                const mbefore = cursorMcp.managedSet(sourcesOf(inventory, context, member.folder, member.ancestors, { listed: listedByFolder }).sources);
                const msrc = sourcesOf(inventory, context, member.folder, member.ancestors, { listed: new Map([[context.project, { file: target, servers: afterServers }]]) });
                const mreplace: string[] = [];
                const mskip: string[] = [];
                const mfresh = upserts.filter((upsert) => forCursor(upsert.server) && upsert.server.scope === 'project' && !mbefore.has(upsert.server.name)).map((upsert) => ({ ...upsert, cursorFile: mfile }));
                settle(takenNames(inventory, context, mfresh), mreplace, (takenEntry) => mskip.push(takenEntry.name));
                // a member's copy edited or removed by hand is left as it is, as in the project's own file (spec D1, D4a)
                const mafter = cursorMcp.managedSet(msrc.sources);
                const mhold = heldCopies(mfile, mbefore, mafter, context, out);
                const mreapprove = changedCopies(mfile, mbefore, mafter, mhold, upserts, context, out);
                steps.push({ op: 'cursor-write', file: mfile, family, lists: msrc.lists, before: [...mbefore.keys()], skip: [...new Set([...mskip, ...mhold])], replace: mreplace, reapprove: mreapprove, why: `${mfile}: the workspace member's servers, with ${context.project}'s project servers` });
            }

        if (!after.size) continue;
        if ([...after.values()].some((managed) => managed.scope === 'local') && roots.gitIgnores(file) === false)
            out.notes.push('.cursor/mcp.json now holds this machine\'s local servers; add it to .gitignore to keep them private');
        if (inWs)
        {
            // a member that is a plain folder of the root's repo: Cursor's CLI reads the root's file there (D4a)
            const own = cursorMcp.managedSet([{ file: target, scopes, servers: afterServers }]);
            const top = context.project !== workspaceRecord!.root && own.size ? workspace.gitTop(context.project) : null;
            let rootReal: string | null = null;
            try { rootReal = realpathSync(workspaceRecord!.root!); } catch { /* none */ }
            if (top && top === rootReal)
                out.notes.push(`${context.project} is a folder of ${workspaceRecord!.root}'s git repo; Cursor's CLI reads ${pathApi.join(workspaceRecord!.root!, '.cursor', 'mcp.json')} there, so these servers reach the editor opened at ${context.project} only. Install them at the root or at Global scope for the CLI`);
        }
        else if (outsideItsRepo(context.project, pathApi))
            out.notes.push(`Cursor reads .cursor/mcp.json only from the folder it opens (its git root for the CLI), never a parent's: open Cursor at ${context.project}, or install at Global scope for servers every folder needs`);
    }
    const again = [...new Set(steps.flatMap((step) => step.reapprove || []))];
    if (again.length) out.notes.push(reapproveLine(again));
    return steps;
}

export const reapproveLine = (names: string[]): string => `Cursor asks you to approve ${names.join(', ')} again - it re-asks whenever an entry changes`;
export const keepOf = (catalog: Catalog, value: ServerEntry, row: string | null): ServerEntry => kept.keep(value, catalog.byId.get(row!));

// The managed names a cursor-write leaves alone (spec D1, D9): each the file lacks (a hand removal) or holds with another
// value than its list, compared after kept.keep. Named in the plan; the names this plan drops are not held.
export function heldCopies(file: string, before: Map<string, Managed>, after: Map<string, Managed>, context: { catalog?: Catalog | undefined }, out: Pick<PlanOut, 'notes'>): string[]
{
    const catalog = context.catalog || catalogLib.load();
    const read = cursorMcp.readCursor(file);
    if (read.state !== 'ok') return [];
    const have = read.doc!.mcpServers;
    const hold: string[] = [];
    for (const [name, managed] of before)
    {
        if (!after.has(name)) continue;
        if (!Object.hasOwn(have, name))
        {
            hold.push(name);
            out.notes.push(`${name} is on the list for Cursor but not in ${file} - left; run /preferred-tools:fix`);
        }
        else if (!deepEqual(keepOf(catalog, have[name]!, managed.row), keepOf(catalog, managed.entry, managed.row)))
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
function changedCopies(file: string, before: Map<string, Managed>, after: Map<string, Managed>, hold: string[], upserts: ListUpsert[], context: ListCtx, out: PlanOut): string[]
{
    const catalog = context.catalog || catalogLib.load();
    const read = cursorMcp.readCursor(file);
    if (read.state !== 'ok') return [];
    const have = read.doc!.mcpServers;
    const regOf = new Map((out.steps || []).filter((step): step is RegistrationStep => REG_OPS.includes(step.op)).map((step): [string | null, { entry?: ServerEntry; to?: Endpoint }] => [lists.regKey(step), step as { entry?: ServerEntry; to?: Endpoint }]));
    const names: string[] = [];
    for (const name of after.keys())
    {
        if (!before.has(name) || hold.includes(name) || !Object.hasOwn(have, name)) continue;
        const upsert = upserts.find((candidate) => candidate.server.name === name && forCursor(candidate.server));
        if (!upsert) continue;
        const row = upsert.server.row;
        let next: ServerEntry | null | undefined = upsert.server.entry ? (upsert.server.cursorEntry || upsert.server.entry) : null;
        if (!next && upsert.after && regOf.has(upsert.after))
        {
            const entry = regOf.get(upsert.after)!.entry || (regOf.get(upsert.after)!.to && regOf.get(upsert.after)!.entry);
            const two = upsert.server.form === 'two' || (upsert.server.form === undefined && upsert.server.cursorEntry);
            next = two ? cursorMcp.bridgeFormOf(entry, catalog, upsert.server.cursorEntry || null) || entry : entry;
        }
        if (next && !deepEqual(keepOf(catalog, have[name]!, row), keepOf(catalog, next, row))) names.push(name);
    }
    return names;
}

