#!/usr/bin/env node
// THE FIX ENGINE - known problems and their recorded fixes (catalog/fixes.json, detectors in scripts/fix/).
//
//   node fix.js --detect [--only <fix id | tool | registration name>] [--json] [--project <dir>] [--data <dir>]
//   node fix.js --questions [--project <dir>] [--data <dir>]   the asks, as data (the same --only narrows it)
//   node fix.js --apply <id,id | all | none> [--only <x>] [--input key=value] [--project <dir>] [--tmp <dir>] [--data <dir>]
//   --input retired-declined=<id>~<scope>,...  the plugin uninstall offers turned down (spec D9), kept in --data
//
// --data: the plugin's data folder, whose roots map finds the records - a registration left on its own (spec D6) is
// not checked, and is listed once as such.
//
// A detector looks at the inventory and the machine and returns findings; a row that finds nothing is not shown. A
// registration fix edits the entry AS READ and is written through apply.js (remove, then add-json, with a rollback), one
// replace per registration however many fixes it takes. A machine fix runs its command. Every fix is read back by running
// its detector again, and the restart line comes last - unless every fix applied was one a session does not need to restart
// for (a data folder's .gitignore). A finding with `blocked` is shown and never applied; a row with
// `hold` in the catalog is listed as held and never detected.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as catalogLib from '../catalog/catalog.ts';
import * as inventory from '../inventory/inventory.ts';
import * as account from '../core/account.ts';
import { apply } from '../apply/run.ts';
import * as cli from '../core/claude-cli.ts';
import { writeJob, fetchJob, nextLines } from '../apply/fetch.ts';
import * as F from './fix-functions.ts';
import { realMachine, clone } from './common.ts';
import { deepEqual } from '../plan/plan.ts';
import { useRoots, fileSteps } from '../plan/pick.ts';
import { reconnectLine } from '../plan/render.ts';
import { helperNameOf, contextArgAt } from '../entries/entry.ts';
import { fetchStep } from '../entries/names.ts';
import * as mcpOrder from '../mcps-list/mcp-order.ts';
import * as keys from '../keys/keys.ts';
import * as roots from '../roots/roots.ts';
import * as declines from '../core/declines.ts';
import { repairTail } from '../plan/repair-tail.ts';
import { driftQuestion } from '../plan/asks-other.ts';
import type { Declined, Env } from '../core/types.ts';
import type { Catalog, CatalogRoute } from '../catalog/types.ts';
import type { Inventory } from '../inventory/types.ts';
import type { JobStep } from '../apply/types.ts';
import type { DriftAsk, ListCtx, McpReplaceStep, PlanStep, Question, Reconnect, RootUse } from '../plan/types.ts';
import type { Roots } from '../entries/types.ts';
import type { Detected, Detector, DriftQuestion, FileSteps, Finding, FixCtx, FixOptions, FixQuestions, FixRun, MachineFix, MachineProbe, RegistrationFix } from './types.ts';

export function makeCtx({ inv, catalog = catalogLib.load(), env = process.env, machine, platform, arch, data = null }: { inv: Inventory; catalog?: Catalog; env?: Env; machine?: MachineProbe | undefined; platform?: string; arch?: string; data?: string | null }): FixCtx
{
    const p = platform || inv.os;
    return { inv, catalog, platform: p, arch: arch || inv.arch, env, home: account.homeDir(env), rules: catalog.rules, machine: machine || realMachine({ env, platform: p }), data };
}

const matches = (f: Finding, only: string | undefined) => !only || [f.id, f.row, f.name].includes(only);

