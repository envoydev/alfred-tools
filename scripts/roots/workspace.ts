// A WORKSPACE, AS ALFRED-CODE RECORDS IT (spec D4a, 0.5.0). Cursor never reads a parent folder's .cursor/mcp.json (F12),
// so the project servers of a workspace folder are written into each member's file below it. Which folders form a
// workspace is alfred-code's to say (ruling 10): this reads its record, read-only, the way alfred-code's own reader does
// (stack/hooks/workspace-file.js) - `<folder>/.alfred/workspace.json`, and the old line file `<folder>/.alfred/workspace`
// beside or instead of it. With alfred-code absent there is no record, and no workspace. Nothing here is ever written.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ALFRED_DATA } from '../core/constants.ts';
import { errorCode, isRecord } from '../core/guards.ts';
import { isInside } from '../entries/platform.ts';
import type { Env } from '../core/types.ts';
import type { LineEntry, RawRecord, RecordRead, Role, Workspace, WorkspaceJson, WorkspaceRecord } from './types.ts';

const JSON_NAME = 'workspace.json';
const LEGACY_NAME = 'workspace';
const PARENT_RE = /^\.\.(\/\.\.)*$/;
const isRole = (value: unknown): value is Role => value === 'root' || value === 'standalone';
const isPath = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

// One line of the old file: the keyword, whitespace, then the value with its inner whitespace kept (alfred-code's
// parseLine). -> { kind, value? }
function parseLine(raw: string): LineEntry
{
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return { kind: 'skip' };
    // a line that is not blank has a first word
    const [word = ''] = line.split(/\s+/);
    const value = line.slice(word.length).replace(/^\s+/, '');
    if (word === 'parent' && value === 'none') return { kind: 'parent-none' };
    if (word === 'parent' && PARENT_RE.test(value)) return { kind: 'parent', value };
    if (word === 'role' && isRole(value)) return { kind: 'role', value };
    if (word === 'child' && isPath(value)) return { kind: 'child', value };
    return { kind: 'skip' };
}

// The old line file's text as a record: a BOM dropped, CRLF as LF, a duplicate keeping its first spelling.
export function parseLegacy(text: unknown): RawRecord
{
    const record: RawRecord = { parent: null, role: null, children: [], ignoredChildren: [] };
    let parentSeen = false;
    for (const raw of String(text).replace(/^﻿/, '').split(/\r?\n/))
    {
        const entry = parseLine(raw);
        if (entry.kind === 'parent' || entry.kind === 'parent-none')
        {
            if (parentSeen) continue;
            parentSeen = true;
            if (entry.kind === 'parent') record.parent = entry.value;
            else record.role = record.role || 'standalone';
        }
        else if (entry.kind === 'role') { if (!record.role) record.role = entry.value; }
        else if (entry.kind === 'child' && !record.children.includes(entry.value)) record.children.push(entry.value);
    }
    return record;
}

function fromObject(workspaceJson: WorkspaceJson): RawRecord
{
    const list = (value: unknown): string[] => (Array.isArray(value) ? [...new Set(value.filter(isPath))] : []);
    return {
        parent: typeof workspaceJson.parent === 'string' && PARENT_RE.test(workspaceJson.parent) ? workspaceJson.parent : null,
        role: isRole(workspaceJson.role) ? workspaceJson.role : null,
        children: list(workspaceJson.children),
        ignoredChildren: list(workspaceJson.ignoredChildren),
    };
}

const readText = (file: string): { text?: string; missing?: boolean; error?: string | undefined } =>
{
    try { return { text: fs.readFileSync(file, 'utf8') }; }
    catch (caught) { const code = errorCode(caught); return code === 'ENOENT' || code === 'ENOTDIR' ? { missing: true } : { error: code }; }
};

// A record holding both reads parent, as alfred-code's reader does.
const finish = (record: RawRecord): RawRecord => (record.parent ? { ...record, role: null } : record);
const shape = (record: RawRecord): WorkspaceRecord => { const out: WorkspaceRecord = { children: record.children, ignoredChildren: record.ignoredChildren }; if (record.parent) out.parent = record.parent; if (record.role) out.role = record.role; return out; };

// -> { parent?, role?, children, ignoredChildren } | { error, file } | null (no record)
export function readRecord(folder: string): RecordRead | null
{
    const jsonFile = path.join(folder, ALFRED_DATA, JSON_NAME);
    const legacyFile = path.join(folder, ALFRED_DATA, LEGACY_NAME);
    const json = readText(jsonFile);
    const legacy = readText(legacyFile);
    if (json.error) return { error: `cannot be read (${json.error})`, file: jsonFile };
    if (json.text !== undefined)
    {
        const body = json.text.replace(/^﻿/, '');
        let parsed: WorkspaceJson = {};
        if (body.trim() !== '')
        {
            let doc: unknown;
            try { doc = JSON.parse(body); } catch { return { error: 'not JSON', file: jsonFile }; }
            if (!isRecord(doc)) return { error: 'not JSON', file: jsonFile };
            parsed = doc;
        }
        const record = fromObject(parsed);
        if (legacy.text !== undefined)
        {
            const old = parseLegacy(legacy.text);
            record.parent = record.parent || old.parent;
            record.role = record.role || old.role;
            for (const child of old.children) if (!record.children.includes(child)) record.children.push(child);
        }
        return shape(finish(record));
    }
    if (legacy.missing) return null;
    if (legacy.error || legacy.text === undefined) return { error: `cannot be read (${legacy.error})`, file: legacyFile };
    return shape(finish(parseLegacy(legacy.text)));
}

