// The plan and its asks: the picks and answers files the commands write, the plan file apply reads, each step by its op,
// the questions, and the context a plan is made in. The picks, answers and plan files cross a JSON boundary between the
// commands' steps (stored - do not rename).
import type { Env, ServerEntry } from '../core/types.ts';
import type { Catalog, CatalogRow, DangerousTool } from '../catalog/types.ts';
import type { Current, FetchStep, Machine, Root, Roots } from '../entries/types.ts';
import type { Installed } from '../inventory/types.ts';
import type { Family, RootAnswer } from '../roots/types.ts';
import type { ListServer, OrderStep, OwnEntry, Live } from '../mcps-list/types.ts';
import type { CursorWriteStep as CursorWriteFields } from '../cursor/types.ts';

// ---- the asks ---------------------------------------------------------------------------------------------------------

export interface QuestionOption
{
    label: string; // stored - do not rename
    description: string; // stored - do not rename
}
// One AskUserQuestion question, as the commands pass it on.
export interface Question
{
    id: string; // stored - do not rename
    header: string; // stored - do not rename
    multiSelect: boolean; // stored - do not rename
    question: string; // stored - do not rename
    options: QuestionOption[]; // stored - do not rename
}
// A question with what each label answers.
export interface Asked<Value = unknown>
{
    question: Question; // stored - do not rename
    answers: Record<string, Value>; // stored - do not rename
}

// ---- the picks file (--questions) ---------------------------------------------------------------------------------------

export interface Picks
{
    rows?: string[]; // stored - do not rename
    targets?: string[]; // stored - do not rename
    routes?: Record<string, string>; // stored - do not rename
    scopes?: Record<string, string>; // stored - do not rename
    names?: Record<string, string>; // stored - do not rename
    roots?: Partial<Record<Family, RootAnswer | null>>; // stored - do not rename
    existing?: Record<string, string>; // stored - do not rename
    tokens?: Record<string, unknown>; // stored - do not rename
    done?: string[]; // stored - do not rename
    walk?: string; // stored - do not rename
}

// ---- the answers file -------------------------------------------------------------------------------------------------

// Where a data folder goes: 'keep' | 'default' | 'project' | 'account' | 'path' | 'alfred-data' | 'alfred'.
export interface LocationAnswer
{
    side: string; // stored - do not rename
    path?: string | undefined; // stored - do not rename
}
export interface Endpoint
{
    name: string; // stored - do not rename
    scope: string; // stored - do not rename
}
// One tool's answers: an install pick, or a configure change (with its row, for prereq.js).
export interface PickAnswer
{
    route?: string | undefined; // stored - do not rename
    scope?: string | undefined; // stored - do not rename
    name?: string | undefined; // stored - do not rename
    location?: LocationAnswer | undefined; // stored - do not rename
    executablePath?: string | null | undefined; // stored - do not rename
    token?: unknown; // stored - do not rename
    params?: ({ host?: string } & Record<string, string>) | undefined; // stored - do not rename
    urlNames?: Record<string, string> | undefined; // stored - do not rename
    row?: string | undefined; // stored - do not rename
    // filled by the planner, never in the file
    target?: Endpoint | undefined;
    clients?: string[] | undefined;
    keyName?: string | undefined;
    settings?: Record<string, string> | undefined;
}
export interface RemoveAnswer
{
    kind: string; // stored - do not rename
    name?: string; // stored - do not rename
    scope: string; // stored - do not rename
    id?: string; // stored - do not rename
}
export interface Answers
{
    picks?: Record<string, PickAnswer | null>; // stored - do not rename
    change?: Record<string, PickAnswer | null>; // stored - do not rename
    remove?: RemoveAnswer[]; // stored - do not rename
    machine?: { docker?: boolean | undefined }; // stored - do not rename
    roots?: Partial<Record<Family, RootAnswer | null>>; // stored - do not rename
    rootChange?: string[]; // stored - do not rename
    keyNames?: Record<string, string>; // stored - do not rename
    settings?: Record<string, Record<string, string>>; // stored - do not rename
    urlNames?: Record<string, Record<string, string>>; // stored - do not rename
    clients?: string[]; // stored - do not rename
    existing?: Record<string, string>; // stored - do not rename
    cursorNames?: Record<string, string>; // stored - do not rename
}

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

