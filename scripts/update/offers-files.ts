// The file offers: the helper, bridge and serena-context copies behind the plugin's own.
import { pathFor } from '../entries/platform.ts';
import { contextArgAt, bridgeParts } from '../entries/entry.ts';
import * as roots from '../roots/roots.ts';
import { HELPER_VERSION } from '../copied/mcp-headers.js';
import { BRIDGE_VERSION } from '../copied/mcp-bridge.js';
import { homeDir } from '../core/account.ts';
import * as fixLib from '../fix/fix.ts';
import type { Catalog } from '../catalog/types.ts';
import type { ShippedKind } from '../roots/types.ts';
import type { Finding } from '../fix/types.ts';
import type { UpdateCheck, UpdateCtx } from './types.ts';

// ---- key helpers (spec D7, R10) ---------------------------------------------------------------------------------------

// Each mcp-headers.js a managed registration names, or a root in use holds, with a lower number than this plugin's is
// offered; a hand edit or a newer copy is left to /preferred-tools:fix, with a note.
export function helperOffers(context: UpdateCtx, out: UpdateCheck): void
{
    const pathApi = pathFor(context.inv.os);
    const rootContext = { project: context.project, home: homeDir(context.env), platform: context.inv.os, catalog: context.catalog };
    const dirs = new Set((['project', 'global'] as const).map((family) => context.inv.roots && context.inv.roots[family] && context.inv.roots[family].path).filter(Boolean) as string[]);
    const bridgeDirs = new Set<string>();
    const contextDirs = new Set<string>();
    for (const registration of context.inv.registrations || [])
    {
        if (!registration.rowId || registration.own || registration.alfredRetired || registration.choice === 'own' || registration.scope === 'inherited') continue;
        // serena's context file (0.5.0, D7), where the entry names this plugin's
        const at = contextArgAt(registration.entry);
        if (at >= 0) contextDirs.add(pathApi.dirname(roots.absOf(registration.entry.args![at], rootContext)));
        const named = roots.helperPathOf(registration.entry && registration.entry.headersHelper);
        if (named) dirs.add(pathApi.dirname(roots.absOf(named, rootContext)));
        // a bridge's folder holds its bridge and the helper it requires (0.4.0)
        const bridge = bridgeParts(registration.entry);
        if (bridge) bridgeDirs.add(pathApi.dirname(roots.absOf(bridge.path, rootContext)));
    }
    for (const root of bridgeDirs) dirs.add(root);
    const offer = (kind: ShippedKind, root: string, version: number) =>
    {
        const name = roots.FILES[kind];
        const file = pathApi.join(root, name);
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
export const upgradeCatalog = (catalog: Catalog): Catalog => ({ ...catalog, fixes: catalog.fixes.filter((fixRow) => fixRow.upgrade) });
const upgradeLabel = (finding: Finding) => (finding.kind === 'registration' ? `${finding.name} (${finding.scope})` : finding.name);

export function upgradeOffers(context: UpdateCtx, out: UpdateCheck): void
{
    const catalog = upgradeCatalog(context.catalog);
    if (!catalog.fixes.length) return;
    const fctx = fixLib.makeCtx({ inv: context.inv, catalog, env: context.env, machine: context.machine, data: context.data });
    for (const finding of fixLib.detectAll(fctx).found)
    {
        // an uninstall the user turned down is theirs to keep: no offer, no note, nothing waiting (spec D9)
        if (finding.declined) continue;
        if (finding.id === 'retired-plugin')
        {
            // one offer per id and scope, so picking one uninstalls only that scope; where alfred-code is set up it is
            // named and kept out of 'All of them'
            out.offers.push({ kind: 'upgrade', id: `upgrade:retired-plugin:${finding.name}~${finding.scope}`, fix: finding.id, fixKind: finding.kind, name: finding.name, scope: finding.scope, found: finding.found, group: 'upgrade', label: finding.alfred ? `${finding.name} - alfred-code also installs it, and this removes it for both` : `${finding.name} (${finding.scope})`, alfred: finding.alfred });
            continue;
        }
        const label = upgradeLabel(finding);
        if (finding.blocked || finding.input)
        {
            const why = finding.blocked || `needs a folder from you (${finding.input!.prompt})`;
            out.notes.push(`${label}: ${finding.found} - not applied here: ${why}${/\/preferred-tools:fix/.test(why) ? '' : '; then run /preferred-tools:fix'}`);
            out.waiting += 1;
            continue;
        }
        const machine = finding.kind !== 'registration';
        // list-import also names its family, its list and the servers it brings in, for the Cursor offer below
        const imports = finding.id === 'list-import' ? { family: finding.family, listFile: finding.name, servers: finding.servers } : {};
        out.offers.push({ kind: 'upgrade', id: `upgrade:${finding.id}:${machine ? finding.name : `${finding.name}~${finding.scope}`}`, fix: finding.id, fixKind: finding.kind, name: finding.name, scope: machine ? null : finding.scope, found: finding.found, group: 'upgrade', label, ...imports });
    }
}

