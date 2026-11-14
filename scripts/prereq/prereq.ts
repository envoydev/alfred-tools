#!/usr/bin/env node
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
import type { Catalog, CatalogPackage } from '../catalog/types.ts';
import type { Answers } from '../plan/types.ts';
import type { AuditResult, CheckResult, PrereqCheck, PrereqCtx, PrereqPick, PrereqReport, ToolCheck } from './types.ts';

const versionOf = (text: unknown): string | null => (/(\d+\.\d+(?:\.\d+)?)/.exec(String(text || '')) || [])[1] || null;

// Each check -> { ok, found, install?: { command?, url, note? } }. `ctx` = { platform, env, home, machine }.
export const CHECKS: Record<string, PrereqCheck | undefined> = {
    uvx: (context: PrereqCtx): CheckResult =>
    {
        const bin = context.machine.which('uvx');
        const version = bin && versionOf((context.machine.run('uvx', ['--version']) || {}).stdout);
        return bin ? { ok: true, found: `uvx ${version || ''}`.trim() } : { ok: false, install: { url: 'https://docs.astral.sh/uv/getting-started/installation/' } };
    },
    npx: (context: PrereqCtx): CheckResult =>
    {
        const bin = context.machine.which('npx');
        return bin ? { ok: true, found: `npx at ${bin}` } : { ok: false, install: { url: 'https://nodejs.org/en/download' } };
    },
    'browser-chrome': (context: PrereqCtx) => browser(context, 'chrome'),
    'browser-msedge': (context: PrereqCtx) => browser(context, 'msedge'),
    'docker-or-github-binary': (context: PrereqCtx): CheckResult =>
    {
        if (context.machine.which('docker')) return { ok: true, found: 'docker (the image route)', machine: { docker: true } };
        if (context.machine.which('github-mcp-server')) return { ok: true, found: 'github-mcp-server binary (no Docker: the binary route)', machine: { docker: false } };
        return { ok: false, install: { url: 'https://docs.docker.com/get-started/get-docker/', note: "or the vendor's github-mcp-server binary: https://github.com/github/github-mcp-server/releases" }, machine: { docker: true } };
    },
    'android-sdk': (context: PrereqCtx): CheckResult =>
    {
        const sdkFolder = androidSdk(context);
        return sdkFolder ? { ok: true, found: sdkFolder } : { ok: false, install: { url: 'https://developer.android.com/studio', note: "Android Studio's SDK Manager, or the command-line tools" } };
    },
    jdk: (context: PrereqCtx): CheckResult =>
    {
        const home = javaHome(context);
        return home ? { ok: true, found: home } : { ok: false, install: { url: 'https://adoptium.net/', note: 'any JDK, for example Eclipse Temurin' } };
    },
};

// The branded browser Playwright's chrome / msedge channels drive. Where it lives is the vendor installers' default.
function browser(context: PrereqCtx, which: string): CheckResult
{
    const { env, machine: machine, platform } = context;
    const pathApi = platform === 'win32' ? path.win32 : path.posix;
    const names = which === 'chrome' ? { mac: 'Google Chrome', bins: ['google-chrome', 'google-chrome-stable'], win: ['Google', 'Chrome', 'chrome.exe'] } : { mac: 'Microsoft Edge', bins: ['microsoft-edge', 'microsoft-edge-stable'], win: ['Microsoft', 'Edge', 'msedge.exe'] };
    let found: string | null | undefined = null;
    if (platform === 'darwin') found = [`/Applications/${names.mac}.app`, pathApi.join(context.home, 'Applications', `${names.mac}.app`)].find((appFolder) => machine.exists(appFolder));
    else if (platform === 'linux') { const binary = names.bins.map((binaryName) => machine.which(binaryName)).find(Boolean); found = binary || null; }
    else
    {
        const roots = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA].filter(Boolean);
        found = roots.map((programRoot) => pathApi.join(programRoot!, names.win[0]!, names.win[1]!, 'Application', names.win[2]!)).find((appFolder) => machine.exists(appFolder));
    }
    const label = which === 'chrome' ? 'Google Chrome' : 'Microsoft Edge';
    return found ? { ok: true, found } : { ok: false, install: { url: which === 'chrome' ? 'https://www.google.com/chrome/' : 'https://www.microsoft.com/edge/download', note: `${label} is not installed; or name a browser binary at the browser ask` } };
}

