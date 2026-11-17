// serena-context's two extras beside the registration rewrite: the root's old copy of the context file is retired once no
// registration names it, and a context file missing at the path a registration already names is written in place.
import fs from 'node:fs';
import { pathFor } from '../entries/platform.ts';
import { contextArgAt } from '../entries/entry.ts';
import * as roots from '../roots/roots.ts';
import { helperMissingFix } from './keys.ts';
import type { ServerEntry } from '../core/types.ts';
import type { McpReplaceStep, RetireShippedStep } from '../plan/types.ts';
import type { Finding, FixCtx } from './types.ts';

const rootContext = (context: FixCtx) => ({ project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog });
const contextFileOf = (entry: ServerEntry | null | undefined, context: FixCtx): string | null =>
{
    const at = contextArgAt(entry);
    return at >= 0 ? roots.absOf(entry!.args![at], rootContext(context)) : null;
};

// The registrations other than `except` that name `file` as their --context: the inventory's, and the Cursor copies the
// lists hold. -> their names
function namedBy(file: string, context: FixCtx, except: Set<string>): string[]
{
    const key = (name: string, scope: string) => `${name}\u0000${scope}`;
    const names = new Set<string>();
    for (const registration of context.inventory.registrations)
        if (!except.has(key(registration.name, registration.scope)) && contextFileOf(registration.entry, context) === file) names.add(registration.name);
    for (const list of Object.values(context.inventory.lists || {}))
        for (const server of (list && !list.note ? list.servers : []))
            if (!except.has(key(server.name, server.scope)) && contextFileOf(server.cursorEntry, context) === file) names.add(server.name);
    return [...names];
}

// A step for each root copy of serena-context.yml that a rewritten registration named and no longer does: the apply removes
// it only when it is this plugin's own, unedited copy and `namedBy` is empty.
export function retireContextSteps(context: FixCtx, replaced: McpReplaceStep[]): RetireShippedStep[]
{
    const pathApi = pathFor(context.platform);
    const familyRoots = roots.resolveRoots(context.inventory, null, rootContext(context)).roots;
    const except = new Set(replaced.map((step) => `${step.name}\u0000${step.scope}`));
    const out = new Map<string, RetireShippedStep>();
    for (const step of replaced)
    {
        const file = contextFileOf(step.old, context);
        const root = familyRoots[roots.familyOf(step.scope)];
        if (!file || !root || file !== pathApi.join(root, roots.FILES.serenaContext) || file === contextFileOf(step.entry, context)) continue;
        out.set(file, { op: 'retire-shipped', kind: 'serenaContext', file, namedBy: namedBy(file, context, except), why: `${file}: the old copy of serena's context file, now in each serena's home - removed when it is unedited and no registration names it` });
    }
    return [...out.values()];
}

// A serena-context finding whose registration already names the right path with no file there: nothing to rewrite, so the
// file is written where it is named. Never over a file that is there. -> the apply's line, or null
export function writeMissingContext(finding: Finding): string | null
{
    if (!finding.want || fs.existsSync(finding.want)) return null;
    const written = helperMissingFix({ id: 'helper-missing', name: finding.want, scope: null, found: '', path: finding.want, shipped: 'serenaContext' });
    return `${written.ok ? 'ok    ' : 'FAILED'} serena-context: ${written.detail}`;
}
