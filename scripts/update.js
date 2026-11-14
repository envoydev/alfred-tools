#!/usr/bin/env node
'use strict';
// THE UPDATE ENGINE - what is installed and behind its release: every plugin, the pinned MCP servers, the helper, bridge
// and serena-context copies, and the new ways to pass data (fix's `upgrade` rows, the old plugins' uninstall among them).
//
//   node update.js --check [--json] [--no-refresh] [--project <dir>] [--data <dir>]   read-only (it refreshes the marketplace clones)
//   node update.js --questions [--no-refresh] [--project <dir>] [--data <dir>]        the asks, as data
//   --data: the plugin's data folder, whose roots map finds the records - a server left on its own (spec D6) is skipped
//   node update.js --apply <id,id | all | none> [--input retired-declined=<id>~<scope>,...] [--project <dir>] [--tmp <dir>]  changes the install
//
// An offer id is `plugin:<plugin id>~<scope>`, `mcp:<name>~<scope>`, `helper:<file>` (an
// mcp-headers.js copy older than this plugin's), `bridge:<file>`, `context:<file>` (serena's, 0.5.0), or `upgrade:<fix id>:<name>~<scope>` (`:<path>` for a
// file or folder finding, `:<plugin id>~<scope>` for retired-plugin); `all` is every offer whose newer version is known. A plugin whose
// marketplace lists no version cannot be compared ahead: it is listed as unchecked, and `claude plugin update` is the
// check, run only on its own id.
//
// An MCP pin moves only to the newest stable release that is 7 or more days old (scripts/registry.js), and the rewrite
// starts from the registration AS READ: the user's args, env and name stay, only the pin and the cut-off beside it move
// (`--exclude-newer` for uvx, `npm_config_before` for npx). A remote route has no pin, a docker image tag is not checked,
// and a registration that matches no catalog row is the user's and never touched.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const catalogLib = require('./catalog/catalog.js');
const inventory = require('./inventory.js');
const cli = require('./core/claude-cli.js');
const registryLib = require('./catalog/registry.js');
const E = require('./entries.js');
const fetchLib = require('./fetch.js');
const { apply } = require('./apply.js');
const tmpdir = require('./core/tmpdir.js');
const { blockingStdio } = require('./core/json-file.js');
const { realMachine, clone, compareVersions, pinnedVersion } = require('./fixes/common.js');
const { bareName } = inventory;
const asksLib = require('./asks.js');
const mcpOrder = require('./mcps-list/mcp-order.js');
const planLists = require('./plan-lists.js');
const cursorMcp = require('./cursor/cursor-mcp.js');
const account = require('./core/account.js');

// ---- the pin, edited -------------------------------------------------------------------------------------------------

// The entry with `pkg`'s pin moved to `to` and its cut-off to `cutoff`. Only a cut-off the entry already carries moves: a
// user who removed it keeps it removed. null when the entry pins no version of `pkg`.
function bumpEntry(entry, pkg, to, cutoff)
{
    const from = pinnedVersion(entry, pkg);
    if (!from) return null;
    const e = clone(entry);
    let done = false;
    e.args = (e.args || []).map((a, i, all) =>
    {
        if (!done && !a.startsWith('-') && bareName(a) === pkg && a.endsWith(from)) { done = true; return a.slice(0, a.length - from.length) + to; }
        return a;
    });
    const at = e.args.indexOf('--exclude-newer');
    if (at >= 0 && e.args[at + 1] !== undefined) e.args[at + 1] = cutoff;
    if (e.env && typeof e.env.npm_config_before === 'string') e.env.npm_config_before = cutoff;
    return pinnedVersion(e, pkg) === to ? e : null;
}

// ---- plugins ---------------------------------------------------------------------------------------------------------

// The version a marketplace lists for a plugin, from its clone: the plugin's own plugin.json when the entry points at a
// folder in the clone (that file wins over the entry), else the entry's `version`. null: not listed.
function listedVersion(installLocation, pluginName)
{
    if (!installLocation) return null;
    let file = installLocation;
    try { if (!fs.statSync(file).isFile()) file = path.join(installLocation, '.claude-plugin', 'marketplace.json'); } catch { return null; }
    let doc;
    try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
    const entry = (doc.plugins || []).find((p) => p.name === pluginName);
    if (!entry) return null;
    const root = path.dirname(path.dirname(file));
    if (typeof entry.source === 'string')
    {
        const dir = path.resolve(root, (doc.metadata && doc.metadata.pluginRoot) || '', entry.source);
        try { const v = JSON.parse(fs.readFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), 'utf8')).version; if (v) return String(v); } catch { /* the entry's own */ }
    }
    return entry.version ? String(entry.version) : null;
}

function pluginOffers(ctx, out)
{
    const refreshed = new Map();
    for (const p of ctx.inv.plugins)
    {
        if (!refreshed.has(p.marketplace))
        {
            if (!ctx.refresh) refreshed.set(p.marketplace, null);
            else
            {
                const r = ctx.runCli(['plugin', 'marketplace', 'update', p.marketplace], { cwd: ctx.project, env: ctx.env });
                refreshed.set(p.marketplace, !r.error && r.status === 0 ? null : `marketplace ${p.marketplace} did not refresh (${`${r.stderr}${r.stdout}`.trim().split('\n').slice(-1)[0] || 'no output'}) - compared against its last clone`);
            }
            if (refreshed.get(p.marketplace)) out.notes.push(refreshed.get(p.marketplace));
        }
        const market = ctx.inv.marketplaces.find((m) => m.name === p.marketplace);
        const to = listedVersion(market && market.installLocation, p.plugin);
        const base = { kind: 'plugin', id: `plugin:${p.id}~${p.scope}`, plugin: p.id, scope: p.scope, from: p.version || null, group: p.rowId ? 'catalog' : 'other', label: `${p.id} (${p.scope})` };
        if (!market) { out.skipped.push(`${p.id} (${p.scope}): its marketplace '${p.marketplace}' is not registered, so nothing to compare against`); continue; }
        if (to === null) { out.unchecked.push({ ...base, to: null }); continue; }
        const cmp = compareVersions(p.version || '', to);
        const behind = cmp === null ? p.version !== to : cmp === -1;
        if (behind) out.offers.push({ ...base, to });
    }
}

