// The fixes for the list, <root>/mcps.json (spec D1, D9). A row of kind `file` names no `fix` function: its `steps`
// function plans list-write and the rest, which fix.ts's file pass runs through apply.ts as one plan.
//
// list-import: a managed registration with no entry in its family's list, or the 0.4.x record, moves onto
// the list - each registration as read with clients claude, the record's own entries as they are, and the record moved
// aside with .0.4.bak added. Install and configure do the same the first time they write a family
// (plan/lists.ts), with the same importUnlisted.
import fs from 'node:fs';
import path from 'node:path';
import * as roots from '../roots/roots.ts';
import * as lists from '../mcps-list/mcps-list.ts';
import { importUnlisted, adoptedClients } from '../plan/lists.ts';
import { SCOPES, folderList, cursorSteps } from '../plan/cursor-steps.ts';
import { helperParts } from '../entries/entry.ts';
import { readGuardOf, denyReadStep, configDirsWithPlugin } from '../plan/repair-tail.ts';
import * as kept from '../core/kept.ts';
import * as keys from '../keys/keys.ts';
import * as cursorMcp from '../cursor/cursor-mcp.ts';
import * as workspace from '../roots/workspace.ts';
import { deepEqual } from '../core/json-file.ts';
import * as serenaConfig from '../apply/serena-config.ts';
import type { ServerEntry } from '../core/types.ts';
import type { CatalogRow } from '../catalog/types.ts';
import type { ListServer, OldRecord } from '../mcps-list/types.ts';
import type { CursorWritePlanStep, ListCtx, ListWriteStep, McpAddStep, McpReplaceStep, PlannedServer, PlanStep, SerenaBaseModesStep, SerenaConfigInitStep, SerenaProjectFolderStep } from '../plan/types.ts';
import type { DriftWhere, Finding, FixCtx } from './types.ts';

const pathOf = (context: { platform: string }) => (context.platform === 'win32' ? path.win32 : path.posix);
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

// The family's roots as install would take them: the root in use, else the recommended one.
const rootsOf = (context: FixCtx) => roots.resolveRoots(context.inventory, null, { project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog }).roots;

// What a server brought into a list where only some servers have Cursor is told: it is Claude Code only, and configure adds Cursor.
export const mixedNote = (names: string[]): string => `${names.join(', ')}: set up for Claude Code only - the list's servers are not all on Cursor; /alfred-tools:configure (Apps) adds Cursor`;

// -> [{ id, name: <list file>, scope: null, family, servers, record: <the 0.4.x record> | null, found }]
export function listImportDetect(context: FixCtx): Finding[]
{
    const pathApi = pathOf(context);
    const resolvedRoots = rootsOf(context);
    const out: Finding[] = [];
    for (const family of ['project', 'global'] as const)
    {
        const list = context.inventory.lists && context.inventory.lists[family];
        // a list or record this plugin cannot read, or one a newer plugin wrote, is left as it is
        if (list && list.note) continue;
        const servers = importUnlisted(context.inventory, family, context.catalog, { roots: resolvedRoots });
        const file = list ? list.file : resolvedRoots[family] ? pathApi.join(resolvedRoots[family]!, roots.FILES.list) : null;
        if (!file) continue;
        const beside = pathApi.join(pathApi.dirname(file), roots.FILES.record);
        const record = list && list.old ? list.old : fs.existsSync(beside) ? beside : null;
        if (!servers.length && !record) continue;
        const what = [servers.length ? `${plural(servers.length, 'managed server')} not in it (${servers.map((server) => server.name).join(', ')})` : null, record ? `${record} still holds the servers left on their own` : null].filter(Boolean);
        const afterNote = servers.length && adoptedClients(context.inventory, family).mixed ? mixedNote(servers.map((server) => server.name)) : undefined;
        out.push({ id: 'list-import', name: file, scope: null, family, servers, record, found: `${file}: ${what.join('; ')}`, ...(afterNote ? { afterNote } : {}) });
    }
    return out;
}

