// The fixes for what 0.2.0 wrote at project scope (spec F7, F8, F3a): a data folder or key helper named relative or
// through ${HOME} / ${USERPROFILE} (project-relative-path), .mcp.json's servers out of the catalog's order (mcp-order),
// and a parent folder's hosted server whose helper Claude Code does not run in a child folder (helper-child-folder).
//
// A parent's .mcp.json is never changed from a child: each row reads the inherited registrations too and reports the
// parent as a finding with `blocked`, which fix prints as NOT APPLICABLE with the folder to run it in.
import fs from 'node:fs';
import path from 'node:path';
import * as common from './common.ts';
import { validWindowsSerenaHome } from '../entries/locations.ts';
import { pathFor, pathApiOf } from '../entries/platform.ts';
import { helperParts, helperArgv, shellArg } from '../entries/entry.ts';
import * as roots from '../roots/roots.ts';
import * as mcpOrder from '../mcps-list/mcp-order.ts';
import { fromHere, matchEntry } from '../inventory/inventory.ts';
import * as lists from '../mcps-list/mcps-list.ts';
import { MCP_JSON } from '../core/constants.ts';
import { isRecord, isServerEntry } from '../core/guards.ts';
import type { ServerEntry } from '../core/types.ts';
import type { InvRegistration } from '../inventory/types.ts';
import type { Finding, FixCtx, MachineFixResult, PathChange } from './types.ts';

const pathOf = (context: { platform: string }) => pathFor(context.platform);
const styleOf = (context: { platform: string }) => (context.platform === 'win32' ? 'win32' : 'posix');
const runThere = (context: FixCtx, dir: string) => `run /alfred-tools:fix in ${fromHere(context.inventory, dir)}`;
const HOME_FORM = /^\$\{(HOME|USERPROFILE)\}(?=[\\/]|$)/;
const isAbsolute = (filePath: string) => path.posix.isAbsolute(filePath) || pathApiOf(filePath) === path.win32;

// ---- project-relative-path ------------------------------------------------------------------------------------------

// What a path written by 0.2.0 means on this machine: a relative one against the project, a ${HOME} / ${USERPROFILE}
// one in the environment. -> { to } | { unset } | null (absolute, `~`, another variable: not this row's)
function absoluteOf(value: unknown, context: FixCtx): { to: string; unset?: undefined } | { unset: string | null; to?: undefined } | null
{
    if (typeof value !== 'string' || !value) return null;
    const pathApi = pathOf(context);
    if (HOME_FORM.test(value))
    {
        const to = common.expandVars(value, context.env);
        return to === null ? { unset: common.firstUnset(value, context.env) } : { to: pathApi.normalize(to) };
    }
    if (value.includes('${') || value.startsWith('~') || isAbsolute(value)) return null;
    return { to: pathApi.resolve(context.inventory.project, value) };
}

// serena on Windows: 0.2.0 wrote ${USERPROFILE}\.serena; its home is now <project root>\serena when that folder is one
// serena takes (absolute, backslashes, no space), else the profile's .serena written out.
function serenaHome(to: string, context: FixCtx): string
{
    const root = roots.resolveRoots(context.inventory, null, { project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog }).roots.project;
    const home = root ? path.win32.join(root, 'serena') : null;
    return home && validWindowsSerenaHome(home) ? home : to;
}

// Every path of a registration this row writes out: its derived data paths, and its helper. -> { paths, unset }
function changesOf(entry: ServerEntry, rowId: string | null | undefined, context: FixCtx): { paths: PathChange[]; unset: (string | null)[] }
{
    const row = rowId ? common.rowOf(context, rowId) : undefined;
    const paths: PathChange[] = [];
    const unset: (string | null)[] = [];
    if (!row) return { paths, unset };
    for (const derived of (row.locations && row.locations.derived) || [])
    {
        let from: string | undefined;
        if (derived.in === 'env') from = entry.env ? entry.env[derived.key] : undefined;
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
        // absoluteOf reads only a string
        if (!absolute || from === undefined) continue;
        if (absolute.to === undefined) { if (absolute.unset) unset.push(absolute.unset); continue; }
        paths.push({ in: derived.in, key: derived.key, from, to: serena ? serenaHome(absolute.to, context) : absolute.to, was: absolute.to });
    }
    const parts = helperParts(entry.headersHelper);
    if (parts)
    {
        const absolute = absoluteOf(parts.path, context);
        if (absolute && absolute.unset) unset.push(absolute.unset);
        else if (absolute && absolute.to !== undefined) paths.push({ in: 'helper', key: 'headersHelper', from: parts.path, to: absolute.to, was: absolute.to });
    }
    return { paths, unset: [...new Set(unset)] };
}

function relativeText(paths: PathChange[], rowId: string | null): string
{
    const each = paths.map((change) => `${change.key} '${change.from}' -> ${change.to}${change.to === change.was ? '' : ` - the old data stays at ${change.was} - moving the path moves no data${rowId === 'serena' ? ', and serena downloads its language servers there once (about 327MB)' : ''}`}`);
    return `named relative or through \${HOME}/\${USERPROFILE}, so a session started in a child folder uses its own copy: ${each.join('; ')}; a copy in a child folder is kept out of git by /alfred-tools:fix run there`;
}