// ---- MCP pins --------------------------------------------------------------------------------------------------------

async function mcpOffers(ctx, out)
{
    const cache = new Map();
    const latest = (registry, name) =>
    {
        const key = `${registry}:${name}`;
        if (!cache.has(key)) cache.set(key, ctx.registry.versionsOf(registry, name));
        return cache.get(key);
    };
    for (const r of ctx.inv.registrations)
    {
        if (r.own || r.alfredRetired) continue;
        if (r.choice === 'own') { out.skipped.push(`${r.name} (${r.scope}): on its own - not checked`); continue; }
        if (r.scope === 'inherited') { out.skipped.push(`${r.name} (inherited): inherited from ${inventory.fromHere(ctx.inv, r.from)} - update it there`); continue; }
        const row = ctx.catalog.byId.get(r.rowId);
        const def = row.routes[r.route];
        const at = `${r.name} (${r.scope})`;
        // the shared sign-in form (0.5.0, D5) runs mcp-remote at a pin, the bridge route's package
        const signIn = r.route === 'remote' && E.signInParts(r.entry);
        if (r.route === 'remote' && !signIn) { out.skipped.push(`${at}: a hosted URL has no pin`); continue; }
        if (def.runtime === 'docker') { out.skipped.push(`${at}: the Docker image tag is not checked - change it with /preferred-tools:configure`); continue; }
        const pkg = signIn ? ctx.catalog.byId.get('sentry').routes.bridge.package : def.package;
        if (!pkg) continue;
        const from = pinnedVersion(r.entry, pkg.name);
        if (!from) { out.skipped.push(`${at}: ${pkg.name} is launched with no version, so it follows the registry already`); continue; }
        let versions;
        try { versions = await latest(pkg.registry, pkg.name); }
        catch (e) { out.errors.push(`${at}: ${pkg.registry} lookup for ${pkg.name} failed - ${e.message}`); continue; }
        const pick = registryLib.choose(versions, { registry: pkg.registry, now: ctx.now, current: from });
        if (pick.held.length) out.held.push(`${at}: ${registryLib.heldLine(pkg.name, pick.held)}`);
        if (!pick.offer) continue;
        const entry = bumpEntry(r.entry, pkg.name, pick.offer.version, registryLib.cutoffOf(ctx.now));
        if (!entry) { out.errors.push(`${at}: could not move the pin of ${pkg.name} in the registration as it is written - change it with /preferred-tools:configure`); continue; }
        out.offers.push({ kind: 'mcp', id: `mcp:${r.name}~${r.scope}`, name: r.name, scope: r.scope, row: r.rowId, route: r.route, package: pkg.name, from, to: pick.offer.version, ageDays: pick.offer.ageDays, cutoff: registryLib.cutoffOf(ctx.now), old: r.entry, entry, group: 'mcp', label: `${r.name} (${r.scope})` });
    }
}

// Cursor's bridge copy of a two-form entry (D5): its mcp-remote pin, which mcpOffers never sees (Claude Code's side is a
// hosted URL). One offer per list server with a cursorEntry, from Cursor's copy as read; a copy that is missing or drifted
// from the list is named and left to fix.
async function cursorPinOffers(ctx, out)
{
    const kept = require('./core/kept.js');
    const pkg = ctx.catalog.byId.get('sentry').routes.bridge.package;
    let versions = null;
    for (const family of ['project', 'global'])
    {
        const l = ctx.inv.lists && ctx.inv.lists[family];
        if (!l || l.note || l.old) continue;
        const seen = (ctx.inv.cursor && ctx.inv.cursor[family]) || { entries: {} };
        for (const s of l.servers || [])
        {
            if (!s.cursorEntry || !(s.clients || []).includes('cursor')) continue;
            const at = `${s.name} (${s.scope})`;
            const copy = seen.entries[s.name];
            if (!copy) { out.skipped.push(`${at}: Cursor's copy is not in ${seen.file} - not checked; /preferred-tools:fix settles it`); continue; }
            const row = ctx.catalog.byId.get(s.row);
            if (JSON.stringify(copy) !== JSON.stringify(kept.keep(s.cursorEntry, row))) { out.skipped.push(`${at}: Cursor's copy in ${seen.file} differs from the list - not checked; /preferred-tools:fix settles it`); continue; }
            const from = pinnedVersion(s.cursorEntry, pkg.name);
            if (!from) continue;
            if (!versions)
            {
                try { versions = await ctx.registry.versionsOf(pkg.registry, pkg.name); }
                catch (e) { out.errors.push(`${at} in Cursor: ${pkg.registry} lookup for ${pkg.name} failed - ${e.message}`); return; }
            }
            const pick = registryLib.choose(versions, { registry: pkg.registry, now: ctx.now, current: from });
            if (pick.held.length) out.held.push(`${at} in Cursor: ${registryLib.heldLine(pkg.name, pick.held)}`);
            if (!pick.offer) continue;
            const entry = bumpEntry(s.cursorEntry, pkg.name, pick.offer.version, registryLib.cutoffOf(ctx.now));
            if (!entry) continue;
            out.offers.push({ kind: 'cursor-pin', id: `cursor-pin:${s.name}~${s.scope}`, name: s.name, scope: s.scope, row: s.row, family, list: l.file, file: seen.file, server: s, package: pkg.name, from, to: pick.offer.version, ageDays: pick.offer.ageDays, cutoff: registryLib.cutoffOf(ctx.now), old: s.cursorEntry, entry, group: 'mcp', label: `${s.name} (${s.scope}, Cursor)` });
        }
    }
}

