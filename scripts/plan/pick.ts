// One MCP pick: its route, scope, name, root, location, key and settings, as plan steps.
import fs from 'node:fs';
import path from 'node:path';
import { pathFor } from '../entries/platform.ts';
import { recommendedSide, alfredNameProblem, logicalRoot, otherPlace, parseRoot, alfredRoot, defaultRoot, serenaSpaceFree, formatRoot, validWindowsSerenaHome, applyRoot } from '../entries/locations.ts';
import { currentOf, buildEntry, applyContext, bridgeParts, helperGlobalRoot, bridgePathFor, renameTemplate, helperFor, subst, mergeSettings, contextArgAt } from '../entries/entry.ts';
import { signInParts, signInFormOf } from '../entries/sign-in.ts';
import { nameProblem, fetchStep } from '../entries/names.ts';
import { recommendedScope, keyStateOf, heldKey, PARENT_HELPER_IN_CHILD } from './asks-keys.ts';
import * as keys from '../keys/keys.ts';
import * as kept from '../core/kept.ts';
import * as roots from '../roots/roots.ts';
import { templateNames } from '../copied/mcp-bridge.js';
import { listSteps } from './lists.ts';
import * as cursorMcp from '../cursor/cursor-mcp.ts';
import * as serenaConfig from '../apply/serena-config.ts';
import { keyOf, fromHere, otherWindowsMcp } from '../inventory/inventory.ts';
import { deepEqual } from '../core/json-file.ts';
import { SCOPES, andList } from './context.ts';
import { rootIgnoreLines } from '../apply/file-steps.ts';
import type { ServerEntry } from '../core/types.ts';
import type { Catalog, CatalogRow } from '../catalog/types.ts';
import type { Current, Root, Roots } from '../entries/types.ts';
import type { Inventory } from '../inventory/types.ts';
import type { ListServer } from '../mcps-list/types.ts';
import type { Family } from '../roots/types.ts';
import type { EnsureKeyNameStep, ListCtx, PathStep, PickAnswer, Plan, PlanCtx, PlanOut, PlanStep, RecordRootStep, RootUses, RootWrite } from './types.ts';

// ---- one MCP pick ---------------------------------------------------------------------------------------------------

export function projectName(ctx: { project: string }): string
{
    return path.basename(ctx.project).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
}

function resolveName(pick: PickAnswer, row: CatalogRow, cur: Current | null, ctx: { project: string }): string
{
    const n = pick.name === undefined ? 'keep' : pick.name;
    if (n === 'keep') return cur ? cur.name : row.name;
    if (n === 'prefixed') return `${projectName(ctx)}-${row.name}`.slice(0, 64);
    return n;
}