// A list-write upsert: the server, the registration key it is filled from at apply (null: as given), the Cursor file
// whose copy it takes, and the key files a stdio key is named from.
// A server a list-write upserts: its entry null until the apply fills it from the registration as read, and the Cursor
// form planMcp decided.
export type PlannedServer = Omit<ListServer, 'entry'> & { entry: ServerEntry | null; form?: string | null | undefined };
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
export interface DenyReadStep
{
    op: 'deny-read'; // stored - do not rename
    file: string; // stored - do not rename
    rules: string[]; // stored - do not rename
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
export type PlanStep = RegistrationStep | (FetchStep & { scope?: string }) | ListWriteStep | CursorWritePlanStep | PathStep | MoveRootFileStep | FileStep | EnsureKeyNameStep | SerenaBaseModesStep | DenyReadStep | RecordRootStep | OrderStep;

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
export interface OAuthLine
{
    row: string; // stored - do not rename
    name: string; // stored - do not rename
    scope: string; // stored - do not rename
    signin?: boolean; // stored - do not rename
    root?: string | undefined; // stored - do not rename
}
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

// ---- the context a plan is made in ------------------------------------------------------------------------------------

// A root a planned step writes into: its helper, bridge, serena context, a key name, or only the root itself.
export interface RootUse
{
    family: string;
    root: string;
    helper?: boolean;
    bridge?: boolean;
    serenaContext?: boolean;
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
}
// The plan's own context: makeCtx's, the changes it plans, and what planMcp records for the lists.
export interface PlanCtx extends MadeCtx, ListCtx
{
    machine: { docker?: boolean | undefined };
    changing: Set<string>;
    rootMoves: RootMove[];
}
// Where a Cursor file is and the catalog its rows come from: update.js passes its own.
export interface CursorPlaceCtx
{
    platform: string;
    project?: string | undefined;
    home?: string | undefined;
    env?: Env | undefined;
    catalog?: Catalog | undefined;
}
// The part of a plan the step makers add to: fix.js passes its own.
export interface PlanOut
{
    steps: PlanStep[];
    notes: string[];
    errors: string[];
    taken?: Taken[] | undefined;
}
// What a repair's tail is given: where it runs, the catalog, and the notes it adds to (fix.js and update.js).
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
    serenaContext?: boolean;
    committed?: boolean;
    keys: Map<string, string[]>;
}
// What a registration step uses of its roots (useRoots).
export interface RootUses
{
    helper?: boolean;
    bridge?: boolean;
    serenaContext?: boolean;
    keyFile?: string | null;
    keyName?: string | null;
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
    family: string;
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

// ---- the --questions output (stored - do not rename: the commands read it) --------------------------------------------

// One tool's or target's questions in the output: its route question, then toolAsk's parts; a target adds its kind,
// what it has now, and a root, own or apps question.
export interface ToolBlock
{
    route?: Question | null; // stored - do not rename
    first?: Question[] | null; // stored - do not rename
    questions?: Question[]; // stored - do not rename
    answers?: Record<string, LocationAnswer>; // stored - do not rename
    only?: LocationAnswer | null; // stored - do not rename
    error?: string; // stored - do not rename
    kind?: string; // stored - do not rename
    family?: string; // stored - do not rename
    row?: string | null; // stored - do not rename
    current?: { name?: string | undefined; scope?: string | null | undefined; route?: string | null | undefined; clients?: string[]; path?: string }; // stored - do not rename
    root?: Asked; // stored - do not rename
    own?: Asked; // stored - do not rename
    clients?: Asked<string[]>; // stored - do not rename
}
// One step of the walk: the questions about one tool to ask now, or { id: 'done' }.
export interface WalkStep
{
    id: string; // stored - do not rename
    tool?: string | null; // stored - do not rename
    call?: Question[]; // stored - do not rename
    answers?: Record<string, unknown>; // stored - do not rename
    set?: { location: LocationAnswer }; // stored - do not rename
}
export interface Questions
{
    static: Record<string, unknown>; // stored - do not rename
    pick: Question[][]; // stored - do not rename
    change: { calls: Question[][]; keys: Record<string, string> } | null; // stored - do not rename
    remove: Question[][]; // stored - do not rename
    tools: Record<string, ToolBlock>; // stored - do not rename
    targets: Record<string, ToolBlock>; // stored - do not rename
    clients?: Asked<string[]> | null; // stored - do not rename
    roots?: { questions: Question[]; answers: Record<string, Record<string, unknown>> }; // stored - do not rename
    keyNames?: Record<string, Asked<string>>; // stored - do not rename
    settings?: Record<string, Asked<string>>; // stored - do not rename
    urlNames?: Record<string, Record<string, Asked<string>>>; // stored - do not rename
    next?: WalkStep; // stored - do not rename
}
// What the asks read: the shell's variables and the home key file (none: neither), and the claude.ai connectors.
export interface AskOptions
{
    env?: Env;
    home?: string | null | undefined;
    connectors?: string[] | null;
}

export interface PlanArgs
{
    questions: boolean;
    files: string[];
    data: string | null;
    connectors: string | null;
    out: string | null;
    error: string | null;
}
