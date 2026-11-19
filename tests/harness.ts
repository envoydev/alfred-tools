#!/usr/bin/env node
// THE TEMP-PROJECT HARNESS - runs the plugin's scripts against the REAL `claude` CLI in a throwaway world, with no model
// in the loop. The walk's asks are stood in for by an answers object fed to plan.ts and apply.ts, so every matrix case is
// a script run.
//
//   node tests/harness.ts --root <scratch dir>
//
// ISOLATION. Every child gets HOME (and USERPROFILE) and CLAUDE_CONFIG_DIR inside the root, so the CLI reads and writes
// there. Before anything runs, `isolationCheck` proves it: a probe registration at user scope must land in the throwaway
// account file and leave the real account files byte-identical (hashed here, never printed). If the CLI wrote to the
// real account, user-scope cases are not run.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as inventory from '../scripts/inventory/inventory.ts';
import { plan } from '../scripts/plan/plan.ts';
import { renderPlan } from '../scripts/plan/render.ts';
import { apply } from '../scripts/apply/run.ts';
import { runFetchJob } from '../scripts/apply/fetch.ts';
import * as account from '../scripts/core/account.ts';
import * as cli from '../scripts/core/claude-cli.ts';
import type { Answers, Plan, PlanOptions } from '../scripts/plan/types.ts';
import type { ApplyReport, FetchRun } from '../scripts/apply/types.ts';
import type { Inventory } from '../scripts/inventory/types.ts';
import type { Catalog } from '../scripts/catalog/types.ts';
import type { CliResult } from '../scripts/core/types.ts';
import { TOKEN_VARS, withKeychainStub } from './helpers.ts';

// what Harness.run hands back: the apply's report, or a stand-in marked skipped when the plan held errors
export type RunReport = ApplyReport & { skipped?: boolean };
export interface HarnessRun
{
    inv: Inventory;
    plan: Plan;
    report: RunReport;
    text: string;
    rendered: string;
}

// the REAL home, taken from the OS (not from HOME, which the harness overrides for its children)
export const REAL_HOME = os.userInfo().homedir;
const REAL_FILES = [
    path.join(REAL_HOME, '.claude.json'),
    path.join(REAL_HOME, '.claude', 'settings.json'),
    path.join(REAL_HOME, '.claude', 'plugins', 'installed_plugins.json'),
];
// claude-hud keeps runtime caches in its folder (daily-cost.json, speed-cache/, transcript-cursors/) that a live session's
// statusline rewrites every few seconds, so the folder as a whole can never be byte-identical. Only the two files the
// plugin's settings step could touch are watched.
const HUD_DIR = path.join(REAL_HOME, '.claude', 'plugins', 'claude-hud');
REAL_FILES.push(path.join(HUD_DIR, 'config.json'), path.join(HUD_DIR, 'previous-statusline.txt'));
const REAL_TREES: string[] = [];

export function hashTree(p: string)
{
    const h = crypto.createHash('sha256');
    const walk = (d: string): void =>
    {
        let entries;
        try { entries = fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); } catch { h.update(`missing:${d}`); return; }
        for (const e of entries)
        {
            const f = path.join(d, e.name);
            if (e.isDirectory()) { h.update(`d:${e.name}`); walk(f); }
            else { try { h.update(`f:${e.name}:`); h.update(fs.readFileSync(f)); } catch { h.update(`unreadable:${e.name}`); } }
        }
    };
    walk(p);
    return h.digest('hex');
}

function hashFile(f: string)
{
    try { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); } catch { return 'missing'; }
}

export const snapshot = () => Object.fromEntries([...REAL_FILES.map((f) => [f, hashFile(f)]), ...REAL_TREES.map((t) => [t, hashTree(t)])]);

export class Harness
{
    declare root: string;
    declare home: string;
    declare account: string;
    declare projects: string;
    declare data: string;
    declare env: NodeJS.ProcessEnv;
    declare before: Record<string, string>;

    constructor({ root }: { root: string })
    {
        fs.mkdirSync(root, { recursive: true });
        this.root = fs.realpathSync(root);
        this.home = path.join(this.root, 'home');
        this.account = path.join(this.root, 'account');
        this.projects = path.join(this.root, 'projects');
        // the plugin's data folder, as ${CLAUDE_PLUGIN_DATA}: the roots map lives here
        this.data = path.join(this.root, 'data');
        for (const d of [this.home, this.account, this.projects, this.data]) fs.mkdirSync(d, { recursive: true });
        this.env = withKeychainStub(this.root, { ...process.env, HOME: this.home, USERPROFILE: this.home, CLAUDE_CONFIG_DIR: this.account });
        for (const k of Object.keys(this.env)) if (k.startsWith('FAKE_CLAUDE') || k.startsWith('FAKE_RUNTIME')) delete this.env[k];
        // the key variables come from a case itself, never from the shell running the matrix (the plan's defaults read them)
        for (const k of TOKEN_VARS) delete this.env[k];
        // the start limit too: a Claude Code session whose settings hold it passes it to every command it runs
        delete this.env['MCP_TIMEOUT'];
        this.before = snapshot();
    }

