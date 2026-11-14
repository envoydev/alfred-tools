#!/usr/bin/env node
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
import path from 'node:path';
import * as catalogLib from '../catalog/catalog.ts';
import * as cli from '../core/claude-cli.ts';
import * as registryLib from '../catalog/registry.ts';
import { realMachine } from '../fix/common.ts';
import { takenNames } from '../plan/cursor-steps.ts';
import { changedOutside } from '../plan/repair-tail.ts';
import * as cursorMcp from '../cursor/cursor-mcp.ts';
import * as account from '../core/account.ts';
import { pluginOffers } from './offers-plugins.ts';
import { mcpOffers, cursorPinOffers } from './offers-pins.ts';
import { helperOffers, upgradeOffers } from './offers-files.ts';
import type { Env } from '../core/types.ts';
import type { Catalog } from '../catalog/types.ts';
import type { Inventory } from '../inventory/types.ts';
import type { RunCli } from '../apply/types.ts';
import type { MachineProbe } from '../fix/types.ts';
import type { Offer, Registry, UpdateCheck, UpdateCtx } from './types.ts';

// ---- check -----------------------------------------------------------------------------------------------------------

export function makeCtx({ inventory: inventory, project, catalog = catalogLib.load(), env = process.env, machine, runCli = cli.runClaude, registry, now = Date.now(), refresh = true, data = null }: { inventory: Inventory; project: string; catalog?: Catalog; env?: Env; machine?: MachineProbe | undefined; runCli?: RunCli; registry?: Registry | undefined; now?: number | undefined; refresh?: boolean; data?: string | null }): UpdateCtx
{
    return {
        inventory: inventory, project, catalog, env, runCli, now, refresh, data,
        machine: machine || realMachine({ env, platform: inventory.os }),
        registry: registry || { versionsOf: (registryKind, name) => registryLib.versionsOf(registryKind, name, { env }) },
    };
}

// -> { offers, unchecked, skipped, held, errors, notes, waiting }
export async function checkUpdates(context: UpdateCtx): Promise<UpdateCheck>
{
    const out: UpdateCheck = { offers: [], unchecked: [], skipped: [], held: [], errors: [], notes: [], waiting: 0, outside: changedOutside(context.inventory, context.catalog), cursorOffers: [] };
    pluginOffers(context, out);
    await mcpOffers(context, out);
    await cursorPinOffers(context, out);
    helperOffers(context, out);
    upgradeOffers(context, out);
    // a plugin offered for uninstall is not offered an update beside it
    const leaving = new Set(out.offers.filter((offer) => offer.fix === 'retired-plugin').map((offer) => `${offer.name}~${offer.scope}`));
    const stays = (offer: Offer) => !(offer.kind === 'plugin' && leaving.has(`${offer.plugin}~${offer.scope}`));
    out.offers = out.offers.filter(stays);
    out.unchecked = out.unchecked.filter(stays);
    cursorOffers(context, out);
    return out;
}

// Update's Cursor offer (spec D9): once per root, when Cursor is on this machine, its list sets no server up for Cursor
// and its 'Not now' is not recorded. Each names the servers set up for Claude Code, and the names Cursor's file already
// holds as its own (asked before the offer is taken). A 0.4.x root has no list until this update's list-import writes
// it, so the servers that import brings in count too, and the offer then `needs` that import picked in the same run.
function cursorOffers(context: UpdateCtx, out: UpdateCheck): void
{
    const home = account.homeDir(context.env);
    const cctx = { platform: context.inventory.os, env: context.env, home, project: context.project };
    if (!cursorMcp.cursorFound(cctx, context.inventory)) return;
    for (const family of ['project', 'global'] as const)
    {
        const list = context.inventory.lists && context.inventory.lists[family];
        if (list && (list.note || list.cursorOffer === 'declined')) continue;
        const listed = list && !list.old ? (list.servers || []) : [];
        if (listed.some((server) => (server.clients || []).includes('cursor'))) continue;
        const pending = out.offers.find((offer) => offer.fix === 'list-import' && offer.family === family);
        const brought = ((pending && pending.servers) || []).filter((server) => !listed.some((listedServer) => listedServer.name === server.name && listedServer.scope === server.scope));
        const servers = [...listed, ...brought].filter((server) => (server.clients || ['claude']).includes('claude'));
        const file = list && !list.old ? list.file : pending ? pending.listFile : null;
        if (!servers.length || !file) continue;
        const root = path.dirname(file);
        const upserts = servers.map((server) => ({ server: { ...server, clients: ['claude', 'cursor'] }, cursorFile: null }));
        const taken = takenNames(context.inventory, { ...cctx, catalog: context.catalog }, upserts);
        out.cursorOffers.push({ id: `cursor-offer:${root}`, family, root, list: file, servers: servers.map((server) => ({ name: server.name, scope: server.scope })), taken, needs: brought.length ? pending!.id : null });
    }
}

