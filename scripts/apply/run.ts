#!/usr/bin/env node
// APPLY - runs a plan's operations in order through the `claude` CLI, reads each back, and stops at the first failure.
//
//   node apply.ts <plan.json> [--tmp <dir>] [--data <plugin data dir>]
//
// The CLI is the only writer of .mcp.json and the account file, but for the order-mcp-json step (mcp-order.ts), which
// reorders .mcp.json's servers and changes no value (the user's ruling, 2026-11-11); this file otherwise only reads them back. Everything applied
// before a failure stays in place and is named. An empty plan makes no call at all and says so.
//
// A rewrite that could lose a server (same-name replace) saves the old JSON to <tmp>/rollback.json first and re-adds it
// when the add fails; a rename or a scope move adds the new registration FIRST, reads it back, and only then removes the
// old one, so a failed add leaves the old one running.
//
// A plan's fetch steps are not run here. They go to <tmp>/fetch.json with the names of the servers written, for fetch.ts:
// a first download takes minutes, and a command cut off by its time limit must never leave half a plan applied.
//
// A plan read from the commands' files carries each credential value as kept.ts's marker (inventory.ts writes it so).
// Before a replace or a move, the real values are taken back in this process from the registration as it is now, and a
// registration that changed since it was read stops the step. No file under <tmp> and no printed line holds a live value:
// rollback.json is kept, and a restore line shows the marker in place of the key.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as cli from '../core/claude-cli.ts';
import * as inventory from '../inventory/inventory.ts';
import { fetchJob, serverStatus, writeJob, nextLines } from './fetch.ts';
import { reconnectLine } from '../plan/render.ts';
import * as kept from '../core/kept.ts';
import * as catalogLib from '../catalog/catalog.ts';
import * as mcpOrder from '../mcps-list/mcp-order.ts';
import * as lists from '../mcps-list/mcps-list.ts';
import * as cursorMcp from '../cursor/cursor-mcp.ts';
import { addAndVerify, rowOf, removeAndVerify, restoreBy, makeRunner, restoreStep, fillStep } from './cli-steps.ts';
import { rootIgnore, writeHelper, writeShipped, moveRootFile, ensureKeyName, listWrite, retireRecord, retireShipped, denyRead, recordRoot, failureLists } from './file-steps.ts';
import { emptyBaseModes } from './serena-config.ts';
import type { Endpoint, McpAddStep, McpMoveStep, McpReplaceStep, PlanStep, Reconnect } from '../plan/types.ts';
import type { ApplyCtx, ApplyOptions, ApplyPlan, ApplyReport, StepResult, Status } from './types.ts';

// One operation. { ok, detail, extra[] }
export function runStep(step: PlanStep, context: ApplyCtx): StepResult
{
    const call = context.call!;
    switch (step.op)
    {
        case 'ensure-dir': {
            const existed = fs.existsSync(step.path);
            fs.mkdirSync(step.path, { recursive: true });
            if (!existed) fs.writeFileSync(path.join(step.path, '.gitignore'), '*\n');
            return { ok: true, detail: existed ? `${step.path} exists - left as it is` : `created ${step.path} with a .gitignore holding *` };
        }
        case 'root-ignore': return rootIgnore(step.path);
        case 'write-helper': return writeHelper(step.path);
        case 'write-bridge': return writeShipped('bridge', step.path);
        case 'write-serena-context': return writeShipped('serenaContext', step.path);
        case 'move-root-file': return moveRootFile(step.from, step.to);
        case 'serena-base-modes': { const result = emptyBaseModes(step.file); return { ok: true, detail: result.detail }; }
        case 'ensure-key-name': return ensureKeyName(step.file, step.names);
        case 'list-write': return listWrite(step, context);
        case 'retire-record': return retireRecord(step.file);
        case 'retire-shipped': return retireShipped(step);
        case 'cursor-write': return cursorMcp.cursorWrite(step, context);
        case 'deny-read': return denyRead(step.file, step.rules || []);
        // never fails the apply: a warning, and the file as it was (spec F8)
        case 'order-mcp-json': return mcpOrder.orderFile(step.file, context.catalog, new Set(step.own || []));
        case 'record-root': return recordRoot(step, context.data);
        case 'mcp-add': return addAndVerify(call, context, step.name, step.scope, step.entry, rowOf(context, step));
        case 'mcp-remove': return removeAndVerify(call, context, step.name, step.scope);
        case 'mcp-replace': {
            const file = path.join(context.tmp, 'rollback.json');
            fs.mkdirSync(context.tmp, { recursive: true });
            fs.writeFileSync(file, JSON.stringify({ name: step.name, scope: step.scope, entry: kept.maskCredentials(step.old, rowOf(context, step)), project: context.project }, null, 2));
            const removeResult = removeAndVerify(call, context, step.name, step.scope);
            if (!removeResult.ok) return { ok: false, detail: `${removeResult.detail} - the old entry is untouched or restored by hand: ${restoreBy(context, step, step.name, step.scope, step.old)}` };
            const add = addAndVerify(call, context, step.name, step.scope, step.entry, rowOf(context, step));
            if (add.ok) return { ok: true, detail: `rewrote '${step.name}' at ${step.scope} scope (old entry saved in ${file})` };
            const back = addAndVerify(call, context, step.name, step.scope, step.old, rowOf(context, step));
            return { ok: false, detail: `${add.detail}; ${back.ok ? 'the old entry was re-added' : `RESTORE BY HAND: ${restoreBy(context, step, step.name, step.scope, step.old)}`}` };
        }
        case 'mcp-move': {
            const add = addAndVerify(call, context, step.to.name, step.to.scope, step.entry, rowOf(context, step));
            if (!add.ok) return { ok: false, detail: `${add.detail}; the old '${step.from.name}' at ${step.from.scope} scope is untouched` };
            const removeResult = removeAndVerify(call, context, step.from.name, step.from.scope);
            if (!removeResult.ok) return { ok: false, detail: `${removeResult.detail}; the new one is in place, the old one is still there - remove it by hand: claude mcp remove ${step.from.name} -s ${step.from.scope}` };
            return { ok: true, detail: `moved '${step.from.name}' (${step.from.scope}) to '${step.to.name}' (${step.to.scope}): added, read back, old removed` };
        }
        default: return { ok: false, detail: `unknown operation ${step.op}` };
    }
}

