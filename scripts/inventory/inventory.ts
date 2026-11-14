#!/usr/bin/env node
// THE INVENTORY - what is installed, read-only, no server started.
//
//   node inventory.js --project <dir> --json <out> [--data <plugin data dir>]   (--data: the roots map, spec D2)
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
import * as roots from '../roots/roots.ts';
import { bridgeParts } from '../entries/entry.ts';
import { signInParts } from '../entries/sign-in.ts';
import * as existing from './existing.ts';
import { of } from '../roots/workspace.ts';
import * as lists from '../mcps-list/mcps-list.ts';
import * as cursorMcp from '../cursor/cursor-mcp.ts';
import type { Account, Env, FileState, ServerEntry, ServerMap } from '../core/types.ts';
import type { Catalog, Fingerprint } from '../catalog/types.ts';
import type { Family, InventoryView, RootsCtx } from '../roots/types.ts';
import type { CursorOf } from '../cursor/types.ts';
import type { OwnEntry } from '../mcps-list/types.ts';
import type { Approval, ApprovalCtx, BuildOptions, Installed, InvList, InvRegistration, Inventory, MarketplaceListRow, McpJsonDoc, PluginListRow, PluginRow, SettingsDoc, Shadow, WindowsMcp } from './types.ts';

const { readState } = account;

// ---- matching a registration to a row -------------------------------------------------------------------------------

// `cmd /c npx ...` and `cmd.exe /d /s /c npx ...` are the Windows spelling of `npx ...`: look through the wrapper.
export function launchTokens(entry: ServerEntry): { command: string; args: string[] }
{
    const command = String(entry.command || '');
    let args = Array.isArray(entry.args) ? entry.args.map(String) : [];
    if (/^cmd(\.exe)?$/i.test(path.basename(command)))
    {
        const at = args.findIndex((a) => /^\/c$/i.test(a));
        if (at >= 0) return { command: args[at + 1] || '', args: args.slice(at + 2) };
    }
    return { command, args };
}

