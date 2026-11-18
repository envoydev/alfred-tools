// One MCP pick: its route, scope, name, root, location, key and settings, as plan steps.
import fs from 'node:fs';
import path from 'node:path';
import { pathFor } from '../entries/platform.ts';
import { recommendedSide, alfredNameProblem, logicalRoot, otherPlace, parseRoot, alfredRoot, defaultRoot, serenaSpaceFree, formatRoot, validWindowsSerenaHome, applyRoot } from '../entries/locations.ts';
import { checkHostedSettings, currentHostedSettings, defaultHostedSettings, pairNames, optionalNameNotes } from './hosted-settings.ts';
import { currentOf, buildEntry, applyContext, bridgeParts, helperGlobalRoot, bridgePathFor, renameTemplate, helperFor, subst, mergeSettings, contextArgAt } from '../entries/entry.ts';
import { signInParts, signInFormOf } from '../entries/sign-in.ts';
import { nameProblem, fetchStep } from '../entries/names.ts';
import { recommendedScope, keyStateOf, heldKey, PARENT_HELPER_IN_CHILD } from './asks-keys.ts';
import * as keys from '../keys/keys.ts';
import * as kept from '../core/kept.ts';
import * as roots from '../roots/roots.ts';
import { templateNames } from '../copied/mcp-bridge.js';
import { useRoots } from './root-files.ts';
import * as cursorMcp from '../cursor/cursor-mcp.ts';
import * as serenaConfig from '../apply/serena-config.ts';
import { serenaConfigInitStep } from './serena-init.ts';
import { keyOf, fromHere, otherWindowsMcp } from '../inventory/inventory.ts';
import { deepEqual } from '../core/json-file.ts';
import { SCOPES, andList } from './context.ts';
import type { ServerEntry } from '../core/types.ts';
import type { Catalog, CatalogRow } from '../catalog/types.ts';
import type { Current, Root, Roots } from '../entries/types.ts';
import type { Inventory } from '../inventory/types.ts';
import type { ListServer } from '../mcps-list/types.ts';
import type { PickAnswer, Plan, PlanCtx, RootUses } from './types.ts';

// ---- one MCP pick ---------------------------------------------------------------------------------------------------

export function projectName(context: { project: string }): string
{
    return path.basename(context.project).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
}

function resolveName(pick: PickAnswer, row: CatalogRow, current: Current | null, context: { project: string }): string
{
    const nameAnswer = pick.name === undefined ? 'keep' : pick.name;
    if (nameAnswer === 'keep') return current ? current.name : row.name;
    if (nameAnswer === 'prefixed') return `${projectName(context)}-${row.name}`.slice(0, 64);
    return nameAnswer;
}

