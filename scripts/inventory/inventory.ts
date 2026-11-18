// THE INVENTORY - what is installed, read-only, no server started.
//
// Reads the project's .mcp.json, the account file (user servers, and this project's local servers), the .mcp.json of
// every folder above (inherited: listed, never changed from here) and `claude plugin list --json`, and matches each
// registration to a catalog row by what it LAUNCHES - the package in its
// args, or the URL host and path - never by its name. So a tool under a custom name is still recognised, and a
// registration that matches no row is the user's: it is listed as `own` and nothing in this plugin touches it.
import fs from 'node:fs';
import path from 'node:path';
import * as catalogLib from '../catalog/catalog.ts';
import * as account from '../core/account.ts';
import * as cli from '../core/claude-cli.ts';
import * as kept from '../core/kept.ts';
import { ALL_SCOPES, MCP_JSON } from '../core/constants.ts';
import * as roots from '../roots/roots.ts';
import { pathFor } from '../entries/platform.ts';
import { ALFRED_CODE_PLUGIN, INVENTORY_VERSION, WINDOWS_MCP_MARKETPLACE } from './constants.ts';
import { catalogMatch } from './fingerprint.ts';
import * as existing from './existing.ts';
import { workspaceOf } from '../roots/workspace.ts';
import * as lists from '../mcps-list/mcps-list.ts';
import * as cursorMcp from '../cursor/cursor-mcp.ts';
import type { Account, Env, FileState, ServerEntry, ServerMap } from '../core/types.ts';
import type { Catalog } from '../catalog/types.ts';
import type { Family, InventoryView, RootsCtx } from '../roots/types.ts';
import type { CursorOf } from '../cursor/types.ts';
import type { OwnEntry } from '../mcps-list/types.ts';
import type { Approval, ApprovalCtx, BuildOptions, Installed, InvList, InvRegistration, Inventory, MarketplaceListRow, McpJsonDoc, PluginListRow, PluginRow, SettingsDoc, Shadow, WindowsMcp } from './types.ts';

const { readState } = account;

// fingerprint.ts is its home; tests/cursor-mcp.test.ts:191 reads it from here.
export { matchesFingerprint } from './fingerprint.ts';

// ---- matching a registration to a row -------------------------------------------------------------------------------

// The catalog row and route a registration's launch belongs to, or null (the user's own).
export function matchEntry(entry: ServerEntry | null | undefined, catalog: Catalog): { rowId: string; route: string } | null
{
    const match = catalogMatch(entry, catalog);
    return match ? { rowId: match.rowId, route: match.route } : null;
}

// ---- reading the scopes ---------------------------------------------------------------------------------------------

const settingsOf = (scope: string, project: string, env: Env): string => path.join(
    scope === 'user' ? account.configDir(env) : path.join(project, '.claude'),
    scope === 'local' ? 'settings.local.json' : 'settings.json');

// ---- inherited: the .mcp.json files of the folders above ------------------------------------------------------------
// Claude Code reads the .mcp.json of the folder it starts in and of every folder above it up to the filesystem root,
// from the real path: the nearest file wins a name, a local registration beats them all, and a malformed file loses
// only its own servers (MEASURED, docs/sources.md '.mcp.json in parent folders', M1-M6).

const realOf = (folderPath: string): string => { try { return fs.realpathSync.native(folderPath); } catch { return path.resolve(folderPath); } };

// -> [{ dir, file }], nearest first, the project's own file left out
export function ancestorMcpFiles(project: string): { dir: string; file: string }[]
{
    const out: { dir: string; file: string }[] = [];
    for (let dir = realOf(project), up = path.dirname(dir); up !== dir; dir = up, up = path.dirname(dir))
    {
        const file = path.join(up, MCP_JSON);
        if (fs.existsSync(file)) out.push({ dir: up, file });
    }
    return out;
}

