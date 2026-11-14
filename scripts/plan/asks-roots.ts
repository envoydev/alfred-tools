import { installedOf } from '../inventory/inventory.ts';
import * as roots from '../roots/roots.ts';
import { REC } from './asks-keys.ts';
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
export function rootFamilies(inv: Inventory, picks: Picks | null | undefined, catalog: Catalog, ctx: AskCtx): Family[]
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
        const scope = scopes[id] || scopeOrder(row, inv, { route: routeId, ctx, copyOf: installedOf(inv, id) })[0]!;
        out.add(roots.familyOf(scope));
    }
    return (['project', 'global'] as Family[]).filter((f) => out.has(f));
}

// -> { question, answers: { <label as shown>: { family, id, root } } }
export function rootQuestion(inv: Inventory, family: Family, ctx: AskCtx): Asked<{ family: Family; id: string; root: string | null }>
{
    const opts = roots.options(inv, family, ctx).map((o, i) => ({ ...o, label: `${o.label}${i === 0 ? REC : ''}` }));
    return {
        question: { id: `root-${family}`, header: ROOT_HEADER[family]!, multiSelect: false, question: ROOT_TEXT[family]!, options: opts.map((o) => ({ label: o.label, description: o.description! })) },
        answers: Object.fromEntries(opts.map((o) => [o.label, { family, id: o.id, root: o.root }])),
    };
}

export function rootsBlock(inv: Inventory, picks: Picks | null | undefined, catalog: Catalog, ctx: AskCtx): { questions: Question[]; answers: Record<string, Record<string, unknown>> }
{
    const out: { questions: Question[]; answers: Record<string, Record<string, unknown>> } = { questions: [], answers: {} };
    for (const family of rootFamilies(inv, picks, catalog, ctx))
    {
        const r = rootQuestion(inv, family, { ...ctx, catalog });
        out.questions.push(r.question);
        out.answers[r.question.id] = r.answers;
    }
    return out;
}

