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

const pathOf = (context: { platform: string }) => (context.platform === 'win32' ? path.win32 : path.posix);
const styleOf = (context: { platform: string }) => (context.platform === 'win32' ? 'win32' : 'posix');
const runThere = (context: FixCtx, dir: string) => `run /preferred-tools:fix in ${fromHere(context.inventory, dir)}`;
const HOME_FORM = /^\$\{(HOME|USERPROFILE)\}(?=[\\/]|$)/;
const isAbsolute = (filePath: string) => path.posix.isAbsolute(filePath) || /^(?:[A-Za-z]:[\\/]|\\\\)/.test(filePath);

// ---- project-relative-path ------------------------------------------------------------------------------------------

// What a path written by 0.2.0 means on this machine: a relative one against the project, a ${HOME} / ${USERPROFILE}
// one in the environment. -> { to } | { unset } | null (absolute, `~`, another variable: not this row's)
function absoluteOf(value: unknown, context: FixCtx)
{
    if (typeof value !== 'string' || !value) return null;
    const pathApi = pathOf(context);
    if (HOME_FORM.test(value))
    {
        const to = C.expandVars(value, context.env);
        return to === null ? { unset: C.firstUnset(value, context.env) } : { to: pathApi.normalize(to) };
    }
    if (value.includes('${') || value.startsWith('~') || isAbsolute(value)) return null;
    return { to: pathApi.resolve(context.inventory.project, value) };
}

// serena on Windows: 0.2.0 wrote ${USERPROFILE}\.serena; its home is now <project root>\serena when that folder is one
// serena takes (absolute, backslashes, no space), else the profile's .serena written out.
function serenaHome(to: string, context: FixCtx): string
{
    const root = roots.resolve(context.inventory, null, { project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog }).roots.project;
    const home = root ? path.win32.join(root, 'serena') : null;
    return home && validWindowsSerenaHome(home) ? home : to;
}

// Every path of a registration this row writes out: its derived data paths, and its helper. -> { paths, unset }
function changesOf(entry: ServerEntry, rowId: string | null | undefined, context: FixCtx): { paths: PathChange[]; unset: (string | null)[] }
{
    const row = C.rowOf(context, rowId!)!;
    const paths: PathChange[] = [];
    const unset: (string | null)[] = [];
    for (const derived of (row.locations && row.locations.derived) || [])
    {
        let from: string | undefined;
        if (derived.in === 'env') from = (entry.env || {} as Record<string, string>)[derived.key];
        else
        {
            const args = entry.args || [];
            const i = args.indexOf(derived.key);
            from = i >= 0 ? args[i + 1] : undefined;
        }
        // a relative serena home on Windows is serena-windows-home's; 0.2.0 wrote only the ${USERPROFILE} form
        const serena = rowId === 'serena' && context.platform === 'win32';
        if (serena && typeof from === 'string' && !HOME_FORM.test(from)) continue;
        const absolute = absoluteOf(from, context);
        if (!absolute) continue;
        if (absolute.unset) { unset.push(absolute.unset); continue; }
        paths.push({ in: derived.in, key: derived.key, from: from!, to: serena ? serenaHome(absolute.to!, context) : absolute.to!, was: absolute.to! });
    }
    const parts = helperParts(entry.headersHelper);
    if (parts)
    {
        const absolute = absoluteOf(parts.path, context);
        if (absolute && absolute.unset) unset.push(absolute.unset);
        else if (absolute) paths.push({ in: 'helper', key: 'headersHelper', from: parts.path, to: absolute.to!, was: absolute.to! });
    }
    return { paths, unset: [...new Set(unset)] };
}

function relativeText(paths: PathChange[], rowId: string | null): string
{
    const each = paths.map((change) => `${change.key} '${change.from}' -> ${change.to}${change.to === change.was ? '' : ` - the old data stays at ${change.was} - moving the path moves no data${rowId === 'serena' ? ', and serena downloads its language servers there once (about 327MB)' : ''}`}`);
    return `named relative or through \${HOME}/\${USERPROFILE}, so a session started in a child folder uses its own copy: ${each.join('; ')}; a copy in a child folder is kept out of git by /preferred-tools:fix run there`;
}

