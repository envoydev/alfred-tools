// THE FIX ENGINE - known problems and their recorded fixes (catalog/fixes.json, detectors in scripts/fix/).
//
//   node fix.ts --detect [--only <fix id | tool | registration name>] [--json] [--project <dir>] [--data <dir>]
//   node fix.ts --questions [--project <dir>] [--data <dir>]   the asks, as data (the same --only narrows it)
//   node fix.ts --apply <id,id | all | none> [--only <x>] [--input key=value] [--project <dir>] [--tmp <dir>] [--data <dir>]
//   --input retired-declined=<id>~<scope>,...  the plugin uninstall offers turned down (spec D9), kept in --data
//
// --data: the plugin's data folder, whose roots map finds the records - a registration left on its own (spec D6) is
// not checked, and is listed once as such.
//
// A detector looks at the inventory and the machine and returns findings; a row that finds nothing is not shown. A
// registration fix edits the entry AS READ and is written through apply.ts (remove, then add-json, with a rollback), one
// replace per registration however many fixes it takes. A machine fix runs its command. Every fix is read back by running
// its detector again, and the restart line comes last - unless every fix applied was one a session does not need to restart
// for (a data folder's .gitignore). A finding with `blocked` is shown and never applied; a row with
// `hold` in the catalog is listed as held and never detected.
import fs from 'node:fs';
import path from 'node:path';
import { pathFor } from '../entries/platform.ts';
import * as catalogLib from '../catalog/catalog.ts';
import * as inventory from '../inventory/inventory.ts';
import * as account from '../core/account.ts';
import { apply } from '../apply/run.ts';
import * as cli from '../core/claude-cli.ts';
import { writeJob, fetchJob, nextLines } from '../apply/fetch.ts';
import { DETECTORS, FILE_STEPS, MACHINE_FIXES, REGISTRATION_FIXES, gates, helperStaleFix, machineOf, movedRoots, passesGate, repointDataMap, repointEntry, rootMoveFix } from './fix-functions.ts';
import { RestoreBlocked, waitsForDrift } from './key-to-launcher.ts';
import { clientDriftDetect } from './lists.ts';
import { realMachine, clone, fieldOf, isManaged } from './common.ts';
import { retiredServerSteps } from './retired-server.ts';
import { FIX_ID } from './constants.ts';
import { errorMessage } from '../core/guards.ts';
import { deepEqual } from '../core/json-file.ts';
import { makeTempDir } from '../core/tmpdir.ts';
import { useRoots, fileSteps } from '../plan/root-files.ts';
import { reconnectLine } from '../plan/render.ts';
import { helperNameOf, helperParts, contextArgAt } from '../entries/entry.ts';
import { launcherParts } from '../entries/launcher.ts';
import { fetchStep } from '../entries/names.ts';
import * as mcpOrder from '../mcps-list/mcp-order.ts';
import * as keys from '../keys/keys.ts';
import * as roots from '../roots/roots.ts';
import * as declines from '../core/declines.ts';
import { repairTail } from '../plan/repair-tail.ts';
import { retireContextSteps, rewritesOf } from '../plan/retire-context.ts';
import { writeMissingContext } from './context-move.ts';
import { driftQuestion } from '../plan/asks-other.ts';
import type { Declined, Env, ServerEntry } from '../core/types.ts';
import type { Catalog } from '../catalog/types.ts';
import type { Inventory } from '../inventory/types.ts';
import type { JobStep } from '../apply/types.ts';
import type { McpReplaceStep, PlanStep, Question, Reconnect, RootUse } from '../plan/types.ts';
import type { Roots } from '../entries/types.ts';
import type { Detected, DriftQuestion, Finding, FixCtx, FixOptions, FixQuestions, FixRun, MachineFixResult, MachineProbe } from './types.ts';

export function makeCtx({ inventory: projectInventory, catalog = catalogLib.load(), env = process.env, machine, platform, arch, data = null }: { inventory: Inventory; catalog?: Catalog; env?: Env; machine?: MachineProbe | undefined; platform?: string; arch?: string; data?: string | null }): FixCtx
{
    const resolvedPlatform = platform || projectInventory.os;
    return { inventory: projectInventory, catalog, platform: resolvedPlatform, arch: arch || projectInventory.arch, env, home: account.homeDir(env), rules: catalog.rules, machine: machine || realMachine({ env, platform: resolvedPlatform }), data };
}