export function projectRelativePathDetect(context: FixCtx): Finding[]
{
    const out: Finding[] = [];
    for (const registration of common.registrationsOf(context, 'project-relative-path').filter((candidate) => candidate.scope === 'project'))
    {
        const { paths, unset } = changesOf(registration.entry, registration.rowId, context);
        if (unset.length) out.push(common.finding('project-relative-path', registration, `a path names \${${unset[0]}}`, { blocked: `${unset[0]} is not set here - there is no value to write the path as; set it, or pick the folder again with /alfred-tools:configure, Location` }));
        else if (paths.length) out.push(common.finding('project-relative-path', registration, relativeText(paths, registration.rowId), { proposal: { paths: paths.map(({ key, from, to }) => ({ key, from, to })) } }));
    }
    // a parent's .mcp.json: one finding per folder, fixed by running fix there
    const tools = common.fixRowOf(context, 'project-relative-path').tool;
    const parents = new Map<string, InvRegistration[]>();
    for (const registration of inheritedOf(context, tools))
    {
        if (!changesOf(registration.entry, registration.rowId, { ...context, inventory: { ...context.inventory, project: registration.from } }).paths.length) continue;
        parents.set(registration.from, [...(parents.get(registration.from) || []), registration]);
    }
    for (const [dir, [first, ...rest]] of parents)
        if (first) out.push(common.finding('project-relative-path', { ...first, name: [first, ...rest].map((registration) => registration.name).join(', ') }, `${fromHere(context.inventory, dir)}/.mcp.json names a data folder or key helper relative or through \${HOME}/\${USERPROFILE}, so a session started here uses its own copy`, { blocked: runThere(context, dir) }));
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
        // a change is read from the entry's own env or args, which the copy holds
        if (change.in === 'env') { if (out.env) out.env[change.key] = change.to; }
        else if (change.in === 'arg') { if (out.args) out.args[out.args.indexOf(change.key) + 1] = change.to; }
        else
        {
            const argv = helperArgv(entry.headersHelper);
            const at = argv.findIndex((argument) => argument.endsWith(roots.FILES.helper));
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
        const record = list ? null : lists.readOldRecord(pathApi.join(standardRoot.root, roots.FILES.record));
        const own = list ? list.own : ((record && record.servers) || []);
        for (const ownEntry of own) if (ownEntry.scope === 'project' && ownEntry.choice === 'own' && typeof ownEntry.name === 'string') names.add(ownEntry.name);
    }
    return names;
}

// A parent's registrations of these tools (each read from a parent's file): not the user's own, not alfred-code's, not left on its own there.
function inheritedOf(context: FixCtx, tools: string[]): (InvRegistration & { from: string })[]
{
    const own = new Map<string, Set<string>>();
    const ownIn = (dir: string) => { const read = own.get(dir) || parentOwn(context, dir); own.set(dir, read); return read; };
    return context.inventory.registrations.filter((registration): registration is InvRegistration & { from: string } => registration.scope === 'inherited' && typeof registration.from === 'string' && registration.from !== '' && !registration.own && !registration.alfredRetired && registration.rowId !== null && tools.includes(registration.rowId) && !ownIn(registration.from).has(registration.name));
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
    // reorderText changed it: the text is an object holding an mcpServers object
    const doc: unknown = JSON.parse(text);
    const held = isRecord(doc) ? doc['mcpServers'] : undefined;
    const servers = isRecord(held) ? held : {};
    const names = Object.keys(servers);
    const order = mcpOrder.sortedNames(servers, context.catalog, own);
    const first = order.find((name, i) => name !== names[i]);
    const entry = first === undefined ? undefined : servers[first];
    const match = isServerEntry(entry) ? matchEntry(entry, context.catalog) : null;
    return { names, order, row: match ? match.rowId : null };
}

const orderText = (ordering: { names: string[]; order: string[] }) => `the catalog servers are not in your order: ${ordering.names.join(', ')} - in order: ${ordering.order.join(', ')}`;

export function mcpOrderDetect(context: FixCtx): Finding[]
{
    const pathApi = pathOf(context);
    const out: Finding[] = [];
    const own = mcpOrder.ownProjectNames(context.inventory);
    const file = pathApi.join(context.inventory.project, MCP_JSON);
    const here = outOfOrder(file, context, new Set(own));
    if (here) out.push({ id: 'mcp-order', row: here.row, name: MCP_JSON, scope: 'project', found: orderText(here), proposal: { file, own } });
    const parents = new Map(context.inventory.registrations.flatMap((registration): [string, string][] => (registration.scope === 'inherited' && registration.from && registration.file ? [[registration.from, registration.file]] : [])));
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
    const result = mcpOrder.orderFile(common.proposalOf(finding, 'file'), context.catalog, new Set(common.fieldOf(finding, 'proposal').own || []));
    return { ok: !/^warning: /.test(result.detail), restart: false, detail: result.detail };
}

// ---- helper-child-folder (docs/sources.md M1: a parent folder's helper does not run in a child folder) ----------------

export function helperChildFolderDetect(context: FixCtx): Finding[]
{
    const tools = common.fixRowOf(context, 'helper-child-folder').tool;
    return inheritedOf(context, tools)
        .filter((registration) => registration.entry && typeof registration.entry.headersHelper === 'string' && registration.approval !== 'rejected' && !registration.shadowed)
        .map((registration) =>
        {
            const there = fromHere(context.inventory, registration.from);
            return common.finding('helper-child-folder', registration, `${registration.name} comes from ${there}/.mcp.json, and Claude Code does not run a parent folder's key helper in a child folder - it connects here without its key`,
                { blocked: `move it to Global with /alfred-tools:configure in ${there}, or start Claude in ${there}` });
        });
}

