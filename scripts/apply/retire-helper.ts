// The hand-built key helper a repaired registration no longer runs (retire-helper, from helper-foreign). The file is
// removed only when it is there, git does not track it, and no text that could start it names it: the account file, the
// .mcp.json of this project and of each project the account file lists, and Cursor's two files for the same projects. The
// match is on the file's name, so a false hit keeps the file. Read when the step runs, never at plan time. No file's text
// is ever printed.
import fs from 'node:fs';
import path from 'node:path';
import * as account from '../core/account.ts';
import { MCP_JSON } from '../core/constants.ts';
import { errorCode, isRecord } from '../core/guards.ts';
import { parseJson } from '../core/json-file.ts';
import * as cursorMcp from '../cursor/cursor-mcp.ts';
import { runGit, trackedState } from './git-tracked.ts';
import type { RetireHelperStep } from '../plan/types.ts';
import type { ApplyCtx, GitRunner, KeepCheck, StepResult } from './types.ts';

// The projects the account file lists, by their keys: another project's registrations are Claude Code's, read as text only.
function projectKeys(text: string): string[]
{
    try
    {
        const doc: unknown = parseJson(text);
        const projects = isRecord(doc) ? doc['projects'] : undefined;
        return isRecord(projects) ? Object.keys(projects) : [];
    }
    catch { return []; }
}

// A text file's content: '' when it is not there, null when it cannot be read - which keeps the helper file.
function textOf(file: string): string | null
{
    try { return fs.readFileSync(file, 'utf8'); }
    catch (caught) { return errorCode(caught) === 'ENOENT' ? '' : null; }
}

// Where the file system ignores case (macOS and Windows by default), a name in another case is the same file.
const foldsCase = (platform: string): boolean => platform === 'win32' || platform === 'darwin';

// Why the helper file must stay, or null when the apply would remove it: git tracks it or cannot say, or a text that could
// start it names it - or cannot be read. Shared by the detector (helper-foreign-file) and the step, so a file the step
// would keep is never offered. Does not look at whether the file exists.
export function keepReason(file: string, { project, env, platform = process.platform, run = runGit }: KeepCheck): string | null
{
    const tracked = trackedState(file, run);
    if (tracked === 'tracked') return 'tracked by git';
    if (tracked === 'unknown') return 'git could not say whether it is tracked';
    const fold = foldsCase(platform);
    const name = fold ? path.basename(file).toLowerCase() : path.basename(file);
    const accountPath = account.accountFile(env);
    const accountText = textOf(accountPath);
    const projects = [...new Set([project, ...(accountText ? projectKeys(accountText) : [])])];
    const place = { platform: process.platform, home: account.homeDir(env), env };
    const candidates = [
        accountPath,
        cursorMcp.fileFor('global', place),
        ...projects.flatMap((each) => [path.join(each, MCP_JSON), cursorMcp.fileFor('project', { ...place, project: each })]),
    ];
    for (const candidate of candidates)
    {
        const text = candidate === accountPath ? accountText : textOf(candidate);
        if (text === null) return `${candidate} could not be read`;
        if ((fold ? text.toLowerCase() : text).includes(name)) return `${candidate} names it`;
    }
    return null;
}

export function retireHelper(step: RetireHelperStep, context: ApplyCtx, options: { platform?: string; run?: GitRunner } = {}): StepResult
{
    if (!fs.existsSync(step.file)) return { ok: true, detail: `${step.file} is already gone` };
    const kept = keepReason(step.file, { project: context.project, env: context.env, ...options });
    if (kept) return { ok: true, detail: `left ${step.file} - ${kept}` };
    fs.rmSync(step.file);
    return { ok: true, detail: `removed ${step.file}` };
}
