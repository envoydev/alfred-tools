// start-timeout (0.7.0): Claude Code gives a server 30 s to start, and npx asks the npm registry first (a uvx
// start took 54.6 s on Windows; docker unmeasured), so a slow first network of the day fails it. A managed registration at any scope that launches a package gets
// MCP_TIMEOUT in the env of Claude Code's settings: one finding per settings file that lacks it - the current config dir's
// and each other config dir under the home that has this plugin installed (configDirsWithPlugin, as read-guard does); its
// plan is one settings-env. A managed registration at Project scope, or inherited from a parent folder's .mcp.json (the row
// only writes settings, never the registration, so an inherited one counts - unless the parent's list leaves it on its
// own, or a nearer registration shadows it), is read by every profile that opens the
// project, so then the other dirs are every profile under the home (configDirsUnderHome), with the plugin or not.
import { pathFor } from '../entries/platform.ts';
import { inheritedLeftOwn } from '../inventory/existing.ts';
import { configDirsUnderHome, configDirsWithPlugin, launchesPackage, settingsEnvStep, startTimeoutOf } from '../plan/repair-tail.ts';
import { START_TIMEOUT } from '../plan/start-timeout-constants.ts';
import { isManaged } from './common.ts';
import { FIX_ID } from './constants.ts';
import type { InvRegistration } from '../inventory/types.ts';
import type { Finding, FixCtx } from './types.ts';

const lacking = (file: string, where = ''): string => `${where}${file} has no ${START_TIMEOUT.name} - Claude Code gives a server 30 s to start, and npx asks the npm registry first, so a slow first network of the day fails it until /mcp Reconnect`;

export function startTimeoutDetect(context: FixCtx): Finding[]
{
    // an inherited registration has no choice of its own, so the parent folder's list says whether it was left on its own;
    // a shadowed one does not start here
    const counts = (registration: InvRegistration) => isManaged(registration) && launchesPackage(registration.name, registration.entry)
        && (registration.scope !== 'inherited' || (!registration.shadowed && !inheritedLeftOwn(context.inventory, registration, context)));
    const launching = context.inventory.registrations.filter(counts);
    if (!launching.length) return [];
    const otherDirs = launching.some((registration) => registration.scope === 'project' || registration.scope === 'inherited') ? configDirsUnderHome : configDirsWithPlugin;
    const bad = (file: string): Finding => ({ id: FIX_ID.startTimeout, name: file, scope: null, found: `${file}: not a settings object alfred-tools can read`, blocked: `add ${START_TIMEOUT.name}=${START_TIMEOUT.value} to env yourself` });
    const finding = (file: string): Finding => ({ id: FIX_ID.startTimeout, name: file, scope: null, found: lacking(file) });
    const out: Finding[] = [];
    const current = startTimeoutOf(context);
    if (current.bad) out.push(bad(current.file));
    else if (current.missing) out.push(finding(current.file));
    for (const dir of otherDirs(context.home, pathFor(context.platform).dirname(current.file), context.platform))
    {
        const other = startTimeoutOf(context, dir);
        if (other.bad) out.push(bad(other.file));
        else if (other.missing) out.push(finding(other.file));
    }
    return out;
}

export const startTimeoutSteps = (finding: Finding) => [settingsEnvStep(finding.name)];
