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
const path = require('node:path');
const catalogLib = require('../catalog/catalog.ts');
const cli = require('../core/claude-cli.ts');
const registryLib = require('../catalog/registry.ts');
const { realMachine } = require('../fix/common.ts');
const { takenNames } = require('../plan/cursor-steps.ts');
const { changedOutside } = require('../plan/repair-tail.ts');
const cursorMcp = require('../cursor/cursor-mcp.ts');
const account = require('../core/account.ts');
const { pluginOffers } = require('./offers-plugins.ts');
const { mcpOffers, cursorPinOffers } = require('./offers-pins.ts');
const { helperOffers, upgradeOffers } = require('./offers-files.ts');

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
    const out = { offers: [], unchecked: [], skipped: [], held: [], errors: [], notes: [], waiting: 0, outside: changedOutside(ctx.inv, ctx.catalog), cursorOffers: [] };
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
        const taken = takenNames(ctx.inv, { ...cctx, catalog: ctx.catalog }, upserts);
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

module.exports = { makeCtx, check, render, behind, ordered };