// ---- key helpers (spec D7, R10) ---------------------------------------------------------------------------------------

// Each mcp-headers.js a managed registration names, or a root in use holds, with a lower number than this plugin's is
// offered; a hand edit or a newer copy is left to /preferred-tools:fix, with a note.
function helperOffers(ctx, out)
{
    const roots = require('./roots/roots.js');
    const { HELPER_VERSION } = require('./mcp-headers.js');
    const { BRIDGE_VERSION } = require('./mcp-bridge.js');
    const P = E.pathFor(ctx.inv.os);
    const rctx = { project: ctx.project, home: require('./core/account.js').homeDir(ctx.env), platform: ctx.inv.os, catalog: ctx.catalog };
    const dirs = new Set(['project', 'global'].map((f) => ctx.inv.roots && ctx.inv.roots[f] && ctx.inv.roots[f].path).filter(Boolean));
    const bridgeDirs = new Set();
    const contextDirs = new Set();
    for (const r of ctx.inv.registrations || [])
    {
        if (!r.rowId || r.own || r.alfredRetired || r.choice === 'own' || r.scope === 'inherited') continue;
        // serena's context file (0.5.0, D7), where the entry names this plugin's
        const at = E.contextArgAt(r.entry);
        if (at >= 0) contextDirs.add(P.dirname(roots.absOf(r.entry.args[at], rctx)));
        const named = roots.helperPathOf(r.entry && r.entry.headersHelper);
        if (named) dirs.add(P.dirname(roots.absOf(named, rctx)));
        // a bridge's folder holds its bridge and the helper it requires (0.4.0)
        const bridge = E.bridgeParts(r.entry);
        if (bridge) bridgeDirs.add(P.dirname(roots.absOf(bridge.path, rctx)));
    }
    for (const root of bridgeDirs) dirs.add(root);
    const offer = (kind, root, version) =>
    {
        const name = roots.FILES[kind];
        const file = P.join(root, name);
        const { state, number } = roots.shippedState(kind, file);
        const idKind = kind === 'serenaContext' ? 'context' : kind;
        if (state === 'lower') out.offers.push({ kind: idKind, id: `${idKind}:${file}`, file, root, from: String(number), to: String(version), group: 'helper', label: `${name} in ${root}` });
        else if (state === 'higher') out.notes.push(`${name} in ${root} is newer than this plugin - update preferred-tools`);
        else if (state === 'edited') out.notes.push(`${name} in ${root} changed since preferred-tools wrote it - left; /preferred-tools:fix (helper-stale) rewrites it`);
    };
    for (const root of dirs) offer('helper', root, HELPER_VERSION);
    for (const root of bridgeDirs) offer('bridge', root, BRIDGE_VERSION);
    for (const root of contextDirs) offer('serenaContext', root, roots.SERENA_CONTEXT_VERSION);
}

// ---- new ways to pass data (the user's ruling, 2026-11-12) ---------------------------------------------------------------

// The fix rows marked `upgrade` carry what an older preferred-tools wrote to the way this version passes data: a key in
// an Authorization header read through mcp-headers.js from .mcps-secrets once the user has put it there (key-to-helper),
// absolute project paths (project-relative-path), the root's .gitignore (root-ignore), the .mcp.json order (mcp-order).
// Only those detectors run. A finding that cannot apply alone - blocked, or needing a folder - is a note naming
// /preferred-tools:fix, counted in `waiting`.
const upgradeCatalog = (catalog) => ({ ...catalog, fixes: catalog.fixes.filter((f) => f.upgrade) });
const upgradeLabel = (f) => (f.kind === 'registration' ? `${f.name} (${f.scope})` : f.name);

function upgradeOffers(ctx, out)
{
    const fixLib = require('./fix.js');
    const catalog = upgradeCatalog(ctx.catalog);
    if (!catalog.fixes.length) return;
    const fctx = fixLib.makeCtx({ inv: ctx.inv, catalog, env: ctx.env, machine: ctx.machine, data: ctx.data });
    for (const f of fixLib.detectAll(fctx).found)
    {
        // an uninstall the user turned down is theirs to keep: no offer, no note, nothing waiting (spec D9)
        if (f.declined) continue;
        if (f.id === 'retired-plugin')
        {
            // one offer per id and scope, so picking one uninstalls only that scope; where alfred-code is set up it is
            // named and kept out of 'All of them'
            out.offers.push({ kind: 'upgrade', id: `upgrade:retired-plugin:${f.name}~${f.scope}`, fix: f.id, fixKind: f.kind, name: f.name, scope: f.scope, found: f.found, group: 'upgrade', label: f.alfred ? `${f.name} - alfred-code also installs it, and this removes it for both` : `${f.name} (${f.scope})`, alfred: f.alfred });
            continue;
        }
        const label = upgradeLabel(f);
        if (f.blocked || f.input)
        {
            const why = f.blocked || `needs a folder from you (${f.input.prompt})`;
            out.notes.push(`${label}: ${f.found} - not applied here: ${why}${/\/preferred-tools:fix/.test(why) ? '' : '; then run /preferred-tools:fix'}`);
            out.waiting += 1;
            continue;
        }
        const machine = f.kind !== 'registration';
        // list-import also names its family, its list and the servers it brings in, for the Cursor offer below
        const imports = f.id === 'list-import' ? { family: f.family, listFile: f.name, servers: f.servers } : {};
        out.offers.push({ kind: 'upgrade', id: `upgrade:${f.id}:${machine ? f.name : `${f.name}~${f.scope}`}`, fix: f.id, fixKind: f.kind, name: f.name, scope: machine ? null : f.scope, found: f.found, group: 'upgrade', label, ...imports });
    }
}

