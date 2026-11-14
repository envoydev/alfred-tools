// A WORKSPACE, AS ALFRED-CODE RECORDS IT (spec D4a, 0.5.0). Cursor never reads a parent folder's .cursor/mcp.json (F12),
// so the project servers of a workspace folder are written into each member's file below it. Which folders form a
// workspace is alfred-code's to say (ruling 10): this reads its record, read-only, the way alfred-code's own reader does
// (stack/hooks/workspace-file.js) - `<folder>/.alfred/workspace.json`, and the old line file `<folder>/.alfred/workspace`
// beside or instead of it. With alfred-code absent there is no record, and no workspace. Nothing here is ever written.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Env } from '../core/types.ts';
import type { RecordRead, Role, Workspace, WorkspaceRecord } from './types.ts';

// The record while it is read: every field present.
type RawRecord = { parent: string | null; role: Role | null; children: string[]; ignoredChildren: string[] };
type LineEntry = { kind: 'skip' } | { kind: 'parent-none' } | { kind: 'parent' | 'child'; value: string } | { kind: 'role'; value: Role };
type WorkspaceJson = { parent?: unknown; role?: unknown; children?: unknown; ignoredChildren?: unknown };

const DATA = '.alfred';
const JSON_NAME = 'workspace.json';
const LEGACY_NAME = 'workspace';
const PARENT_RE = /^\.\.(\/\.\.)*$/;
const isRole = (v: unknown): v is Role => v === 'root' || v === 'standalone';
const isPlainObject = (v: unknown): boolean => v !== null && typeof v === 'object' && !Array.isArray(v);
const isPath = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

// One line of the old file: the keyword, whitespace, then the value with its inner whitespace kept (alfred-code's
// parseLine). -> { kind, value? }
function parseLine(raw: string): LineEntry
{
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return { kind: 'skip' };
    const [word] = line.split(/\s+/);
    const value = line.slice(word!.length).replace(/^\s+/, '');
    if (word === 'parent' && value === 'none') return { kind: 'parent-none' };
    if (word === 'parent' && PARENT_RE.test(value)) return { kind: 'parent', value };
    if (word === 'role' && isRole(value)) return { kind: 'role', value };
    if (word === 'child' && isPath(value)) return { kind: 'child', value };
    return { kind: 'skip' };
}

// The old line file's text as a record: a BOM dropped, CRLF as LF, a duplicate keeping its first spelling.
export function parseLegacy(text: unknown): RawRecord
{
    const rec: RawRecord = { parent: null, role: null, children: [], ignoredChildren: [] };
    let parentSeen = false;
    for (const raw of String(text).replace(/^﻿/, '').split(/\r?\n/))
    {
        const e = parseLine(raw);
        if (e.kind === 'parent' || e.kind === 'parent-none')
        {
            if (parentSeen) continue;
            parentSeen = true;
            if (e.kind === 'parent') rec.parent = e.value;
            else rec.role = rec.role || 'standalone';
        }
        else if (e.kind === 'role') { if (!rec.role) rec.role = e.value; }
        else if (e.kind === 'child' && !rec.children.includes(e.value)) rec.children.push(e.value);
    }
    return rec;
}

function fromObject(obj: WorkspaceJson): RawRecord
{
    const list = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter(isPath))] : []);
    return {
        parent: typeof obj.parent === 'string' && PARENT_RE.test(obj.parent) ? obj.parent : null,
        role: isRole(obj.role) ? obj.role : null,
        children: list(obj.children),
        ignoredChildren: list(obj.ignoredChildren),
    };
}

const readText = (file: string): { text?: string; missing?: boolean; error?: string | undefined } =>
{
    try { return { text: fs.readFileSync(file, 'utf8') }; }
    catch (caught) { const e = caught as NodeJS.ErrnoException; return e.code === 'ENOENT' || e.code === 'ENOTDIR' ? { missing: true } : { error: e.code }; }
};

// A record holding both reads parent, as alfred-code's reader does.
const finish = (rec: RawRecord): RawRecord => (rec.parent ? { ...rec, role: null } : rec);
const shape = (rec: RawRecord): WorkspaceRecord => { const out: WorkspaceRecord = { children: rec.children, ignoredChildren: rec.ignoredChildren }; if (rec.parent) out.parent = rec.parent; if (rec.role) out.role = rec.role; return out; };

