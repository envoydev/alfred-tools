// key-to-launcher (0.7.0, spec Step 5): a stdio key server at local or user scope that holds its key in the registration
// moves to the launcher - node <root>/mcp-bridge.js --run <ENV>=<KEY_NAME> -- <command> <args> - which reads the key from
// .mcps-secrets at each start. The key is compared in this process only; a finding names a file and a name, never a value.
import * as common from './common.ts';
import * as keys from '../keys/keys.ts';
import * as roots from '../roots/roots.ts';
import { pathFor } from '../entries/platform.ts';
import { launcherPlace } from '../entries/entry.ts';
import { launcherForm, launcherParts, launcherRoute } from '../entries/launcher.ts';
import { keyIn } from './registration.ts';
import { FIX_ID, LAUNCHER_SCOPES, ONE_VAR } from './constants.ts';
import type { ServerEntry } from '../core/types.ts';
import type { CatalogRoute, CatalogRow } from '../catalog/types.ts';
import type { Roots } from '../entries/types.ts';
import type { InvRegistration } from '../inventory/types.ts';
import type { Finding, FixCtx } from './types.ts';

const rootsOf = (context: FixCtx): Roots => roots.resolveRoots(context.inventory, null, { project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog }).roots;
const chainOf = (context: FixCtx, scope: string, resolved: Roots): string[] => keys.stdioChain({ scope, projectRoot: resolved.project, globalRoot: resolved.global, platform: context.platform });
const isLauncherScope = (scope: string): boolean => (LAUNCHER_SCOPES as readonly string[]).includes(scope);
const placeOf = (context: FixCtx, scope: string, resolved: Roots | undefined) => launcherPlace(scope, { project: context.inventory.project, platform: context.platform, home: context.home, roots: resolved });

// The key name the list records for a registration, if its list holds one.
function listKeyOf(context: FixCtx, registration: InvRegistration): string | null
{
    const lists = Object.values(context.inventory.lists ?? {}).flatMap((list) => (list && !list.note && !list.old ? list.servers : []));
    return lists.find((server) => server.name === registration.name && server.scope === registration.scope)?.key ?? null;
}

// The key a registration holds in its env, once a former --api-key is moved there - the text between the route's template.
function heldKeyOf(entry: ServerEntry, route: CatalogRoute): string | null
{
    const field = keys.tokenFields(entry, route).find((candidate) => candidate.at[0] === 'env');
    return field && route.tokenVar ? keyIn(keys.valueAt(entry, field.at), field.template, route.tokenVar) : null;
}

export function keyToLauncherDetect(context: FixCtx): Finding[]
{
    const resolved = rootsOf(context);
    return common.registrationsOf(context, FIX_ID.keyToLauncher).flatMap((registration) =>
    {
        const route = common.routeOf(context, registration);
        if (!route || !registration.route || !route.tokenVar || !isLauncherScope(registration.scope) || !launcherRoute(route, registration.route, registration.scope) || launcherParts(registration.entry)) return [];
        const held = heldKeyOf(keys.moveArgKeyToEnv(registration.entry, route), route);
        if (held === null) return [];
        const chain = chainOf(context, registration.scope, resolved);
        const listKey = listKeyOf(context, registration);
        const [, placeholder] = ONE_VAR.exec(held) ?? [];
        const name = [placeholder, keys.nameOfValue(chain, held), listKey, route.tokenVar].find((candidate) => candidate && keys.valueIn(chain, candidate));
        const hit = name ? keys.valueIn(chain, name) : null;
        const extra = { route: registration.route, roots: resolved, chain, ...(name ? { keyName: name } : {}) };
        if (!name || !hit)
            return [common.finding(FIX_ID.keyToLauncher, registration, 'the registration holds its key, which no .mcps-secrets holds', { ...extra, blocked: `${registration.name} holds a key no .mcps-secrets holds - put it in ${chain[0] ?? '.mcps-secrets'} as ${listKey || route.tokenVar}, then run fix again` })];
        // a placeholder or an empty field holds no key to lose; a real key that differs from the file's is the only copy of the one that works
        if (held !== '' && !held.includes('${') && held !== hit.value)
            return [common.finding(FIX_ID.keyToLauncher, registration, `the registration holds a key that differs from the one in ${hit.file}`, { ...extra, blocked: `${registration.name} holds a key that differs from the one in ${hit.file} - put the key that works in ${hit.file} as ${name} (or run fix, whose token-sync takes the file's), then run fix again` })];
        const root = resolved[roots.familyOf(registration.scope)];
        if (root && roots.shippedState('bridge', pathFor(context.platform).join(root, roots.FILES.bridge)).state === 'edited')
            return [common.finding(FIX_ID.keyToLauncher, registration, 'the root\'s mcp-bridge.js is not the one alfred-tools wrote', { ...extra, blocked: `mcp-bridge.js in ${root} changed since alfred-tools wrote it - /alfred-tools:fix (helper-stale) rewrites it, or delete it, then run fix again` })];
        return [common.finding(FIX_ID.keyToLauncher, registration, `the registration holds its key - it moves to the launcher, which reads ${name} from ${hit.file} each time the server starts`, extra)];
    });
}

export function keyToLauncherFix(entry: ServerEntry, finding: Finding, context: FixCtx): ServerEntry
{
    const keyName = common.fieldOf(finding, 'keyName');
    const chain = common.fieldOf(finding, 'chain');
    if (!keys.valueIn(chain, keyName)) throw new Error(`${keyName} is filled in none of ${chain.join(', ')} any more - nothing written`);
    const route = common.findingRoute(context, finding);
    const launched = launcherForm(route, keyName, placeOf(context, common.fieldOf(finding, 'scope'), finding.roots), keys.moveArgKeyToEnv(entry, route));
    if (!launched) throw new Error(`${finding.name}: no key in its env to move - nothing written`);
    return launched;
}

// A list entry in the 0.6.0 plain form, restored to Claude Code: the launcher form of it when its key name is filled, so no
// value is filled into a launcher route's entry. null for any other entry, which the caller's own key fill handles.
export function restoredLauncher(entry: ServerEntry, listKey: string | null, row: CatalogRow, routeId: string, scope: string, context: FixCtx): ServerEntry | null
{
    const route = row.routes[routeId];
    if (!route || !route.tokenVar || !isLauncherScope(scope) || !launcherRoute(route, routeId, scope) || launcherParts(entry)) return null;
    const resolved = rootsOf(context);
    const name = listKey || route.tokenVar;
    return keys.valueIn(chainOf(context, scope, resolved), name) ? launcherForm(route, name, placeOf(context, scope, resolved), entry) : null;
}
