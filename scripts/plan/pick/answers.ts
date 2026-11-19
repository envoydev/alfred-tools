// One MCP pick's answers that edit an entry: its host, whether it sends a key and under which name (spec D9, F2), and a
// bridge's URL names (0.4.0).
import { keyStateOf, heldKey } from '../asks-keys.ts';
import * as keys from '../../keys/keys.ts';
import { required } from '../required.ts';
import type { Inventory } from '../../inventory/types.ts';
import type { HostParams, PickAnswer, PickAnswers, PickBase, Plan, PlanCtx } from '../types.ts';

// -> the answers, or - for a refused one - the length of the errors list, which planMcp returns
export function pickAnswers(base: PickBase, pick: PickAnswer, inventory: Inventory, context: PlanCtx, out: Plan): PickAnswers | number
{
    const { row, current, routeId, route, scope } = base;
    const host = row.params ? (pick.params && pick.params.host) || (current && current.host) || required(row.params[0], `${row.id}: its params name no host`).default : undefined;
    const params: HostParams = { host, ...(pick.params || {}) };
    const hostChoices = row.params && row.params.find((param) => param.id === 'host')?.choices;
    if (hostChoices && !hostChoices.some((choice) => choice.value === params.host)) return out.errors.push(`${row.id}: '${params.host}' is not one of its hosts - ${hostChoices.map((choice) => choice.value).join(', ')}`);
    // an optional key: sent when picked; with no answer, sent at install (the recommended answer, spec F2) and kept as it is
    // at configure. A stdio route at project scope runs keyless (spec D5) - named so it is never read as the catalog's
    // `route.keyless`, the keyless way in
    const keylessAtProject = scope === 'project' && routeId !== 'remote' && route.authMode === 'optional-token';
    if (keylessAtProject && pick.token) return out.errors.push(`${row.id}: its local route runs keyless at project scope - the committed .mcp.json carries no key; pick local or global scope for a key, or the hosted route`);
    let wantToken = pick.token === undefined ? (current ? Boolean(current.token) : route.authMode === 'optional-token' && !keylessAtProject) : Boolean(pick.token);
    if (keylessAtProject && wantToken)
    {
        out.notes.push(`${row.id}: ${route.tokenVar ?? 'its key'} is left out - its local route runs keyless at project scope`);
        wantToken = false;
    }
    // the key's name (spec D9): answered, else the name the registration uses - the helper's argument, or for a stdio key
    // the name whose value equals the key it holds, read from the live registration in this process (R1) and compared
    // with the chain's .mcps-secrets only - the 0.1.x key files are read for names, never values - else the catalog's
    const keyVar = route.helper ? route.helper.var : route.tokenVar;
    if (pick.keyName !== undefined && !keys.NAME_RULE.test(String(pick.keyName))) return out.errors.push(`${row.id}: '${pick.keyName}' is not a key name - a name matches ${keys.NAME_RULE.source}`);
    const usesKey = Boolean(keyVar) && (route.authMode === 'token' || (route.authMode === 'optional-token' && wantToken));
    const keyState = usesKey ? keyStateOf(row, routeId, context, inventory.alfredCodeEnabled, scope) : null;
    const sameRoute = current !== null && current.route === routeId;
    const liveKey = sameRoute && current && keyState && keyState.kind === 'stdio' ? heldKey(context.readLive(current.name, current.scope) || {}, route) : null;
    // a switch between the hosted route and the bridge keeps the name: both read it from the hosted chain (0.4.0); a
    // route with no key has none
    const keyName = pick.keyName || (route.helper && current && current.keyName ? current.keyName : null) || (liveKey && keyState ? keys.nameOfValue(keyState.files, liveKey) : null) || keyVar;
    // a stdio optional key whose name is filled nowhere in the chain (spec F2): written with no key argument, never as an
    // empty one - a stdio key is read only when the registration is written. A registration that holds its key keeps it.
    const unfilledStdio = keyState !== null && keyState.kind === 'stdio' && route.authMode === 'optional-token' && scope !== 'project'
        && !(sameRoute && current && current.token) && !keys.filledNames(keyState.files).some((filledEntry) => keyName !== undefined && filledEntry.names.includes(keyName));
    const sendNow = wantToken && !unfilledStdio;
    // a bridge's URL names (0.4.0): answered, else the registration's (by position), else the catalog's. A name that is
    // the key's or reads as a credential is refused, typed or read (Ruling 3): a key never goes in a URL.
    const urlNames: Record<string, string> = {};
    if (route.runtime === 'bridge')
    {
        const held: Record<string, string | undefined> = (current && current.route === routeId && current.urlNames) || {};
        const urlVars = route.urlVars || [];
        for (const urlVar of urlVars)
        {
            const urlName = (pick.urlNames && pick.urlNames[urlVar.var]) || held[urlVar.var] || urlVar.var;
            if (!keys.NAME_RULE.test(String(urlName))) return out.errors.push(`${row.id}: '${urlName}' is not a name - a name matches ${keys.NAME_RULE.source}`);
            if (urlName === keyName || keys.credentialName(urlName)) return out.errors.push(`${row.id}: ${urlName} holds a key - a key never goes in a URL; pick another name for the ${urlVar.label}`);
            // one name per part: a template naming one twice never starts (review I4)
            const twin = urlVars.find((otherVar) => urlNames[otherVar.var] === urlName);
            if (twin) return out.errors.push(`${row.id}: ${urlName} already names the ${twin.label} - each part of the URL needs its own name; pick another name for the ${urlVar.label}`);
            urlNames[urlVar.var] = urlName;
        }
    }
    if (unfilledStdio) out.notes.push(`${row.id}: fill ${keyName} in ${keyState.files[0]}, then /alfred-tools:configure -> Use a key from .mcps-secrets writes it in`);
    return { params, wantToken, keyState, liveKey, keyName, unfilledStdio, sendNow, urlNames };
}
