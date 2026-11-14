'use strict';
// The file offers: the helper, bridge and serena-context copies behind the plugin's own.
const { pathFor } = require('../entries/platform.ts');
const { contextArgAt, bridgeParts } = require('../entries/entry.ts');

// ---- key helpers (spec D7, R10) ---------------------------------------------------------------------------------------

// Each mcp-headers.js a managed registration names, or a root in use holds, with a lower number than this plugin's is
// offered; a hand edit or a newer copy is left to /preferred-tools:fix, with a note.
function helperOffers(ctx, out)
{
    const roots = require('../roots/roots.ts');
    const { HELPER_VERSION } = require('../mcp-headers.js');
    const { BRIDGE_VERSION } = require('../mcp-bridge.js');
    const P = pathFor(ctx.inv.os);
    const rctx = { project: ctx.project, home: require('../core/account.ts').homeDir(ctx.env), platform: ctx.inv.os, catalog: ctx.catalog };
    const dirs = new Set(['project', 'global'].map((f) => ctx.inv.roots && ctx.inv.roots[f] && ctx.inv.roots[f].path).filter(Boolean));
    const bridgeDirs = new Set();
    const contextDirs = new Set();
    for (const r of ctx.inv.registrations || [])
    {
        if (!r.rowId || r.own || r.alfredRetired || r.choice === 'own' || r.scope === 'inherited') continue;
        // serena's context file (0.5.0, D7), where the entry names this plugin's
        const at = contextArgAt(r.entry);
        if (at >= 0) contextDirs.add(P.dirname(roots.absOf(r.entry.args[at], rctx)));
        const named = roots.helperPathOf(r.entry && r.entry.headersHelper);
        if (named) dirs.add(P.dirname(roots.absOf(named, rctx)));
        // a bridge's folder holds its bridge and the helper it requires (0.4.0)
        const bridge = bridgeParts(r.entry);
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
    const fixLib = require('../fix/fix.ts');
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

module.exports = { helperOffers, upgradeOffers, upgradeCatalog };
