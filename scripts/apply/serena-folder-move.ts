// serena's in-project .serena folders (issue 4): which of the listed projects can have theirs moved to serena's home, and the
// move. serena finds a project from its own folder by `.serena/project.yml` or `.git`, so a project with no `.git` keeps
// its folder; so does a project where git tracks a file under it, and one whose destination is taken.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { errorCode, errorMessage } from '../core/guards.ts';
import { pathApiOf } from '../entries/platform.ts';
import { projectsOf } from './serena-projects.ts';
import type { SerenaFolderMoveStep } from '../plan/types.ts';
import type { InTreeFolder, MoveOps, StepResult } from './types.ts';

export const SERENA_FOLDER = '.serena';
export const PROJECTS_FOLDER = 'projects';

const isFolder = (folder: string): boolean => { try { return fs.statSync(folder).isDirectory(); } catch { return false; } };
const exists = (target: string): boolean => { try { fs.lstatSync(target); return true; } catch { return false; } };

// The folder a project's .serena goes to: <home>/projects/<the project's folder name>
export function destinationOf(project: string, home: string): string
{
    const name = project.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() ?? '';
    return pathApiOf(home).join(home, PROJECTS_FOLDER, name);
}

// Why a project's folder stays where it is, or null: the project holds no .git, the destination exists, git tracks a file
// under the folder or could not be asked.
export function stayReason(project: string, from: string, to: string): string | null
{
    if (!exists(pathApiOf(project).join(project, '.git'))) return 'the project has no .git, so serena would lose the project';
    if (exists(to)) return `${to} is there already`;
    const listed = spawnSync('git', ['-C', project, 'ls-files', '--', SERENA_FOLDER], { encoding: 'utf8', windowsHide: true });
    if (listed.error || listed.status !== 0) return `git could not list ${from}`;
    return listed.stdout.trim() ? `git tracks files under ${from}` : null;
}

// Each project the config lists that keeps a .serena folder in its tree, with the reason it stays, if it does.
export function inTreeFolders(file: string, home: string): InTreeFolder[]
{
    const taken = new Set<string>();
    const out: InTreeFolder[] = [];
    for (const project of projectsOf(file))
    {
        const from = pathApiOf(project).join(project, SERENA_FOLDER);
        if (!isFolder(from)) continue;
        const to = destinationOf(project, home);
        const reason = stayReason(project, from, to) ?? (taken.has(to) ? `another project moves to ${to}` : null);
        if (reason === null) taken.add(to);
        out.push({ project, from, to, reason });
    }
    return out;
}

// -> one line for each listed project whose .serena folder stays in its tree, with the reason; the ones that can move are
// moved by their own serena-folder-move step and named there
export function inTreeLines(file: string, home: string): string[]
{
    return inTreeFolders(file, home).flatMap((folder) => (folder.reason === null ? [] : [`serena keeps using ${folder.from} - ${folder.reason}`]));
}

// A copy that takes nothing already at the destination: `force: false` is what makes `errorOnExist` hold
const copyWhole = (from: string, to: string): void => fs.cpSync(from, to, { recursive: true, force: false, errorOnExist: true });
const removeWhole = (folder: string): void => fs.rmSync(folder, { recursive: true, force: true });

// The rename, or - across devices - a copy and the removal of the source. A partial copy is removed when the copy fails, never
// what was at the destination before. -> null when the folder moved, else the error code of a source that could not be
// removed after a whole copy.
export function moveFolder(from: string, to: string, { rename = fs.renameSync, copy = copyWhole, remove = removeWhole }: MoveOps = {}): string | null
{
    fs.mkdirSync(pathApiOf(to).dirname(to), { recursive: true });
    try { rename(from, to); return null; }
    catch (caught)
    {
        if (errorCode(caught) !== 'EXDEV') throw caught;
    }
    const existed = exists(to);
    try { copy(from, to); }
    catch (copyFailure)
    {
        if (!existed) remove(to);
        throw copyFailure;
    }
    try { remove(from); }
    catch (removeFailure) { return errorCode(removeFailure) ?? errorMessage(removeFailure); }
    return null;
}

// The step: the checks again, then the move. Any failure leaves the folder and goes on (ok: true), so the rest of the update runs.
export function serenaFolderMove(step: SerenaFolderMoveStep, ops: MoveOps = {}): StepResult
{
    if (!isFolder(step.from)) return { ok: true, detail: `left ${step.from} - it is not a folder any more` };
    const reason = stayReason(step.project, step.from, step.to);
    if (reason) return { ok: true, detail: `left ${step.from} - ${reason}` };
    let stuck: string | null;
    try { stuck = moveFolder(step.from, step.to, ops); }
    catch (caught) { return { ok: true, detail: `left ${step.from} - ${errorCode(caught) ?? errorMessage(caught)}` }; }
    if (stuck !== null) return { ok: true, detail: `copied to ${step.to}; ${step.from} could not be removed - ${stuck}: remove it by hand once serena is stopped` };
    return { ok: true, detail: `moved ${step.from} to ${step.to} - restart Claude Code so serena reads the moved folder` };
}
