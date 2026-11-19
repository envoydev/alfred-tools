// start-timeout (0.7.0): Claude Code gives a server 30 s to start, and npx asks the npm registry first (a uvx
// start took 54.6 s on Windows; docker unmeasured), so a slow first network of the day fails it. A managed registration at any scope that launches a package gets
// MCP_TIMEOUT in the env of Claude Code's settings: one finding per settings file that lacks it - the current config dir's
// and each other config dir under the home that has this plugin installed (configDirsWithPlugin, as read-guard does); its
// plan is one settings-env.
import { pathFor } from '../entries/platform.ts';
import { configDirsWithPlugin, launchesPackage, settingsEnvStep, startTimeoutOf } from '../plan/repair-tail.ts';
import { START_TIMEOUT } from '../plan/start-timeout-constants.ts';
import { isManaged } from './common.ts';
import { FIX_ID } from './constants.ts';
import type { Finding, FixCtx } from './types.ts';

const lacking = (file: string, where = ''): string => `${where}${file} has no ${START_TIMEOUT.name} - Claude Code gives a server 30 s to start, and npx asks the npm registry first, so a slow first network of the day fails it until /mcp Reconnect`;

export function startTimeoutDetect(context: FixCtx): Finding[]
{
    const launches = context.inventory.registrations.some((registration) => isManaged(registration) && registration.scope !== 'inherited' && launchesPackage(registration.name, registration.entry));
    if (!launches) return [];
    const bad = (file: string): Finding => ({ id: FIX_ID.startTimeout, name: file, scope: null, found: `${file}: not a settings object alfred-tools can read`, blocked: `add ${START_TIMEOUT.name}=${START_TIMEOUT.value} to env yourself` });
    const finding = (file: string): Finding => ({ id: FIX_ID.startTimeout, name: file, scope: null, found: lacking(file) });
    const out: Finding[] = [];
    const current = startTimeoutOf(context);
    if (current.bad) out.push(bad(current.file));
    else if (current.missing) out.push(finding(current.file));
    for (const dir of configDirsWithPlugin(context.home, pathFor(context.platform).dirname(current.file), context.platform))
    {
        const other = startTimeoutOf(context, dir);
        if (other.bad) out.push(bad(other.file));
        else if (other.missing) out.push(finding(other.file));
    }
    return out;
}

export const startTimeoutSteps = (finding: Finding) => [settingsEnvStep(finding.name)];
