// SERVERS ALREADY SET UP (spec D6, F4) - a registration that matches a catalog row, an MCP server an enabled plugin
// provides, and a claude.ai connector this session has loaded. A matching registration is managed by configure, update
// and fix; one the user leaves on its own in configure is saved in the root's mcps.json, in its `own`, by the apply's
// list-write step (a 0.4.x root's preferred-tools.json is read until list-import moves it). Nothing here writes, and no server is started to find one.
import fs from 'node:fs';
import path from 'node:path';
import * as account from '../core/account.ts';
import * as roots from '../roots/roots.ts';
import { parseJson } from '../core/json-file.ts';
import { fingerprintKey } from '../catalog/catalog.ts';
import { matchesFingerprint } from './inventory.ts';
import type { ServerEntry } from '../core/types.ts';
import type { Catalog } from '../catalog/types.ts';
import type { Live, OwnEntry } from '../mcps-list/types.ts';
import type { DeclaredServer, ExistingItem, InvRegistration, Inventory, PluginServer } from './types.ts';

// A servers file or a plugin manifest as parsed: the mcpServers map, or the map itself at the top.
type ServersDoc = { mcpServers?: unknown; [key: string]: unknown };
// inventory.js requires this file lazily, inside buildInventory

// the rows with a hosted route: the only ones a connector can be
export const HOSTED_ROWS = ['context7', 'github', 'gitlab', 'atlassian', 'sentry'];
export const CHOICES = { mcp: ['own', 'manage'], plugin: ['own', 'add'], connector: ['own', 'add'] };
const REC = ' (Recommended)';

// `--connectors <Name>,<Name>`: the names, trimmed, each once.
export const parseConnectors = (arg: unknown): string[] => [...new Set(String(arg == null ? '' : arg).split(',').map((s) => s.trim()).filter(Boolean))];

// A connector's row: its name lower-cased with all but letters and digits removed starts with the row id, so a suffixed
// name ('Atlassian_Rovo') still matches. -> row id | null
export function matchConnector(name: unknown): string | null
{
    const n = String(name == null ? '' : name).toLowerCase().replace(/[^a-z0-9]/g, '');
    return n ? HOSTED_ROWS.find((id) => n.startsWith(id)) || null : null;
}

const readJsonFile = (file: string): ServersDoc | null => { try { return parseJson(fs.readFileSync(file, 'utf8')) as ServersDoc | null; } catch { return null; } };
const isEntry = (v: unknown): boolean => Boolean(v) && typeof v === 'object' && !Array.isArray(v) && (typeof (v as ServerEntry).command === 'string' || typeof (v as ServerEntry).url === 'string');
// a servers file: `{ mcpServers: { ... } }`, or the map itself at the top
function serversIn(doc: ServersDoc | null): DeclaredServer[]
{
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return [];
    const map = doc.mcpServers && typeof doc.mcpServers === 'object' && !Array.isArray(doc.mcpServers) ? doc.mcpServers : doc;
    return Object.entries(map).filter(([, v]) => isEntry(v)).map(([server, entry]) => ({ server, entry }));
}

// The MCP servers a plugin provides, read from its install folder: its .mcp.json, then the manifest's mcpServers - inline,
// or a `./` path (or several) to a file inside the plugin. A file that cannot be read gives nothing. -> [{ server, entry }]
export function pluginServers(installPath: unknown): DeclaredServer[]
{
    if (!installPath || typeof installPath !== 'string') return [];
    const out = serversIn(readJsonFile(path.join(installPath, '.mcp.json')));
    const manifest = readJsonFile(path.join(installPath, '.claude-plugin', 'plugin.json'));
    const decl = manifest && manifest.mcpServers;
    if (decl && typeof decl === 'object' && !Array.isArray(decl)) out.push(...serversIn({ mcpServers: decl }));
    for (const p of typeof decl === 'string' ? [decl] : Array.isArray(decl) ? decl.filter((x) => typeof x === 'string') : [])
    {
        const rel = path.relative(installPath, path.resolve(installPath, p));
        if (!p.startsWith('./') || !rel || rel.startsWith('..') || path.isAbsolute(rel) || rel === '.mcp.json') continue;
        out.push(...serversIn(readJsonFile(path.join(installPath, rel))));
    }
    const seen = new Set<string>();
    return out.filter((s) => !seen.has(s.server) && seen.add(s.server));
}

