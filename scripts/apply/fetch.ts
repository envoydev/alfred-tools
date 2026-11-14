#!/usr/bin/env node
// FETCH - the slow half of an apply: fills the runtime caches for what apply.js just registered, starts each new server
// once, then asks the CLI for each status.
//
//   node fetch.js <fetch.json>
//
// apply.js (and update.js, fix.js) write fetch.json once the registrations are written and read back. Claude Code gives a
// server 30 seconds to answer its first start, and a first start can take minutes - measured on macOS, memory's package
// came down in about 6 s and its first start then took 110 s more, downloading its embedding model, while its second
// and third starts took 2 s. So each server is first fetched (its package, image or tool environment) and then started
// once as the CLI wrote it, with no 30-second limit, and stopped once it answers `initialize`. That outlasts the Bash
// tool's 2-minute default, so the command runs this in the background and the apply itself is never cut off halfway.
//
// One server at a time: two first installs of the same runtime at once is the one case that broke a start (an npx
// cache entry left without its package.json). A failed fetch or start is a warning, never a change: the registration
// stays, and its first session start tries again. `claude mcp get` comes last, so its own 30-second health check meets a
// filled cache instead of starting a download it then kills.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import * as cli from '../core/claude-cli.ts';
import * as account from '../core/account.ts';
import * as kept from '../core/kept.ts';
import { expandVars } from '../entries/locations.ts';
import { bridgeParts } from '../entries/entry.ts';
import { signInParts } from '../entries/sign-in.ts';
import * as serenaConfig from './serena-config.ts';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import type { Env, ServerEntry } from '../core/types.ts';
import type { FetchJob, FetchOptions, FetchRun, JobStep, Log, RunCli, StartResult, Status } from './types.ts';

export const VERSION = 1;
const START_MS = 600000;
const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'preferred-tools', version: '0' } } };
// ${VAR} and ${VAR:-default}, as Claude Code expands them in an MCP entry (entries.js expandVars)
export const expandedText = (text: unknown, env: Env): string => expandVars(text, env).value;
// the first ${VAR} with no default that is not set: a start without it only fails
export const unsetVar = (entry: ServerEntry, env: Env): string | null => [...JSON.stringify([entry.command, entry.args || [], entry.env || {}]).matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((match) => match[1]!).find((variableName) => env[variableName] === undefined) || null;

// The runtime itself (npm, uvx, docker), never the claude CLI, and with no limit of Claude Code's. On Windows it goes
// through the shell so npm.cmd resolves.
export const realFetch = (argv: string[], { cwd, env }: { cwd: string; env: Env }) => spawnSync(argv[0]!, argv.slice(1), { cwd, env, encoding: 'utf8', timeout: 1800000, windowsHide: true, shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });

// A server and everything it started: TERM, then KILL after 5 s (Windows: taskkill /T /F). -> Promise, once it is gone
function stopTree(child: ChildProcessByStdio<Writable, Readable, Readable>): Promise<void>
{
    return new Promise<void>((resolve) =>
    {
        if (child.exitCode !== null || child.signalCode !== null) return resolve();
        if (process.platform === 'win32') { spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }); return resolve(); }
        const kill = (signal: NodeJS.Signals) => { try { process.kill(-child.pid!, signal); } catch { /* already gone */ } };
        const hard = setTimeout(() => { kill('SIGKILL'); resolve(); }, 5000);
        child.once('exit', () => { clearTimeout(hard); kill('SIGKILL'); resolve(); });
        kill('SIGTERM');
    });
}

