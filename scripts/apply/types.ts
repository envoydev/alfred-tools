// The shapes apply/ reads and writes: a step's outcome, the apply's context and report, and the fetch job fetch.ts runs.
import type { CliOptions, CliResult, Env, Outcome, ServerEntry } from '../core/types.ts';
import type { Catalog } from '../catalog/types.ts';
import type { FetchStep } from '../entries/types.ts';
import type { Expect, McpAddStep, McpMoveStep, McpReplaceStep, Plan } from '../plan/types.ts';

// What one step reports: ok and why, and for a deny-read whether the file had every rule already.
export interface StepResult extends Outcome
{
    unchanged?: boolean;
}

// The lines a script prints, one argument per line.
export type Log = (...lines: string[]) => void;

// The steps that write a registration's entry: an add, a replace and a move.
export type WriteStep = McpAddStep | McpReplaceStep | McpMoveStep;

// One run of the claude CLI, which a test replaces.
export type RunCli = (args: string[], options?: CliOptions) => CliResult;
// One claude call as a step reads it: ok, its last three lines, and the run.
export interface CallResult
{
    ok: boolean;
    out: string;
    result: CliResult;
}
export type Call = (argv: string[]) => CallResult;

// A step by its number in the plan: applied or failed, and one not run.
export interface StepDone
{
    i: number;
    op: string;
    detail: string;
}
export interface StepNotRun
{
    i: number;
    op: string;
    why: string;
}
// One picked tool as the files and the CLI report it after the apply.
export interface Readback
{
    kind: string;
    name: string;
    scope: string;
    expectedRoute: string | null;
    found: boolean;
    route: string | null;
    row: string | null;
}

// A fetch step as the job holds it: the scope it was written at, and the parent folder of an inherited server
// (stored - do not rename: fetch.ts reads it).
export type JobStep = FetchStep & { scope?: string | undefined; from?: string | undefined };
// <tmp>/fetch.json (stored - do not rename).
export interface FetchJob
{
    version: number; // stored - do not rename
    project: string; // stored - do not rename
    fetch: JobStep[]; // stored - do not rename
    check: string[]; // stored - do not rename
}
// One server's status line from `claude mcp get`, and the CLI's reason when it failed.
export interface Status
{
    name: string;
    out: string;
    issue: string | null;
}

export interface ApplyReport
{
    applied: StepDone[];
    failed: StepDone | null;
    notRun: StepNotRun[];
    readback: Readback[];
    keys: string[];
    noop: boolean;
    toFetch: JobStep[];
    fetch: FetchJob | null;
    fetchFile: string | null;
    tmp: string | null;
    appliedKeys: Set<string>;
    cursorFiles: Set<string>;
    lists: StepResult[];
}

// The part of a plan apply reads: update.ts and fix.ts build their own, whose expected servers carry no row.
export type ApplyPlan = Pick<Plan, 'project' | 'steps'> & Partial<Pick<Plan, 'alfredCodeEnabled' | 'reconnect' | 'errors'>> & { expect?: Pick<Expect, 'kind' | 'name' | 'scope' | 'route'>[] };

// What each step runs with: the project, the CLI, the catalog, the plugin data folder, and the report so far.
export interface ApplyCtx
{
    project: string;
    env: Env;
    tmp: string;
    runCli: RunCli;
    catalog: Catalog;
    alfredEnabled: boolean;
    data: string | null;
    call?: Call;
    report?: ApplyReport;
}
export interface ApplyOptions
{
    env?: Env;
    tmp?: string | undefined;
    runCli?: RunCli;
    log?: Log;
    fetchFile?: string | false | undefined;
    data?: string | null;
}

// ---- fetch.ts ---------------------------------------------------------------------------------------------------------

// A runtime's fetch, as spawnSync reports it.
export interface FetchRunResult
{
    error?: Error | undefined;
    status: number | null;
    stdout?: string | null;
    stderr?: string | null;
}
export type RunFetch = (argv: string[], options: { cwd: string; env: Env }) => FetchRunResult;
// A server's first start: answered or not, how long it took, and why not.
export interface StartResult
{
    ok: boolean;
    ms: number;
    why?: string;
}
export type Start = (entry: ServerEntry, options: { cwd: string; env: Env; ms?: number }) => Promise<StartResult>;
export interface FetchOptions
{
    env?: Env;
    runFetch?: RunFetch;
    start?: Start;
    runCli?: RunCli;
    log?: Log;
}
export interface FetchRun
{
    fetched: string[];
    started: string[];
    skipped: string[];
    warnings: string[];
    status: Status[];
}

// A listed project that keeps a .serena folder in its tree: where it is, where it would go, and why it stays - or null when
// it can move.
export interface InTreeFolder
{
    project: string;
    from: string;
    to: string;
    reason: string | null;
}

// What a git call answered: its exit status, its error text and the spawn error, if any
export interface GitAnswer
{
    status: number | null;
    stderr: string;
    error?: Error | undefined;
}
export type GitRunner = (args: string[], cwd: string) => GitAnswer;

// What keepReason reads about the run: the project, the environment, the platform's case rule and the git runner
export interface KeepCheck
{
    project: string;
    env: Env;
    platform?: string;
    run?: GitRunner;
}

// The file operations of a move, replaceable in a test
export interface MoveOps
{
    rename?: (from: string, to: string) => void;
    copy?: (from: string, to: string) => void;
    remove?: (folder: string) => void;
}
