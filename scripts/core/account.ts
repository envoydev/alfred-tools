// THE ACCOUNT DIR - one definition, used by every script. The dir is CLAUDE_CONFIG_DIR, else ~/.claude. The account
// file is the one the CLI was MEASURED writing (Claude Code 2.1.311, docs/sources.md): $CLAUDE_CONFIG_DIR/.claude.json,
// else ~/.claude.json. Its `projects` map is keyed by the project's REAL path on macOS and Linux (macOS /tmp is
// /private/tmp), and by the cwd as typed, in `/`, on Windows (projectEntry).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseJson } from './json-file.ts';
import type { Account, AccountFile, AccountProject, Env, ReadState, ServerEntry } from './types.ts';

export const homeDir = (env: Env = process.env): string => env.HOME || env.USERPROFILE || os.homedir();
export const configDir = (env: Env = process.env): string => (env.CLAUDE_CONFIG_DIR ? path.resolve(env.CLAUDE_CONFIG_DIR) : path.join(homeDir(env), '.claude'));
export const accountFile = (env: Env = process.env): string => (env.CLAUDE_CONFIG_DIR ? path.join(path.resolve(env.CLAUDE_CONFIG_DIR), '.claude.json') : path.join(homeDir(env), '.claude.json'));

export function projectKey(dir: string): string
{
    try { return fs.realpathSync.native(dir); }
    catch { return path.resolve(dir); }
}

// The folder Claude Code keys a session's trust and local servers on: the git repository root when the folder is inside
// one, else the folder itself (https://code.claude.com/docs/en/permissions, 'Project allow rules and workspace trust';
// the local key MEASURED, M4). `git rev-parse` runs only when the folder holds no `.git` of its own; no git, or not a
// repository: the folder.
export function localRoot(project: string): string
{
    if (fs.existsSync(path.join(project, '.git')) || !fs.existsSync(project)) return project;
    const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: project, encoding: 'utf8', windowsHide: true });
    return result.status === 0 && result.stdout.trim() ? path.resolve(result.stdout.trim()) : project;
}

// `~` and `~/x` to the home directory (the script expands it; the server never sees a `~`).
export function expandHome(inputPath: string, env: Env = process.env): string
{
    if (inputPath === '~') return homeDir(env);
    if (/^~[\\/]/.test(inputPath)) return path.join(homeDir(env), inputPath.slice(2));
    return inputPath;
}

// A JSON file as a state, never a throw: ok | missing | empty | malformed (| unreadable).
export function readState<Doc = Record<string, unknown>>(file: string): ReadState<Doc>
{
    let text: string;
    try { text = fs.readFileSync(file, 'utf8'); }
    catch (caught) { const err = caught as NodeJS.ErrnoException; return { file, state: err.code === 'ENOENT' ? 'missing' : 'unreadable', doc: null, error: err.code === 'ENOENT' ? null : err.message }; }
    if (!text.trim()) return { file, state: 'empty', doc: null, error: null };
    try
    {
        const doc = parseJson(text);
        if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return { file, state: 'malformed', doc: null, error: 'not a JSON object' };
        return { file, state: 'ok', doc: doc as Doc, error: null };
    }
    catch (err) { return { file, state: 'malformed', doc: null, error: (err as Error).message }; }
}

// This project's `projects` entry. Claude Code keys it by the folder it started in, MEASURED (docs/sources.md): the
// real path on macOS (the disk's case, whatever was typed) and Linux; on Windows the cwd as typed, `\` written as `/`,
// the typed case kept. So on win32 the key typed as this cwd wins, then the real path's, then either in any case (NTFS
// opens both); elsewhere a key matches exactly - macOS can be a case-sensitive volume.
export function projectEntry(projects: Record<string, AccountProject>, project: string, platform: string = process.platform): AccountProject | undefined
{
    if (platform !== 'win32') return projects[projectKey(project)] || projects[path.resolve(project)];
    let real: string | null = null;
    try { real = fs.realpathSync.native(project); } catch { /* a folder not on disk has no real path */ }
    const want = ([path.win32.resolve(project), real].filter(Boolean) as string[]).map((folder) => folder.replace(/\\/g, '/'));
    const key = want.find((candidate) => Object.hasOwn(projects, candidate))
        ?? Object.keys(projects).find((projectPath) => want.some((candidate) => candidate.toLowerCase() === projectPath.toLowerCase()));
    return key === undefined ? undefined : projects[key];
}

// The account file, narrowed to what the inventory needs: user servers, and this project's local servers - keyed on the
// git root when the project is a folder inside a repository, as the CLI keys them from a subfolder (MEASURED,
// docs/sources.md '.mcp.json in parent folders', M4).
export function readAccount(env: Env, project: string, platform: string = process.platform): Account
{
    const file = accountFile(env);
    const state = readState<AccountFile>(file);
    const doc: AccountFile = state.doc || {};
    const projects = doc.projects && typeof doc.projects === 'object' ? doc.projects : {};
    const mine = projectEntry(projects, localRoot(project), platform) || {};
    return { ...state, user: doc.mcpServers || {}, local: mine.mcpServers || {}, projects };
}

// What the CLI wrote for one server at one scope, read from the file it wrote it to.
export function readRegistration(name: string, scope: string, project: string, env: Env): ServerEntry | undefined
{
    if (scope === 'project')
    {
        const state = readState<AccountProject>(path.join(project, '.mcp.json'));
        return state.doc && state.doc.mcpServers ? state.doc.mcpServers[name] : undefined;
    }
    const account = readAccount(env, project);
    return (scope === 'user' ? account.user : account.local)[name];
}

