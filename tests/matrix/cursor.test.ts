// CURSOR AND CLAUDE CODE FROM ONE LIST (spec 2026-11-13). Real-CLI cases in a throwaway home and account, each reading
// the written files, never the exit code alone.
//
//   npm run matrix
//
// A missing runtime or no network is NOT RUN, with the reason.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import * as cli from '../../scripts/core/claude-cli.ts';
import * as account from '../../scripts/core/account.ts';
import * as kept from '../../scripts/core/kept.ts';
import * as roots from '../../scripts/roots/roots.ts';
import * as catalogLib from '../../scripts/catalog/catalog.ts';
import * as fake from '../fake-mcp-http.ts';
import * as fakeOauth from '../fake-oauth-http.ts';
import type { ServerEntry } from '../../scripts/core/types.ts';
import type { McpsList } from '../../scripts/mcps-list/types.ts';
import { Harness } from '../harness.ts';
import { keepWritten } from '../proof/matrix-keep.ts';
import { makeCtx, checkUpdates } from '../../scripts/update/check.ts';
import { applyUpdates } from '../../scripts/update/apply.ts';
import * as inventory from '../../scripts/inventory/inventory.ts';

const skipAll = cli.available() ? false : 'NOT RUN: no claude CLI on PATH';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-cursor-'));
const h = new Harness({ root });
const NETWORK = /could not resolve|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|ECONNRESET|fetch failed|network/i;
const START_MS = 600000;

const children: ChildProcess[] = [];
const stop = (child: ChildProcess) =>
{
    if (child.exitCode !== null || child.signalCode !== null) return;
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    else try { process.kill(-child.pid!, 'SIGKILL'); } catch { /* already gone */ }
};
test.after(() => { children.forEach(stop); keepWritten(root, 'cursor'); fs.rmSync(root, { recursive: true, force: true }); });

const which = (bin: string) => spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8' }).status === 0;
const expand = (s: string, env: Record<string, string | undefined>) => s.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (_: string, k: string, d: string | undefined) => (env[k] !== undefined ? env[k]! : d !== undefined ? d : ''));

// A minimal MCP client over stdio: initialize, then each request in turn. -> { ok, results?, why? }
// what a server's tools/list and tools/call answer, the parts read here
interface McpResult
{
    tools: { name: string }[];
    content?: { text?: string }[];
}
interface Session
{
    ok: boolean;
    results?: Record<number, McpResult>;
    why?: string;
}
function session(entry: ServerEntry, cwd: string, requests: { method: string; params: unknown }[], base: NodeJS.ProcessEnv = h.env)
{
    return new Promise<Session>((resolve) =>
    {
        const env = { ...base };
        for (const [k, v] of Object.entries(entry.env || {})) env[k] = expand(v, base);
        const child = spawn(expand(entry.command!, base), (entry.args || []).map((a) => expand(a, base)), { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
        children.push(child);
        const results: Record<number, McpResult> = {};
        let out = '';
        let err = '';
        const send = (msg: unknown) => child.stdin.write(`${JSON.stringify(msg)}\n`);
        const done = (r: Session) => { clearTimeout(timer); stop(child); resolve(r); };
        const timer = setTimeout(() => done({ ok: false, why: `no answer in ${START_MS / 1000}s; stderr: ${err.slice(-400)}` }), START_MS);
        child.on('error', (e) => done({ ok: false, why: e.message }));
        child.on('exit', (code) => done({ ok: false, why: `exited ${code}; stderr: ${err.slice(-600)}` }));
        child.stderr.on('data', (d) => { err += d; });
        let next = 0;
        child.stdout.on('data', (d) =>
        {
            out += d;
            const lines = out.split('\n');
            out = lines.pop()!;
            for (const line of lines)
            {
                let msg;
                try { msg = JSON.parse(line); } catch { continue; }
                if (msg.id === undefined || msg.method) continue;
                if (msg.error) return done({ ok: false, why: `request ${msg.id}: ${JSON.stringify(msg.error)}` });
                results[msg.id] = msg.result;
                if (msg.id === 0) send({ jsonrpc: '2.0', method: 'notifications/initialized' });
                if (next === requests.length) return done({ ok: true, results });
                send({ jsonrpc: '2.0', id: next + 1, ...requests[next] });
                next += 1;
            }
        });
        send({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'alfred-tools-matrix', version: '0' } } });
    });
}

const readJson = (file: string) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);
const listOf = (root: string): McpsList => readJson(path.join(root, 'mcps.json')) || { servers: [] };
const ROW = (id: string) => catalogLib.load().byId.get(id);

