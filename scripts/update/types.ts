// The shapes of the update engine: the context it checks in, each kind of offer, the check's result (stored - do not
// rename: --json and --questions print it) and the apply's result.
import type { Env, ServerEntry } from '../core/types.ts';
import type { Catalog, Release } from '../catalog/types.ts';
import type { Inventory } from '../inventory/types.ts';
import type { ListServer } from '../mcps-list/types.ts';
import type { FetchJob, RunCli } from '../apply/types.ts';
import type { MachineProbe } from '../fix/types.ts';
import type { Taken } from '../plan/types.ts';

// Where a package's releases are read: npm or PyPI, which a test replaces.
export interface Registry
{
    versionsOf(registry: string, name: string): Promise<Release[]>;
}

// What the check and the apply read; the apply adds what this run fetches, whether a restart is needed, the servers a
// new way to pass data rewrote, and the names Cursor asks to approve again.
export interface UpdateCtx
{
    inventory: Inventory;
    project: string;
    catalog: Catalog;
    env: Env;
    runCli: RunCli;
    now: number;
    refresh: boolean;
    data: string | null;
    machine: MachineProbe;
    registry: Registry;
    fetches?: FetchJob[];
    restart?: boolean;
    touched?: Set<string>;
    reapprove?: string[];
}

// What every offer carries, and the fields the check, the asks and the order read on any offer.
export interface OfferBase
{
    kind: string; // stored - do not rename
    id: string; // stored - do not rename
    group: string; // stored - do not rename
    label: string; // stored - do not rename
    from?: string | null; // stored - do not rename
    to?: string | null; // stored - do not rename
    ageDays?: number; // stored - do not rename
    name?: string; // stored - do not rename
    scope?: string | null; // stored - do not rename
    plugin?: string; // stored - do not rename
    fix?: string; // stored - do not rename
    fixKind?: string | undefined; // stored - do not rename
    found?: string; // stored - do not rename
    alfred?: boolean | undefined; // stored - do not rename
    family?: string | undefined; // stored - do not rename
    listFile?: string; // stored - do not rename
    servers?: ListServer[] | undefined; // stored - do not rename
}
// A plugin behind its marketplace's release, or one whose marketplace lists no version (`to: null`).
export interface PluginOffer extends OfferBase
{
    kind: 'plugin'; // stored - do not rename
    plugin: string; // stored - do not rename
    scope: string; // stored - do not rename
    from: string | null; // stored - do not rename
    to: string | null; // stored - do not rename
}
// A pinned server behind a release at least 7 days old: the registration as read, and the entry with the pin moved.
export interface McpOffer extends OfferBase
{
    kind: 'mcp'; // stored - do not rename
    name: string; // stored - do not rename
    scope: string; // stored - do not rename
    row: string | null; // stored - do not rename
    route: string | null; // stored - do not rename
    package: string; // stored - do not rename
    from: string; // stored - do not rename
    to: string; // stored - do not rename
    ageDays: number; // stored - do not rename
    cutoff: string; // stored - do not rename
    old: ServerEntry; // stored - do not rename
    entry: ServerEntry; // stored - do not rename
}
// Cursor's bridge copy of a two-form entry, behind on its mcp-remote pin.
export interface CursorPinOffer extends OfferBase
{
    kind: 'cursor-pin'; // stored - do not rename
    name: string; // stored - do not rename
    scope: string; // stored - do not rename
    row: string | null; // stored - do not rename
    family: string; // stored - do not rename
    list: string; // stored - do not rename
    file: string; // stored - do not rename
    server: ListServer; // stored - do not rename
    package: string; // stored - do not rename
    from: string; // stored - do not rename
    to: string; // stored - do not rename
    ageDays: number; // stored - do not rename
    cutoff: string; // stored - do not rename
    old: ServerEntry; // stored - do not rename
    entry: ServerEntry; // stored - do not rename
}
// A helper, bridge or serena-context copy with a lower number than this plugin's.
export interface FileOffer extends OfferBase
{
    kind: 'helper' | 'bridge' | 'context'; // stored - do not rename
    file: string; // stored - do not rename
    root: string; // stored - do not rename
    from: string; // stored - do not rename
    to: string; // stored - do not rename
}
// A fix row marked `upgrade`, found: what an older alfred-tools wrote, moved to the way this one passes data.
export interface UpgradeOffer extends OfferBase
{
    kind: 'upgrade'; // stored - do not rename
    fix: string; // stored - do not rename
    name: string; // stored - do not rename
    scope: string | null; // stored - do not rename
    found: string; // stored - do not rename
}
export type Offer = PluginOffer | McpOffer | CursorPinOffer | FileOffer | UpgradeOffer;

// Update's Cursor offer for one root: the servers set up for Claude Code, the names Cursor's file holds already, and the
// list-import offer it waits on.
export interface CursorOffer
{
    id: string; // stored - do not rename
    family: string; // stored - do not rename
    root: string; // stored - do not rename
    list: string; // stored - do not rename
    servers: { name: string; scope: string }[]; // stored - do not rename
    taken: Taken[]; // stored - do not rename
    needs: string | null; // stored - do not rename
}

// check's result.
export interface UpdateCheck
{
    offers: Offer[]; // stored - do not rename
    unchecked: PluginOffer[]; // stored - do not rename
    skipped: string[]; // stored - do not rename
    held: string[]; // stored - do not rename
    errors: string[]; // stored - do not rename
    notes: string[]; // stored - do not rename
    waiting: number; // stored - do not rename
    outside: string[]; // stored - do not rename
    cursorOffers: CursorOffer[]; // stored - do not rename
}

// The flags the update command reads.
export interface UpdateArgs
{
    input: Record<string, string>;
    check?: boolean;
    questions?: boolean;
    json?: boolean;
    apply?: string;
    project?: string;
    tmp?: string;
    data?: string;
    [flag: string]: unknown;
}

// applyUpdates' result: the ids applied, failed and not offered, the fetch file, and the run's temporary folder.
export interface UpdateRun
{
    applied: string[];
    failed: string[];
    unknown: string[];
    fetchFile: string | null;
    dir: string | null;
}