// The plan for one family: its root's .gitignore when the root is new, the list-write (the servers as read, `after:
// null`, and the own entries the list and the record hold, as they are), the record moved aside, the roots map.
export function listImportSteps(finding: Finding, context: FixCtx): PlanStep[]
{
    const pathApi = pathOf(context);
    const root = pathApi.dirname(finding.name);
    const existed = fs.existsSync(root);
    const steps: PlanStep[] = [];
    if (!existed && pathApi.basename(root) !== '.alfred')
        steps.push({ op: 'root-ignore', path: root, why: `the new root ${root}: its .gitignore keeps the key file, the list and the data out of git` });
    const read = lists.readList(finding.name);
    const own = read && !read.state ? read.own : [];
    const old = finding.record ? roots.ownOnly((lists.readOldRecord(finding.record) || {} as Partial<OldRecord>).servers) : [];
    const have = new Set(own.map(roots.recordKey));
    const keep = [...own, ...old.filter((entry) => !have.has(roots.recordKey(entry)))];
    // a server brought for Cursor whose helper is this plugin's gets Cursor's bridge copy, so the bridge is in the root
    const twoForms = finding.servers!.filter((server) => (server.clients || []).includes('cursor') && helperParts(server.entry.headersHelper));
    const bridge = pathApi.join(root, roots.FILES.bridge);
    if (twoForms.length && ['absent', 'lower'].includes(roots.shippedState('bridge', bridge).state))
        steps.push({ op: 'write-bridge', path: root, why: `${root}: mcp-bridge.js, which fills a hosted URL from .mcps-secrets each time the server starts` });
    const write: ListWriteStep = {
        op: 'list-write', file: finding.name, family: finding.family!,
        upserts: finding.servers!.map((server) => ({ server: twoForms.includes(server) ? { ...server, form: 'two' } : server, after: null, cursorFile: null })), drops: [],
        own: finding.record ? { entries: [], keep, live: null } : null,
        why: `${finding.name}: the servers alfred-tools manages, as read, and the ones left on their own`,
    };
    steps.push(write);
    if (finding.record) steps.push({ op: 'retire-record', file: finding.record, why: `${finding.record}: the 0.4.x record - its entries are in ${finding.name} now` });
    const map = (context.inventory.roots && context.inventory.roots.map) || null;
    const mapped = !map ? null : finding.family === 'global' ? map.global : (map.projects || {})[roots.mapKey(context.inventory.project)];
    if (mapped !== root) steps.push({ op: 'record-root', family: finding.family!, project: context.inventory.project, root, why: `the ${finding.family} root ${root}: written to the roots map, so the commands find it again` });
    return [...steps, ...cursorStepsOf(write, context)];
}

// Cursor's file for the servers this list-write brings for Cursor, read after the list is written (spec C2): the same
// cursor-write install and configure plan, so a brought server is in both apps in the run that lists it. Taken names
// the user's own Cursor file holds are left, as the repair tail leaves them.
function cursorStepsOf(write: ListWriteStep, context: FixCtx): CursorWritePlanStep[]
{
    if (!write.upserts.some((upsert) => (upsert.server.clients || []).includes('cursor'))) return [];
    const tctx: ListCtx = { platform: context.platform, project: context.inventory.project, home: context.home, env: context.env, catalog: context.catalog, roots: rootsOf(context), uses: [] };
    const out = { steps: [write] as PlanStep[], notes: [] as string[], errors: [] as string[] };
    const planned = cursorSteps(context.inventory, tctx, out, {});
    return out.errors.length ? [] : planned;
}