// The order update applies in (spec D9): list-import first, then the registration upgrades, then the other upgrades,
// then every other offer; ties keep catalog/fixes.json's order.
export function ordered(picked: (Offer | string)[], catalog: Catalog): (Offer | string)[]
{
    const order = catalog.fixes.map((fixRow) => fixRow.id);
    const rank = (choice: Offer | string) => (typeof choice === 'string' || choice.kind !== 'upgrade' ? 3 : choice.fix === 'list-import' ? 0 : choice.fixKind === 'registration' ? 1 : 2);
    const at = (choice: Offer | string) => (typeof choice === 'string' || choice.kind !== 'upgrade' ? 0 : order.indexOf(choice.fix!));
    return picked.map((choice, i) => ({ choice: choice, i })).sort((left, right) => rank(left.choice) - rank(right.choice) || at(left.choice) - at(right.choice) || left.i - right.i).map((entry) => entry.choice);
}

export const behind = (out: UpdateCheck): boolean => out.offers.length + out.unchecked.length > 0;

export function renderUpdates(out: UpdateCheck): string
{
    const lines = [...(out.outside || [])];
    if (lines.length) lines.push('');
    const table = (title: string, items: Offer[]) =>
    {
        if (!items.length) return;
        lines.push(title);
        const labelWidth = Math.max(...items.map((i) => i.label.length));
        for (const i of items) lines.push(`  ${i.label.padEnd(labelWidth)}  ${i.from || '?'} -> ${i.to || '(not listed)'}${i.ageDays !== undefined ? `  (${i.ageDays} days old)` : ''}`);
    };
    table('Catalog plugins:', out.offers.filter((offer) => offer.kind === 'plugin' && offer.group === 'catalog'));
    table('Other plugins:', out.offers.filter((offer) => offer.kind === 'plugin' && offer.group === 'other'));
    table('MCP servers (pin -> newest release at least 7 days old):', out.offers.filter((offer) => offer.kind === 'mcp' || offer.kind === 'cursor-pin'));
    table('Key helpers:', out.offers.filter((offer) => offer.kind === 'helper' || offer.kind === 'bridge' || offer.kind === 'context'));
    const upgrades = out.offers.filter((offer) => offer.kind === 'upgrade');
    if (upgrades.length)
    {
        lines.push('New ways to pass data:');
        const labelWidth = Math.max(...upgrades.map((upgrade) => upgrade.label.length));
        for (const upgrade of upgrades) lines.push(`  ${upgrade.label.padEnd(labelWidth)}  ${upgrade.fix}: ${upgrade.found}`);
    }
    if (out.unchecked.length)
    {
        lines.push('Plugins whose marketplace lists no version (`claude plugin update` is the check; each is offered on its own):');
        for (const offer of out.unchecked) lines.push(`  ${offer.label}  ${offer.from || '?'}`);
    }
    for (const [title, list] of [['Held back', out.held], ['Skipped', out.skipped], ['Could not check', out.errors], ['Notes', out.notes]] as [string, string[]][])
        if (list.length) lines.push(`${title}:`, ...list.map((line) => `  ${line}`));
    const offered = out.cursorOffers || [];
    if (offered.length) lines.push('Cursor (asked after the updates):', ...offered.map((cursorOffer) => `  ${cursorOffer.servers.length} servers in ${cursorOffer.root} are set up for Claude Code only`));
    // a note that waits on the user is never 'everything current' (a key to fill, a key file git would commit)
    if (!behind(out) && out.waiting) lines.push('', `preferred-tools: nothing to update - ${out.waiting} wait${out.waiting === 1 ? 's' : ''} on you first (the notes above)`);
    else if (!behind(out) && offered.length) lines.push('', 'preferred-tools: nothing to update - Cursor can be set up (asked next)');
    else if (!behind(out) && !out.errors.length) lines.push('', 'preferred-tools: everything current');
    else if (!behind(out)) lines.push('', 'preferred-tools: nothing behind among what could be checked');
    return lines.join('\n').replace(/^\n/, '');
}

