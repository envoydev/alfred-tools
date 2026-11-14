#!/usr/bin/env node
// @ts-nocheck - typed in Task 12
// PREREQUISITES - what each picked tool needs on this machine, checked read-only.
//
//   node prereq.js <answers.json> [--json] [--audit]   the tools in answers.picks, each on its picked route, and each
//                                                      answers.change entry that names a new route
//   node prereq.js --rows serena,github [--json]  rows on their recommended route
//
// A check looks at the machine and installs nothing. A missing one prints how to get it: a command only where the
// vendor's docs gave one (docs/sources.md), else the vendor's install page. `--json` prints the findings and, under
// `machine`, the facts the plan needs (docker: false picks github's binary fallback). `--audit` also runs `npm audit` on
// each npm package a row marks `audit` - in a temp folder, with --ignore-scripts and the row's cut-off, so what is audited is
// what npx would resolve - and reports the counts; it needs the network, and a failure says 'audit not run', never 'clean'.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as catalogLib from '../catalog/catalog.ts';
import { androidSdk, javaHome } from '../fix/registration.ts';

const versionOf = (text) => (/(\d+\.\d+(?:\.\d+)?)/.exec(String(text || '')) || [])[1] || null;

// Each check -> { ok, found, install?: { command?, url, note? } }. `ctx` = { platform, env, home, machine }.
export const CHECKS = {
    uvx: (ctx) =>
    {
        const bin = ctx.machine.which('uvx');
        const v = bin && versionOf((ctx.machine.run('uvx', ['--version']) || {}).stdout);
        return bin ? { ok: true, found: `uvx ${v || ''}`.trim() } : { ok: false, install: { url: 'https://docs.astral.sh/uv/getting-started/installation/' } };
    },
    npx: (ctx) =>
    {
        const bin = ctx.machine.which('npx');
        return bin ? { ok: true, found: `npx at ${bin}` } : { ok: false, install: { url: 'https://nodejs.org/en/download' } };
    },
    'browser-chrome': (ctx) => browser(ctx, 'chrome'),
    'browser-msedge': (ctx) => browser(ctx, 'msedge'),
    'docker-or-github-binary': (ctx) =>
    {
        if (ctx.machine.which('docker')) return { ok: true, found: 'docker (the image route)', machine: { docker: true } };
        if (ctx.machine.which('github-mcp-server')) return { ok: true, found: 'github-mcp-server binary (no Docker: the binary route)', machine: { docker: false } };
        return { ok: false, install: { url: 'https://docs.docker.com/get-started/get-docker/', note: "or the vendor's github-mcp-server binary: https://github.com/github/github-mcp-server/releases" }, machine: { docker: true } };
    },
    'android-sdk': (ctx) =>
    {
        const sdk = androidSdk(ctx);
        return sdk ? { ok: true, found: sdk } : { ok: false, install: { url: 'https://developer.android.com/studio', note: "Android Studio's SDK Manager, or the command-line tools" } };
    },
    jdk: (ctx) =>
    {
        const home = javaHome(ctx);
        return home ? { ok: true, found: home } : { ok: false, install: { url: 'https://adoptium.net/', note: 'any JDK, for example Eclipse Temurin' } };
    },
};

// The branded browser Playwright's chrome / msedge channels drive. Where it lives is the vendor installers' default.
function browser(ctx, which)
{
    const { env, machine: m, platform } = ctx;
    const P = platform === 'win32' ? path.win32 : path.posix;
    const names = which === 'chrome' ? { mac: 'Google Chrome', bins: ['google-chrome', 'google-chrome-stable'], win: ['Google', 'Chrome', 'chrome.exe'] } : { mac: 'Microsoft Edge', bins: ['microsoft-edge', 'microsoft-edge-stable'], win: ['Microsoft', 'Edge', 'msedge.exe'] };
    let found = null;
    if (platform === 'darwin') found = [`/Applications/${names.mac}.app`, P.join(ctx.home, 'Applications', `${names.mac}.app`)].find((p) => m.exists(p));
    else if (platform === 'linux') { const b = names.bins.map((n) => m.which(n)).find(Boolean); found = b || null; }
    else
    {
        const roots = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA].filter(Boolean);
        found = roots.map((r) => P.join(r, names.win[0], names.win[1], 'Application', names.win[2])).find((p) => m.exists(p));
    }
    const label = which === 'chrome' ? 'Google Chrome' : 'Microsoft Edge';
    return found ? { ok: true, found } : { ok: false, install: { url: which === 'chrome' ? 'https://www.google.com/chrome/' : 'https://www.microsoft.com/edge/download', note: `${label} is not installed; or name a browser binary at the browser ask` } };
}