// read-guard (0.5.0): a root that holds the key file or mcp-remote's sign-in folder, and Claude Code's settings that do
// not deny an AI session's Read tool there (rulings 12 and 13). Both are checked by name only - fs.existsSync, never
// opened. One finding per settings file, naming every rule it lacks; its plan is one deny-read. Part E: the current
// config dir first, then each other config dir under the home that has this plugin installed (configDirsWithPlugin);
// the plugin data such a dir keeps is its own, so its finding says an update there may offer a declined uninstall again.
export function readGuardDetect(context: FixCtx): Finding[]
{
    const pathApi = pathOf(context);
    const resolvedRoots = rootsOf(context);
    const seen = [...new Set([resolvedRoots.project, resolvedRoots.global].filter(Boolean) as string[])];
    const why: string[] = [];
    const want: string[] = [];
    const has = (name: string) => seen.find((root) => fs.existsSync(pathApi.join(root, name)));
    const secrets = has(roots.FILES.secrets);
    if (secrets) { want.push(roots.READ_GUARD.secrets); why.push(`${pathApi.join(secrets, roots.FILES.secrets)}`); }
    const signIns = has(roots.FILES.signIns);
    if (signIns) { want.push(roots.READ_GUARD.signIns); why.push(`${pathApi.join(signIns, roots.FILES.signIns)}/`); }
    if (!want.length) return [];
    const bad = (file: string): Finding => ({ id: 'read-guard', name: file, scope: null, rules: want, found: `${file}: not a settings object alfred-tools can read`, blocked: `add ${want.join(' and ')} to permissions.deny yourself` });
    const out: Finding[] = [];
    const current = readGuardOf(context, want);
    if (current.bad) out.push(bad(current.file));
    else if (current.rules.length) out.push({ id: 'read-guard', name: current.file, scope: null, rules: current.rules, found: `${current.file} does not deny ${current.rules.join(' or ')} - an AI session's Read tool can open ${why.join(' and ')}` });
    for (const dir of configDirsWithPlugin(context.home, pathApi.dirname(current.file), context.platform))
    {
        const guard = readGuardOf(context, want, dir);
        if (guard.bad) out.push(bad(guard.file));
        else if (guard.rules.length) out.push({ id: 'read-guard', name: guard.file, scope: null, rules: guard.rules, found: `${dir} has alfred-tools installed and does not deny ${guard.rules.join(' or ')} - an AI session's Read tool can open ${why.join(' and ')}`, afterNote: `${dir}: read guard added - it keeps its own plugin data, so an update there may offer a declined uninstall again` });
    }
    return out;
}

export const readGuardSteps = (finding: Finding) => [denyReadStep(finding.name, finding.rules!)];

// serena-base-modes (0.5.0, D7): a managed serena's home, other than an alfred-code 2.x one, whose serena_config.yml
// lists base modes. Read by serena-config.ts, which reads that key alone and never the file's other lines.
export function serenaBaseModesDetect(context: FixCtx): Finding[]
{
    const out: Finding[] = [];
    const seen = new Set<string>();
    for (const registration of (context.inventory.registrations || []).filter((candidate) => candidate.rowId === 'serena' && !candidate.own && !candidate.alfredRetired && candidate.choice !== 'own' && candidate.scope !== 'inherited'))
    {
        const home = registration.entry && registration.entry.env && registration.entry.env.SERENA_HOME;
        if (!home) continue;
        const editable = serenaConfig.editableHome(home, { platform: context.platform });
        const file = serenaConfig.configOf(home);
        if (!editable.ok || seen.has(file)) continue;
        seen.add(file);
        if (serenaConfig.baseModesState(file) !== 'set') continue;
        out.push({ id: 'serena-base-modes', name: file, scope: null, file, shared: Boolean(editable.shared), found: `${file} lists base modes - serena's manual names edit tools its context leaves out`, ...(editable.shared ? { note: serenaConfig.planNote(registration.entry, { platform: context.platform }) } : {}) });
    }
    return out;
}

