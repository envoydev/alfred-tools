// The asks and the --questions output: each question as AskUserQuestion takes it, what --questions prints for every tool
// and target, the walk's step, and the record modes' state. The output crosses a JSON boundary to the commands (stored -
// do not rename).
import type { Env } from '../../core/types.ts';
import type { Answers, LocationAnswer, Picks, StepFile } from '../files/types.ts';

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
// What a hosted route's tools question answers for a label: the fixed settings to send, and `toolsets: true` where the
// toolsets are typed next.
export type HostedSettingsAnswer = Record<string, string | true>;
// A question with what each label answers.
export interface Asked<Value = unknown>
{
    question: Question; // stored - do not rename
    answers: Record<string, Value>; // stored - do not rename
}

// ---- the record modes (--record, --rewind, --skip) ----------------------------------------------------------------------

export interface Refusal
{
    refused: string;
}
export type RecordResult = { picks: Picks; answers: Answers } | Refusal;
// What recordStep reads: the step to answer (as --questions builds it), what built it, the files, and step.json.
export interface RecordInput
{
    step: WalkStep;
    built: Questions;
    picks: Picks;
    answers: Answers;
    chosen: StepFile;
}
// A typed value after its shape is checked: a string, or an object of NAME: value strings.
export type Typed = string | Record<string, string>;
export type TypedKind = 'text' | 'pairs' | 'toolsets';
// An answer of step.json resolved to its option: the label, its place among the options, what `step.answers` holds for
// it, and the typed value or the 'Other' text.
export interface Resolved
{
    label: string;
    index: number;
    value: unknown;
    hasValue: boolean;
    typed: Typed | undefined;
    other: string | undefined;
}
// The state of one recordStep call: the cloned files, who the step is for, and the key paths written so far.
export interface Run
{
    step: WalkStep;
    built: Questions;
    key: string | null;
    configure: boolean;
    skipped: boolean;
    target: ToolBlock | undefined;
    picks: Picks;
    answers: Answers;
    wrotePicks: string[][];
    wroteAnswers: string[][];
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
    settings?: Record<string, Asked<string | HostedSettingsAnswer>>; // stored - do not rename
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

export type PlanMode = 'plan' | 'questions' | 'record' | 'rewind' | 'skip';
export interface PlanArgs
{
    mode: PlanMode;
    files: string[];
    pick: string | null;
    data: string | null;
    connectors: string | null;
    out: string | null;
    error: string | null;
}
// What --questions prints: every question the run can ask, and the walk's one step to ask now.
export type WalkOutput = Questions & { next: WalkStep };
// The flags --questions, --record and --rewind share: the plugin's data folder (the roots map) and the claude.ai connectors.
export interface WalkFlags
{
    data: string | null;
    connectors: string | null;
}
export type WalkStopped = { waits: string };
// A JSON object a mode read from one of its files, or the refusal that file earned.
export type FileRead = { value: Record<string, unknown> } | { refused: string };
