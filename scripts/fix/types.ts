// The shapes of the fix engine: the context a detector reads, the machine it looks through, a finding and what each kind
// of fix returns. A finding crosses the --json and --questions boundary (stored - do not rename).
import type { Env, ServerEntry } from '../core/types.ts';
import type { Catalog, CatalogRules } from '../catalog/types.ts';
import type { Roots } from '../entries/types.ts';
import type { Inventory, InvRegistration } from '../inventory/types.ts';
import type { ShippedKind } from '../roots/types.ts';
import type { ListServer } from '../mcps-list/types.ts';
import type { FetchJob, JobStep } from '../apply/types.ts';
import type { PlanStep, Question } from '../plan/types.ts';
import type { Log, RunCli } from '../apply/types.ts';

// A command the machine ran, as spawnSync reports it.
export interface RunResult
{
    status: number | null;
    stdout: string;
    stderr: string;
    error?: Error | undefined;
}
// The only way a detector looks at the machine, so a test replaces it.
export interface MachineProbe
{
    exists(file: string): boolean;
    realpath(file: string): string | null;
    which(name: string): string | null;
    run(command: string, args: string[], options?: { cwd?: string; env?: Env }): RunResult | null;
    nodeVersion: string;
}

// What a detector, a fix and a steps function read.
export interface FixCtx
{
    inventory: Inventory;
    catalog: Catalog;
    platform: string;
    arch: string;
    env: Env;
    home: string;
    rules: CatalogRules;
    machine: MachineProbe;
    data: string | null;
}

// A folder a fix needs from the user: the --input key and the question.
export interface FindingInput
{
    id: string; // stored - do not rename
    prompt: string; // stored - do not rename
}

// What a registration fix writes, as its detector proposed it.
export interface Proposal
{
    SERENA_HOME?: string; // stored - do not rename
    python?: string; // stored - do not rename
    from?: string; // stored - do not rename
    path?: string; // stored - do not rename
    what?: string; // stored - do not rename
    paths?: { key: string; from: string; to: string }[]; // stored - do not rename
    file?: string; // stored - do not rename
    own?: string[]; // stored - do not rename
    [envName: string]: unknown;
}

// One known problem found: its fix row, the registration or file it is on, what was found, and what each detector adds.
export interface Finding
{
    id: string; // stored - do not rename
    row?: string | null; // stored - do not rename
    name: string; // stored - do not rename
    scope: string | null; // stored - do not rename
    found: string; // stored - do not rename
    blocked?: string; // stored - do not rename
    note?: string | null | undefined; // stored - do not rename
    input?: FindingInput; // stored - do not rename
    proposal?: Proposal; // stored - do not rename
    kind?: string; // stored - do not rename
    symptom?: string; // stored - do not rename
    documented?: boolean; // stored - do not rename
    keyName?: string; // stored - do not rename
    cursorOnly?: boolean; // stored - do not rename
    roots?: Roots; // stored - do not rename
    want?: string; // stored - do not rename
    app?: string; // stored - do not rename
    driftKey?: string; // stored - do not rename
    change?: string; // stored - do not rename
    keyGuard?: boolean; // stored - do not rename
    keyEmpty?: boolean; // stored - do not rename
    inherited?: string | null; // stored - do not rename
    alfred?: boolean; // stored - do not rename
    declined?: boolean; // stored - do not rename
    path?: string; // stored - do not rename
    shipped?: string; // stored - do not rename
    bridged?: boolean; // stored - do not rename
    family?: string; // stored - do not rename
    servers?: ListServer[]; // stored - do not rename
    record?: string | null; // stored - do not rename
    rules?: string[]; // stored - do not rename
    file?: string | null; // stored - do not rename
    shared?: boolean; // stored - do not rename
    list?: string; // stored - do not rename
    rowGone?: boolean; // stored - do not rename
    chain?: string[]; // stored - do not rename
    route?: string | null | undefined; // stored - do not rename
    from?: number | null; // stored - do not rename
    fixes?: { secrets: boolean; helper: boolean; signIns: boolean; unignore: string[] }; // stored - do not rename
    tailOnly?: boolean; // stored - do not rename
    moveFrom?: string; // stored - do not rename
    moveTo?: string; // stored - do not rename
    unmanaged?: string[]; // stored - do not rename
    holders?: string[]; // stored - do not rename
    afterNote?: string; // stored - do not rename
    clients?: string[]; // stored - do not rename
    cursor?: boolean; // stored - do not rename
}
// A default root this plugin renamed: the folder under its former name and the one it is now (spec D3).
export interface MovedRoot
{
    from: string;
    to: string;
}
// A path project-relative-path writes out: where it is (an env key, the arg after a flag, or the helper), as written,
// as it will be, and as it means today when the two differ.
export interface PathChange
{
    in: string;
    key: string;
    from: string;
    to: string;
    was: string;
}
// Where a drifted copy was found: its list, its family, Cursor's file, the folder above it inherits from, and what Keep
// would risk.
export interface DriftWhere
{
    list: string;
    family: string;
    file?: string | null;
    inherited?: string | null;
    keyGuard?: boolean;
    keyEmpty?: boolean;
    rowGone?: boolean;
}
// A file this plugin copied that a managed registration names: the file, its root, which file it is, and the registration.
export interface ShippedFile
{
    file: string;
    root: string;
    kind: ShippedKind;
    registration: InvRegistration;
}

