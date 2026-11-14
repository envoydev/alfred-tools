// The inventory: what is installed, as buildInventory reads it and the commands pass it between their steps in a temp
// file (stored - do not rename: every field crosses that JSON boundary).
import type { AccountProject, CliOptions, CliResult, Env, FileState, ServerEntry, ServerMap } from '../core/types.ts';
import type { Catalog } from '../catalog/types.ts';
import type { InUse, MapRead, Workspace } from '../roots/types.ts';
import type { ListServer, OwnEntry } from '../mcps-list/types.ts';
import type { CursorOf } from '../cursor/types.ts';

export type Approval = 'approved' | 'pending' | 'rejected';

// The registration Claude Code uses in place of an inherited one.
export interface Shadow
{
    scope: string; // stored - do not rename
    from: string | null; // stored - do not rename
}

// One registration: a project, local or user server, or one a parent folder's .mcp.json gives (inherited).
export interface InvRegistration
{
    name: string; // stored - do not rename
    scope: string; // stored - do not rename
    entry: ServerEntry; // stored - do not rename
    rowId: string | null; // stored - do not rename
    route: string | null; // stored - do not rename
    own: boolean; // stored - do not rename
    alfredRetired: boolean; // stored - do not rename
    approval?: Approval; // stored - do not rename
    from?: string; // stored - do not rename
    file?: string; // stored - do not rename
    shadowed?: Shadow | null; // stored - do not rename
    choice?: string | null; // stored - do not rename
}

// One row of `claude plugin list --json`, as read here.
export interface PluginRow
{
    id: string; // stored - do not rename
    plugin: string; // stored - do not rename
    marketplace: string; // stored - do not rename
    scope: string; // stored - do not rename
    version: string | undefined; // stored - do not rename
    enabled: boolean; // stored - do not rename
    enabledFrom: 'list' | 'settings'; // stored - do not rename
    enabledHere: boolean; // stored - do not rename
    errors: unknown[]; // stored - do not rename
    rowId: string | null; // stored - do not rename
    alfredRetired: boolean; // stored - do not rename
}

// An MCP server a plugin that loads here provides.
export interface PluginServer
{
    plugin: string; // stored - do not rename
    server: string; // stored - do not rename
    entry: ServerEntry; // stored - do not rename
    rowId: string | null; // stored - do not rename
    route: string | null; // stored - do not rename
    choice: string | null; // stored - do not rename
}

export interface Marketplace
{
    name: string; // stored - do not rename
    source: string; // stored - do not rename
    installLocation: string; // stored - do not rename
}

// A scope file that could not be read.
export interface Unreadable
{
    scope: string; // stored - do not rename
    file: string; // stored - do not rename
    state: FileState; // stored - do not rename
    error: string | null; // stored - do not rename
}

export interface SourceState
{
    file: string; // stored - do not rename
    state: FileState; // stored - do not rename
}
export interface Sources
{
    project?: SourceState; // stored - do not rename
    account?: SourceState; // stored - do not rename
    local?: SourceState; // stored - do not rename
    user?: SourceState; // stored - do not rename
    inherited?: SourceState[]; // stored - do not rename
}

// A family's list as the inventory gives it: the first mcps.json found, or the 0.4.x record's own while there is none.
export interface InvList
{
    file: string; // stored - do not rename
    servers: ListServer[]; // stored - do not rename
    own: OwnEntry[]; // stored - do not rename
    cursorOffer?: 'declined'; // stored - do not rename
    note?: string; // stored - do not rename
    state?: string | undefined; // stored - do not rename
    old?: string; // stored - do not rename
}

export interface InvRoots
{
    map: MapRead; // stored - do not rename
    project?: InUse | null; // stored - do not rename
    global?: InUse | null; // stored - do not rename
}

export interface Inventory
{
    version: number; // stored - do not rename
    project: string; // stored - do not rename
    os: string; // stored - do not rename
    arch: string; // stored - do not rename
    cli: { ok: boolean; version: string | null } | null; // stored - do not rename
    unreadable: Unreadable[]; // stored - do not rename
    registrations: InvRegistration[]; // stored - do not rename
    plugins: PluginRow[]; // stored - do not rename
    pluginServers: PluginServer[]; // stored - do not rename
    marketplaces: Marketplace[]; // stored - do not rename
    alfredCodeEnabled: boolean; // stored - do not rename
    sources: Sources; // stored - do not rename
    trusted?: boolean; // stored - do not rename
    roots?: InvRoots; // stored - do not rename
    lists?: { project: InvList | null; global: InvList | null; [family: string]: InvList | null }; // stored - do not rename
    cursor?: { project: CursorOf; global: CursorOf }; // stored - do not rename
    workspace?: Workspace; // stored - do not rename
}

// One installed thing of a row, as installedOf gives it.
export interface Installed
{
    kind: 'mcp' | 'plugin';
    name: string;
    scope: string;
    from?: string | undefined;
    route?: string | null;
    entry?: ServerEntry;
    approval?: Approval | undefined;
    version?: string | undefined;
    enabled?: boolean;
}

// A windows-mcp server Claude Code starts here.
export interface WindowsMcp
{
    name: string;
    scope: string;
    kind: 'mcp' | 'plugin';
    owner: 'catalog' | 'alfred-code';
    from: string | null;
}

// ---- servers already set up (existing.ts) ---------------------------------------------------------------------------

export type ItemKind = 'mcp' | 'plugin' | 'connector';
// A server already set up that configure or install asks about: a registration, a plugin's server or a connector.
export interface ExistingItem
{
    key: string;
    kind: ItemKind;
    rowId: string | null;
    label: string | null;
    family: string;
    fingerprint: string | null;
    choice: string | null;
    name?: string;
    scope?: string;
    plugin?: string;
    server?: string;
    connector?: string;
}

// An entry a plugin's servers file or manifest declares.
export interface DeclaredServer
{
    server: string;
    entry: ServerEntry;
}

// ---- what buildInventory reads ---------------------------------------------------------------------------------------

// A .mcp.json, the part read here (Claude Code's - do not rename).
export interface McpJsonDoc
{
    mcpServers?: ServerMap;
    [key: string]: unknown;
}

// A Claude Code settings file, the keys read here (Claude Code's - do not rename).
export interface SettingsDoc
{
    enableAllProjectMcpServers?: unknown;
    enabledPlugins?: Record<string, unknown>;
    [key: string]: unknown;
}

// What decides a parent's server here: the user settings, this folder's settings files, its account entry and trust.
export interface ApprovalCtx
{
    user: SettingsDoc | null;
    folder: (SettingsDoc | null)[];
    entry: AccountProject;
    trusted: boolean;
}

// One row of `claude plugin list --json` (Claude Code's - do not rename).
export interface PluginListRow
{
    id: string;
    scope: string;
    version?: string;
    enabled: boolean;
    errors?: unknown[];
    projectPath?: string;
    installPath?: string;
}

// One row of `claude plugin marketplace list --json` (Claude Code's - do not rename).
export interface MarketplaceListRow
{
    name: string;
    repo?: string;
    url?: string;
    path?: string;
    installLocation?: string;
}

export interface BuildOptions
{
    project: string;
    env?: Env;
    platform?: string;
    arch?: string;
    catalog?: Catalog;
    run?: (args: string[], options?: CliOptions) => CliResult;
    data?: string | null;
}

// A servers file or a plugin manifest as parsed: the mcpServers map, or the map itself at the top.
export type ServersDoc = { mcpServers?: unknown; [key: string]: unknown };