// -> { parent?, role?, children, ignoredChildren } | { error, file } | null (no record)
export function readRecord(folder: string): RecordRead | null
{
    const jsonFile = path.join(folder, DATA, JSON_NAME);
    const legacyFile = path.join(folder, DATA, LEGACY_NAME);
    const json = readText(jsonFile);
    const legacy = readText(legacyFile);
    if (json.error) return { error: `cannot be read (${json.error})`, file: jsonFile };
    if (!json.missing)
    {
        const body = json.text!.replace(/^﻿/, '');
        let parsed: WorkspaceJson = {};
        if (body.trim() !== '')
        {
            try { parsed = JSON.parse(body) as WorkspaceJson; } catch { return { error: 'not JSON', file: jsonFile }; }
            if (!isPlainObject(parsed)) return { error: 'not JSON', file: jsonFile };
        }
        const rec = fromObject(parsed);
        if (legacy.text !== undefined)
        {
            const old = parseLegacy(legacy.text);
            rec.parent = rec.parent || old.parent;
            rec.role = rec.role || old.role;
            for (const c of old.children) if (!rec.children.includes(c)) rec.children.push(c);
        }
        return shape(finish(rec));
    }
    if (legacy.missing) return null;
    if (legacy.error) return { error: `cannot be read (${legacy.error})`, file: legacyFile };
    return shape(finish(parseLegacy(legacy.text!)));
}

const NONE = (notes: string[] = []): Workspace => ({ root: null, members: [], ancestors: [], notes });
const inside = (child: string, root: string): boolean => { const rel = path.relative(root, child); return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel); };
const at = (folder: string, rel: string): string => path.resolve(folder, rel.replace(/\\/g, '/'));
// alfred-code's own rule (stack/hooks/docs.js dataRoot): an absolute ALFRED_CODE_DATA_PATH moves its data folder away
const movedData = (env: Env | null | undefined): boolean => /^(?:\/|[A-Za-z]:[\\/])/.test(String((env || {}).ALFRED_CODE_DATA_PATH || '').trim());

function anyRecordAbove(folder: string): boolean
{
    for (let dir = folder; ; dir = path.dirname(dir))
    {
        if ([JSON_NAME, LEGACY_NAME].some((n) => fs.existsSync(path.join(dir, DATA, n)))) return true;
        if (path.dirname(dir) === dir) return false;
    }
}

// The workspace a project is in. -> { root, members, ancestors (nearest first, root last), notes }
export function of(project: string, env: Env = process.env): Workspace
{
    const start = path.resolve(project);
    if (movedData(env)) return NONE(anyRecordAbove(start) ? ['alfred-code\'s data is moved by ALFRED_CODE_DATA_PATH - its workspace record is not read'] : []);

    // up: parent by parent to the folder whose role is root
    const chain = [];
    const seen = new Set();
    let root: string | null = null;
    for (let folder = start; ;)
    {
        if (seen.has(folder)) return NONE();
        seen.add(folder);
        const rec = readRecord(folder);
        if (!rec) return NONE();
        if (rec.error) return NONE([`${rec.file} is not JSON - read as no workspace`]);
        if (rec.parent) { chain.push(folder); folder = at(folder, rec.parent); continue; }
        if (rec.role === 'root') { root = folder; break; }
        if (rec.role === 'standalone') return NONE([`${folder} is standalone`]);
        return NONE();
    }

    // down: each child its parent lists whose own record names that parent, and that no ignoredChildren above names
    const notes: string[] = [];
    const members: string[] = [];
    const visited = new Set([root]);
    const walk = (folder: string, ignored: string[]): void =>
    {
        const rec = readRecord(folder);
        if (!rec || rec.error) return;
        const ignores = [...ignored, ...(rec.ignoredChildren || []).map((c) => at(folder, c))];
        for (const c of rec.children || [])
        {
            const child = at(folder, c);
            if (visited.has(child)) { notes.push(`${child} is listed twice in the workspace - read once`); continue; }
            if (!inside(child, root!)) { notes.push(`${child} is listed as a child of ${folder} but lies outside the workspace root ${root} - not a member`); continue; }
            visited.add(child);
            if (ignores.some((i) => child === i || inside(child, i))) continue;
            if (!fs.existsSync(child)) { notes.push(`${child} is listed as a child of ${folder} but is missing - skipped`); continue; }
            const own = readRecord(child);
            if (!own || own.error || !own.parent || at(child, own.parent) !== folder) continue;
            members.push(child);
            walk(child, ignores);
        }
    };
    walk(root!, []);
    if (start !== root && !members.includes(start)) return NONE();
    const ancestors = chain.slice(1).concat(start === root ? [] : [root!]);
    return { root, members, ancestors, notes };
}

// The folders below `folder` in the workspace, and for each its folders above, nearest first, root last.
export function below(ws: Workspace, folder: string): { folder: string; ancestors: string[] }[]
{
    const base = path.resolve(folder);
    return ws.members.filter((m) => inside(m, base)).map((m) =>
    {
        const above: string[] = [];
        for (let dir = path.dirname(m); ; dir = path.dirname(dir))
        {
            if (dir === ws.root || ws.members.includes(dir)) above.push(dir);
            if (dir === ws.root || path.dirname(dir) === dir) break;
        }
        return { folder: m, ancestors: above };
    });
}

// The git top-level folder of `dir`, real path, or null (no git, not a repo).
export function gitTop(dir: string): string | null
{
    const r = spawnSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    if (r.error || r.status !== 0) return null;
    try { return fs.realpathSync(r.stdout.trim()); } catch { return null; }
}