// -> { ok, counts: { critical, high, moderate, low, total }, note } for one npm package at its pinned version
export function auditPrereqs(packageSpec: CatalogPackage, context: PrereqCtx): AuditResult
{
    const machine = context.machine;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-audit-'));
    const tail = (result: { stderr?: string; stdout?: string } | null | undefined): string => String((result && (result.stderr || result.stdout)) || 'no output').trim().split('\n').slice(-2).join(' | ');
    try
    {
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'pt-audit', version: '1.0.0', private: true, dependencies: { [packageSpec.name]: packageSpec.version } }));
        const lock = machine.run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-fund', '--no-audit'], { cwd: dir, env: { npm_config_before: packageSpec.cutoff } });
        if (!lock || lock.status !== 0) return { ok: false, note: `audit not run: npm install --package-lock-only failed: ${tail(lock)}` };
        // `npm audit` exits non-zero when it finds something; the JSON on stdout is the answer
        const auditRun = machine.run('npm', ['audit', '--json'], { cwd: dir });
        let vulnerabilities: { critical?: number; high?: number; moderate?: number; low?: number; total?: number };
        try { vulnerabilities = JSON.parse(auditRun!.stdout).metadata.vulnerabilities; } catch { return { ok: false, note: `audit not run: npm audit gave no result: ${tail(auditRun)}` }; }
        return { ok: true, counts: { critical: vulnerabilities.critical || 0, high: vulnerabilities.high || 0, moderate: vulnerabilities.moderate || 0, low: vulnerabilities.low || 0, total: vulnerabilities.total || 0 } };
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// -> { tools: [{ row, route, needs: [{ id, ok, found, install }], audit? }], missing: n, machine }
export function checkPrereqs(picks: PrereqPick[], context: PrereqCtx, catalog: Catalog = catalogLib.load(), { withAudit = false }: { withAudit?: boolean } = {}): PrereqReport
{
    const out: PrereqReport = { tools: [], missing: 0, machine: {} };
    for (const { row: rowId, route } of picks)
    {
        const row = catalog.byId.get(rowId);
        if (!row) continue;
        const ids: string[] = row.kind === 'plugin' ? (row as { prereqs?: string[] }).prereqs || [] : (row.routes[route!] || {} as { prereqs?: string[] }).prereqs || [];
        const needs = ids.map((id) =>
        {
            const prereqCheck = CHECKS[id];
            if (!prereqCheck) throw new Error(`${rowId}: prerequisite '${id}' has no check in prereq.ts`);
            const result = prereqCheck(context);
            if (result.machine) Object.assign(out.machine, result.machine);
            return { id, ok: result.ok, found: result.found || null, install: result.install || null };
        });
        out.missing += needs.filter((need) => !need.ok).length;
        const tool: ToolCheck = { row: rowId, route: row.kind === 'plugin' ? null : route, needs };
        const routeDefinition = row.kind === 'mcp' ? row.routes[route!] : null;
        if (withAudit && routeDefinition && routeDefinition.audit && routeDefinition.package && routeDefinition.package.registry === 'npm') tool.audit = { package: `${routeDefinition.package.name}@${routeDefinition.package.version}`, ...auditPrereqs(routeDefinition.package, context) };
        out.tools.push(tool);
    }
    return out;
}

export function renderPrereqs(report: PrereqReport): string
{
    const lines: string[] = [];
    for (const tool of report.tools)
    {
        if (tool.audit) lines.push(tool.audit.ok ? `${tool.row}: audit - ${tool.audit.package} has ${tool.audit.counts!.total} known vulnerabilities in its dependency tree (${tool.audit.counts!.critical} critical, ${tool.audit.counts!.high} high, ${tool.audit.counts!.moderate} moderate, ${tool.audit.counts!.low} low)` : `${tool.row}: audit - ${tool.audit.note}`);
        if (!tool.needs.length) { lines.push(`${tool.row}${tool.route ? ` (${tool.route})` : ''}: nothing to check`); continue; }
        for (const need of tool.needs)
        {
            lines.push(`${tool.row}${tool.route ? ` (${tool.route})` : ''}: ${need.id} - ${need.ok ? `ok${need.found ? `, ${need.found}` : ''}` : `MISSING${need.found ? ` (${need.found})` : ''}`}`);
            if (!need.ok && need.install)
            {
                if (need.install.command) lines.push(`    install: ${need.install.command}`);
                if (need.install.url) lines.push(`    see: ${need.install.url}`);
                if (need.install.note) lines.push(`    ${need.install.note}`);
            }
        }
    }
    lines.push('', report.missing ? `prereq: ${report.missing} missing` : 'prereq: all present');
    return lines.join('\n');
}

export function picksFrom(argv: string[], catalog: Catalog): PrereqPick[] | null
{
    const rows = argv.indexOf('--rows');
    if (rows >= 0) return (argv[rows + 1] || '').split(',').filter(Boolean).map((id) => ({ row: id, route: (catalog.byId.get(id) || {} as { recommendedRoute?: string }).recommendedRoute }));
    const file = argv.find((argument) => !argument.startsWith('--'));
    if (!file) return null;
    const answers: Answers = JSON.parse(fs.readFileSync(file, 'utf8'));
    // a configure change needs a check only when it moves to another route; the route it keeps is already running
    const changed = Object.values(answers.change || {}).filter((change) => change && change.row && change.route).map((change) => ({ row: change!.row!, route: change!.route }));
    return Object.entries(answers.picks || {}).map(([id, pick]) => ({ row: id, route: (pick && pick.route) || (catalog.byId.get(id) || {} as { recommendedRoute?: string }).recommendedRoute })).concat(changed);
}

