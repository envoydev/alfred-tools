// helper-foreign (0.6.0, spec C2): a managed hosted registration whose `headersHelper` runs a helper that is not this
// plugin's mcp-headers.js - one the user wrote beside it, as for my-sonarqube. The fix rewrites the registration as
// read to this plugin's helper command. The old file is named as no longer used: one inside a root is retired by a step
// after the replace (retireHelperSteps), one outside the roots is left. Compared by name only: a finding names a key and
// a file, never a value.
import path from 'node:path';
import { foreignScript, helperFor, helperParts } from '../entries/entry.ts';
import { adoptedClients } from '../plan/lists.ts';
import { retirableHelper } from '../plan/retire-context.ts';
import { mixedNote } from './lists.ts';
import * as keys from '../keys/keys.ts';
import * as kept from '../core/kept.ts';
import * as roots from '../roots/roots.ts';
import * as lists from '../mcps-list/mcps-list.ts';
import * as common from './common.ts';
import type { ServerEntry } from '../core/types.ts';
import type { InvRegistration } from '../inventory/types.ts';
import type { Finding, FixCtx } from './types.ts';

// The key's name: the foreign helper's first argument when it is a name a key file of the chain defines and is not shaped
// like a key (a token is name-shaped, and a finding or note would print it), else the row's own. Names only are read.
function keyNameOf(first: string | undefined, chain: string[], rowName: string): string
{
    if (!first || !keys.NAME_RULE.test(first) || kept.looksLikeKey(first)) return rowName;
    return chain.some((file) => keys.namesIn(file).includes(first)) ? first : rowName;
}

// The list entry a registration has, and the apps an unlisted one would take: `clients` is set only for a server a usable
// list does not name yet, so the repair lists it for the apps its other servers share (list-import's rule).
function appsOf(context: FixCtx, registration: InvRegistration): { cursor: boolean; clients?: string[]; mixed?: boolean }
{
    const family = roots.familyOf(registration.scope);
    const familyList = context.inventory.lists && context.inventory.lists[family];
    if (!familyList || familyList.note || familyList.old) return { cursor: false };
    const listed = (familyList.servers || []).find((server) => lists.serverKey(server) === lists.serverKey(registration));
    if (listed) return { cursor: (listed.clients || []).includes('cursor') };
    const adopted = adoptedClients(context.inventory, family);
    return { cursor: adopted.clients.includes('cursor'), clients: adopted.clients, mixed: adopted.mixed };
}

export function helperForeignDetect(context: FixCtx): Finding[]
{
    const out: Finding[] = [];
    const resolvedRoots = roots.resolveRoots(context.inventory, null, { project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog }).roots;
    for (const registration of common.registrationsOf(context, 'helper-foreign'))
    {
        const route = common.routeOf(context, registration);
        const command = registration.entry.headersHelper;
        if (registration.route !== 'remote' || !route || !route.helper || typeof command !== 'string' || helperParts(command)) continue;
        const script = foreignScript(command);
        if (!script) continue;
        const chain = keys.hostedChain({ scope: registration.scope, projectRoot: resolvedRoots.project, globalRoot: resolvedRoots.global, globalNamed: resolvedRoots.globalNamed, home: context.home, platform: context.platform });
        const keyName = keyNameOf(script.first, chain, route.helper.var);
        const apps = appsOf(context, registration);
        const what = `headersHelper runs ${path.basename(script.file)}, not mcp-headers.js - it moves to the plugin's helper, which reads ${keyName} from the key files`;
        const left = retirableHelper(command, context)?.left;
        const fate = left === null ? 'it is removed when no registration or Cursor file names it and git does not track it' : `the old file is left where it is - ${left ?? 'it is not a script file'}`;
        const afterNote = [`${path.basename(script.file)} is no longer used - ${registration.name} runs mcp-headers.js now; ${fate}`, ...(apps.mixed ? [mixedNote([registration.name])] : [])].join('\n');
        const extra = { route: registration.route, roots: resolvedRoots, keyName, cursor: apps.cursor, afterNote, ...(apps.clients ? { clients: apps.clients } : {}) };
        out.push(keys.valueIn(chain, keyName)
            ? common.finding('helper-foreign', registration, what, extra)
            : common.finding('helper-foreign', registration, what, { ...extra, blocked: `fill ${keyName} in ${chain[0]}, then run /alfred-tools:fix` }));
    }
    return out;
}

// The entry as read with the plugin's helper command: the key's name, the route's scheme, the row's own header pairs and
// no setting pair (a change starts from what is installed: the server's defaults stay). fix.ts writes the root's helper
// and bridge files before it.
export function helperForeignFix(entry: ServerEntry, finding: Finding, context: FixCtx): ServerEntry
{
    const route = common.findingRoute(context, finding);
    return { ...common.clone(entry), headersHelper: helperFor(route, common.fieldOf(finding, 'scope'), { project: context.inventory.project, platform: context.platform, home: context.home, roots: finding.roots }, finding.keyName) };
}
