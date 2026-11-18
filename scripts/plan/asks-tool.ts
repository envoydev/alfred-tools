// One tool's questions: its route, scope and name, and configure's change questions.
import path from 'node:path';
import { keyOf, fromHere } from '../inventory/inventory.ts';
import { pinOf } from '../inventory/table.ts';
import { ROUTE_WORD, RECOMMENDED_SUFFIX, recommendedScope, scopesFor, SCOPE_ORDER, PARENT_HELPER_IN_CHILD, CHILD_FOLDER_REMEDY, SCOPE_LABEL, scopeText, capitalized } from './asks-keys.ts';
import { installedItems, rootInUse, ROOT_LABEL, ROOT_MOVES, packed } from './asks-picks.ts';
import * as existingServers from '../inventory/existing.ts';
import * as roots from '../roots/roots.ts';
import { LABEL, PREFIX } from './record-constants.ts';
import { EDGE_DASHES, MAX_NAME_LENGTH, MAX_OPTIONS, NAME_UNSAFE_RUN, PROJECT_NAME_FALLBACK } from './constants.ts';
import type { Catalog, CatalogRow } from '../catalog/types.ts';
import type { Current } from '../entries/types.ts';
import type { Installed, Inventory } from '../inventory/types.ts';
import type { AskCtx, Question, ToolOpts } from './types.ts';

// The configure pick: one option per installed registration, then the servers left on their own, then one per root
// folder in use (spec D7, R3). `keys` maps each label to the key the answers use (`mcp:<name>~<scope>`, `root:<family>`).
export function changeQuestions(inventory: Inventory, catalog: Catalog, context: Partial<AskCtx> = {}): { calls: Question[][]; keys: Record<string, string> }
{
    const describe = (row: CatalogRow, installed: Installed) =>
    {
        const pin = pinOf(row, installed.route!, installed.entry!);
        return `${ROUTE_WORD[installed.route!] || installed.route} route${pin ? `, pin ${pin}` : ''}`;
    };
    const items = installedItems(inventory, catalog, describe);
    // the servers left on their own (spec D6, R3): a group of their own, whose pick keeps them so or hands them over
    const group = { id: 'own', label: 'On their own' };
    for (const ownItem of existingServers.ownItems(inventory, catalog))
    {
        const label = ownItem.kind === 'mcp' ? `${ownItem.name} (${ownItem.label}, ${ownItem.scope}) - on its own` : ownItem.kind === 'plugin' ? `${ownItem.server} (${ownItem.label}, from ${existingServers.ownerOf(ownItem)}) - on its own` : `${ownItem.connector} (${ownItem.label}, claude.ai) - on its own`;
        const description = ownItem.kind === 'mcp' ? 'left on its own at install - pick it to keep it so or let alfred-tools manage it' : `left with ${existingServers.ownerOf(ownItem)} - pick it to keep it so or let install offer alfred-tools' own beside it`;
        items.push({ group, label, description, target: { kind: 'own', key: ownItem.key } });
    }
    const rootGroup = { id: 'roots', label: 'Root folders' };
    for (const family of roots.FAMILIES)
    {
        const used = rootInUse(inventory, family, { ...context, catalog });
        if (used) items.push({ group: rootGroup, label: ROOT_LABEL[family]!, description: `${used.path} - pick it to move ${ROOT_MOVES[family]} to another folder`, target: { kind: 'root', key: `root:${family}` } });
    }
    return {
        calls: packed(items, { id: 'change', question: 'which do you want to change?', none: 'change nothing' }),
        keys: Object.fromEntries(items.map((item) => [item.label, item.target!.key || keyOf(item.target!.kind, item.target!.name!, item.target!.scope!)])),
    };
}

// `current`: the route the registration has now, recommended first so 'Keep' is the default.
export function routeQuestion(row: CatalogRow, current: string | null | undefined = null): Question | null
{
    const ids = Object.keys(row.routes);
    if (ids.length < 2) return null;
    const first = current || row.recommendedRoute;
    const order = [first, ...ids.filter((routeId) => routeId !== first)];
    const text: Record<string, string> = { remote: 'run by the vendor - no local runtime needed', local: 'runs on this machine', bridge: 'the hosted server at a URL filled from .mcps-secrets each start - a small proxy runs here through npx' };
    return {
        id: `${PREFIX.route}${row.id}`, header: 'Route', multiSelect: false, question: ids.length > 2 ? `${row.label}: which route?` : `${row.label}: hosted or local?`,
        options: order.map((routeId, i) => ({ label: `${capitalized(ROUTE_WORD[routeId]!)}${i === 0 ? RECOMMENDED_SUFFIX : ''}`, description: text[routeId]! })),
    };
}

export { scopesFor };

