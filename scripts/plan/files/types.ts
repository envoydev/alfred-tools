// The files the commands write between their steps and hand to plan.ts: the picks file (--questions), the answer file of
// one step (step.json) and the answers file. They cross a JSON boundary between the commands' steps (stored - do not
// rename).
import type { Family, RootAnswer } from '../../roots/types.ts';

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
    clients?: string[]; // stored - do not rename
    skipped?: string[]; // stored - do not rename
    recorded?: Record<string, RecordedStep>; // stored - do not rename
}
// What --record wrote for one step: its pick, and the key paths in picks.json and answers.json, e.g.
// ['routes', 'gitlab'] and ['picks', 'gitlab', 'route'].
export interface RecordedStep
{
    tool: string | null; // stored - do not rename
    picks: string[][]; // stored - do not rename
    answers: string[][]; // stored - do not rename
}
// One answer in step.json: a label as shown (its ' (Recommended)' optional), a label with the value typed next, or the
// text the user typed as 'Other'.
export type StepAnswer = string | { label: string; typed: string | string[] | Record<string, string> } | { other: string };
export interface StepFile
{
    id: string; // stored - do not rename
    answers: Record<string, StepAnswer>; // stored - do not rename
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
// One tool's answers: an install pick, or a configure change (with its row, for prereq.ts).
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
    exclude?: boolean | undefined; // stored - do not rename
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