// The function name a fix row gives for its fix.
const fixNameOf = (context: Pick<FixCtx, 'catalog'>, id: string): string | null => { const fixRow = context.catalog.fixes.find((candidate) => candidate.id === id); return (fixRow && fixRow.fix) || null; };

const matches = (finding: Finding, only: string | undefined) => !only || [finding.id, finding.row, finding.name].includes(only);

// Each rewritten hosted registration that sends a key through the helper: its name, and whether the hosted chain at its
// scope fills it (spec F3) - the same reconnect line the plan prints.
function reconnectOf(context: FixCtx, steps: McpReplaceStep[]): Pick<Reconnect, 'name' | 'variable' | 'file' | 'filled' | 'anonymous'>[]
{
    const resolvedRoots = roots.resolveRoots(context.inventory, null, { project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog }).roots;
    return steps.flatMap((step) =>
    {
        const variable = step.entry && helperNameOf(step.entry.headersHelper);
        if (!variable) return [];
        const row = step.row ? context.catalog.byId.get(step.row) : undefined;
        const route = row && step.route ? row.routes[step.route] : undefined;
        // the hosted chain always names a first file
        const [file = '', ...rest] = keys.hostedChain({ scope: step.scope, projectRoot: resolvedRoots.project, globalRoot: resolvedRoots.global, globalNamed: resolvedRoots.globalNamed, home: context.home, platform: context.platform });
        return [{ name: step.name, variable, file, filled: keys.filledNames([file, ...rest]).some((filledFile) => filledFile.names.includes(variable)), anonymous: Boolean(route) && route?.authMode === 'optional-token' && !route.keyless }];
    });
}

// A project or local helper runs only once its declaring folder's trust dialog is accepted (spec D4): until then the server
// connects without its key. Not a fix - nothing here can accept it. -> [line]
function trustNotes(context: FixCtx, only: string | undefined): string[]
{
    if (context.inventory.trusted !== false) return [];
    return (context.inventory.registrations || [])
        .filter((registration) => registration.rowId && isManaged(registration) && ['project', 'local'].includes(registration.scope) && registration.entry && registration.entry.headersHelper)
        .filter((registration) => !only || [registration.name, registration.rowId].includes(only))
        .map((registration) => `${registration.name} (${registration.scope}): accept the trust dialog the next time Claude Code starts in ${context.inventory.project} - until then the server connects without its key`);
}

// -> { found: [finding + { kind, symptom }], held: [{ id, why }], own: [{ name, scope }], notes: [line] } - `own`: the
// registrations left on their own (spec D6), which no detector reads
export function detectAll(context: FixCtx, { only }: { only?: string | undefined } = {}): Detected
{
    const own = (context.inventory.registrations || []).filter((registration) => registration.choice === 'own' && (!only || [registration.name, registration.rowId].includes(only)));
    const gate: Finding[] = [];
    const out: Detected = { found: [], held: [], own: own.map((registration) => ({ name: registration.name, scope: registration.scope })), notes: trustNotes(context, only) };
    for (const fix of context.catalog.fixes)
    {
        if (fix.hold) { out.held.push({ id: fix.id, why: fix.hold }); continue; }
        if (!fix.os.includes(context.platform)) continue;
        const detect = DETECTORS.get(fix.detect);
        if (!detect) throw new Error(`fix row ${fix.id}: no function ${fix.detect} in scripts/fix/`);
        // a file row plans its repair: one that is not advice names the function that does
        if (fix.kind === 'file' && !fix.advice && !(fix.steps && FILE_STEPS.has(fix.steps))) throw new Error(`fix row ${fix.id}: no steps function ${fix.steps} in scripts/fix/`);
        // an advice row has no fix: its finding is shown and never offered, whatever its detector returned
        const advice = (finding: Finding) => (fix.advice && !finding.blocked ? { blocked: 'advice only - nothing here is applied' } : {});
        for (const finding of detect(context))
        {
            const decorated = { ...finding, ...advice(finding), kind: fix.kind, symptom: fix.symptom, documented: fix.documented !== false };
            if (matches(finding, only)) out.found.push(decorated);
            // the move's own findings are read whatever `only` names: a narrowed run cannot pass the gate
            else if (passesGate(decorated) && fix.id !== 'retired-plugin') gate.push(decorated);
        }
    }
    const gating = [...out.found, ...gate].filter(gates);
    if (gating.length)
    {
        out.afterMove = out.found.filter((finding) => !passesGate(finding));
        out.found = [...out.found.filter(passesGate), ...gate];
    }
    return out;
}

