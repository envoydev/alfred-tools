// @ts-nocheck - typed in Task 12
// Applying the picked offers: plugins, pins, files and the new ways to pass data.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as inventory from '../inventory/inventory.ts';
import { fetchStep } from '../entries/names.ts';
import * as fetchLib from '../apply/fetch.ts';
import { apply } from '../apply/run.ts';
import { pinnedVersion } from '../fix/common.ts';
import * as mcpOrder from '../mcps-list/mcp-order.ts';
import { reapproveLine } from '../plan/cursor-steps.ts';
import { repairTail } from '../plan/repair-tail.ts';
import * as account from '../core/account.ts';
import { bumpEntry } from './offers-plugins.ts';
import { upgradeCatalog } from './offers-files.ts';
import { ordered } from './check.ts';
import { readCursor } from '../cursor/cursor-mcp.ts';
import * as roots from '../roots/roots.ts';
import { ensureCommonjs } from '../apply/file-steps.ts';
import * as fixLib from '../fix/fix.ts';
import { plan } from '../plan/plan.ts';
import * as declines from '../core/declines.ts';

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
    const fetch = fetchStep(offer.name, offer.entry, offer.row, offer.old);
    const replace = { op: 'mcp-replace', name: offer.name, scope: offer.scope, old: offer.old, entry: offer.entry, row: offer.row, route: offer.route, why: `${offer.package} ${offer.from} -> ${offer.to}` };
    // the list and Cursor take the registration as read back, in the same run (spec D9 Update 2), from the lists as they
    // stand now - an earlier step of this run may have written them
    const notes = [];
    const now = inventory.buildInventory({ project: ctx.project, env: ctx.env, run: ctx.runCli, data: ctx.data, catalog: ctx.catalog });
    const tail = repairTail(now, { platform: now.os, project: ctx.project, home: account.homeDir(ctx.env), env: ctx.env, catalog: ctx.catalog, notes }, [replace]);
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
    const got = readCursor(offer.file);
    const pin = got.state === 'ok' ? pinnedVersion(got.doc.mcpServers[offer.name] || {}, offer.package) : null;
    log(`${pin === offer.to ? 'ok    ' : 'CHECK '} ${offer.label}: ${offer.package} ${offer.from} -> ${pin || '?'} (read back from ${offer.file}), cut-off ${offer.cutoff}`);
    return pin === offer.to;
}

// A helper or bridge copy rewritten with this plugin's, if it is still the lower one the check offered; read back. The
// root's package.json says CommonJS when it has none (apply.js ensureCommonjs).
function updateHelper(offer, log)
{
    const kind = offer.kind === 'bridge' ? 'bridge' : offer.kind === 'context' ? 'serenaContext' : 'helper';
    const before = roots.shippedState(kind, offer.file);
    if (before.state !== 'lower') { log(`CHECK  ${offer.label}: now ${before.state} - left as it is`); return false; }
    fs.writeFileSync(offer.file, roots.shippedSource(kind));
    // a YAML file needs no package.json
    const pkg = kind === 'serenaContext' ? {} : ensureCommonjs(path.dirname(offer.file));
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
export function applyUpdates(ctx, ids, out, { tmp, log = console.log, input = {} } = {})
{
    const res = { applied: [], failed: [], unknown: [], fetchFile: null, dir: null };
    // the uninstall offers turned down (spec D9): shown and left unpicked, or kept out of 'All of them' for alfred-code
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
    if (ctx.reapprove.length) log('', reapproveLine([...new Set(ctx.reapprove)]));
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