// A data folder is `<root>/<name>` in the root of the scope's family (spec D2): side 'project' - the project root,
// 'account' - the global root; 'default' is the recommended side (serena on Windows: its profile's .serena, or a
// space-free folder).
function wantedRoot(row: CatalogRow, pick: PickAnswer, current: Current | null, name: string, scope: string, context: PlanCtx): { error: string; root?: undefined; existing?: undefined } | { root: Root; existing: boolean; error?: undefined }
{
    const serenaWin = row.locations!.windowsAbsolute && context.platform === 'win32';
    let locationAnswer = pick.location || { side: current ? 'keep' : recommendedSide(row, scope, context) };
    if (locationAnswer.side === 'default' && !serenaWin) locationAnswer = { side: recommendedSide(row, scope, context) };
    // an .alfred project root holds alfred-code's own entries: a registration of this family is never given a name
    // that is one (a registration already under that name keeps it)
    const pathApi = pathFor(context.platform);
    if (scope !== 'user' && !(current && current.name === name) && context.roots && context.roots.project === pathApi.join(context.project, '.alfred'))
    {
        const problem = alfredNameProblem(name, context);
        if (problem) return { error: problem };
    }
    let root: Root | null | undefined;
    let existing = false;
    if (locationAnswer.side === 'keep' && current && current.rootStr) root = logicalRoot(current.rootStr, context);
    else if (locationAnswer.side === 'project') root = otherPlace(row, name, 'project', context);
    else if (locationAnswer.side === 'account') root = otherPlace(row, name, 'account', context);
    else if (locationAnswer.side === 'path') root = parseRoot(locationAnswer.path!, context);
    else if (locationAnswer.side === 'alfred-data')
    {
        if (!context.alfredHere) return { error: 'alfred-code is not set up here (no .alfred/.gitignore) - pick another folder' };
        const problem = alfredNameProblem(name, context);
        if (problem) return { error: problem };
        root = { kind: 'project', rel: `.alfred/${name}` };
    }
    else if (locationAnswer.side === 'alfred')
    {
        // only on the user's pick: the folder is alfred-code's, so deleting it erases this tool's data
        root = alfredRoot(row, context);
        if (!root) return { error: "no alfred-code data folder for it on disk" };
        existing = true;
    }
    else
    {
        const defaultPlace = defaultRoot(row, name, context);
        // serena on Windows with a spaced profile: the space-free folder the question recommends in its place
        if (defaultPlace.needsInput && !serenaWin) return { error: defaultPlace.needsInput };
        root = defaultPlace.needsInput ? serenaSpaceFree(context) : defaultPlace.root;
        existing = Boolean((defaultPlace as { existing?: boolean }).existing);
    }
    if (row.locations!.windowsAbsolute && context.platform === 'win32')
    {
        const resolved = formatRoot(root!, 'local', context);
        const text = resolved.value && resolved.value.replace(/\//g, '\\');
        if (!text || !validWindowsSerenaHome(text))
            return { error: `serena's home on Windows must be absolute, in backslashes and space-free (fix row serena-windows-home); '${text || locationAnswer.path}' is not` };
        return { root: { kind: 'abs', path: text }, existing };
    }
    return { root: root!, existing };
}

// The list entry of a registration, or null.
function listedOf(inventory: Inventory, registration: { name: string; scope: string }): ListServer | null
{
    const familyList = inventory.lists && inventory.lists[roots.familyOf(registration.scope)];
    return familyList && !familyList.note && !familyList.old ? (familyList.servers || []).find((server) => server.name === registration.name && server.scope === registration.scope) || null : null;
}

export function planMcp(row: CatalogRow, pick: PickAnswer, inventory: Inventory, context: PlanCtx, catalog: Catalog, out: Plan): number | undefined
{
    if (!row.os.includes(context.platform)) return out.errors.push(`${row.id}: not offered on ${context.platform}`);
    // configure names its target; an install pick only adds, whatever else of this row is installed
    const here = inventory.registrations.filter((registration) => registration.rowId === row.id && !registration.alfredRetired);
    const target = pick.target ? here.find((registration) => registration.name === pick.target!.name && registration.scope === pick.target!.scope) : null;
    const current = target ? currentOf(row, target) : null;

    // which apps (D3): the answer, else what the list holds for the target, else Claude Code only
    const listedEntry = target ? listedOf(inventory, target) : null;
    const listedClients = listedEntry ? listedEntry.clients || ['claude'] : ['claude'];
    let clients = pick.clients || listedClients;

    const routeId = (pick.route || (current ? current.route : row.recommendedRoute))!;
    const route = row.routes[routeId];
    if (!route) return out.errors.push(`${row.id}: no ${routeId} route (routes: ${Object.keys(row.routes).join(', ')})`);
    // a fresh pick's scope: the recommended one (spec D5, F2)
    const scope = pick.scope || (current ? current.scope : recommendedScope(row, routeId));
    if (!SCOPES.includes(scope)) return out.errors.push(`${row.id}: unknown scope '${scope}'`);
    // a stdio route that needs a key holds it written in, which the committed .mcp.json never carries (spec D5); a
    // registration already there is configure's to keep
    // a bridge holds names only (0.4.0, Ruling 6)
    if (scope === 'project' && routeId !== 'remote' && route.runtime !== 'bridge' && route.authMode === 'token' && !(current && current.scope === 'project'))
        return out.errors.push(`${row.id}: its local route needs a key written into the registration, so it is not offered at project scope - the committed .mcp.json carries no key; pick local or global scope, or the hosted route`);
    const bad = inventory.unreadable.find((unreadable) => (unreadable.scope === scope) || (scope !== 'project' && ['local', 'user'].includes(unreadable.scope) && ['local', 'user'].includes(scope)));
    if (bad) return out.errors.push(`${row.id}: the ${scope} scope is unreadable (${bad.file} is ${bad.state}); nothing is written there`);

    const name = resolveName(pick, row, current, context);
    // an install pick already there under this name and scope - a re-run, or a tool installed since: never changed here
    const same = !pick.target && here.find((registration) => registration.name === name && registration.scope === scope);
    for (const registration of here)
    {
        if (registration === target || registration === same || context.changing.has(keyOf('mcp', registration.name, registration.scope))) continue;
        if (registration.scope !== 'inherited') out.notes.push(`${row.id}: also installed as '${registration.name}' at ${registration.scope} scope - left as it is`);
        else if (registration.name !== name) out.notes.push(`${row.id}: also inherited as '${registration.name}' from ${fromHere(inventory, registration.from!)} (${registration.approval}) - change it there`);
    }
    if (same)
    {
        out.expect.push({ kind: 'mcp', row: row.id, name, scope, route: same.route });
        return out.unchanged.push(`${row.id}: '${name}' is already installed at ${scope} scope - a change to it is /alfred-tools:configure`);
    }
    const taken = inventory.registrations.filter((registration) => registration.scope === scope);
    const problem = nameProblem(name, { catalog, taken, self: current ? { name: current.name, scope: current.scope } : null });
    if (problem) return out.errors.push(`${row.id}: ${problem}`);
    // windows-mcp 0.8.8 makes one missed overlay confirmation permanent; another session cannot be seen, so it is named
    if (row.id === 'windows-control' && !target)
    {
        const others = otherWindowsMcp(inventory, name);
        out.notes.push(`windows-control: keep one windows-mcp per Windows desktop - another Claude Code session with it open${others.length ? `, or ${others.join(', ')},` : ''} can leave its tools unavailable until a new session starts it again`);
    }
    for (const registration of inventory.registrations)
    {
        if (registration.name !== name || registration.scope === scope) continue;
        // a parent's copy ranks as project scope, below this project's local and project ones, above user (M2, M3)
        if (registration.scope === 'inherited')
        {
            if (registration.shadowed && registration.shadowed.scope === 'inherited') continue;
            const from = fromHere(inventory, registration.from!);
            out.notes.push(`${row.id}: '${name}' is also inherited from ${from} (${registration.approval}); Claude Code uses ${scope === 'user' ? `the inherited one from ${from} in this project - a .mcp.json server ranks above user scope` : `this project's ${scope} copy`}`);
        }
        else out.notes.push(`${row.id}: '${name}' also exists at ${registration.scope} scope; Claude Code reads local, then project, then user, so the nearer one wins`);
    }

    // the answers that edit an entry
    const params = { host: row.params ? (pick.params && pick.params.host) || (current && current.host) || row.params[0]!.default : undefined, ...(pick.params || {}) } as { host: string } & Record<string, string>;
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
        out.notes.push(`${row.id}: --api-key is left out - its local route runs keyless at project scope`);
        wantToken = false;
    }
    // the key's name (spec D9): answered, else the name the registration uses - the helper's argument, or for a stdio key
    // the name whose value equals the key it holds, read from the live registration in this process (R1) and compared
    // with the chain's .mcps-secrets only - the 0.1.x key files are read for names, never values - else the catalog's
    const keyVar = route.helper ? route.helper.var : route.tokenVar;
    if (pick.keyName !== undefined && !keys.NAME_RULE.test(String(pick.keyName))) return out.errors.push(`${row.id}: '${pick.keyName}' is not a key name - a name matches ${keys.NAME_RULE.source}`);
    const usesKey = Boolean(keyVar) && (route.authMode === 'token' || (route.authMode === 'optional-token' && wantToken));
    const keyState = usesKey ? keyStateOf(row, routeId, context, inventory.alfredCodeEnabled, scope) : null;
    const sameRoute = Boolean(current) && current!.route === routeId;
    const liveKey = sameRoute && keyState && keyState.kind === 'stdio' ? heldKey(context.readLive(current!.name, current!.scope) || {}, route) : null;
    // a switch between the hosted route and the bridge keeps the name: both read it from the hosted chain (0.4.0)
    const keyName = (pick.keyName || (route.helper && current && current.keyName ? current.keyName : null) || (liveKey ? keys.nameOfValue(keyState!.files, liveKey) : null) || keyVar)!;
    // a stdio optional key whose name is filled nowhere in the chain (spec F2): written with no key argument, never as an
    // empty one - a stdio key is read only when the registration is written. A registration that holds its key keeps it.
    const unfilledStdio = Boolean(keyState) && keyState!.kind === 'stdio' && route.authMode === 'optional-token' && scope !== 'project'
        && !(sameRoute && current!.token) && !keys.filledNames(keyState!.files).some((filledEntry) => filledEntry.names.includes(keyName));
    const sendNow = wantToken && !unfilledStdio;
    // a bridge's URL names (0.4.0): answered, else the registration's (by position), else the catalog's. A name that is
    // the key's or reads as a credential is refused, typed or read (Ruling 3): a key never goes in a URL.
    const urlNames: Record<string, string> = {};
    if (route.runtime === 'bridge')
    {
        const held: Record<string, string | undefined> = (current && current.route === routeId && current.urlNames) || {};
        for (const urlVar of route.urlVars || [])
        {
            const urlName = (pick.urlNames && pick.urlNames[urlVar.var]) || held[urlVar.var] || urlVar.var;
            if (!keys.NAME_RULE.test(String(urlName))) return out.errors.push(`${row.id}: '${urlName}' is not a name - a name matches ${keys.NAME_RULE.source}`);
            if (urlName === keyName || keys.credentialName(urlName)) return out.errors.push(`${row.id}: ${urlName} holds a key - a key never goes in a URL; pick another name for the ${urlVar.label}`);
            // one name per part: a template naming one twice never starts (review I4)
            const twin = Object.keys(urlNames).find((urlVarName) => urlNames[urlVarName] === urlName);
            if (twin) return out.errors.push(`${row.id}: ${urlName} already names the ${route.urlVars!.find((otherVar) => otherVar.var === twin)!.label} - each part of the URL needs its own name; pick another name for the ${urlVar.label}`);
            urlNames[urlVar.var] = urlName;
        }
    }
    if (unfilledStdio) out.notes.push(`${row.id}: fill ${keyName} in ${keyState!.files[0]}, then /alfred-tools:configure -> Use a key from .mcps-secrets writes it in`);
    // the server's settings (spec D9): pairs merged into a stdio route's env - never a key, and no machine path in the
    // committed file
    // a hosted route that lists `settings` (sonarqube) takes them as fixed helper pairs, checked against its list
    const hostedSettings = routeId === 'remote' && route.settings;
    let chosenSettings: Record<string, string> | undefined;
    if (pick.settings && hostedSettings)
    {
        const checked = checkHostedSettings(route, pick.settings);
        if ('error' in checked) return out.errors.push(`${row.id}: ${checked.error}`);
        chosenSettings = checked.settings;
    }
    else if (pick.settings)
    {
        if (routeId === 'remote') return out.errors.push(`${row.id}: a hosted route takes no settings - its options are its route and host`);
        for (const [settingName, value] of Object.entries(pick.settings))
        {
            if (!keys.NAME_RULE.test(settingName)) return out.errors.push(`${row.id}: '${settingName}' is not a setting name - a name matches ${keys.NAME_RULE.source}`);
            if (keys.credentialName(settingName)) return out.errors.push(`${row.id}: ${settingName} looks like a key - keep a key in .mcps-secrets and pick it as the key's name`);
            if (kept.looksLikeKey(value)) return out.errors.push(`${row.id}: ${settingName}'s value looks like a key - keep a key in .mcps-secrets and pick its name as the key's name`);
        }
    }
    // a fresh add with no answer takes the recommended settings; a change with no answer keeps the pairs it has
    const toolSettings = !hostedSettings ? undefined : chosenSettings || (current && current.route === routeId ? currentHostedSettings(route, current.entry) : defaultHostedSettings(route));
    const wantExec = pick.executablePath === undefined ? (current ? current.executablePath : undefined) : (pick.executablePath || undefined);
    let rootStr: string | undefined;
    let ensure: string | null = null;
    let dataAbs: string | null = null;
    if (row.locations)
    {
        const wanted = wantedRoot(row, pick, current, name, scope, context);
        if (wanted.error) return out.errors.push(`${row.id}: ${wanted.error}`);
        rootStr = formatRoot(wanted.root!, scope, context).value;
        dataAbs = rootStr;
        if (!wanted.existing) ensure = dataAbs;
        // an absolute --user-data-dir: every session under this folder opens the same persistent profile, which one
        // browser at a time can hold (docs/sources.md 'Playwright MCP')
        if (scope === 'project' && row.id.startsWith('playwright-'))
            out.notes.push(`${row.id}: one browser profile for every session under this folder - two sessions at once cannot both open it`);
    }

    let entry: ServerEntry;
    let fresh = !current || current.route !== routeId;
    if (fresh)
        entry = buildEntry(row, routeId, { rootStr, scope, executablePath: wantExec, token: sendNow, keyName, params, urlNames, settings: toolSettings }, context, catalog.rules);
    else
    {
        entry = JSON.parse(JSON.stringify(current!.entry));
        if (row.locations && rootStr !== current!.rootStr) entry = applyRoot(entry, row, rootStr!, scope, context);
        // serena's context file follows the scope's root (D7)
        if (route.run && route.run.includes('{contextFile}')) entry = applyContext(entry, scope, context);
        if (route.optionalArgs && route.optionalArgs.executablePath && wantExec !== current!.executablePath)
        {
            const args = (entry.args || []).slice();
            const i = args.indexOf('--executable-path');
            if (i >= 0) args.splice(i, 2);
            if (wantExec) args.push('--executable-path', wantExec);
            entry.args = args;
        }
        if (route.runtime === 'bridge')
        {
            // from the registration as read (0.4.0): its path follows the scope, its template the URL names and its key
            // argument the key's name; the scheme, the pin and the cut-off stay
            const parts = bridgeParts(entry);
            const at = entry.args!.findIndex((argument) => String(argument) === parts!.path);
            const held: Record<string, string | undefined> = current!.urlNames || {};
            const rename = Object.fromEntries((route.urlVars || []).map((urlVar) => [held[urlVar.var] || urlVar.var, urlNames[urlVar.var]!]));
            const globalRoot = helperGlobalRoot(scope, context);
            entry.args = [...entry.args!.slice(0, at), bridgePathFor(scope, context), renameTemplate(parts!.template, rename), keyName, ...entry.args!.slice(at + 3, at + 5), ...(globalRoot ? [globalRoot] : []), ...entry.args!.slice(at + 6)];
        }
        else if (routeId === 'remote' && route.helper)
        {
            // the helper follows the scope and its root, under the name it passes now; an Authorization header of the
            // 0.1.x kind is fix's to move (key-to-helper, spec D7), never dropped here while a key is wanted
            const header = Boolean(entry.headers && entry.headers.Authorization);
            if (!wantToken)
            {
                delete entry.headersHelper;
                if (header) { delete entry.headers!.Authorization; if (!Object.keys(entry.headers!).length) delete entry.headers; }
            }
            else if (header) out.notes.push(`${row.id}: '${current!.name}' sends its key from an Authorization header - /alfred-tools:fix moves it into .mcps-secrets, read by mcp-headers.js (key-to-helper)`);
            else entry.headersHelper = helperFor(route, scope, context, keyName, toolSettings);
        }
        else if (route.authMode === 'optional-token' && sendNow !== current!.token)
        {
            const args = (entry.args || []).slice();
            const i = args.indexOf('--api-key');
            if (i >= 0) args.splice(i, 2);
            if (sendNow) args.push(...route.optionalArgs!.token!);
            entry.args = args;
        }
        if (row.params && current!.host && params.host !== current!.host) entry.url = subst(route.url, params);
    }

    // Cursor's form of a hosted route (D5): a keyless OAuth route for both apps is the shared mcp-remote sign-in in the
    // family's root, for Claude Code only the http form; a keyed one keeps its helper for Claude Code and gets the bridge
    // for Cursor (the list's cursorEntry), unless it sends a header of its own the bridge has no place for
    let form: string | null = null;
    if (routeId === 'remote' && route.keyless === 'oauth' && !wantToken)
    {
        const family = roots.familyOf(scope);
        const root = ((context.roots || {}) as Roots)[family];
        const pathApi = pathFor(context.platform);
        const was = signInParts(entry);
        const httpUrl = row.params && params.host ? subst(route.url, params) : (was ? was.url : entry.url);
        const exists = context.exists || ((filePath) => fs.existsSync(filePath));
        if (clients.includes('cursor') && root && (exists(root) || pathApi.basename(root) === '.alfred') && roots.gitIgnores(pathApi.join(root, roots.FILES.signIns, 'tokens')) === false)
        {
            out.notes.push(`${root}: git would commit ${roots.FILES.signIns}/ - ${name} is set up for Claude Code only; /alfred-tools:fix (root-ignore) covers it, then configure adds Cursor`);
            clients = clients.filter((client) => client !== 'cursor');
        }
        if (clients.includes('cursor') && root)
        {
            entry = was
                ? { ...entry, args: entry.args!.map((argument) => (argument === was.url ? httpUrl! : argument)), env: { ...(entry.env || {}), MCP_REMOTE_CONFIG_DIR: root } }
                : signInFormOf(httpUrl!, root, catalog, context);
            delete entry.url;
            form = 'signin';
            if (current && !signInParts(current.entry)) out.notes.push(`${name}: sign in once more - the sign-in now lives in ${pathApi.join(root, roots.FILES.signIns)}/ and serves both apps`);
        }
        else
        {
            if (was) entry = { type: 'http', url: httpUrl };
            if (current && signInParts(current.entry)) out.notes.push(`${name}: Claude Code signs in on its own again (/mcp)`);
        }
    }
    else if (routeId === 'remote' && entry.headersHelper && clients.includes('cursor'))
    {
        const other = cursorMcp.otherHeaders(entry);
        if (other.length)
        {
            out.notes.push(`${name}: set up for Claude Code only - its ${other.join(', ')} header${other.length > 1 ? 's have' : ' has'} no bridge equivalent`);
            clients = clients.filter((client) => client !== 'cursor');
        }
        else form = 'two';
    }

    // a stdio route holding its key in the registration (D6) reaches Cursor at global scope only: .cursor/mcp.json may be
    // committed, and project scope is closed to it already
    if (scope === 'local' && clients.includes('cursor') && cursorMcp.stdioKeyed(entry, row, routeId))
    {
        out.notes.push('Cursor: not written - this route keeps its key in the registration, and .cursor/mcp.json may be committed; pick the hosted route for Cursor');
        clients = clients.filter((client) => client !== 'cursor');
    }

    if (pick.settings && !hostedSettings) entry = mergeSettings(entry, route, pick.settings);

    // .mcp.json is committed: a move into it never carries a credential the route's own token field does not take - a
    // header of the user's own, a userinfo URL, a 0.1.x Authorization header (D7). A key never becomes a ${VAR} there: a
    // hosted key goes through the helper (key-to-helper moves a 0.1.x header first), and a stdio key never moves in (D5).
    if (scope === 'project' && current && current.scope !== 'project')
    {
        const own = new Set(keys.tokenFields(entry, route).map((field) => field.at.join('.')));
        const held = kept.credentialPaths(entry, row).filter((credentialPath) => !own.has(credentialPath));
        const viaFix = route.helper && held.every((credentialPath) => /^headers\.authorization$/i.test(credentialPath));
        if (held.length) return out.errors.push(`${row.id}: '${current.name}' holds a credential in ${held.join(', ')}, which the committed .mcp.json must not carry - keep it at ${current.scope} scope, or ${viaFix ? 'run /alfred-tools:fix first: key-to-helper moves the key into mcp-headers.js' : `take it out of ${held.join(', ')} first`}`);
    }

    // the key (spec D3-D5): a hosted route's helper reads the hosted chain each time Claude Code connects, a stdio route's
    // key is written in by the apply from the stdio chain. The line names the files, never a value; a name found only in
    // a file 0.1.x read names that file.
    const keyed = keyState && !(entry.headers && entry.headers.Authorization) ? keyState : null;
    // a bridge (0.4.0) reads its key and its URL names from the hosted chain each time the server starts, never through
    // Claude Code
    const bridge = bridgeParts(entry);
    let keyFile: string | null = null;
    let keyNames = [keyName];
    if (keyed && !(keyed.kind === 'stdio' && scope === 'project'))
    {
        const filled = keys.filledNames(keyed.files).some((filledEntry) => filledEntry.names.includes(keyName));
        out.keys.push({ row: row.id, name, scope, variable: keyName, kind: bridge ? 'bridge' : keyed.kind, files: keyed.files, filled, old: filled ? null : keys.oldHolding(context.project, context.home, keyName) });
        // a name filled nowhere in the chain is written, empty, into the chain's first file (D3)
        if (!filled) keyFile = keyed.files[0]!;
        // a helper's `NAME=VAR` pairs (sonarqube's organization): their names are written too, and optional
        const pairs = keyed.kind === 'helper' ? pairNames(entry) : [];
        const empty = pairs.filter((pairName) => !keys.filledNames(keyed.files).some((filledEntry) => filledEntry.names.includes(pairName)));
        if (pairs.length) keyNames = [keyName, ...pairs];
        if (empty.length) { keyFile = keyed.files[0]!; out.notes.push(...optionalNameNotes(row.id, route, empty, keyed.files[0]!)); }
    }
    let bridgeFilled: boolean | null = null;
    if (bridge && keyed)
    {
        // each name on its own (0.4.0 Ruling 9): one filled anywhere in the chain is not named again, the key's included
        const have = new Set(keys.filledNames(keyed.files).flatMap((filledEntry) => filledEntry.names));
        const all = [{ name: bridge.keyName!, optional: false }, ...(templateNames(bridge.template) || [])];
        const lack = all.filter((nameItem) => !have.has(nameItem.name));
        keyNames = lack.map((nameItem) => nameItem.name);
        keyFile = keyNames.length ? keyed.files[0]! : null;
        bridgeFilled = !lack.some((nameItem) => !nameItem.optional);
        const required = lack.filter((nameItem) => !nameItem.optional).map((nameItem) => nameItem.name);
        const optional = lack.filter((nameItem) => nameItem.optional).map((nameItem) => nameItem.name);
        const after = 'each time the server starts - after a change, restart Claude Code or reconnect it in /mcp';
        out.notes.push(required.length || optional.length
            ? `${row.id}: fill ${andList(required.length ? required : optional)} in ${keyed.files[0]}${required.length && optional.length ? ` (${andList(optional)} ${optional.length > 1 ? 'are' : 'is'} optional)` : !required.length ? ` (optional)` : ''}; the bridge reads them ${after}`
            : `${row.id}: the bridge reads its key and URL names from .mcps-secrets ${after}`);
    }
    // a stdio key at local or global scope: the apply writes it in from the stdio chain under the key's name (R7); configure
    // rewrites a registration whose key differs from the chosen name's filled value, even when nothing else changed
    const stepKey = keyed && keyed.kind === 'stdio' && scope !== 'project' && !unfilledStdio ? { name: keyName, files: keyed.files } : null;
    const chosen = stepKey && current ? keys.valueIn(stepKey.files, keyName) : null;
    const staleKey = Boolean(chosen) && chosen!.value !== liveKey;
    const withKey = stepKey ? { key: stepKey } : {};
    // the helper's own conditions (spec D4): the folder's trust at project and local scope, the declaring folder only at
    // project scope, node on the PATH - each said once
    const once = (text: string) => { if (!out.notes.includes(text)) out.notes.push(text); };
    // a bridge connects in a child folder too (F3) and sends no key through Claude Code: node is its one condition
    if (bridge) once('node must be on the PATH Claude Code starts with - mcp-bridge.js runs under it, as this plugin\'s commands do');
    if (keyed && keyed.kind === 'helper' && entry.headersHelper)
    {
        if (scope !== 'user' && inventory.trusted === false) once(`accept the trust dialog the next time Claude Code starts in ${context.project} - until then the server connects without its key`);
        // docs/sources.md M1: a parent folder's helper does not run in a child folder's session, named relative or absolute
        if (scope === 'project' && !PARENT_HELPER_IN_CHILD) out.notes.push(`${row.id}: a session started in a child folder connects without this key - Claude Code does not run a parent folder's helper there; pick Global, or install it in that folder too`);
        once('node must be on the PATH Claude Code starts with - mcp-headers.js runs under it, as this plugin\'s commands do');
    }
    // how a hosted keyed server connects once written (spec F3): its reconnect line, printed by render and repeated by the apply
    const reconnect = keyed && keyed.kind === 'helper' && entry.headersHelper
        ? { row: row.id, name, variable: keyName, file: keyed.files[0]!, filled: keys.filledNames(keyed.files).some((filledEntry) => filledEntry.names.includes(keyName)), anonymous: route.authMode === 'optional-token' && !route.keyless, hint: route.helper!.hint || null, untrusted: scope !== 'user' && inventory.trusted === false }
        : null;
    if (route.authMode === 'oauth' || (route.keyless === 'oauth' && !wantToken)) out.oauth.push({ row: row.id, name, scope, ...(form === 'signin' ? { signin: true, root: context.roots![roots.familyOf(scope)]! } : {}) });
    if (row.dangerous && row.dangerous.length) out.dangerous.push({ row: row.id, name, tools: row.dangerous });
    out.expect.push({ kind: 'mcp', row: row.id, name, scope, route: routeId });

    // a launch the cache may not hold yet is fetched once it is written (entries/names.ts fetchStep says why); a change that
    // keeps the package, such as a location or a name, fetches nothing
    const fetch = fetchStep(name, entry, row.id, current && current.entry);
    const contextAt = contextArgAt(entry);
    const uses: RootUses = { helper: Boolean(entry.headersHelper) || Boolean(bridge), bridge: Boolean(bridge) || form === 'two', serenaContext: contextAt >= 0 ? pathFor(context.platform).dirname(entry.args![contextAt]!) : undefined, keyFile, keyName, keyNames, data: dataAbs };
    // the shared sign-in's folder sits in the family's root: the root is written (its .gitignore) like any other
    const signInRoot = () => { if (form === 'signin') context.uses.push({ family: roots.familyOf(scope), root: context.roots![roots.familyOf(scope)]! }); };
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
        signInRoot();
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
    signInRoot();
    record();
    if (row.locations && current.rootStr && rootStr !== current.rootStr && formatRoot(logicalRoot(current.rootStr, context), 'local', context).value !== ensure)
        out.notes.push(`${row.id}: the old data stays at ${current.rootStr}; moving a location moves no data`);
    const configInit = row.id === 'serena' ? serenaConfigInitStep(entry, context) : null;
    if (configInit) out.steps.push(configInit);
    if (ensure && (!current.rootStr || rootStr !== current.rootStr)) out.steps.push({ op: 'ensure-dir', path: ensure, why: `${row.id}: new data folder` });
    if (moved)
        out.steps.push({ op: 'mcp-move', from: { name: current.name, scope: current.scope }, to: { name, scope }, entry, old: current.entry, row: row.id, route: routeId, ...withKey, ...withFilled, why: `${row.id}: ${current.name !== name ? `rename '${current.name}' to '${name}'` : ''}${current.name !== name && current.scope !== scope ? ' and ' : ''}${current.scope !== scope ? `move from ${current.scope} to ${scope} scope` : ''} - add first, read back, then remove the old one` });
    else
        out.steps.push({ op: 'mcp-replace', name, scope, entry, old: current.entry, row: row.id, route: routeId, ...withKey, ...withFilled, why: `${row.id}: rewrite '${name}' from the registration as read${staleKey && !edited && !fresh ? ` - writes in the key ${keyName} holds in ${chosen!.file}` : ''}` });
    if (fetch) out.steps.push(fetch);
    return undefined;
}