const NONE = (notes: string[] = []): Workspace => ({ root: null, members: [], ancestors: [], notes });
const inside = (child: string, root: string): boolean => isInside(path, root, child, { orSame: false });
const at = (folder: string, relativePath: string): string => path.resolve(folder, relativePath.replace(/\\/g, '/'));
// alfred-code's own rule (stack/hooks/docs.js dataRoot): an absolute ALFRED_CODE_DATA_PATH moves its data folder away
const movedData = (env: Env | null | undefined): boolean => /^(?:\/|[A-Za-z]:[\\/])/.test(String((env || {}).ALFRED_CODE_DATA_PATH || '').trim());

function anyRecordAbove(folder: string): boolean
{
    for (let dir = folder; ; dir = path.dirname(dir))
    {
        if ([JSON_NAME, LEGACY_NAME].some((fileName) => fs.existsSync(path.join(dir, ALFRED_DATA, fileName)))) return true;
        if (path.dirname(dir) === dir) return false;
    }
}

// The workspace a project is in. -> { root, members, ancestors (nearest first, root last), notes }
export function workspaceOf(project: string, env: Env = process.env): Workspace
{
    const start = path.resolve(project);
    if (movedData(env)) return NONE(anyRecordAbove(start) ? ['alfred-code\'s data is moved by ALFRED_CODE_DATA_PATH - its workspace record is not read'] : []);

    // up: parent by parent to the folder whose role is root
    const chain = [];
    const seen = new Set();
    let found: string | null = null;
    for (let folder = start; ;)
    {
        if (seen.has(folder)) return NONE();
        seen.add(folder);
        const record = readRecord(folder);
        if (!record) return NONE();
        if (record.error) return NONE([`${record.file} is not JSON - read as no workspace`]);
        if (record.parent) { chain.push(folder); folder = at(folder, record.parent); continue; }
        if (record.role === 'root') { found = folder; break; }
        if (record.role === 'standalone') return NONE([`${folder} is standalone`]);
        return NONE();
    }
    // the loop leaves only by its break, with the root found
    const root = found;
    if (root === null) return NONE();

    // down: each child its parent lists whose own record names that parent, and that no ignoredChildren above names
    const notes: string[] = [];
    const members: string[] = [];
    const visited = new Set([root]);
    const walk = (folder: string, ignored: string[]): void =>
    {
        const record = readRecord(folder);
        if (!record || record.error) return;
        const ignores = [...ignored, ...(record.ignoredChildren || []).map((childPath) => at(folder, childPath))];
        for (const childPath of record.children || [])
        {
            const child = at(folder, childPath);
            if (visited.has(child)) { notes.push(`${child} is listed twice in the workspace - read once`); continue; }
            if (!inside(child, root)) { notes.push(`${child} is listed as a child of ${folder} but lies outside the workspace root ${root} - not a member`); continue; }
            visited.add(child);
            if (ignores.some((ignoredFolder) => child === ignoredFolder || inside(child, ignoredFolder))) continue;
            if (!fs.existsSync(child)) { notes.push(`${child} is listed as a child of ${folder} but is missing - skipped`); continue; }
            const own = readRecord(child);
            if (!own || own.error || !own.parent || at(child, own.parent) !== folder) continue;
            members.push(child);
            walk(child, ignores);
        }
    };
    walk(root, []);
    if (start !== root && !members.includes(start)) return NONE();
    const ancestors = chain.slice(1).concat(start === root ? [] : [root]);
    return { root, members, ancestors, notes };
}

// The folders below `folder` in the workspace, and for each its folders above, nearest first, root last.
export function membersBelow(workspace: Workspace, folder: string): { folder: string; ancestors: string[] }[]
{
    const base = path.resolve(folder);
    return workspace.members.filter((member) => inside(member, base)).map((member) =>
    {
        const above: string[] = [];
        for (let dir = path.dirname(member); ; dir = path.dirname(dir))
        {
            if (dir === workspace.root || workspace.members.includes(dir)) above.push(dir);
            if (dir === workspace.root || path.dirname(dir) === dir) break;
        }
        return { folder: member, ancestors: above };
    });
}

// The git top-level folder of `dir`, real path, or null (no git, not a repo).
export function gitTop(dir: string): string | null
{
    const result = spawnSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', windowsHide: true });
    if (result.error || result.status !== 0) return null;
    try { return fs.realpathSync(result.stdout.trim()); } catch { return null; }
}

