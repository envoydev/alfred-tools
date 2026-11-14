#!/usr/bin/env node
'use strict';
// THE PLAN - answers in, an ordered list of operations out. Nothing here changes anything.
//
//   node plan.js <inventory.json> <answers.json> [--out <plan.json>]     the plan, printed, and written for apply.js
//   node plan.js --questions <inventory.json> [<picks.json>]              every ask the walk makes, as data
//   either takes --data <plugin data dir> after its files: the roots map (spec D2)
//
// A fresh add builds its entry from catalog/tools.json. A rename, a move, a route or location change (configure) starts
// from the registration as read - its pin, its cut-off, the args and env the user added - and changes only what the
// answer names, so an updated pin is never downgraded. The same answers twice plan nothing.
//
// Answers: { picks: { <row id>: { route, scope, name, location, executablePath, token, params } },
//            change: { <key>: { row, <the same answers as a pick> } },
//            remove: [{ kind: 'mcp', name, scope }],
//            machine: { docker } (from prereq.js --json) }
//   name: 'keep' | 'prefixed' | any literal name       location: { side: 'keep' | 'default' | 'project' | 'account' | 'path', path }
//   picks come from install and only ADD: a pick already there under its name and scope is left unchanged, and a
//   registration of the row at another scope or name is left as it is, so a project gets its own copy beside one
//   installed for every project. change comes from configure, keyed `mcp:<name>~<scope>`: it
//   renames, moves or rewrites that ONE registration, and another of the same row is left. Its `row` is for prereq.js.
const fs = require('node:fs');
const path = require('node:path');
const catalogLib = require('./catalog/catalog.js');
const { pathFor } = require('./entries/platform.js');
const { alfredData, recommendedSide, alfredNameProblem, logicalRoot, otherPlace, parseRoot, alfredRoot, defaultRoot, serenaSpaceFree, formatRoot, validWindowsSerenaHome, applyRoot } = require('./entries/locations.js');
const { currentOf, buildEntry, applyContext, bridgeParts, helperGlobalRoot, bridgePathFor, renameTemplate, helperFor, subst, mergeSettings, contextArgAt, helperParts } = require('./entries/entry.js');
const { signInParts, signInFormOf } = require('./entries/sign-in.js');
const { nameProblem, fetchStep } = require('./entries/names.js');
const asks = require('./asks.js');
const account = require('./core/account.js');
const keys = require('./keys/keys.js');
const kept = require('./core/kept.js');
const roots = require('./roots/roots.js');
const existing = require('./inventory/existing.js');
const { templateNames } = require('./mcp-bridge.js');

// 'A', 'A and B', 'A, B and C'
const andList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const mcpOrder = require('./mcps-list/mcp-order.js');
const planLists = require('./plan-lists.js');
const mcpsList = require('./mcps-list/mcps-list.js');
const cursorMcp = require('./cursor/cursor-mcp.js');
const serenaConfig = require('./apply/serena-config.js');
const { installedOf, keyOf, targetOf, fromHere, otherWindowsMcp } = require('./inventory/inventory.js');
const { blockingStdio, deepEqual } = require('./core/json-file.js');

const SCOPES = ['local', 'project', 'user'];

function makeCtx(inv, opts = {})
{
    const ctx = {
        platform: inv.os, arch: inv.arch, project: inv.project, env: opts.env || process.env,
        home: opts.home || account.homeDir(opts.env || process.env), exists: opts.exists, isDir: opts.isDir, machine: opts.machine || {},
    };
    // alfred-code set up in this project (its .alfred/.gitignore): its folder is recommended for the data (D3)
    ctx.alfredHere = alfredData(ctx, inv.alfredCodeEnabled);
    // a live registration, read in this process for a key comparison (R1) - only from an account the caller's env names
    ctx.readLive = opts.readLive || asks.liveReader(inv.project, opts.env);
    return ctx;
}

// ---- one MCP pick ---------------------------------------------------------------------------------------------------

function projectName(ctx)
{
    return path.basename(ctx.project).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
}

function resolveName(pick, row, cur, ctx)
{
    const n = pick.name === undefined ? 'keep' : pick.name;
    if (n === 'keep') return cur ? cur.name : row.name;
    if (n === 'prefixed') return `${projectName(ctx)}-${row.name}`.slice(0, 64);
    return n;
}

// A data folder is `<root>/<name>` in the root of the scope's family (spec D2): side 'project' - the project root,
// 'account' - the global root; 'default' is the recommended side (serena on Windows: its profile's .serena, or a
// space-free folder).
function wantedRoot(row, pick, cur, name, scope, ctx)
{
    const serenaWin = row.locations.windowsAbsolute && ctx.platform === 'win32';
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
    let root;
    let existing = false;
    if (loc.side === 'keep' && cur && cur.rootStr) root = logicalRoot(cur.rootStr, ctx);
    else if (loc.side === 'project') root = otherPlace(row, name, 'project', ctx);
    else if (loc.side === 'account') root = otherPlace(row, name, 'account', ctx);
    else if (loc.side === 'path') root = parseRoot(loc.path, ctx);
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
        existing = Boolean(d.existing);
    }
    if (row.locations.windowsAbsolute && ctx.platform === 'win32')
    {
        const resolved = formatRoot(root, 'local', ctx);
        const text = resolved.value && resolved.value.replace(/\//g, '\\');
        if (!text || !validWindowsSerenaHome(text))
            return { error: `serena's home on Windows must be absolute, in backslashes and space-free (fix row serena-windows-home); '${text || loc.path}' is not` };
        return { root: { kind: 'abs', path: text }, existing };
    }
    return { root, existing };
}

// The list entry of a registration, or null.
function listedOf(inv, reg)
{
    const l = inv.lists && inv.lists[roots.familyOf(reg.scope)];
    return l && !l.note && !l.old ? (l.servers || []).find((x) => x.name === reg.name && x.scope === reg.scope) || null : null;
}