// Each rewritten hosted registration that sends a key through the helper: its name, and whether the hosted chain at its
// scope fills it (spec F3) - the same reconnect line the plan prints.
function reconnectOf(ctx: FixCtx, steps: McpReplaceStep[]): Pick<Reconnect, 'name' | 'variable' | 'file' | 'filled' | 'anonymous'>[]
{
    const r = roots.resolve(ctx.inv, null, { project: ctx.inv.project, home: ctx.home, platform: ctx.platform, catalog: ctx.catalog }).roots;
    return steps.filter((s) => s.entry && s.entry.headersHelper && helperNameOf(s.entry.headersHelper)).map((s) =>
    {
        const variable = helperNameOf(s.entry.headersHelper)!;
        const route = ctx.catalog.byId.get(s.row!)!.routes[s.route!] || {} as Partial<CatalogRoute>;
        const files = keys.hostedChain({ scope: s.scope, projectRoot: r.project, globalRoot: r.global, globalNamed: r.globalNamed, home: ctx.home });
        return { name: s.name, variable, file: files[0]!, filled: keys.filledNames(files).some((f) => f.names.includes(variable)), anonymous: route.authMode === 'optional-token' && !route.keyless };
    });
}

// A project or local helper runs only once its declaring folder's trust dialog is accepted (spec D4): until then the server
// connects without its key. Not a fix - nothing here can accept it. -> [line]
function trustNotes(ctx: FixCtx, only: string | undefined): string[]
{
    if (ctx.inv.trusted !== false) return [];
    return (ctx.inv.registrations || [])
        .filter((r) => r.rowId && !r.own && !r.alfredRetired && r.choice !== 'own' && ['project', 'local'].includes(r.scope) && r.entry && r.entry.headersHelper)
        .filter((r) => !only || [r.name, r.rowId].includes(only))
        .map((r) => `${r.name} (${r.scope}): accept the trust dialog the next time Claude Code starts in ${ctx.inv.project} - until then the server connects without its key`);
}

// -> { found: [finding + { kind, symptom }], held: [{ id, why }], own: [{ name, scope }], notes: [line] } - `own`: the
// registrations left on their own (spec D6), which no detector reads
export function detectAll(ctx: FixCtx, { only }: { only?: string | undefined } = {}): Detected
{
    const own = (ctx.inv.registrations || []).filter((r) => r.choice === 'own' && (!only || [r.name, r.rowId].includes(only)));
    const out: Detected = { found: [], held: [], own: own.map((r) => ({ name: r.name, scope: r.scope })), notes: trustNotes(ctx, only) };
    for (const fix of ctx.catalog.fixes)
    {
        if (fix.hold) { out.held.push({ id: fix.id, why: fix.hold }); continue; }
        if (!fix.os.includes(ctx.platform)) continue;
        const detect = (F as unknown as Record<string, Detector | undefined>)[fix.detect];
        if (typeof detect !== 'function') throw new Error(`fix row ${fix.id}: no function ${fix.detect} in scripts/fix/`);
        // a file row plans its repair: one that is not advice names the function that does
        if (fix.kind === 'file' && !fix.advice && typeof (F as unknown as Record<string, unknown>)[fix.steps!] !== 'function') throw new Error(`fix row ${fix.id}: no steps function ${fix.steps} in scripts/fix/`);
        // an advice row has no fix: its finding is shown and never offered, whatever its detector returned
        const advice = (f: Finding) => (fix.advice && !f.blocked ? { blocked: 'advice only - nothing here is applied' } : {});
        for (const f of detect(ctx)) if (matches(f, only)) out.found.push({ ...f, ...advice(f), kind: fix.kind, symptom: fix.symptom, documented: fix.documented !== false });
    }
    return out;
}

const where = (f: Finding): string => (f.kind === 'registration' || f.id === 'client-drift' ? `${f.name} (${f.scope})` : f.name);

