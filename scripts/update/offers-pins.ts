// The pin offers: each pinned MCP server behind a release at least 7 days old.
import * as inventory from '../inventory/inventory.ts';
import * as registryLib from '../catalog/registry.ts';
import { signInParts } from '../entries/sign-in.ts';
import { pinnedVersion } from '../fix/common.ts';
import { bumpEntry } from './offers-plugins.ts';
import * as kept from '../core/kept.ts';
import type { Release } from '../catalog/types.ts';
import type { CursorOf } from '../cursor/types.ts';
import type { UpdateCheck, UpdateCtx } from './types.ts';

// ---- MCP pins --------------------------------------------------------------------------------------------------------

export async function mcpOffers(context: UpdateCtx, out: UpdateCheck): Promise<void>
{
    const cache = new Map<string, Promise<Release[]>>();
    const latest = (registry: string, name: string) =>
    {
        const key = `${registry}:${name}`;
        if (!cache.has(key)) cache.set(key, context.registry.versionsOf(registry, name));
        return cache.get(key)!;
    };
    for (const registration of context.inventory.registrations)
    {
        if (registration.own || registration.alfredRetired) continue;
        if (registration.choice === 'own') { out.skipped.push(`${registration.name} (${registration.scope}): on its own - not checked`); continue; }
        if (registration.scope === 'inherited') { out.skipped.push(`${registration.name} (inherited): inherited from ${inventory.fromHere(context.inventory, registration.from!)} - update it there`); continue; }
        const row = context.catalog.byId.get(registration.rowId!)!;
        const routeDefinition = row.routes[registration.route!]!;
        const at = `${registration.name} (${registration.scope})`;
        // the shared sign-in form (0.5.0, D5) runs mcp-remote at a pin, the bridge route's package
        const signIn = registration.route === 'remote' && signInParts(registration.entry);
        if (registration.route === 'remote' && !signIn) { out.skipped.push(`${at}: a hosted URL has no pin`); continue; }
        if (routeDefinition.runtime === 'docker') { out.skipped.push(`${at}: the Docker image tag is not checked - change it with /alfred-tools:configure`); continue; }
        const packageSpec = signIn ? context.catalog.byId.get('sentry')!.routes.bridge!.package : routeDefinition.package;
        if (!packageSpec) continue;
        const from = pinnedVersion(registration.entry, packageSpec.name);
        if (!from) { out.skipped.push(`${at}: ${packageSpec.name} is launched with no version, so it follows the registry already`); continue; }
        let versions: Release[];
        try { versions = await latest(packageSpec.registry, packageSpec.name); }
        catch (caught) { const error = caught as NodeJS.ErrnoException; out.errors.push(`${at}: ${packageSpec.registry} lookup for ${packageSpec.name} failed - ${error.message}`); continue; }
        const pick = registryLib.choose(versions, { registry: packageSpec.registry, now: context.now, current: from });
        if (pick.held.length) out.held.push(`${at}: ${registryLib.heldLine(packageSpec.name, pick.held)}`);
        if (!pick.offer) continue;
        const entry = bumpEntry(registration.entry, packageSpec.name, pick.offer.version, registryLib.cutoffOf(context.now));
        if (!entry) { out.errors.push(`${at}: could not move the pin of ${packageSpec.name} in the registration as it is written - change it with /alfred-tools:configure`); continue; }
        out.offers.push({ kind: 'mcp', id: `mcp:${registration.name}~${registration.scope}`, name: registration.name, scope: registration.scope, row: registration.rowId, route: registration.route, package: packageSpec.name, from, to: pick.offer.version, ageDays: pick.offer.ageDays, cutoff: registryLib.cutoffOf(context.now), old: registration.entry, entry, group: 'mcp', label: `${registration.name} (${registration.scope})` });
    }
}

// Cursor's bridge copy of a two-form entry (D5): its mcp-remote pin, which mcpOffers never sees (Claude Code's side is a
// hosted URL). One offer per list server with a cursorEntry, from Cursor's copy as read; a copy that is missing or drifted
// from the list is named and left to fix.
export async function cursorPinOffers(context: UpdateCtx, out: UpdateCheck): Promise<void>
{
    const packageSpec = context.catalog.byId.get('sentry')!.routes.bridge!.package!;
    let versions: Release[] | null = null;
    for (const family of ['project', 'global'] as const)
    {
        const list = context.inventory.lists && context.inventory.lists[family];
        if (!list || list.note || list.old) continue;
        const seen = (context.inventory.cursor && context.inventory.cursor[family]) || { entries: {} } as CursorOf;
        for (const server of list.servers || [])
        {
            if (!server.cursorEntry || !(server.clients || []).includes('cursor')) continue;
            const at = `${server.name} (${server.scope})`;
            const copy = seen.entries[server.name];
            if (!copy) { out.skipped.push(`${at}: Cursor's copy is not in ${seen.file} - not checked; /alfred-tools:fix settles it`); continue; }
            const row = context.catalog.byId.get(server.row!);
            if (JSON.stringify(copy) !== JSON.stringify(kept.maskCredentials(server.cursorEntry, row))) { out.skipped.push(`${at}: Cursor's copy in ${seen.file} differs from the list - not checked; /alfred-tools:fix settles it`); continue; }
            const from = pinnedVersion(server.cursorEntry, packageSpec.name);
            if (!from) continue;
            if (!versions)
            {
                try { versions = await context.registry.versionsOf(packageSpec.registry, packageSpec.name); }
                catch (caught) { const error = caught as NodeJS.ErrnoException; out.errors.push(`${at} in Cursor: ${packageSpec.registry} lookup for ${packageSpec.name} failed - ${error.message}`); return; }
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

