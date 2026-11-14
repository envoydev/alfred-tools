// One tool's questions: its route, scope and name, and configure's change questions.
import path from 'node:path';
import { keyOf, fromHere } from '../inventory/inventory.ts';
import { pinOf } from '../inventory/table.ts';
import { ROUTE_WORD, REC, recommendedScope, SCOPE_ORDER, PARENT_HELPER_IN_CHILD, SCOPE_LABEL, scopeText } from './asks-keys.ts';
import { installedItems, rootInUse, ROOT_LABEL, ROOT_MOVES, packed } from './asks-picks.ts';
import * as X from '../inventory/existing.ts';
import type { Catalog, CatalogRow } from '../catalog/types.ts';
import type { Current } from '../entries/types.ts';
import type { Installed, Inventory } from '../inventory/types.ts';
import type { AskCtx, Question, ToolOpts } from './types.ts';
import type { Family } from '../roots/types.ts';

// The configure pick: one option per installed registration, then the servers left on their own, then one per root
// folder in use (spec D7, R3). `keys` maps each label to the key the answers use (`mcp:<name>~<scope>`, `root:<family>`).
export function changeQuestions(inv: Inventory, catalog: Catalog, ctx: Partial<AskCtx> = {}): { calls: Question[][]; keys: Record<string, string> }
{
    const describe = (row: CatalogRow, h: Installed) =>
    {
        const pin = pinOf(row, h.route!, h.entry!);
        return `${ROUTE_WORD[h.route!] || h.route} route${pin ? `, pin ${pin}` : ''}`;
    };
    const items = installedItems(inv, catalog, describe);
    // the servers left on their own (spec D6, R3): a group of their own, whose pick keeps them so or hands them over
    const group = { id: 'own', label: 'On their own' };
    for (const it of X.ownItems(inv, catalog))
    {
        const label = it.kind === 'mcp' ? `${it.name} (${it.label}, ${it.scope}) - on its own` : it.kind === 'plugin' ? `${it.server} (${it.label}, from ${X.ownerOf(it)}) - on its own` : `${it.connector} (${it.label}, claude.ai) - on its own`;
        const description = it.kind === 'mcp' ? 'left on its own at install - pick it to keep it so or let preferred-tools manage it' : `left with ${X.ownerOf(it)} - pick it to keep it so or let install offer preferred-tools' own beside it`;
        items.push({ group, label, description, h: { kind: 'own', key: it.key } });
    }
    const rootGroup = { id: 'roots', label: 'Root folders' };
    for (const family of ['project', 'global'] as Family[])
    {
        const used = rootInUse(inv, family, { ...ctx, catalog });
        if (used) items.push({ group: rootGroup, label: ROOT_LABEL[family]!, description: `${used.path} - pick it to move ${ROOT_MOVES[family]} to another folder`, h: { kind: 'root', key: `root:${family}` } });
    }
    return {
        calls: packed(items, { id: 'change', question: 'which do you want to change?', none: 'change nothing' }),
        keys: Object.fromEntries(items.map((i) => [i.label, i.h!.key || keyOf(i.h!.kind, i.h!.name!, i.h!.scope!)])),
    };
}

// `current`: the route the registration has now, recommended first so 'Keep' is the default.
export function routeQuestion(row: CatalogRow, current: string | null | undefined = null): Question | null
{
    const ids = Object.keys(row.routes);
    if (ids.length < 2) return null;
    const first = current || row.recommendedRoute;
    const order = [first, ...ids.filter((i) => i !== first)];
    const text: Record<string, string> = { remote: 'run by the vendor - no local runtime needed', local: 'runs on this machine', bridge: 'the hosted server at a URL filled from .mcps-secrets each start - a small proxy runs here through npx' };
    return {
        id: `route-${row.id}`, header: 'Route', multiSelect: false, question: ids.length > 2 ? `${row.label}: which route?` : `${row.label}: hosted or local?`,
        options: order.map((r, i) => ({ label: `${ROUTE_WORD[r]![0]!.toUpperCase()}${ROUTE_WORD[r]!.slice(1)}${i === 0 ? REC : ''}`, description: text[r]! })),
    };
}

// Every scope for every row (the user's ruling, 2026-11-10: 'It must give options as user/project/local'). The one left
// out: project for serena on Windows when this machine's profile path has a space - its home must be absolute and
// space-free, and the committed file can only name it as ${USERPROFILE}\.serena.
export function scopesFor(row: CatalogRow, routeId: string, _ctx: AskCtx | null | undefined = null): string[]
{
    // a stdio route that needs a key holds it written in, which the .mcp.json in this folder never carries (spec D5)
    const route = row.routes && row.routes[routeId];
    // a bridge holds names only, never a key (0.4.0)
    const stdioKey = routeId !== 'remote' && route && route.runtime !== 'bridge' && route.authMode === 'token';
    return ['local', 'project', 'user'].filter((s) => s !== 'project' || !stdioKey);
}