// The settings files a session started in `proj` reads, nearest first: the trust root's settings.local.json (the git
// root, else the folder), this folder's settings.local.json, then its settings.json - a parent folder's settings.json
// never counts (MEASURED: M7 for approvals, P4 and P5 for enabledPlugins). -> [file]
function hereSettings(proj: string): string[]
{
    const root = account.localRoot(proj);
    return [...new Set([path.join(root, '.claude', 'settings.local.json'), path.join(proj, '.claude', 'settings.local.json'), path.join(proj, '.claude', 'settings.json')])];
}

// What decides a parent's server here: the user settings, this folder's settings files, and its account entry and
// trust, all keyed on the trust root (the git root, else the folder).
function approvalContext(proj: string, env: Env, acct: Account, platform: string): ApprovalCtx
{
    const root = account.localRoot(proj);
    const entry = (account.projectEntry(acct.projects || {}, root, platform) || {}) as Account['projects'][string];
    return { user: readState<SettingsDoc>(settingsOf('user', proj, env)).doc, folder: hereSettings(proj).map((file) => readState<SettingsDoc>(file).doc), entry, trusted: entry.hasTrustDialogAccepted === true };
}

const names = (doc: SettingsDoc | null, key: string, name: string): boolean => Boolean(doc) && Array.isArray(doc![key]) && (doc![key] as unknown[]).includes(name);
const approves = (doc: SettingsDoc | null, name: string): boolean => Boolean(doc) && (doc!.enableAllProjectMcpServers === true || names(doc, 'enabledMcpjsonServers', name));

// approved | pending | rejected, as `claude mcp list` says it here (MEASURED, M7; the MCP docs' 'Project server approvals
// and workspace trust'): a disabledMcpjsonServers entry anywhere rejects; the user settings approve in any folder; this
// folder's settings and account entry approve only once it is trusted; a parent folder's settings never count.
function approvalOf(name: string, context: ApprovalCtx): Approval
{
    if ([context.user, ...context.folder, context.entry].some((doc) => names(doc, 'disabledMcpjsonServers', name))) return 'rejected';
    if (approves(context.user, name) || (context.trusted && [...context.folder, context.entry].some((doc) => approves(doc, name)))) return 'approved';
    return 'pending';
}

function pluginRows(listJson: PluginListRow[], project: string, env: Env, catalog: Catalog): PluginRow[]
{
    const rows: PluginRow[] = [];
    const here = [...hereSettings(project), settingsOf('user', project, env)].map((file) => readState<SettingsDoc>(file).doc);
    const flagIn = (doc: SettingsDoc | null, id: string) => (doc && doc.enabledPlugins ? doc.enabledPlugins[id] : undefined);
    for (const listRow of Array.isArray(listJson) ? listJson : [])
    {
        const [name, marketplace = ''] = String(listRow.id).split('@');
        const scoped = listRow.scope === 'project' || listRow.scope === 'local';
        if (scoped && listRow.projectPath && account.projectKey(listRow.projectPath) !== account.projectKey(project)) continue; // another project's
        let enabled = listRow.enabled;
        let enabledFrom: PluginRow['enabledFrom'] = 'list';
        if (ALL_SCOPES.includes(listRow.scope))
        {
            const flag = flagIn(readState<SettingsDoc>(settingsOf(listRow.scope, project, env)).doc, listRow.id);
            if (typeof flag === 'boolean') { enabled = flag; enabledFrom = 'settings'; }
        }
        // Two readings, kept apart: `enabled` is the install scope's own, which configure and update act on (an `enable`
        // over an enabled scope exits 1, S28); `enabledHere` is whether it loads in this project - the first boolean in
        // this project's settings files, then the user settings, whatever the install scope, else `enabled` (MEASURED,
        // P1-P6). Only the windows-mcp count reads it.
        const flagHere = here.map((doc) => flagIn(doc, listRow.id)).find((value) => typeof value === 'boolean');
        const enabledHere = typeof flagHere === 'boolean' ? flagHere : enabled;
        const row = catalog.tools.find((tool) => tool.kind === 'plugin' && tool.plugin === name && tool.marketplace!.name === marketplace);
        rows.push({
            id: listRow.id, plugin: name!, marketplace, scope: listRow.scope, version: listRow.version, enabled, enabledFrom, enabledHere,
            errors: listRow.errors || [], rowId: row ? row.id : null, alfredRetired: catalog.reserved.has(name!),
        });
    }
    return rows;
}

