// macos-config (spec D4): a managed macos-control whose --config names a root's macos-mcp.toml that is not there - the
// server then does not start (FileNotFoundError, docs/sources.md). The fix writes the file again with the same op. A
// --config naming any other file, or a file outside the roots, is the user's - the same predicate plan and configure use.
import * as common from './common.ts';
import * as roots from '../roots/roots.ts';
import { pathFor } from '../entries/platform.ts';
import { excludeArgAt } from '../entries/exclude.ts';
import { FIX_ID } from './constants.ts';
import type { PlanStep } from '../plan/types.ts';
import type { Finding, FixCtx } from './types.ts';

export function macosConfigDetect(context: FixCtx): Finding[]
{
    const machine = { project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog };
    const resolved = roots.resolveRoots(context.inventory, null, machine).roots;
    const rootsView = { ...machine, knownRoots: roots.knownRoots(context.inventory, resolved, machine) };
    return common.registrationsOf(context, FIX_ID.macosConfig).flatMap((registration) =>
    {
        const route = common.routeOf(context, registration);
        const file = (registration.entry.args || [])[excludeArgAt(registration.entry, route?.excludeFile, rootsView)];
        if (file === undefined || context.machine.exists(file)) return [];
        return [common.finding(FIX_ID.macosConfig, registration, `${file} is not there - macos-mcp does not start without the file its --config names`, { path: file, route: registration.route })];
    });
}

export function macosConfigSteps(finding: Finding, context: FixCtx): PlanStep[]
{
    const route = common.findingRoute(context, finding);
    const file = common.fieldOf(finding, 'path');
    return [{ op: 'write-exclude-file', path: pathFor(context.platform).dirname(file), tools: route.excludeFile ? route.excludeFile.tools : [], why: `${file}: written again - the tools macos-mcp leaves out` }];
}