// The scopes offered, the recommended one first. `current` is the registration configure changes; for an install,
// `copyOf` lists this row's registrations at other scopes (the copy for every project), whose scopes are not offered again.
export function scopeOrder(row: CatalogRow, _inv: Inventory | null, { route, current = null, copyOf = [], ctx = null }: ToolOpts = {}): string[]
{
    const routeId = route || (current && current.route) || row.recommendedRoute;
    const all = scopesFor(row, routeId, ctx);
    const stranded = strandedScope(row, routeId, current, ctx);
    const rec = current && !stranded ? current.scope! : recommendedScope(row, routeId);
    const free = all.filter((s) => !copyOf.some((c) => c.scope === s));
    const scopes = free.length ? free : all;
    const order = [rec, ...SCOPE_ORDER.filter((s) => s !== rec)].filter((s) => scopes.includes(s));
    return stranded ? [...order, stranded] : order;
}

// The scope a registration has that is no longer offered for its route (0.1.x put a stdio keyed route at project scope,
// its key a ${VAR} from the shell): configure lists it last, as the scope it has now, and recommends another.
const strandedScope = (row: CatalogRow, routeId: string, current: Partial<Current> | null | undefined, ctx: AskCtx | null | undefined) => (current && current.scope && !scopesFor(row, routeId, ctx).includes(current.scope) ? current.scope : null);
const STRANDED_TEXT = 'the scope it has now - it reads its key from the environment Claude Code starts with; a keyed local route is not offered here any more, as the committed .mcp.json carries no key';

// The scope question, or null when one scope is left.
// A hosted keyed route at project scope: a session started in a child folder runs no parent folder's helper (M1). The
// bridge has a helper block too, but its own process reads the key, so it connects there (F3)
const CHILD_NO_KEY = PARENT_HELPER_IN_CHILD ? '' : "; a session started in a child folder connects without the key - Claude Code does not run a parent folder's helper there";
const hostedKeyed = (row: CatalogRow, routeId: string) => Boolean(row.routes && row.routes[routeId] && row.routes[routeId].helper && row.routes[routeId].runtime !== 'bridge');

export function scopeQuestion(row: CatalogRow, inv: Inventory, { route, current = null, copyOf = [], ctx = null }: ToolOpts = {}): Question | null
{
    const routeId = route || (current && current.route) || row.recommendedRoute;
    const order = scopeOrder(row, inv, { route: routeId, current, copyOf, ctx });
    if (order.length < 2) return null;
    return {
        id: `scope-${row.id}`, header: 'Scope', multiSelect: false,
        question: current ? `${row.label}: which scope? Another one moves '${current.name || row.label}' there; /preferred-tools:install adds a second copy instead.` : `${row.label}: which scope?`,
        options: order.slice(0, 4).map((s, i) => ({ label: `${SCOPE_LABEL[s]}${i === 0 ? REC : ''}`, description: s === strandedScope(row, routeId, current, ctx) ? STRANDED_TEXT : `${scopeText(s)}${s === 'project' && hostedKeyed(row, routeId) ? CHILD_NO_KEY : ''}` })),
    };
}

// a per-project registration name: the project folder's name before the tool's
const perProjectName = (row: CatalogRow, ctx: AskCtx | null | undefined) => (ctx ? `${path.basename(ctx.project).replace(/[^A-Za-z0-9_-]+/g, '-')}-${row.name}`.slice(0, 64) : `project-${row.name}`);

// The registration name a `names` answer stands for: 'keep' (or none) - the name it has now, else the original;
// 'prefixed' - the per-project name; else the name itself.
export function nameFor(row: CatalogRow, name: string | null | undefined, current: Partial<Current> | null | undefined, ctx: AskCtx | null | undefined): string
{
    if (!name || name === 'keep') return current ? current.name! : row.name;
    return name === 'prefixed' ? perProjectName(row, ctx) : name;
}

export function nameQuestion(row: CatalogRow, inv: Inventory, { current = null, copyOf = [], ctx = null }: ToolOpts = {}): Question
{
    const orig = row.name;
    const shadows = copyOf.find((c) => c.name === orig);
    const options = current && current.name !== orig
        ? [{ label: `Keep \`${current.name}\`${REC}`, description: 'the name it has now' }, { label: `Use \`${orig}\``, description: 'the original name' }]
        : [{ label: `Keep \`${orig}\`${REC}`, description: shadows ? `the original name; in this project it is used instead of ${shadows.scope === 'inherited' ? `the one inherited from ${fromHere(inv, shadows.from!)}` : 'the copy for every project'}` : 'the original name' }, { label: `Use \`${perProjectName(row, ctx)}\``, description: 'a per-project name' }];
    return { id: `name-${row.id}`, header: 'Name', multiSelect: false, question: `${row.label}: registration name?`, options };
}

