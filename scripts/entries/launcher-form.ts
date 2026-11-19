// The stdio key launcher's form: which routes run as a launcher, and a built entry wrapped for the bridge's run mode. Pure.
// It reads keys.ts, which reads entries/launcher.ts, so these two functions live apart from launcher.ts (no import cycle).
import * as keys from '../keys/keys.ts';
import { RUN } from './constants.ts';
import type { ServerEntry } from '../core/types.ts';
import type { CatalogRoute } from '../catalog/types.ts';
import type { LauncherPlace } from './types.ts';

// Whether a route's registration at `scope` runs as a launcher: a stdio route with a key, which a committed Project file
// never carries. A hosted route and a URL bridge read their key another way.
export const launcherRoute = (route: CatalogRoute, routeId: string, scope: string): boolean =>
    routeId !== 'remote' && route.runtime !== 'bridge' && !route.helper && Boolean(route.tokenVar) && scope !== 'project';

// A built stdio entry wrapped for the bridge's run mode: the first env field the route's key sits in names the variable the
// bridge fills, `keyName` names the entry of .mcps-secrets it reads, and no key field is left in the env. null when the
// entry holds no key in its env - or still holds one in its args, where the launcher's argv would show it.
export function launcherForm(route: CatalogRoute, keyName: string, place: LauncherPlace, inner: ServerEntry): ServerEntry | null
{
    const moved = keys.moveArgKeyToEnv(inner, route);
    const fields = keys.tokenFields(moved, route);
    const first = fields.find((field) => field.at[0] === 'env');
    if (!first || fields.some((field) => field.at[0] === 'args')) return null;
    const pair = `${first.at[1]}=${keyName}${route.authMode === 'optional-token' ? RUN.optional : ''}`;
    return {
        command: 'node',
        args: [place.bridgePath, RUN.flag, pair, ...(place.globalRoot ? [place.globalRoot] : []), RUN.end, moved.command ?? '', ...(moved.args ?? [])],
        env: keys.withoutTokenFields(moved, route).env ?? {},
    };
}