// ---- check -----------------------------------------------------------------------------------------------------------

function makeCtx({ inv, project, catalog = catalogLib.load(), env = process.env, machine, runCli = cli.run, registry, now = Date.now(), refresh = true, data = null })
{
    return {
        inv, project, catalog, env, runCli, now, refresh, data,
        machine: machine || realMachine({ env, platform: inv.os }),
        registry: registry || { versionsOf: (reg, name) => registryLib.versionsOf(reg, name, { env }) },
    };
}

// -> { offers, unchecked, skipped, held, errors, notes, waiting }
async function check(ctx)
{
    const out = { offers: [], unchecked: [], skipped: [], held: [], errors: [], notes: [], waiting: 0, outside: planLists.changedOutside(ctx.inv, ctx.catalog), cursorOffers: [] };
    pluginOffers(ctx, out);
    await mcpOffers(ctx, out);
    await cursorPinOffers(ctx, out);
    helperOffers(ctx, out);
    upgradeOffers(ctx, out);
    // a plugin offered for uninstall is not offered an update beside it
    const leaving = new Set(out.offers.filter((o) => o.fix === 'retired-plugin').map((o) => `${o.name}~${o.scope}`));
    const stays = (o) => !(o.kind === 'plugin' && leaving.has(`${o.plugin}~${o.scope}`));
    out.offers = out.offers.filter(stays);
    out.unchecked = out.unchecked.filter(stays);
    cursorOffers(ctx, out);
    return out;
}

// Update's Cursor offer (spec D9): once per root, when Cursor is on this machine, its list sets no server up for Cursor
// and its 'Not now' is not recorded. Each names the servers set up for Claude Code, and the names Cursor's file already
// holds as its own (asked before the offer is taken). A 0.4.x root has no list until this update's list-import writes
// it, so the servers that import brings in count too, and the offer then `needs` that import picked in the same run.
function cursorOffers(ctx, out)
{
    const home = account.homeDir(ctx.env);
    const cctx = { platform: ctx.inv.os, env: ctx.env, home, project: ctx.project };
    if (!cursorMcp.cursorFound(cctx, ctx.inv)) return;
    for (const family of ['project', 'global'])
    {
        const l = ctx.inv.lists && ctx.inv.lists[family];
        if (l && (l.note || l.cursorOffer === 'declined')) continue;
        const listed = l && !l.old ? (l.servers || []) : [];
        if (listed.some((x) => (x.clients || []).includes('cursor'))) continue;
        const pending = out.offers.find((o) => o.fix === 'list-import' && o.family === family);
        const brought = ((pending && pending.servers) || []).filter((x) => !listed.some((y) => y.name === x.name && y.scope === x.scope));
        const servers = [...listed, ...brought].filter((x) => (x.clients || ['claude']).includes('claude'));
        const file = l && !l.old ? l.file : pending ? pending.listFile : null;
        if (!servers.length || !file) continue;
        const root = path.dirname(file);
        const upserts = servers.map((x) => ({ server: { ...x, clients: ['claude', 'cursor'] }, cursorFile: null }));
        const taken = planLists.takenNames(ctx.inv, { ...cctx, catalog: ctx.catalog }, upserts);
        out.cursorOffers.push({ id: `cursor-offer:${root}`, family, root, list: file, servers: servers.map((x) => ({ name: x.name, scope: x.scope })), taken, needs: brought.length ? pending.id : null });
    }
}

// The order update applies in (spec D9): list-import first, then the registration upgrades, then the other upgrades,
// then every other offer; ties keep catalog/fixes.json's order.
function ordered(picked, catalog)
{
    const order = catalog.fixes.map((f) => f.id);
    const rank = (c) => (typeof c === 'string' || c.kind !== 'upgrade' ? 3 : c.fix === 'list-import' ? 0 : c.fixKind === 'registration' ? 1 : 2);
    const at = (c) => (typeof c === 'string' || c.kind !== 'upgrade' ? 0 : order.indexOf(c.fix));
    return picked.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || at(a.c) - at(b.c) || a.i - b.i).map((x) => x.c);
}

const behind = (out) => out.offers.length + out.unchecked.length > 0;

