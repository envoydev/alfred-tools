// One MCP pick's plan steps: an add, else a move or a rewrite of the registration as read - or nothing when only its
// apps changed - with the roots it writes into, its list record, serena's lines and the fetch of a new launch.
import { pathFor } from '../../entries/platform.ts';
import { logicalRoot, formatRoot } from '../../entries/locations.ts';
import { contextArgAt } from '../../entries/entry.ts';
import { fetchStep } from '../../entries/names.ts';
import { excludeArgAt } from '../../entries/exclude.ts';
import * as roots from '../../roots/roots.ts';
import * as serenaConfig from '../../apply/serena-config.ts';
import { keyOf } from '../../inventory/inventory.ts';
import { deepEqual } from '../../core/json-file.ts';
import { useRoots } from '../root-files.ts';
import { serenaConfigInitStep } from '../serena-init.ts';
import type { ServerEntry } from '../../core/types.ts';
import type { PickBase, PickCursor, PickEntry, PickKeyUse, Plan, PlanCtx, RootUses } from '../types.ts';

// -> undefined, or the length of the unchanged list when nothing but the line is planned (planMcp's return)
export function pickSteps(base: PickBase, built: PickEntry, cursor: PickCursor, keyUse: PickKeyUse, entry: ServerEntry, keyName: string | undefined, context: PlanCtx, out: Plan): number | undefined
{
    const { row, route, current, listedClients, routeId, scope, name } = base;
    const { fresh, rootStr, ensure, dataAbs } = built;
    const { form, clients, signInRoot } = cursor;
    const { bridge, bridgeFilled, keyFile, keyNames, withKey, chosen, staleKey, reconnect } = keyUse;
    // a launch the cache may not hold yet is fetched once it is written (entries/names.ts fetchStep says why); a change that
    // keeps the package, such as a location or a name, fetches nothing
    const fetch = fetchStep(name, entry, row.id, current && current.entry);
    const contextFile = entry.args?.[contextArgAt(entry)];
    const uses: RootUses = { helper: Boolean(entry.headersHelper) || bridge, bridge: bridge || form === 'two', serenaContext: contextFile === undefined ? undefined : pathFor(context.platform).dirname(contextFile), exclude: route.excludeFile && excludeArgAt(entry, route.excludeFile, context) >= 0 ? route.excludeFile.tools : undefined, keyFile, keyName, keyNames, data: dataAbs };
    // the shared sign-in's folder sits in the family's root: the root is written (its .gitignore) like any other
    const signInUse = () => { if (signInRoot !== null) context.uses.push({ family: roots.familyOf(scope), root: signInRoot }); };
    // the apps and the form this registration is listed with (plan/lists.ts)
    const record = () => { const registrationKey = keyOf('mcp', name, scope); if (context.clientsFor) context.clientsFor.set(registrationKey, clients); if (context.formFor) context.formFor.set(registrationKey, form); };
    // a bridge step says whether its names are filled: the apply's background start skips one that cannot start yet
    const withFilled = bridge ? { filled: Boolean(bridgeFilled) } : {};
    // serena's base modes (D7): the edit runs after its first start, so the plan says what it does first
    const serenaLine = () => { const noteLine = row.id === 'serena' ? serenaConfig.planNote(entry, context) : null; if (noteLine && !out.notes.includes(noteLine)) out.notes.push(noteLine); };
    if (!current)
    {
        serenaLine();
        if (reconnect) out.reconnect.push(reconnect);
        useRoots(context, scope, uses);
        signInUse();
        record();
        const configInit = row.id === 'serena' ? serenaConfigInitStep(entry, context) : null;
        if (configInit) out.steps.push(configInit);
        if (ensure) out.steps.push({ op: 'ensure-dir', path: ensure, why: `${row.id}: data folder, with a .gitignore holding * so the project's own .gitignore is never edited` });
        out.steps.push({ op: 'mcp-add', name, scope, entry, row: row.id, route: routeId, ...withKey, ...withFilled, why: `${row.id}: add (${routeId}) at ${scope} scope` });
        if (fetch) out.steps.push(fetch);
        return undefined;
    }
    const moved = current.name !== name || current.scope !== scope;
    const edited = !deepEqual(entry, current.entry);
    if (!moved && !edited && !fresh && !staleKey)
    {
        // the apps alone changed (D3): the list entry and Cursor's file, no claude call; a two-form entry's bridge is
        // written into the root for Cursor's copy
        const sameApps = [...clients].sort().join() === [...listedClients].sort().join();
        if (sameApps || !context.clientsOnly) return out.unchanged.push(`${row.id}: '${name}' at ${scope} scope already as answered`);
        context.clientsOnly.push({ key: keyOf('mcp', name, scope), clients, form });
        if (form === 'two') useRoots(context, scope, { helper: true, bridge: true });
        return undefined;
    }
    serenaLine();
    if (reconnect) out.reconnect.push(reconnect);
    useRoots(context, scope, uses);
    signInUse();
    record();
    if (row.locations && current.rootStr && rootStr !== current.rootStr && formatRoot(logicalRoot(current.rootStr, context), 'local', context).value !== ensure)
        out.notes.push(`${row.id}: the old data stays at ${current.rootStr}; moving a location moves no data`);
    const configInit = row.id === 'serena' ? serenaConfigInitStep(entry, context) : null;
    if (configInit) out.steps.push(configInit);
    if (ensure && (!current.rootStr || rootStr !== current.rootStr)) out.steps.push({ op: 'ensure-dir', path: ensure, why: `${row.id}: new data folder` });
    if (moved)
        out.steps.push({ op: 'mcp-move', from: { name: current.name, scope: current.scope }, to: { name, scope }, entry, old: current.entry, row: row.id, route: routeId, ...withKey, ...withFilled, why: `${row.id}: ${current.name !== name ? `rename '${current.name}' to '${name}'` : ''}${current.name !== name && current.scope !== scope ? ' and ' : ''}${current.scope !== scope ? `move from ${current.scope} to ${scope} scope` : ''} - add first, read back, then remove the old one` });
    else
        out.steps.push({ op: 'mcp-replace', name, scope, entry, old: current.entry, row: row.id, route: routeId, ...withKey, ...withFilled, why: `${row.id}: rewrite '${name}' from the registration as read${staleKey && !edited && !fresh && chosen ? ` - writes in the key ${keyName} holds in ${chosen.file}` : ''}` });
    if (fetch) out.steps.push(fetch);
    return undefined;
}
