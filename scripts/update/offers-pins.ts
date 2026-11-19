// The pin offers: each pinned MCP server behind a release at least 7 days old.
import * as inventory from '../inventory/inventory.ts';
import * as registryLib from '../catalog/registry.ts';
import { mcpRemotePackage, signInParts } from '../entries/sign-in.ts';
import { FAMILIES } from '../roots/roots.ts';
import { pinnedVersion } from '../inventory/fingerprint.ts';
import { bumpEntry } from './offers-plugins.ts';
import * as kept from '../core/kept.ts';
import * as keys from '../keys/keys.ts';
import { errorMessage } from '../core/guards.ts';
import type { Release } from '../catalog/types.ts';
import type { UpdateCheck, UpdateCtx } from './types.ts';

// ---- MCP pins --------------------------------------------------------------------------------------------------------

export async function mcpOffers(context: UpdateCtx, out: UpdateCheck): Promise<void>
{
    const cache = new Map<string, Promise<Release[]>>();
    const latest = (registry: string, name: string) =>
    {
        const key = `${registry}:${name}`;
        const cached = cache.get(key);
        if (cached) return cached;
        const looked = context.registry.versionsOf(registry, name);
        cache.set(key, looked);
        return looked;
    };
    for (const registration of context.inventory.registrations)
    {
        if (registration.own || registration.alfredRetired) continue;
        if (registration.choice === 'own') { out.skipped.push(`${registration.name} (${registration.scope}): on its own - not checked`); continue; }
        if (registration.scope === 'inherited') { out.skipped.push(`${registration.name} (inherited): inherited from ${registration.from ? inventory.fromHere(context.inventory, registration.from) : 'a parent folder'} - update it there`); continue; }
        // a registration not left on its own matched a catalog row and one of its routes (inventory.ts matchEntry)
        const row = registration.rowId ? context.catalog.byId.get(registration.rowId) : undefined;
        const routeDefinition = row && registration.route ? row.routes[registration.route] : undefined;
        if (!routeDefinition) continue;
        const at = `${registration.name} (${registration.scope})`;
        // the shared sign-in form (0.5.0, D5) runs mcp-remote at a pin, the bridge route's package
        const signIn = registration.route === 'remote' && signInParts(registration.entry);
        if (registration.route === 'remote' && !signIn) { out.skipped.push(`${at}: a hosted URL has no pin`); continue; }
        if (routeDefinition.runtime === 'docker') { out.skipped.push(`${at}: the Docker image tag is not checked - change it with /alfred-tools:configure`); continue; }
        const packageSpec = signIn ? mcpRemotePackage(context.catalog) : routeDefinition.package;
        if (!packageSpec) continue;
        const from = pinnedVersion(registration.entry, packageSpec.name);
        if (!from) { out.skipped.push(`${at}: ${packageSpec.name} is launched with no version, so it follows the registry already`); continue; }
        let versions: Release[];
        try { versions = await latest(packageSpec.registry, packageSpec.name); }
        catch (caught) { out.errors.push(`${at}: ${packageSpec.registry} lookup for ${packageSpec.name} failed - ${errorMessage(caught)}`); continue; }
        const pick = registryLib.choose(versions, { registry: packageSpec.registry, now: context.now, current: from });
        if (pick.held.length) out.held.push(`${at}: ${registryLib.heldLine(packageSpec.name, pick.held)}`);
        if (!pick.offer) continue;
        const bumped = bumpEntry(registration.entry, packageSpec.name, pick.offer.version, registryLib.cutoffOf(context.now));
        // a key name the new pin reads in place of the old one goes with the pin, in the same rewrite (spec D2)
        const entry = bumped ? keys.renameSinceEnv(bumped, routeDefinition, pick.offer.version) : null;
        if (!entry) { out.errors.push(`${at}: could not move the pin of ${packageSpec.name} in the registration as it is written - change it with /alfred-tools:configure`); continue; }
        out.offers.push({ kind: 'mcp', id: `mcp:${registration.name}~${registration.scope}`, name: registration.name, scope: registration.scope, row: registration.rowId, route: registration.route, package: packageSpec.name, from, to: pick.offer.version, ageDays: pick.offer.ageDays, cutoff: registryLib.cutoffOf(context.now), old: registration.entry, entry, group: 'mcp', label: `${registration.name} (${registration.scope})` });
    }
}

// Cursor's bridge copy of a two-form entry (D5): its mcp-remote pin, which mcpOffers never sees (Claude Code's side is a
// hosted URL). One offer per list server with a cursorEntry, from Cursor's copy as read; a copy that is missing or drifted
// from the list is named and left to fix.
export async function cursorPinOffers(context: UpdateCtx, out: UpdateCheck): Promise<void>
{
    const packageSpec = mcpRemotePackage(context.catalog);
    let versions: Release[] | null = null;
    for (const family of FAMILIES)
    {
        const list = context.inventory.lists && context.inventory.lists[family];
        if (!list || list.note || list.old) continue;
        const seen = context.inventory.cursor ? context.inventory.cursor[family] : undefined;
        for (const server of list.servers || [])
        {
            if (!server.cursorEntry || !(server.clients || []).includes('cursor')) continue;
            const at = `${server.name} (${server.scope})`;
            const copy = seen ? seen.entries[server.name] : undefined;
            if (!seen || !copy) { out.skipped.push(`${at}: Cursor's copy is not in ${seen ? seen.file : `Cursor's ${family} file`} - not checked; /alfred-tools:fix settles it`); continue; }
            const row = server.row ? context.catalog.byId.get(server.row) : undefined;
            if (JSON.stringify(copy) !== JSON.stringify(kept.maskCredentials(server.cursorEntry, row))) { out.skipped.push(`${at}: Cursor's copy in ${seen.file} differs from the list - not checked; /alfred-tools:fix settles it`); continue; }
            const from = pinnedVersion(server.cursorEntry, packageSpec.name);
            if (!from) continue;
            if (!versions)
            {
                try { versions = await context.registry.versionsOf(packageSpec.registry, packageSpec.name); }
                catch (caught) { out.errors.push(`${at} in Cursor: ${packageSpec.registry} lookup for ${packageSpec.name} failed - ${errorMessage(caught)}`); return; }
            }
            const pick = registryLib.choose(versions, { registry: packageSpec.registry, now: context.now, current: from });
            if (pick.held.length) out.held.push(`${at} in Cursor: ${registryLib.heldLine(packageSpec.name, pick.held)}`);
            if (!pick.offer) continue;
            const entry = bumpEntry(server.cursorEntry, packageSpec.name, pick.offer.version, registryLib.cutoffOf(context.now));
            if (!entry) continue;
            out.offers.push({ kind: 'cursor-pin', id: `cursor-pin:${server.name}~${server.scope}`, name: server.name, scope: server.scope, row: server.row, family, list: list.file, file: seen.file, server: server, package: packageSpec.name, from, to: pick.offer.version, ageDays: pick.offer.ageDays, cutoff: registryLib.cutoffOf(context.now), old: server.cursorEntry, entry, group: 'mcp', label: `${server.name} (${server.scope}, Cursor)` });
        }
    }
}