// 'serena-agent@2.1.0', 'mcp-memory-service[sqlite]==12.1.1', '@playwright/mcp@0.0.83', 'ghcr.io/x/y:v2' -> the bare name.
export function bareName(token: string): string
{
    const lead = token.startsWith('@') ? '@' : '';
    const body = lead ? token.slice(1) : token;
    const cut = body.search(/[@=\[<>~!:]/);
    return lead + (cut >= 0 ? body.slice(0, cut) : body);
}

const flagValue = (args: string[], flag: string): string | undefined =>
{
    for (let i = 0; i < args.length; i++)
    {
        if (args[i] === flag) return args[i + 1];
        if (args[i]!.startsWith(`${flag}=`)) return args[i]!.slice(flag.length + 1);
    }
    return undefined;
};

export function matchesFingerprint(entry: ServerEntry, f: Fingerprint): boolean
{
    // a bridge (0.4.0): `node <root>/mcp-bridge.js <template> ...`, matched by the file's exact name and the template's host
    // and path - never by the URL branch below, which would take every hosted URL for a fingerprint with no host
    const bridge = bridgeParts(entry);
    if (f.bridge) return Boolean(bridge) && bridge!.template.replace(/^https?:\/\//i, '').toLowerCase().startsWith(f.bridge);
    if (bridge) return false;
    const byUrl = (url: unknown) =>
    {
        if (f.pkg || f.command) return false;
        let u: URL;
        try { u = new URL(String(url)); } catch { return false; }
        if (f.host && u.hostname.toLowerCase() !== f.host) return false;
        return u.pathname.startsWith(f.pathPrefix || '/');
    };
    // the shared sign-in form (0.5.0, D5): mcp-remote with MCP_REMOTE_CONFIG_DIR, matched by its URL as an http entry, so
    // it is the row's remote route; a hand-made mcp-remote entry has no parts and matches no row below
    const signIn = signInParts(entry);
    if (signIn) return byUrl(signIn.url);
    if (entry.url || entry.type === 'http' || entry.type === 'sse') return byUrl(entry.url);
    const { command, args } = launchTokens(entry);
    if (f.command) return path.basename(command).replace(/\.(exe|cmd)$/i, '') === f.command;
    if (!f.pkg) return false;
    // the first argument that names the package; a flag value like --from <spec> is such an argument
    const named = args.filter((a) => !a.startsWith('-')).some((a) => bareName(a) === f.pkg);
    if (!named) return false;
    return f.flag ? flagValue(args, f.flag) === f.value : true;
}

// The catalog row and route a registration's launch belongs to, or null (the user's own).
export function matchEntry(entry: ServerEntry | null | undefined, catalog: Catalog): { rowId: string; route: string } | null
{
    if (!entry || typeof entry !== 'object') return null;
    for (const row of catalog.tools)
    {
        if (row.kind !== 'mcp') continue;
        for (const [route, def] of Object.entries(row.routes))
            if (def.fingerprints.some((f) => matchesFingerprint(entry, f))) return { rowId: row.id, route };
    }
    return null;
}

// ---- reading the scopes ---------------------------------------------------------------------------------------------

const settingsOf = (scope: string, project: string, env: Env): string => path.join(
    scope === 'user' ? account.configDir(env) : path.join(project, '.claude'),
    scope === 'local' ? 'settings.local.json' : 'settings.json');

// ---- inherited: the .mcp.json files of the folders above ------------------------------------------------------------
// Claude Code reads the .mcp.json of the folder it starts in and of every folder above it up to the filesystem root,
// from the real path: the nearest file wins a name, a local registration beats them all, and a malformed file loses
// only its own servers (MEASURED, docs/sources.md '.mcp.json in parent folders', M1-M6).

const realOf = (p: string): string => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };

// -> [{ dir, file }], nearest first, the project's own file left out
export function ancestorMcpFiles(project: string): { dir: string; file: string }[]
{
    const out: { dir: string; file: string }[] = [];
    for (let dir = realOf(project), up = path.dirname(dir); up !== dir; dir = up, up = path.dirname(dir))
    {
        const file = path.join(up, '.mcp.json');
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
    return { user: readState<SettingsDoc>(settingsOf('user', proj, env)).doc, folder: hereSettings(proj).map((f) => readState<SettingsDoc>(f).doc), entry, trusted: entry.hasTrustDialogAccepted === true };
}

const names = (doc: SettingsDoc | null, key: string, name: string): boolean => Boolean(doc) && Array.isArray(doc![key]) && (doc![key] as unknown[]).includes(name);
const approves = (doc: SettingsDoc | null, name: string): boolean => Boolean(doc) && (doc!.enableAllProjectMcpServers === true || names(doc, 'enabledMcpjsonServers', name));

// approved | pending | rejected, as `claude mcp list` says it here (MEASURED, M7; the MCP docs' 'Project server approvals
// and workspace trust'): a disabledMcpjsonServers entry anywhere rejects; the user settings approve in any folder; this
// folder's settings and account entry approve only once it is trusted; a parent folder's settings never count.
function approvalOf(name: string, a: ApprovalCtx): Approval
{
    if ([a.user, ...a.folder, a.entry].some((d) => names(d, 'disabledMcpjsonServers', name))) return 'rejected';
    if (approves(a.user, name) || (a.trusted && [...a.folder, a.entry].some((d) => approves(d, name)))) return 'approved';
    return 'pending';
}

export function pluginRows(listJson: PluginListRow[], project: string, env: Env, catalog: Catalog, _alfredCheck?: unknown): PluginRow[]
{
    const rows: PluginRow[] = [];
    const here = [...hereSettings(project), settingsOf('user', project, env)].map((f) => readState<SettingsDoc>(f).doc);
    const flagIn = (doc: SettingsDoc | null, id: string) => (doc && doc.enabledPlugins ? doc.enabledPlugins[id] : undefined);
    for (const r of Array.isArray(listJson) ? listJson : [])
    {
        const [name, marketplace = ''] = String(r.id).split('@');
        const scoped = r.scope === 'project' || r.scope === 'local';
        if (scoped && r.projectPath && account.projectKey(r.projectPath) !== account.projectKey(project)) continue; // another project's
        let enabled = r.enabled;
        let enabledFrom: PluginRow['enabledFrom'] = 'list';
        if (['user', 'project', 'local'].includes(r.scope))
        {
            const flag = flagIn(readState<SettingsDoc>(settingsOf(r.scope, project, env)).doc, r.id);
            if (typeof flag === 'boolean') { enabled = flag; enabledFrom = 'settings'; }
        }
        // Two readings, kept apart: `enabled` is the install scope's own, which configure and update act on (an `enable`
        // over an enabled scope exits 1, S28); `enabledHere` is whether it loads in this project - the first boolean in
        // this project's settings files, then the user settings, whatever the install scope, else `enabled` (MEASURED,
        // P1-P6). Only the windows-mcp count reads it.
        const flagHere = here.map((doc) => flagIn(doc, r.id)).find((v) => typeof v === 'boolean');
        const enabledHere = typeof flagHere === 'boolean' ? flagHere : enabled;
        const row = catalog.tools.find((t) => t.kind === 'plugin' && t.plugin === name && t.marketplace!.name === marketplace);
        rows.push({
            id: r.id, plugin: name!, marketplace, scope: r.scope, version: r.version, enabled, enabledFrom, enabledHere,
            errors: r.errors || [], rowId: row ? row.id : null, alfredRetired: catalog.reserved.has(name!),
        });
    }
    return rows;
}

export function buildInventory({ project, env = process.env, platform = process.platform, arch = process.arch, catalog = catalogLib.load(), run = cli.run, data = null }: BuildOptions): Inventory
{
    const proj = path.resolve(project);
    const out: Inventory = {
        version: 1, project: proj, os: platform, arch, cli: null, unreadable: [], registrations: [], plugins: [], pluginServers: [], marketplaces: [], alfredCodeEnabled: false,
        sources: {},
    };

    const mcp = readState<McpJsonDoc>(path.join(proj, '.mcp.json'));
    const acct = account.readAccount(env, proj, platform);
    out.sources = { project: { file: mcp.file, state: mcp.state }, account: { file: acct.file, state: acct.state }, local: { file: acct.file, state: acct.state }, user: { file: acct.file, state: acct.state } };
    for (const [scope, s] of [['project', mcp], ['local', acct], ['user', acct]] as [string, { file: string; state: FileState; error: string | null }][])
        if (s.state === 'malformed' || s.state === 'unreadable') out.unreadable.push({ scope, file: s.file, state: s.state, error: s.error });

    const approval = approvalContext(proj, env, acct, platform);
    const scopes = [['project', (mcp.doc && mcp.doc.mcpServers) || {}], ['local', acct.local], ['user', acct.user]] as [string, ServerMap][];
    for (const [scope, servers] of scopes)
    {
        if (!servers || typeof servers !== 'object') continue;
        for (const [name, entry] of Object.entries(servers))
        {
            const m = matchEntry(entry, catalog);
            out.registrations.push({
                name, scope, entry,
                rowId: m ? m.rowId : null, route: m ? m.route : null,
                own: !m,
                // alfred-code 2.10.0 or older: the stack's servers sit under reserved names; offer nothing over them
                alfredRetired: catalog.reserved.has(name),
                // this folder's own .mcp.json server waits for approval by a parent's rules (MEASURED, M8)
                ...(scope === 'project' ? { approval: approvalOf(name, approval) } : {}),
            });
        }
    }

    // the parents' servers, nearest first; `shadowed` names what Claude Code uses in their place
    const wins = new Map<string, Shadow>(Object.keys(acct.local || {}).map((n): [string, Shadow] => [n, { scope: 'local', from: null }]));
    for (const n of Object.keys((mcp.doc && mcp.doc.mcpServers) || {})) if (!wins.has(n)) wins.set(n, { scope: 'project', from: proj });
    out.sources.inherited = [];
    for (const { dir, file } of ancestorMcpFiles(proj))
    {
        const s = readState<McpJsonDoc>(file);
        out.sources.inherited.push({ file, state: s.state });
        if (s.state === 'malformed' || s.state === 'unreadable') { out.unreadable.push({ scope: 'inherited', file, state: s.state, error: s.error }); continue; }
        const servers = s.doc && s.doc.mcpServers && typeof s.doc.mcpServers === 'object' ? s.doc.mcpServers : {};
        for (const [name, entry] of Object.entries(servers))
        {
            const m = matchEntry(entry, catalog);
            out.registrations.push({
                name, scope: 'inherited', from: dir, file, entry, rowId: m ? m.rowId : null, route: m ? m.route : null, own: !m,
                alfredRetired: catalog.reserved.has(name), shadowed: wins.get(name) || null, approval: approvalOf(name, approval),
            });
        }
        for (const n of Object.keys(servers)) if (!wins.has(n)) wins.set(n, { scope: 'inherited', from: dir });
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
    out.workspace = of(proj, env);
    const fp = (entry: ServerEntry) => existing.fingerprintOf(entry, catalog);
    for (const r of out.registrations)
    {
        const rec = r.scope === 'inherited' || !r.rowId ? null : out.lists[roots.familyOf(r.scope)];
        r.choice = choiceIn(rec, (e) => e.name === r.name && e.scope === r.scope, fp(r.entry), ['own', 'manage']);
    }

    const version = cli.available({ env, cwd: proj });
    out.cli = version ? { ok: true, version } : { ok: false, version: null };
    if (!version) return out;

    const list = run(['plugin', 'list', '--json'], { cwd: proj, env });
    let listJson: PluginListRow[] = [];
    try { listJson = JSON.parse(list.stdout || '[]') as PluginListRow[]; } catch { out.unreadable.push({ scope: 'plugins', file: 'claude plugin list --json', state: 'malformed', error: 'not JSON' }); }
    out.plugins = pluginRows(listJson, proj, env, catalog);
    out.alfredCodeEnabled = out.plugins.some((p) => p.plugin === 'alfred-code' && p.enabled);
    // each MCP server a plugin that loads here provides, read from its install folder and matched as a registration is
    const installPath = new Map((Array.isArray(listJson) ? listJson : []).map((r): [string, string | undefined] => [`${r.id}~${r.scope}`, r.installPath]));
    for (const p of out.plugins.filter((x) => x.enabledHere))
        for (const s of existing.pluginServers(installPath.get(`${p.id}~${p.scope}`)))
        {
            const m = matchEntry(s.entry, catalog);
            const choice = m ? choiceIn(out.lists.project, (e) => e.plugin === p.id && e.server === s.server, fp(s.entry), ['own', 'add']) : null;
            out.pluginServers.push({ plugin: p.id, server: s.server, entry: s.entry, rowId: m ? m.rowId : null, route: m ? m.route : null, choice });
        }

    const mk = run(['plugin', 'marketplace', 'list', '--json'], { cwd: proj, env });
    try { out.marketplaces = (JSON.parse(mk.stdout || '[]') as MarketplaceListRow[]).map((m) => ({ name: m.name, source: m.repo || m.url || m.path || '', installLocation: m.installLocation || '' })); }
    catch { out.marketplaces = []; }
    return out;
}

// The family's list: the first mcps.json the commands' order finds (mcpsList.listFiles). While the family has none, its
// `own` is the first 0.4.x record's (`old` names that file, `file` the list beside it), so a server left on its own is
// skipped from the first 0.5.0 run. -> { file, servers, own, cursorOffer?, note?, old? } | null
function listOf(inv: InventoryView, family: Family, ctx: RootsCtx): InvList | null
{
    for (const file of lists.listFiles(inv, family, ctx))
    {
        const l = lists.readList(file);
        if (l) return { file, servers: l.servers, own: l.own, ...(l.cursorOffer ? { cursorOffer: l.cursorOffer } : {}), ...(l.note ? { note: l.note, state: l.state } : {}) };
    }
    const P = ctx.platform === 'win32' ? path.win32 : path.posix;
    for (const old of lists.oldRecordFiles(inv, family, ctx))
    {
        const r = lists.readOldRecord(old);
        if (r) return { file: P.join(P.dirname(old), roots.FILES.list), servers: [], own: r.servers, old, ...(r.note ? { note: r.note, state: r.state } : {}) };
    }
    return null;
}

// Cursor's two files (spec D2): the project's for project and local scope, the home's for user scope. Each lists every
// name it holds, and the entries of the names its family's list marks for Cursor, kept.
function cursorFiles(inv: Inventory, ctx: { platform: string; env: Env; project: string }, catalog: Catalog): { project: CursorOf; global: CursorOf }
{
    const marked = (family: string) =>
    {
        const l = inv.lists![family];
        return l && !l.note ? (l.servers || []).filter((s) => (s.clients || []).includes('cursor')) : [];
    };
    return {
        project: cursorMcp.cursorOf(cursorMcp.fileFor('project', ctx), marked('project'), catalog),
        global: cursorMcp.cursorOf(cursorMcp.fileFor('global', ctx), marked('global'), catalog),
    };
}

// A recorded choice that still holds: the entry found, its fingerprint the launch's now, its choice one of `allowed`.
function choiceIn(list: InvList | null | undefined, match: (e: OwnEntry) => boolean, fingerprint: string | null, allowed: string[]): string | null
{
    const e = list ? (list.own || []).find(match) : null;
    return e && e.fingerprint === fingerprint && allowed.includes(e.choice as string) ? e.choice! : null;
}

// The inventory as a file or a print holds it: every credential value as kept.js's marker, so no command line names a
// file with a live one (alfred-code's guard refuses it) and nothing printed puts one in the chat. apply.js takes the
// real values back from the registrations themselves.
export function keptOf(inv: Inventory, catalog: Catalog = catalogLib.load()): Inventory
{
    const keep = <Item extends { entry: ServerEntry; rowId: string | null }>(x: Item): Item => ({ ...x, entry: kept.keep(x.entry, x.rowId ? catalog.byId.get(x.rowId) : null) });
    return { ...inv, registrations: inv.registrations.map(keep), ...(inv.pluginServers ? { pluginServers: inv.pluginServers.map(keep) } : {}) };
}

// A parent folder as the project names it: '..', '../..', from the real folder, as the walk found it.
export const fromHere = (inv: { project: string }, dir: string): string => path.relative(realOf(inv.project), dir).split(path.sep).join('/') || '.';

// What a row looks like installed: every registration or plugin that belongs to it, with its scope.
export function installedOf(inv: Inventory, rowId: string): Installed[]
{
    return [
        ...inv.registrations.filter((r) => r.rowId === rowId && !r.alfredRetired).map((r): Installed => (r.scope === 'inherited'
            ? { kind: 'mcp', name: r.name, scope: r.scope, from: r.from, route: r.route, entry: r.entry, approval: r.approval }
            : { kind: 'mcp', name: r.name, scope: r.scope, route: r.route, entry: r.entry })),
        ...inv.plugins.filter((p) => p.rowId === rowId && !p.alfredRetired).map((p): Installed => ({ kind: 'plugin', name: p.id, scope: p.scope, version: p.version, enabled: p.enabled })),
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
export function windowsMcpServers(inv: { registrations: InvRegistration[]; plugins?: PluginRow[] }): WindowsMcp[]
{
    const starts = inv.registrations.filter((r) => (r.scope === 'inherited' ? r.approval === 'approved' && !r.shadowed : r.scope !== 'project' || !r.approval || r.approval === 'approved'));
    const wins = new Map<string, InvRegistration>();
    for (const r of starts.slice().sort((a, b) => NEAREST[a.scope]! - NEAREST[b.scope]!)) if (!wins.has(r.name)) wins.set(r.name, r);
    // one plugin id is one server, however many scopes hold an install row for it (S28): the nearest row names it
    const loads = (inv.plugins || []).filter((p) => (p.enabledHere ?? p.enabled) && !(p.errors || []).length && p.marketplace === 'envoydev' && WINDOWS_MCP_PLUGINS.includes(p.plugin));
    const nearest = new Map<string, PluginRow>();
    for (const p of loads.slice().sort((a, b) => NEAREST[a.scope]! - NEAREST[b.scope]!)) if (!nearest.has(p.id)) nearest.set(p.id, p);
    return [
        ...[...wins.values()].filter((r) => r.rowId === 'windows-control' || (r.alfredRetired && r.name === 'windows-control'))
            .map((r): WindowsMcp => ({ name: r.name, scope: r.scope, kind: 'mcp', owner: r.alfredRetired ? 'alfred-code' : 'catalog', from: r.from || null })),
        ...loads.filter((p) => nearest.get(p.id) === p).map((p): WindowsMcp => ({ name: p.id, scope: p.scope, kind: 'plugin', owner: 'alfred-code', from: null })),
    ];
}

// The windows-mcp servers here that a new registration under `name` does not replace - one of the same name is the same
// server, whichever scope wins - as 'name (scope)'.
export const otherWindowsMcp = (inv: Inventory, name: string): string[] => windowsMcpServers(inv).filter((s) => s.kind === 'plugin' || s.name !== name).map((s) => `${s.name} (${s.scope})`);

// One installed thing, by the key configure asks with: `mcp:<name>~<scope>` or `plugin:<plugin id>~<scope>` (the same
// shape as update.js's offer ids). -> { kind, item } or null when nothing is installed under that key.
export const keyOf = (kind: string, name: string, scope: string): string => `${kind}:${name}~${scope}`;
export function targetOf(inv: Inventory, key: string | null | undefined): { kind: string; item: InvRegistration | PluginRow } | null
{
    const m = /^(mcp|plugin):(.+)~(local|project|user)$/.exec(key || '');
    if (!m) return null;
    const item = m[1] === 'mcp'
        ? inv.registrations.find((r) => r.name === m[2] && r.scope === m[3])
        : inv.plugins.find((p) => p.id === m[2] && p.scope === m[3]);
    return item ? { kind: m[1]!, item } : null;
}

