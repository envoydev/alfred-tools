// THE TABLE - the whole catalog for this OS as one numbered table, with what is installed at each scope.
//
// Printed to the tool result, never written to a file. A cell holds, for each server installed at that scope,
// `<name> [<route>, <pin>]`. A registration that matches no row is the user's: it is named under the table and nothing
// in this plugin touches it.
import * as catalogLib from '../catalog/catalog.ts';
import { fromHere } from './inventory.ts';
import { ALL_SCOPES } from '../core/constants.ts';
import { pinnedVersion, launchArgs } from '../fix/common.ts';
import type { ServerEntry } from '../core/types.ts';
import type { Catalog, CatalogRow } from '../catalog/types.ts';
import type { Inventory, Shadow } from './types.ts';

// The pin a registration carries: the package version, the image tag, or null (a hosted URL, a binary).
export function pinOf(row: CatalogRow, routeId: string | null, entry: ServerEntry): string | null | undefined
{
    const routeDefinition = (row.routes || {})[routeId!];
    if (!routeDefinition) return null;
    if (routeDefinition.runtime === 'docker')
    {
        const image = launchArgs(entry).find((argument) => argument.startsWith(routeDefinition.image!.name));
        return image && image.includes(':') ? image.slice(image.lastIndexOf(':') + 1) : null;
    }
    return routeDefinition.package ? pinnedVersion(entry, routeDefinition.package.name) : null;
}

const cellOf = (items: string[]): string => (items.length ? items.join('; ') : '-');

export function renderTable(inventory: Inventory, catalog: Catalog = catalogLib.load()): string
{
    const rows = catalog.tools.filter((row) => row.os.includes(inventory.os));
    const body = rows.map((row, i) =>
    {
        const cells: Record<string, string[]> = Object.fromEntries(ALL_SCOPES.map((scope) => [scope, []]));
        for (const registration of inventory.registrations.filter((candidate) => candidate.rowId === row.id && !candidate.alfredRetired && candidate.scope !== 'inherited'))
        {
            const pin = pinOf(row, registration.route, registration.entry);
            cells[registration.scope]!.push(`${registration.name} [${registration.route}${pin ? `, ${pin}` : ''}]`);
        }
        const group = catalog.groups.find((catalogGroup) => catalogGroup.id === row.group);
        return [String(i + 1), group!.label, row.label, row.kind, Object.keys(row.routes).join('/'), ...ALL_SCOPES.map((scope) => cellOf(cells[scope]!))];
    });
    const head = ['#', 'group', 'tool', 'kind', 'routes', ...ALL_SCOPES];
    const widths = head.map((heading, column) => Math.max(heading.length, ...body.map((bodyRow) => bodyRow[column]!.length)));
    const line = (cols: string[]) => cols.map((value, column) => value.padEnd(widths[column]!)).join('  ').trimEnd();
    const out = [line(head), line(widths.map((width) => '-'.repeat(width))), ...body.map(line)];

    const notes: string[] = [];
    const own = inventory.registrations.filter((registration) => registration.own && !registration.alfredRetired && registration.scope !== 'inherited');
    if (own.length) notes.push(`Your own, not in this catalog and never touched: ${own.map((registration) => `${registration.name} (${registration.scope})`).join(', ')}.`);
    const inherited = inventory.registrations.filter((registration) => registration.scope === 'inherited');
    const usedBy = (shadow: Shadow) => (shadow.scope === 'inherited' ? `the one in ${fromHere(inventory, shadow.from!)} wins` : `the ${shadow.scope} one wins`);
    if (inherited.length) notes.push(`Inherited from a parent folder's .mcp.json - change them there: ${inherited.map((registration) => `${registration.name} (from ${fromHere(inventory, registration.from!)}, ${registration.approval}${registration.shadowed ? `, not used here: ${usedBy(registration.shadowed)}` : ''})`).join(', ')}.`);
    const retired = inventory.registrations.filter((registration) => registration.alfredRetired && registration.scope !== 'inherited');
    if (retired.length) notes.push(`Under names alfred-code once registered, left alone: ${retired.map((registration) => `${registration.name} (${registration.scope})`).join(', ')}.`);
    const other = catalog.tools.filter((row) => !row.os.includes(inventory.os));
    if (other.length) notes.push(`Not offered on this OS (${inventory.os}): ${other.map((row) => row.label).join(', ')}.`);
    for (const unreadable of inventory.unreadable || [])
        notes.push(`${unreadable.file} is ${unreadable.state}${unreadable.error ? ` (${unreadable.error})` : ''}: ${unreadable.scope === 'inherited' ? "Claude Code skips that parent folder's servers; nothing here writes to it." : `the ${unreadable.scope} scope is unreadable here, and nothing will be written to it.`}`);
    return [...out, ...(notes.length ? ['', ...notes] : [])].join('\n');
}