const where = (finding: Finding): string => (finding.kind === 'registration' || finding.id === 'client-drift' ? `${finding.name} (${finding.scope})` : finding.name);

export function renderFixes(detected: Detected): string
{
    const lines: string[] = [];
    const { found, held } = detected;
    if (!found.length) lines.push('No known problem found.');
    else
    {
        lines.push(`Known problems found (${found.length}):`, '');
        const columnWidth = (cellText: (finding: Finding) => string) => Math.max(...found.map((finding) => cellText(finding).length));
        const idWidth = columnWidth((finding) => finding.id);
        const toolW = columnWidth(where);
        for (const finding of found)
        {
            const tail = finding.blocked ? ` - NOT APPLICABLE: ${finding.blocked}` : finding.input ? ` - needs a folder from you: ${finding.input.prompt}` : '';
            lines.push(`  ${finding.id.padEnd(idWidth)}  ${where(finding).padEnd(toolW)}  ${finding.found}${tail}`);
            if (finding.note) lines.push(`  ${' '.repeat(idWidth)}  ${' '.repeat(toolW)}  note: ${finding.note}`);
        }
    }
    const afterMove = detected.afterMove || [];
    if (afterMove.length) lines.push('', 'After the move (checked again once it is done):', ...afterMove.map((finding) => `  ${finding.id}  ${where(finding)}  ${finding.found}`));
    if ((detected.notes || []).length) lines.push('', ...detected.notes.map((note) => `note: ${note}`));
    for (const heldFix of held) lines.push('', `Held, not checked: ${heldFix.id} - ${heldFix.why}`);
    if ((detected.own || []).length) lines.push('', ...detected.own.map((ownEntry) => `${ownEntry.name} (${ownEntry.scope}): on its own - not checked`));
    return lines.join('\n');
}

// The asks as data: the three-way choice, then, for 'Pick which', one multi-select per four fixes (grouped shape).
export function questions(detected: Detected): FixQuestions
{
    // a drifted copy is never in 'Apply all found' or 'Pick which': each is its own question, four a call (spec D9);
    // when both apps drifted, Cursor's is put only after a Restore or Leave in Claude Code
    const drifted = detected.found.filter((finding) => finding.id === 'client-drift' && !finding.blocked);
    const driftQs = drifted.map((finding) =>
    {
        const driftAsk = driftQuestion({ name: finding.name, scope: fieldOf(finding, 'scope'), app: fieldOf(finding, 'app'), change: fieldOf(finding, 'change'), keyGuard: finding.keyGuard, keyEmpty: finding.keyEmpty, rowGone: finding.rowGone, inherited: finding.inherited });
        const first = finding.app === 'cursor' && drifted.find((candidate) => candidate.app === 'claude' && candidate.name === finding.name && candidate.scope === finding.scope);
        return { ...driftAsk.question, answers: driftAsk.answers, ...(first ? { askAfter: { id: `drift-claude-${finding.name}~${finding.scope}`, answers: ['restore', 'leave'] } } : {}) };
    });
    const drift: DriftQuestion[][] = [];
    for (let i = 0; i < driftQs.length; i += 4) drift.push(driftQs.slice(i, i + 4));
    const applicable = detected.found.filter((finding) => !finding.blocked && finding.id !== 'client-drift');
    const ids = [...new Set(applicable.map((finding) => finding.id))];
    if (!ids.length) return { choose: null, pick: [], drift }; // nothing can be applied: the NOT APPLICABLE lines are the advice
    const pick: Question[] = [];
    for (let i = 0; i < ids.length; i += 4)
        pick.push({
            id: 'fix-pick', header: 'Fixes', multiSelect: true, question: 'Which fixes do you want to apply?',
            options: ids.slice(i, i + 4).map((id) => ({ label: id, description: applicable.filter((finding) => finding.id === id).map((finding) => `${where(finding)}: ${finding.found}`).join('; ').slice(0, 300) })),
        });
    const choose = {
        id: 'fix-choice', header: 'Fixes', multiSelect: false, question: `${ids.length} known problem${ids.length === 1 ? '' : 's'} found. Apply?`,
        options: [
            { label: 'Apply all found (Recommended)', description: 'every fix above that can be applied; each is read back' },
            ...(ids.length > 1 ? [{ label: 'Pick which', description: 'choose the fixes one group at a time' }] : []),
            { label: 'Skip', description: 'nothing changes' },
        ],
    };
    const calls: Question[][] = [];
    for (let i = 0; i < pick.length; i += 4) calls.push(pick.slice(i, i + 4));
    return { choose, pick: calls, drift };
}

