// The root's old copy of serena's context file: retired once no registration names it. Shared by fix (serena-context) and
// by a plan that rewrites a serena registration from the root's copy to the home's (rename, move, root change).
import { pathFor } from '../entries/platform.ts';
import { contextArgAt, foreignScript, helperParts } from '../entries/entry.ts';
import { FOREIGN_HELPER_FILE } from '../entries/constants.ts';
import * as roots from '../roots/roots.ts';
import type { ServerEntry } from '../core/types.ts';
import type { PlanStep, RetireCtx, RetireHelperStep, RetireShippedStep, Rewrite } from './types.ts';

const rootContext = (context: RetireCtx) => ({ project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog });
const contextFileOf = (entry: ServerEntry | null | undefined, context: RetireCtx): string | null =>
{
    const file = entry?.args?.[contextArgAt(entry)];
    return file === undefined ? null : roots.absOf(file, rootContext(context));
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

// The hand-built helper script a command runs: its absolute path, and why the plan leaves it - null when it may be retired.
// Only a file named mcp-headers-<name>.js directly in a resolved root folder is retired; any other script a user's
// registration ran (a `~/bin` script, with a global root of `~`) is never touched. null for a command with no script, or
// the plugin's own helper.
export function retirableHelper(command: unknown, context: RetireCtx): { file: string; left: string | null } | null
{
    if (typeof command !== 'string' || helperParts(command)) return null;
    const script = foreignScript(command);
    if (!script) return null;
    const pathApi = pathFor(context.platform);
    const file = roots.absOf(script.file, rootContext(context));
    if (!FOREIGN_HELPER_FILE.test(pathApi.basename(file))) return { file, left: 'its name is not mcp-headers-<name>.js' };
    const familyRoots = Object.values(roots.resolveRoots(context.inventory, null, rootContext(context)).roots);
    const direct = familyRoots.some((root) => typeof root === 'string' && pathApi.relative(root, pathApi.dirname(file)) === '');
    return { file, left: direct ? null : 'it is not directly in a root folder' };
}

// A step for each hand-built helper script a rewritten registration ran and now does not: its entry runs this plugin's
// helper. The apply removes the file only when nothing else names it and git does not track it.
export function retireHelperSteps(context: RetireCtx, rewrites: Rewrite[]): RetireHelperStep[]
{
    const out = new Map<string, RetireHelperStep>();
    for (const rewrite of rewrites)
    {
        const found = retirableHelper(rewrite.old.headersHelper, context);
        if (!found || found.left !== null || !helperParts(rewrite.entry.headersHelper)) continue;
        const { file } = found;
        out.set(file, { op: 'retire-helper', file, why: `${file}: the old key helper of ${rewrite.name}, now on this plugin's helper - removed when no registration or Cursor file names it and git does not track it` });
    }
    return [...out.values()];
}