// The server started exactly as written - command, args and env, ${VAR} expanded - and sent `initialize` over stdio,
// as Claude Code's first start sends it. -> Promise<{ ok, ms, why? }>
export function realStart(entry: ServerEntry, { cwd, env, ms: timeoutMilliseconds = START_MS }: { cwd: string; env: Env; ms?: number }): Promise<StartResult>
{
    return new Promise((resolve) =>
    {
        const childEnv: Env = { ...env };
        for (const [variableName, value] of Object.entries(entry.env || {})) childEnv[variableName] = expandedText(value, env);
        const startedAt = Date.now();
        let child: ChildProcessByStdio<Writable, Readable, Readable>;
        try { child = spawn(expandedText(entry.command, env), (entry.args || []).map((argument) => expandedText(argument, env)), { cwd, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true }); }
        catch (caught) { const error = caught as NodeJS.ErrnoException; resolve({ ok: false, ms: 0, why: error.message }); return; }
        let out = '';
        let err = '';
        let settled = false;
        const done = (result: { ok: boolean; why?: string }) =>
        {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            const took = Date.now() - startedAt;
            stopTree(child).then(() => resolve({ ...result, ms: took }));
        };
        const timer = setTimeout(() => done({ ok: false, why: `no answer in ${timeoutMilliseconds / 1000}s` }), timeoutMilliseconds);
        child.on('error', (error) => done({ ok: false, why: error.message }));
        child.on('exit', (code) => done({ ok: false, why: `exited ${code} before answering${err.trim() ? `: ${err.trim().split('\n').slice(-1)[0]}` : ''}` }));
        child.stdin.on('error', () => { /* it exited; 'exit' says so */ });
        child.stderr.on('data', (chunk) => { err = `${err}${chunk}`.slice(-4000); });
        child.stdout.on('data', (chunk) =>
        {
            const lines = `${out}${chunk}`.split('\n');
            out = lines.pop()!;
            for (const line of lines)
            {
                let msg: { id?: unknown; result?: unknown; error?: unknown };
                try { msg = JSON.parse(line); } catch { continue; }
                if (msg.id === 1) return done(msg.result ? { ok: true } : { ok: false, why: `initialize error: ${JSON.stringify(msg.error)}` });
            }
        });
        child.stdin.write(`${JSON.stringify(INIT)}\n`);
    });
}

// -> the job apply.js hands over: { version, project, fetch: [fetch steps, each with the scope it was written at], check: [server names] }
export const fetchJob = (project: string, fetch: JobStep[], check: string[]): FetchJob => ({ version: VERSION, project, fetch, check: [...new Set(check)] });

// Each step's argv and env as kept.js keeps them, so the file a command line names holds no live credential: a download
// needs none (a kept value expands to ''), and the first start reads the registration itself.
// `append` adds to a fetch file already there (fix: a registration's fetch, then a machine fix's): its steps are kept
// already, so only the new ones go through kept.maskCredentials.
export function writeJob(file: string, job: FetchJob, { append = false }: { append?: boolean } = {}): string
{
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const prior: FetchJob | null = append && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    const fetch = job.fetch.map((step) => { const keptStep = kept.maskCredentials({ args: step.argv, env: step.env }, null); return { ...step, argv: keptStep.args, env: keptStep.env }; });
    const out = prior ? { ...prior, fetch: [...prior.fetch, ...fetch], check: [...new Set([...prior.check, ...job.check])] } : { ...job, fetch };
    fs.writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
    return file;
}

// The lines apply.js prints for the command: the file, and what fetch.js will do with it.
export const nextLines = (file: string, job: FetchJob): string[] => [
    `Fetch next, in the background (a first download can take minutes): ${file}`,
    `  fetches ${job.fetch.map((step) => step.what).join(', ')} and starts each once, then reports the status of ${job.check.join(', ')} (claude mcp get)`,
];

// Each server's status line as `claude mcp get` prints it - a health check of up to 30 s each. -> [{ name, out }]
export function serverStatus(names: string[], { cwd, env, runCli = cli.runClaude, log = console.log }: { cwd: string; env: Env; runCli?: RunCli; log?: Log }): Status[]
{
    if (names.length) log('', 'Status, from the CLI:');
    return names.map((name) =>
    {
        const result = runCli(['mcp', 'get', name], { cwd, env });
        const lines = `${result.stdout || ''}${result.stderr || ''}`.trim().split('\n').map((line) => line.trim()).filter(Boolean);
        const out = lines.find((line) => /^Status:/i.test(line)) || lines.slice(-1)[0] || '(no output)';
        log(`  ${name}: ${out}`);
        // the CLI's reason for a failed connection (2.1.322): matched by apply.js REFUSED, never printed - it may quote a body
        return { name, out, issue: lines.find((line) => /^Issue:/i.test(line)) || null };
    });
}

