// THE RENAME (spec D3) - this plugin was preferred-tools until 0.4.0, and its default root folders were
// `<project>/.preferred-tools` and `~/.preferred-tools`. root-repoint points a managed server that still names a moved
// root at `.alfred-tools`: its Claude Code entry through the registration pass, its list entry and Cursor's copy through
// the repair tail. A registration the user owns is never touched.
import fs from 'node:fs';
import path from 'node:path';
import * as roots from '../roots/roots.ts';
import * as cursorMcp from '../cursor/cursor-mcp.ts';
import { deepEqual } from '../core/json-file.ts';
import { pathFor } from '../entries/platform.ts';
import * as C from './common.ts';
import type { ServerEntry } from '../core/types.ts';
import type { Machine } from '../entries/types.ts';
import type { RootsMap } from '../roots/types.ts';
import type { Finding, FixCtx, MachineFixResult, MovedRoot } from './types.ts';

// The plugin under its former name: its uninstall is offered beside the move (spec D5), never held back by it.
export const OLD_PLUGIN_ID = 'preferred-tools@envoydev';

// While a folder move or a re-point is fixable, it is the only thing offered (spec D3): every other finding's paths are
// about to change. The former plugin's uninstall stays, and so does what is shown but never applied.
export const gates = (finding: Finding): boolean => !finding.blocked && ((finding.id === 'root-move' && finding.name !== 'data') || finding.id === 'root-repoint');
export const passesGate = (finding: Finding): boolean => finding.id === 'root-move' || finding.id === 'root-repoint' || (finding.id === 'retired-plugin' && finding.name === OLD_PLUGIN_ID);

export const machineOf = (context: FixCtx): Machine => ({ platform: context.platform, project: context.inventory.project, home: context.home });

const isDir = (dir: string): boolean => { try { return fs.lstatSync(dir).isDirectory(); } catch { return false; } };

// Each default root whose `.alfred-tools` exists while its `.preferred-tools` is gone or holds no root files - moved.
export function movedRoots(context: FixCtx): MovedRoot[]
{
    const pathApi = pathFor(context.platform);
    const out: MovedRoot[] = [];
    for (const base of [...new Set([context.inventory.project, context.home])])
    {
        const from = pathApi.join(base, roots.FORMER_ROOT_NAME);
        const to = pathApi.join(base, roots.ROOT_NAME);
        if (isDir(to) && (!fs.existsSync(from) || !roots.holdsRootFiles(from))) out.push({ from, to });
    }
    return out;
}

// Where the token that ends at `end` starts in `text`. A command line (`headersHelper`) splits at spaces outside quotes;
// a single value is one token, or the part after a flag's `=`.
function tokenStarts(text: string, end: number, commandLine: boolean): number[]
{
    if (!commandLine)
    {
        const eq = text.lastIndexOf('=', end);
        return eq >= 0 ? [0, eq + 1] : [0];
    }
    let quote: string | null = null;
    let quoteStart = -1;
    let wordStart = 0;
    for (let at = 0; at < end; at++)
    {
        const character = text[at]!;
        if (quote) { if (character === quote) quote = null; continue; }
        if (character === "'" || character === '"') { quote = character; quoteStart = at; continue; }
        if (/\s/.test(character)) wordStart = at + 1;
    }
    return [quote ? quoteStart + 1 : wordStart];
}

