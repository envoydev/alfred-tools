// Applying the picked offers: plugins, pins, files and the new ways to pass data.
import fs from 'node:fs';
import path from 'node:path';
import * as inventory from '../inventory/inventory.ts';
import { fetchStep } from '../entries/names.ts';
import * as fetchLib from '../apply/fetch.ts';
import { apply } from '../apply/run.ts';
import { pinnedVersion } from '../inventory/fingerprint.ts';
import * as mcpOrder from '../mcps-list/mcp-order.ts';
import { reapproveLine } from '../plan/cursor-steps.ts';
import { repairTail } from '../plan/repair-tail.ts';
import * as account from '../core/account.ts';
import * as keys from '../keys/keys.ts';
import { bumpEntry } from './offers-plugins.ts';
import { upgradeCatalog } from './offers-files.ts';
import { ordered } from './check.ts';
import { signInLine, signInMoves } from './sign-in-moves.ts';
import { readCursor } from '../cursor/cursor-mcp.ts';
import * as roots from '../roots/roots.ts';
import { ensureCommonjs } from '../apply/file-steps.ts';
import * as fixLib from '../fix/fix.ts';
import { plan } from '../plan/plan.ts';
import * as declines from '../core/declines.ts';
import { errorMessage } from '../core/guards.ts';
import { makeTempDir } from '../core/tmpdir.ts';
import type { Declined } from '../core/types.ts';
import type { Log } from '../apply/types.ts';
import type { ListWriteStep, McpReplaceStep, PlanStep } from '../plan/types.ts';
import type { ApplyCtx, CursorOffer, CursorPinOffer, FileOffer, McpOffer, Offer, PluginOffer, UpdateCheck, UpdateCtx, UpdateRun, UpgradeOffer } from './types.ts';
import type { JobStep } from '../apply/types.ts';

// ---- apply -----------------------------------------------------------------------------------------------------------

function updatePlugin(context: UpdateCtx, offer: PluginOffer, log: Log): boolean
{
    const result = context.runCli(['plugin', 'update', offer.plugin, '--scope', offer.scope], { cwd: context.project, env: context.env });
    if (result.error || result.status !== 0) { log(`FAILED ${offer.label}: claude plugin update failed - ${`${result.stderr}${result.stdout}`.trim().split('\n').slice(-1)[0]}`); return false; }
    const after = inventory.buildInventory({ project: context.project, env: context.env, run: context.runCli }).plugins.find((plugin) => plugin.id === offer.plugin && plugin.scope === offer.scope);
    const installedVersion = after ? after.version : null;
    if (offer.to === null) log(`ok     ${offer.label}: ${offer.from || '?'} -> ${installedVersion || '?'}${installedVersion === offer.from ? ' (already the latest)' : ''}`);
    else log(`${installedVersion === offer.to ? 'ok    ' : 'CHECK '} ${offer.label}: ${offer.from || '?'} -> ${installedVersion || '?'} (read back from the plugin list)`);
    return offer.to === null || installedVersion === offer.to;
}