// ---- apply ----------------------------------------------------------------------------------------------------------

// Why an answered or unanswered drift finding is not applied: null applies it, 'left' is the user's Leave.
function driftSkip(finding: Finding, picked: Finding[], input: Record<string, string>): string | null
{
    const answer = finding.driftKey === undefined ? undefined : input[finding.driftKey];
    if (answer === undefined) return `needs --input ${finding.driftKey}=<answer>`;
    const allowed = finding.inherited ? ['restore', 'leave'] : finding.change === 'missing' ? ['drop', 'restore'] : finding.keyGuard || finding.keyEmpty ? ['restore', 'leave'] : ['keep', 'restore', 'leave'];
    if (answer === 'keep' && finding.keyGuard) return 'the copy holds what looks like a key outside its key field, so Keep is not offered - answer restore or leave';
    if (answer === 'keep' && finding.keyEmpty) return 'its key field is empty, so Keep is not offered - answer restore or leave';
    if (!allowed.includes(answer)) return `'${answer}' is not an answer here - ${allowed.join(', ')}`;
    if (answer === 'leave') return 'left';
    const claude = finding.app === 'cursor' && picked.find((candidate) => candidate.id === 'client-drift' && candidate.app === 'claude' && candidate.name === finding.name && candidate.scope === finding.scope);
    if (claude && claude.driftKey !== undefined && input[claude.driftKey] === 'keep') return "Cursor's answer is not used - Claude Code's copy was kept, and Cursor takes it";
    return null;
}

