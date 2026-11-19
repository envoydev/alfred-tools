// THE ACCOUNT DIR - one definition, used by every script. The dir is CLAUDE_CONFIG_DIR, else ~/.claude. The account
// file is the one the CLI was MEASURED writing (Claude Code 2.1.311, docs/sources.md): $CLAUDE_CONFIG_DIR/.claude.json,
// else ~/.claude.json. Its `projects` map is keyed by the project's REAL path on macOS and Linux (macOS /tmp is
// /private/tmp), and by the cwd as typed, in `/`, on Windows (projectEntry).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { MCP_JSON } from './constants.ts';
import { parseJson } from './json-file.ts';
import { errorCode, errorMessage, isAccountProject, isRecord, isServerMap } from './guards.ts';
import type { Account, AccountFile, AccountProject, AccountTop, Env, ReadState, ServerEntry } from './types.ts';

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

// A JSON file as a state, never a throw: ok | missing | empty | malformed (| unreadable). `isDoc` checks the fields the
// reader takes: an object that fails it is malformed, as Claude Code itself refuses a file of the wrong shape.
export function readState<Doc>(file: string, isDoc: (value: Record<string, unknown>) => value is Record<string, unknown> & Doc): ReadState<Doc>
{
    let text: string;
    try { text = fs.readFileSync(file, 'utf8'); }
    catch (caught) { const missing = errorCode(caught) === 'ENOENT'; return { file, state: missing ? 'missing' : 'unreadable', doc: null, error: missing ? null : errorMessage(caught) }; }
    if (!text.trim()) return { file, state: 'empty', doc: null, error: null };
    try
    {
        const doc = parseJson(text);
        if (!isRecord(doc)) return { file, state: 'malformed', doc: null, error: 'not a JSON object' };
        if (!isDoc(doc)) return { file, state: 'malformed', doc: null, error: 'a field holds a value of the wrong type' };
        return { file, state: 'ok', doc, error: null };
    }
    catch (caught) { return { file, state: 'malformed', doc: null, error: errorMessage(caught) }; }
}

// The account file's top level this plugin reads: the user servers, and the map of project entries. Each entry is
// checked where it is read - this project's in readAccount - since another project's is Claude Code's alone.
const isAccountTop = (value: Record<string, unknown>): value is Record<string, unknown> & AccountTop => (value['mcpServers'] === undefined || isServerMap(value['mcpServers']))
    && (value['projects'] === undefined || isRecord(value['projects']));

// This project's `projects` entry. Claude Code keys it by the folder it started in, MEASURED (docs/sources.md): the
// real path on macOS (the disk's case, whatever was typed) and Linux; on Windows the cwd as typed, `\` written as `/`,
// the typed case kept. So on win32 the key typed as this cwd wins, then the real path's, then either in any case (NTFS
// opens both); elsewhere a key matches exactly - macOS can be a case-sensitive volume.
export function projectEntry(projects: Record<string, AccountProject>, project: string, platform: string = process.platform): AccountProject | undefined
{
    const key = entryKey(projects, project, platform);
    return key === undefined ? undefined : projects[key];
}
// The key of this project's entry in the `projects` map, by the rule above; undefined when it has none.
function entryKey(projects: Record<string, unknown>, project: string, platform: string): string | undefined
{
    if (platform !== 'win32') return [projectKey(project), path.resolve(project)].find((key) => Boolean(projects[key]));
    let real: string | null = null;
    try { real = fs.realpathSync.native(project); } catch { /* a folder not on disk has no real path */ }
    const want = [path.win32.resolve(project), real].filter((folder): folder is string => Boolean(folder)).map((folder) => folder.replace(/\\/g, '/'));
    return want.find((candidate) => Object.hasOwn(projects, candidate))
        ?? Object.keys(projects).find((projectPath) => want.some((candidate) => candidate.toLowerCase() === projectPath.toLowerCase()));
}

// The account file, narrowed to what the inventory needs: user servers, and this project's local servers - keyed on the
// git root when the project is a folder inside a repository, as the CLI keys them from a subfolder (MEASURED,
// docs/sources.md '.mcp.json in parent folders', M4).
export function readAccount(env: Env, project: string, platform: string = process.platform): Account
{
    const file = accountFile(env);
    const state = readState(file, isAccountTop);
    const top = state.doc || {};
    const entries = top.projects || {};
    const key = entryKey(entries, localRoot(project), platform);
    const entry = key === undefined ? undefined : entries[key];
    // this project's entry in a shape this plugin does not read makes the file unreadable here, as a bad top level does
    if (entry !== undefined && !isAccountProject(entry)) return { file, state: 'malformed', doc: null, error: 'a field holds a value of the wrong type', user: {}, local: {}, projects: {} };
    // another project's entry is passed over unless it has the shape read here: its servers are never this run's
    const projects = Object.fromEntries(Object.entries(entries).filter((pair): pair is [string, AccountProject] => isAccountProject(pair[1])));
    const doc: AccountFile | null = state.doc ? { ...state.doc, projects } : null;
    return { ...state, doc, user: top.mcpServers || {}, local: (entry && entry.mcpServers) || {}, projects };
}

// What the CLI wrote for one server at one scope, read from the file it wrote it to.
export function readRegistration(name: string, scope: string, project: string, env: Env): ServerEntry | undefined
{
    if (scope === 'project')
    {
        const state = readState(path.join(project, MCP_JSON), isAccountProject);
        return state.doc && state.doc.mcpServers ? state.doc.mcpServers[name] : undefined;
    }
    const account = readAccount(env, project);
    return (scope === 'user' ? account.user : account.local)[name];
}