function updateMcp(context: ApplyCtx, offer: McpOffer, tmp: string, log: Log): boolean
{
    // a new way to pass data rewrote it earlier in this run: the pin moves on the registration as it is now - a change
    // starts from what is installed
    if (context.touched.has(`${offer.name}~${offer.scope}`))
    {
        const now = inventory.buildInventory({ project: context.project, env: context.env, run: context.runCli, data: context.data, catalog: context.catalog }).registrations.find((registration) => registration.name === offer.name && registration.scope === offer.scope);
        const route = offer.row && offer.route ? context.catalog.byId.get(offer.row)?.routes[offer.route] : undefined;
        const bumped = now ? bumpEntry(now.entry, offer.package, offer.to, offer.cutoff) : null;
        const entry = bumped ? keys.renameSinceEnv(bumped, route, offer.to) : null;
        if (!now || !entry) { log(`CHECK  ${offer.label}: rewritten earlier in this run and no longer pins ${offer.package} - left`); return false; }
        offer = { ...offer, old: now.entry, entry };
    }
    // the new pin is not in the cache yet: fetch it right after the rewrite (entries/names.ts fetchStep)
    const fetch = fetchStep(offer.name, offer.entry, offer.row, offer.old);
    const replace: McpReplaceStep = { op: 'mcp-replace', name: offer.name, scope: offer.scope, old: offer.old, entry: offer.entry, row: offer.row, route: offer.route, why: `${offer.package} ${offer.from} -> ${offer.to}` };
    // the list and Cursor take the registration as read back, in the same run (spec D9 Update 2), from the lists as they
    // stand now - an earlier step of this run may have written them
    const notes: string[] = [];
    const now = inventory.buildInventory({ project: context.project, env: context.env, run: context.runCli, data: context.data, catalog: context.catalog });
    const tail = repairTail(now, { platform: now.os, project: context.project, home: account.homeDir(context.env), env: context.env, catalog: context.catalog, notes }, [replace]);
    for (const note of notes) log(`note   ${note}`);
    const plan = { project: context.project, alfredCodeEnabled: Boolean(context.inventory && context.inventory.alfredCodeEnabled), steps: mcpOrder.withOrderStep([replace, ...(fetch ? [fetch] : []), ...tail], context.project, mcpOrder.ownProjectNames(context.inventory || {})), expect: [{ kind: 'mcp', name: offer.name, scope: offer.scope, route: offer.route }] };
    const report = apply(plan, { env: context.env, tmp, runCli: context.runCli, fetchFile: false, log: (...parts: string[]) => log(parts.join(' ')) });
    if (report.fetch && report.fetch.fetch.length) context.fetches.push(report.fetch);
    if (report.failed) return false;
    const again = tail.flatMap((step) => ('reapprove' in step && step.reapprove) || []);
    if (again.length) context.reapprove.push(...again);
    const got = inventory.buildInventory({ project: context.project, env: context.env, run: context.runCli }).registrations.find((registration) => registration.name === offer.name && registration.scope === offer.scope);
    const pin = got ? pinnedVersion(got.entry, offer.package) : null;
    log(`${pin === offer.to ? 'ok    ' : 'CHECK '} ${offer.label}: ${offer.package} ${offer.from} -> ${pin || '?'} (read back from the file the CLI wrote), cut-off ${offer.cutoff}`);
    return pin === offer.to;
}

// Cursor's bridge copy with its pin moved: the list's cursorEntry and Cursor's file, read back. No claude call - Claude
// Code's entry is a hosted URL with its helper.
function updateCursorPin(context: UpdateCtx, offer: CursorPinOffer, tmp: string, log: Log): boolean
{
    const scopes = offer.family === 'global' ? ['user'] : ['local', 'project'];
    const familyList = context.inventory.lists ? context.inventory.lists[offer.family] : null;
    const before = ((familyList && familyList.servers) || []).filter((server) => (server.clients || []).includes('cursor')).map((server) => server.name);
    const steps: PlanStep[] = [
        { op: 'list-write', file: offer.list, family: offer.family, upserts: [{ server: { ...offer.server, cursorEntry: offer.entry }, after: null, cursorFile: offer.file }], drops: [], own: null, why: `${offer.list}: Cursor's copy of ${offer.name} at ${offer.package} ${offer.to}` },
        { op: 'cursor-write', file: offer.file, family: offer.family, lists: [{ file: offer.list, scopes }], before, skip: [], replace: [], why: `${offer.file}: ${offer.name} at ${offer.package} ${offer.to}` },
    ];
    const report = apply({ project: context.project, steps }, { env: context.env, tmp, runCli: context.runCli, fetchFile: false, log: (...parts: string[]) => log(parts.join(' ')) });
    if (report.failed) return false;
    const got = readCursor(offer.file);
    const pin = got.state === 'ok' ? pinnedVersion(got.servers[offer.name] || {}, offer.package) : null;
    log(`${pin === offer.to ? 'ok    ' : 'CHECK '} ${offer.label}: ${offer.package} ${offer.from} -> ${pin || '?'} (read back from ${offer.file}), cut-off ${offer.cutoff}`);
    return pin === offer.to;
}