function render(out)
{
    const lines = [...(out.outside || [])];
    if (lines.length) lines.push('');
    const table = (title, items) =>
    {
        if (!items.length) return;
        lines.push(title);
        const w = Math.max(...items.map((i) => i.label.length));
        for (const i of items) lines.push(`  ${i.label.padEnd(w)}  ${i.from || '?'} -> ${i.to || '(not listed)'}${i.ageDays !== undefined ? `  (${i.ageDays} days old)` : ''}`);
    };
    table('Catalog plugins:', out.offers.filter((o) => o.kind === 'plugin' && o.group === 'catalog'));
    table('Other plugins:', out.offers.filter((o) => o.kind === 'plugin' && o.group === 'other'));
    table('MCP servers (pin -> newest release at least 7 days old):', out.offers.filter((o) => o.kind === 'mcp' || o.kind === 'cursor-pin'));
    table('Key helpers:', out.offers.filter((o) => o.kind === 'helper' || o.kind === 'bridge' || o.kind === 'context'));
    const ups = out.offers.filter((o) => o.kind === 'upgrade');
    if (ups.length)
    {
        lines.push('New ways to pass data:');
        const w = Math.max(...ups.map((u) => u.label.length));
        for (const u of ups) lines.push(`  ${u.label.padEnd(w)}  ${u.fix}: ${u.found}`);
    }
    if (out.unchecked.length)
    {
        lines.push('Plugins whose marketplace lists no version (`claude plugin update` is the check; each is offered on its own):');
        for (const u of out.unchecked) lines.push(`  ${u.label}  ${u.from || '?'}`);
    }
    for (const [title, list] of [['Held back', out.held], ['Skipped', out.skipped], ['Could not check', out.errors], ['Notes', out.notes]])
        if (list.length) lines.push(`${title}:`, ...list.map((l) => `  ${l}`));
    const offered = out.cursorOffers || [];
    if (offered.length) lines.push('Cursor (asked after the updates):', ...offered.map((o) => `  ${o.servers.length} servers in ${o.root} are set up for Claude Code only`));
    // a note that waits on the user is never 'everything current' (a key to fill, a key file git would commit)
    if (!behind(out) && out.waiting) lines.push('', `preferred-tools: nothing to update - ${out.waiting} wait${out.waiting === 1 ? 's' : ''} on you first (the notes above)`);
    else if (!behind(out) && offered.length) lines.push('', 'preferred-tools: nothing to update - Cursor can be set up (asked next)');
    else if (!behind(out) && !out.errors.length) lines.push('', 'preferred-tools: everything current');
    else if (!behind(out)) lines.push('', 'preferred-tools: nothing behind among what could be checked');
    return lines.join('\n').replace(/^\n/, '');
}

// ---- asks ------------------------------------------------------------------------------------------------------------

// The asks as data: the offer (single-select), then the pick lists for 'Pick which' - multi-selects of at most four options,
// one group per kind, at most four questions a call.
function questions(out)
{
    const items = [...out.offers, ...out.unchecked];
    // Cursor's offer, one per root, and the names Cursor already has, asked right after 'Set them up for Cursor too'
    const cursor = { cursorOffers: (out.cursorOffers || []).map(cursorOfferAsk), cursorNameQuestions: (out.cursorOffers || []).flatMap((o) => o.taken.map((t) => asksLib.cursorNameQuestion(t))) };
    if (!items.length) return { offer: null, pick: [], ...cursor };
    const groups = [['catalog', 'Catalog plugins'], ['other', 'Other plugins'], ['mcp', 'MCP servers'], ['helper', 'Key helpers'], ['upgrade', 'New ways to pass data', 'Data passing']];
    const qs = [];
    for (const [g, title, header] of groups)
    {
        const list = items.filter((o) => o.group === g);
        asksLib.chunk(list, 4).forEach((part) => qs.push({
            id: `update-${g}`, header: header || title.slice(0, 12), multiSelect: true, question: `${title}: which do you want to update?`,
            // AskUserQuestion takes 2 to 4 options: a group of one gets 'None of these' beside it
            options: [...part.map((o) => ({ label: o.kind === 'upgrade' ? `${o.label}: ${o.fix}` : `${o.label}: ${o.from || '?'} -> ${o.to || 'latest'}`, description: o.id })), ...(part.length === 1 ? [{ label: 'None of these', description: 'none' }] : [])],
        }));
    }
    const offer = { ...asksLib.STATIC.updateOffer };
    if (!out.offers.length) offer.options = offer.options.filter((o) => o.label !== `All of them${asksLib.REC}`).map((o, i) => (i === 0 ? { ...o, label: `${o.label}${asksLib.REC}` } : o));
    return { offer, pick: asksLib.chunk(qs, 4), ...cursor };
}

// The ask cursor-offer (spec D9), asks.js's text; `answers` maps each label to the value passed back.
function cursorOfferAsk(o)
{
    const q = asksLib.cursorOfferQuestion(o.root, o.servers.length);
    return { ...q.question, answers: q.answers };
}

// ---- apply -----------------------------------------------------------------------------------------------------------

function updatePlugin(ctx, offer, log)
{
    const r = ctx.runCli(['plugin', 'update', offer.plugin, '--scope', offer.scope], { cwd: ctx.project, env: ctx.env });
    if (r.error || r.status !== 0) { log(`FAILED ${offer.label}: claude plugin update failed - ${`${r.stderr}${r.stdout}`.trim().split('\n').slice(-1)[0]}`); return false; }
    const after = inventory.buildInventory({ project: ctx.project, env: ctx.env, run: ctx.runCli }).plugins.find((p) => p.id === offer.plugin && p.scope === offer.scope);
    const v = after ? after.version : null;
    if (offer.to === null) log(`ok     ${offer.label}: ${offer.from || '?'} -> ${v || '?'}${v === offer.from ? ' (already the latest)' : ''}`);
    else log(`${v === offer.to ? 'ok    ' : 'CHECK '} ${offer.label}: ${offer.from || '?'} -> ${v || '?'} (read back from the plugin list)`);
    return offer.to === null || v === offer.to;
}

