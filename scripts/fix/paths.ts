// The fixes for what 0.2.0 wrote at project scope (spec F7, F8, F3a): a data folder or key helper named relative or
// through ${HOME} / ${USERPROFILE} (project-relative-path), .mcp.json's servers out of the catalog's order (mcp-order),
// and a parent folder's hosted server whose helper Claude Code does not run in a child folder (helper-child-folder).
//
// A parent's .mcp.json is never changed from a child: each row reads the inherited registrations too and reports the
// parent as a finding with `blocked`, which fix prints as NOT APPLICABLE with the folder to run it in.
import fs from 'node:fs';
import path from 'node:path';
import * as C from './common.ts';
import { validWindowsSerenaHome } from '../entries/locations.ts';
import { helperParts, helperArgv, shellArg } from '../entries/entry.ts';
import * as roots from '../roots/roots.ts';
import * as mcpOrder from '../mcps-list/mcp-order.ts';
import { fromHere, matchEntry } from '../inventory/inventory.ts';
import * as lists from '../mcps-list/mcps-list.ts';
import type { ServerEntry } from '../core/types.ts';
import type { InvRegistration } from '../inventory/types.ts';
import type { OldRecord } from '../mcps-list/types.ts';
import type { Finding, FixCtx, MachineFixResult, PathChange } from './types.ts';

const pathOf = (ctx: { platform: string }) => (ctx.platform === 'win32' ? path.win32 : path.posix);
const styleOf = (ctx: { platform: string }) => (ctx.platform === 'win32' ? 'win32' : 'posix');
const runThere = (ctx: FixCtx, dir: string) => `run /preferred-tools:fix in ${fromHere(ctx.inv, dir)}`;
const HOME_FORM = /^\$\{(HOME|USERPROFILE)\}(?=[\\/]|$)/;
const isAbsolute = (p: string) => path.posix.isAbsolute(p) || /^(?:[A-Za-z]:[\\/]|\\\\)/.test(p);

// ---- project-relative-path ------------------------------------------------------------------------------------------

// What a path written by 0.2.0 means on this machine: a relative one against the project, a ${HOME} / ${USERPROFILE}
// one in the environment. -> { to } | { unset } | null (absolute, `~`, another variable: not this row's)
function absoluteOf(value: unknown, ctx: FixCtx)
{
    if (typeof value !== 'string' || !value) return null;
    const P = pathOf(ctx);
    if (HOME_FORM.test(value))
    {
        const to = C.expandVars(value, ctx.env);
        return to === null ? { unset: C.firstUnset(value, ctx.env) } : { to: P.normalize(to) };
    }
    if (value.includes('${') || value.startsWith('~') || isAbsolute(value)) return null;
    return { to: P.resolve(ctx.inv.project, value) };
}

// serena on Windows: 0.2.0 wrote ${USERPROFILE}\.serena; its home is now <project root>\serena when that folder is one
// serena takes (absolute, backslashes, no space), else the profile's .serena written out.
function serenaHome(to: string, ctx: FixCtx): string
{
    const root = roots.resolve(ctx.inv, null, { project: ctx.inv.project, home: ctx.home, platform: ctx.platform, catalog: ctx.catalog }).roots.project;
    const home = root ? path.win32.join(root, 'serena') : null;
    return home && validWindowsSerenaHome(home) ? home : to;
}

// Every path of a registration this row writes out: its derived data paths, and its helper. -> { paths, unset }
function changesOf(entry: ServerEntry, rowId: string | null | undefined, ctx: FixCtx): { paths: PathChange[]; unset: (string | null)[] }
{
    const row = C.rowOf(ctx, rowId!)!;
    const paths: PathChange[] = [];
    const unset: (string | null)[] = [];
    for (const d of (row.locations && row.locations.derived) || [])
    {
        let from: string | undefined;
        if (d.in === 'env') from = (entry.env || {} as Record<string, string>)[d.key];
        else
        {
            const args = entry.args || [];
            const i = args.indexOf(d.key);
            from = i >= 0 ? args[i + 1] : undefined;
        }
        // a relative serena home on Windows is serena-windows-home's; 0.2.0 wrote only the ${USERPROFILE} form
        const serena = rowId === 'serena' && ctx.platform === 'win32';
        if (serena && typeof from === 'string' && !HOME_FORM.test(from)) continue;
        const a = absoluteOf(from, ctx);
        if (!a) continue;
        if (a.unset) { unset.push(a.unset); continue; }
        paths.push({ in: d.in, key: d.key, from: from!, to: serena ? serenaHome(a.to!, ctx) : a.to!, was: a.to! });
    }
    const parts = helperParts(entry.headersHelper);
    if (parts)
    {
        const a = absoluteOf(parts.path, ctx);
        if (a && a.unset) unset.push(a.unset);
        else if (a) paths.push({ in: 'helper', key: 'headersHelper', from: parts.path, to: a.to!, was: a.to! });
    }
    return { paths, unset: [...new Set(unset)] };
}