// A helper or bridge copy rewritten with this plugin's, if it is still the lower one the check offered; read back. The
// root's package.json says CommonJS when it has none (apply.ts ensureCommonjs).
function updateHelper(offer: FileOffer, log: Log): boolean
{
    const kind = offer.kind === 'bridge' ? 'bridge' : offer.kind === 'context' ? 'serenaContext' : 'helper';
    const before = roots.shippedState(kind, offer.file);
    if (before.state !== 'lower') { log(`CHECK  ${offer.label}: now ${before.state} - left as it is`); return false; }
    try { fs.writeFileSync(offer.file, roots.shippedSource(kind)); }
    catch (caught) { log(`FAILED ${offer.label}: ${caught instanceof Error ? caught.message : String(caught)}`); return false; }
    // a YAML file needs no package.json
    const note = kind === 'serenaContext' ? null : ensureCommonjs(path.dirname(offer.file)).note;
    if (note) log(`note   ${note}`);
    const ok = roots.shippedState(kind, offer.file).state === 'same';
    log(`${ok ? 'ok    ' : 'CHECK '} ${offer.label}: ${kind} ${offer.from} -> ${offer.to} (read back)`);
    return ok;
}

// A new way to pass data, applied with fix's own code to the registration as it is now, and read back by its detector.
// It runs before the pins: its health check then reads a launch already in the cache, and a pin moved after it starts
// from what it wrote. One an earlier step already did (a rewrite puts .mcp.json in order) is done. Its launches join
// this run's fetch file.
function updateUpgrade(context: ApplyCtx, offer: UpgradeOffer, dir: string, log: Log): boolean
{
    const projectInventory = inventory.buildInventory({ project: context.project, env: context.env, run: context.runCli, data: context.data, catalog: context.catalog });
    const fixContext = fixLib.makeCtx({ inventory: projectInventory, catalog: upgradeCatalog(context.catalog), env: context.env, machine: context.machine, data: context.data });
    const result = fixLib.applyFixes(fixContext, [offer.fix], { only: offer.name, name: offer.name, scope: offer.scope || undefined, tmp: dir, log, runCli: context.runCli, fetchFile: false, quietRecheck: true });
    if (result.fetch && result.fetch.fetch.length) context.fetches.push(result.fetch);
    for (const finding of result.applied.filter((candidate) => candidate.kind === 'registration')) { context.restart = true; context.touched.add(`${finding.name}~${finding.scope}`); }
    // a plugin taken out leaves the session's plugins as they were until it reloads
    if (result.applied.some((finding) => finding.id === 'retired-plugin')) context.restart = true;
    const ok = !result.failed && !result.remaining.length && (result.applied.length > 0 || result.gone);
    log(`${ok ? 'ok    ' : 'CHECK '} ${offer.label}: ${offer.fix} (${result.gone ? 'already done by an earlier step in this run' : 'read back by its detector'})`);
    return ok;
}