// -> { ok, counts: { critical, high, moderate, low, total }, note } for one npm package at its pinned version
export function audit(pkg, ctx)
{
    const m = ctx.machine;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-audit-'));
    const tail = (r) => String((r && (r.stderr || r.stdout)) || 'no output').trim().split('\n').slice(-2).join(' | ');
    try
    {
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'pt-audit', version: '1.0.0', private: true, dependencies: { [pkg.name]: pkg.version } }));
        const lock = m.run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-fund', '--no-audit'], { cwd: dir, env: { npm_config_before: pkg.cutoff } });
        if (!lock || lock.status !== 0) return { ok: false, note: `audit not run: npm install --package-lock-only failed: ${tail(lock)}` };
        // `npm audit` exits non-zero when it finds something; the JSON on stdout is the answer
        const au = m.run('npm', ['audit', '--json'], { cwd: dir });
        let v;
        try { v = JSON.parse(au.stdout).metadata.vulnerabilities; } catch { return { ok: false, note: `audit not run: npm audit gave no result: ${tail(au)}` }; }
        return { ok: true, counts: { critical: v.critical || 0, high: v.high || 0, moderate: v.moderate || 0, low: v.low || 0, total: v.total || 0 } };
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// -> { tools: [{ row, route, needs: [{ id, ok, found, install }], audit? }], missing: n, machine }
export function check(picks, ctx, catalog = catalogLib.load(), { withAudit = false } = {})
{
    const out = { tools: [], missing: 0, machine: {} };
    for (const { row: rowId, route } of picks)
    {
        const row = catalog.byId.get(rowId);
        if (!row) continue;
        const ids = row.kind === 'plugin' ? row.prereqs || [] : (row.routes[route] || {}).prereqs || [];
        const needs = ids.map((id) =>
        {
            const fn = CHECKS[id];
            if (!fn) throw new Error(`${rowId}: prerequisite '${id}' has no check in prereq.ts`);
            const r = fn(ctx);
            if (r.machine) Object.assign(out.machine, r.machine);
            return { id, ok: r.ok, found: r.found || null, install: r.install || null };
        });
        out.missing += needs.filter((n) => !n.ok).length;
        const tool = { row: rowId, route: row.kind === 'plugin' ? null : route, needs };
        const def = row.kind === 'mcp' ? row.routes[route] : null;
        if (withAudit && def && def.audit && def.package && def.package.registry === 'npm') tool.audit = { package: `${def.package.name}@${def.package.version}`, ...audit(def.package, ctx) };
        out.tools.push(tool);
    }
    return out;
}

export function render(res)
{
    const lines = [];
    for (const t of res.tools)
    {
        if (t.audit) lines.push(t.audit.ok ? `${t.row}: audit - ${t.audit.package} has ${t.audit.counts.total} known vulnerabilities in its dependency tree (${t.audit.counts.critical} critical, ${t.audit.counts.high} high, ${t.audit.counts.moderate} moderate, ${t.audit.counts.low} low)` : `${t.row}: audit - ${t.audit.note}`);
        if (!t.needs.length) { lines.push(`${t.row}${t.route ? ` (${t.route})` : ''}: nothing to check`); continue; }
        for (const n of t.needs)
        {
            lines.push(`${t.row}${t.route ? ` (${t.route})` : ''}: ${n.id} - ${n.ok ? `ok${n.found ? `, ${n.found}` : ''}` : `MISSING${n.found ? ` (${n.found})` : ''}`}`);
            if (!n.ok && n.install)
            {
                if (n.install.command) lines.push(`    install: ${n.install.command}`);
                if (n.install.url) lines.push(`    see: ${n.install.url}`);
                if (n.install.note) lines.push(`    ${n.install.note}`);
            }
        }
    }
    lines.push('', res.missing ? `prereq: ${res.missing} missing` : 'prereq: all present');
    return lines.join('\n');
}

export function picksFrom(argv, catalog)
{
    const rows = argv.indexOf('--rows');
    if (rows >= 0) return (argv[rows + 1] || '').split(',').filter(Boolean).map((id) => ({ row: id, route: (catalog.byId.get(id) || {}).recommendedRoute }));
    const file = argv.find((a) => !a.startsWith('--'));
    if (!file) return null;
    const answers = JSON.parse(fs.readFileSync(file, 'utf8'));
    // a configure change needs a check only when it moves to another route; the route it keeps is already running
    const changed = Object.values(answers.change || {}).filter((c) => c && c.row && c.route).map((c) => ({ row: c.row, route: c.route }));
    return Object.entries(answers.picks || {}).map(([id, p]) => ({ row: id, route: (p && p.route) || (catalog.byId.get(id) || {}).recommendedRoute })).concat(changed);
}

