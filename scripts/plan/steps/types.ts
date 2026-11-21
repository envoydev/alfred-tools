// The plan file apply reads: each step by its op, and the lines a plan prints beside them. It crosses a JSON boundary
// between plan.ts and apply.ts (stored - do not rename).
import type { ServerEntry } from '../../core/types.ts';
import type { Catalog, DangerousTool } from '../../catalog/types.ts';
import type { FetchStep, Roots } from '../../entries/types.ts';
import type { Inventory } from '../../inventory/types.ts';
import type { ShippedKind } from '../../roots/types.ts';
import type { ListServer, OrderStep, OwnEntry, Live } from '../../mcps-list/types.ts';
import type { CursorWriteStep as CursorWriteFields } from '../../cursor/types.ts';
import type { Endpoint } from '../files/types.ts';
import type { Asked } from '../questions/types.ts';

// ---- the plan file ----------------------------------------------------------------------------------------------------

// A stdio key the apply writes in: its name and the files read for it.
export interface StepKey
{
    name: string; // stored - do not rename
    files: string[]; // stored - do not rename
}
export interface McpAddStep
{
    op: 'mcp-add'; // stored - do not rename
    name: string; // stored - do not rename
    scope: string; // stored - do not rename
    entry: ServerEntry; // stored - do not rename
    row: string | null; // stored - do not rename
    route: string | null; // stored - do not rename
    key?: StepKey; // stored - do not rename
    filled?: boolean; // stored - do not rename
    why: string; // stored - do not rename
}
export interface McpReplaceStep extends Omit<McpAddStep, 'op'>
{
    op: 'mcp-replace'; // stored - do not rename
    old: ServerEntry; // stored - do not rename
}
export interface McpMoveStep extends Omit<McpAddStep, 'op' | 'name' | 'scope'>
{
    op: 'mcp-move'; // stored - do not rename
    from: Endpoint; // stored - do not rename
    to: Endpoint; // stored - do not rename
    old: ServerEntry; // stored - do not rename
}
export interface McpRemoveStep
{
    op: 'mcp-remove'; // stored - do not rename
    name: string; // stored - do not rename
    scope: string; // stored - do not rename
    old: ServerEntry; // stored - do not rename
    row: string | null; // stored - do not rename
    why: string; // stored - do not rename
}
export type RegistrationStep = McpAddStep | McpReplaceStep | McpMoveStep | McpRemoveStep;

// A server a list-write upserts: its entry null until the apply fills it from the registration as read, and the Cursor
// form planMcp decided.
export type PlannedServer = Omit<ListServer, 'entry'> & { entry: ServerEntry | null; form?: string | null | undefined };
// A list-write upsert: the server, the registration key it is filled from at apply (null: as given), the Cursor file
// whose copy it takes, and the key files a stdio key is named from.
export interface ListUpsert
{
    server: PlannedServer; // stored - do not rename
    after: string | null; // stored - do not rename
    cursorFile: string | null; // stored - do not rename
    keyFiles?: string[]; // stored - do not rename
}
export interface ListDrop
{
    key: string; // stored - do not rename
    after: string | null; // stored - do not rename
}
// The own part of a list-write: lists.ownOf's input.
export interface OwnPlan
{
    entries: OwnEntry[]; // stored - do not rename
    keep: OwnEntry[]; // stored - do not rename
    live: Live | null | undefined; // stored - do not rename
}
export interface ListWriteStep
{
    op: 'list-write'; // stored - do not rename
    file: string; // stored - do not rename
    family: string; // stored - do not rename
    upserts: ListUpsert[]; // stored - do not rename
    drops: ListDrop[]; // stored - do not rename
    own: OwnPlan | null; // stored - do not rename
    empty?: boolean; // stored - do not rename
    cursorOffer?: string; // stored - do not rename
    why: string; // stored - do not rename
}
export interface CursorWritePlanStep extends CursorWriteFields
{
    op: 'cursor-write'; // stored - do not rename
    reapprove?: string[]; // stored - do not rename
    why: string; // stored - do not rename
}
export interface PathStep
{
    op: 'ensure-dir' | 'root-ignore' | 'write-helper' | 'write-bridge' | 'write-serena-context'; // stored - do not rename
    path: string; // stored - do not rename
    why: string; // stored - do not rename
}
// macos-mcp's exclude file in a root (spec D4): written only when it is not there.
export interface ExcludeFileStep
{
    op: 'write-exclude-file'; // stored - do not rename
    path: string; // stored - do not rename
    tools: string[]; // stored - do not rename
    why: string; // stored - do not rename
}
export interface MoveRootFileStep
{
    op: 'move-root-file'; // stored - do not rename
    from: string; // stored - do not rename
    to: string; // stored - do not rename
    why: string; // stored - do not rename
}
export interface FileStep
{
    op: 'retire-record'; // stored - do not rename
    file: string; // stored - do not rename
    why: string; // stored - do not rename
}
// The copy of a shipped file left behind where it used to live: removed at apply time when it is this plugin's own,
// unedited copy and no registration in `namedBy` still names it.
export interface RetireShippedStep
{
    op: 'retire-shipped'; // stored - do not rename
    kind: ShippedKind; // stored - do not rename
    file: string; // stored - do not rename
    namedBy: string[]; // stored - do not rename
    why: string; // stored - do not rename
}
// The hand-built helper script a registration ran before helper-foreign moved it to the plugin's helper: removed at apply
// time only when no registration or Cursor file names it and git does not track it.
export interface RetireHelperStep
{
    op: 'retire-helper'; // stored - do not rename
    file: string; // stored - do not rename
    why: string; // stored - do not rename
}
// What retireContextSteps reads: the inventory (every registration and list), the machine and the catalog.
export interface RetireCtx
{
    inventory: Inventory;
    platform: string;
    home: string;
    catalog: Catalog;
}
// A registration a step rewrites: the one as read (its name and scope there) and the entry it gets.
export interface Rewrite
{
    name: string;
    scope: string;
    old: ServerEntry;
    entry: ServerEntry;
}
export interface EnsureKeyNameStep
{
    op: 'ensure-key-name'; // stored - do not rename
    file: string; // stored - do not rename
    names: string[]; // stored - do not rename
    why: string; // stored - do not rename
}
export interface SerenaBaseModesStep
{
    op: 'serena-base-modes'; // stored - do not rename
    file: string; // stored - do not rename
    shared?: unknown; // stored - do not rename
    why: string; // stored - do not rename
}
// serena's settings file for a home it has not started in: projects, base_modes and its project folder key
export interface SerenaConfigInitStep
{
    op: 'serena-config-init'; // stored - do not rename
    file: string; // stored - do not rename
    home: string; // stored - do not rename
    why: string; // stored - do not rename
}
// the project folder key set in a serena_config.yml that lacks it or holds another value
export interface SerenaProjectFolderStep
{
    op: 'serena-project-folder'; // stored - do not rename
    file: string; // stored - do not rename
    home: string; // stored - do not rename
    why: string; // stored - do not rename
}
// one project's in-tree .serena folder moved to serena's home, where project_serena_folder_location points
export interface SerenaFolderMoveStep
{
    op: 'serena-folder-move'; // stored - do not rename
    project: string; // stored - do not rename
    from: string; // stored - do not rename
    to: string; // stored - do not rename
    why: string; // stored - do not rename
}
export interface DenyReadStep
{
    op: 'deny-read'; // stored - do not rename
    file: string; // stored - do not rename
    rules: string[]; // stored - do not rename
    why: string; // stored - do not rename
}
// the names an env object in Claude Code's settings file lacks (MCP_TIMEOUT: the start limit of a server)
export interface SettingsEnvStep
{
    op: 'settings-env'; // stored - do not rename
    file: string; // stored - do not rename
    env: Record<string, string>; // stored - do not rename
    why: string; // stored - do not rename
}
export interface RecordRootStep
{
    op: 'record-root'; // stored - do not rename
    family: string; // stored - do not rename
    project: string; // stored - do not rename
    root: string; // stored - do not rename
    why: string; // stored - do not rename
}
export type PlanStep = RegistrationStep | (FetchStep & { scope?: string }) | ListWriteStep | CursorWritePlanStep | PathStep | ExcludeFileStep | MoveRootFileStep | FileStep | RetireShippedStep | RetireHelperStep | EnsureKeyNameStep | SerenaBaseModesStep | SerenaConfigInitStep | SerenaProjectFolderStep | SerenaFolderMoveStep | DenyReadStep | SettingsEnvStep | RecordRootStep | OrderStep;