// Update's Cursor offer, answered (spec D9). 'declined' keeps 'Not now' in the root's list; 'set' is configure's apps
// change for each server, through the plan's own list, Cursor and file steps. A name Cursor's file already holds is
// replaced or kept on its `cursor-name:<name>@<file>` answer; with none it stays Claude Code only and is named.
function applyCursorOffer(context: ApplyCtx, cursorOffer: CursorOffer, answer: string, input: Record<string, string>, dir: string, log: Log): boolean
{
    const say = (...parts: string[]) => log(parts.join(' '));
    if (answer === 'declined')
    {
        const step: ListWriteStep = { op: 'list-write', file: cursorOffer.list, family: cursorOffer.family, upserts: [], drops: [], own: null, cursorOffer: 'declined', why: `${cursorOffer.list}: Cursor is not offered again for ${cursorOffer.root}` };
        const declinedResult = apply({ project: context.project, steps: [step] }, { env: context.env, tmp: dir, runCli: context.runCli, fetchFile: false, log: say });
        log(`${declinedResult.failed ? 'FAILED' : 'ok    '} ${cursorOffer.id}: not now - kept in ${cursorOffer.list}`);
        return !declinedResult.failed;
    }
    const projectInventory = inventory.buildInventory({ project: context.project, env: context.env, run: context.runCli, data: context.data, catalog: context.catalog });
    const change = Object.fromEntries(cursorOffer.servers.map((server) => [`mcp:${server.name}~${server.scope}`, { clients: ['claude', 'cursor'] }]));
    const cursorNames: Record<string, string> = {};
    for (const takenEntry of cursorOffer.taken)
    {
        const given = input[`cursor-name:${takenEntry.name}@${takenEntry.file}`];
        cursorNames[`${takenEntry.name}@${takenEntry.file}`] = given === 'replace' ? 'replace' : 'keep';
        if (given !== 'replace' && given !== 'keep') log(`${takenEntry.name}: Cursor's ${takenEntry.file} already has its own ${takenEntry.name} - left; run /alfred-tools:configure to choose`);
    }
    const builtPlan = plan(projectInventory, { change, cursorNames }, { home: account.homeDir(context.env), env: context.env, catalog: context.catalog });
    if (builtPlan.errors.length) { log(`FAILED ${cursorOffer.id}: ${builtPlan.errors.join('; ')}`); return false; }
    const result = apply(builtPlan, { env: context.env, tmp: dir, runCli: context.runCli, fetchFile: false, log: say });
    // the plan's notes and its fetch are the built plan's to hand on: a server moved onto the shared sign-in needs both
    for (const note of builtPlan.notes) log(`note   ${note}`);
    if (result.fetch && result.fetch.fetch.length) context.fetches.push(result.fetch);
    log(`${result.failed ? 'FAILED' : 'ok    '} ${cursorOffer.id}: set up for Cursor too`);
    if (!result.failed) for (const move of signInMoves(builtPlan.oauth, cursorOffer.signIns, builtPlan.os)) log(signInLine(move));
    return !result.failed;
}

// One picked offer, by its kind. -> whether it read back as done
function applyOffer(context: ApplyCtx, offer: Offer, dir: string, log: Log): boolean
{
    switch (offer.kind)
    {
        case 'plugin': return updatePlugin(context, offer, log);
        case 'helper': case 'bridge': case 'context': return updateHelper(offer, log);
        case 'upgrade': return updateUpgrade(context, offer, dir, log);
        case 'cursor-pin': return updateCursorPin(context, offer, dir, log);
        case 'mcp': return updateMcp(context, offer, dir, log);
    }
}