export const serenaBaseModesSteps = (finding: Finding): SerenaBaseModesStep[] => [{ op: 'serena-base-modes', file: finding.file!, shared: finding.shared, why: `${finding.file}: base_modes: [], so serena's manual names only the tools it has` }];

// serena-project-folder (0.6.0, Part B): a managed serena's home, other than an alfred-code 2.x one and one holding a $, whose
// serena_config.yml lacks project_serena_folder_location or holds another value - or is not there yet. The steps write the
// file when it is missing and set the key, and name each project that still keeps a .serena folder in its own tree.
export function serenaProjectFolderDetect(context: FixCtx): Finding[]
{
    const out: Finding[] = [];
    const seen = new Set<string>();
    for (const registration of (context.inventory.registrations || []).filter((candidate) => candidate.rowId === 'serena' && !candidate.own && !candidate.alfredRetired && candidate.choice !== 'own' && candidate.scope !== 'inherited'))
    {
        const home = registration.entry && registration.entry.env && registration.entry.env.SERENA_HOME;
        if (!home) continue;
        const editable = serenaConfig.editableHome(home, { platform: context.platform });
        const file = serenaConfig.configOf(home);
        if (!editable.ok || 'error' in serenaConfig.folderValue(home) || seen.has(file)) continue;
        seen.add(file);
        if (serenaConfig.folderState(file, home) === 'same') continue;
        out.push({ id: 'serena-project-folder', name: file, scope: null, file, path: home, shared: Boolean(editable.shared), found: `${file} does not set ${serenaConfig.FOLDER_KEY} - serena keeps each project's .serena folder inside the project`, ...(editable.shared ? { note: serenaConfig.planNote(registration.entry, { platform: context.platform }) } : {}) });
    }
    return out;
}

export const serenaProjectFolderSteps = (finding: Finding): (SerenaConfigInitStep | SerenaProjectFolderStep)[] =>
{
    const file = finding.file!;
    const home = finding.path!;
    const init: SerenaConfigInitStep[] = serenaConfig.folderState(file, home) === 'absent' && !fs.existsSync(file) ? [{ op: 'serena-config-init', file, home, why: `${file}: written with its project folders under ${home}/projects` }] : [];
    return [...init, { op: 'serena-project-folder', file, home, why: `${file}: ${serenaConfig.FOLDER_KEY} under ${home}/projects, so serena keeps each project's .serena folder there` }];
};

// ---- client-drift and cursor-file (0.5.0, D9) -------------------------------------------------------------------------
// A list entry whose copy in Claude Code or in Cursor was edited or removed by hand. Both sides are compared after
// kept.maskCredentials, each app with its own form (cursorEntry || entry for Cursor), so a stdio keyed route whose copies hold the
// value while the list holds the marker is not drift. Never applied without an answer: --input drift:<app>:<name>~<scope>.

const APP_LABELS: Record<string, string> = { claude: 'Claude Code', cursor: 'Cursor' };
const cursorCtx = (context: FixCtx) => ({ platform: context.platform, project: context.inventory.project, home: context.home, env: context.env || {} });
const usableList = (context: FixCtx, family: 'project' | 'global') => { const list = context.inventory.lists && context.inventory.lists[family]; return list && !list.note && !list.old ? list : null; };

// Does a copy hold a key-shaped string outside its route's key field? Tested here, never returned.
function keyGuardOf(copy: ServerEntry, row: CatalogRow | null | undefined, routeId: string | null | undefined): boolean
{
    const route = row && row.routes ? row.routes[routeId!] : null;
    const field = new Set(keys.tokenFields(copy, route).map((tokenField) => tokenField.at.join('.')));
    let hit = false;
    const walk = (node: unknown, at: string[]) =>
    {
        if (hit) return;
        if (typeof node === 'string') { if (!field.has(at.join('.')) && kept.looksLikeKey(node)) hit = true; return; }
        if (node && typeof node === 'object') for (const [key, child] of Object.entries(node)) walk(child, [...at, key]);
    };
    walk(copy, []);
    return hit;
}

