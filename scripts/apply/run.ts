#!/usr/bin/env node
'use strict';
// APPLY - runs a plan's operations in order through the `claude` CLI, reads each back, and stops at the first failure.
//
//   node apply.js <plan.json> [--tmp <dir>] [--data <plugin data dir>]
//
// The CLI is the only writer of .mcp.json and the account file, but for the order-mcp-json step (mcp-order.js), which
// reorders .mcp.json's servers and changes no value (the user's ruling, 2026-11-11); this file otherwise only reads them back. Everything applied
// before a failure stays in place and is named. An empty plan makes no call at all and says so.
//
// A rewrite that could lose a server (same-name replace) saves the old JSON to <tmp>/rollback.json first and re-adds it
// when the add fails; a rename or a scope move adds the new registration FIRST, reads it back, and only then removes the
// old one, so a failed add leaves the old one running.
//
// A plan's fetch steps are not run here. They go to <tmp>/fetch.json with the names of the servers written, for fetch.js:
// a first download takes minutes, and a command cut off by its time limit must never leave half a plan applied.
//
// A plan read from the commands' files carries each credential value as kept.js's marker (inventory.js writes it so).
// Before a replace or a move, the real values are taken back in this process from the registration as it is now, and a
// registration that changed since it was read stops the step. No file under <tmp> and no printed line holds a live value:
// rollback.json is kept, and a restore line shows the marker in place of the key.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cli = require('../core/claude-cli.ts');
const inventory = require('../inventory/inventory.ts');
const { job, status, writeJob, nextLines } = require('./fetch.ts');
const { reconnectLine } = require('../plan/render.ts');
const kept = require('../core/kept.ts');
const catalogLib = require('../catalog/catalog.ts');
const mcpOrder = require('../mcps-list/mcp-order.ts');
const lists = require('../mcps-list/mcps-list.ts');
const cursorMcp = require('../cursor/cursor-mcp.ts');
const { addAndVerify, rowOf, removeAndVerify, restoreBy, makeRunner, restoreStep, fillStep } = require('./cli-steps.ts');
const { rootIgnore, writeHelper, writeShipped, moveRootFile, ensureKeyName, listWrite, retireRecord, denyRead, recordRoot, failureLists } = require('./file-steps.ts');

// One operation. { ok, detail, extra[] }
function runStep(step, ctx)
{
    const call = ctx.call;
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
        case 'serena-base-modes': { const r = require('./serena-config.ts').emptyBaseModes(step.file); return { ok: true, detail: r.detail }; }
        case 'ensure-key-name': return ensureKeyName(step.file, step.names);
        case 'list-write': return listWrite(step, ctx);
        case 'retire-record': return retireRecord(step.file);
        case 'cursor-write': return cursorMcp.cursorWrite(step, ctx);
        case 'deny-read': return denyRead(step.file, step.rules || []);
        // never fails the apply: a warning, and the file as it was (spec F8)
        case 'order-mcp-json': return mcpOrder.orderFile(step.file, ctx.catalog, new Set(step.own || []));
        case 'record-root': return recordRoot(step, ctx.data);
        case 'mcp-add': return addAndVerify(call, ctx, step.name, step.scope, step.entry, rowOf(ctx, step));
        case 'mcp-remove': return removeAndVerify(call, ctx, step.name, step.scope);
        case 'mcp-replace': {
            const file = path.join(ctx.tmp, 'rollback.json');
            fs.mkdirSync(ctx.tmp, { recursive: true });
            fs.writeFileSync(file, JSON.stringify({ name: step.name, scope: step.scope, entry: kept.keep(step.old, rowOf(ctx, step)), project: ctx.project }, null, 2));
            const rm = removeAndVerify(call, ctx, step.name, step.scope);
            if (!rm.ok) return { ok: false, detail: `${rm.detail} - the old entry is untouched or restored by hand: ${restoreBy(ctx, step, step.name, step.scope, step.old)}` };
            const add = addAndVerify(call, ctx, step.name, step.scope, step.entry, rowOf(ctx, step));
            if (add.ok) return { ok: true, detail: `rewrote '${step.name}' at ${step.scope} scope (old entry saved in ${file})` };
            const back = addAndVerify(call, ctx, step.name, step.scope, step.old, rowOf(ctx, step));
            return { ok: false, detail: `${add.detail}; ${back.ok ? 'the old entry was re-added' : `RESTORE BY HAND: ${restoreBy(ctx, step, step.name, step.scope, step.old)}`}` };
        }
        case 'mcp-move': {
            const add = addAndVerify(call, ctx, step.to.name, step.to.scope, step.entry, rowOf(ctx, step));
            if (!add.ok) return { ok: false, detail: `${add.detail}; the old '${step.from.name}' at ${step.from.scope} scope is untouched` };
            const rm = removeAndVerify(call, ctx, step.from.name, step.from.scope);
            if (!rm.ok) return { ok: false, detail: `${rm.detail}; the new one is in place, the old one is still there - remove it by hand: claude mcp remove ${step.from.name} -s ${step.from.scope}` };
            return { ok: true, detail: `moved '${step.from.name}' (${step.from.scope}) to '${step.to.name}' (${step.to.scope}): added, read back, old removed` };
        }
        default: return { ok: false, detail: `unknown operation ${step.op}` };
    }
}

