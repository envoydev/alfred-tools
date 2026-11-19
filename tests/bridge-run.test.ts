// mcp-bridge.js, bridge 4 - the run mode: `--run <ENV>=<KEY_NAME>[?] [<global root>] -- <command> [<args>...]` reads one
// stdio key from the .mcps-secrets chain at each start and starts the command with it in its environment only. Every
// case copies the bridge (and, where it matters, the helper) into its own temp folder, and builds each fake key value at
// run time from parts; the fake server (tests/fake-mcp-server.ts) logs whether it holds a variable, never its value.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import * as keys from '../scripts/keys/keys.ts';

const BRIDGE = path.join(import.meta.dirname, '..', 'scripts', 'copied', 'mcp-bridge.js');
const HELPER = path.join(import.meta.dirname, '..', 'scripts', 'copied', 'mcp-headers.js');
const FAKE = path.join(import.meta.dirname, 'fake-mcp-server.ts');
const requireCopied = createRequire(import.meta.url);
const KEY = ['fake', 'run', 'value', String(process.pid)].join('-');
const GITHUB = 'GITHUB_PERSONAL_ACCESS_TOKEN';
const CONTEXT7 = 'CONTEXT7_API_KEY';
const USAGE_START = 'mcp-bridge: usage: node mcp-bridge.js --run';
const sec = (dir: string) => path.join(dir, '.mcps-secrets');
const put = (file: string, text: string) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const logged = (log: string) => fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const bridge = () => requireCopied(BRIDGE);