function updateMcp(ctx, offer, tmp, log)
{
    // a new way to pass data rewrote it earlier in this run: the pin moves on the registration as it is now - a change
    // starts from what is installed
    if (ctx.touched && ctx.touched.has(`${offer.name}~${offer.scope}`))
    {
        const now = inventory.buildInventory({ project: ctx.project, env: ctx.env, run: ctx.runCli, data: ctx.data, catalog: ctx.catalog }).registrations.find((r) => r.name === offer.name && r.scope === offer.scope);
        const entry = now ? bumpEntry(now.entry, offer.package, offer.to, offer.cutoff) : null;
        if (!entry) { log(`CHECK  ${offer.label}: rewritten earlier in this run and no longer pins ${offer.package} - left`); return false; }
        offer = { ...offer, old: now.entry, entry };
    }
    // the new pin is not in the cache yet: fetch it right after the rewrite (entries.js fetchStep)
    const fetch = E.fetchStep(offer.name, offer.entry, offer.row, offer.old);
    const replace = { op: 'mcp-replace', name: offer.name, scope: offer.scope, old: offer.old, entry: offer.entry, row: offer.row, route: offer.route, why: `${offer.package} ${offer.from} -> ${offer.to}` };
    // the list and Cursor take the registration as read back, in the same run (spec D9 Update 2), from the lists as they
    // stand now - an earlier step of this run may have written them
    const notes = [];
    const now = inventory.buildInventory({ project: ctx.project, env: ctx.env, run: ctx.runCli, data: ctx.data, catalog: ctx.catalog });
    const tail = planLists.repairTail(now, { platform: now.os, project: ctx.project, home: account.homeDir(ctx.env), env: ctx.env, catalog: ctx.catalog, notes }, [replace]);
    for (const n of notes) log(`note   ${n}`);
    const plan = { project: ctx.project, alfredCodeEnabled: Boolean(ctx.inv && ctx.inv.alfredCodeEnabled), steps: mcpOrder.withOrderStep([replace, ...(fetch ? [fetch] : []), ...tail], ctx.project, mcpOrder.ownProjectNames(ctx.inv || {})), expect: [{ kind: 'mcp', name: offer.name, scope: offer.scope, route: offer.route }] };
    const report = apply(plan, { env: ctx.env, tmp, runCli: ctx.runCli, fetchFile: false, log: (...a) => log(a.join(' ')) });
    if (report.fetch && report.fetch.fetch.length) ctx.fetches.push(report.fetch);
    if (report.failed) return false;
    const again = tail.flatMap((x) => x.reapprove || []);
    if (again.length) ctx.reapprove.push(...again);
    const got = inventory.buildInventory({ project: ctx.project, env: ctx.env, run: ctx.runCli }).registrations.find((r) => r.name === offer.name && r.scope === offer.scope);
    const pin = got ? pinnedVersion(got.entry, offer.package) : null;
    log(`${pin === offer.to ? 'ok    ' : 'CHECK '} ${offer.label}: ${offer.package} ${offer.from} -> ${pin || '?'} (read back from the file the CLI wrote), cut-off ${offer.cutoff}`);
    return pin === offer.to;
}

// Cursor's bridge copy with its pin moved: the list's cursorEntry and Cursor's file, read back. No claude call - Claude
// Code's entry is a hosted URL with its helper.
function updateCursorPin(ctx, offer, tmp, log)
{
    const scopes = offer.family === 'global' ? ['user'] : ['local', 'project'];
    const before = ((ctx.inv.lists[offer.family] || {}).servers || []).filter((x) => (x.clients || []).includes('cursor')).map((x) => x.name);
    const steps = [
        { op: 'list-write', file: offer.list, family: offer.family, upserts: [{ server: { ...offer.server, cursorEntry: offer.entry }, after: null, cursorFile: offer.file }], drops: [], own: null, why: `${offer.list}: Cursor's copy of ${offer.name} at ${offer.package} ${offer.to}` },
        { op: 'cursor-write', file: offer.file, family: offer.family, lists: [{ file: offer.list, scopes }], before, skip: [], replace: [], why: `${offer.file}: ${offer.name} at ${offer.package} ${offer.to}` },
    ];
    const report = apply({ project: ctx.project, steps }, { env: ctx.env, tmp, runCli: ctx.runCli, fetchFile: false, log: (...a) => log(a.join(' ')) });
    if (report.failed) return false;
    const got = require('./cursor/cursor-mcp.js').readCursor(offer.file);
    const pin = got.state === 'ok' ? pinnedVersion(got.doc.mcpServers[offer.name] || {}, offer.package) : null;
    log(`${pin === offer.to ? 'ok    ' : 'CHECK '} ${offer.label}: ${offer.package} ${offer.from} -> ${pin || '?'} (read back from ${offer.file}), cut-off ${offer.cutoff}`);
    return pin === offer.to;
}

// A helper or bridge copy rewritten with this plugin's, if it is still the lower one the check offered; read back. The
// root's package.json says CommonJS when it has none (apply.js ensureCommonjs).
function updateHelper(offer, log)
{
    const roots = require('./roots/roots.js');
    const kind = offer.kind === 'bridge' ? 'bridge' : offer.kind === 'context' ? 'serenaContext' : 'helper';
    const before = roots.shippedState(kind, offer.file);
    if (before.state !== 'lower') { log(`CHECK  ${offer.label}: now ${before.state} - left as it is`); return false; }
    fs.writeFileSync(offer.file, roots.shippedSource(kind));
    // a YAML file needs no package.json
    const pkg = kind === 'serenaContext' ? {} : require('./apply.js').ensureCommonjs(path.dirname(offer.file));
    if (pkg.note) log(`note   ${pkg.note}`);
    const ok = roots.shippedState(kind, offer.file).state === 'same';
    log(`${ok ? 'ok    ' : 'CHECK '} ${offer.label}: ${kind} ${offer.from} -> ${offer.to} (read back)`);
    return ok;
}

