// The plan's types: the context a plan and its asks are made in, here, and - re-exported, so every reader imports this
// one file - the files the commands write (files/types.ts), the plan file (steps/types.ts), the questions
// (questions/types.ts) and one MCP pick as planMcp settles it (pick/types.ts).
import type { Env, ServerEntry } from '../core/types.ts';
import type { Catalog, CatalogRow } from '../catalog/types.ts';
import type { Current, Machine, Root } from '../entries/types.ts';
import type { Installed } from '../inventory/types.ts';
import type { OwnEntry, Live, ListServer } from '../mcps-list/types.ts';
import type { Family } from '../roots/types.ts';
import type { LocationAnswer } from './files/types.ts';
import type { Question } from './questions/types.ts';
import type { ListDrop, ListUpsert, OwnPlan, PlanStep, Taken } from './steps/types.ts';

export type * from './files/types.ts';
export type * from './questions/types.ts';
export type * from './steps/types.ts';
export type * from './pick/types.ts';

// ---- the context a plan is made in ------------------------------------------------------------------------------------

// A root a planned step writes into: its helper, bridge, serena context, a key name, or only the root itself.
export interface RootUse
{
    family: string;
    root: string;
    helper?: boolean;
    bridge?: boolean;
    serenaContext?: string; // the folder the context file goes in: serena's home, or the root
    exclude?: string[]; // the tools macos-mcp's exclude file in the root leaves out
    committed?: boolean;
    key?: { file: string; name: string; names?: string[] };
}
export interface RootMove
{
    family: string;
    name: string;
    from: string;
    to: string;
}
export interface ClientsOnly
{
    key: string;
    clients: string[];
    form: string | null;
}
// What makeCtx hands out: the machine, the project, and a live registration reader.
export interface MadeCtx extends Machine
{
    machine: { docker?: boolean | undefined };
    alfredHere?: boolean;
    readLive: (name: string, scope: string) => ServerEntry | undefined;
}
// What the list and Cursor steps read: the machine and its roots, the root uses they add to, and what planMcp recorded.
export interface ListCtx extends Machine
{
    uses: RootUse[];
    clientsFor?: Map<string, string[]> | undefined;
    formFor?: Map<string, string | null> | undefined;
    clientsOnly?: ClientsOnly[] | null | undefined;
    recordEntries?: Record<string, OwnEntry[]> | undefined;
    recordLive?: Live | undefined;
    normalizeCopy?: ((entry: ServerEntry) => ServerEntry) | undefined;
    rootMoves?: RootMove[] | undefined; // the root files a root change moves (planRootChange)
}
// The plan's own context: makeCtx's, the changes it plans, and what planMcp records for the lists.
export interface PlanCtx extends MadeCtx, ListCtx
{
    machine: { docker?: boolean | undefined };
    changing: Set<string>;
    rootMoves: RootMove[];
}
// Where a Cursor file is and the catalog its rows come from: update.ts passes its own.
export interface CursorPlaceCtx
{
    platform: string;
    project?: string | undefined;
    home?: string | undefined;
    env?: Env | undefined;
    catalog?: Catalog | undefined;
}
// The part of a plan the step makers add to: fix.ts passes its own.
export interface PlanOut
{
    steps: PlanStep[];
    notes: string[];
    errors: string[];
    taken?: Taken[] | undefined;
}
// What a repair's tail is given: where it runs, the catalog, and the notes it adds to (fix.ts and update.ts).
export interface RepairCtx
{
    platform: string;
    project?: string | undefined;
    home: string;
    env?: Env | undefined;
    catalog?: Catalog | undefined;
    notes?: string[] | undefined;
    exists?: ((file: string) => boolean) | undefined;
}
// What a plan writes into one root: its helper, bridge and serena context, whether a project-scope server names it,
// and the key names each key file gets.
export interface RootWrite
{
    family: string;
    root: string;
    helper: boolean;
    bridge: boolean;
    serenaContext: Set<string>; // the folders the context file goes in
    exclude: string[] | null; // the tools macos-mcp's exclude file in the root leaves out
    committed?: boolean;
    keys: Map<string, string[]>;
}
// What a registration step uses of its roots (useRoots).
export interface RootUses
{
    helper?: boolean;
    bridge?: boolean;
    serenaContext?: string | undefined;
    exclude?: string[] | undefined;
    keyFile?: string | null;
    keyName?: string | null | undefined;
    keyNames?: string[];
    data?: string | null;
}
// A list as a plan finds it: its servers and own entries, or none with why.
export interface FoundList
{
    servers: ListServer[];
    own: OwnEntry[];
    state?: string | undefined;
}
// What a plan writes to one list file.
export interface ListPlan
{
    family: Family;
    upserts: ListUpsert[];
    drops: ListDrop[];
    own: OwnPlan | null;
    next?: OwnEntry[];
}
export interface PlanOptions
{
    catalog?: Catalog;
    env?: Env;
    home?: string;
    exists?: (file: string) => boolean;
    isDir?: (file: string) => boolean;
    machine?: { docker?: boolean | undefined } | undefined;
    readLive?: (name: string, scope: string) => ServerEntry | undefined;
    connectors?: string[] | null;
}

// The context the asks are made in: the machine, the roots answered so far, and the home whose key files are read
// (null: none outside the project).
export interface AskCtx extends Machine
{
    keyHome?: string | null | undefined;
    catalog?: Catalog | undefined;
}

// A key name D9 offers, with the first file that fills it.
export interface NameAt
{
    name: string;
    file: string;
}
// Where a route's key is, by name only.
export interface KeyState
{
    variable: string;
    kind: 'helper' | 'stdio';
    scope: string;
    files: string[];
    names: NameAt[];
    found: NameAt | null;
    old: NameAt[];
}

// One option of a pick question: its catalog group, label and description, and what it picks.
export interface PickItem
{
    group: { id: string; label: string };
    label: string;
    description: string;
    row?: CatalogRow;
    target?: (Installed & { key?: undefined }) | { kind: 'own' | 'root'; key: string; name?: undefined; scope?: undefined };
}

// What one tool's questions start from: the route, scope and name answered so far, the registration configure changes,
// and, for an install, this row's registrations at other scopes.
export interface ToolOpts
{
    route?: string | null | undefined;
    scope?: string | null | undefined;
    name?: string | null | undefined;
    current?: Partial<Current> | null | undefined;
    context?: AskCtx | null | undefined;
    catalog?: Catalog | undefined;
    copyOf?: Installed[] | undefined;
}

// A place a location question offers: its side, the root folder, and a label, description or answer of its own.
export interface Place
{
    side: string;
    root?: Root | undefined;
    label?: string | undefined;
    description?: string | undefined;
    answer?: LocationAnswer | undefined;
}

// A list entry whose copy in one app was edited or removed by hand, as the drift question reads it.
export interface DriftAsk
{
    name: string;
    scope: string;
    app: string;
    appLabel?: string | undefined;
    change: string;
    keyGuard?: boolean | undefined;
    keyEmpty?: boolean | undefined;
    rowGone?: boolean | undefined;
    inherited?: string | null | undefined;
}

// One tool's questions: scope and name `first` for a row with a data folder, then the rest, the location answers, and
// the one location left when none is asked.
export interface ToolAsk
{
    first: Question[] | null;
    questions: Question[];
    answers: Record<string, LocationAnswer>;
    only: LocationAnswer | null;
}