// apply.js does the fast half - the CLI writes and their read-back, seconds - so the command that runs it is never cut off
// halfway. The slow half - the fetch steps and the `claude mcp get` status, minutes on a first install - goes to
// <tmp>/fetch.json (or `fetchFile`; false writes none, for a caller that collects several applies) for fetch.js, which
// the command runs in the background.
function apply(plan, { env = process.env, tmp, runCli = cli.run, log = console.log, fetchFile, data = null } = {})
{
    const project = plan.project;
    const report = { applied: [], failed: null, notRun: [], readback: [], keys: [], noop: false, toFetch: [], fetch: null, fetchFile: null, tmp: tmp || null, appliedKeys: new Set(), cursorFiles: new Set(), lists: [] };
    if (!plan.steps.length)
    {
        report.noop = true;
        log('Nothing to apply: every answer already matches what is installed. No claude call was made.');
        return report;
    }
    const ctx = { project, env, tmp: tmp || fs.mkdtempSync(path.join(os.tmpdir(), 'preferred-tools-')), runCli, catalog: catalogLib.load(), alfredEnabled: Boolean(plan.alfredCodeEnabled), data };
    ctx.call = makeRunner(ctx);
    ctx.report = report;
    report.tmp = ctx.tmp;
    for (let i = 0; i < plan.steps.length; i++)
    {
        const step = plan.steps[i];
        if (step.op === 'fetch') { report.toFetch.push(step); log(`${i + 1}. later  ${step.why} (fetch.js, after the read-back)`); continue; }
        const ready = restoreStep(step, ctx);
        const filled = ready.error ? null : fillStep(ready.step, ctx);
        // a step that throws (a .cursor that is a file, a read-only target) is a failed step, so the failure path below
        // still takes Cursor off the list entries it never reached (spec D1)
        let r;
        try { r = ready.error ? { ok: false, detail: ready.error } : runStep(filled.step, ctx); }
        catch (e) { r = { ok: false, detail: `${step.op}: ${e.message}` }; }
        log(`${i + 1}. ${r.ok ? 'ok    ' : 'FAILED'} ${r.detail}`);
        if (filled && filled.note) { report.keys.push(filled.note); log(`   key: ${filled.note}`); }
        if (r.ok)
        {
            report.applied.push({ i: i + 1, op: step.op, detail: r.detail });
            const key = lists.regKey(step);
            if (key) report.appliedKeys.add(key);
            if (step.op === 'cursor-write') report.cursorFiles.add(step.file);
            continue;
        }
        report.failed = { i: i + 1, op: step.op, detail: r.detail };
        report.notRun = plan.steps.slice(i + 1).map((s, k) => ({ i: i + 2 + k, op: s.op, why: s.why }));
        break;
    }
    if (report.failed)
    {
        log('', `Stopped at step ${report.failed.i}. Already applied and left in place: ${report.applied.length ? report.applied.map((a) => `${a.i} (${a.detail})`).join('; ') : 'nothing'}.`);
        if (report.notRun.length) log(`Not run: ${report.notRun.map((n) => `${n.i} ${n.op}`).join(', ')}.`);
        report.lists = failureLists(plan, report, ctx, log);
    }
    // read it back: each picked tool as the files and the CLI now report it
    const inv = inventory.buildInventory({ project, env });
    for (const e of plan.expect || [])
    {
        const got = inv.registrations.find((r) => r.name === e.name && r.scope === e.scope);
        report.readback.push({ kind: 'mcp', name: e.name, scope: e.scope, expectedRoute: e.route, found: Boolean(got), route: got ? got.route : null, row: got ? got.rowId : null });
    }
    log('', 'Read back:');
    for (const r of report.readback)
        log(`  ${r.found ? 'ok ' : 'MISSING'} ${r.name} - ${r.scope} scope, ${r.route || '?'} route${r.row ? ` (${r.row})` : ''}`);
    // what was written and read back: with a package to fetch, fetch.js fetches it and then asks the CLI for the status;
    // with none (a hosted URL, a rename, a move), the status is asked here
    const done = new Set(report.applied.map((a) => a.i));
    const written = plan.steps.filter((s, i) => done.has(i + 1) && ['mcp-add', 'mcp-replace', 'mcp-move'].includes(s.op)).map((s) => s.to || { name: s.name, scope: s.scope });
    // a bridge whose key or URL names are not filled yet exits at its start: its status would only say so (0.4.0 Ruling 11)
    const unfilled = new Set(plan.steps.filter((s) => s.filled === false).map((s) => (s.to ? s.to.name : s.name)));
    const fresh = written.map((w) => w.name).filter((n) => !unfilled.has(n));
    const scopeOf = new Map(written.map((w) => [w.name, w.scope]));
    // a hosted keyed server fetches nothing: its status is asked now, so a refused key is named here (spec F3)
    const reconnect = (plan.reconnect || []).filter((r) => scopeOf.has(r.name));
    const now = new Set(reconnect.map((r) => r.name));
    const toFetch = report.toFetch.filter((s) => scopeOf.has(s.name)).map((s) => ({ ...s, scope: scopeOf.get(s.name) }));
    report.fetch = job(project, toFetch, toFetch.length ? fresh.filter((n) => !now.has(n)) : fresh);
    let statuses = [];
    if (!report.fetch.fetch.length) statuses = status(fresh, { cwd: project, env, runCli, log });
    else
    {
        if (now.size) statuses = status([...now], { cwd: project, env, runCli, log });
        if (fetchFile !== false)
        {
            report.fetchFile = writeJob(fetchFile || path.join(ctx.tmp, 'fetch.json'), report.fetch);
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
const REFUSED = /Server rejected the Authorization header minted by the configured headersHelper \(HTTP 40[13]\)/;
const refusedLine = ({ name, variable, hint }) => `${name}: the server refused the key in ${variable} - ${hint || 'check the value'}`;

// After the read-back: each hosted keyed server's reconnect line, then a refused key named - or, in a folder whose trust
// is not accepted, the trust line, since the helper never ran and the key never left the file.
function reconnectLines(reconnect, statuses, project)
{
    const lines = reconnect.map(reconnectLine);
    for (const r of reconnect.filter((x) => x.filled))
    {
        const st = statuses.find((x) => x.name === r.name);
        if (!st || !REFUSED.test(st.issue || '')) continue;
        lines.push(r.untrusted ? `${r.name}: accept the trust dialog the next time Claude Code starts in ${project} - until then the server connects without its key` : refusedLine(r));
    }
    return lines;
}

module.exports = { REFUSED, refusedLine, reconnectLines, apply, runStep };