// A new way to pass data, applied with fix's own code to the registration as it is now, and read back by its detector.
// It runs before the pins: its health check then reads a launch already in the cache, and a pin moved after it starts
// from what it wrote. One an earlier step already did (a rewrite puts .mcp.json in order) is done. Its launches join
// this run's fetch file.
function updateUpgrade(ctx, offer, dir, log)
{
    const fixLib = require('./fix.js');
    const inv = inventory.buildInventory({ project: ctx.project, env: ctx.env, run: ctx.runCli, data: ctx.data, catalog: ctx.catalog });
    const fctx = fixLib.makeCtx({ inv, catalog: upgradeCatalog(ctx.catalog), env: ctx.env, machine: ctx.machine, data: ctx.data });
    const r = fixLib.applyFixes(fctx, [offer.fix], { only: offer.name, name: offer.name, scope: offer.scope || undefined, tmp: dir, log, runCli: ctx.runCli, fetchFile: false });
    if (r.fetch && r.fetch.fetch.length) ctx.fetches.push(r.fetch);
    for (const f of r.applied.filter((x) => x.kind === 'registration')) { ctx.restart = true; ctx.touched.add(`${f.name}~${f.scope}`); }
    // a plugin taken out leaves the session's plugins as they were until it reloads
    if (r.applied.some((x) => x.id === 'retired-plugin')) ctx.restart = true;
    const ok = !r.failed && !r.remaining.length && (r.applied.length > 0 || r.gone);
    log(`${ok ? 'ok    ' : 'CHECK '} ${offer.label}: ${offer.fix} (${r.gone ? 'already done by an earlier step in this run' : 'read back by its detector'})`);
    return ok;
}

// Update's Cursor offer, answered (spec D9). 'declined' keeps 'Not now' in the root's list; 'set' is configure's apps
// change for each server, through the plan's own list, Cursor and file steps. A name Cursor's file already holds is
// replaced or kept on its `cursor-name:<name>@<file>` answer; with none it stays Claude Code only and is named.
function applyCursorOffer(ctx, o, answer, input, dir, log)
{
    const say = (...a) => log(a.join(' '));
    if (answer === 'declined')
    {
        const step = { op: 'list-write', file: o.list, family: o.family, upserts: [], drops: [], own: null, cursorOffer: 'declined', why: `${o.list}: Cursor is not offered again for ${o.root}` };
        const r = apply({ project: ctx.project, steps: [step] }, { env: ctx.env, tmp: dir, runCli: ctx.runCli, fetchFile: false, log: say });
        log(`${r.failed ? 'FAILED' : 'ok    '} ${o.id}: not now - kept in ${o.list}`);
        return !r.failed;
    }
    const { plan } = require('./plan.js');
    const inv = inventory.buildInventory({ project: ctx.project, env: ctx.env, run: ctx.runCli, data: ctx.data, catalog: ctx.catalog });
    const change = Object.fromEntries(o.servers.map((x) => [`mcp:${x.name}~${x.scope}`, { clients: ['claude', 'cursor'] }]));
    const cursorNames = {};
    for (const t of o.taken)
    {
        const given = input[`cursor-name:${t.name}@${t.file}`];
        cursorNames[`${t.name}@${t.file}`] = given === 'replace' ? 'replace' : 'keep';
        if (given !== 'replace' && given !== 'keep') log(`${t.name}: Cursor's ${t.file} already has its own ${t.name} - left; run /preferred-tools:configure to choose`);
    }
    const p = plan(inv, { change, cursorNames }, { home: account.homeDir(ctx.env), env: ctx.env, catalog: ctx.catalog });
    if (p.errors.length) { log(`FAILED ${o.id}: ${p.errors.join('; ')}`); return false; }
    const r = apply(p, { env: ctx.env, tmp: dir, runCli: ctx.runCli, fetchFile: false, log: say });
    log(`${r.failed ? 'FAILED' : 'ok    '} ${o.id}: set up for Cursor too`);
    return !r.failed;
}