    // fetch.ts on the file an apply wrote, with the real runtimes and the real CLI in the throwaway world. The
    // registration cases leave it out (they prove what is written); tests/matrix/starts.test.ts runs it before each start.
    async fetch(file: string): Promise<FetchRun & { text: string }>
    {
        const lines: string[] = [];
        const res = await runFetchJob(JSON.parse(fs.readFileSync(file, 'utf8')), { env: this.env, log: (...a) => lines.push(a.join(' ')) });
        return { ...res, text: lines.join('\n') };
    }

    // a throwaway project (git init, as a real project would be)
    project(name: string)
    {
        const dir = path.join(this.projects, name);
        fs.mkdirSync(dir, { recursive: true });
        if (!fs.existsSync(path.join(dir, '.git'))) spawnSync('git', ['init', '-q', dir]);
        return fs.realpathSync(dir);
    }

    claude(project: string, args: string[]): CliResult { return cli.runClaude(args, { cwd: project, env: this.env }); }

    // `catalog`: a case's own copy (a hosted route pointed at a stub), used by the inventory's matching as by the plan
    inventory(project: string, { catalog }: { catalog?: Catalog | undefined } = {}) { return inventory.buildInventory({ project, env: this.env, data: this.data, ...(catalog ? { catalog } : {}) }); }

    // inventory -> plan -> apply, in-process, against the real CLI in the throwaway world. The plan reads the inventory
    // as inventory.ts writes it - every credential value kept - so the apply puts each one back from the registration it
    // reads, as the commands do.
    run(project: string, answers: Answers, { planOpts = {}, tmp, catalog }: { planOpts?: PlanOptions; tmp?: string | undefined; catalog?: Catalog | undefined } = {}): HarnessRun
    {
        const inv = inventory.keptOf(this.inventory(project, { catalog }));
        const p = plan(inv, answers, { home: this.home, env: this.env, ...(catalog ? { catalog } : {}), ...planOpts });
        const lines: string[] = [];
        const report: RunReport = p.errors.length
            ? { applied: [], failed: null, notRun: [], readback: [], noop: false, skipped: true } as unknown as RunReport
            : apply(p, { env: this.env, tmp: tmp || path.join(this.root, 'tmp'), data: this.data, log: (...a) => lines.push(a.join(' ')) });
        return { inv, plan: p, report, text: lines.join('\n'), rendered: renderPlan(p) };
    }

    realUntouched()
    {
        const now = snapshot();
        const changed = Object.keys(now).filter((k) => now[k] !== this.before[k]);
        return { ok: changed.length === 0, changed };
    }

    // every file under the root (for token scans)
    files()
    {
        const out: string[] = [];
        const walk = (d: string): void => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : out.push(path.join(d, e.name))));
        walk(this.root);
        return out;
    }
}

// Proves the isolation before any case runs. Returns { ok, lines }.
export function isolationCheck(h: Harness)
{
    const lines = [];
    const project = h.project('isolation');
    const a = h.claude(project, ['mcp', 'add-json', 'isolation-probe', JSON.stringify({ command: 'echo', args: ['probe'] }), '-s', 'user']);
    const file = account.accountFile(h.env);
    const wrote = fs.existsSync(file) && /isolation-probe/.test(fs.readFileSync(file, 'utf8'));
    lines.push(`claude mcp add-json exit ${a.status}; the throwaway account file ${wrote ? 'holds the probe' : 'does NOT hold the probe'}`);
    const real = h.realUntouched();
    lines.push(real.ok ? 'real account files and claude-hud config: byte-identical' : `REAL ACCOUNT CHANGED: ${real.changed.join(', ')}`);
    h.claude(project, ['mcp', 'remove', 'isolation-probe', '-s', 'user']);
    // the no-op case: nothing picked, so nothing applies
    const r = h.run(project, { picks: {} });
    lines.push(`no-op case: ${r.report.noop ? 'no claude call made' : 'UNEXPECTED CALLS'}`);
    const real2 = h.realUntouched();
    lines.push(real2.ok ? 'after the no-op case: real account still byte-identical' : `REAL ACCOUNT CHANGED: ${real2.changed.join(', ')}`);
    return { ok: a.status === 0 && wrote && real.ok && r.report.noop && real2.ok, lines };
}

function main(argv: string[])
{
    const at = argv.indexOf('--root');
    const root = at >= 0 ? argv[at + 1]! : path.join(os.tmpdir(), `alfred-tools-harness-${Date.now()}`);
    const h = new Harness({ root });
    const r = isolationCheck(h);
    console.log(r.lines.join('\n'));
    console.log(r.ok ? 'harness: PASS - the CLI writes in the throwaway account only' : 'harness: FAIL - user-scope cases must not run');
    return r.ok ? 0 : 1;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
