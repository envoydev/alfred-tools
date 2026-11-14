// @ts-nocheck - typed in Task 12
// The plugin offers: each installed plugin behind its marketplace's release.
import fs from 'node:fs';
import path from 'node:path';
import * as inventory from '../inventory/inventory.ts';
import { clone, compareVersions, pinnedVersion } from '../fix/common.ts';

const { bareName } = inventory;

// ---- the pin, edited -------------------------------------------------------------------------------------------------

// The entry with `pkg`'s pin moved to `to` and its cut-off to `cutoff`. Only a cut-off the entry already carries moves: a
// user who removed it keeps it removed. null when the entry pins no version of `pkg`.
export function bumpEntry(entry, pkg, to, cutoff)
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
export function listedVersion(installLocation, pluginName)
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

export function pluginOffers(ctx, out)
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