export function buildInventory({ project, env = process.env, platform = process.platform, arch = process.arch, catalog = catalogLib.load(), run = cli.runClaude, data = null }: BuildOptions): Inventory
{
    const proj = path.resolve(project);
    const out: Inventory = {
        version: INVENTORY_VERSION, project: proj, os: platform, arch, cli: null, unreadable: [], registrations: [], plugins: [], pluginServers: [], marketplaces: [], alfredCodeEnabled: false,
        sources: {},
    };

    const mcpJsonState = readState<McpJsonDoc>(path.join(proj, MCP_JSON));
    const acct = account.readAccount(env, proj, platform);
    out.sources = { project: { file: mcpJsonState.file, state: mcpJsonState.state }, account: { file: acct.file, state: acct.state }, local: { file: acct.file, state: acct.state }, user: { file: acct.file, state: acct.state } };
    for (const [scope, source] of [['project', mcpJsonState], ['local', acct], ['user', acct]] as [string, { file: string; state: FileState; error: string | null }][])
        if (source.state === 'malformed' || source.state === 'unreadable') out.unreadable.push({ scope, file: source.file, state: source.state, error: source.error });

    const approval = approvalContext(proj, env, acct, platform);
    const scopes = [['project', (mcpJsonState.doc && mcpJsonState.doc.mcpServers) || {}], ['local', acct.local], ['user', acct.user]] as [string, ServerMap][];
    for (const [scope, servers] of scopes)
    {
        if (!servers || typeof servers !== 'object') continue;
        for (const [name, entry] of Object.entries(servers))
        {
            const match = matchEntry(entry, catalog);
            out.registrations.push({
                name, scope, entry,
                rowId: match ? match.rowId : null, route: match ? match.route : null,
                own: !match,
                // alfred-code 2.10.0 or older: the stack's servers sit under reserved names; offer nothing over them
                alfredRetired: catalog.reserved.has(name),
                // this folder's own .mcp.json server waits for approval by a parent's rules (MEASURED, M8)
                ...(scope === 'project' ? { approval: approvalOf(name, approval) } : {}),
            });
        }
    }

    // the parents' servers, nearest first; `shadowed` names what Claude Code uses in their place
    const wins = new Map<string, Shadow>(Object.keys(acct.local || {}).map((name): [string, Shadow] => [name, { scope: 'local', from: null }]));
    for (const name of Object.keys((mcpJsonState.doc && mcpJsonState.doc.mcpServers) || {})) if (!wins.has(name)) wins.set(name, { scope: 'project', from: proj });
    out.sources.inherited = [];
    for (const { dir, file } of ancestorMcpFiles(proj))
    {
        const inheritedState = readState<McpJsonDoc>(file);
        out.sources.inherited.push({ file, state: inheritedState.state });
        if (inheritedState.state === 'malformed' || inheritedState.state === 'unreadable') { out.unreadable.push({ scope: 'inherited', file, state: inheritedState.state, error: inheritedState.error }); continue; }
        const servers = inheritedState.doc && inheritedState.doc.mcpServers && typeof inheritedState.doc.mcpServers === 'object' ? inheritedState.doc.mcpServers : {};
        for (const [name, entry] of Object.entries(servers))
        {
            const match = matchEntry(entry, catalog);
            out.registrations.push({
                name, scope: 'inherited', from: dir, file, entry, rowId: match ? match.rowId : null, route: match ? match.route : null, own: !match,
                alfredRetired: catalog.reserved.has(name), shadowed: wins.get(name) || null, approval: approvalOf(name, approval),
            });
        }
        for (const name of Object.keys(servers)) if (!wins.has(name)) wins.set(name, { scope: 'inherited', from: dir });
    }

    // trust, and the root folders (spec D2): the roots map in the plugin's data folder, and the root each family uses now
    out.trusted = approval.trusted;
    const rootCtx = { project: proj, home: account.homeDir(env), platform, catalog };
    out.roots = { map: roots.readMap(data) };
    out.roots.project = roots.inUse(out, 'project', rootCtx);
    out.roots.global = roots.inUse(out, 'global', rootCtx);
    // the answers about servers already set up (spec D6): each family's list (0.5.0; the 0.4.x record while it has none),
    // and each registration's choice - null when never answered or when its launch changed since
    out.lists = { project: listOf(out, 'project', rootCtx), global: listOf(out, 'global', rootCtx) };
    out.cursor = cursorFiles(out, { platform, env, project: proj }, catalog);
    // the workspace alfred-code records (spec D4a): the folders whose Cursor files take this folder's project servers
    out.workspace = workspaceOf(proj, env);
    const entryFingerprint = (entry: ServerEntry) => existing.fingerprintOf(entry, catalog);
    for (const registration of out.registrations)
    {
        const familyList = registration.scope === 'inherited' || !registration.rowId ? null : out.lists[roots.familyOf(registration.scope)];
        registration.choice = choiceIn(familyList, (ownEntry) => ownEntry.name === registration.name && ownEntry.scope === registration.scope, entryFingerprint(registration.entry), ['own', 'manage']);
    }

    const version = cli.available({ env, cwd: proj });
    out.cli = version ? { ok: true, version } : { ok: false, version: null };
    if (!version) return out;

    const list = run(['plugin', 'list', '--json'], { cwd: proj, env });
    let listJson: PluginListRow[] = [];
    try { listJson = JSON.parse(list.stdout || '[]') as PluginListRow[]; } catch { out.unreadable.push({ scope: 'plugins', file: 'claude plugin list --json', state: 'malformed', error: 'not JSON' }); }
    out.plugins = pluginRows(listJson, proj, env, catalog);
    out.alfredCodeEnabled = out.plugins.some((pluginRow) => pluginRow.plugin === ALFRED_CODE_PLUGIN && pluginRow.enabled);
    // each MCP server a plugin that loads here provides, read from its install folder and matched as a registration is
    const installPath = new Map((Array.isArray(listJson) ? listJson : []).map((listRow): [string, string | undefined] => [`${listRow.id}~${listRow.scope}`, listRow.installPath]));
    for (const pluginRow of out.plugins.filter((candidate) => candidate.enabledHere))
        for (const server of existing.pluginServers(installPath.get(`${pluginRow.id}~${pluginRow.scope}`)))
        {
            const match = matchEntry(server.entry, catalog);
            const choice = match ? choiceIn(out.lists.project, (ownEntry) => ownEntry.plugin === pluginRow.id && ownEntry.server === server.server, entryFingerprint(server.entry), ['own', 'add']) : null;
            out.pluginServers.push({ plugin: pluginRow.id, server: server.server, entry: server.entry, rowId: match ? match.rowId : null, route: match ? match.route : null, choice });
        }

    const marketplaceResult = run(['plugin', 'marketplace', 'list', '--json'], { cwd: proj, env });
    try { out.marketplaces = (JSON.parse(marketplaceResult.stdout || '[]') as MarketplaceListRow[]).map((marketplace) => ({ name: marketplace.name, source: marketplace.repo || marketplace.url || marketplace.path || '', installLocation: marketplace.installLocation || '' })); }
    catch { out.marketplaces = []; }
    return out;
}

