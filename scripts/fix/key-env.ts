// Keys an older alfred-tools passed another way, moved to the way this one passes them (spec D1, D2). Each is an
// `upgrade` row update offers per registration; the fix edits the entry as read, so the user's pin and args stay.
import * as common from './common.ts';
import * as keys from '../keys/keys.ts';
import { FIX_ID } from './constants.ts';
import type { ServerEntry } from '../core/types.ts';
import type { Finding, FixCtx } from './types.ts';

// ---- context7-key-env (D1) ------------------------------------------------------------------------------------------
// context7's local route with its key on the command line (`--api-key <key>`), where every process listing shows it. A
// 0.1.x `${CONTEXT7_API_KEY}` there is token-sync's first (its row comes before this one), then moved here.
export function context7KeyEnvDetect(context: FixCtx): Finding[]
{
    return common.registrationsOf(context, FIX_ID.context7KeyEnv).flatMap((registration) =>
    {
        const route = common.routeOf(context, registration);
        if (!route || registration.route === 'remote' || keys.moveArgKeyToEnv(registration.entry, route) === registration.entry) return [];
        return [common.finding(FIX_ID.context7KeyEnv, registration, 'its key is passed as --api-key on the command line, where every process listing shows it', { route: registration.route })];
    });
}

export function context7KeyEnvFix(entry: ServerEntry, finding: Finding, context: FixCtx): ServerEntry
{
    return keys.moveArgKeyToEnv(entry, common.findingRoute(context, finding));
}

// ---- sentry-auth-env (D2) -------------------------------------------------------------------------------------------
// sentry's local route at a pin that reads SENTRY_AUTH_TOKEN (0.48.0 and on) still passing SENTRY_ACCESS_TOKEN - one an
// older alfred-tools moved without renaming, or one pinned by hand. Below 0.48.0 it is not offered: that pin reads the
// old name only, and tokenFields keeps its key visible (D0).
const pinOf = (entry: ServerEntry, packageName: string | undefined): string | null => (packageName ? common.pinnedVersion(entry, packageName) : null);

export function sentryAuthEnvDetect(context: FixCtx): Finding[]
{
    return common.registrationsOf(context, FIX_ID.sentryAuthEnv).flatMap((registration) =>
    {
        const route = common.routeOf(context, registration);
        if (!route || registration.route === 'remote') return [];
        const pin = pinOf(registration.entry, route.package?.name);
        if (keys.renameSinceEnv(registration.entry, route, pin) === registration.entry) return [];
        return [common.finding(FIX_ID.sentryAuthEnv, registration, `${route.package?.name} ${pin} reads its key as ${Object.keys(route.envSince || {}).join(', ')} - the registration still passes the name older releases read`, { route: registration.route })];
    });
}

export function sentryAuthEnvFix(entry: ServerEntry, finding: Finding, context: FixCtx): ServerEntry
{
    const route = common.findingRoute(context, finding);
    return keys.renameSinceEnv(entry, route, pinOf(entry, route.package?.name));
}