// The scopes offered, the recommended one first. `current` is the registration configure changes; for an install,
// `copyOf` lists this row's registrations at other scopes (the copy for every project), whose scopes are not offered again.
export function scopeOrder(row: CatalogRow, _inventory: Inventory | null, { route, current = null, copyOf = [], context: context = null }: ToolOpts = {}): string[]
{
    const routeId = route || (current && current.route) || row.recommendedRoute;
    const all = scopesFor(row, routeId, context);
    const stranded = strandedScope(row, routeId, current, context);
    const recommended = current && !stranded ? current.scope! : recommendedScope(row, routeId);
    const free = all.filter((scope) => !copyOf.some((copy) => copy.scope === scope));
    const scopes = free.length ? free : all;
    const order = [recommended, ...SCOPE_ORDER.filter((scope) => scope !== recommended)].filter((scope) => scopes.includes(scope));
    return stranded ? [...order, stranded] : order;
}

// The scope a registration has that is no longer offered for its route (0.1.x put a stdio keyed route at project scope,
// its key a ${VAR} from the shell): configure lists it last, as the scope it has now, and recommends another.
const strandedScope = (row: CatalogRow, routeId: string, current: Partial<Current> | null | undefined, context: AskCtx | null | undefined) => (current && current.scope && !scopesFor(row, routeId, context).includes(current.scope) ? current.scope : null);
const STRANDED_TEXT = 'the scope it has now - it reads its key from the environment Claude Code starts with; a keyed local route is not offered here any more, as the committed .mcp.json carries no key';

// The scope question, or null when one scope is left.
// A hosted keyed route at project scope: a session started in a child folder runs no parent folder's helper (M1). The
// bridge has a helper block too, but its own process reads the key, so it connects there (F3)
const CHILD_NO_KEY = PARENT_HELPER_IN_CHILD ? '' : `; a session started in a child folder connects without the key - Claude Code does not run a parent folder's helper there; ${CHILD_FOLDER_REMEDY}`;
const hostedKeyed = (row: CatalogRow, routeId: string) => Boolean(row.routes && row.routes[routeId] && row.routes[routeId].helper && row.routes[routeId].runtime !== 'bridge');

export function scopeQuestion(row: CatalogRow, inventory: Inventory, { route, current = null, copyOf = [], context: context = null }: ToolOpts = {}): Question | null
{
    const routeId = route || (current && current.route) || row.recommendedRoute;
    const order = scopeOrder(row, inventory, { route: routeId, current, copyOf, context: context });
    if (order.length < 2) return null;
    return {
        id: `${PREFIX.scope}${row.id}`, header: 'Scope', multiSelect: false,
        question: current ? `${row.label}: which scope? Another one moves '${current.name || row.label}' there; /alfred-tools:install adds a second copy instead.` : `${row.label}: which scope?`,
        options: order.slice(0, MAX_OPTIONS).map((scope, i) => ({ label: `${SCOPE_LABEL[scope]}${i === 0 ? RECOMMENDED_SUFFIX : ''}`, description: scope === strandedScope(row, routeId, current, context) ? STRANDED_TEXT : `${scopeText(scope)}${scope === 'project' && hostedKeyed(row, routeId) ? CHILD_NO_KEY : ''}` })),
    };
}

// A per-project registration name: the project folder's name - each run of characters a name may not hold one dash, and
// no dash at its ends; 'project' when nothing is left - before the tool's, cut to the name limit. The name question offers
// it and a 'prefixed' answer writes it (pick.ts), so the two cannot differ.
export const perProjectName = (rowName: string, project: string | null | undefined): string => `${(project ? path.basename(project).replace(NAME_UNSAFE_RUN, '-').replace(EDGE_DASHES, '') : '') || PROJECT_NAME_FALLBACK}-${rowName}`.slice(0, MAX_NAME_LENGTH);

// The registration name a `names` answer stands for: 'keep' (or none) - the name it has now, else the original;
// 'prefixed' - the per-project name; else the name itself.
export function nameFor(row: CatalogRow, name: string | null | undefined, current: Partial<Current> | null | undefined, context: AskCtx | null | undefined): string
{
    if (!name || name === 'keep') return current ? current.name! : row.name;
    return name === 'prefixed' ? perProjectName(row.name, context?.project) : name;
}

export function nameQuestion(row: CatalogRow, inventory: Inventory, { current = null, copyOf = [], context: context = null }: ToolOpts = {}): Question
{
    const original = row.name;
    const shadows = copyOf.find((copy) => copy.name === original);
    const options = current && current.name !== original
        ? [{ label: `${LABEL.keep}\`${current.name}\`${RECOMMENDED_SUFFIX}`, description: 'the name it has now' }, { label: `Use \`${original}\``, description: 'the original name' }]
        : [{ label: `${LABEL.keep}\`${original}\`${RECOMMENDED_SUFFIX}`, description: shadows ? `the original name; in this project it is used instead of ${shadows.scope === 'inherited' ? `the one inherited from ${fromHere(inventory, shadows.from!)}` : 'the copy for every project'}` : 'the original name' }, { label: `Use \`${perProjectName(original, context?.project)}\``, description: 'a per-project name' }];
    return { id: `${PREFIX.name}${row.id}`, header: 'Name', multiSelect: false, question: `${row.label}: registration name?`, options };
}