// The key of the catalog fingerprint a launch matches, in matchEntry's order. -> string | null
export function fingerprintOf(entry: ServerEntry | null | undefined, catalog: Catalog): string | null
{
    if (!entry || typeof entry !== 'object') return null;
    for (const row of catalog.tools)
    {
        if (row.kind !== 'mcp') continue;
        for (const def of Object.values(row.routes))
        {
            const f = def.fingerprints.find((x) => matchesFingerprint(entry, x));
            if (f) return fingerprintKey(f);
        }
    }
    return null;
}

const labelOf = (catalog: Catalog, rowId: string | null) => (catalog.byId.get(rowId!) || { label: rowId }).label;
const regItem = (r: InvRegistration, catalog: Catalog): ExistingItem => ({
    key: `mcp:${r.name}~${r.scope}`, kind: 'mcp', rowId: r.rowId, label: labelOf(catalog, r.rowId), family: roots.familyOf(r.scope),
    fingerprint: fingerprintOf(r.entry, catalog), choice: r.choice || null, name: r.name, scope: r.scope,
});
const pluginItem = (s: PluginServer, catalog: Catalog): ExistingItem => ({
    key: `plugin-mcp:${s.plugin}/${s.server}`, kind: 'plugin', rowId: s.rowId, label: labelOf(catalog, s.rowId), family: 'project',
    fingerprint: fingerprintOf(s.entry, catalog), choice: s.choice || null, plugin: s.plugin, server: s.server,
});
function connectorItem(name: string, inv: Inventory, catalog: Catalog): ExistingItem | null
{
    const rowId = matchConnector(name);
    if (!rowId) return null;
    const recorded = ((inv.lists && inv.lists.global && inv.lists.global.own) || []).find((e) => e.connector === name);
    return { key: `connector:${name}`, kind: 'connector', rowId, label: labelOf(catalog, rowId), family: 'global', fingerprint: null, choice: (recorded && recorded.choice) || null, connector: name };
}
const asked = (r: InvRegistration) => r.rowId && !r.alfredRetired && ['project', 'local', 'user'].includes(r.scope);

// D6's three kinds, each with its recorded choice (null: never answered, or its launch changed since). A registration whose
// helper or data folder points into a root of this plugin is 0.2.0's own - managed, never asked - and is left out.
// -> [{ key, kind, rowId, label, family, fingerprint, choice, ... }]
export function items(inv: Inventory, connectors: string[] | null | undefined, catalog: Catalog, { home = account.homeDir(process.env), exists }: { home?: string; exists?: ((file: string) => boolean) | undefined } = {}): ExistingItem[]
{
    const ctx = { project: inv.project, home, platform: inv.os, catalog, ...(exists ? { exists } : {}) };
    return [
        ...(inv.registrations || []).filter((r) => asked(r) && !roots.pointsIntoRoot(r, inv, ctx)).map((r) => regItem(r, catalog)),
        ...(inv.pluginServers || []).filter((s) => s.rowId).map((s) => pluginItem(s, catalog)),
        ...((connectors || []).map((n) => connectorItem(n, inv, catalog)).filter(Boolean) as ExistingItem[]),
    ];
}

// The item an answer's key names, whatever its choice, or null when no such server is here.
export function itemOf(inv: Inventory, key: string, catalog: Catalog): ExistingItem | null
{
    let m = /^mcp:(.+)~(project|local|user)$/.exec(key);
    if (m)
    {
        const r = (inv.registrations || []).find((x) => x.name === m![1] && x.scope === m![2] && asked(x));
        return r ? regItem(r, catalog) : null;
    }
    m = /^plugin-mcp:([^/]+)\/(.+)$/.exec(key);
    if (m)
    {
        const s = (inv.pluginServers || []).find((x) => x.plugin === m![1] && x.server === m![2] && x.rowId);
        return s ? pluginItem(s, catalog) : null;
    }
    m = /^connector:(.+)$/.exec(key);
    return m ? connectorItem(m[1]!, inv, catalog) : null;
}

// Who else provides a plugin's server or a connector, as the questions and notes name it.
export const ownerOf = (item: ExistingItem): string => (item.kind === 'plugin' ? item.plugin!.split('@')[0]! : 'claude.ai');
const scopeWord = (scope: string | undefined) => (scope === 'user' ? 'global' : scope);

// The record's entry for an answer (D6): names, scopes, fingerprints and choices only.
export function recordEntry(item: ExistingItem, choice: string): OwnEntry
{
    if (item.kind === 'mcp') return { name: item.name, scope: item.scope, fingerprint: item.fingerprint, choice };
    if (item.kind === 'plugin') return { plugin: item.plugin, server: item.server, fingerprint: item.fingerprint, choice };
    return { connector: item.connector, choice };
}