// A data folder is `<root>/<name>` in the root of the scope's family (spec D2): side 'project' - the project root,
// 'account' - the global root; 'default' is the recommended side (serena on Windows: its profile's .serena, or a
// space-free folder).
function wantedRoot(row: CatalogRow, pick: PickAnswer, cur: Current | null, name: string, scope: string, ctx: PlanCtx): { error: string; root?: undefined; existing?: undefined } | { root: Root; existing: boolean; error?: undefined }
{
    const serenaWin = row.locations!.windowsAbsolute && ctx.platform === 'win32';
    let loc = pick.location || { side: cur ? 'keep' : recommendedSide(row, scope, ctx) };
    if (loc.side === 'default' && !serenaWin) loc = { side: recommendedSide(row, scope, ctx) };
    // an .alfred project root holds alfred-code's own entries: a registration of this family is never given a name
    // that is one (a registration already under that name keeps it)
    const P = pathFor(ctx.platform);
    if (scope !== 'user' && !(cur && cur.name === name) && ctx.roots && ctx.roots.project === P.join(ctx.project, '.alfred'))
    {
        const problem = alfredNameProblem(name, ctx);
        if (problem) return { error: problem };
    }
    let root: Root | null | undefined;
    let existing = false;
    if (loc.side === 'keep' && cur && cur.rootStr) root = logicalRoot(cur.rootStr, ctx);
    else if (loc.side === 'project') root = otherPlace(row, name, 'project', ctx);
    else if (loc.side === 'account') root = otherPlace(row, name, 'account', ctx);
    else if (loc.side === 'path') root = parseRoot(loc.path!, ctx);
    else if (loc.side === 'alfred-data')
    {
        if (!ctx.alfredHere) return { error: 'alfred-code is not set up here (no .alfred/.gitignore) - pick another folder' };
        const problem = alfredNameProblem(name, ctx);
        if (problem) return { error: problem };
        root = { kind: 'project', rel: `.alfred/${name}` };
    }
    else if (loc.side === 'alfred')
    {
        // only on the user's pick: the folder is alfred-code's, so deleting it erases this tool's data
        root = alfredRoot(row, ctx);
        if (!root) return { error: "no alfred-code data folder for it on disk" };
        existing = true;
    }
    else
    {
        const d = defaultRoot(row, name, ctx);
        // serena on Windows with a spaced profile: the space-free folder the question recommends in its place
        if (d.needsInput && !serenaWin) return { error: d.needsInput };
        root = d.needsInput ? serenaSpaceFree(ctx) : d.root;
        existing = Boolean((d as { existing?: boolean }).existing);
    }
    if (row.locations!.windowsAbsolute && ctx.platform === 'win32')
    {
        const resolved = formatRoot(root!, 'local', ctx);
        const text = resolved.value && resolved.value.replace(/\//g, '\\');
        if (!text || !validWindowsSerenaHome(text))
            return { error: `serena's home on Windows must be absolute, in backslashes and space-free (fix row serena-windows-home); '${text || loc.path}' is not` };
        return { root: { kind: 'abs', path: text }, existing };
    }
    return { root: root!, existing };
}

// The list entry of a registration, or null.
function listedOf(inv: Inventory, reg: { name: string; scope: string }): ListServer | null
{
    const l = inv.lists && inv.lists[roots.familyOf(reg.scope)];
    return l && !l.note && !l.old ? (l.servers || []).find((x) => x.name === reg.name && x.scope === reg.scope) || null : null;
}

export function planMcp(row: CatalogRow, pick: PickAnswer, inv: Inventory, ctx: PlanCtx, catalog: Catalog, out: Plan): number | undefined
{
    if (!row.os.includes(ctx.platform)) return out.errors.push(`${row.id}: not offered on ${ctx.platform}`);
    // configure names its target; an install pick only adds, whatever else of this row is installed
    const here = inv.registrations.filter((r) => r.rowId === row.id && !r.alfredRetired);
    const target = pick.target ? here.find((r) => r.name === pick.target!.name && r.scope === pick.target!.scope) : null;
    const cur = target ? currentOf(row, target) : null;

    // which apps (D3): the answer, else what the list holds for the target, else Claude Code only
    const listedEntry = target ? listedOf(inv, target) : null;
    const listedClients = listedEntry ? listedEntry.clients || ['claude'] : ['claude'];
    let clients = pick.clients || listedClients;

    const routeId = (pick.route || (cur ? cur.route : row.recommendedRoute))!;
    const route = row.routes[routeId];
    if (!route) return out.errors.push(`${row.id}: no ${routeId} route (routes: ${Object.keys(row.routes).join(', ')})`);
    // a fresh pick's scope: the recommended one (spec D5, F2)
    const scope = pick.scope || (cur ? cur.scope : recommendedScope(row, routeId));
    if (!SCOPES.includes(scope)) return out.errors.push(`${row.id}: unknown scope '${scope}'`);
    // a stdio route that needs a key holds it written in, which the committed .mcp.json never carries (spec D5); a
    // registration already there is configure's to keep
    // a bridge holds names only (0.4.0, Ruling 6)
    if (scope === 'project' && routeId !== 'remote' && route.runtime !== 'bridge' && route.authMode === 'token' && !(cur && cur.scope === 'project'))
        return out.errors.push(`${row.id}: its local route needs a key written into the registration, so it is not offered at project scope - the committed .mcp.json carries no key; pick local or global scope, or the hosted route`);
    const bad = inv.unreadable.find((u) => (u.scope === scope) || (scope !== 'project' && ['local', 'user'].includes(u.scope) && ['local', 'user'].includes(scope)));
    if (bad) return out.errors.push(`${row.id}: the ${scope} scope is unreadable (${bad.file} is ${bad.state}); nothing is written there`);

    const name = resolveName(pick, row, cur, ctx);
    // an install pick already there under this name and scope - a re-run, or a tool installed since: never changed here
    const same = !pick.target && here.find((r) => r.name === name && r.scope === scope);
    for (const r of here)
    {
        if (r === target || r === same || ctx.changing.has(keyOf('mcp', r.name, r.scope))) continue;
        if (r.scope !== 'inherited') out.notes.push(`${row.id}: also installed as '${r.name}' at ${r.scope} scope - left as it is`);
        else if (r.name !== name) out.notes.push(`${row.id}: also inherited as '${r.name}' from ${fromHere(inv, r.from!)} (${r.approval}) - change it there`);
    }
    if (same)
    {
        out.expect.push({ kind: 'mcp', row: row.id, name, scope, route: same.route });
        return out.unchanged.push(`${row.id}: '${name}' is already installed at ${scope} scope - a change to it is /preferred-tools:configure`);
    }
    const taken = inv.registrations.filter((r) => r.scope === scope);
    const problem = nameProblem(name, { catalog, taken, self: cur ? { name: cur.name, scope: cur.scope } : null });
    if (problem) return out.errors.push(`${row.id}: ${problem}`);
    // windows-mcp 0.8.8 makes one missed overlay confirmation permanent; another session cannot be seen, so it is named
    if (row.id === 'windows-control' && !target)
    {
        const others = otherWindowsMcp(inv, name);
        out.notes.push(`windows-control: keep one windows-mcp per Windows desktop - another Claude Code session with it open${others.length ? `, or ${others.join(', ')},` : ''} can leave its tools unavailable until a new session starts it again`);
    }
    for (const r of inv.registrations)
    {
        if (r.name !== name || r.scope === scope) continue;
        // a parent's copy ranks as project scope, below this project's local and project ones, above user (M2, M3)
        if (r.scope === 'inherited')
        {
            if (r.shadowed && r.shadowed.scope === 'inherited') continue;
            const from = fromHere(inv, r.from!);
            out.notes.push(`${row.id}: '${name}' is also inherited from ${from} (${r.approval}); Claude Code uses ${scope === 'user' ? `the inherited one from ${from} in this project - a .mcp.json server ranks above user scope` : `this project's ${scope} copy`}`);
        }
        else out.notes.push(`${row.id}: '${name}' also exists at ${r.scope} scope; Claude Code reads local, then project, then user, so the nearer one wins`);
    }

    // the answers that edit an entry
    const params = { host: row.params ? (pick.params && pick.params.host) || (cur && cur.host) || row.params[0]!.default : undefined, ...(pick.params || {}) } as { host: string } & Record<string, string>;
    // an optional key: sent when picked; with no answer, sent at install (the recommended answer, spec F2) and kept as it is
    // at configure. A stdio route at project scope runs keyless (spec D5) - named so it is never read as the catalog's
    // `route.keyless`, the keyless way in
    const keylessAtProject = scope === 'project' && routeId !== 'remote' && route.authMode === 'optional-token';
    if (keylessAtProject && pick.token) return out.errors.push(`${row.id}: its local route runs keyless at project scope - the committed .mcp.json carries no key; pick local or global scope for a key, or the hosted route`);
    let wantToken = pick.token === undefined ? (cur ? Boolean(cur.token) : route.authMode === 'optional-token' && !keylessAtProject) : Boolean(pick.token);
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
    const ks = usesKey ? keyStateOf(row, routeId, ctx, inv.alfredCodeEnabled, scope) : null;
    const sameRoute = Boolean(cur) && cur!.route === routeId;
    const liveKey = sameRoute && ks && ks.kind === 'stdio' ? heldKey(ctx.readLive(cur!.name, cur!.scope) || {}, route) : null;
    // a switch between the hosted route and the bridge keeps the name: both read it from the hosted chain (0.4.0)
    const keyName = (pick.keyName || (route.helper && cur && cur.keyName ? cur.keyName : null) || (liveKey ? keys.nameOfValue(ks!.files, liveKey) : null) || keyVar)!;
    // a stdio optional key whose name is filled nowhere in the chain (spec F2): written with no key argument, never as an
    // empty one - a stdio key is read only when the registration is written. A registration that holds its key keeps it.
    const unfilledStdio = Boolean(ks) && ks!.kind === 'stdio' && route.authMode === 'optional-token' && scope !== 'project'
        && !(sameRoute && cur!.token) && !keys.filledNames(ks!.files).some((f) => f.names.includes(keyName));
    const sendNow = wantToken && !unfilledStdio;
    // a bridge's URL names (0.4.0): answered, else the registration's (by position), else the catalog's. A name that is
    // the key's or reads as a credential is refused, typed or read (Ruling 3): a key never goes in a URL.
    const urlNames: Record<string, string> = {};
    if (route.runtime === 'bridge')
    {
        const held: Record<string, string | undefined> = (cur && cur.route === routeId && cur.urlNames) || {};
        for (const v of route.urlVars || [])
        {
            const n = (pick.urlNames && pick.urlNames[v.var]) || held[v.var] || v.var;
            if (!keys.NAME_RULE.test(String(n))) return out.errors.push(`${row.id}: '${n}' is not a name - a name matches ${keys.NAME_RULE.source}`);
            if (n === keyName || keys.credentialName(n)) return out.errors.push(`${row.id}: ${n} holds a key - a key never goes in a URL; pick another name for the ${v.label}`);
            // one name per part: a template naming one twice never starts (review I4)
            const twin = Object.keys(urlNames).find((k) => urlNames[k] === n);
            if (twin) return out.errors.push(`${row.id}: ${n} already names the ${route.urlVars!.find((x) => x.var === twin)!.label} - each part of the URL needs its own name; pick another name for the ${v.label}`);
            urlNames[v.var] = n;
        }
    }
    if (unfilledStdio) out.notes.push(`${row.id}: fill ${keyName} in ${ks!.files[0]}, then /preferred-tools:configure -> Use a key from .mcps-secrets writes it in`);
    // the server's settings (spec D9): pairs merged into a stdio route's env - never a key, and no machine path in the
    // committed file
    if (pick.settings)
    {
        if (routeId === 'remote') return out.errors.push(`${row.id}: a hosted route takes no settings - its options are its route and host`);
        for (const [k, v] of Object.entries(pick.settings))
        {
            if (!keys.NAME_RULE.test(k)) return out.errors.push(`${row.id}: '${k}' is not a setting name - a name matches ${keys.NAME_RULE.source}`);
            if (keys.credentialName(k)) return out.errors.push(`${row.id}: ${k} looks like a key - keep a key in .mcps-secrets and pick it as the key's name`);
            if (kept.looksLikeKey(v)) return out.errors.push(`${row.id}: ${k}'s value looks like a key - keep a key in .mcps-secrets and pick its name as the key's name`);
        }
    }
    const wantExec = pick.executablePath === undefined ? (cur ? cur.executablePath : undefined) : (pick.executablePath || undefined);
    let rootStr: string | undefined;
    let ensure: string | null = null;
    let dataAbs: string | null = null;
    if (row.locations)
    {
        const w = wantedRoot(row, pick, cur, name, scope, ctx);
        if (w.error) return out.errors.push(`${row.id}: ${w.error}`);
        rootStr = formatRoot(w.root!, scope, ctx).value;
        dataAbs = rootStr;
        if (!w.existing) ensure = dataAbs;
        // an absolute --user-data-dir: every session under this folder opens the same persistent profile, which one
        // browser at a time can hold (docs/sources.md 'Playwright MCP')
        if (scope === 'project' && row.id.startsWith('playwright-'))
            out.notes.push(`${row.id}: one browser profile for every session under this folder - two sessions at once cannot both open it`);
    }

    let entry: ServerEntry;
    let fresh = !cur || cur.route !== routeId;
    if (fresh)
        entry = buildEntry(row, routeId, { rootStr, scope, executablePath: wantExec, token: sendNow, keyName, params, urlNames }, ctx, catalog.rules);
    else
    {
        entry = JSON.parse(JSON.stringify(cur!.entry));
        if (row.locations && rootStr !== cur!.rootStr) entry = applyRoot(entry, row, rootStr!, scope, ctx);
        // serena's context file follows the scope's root (D7)
        if (route.run && route.run.includes('{contextFile}')) entry = applyContext(entry, scope, ctx);
        if (route.optionalArgs && route.optionalArgs.executablePath && wantExec !== cur!.executablePath)
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
            const at = entry.args!.findIndex((a) => String(a) === parts!.path);
            const held: Record<string, string | undefined> = cur!.urlNames || {};
            const rename = Object.fromEntries((route.urlVars || []).map((v) => [held[v.var] || v.var, urlNames[v.var]!]));
            const globalRoot = helperGlobalRoot(scope, ctx);
            entry.args = [...entry.args!.slice(0, at), bridgePathFor(scope, ctx), renameTemplate(parts!.template, rename), keyName, ...entry.args!.slice(at + 3, at + 5), ...(globalRoot ? [globalRoot] : []), ...entry.args!.slice(at + 6)];
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
            else if (header) out.notes.push(`${row.id}: '${cur!.name}' sends its key from an Authorization header - /preferred-tools:fix moves it into .mcps-secrets, read by mcp-headers.js (key-to-helper)`);
            else entry.headersHelper = helperFor(route, scope, ctx, keyName);
        }
        else if (route.authMode === 'optional-token' && sendNow !== cur!.token)
        {
            const args = (entry.args || []).slice();
            const i = args.indexOf('--api-key');
            if (i >= 0) args.splice(i, 2);
            if (sendNow) args.push(...route.optionalArgs!.token!);
            entry.args = args;
        }
        if (row.params && cur!.host && params.host !== cur!.host) entry.url = subst(route.url, params);
    }

    // Cursor's form of a hosted route (D5): a keyless OAuth route for both apps is the shared mcp-remote sign-in in the
    // family's root, for Claude Code only the http form; a keyed one keeps its helper for Claude Code and gets the bridge
    // for Cursor (the list's cursorEntry), unless it sends a header of its own the bridge has no place for
    let form: string | null = null;
    if (routeId === 'remote' && route.keyless === 'oauth' && !wantToken)
    {
        const family = roots.familyOf(scope);
        const root = ((ctx.roots || {}) as Roots)[family];
        const P = pathFor(ctx.platform);
        const was = signInParts(entry);
        const httpUrl = row.params && params.host ? subst(route.url, params) : (was ? was.url : entry.url);
        const exists = ctx.exists || ((x) => fs.existsSync(x));
        if (clients.includes('cursor') && root && (exists(root) || P.basename(root) === '.alfred') && roots.gitIgnores(P.join(root, roots.FILES.signIns, 'tokens')) === false)
        {
            out.notes.push(`${root}: git would commit ${roots.FILES.signIns}/ - ${name} is set up for Claude Code only; /preferred-tools:fix (root-ignore) covers it, then configure adds Cursor`);
            clients = clients.filter((c) => c !== 'cursor');
        }
        if (clients.includes('cursor') && root)
        {
            entry = was
                ? { ...entry, args: entry.args!.map((a) => (a === was.url ? httpUrl! : a)), env: { ...(entry.env || {}), MCP_REMOTE_CONFIG_DIR: root } }
                : signInFormOf(httpUrl!, root, catalog, ctx);
            delete entry.url;
            form = 'signin';
            if (cur && !signInParts(cur.entry)) out.notes.push(`${name}: sign in once more - the sign-in now lives in ${P.join(root, roots.FILES.signIns)}/ and serves both apps`);
        }
        else
        {
            if (was) entry = { type: 'http', url: httpUrl };
            if (cur && signInParts(cur.entry)) out.notes.push(`${name}: Claude Code signs in on its own again (/mcp)`);
        }
    }
    else if (routeId === 'remote' && entry.headersHelper && clients.includes('cursor'))
    {
        const other = cursorMcp.otherHeaders(entry);
        if (other.length)
        {
            out.notes.push(`${name}: set up for Claude Code only - its ${other.join(', ')} header${other.length > 1 ? 's have' : ' has'} no bridge equivalent`);
            clients = clients.filter((c) => c !== 'cursor');
        }
        else form = 'two';
    }

    // a stdio route holding its key in the registration (D6) reaches Cursor at global scope only: .cursor/mcp.json may be
    // committed, and project scope is closed to it already
    if (scope === 'local' && clients.includes('cursor') && cursorMcp.stdioKeyed(entry, row, routeId))
    {
        out.notes.push('Cursor: not written - this route keeps its key in the registration, and .cursor/mcp.json may be committed; pick the hosted route for Cursor');
        clients = clients.filter((c) => c !== 'cursor');
    }

    if (pick.settings) entry = mergeSettings(entry, route, pick.settings);

    // .mcp.json is committed: a move into it never carries a credential the route's own token field does not take - a
    // header of the user's own, a userinfo URL, a 0.1.x Authorization header (D7). A key never becomes a ${VAR} there: a
    // hosted key goes through the helper (key-to-helper moves a 0.1.x header first), and a stdio key never moves in (D5).
    if (scope === 'project' && cur && cur.scope !== 'project')
    {
        const own = new Set(keys.tokenFields(entry, route).map((f) => f.at.join('.')));
        const held = kept.credentialPaths(entry, row).filter((p) => !own.has(p));
        const viaFix = route.helper && held.every((p) => /^headers\.authorization$/i.test(p));
        if (held.length) return out.errors.push(`${row.id}: '${cur.name}' holds a credential in ${held.join(', ')}, which the committed .mcp.json must not carry - keep it at ${cur.scope} scope, or ${viaFix ? 'run /preferred-tools:fix first: key-to-helper moves the key into mcp-headers.js' : `take it out of ${held.join(', ')} first`}`);
    }

    // the key (spec D3-D5): a hosted route's helper reads the hosted chain each time Claude Code connects, a stdio route's
    // key is written in by the apply from the stdio chain. The line names the files, never a value; a name found only in
    // a file 0.1.x read names that file.
    const keyed = ks && !(entry.headers && entry.headers.Authorization) ? ks : null;
    // a bridge (0.4.0) reads its key and its URL names from the hosted chain each time the server starts, never through
    // Claude Code
    const bridge = bridgeParts(entry);
    let keyFile: string | null = null;
    let keyNames = [keyName];
    if (keyed && !(keyed.kind === 'stdio' && scope === 'project'))
    {
        const filled = keys.filledNames(keyed.files).some((f) => f.names.includes(keyName));
        out.keys.push({ row: row.id, name, scope, variable: keyName, kind: bridge ? 'bridge' : keyed.kind, files: keyed.files, filled, old: filled ? null : keys.oldHolding(ctx.project, ctx.home, keyName) });
        // a name filled nowhere in the chain is written, empty, into the chain's first file (D3)
        if (!filled) keyFile = keyed.files[0]!;
    }
    let bridgeFilled: boolean | null = null;
    if (bridge && keyed)
    {
        // each name on its own (0.4.0 Ruling 9): one filled anywhere in the chain is not named again, the key's included
        const have = new Set(keys.filledNames(keyed.files).flatMap((f) => f.names));
        const all = [{ name: bridge.keyName!, optional: false }, ...(templateNames(bridge.template) || [])];
        const lack = all.filter((n) => !have.has(n.name));
        keyNames = lack.map((n) => n.name);
        keyFile = keyNames.length ? keyed.files[0]! : null;
        bridgeFilled = !lack.some((n) => !n.optional);
        const required = lack.filter((n) => !n.optional).map((n) => n.name);
        const optional = lack.filter((n) => n.optional).map((n) => n.name);
        const after = 'each time the server starts - after a change, restart Claude Code or reconnect it in /mcp';
        out.notes.push(required.length || optional.length
            ? `${row.id}: fill ${andList(required.length ? required : optional)} in ${keyed.files[0]}${required.length && optional.length ? ` (${andList(optional)} ${optional.length > 1 ? 'are' : 'is'} optional)` : !required.length ? ` (optional)` : ''}; the bridge reads them ${after}`
            : `${row.id}: the bridge reads its key and URL names from .mcps-secrets ${after}`);
    }
    // a stdio key at local or global scope: the apply writes it in from the stdio chain under the key's name (R7); configure
    // rewrites a registration whose key differs from the chosen name's filled value, even when nothing else changed
    const stepKey = keyed && keyed.kind === 'stdio' && scope !== 'project' && !unfilledStdio ? { name: keyName, files: keyed.files } : null;
    const chosen = stepKey && cur ? keys.valueIn(stepKey.files, keyName) : null;
    const staleKey = Boolean(chosen) && chosen!.value !== liveKey;
    const withKey = stepKey ? { key: stepKey } : {};
    // the helper's own conditions (spec D4): the folder's trust at project and local scope, the declaring folder only at
    // project scope, node on the PATH - each said once
    const once = (text: string) => { if (!out.notes.includes(text)) out.notes.push(text); };
    // a bridge connects in a child folder too (F3) and sends no key through Claude Code: node is its one condition
    if (bridge) once('node must be on the PATH Claude Code starts with - mcp-bridge.js runs under it, as this plugin\'s commands do');
    if (keyed && keyed.kind === 'helper' && entry.headersHelper)
    {
        if (scope !== 'user' && inv.trusted === false) once(`accept the trust dialog the next time Claude Code starts in ${ctx.project} - until then the server connects without its key`);
        // docs/sources.md M1: a parent folder's helper does not run in a child folder's session, named relative or absolute
        if (scope === 'project' && !PARENT_HELPER_IN_CHILD) out.notes.push(`${row.id}: a session started in a child folder connects without this key - Claude Code does not run a parent folder's helper there; pick Global, or install it in that folder too`);
        once('node must be on the PATH Claude Code starts with - mcp-headers.js runs under it, as this plugin\'s commands do');
    }
    // how a hosted keyed server connects once written (spec F3): its reconnect line, printed by render and repeated by the apply
    const reconnect = keyed && keyed.kind === 'helper' && entry.headersHelper
        ? { row: row.id, name, variable: keyName, file: keyed.files[0]!, filled: keys.filledNames(keyed.files).some((f) => f.names.includes(keyName)), anonymous: route.authMode === 'optional-token' && !route.keyless, hint: route.helper!.hint || null, untrusted: scope !== 'user' && inv.trusted === false }
        : null;
    if (route.authMode === 'oauth' || (route.keyless === 'oauth' && !wantToken)) out.oauth.push({ row: row.id, name, scope, ...(form === 'signin' ? { signin: true, root: ctx.roots![roots.familyOf(scope)]! } : {}) });
    if (row.dangerous && row.dangerous.length) out.dangerous.push({ row: row.id, name, tools: row.dangerous });
    out.expect.push({ kind: 'mcp', row: row.id, name, scope, route: routeId });

    // a launch the cache may not hold yet is fetched once it is written (entries.js fetchStep says why); a change that
    // keeps the package, such as a location or a name, fetches nothing
    const fetch = fetchStep(name, entry, row.id, cur && cur.entry);
    const uses: RootUses = { helper: Boolean(entry.headersHelper) || Boolean(bridge), bridge: Boolean(bridge) || form === 'two', serenaContext: contextArgAt(entry) >= 0, keyFile, keyName, keyNames, data: dataAbs };
    // the shared sign-in's folder sits in the family's root: the root is written (its .gitignore) like any other
    const signInRoot = () => { if (form === 'signin') ctx.uses.push({ family: roots.familyOf(scope), root: ctx.roots![roots.familyOf(scope)]! }); };
    // the apps and the form this registration is listed with (plan-lists.js)
    const record = () => { const k = keyOf('mcp', name, scope); if (ctx.clientsFor) ctx.clientsFor.set(k, clients); if (ctx.formFor) ctx.formFor.set(k, form); };
    // a bridge step says whether its names are filled: the apply's background start skips one that cannot start yet
    const withFilled = bridge ? { filled: Boolean(bridgeFilled) } : {};
    // serena's base modes (D7): the edit runs after its first start, so the plan says what it does first
    const serenaLine = () => { const l = row.id === 'serena' ? serenaConfig.planNote(entry, ctx) : null; if (l && !out.notes.includes(l)) out.notes.push(l); };
    if (!cur)
    {
        serenaLine();
        if (reconnect) out.reconnect.push(reconnect);
        useRoots(ctx, scope, uses);
        signInRoot();
        record();
        if (ensure) out.steps.push({ op: 'ensure-dir', path: ensure, why: `${row.id}: data folder, with a .gitignore holding * so the project's own .gitignore is never edited` });
        out.steps.push({ op: 'mcp-add', name, scope, entry, row: row.id, route: routeId, ...withKey, ...withFilled, why: `${row.id}: add (${routeId}) at ${scope} scope` });
        if (fetch) out.steps.push(fetch);
        return undefined;
    }
    const moved = cur.name !== name || cur.scope !== scope;
    const edited = !deepEqual(entry, cur.entry);
    if (!moved && !edited && !fresh && !staleKey)
    {
        // the apps alone changed (D3): the list entry and Cursor's file, no claude call; a two-form entry's bridge is
        // written into the root for Cursor's copy
        const sameApps = [...clients].sort().join() === [...listedClients].sort().join();
        if (sameApps || !ctx.clientsOnly) return out.unchanged.push(`${row.id}: '${name}' at ${scope} scope already as answered`);
        ctx.clientsOnly.push({ key: keyOf('mcp', name, scope), clients, form });
        if (form === 'two') useRoots(ctx, scope, { helper: true, bridge: true });
        return undefined;
    }
    serenaLine();
    if (reconnect) out.reconnect.push(reconnect);
    useRoots(ctx, scope, uses);
    signInRoot();
    record();
    if (row.locations && cur.rootStr && rootStr !== cur.rootStr && formatRoot(logicalRoot(cur.rootStr, ctx), 'local', ctx).value !== ensure)
        out.notes.push(`${row.id}: the old data stays at ${cur.rootStr}; moving a location moves no data`);
    if (ensure && (!cur.rootStr || rootStr !== cur.rootStr)) out.steps.push({ op: 'ensure-dir', path: ensure, why: `${row.id}: new data folder` });
    if (moved)
        out.steps.push({ op: 'mcp-move', from: { name: cur.name, scope: cur.scope }, to: { name, scope }, entry, old: cur.entry, row: row.id, route: routeId, ...withKey, ...withFilled, why: `${row.id}: ${cur.name !== name ? `rename '${cur.name}' to '${name}'` : ''}${cur.name !== name && cur.scope !== scope ? ' and ' : ''}${cur.scope !== scope ? `move from ${cur.scope} to ${scope} scope` : ''} - add first, read back, then remove the old one` });
    else
        out.steps.push({ op: 'mcp-replace', name, scope, entry, old: cur.entry, row: row.id, route: routeId, ...withKey, ...withFilled, why: `${row.id}: rewrite '${name}' from the registration as read${staleKey && !edited && !fresh ? ` - writes in the key ${keyName} holds in ${chosen!.file}` : ''}` });
    if (fetch) out.steps.push(fetch);
    return undefined;
}

// The roots a registration step writes into (spec D2-D4): its helper's - the scope's family root, with the bridge beside
// it for a bridge route - its key file's and its data folder's. Only a step that is planned uses a root, so a plan with no
// change writes no file. `keyNames` (a bridge's key and URL names) replaces the one `keyName` when given.
export function useRoots(ctx: { platform: string; roots?: Roots | null | undefined; uses: ListCtx['uses'] }, scope: string, { helper, bridge, serenaContext, keyFile, keyName, keyNames, data }: RootUses): void
{
    const P = pathFor(ctx.platform);
    const r = (ctx.roots || {}) as Roots;
    const inside = (root: string | null | undefined, p: string | null | undefined): boolean => { if (!root || !p) return false; const rel = P.relative(root, p); return rel === '' || (!rel.startsWith('..') && !P.isAbsolute(rel)); };
    const familyOf = (p: string | null | undefined): Family | null => (['project', 'global'] as Family[]).find((f) => inside(r[f], p)) || null;
    const family = roots.familyOf(scope);
    if (helper && r[family]) ctx.uses.push({ family, root: r[family]!, helper: true, bridge: Boolean(bridge), committed: scope === 'project' });
    if (serenaContext && r[family]) ctx.uses.push({ family, root: r[family]!, serenaContext: true, committed: scope === 'project' });
    const kf = familyOf(keyFile);
    if (kf) ctx.uses.push({ family: kf, root: r[kf]!, key: { file: keyFile!, name: keyName!, names: keyNames || [keyName!] } });
    const df = familyOf(data);
    if (df) ctx.uses.push({ family: df, root: r[df]! });
}

// The file steps of the roots the plan writes into, in D8's order - each root's .gitignore, the helpers, the key names -
// and the lists (plan-lists.js) and the roots map that go last. A root this apply creates gets its .gitignore (R13), never one named .alfred; a root that
// exists is asked of git, and with a gap gets no key file and a note naming the fix.
export function fileSteps(inv: Inventory, ctx: ListCtx, out: Pick<PlanOut, 'notes'>, regSteps: PlanStep[] = []): { before: PlanStep[]; after: PlanStep[] }
{
    const P = pathFor(ctx.platform);
    const exists = ctx.exists || ((p: string) => fs.existsSync(p));
    // first: a list's family root joins the roots this run writes into
    const lists = listSteps(inv, ctx, out, regSteps);
    const byRoot = new Map<string, RootWrite>();
    for (const family of ['project', 'global'])
        for (const u of ctx.uses.filter((x) => x.family === family))
        {
            const r: RootWrite = byRoot.get(u.root) || { family, root: u.root, helper: false, bridge: false, keys: new Map() };
            byRoot.set(u.root, r);
            if (u.helper) r.helper = true;
            if (u.bridge) r.bridge = true;
            if (u.serenaContext) r.serenaContext = true;
            if (u.committed) r.committed = true;
            if (u.key) r.keys.set(u.key.file, [...new Set([...(r.keys.get(u.key.file) || []), ...(u.key.names || [u.key.name])])]);
        }
    const ignore: PathStep[] = [];
    const helpers: PathStep[] = [];
    const names: EnsureKeyNameStep[] = [];
    const records: RecordRootStep[] = [];
    const map = (inv.roots && inv.roots.map) || null;
    for (const r of byRoot.values())
    {
        const existed = exists(r.root);
        if (!existed && P.basename(r.root) !== '.alfred')
            ignore.push({ op: 'root-ignore', path: r.root, why: `the new root ${r.root}: its .gitignore keeps the key file, the record and the data out of git` });
        // a key file git would commit gets no name; an ignored helper matters only to a project-scope server, whose
        // committed .mcp.json names it - the key file beside it is still ignored, so its names are written
        const gap = existed ? roots.ignoreGap(r.root, r.family, { writes: [r.bridge && roots.FILES.bridge, r.serenaContext && roots.FILES.serenaContext].filter(Boolean) as string[] }) : null;
        // a root of this plugin's own files whose .gitignore predates a line GITIGNORE has now (0.5.0: the bridge and
        // serena's context): rootIgnore appends only the lines it lacks
        if (existed && P.basename(r.root) !== '.alfred')
        {
            const lines = rootIgnoreLines(r.root);
            if (lines.text !== null && lines.mine && lines.lack.length)
                ignore.push({ op: 'root-ignore', path: r.root, why: `${r.root}: its .gitignore gains ${lines.lack.join(', ')}` });
        }
        if (gap && gap.secrets) out.notes.push(`${r.root}: ${gap.reason} - no key file is written there; /preferred-tools:fix (root-ignore) covers it`);
        if (gap && gap.helper && r.committed)
            out.notes.push(`${r.root}: ${gap.reason} - ${gap.excluded ? `a .gitignore above excludes ${r.root}: remove that line (git check-ignore -v ${r.root} names it)` : '/preferred-tools:fix (root-ignore) covers it'}`);
        if (r.helper)
        {
            const { state } = roots.helperState(P.join(r.root, roots.FILES.helper), exists);
            if (state === 'absent' || state === 'lower')
                helpers.push({ op: 'write-helper', path: r.root, why: `${r.root}: mcp-headers.js, which reads a hosted key from .mcps-secrets each time Claude Code connects` });
            else if (state === 'higher') out.notes.push(`mcp-headers.js in ${r.root} is newer than this plugin - update preferred-tools`);
            else if (state === 'edited') out.notes.push(`mcp-headers.js in ${r.root} changed since preferred-tools wrote it - left as it is; /preferred-tools:fix (helper-stale) rewrites it`);
        }
        if (r.bridge)
        {
            const { state } = roots.shippedState('bridge', P.join(r.root, roots.FILES.bridge), exists);
            if (state === 'absent' || state === 'lower')
                helpers.push({ op: 'write-bridge', path: r.root, why: `${r.root}: mcp-bridge.js, which fills a hosted URL from .mcps-secrets each time the server starts` });
            else if (state === 'higher') out.notes.push(`mcp-bridge.js in ${r.root} is newer than this plugin - update preferred-tools`);
            else if (state === 'edited') out.notes.push(`mcp-bridge.js in ${r.root} changed since preferred-tools wrote it - left as it is; /preferred-tools:fix (helper-stale) rewrites it`);
        }
        if (r.serenaContext)
        {
            const { state } = roots.shippedState('serenaContext', P.join(r.root, roots.FILES.serenaContext), exists);
            if (state === 'absent' || state === 'lower')
                helpers.push({ op: 'write-serena-context', path: r.root, why: `${r.root}: serena-context.yml, the context serena runs with - code navigation only, in Claude Code and Cursor` });
            else if (state === 'higher') out.notes.push(`serena-context.yml in ${r.root} is newer than this plugin - update preferred-tools`);
            else if (state === 'edited') out.notes.push(`serena-context.yml in ${r.root} changed since preferred-tools wrote it - left as it is; /preferred-tools:fix (helper-stale) rewrites it`);
        }
        if (!gap || !gap.secrets)
            for (const [file, want] of r.keys)
            {
                const have = new Set(exists(file) ? keys.namesIn(file) : []);
                const lack = want.filter((n) => !have.has(n));
                if (lack.length) names.push({ op: 'ensure-key-name', file, names: lack, why: `${file}: the key's name - names only, you fill in each value` });
            }
        const mapped = !map ? null : r.family === 'global' ? map.global : (Object.keys(map.projects || {}).length ? map.projects[roots.mapKey(ctx.project)] : null);
        if (mapped !== r.root)
            records.push({ op: 'record-root', family: r.family, project: ctx.project, root: r.root, why: `the ${r.family} root ${r.root}: written to the roots map, so the commands find it again` });
    }
    return { before: [...ignore, ...helpers, ...names], after: [...lists, ...records] };
}