function planMcp(row, pick, inv, ctx, catalog, out)
{
    if (!row.os.includes(ctx.platform)) return out.errors.push(`${row.id}: not offered on ${ctx.platform}`);
    // configure names its target; an install pick only adds, whatever else of this row is installed
    const here = inv.registrations.filter((r) => r.rowId === row.id && !r.alfredRetired);
    const target = pick.target ? here.find((r) => r.name === pick.target.name && r.scope === pick.target.scope) : null;
    const cur = target ? currentOf(row, target) : null;

    // which apps (D3): the answer, else what the list holds for the target, else Claude Code only
    const listedEntry = target ? listedOf(inv, target) : null;
    const listedClients = listedEntry ? listedEntry.clients || ['claude'] : ['claude'];
    let clients = pick.clients || listedClients;

    const routeId = pick.route || (cur ? cur.route : row.recommendedRoute);
    const route = row.routes[routeId];
    if (!route) return out.errors.push(`${row.id}: no ${routeId} route (routes: ${Object.keys(row.routes).join(', ')})`);
    // a fresh pick's scope: the recommended one (spec D5, F2)
    const scope = pick.scope || (cur ? cur.scope : asks.recommendedScope(row, routeId));
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
        else if (r.name !== name) out.notes.push(`${row.id}: also inherited as '${r.name}' from ${fromHere(inv, r.from)} (${r.approval}) - change it there`);
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
            const from = fromHere(inv, r.from);
            out.notes.push(`${row.id}: '${name}' is also inherited from ${from} (${r.approval}); Claude Code uses ${scope === 'user' ? `the inherited one from ${from} in this project - a .mcp.json server ranks above user scope` : `this project's ${scope} copy`}`);
        }
        else out.notes.push(`${row.id}: '${name}' also exists at ${r.scope} scope; Claude Code reads local, then project, then user, so the nearer one wins`);
    }

    // the answers that edit an entry
    const params = { host: row.params ? (pick.params && pick.params.host) || (cur && cur.host) || row.params[0].default : undefined, ...(pick.params || {}) };
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
    const ks = usesKey ? asks.keyStateOf(row, routeId, ctx, inv.alfredCodeEnabled, scope) : null;
    const sameRoute = Boolean(cur) && cur.route === routeId;
    const liveKey = sameRoute && ks && ks.kind === 'stdio' ? asks.heldKey(ctx.readLive(cur.name, cur.scope) || {}, route) : null;
    // a switch between the hosted route and the bridge keeps the name: both read it from the hosted chain (0.4.0)
    const keyName = pick.keyName || (route.helper && cur && cur.keyName ? cur.keyName : null) || (liveKey ? keys.nameOfValue(ks.files, liveKey) : null) || keyVar;
    // a stdio optional key whose name is filled nowhere in the chain (spec F2): written with no key argument, never as an
    // empty one - a stdio key is read only when the registration is written. A registration that holds its key keeps it.
    const unfilledStdio = Boolean(ks) && ks.kind === 'stdio' && route.authMode === 'optional-token' && scope !== 'project'
        && !(sameRoute && cur.token) && !keys.filledNames(ks.files).some((f) => f.names.includes(keyName));
    const sendNow = wantToken && !unfilledStdio;
    // a bridge's URL names (0.4.0): answered, else the registration's (by position), else the catalog's. A name that is
    // the key's or reads as a credential is refused, typed or read (Ruling 3): a key never goes in a URL.
    const urlNames = {};
    if (route.runtime === 'bridge')
    {
        const held = (cur && cur.route === routeId && cur.urlNames) || {};
        for (const v of route.urlVars || [])
        {
            const n = (pick.urlNames && pick.urlNames[v.var]) || held[v.var] || v.var;
            if (!keys.NAME_RULE.test(String(n))) return out.errors.push(`${row.id}: '${n}' is not a name - a name matches ${keys.NAME_RULE.source}`);
            if (n === keyName || keys.credentialName(n)) return out.errors.push(`${row.id}: ${n} holds a key - a key never goes in a URL; pick another name for the ${v.label}`);
            // one name per part: a template naming one twice never starts (review I4)
            const twin = Object.keys(urlNames).find((k) => urlNames[k] === n);
            if (twin) return out.errors.push(`${row.id}: ${n} already names the ${route.urlVars.find((x) => x.var === twin).label} - each part of the URL needs its own name; pick another name for the ${v.label}`);
            urlNames[v.var] = n;
        }
    }
    if (unfilledStdio) out.notes.push(`${row.id}: fill ${keyName} in ${ks.files[0]}, then /preferred-tools:configure -> Use a key from .mcps-secrets writes it in`);
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
    let rootStr;
    let ensure = null;
    let dataAbs = null;
    if (row.locations)
    {
        const w = wantedRoot(row, pick, cur, name, scope, ctx);
        if (w.error) return out.errors.push(`${row.id}: ${w.error}`);
        rootStr = formatRoot(w.root, scope, ctx).value;
        dataAbs = rootStr;
        if (!w.existing) ensure = dataAbs;
        // an absolute --user-data-dir: every session under this folder opens the same persistent profile, which one
        // browser at a time can hold (docs/sources.md 'Playwright MCP')
        if (scope === 'project' && row.id.startsWith('playwright-'))
            out.notes.push(`${row.id}: one browser profile for every session under this folder - two sessions at once cannot both open it`);
    }

    let entry;
    let fresh = !cur || cur.route !== routeId;
    if (fresh)
        entry = buildEntry(row, routeId, { rootStr, scope, executablePath: wantExec, token: sendNow, keyName, params, urlNames }, ctx, catalog.rules);
    else
    {
        entry = JSON.parse(JSON.stringify(cur.entry));
        if (row.locations && rootStr !== cur.rootStr) entry = applyRoot(entry, row, rootStr, scope, ctx);
        // serena's context file follows the scope's root (D7)
        if (route.run && route.run.includes('{contextFile}')) entry = applyContext(entry, scope, ctx);
        if (route.optionalArgs && route.optionalArgs.executablePath && wantExec !== cur.executablePath)
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
            const at = entry.args.findIndex((a) => String(a) === parts.path);
            const held = cur.urlNames || {};
            const rename = Object.fromEntries((route.urlVars || []).map((v) => [held[v.var] || v.var, urlNames[v.var]]));
            const globalRoot = helperGlobalRoot(scope, ctx);
            entry.args = [...entry.args.slice(0, at), bridgePathFor(scope, ctx), renameTemplate(parts.template, rename), keyName, ...entry.args.slice(at + 3, at + 5), ...(globalRoot ? [globalRoot] : []), ...entry.args.slice(at + 6)];
        }
        else if (routeId === 'remote' && route.helper)
        {
            // the helper follows the scope and its root, under the name it passes now; an Authorization header of the
            // 0.1.x kind is fix's to move (key-to-helper, spec D7), never dropped here while a key is wanted
            const header = Boolean(entry.headers && entry.headers.Authorization);
            if (!wantToken)
            {
                delete entry.headersHelper;
                if (header) { delete entry.headers.Authorization; if (!Object.keys(entry.headers).length) delete entry.headers; }
            }
            else if (header) out.notes.push(`${row.id}: '${cur.name}' sends its key from an Authorization header - /preferred-tools:fix moves it into .mcps-secrets, read by mcp-headers.js (key-to-helper)`);
            else entry.headersHelper = helperFor(route, scope, ctx, keyName);
        }
        else if (route.authMode === 'optional-token' && sendNow !== cur.token)
        {
            const args = (entry.args || []).slice();
            const i = args.indexOf('--api-key');
            if (i >= 0) args.splice(i, 2);
            if (sendNow) args.push(...route.optionalArgs.token);
            entry.args = args;
        }
        if (row.params && cur.host && params.host !== cur.host) entry.url = subst(route.url, params);
    }

    // Cursor's form of a hosted route (D5): a keyless OAuth route for both apps is the shared mcp-remote sign-in in the
    // family's root, for Claude Code only the http form; a keyed one keeps its helper for Claude Code and gets the bridge
    // for Cursor (the list's cursorEntry), unless it sends a header of its own the bridge has no place for
    let form = null;
    if (routeId === 'remote' && route.keyless === 'oauth' && !wantToken)
    {
        const family = roots.familyOf(scope);
        const root = (ctx.roots || {})[family];
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
                ? { ...entry, args: entry.args.map((a) => (a === was.url ? httpUrl : a)), env: { ...(entry.env || {}), MCP_REMOTE_CONFIG_DIR: root } }
                : signInFormOf(httpUrl, root, catalog, ctx);
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
    let keyFile = null;
    let keyNames = [keyName];
    if (keyed && !(keyed.kind === 'stdio' && scope === 'project'))
    {
        const filled = keys.filledNames(keyed.files).some((f) => f.names.includes(keyName));
        out.keys.push({ row: row.id, name, scope, variable: keyName, kind: bridge ? 'bridge' : keyed.kind, files: keyed.files, filled, old: filled ? null : keys.oldHolding(ctx.project, ctx.home, keyName) });
        // a name filled nowhere in the chain is written, empty, into the chain's first file (D3)
        if (!filled) keyFile = keyed.files[0];
    }
    let bridgeFilled = null;
    if (bridge && keyed)
    {
        // each name on its own (0.4.0 Ruling 9): one filled anywhere in the chain is not named again, the key's included
        const have = new Set(keys.filledNames(keyed.files).flatMap((f) => f.names));
        const all = [{ name: bridge.keyName, optional: false }, ...(templateNames(bridge.template) || [])];
        const lack = all.filter((n) => !have.has(n.name));
        keyNames = lack.map((n) => n.name);
        keyFile = keyNames.length ? keyed.files[0] : null;
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
    const staleKey = Boolean(chosen) && chosen.value !== liveKey;
    const withKey = stepKey ? { key: stepKey } : {};
    // the helper's own conditions (spec D4): the folder's trust at project and local scope, the declaring folder only at
    // project scope, node on the PATH - each said once
    const once = (text) => { if (!out.notes.includes(text)) out.notes.push(text); };
    // a bridge connects in a child folder too (F3) and sends no key through Claude Code: node is its one condition
    if (bridge) once('node must be on the PATH Claude Code starts with - mcp-bridge.js runs under it, as this plugin\'s commands do');
    if (keyed && keyed.kind === 'helper' && entry.headersHelper)
    {
        if (scope !== 'user' && inv.trusted === false) once(`accept the trust dialog the next time Claude Code starts in ${ctx.project} - until then the server connects without its key`);
        // docs/sources.md M1: a parent folder's helper does not run in a child folder's session, named relative or absolute
        if (scope === 'project' && !asks.PARENT_HELPER_IN_CHILD) out.notes.push(`${row.id}: a session started in a child folder connects without this key - Claude Code does not run a parent folder's helper there; pick Global, or install it in that folder too`);
        once('node must be on the PATH Claude Code starts with - mcp-headers.js runs under it, as this plugin\'s commands do');
    }
    // how a hosted keyed server connects once written (spec F3): its reconnect line, printed by render and repeated by the apply
    const reconnect = keyed && keyed.kind === 'helper' && entry.headersHelper
        ? { row: row.id, name, variable: keyName, file: keyed.files[0], filled: keys.filledNames(keyed.files).some((f) => f.names.includes(keyName)), anonymous: route.authMode === 'optional-token' && !route.keyless, hint: route.helper.hint || null, untrusted: scope !== 'user' && inv.trusted === false }
        : null;
    if (route.authMode === 'oauth' || (route.keyless === 'oauth' && !wantToken)) out.oauth.push({ row: row.id, name, scope, ...(form === 'signin' ? { signin: true, root: ctx.roots[roots.familyOf(scope)] } : {}) });
    if (row.dangerous && row.dangerous.length) out.dangerous.push({ row: row.id, name, tools: row.dangerous });
    out.expect.push({ kind: 'mcp', row: row.id, name, scope, route: routeId });

    // a launch the cache may not hold yet is fetched once it is written (entries.js fetchStep says why); a change that
    // keeps the package, such as a location or a name, fetches nothing
    const fetch = fetchStep(name, entry, row.id, cur && cur.entry);
    const uses = { helper: Boolean(entry.headersHelper) || Boolean(bridge), bridge: Boolean(bridge) || form === 'two', serenaContext: contextArgAt(entry) >= 0, keyFile, keyName, keyNames, data: dataAbs };
    // the shared sign-in's folder sits in the family's root: the root is written (its .gitignore) like any other
    const signInRoot = () => { if (form === 'signin') ctx.uses.push({ family: roots.familyOf(scope), root: ctx.roots[roots.familyOf(scope)] }); };
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
        out.steps.push({ op: 'mcp-replace', name, scope, entry, old: cur.entry, row: row.id, route: routeId, ...withKey, ...withFilled, why: `${row.id}: rewrite '${name}' from the registration as read${staleKey && !edited && !fresh ? ` - writes in the key ${keyName} holds in ${chosen.file}` : ''}` });
    if (fetch) out.steps.push(fetch);
    return undefined;
}

// The roots a registration step writes into (spec D2-D4): its helper's - the scope's family root, with the bridge beside
// it for a bridge route - its key file's and its data folder's. Only a step that is planned uses a root, so a plan with no
// change writes no file. `keyNames` (a bridge's key and URL names) replaces the one `keyName` when given.
function useRoots(ctx, scope, { helper, bridge, serenaContext, keyFile, keyName, keyNames, data })
{
    const P = pathFor(ctx.platform);
    const r = ctx.roots || {};
    const inside = (root, p) => { if (!root || !p) return false; const rel = P.relative(root, p); return rel === '' || (!rel.startsWith('..') && !P.isAbsolute(rel)); };
    const familyOf = (p) => ['project', 'global'].find((f) => inside(r[f], p)) || null;
    const family = roots.familyOf(scope);
    if (helper && r[family]) ctx.uses.push({ family, root: r[family], helper: true, bridge: Boolean(bridge), committed: scope === 'project' });
    if (serenaContext && r[family]) ctx.uses.push({ family, root: r[family], serenaContext: true, committed: scope === 'project' });
    const kf = familyOf(keyFile);
    if (kf) ctx.uses.push({ family: kf, root: r[kf], key: { file: keyFile, name: keyName, names: keyNames || [keyName] } });
    const df = familyOf(data);
    if (df) ctx.uses.push({ family: df, root: r[df] });
}

// The file steps of the roots the plan writes into, in D8's order - each root's .gitignore, the helpers, the key names -
// and the lists (plan-lists.js) and the roots map that go last. A root this apply creates gets its .gitignore (R13), never one named .alfred; a root that
// exists is asked of git, and with a gap gets no key file and a note naming the fix.
function fileSteps(inv, ctx, out, regSteps = [])
{
    const P = pathFor(ctx.platform);
    const exists = ctx.exists || ((p) => fs.existsSync(p));
    // first: a list's family root joins the roots this run writes into
    const lists = planLists.listSteps(inv, ctx, out, regSteps);
    const byRoot = new Map();
    for (const family of ['project', 'global'])
        for (const u of ctx.uses.filter((x) => x.family === family))
        {
            const r = byRoot.get(u.root) || { family, root: u.root, helper: false, bridge: false, keys: new Map() };
            byRoot.set(u.root, r);
            if (u.helper) r.helper = true;
            if (u.bridge) r.bridge = true;
            if (u.serenaContext) r.serenaContext = true;
            if (u.committed) r.committed = true;
            if (u.key) r.keys.set(u.key.file, [...new Set([...(r.keys.get(u.key.file) || []), ...(u.key.names || [u.key.name])])]);
        }
    const ignore = [];
    const helpers = [];
    const names = [];
    const records = [];
    const map = (inv.roots && inv.roots.map) || null;
    for (const r of byRoot.values())
    {
        const existed = exists(r.root);
        if (!existed && P.basename(r.root) !== '.alfred')
            ignore.push({ op: 'root-ignore', path: r.root, why: `the new root ${r.root}: its .gitignore keeps the key file, the record and the data out of git` });
        // a key file git would commit gets no name; an ignored helper matters only to a project-scope server, whose
        // committed .mcp.json names it - the key file beside it is still ignored, so its names are written
        const gap = existed ? roots.ignoreGap(r.root, r.family, { writes: [r.bridge && roots.FILES.bridge, r.serenaContext && roots.FILES.serenaContext].filter(Boolean) }) : null;
        // a root of this plugin's own files whose .gitignore predates a line GITIGNORE has now (0.5.0: the bridge and
        // serena's context): rootIgnore appends only the lines it lacks
        if (existed && P.basename(r.root) !== '.alfred')
        {
            const lines = require('./apply/file-steps.js').rootIgnoreLines(r.root);
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

// ---- one configure change: an installed registration, by its key ----------------------------------------------------

function planChange(key, pick, inv, ctx, catalog, out)
{
    const t = targetOf(inv, key);
    if (!t) return out.errors.push(`change: nothing is installed as '${key}' (a key is mcp:<name>~<scope>)`);
    if (t.kind !== 'mcp') return out.errors.push(`change: '${key}' is a plugin - the catalog lists none since 0.5.0, so it is not changed here`);
    if (!t.item.rowId) return out.errors.push(`change: '${t.item.name || t.item.id}' is your own (it matches no catalog row) - left alone`);
    if (t.item.alfredRetired) return out.errors.push(`change: '${t.item.name || t.item.id}' is alfred-code's (retired) - left alone`);
    const row = catalog.byId.get(t.item.rowId);
    const { row: _row, ...answers } = pick;
    return planMcp(row, { ...answers, target: { name: t.item.name, scope: t.item.scope } }, inv, ctx, catalog, out);
}

// ---- the plan -------------------------------------------------------------------------------------------------------

function plan(inv, answers, opts = {})
{
    const catalog = opts.catalog || catalogLib.load();
    // answers.machine: what prereq.js found (docker: false picks github's binary fallback); an explicit option wins
    const ctx = { ...makeCtx(inv, { ...opts, machine: opts.machine || answers.machine }), changing: new Set(Object.keys(answers.change || {})), uses: [], rootMoves: [] };
    const out = { version: 1, project: inv.project, os: inv.os, alfredCodeEnabled: Boolean(inv.alfredCodeEnabled), steps: [], notes: [], errors: [], unchanged: [], keys: [], reconnect: [], oauth: [], dangerous: [], expect: [] };
    // the root folders (spec D2): every data folder, key file and helper of a family sits in its root
    const resolved = roots.resolve(inv, answers.roots, { ...ctx, catalog });
    out.errors.push(...resolved.errors);
    ctx.roots = resolved.roots;
    out.roots = ctx.roots;
    // what changed outside preferred-tools since its last write (spec D1): named first, only fix changes it
    out.outside = planLists.changedOutside(inv, catalog);

    // the key's name and the settings (spec D9, R4): top-level maps keyed by row id (install) or target key (configure)
    const keyNames = answers.keyNames || {};
    const settings = answers.settings || {};
    // a bridge's URL names (0.4.0): { <row id or target key>: { <VAR>: <NAME> } }
    const urlNamesOf = answers.urlNames || {};
    const connectors = opts.connectors === undefined ? null : opts.connectors;
    // which apps (spec D3): install's one answer for every pick, configure's per target. The registration steps a pick
    // plans carry it into the list (ctx.clientsFor); a configure change of the apps alone is a list entry, no CLI call.
    // planMcp decides each registration's clients and Cursor form (D5) and records them here
    ctx.clientsFor = new Map();
    ctx.formFor = new Map();
    ctx.clientsOnly = [];
    if (answers.clients && Object.keys(answers.picks || {}).length) out.apps = answers.clients;
    for (const [rowId, pick] of Object.entries(answers.picks || {}))
    {
        const row = catalog.byId.get(rowId);
        if (!row) { out.errors.push(`unknown tool '${rowId}'`); continue; }
        planMcp(row, { ...(pick || {}), clients: answers.clients, keyName: keyNames[rowId], settings: settings[rowId], urlNames: urlNamesOf[rowId] || (pick || {}).urlNames }, inv, ctx, catalog, out);
        // a claude.ai connector or an enabled plugin's server provides it too (spec F4)
        for (const a of asks.alsoProvided(inv, rowId, connectors)) out.notes.push(existing.twoServers(row.label, a.owner));
    }
    // a target answered 'Leave it on its own' gets no change (Ruling 9)
    const leftNow = new Set(Object.entries(answers.existing || {}).filter(([, choice]) => choice === 'own').map(([key]) => key));
    for (const [key, pick] of Object.entries(answers.change || {}))
    {
        if (leftNow.has(key)) { out.unchanged.push(`${key}: left on its own`); continue; }
        planChange(key, { ...(pick || {}), keyName: keyNames[key], settings: settings[key], urlNames: urlNamesOf[key] || (pick || {}).urlNames }, inv, ctx, catalog, out);
    }
    for (const r of answers.remove || []) planRemove(r, inv, catalog, out);
    planExisting(answers, inv, ctx, catalog, out, connectors);
    planRootChange(answers, inv, ctx, catalog, out);
    // the file steps first, the records last (D8): a failed add leaves files a re-run finds in place
    // a root change's moved list is the list from here on: its writes and Cursor's read it at its new path
    const listInv = movedLists(inv, ctx.rootMoves);
    const files = fileSteps(listInv, ctx, out, out.steps);
    const moves = ctx.rootMoves.map((m) => ({ op: 'move-root-file', from: m.from, to: m.to, why: `the ${m.family} root moves: ${m.name} goes with it` }));
    const ignores = files.before.filter((x) => x.op === 'root-ignore');
    out.steps = [...ignores, ...moves, ...files.before.filter((x) => x.op !== 'root-ignore'), ...out.steps, ...files.after];
    // Cursor's files from the lists, after the list-write steps they read (spec D2)
    const cursor = planLists.cursorSteps(listInv, { ...ctx, catalog }, out, answers);
    // the read guard (ruling 13): one deny-read, last before the list-write steps
    const deny = planLists.denyReadSteps(out.steps, ctx, out);
    if (deny.length) { const at = out.steps.findIndex((x) => x.op === 'list-write'); out.steps.splice(at < 0 ? out.steps.length : at, 0, ...deny); }
    // each name Cursor's file holds that no answer settles: its question, which the command asks before planning again
    if (out.taken) { out.cursorNames = out.taken.map((t) => asks.cursorNameQuestion(t)); delete out.taken; }
    // .mcp.json in the catalog's order, last of all (spec F5, F8)
    out.steps = mcpOrder.withOrderStep([...out.steps, ...cursor], inv.project, mcpOrder.ownProjectNames(inv, answers.existing));
    out.noop = out.steps.length === 0 && out.errors.length === 0;
    return out;
}

// configure's 'Change the root' (spec D7, R3): each managed registration of the family is re-added as read, its data
// folder - when it sits in the old root - and its helper in the new root; the new root gets its .gitignore, the helper,
// the names in use (names only) and the record, and the roots map points at it. No data and no key value moves.
function planRootChange(answers, inv, ctx, catalog, out)
{
    const P = pathFor(ctx.platform);
    for (const family of answers.rootChange || [])
    {
        if (!['project', 'global'].includes(family)) { out.errors.push(`rootChange: '${family}' is not a root family - project or global`); continue; }
        const next = ctx.roots && ctx.roots[family];
        if (!next) continue; // the roots answer's error is already in the plan
        const used = inv.roots && Object.hasOwn(inv.roots, family) ? inv.roots[family] : roots.inUse(inv, family, { ...ctx, catalog });
        if (!used) { out.unchanged.push(`rootChange: no ${family} root is in use here - nothing to move`); continue; }
        if (used.path === next) { out.unchanged.push(`rootChange: the ${family} root is already ${next}`); continue; }
        const inOld = (p) => { const rel = P.relative(used.path, p); return rel === '' || (!rel.startsWith('..') && !P.isAbsolute(rel)); };
        // the root's own files move with it (D1): the list, serena's context and mcp-remote's sign-in folder - each that is
        // there, renamed whole, before any registration names the new root
        const exists = ctx.exists || ((x) => fs.existsSync(x));
        const list = inv.lists && inv.lists[family];
        for (const f of [roots.FILES.list, roots.FILES.serenaContext, roots.FILES.signIns])
        {
            const from = P.join(used.path, f);
            if (f === roots.FILES.list && (!list || list.note || list.old || list.file !== from)) continue;
            if (exists(from)) ctx.rootMoves.push({ family, name: f, from, to: P.join(next, f) });
        }
        const scopes = family === 'global' ? ['user'] : ['project', 'local'];
        const secretsOld = P.join(used.path, roots.FILES.secrets);
        const secretsNew = P.join(next, roots.FILES.secrets);
        let keyed = false;
        ctx.uses.push({ family, root: next });
        for (const r of inv.registrations.filter((x) => x.rowId && !x.own && !x.alfredRetired && x.choice !== 'own' && scopes.includes(x.scope)))
        {
            const row = catalog.byId.get(r.rowId);
            // a target changed in this run is planned there, into the new root as well
            if (!row || row.kind !== 'mcp' || ctx.changing.has(keyOf('mcp', r.name, r.scope))) continue;
            const cur = currentOf(row, r);
            const dataAbs = row.locations && cur.rootStr ? formatRoot(logicalRoot(cur.rootStr, ctx), 'local', ctx).value : null;
            const moves = Boolean(dataAbs) && inOld(dataAbs);
            planMcp(row, { target: { name: r.name, scope: r.scope }, ...(moves ? { location: { side: family === 'global' ? 'account' : 'project' } } : {}) }, inv, ctx, catalog, out);
            // the name its key goes under: the helper's argument, else the name holding the key it holds, else the catalog's
            const route = row.routes[cur.route];
            let name = route && route.helper ? cur.keyName : null;
            if (route && !route.helper && route.tokenVar && keys.tokenFields(r.entry, route).length)
            {
                const held = asks.heldKey(ctx.readLive(r.name, r.scope) || r.entry, route);
                name = held ? keys.nameOfValue([secretsOld], held) || route.tokenVar : null;
            }
            if (!name) continue;
            ctx.uses.push({ family, root: next, key: { file: secretsNew, name } });
            keyed = true;
        }
        if (keyed) out.notes.push(`copy the values from ${secretsOld} to ${secretsNew} yourself - until then those servers connect without their keys`);
        // a local helper's third argument names a named global root: this project's are re-pointed (or lose it, for a
        // standard root the helper reads itself); a local server elsewhere is configured in its own project
        if (family === 'global' && !roots.standard('global', ctx).some((x) => x.root === used.path))
        {
            for (const r of inv.registrations.filter((x) => x.rowId && !x.own && !x.alfredRetired && x.choice !== 'own' && x.scope === 'local'))
            {
                const parts = helperParts(r.entry && r.entry.headersHelper);
                const row = catalog.byId.get(r.rowId);
                if (!row || !parts || parts.args.length < 3 || ctx.changing.has(keyOf('mcp', r.name, r.scope))) continue;
                if (P.resolve(roots.absOf(parts.args[2], ctx)) !== P.resolve(used.path)) continue;
                planMcp(row, { target: { name: r.name, scope: r.scope } }, inv, ctx, catalog, out);
            }
            out.notes.push(`a local server in another project whose helper names ${used.path} keeps reading its .mcps-secrets until /preferred-tools:configure runs there`);
        }
    }
}

// The inventory with each moved list at its new path (planRootChange's moves).
function movedLists(inv, moves)
{
    const listMoves = (moves || []).filter((m) => m.name === roots.FILES.list);
    if (!listMoves.length) return inv;
    const next = { ...inv, lists: { ...inv.lists } };
    for (const m of listMoves) next.lists[m.family] = { ...inv.lists[m.family], file: m.to };
    return next;
}

// The answers about the servers already set up (spec D6, F4), from configure: 'own' puts the server in its family's
// list's own, 'manage' or 'add' takes it out (plan-lists.js). What is here now, so a list drops a server gone since.
function planExisting(answers, inv, ctx, catalog, out, connectors)
{
    ctx.recordEntries = { project: [], global: [] };
    for (const [key, choice] of Object.entries(answers.existing || {}))
    {
        const item = existing.itemOf(inv, key, catalog);
        if (!item) { out.errors.push(`existing: '${key}' is not a server found here`); continue; }
        const allowed = existing.CHOICES[item.kind];
        if (!allowed.includes(choice)) { out.errors.push(`existing: '${choice}' is not an answer for ${key} - ${allowed.join(' or ')}`); continue; }
        ctx.recordEntries[item.family].push(existing.recordEntry(item, choice));
    }
    ctx.recordLive = existing.liveOf(inv, catalog, connectors);
}

function planRemove(r, inv, catalog, out)
{
    if (r.kind === 'plugin') return out.errors.push(`remove: ${r.id} is a plugin - the catalog lists none since 0.5.0; claude plugin uninstall ${r.id} --scope ${r.scope} removes it`);
    const reg = inv.registrations.find((x) => x.name === r.name && x.scope === r.scope);
    if (!reg) return out.errors.push(`remove: no registration '${r.name}' at ${r.scope} scope`);
    if (reg.own) return out.errors.push(`remove: '${r.name}' is your own server (it matches no catalog row) - left alone`);
    if (reg.alfredRetired) return out.errors.push(`remove: '${r.name}' is alfred-code's (retired) - left alone`);
    out.steps.push({ op: 'mcp-remove', name: r.name, scope: r.scope, old: reg.entry, row: reg.rowId, why: `remove '${r.name}' (${reg.rowId}) at ${r.scope} scope` });
    return undefined;
}

// ---- printing -------------------------------------------------------------------------------------------------------

const shq = (s) => (/^[A-Za-z0-9_\-./:=@,+]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`);

function argvOf(step)
{
    switch (step.op)
    {
        case 'mcp-add': return ['mcp', 'add-json', step.name, JSON.stringify(step.entry), '-s', step.scope];
        case 'mcp-remove': return ['mcp', 'remove', step.name, '-s', step.scope];
        default: return null;
    }
}

// The plan's line for one key: who reads it, from which files, and whether its name is filled there - never a value.
function keyLine(k)
{
    const reader = k.kind === 'helper' ? 'mcp-headers.js reads it each time Claude Code connects' : k.kind === 'bridge' ? 'mcp-bridge.js reads it each time the server starts' : 'the apply writes it into the registration';
    const parts = [`Key: ${k.name} (${k.scope} scope) - ${k.variable}; ${reader}, from ${k.files.join(', then ')}. The key is never printed.`];
    if (k.filled) parts.push('Filled.');
    else if (k.old) parts.push(`${k.variable} is in ${k.old}, which preferred-tools no longer reads: move it to ${k.files[0]}`);
    else parts.push(`Not filled yet: add ${k.variable}=<your key> to ${k.files[0]}${k.kind === 'helper' ? ' - until then the server connects without its key' : k.kind === 'bridge' ? ' - until then the server does not start' : ' before the apply, or after it run /preferred-tools:configure and keep the name - it writes the key in'}.`);
    return parts.join(' ');
}

// How a hosted keyed server connects once written (spec F3). The line makes no claim about what /mcp's Authenticate does
// for a server whose helper printed {}: nothing has measured it. An unfilled one names what the key must be - the
// route's hint (atlassian's email:api_token, gitlab's fine-grained token) - since the recommended path asks nothing
// that would show it (0.3.0 review, Important 1).
function reconnectLine({ name, variable, file, filled, anonymous, hint = null })
{
    if (filled) return `${name}: connects with its key at the next session start; in a session already running, /mcp -> ${name} -> Reconnect`;
    return `${name}: fill ${variable} in ${file}${hint ? ` (${hint})` : ''}, then Reconnect it in /mcp - until then ${anonymous ? 'it runs without the key, at lower rate limits' : 'it connects without the key, and /mcp shows needs authentication'}`;
}

function render(p)
{
    const lines = [];
    const P = pathFor(p.os);
    if ((p.outside || []).length) lines.push(...p.outside, '');
    if (p.errors.length) lines.push('Cannot plan:', ...p.errors.map((e) => `  ! ${e}`), '');
    if (!p.steps.length && !p.errors.length) lines.push('Nothing to do: every answer already matches what is installed - no claude call, no file written.');
    // which apps (spec D3): stated once, with the Cursor file each scope writes
    if (p.apps)
    {
        lines.push(`Apps: ${p.apps.includes('cursor') ? 'Claude Code and Cursor' : 'Claude Code'}`);
        for (const s of p.steps.filter((x) => x.op === 'cursor-write')) lines.push(`  ${s.family === 'global' ? 'Global scope' : 'Project and Local scope'} in Cursor: ${s.file}`);
        lines.push('');
    }
    p.steps.forEach((s, i) =>
    {
        lines.push(`${i + 1}. ${s.why || s.op}`);
        const argv = argvOf(s);
        if (argv) lines.push(`   claude ${argv.map(shq).join(' ')}`);
        else if (s.op === 'mcp-move') lines.push(`   claude mcp add-json ${shq(s.to.name)} ${shq(JSON.stringify(s.entry))} -s ${s.to.scope}`, '   (read back)', `   claude mcp remove ${shq(s.from.name)} -s ${s.from.scope}`);
        else if (s.op === 'mcp-replace') lines.push(`   claude mcp remove ${shq(s.name)} -s ${s.scope}`, `   claude mcp add-json ${shq(s.name)} ${shq(JSON.stringify(s.entry))} -s ${s.scope}`, `   (the old entry is saved to rollback.json and re-added if the add fails)`);
        else if (s.op === 'ensure-dir') lines.push(`   writes ${s.path}/.gitignore  (contents: *)`);
        else if (s.op === 'root-ignore') lines.push(`   writes ${P.join(s.path, '.gitignore')}  (${roots.GITIGNORE.trim().split('\n').join(', ')} - or the lines it lacks, appended)`);
        else if (s.op === 'write-helper') lines.push(`   writes ${P.join(s.path, roots.FILES.helper)}  (this plugin's header helper)`, `   (and package.json, type commonjs, when absent)`);
        else if (s.op === 'write-bridge') lines.push(`   writes ${P.join(s.path, roots.FILES.bridge)}  (this plugin's URL bridge)`, `   (and package.json, type commonjs, when absent)`);
        else if (s.op === 'move-root-file') lines.push(`   moves ${s.from} to ${s.to}  (the root's own file goes with it)`);
        else if (s.op === 'write-serena-context') lines.push(`   writes ${P.join(s.path, roots.FILES.serenaContext)}  (serena's context: code navigation only)`);
        else if (s.op === 'ensure-key-name') lines.push(`   writes ${s.file}  (names only: ${s.names.join(', ')} - you fill in each value)`);
        else if (s.op === 'list-write' || s.op === 'retire-record' || s.op === 'cursor-write' || s.op === 'deny-read') lines.push(planLists.renderLine(s));
        else if (s.op === 'order-mcp-json') lines.push(`   reorders ${s.file}  (no value changes)`);
        else if (s.op === 'record-root') lines.push(`   writes ${roots.FILES.map} in the plugin's data folder  (the ${s.family} root: ${s.root})`);
        else if (s.op === 'fetch') lines.push(`   ${s.argv.map(shq).join(' ')}`, '   (after the apply, in the background: fills the cache only; if it fails the registration stays and the first start tries again)');
    });
    if (p.keys.length) lines.push('', ...p.keys.map(keyLine));
    if ((p.reconnect || []).length) lines.push('', ...p.reconnect.map(reconnectLine));
    // the shared sign-in (D5) opens the browser at the first start in either app; the rest sign in through /mcp
    for (const o of p.oauth.filter((x) => x.signin)) lines.push('', `OAuth: ${o.name}: your browser opens to sign in the first time it starts, in Claude Code or Cursor; the sign-in is kept in ${P.join(o.root, roots.FILES.signIns)}/ and serves both.`);
    const viaMcp = p.oauth.filter((x) => !x.signin);
    if (viaMcp.length) lines.push('', `OAuth: run /mcp once in a session to log in to ${viaMcp.map((o) => o.name).join(', ')}.`);
    if (p.dangerous.length) lines.push('', ...p.dangerous.map((d) => `Code-running tool on '${d.name}': ${d.tools.map((t) => `${t.tool} (${t.why})`).join('; ')}. This plugin adds no guard.`));
    if (p.notes.length) lines.push('', ...p.notes.map((n) => `Note: ${n}`));
    if (p.unchanged.length) lines.push('', ...p.unchanged.map((n) => `Unchanged: ${n}`));
    return globalWords(lines.join('\n'));
}

// The prose says Global for user scope (spec D1): 'global (user scope)' the first time, 'global scope' after. The commands
// keep the value (`-s user`, `--scope user`).
function globalWords(text)
{
    let first = true;
    return text.replace(/\buser scope\b/g, () => { if (!first) return 'global scope'; first = false; return 'global (user scope)'; });
}

// The arguments, by flag: `--questions` first or not at all, then at most two files, and the flags anywhere after them.
// An unknown flag, or a flag without its value, is an error - never read as a file.
const VALUE_FLAGS = { '--data': 'data', '--connectors': 'connectors', '--out': 'out' };
function parseArgs(argv)
{
    const out = { questions: argv[0] === '--questions', files: [], data: null, connectors: null, out: null, error: null };
    for (let i = out.questions ? 1 : 0; i < argv.length; i++)
    {
        const a = argv[i];
        if (Object.hasOwn(VALUE_FLAGS, a))
        {
            if (i + 1 >= argv.length) return { ...out, error: `${a} needs a value` };
            out[VALUE_FLAGS[a]] = argv[++i];
        }
        else if (a.startsWith('--')) return { ...out, error: `unknown flag '${a}'` };
        else out.files.push(a);
    }
    if (out.files.length > 2) return { ...out, error: `one inventory file and one ${out.questions ? 'picks' : 'answers'} file, not ${out.files.length} files` };
    return out;
}

const USAGE = 'usage: plan.js <inventory.json> <answers.json> [--out plan.json] [--data <dir>]\n       plan.js --questions <inventory.json> [<picks.json>] [--data <dir>] [--connectors <Name>,<Name>]';

function main(argv)
{
    blockingStdio();
    const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
    const args = parseArgs(argv);
    if (args.error) { console.error(`plan.js: ${args.error}\n${USAGE}`); return 2; }
    const [invFile, second] = args.files;
    if (!invFile || (!args.questions && !second)) { console.error(USAGE); return 2; }
    const inv = read(invFile);
    // the roots map is read fresh from the plugin's data folder when one is given
    if (args.data !== null) inv.roots = { ...(inv.roots || {}), map: roots.readMap(args.data) };
    if (args.questions)
    {
        const picks = second ? read(second) : null;
        const catalog = catalogLib.load();
        // --connectors: the claude.ai connectors this session has loaded, named in the pick list (spec F4)
        const qopts = { env: process.env, home: account.homeDir(process.env), connectors: args.connectors !== null ? existing.parseConnectors(args.connectors) : null };
        const built = asks.all(inv, picks, catalog, qopts);
        // the walk's one step: what to ask now, about one tool (spec F1)
        const q = { ...built, next: asks.next(inv, picks, catalog, qopts, built) };
        console.log(JSON.stringify(q, null, 2));
        return 0;
    }
    const p = plan(inv, read(second), { env: process.env, connectors: args.connectors !== null ? existing.parseConnectors(args.connectors) : null });
    if (args.out) fs.writeFileSync(args.out, JSON.stringify(p, null, 2));
    console.log(render(p));
    return p.errors.length ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { plan, render, reconnectLine, argvOf, makeCtx, deepEqual, projectName, main, parseArgs, globalWords, useRoots, fileSteps };
