// One MCP pick's entry: its settings checked, its data folder placed, and the entry built from the catalog for a fresh
// add or a new route, else edited from the registration as read - its pin, cut-off and the user's own args kept.
import { formatRoot, applyRoot } from '../../entries/locations.ts';
import { checkHostedSettings, currentHostedSettings, defaultHostedSettings } from '../hosted-settings.ts';
import { buildEntry, applyContext, bridgeParts, helperParts, helperGlobalRoot, bridgePathFor, renameTemplate, helperFor, subst, rebridgedArgs } from '../../entries/entry.ts';
import { EXECUTABLE_PATH_FLAG } from '../../entries/constants.ts';
import { withExclude } from '../../entries/exclude.ts';
import { routeField } from '../../catalog/rows.ts';
import * as keys from '../../keys/keys.ts';
import * as kept from '../../core/kept.ts';
import { wantedRoot } from './root.ts';
import { required } from '../required.ts';
import type { ServerEntry } from '../../core/types.ts';
import type { Catalog } from '../../catalog/types.ts';
import type { Current } from '../../entries/types.ts';
import type { PickAnswer, PickAnswers, PickBase, PickEntry, Plan, PlanCtx } from '../types.ts';

// The registration's entry with this pick's answers: the data folder, serena's context, the browser binary, the bridge's
// path, template and key name, the hosted helper, the optional key and the host.
function editedEntry(base: PickBase, answers: PickAnswers, current: Current, edit: { rootStr: string | undefined; wantExec: string | null | undefined; toolSettings: Record<string, string> | undefined }, context: PlanCtx, out: Plan): ServerEntry
{
    const { row, routeId, route, scope } = base;
    const { params, wantToken, sendNow, keyName, urlNames } = answers;
    let entry: ServerEntry = JSON.parse(JSON.stringify(current.entry));
    if (row.locations && edit.rootStr !== current.rootStr && edit.rootStr !== undefined) entry = applyRoot(entry, row, edit.rootStr, scope, context);
    // serena's context file follows the scope's root (D7)
    if (route.run && route.run.includes('{contextFile}')) entry = applyContext(entry, scope, context);
    if (route.excludeFile) entry = withExclude(entry, route, answers.exclude, scope, context);
    if (route.optionalArgs && route.optionalArgs.executablePath && edit.wantExec !== current.executablePath)
    {
        const args = (entry.args || []).slice();
        const i = args.indexOf(EXECUTABLE_PATH_FLAG);
        if (i >= 0) args.splice(i, 2);
        if (edit.wantExec) args.push(EXECUTABLE_PATH_FLAG, edit.wantExec);
        entry.args = args;
    }
    if (route.runtime === 'bridge')
    {
        // from the registration as read (0.4.0): its path follows the scope, its template the URL names and its key
        // argument the key's name; the scheme, the pin and the cut-off stay
        const parts = required(bridgeParts(entry), `${row.id}: '${current.name}' is on the bridge route but runs no bridge`);
        const args = entry.args || [];
        const at = args.findIndex((argument) => String(argument) === parts.path);
        const held: Record<string, string | undefined> = current.urlNames || {};
        const rename = Object.fromEntries((route.urlVars || []).flatMap((urlVar) => { const next = urlNames[urlVar.var]; return next === undefined ? [] : [[held[urlVar.var] || urlVar.var, next]]; }));
        entry.args = rebridgedArgs(args, at, { path: bridgePathFor(scope, context), template: renameTemplate(parts.template, rename), keyName: required(keyName, `${row.id}: its bridge route names no key`), globalRoot: helperGlobalRoot(scope, context) });
    }
    else if (routeId === 'remote' && route.helper)
    {
        // the helper follows the scope and its root, under the name it passes now; an Authorization header of the
        // 0.1.x kind is fix's to move (key-to-helper, spec D7), never dropped here while a key is wanted
        const headers = entry.headers;
        const header = Boolean(headers && headers.Authorization);
        if (!wantToken)
        {
            delete entry.headersHelper;
            if (header && headers) { delete headers.Authorization; if (!Object.keys(headers).length) delete entry.headers; }
        }
        else if (header) out.notes.push(`${row.id}: '${current.name}' sends its key from an Authorization header - /alfred-tools:fix moves it into .mcps-secrets, read by mcp-headers.js (key-to-helper)`);
        else entry.headersHelper = helperFor(route, scope, context, keyName, edit.toolSettings, (helperParts(current.entry.headersHelper) || { pairs: null }).pairs);
    }
    else if (route.authMode === 'optional-token' && sendNow !== current.token)
    {
        // the key comes out of every place it is in - its env pair, or a former --api-key (D1) - and goes in the env
        entry = keys.withoutTokenFields(entry, route);
        if (sendNow) entry.env = { ...(entry.env || {}), ...routeField(route.optionalEnv?.token, row.id, 'optionalEnv.token') };
    }
    if (row.params && current.host && params.host !== current.host) entry.url = subst(route.url, params);
    return entry;
}

// -> the entry and its data folder, or - for a refused setting or folder - the length of the errors list, which planMcp
// returns
export function pickEntry(base: PickBase, answers: PickAnswers, pick: PickAnswer, context: PlanCtx, catalog: Catalog, out: Plan): PickEntry | number
{
    const { row, current, routeId, route, scope, name } = base;
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
        if (wanted.error !== undefined) return out.errors.push(`${row.id}: ${wanted.error}`);
        rootStr = formatRoot(wanted.root, scope, context).value;
        dataAbs = rootStr;
        if (!wanted.existing) ensure = dataAbs;
        // an absolute --user-data-dir: every session under this folder opens the same persistent profile, which one
        // browser at a time can hold (docs/sources.md 'Playwright MCP')
        if (scope === 'project' && row.id.startsWith('playwright-'))
            out.notes.push(`${row.id}: one browser profile for every session under this folder - two sessions at once cannot both open it`);
    }

    const { params, sendNow, keyName, urlNames } = answers;
    const fresh = !current || current.route !== routeId;
    const entry = !current || current.route !== routeId
        ? buildEntry(row, routeId, { rootStr, scope, executablePath: wantExec, token: sendNow, keyName, params, urlNames, settings: toolSettings, exclude: answers.exclude }, context, catalog.rules)
        : editedEntry(base, answers, current, { rootStr, wantExec, toolSettings }, context, out);
    return { entry, fresh, rootStr, ensure, dataAbs, hostedSettings: Boolean(hostedSettings) };
}