// What is here now, for the list-write step to drop what is gone (mcpsList.mergeOwn). `connectors`: the list this run
// passed, or null - a run without one keeps every connector entry (R14).
export function liveOf(inv: Inventory, catalog: Catalog, connectors: string[] | null = null): Live
{
    const servers: Record<string, string | null> = {};
    for (const r of (inv.registrations || []).filter(asked)) servers[`mcp:${r.name}~${r.scope}`] = fingerprintOf(r.entry, catalog);
    for (const s of (inv.pluginServers || []).filter((x) => x.rowId)) servers[`plugin-mcp:${s.plugin}/${s.server}`] = fingerprintOf(s.entry, catalog);
    return { servers, connectors: Array.isArray(connectors) ? connectors : null };
}

// The rows install does not offer, and the rows it offers beside another server, from the recorded choices and this
// run's answers (an answer wins over the record). -> { own: Set<row id>, add: Map<row id, owner> }
export function offerRule(inv: Inventory, catalog: Catalog, answers: Record<string, string> | null = {}): { own: Set<string | null>; add: Map<string | null, string> }
{
    const byKey = new Map<string, string>();
    for (const r of (inv.registrations || []).filter((x) => asked(x) && x.choice)) byKey.set(`mcp:${r.name}~${r.scope}`, r.choice!);
    for (const s of (inv.pluginServers || []).filter((x) => x.rowId && x.choice)) byKey.set(`plugin-mcp:${s.plugin}/${s.server}`, s.choice!);
    for (const e of (inv.lists && inv.lists.global && inv.lists.global.own) || []) if (typeof e.connector === 'string' && e.choice) byKey.set(`connector:${e.connector}`, e.choice);
    for (const [key, choice] of Object.entries(answers || {})) byKey.set(key, choice);
    const own = new Set<string | null>();
    const add = new Map<string | null, string>();
    for (const [key, choice] of byKey)
    {
        const item = itemOf(inv, key, catalog);
        if (!item) continue;
        if (choice === 'own') own.add(item.rowId);
        else if (choice === 'add' && item.kind !== 'mcp') add.set(item.rowId, ownerOf(item));
    }
    return { own, add };
}

// The servers left on their own, as configure lists them (spec D6): a registration, a plugin's server or a connector
// whose recorded choice is 'own'.
export function ownItems(inv: Inventory, catalog: Catalog): ExistingItem[]
{
    return [
        ...(inv.registrations || []).filter((r) => asked(r) && r.choice === 'own').map((r) => regItem(r, catalog)),
        ...(inv.pluginServers || []).filter((s) => s.rowId && s.choice === 'own').map((s) => pluginItem(s, catalog)),
        ...(((inv.lists && inv.lists.global && inv.lists.global.own) || []).filter((e) => typeof e.connector === 'string' && e.choice === 'own')
            .map((e) => connectorItem(e.connector!, inv, catalog)).filter(Boolean) as ExistingItem[]),
    ];
}

// configure's question for one of them: keep it so, or hand it over - a registration to preferred-tools, a plugin's
// server or a connector to install's offer beside it. The answer is a list-write step only.
export function ownQuestion(item: ExistingItem)
{
    const reg = item.kind === 'mcp';
    const opts = reg
        ? [{ label: 'Keep it on its own', choice: 'own', description: 'nothing in this plugin changes it' }, { label: 'Let preferred-tools manage it', choice: 'manage', description: 'configure, update and fix look after it from now on' }]
        : [{ label: `Keep it with ${ownerOf(item)}`, choice: 'own', description: `install does not offer ${item.label} here` }, { label: "Let install offer preferred-tools' own as well", choice: 'add', description: `${item.label} is offered again - ${twoServers(item.label, ownerOf(item))}` }];
    const labeled = opts.map((o, i) => ({ ...o, label: `${o.label}${i === 0 ? REC : ''}` }));
    const what = reg ? `${item.name} (${scopeWord(item.scope)}) is on its own` : item.kind === 'plugin' ? `${item.label} is left with the ${ownerOf(item)} plugin` : `${item.label} is left with claude.ai (${item.connector})`;
    return {
        question: { id: `own-${item.key}`, header: 'On its own', multiSelect: false, question: `${what}. Who looks after it?`, options: labeled.map(({ label, description }) => ({ label, description })) },
        answers: Object.fromEntries(labeled.map((o) => [o.label, { key: item.key, choice: o.choice }])),
    };
}

export const twoServers = (label: string | null, owner: string): string => `two servers of ${label} then run - ${owner}'s and this one`;