// The family's list: the first mcps.json the commands' order finds (mcpsList.listFiles). While the family has none, its
// `own` is the first 0.4.x record's (`old` names that file, `file` the list beside it), so a server left on its own is
// skipped from the first 0.5.0 run. -> { file, servers, own, cursorOffer?, note?, old? } | null
function listOf(inventory: InventoryView, family: Family, context: RootsCtx): InvList | null
{
    for (const file of lists.listFiles(inventory, family, context))
    {
        const list = lists.readList(file);
        if (list) return { file, servers: list.servers, own: list.own, ...(list.cursorOffer ? { cursorOffer: list.cursorOffer } : {}), ...(list.note ? { note: list.note, state: list.state } : {}) };
    }
    const pathApi = pathFor(context.platform);
    for (const old of lists.oldRecordFiles(inventory, family, context))
    {
        const record = lists.readOldRecord(old);
        if (record) return { file: pathApi.join(pathApi.dirname(old), roots.FILES.list), servers: [], own: record.servers, old, ...(record.note ? { note: record.note, state: record.state } : {}) };
    }
    return null;
}

// Cursor's two files (spec D2): the project's for project and local scope, the home's for user scope. Each lists every
// name it holds, and the entries of the names its family's list marks for Cursor, kept.
function cursorFiles(inventory: Inventory, context: { platform: string; env: Env; project: string }, catalog: Catalog): { project: CursorOf; global: CursorOf }
{
    const marked = (family: string) =>
    {
        const list = inventory.lists![family];
        return list && !list.note ? (list.servers || []).filter((server) => (server.clients || []).includes('cursor')) : [];
    };
    return {
        project: cursorMcp.cursorOf(cursorMcp.fileFor('project', context), marked('project'), catalog),
        global: cursorMcp.cursorOf(cursorMcp.fileFor('global', context), marked('global'), catalog),
    };
}