function world({ withHelper = true } = {})
{
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pt-bridge-run-')));
    const project = path.join(dir, 'project');
    const root = path.join(project, '.alfred-tools');
    const global = path.join(dir, 'global');
    const home = path.join(dir, 'home');
    for (const d of [root, global, home]) fs.mkdirSync(d, { recursive: true });
    fs.copyFileSync(BRIDGE, path.join(root, 'mcp-bridge.js'));
    if (withHelper) fs.copyFileSync(HELPER, path.join(root, 'mcp-headers.js'));
    const log = path.join(dir, 'server.jsonl');
    const env = (extra: NodeJS.ProcessEnv = {}) =>
    {
        // a key the user's own shell holds must not reach a case that expects the name unset
        const { [GITHUB]: _github, [CONTEXT7]: _context7, ...rest } = process.env;
        return { ...rest, HOME: home, USERPROFILE: home, ...extra };
    };
    const run = (argv: string[], extra?: NodeJS.ProcessEnv) => spawnSync(process.execPath, [path.join(root, 'mcp-bridge.js'), ...argv], { cwd: project, encoding: 'utf8', env: env(extra), input: '' });
    const inner = [process.execPath, FAKE, 'answer', '--log', log, '--tag', 't'];
    return { dir, project, root, global, home, log, inner, run, clean: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('the run mode starts the server with the key in its environment only', () => {
    const w = world();
    try
    {
        put(sec(w.global), `${GITHUB}=${KEY}\n`);
        const r = w.run(['--run', `${GITHUB}=${GITHUB}`, w.global, '--', ...w.inner], { FAKE_MCP_LOG_ENV: GITHUB });
        assert.strictEqual(r.status, 0, r.stderr);
        assert.deepStrictEqual(logged(w.log)[0].env, [`env:${GITHUB}=set`]);
        assert.ok(!r.stdout.includes(KEY) && !r.stderr.includes(KEY));
    }
    finally { w.clean(); }
});

test('an optional key filled nowhere starts the server without it', () => {
    const w = world();
    try
    {
        const r = w.run(['--run', `${CONTEXT7}=${CONTEXT7}?`, w.global, '--', ...w.inner], { FAKE_MCP_LOG_ENV: CONTEXT7 });
        assert.strictEqual(r.status, 0, r.stderr);
        assert.deepStrictEqual(logged(w.log)[0].env, [`env:${CONTEXT7}=unset`]);
    }
    finally { w.clean(); }
});

test('a required key filled nowhere exits 1 naming the name and the files, before the server starts', () => {
    const w = world();
    try
    {
        const r = w.run(['--run', `${GITHUB}=${GITHUB}`, w.global, '--', ...w.inner]);
        assert.strictEqual(r.status, 1);
        assert.strictEqual(r.stderr, `mcp-bridge: no value for ${GITHUB} in ${sec(w.root)}, ${sec(w.global)}\n`);
        assert.ok(!fs.existsSync(w.log), 'the server never started');
    }
    finally { w.clean(); }
});

test('a usage error exits 2 before any file is read', () => {
    const w = world({ withHelper: false });
    try
    {
        const bad = [['1BAD=K', '--', 'node'], ['PT_BRIDGE_AUTH=K', '--', 'node'], ['E=K', 'node'], ['E=K', '--'], ['E=K', 'a', 'b', '--', 'node']];
        for (const argv of bad)
        {
            const r = w.run(['--run', ...argv]);
            assert.strictEqual(r.status, 2, `${argv.join(' ')}: ${r.stderr}`);
            assert.ok(r.stderr.startsWith(USAGE_START), r.stderr);
        }
    }
    finally { w.clean(); }
});

test("the child's exit code is the bridge's", () => {
    const w = world();
    try
    {
        put(sec(w.global), `${GITHUB}=${KEY}\n`);
        const r = w.run(['--run', `${GITHUB}=${GITHUB}`, w.global, '--', process.execPath, '-e', 'process.exit(7)']);
        assert.strictEqual(r.status, 7, r.stderr);
    }
    finally { w.clean(); }
});

test('runChain reads the files keys.stdioChain names, at Local and at Global', () => {
    const projectRoot = path.join(os.tmpdir(), 'pt-run-chain', 'project');
    const globalRoot = path.join(os.tmpdir(), 'pt-run-chain', 'global');
    assert.deepStrictEqual(bridge().runChain(projectRoot, globalRoot), keys.stdioChain({ scope: 'local', projectRoot, globalRoot }));
    assert.deepStrictEqual(bridge().runChain(globalRoot, null), keys.stdioChain({ scope: 'user', projectRoot: null, globalRoot }));
    assert.deepStrictEqual(bridge().runChain(globalRoot, globalRoot), [sec(globalRoot)], 'duplicates are dropped');
});

test('on win32 a bare npx runs through ComSpec, and cmd or an .exe on the PATH runs as is', () => {
    const w = world();
    try
    {
        const env = { HOME: w.home, ComSpec: 'C:\\Windows\\system32\\cmd.exe', PATH: 'C:\\bin' };
        const at = (command: string, exists: (file: string) => boolean) => bridge().runLaunch([`${CONTEXT7}=${CONTEXT7}?`, '--', command, '-y', 'pkg@1'], env, { dir: w.root, platform: 'win32', exists });
        assert.deepStrictEqual([at('npx', () => false).command, at('npx', () => false).args], ['C:\\Windows\\system32\\cmd.exe', ['/d', '/c', 'npx', '-y', 'pkg@1']]);
        assert.deepStrictEqual([at('cmd', () => false).command, at('cmd', () => false).args], ['cmd', ['-y', 'pkg@1']]);
        assert.strictEqual(at('docker', (file) => file === 'C:\\bin\\docker.exe').command, 'docker');
        assert.strictEqual(at('C:\\Program Files\\x\\server.exe', () => false).command, 'C:\\Program Files\\x\\server.exe');
    }
    finally { w.clean(); }
});

test('hand-written .mcps-secrets lines give the exact value', () => {
    const w = world();
    try
    {
        const value = `${KEY}=a b#c`;
        for (const text of [`\uFEFFNAME=${value}\r\n`, `export NAME="${value}"\n`, `NAME='${value}' # note\n`])
        {
            put(sec(w.root), text);
            const r = bridge().runLaunch(['NAME=NAME', '--', 'node'], { HOME: w.home }, { dir: w.root, platform: 'darwin' });
            assert.ok(!r.error, 'the line was read');
            assert.ok(r.childEnv.NAME === value, 'the value is exact');
        }
    }
    finally { w.clean(); }
});

test('a shell value for the ENV does not stand in for a required key, and passes through for an optional one', () => {
    const w = world();
    try
    {
        const env = { HOME: w.home, [GITHUB]: KEY };
        const required = bridge().runLaunch([`${GITHUB}=${GITHUB}`, '--', 'node'], env, { dir: w.root, platform: 'darwin' });
        assert.strictEqual(required.code, 1);
        assert.ok(!required.error.includes(KEY), 'the error names no value');
        const optional = bridge().runLaunch([`${GITHUB}=${GITHUB}?`, '--', 'node'], env, { dir: w.root, platform: 'darwin' });
        assert.ok(!optional.error, optional.error);
        assert.ok(optional.childEnv[GITHUB] === KEY, 'the shell value passes through');
    }
    finally { w.clean(); }
});

test('the URL mode is unchanged by the run mode', () => {
    const w = world();
    try
    {
        put(sec(w.root), 'SENTRY_ORG=acme\n');
        put(sec(w.global), `SENTRY_ACCESS_TOKEN=${KEY}\n`);
        const r = bridge().launch(['https://mcp.sentry.dev/mcp/{SENTRY_ORG}', 'SENTRY_ACCESS_TOKEN', 'Sentry-Bearer', 'mcp-remote@0.16.0', w.global], { HOME: w.home }, { dir: w.root, platform: 'darwin' });
        assert.ok(!r.error, r.error);
        assert.deepStrictEqual(r.args, ['-y', 'mcp-remote@0.16.0', 'https://mcp.sentry.dev/mcp/acme', '--header', 'Authorization:${PT_BRIDGE_AUTH}', '--transport', 'http-only']);
        assert.strictEqual(r.command, 'npx');
    }
    finally { w.clean(); }
});