function relativeText(paths: PathChange[], rowId: string | null): string
{
    const each = paths.map((p) => `${p.key} '${p.from}' -> ${p.to}${p.to === p.was ? '' : ` - the old data stays at ${p.was} - moving the path moves no data${rowId === 'serena' ? ', and serena downloads its language servers there once (about 327MB)' : ''}`}`);
    return `named relative or through \${HOME}/\${USERPROFILE}, so a session started in a child folder uses its own copy: ${each.join('; ')}; a copy in a child folder is kept out of git by /preferred-tools:fix run there`;
}

export function projectRelativePathDetect(ctx: FixCtx): Finding[]
{
    const out: Finding[] = [];
    for (const r of C.registrationsOf(ctx, 'project-relative-path').filter((x) => x.scope === 'project'))
    {
        const { paths, unset } = changesOf(r.entry, r.rowId, ctx);
        if (unset.length) out.push(C.finding('project-relative-path', r, `a path names \${${unset[0]}}`, { blocked: `${unset[0]} is not set here - there is no value to write the path as; set it, or pick the folder again with /preferred-tools:configure, Location` }));
        else if (paths.length) out.push(C.finding('project-relative-path', r, relativeText(paths, r.rowId), { proposal: { paths: paths.map(({ key, from, to }) => ({ key, from, to })) } }));
    }
    // a parent's .mcp.json: one finding per folder, fixed by running fix there
    const tools = C.fixOf(ctx, 'project-relative-path')!.tool;
    const parents = new Map<string, InvRegistration[]>();
    for (const r of inheritedOf(ctx, tools))
    {
        if (!changesOf(r.entry, r.rowId, { ...ctx, inv: { ...ctx.inv, project: r.from! } }).paths.length) continue;
        parents.set(r.from!, [...(parents.get(r.from!) || []), r]);
    }
    for (const [dir, list] of parents)
        out.push(C.finding('project-relative-path', { ...list[0]!, name: list.map((r) => r.name).join(', ') }, `${fromHere(ctx.inv, dir)}/.mcp.json names a data folder or key helper relative or through \${HOME}/\${USERPROFILE}, so a session started here uses its own copy`, { blocked: runThere(ctx, dir) }));
    return out;
}

// The entry as read, with only this row's paths absolute: the pin, the cut-off and the user's args and env kept.
export function projectRelativePathFix(entry: ServerEntry, f: Finding, ctx: FixCtx): ServerEntry
{
    const reg = ctx.inv.registrations.find((r) => r.name === f.name && r.scope === f.scope);
    const { paths } = changesOf(entry, (reg && reg.rowId) || f.row, ctx);
    const out = { ...entry, ...(entry.env ? { env: { ...entry.env } } : {}), ...(entry.args ? { args: [...entry.args] } : {}) };
    for (const p of paths)
    {
        if (p.in === 'env') out.env![p.key] = p.to;
        else if (p.in === 'arg') out.args![out.args!.indexOf(p.key) + 1] = p.to;
        else
        {
            const argv = helperArgv(entry.headersHelper);
            const at = argv.findIndex((a) => /mcp-headers\.js$/.test(a));
            const style = styleOf(ctx);
            out.headersHelper = [...argv.slice(0, at), shellArg(p.to, style), ...argv.slice(at + 1).map((a) => shellArg(a, style))].join(' ');
        }
    }
    return out;
}

// ---- the parents' registrations ---------------------------------------------------------------------------------------