// A recorded choice that still holds: the entry found, its fingerprint the launch's now, its choice one of `allowed`.
function choiceIn(list: InvList | null | undefined, match: (ownEntry: OwnEntry) => boolean, fingerprint: string | null, allowed: string[]): string | null
{
    const ownEntry = list ? (list.own || []).find(match) : null;
    return ownEntry && ownEntry.fingerprint === fingerprint && allowed.includes(ownEntry.choice as string) ? ownEntry.choice! : null;
}

// The inventory as a file or a print holds it: every credential value as kept.ts's marker, so no command line names a
// file with a live one (alfred-code's guard refuses it) and nothing printed puts one in the chat. apply.ts takes the
// real values back from the registrations themselves.
export function keptOf(inventory: Inventory, catalog: Catalog = catalogLib.load()): Inventory
{
    const keep = <Item extends { entry: ServerEntry; rowId: string | null }>(item: Item): Item => ({ ...item, entry: kept.maskCredentials(item.entry, item.rowId ? catalog.byId.get(item.rowId) : null) });
    return { ...inventory, registrations: inventory.registrations.map(keep), ...(inventory.pluginServers ? { pluginServers: inventory.pluginServers.map(keep) } : {}) };
}

// A parent folder as the project names it: '..', '../..', from the real folder, as the walk found it.
export const fromHere = (inventory: { project: string }, dir: string): string => path.relative(realOf(inventory.project), dir).split(path.sep).join('/') || '.';

// What a row looks like installed: every registration or plugin that belongs to it, with its scope.
export function installedOf(inventory: Inventory, rowId: string): Installed[]
{
    return [
        ...inventory.registrations.filter((registration) => registration.rowId === rowId && !registration.alfredRetired).map((registration): Installed => (registration.scope === 'inherited'
            ? { kind: 'mcp', name: registration.name, scope: registration.scope, from: registration.from, route: registration.route, entry: registration.entry, approval: registration.approval }
            : { kind: 'mcp', name: registration.name, scope: registration.scope, route: registration.route, entry: registration.entry })),
        ...inventory.plugins.filter((pluginRow) => pluginRow.rowId === rowId && !pluginRow.alfredRetired).map((pluginRow): Installed => ({ kind: 'plugin', name: pluginRow.id, scope: pluginRow.scope, version: pluginRow.version, enabled: pluginRow.enabled })),
    ];
}

