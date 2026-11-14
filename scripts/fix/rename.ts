// THE RENAME (spec D3) - this plugin was preferred-tools until 0.4.0, and its default root folders were
// `<project>/.preferred-tools` and `~/.preferred-tools`. root-repoint points a managed server that still names a moved
// root at `.alfred-tools`: its Claude Code entry through the registration pass, its list entry and Cursor's copy through
// the repair tail. A registration the user owns is never touched.
import fs from 'node:fs';
import * as roots from '../roots/roots.ts';
import * as cursorMcp from '../cursor/cursor-mcp.ts';
import { deepEqual } from '../core/json-file.ts';
import { pathFor } from '../entries/platform.ts';
import * as C from './common.ts';
import type { ServerEntry } from '../core/types.ts';
import type { Machine } from '../entries/types.ts';
import type { Finding, FixCtx, MovedRoot } from './types.ts';

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