export function projectRelativePathDetect(context: FixCtx): Finding[]
{
    const out: Finding[] = [];
    for (const registration of C.registrationsOf(context, 'project-relative-path').filter((candidate) => candidate.scope === 'project'))
    {
        const { paths, unset } = changesOf(registration.entry, registration.rowId, context);
        if (unset.length) out.push(C.finding('project-relative-path', registration, `a path names \${${unset[0]}}`, { blocked: `${unset[0]} is not set here - there is no value to write the path as; set it, or pick the folder again with /preferred-tools:configure, Location` }));
        else if (paths.length) out.push(C.finding('project-relative-path', registration, relativeText(paths, registration.rowId), { proposal: { paths: paths.map(({ key, from, to }) => ({ key, from, to })) } }));
    }
    // a parent's .mcp.json: one finding per folder, fixed by running fix there
    const tools = C.fixOf(context, 'project-relative-path')!.tool;
    const parents = new Map<string, InvRegistration[]>();
    for (const registration of inheritedOf(context, tools))
    {
        if (!changesOf(registration.entry, registration.rowId, { ...context, inventory: { ...context.inventory, project: registration.from! } }).paths.length) continue;
        parents.set(registration.from!, [...(parents.get(registration.from!) || []), registration]);
    }
    for (const [dir, list] of parents)
        out.push(C.finding('project-relative-path', { ...list[0]!, name: list.map((registration) => registration.name).join(', ') }, `${fromHere(context.inventory, dir)}/.mcp.json names a data folder or key helper relative or through \${HOME}/\${USERPROFILE}, so a session started here uses its own copy`, { blocked: runThere(context, dir) }));
    return out;
}

// The entry as read, with only this row's paths absolute: the pin, the cut-off and the user's args and env kept.
export function projectRelativePathFix(entry: ServerEntry, finding: Finding, context: FixCtx): ServerEntry
{
    const registration = context.inventory.registrations.find((candidate) => candidate.name === finding.name && candidate.scope === finding.scope);
    const { paths } = changesOf(entry, (registration && registration.rowId) || finding.row, context);
    const out = { ...entry, ...(entry.env ? { env: { ...entry.env } } : {}), ...(entry.args ? { args: [...entry.args] } : {}) };
    for (const change of paths)
    {
        if (change.in === 'env') out.env![change.key] = change.to;
        else if (change.in === 'arg') out.args![out.args!.indexOf(change.key) + 1] = change.to;
        else
        {
            const argv = helperArgv(entry.headersHelper);
            const at = argv.findIndex((argument) => /mcp-headers\.js$/.test(argument));
            const style = styleOf(context);
            out.headersHelper = [...argv.slice(0, at), shellArg(change.to, style), ...argv.slice(at + 1).map((argument) => shellArg(argument, style))].join(' ');
        }
    }
    return out;
}

// ---- the parents' registrations ---------------------------------------------------------------------------------------

// The servers a parent folder left on its own at project scope: read from the lists in its standard roots, or a 0.4.x
// record where a root has no list yet.
function parentOwn(context: FixCtx, dir: string): Set<string>
{
    const names = new Set<string>();
    for (const standardRoot of roots.standard('project', { project: dir, home: context.home, platform: context.platform }))
    {
        const pathApi = pathOf(context);
        const list = lists.readList(pathApi.join(standardRoot.root, roots.FILES.list));
        const own = list ? list.own : ((lists.readOldRecord(pathApi.join(standardRoot.root, roots.FILES.record)) || {} as Partial<OldRecord>).servers || []);
        for (const ownEntry of own) if (ownEntry.scope === 'project' && ownEntry.choice === 'own' && typeof ownEntry.name === 'string') names.add(ownEntry.name);
    }
    return names;
}