// apply.ts does the fast half - the CLI writes and their read-back, seconds - so the command that runs it is never cut off
// halfway. The slow half - the fetch steps and the `claude mcp get` status, minutes on a first install - goes to
// <tmp>/fetch.json (or `fetchFile`; false writes none, for a caller that collects several applies) for fetch.ts, which
// the command runs in the background.
export function apply(plan: ApplyPlan, { env = process.env, tmp, runCli = cli.runClaude, log = console.log, fetchFile, data = null }: ApplyOptions = {}): ApplyReport
{
    const project = plan.project;
    const report: ApplyReport = { applied: [], failed: null, notRun: [], readback: [], keys: [], noop: false, toFetch: [], fetch: null, fetchFile: null, tmp: tmp || null, appliedKeys: new Set(), cursorFiles: new Set(), lists: [] };
    if (!plan.steps.length)
    {
        report.noop = true;
        log('Nothing to apply: every answer already matches what is installed. No claude call was made.');
        return report;
    }
    const context: ApplyCtx = { project, env, tmp: tmp || fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-tools-')), runCli, catalog: catalogLib.load(), alfredEnabled: Boolean(plan.alfredCodeEnabled), data };
    context.call = makeRunner(context);
    context.report = report;
    report.tmp = context.tmp;
    for (let i = 0; i < plan.steps.length; i++)
    {
        const step = plan.steps[i]!;
        if (step.op === 'fetch') { report.toFetch.push(step); log(`${i + 1}. later  ${step.why} (fetch.ts, after the read-back)`); continue; }
        const ready = restoreStep(step, context);
        const filled = ready.error ? null : fillStep(ready.step!, context);
        // a step that throws (a .cursor that is a file, a read-only target) is a failed step, so the failure path below
        // still takes Cursor off the list entries it never reached (spec D1)
        let stepResult: StepResult;
        try { stepResult = ready.error ? { ok: false, detail: ready.error } : runStep(filled!.step, context); }
        catch (caught) { const error = caught as NodeJS.ErrnoException; stepResult = { ok: false, detail: `${step.op}: ${error.message}` }; }
        log(`${i + 1}. ${stepResult.ok ? 'ok    ' : 'FAILED'} ${stepResult.detail}`);
        if (filled && filled.note) { report.keys.push(filled.note); log(`   key: ${filled.note}`); }
        if (stepResult.ok)
        {
            report.applied.push({ i: i + 1, op: step.op, detail: stepResult.detail });
            const key = lists.regKey(step);
            if (key) report.appliedKeys.add(key);
            if (step.op === 'cursor-write') report.cursorFiles.add(step.file);
            continue;
        }
        report.failed = { i: i + 1, op: step.op, detail: stepResult.detail };
        report.notRun = plan.steps.slice(i + 1).map((skippedStep, k) => ({ i: i + 2 + k, op: skippedStep.op, why: skippedStep.why }));
        break;
    }
    if (report.failed)
    {
        log('', `Stopped at step ${report.failed.i}. Already applied and left in place: ${report.applied.length ? report.applied.map((appliedStep) => `${appliedStep.i} (${appliedStep.detail})`).join('; ') : 'nothing'}.`);
        if (report.notRun.length) log(`Not run: ${report.notRun.map((notRunStep) => `${notRunStep.i} ${notRunStep.op}`).join(', ')}.`);
        report.lists = failureLists(plan, report, context, log);
    }
    // read it back: each picked tool as the files and the CLI now report it
    const builtInventory = inventory.buildInventory({ project, env });
    for (const expected of plan.expect || [])
    {
        const got = builtInventory.registrations.find((registration) => registration.name === expected.name && registration.scope === expected.scope);
        report.readback.push({ kind: 'mcp', name: expected.name, scope: expected.scope, expectedRoute: expected.route, found: Boolean(got), route: got ? got.route : null, row: got ? got.rowId : null });
    }
    log('', 'Read back:');
    for (const readbackEntry of report.readback)
        log(`  ${readbackEntry.found ? 'ok ' : 'MISSING'} ${readbackEntry.name} - ${readbackEntry.scope} scope, ${readbackEntry.route || '?'} route${readbackEntry.row ? ` (${readbackEntry.row})` : ''}`);
    // what was written and read back: with a package to fetch, fetch.ts fetches it and then asks the CLI for the status;
    // with none (a hosted URL, a rename, a move), the status is asked here
    const done = new Set(report.applied.map((appliedStep) => appliedStep.i));
    const written = plan.steps.filter((planStep, i) => done.has(i + 1) && ['mcp-add', 'mcp-replace', 'mcp-move'].includes(planStep.op)).map((planStep): Endpoint => (planStep as McpMoveStep).to || { name: (planStep as McpAddStep).name, scope: (planStep as McpAddStep).scope });
    // a bridge whose key or URL names are not filled yet exits at its start: its status would only say so (0.4.0 Ruling 11)
    const unfilled = new Set(plan.steps.filter((planStep) => (planStep as McpReplaceStep).filled === false).map((planStep) => ((planStep as McpMoveStep).to ? (planStep as McpMoveStep).to.name : (planStep as McpReplaceStep).name)));
    const fresh = written.map((endpoint) => endpoint.name).filter((name) => !unfilled.has(name));
    const scopeOf = new Map(written.map((endpoint) => [endpoint.name, endpoint.scope]));
    // a hosted keyed server fetches nothing: its status is asked now, so a refused key is named here (spec F3)
    const reconnect = (plan.reconnect || []).filter((reconnectEntry) => scopeOf.has(reconnectEntry.name));
    const now = new Set(reconnect.map((reconnectEntry) => reconnectEntry.name));
    const toFetch = report.toFetch.filter((fetchStep) => scopeOf.has(fetchStep.name)).map((fetchStep) => ({ ...fetchStep, scope: scopeOf.get(fetchStep.name) }));
    report.fetch = fetchJob(project, toFetch, toFetch.length ? fresh.filter((name) => !now.has(name)) : fresh);
    let statuses: Status[] = [];
    if (!report.fetch.fetch.length) statuses = serverStatus(fresh, { cwd: project, env, runCli, log });
    else
    {
        if (now.size) statuses = serverStatus([...now], { cwd: project, env, runCli, log });
        if (fetchFile !== false)
        {
            report.fetchFile = writeJob(fetchFile || path.join(context.tmp, 'fetch.json'), report.fetch);
            log('', ...nextLines(report.fetchFile, report.fetch));
        }
    }
    if (reconnect.length) log('', ...reconnectLines(reconnect, statuses, project));
    if (!report.failed) log('', `Restart Claude Code (or run /reload-plugins for plugins) so the new registrations load${report.fetchFile ? ' - after the fetch reports, so a session start does not download the same package beside it' : ''}; a project-scope server also needs the trust prompt on the next session start.`);
    return report;
}

// The CLI's reason when the server answered 401 or 403 to the key the helper sent (claude 2.1.322, measured by
// tests/matrix/field-fixes.test.ts X7, docs/sources.md 'Claude Code - a refused key'): a server that is down, errs or
// asks for OAuth gives another reason.
export const REFUSED = /Server rejected the Authorization header minted by the configured headersHelper \(HTTP 40[13]\)/;
export const refusedLine = ({ name, variable, hint }: Pick<Reconnect, 'name' | 'variable' | 'hint'>): string => `${name}: the server refused the key in ${variable} - ${hint || 'check the value'}`;

// After the read-back: each hosted keyed server's reconnect line, then a refused key named - or, in a folder whose trust
// is not accepted, the trust line, since the helper never ran and the key never left the file.
export function reconnectLines(reconnect: Reconnect[], statuses: Status[], project: string): string[]
{
    const lines = reconnect.map(reconnectLine);
    for (const reconnectEntry of reconnect.filter((entry) => entry.filled))
    {
        const reconnectStatus = statuses.find((statusEntry) => statusEntry.name === reconnectEntry.name);
        if (!reconnectStatus || !REFUSED.test(reconnectStatus.issue || '')) continue;
        lines.push(reconnectEntry.untrusted ? `${reconnectEntry.name}: accept the trust dialog the next time Claude Code starts in ${project} - until then the server connects without its key` : refusedLine(reconnectEntry));
    }
    return lines;
}