// -> Promise<{ fetched: [what], started: [name], skipped: [line], warnings: [detail], status: [{ name, out }] }>
export async function runFetchJob(job: FetchJob, { env = process.env, runFetch = realFetch, start = realStart, runCli = cli.runClaude, log = console.log }: FetchOptions = {}): Promise<FetchRun>
{
    const report: FetchRun = { fetched: [], started: [], skipped: [], warnings: [], status: [] };
    const cwd = job.project;
    const warn = (stepNumber: number, detail: string) => { report.warnings.push(detail); log(`${stepNumber}. warn   ${detail}`); };
    for (const [i, step] of job.fetch.entries())
    {
        const stepNumber = i + 1;
        const stepEnv: Env = { ...env };
        for (const [variableName, value] of Object.entries(step.env || {})) stepEnv[variableName] = expandedText(value, env);
        log(`${stepNumber}. ...    fetching ${step.what} for '${step.name}'`);
        const startedAt = Date.now();
        const result = runFetch(step.argv, { cwd, env: stepEnv });
        if (result.error || result.status !== 0)
        {
            const why = result.error ? result.error.message : `exit ${result.status}: ${`${result.stderr || ''}${result.stdout || ''}`.trim().split('\n').slice(-2).join(' | ')}`;
            warn(stepNumber, `could not fetch ${step.what} for '${step.name}' (${why}) - the registration stays; its first start fetches it and may time out once`);
            continue;
        }
        report.fetched.push(step.what);
        log(`${stepNumber}. ok     ${step.what} is in the cache (${Math.round((Date.now() - startedAt) / 1000)}s)`);

        // the first start, as written: whatever it downloads or builds on top of the package happens now. `from` names
        // the parent folder whose .mcp.json holds a server this folder inherits (fix's npx-cache-entry); it starts here.
        const entry = step.scope ? account.readRegistration(step.name, step.scope, step.from || cwd, env) : undefined;
        if (!entry || !entry.command) { warn(stepNumber, `'${step.name}' is not at ${step.scope || 'a known'} scope any more - not started`); continue; }
        // a bridge's first start would only run the package just fetched - and reach the hosted server with the key
        if (bridgeParts(entry))
        {
            const line = `'${step.name}' not started: a bridge has no first-run work beyond its package`;
            report.skipped.push(line);
            log(`${stepNumber}. skip   ${line}`);
            continue;
        }
        // the shared sign-in form (D5): its first start opens a browser to sign in, which is the user's to do in an app
        if (signInParts(entry))
        {
            const line = `'${step.name}' not started: its first start opens the sign-in, which belongs to Claude Code or Cursor`;
            report.skipped.push(line);
            log(`${stepNumber}. skip   ${line}`);
            continue;
        }
        const missing = unsetVar(entry, env);
        if (missing)
        {
            const line = `'${step.name}' not started: \${${missing}} is not set - its first session start with it set does the first-run work`;
            report.skipped.push(line);
            log(`${stepNumber}. skip   ${line}`);
            continue;
        }
        log(`${stepNumber}. ...    starting '${step.name}' once (a first start can download more, such as a model)`);
        const startResult = await start(entry, { cwd, env });
        if (startResult.ok)
        {
            report.started.push(step.name);
            log(`${stepNumber}. ok     '${step.name}' answered its first start in ${(startResult.ms / 1000).toFixed(1)}s`);
            // serena wrote its settings at that start: base_modes: [] (D7), where the home is one the plugin may edit
            const home = step.row === 'serena' && entry.env && entry.env.SERENA_HOME;
            if (home && serenaConfig.editableHome(home, { platform: process.platform }).ok)
                log(`${stepNumber}. ok     ${serenaConfig.emptyBaseModes(serenaConfig.configOf(home)).detail}`);
        }
        else warn(stepNumber, `'${step.name}' did not answer its first start (${startResult.why}) - the registration stays; its first session start tries again`);
    }
    report.status = serverStatus(job.check, { cwd, env, runCli, log });
    log('', report.warnings.length
        ? `Done, with ${report.warnings.length} warning${report.warnings.length > 1 ? 's' : ''}. Restart Claude Code now so the registrations load.`
        : 'Done. Restart Claude Code now so the registrations load.');
    return report;
}