// `text` with each `.preferred-tools` segment that resolves to a moved root replaced by `.alfred-tools`, in place: the
// written form kept (absolute, `~`, `${HOME}`, quotes), and on Windows matched whatever its case or separators.
function repointText(text: string, moved: MovedRoot[], machine: Machine, commandLine: boolean): string
{
    const win = machine.platform === 'win32';
    const pathApi = pathFor(machine.platform);
    const norm = (file: string) => { const normal = pathApi.normalize(file).replace(/[\\/]+$/, ''); return win ? normal.toLowerCase() : normal; };
    const froms = new Set(moved.map((root) => norm(root.from)));
    const segment = new RegExp(`${roots.FORMER_ROOT_NAME.replace('.', '\\.')}(?=[\\\\/'"\\s]|$)`, win ? 'gi' : 'g');
    let out = '';
    let last = 0;
    for (const match of text.matchAll(segment))
    {
        const end = match.index + match[0].length;
        const quoted = (start: number) => text.slice(start, end).replace(/^['"]/, '');
        if (!tokenStarts(text, match.index, commandLine).some((start) => froms.has(norm(roots.absOf(quoted(start), machine))))) continue;
        out += text.slice(last, match.index) + roots.ROOT_NAME;
        last = end;
    }
    return last ? out + text.slice(last) : text;
}

// One entry with every path into a moved root re-pointed (spec D3): `command`, each `args` item, each `env` value and the
// `headersHelper` command line. Nothing else changes; an entry naming no moved root comes back equal.
export function repointEntry(entry: ServerEntry, moved: MovedRoot[], machine: Machine): ServerEntry
{
    if (!moved.length) return entry;
    const one = (value: unknown, commandLine = false) => (typeof value === 'string' ? repointText(value, moved, machine, commandLine) : value);
    const out: ServerEntry = { ...entry };
    if (typeof entry.command === 'string') out.command = one(entry.command) as string;
    if (Array.isArray(entry.args)) out.args = entry.args.map((argument) => one(argument) as string);
    if (entry.env) out.env = Object.fromEntries(Object.entries(entry.env).map(([key, value]) => [key, one(value) as string]));
    if (typeof entry.headersHelper === 'string') out.headersHelper = one(entry.headersHelper, true) as string;
    return out;
}

// ---- root-repoint ---------------------------------------------------------------------------------------------------

export function rootRepointDetect(context: FixCtx): Finding[]
{
    const moved = movedRoots(context);
    if (!moved.length) return [];
    const machine = machineOf(context);
    const stale = (entry: ServerEntry | null | undefined) => Boolean(entry) && !deepEqual(repointEntry(entry!, moved, machine), entry);
    const managed = C.registrationsOf(context, 'root-repoint');
    const out: Finding[] = [];
    const seen = new Set<string>();
    for (const family of ['project', 'global'] as const)
    {
        const list = context.inventory.lists && context.inventory.lists[family];
        const servers = list && !list.note && !list.old ? list.servers || [] : [];
        const read = cursorMcp.readCursor(cursorMcp.fileFor(family, { platform: context.platform, project: context.inventory.project, home: context.home, env: context.env || {} }));
        const copies = read.state === 'ok' ? read.doc!.mcpServers : {};
        const names = [...managed.filter((registration) => roots.familyOf(registration.scope) === family), ...servers];
        for (const { name, scope } of names)
        {
            const key = `${name}~${scope}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const registration = managed.find((candidate) => candidate.name === name && candidate.scope === scope);
            const owned = context.inventory.registrations.find((candidate) => candidate.name === name && candidate.scope === scope && (candidate.own || candidate.choice === 'own'));
            if (owned) continue;
            const server = servers.find((candidate) => candidate.name === name && candidate.scope === scope);
            const copy = server && (server.clients || []).includes('cursor') ? copies[name] : undefined;
            const where = [registration && stale(registration.entry) && "Claude Code's entry", server && (stale(server.entry) || stale(server.cursorEntry)) && `the list ${list!.file}`, stale(copy) && "Cursor's copy"].filter(Boolean) as string[];
            if (!where.length) continue;
            const root = moved.find((candidate) => [registration?.entry, server?.entry, server?.cursorEntry, copy].some((entry) => entry && stale(entry) && !deepEqual(repointEntry(entry, [candidate], machine), entry)))!;
            out.push(C.finding('root-repoint', registration || { rowId: server!.row, name, scope }, `${where.join(', ')} name${where.length > 1 ? '' : 's'} ${root.from} - the folder moved to ${root.to}`, registration && stale(registration.entry) ? {} : { tailOnly: true }));
        }
    }
    return out;
}

export function rootRepointFix(entry: ServerEntry, _finding: Finding, context: FixCtx): ServerEntry
{
    return repointEntry(entry, movedRoots(context), machineOf(context));
}

// ---- root-move ------------------------------------------------------------------------------------------------------

export const OPEN_FILE = 'a file in it is open - close Claude Code and Cursor, then run /alfred-tools:update from a terminal session started fresh';

// One finding per folder still under the former name (spec D3), keyed by its families. A registration that resolves into
// it but is not managed - one left on its own, or the user's own - is named, never re-pointed.
export function rootMoveDetect(context: FixCtx): Finding[]
{
    const machine = machineOf(context);
    const out: Finding[] = [];
    for (const move of roots.pendingMoves({ project: context.inventory.project, home: context.home, platform: context.platform }))
    {
        const one = [{ from: move.from, to: move.to }];
        const names = (entry: ServerEntry | null | undefined) => Boolean(entry) && !deepEqual(repointEntry(entry!, one, machine), entry);
        const regs = (context.inventory.registrations || []).filter((registration) => registration.scope !== 'inherited' && names(registration.entry));
        const managed = C.registrationsOf(context, 'root-move');
        const mine = regs.filter((registration) => managed.includes(registration));
        const unmanaged = regs.filter((registration) => !managed.includes(registration)).map((registration) => `${registration.name} (${registration.scope}) names ${firstPath(registration.entry, move.from, machine)} - not re-pointed, yours to change`);
        const base = { id: 'root-move', row: null, name: move.families.join('+'), scope: null, moveFrom: move.from, moveTo: move.to, ...(unmanaged.length ? { unmanaged, note: unmanaged.join('; ') } : {}) };
        const dir = pathFor(context.platform).dirname(move.from);
        if (move.state === 'link') { out.push({ ...base, found: `${move.from} is a link`, blocked: 'a link - move its target by hand' }); continue; }
        if (move.state === 'both') { out.push({ ...base, found: `${move.from} and ${move.to} both hold this plugin's files`, blocked: `both .preferred-tools and .alfred-tools are in ${dir}: move what you keep from .preferred-tools into .alfred-tools, delete .preferred-tools, then run /alfred-tools:fix` }); continue; }
        if (move.state === 'came-back')
        {
            let held: string[] = [];
            try { held = fs.readdirSync(move.from); }
            catch { held = []; }
            out.push({ ...base, found: `${move.from} came back after the move`, blocked: `${move.from} came back after the move and holds ${held.join(', ') || 'nothing'} - a server started before the move wrote there; close the Claude Code and Cursor windows using it, move what you keep into .alfred-tools, then delete it` });
            continue;
        }
        const global = move.families.includes('global') ? '; another project whose registrations name ~/.preferred-tools, or whose helper reads keys from it, works again when /alfred-tools:update runs in it' : '';
        out.push({ ...base, found: `renames ${move.from} to ${move.to} (keys, list, helpers, sign-ins and data move unread) and points ${mine.length} registration(s) at it; close other Claude Code and Cursor windows first${global}` });
    }
    const carry = mapToCarry(context.data);
    if (carry) out.push({ id: 'root-move', row: null, name: 'data', scope: null, moveFrom: carry.from, moveTo: carry.to, found: `copies the roots map ${carry.from} to ${carry.to}, its moved folders re-pointed; the old one is left as it was` });
    return out;
}

// The roots map the former plugin kept (spec D4), while this plugin's data folder has none: { from, to } files, else null.
export function mapToCarry(data: string | null | undefined): { from: string; to: string } | null
{
    const sibling = roots.dataSibling(data);
    if (!sibling) return null;
    const from = path.join(sibling, roots.FILES.map);
    const to = path.join(data!, roots.FILES.map);
    return fs.existsSync(from) && !fs.existsSync(to) ? { from, to } : null;
}

// A map's roots that sit in a moved folder, pointed at the new one; the input is left as it was.
export function repointMap(map: RootsMap, moved: MovedRoot[], machine: Machine): RootsMap
{
    const one = (root: string | null): string | null => (root ? repointText(root, moved, machine, false) : root);
    return { version: map.version, global: one(map.global), projects: Object.fromEntries(Object.entries(map.projects).map(([key, root]) => [key, one(root)!])) };
}

// <data>/roots.json re-pointed at the moved folders; a map read with a note (newer, bad, unreadable) is never written.
export function repointDataMap(data: string | null | undefined, moved: MovedRoot[], machine: Machine): MachineFixResult | null
{
    if (!data || !moved.length) return null;
    const map = roots.readMap(data);
    if (map.state) return null;
    const next = repointMap(map, moved, machine);
    if (deepEqual(next, { version: map.version, global: map.global, projects: map.projects })) return null;
    roots.writeMap(data, next);
    return { ok: true, detail: `re-pointed ${path.join(data, roots.FILES.map)} at the moved folders` };
}

// The first written path in `entry` that resolves into `root`, for the line that names an unmanaged registration.
function firstPath(entry: ServerEntry, root: string, machine: Machine): string
{
    const one = [{ from: root, to: root }];
    const values = [entry.command, ...(entry.args || []), ...Object.values(entry.env || {})].filter((value): value is string => typeof value === 'string');
    const found = values.find((value) => repointText(value, one, machine, false) !== value);
    if (found) return found;
    const helperLine = typeof entry.headersHelper === 'string' && repointText(entry.headersHelper, one, machine, true) !== entry.headersHelper;
    return helperLine ? `${entry.headersHelper} (headersHelper)` : root;
}

// The rename, one call: an empty .alfred-tools is removed first; nothing inside is read (spec D3). The data finding copies
// the former plugin's roots map instead, re-pointed at the folders moved so far; the old file is never written.
export function rootMoveFix(finding: Finding, context: FixCtx): MachineFixResult
{
    if (finding.name === 'data')
    {
        const map = roots.readMap(path.dirname(finding.moveFrom!));
        if (map.state) return { ok: false, detail: `${map.note} - not copied; delete it or fix it, then run /alfred-tools:fix` };
        roots.writeMap(path.dirname(finding.moveTo!), repointMap(map, movedRoots(context), machineOf(context)));
        return { ok: true, detail: `copied the roots map ${finding.moveFrom} to ${finding.moveTo}` };
    }
    const from = finding.moveFrom!;
    const to = finding.moveTo!;
    try
    {
        let beside: string[] | null = null;
        try { beside = fs.readdirSync(to); }
        catch { beside = null; }
        if (beside && !beside.length) fs.rmdirSync(to);
        fs.renameSync(from, to);
    }
    catch (caught) { const error = caught as NodeJS.ErrnoException; return { ok: false, detail: `${from} not moved: ${error.message} - ${OPEN_FILE}` }; }
    const done = !fs.existsSync(from) && fs.existsSync(to);
    return { ok: done, detail: done ? `renamed ${from} to ${to}` : `${from} is still there after the rename` };
}