// A registration fix: the entry as read, edited; a machine fix: what it did; a file fix: the plan steps that repair it.
export type Detector = (context: FixCtx) => Finding[];
export type RegistrationFix = (entry: ServerEntry, finding: Finding, context: FixCtx, input: Record<string, string>) => ServerEntry;
export interface MachineFixResult
{
    ok: boolean;
    detail: string;
    restart?: boolean;
    fetch?: JobStep | null;
}
export type MachineFix = (finding: Finding, context: FixCtx) => MachineFixResult;
export type FileSteps = (finding: Finding, context: FixCtx, input: Record<string, string>) => PlanStep[];
// fix-functions.ts read by the name a fixes.json row gives.
export type FixFunction = Detector | RegistrationFix | MachineFix | FileSteps;

// detectAll's result (stored - do not rename: --json prints it).
export interface Detected
{
    found: Finding[]; // stored - do not rename
    held: { id: string; why: string }[]; // stored - do not rename
    own: { name: string; scope: string }[]; // stored - do not rename
    notes: string[]; // stored - do not rename
    afterMove?: Finding[]; // stored - do not rename: set only while a folder move waits (spec D3)
}
// The asks as data (stored - do not rename: --questions prints them): the three-way choice, the picks four a call, and
// each drifted copy's question with what its labels answer.
export type DriftQuestion = Question & { answers: Record<string, string>; askAfter?: { id: string; answers: string[] } };
export interface FixQuestions
{
    choose: Question | null; // stored - do not rename
    pick: Question[][]; // stored - do not rename
    drift: DriftQuestion[][]; // stored - do not rename
}
// The flags the fix command reads.
export interface FixArgs
{
    input: Record<string, string>;
    detect?: boolean;
    questions?: boolean;
    json?: boolean;
    apply?: string;
    only?: string;
    project?: string;
    tmp?: string;
    data?: string;
    [flag: string]: unknown;
}
// What applyFixes is narrowed and run with.
export interface FixOptions
{
    only?: string | undefined;
    name?: string | undefined;
    scope?: string | undefined;
    input?: Record<string, string>;
    tmp?: string | undefined;
    log?: Log;
    runCli?: RunCli;
    fetchFile?: string | false | undefined;
    quietRecheck?: boolean | undefined;
}
// applyFixes' result.
export interface FixRun
{
    applied: Finding[];
    skipped: Finding[];
    failed: string | null;
    remaining: Finding[];
    steps: number;
    fetchFile: string | null;
    fetch: FetchJob | null;
    gone: boolean;
    tmp: string | null;
}
