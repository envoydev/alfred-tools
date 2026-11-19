// key-to-launcher (0.7.0, spec Step 5): a stdio key server at local or user scope that holds its key in the registration
// moves to the launcher - node <root>/mcp-bridge.js --run <ENV>=<KEY_NAME> -- <command> <args> - which reads the key from
// .mcps-secrets at each start. The key is compared in this process only; a finding names a file and a name, never a value.
import * as common from './common.ts';
import * as keys from '../keys/keys.ts';
import * as kept from '../core/kept.ts';
import * as roots from '../roots/roots.ts';
import * as cursorMcp from '../cursor/cursor-mcp.ts';
import { pathFor } from '../entries/platform.ts';
import { launcherPlace } from '../entries/entry.ts';
import { launcherParts } from '../entries/launcher.ts';
import { launcherForm, launcherRoute } from '../entries/launcher-form.ts';
import { keyIn } from './registration.ts';
import { useRoots, fileSteps } from '../plan/root-files.ts';
import { repairTail } from '../plan/repair-tail.ts';
import { FIX_ID, LAUNCHER_SCOPES, ONE_VAR } from './constants.ts';
import type { ServerEntry } from '../core/types.ts';
import type { CatalogRoute, CatalogRow } from '../catalog/types.ts';
import type { Roots } from '../entries/types.ts';
import type { McpAddStep, McpReplaceStep, PlanStep } from '../plan/types.ts';
import type { InvRegistration } from '../inventory/types.ts';
import type { ListServer } from '../mcps-list/types.ts';
import type { Finding, FixCtx } from './types.ts';

const rootsOf = (context: FixCtx): Roots => roots.resolveRoots(context.inventory, null, { project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog }).roots;
const chainOf = (context: FixCtx, scope: string, resolved: Roots): string[] => keys.stdioChain({ scope, projectRoot: resolved.project, globalRoot: resolved.global, platform: context.platform });
const isLauncherScope = (scope: string): boolean => (LAUNCHER_SCOPES as readonly string[]).includes(scope);
const placeOf = (context: FixCtx, scope: string, resolved: Roots | undefined) => launcherPlace(scope, { project: context.inventory.project, platform: context.platform, home: context.home, roots: resolved });

// The list's entry for a registration, if its list holds one.
function listServerOf(context: FixCtx, registration: InvRegistration): ListServer | undefined
{
    const lists = Object.values(context.inventory.lists ?? {}).flatMap((list) => (list && !list.note && !list.old ? list.servers : []));
    return lists.find((server) => server.name === registration.name && server.scope === registration.scope);
}

// The key a registration holds in its env, once a former --api-key is moved there - the text between the route's template.
function heldKeyOf(entry: ServerEntry, route: CatalogRoute): string | null
{
    const field = keys.tokenFields(entry, route).find((candidate) => candidate.at[0] === 'env');
    return field && route.tokenVar ? keyIn(keys.valueAt(entry, field.at), field.template, route.tokenVar) : null;
}

// A held key the file's value would replace for the worse: a real key (not empty, not one ${NAME} placeholder, not the kept
// marker) that differs from the chain's value is the only copy of the one that works. Compared in process, never printed.
const isOnlyCopy = (held: string, fileValue: string): boolean => held !== '' && !ONE_VAR.test(held) && !held.includes(kept.MARKER) && held !== fileValue;

// The scope's root, when its mcp-bridge.js is one the user edited: the launcher would run it, so it is never overwritten here.
const editedBridgeRoot = (context: FixCtx, resolved: Roots, scope: string): string | null =>
{
    const root = resolved[roots.familyOf(scope)];
    return root && roots.shippedState('bridge', pathFor(context.platform).join(root, roots.FILES.bridge)).state === 'edited' ? root : null;
};
const editedBridgeText = (root: string): string => `mcp-bridge.js in ${root} changed since alfred-tools wrote it - /alfred-tools:fix (helper-stale) rewrites it, or delete it, then run fix again`;