// `name` and `scope` narrow the findings to one registration, by its exact name (`only` also matches a row id, so two
// servers of one row would both match) - update applies one at a time; `fetchFile: false` writes no fetch file and
// returns the launches to fetch as `fetch`, for update to hand on in its own (apply.ts). `gone`: nothing picked is found
// any more - an earlier step did it.
export function applyFixes(context: FixCtx, ids: string[], { only, name, scope, input = {}, tmp, log = console.log, runCli = cli.runClaude, fetchFile, quietRecheck = false }: FixOptions = {}): FixRun
{
    const result: FixRun = { applied: [], skipped: [], failed: null, remaining: [], steps: 0, fetchFile: null, fetch: null, gone: false, tmp: tmp || null };
    const known = new Set(context.catalog.fixes.map((fixRow) => fixRow.id));
    const unknown = ids.filter((id) => id !== 'all' && id !== 'none' && !known.has(id));
    if (unknown.length) { result.failed = `unknown fix id${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`; log(result.failed); return result; }
    // the uninstall offers the user turned down (spec D9): those shown and left unpicked, and those kept out of 'Apply all
    // found' for alfred-code - the command passes them, recorded once the findings are read; 'Skip' passes none, so the
    // offer comes back
    let turnedDown: Declined[] = [];
    try { turnedDown = declines.parse(input['retired-declined']); }
    catch (caught) { result.failed = errorMessage(caught); log(result.failed); return result; }
    const detected = detectAll(context, { only });
    let picked = ids.includes('none') ? [] : detected.found.filter((finding) => (ids.includes('all') || ids.includes(finding.id)) && (!name || finding.name === name) && (!scope || finding.scope === scope));
    // a drifted copy with its answer is applied whatever else was picked (spec D9)
    const answered = detected.found.filter((finding) => finding.id === 'client-drift' && finding.driftKey !== undefined && input[finding.driftKey] !== undefined && !picked.includes(finding));
    picked = [...picked, ...answered];
    // where alfred-code is set up it installs the retired plugins too: 'Apply all found' leaves them, only a pick reaches them
    if (ids.includes('all') && !ids.includes('retired-plugin'))
    {
        const kept = picked.filter((finding) => finding.id === 'retired-plugin' && finding.alfred && !finding.blocked);
        for (const finding of kept) log(`${finding.name} kept - alfred-code installs it; fix lists it`);
        picked = picked.filter((finding) => !kept.includes(finding));
    }
    if (turnedDown.length) log(declines.add(context.data, turnedDown).detail);
    if (ids.includes('none') && !answered.length) { log('Nothing picked to apply.'); return result; }
    if (!picked.length) { result.gone = true; log('Nothing to apply: no picked problem is found any more.'); return result; }

    for (const finding of picked.filter((candidate) => candidate.blocked || (candidate.input && !input[candidate.input.id])))
    {
        result.skipped.push(finding);
        log(`skipped ${finding.id} on ${where(finding)}: ${finding.blocked || (finding.input && `needs --input ${finding.input.id}=<value> (${finding.input.prompt})`)}`);
    }
    for (const finding of picked.filter((candidate) => candidate.id === 'client-drift' && !candidate.blocked))
    {
        const why = driftSkip(finding, picked, input);
        if (!why) continue;
        if (why === 'left') { result.skipped.push(finding); log(`left    client-drift on ${where(finding)}: ${finding.app === 'cursor' ? 'Cursor' : 'Claude Code'}'s copy as it is`); continue; }
        result.skipped.push(finding);
        log(`skipped client-drift on ${where(finding)}: ${why}`);
    }
    // the guard reads the open drift whatever `only` narrowed the findings to
    const openDrift = picked.some((candidate) => candidate.id === FIX_ID.keyToLauncher) ? clientDriftDetect(context) : [];
    for (const finding of picked.filter((candidate) => !result.skipped.includes(candidate) && waitsForDrift(candidate, openDrift, input)))
    {
        result.skipped.push(finding);
        log(`skipped ${finding.id} on ${where(finding)}: client-drift is open on it - answer that first (restore or keep), then run fix again`);
    }
    let todo = picked.filter((candidate) => !result.skipped.includes(candidate));

    // the folder move (spec D3) comes first: each picked root renamed, then everything else found again on the moved
    // folders - the copied files a moved root holds brought up to date, and every managed server naming a moved root
    // re-pointed in this same apply
    // the former plugin's roots map comes over after the folders, so it is re-pointed at them as it is copied (spec D4)
    const allMoves = todo.filter((finding) => finding.id === 'root-move' && finding.moveFrom);
    const moves = allMoves.filter((finding) => finding.name !== 'data');
    const dataMove = allMoves.find((finding) => finding.name === 'data');
    if (allMoves.length)
    {
        for (const finding of moves)
        {
            const moveResult = rootMoveFix(finding, context);
            log(`${moveResult.ok ? 'ok    ' : 'FAILED'} root-move: ${moveResult.detail}`);
            if (!moveResult.ok) { result.failed = moveResult.detail; return result; }
        }
        context = { ...context, inventory: inventory.buildInventory({ project: context.inventory.project, env: context.env, data: context.data }) };
        for (const { moveTo } of moves)
            for (const kind of ['helper', 'bridge', 'serenaContext'] as const)
            {
                if (moveTo === undefined) continue;
                const file = path.join(moveTo, roots.FILES[kind]);
                const state = roots.shippedState(kind, file);
                if (state.state !== 'lower') continue;
                const written = helperStaleFix({ id: 'helper-stale', name: file, scope: null, found: '', path: file, shipped: kind, from: state.number });
                log(`${written.ok ? 'ok    ' : 'FAILED'} root-move: ${written.detail}`);
                if (!written.ok) { result.failed = written.detail; return result; }
            }
        if (dataMove)
        {
            // the carry never blocks a run (spec D4): a failure is named and the re-point goes on
            const carried = rootMoveFix(dataMove, context);
            log(`${carried.ok ? 'ok    ' : 'left  '} root-move: ${carried.detail}`);
            if (!carried.ok) allMoves.splice(allMoves.indexOf(dataMove), 1);
        }
        const repointed = repointDataMap(context.data, moves.flatMap(({ moveFrom, moveTo }) => (moveFrom !== undefined && moveTo !== undefined ? [{ from: moveFrom, to: moveTo }] : [])), machineOf(context));
        if (repointed) log(`ok     root-move: ${repointed.detail}`);
        const now = detectAll(context).found;
        const same = (left: Finding, right: Finding) => left.id === right.id && left.name === right.name && left.scope === right.scope && left.app === right.app;
        const rest = todo.filter((finding) => finding.id !== 'root-move').map((finding) => now.find((candidate) => same(candidate, finding))).filter((finding): finding is Finding => finding !== undefined && !finding.blocked);
        todo = [...rest, ...now.filter((finding) => finding.id === 'root-repoint' && !finding.blocked && !rest.some((candidate) => same(candidate, finding)))];
        for (const finding of allMoves) { result.applied.push(finding); log(`fixed       root-move on ${where(finding)}`); }
    }

    // registration fixes: one replace per registration, the fixes composed in the catalog's order
    const steps: McpReplaceStep[] = [];
    const order = context.catalog.fixes.map((fixRow) => fixRow.id);
    const groups = new Map<string, Finding[]>();
    // R9: a fix that gives a registration a helper brings its root's file steps - the .gitignore and the helper - first
    const fileCtx: { platform: string; project: string; home: string; roots: Roots | null; uses: RootUse[] } = { platform: context.platform, project: context.inventory.project, home: context.home, roots: null, uses: [] };
    for (const finding of todo.filter((candidate) => candidate.kind === 'registration' && !candidate.tailOnly && candidate.id !== FIX_ID.retiredServer)) groups.set(`${finding.scope}\u0000${finding.name}`, [...(groups.get(`${finding.scope}\u0000${finding.name}`) || []), finding]);
    for (const list of groups.values())
    {
        const found = list.find((candidate) => candidate.roots);
        if (found && found.roots) fileCtx.roots = fileCtx.roots || found.roots;
        // a group holds the findings of one registration the inventory read
        const [first] = list;
        const registration = first && context.inventory.registrations.find((candidate) => candidate.name === first.name && candidate.scope === first.scope);
        if (!first || !registration) throw new Error(`fix: no registration for ${first ? where(first) : 'an empty group'}`);
        let entry = clone(registration.entry);
        try
        {
            for (const finding of list.sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id)))
            {
                const fixName = fixNameOf(context, finding.id);
                const registrationFix = fixName ? REGISTRATION_FIXES.get(fixName) : undefined;
                if (!registrationFix) throw new Error(`fix row ${finding.id}: no registration fix in scripts/fix/`);
                entry = registrationFix(entry, finding, context, input);
            }
        }
        catch (caught) { result.failed = `${first.name}: ${errorMessage(caught)}`; log(`FAILED ${result.failed}`); return result; }
        if (deepEqual(entry, registration.entry))
        {
            for (const finding of list.filter((candidate) => candidate.id === 'serena-context')) { const line = writeMissingContext(finding); if (line) log(line); }
            continue;
        }
        steps.push({ op: 'mcp-replace', name: registration.name, scope: registration.scope, entry, old: registration.entry, row: registration.rowId, route: registration.route, why: `${list.map((finding) => finding.id).join(' + ')}: rewrite '${registration.name}' from the registration as read` });
        // a helper new to the registration - none before, or one of the user's own (helper-foreign) - and, for an app that runs
        // the bridge, the bridge beside it
        if (entry.headersHelper && !helperParts(registration.entry.headersHelper) && fileCtx.roots) useRoots(fileCtx, registration.scope, { helper: true, bridge: list.some((finding) => finding.cursor), keyFile: null, keyName: null, data: null });
        else if (launcherParts(entry) && !launcherParts(registration.entry) && fileCtx.roots) useRoots(fileCtx, registration.scope, { helper: true, bridge: true, keyFile: null, keyName: null, data: null });
        // serena's context file (D7) is written into its folder - its home, else the root - before the registration names it
        const contextAt = contextArgAt(entry);
        const contextArg = (entry.args || [])[contextAt];
        if (contextArg !== undefined && fileCtx.roots) useRoots(fileCtx, registration.scope, { serenaContext: pathFor(context.platform).dirname(contextArg) });
    }
    // retired-server (D3) removes, never rewrites: its steps join the replaces for the list, Cursor and the apply
    const removals = retiredServerSteps(context, todo);
    result.steps = steps.length + removals.length;
    // each list the repaired servers sit in, and Cursor's files from them, in the same run (spec D1); a Cursor copy whose
    // key token-sync found behind is refilled with the list as it is
    const refresh = todo.flatMap(({ id, cursorOnly, name, scope }) => (id === 'token-sync' && cursorOnly && scope !== null ? [{ name, scope }] : []));
    // a server root-repoint found: its list entry and Cursor's copy follow the moved root (spec D3), even when Claude
    // Code's entry is already right; a copy that differs from the list only by the moved root is not a hand edit
    const repoint = todo.flatMap(({ id, name, scope }) => (id === 'root-repoint' && scope !== null ? [{ name, scope }] : []));
    const movedNow = repoint.length ? movedRoots(context) : [];
    const normalize = movedNow.length ? (entry: ServerEntry) => repointEntry(entry, movedNow, machineOf(context)) : undefined;
    const tailNotes: string[] = [];
    // a server helper-foreign brings into a list that does not name it yet is listed for the apps its other servers share
    const clientsFor = new Map(todo.flatMap(({ id, name, scope, clients }): [string, string[]][] => (id === 'helper-foreign' && clients ? [[`mcp:${name}~${scope}`, clients]] : [])));
    const bridgeFor = new Set(todo.filter((finding) => finding.id === 'helper-foreign' && finding.cursor).map((finding) => `mcp:${finding.name}~${finding.scope}`));
    const tail = steps.length || removals.length || refresh.length || repoint.length ? repairTail(context.inventory, { platform: context.platform, project: context.inventory.project, home: context.home, env: context.env, catalog: context.catalog, notes: tailNotes }, [...steps, ...removals], { refresh, repoint, normalize, clientsFor, bridgeFor }) : [];
    if (steps.length || removals.length || tail.length)
    {
        // a fix that changes what is fetched (a python request, a cut-off, cmd /c) is fetched once it is written
        const withFetch = steps.flatMap((step) =>
        {
            const fetchJobStep = fetchStep(step.name, step.entry, step.row, step.old);
            return fetchJobStep ? [step, fetchJobStep] : [step];
        });
        const fileNotes: string[] = [];
        const usedRoots = fileCtx.roots;
        const files = fileCtx.uses.length && usedRoots ? fileSteps(context.inventory, { ...fileCtx, roots: usedRoots }, { notes: fileNotes }) : { before: [] };
        for (const rootUse of [...new Map(fileCtx.uses.map((usage) => [usage.root, usage] as const)).values()]) log(`the key helper goes in the ${rootUse.family} root ${rootUse.root}`);
        for (const note of [...fileNotes, ...tailNotes]) log(`note: ${note}`);
        const plan = { version: 1, project: context.inventory.project, os: context.platform, alfredCodeEnabled: Boolean(context.inventory.alfredCodeEnabled), steps: mcpOrder.withOrderStep([...files.before, ...withFetch, ...removals, ...tail, ...retireContextSteps(context, rewritesOf(steps))], context.inventory.project, mcpOrder.ownProjectNames(context.inventory)), notes: [], errors: [], expect: steps.map((step) => ({ kind: 'mcp', name: step.name, scope: step.scope, route: step.route })) };
        result.tmp = tmp || makeTempDir();
        const report = apply(plan, { env: context.env, tmp: result.tmp, runCli, log, fetchFile });
        result.fetchFile = report.fetchFile;
        result.fetch = report.fetch;
        if (report.failed) { result.failed = report.failed.detail; return result; }
        // read from the registrations as the apply left them: a re-pointed helper names the moved root's key file
        const lines = reconnectOf({ ...context, inventory: inventory.buildInventory({ project: context.inventory.project, env: context.env, data: context.data }) }, steps).map(reconnectLine);
        if (lines.length) log('', ...lines);
    }

    // file fixes (spec D9): detected again on what the registration pass left, their steps in the catalog's row order
    // as one plan through apply.ts, read back below like the rest
    const filePicked = todo.filter((finding) => finding.kind === 'file');
    if (filePicked.length)
    {
        const fctx = steps.length ? { ...context, inventory: inventory.buildInventory({ project: context.inventory.project, env: context.env, data: context.data }) } : context;
        const now = detectAll(fctx, { only }).found.filter((finding) => finding.kind === 'file' && !finding.blocked && filePicked.some((pickedFinding) => pickedFinding.id === finding.id && pickedFinding.name === finding.name && pickedFinding.scope === finding.scope && pickedFinding.app === finding.app));
        const planned: PlanStep[] = [];
        const planNotes: string[] = [];
        for (const row of context.catalog.fixes.filter((candidate) => candidate.kind === 'file'))
            for (const finding of now.filter((candidate) => candidate.id === row.id))
            {
                try
                {
                    const stepsOf = row.steps ? FILE_STEPS.get(row.steps) : undefined;
                    if (!stepsOf) throw new Error(`fix row ${row.id}: no steps function ${row.steps} in scripts/fix/`);
                    planned.push(...stepsOf(finding, fctx, input, planNotes));
                }
                catch (caught)
                {
                    // a finding that cannot be planned is skipped with its text and nothing written for it; the others go on
                    if (caught instanceof RestoreBlocked)
                    {
                        result.skipped.push(finding);
                        todo = todo.filter((candidate) => !(candidate.id === finding.id && candidate.name === finding.name && candidate.scope === finding.scope && candidate.app === finding.app));
                        log(`skipped ${finding.id} on ${where(finding)}: ${caught.message}`);
                        continue;
                    }
                    result.failed = errorMessage(caught);
                    log(`FAILED ${finding.id} on ${where(finding)}: ${result.failed}`);
                    return result;
                }
            }
        for (const note of planNotes) log(`note: ${note}`);
        if (planned.length)
        {
            const plan = { version: 1, project: context.inventory.project, os: context.platform, alfredCodeEnabled: Boolean(context.inventory.alfredCodeEnabled), steps: planned, notes: [], errors: [], expect: [] };
            result.tmp = result.tmp || tmp || makeTempDir();
            const report = apply(plan, { env: context.env, tmp: result.tmp, runCli, log, fetchFile: false, data: context.data });
            if (report.failed) { result.failed = report.failed.detail; return result; }
        }
    }

    // machine fixes; one that says `restart: false` (a .gitignore written) changes nothing a session has started, and one
    // that returns `fetch` (an npx cache folder removed) leaves a package for fetch.ts to download again
    const noRestart = new Set<Finding>();
    const refetch: JobStep[] = [];
    for (const finding of todo.filter((candidate) => candidate.kind === 'machine'))
    {
        let machineResult: MachineFixResult;
        try
        {
            const fixName = fixNameOf(context, finding.id);
            const machineFix = fixName ? MACHINE_FIXES.get(fixName) : undefined;
            if (!machineFix) throw new Error(`fix row ${finding.id}: no machine fix in scripts/fix/`);
            machineResult = machineFix(finding, context);
        }
        catch (caught) { result.failed = `${finding.id}: ${errorMessage(caught)}`; log(`FAILED ${result.failed}`); return result; }
        log(`${machineResult.ok ? 'ok    ' : 'FAILED'} ${finding.id}: ${machineResult.detail}`);
        if (!machineResult.ok) { result.failed = machineResult.detail; return result; }
        if (machineResult.restart === false) noRestart.add(finding);
        if (machineResult.fetch) refetch.push(machineResult.fetch);
    }
    if (refetch.length)
    {
        // beside a fetch file a registration fix already wrote, or in a new one
        result.tmp = result.tmp || tmp || makeTempDir();
        result.fetchFile = writeJob(result.fetchFile || path.join(result.tmp, 'fetch.json'), fetchJob(context.inventory.project, refetch, refetch.map((jobStep) => jobStep.name)), { append: true });
        log('', ...nextLines(result.fetchFile, JSON.parse(fs.readFileSync(result.fetchFile, 'utf8'))));
    }

    // read back: the same detectors, run again on what is installed now
    const after = detectAll({ ...context, inventory: inventory.buildInventory({ project: context.inventory.project, env: context.env, data: context.data }) }, { only });
    const told = new Set<string>();
    for (const finding of todo)
    {
        const left = after.found.some((candidate) => candidate.id === finding.id && candidate.name === finding.name && candidate.scope === finding.scope && candidate.app === finding.app);
        (left ? result.remaining : result.applied).push(finding);
        log(`${left ? 'STILL FOUND' : 'fixed      '} ${finding.id} on ${where(finding)}`);
        if (!left && finding.afterNote) for (const line of finding.afterNote.split('\n')) if (!told.has(line)) { told.add(line); log(`note: ${line}`); }
    }
    if (!quietRecheck && (moves.length || result.applied.some((finding) => finding.id === 'root-repoint'))) log('', 'RECHECK - the folders moved; checking again');
    if (result.applied.some((finding) => !noRestart.has(finding))) log('', `Restart Claude Code so the repaired registrations and the language server start fresh${result.fetchFile ? ' - after the fetch reports, so a session start does not download the same package beside it' : ''}.`);
    return result;
}