// A parent's registrations of these tools (each read from a parent's file): not the user's own, not alfred-code's, not left on its own there.
function inheritedOf(context: FixCtx, tools: string[]): InvRegistration[]
{
    const own = new Map<string, Set<string>>();
    const ownIn = (dir: string) => { if (!own.has(dir)) own.set(dir, parentOwn(context, dir)); return own.get(dir)!; };
    return context.inventory.registrations.filter((registration) => registration.scope === 'inherited' && registration.from && !registration.own && !registration.alfredRetired && tools.includes(registration.rowId!) && !ownIn(registration.from).has(registration.name));
}

// ---- mcp-order ------------------------------------------------------------------------------------------------------

// A .mcp.json out of order. -> { names, order, row } | null (in order, not there, or not plain JSON - left as it is)
function outOfOrder(file: string, context: FixCtx, own: Set<string>): { names: string[]; order: string[]; row: string | null } | null
{
    let text: string;
    try { text = fs.readFileSync(file, 'utf8'); }
    catch { return null; }
    const reordered = mcpOrder.reorderText(text, context.catalog, own);
    if (reordered.error || !reordered.changed) return null;
    const servers = JSON.parse(text).mcpServers;
    const names = Object.keys(servers);
    const order = mcpOrder.sortedNames(servers, context.catalog, own);
    const first = order.find((name, i) => name !== names[i]);
    const match = matchEntry(servers[first!], context.catalog);
    return { names, order, row: match ? match.rowId : null };
}

const orderText = (ordering: { names: string[]; order: string[] }) => `the catalog servers are not in your order: ${ordering.names.join(', ')} - in order: ${ordering.order.join(', ')}`;

export function mcpOrderDetect(context: FixCtx): Finding[]
{
    const pathApi = pathOf(context);
    const out: Finding[] = [];
    const own = mcpOrder.ownProjectNames(context.inventory);
    const file = pathApi.join(context.inventory.project, '.mcp.json');
    const here = outOfOrder(file, context, new Set(own));
    if (here) out.push({ id: 'mcp-order', row: here.row, name: '.mcp.json', scope: 'project', found: orderText(here), proposal: { file, own } });
    const parents = new Map(context.inventory.registrations.filter((registration) => registration.scope === 'inherited' && registration.file).map((registration) => [registration.from, registration.file] as [string, string]));
    for (const [dir, parentFile] of parents)
    {
        const parentOrder = outOfOrder(parentFile, context, parentOwn(context, dir));
        if (parentOrder) out.push({ id: 'mcp-order', row: parentOrder.row, name: `${fromHere(context.inventory, dir)}/.mcp.json`, scope: 'inherited', found: orderText(parentOrder), blocked: runThere(context, dir) });
    }
    return out;
}

// The same step install and configure append: only the order of mcpServers changes. A warning is a fix not made.
export function mcpOrderFix(finding: Finding, context: FixCtx): MachineFixResult
{
    const result = mcpOrder.orderFile(finding.proposal!.file!, context.catalog, new Set(finding.proposal!.own || []));
    return { ok: !/^warning: /.test(result.detail), restart: false, detail: result.detail };
}

// ---- helper-child-folder (docs/sources.md M1: a parent folder's helper does not run in a child folder) ----------------

export function helperChildFolderDetect(context: FixCtx): Finding[]
{
    const tools = C.fixOf(context, 'helper-child-folder')!.tool;
    return inheritedOf(context, tools)
        .filter((registration) => registration.entry && typeof registration.entry.headersHelper === 'string' && registration.approval !== 'rejected' && !registration.shadowed)
        .map((registration) =>
        {
            const there = fromHere(context.inventory, registration.from!);
            return C.finding('helper-child-folder', registration, `${registration.name} comes from ${there}/.mcp.json, and Claude Code does not run a parent folder's key helper in a child folder - it connects here without its key`,
                { blocked: `move it to Global with /preferred-tools:configure in ${there}, or start Claude in ${there}` });
        });
}