function driftOf(server: ListServer, app: string, change: string, { list, family, file = null, inherited = null, keyGuard = false, keyEmpty = false, rowGone = false }: DriftWhere): Finding
{
    const found = inherited
        ? (change === 'missing' ? `${server.name} from ${inherited} is no longer in Cursor's ${file}` : `Cursor's copy in ${file} differs from ${inherited}'s list`)
        : (change === 'missing' ? `on ${list} for ${APP_LABELS[app]}, which no longer has it` : `${APP_LABELS[app]}'s copy differs from ${list}`);
    return { id: 'client-drift', name: server.name, scope: server.scope, row: server.row, route: server.route, app, change, inherited, keyGuard, keyEmpty, rowGone, family, list, file, driftKey: `drift:${app}:${server.name}~${server.scope}`, found };
}

// Is the copy's key field empty where the list holds the key (kept.MARKER)? A copy written before its value was found -
// Keeping it would blank the other app's working key, so only Restore and Leave are offered.
function keyEmptyOf(copy: ServerEntry, want: ServerEntry, row: CatalogRow | null | undefined, routeId: string | null | undefined): boolean
{
    const route = row && row.routes ? row.routes[routeId!] : null;
    const fields = keys.tokenFields(copy, route);
    return fields.length > 0 && fields.every((tokenField) =>
    {
        const copyValue = keys.valueAt(copy, tokenField.at);
        const wantedValue = keys.valueAt(want, tokenField.at);
        return typeof copyValue === 'string' && !copyValue.trim() && typeof wantedValue === 'string' && wantedValue.includes(kept.MARKER);
    });
}

// -> [finding], each entry's Claude Code finding before its Cursor one
export function clientDriftDetect(context: FixCtx): Finding[]
{
    const catalog = context.catalog;
    const cctx = cursorCtx(context);
    const out: Finding[] = [];
    const regs = (context.inventory.registrations || []).filter((registration) => registration.scope !== 'inherited');
    const same = (left: unknown, right: unknown) => deepEqual(left, right);
    const compare = (copy: ServerEntry | undefined, want: ServerEntry, server: ListServer, app: string, where: DriftWhere) =>
    {
        const row = catalog.byId.get(server.row!);
        if (copy === undefined) return out.push(driftOf(server, app, 'missing', where));
        if (same(kept.maskCredentials(copy, row), kept.maskCredentials(want, row))) return undefined;
        return out.push(driftOf(server, app, 'differs', { ...where, keyGuard: keyGuardOf(copy, row, server.route), keyEmpty: keyEmptyOf(copy, want, row, server.route), rowGone: !cursorMcp.matchesRow(copy, row) }));
    };
    for (const family of ['project', 'global'] as const)
    {
        const list = usableList(context, family);
        if (!list) continue;
        const servers = list.servers || [];
        const where = { list: list.file, family };
        for (const server of servers.filter((candidate) => (candidate.clients || ['claude']).includes('claude')))
        {
            const registration = regs.find((candidate) => candidate.name === server.name && candidate.scope === server.scope);
            compare(registration ? registration.entry : undefined, server.entry, server, 'claude', where);
        }
        // Cursor's file of the family; one Cursor's writer refuses is cursor-file's
        const file = cursorMcp.fileFor(family, cctx);
        const read = cursorMcp.readCursor(file);
        if (read.state !== 'ok' && read.state !== 'absent') continue;
        const have = read.doc!.mcpServers;
        for (const [name, managed] of cursorMcp.managedSet([{ file: list.file, scopes: SCOPES[family], servers }]))
        {
            const server = servers.find((candidate) => candidate.name === name && candidate.scope === managed.scope);
            compare(Object.hasOwn(have, name) ? have[name] : undefined, managed.entry, server!, 'cursor', { ...where, file });
        }
    }
    // a workspace member's copies of the folders above's project servers (D4a): compared with the folder above's entry
    const workspaceRecord = context.inventory.workspace !== undefined ? context.inventory.workspace : workspace.workspaceOf(context.inventory.project, context.env || {});
    if (workspaceRecord && workspaceRecord.root && (workspaceRecord.ancestors || []).length)
    {
        const file = cursorMcp.fileFor('project', cctx);
        const read = cursorMcp.readCursor(file);
        if (read.state === 'ok' || read.state === 'absent')
        {
            const own = usableList(context, 'project');
            const seen = new Set<string>(own ? cursorMcp.managedSet([{ file: own.file, scopes: SCOPES.project, servers: own.servers || [] }]).keys() : []);
            for (const up of workspaceRecord.ancestors)
            {
                const ancestorList = folderList(context.inventory, up, cctx);
                if (!ancestorList) continue;
                for (const [name, managed] of cursorMcp.managedSet([{ file: ancestorList.file, scopes: ['project'], servers: ancestorList.servers }]))
                {
                    if (seen.has(name)) continue;
                    seen.add(name);
                    const server = ancestorList.servers.find((candidate) => candidate.name === name && candidate.scope === managed.scope);
                    const before = out.length;
                    compare(Object.hasOwn(read.doc!.mcpServers, name) ? read.doc!.mcpServers[name] : undefined, managed.entry, server!, 'cursor', { list: ancestorList.file, family: 'project', file, inherited: up });
                    // an inherited copy is the folder above's to change: Restore or Leave only
                    for (const finding of out.slice(before)) { finding.keyGuard = false; finding.rowGone = false; }
                }
            }
        }
    }
    const order = [...new Set(out.map((finding) => `${finding.name}~${finding.scope}`))];
    return out.sort((left, right) => order.indexOf(`${left.name}~${left.scope}`) - order.indexOf(`${right.name}~${right.scope}`) || (left.app === 'claude' ? -1 : 1) - (right.app === 'claude' ? -1 : 1));
}