// The servers a parent folder left on its own at project scope: read from the lists in its standard roots, or a 0.4.x
// record where a root has no list yet.
function parentOwn(ctx: FixCtx, dir: string): Set<string>
{
    const names = new Set<string>();
    for (const s of roots.standard('project', { project: dir, home: ctx.home, platform: ctx.platform }))
    {
        const P = pathOf(ctx);
        const list = lists.readList(P.join(s.root, roots.FILES.list));
        const own = list ? list.own : ((lists.readOldRecord(P.join(s.root, roots.FILES.record)) || {} as Partial<OldRecord>).servers || []);
        for (const e of own) if (e.scope === 'project' && e.choice === 'own' && typeof e.name === 'string') names.add(e.name);
    }
    return names;
}

// A parent's registrations of these tools (each read from a parent's file): not the user's own, not alfred-code's, not left on its own there.
function inheritedOf(ctx: FixCtx, tools: string[]): InvRegistration[]
{
    const own = new Map<string, Set<string>>();
    const ownIn = (dir: string) => { if (!own.has(dir)) own.set(dir, parentOwn(ctx, dir)); return own.get(dir)!; };
    return ctx.inv.registrations.filter((r) => r.scope === 'inherited' && r.from && !r.own && !r.alfredRetired && tools.includes(r.rowId!) && !ownIn(r.from).has(r.name));
}

// ---- mcp-order ------------------------------------------------------------------------------------------------------

// A .mcp.json out of order. -> { names, order, row } | null (in order, not there, or not plain JSON - left as it is)
function outOfOrder(file: string, ctx: FixCtx, own: Set<string>): { names: string[]; order: string[]; row: string | null } | null
{
    let text: string;
    try { text = fs.readFileSync(file, 'utf8'); }
    catch { return null; }
    const r = mcpOrder.reorderText(text, ctx.catalog, own);
    if (r.error || !r.changed) return null;
    const servers = JSON.parse(text).mcpServers;
    const names = Object.keys(servers);
    const order = mcpOrder.sortedNames(servers, ctx.catalog, own);
    const first = order.find((n, i) => n !== names[i]);
    const m = matchEntry(servers[first!], ctx.catalog);
    return { names, order, row: m ? m.rowId : null };
}

const orderText = (o: { names: string[]; order: string[] }) => `the catalog servers are not in your order: ${o.names.join(', ')} - in order: ${o.order.join(', ')}`;

export function mcpOrderDetect(ctx: FixCtx): Finding[]
{
    const P = pathOf(ctx);
    const out: Finding[] = [];
    const own = mcpOrder.ownProjectNames(ctx.inv);
    const file = P.join(ctx.inv.project, '.mcp.json');
    const here = outOfOrder(file, ctx, new Set(own));
    if (here) out.push({ id: 'mcp-order', row: here.row, name: '.mcp.json', scope: 'project', found: orderText(here), proposal: { file, own } });
    const parents = new Map(ctx.inv.registrations.filter((r) => r.scope === 'inherited' && r.file).map((r) => [r.from, r.file] as [string, string]));
    for (const [dir, f] of parents)
    {
        const o = outOfOrder(f, ctx, parentOwn(ctx, dir));
        if (o) out.push({ id: 'mcp-order', row: o.row, name: `${fromHere(ctx.inv, dir)}/.mcp.json`, scope: 'inherited', found: orderText(o), blocked: runThere(ctx, dir) });
    }
    return out;
}

// The same step install and configure append: only the order of mcpServers changes. A warning is a fix not made.
export function mcpOrderFix(f: Finding, ctx: FixCtx): MachineFixResult
{
    const r = mcpOrder.orderFile(f.proposal!.file!, ctx.catalog, new Set(f.proposal!.own || []));
    return { ok: !/^warning: /.test(r.detail), restart: false, detail: r.detail };
}

// ---- helper-child-folder (docs/sources.md M1: a parent folder's helper does not run in a child folder) ----------------

export function helperChildFolderDetect(ctx: FixCtx): Finding[]
{
    const tools = C.fixOf(ctx, 'helper-child-folder')!.tool;
    return inheritedOf(ctx, tools)
        .filter((r) => r.entry && typeof r.entry.headersHelper === 'string' && r.approval !== 'rejected' && !r.shadowed)
        .map((r) =>
        {
            const there = fromHere(ctx.inv, r.from!);
            return C.finding('helper-child-folder', r, `${r.name} comes from ${there}/.mcp.json, and Claude Code does not run a parent folder's key helper in a child folder - it connects here without its key`,
                { blocked: `move it to Global with /preferred-tools:configure in ${there}, or start Claude in ${there}` });
        });
}

