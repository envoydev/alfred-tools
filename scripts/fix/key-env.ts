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