// Claude Code's entry for a list server, as the CLI wrote it
function claudeEntry(hh: Harness, project: string, s: { name: string; scope: string })
{
    // account's reader keys a local entry the way Claude Code does on this platform (on Windows, the path with '/')
    return account.readRegistration(s.name, s.scope, project, hh.env);
}
// Cursor's entry for a list server: the project file for project and local scope, the home's for user scope
const cursorFile = (hh: Harness, project: string, scope: string) => (scope === 'user' ? path.join(hh.home, '.cursor', 'mcp.json') : path.join(project, '.cursor', 'mcp.json'));
const cursorEntry = (hh: Harness, project: string, s: { name: string; scope: string }) => ((readJson(cursorFile(hh, project, s.scope)) || { mcpServers: {} }).mcpServers || {})[s.name];

test('M1 install for both: each entry is the same in its app files and its list; context7 helper in Claude Code, bridge in Cursor; the local one in .cursor/mcp.json with the git note', { skip: skipAll, timeout: 300000 }, (_t) =>
{
    const hh = new Harness({ root: path.join(root, 'm1') });
    const p = hh.project('m1');
    const answers = {
        clients: ['claude', 'cursor'],
        picks: {
            serena: { scope: 'project' },
            context7: { route: 'remote', scope: 'user', token: true },
            'playwright-chrome': { scope: 'local' },
            memory: { scope: 'project' },
        },
    };
    const r = hh.run(p, answers);
    assert.deepStrictEqual(r.plan.errors, [], r.rendered);
    assert.strictEqual(r.report.failed, null, `${r.rendered}\n${r.text}`);
    const projectList = listOf(path.join(p, '.alfred-tools'));
    const globalList = listOf(path.join(hh.home, '.alfred-tools'));
    const all = [...projectList.servers, ...globalList.servers];
    assert.deepStrictEqual(all.map((s) => `${s.name}~${s.scope}`).sort(), ['context7~user', 'memory~project', 'playwright-chrome~local', 'serena~project']);
    for (const s of all)
    {
        assert.deepStrictEqual(s.clients, ['claude', 'cursor'], `${s.name}: set up for both`);
        const c = claudeEntry(hh, p, s);
        const k = cursorEntry(hh, p, s);
        assert.ok(c, `${s.name}: in Claude Code at ${s.scope} scope`);
        assert.ok(k, `${s.name}: in ${cursorFile(hh, p, s.scope)}`);
        assert.deepStrictEqual(kept.maskCredentials(c, ROW(s.row!)), s.entry, `${s.name}: Claude Code's entry is the list's`);
        assert.deepStrictEqual(kept.maskCredentials(k, ROW(s.row!)), s.cursorEntry || s.entry, `${s.name}: Cursor's entry is the list's`);
    }
    const c7 = globalList.servers.find((s) => s.name === 'context7');
    assert.ok(claudeEntry(hh, p, c7!)!.headersHelper, 'context7 in Claude Code: the helper form');
    const k7 = cursorEntry(hh, p, c7!);
    assert.ok(!k7.headersHelper && k7.command === 'node' && path.basename(k7.args[0]) === 'mcp-bridge.js', `context7 in Cursor: the bridge form ${JSON.stringify(k7)}`);
    assert.ok(cursorEntry(hh, p, { name: 'playwright-chrome', scope: 'local' }), 'the local entry is in .cursor/mcp.json');
    assert.match(r.rendered, /\.cursor\/mcp\.json now holds this machine's local servers; add it to \.gitignore/);
    assert.deepStrictEqual(hh.realUntouched().changed, [], 'the real home and account are untouched');
});

// The one sign-in for both apps (spec M3, D5, F13): mcp-remote's real package, a stub vendor, and a stand-in browser
test('M3 one sign-in for both apps: one /authorize for two starts, one refresh for two renewals, a second account signs in with none', { skip: skipAll, timeout: 900000 }, async (t) =>
{
    if (process.platform !== 'darwin') return t.skip(`NOT RUN: the stand-in browser replaces macOS's open; this is ${process.platform}`);
    // mcp-remote renews a token 60 s before it ends (TOKEN_EXPIRY_MARGIN_MS): a 70 s token is due 10 s after it is issued
    const s = await fakeOauth.oauthStub({ ttl: 70 });
    try
    {
        const catalog = fakeOauth.stubOAuthCatalog(s.port);
        const hh = new Harness({ root: path.join(root, 'm3') });
        const p = hh.project('m3');
        const r = hh.run(p, { clients: ['claude', 'cursor'], picks: { atlassian: { route: 'remote', scope: 'project', token: false } } }, { catalog });
        assert.deepStrictEqual(r.plan.errors, [], r.rendered);
        assert.strictEqual(r.report.failed, null, `${r.rendered}\n${r.text}`);
        const projRoot = path.join(p, '.alfred-tools');
        const c = readJson(path.join(p, '.mcp.json')).mcpServers.atlassian;
        const k = readJson(path.join(p, '.cursor', 'mcp.json')).mcpServers.atlassian;
        assert.deepStrictEqual(k, c, 'Claude Code and Cursor hold the same entry');
        assert.strictEqual(c.env.MCP_REMOTE_CONFIG_DIR, projRoot, 'the sign-in folder is the project root');
        assert.ok(c.args.includes(`${s.base}${fakeOauth.MCP_PATH}`), JSON.stringify(c.args));

        // mcp-remote into the throwaway npm cache, as the command runs fetch.ts
        if (r.report.fetchFile)
        {
            const f = await hh.fetch(r.report.fetchFile);
            if (f.warnings.some((w) => NETWORK.test(w))) return t.skip(`NOT RUN: no network (${f.warnings[0]!.slice(0, 160)})`);
        }
        // the stand-in browser, first on PATH
        const bin = path.join(hh.root, 'browser-bin');
        fs.mkdirSync(bin, { recursive: true });
        fs.writeFileSync(path.join(bin, 'open'), fakeOauth.BROWSER_SCRIPT, { mode: 0o755 });
        const browserLog = path.join(hh.root, 'browser.log');
        const env = { ...hh.env, PATH: `${bin}${path.delimiter}${hh.env.PATH}`, PT_BROWSER_LOG: browserLog };
        const LIST = [{ method: 'tools/list', params: {} }];
        const both = () => Promise.all([session(c, p, LIST, env), session(k, p, LIST, env)]);
        const toolsOf = (g: Session) => (g.ok ? g.results![1]!.tools.map((x) => x.name) : g.why);

        // 1. both apps start together, signed out: one browser leg
        const first = await both();
        if (first.some((g) => !g.ok && NETWORK.test(g.why!) && !/127\.0\.0\.1/.test(g.why!))) return t.skip(`NOT RUN: no network (${first.map((g) => g.why).join(' | ').slice(0, 200)})`);
        t.diagnostic(`first start: hits ${JSON.stringify(s.hits)}, grants ${JSON.stringify(s.grants)}; browser: ${fs.existsSync(browserLog) ? fs.readFileSync(browserLog, 'utf8').trim() : 'never opened'}`);
        assert.deepStrictEqual(first.map(toolsOf), [['probe_tool'], ['probe_tool']], 'both list tools');
        assert.strictEqual(s.hits['/authorize'], 1, 'one sign-in for the two starts');

        // 2. the tokens are mcp-remote's files in the root, ignored by git, and sessions are denied them
        const store = path.join(projRoot, 'mcp-remote-v1');
        const names = fs.readdirSync(store); // names only - never opened
        assert.ok(names.some((n) => n.endsWith('_tokens.json')), `a tokens file in ${store}: ${names.join(', ')}`);
        const ignored = spawnSync('git', ['check-ignore', '-q', path.join(store, names.find((n) => n.endsWith('_tokens.json'))!)], { cwd: p });
        assert.strictEqual(ignored.status, 0, 'git ignores the token files');
        const settings = readJson(path.join(hh.account, 'settings.json')) || {};
        assert.ok(((settings.permissions || {}).deny || []).includes('Read(//**/mcp-remote-v1/**)'), `the deny rule: ${JSON.stringify(settings.permissions)}`);

        // 3. once the access token is due for renewal, both start together again: one renewal
        await new Promise((res) => setTimeout(res, 12000));
        const refreshBefore = s.grants.filter((g) => g === 'refresh_token').length;
        const second = await both();
        const refreshes = s.grants.filter((g) => g === 'refresh_token').length - refreshBefore;
        t.diagnostic(`second start: hits ${JSON.stringify(s.hits)}, refresh grants ${refreshes}`);
        assert.deepStrictEqual(second.map(toolsOf), [['probe_tool'], ['probe_tool']], 'both list tools after the renewal');
        assert.strictEqual(s.hits['/authorize'], 1, 'no new sign-in');
        assert.strictEqual(refreshes, 1, 'one refresh for the two starts');

        // 4. a second Claude account of the same machine user: Claude Code itself starts the project's entry, no sign-in
        const acct2 = path.join(hh.root, 'account2');
        fs.mkdirSync(acct2, { recursive: true });
        fs.writeFileSync(path.join(acct2, 'settings.json'), JSON.stringify({ enableAllProjectMcpServers: true }));
        const h2 = { env: { ...env, CLAUDE_CONFIG_DIR: acct2 } };
        fake.trust(h2, p);
        const got = await fake.claude(p, ['mcp', 'get', 'atlassian'], h2.env, 240000);
        const status = (got.out.split('\n').find((l) => /Status:/.test(l)) || '').trim();
        t.diagnostic(`second account: ${status}; hits ${JSON.stringify(s.hits)}`);
        assert.match(status, /Connected/, got.out);
        assert.strictEqual(s.hits['/authorize'], 1, 'the second account signed in with none');
        assert.deepStrictEqual(hh.realUntouched().changed, [], 'the real home and account are untouched');
    }
    finally { await s.close(); }
});

// M5's sign-in part (spec M5): on Windows the shared sign-in entry, with the `cmd /c npx` wrapper and a Windows
// MCP_REMOTE_CONFIG_DIR, starts and reaches the stub's OAuth metadata. The sign-in itself is M3's, on macOS.
test('M5 Windows: the shared sign-in entry starts through cmd /c npx and reaches the vendor\'s metadata', { skip: skipAll || (process.platform === 'win32' ? false : 'NOT RUN: Windows only - M5 runs in the Windows VM'), timeout: START_MS }, async (t) =>
{
    const s = await fakeOauth.oauthStub({ ttl: 70 });
    try
    {
        const hh = new Harness({ root: path.join(root, 'm5') });
        const p = hh.project('m5');
        const r = hh.run(p, { clients: ['claude', 'cursor'], picks: { atlassian: { route: 'remote', scope: 'project', token: false } } }, { catalog: fakeOauth.stubOAuthCatalog(s.port) });
        assert.deepStrictEqual(r.plan.errors, [], r.rendered);
        assert.strictEqual(r.report.failed, null, r.text);
        const c = readJson(path.join(p, '.mcp.json')).mcpServers.atlassian;
        assert.deepStrictEqual(readJson(path.join(p, '.cursor', 'mcp.json')).mcpServers.atlassian, c, 'the same entry in both apps');
        assert.ok(/cmd(\.exe)?$/i.test(c.command) && c.args.slice(0, 2).join(' ').toLowerCase() === '/c npx', `the cmd /c npx wrapper: ${JSON.stringify(c)}`);
        assert.strictEqual(c.env.MCP_REMOTE_CONFIG_DIR, path.join(p, '.alfred-tools'));
        if (r.report.fetchFile)
        {
            const f = await hh.fetch(r.report.fetchFile);
            if (f.warnings.some((w) => NETWORK.test(w))) return t.skip(`NOT RUN: no network (${f.warnings[0]!.slice(0, 160)})`);
        }
        const started = session(c, p, [{ method: 'tools/list', params: {} }]);
        const child = children[children.length - 1]!;
        const deadline = Date.now() + 240000;
        while (!s.hits['/.well-known/oauth-authorization-server'] && Date.now() < deadline) await new Promise((res) => setTimeout(res, 500));
        stop(child);
        await started;
        t.diagnostic(`hits ${JSON.stringify(s.hits)}`);
        assert.ok(s.hits['/.well-known/oauth-authorization-server']! >= 1, `mcp-remote reached the metadata: ${JSON.stringify(s.hits)}`);
    }
    finally { await s.close(); }
});

// Cursor's CLI: PT_CURSOR_AGENT, else `cursor-agent` on PATH. Without it M2 and M7 are NOT RUN.
function cursorAgent()
{
    if (process.env.PT_CURSOR_AGENT) return fs.existsSync(process.env.PT_CURSOR_AGENT) ? process.env.PT_CURSOR_AGENT : null;
    for (const dir of (process.env.PATH || '').split(path.delimiter))
    {
        const bin = path.join(dir, process.platform === 'win32' ? 'cursor-agent.cmd' : 'cursor-agent');
        if (dir && fs.existsSync(bin)) return bin;
    }
    return null;
}
const AGENT = cursorAgent();
const noAgent = AGENT ? false : 'NOT RUN - Cursor CLI not found (set PT_CURSOR_AGENT or put cursor-agent on PATH)';
// One `agent mcp ...` call in the case's throwaway home -> { status, out }
const agent = (hh: Harness, cwd: string, args: string[]) =>
{
    const r = spawnSync(AGENT!, ['mcp', ...args], { cwd, env: hh.env, encoding: 'utf8', timeout: START_MS });
    return { status: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
};
const SIGNED_OUT = /log ?in|sign ?in|authenticat/i;

test('M2 Cursor CLI: each server enabled starts and lists its tools; serena lists F7\'s six; context7 through the bridge; the files unchanged by enable', { skip: skipAll || noAgent, timeout: START_MS * 2 }, async (t) =>
{
    const KEY = ['pt', 'cursor', 'probe', 'key'].join('-'); // a test-only value, never printed
    const s = await fake.stub({ expected: `Bearer ${KEY}` });
    try
    {
        const catalog = fake.catalogWith((raw) =>
        {
            const remote = raw.tools.find((r) => r.id === 'context7')!.routes.remote!;
            remote.url = `http://127.0.0.1:${s.port}/mcp`;
            remote.fingerprints = [{ host: '127.0.0.1', pathPrefix: '/mcp' }];
        });
        const hh = new Harness({ root: path.join(root, 'm2') });
        const p = hh.project('m2');
        const r = hh.run(p, { clients: ['claude', 'cursor'], picks: { serena: { scope: 'project' }, context7: { route: 'remote', scope: 'user', token: true } } }, { catalog });
        assert.deepStrictEqual(r.plan.errors, [], r.rendered);
        assert.strictEqual(r.report.failed, null, r.text);
        fake.fill(path.join(hh.home, '.alfred-tools', '.mcps-secrets'), 'CONTEXT7_API_KEY', KEY);
        if (r.report.fetchFile)
        {
            const f = await hh.fetch(r.report.fetchFile);
            if (f.warnings.some((w) => NETWORK.test(w))) return t.skip(`NOT RUN: no network (${f.warnings[0]!.slice(0, 160)})`);
        }
        const files = [path.join(p, '.cursor', 'mcp.json'), path.join(hh.home, '.cursor', 'mcp.json')];
        const before = files.map((f) => fs.readFileSync(f, 'utf8'));
        for (const name of ['serena', 'context7'])
        {
            const e = agent(hh, p, ['enable', name]);
            if (SIGNED_OUT.test(e.out) && e.status !== 0) return t.skip(`NOT RUN: Cursor CLI needs a sign-in here (${e.out.trim().slice(0, 160)})`);
            assert.strictEqual(e.status, 0, e.out);
        }
        assert.deepStrictEqual(files.map((f) => fs.readFileSync(f, 'utf8')), before, 'Assumption 1: enable leaves both Cursor files byte-identical');
        const serena = agent(hh, p, ['list-tools', 'serena']);
        assert.strictEqual(serena.status, 0, serena.out);
        assert.deepStrictEqual(ALLOWED.filter((n) => !new RegExp(`\\b${n}\\b`).test(serena.out)), [], `serena lists F7's six:\n${serena.out}`);
        assert.deepStrictEqual(OTHERS.filter((n) => new RegExp(`\\b${n}\\b`).test(serena.out)), [], 'and no other');
        const s0 = s.seen.length;
        const c7 = agent(hh, p, ['list-tools', 'context7']);
        assert.strictEqual(c7.status, 0, c7.out);
        const seen = s.seen.slice(s0);
        assert.ok(seen.some((x) => x.rpc === 'tools/list' && x.auth === 'expected'), `context7 reached the stub through the bridge with its key: ${JSON.stringify(seen)}`);
        assert.deepStrictEqual(hh.realUntouched().changed, [], 'the real home and account are untouched');
    }
    finally { await s.close(); }
});

// A workspace (spec D4a, F12): a root whose record names two child repos, serena at the root's project scope
test('M7 a workspace under Cursor CLI: each child lists the root\'s serena, the root lists it once; a plain-folder member of a root repo lists the root\'s and gets the note', { skip: skipAll || noAgent, timeout: START_MS }, (t) =>
{
    const hh = new Harness({ root: path.join(root, 'm7') });
    const writeRecord = (dir: string, doc: unknown) => { fs.mkdirSync(path.join(dir, '.alfred'), { recursive: true }); fs.writeFileSync(path.join(dir, '.alfred', 'workspace.json'), JSON.stringify(doc)); };
    const listed = (cwd: string) => agent(hh, cwd, ['list']).out.split('\n').filter((l) => /^\s*serena\b/.test(l)).length;
    for (const rootInGit of [false, true])
    {
        const ws = path.join(hh.projects, rootInGit ? 'ws-git' : 'ws-plain');
        fs.mkdirSync(ws, { recursive: true });
        if (rootInGit) spawnSync('git', ['init', '-q', ws]);
        const children = rootInGit ? ['a', 'b', 'c'] : ['a', 'b'];
        writeRecord(ws, { role: 'root', children });
        for (const c of children)
        {
            const dir = path.join(ws, c);
            fs.mkdirSync(dir, { recursive: true });
            if (c !== 'c') spawnSync('git', ['init', '-q', dir]); // c: a plain folder of the root's repo
            writeRecord(dir, { parent: '..' });
        }
        const wsReal = fs.realpathSync(ws);
        const r = hh.run(wsReal, { clients: ['claude', 'cursor'], picks: { serena: { scope: 'project' } } });
        assert.deepStrictEqual(r.plan.errors, [], r.rendered);
        assert.strictEqual(r.report.failed, null, r.text);
        const first = agent(hh, wsReal, ['list']);
        if (SIGNED_OUT.test(first.out) && first.status !== 0) return t.skip(`NOT RUN: Cursor CLI needs a sign-in here (${first.out.trim().slice(0, 160)})`);
        assert.strictEqual(listed(wsReal), 1, `the root lists serena once:\n${first.out}`);
        for (const c of children) assert.strictEqual(listed(path.join(wsReal, c)), 1, `${c} lists the root's serena (root ${rootInGit ? 'in git' : 'not in git'})`);
        if (rootInGit)
        {
            const own = hh.run(path.join(wsReal, 'c'), { clients: ['claude', 'cursor'], picks: { memory: { scope: 'project' } } });
            assert.deepStrictEqual(own.plan.errors, [], own.rendered);
            assert.match(own.rendered, /is a folder of .*'s git repo; Cursor's CLI reads .*\.cursor\/mcp\.json there/);
        }
    }
    assert.deepStrictEqual(hh.realUntouched().changed, [], 'the real home and account are untouched');
});

// The last release before 0.5.0 (0.4.0, main at 2026-11-13): M6 installs with its own code, taken from git
const V040 = '2e6e0ead8a83c1fc52b89bb86c25563adf1a585b';
const HUD = 'claude-hud@claude-hud';
const TSL = 'typescript-lsp@claude-plugins-official';

test('M6 update from 0.4.x: the list with the own entry, serena\'s context and base modes, two uninstall offers with one declined, Cursor offered once and declined, the key-file deny rule', { skip: skipAll, timeout: START_MS * 2 }, async (t) =>
{
    const repo = path.join(import.meta.dirname, '..', '..');
    const old = path.join(root, 'm6-040');
    fs.mkdirSync(old, { recursive: true });
    // no shell: git writes the tarball and tar (bsdtar on Windows 10 and later) unpacks it
    const tarball = path.join(root, 'm6-040.tar');
    const archive = spawnSync('git', ['-C', repo, 'archive', '-o', tarball, V040], { encoding: 'utf8' });
    const unpack = archive.status === 0 ? spawnSync('tar', ['-xf', tarball, '-C', old], { encoding: 'utf8' }) : null;
    if (archive.status !== 0) return t.skip(`NOT RUN: 0.4.0 (${V040.slice(0, 7)}) is not in this checkout: ${String(archive.stderr || archive.error || '').trim().slice(0, 160)}`);
    if (unpack!.status !== 0) return t.skip(`NOT RUN: tar could not unpack 0.4.0: ${String(unpack!.stderr || unpack!.error || '').trim().slice(0, 160)}`);
    const { Harness: Harness040 } = createRequire(import.meta.url)(path.join(old, 'tests', 'harness.js')); // 0.4.0 is CommonJS
    const world = path.join(root, 'm6');
    const oh = new Harness040({ root: world });
    const hh = new Harness({ root: world });
    const p = oh.project('m6');
    // 0.4.0 writes its root under the former name; update moves it first (spec D3)
    const oldRoot = path.join(p, '.preferred-tools');
    const projRoot = path.join(p, '.alfred-tools');

    // 1. a 0.4.0 install: serena, github with the helper, context7 (left on its own next), the two retired plugins
    const first = oh.run(p, { picks: { serena: { scope: 'project' }, github: { route: 'remote', scope: 'project' }, context7: { route: 'remote', scope: 'project' }, 'typescript-lsp': { scope: 'project' }, 'claude-hud': { scope: 'user' } }, hud: 'defer' });
    assert.deepStrictEqual(first.plan.errors, [], first.rendered);
    if (first.report.failed && NETWORK.test(first.report.failed.detail || '')) return t.skip(`NOT RUN: no network for the plugins (${first.report.failed.detail.slice(0, 160)})`);
    assert.strictEqual(first.report.failed, null, first.text);
    const left = oh.run(p, { existing: { 'mcp:context7~project': 'own' } });
    assert.strictEqual(left.report.failed, null, left.text);
    assert.ok(fs.existsSync(path.join(oldRoot, roots.FILES.record)), '0.4.0 wrote its record');
    const serena040 = readJson(path.join(p, '.mcp.json')).mcpServers.serena;
    assert.strictEqual(serena040.args[serena040.args.indexOf('--context') + 1], 'claude-code', '0.4.0\'s serena context');
    assert.ok(fs.existsSync(path.join(oldRoot, '.mcps-secrets')), 'github\'s key file in the project root');
    // serena's first start under 0.4.0 (its own fetch.ts) writes serena_config.yml with Serena's default base modes
    const config = path.join(serena040.env.SERENA_HOME, 'serena_config.yml');
    let started: string | null = 'NOT RUN (the base modes only): uvx not on PATH';
    if (which('uvx') && first.report.fetchFile)
    {
        const f0 = await oh.fetch(first.report.fetchFile);
        if (f0.warnings.some((w: string) => NETWORK.test(w))) started = `NOT RUN (the base modes only): no network (${f0.warnings[0].slice(0, 160)})`;
        else
        {
            assert.deepStrictEqual(f0.warnings, [], f0.text);
            assert.ok(!/^base_modes: \[\]\r?$/m.test(fs.readFileSync(config, 'utf8')), '0.4.0 leaves Serena\'s default base modes');
            started = null;
        }
    }
    fs.mkdirSync(path.join(hh.home, '.cursor'), { recursive: true }); // Cursor is on this machine

    // 2. 0.5.0's update, as the command runs it
    const checkNow = async () =>
    {
        const inv = inventory.buildInventory({ project: p, env: hh.env, run: cli.runClaude, data: hh.data });
        const ctx = makeCtx({ inventory: inv, project: p, env: hh.env, refresh: false, data: hh.data });
        return { ctx, found: await checkUpdates(ctx) };
    };
    // the move alone first: the rest waits for the folder (spec D3), and the command checks again on RECHECK
    const first040 = await checkNow();
    assert.deepStrictEqual([...new Set(first040.found.offers.map((o) => o.fix))], ['root-move'], 'only the move is offered');
    const moveLines: string[] = [];
    const moved = applyUpdates(first040.ctx, first040.found.offers.map((o) => o.id), first040.found, { tmp: path.join(world, 'tmp-move'), log: (...a) => moveLines.push(a.join(' ')) });
    assert.deepStrictEqual(moved.failed, [], moveLines.join('\n'));
    assert.match(moveLines.join('\n'), /RECHECK - the folders moved; checking again/);
    assert.ok(!fs.existsSync(oldRoot) && fs.existsSync(projRoot), 'the root moved');
    const { ctx, found } = await checkNow();
    const retired = found.offers.filter((o) => o.fix === 'retired-plugin').map((o) => `${o.name}~${o.scope}`).sort();
    assert.deepStrictEqual(retired, [`${HUD}~user`, `${TSL}~project`], 'two uninstall offers');
    assert.deepStrictEqual(found.cursorOffers.map((o) => o.root), [projRoot], 'Cursor offered once, for the project root');
    const lines: string[] = [];
    // 'Pick which' with claude-hud's uninstall left unpicked - the decline (commands/update.md); every other offer picked
    const picked = found.offers.filter((o) => !(o.fix === 'retired-plugin' && o.name === HUD)).map((o) => o.id);
    const res = applyUpdates(ctx, picked, found, { tmp: path.join(world, 'tmp'), log: (...a) => lines.push(a.join(' ')), input: { 'retired-declined': `${HUD}~user`, [`cursor-offer:${projRoot}`]: 'declined' } });
    const text = lines.join('\n');
    assert.deepStrictEqual(res.failed, [], text);

    // the list: every managed server, the own entry moved in, the old record kept aside, Cursor's 'Not now'
    const list = listOf(projRoot);
    assert.deepStrictEqual(list.servers.map((s) => s.name).sort(), ['github', 'serena'], text);
    assert.ok(list.servers.every((s) => s.clients.length === 1 && s.clients[0] === 'claude'), 'Claude Code only until Cursor is taken');
    assert.ok((list.own || []).some((e) => e.name === 'context7' && e.scope === 'project' && e.choice === 'own'), JSON.stringify(list.own));
    assert.ok(!fs.existsSync(path.join(projRoot, roots.FILES.record)) && fs.existsSync(path.join(projRoot, `${roots.FILES.record}.0.4.bak`)), 'the record renamed .0.4.bak');
    assert.strictEqual(list.cursorOffer, 'declined');
    // serena on the context file, in its home (the home moved with the root)
    const serena = readJson(path.join(p, '.mcp.json')).mcpServers.serena;
    assert.strictEqual(serena.args[serena.args.indexOf('--context') + 1], path.join(projRoot, 'serena', 'serena-context.yml'));
    assert.ok(fs.existsSync(path.join(projRoot, 'serena', 'serena-context.yml')));
    // the plugins: typescript-lsp uninstalled, claude-hud kept and its decline recorded
    const plugins = JSON.parse(cli.runClaude(['plugin', 'list', '--json'], { cwd: p, env: hh.env }).stdout || '[]');
    const ids: string[] = plugins.map((x: { id: string; scope: string }) => `${x.id}~${x.scope}`);
    assert.ok(ids.includes(`${HUD}~user`) && !ids.some((i) => i.startsWith(`${TSL}~`)), ids.join(', '));
    assert.deepStrictEqual(readJson(path.join(hh.data, 'retired-declined.json')).declined, [{ id: HUD, scope: 'user' }]);
    // Cursor untouched, the key-file deny rule added
    assert.ok(!fs.existsSync(path.join(p, '.cursor', 'mcp.json')) && !fs.existsSync(path.join(hh.home, '.cursor', 'mcp.json')), 'no Cursor file written');
    const settings = readJson(path.join(hh.account, 'settings.json')) || {};
    assert.ok(((settings.permissions || {}).deny || []).includes('Read(//**/.mcps-secrets)'), JSON.stringify(settings.permissions));

    // 3. a second update offers neither the declined plugin nor Cursor
    const again = (await checkNow()).found;
    assert.deepStrictEqual(again.offers.filter((o) => o.fix === 'retired-plugin'), [], 'no uninstall offer comes back');
    assert.deepStrictEqual(again.cursorOffers, [], 'Cursor is not asked again');

    // 4. serena's base modes, emptied by the serena-base-modes upgrade
    if (started) return t.skip(started);
    assert.ok(/^base_modes: \[\]\r?$/m.test(fs.readFileSync(path.join(projRoot, path.relative(oldRoot, config)), 'utf8')), `base_modes: [] (only that key is read, never printed)\n${text}`);
    assert.deepStrictEqual(hh.realUntouched().changed, [], 'the real home and account are untouched');
});

// F7: the six the context allows
const ALLOWED = ['initial_instructions', 'get_symbols_overview', 'find_symbol', 'find_referencing_symbols', 'find_implementations', 'find_declaration'];
// Serena 2.1.0's other tools, the ones its manual must not name once base_modes is [] (F9)
const OTHERS = ['replace_symbol_body', 'rename_symbol', 'insert_after_symbol', 'insert_before_symbol', 'safe_delete_symbol', 'search_for_pattern',
    'read_file', 'create_text_file', 'list_dir', 'find_file', 'replace_content', 'execute_shell_command', 'write_memory', 'read_memory',
    'list_memories', 'delete_memory', 'edit_memory', 'activate_project', 'onboarding', 'check_onboarding_performed', 'get_current_config'];

test('M4 serena\'s manual names no tool outside the allow-list', { skip: skipAll, timeout: START_MS * 2 }, async (t) =>
{
    if (!which('uvx')) return t.skip('NOT RUN: uvx not on PATH');
    const p = h.project('m4-serena');
    fs.writeFileSync(path.join(p, 'index.ts'), 'export function greet(name: string): string { return `hi ${name}`; }\n');
    const r = h.run(p, { picks: { serena: { scope: 'local' } } });
    assert.deepStrictEqual(r.plan.errors, []);
    assert.strictEqual(r.report.failed, null, r.text);
    const reg = h.inventory(p).registrations.find((x) => x.name === 'serena' && x.scope === 'local');
    assert.ok(reg, 'read back from the account file');
    const a = reg.entry.args!;
    if (a[a.indexOf('--enable-web-dashboard') + 1] !== 'false') return t.skip('NOT RUN: the registration does not turn the web dashboard off, so starting it would open a browser');
    const ctxFile = a[a.indexOf('--context') + 1]!;
    assert.ok(fs.existsSync(ctxFile) && ctxFile.endsWith('serena-context.yml'), `the context file the registration names is there: ${ctxFile}`);
    // fetch.ts as the command runs it: the fetch, the first start (serena writes serena_config.yml), then base_modes: []
    const f = await h.fetch(r.report.fetchFile!);
    if (f.warnings.some((w) => NETWORK.test(w))) return t.skip(`NOT RUN: no network (${f.warnings[0]!.slice(0, 160)})`);
    assert.deepStrictEqual(f.warnings, [], f.text);
    const config = path.join(reg.entry.env!.SERENA_HOME!, 'serena_config.yml');
    assert.ok(/^base_modes: \[\]\r?$/m.test(fs.readFileSync(config, 'utf8')), 'fetch.js set base_modes: [] (only the key is read here, never printed)');

    const got = await session(reg.entry, p, [
        { method: 'tools/list', params: {} },
        { method: 'tools/call', params: { name: 'initial_instructions', arguments: {} } },
    ]);
    if (!got.ok && NETWORK.test(got.why!)) return t.skip(`NOT RUN: no network (${got.why!.slice(0, 160)})`);
    assert.ok(got.ok, `serena did not answer: ${got.why}`);
    assert.deepStrictEqual(got.results![1]!.tools.map((x) => x.name).sort(), [...ALLOWED].sort(), 'tools/list is exactly F7\'s six');
    const manual = (got.results![2]!.content || []).map((c) => c.text || '').join('\n');
    assert.ok(manual.length > 200, `the manual came back (${manual.length} characters)`);
    const named = OTHERS.filter((n) => new RegExp(`\\b${n}\\b`).test(manual));
    assert.deepStrictEqual(named, [], 'the manual names no tool outside the allow-list');
    t.diagnostic(`serena on ${process.platform}: six tools, a manual of ${manual.length} characters naming none of the others`);
    h.claude(p, ['mcp', 'remove', 'serena', '-s', 'local']);
});