// Cursor's file, when the registration's Cursor copy holds a real key that differs from the file's value (compared in
// process, never printed). Cursor reads a user-scope server only, and only one the list marks for it.
function cursorCopyWithOtherKey(context: FixCtx, registration: InvRegistration, route: CatalogRoute, fileValue: string, listed: ListServer | undefined): string | null
{
    if (registration.scope !== 'user' || !(listed?.clients ?? []).includes('cursor')) return null;
    const file = cursorMcp.fileFor('global', { platform: context.platform, project: context.inventory.project, home: context.home, env: context.env ?? {} });
    const read = cursorMcp.readCursor(file);
    const copy = read.state === 'ok' ? read.servers[registration.name] : undefined;
    const held = copy ? heldKeyOf(keys.moveArgKeyToEnv(copy, route), route) : null;
    return held !== null && isOnlyCopy(held, fileValue) ? file : null;
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
        const listed = listServerOf(context, registration);
        const listKey = listed?.key ?? null;
        const [, placeholder] = ONE_VAR.exec(held) ?? [];
        const name = [placeholder, keys.nameOfValue(chain, held), listKey, route.tokenVar].find((candidate) => candidate && keys.valueIn(chain, candidate));
        const hit = name ? keys.valueIn(chain, name) : null;
        const extra = { route: registration.route, roots: resolved, chain, ...(name ? { keyName: name } : {}) };
        if (!name || !hit)
        {
            const where = `put it in ${chain[0] ?? '.mcps-secrets'} as ${listKey || route.tokenVar}, then run fix again`;
            return [held === ''
                ? common.finding(FIX_ID.keyToLauncher, registration, 'the registration has no key to move', { ...extra, blocked: `${registration.name} has no key - ${where}` })
                : common.finding(FIX_ID.keyToLauncher, registration, 'the registration holds its key, which no .mcps-secrets holds', { ...extra, blocked: `${registration.name} holds a key no .mcps-secrets holds - ${where}` })];
        }
        // a placeholder or an empty field holds no key to lose; a real key that differs from the file's is the only copy of the one that works
        if (isOnlyCopy(held, hit.value))
            return [common.finding(FIX_ID.keyToLauncher, registration, `the registration holds a key that differs from the one in ${hit.file}`, { ...extra, blocked: `${registration.name} holds a key that differs from the one in ${hit.file} - put the key that works in ${hit.file} as ${name} (or run fix, whose token-sync takes the file's), then run fix again` })];
        // the move rewrites Cursor's user-scope copy from the list: a different real key there is the only copy of the one that works
        const cursorFile = cursorCopyWithOtherKey(context, registration, route, hit.value, listed);
        if (cursorFile !== null)
            return [common.finding(FIX_ID.keyToLauncher, registration, `Cursor's copy holds a key that differs from the one in ${hit.file}`, { ...extra, blocked: `${registration.name}: Cursor's copy in ${cursorFile} holds a key that differs from the one in ${hit.file} - put the key that works in ${hit.file} as ${name} (or run fix, whose token-sync takes the file's), then run fix again` })];
        const editedIn = editedBridgeRoot(context, resolved, registration.scope);
        if (editedIn !== null)
            return [common.finding(FIX_ID.keyToLauncher, registration, 'the root\'s mcp-bridge.js is not the one alfred-tools wrote', { ...extra, blocked: editedBridgeText(editedIn) })];
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
// value is filled into a launcher route's entry. null for any other entry, and for one that holds a key differing from the
// file's value (the plain form is restored with it, as in 0.6.0): the caller's own key fill handles both.
export function restoredLauncher(entry: ServerEntry, listKey: string | null, row: CatalogRow, routeId: string, scope: string, context: FixCtx): ServerEntry | null
{
    const route = row.routes[routeId];
    if (!route || !route.tokenVar || !isLauncherScope(scope) || !launcherRoute(route, routeId, scope) || launcherParts(entry)) return null;
    const resolved = rootsOf(context);
    const name = listKey || route.tokenVar;
    const hit = keys.valueIn(chainOf(context, scope, resolved), name);
    if (!hit) return null;
    const held = heldKeyOf(keys.moveArgKeyToEnv(entry, route), route);
    return held !== null && isOnlyCopy(held, hit.value) ? null : launcherForm(route, name, placeOf(context, scope, resolved), entry);
}

// A restore that cannot be planned for one registration, with the text to show: the run skips that finding, writes nothing
// for it and goes on with the others (fix.ts), as key-to-launcher's detect blocks one finding.
export class RestoreBlocked extends Error {}

// The plan of a restore that built a launcher (spec Step 5): the root's helper and bridge first, as fix writes them for a
// registration fix, then the registration, then the list entry and Cursor's copy from it, then the root's record - so the
// launcher starts, and the list holds the launcher form, not the plain one the next run would find drifted. A root whose
// bridge was edited blocks it (RestoreBlocked) and nothing is written, as key-to-launcher's detect does. A .gitignore gap
// goes to `notes`.
export function restoreLauncherSteps(step: McpReplaceStep | McpAddStep, context: FixCtx, notes: string[] = []): PlanStep[]
{
    const resolved = rootsOf(context);
    const editedIn = editedBridgeRoot(context, resolved, step.scope);
    if (editedIn !== null) throw new RestoreBlocked(`${step.name} (${step.scope}): ${editedBridgeText(editedIn)}`);
    const fileContext = { platform: context.platform, project: context.inventory.project, home: context.home, roots: resolved, uses: [] };
    useRoots(fileContext, step.scope, { helper: true, bridge: true, keyFile: null, keyName: null, data: null });
    const files = fileSteps(context.inventory, fileContext, { notes });
    const tail = repairTail(context.inventory, { platform: context.platform, project: context.inventory.project, home: context.home, env: context.env, catalog: context.catalog, notes }, [step]);
    return [...files.before, step, ...tail, ...files.after];
}

// A key-to-launcher finding waits while its registration has a Claude Code client-drift finding to settle first: the move
// would write the drifted entry into the list and the restore or keep answer would find nothing to do. An answer of
// 'leave' settles it as it is, so the move goes on.
export const waitsForDrift = (finding: Finding, found: Finding[], input: Record<string, string>): boolean =>
    finding.id === FIX_ID.keyToLauncher && found.some((candidate) => candidate.id === 'client-drift' && candidate.app === 'claude' && candidate.name === finding.name && candidate.scope === finding.scope && (candidate.driftKey === undefined || input[candidate.driftKey] !== 'leave'));
