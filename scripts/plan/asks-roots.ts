import { installedOf } from '../inventory/inventory.ts';
import * as roots from '../roots/roots.ts';
import { RECOMMENDED_SUFFIX } from './asks-keys.ts';
import { scopeOrder } from './asks-tool.ts';
import type { Catalog, CatalogRow } from '../catalog/types.ts';
import type { Family } from '../roots/types.ts';
import type { Inventory } from '../inventory/types.ts';
import type { AskCtx, Asked, Picks, Question } from './types.ts';

// ---- the root questions (spec D2) ----------------------------------------------------------------------------------
// One question per scope family a pick or a recorded answer needs, never per tool. 'A folder you name' is asked next, in
// one plain line.
const ROOT_HEADER: Record<string, string> = { project: 'Project root', global: 'Global root' };
const ROOT_TEXT: Record<string, string> = {
    project: "Which folder holds this project's keys, key helper and tool data (project and local scope)?",
    global: 'Which folder holds the keys, key helper and tool data for every project (global scope)?',
};

// A pick needs a root when it has a data folder or a key: the key file and the helper live in the root.
export function needsRoot(row: CatalogRow, routeId: string): boolean
{
    if (row.kind !== 'mcp') return false;
    const route = row.routes && row.routes[routeId];
    return Boolean(row.locations) || Boolean(route && (route.tokenVar || route.helper));
}

// The families the questions input needs a root for: each pick at its answered (else recommended) scope.
export function rootFamilies(inventory: Inventory, picks: Picks | null | undefined, catalog: Catalog, context: AskCtx): Family[]
{
    const out = new Set<string>();
    const routes = (picks && picks.routes) || {};
    const scopes = (picks && picks.scopes) || {};
    for (const id of (picks && picks.rows) || [])
    {
        const row = catalog.byId.get(id);
        if (!row) continue;
        const routeId = routes[id] || row.recommendedRoute;
        if (!needsRoot(row, routeId)) continue;
        const scope = scopes[id] || scopeOrder(row, inventory, { route: routeId, ctx: context, copyOf: installedOf(inventory, id) })[0]!;
        out.add(roots.familyOf(scope));
    }
    return (['project', 'global'] as Family[]).filter((family) => out.has(family));
}

// -> { question, answers: { <label as shown>: { family, id, root } } }
export function rootQuestion(inventory: Inventory, family: Family, context: AskCtx): Asked<{ family: Family; id: string; root: string | null }>
{
    const options = roots.options(inventory, family, context).map((option, i) => ({ ...option, label: `${option.label}${i === 0 ? RECOMMENDED_SUFFIX : ''}` }));
    return {
        question: { id: `root-${family}`, header: ROOT_HEADER[family]!, multiSelect: false, question: ROOT_TEXT[family]!, options: options.map((option) => ({ label: option.label, description: option.description! })) },
        answers: Object.fromEntries(options.map((option) => [option.label, { family, id: option.id, root: option.root }])),
    };
}

export function rootsBlock(inventory: Inventory, picks: Picks | null | undefined, catalog: Catalog, context: AskCtx): { questions: Question[]; answers: Record<string, Record<string, unknown>> }
{
    const out: { questions: Question[]; answers: Record<string, Record<string, unknown>> } = { questions: [], answers: {} };
    for (const family of rootFamilies(inventory, picks, catalog, context))
    {
        const rootAsk = rootQuestion(inventory, family, { ...context, catalog });
        out.questions.push(rootAsk.question);
        out.answers[rootAsk.question.id] = rootAsk.answers;
    }
    return out;
}

