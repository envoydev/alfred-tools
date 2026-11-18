// The root's old copy of serena's context file: retired once no registration names it. Shared by fix (serena-context) and
// by a plan that rewrites a serena registration from the root's copy to the home's (rename, move, root change).
import { pathFor } from '../entries/platform.ts';
import { contextArgAt } from '../entries/entry.ts';
import * as roots from '../roots/roots.ts';
import type { ServerEntry } from '../core/types.ts';
import type { PlanStep, RetireCtx, RetireShippedStep, Rewrite } from './types.ts';

const rootContext = (context: RetireCtx) => ({ project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog });
const contextFileOf = (entry: ServerEntry | null | undefined, context: RetireCtx): string | null =>
{
    const at = contextArgAt(entry);
    return at >= 0 ? roots.absOf(entry!.args![at], rootContext(context)) : null;
};
const nameScopeKey = (name: string, scope: string) => `${name}\u0000${scope}`;

// The registrations other than `except` that name `file` as their --context: the inventory's, and the Cursor copies the
// lists hold. -> their names
function namedBy(file: string, context: RetireCtx, except: Set<string>): string[]
{
    const names = new Set<string>();
    for (const registration of context.inventory.registrations)
        if (!except.has(nameScopeKey(registration.name, registration.scope)) && contextFileOf(registration.entry, context) === file) names.add(registration.name);
    for (const list of Object.values(context.inventory.lists || {}))
        for (const server of (list && !list.note ? list.servers : []))
            if (!except.has(nameScopeKey(server.name, server.scope)) && contextFileOf(server.cursorEntry, context) === file) names.add(server.name);
    return [...names];
}

// The registrations a plan's steps rewrite, as read: an mcp-replace, and an mcp-move by the name and scope it moves from.
export function rewritesOf(steps: PlanStep[]): Rewrite[]
{
    return steps.flatMap((step): Rewrite[] =>
    {
        if (step.op === 'mcp-replace') return [{ name: step.name, scope: step.scope, old: step.old, entry: step.entry }];
        if (step.op === 'mcp-move') return [{ name: step.from.name, scope: step.from.scope, old: step.old, entry: step.entry }];
        return [];
    });
}

// A step for each root copy of serena-context.yml that a rewritten registration named and no longer does: the apply removes
// it only when it is this plugin's own, unedited copy and `namedBy` is empty.
export function retireContextSteps(context: RetireCtx, rewrites: Rewrite[]): RetireShippedStep[]
{
    const pathApi = pathFor(context.platform);
    const familyRoots = roots.resolveRoots(context.inventory, null, rootContext(context)).roots;
    const except = new Set(rewrites.map((rewrite) => nameScopeKey(rewrite.name, rewrite.scope)));
    const out = new Map<string, RetireShippedStep>();
    for (const rewrite of rewrites)
    {
        const file = contextFileOf(rewrite.old, context);
        const root = familyRoots[roots.familyOf(rewrite.scope)];
        if (!file || !root || file !== pathApi.join(root, roots.FILES.serenaContext) || file === contextFileOf(rewrite.entry, context)) continue;
        out.set(file, { op: 'retire-shipped', kind: 'serenaContext', file, namedBy: namedBy(file, context, except), why: `${file}: the old copy of serena's context file, now in each serena's home - removed when it is unedited and no registration names it` });
    }
    return [...out.values()];
}