// The steps of one answered finding. answer: keep | restore | leave | drop.
export function clientDriftSteps(finding: Finding, context: FixCtx, input: Record<string, string> = {}): PlanStep[]
{
    const answer = input[finding.driftKey!];
    const catalog = context.catalog;
    const row = catalog.byId.get(finding.row!);
    const read = lists.readList(finding.list!);
    const listServer = read && !read.state ? read.servers.find((candidate) => candidate.name === finding.name && candidate.scope === finding.scope) : null;
    if (!listServer || answer === 'leave') return [];
    const key = `mcp:${finding.name}~${finding.scope}`;
    const why = `${finding.name} (${finding.scope}): ${answer === 'keep' ? `the change in ${APP_LABELS[finding.app!]} kept` : answer === 'drop' ? `${APP_LABELS[finding.app!]} taken off its list entry` : `${APP_LABELS[finding.app!]}'s copy restored from the list`}`;
    const listStep = (server: PlannedServer | null): ListWriteStep => ({ op: 'list-write', file: finding.list!, family: finding.family!, upserts: server ? [{ server, after: null, cursorFile: null }] : [], drops: server ? [] : [{ key, after: null }], own: null, why: `${finding.list}: ${why}` });
    // Cursor's copy of this one name, the file's other entries as they are
    const cursorStep = (): CursorWritePlanStep => ({ op: 'cursor-write', file: finding.file || cursorMcp.fileFor(finding.family!, cursorCtx(context)), family: finding.family!, lists: [{ file: finding.list!, scopes: finding.inherited ? ['project'] : SCOPES[finding.family as keyof typeof SCOPES] }], before: [finding.name], only: [finding.name], skip: [], replace: [], why: `${finding.file || 'Cursor'}: ${why}` });
    const registration = (context.inventory.registrations || []).find((candidate) => candidate.name === finding.name && candidate.scope === finding.scope && candidate.scope !== 'inherited');
    const claudeStep = (entry: ServerEntry): McpReplaceStep | McpAddStep => (registration
        ? { op: 'mcp-replace', name: finding.name, scope: finding.scope!, old: registration.entry, entry, row: finding.row!, route: finding.route!, why }
        : { op: 'mcp-add', name: finding.name, scope: finding.scope!, entry, row: finding.row!, route: finding.route!, why });
    const cursorCopy = () => { const cursorRead = cursorMcp.readCursor(finding.file!); return cursorRead.state === 'ok' ? cursorRead.doc!.mcpServers[finding.name] : undefined; };
    if (finding.inherited) return answer === 'restore' ? [cursorStep()] : [];
    if (answer === 'restore')
    {
        if (finding.app === 'cursor') return [cursorStep()];
        // the list holds each key value as the marker: from the registration as read, else from the key files
        let entry = listServer.entry;
        if (kept.holdsKept(entry) && registration) { const restored = kept.restore(entry, registration.entry, row); if (!restored.error) entry = restored.entry!; }
        if (kept.holdsKept(entry) && listServer.key && row && row.routes[listServer.route!] && row.routes[listServer.route!]!.tokenVar)
        {
            const resolvedRoots = roots.resolveRoots(context.inventory, null, { project: context.inventory.project, home: context.home, platform: context.platform, catalog }).roots;
            const at = keys.valueIn(keys.stdioChain({ scope: finding.scope!, projectRoot: resolvedRoots.project, globalRoot: resolvedRoots.global }), listServer.key);
            if (at) entry = keys.fillKeys(entry, row, listServer.route!, finding.scope!, { [row.routes[listServer.route!]!.tokenVar!]: at.value });
        }
        if (kept.holdsKept(entry)) throw new Error(`${finding.name} (${finding.scope}): the list's entry holds a key ${listServer.key ? `named ${listServer.key} ` : ''}that is filled nowhere - fill it, then run fix again`);
        return [claudeStep(entry)];
    }
    if (answer === 'drop')
    {
        const clients = (listServer.clients || ['claude']).filter((client) => client !== finding.app);
        return [listStep(clients.length ? { ...listServer, clients } : null)];
    }
    // keep: the copy no longer the row's server is the user's own, and leaves the list
    if (finding.rowGone) return [listStep(null)];
    if (finding.app === 'claude')
    {
        const server = { ...listServer, entry: kept.maskCredentials(registration!.entry, row) };
        if (listServer.cursorEntry) server.cursorEntry = cursorMcp.bridgeFormOf(registration!.entry, catalog, listServer.cursorEntry) || listServer.cursorEntry;
        return [listStep(server), ...((listServer.clients || []).includes('cursor') ? [cursorStep()] : [])];
    }
    const copy = cursorCopy();
    if (listServer.cursorEntry) return [listStep({ ...listServer, cursorEntry: kept.maskCredentials(copy!, row) })];
    // a one-form entry: Claude Code takes Cursor's copy, its key fields from the registration as read
    const back = registration ? kept.restore(kept.maskCredentials(copy, row), registration.entry, row) : { error: 'none' };
    return [claudeStep(back.error ? copy! : back.entry!), listStep({ ...listServer, entry: kept.maskCredentials(copy!, row) })];
}

// cursor-file (advice): a Cursor file alfred-tools will not write, with what to do.
export function cursorFileDetect(context: FixCtx): Finding[]
{
    const cctx = cursorCtx(context);
    const out: Finding[] = [];
    for (const family of ['project', 'global'] as const)
    {
        const file = cursorMcp.fileFor(family, cctx);
        const why = cursorMcp.refusal(cursorMcp.readCursor(file));
        if (why) out.push({ id: 'cursor-file', name: file, scope: null, found: `${file} ${why}` });
    }
    return out;
}

