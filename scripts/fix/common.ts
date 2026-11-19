// Shared pieces of the fix detectors. A detector is `detect(ctx) -> findings[]`; a registration fix is
// `fix(entry, finding, ctx, input) -> entry` (a pure edit of the entry AS READ, so the user's pin, cut-off and added
// args or env survive); a machine fix is `fix(finding, ctx) -> { ok, detail }` and changes the machine.
import { isManaged } from '../inventory/fingerprint.ts';
import * as locations from '../entries/locations.ts';
import * as serenaConfig from '../apply/serena-config.ts';
import { pathFor } from '../entries/platform.ts';
import type { Env, ServerEntry } from '../core/types.ts';
import type { CatalogRoute, CatalogRow, FixRow } from '../catalog/types.ts';
import type { InvRegistration } from '../inventory/types.ts';
import type { Finding, FixCtx, Proposal } from './types.ts';

// What every command shares lives with its owner; fix's detectors and tests reach it here too.
export { clone } from '../core/json-file.ts';
export { realMachine } from '../core/machine.ts';
export { isManaged, launchArgs, launcher, pinnedVersion } from '../inventory/fingerprint.ts';

export const fixOf = (context: Pick<FixCtx, 'catalog'>, id: string): FixRow | undefined => context.catalog.fixes.find((fixRow) => fixRow.id === id);
export const rowOf = (context: Pick<FixCtx, 'catalog'>, id: string): CatalogRow | undefined => context.catalog.byId.get(id);

// The registrations a fix row covers: matched to one of its tools by what they launch, not the user's own, not an
// alfred-code leftover, not one left on its own (spec D6), and not inherited from a parent folder (fixed by running fix
// there).
export function registrationsOf(context: Pick<FixCtx, 'catalog' | 'inventory'>, fixId: string): InvRegistration[]
{
    const fixRow = fixRowOf(context, fixId);
    return context.inventory.registrations.filter((registration) => isManaged(registration) && registration.scope !== 'inherited' && registration.rowId !== null && fixRow.tool.includes(registration.rowId));
}
export function routeOf(context: Pick<FixCtx, 'catalog'>, registration: { rowId: string | null; route: string | null }): CatalogRoute | undefined
{
    const row = registration.rowId ? rowOf(context, registration.rowId) : undefined;
    return row && registration.route ? row.routes[registration.route] : undefined;
}

// A committed value read against an environment, as Claude Code expands .mcp.json from the one it starts with
// (entries/locations.ts expandVars). -> the expanded text, or null when a ${NAME} with no fallback is unset (`firstUnset` names it).
export const expandVars = (text: unknown, env: Env): string | null => { const expanded = locations.expandVars(text, env); return expanded.unset.length ? null : expanded.value; };
export const firstUnset = (text: unknown, env: Env): string | null => locations.expandVars(text, env).unset[0] || null;

// A field a fix row's detector always sets on its findings, read by the fix that needs it: a finding without it is a
// detector's mistake, named, never an undefined that reaches a path, a command or a file.
export const fieldOf = <Key extends keyof Finding>(finding: Finding, key: Key): NonNullable<Finding[Key]> => need(finding, key, `${finding.id} on ${finding.name}: the finding`);
// A field of a finding's proposal, the same way.
export const proposalOf = <Key extends keyof Proposal>(finding: Finding, key: Key): NonNullable<Proposal[Key]> => need(fieldOf(finding, 'proposal'), key, `${finding.id} on ${finding.name}: the proposal`);
// The catalog route a finding names, the same way.
export function findingRoute(context: Pick<FixCtx, 'catalog'>, finding: Finding): CatalogRoute
{
    const row = rowOf(context, fieldOf(finding, 'row'));
    const route = row ? row.routes[fieldOf(finding, 'route')] : undefined;
    if (!route) throw new Error(`${finding.id} on ${finding.name}: no route ${finding.route} in catalog row ${finding.row}`);
    return route;
}
// A fix row of the catalog by its id: the detectors and fixes name only rows catalog/fixes.json holds.
export function fixRowOf(context: Pick<FixCtx, 'catalog'>, id: string): FixRow
{
    const fixRow = fixOf(context, id);
    if (!fixRow) throw new Error(`no fix row ${id} in catalog/fixes.json`);
    return fixRow;
}
// A value that must be there, or an error naming what lacks it.
function need<Holder, Key extends keyof Holder>(holder: Holder, key: Key, what: string): NonNullable<Holder[Key]>
{
    const value = holder[key];
    if (value === undefined || value === null) throw new Error(`${what} has no ${String(key)}`);
    return value;
}

export const finding = (fixId: string, registration: { rowId: string | null; name: string; scope: string }, what: string, extra: Partial<Finding> = {}): Finding => ({ id: fixId, row: registration.rowId, name: registration.name, scope: registration.scope, found: what, ...extra });

export { compareVersions } from '../core/versions.ts';


// serena's context file in its home: <SERENA_HOME>/<fileName>, for a home the plugin may keep files in. null for no
// SERENA_HOME or one editableHome refuses (alfred-code's), whose context stays in the root.
export function homeContextOf(entry: ServerEntry, platform: string, fileName: string): string | null
{
    const home = entry.env && entry.env.SERENA_HOME;
    if (!home || !serenaConfig.editableHome(home, { platform }).ok) return null;
    return pathFor(platform).join(home, fileName);
}
