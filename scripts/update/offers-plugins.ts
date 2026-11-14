// The plugin offers: each installed plugin behind its marketplace's release.
import fs from 'node:fs';
import path from 'node:path';
import * as inventory from '../inventory/inventory.ts';
import { clone, compareVersions, pinnedVersion } from '../fix/common.ts';
import type { ServerEntry } from '../core/types.ts';
import type { PluginOffer, UpdateCheck, UpdateCtx } from './types.ts';

const { bareName } = inventory;

// ---- the pin, edited -------------------------------------------------------------------------------------------------

// The entry with `pkg`'s pin moved to `to` and its cut-off to `cutoff`. Only a cut-off the entry already carries moves: a
// user who removed it keeps it removed. null when the entry pins no version of `pkg`.
export function bumpEntry(entry: ServerEntry, packageName: string, to: string, cutoff: string): ServerEntry | null
{
    const from = pinnedVersion(entry, packageName);
    if (!from) return null;
    const bumped = clone(entry);
    let done = false;
    bumped.args = (bumped.args || []).map((argument, _index, _all) =>
    {
        if (!done && !argument.startsWith('-') && bareName(argument) === packageName && argument.endsWith(from)) { done = true; return argument.slice(0, argument.length - from.length) + to; }
        return argument;
    });
    const at = bumped.args.indexOf('--exclude-newer');
    if (at >= 0 && bumped.args[at + 1] !== undefined) bumped.args[at + 1] = cutoff;
    if (bumped.env && typeof bumped.env.npm_config_before === 'string') bumped.env.npm_config_before = cutoff;
    return pinnedVersion(bumped, packageName) === to ? bumped : null;
}

// ---- plugins ---------------------------------------------------------------------------------------------------------

// The version a marketplace lists for a plugin, from its clone: the plugin's own plugin.json when the entry points at a
// folder in the clone (that file wins over the entry), else the entry's `version`. null: not listed.
export function listedVersion(installLocation: string | null | undefined, pluginName: string): string | null
{
    if (!installLocation) return null;
    let file = installLocation;
    try { if (!fs.statSync(file).isFile()) file = path.join(installLocation, '.claude-plugin', 'marketplace.json'); } catch { return null; }
    let doc: { plugins?: { name: string; source?: unknown; version?: unknown }[]; metadata?: { pluginRoot?: string } };
    try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
    const entry = (doc.plugins || []).find((plugin) => plugin.name === pluginName);
    if (!entry) return null;
    const root = path.dirname(path.dirname(file));
    if (typeof entry.source === 'string')
    {
        const dir = path.resolve(root, (doc.metadata && doc.metadata.pluginRoot) || '', entry.source);
        try { const version = JSON.parse(fs.readFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), 'utf8')).version; if (version) return String(version); } catch { /* the entry's own */ }
    }
    return entry.version ? String(entry.version) : null;
}

export function pluginOffers(context: UpdateCtx, out: UpdateCheck): void
{
    const refreshed = new Map<string, string | null>();
    for (const plugin of context.inv.plugins)
    {
        if (!refreshed.has(plugin.marketplace))
        {
            if (!context.refresh) refreshed.set(plugin.marketplace, null);
            else
            {
                const result = context.runCli(['plugin', 'marketplace', 'update', plugin.marketplace], { cwd: context.project, env: context.env });
                refreshed.set(plugin.marketplace, !result.error && result.status === 0 ? null : `marketplace ${plugin.marketplace} did not refresh (${`${result.stderr}${result.stdout}`.trim().split('\n').slice(-1)[0] || 'no output'}) - compared against its last clone`);
            }
            if (refreshed.get(plugin.marketplace)) out.notes.push(refreshed.get(plugin.marketplace)!);
        }
        const market = context.inv.marketplaces.find((marketplace) => marketplace.name === plugin.marketplace);
        const to = listedVersion(market && market.installLocation, plugin.plugin);
        const base: Omit<PluginOffer, 'to'> = { kind: 'plugin', id: `plugin:${plugin.id}~${plugin.scope}`, plugin: plugin.id, scope: plugin.scope, from: plugin.version || null, group: plugin.rowId ? 'catalog' : 'other', label: `${plugin.id} (${plugin.scope})` };
        if (!market) { out.skipped.push(`${plugin.id} (${plugin.scope}): its marketplace '${plugin.marketplace}' is not registered, so nothing to compare against`); continue; }
        if (to === null) { out.unchecked.push({ ...base, to: null }); continue; }
        const comparison = compareVersions(plugin.version || '', to);
        const behind = comparison === null ? plugin.version !== to : comparison === -1;
        if (behind) out.offers.push({ ...base, to });
    }
}

