// MCP ORDER (spec F8) - .mcp.json's servers in the catalog's order: the servers this plugin manages first, by their row's
// place in catalog.order (two of one row keep their order), then the user's own and the servers left on their own, in
// their current order. Only the order of mcpServers' keys changes, never a value, and every other top-level key, the
// indent, the line endings and the final newline stay as they were.
//
// The one write to .mcp.json that is not the claude CLI's (the user's ruling, 2026-11-11). It never fails an apply: a file
// that is not plain JSON, a check that does not hold or a failed write leaves the file as it was, with a warning.
import fs from 'node:fs';
import path from 'node:path';
import { matchEntry } from '../inventory/inventory.ts';
import type { ServerMap } from '../core/types.ts';
import type { Catalog } from '../catalog/types.ts';
import type { InventoryView } from '../roots/types.ts';
import type { FileOps, OrderStep, StepEnd, StepLike } from './types.ts';

const LEFT = 'left as it is - /preferred-tools:fix (mcp-order) orders it';
const ORDER_REASON = '.mcp.json: the catalog servers in your order, your own after them - no value changes';

// The server names in their new order. `own`: the names left on their own, which sit with the user's own servers.
export function sortedNames(servers: ServerMap | null | undefined, catalog: Catalog, own: Set<string> = new Set()): string[]
{
    const names = Object.keys(servers || {});
    const rank = new Map(names.map((name) =>
    {
        const match = own.has(name) ? null : matchEntry(servers![name], catalog);
        return [name, match ? catalog.order.indexOf(match.rowId) : -1];
    }));
    // Array.prototype.sort is stable: two of one row keep their order
    const managed = names.filter((name) => rank.get(name)! >= 0).sort((first, second) => rank.get(first)! - rank.get(second)!);
    return [...managed, ...names.filter((name) => rank.get(name)! < 0)];
}

// a value with its object keys sorted, as text: two objects equal once key order is ignored give the same text
function canon(value: unknown): string
{
    const sorted = (node: unknown): unknown =>
    {
        if (Array.isArray(node)) return node.map(sorted);
        if (node && typeof node === 'object') return Object.fromEntries(Object.keys(node).sort().map((k) => [k, sorted((node as Record<string, unknown>)[k])]));
        return node;
    };
    return JSON.stringify(sorted(value));
}

// -> { text, changed } | { error }
export function reorderText(text: string, catalog: Catalog, own: Set<string> = new Set()): { text: string; changed: boolean; error?: undefined } | { error: string; text?: undefined; changed?: undefined }
{
    let doc: { mcpServers?: ServerMap; [key: string]: unknown };
    // the parser's message quotes the text, which may hold a value: never repeated
    try { doc = JSON.parse(text); }
    catch { return { error: 'is not plain JSON (a BOM, a comment or a trailing comma, say)' }; }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { error: 'is not a JSON object' };
    const servers = doc.mcpServers;
    if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return { text, changed: false };
    const names = Object.keys(servers);
    const order = sortedNames(servers, catalog, own);
    if (order.every((name, i) => name === names[i])) return { text, changed: false };
    // Object.fromEntries defines each key as its own property, '__proto__' included
    const next = Object.fromEntries(Object.entries(doc).map(([k, value]) => [k, k === 'mcpServers' ? Object.fromEntries(order.map((name) => [name, servers[name]])) : value]));
    if (Object.keys(next['mcpServers'] as ServerMap).some((name, i) => name !== order[i])) return { error: 'has a server name JSON cannot place (an integer name)' };
    const indented = /\n([ \t]+)\S/.exec(text);
    const crlf = text.includes('\r\n');
    let out = JSON.stringify(next, null, indented ? indented[1] : 2);
    if (crlf) out = out.replace(/\n/g, '\r\n');
    if (/\n$/.test(text)) out += crlf ? '\r\n' : '\n';
    let back: { mcpServers: ServerMap };
    try { back = JSON.parse(out); }
    catch { return { error: 'would not parse once ordered' }; }
    const sameNames = Object.keys(back.mcpServers).length === names.length && names.every((name) => Object.hasOwn(back.mcpServers, name));
    if (!sameNames || canon(back) !== canon(doc)) return { error: 'would not hold the same servers once ordered' };
    return { text: out, changed: true };
}

// -> { ok: true, changed, detail }; never throws
export function orderFile(file: string, catalog: Catalog, own: Set<string> = new Set(), { read = fs.readFileSync, write = fs.writeFileSync, rename = fs.renameSync }: FileOps = {}): { ok: boolean; changed: boolean; detail: string }
{
    const warn = (why: string) => ({ ok: true, changed: false, detail: `warning: ${file} ${why}; ${LEFT}` });
    let text: string;
    try { text = read(file, 'utf8'); }
    catch (caught) { const error = caught as NodeJS.ErrnoException;  return error.code === 'ENOENT' || error.code === 'ENOTDIR' ? { ok: true, changed: false, detail: `${file}: not there - nothing to order` } : warn(`cannot be read (${error.code || error.message})`); }
    const reordered = reorderText(text, catalog, own);
    if (reordered.error) return warn(reordered.error);
    if (!reordered.changed) return { ok: true, changed: false, detail: `${file}: the servers are already in order` };
    // a .mcp.json that is a link: the file it points at is replaced, the link stays
    let target = file;
    try { target = fs.realpathSync(file); } catch { /* not on this disk (a test's stub): the path as given */ }
    const tmp = `${target}.${process.pid}.tmp`;
    try
    {
        let now: string | null = null;
        try { now = read(file, 'utf8'); } catch { /* gone since: not the text read */ }
        if (now !== text) return warn('changed while it was being ordered');
        write(tmp, reordered.text!);
        rename(tmp, target);
    }
    catch (caught)
    {
        const error = caught as NodeJS.ErrnoException;
        try { fs.rmSync(tmp, { force: true }); } catch { /* nothing to remove */ }
        return warn(`could not be written (${error.code || error.message})`);
    }
    return { ok: true, changed: true, detail: `ordered ${file}: the catalog servers first, your own after them - no value changed` };
}

// The project-scope servers left on their own: recorded so, or answered so in this run.
export function ownProjectNames(inventory: InventoryView, existing: Record<string, string> | null = {}): string[]
{
    const names = (inventory.registrations || []).filter((registration) => registration.scope === 'project' && registration.choice === 'own').map((registration) => registration.name!);
    for (const [key, choice] of Object.entries(existing || {}))
    {
        const match = /^mcp:(.+)~project$/.exec(key);
        if (match && choice === 'own') names.push(match[1]!);
    }
    return [...new Set(names)];
}

// The steps with the order step last, when one of them writes a project-scope registration.
export function withOrderStep<Step extends StepLike>(steps: Step[], project: string, own: string[] = []): (Step | OrderStep)[]
{
    const writes = steps.some((step) => (['mcp-add', 'mcp-replace'].includes(step.op as string) && step.scope === 'project') || (step.op === 'mcp-move' && step.to && (step.to as StepEnd).scope === 'project'));
    if (!writes) return steps;
    const pathApi = /^(?:[A-Za-z]:[\\/]|\\\\)/.test(project) ? path.win32 : path.posix;
    return [...steps, { op: 'order-mcp-json', file: pathApi.join(project, '.mcp.json'), own, why: ORDER_REASON } as OrderStep];
}