// -> { applied: [id], failed: [id], unknown: [id], fetchFile }
export function applyUpdates(context: UpdateCtx, ids: string[], out: UpdateCheck, { tmp, log = console.log, input = {} }: { tmp?: string | undefined; log?: Log; input?: Record<string, string> } = {}): UpdateRun
{
    const result: UpdateRun = { applied: [], failed: [], unknown: [], fetchFile: null, dir: null };
    // the uninstall offers turned down (spec D9): shown and left unpicked, or kept out of 'All of them' for alfred-code
    let turnedDown: Declined[];
    try { turnedDown = declines.parse(input['retired-declined']); }
    catch (caught) { log(`FAILED ${errorMessage(caught)}`); result.failed.push('retired-declined'); return result; }
    const known = [...out.offers, ...out.unchecked];
    const named = ids.filter((pickedId) => pickedId !== 'all' && pickedId !== 'none');
    let everything: Offer[] = [];
    if (ids.includes('all'))
    {
        // where alfred-code is set up, an old plugin's uninstall is reached only by its own pick
        const kept = out.offers.filter((offer) => offer.alfred && !named.includes(offer.id));
        for (const offer of kept) log(`${offer.name} kept - alfred-code installs it; fix lists it`);
        everything = out.offers.filter((offer) => !kept.includes(offer));
    }
    if (turnedDown.length) log(declines.add(context.data, turnedDown).detail);
    const picked = ids.includes('all') ? [...everything, ...named.map((pickedId) => known.find((offer) => offer.id === pickedId)).filter((offer): offer is Offer => offer !== undefined && !everything.includes(offer))] : named.map((pickedId) => known.find((offer) => offer.id === pickedId) || pickedId);
    // the new ways to pass data first - list-import, a registration's, then a file's or folder's - and the pins after
    // them (updateUpgrade)
    const chosen = ordered(picked, context.catalog);
    const dir = tmp || makeTempDir();
    result.dir = dir;
    const applying: ApplyCtx = { ...context, fetches: [], restart: false, touched: new Set(), reapprove: [] };
    for (const choice of chosen)
    {
        if (typeof choice === 'string') { result.unknown.push(choice); log(`NOT OFFERED ${choice}: nothing is behind under that id`); continue; }
        const ok = applyOffer(applying, choice, dir, log);
        (ok ? result.applied : result.failed).push(choice.id);
    }
    // Cursor's offer, after the pins (spec D9): 'Set them up' or 'Not now' as answered; no answer writes nothing
    for (const cursorOffer of out.cursorOffers || [])
    {
        const answer = input[cursorOffer.id];
        if (answer === undefined) continue;
        if (cursorOffer.needs && !result.applied.includes(cursorOffer.needs)) { log(`NOT OFFERED ${cursorOffer.id}: its servers join the list through ${cursorOffer.needs}, which was not picked - run /alfred-tools:update again`); continue; }
        const ok = answer === 'set' || answer === 'declined' ? applyCursorOffer(applying, cursorOffer, answer, input, dir, log) : (log(`FAILED ${cursorOffer.id}: '${answer}' is not set or declined`), false);
        (ok ? result.applied : result.failed).push(cursorOffer.id);
    }
    // the folders moved (spec D3): the command checks again and offers the rest
    if (chosen.some((choice) => typeof choice !== 'string' && choice.kind === 'upgrade' && ['root-move', 'root-repoint'].includes(choice.fix) && result.applied.includes(choice.id))) log('', 'RECHECK - the folders moved; checking again');
    // Cursor asks to approve a changed entry again (spec Risks)
    if (applying.reapprove.length) log('', reapproveLine([...new Set(applying.reapprove)]));
    // every rewritten server in one fetch file, for fetch.ts in the background (apply.ts says why); a server rewritten
    // twice in this run is fetched once at its scope, as it was written last
    const last = new Map<string, JobStep>();
    for (const jobStep of applying.fetches.flatMap((fetchJob) => fetchJob.fetch)) { last.delete(`${jobStep.name}~${jobStep.scope}`); last.set(`${jobStep.name}~${jobStep.scope}`, jobStep); }
    const job = fetchLib.fetchJob(context.project, [...last.values()], [...new Set(applying.fetches.flatMap((fetchJob) => fetchJob.check))]);
    if (job.fetch.length)
    {
        result.fetchFile = fetchLib.writeJob(path.join(dir, 'fetch.json'), job);
        log('', ...fetchLib.nextLines(result.fetchFile, job));
    }
    // a helper runs at each connect: rewriting one needs no restart; a new way to pass data needs one when it rewrote a
    // registration (a .gitignore or the .mcp.json order changes nothing a session started)
    if (result.applied.some((id) => !id.startsWith('helper:') && !id.startsWith('upgrade:')) || applying.restart) log('', `Restart Claude Code (or run /reload-plugins for plugins) so the updated servers and plugins load${result.fetchFile ? ' - after the fetch reports' : ''}.`);
    return result;
}