// The windows-mcp servers Claude Code starts in this project - windows-mcp 0.8.8 keeps one per desktop healthy
// (docs/sources.md 'windows-mcp 0.8.8 - the sticky overlay failure'). One per name, the nearest: local, project (once
// approved - M8; a hand-built inventory carries no approval), a parent's .mcp.json (approved and not shadowed - M7),
// then user (M2, M3). Counted: the windows-control row's registrations, alfred-code's under its reserved name (its
// launcher hides the package), and alfred-code's plugins that load here - on for this project (P1-P6), and an id its
// marketplace dropped says so only in `errors` (plugin-cli-evidence S13, S25).
// -> [{ name, scope, kind, owner: 'catalog' | 'alfred-code', from }]
const WINDOWS_MCP_PLUGINS = ['windows-control', 'windows-desktop'];
const NEAREST: Record<string, number> = { local: 0, project: 1, inherited: 2, user: 3 };
export function windowsMcpServers(inventory: { registrations: InvRegistration[]; plugins?: PluginRow[] }): WindowsMcp[]
{
    const starts = inventory.registrations.filter((registration) => (registration.scope === 'inherited' ? registration.approval === 'approved' && !registration.shadowed : registration.scope !== 'project' || !registration.approval || registration.approval === 'approved'));
    const wins = new Map<string, InvRegistration>();
    for (const registration of starts.slice().sort((left, right) => NEAREST[left.scope]! - NEAREST[right.scope]!)) if (!wins.has(registration.name)) wins.set(registration.name, registration);
    // one plugin id is one server, however many scopes hold an install row for it (S28): the nearest row names it
    const loads = (inventory.plugins || []).filter((pluginRow) => (pluginRow.enabledHere ?? pluginRow.enabled) && !(pluginRow.errors || []).length && pluginRow.marketplace === WINDOWS_MCP_MARKETPLACE && WINDOWS_MCP_PLUGINS.includes(pluginRow.plugin));
    const nearest = new Map<string, PluginRow>();
    for (const pluginRow of loads.slice().sort((left, right) => NEAREST[left.scope]! - NEAREST[right.scope]!)) if (!nearest.has(pluginRow.id)) nearest.set(pluginRow.id, pluginRow);
    return [
        ...[...wins.values()].filter((registration) => registration.rowId === 'windows-control' || (registration.alfredRetired && registration.name === 'windows-control'))
            .map((registration): WindowsMcp => ({ name: registration.name, scope: registration.scope, kind: 'mcp', owner: registration.alfredRetired ? 'alfred-code' : 'catalog', from: registration.from || null })),
        ...loads.filter((pluginRow) => nearest.get(pluginRow.id) === pluginRow).map((pluginRow): WindowsMcp => ({ name: pluginRow.id, scope: pluginRow.scope, kind: 'plugin', owner: 'alfred-code', from: null })),
    ];
}

// The windows-mcp servers here that a new registration under `name` does not replace - one of the same name is the same
// server, whichever scope wins - as 'name (scope)'.
export const otherWindowsMcp = (inventory: Inventory, name: string): string[] => windowsMcpServers(inventory).filter((server) => server.kind === 'plugin' || server.name !== name).map((server) => `${server.name} (${server.scope})`);

// One installed thing, by the key configure asks with: `mcp:<name>~<scope>` or `plugin:<plugin id>~<scope>` (the same
// shape as update.ts's offer ids). -> { kind, item } or null when nothing is installed under that key.
export const keyOf = (kind: string, name: string, scope: string): string => `${kind}:${name}~${scope}`;
export function targetOf(inventory: Inventory, key: string | null | undefined): { kind: string; item: InvRegistration | PluginRow } | null
{
    const match = /^(mcp|plugin):(.+)~(local|project|user)$/.exec(key || '');
    if (!match) return null;
    const item = match[1] === 'mcp'
        ? inventory.registrations.find((registration) => registration.name === match[2] && registration.scope === match[3])
        : inventory.plugins.find((pluginRow) => pluginRow.id === match[2] && pluginRow.scope === match[3]);
    return item ? { kind: match[1]!, item } : null;
}