// The lines a plan prints beside its steps.
export interface KeyLine
{
    row: string; // stored - do not rename
    name: string; // stored - do not rename
    scope: string; // stored - do not rename
    variable: string; // stored - do not rename
    kind: string; // stored - do not rename
    files: string[]; // stored - do not rename
    filled: boolean; // stored - do not rename
    old: string | null; // stored - do not rename
    optional?: boolean; // stored - do not rename
}
export interface Reconnect
{
    row: string; // stored - do not rename
    name: string; // stored - do not rename
    variable: string; // stored - do not rename
    file: string; // stored - do not rename
    filled: boolean; // stored - do not rename
    anonymous: boolean; // stored - do not rename
    hint: string | null; // stored - do not rename
    untrusted: boolean; // stored - do not rename
}
interface OAuthBase
{
    row: string; // stored - do not rename
    name: string; // stored - do not rename
    scope: string; // stored - do not rename
}
// A server on the shared sign-in names the root that keeps it; one signed in through /mcp names none.
export type OAuthLine = OAuthBase & ({ signin?: undefined; root?: undefined } | {
    signin: true; // stored - do not rename
    root: string; // stored - do not rename
});
export interface DangerLine
{
    row: string; // stored - do not rename
    name: string; // stored - do not rename
    tools: DangerousTool[]; // stored - do not rename
}
export interface Expect
{
    kind: string; // stored - do not rename
    row: string; // stored - do not rename
    name: string; // stored - do not rename
    scope: string; // stored - do not rename
    route: string | null; // stored - do not rename
}
// A name Cursor's file holds that no answer settles.
export interface Taken
{
    file: string; // stored - do not rename
    name: string; // stored - do not rename
    sameRow: boolean; // stored - do not rename
}
export interface Plan
{
    version: number; // stored - do not rename
    project: string; // stored - do not rename
    os: string; // stored - do not rename
    alfredCodeEnabled: boolean; // stored - do not rename
    steps: PlanStep[]; // stored - do not rename
    notes: string[]; // stored - do not rename
    errors: string[]; // stored - do not rename
    unchanged: string[]; // stored - do not rename
    keys: KeyLine[]; // stored - do not rename
    reconnect: Reconnect[]; // stored - do not rename
    oauth: OAuthLine[]; // stored - do not rename
    dangerous: DangerLine[]; // stored - do not rename
    expect: Expect[]; // stored - do not rename
    roots?: Roots; // stored - do not rename
    outside?: string[]; // stored - do not rename
    apps?: string[]; // stored - do not rename
    taken?: Taken[]; // stored - do not rename
    cursorNames?: Asked[]; // stored - do not rename
    noop?: boolean; // stored - do not rename
}
