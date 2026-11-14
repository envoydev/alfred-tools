'use strict';
// The pin offers: each pinned MCP server behind a release at least 7 days old.
const inventory = require('../inventory/inventory.js');
const registryLib = require('../catalog/registry.js');
const { signInParts } = require('../entries/sign-in.js');
const { pinnedVersion } = require('../fix/common.js');
const { bumpEntry } = require('./offers-plugins.js');

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
        const signIn = r.route === 'remote' && signInParts(r.entry);
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
    const kept = require('../core/kept.js');
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

module.exports = { mcpOffers, cursorPinOffers };