export function render(detected: Detected): string
{
    const lines: string[] = [];
    const { found, held } = detected;
    if (!found.length) lines.push('No known problem found.');
    else
    {
        lines.push(`Known problems found (${found.length}):`, '');
        const w = (k: (f: Finding) => string) => Math.max(...found.map((f) => k(f).length));
        const idW = w((f) => f.id);
        const toolW = w(where);
        for (const f of found)
        {
            const tail = f.blocked ? ` - NOT APPLICABLE: ${f.blocked}` : f.input ? ` - needs a folder from you: ${f.input.prompt}` : '';
            lines.push(`  ${f.id.padEnd(idW)}  ${where(f).padEnd(toolW)}  ${f.found}${tail}`);
            if (f.note) lines.push(`  ${' '.repeat(idW)}  ${' '.repeat(toolW)}  note: ${f.note}`);
        }
    }
    if ((detected.notes || []).length) lines.push('', ...detected.notes.map((n) => `note: ${n}`));
    for (const h of held) lines.push('', `Held, not checked: ${h.id} - ${h.why}`);
    if ((detected.own || []).length) lines.push('', ...detected.own.map((o) => `${o.name} (${o.scope}): on its own - not checked`));
    return lines.join('\n');
}

// The asks as data: the three-way choice, then, for 'Pick which', one multi-select per four fixes (grouped shape).
export function questions(detected: Detected): FixQuestions
{
    // a drifted copy is never in 'Apply all found' or 'Pick which': each is its own question, four a call (spec D9);
    // when both apps drifted, Cursor's is put only after a Restore or Leave in Claude Code
    const drifted = detected.found.filter((f) => f.id === 'client-drift' && !f.blocked);
    const driftQs = drifted.map((f) =>
    {
        const q = driftQuestion(f as DriftAsk);
        const first = f.app === 'cursor' && drifted.find((x) => x.app === 'claude' && x.name === f.name && x.scope === f.scope);
        return { ...q.question, answers: q.answers, ...(first ? { askAfter: { id: `drift-claude-${f.name}~${f.scope}`, answers: ['restore', 'leave'] } } : {}) };
    });
    const drift: DriftQuestion[][] = [];
    for (let i = 0; i < driftQs.length; i += 4) drift.push(driftQs.slice(i, i + 4));
    const applicable = detected.found.filter((f) => !f.blocked && f.id !== 'client-drift');
    const ids = [...new Set(applicable.map((f) => f.id))];
    if (!ids.length) return { choose: null, pick: [], drift }; // nothing can be applied: the NOT APPLICABLE lines are the advice
    const pick: Question[] = [];
    for (let i = 0; i < ids.length; i += 4)
        pick.push({
            id: 'fix-pick', header: 'Fixes', multiSelect: true, question: 'Which fixes do you want to apply?',
            options: ids.slice(i, i + 4).map((id) => ({ label: id, description: applicable.filter((f) => f.id === id).map((f) => `${where(f)}: ${f.found}`).join('; ').slice(0, 300) })),
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
function driftSkip(f: Finding, picked: Finding[], input: Record<string, string>): string | null
{
    const answer = input[f.driftKey!];
    if (answer === undefined) return `needs --input ${f.driftKey}=<answer>`;
    const allowed = f.inherited ? ['restore', 'leave'] : f.change === 'missing' ? ['drop', 'restore'] : f.keyGuard || f.keyEmpty ? ['restore', 'leave'] : ['keep', 'restore', 'leave'];
    if (answer === 'keep' && f.keyGuard) return 'the copy holds what looks like a key outside its key field, so Keep is not offered - answer restore or leave';
    if (answer === 'keep' && f.keyEmpty) return 'its key field is empty, so Keep is not offered - answer restore or leave';
    if (!allowed.includes(answer)) return `'${answer}' is not an answer here - ${allowed.join(', ')}`;
    if (answer === 'leave') return 'left';
    const claude = f.app === 'cursor' && picked.find((x) => x.id === 'client-drift' && x.app === 'claude' && x.name === f.name && x.scope === f.scope);
    if (claude && input[claude.driftKey!] === 'keep') return "Cursor's answer is not used - Claude Code's copy was kept, and Cursor takes it";
    return null;
}

// `name` and `scope` narrow the findings to one registration, by its exact name (`only` also matches a row id, so two
// servers of one row would both match) - update applies one at a time; `fetchFile: false` writes no fetch file and
// returns the launches to fetch as `fetch`, for update to hand on in its own (apply.js). `gone`: nothing picked is found
// any more - an earlier step did it.
export function applyFixes(ctx: FixCtx, ids: string[], { only, name, scope, input = {}, tmp, log = console.log, runCli = cli.runClaude, fetchFile }: FixOptions = {}): FixRun
{
    const res: FixRun = { applied: [], skipped: [], failed: null, remaining: [], steps: 0, fetchFile: null, fetch: null, gone: false, tmp: tmp || null };
    const known = new Set(ctx.catalog.fixes.map((f) => f.id));
    const unknown = ids.filter((id) => id !== 'all' && id !== 'none' && !known.has(id));
    if (unknown.length) { res.failed = `unknown fix id${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`; log(res.failed); return res; }
    // the uninstall offers the user turned down (spec D9): those shown and left unpicked, and those kept out of 'Apply all
    // found' for alfred-code - the command passes them, recorded once the findings are read; 'Skip' passes none, so the
    // offer comes back
    let turnedDown: Declined[] = [];
    try { turnedDown = declines.parse(input['retired-declined']); }
    catch (caught) { const e = caught as NodeJS.ErrnoException; res.failed = e.message; log(res.failed); return res; }
    const detected = detectAll(ctx, { only });
    let picked = ids.includes('none') ? [] : detected.found.filter((f) => (ids.includes('all') || ids.includes(f.id)) && (!name || f.name === name) && (!scope || f.scope === scope));
    // a drifted copy with its answer is applied whatever else was picked (spec D9)
    const answered = detected.found.filter((f) => f.id === 'client-drift' && input[f.driftKey!] !== undefined && !picked.includes(f));
    picked = [...picked, ...answered];
    // where alfred-code is set up it installs the retired plugins too: 'Apply all found' leaves them, only a pick reaches them
    if (ids.includes('all') && !ids.includes('retired-plugin'))
    {
        const kept = picked.filter((f) => f.id === 'retired-plugin' && f.alfred && !f.blocked);
        for (const f of kept) log(`${f.name} kept - alfred-code installs it; fix lists it`);
        picked = picked.filter((f) => !kept.includes(f));
    }
    if (turnedDown.length) log(declines.add(ctx.data, turnedDown).detail);
    if (ids.includes('none') && !answered.length) { log('Nothing picked to apply.'); return res; }
    if (!picked.length) { res.gone = true; log('Nothing to apply: no picked problem is found any more.'); return res; }

    for (const f of picked.filter((x) => x.blocked || (x.input && !input[x.input.id])))
    {
        res.skipped.push(f);
        log(`skipped ${f.id} on ${where(f)}: ${f.blocked || `needs --input ${f.input!.id}=<value> (${f.input!.prompt})`}`);
    }
    for (const f of picked.filter((x) => x.id === 'client-drift' && !x.blocked))
    {
        const why = driftSkip(f, picked, input);
        if (!why) continue;
        if (why === 'left') { res.skipped.push(f); log(`left    client-drift on ${where(f)}: ${f.app === 'cursor' ? 'Cursor' : 'Claude Code'}'s copy as it is`); continue; }
        res.skipped.push(f);
        log(`skipped client-drift on ${where(f)}: ${why}`);
    }
    const todo = picked.filter((x) => !res.skipped.includes(x));

    // registration fixes: one replace per registration, the fixes composed in the catalog's order
    const steps: McpReplaceStep[] = [];
    const order = ctx.catalog.fixes.map((x) => x.id);
    const groups = new Map<string, Finding[]>();
    // R9: a fix that gives a registration a helper brings its root's file steps - the .gitignore and the helper - first
    const fileCtx: { platform: string; project: string; roots: Roots | null; uses: RootUse[] } = { platform: ctx.platform, project: ctx.inv.project, roots: null, uses: [] };
    for (const f of todo.filter((x) => x.kind === 'registration')) groups.set(`${f.scope}\u0000${f.name}`, [...(groups.get(`${f.scope}\u0000${f.name}`) || []), f]);
    for (const list of groups.values())
    {
        const withRoots = list.find((x) => x.roots);
        if (withRoots) fileCtx.roots = fileCtx.roots || withRoots.roots!;
        const reg = ctx.inv.registrations.find((r) => r.name === list[0]!.name && r.scope === list[0]!.scope)!;
        let entry = clone(reg.entry);
        try
        {
            for (const f of list.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)))
                entry = (F as unknown as Record<string, RegistrationFix>)[ctx.catalog.fixes.find((x) => x.id === f.id)!.fix!]!(entry, f, ctx, input);
        }
        catch (caught) { const e = caught as NodeJS.ErrnoException; res.failed = `${list[0]!.name}: ${e.message}`; log(`FAILED ${res.failed}`); return res; }
        if (deepEqual(entry, reg.entry)) continue;
        steps.push({ op: 'mcp-replace', name: reg.name, scope: reg.scope, entry, old: reg.entry, row: reg.rowId, route: reg.route, why: `${list.map((x) => x.id).join(' + ')}: rewrite '${reg.name}' from the registration as read` });
        if (entry.headersHelper && !reg.entry.headersHelper && fileCtx.roots) useRoots(fileCtx, reg.scope, { helper: true, keyFile: null, keyName: null, data: null });
        // serena's context file (D7) is written into its root before the registration names it
        if (contextArgAt(entry) >= 0 && fileCtx.roots) useRoots(fileCtx, reg.scope, { serenaContext: true });
    }
    res.steps = steps.length;
    // each list the repaired servers sit in, and Cursor's files from them, in the same run (spec D1); a Cursor copy whose
    // key token-sync found behind is refilled with the list as it is
    const refresh = todo.filter((x) => x.id === 'token-sync' && x.cursorOnly).map((x) => ({ name: x.name, scope: x.scope! }));
    const tailNotes: string[] = [];
    const tail = steps.length || refresh.length ? repairTail(ctx.inv, { platform: ctx.platform, project: ctx.inv.project, home: ctx.home, env: ctx.env, catalog: ctx.catalog, notes: tailNotes }, steps, { refresh }) : [];
    if (steps.length || tail.length)
    {
        // a fix that changes what is fetched (a python request, a cut-off, cmd /c) is fetched once it is written
        const withFetch = steps.flatMap((s) =>
        {
            const f = fetchStep(s.name, s.entry, s.row, s.old);
            return f ? [s, f] : [s];
        });
        const fileNotes: string[] = [];
        const files = fileCtx.uses.length ? fileSteps(ctx.inv, fileCtx as ListCtx, { notes: fileNotes }) : { before: [] };
        for (const u of [...new Map(fileCtx.uses.map((x) => [x.root, x] as const)).values()]) log(`the key helper goes in the ${u.family} root ${u.root}`);
        for (const n of [...fileNotes, ...tailNotes]) log(`note: ${n}`);
        const plan = { version: 1, project: ctx.inv.project, os: ctx.platform, alfredCodeEnabled: Boolean(ctx.inv.alfredCodeEnabled), steps: mcpOrder.withOrderStep([...files.before, ...withFetch, ...tail], ctx.inv.project, mcpOrder.ownProjectNames(ctx.inv)), notes: [], errors: [], expect: steps.map((s) => ({ kind: 'mcp', name: s.name, scope: s.scope, route: ctx.inv.registrations.find((r) => r.name === s.name && r.scope === s.scope)!.route })) };
        res.tmp = tmp || fs.mkdtempSync(path.join(os.tmpdir(), 'preferred-tools-fix-'));
        const report = apply(plan, { env: ctx.env, tmp: res.tmp, runCli, log, fetchFile });
        res.fetchFile = report.fetchFile;
        res.fetch = report.fetch;
        if (report.failed) { res.failed = report.failed.detail; return res; }
        const lines = reconnectOf(ctx, steps).map(reconnectLine);
        if (lines.length) log('', ...lines);
    }

    // file fixes (spec D9): detected again on what the registration pass left, their steps in the catalog's row order
    // as one plan through apply.js, read back below like the rest
    const filePicked = todo.filter((x) => x.kind === 'file');
    if (filePicked.length)
    {
        const fctx = steps.length ? { ...ctx, inv: inventory.buildInventory({ project: ctx.inv.project, env: ctx.env, data: ctx.data }) } : ctx;
        const now = detectAll(fctx, { only }).found.filter((f) => f.kind === 'file' && !f.blocked && filePicked.some((p) => p.id === f.id && p.name === f.name && p.scope === f.scope && p.app === f.app));
        const planned: PlanStep[] = [];
        for (const row of ctx.catalog.fixes.filter((x) => x.kind === 'file'))
            for (const f of now.filter((x) => x.id === row.id))
            {
                try { planned.push(...(F as unknown as Record<string, FileSteps>)[row.steps!]!(f, fctx, input)); }
                catch (caught) { const e = caught as NodeJS.ErrnoException; res.failed = e.message; log(`FAILED ${f.id} on ${where(f)}: ${e.message}`); return res; }
            }
        if (planned.length)
        {
            const plan = { version: 1, project: ctx.inv.project, os: ctx.platform, alfredCodeEnabled: Boolean(ctx.inv.alfredCodeEnabled), steps: planned, notes: [], errors: [], expect: [] };
            res.tmp = res.tmp || tmp || fs.mkdtempSync(path.join(os.tmpdir(), 'preferred-tools-fix-'));
            const report = apply(plan, { env: ctx.env, tmp: res.tmp, runCli, log, fetchFile: false, data: ctx.data });
            if (report.failed) { res.failed = report.failed.detail; return res; }
        }
    }

    // machine fixes; one that says `restart: false` (a .gitignore written) changes nothing a session has started, and one
    // that returns `fetch` (an npx cache folder removed) leaves a package for fetch.js to download again
    const noRestart = new Set<Finding>();
    const refetch: JobStep[] = [];
    for (const f of todo.filter((x) => x.kind === 'machine'))
    {
        const r = (F as unknown as Record<string, MachineFix>)[ctx.catalog.fixes.find((x) => x.id === f.id)!.fix!]!(f, ctx);
        log(`${r.ok ? 'ok    ' : 'FAILED'} ${f.id}: ${r.detail}`);
        if (!r.ok) { res.failed = r.detail; return res; }
        if (r.restart === false) noRestart.add(f);
        if (r.fetch) refetch.push(r.fetch);
    }
    if (refetch.length)
    {
        // beside a fetch file a registration fix already wrote, or in a new one
        res.tmp = res.tmp || tmp || fs.mkdtempSync(path.join(os.tmpdir(), 'preferred-tools-fix-'));
        res.fetchFile = writeJob(res.fetchFile || path.join(res.tmp, 'fetch.json'), fetchJob(ctx.inv.project, refetch, refetch.map((s) => s.name)), { append: true });
        log('', ...nextLines(res.fetchFile, JSON.parse(fs.readFileSync(res.fetchFile, 'utf8'))));
    }

    // read back: the same detectors, run again on what is installed now
    const after = detectAll({ ...ctx, inv: inventory.buildInventory({ project: ctx.inv.project, env: ctx.env, data: ctx.data }) }, { only });
    for (const f of todo)
    {
        const left = after.found.some((a) => a.id === f.id && a.name === f.name && a.scope === f.scope && a.app === f.app);
        (left ? res.remaining : res.applied).push(f);
        log(`${left ? 'STILL FOUND' : 'fixed      '} ${f.id} on ${where(f)}`);
    }
    if (res.applied.some((f) => !noRestart.has(f))) log('', `Restart Claude Code so the repaired registrations and the language server start fresh${res.fetchFile ? ' - after the fetch reports, so a session start does not download the same package beside it' : ''}.`);
    return res;
}

