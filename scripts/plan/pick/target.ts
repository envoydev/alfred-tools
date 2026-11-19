// One MCP pick's checks: the registration it changes, its route, scope and name, and the notes on the row's other copies.
import { currentOf } from '../../entries/entry.ts';
import { nameProblem } from '../../entries/names.ts';
import { recommendedScope, ALL_SCOPES } from '../asks-keys.ts';
import * as roots from '../../roots/roots.ts';
import { keyOf, fromHere, otherWindowsMcp } from '../../inventory/inventory.ts';
import { resolveName } from './root.ts';
import { required } from '../required.ts';
import type { Catalog, CatalogRow } from '../../catalog/types.ts';
import type { Inventory, InvRegistration } from '../../inventory/types.ts';
import type { ListServer } from '../../mcps-list/types.ts';
import type { PickAnswer, PickBase, Plan, PlanCtx } from '../types.ts';

// The list entry of a registration, or null.
function listedOf(inventory: Inventory, registration: { name: string; scope: string }): ListServer | null
{
    const familyList = inventory.lists && inventory.lists[roots.familyOf(registration.scope)];
    return familyList && !familyList.note && !familyList.old ? (familyList.servers || []).find((server) => server.name === registration.name && server.scope === registration.scope) || null : null;
}

// An inherited registration's folder, relative to this project.
const inheritedFrom = (inventory: Inventory, registration: InvRegistration): string => fromHere(inventory, required(registration.from, `'${registration.name}': an inherited server is read with its folder`));

// -> the pick settled, or - for a pick refused or already installed - the length of the list its line went to, which
// planMcp returns
export function pickTarget(row: CatalogRow, pick: PickAnswer, inventory: Inventory, context: PlanCtx, catalog: Catalog, out: Plan): PickBase | number
{
    if (!row.os.includes(context.platform)) return out.errors.push(`${row.id}: not offered on ${context.platform}`);
    // configure names its target; an install pick only adds, whatever else of this row is installed
    const here = inventory.registrations.filter((registration) => registration.rowId === row.id && !registration.alfredRetired);
    const wanted = pick.target;
    const target = wanted ? here.find((registration) => registration.name === wanted.name && registration.scope === wanted.scope) ?? null : null;
    const current = target ? currentOf(row, target) : null;

    // which apps (D3): the answer, else what the list holds for the target, else Claude Code only
    const listedEntry = target ? listedOf(inventory, target) : null;
    const listedClients = listedEntry ? listedEntry.clients || ['claude'] : ['claude'];
    const clients = pick.clients || listedClients;

    const routeId = pick.route || (current ? current.route : row.recommendedRoute);
    const route = routeId ? row.routes[routeId] : undefined;
    if (!routeId || !route) return out.errors.push(`${row.id}: no ${routeId} route (routes: ${Object.keys(row.routes).join(', ')})`);
    // a fresh pick's scope: the recommended one (spec D5, F2)
    const scope = pick.scope || (current ? current.scope : recommendedScope(row, routeId));
    if (!ALL_SCOPES.includes(scope)) return out.errors.push(`${row.id}: unknown scope '${scope}'`);
    // a stdio route that needs a key holds it written in, which the committed .mcp.json never carries (spec D5); a
    // registration already there is configure's to keep
    // a bridge holds names only (0.4.0, Ruling 6)
    if (scope === 'project' && routeId !== 'remote' && route.runtime !== 'bridge' && route.authMode === 'token' && !(current && current.scope === 'project'))
        return out.errors.push(`${row.id}: its local route needs a key written into the registration, so it is not offered at project scope - the committed .mcp.json carries no key; pick local or global scope, or the hosted route`);
    const bad = inventory.unreadable.find((unreadable) => (unreadable.scope === scope) || (scope !== 'project' && ['local', 'user'].includes(unreadable.scope) && ['local', 'user'].includes(scope)));
    if (bad) return out.errors.push(`${row.id}: the ${scope} scope is unreadable (${bad.file} is ${bad.state}); nothing is written there`);

    const name = resolveName(pick, row, current, context);
    // an install pick already there under this name and scope - a re-run, or a tool installed since: never changed here
    const same = !pick.target && here.find((registration) => registration.name === name && registration.scope === scope);
    for (const registration of here)
    {
        if (registration === target || registration === same || context.changing.has(keyOf('mcp', registration.name, registration.scope))) continue;
        if (registration.scope !== 'inherited') out.notes.push(`${row.id}: also installed as '${registration.name}' at ${registration.scope} scope - left as it is`);
        else if (registration.name !== name) out.notes.push(`${row.id}: also inherited as '${registration.name}' from ${inheritedFrom(inventory, registration)} (${registration.approval}) - change it there`);
    }
    if (same)
    {
        out.expect.push({ kind: 'mcp', row: row.id, name, scope, route: same.route });
        return out.unchanged.push(`${row.id}: '${name}' is already installed at ${scope} scope - a change to it is /alfred-tools:configure`);
    }
    const taken = inventory.registrations.filter((registration) => registration.scope === scope);
    const problem = nameProblem(name, { catalog, taken, self: current ? { name: current.name, scope: current.scope } : null });
    if (problem) return out.errors.push(`${row.id}: ${problem}`);
    // windows-mcp 0.8.8 makes one missed overlay confirmation permanent; another session cannot be seen, so it is named
    if (row.id === 'windows-control' && !target)
    {
        const others = otherWindowsMcp(inventory, name);
        out.notes.push(`windows-control: keep one windows-mcp per Windows desktop - another Claude Code session with it open${others.length ? `, or ${others.join(', ')},` : ''} can leave its tools unavailable until a new session starts it again`);
    }
    for (const registration of inventory.registrations)
    {
        if (registration.name !== name || registration.scope === scope) continue;
        // a parent's copy ranks as project scope, below this project's local and project ones, above user (M2, M3)
        if (registration.scope === 'inherited')
        {
            if (registration.shadowed && registration.shadowed.scope === 'inherited') continue;
            const from = inheritedFrom(inventory, registration);
            out.notes.push(`${row.id}: '${name}' is also inherited from ${from} (${registration.approval}); Claude Code uses ${scope === 'user' ? `the inherited one from ${from} in this project - a .mcp.json server ranks above user scope` : `this project's ${scope} copy`}`);
        }
        else out.notes.push(`${row.id}: '${name}' also exists at ${registration.scope} scope; Claude Code reads local, then project, then user, so the nearer one wins`);
    }
    return { row, target, current, listedClients, clients, routeId, route, scope, name };
}