// -> { applied: [id], failed: [id], unknown: [id], fetchFile }
function applyUpdates(ctx, ids, out, { tmp, log = console.log, input = {} } = {})
{
    const res = { applied: [], failed: [], unknown: [], fetchFile: null, dir: null };
    // the uninstall offers turned down (spec D9): shown and left unpicked, or kept out of 'All of them' for alfred-code
    const declines = require('./core/declines.js');
    let turnedDown;
    try { turnedDown = declines.parse(input['retired-declined']); }
    catch (e) { log(`FAILED ${e.message}`); res.failed.push('retired-declined'); return res; }
    const known = [...out.offers, ...out.unchecked];
    const named = ids.filter((i) => i !== 'all' && i !== 'none');
    let everything = [];
    if (ids.includes('all'))
    {
        // where alfred-code is set up, an old plugin's uninstall is reached only by its own pick
        const kept = out.offers.filter((o) => o.alfred && !named.includes(o.id));
        for (const o of kept) log(`${o.name} kept - alfred-code installs it; fix lists it`);
        everything = out.offers.filter((o) => !kept.includes(o));
    }
    if (turnedDown.length) log(declines.add(ctx.data, turnedDown).detail);
    const picked = ids.includes('all') ? [...everything, ...named.map((i) => known.find((o) => o.id === i)).filter((o) => o && !everything.includes(o))] : named.map((i) => known.find((o) => o.id === i) || i);
    // the new ways to pass data first - list-import, a registration's, then a file's or folder's - and the pins after
    // them (updateUpgrade)
    const chosen = ordered(picked, ctx.catalog);
    const dir = tmp || fs.mkdtempSync(path.join(os.tmpdir(), 'preferred-tools-'));
    res.dir = dir;
    ctx.fetches = [];
    ctx.restart = false;
    ctx.touched = new Set();
    ctx.reapprove = [];
    for (const c of chosen)
    {
        if (typeof c === 'string') { res.unknown.push(c); log(`NOT OFFERED ${c}: nothing is behind under that id`); continue; }
        const ok = c.kind === 'plugin' ? updatePlugin(ctx, c, log) : c.kind === 'helper' || c.kind === 'bridge' || c.kind === 'context' ? updateHelper(c, log) : c.kind === 'upgrade' ? updateUpgrade(ctx, c, dir, log) : c.kind === 'cursor-pin' ? updateCursorPin(ctx, c, dir, log) : updateMcp(ctx, c, dir, log);
        (ok ? res.applied : res.failed).push(c.id);
    }
    // Cursor's offer, after the pins (spec D9): 'Set them up' or 'Not now' as answered; no answer writes nothing
    for (const o of out.cursorOffers || [])
    {
        const answer = input[o.id];
        if (answer === undefined) continue;
        if (o.needs && !res.applied.includes(o.needs)) { log(`NOT OFFERED ${o.id}: its servers join the list through ${o.needs}, which was not picked - run /preferred-tools:update again`); continue; }
        const ok = answer === 'set' || answer === 'declined' ? applyCursorOffer(ctx, o, answer, input, dir, log) : (log(`FAILED ${o.id}: '${answer}' is not set or declined`), false);
        (ok ? res.applied : res.failed).push(o.id);
    }
    // Cursor asks to approve a changed entry again (spec Risks)
    if (ctx.reapprove.length) log('', planLists.reapproveLine([...new Set(ctx.reapprove)]));
    // every rewritten server in one fetch file, for fetch.js in the background (apply.js says why); a server rewritten
    // twice in this run is fetched once at its scope, as it was written last
    const last = new Map();
    for (const s of ctx.fetches.flatMap((f) => f.fetch)) { last.delete(`${s.name}~${s.scope}`); last.set(`${s.name}~${s.scope}`, s); }
    const job = fetchLib.job(ctx.project, [...last.values()], [...new Set(ctx.fetches.flatMap((f) => f.check))]);
    if (job.fetch.length)
    {
        res.fetchFile = fetchLib.writeJob(path.join(dir, 'fetch.json'), job);
        log('', ...fetchLib.nextLines(res.fetchFile, job));
    }
    // a helper runs at each connect: rewriting one needs no restart; a new way to pass data needs one when it rewrote a
    // registration (a .gitignore or the .mcp.json order changes nothing a session started)
    if (res.applied.some((id) => !id.startsWith('helper:') && !id.startsWith('upgrade:')) || ctx.restart) log('', `Restart Claude Code (or run /reload-plugins for plugins) so the updated servers and plugins load${res.fetchFile ? ' - after the fetch reports' : ''}.`);
    return res;
}

// ---- CLI -------------------------------------------------------------------------------------------------------------

function parseArgs(argv)
{
    const args = { input: {} };
    for (let i = 0; i < argv.length; i++)
    {
        const a = argv[i];
        if (['--check', '--questions', '--json', '--no-refresh'].includes(a)) { args[a.slice(2)] = true; continue; }
        if (!['--apply', '--project', '--tmp', '--data', '--input'].includes(a)) throw new Error(`unknown argument '${a}'`);
        const v = argv[i + 1];
        if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
        i++;
        // fix.js's rule: split on the first =, repeatable
        if (a === '--input')
        {
            const eq = v.indexOf('=');
            if (eq < 1) throw new Error('--input needs key=value');
            args.input[v.slice(0, eq)] = v.slice(eq + 1);
            continue;
        }
        if (Object.hasOwn(args, a.slice(2))) throw new Error(`${a} is given twice`);
        args[a.slice(2)] = v;
    }
    if (['check', 'questions', 'apply'].filter((m) => args[m]).length !== 1) throw new Error('give exactly one of --check, --questions or --apply');
    return args;
}

async function main(argv, { env = process.env, out = (s) => process.stdout.write(`${s}\n`), machine, registry, now, runCli } = {})
{
    let args;
    try { args = parseArgs(argv); }
    catch (e) { out(`update: ${e.message}\nusage: node scripts/update.js --check | --questions | --apply <id,id|all|none> [--input key=value] [--no-refresh] [--project <dir>] [--tmp <dir>] [--data <dir>]`); return 2; }
    const project = path.resolve(args.project || process.cwd());
    const inv = inventory.buildInventory({ project, env, run: runCli || cli.run, data: args.data || null });
    if (!inv.cli.ok) { out('preferred-tools: the claude CLI is not on PATH - install Claude Code, then run this again.'); return 3; }
    const ctx = makeCtx({ inv, project, env, machine, registry, now, runCli: runCli || cli.run, refresh: !args['no-refresh'], data: args.data || null });
    const found = await check(ctx);
    if (args.apply)
    {
        const log = (...a) => out(a.join('\n'));
        const res = applyUpdates(ctx, args.apply.split(',').filter(Boolean), found, { tmp: args.tmp, log, input: args.input });
        // the last script on <tmp> removes it, unless fetch.js takes it on; apply() per server never does
        if (!res.fetchFile) tmpdir.release(res.dir, log);
        return res.failed.length || res.unknown.length ? 1 : 0;
    }
    if (args.questions) out(JSON.stringify(questions(found), null, 2));
    else if (args.json) out(JSON.stringify(found, null, 2));
    else out(render(found));
    return 0;
}

if (require.main === module) { blockingStdio(); main(process.argv.slice(2)).then((code) => process.exit(code)); }
module.exports = { bumpEntry, listedVersion, makeCtx, check, render, questions, applyUpdates, parseArgs, main, behind, ordered };
