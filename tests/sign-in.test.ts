import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { world, writeJson } from './helpers.ts';
import { oauthStub, MCP_PATH } from './fake-oauth-http.ts';
import { signIn, signInCommand } from '../scripts/sign-in/sign-in.ts';
import { runSignInCommand } from '../scripts/sign-in/command.ts';
import { realRun, signInSpawnArgs } from '../scripts/sign-in/effects.ts';
import { RUN_TIMEOUT_MS } from '../scripts/sign-in/constants.ts';
import { cmdArg } from '../scripts/core/claude-cli.ts';
import type { ServerEntry } from '../scripts/core/types.ts';
import type { RunResult, SignInRun } from '../scripts/sign-in/types.ts';

const URL_OF = 'https://mcp.atlassian.com/v1/mcp';
const CUTOFF = '2026-11-11T23:59:59Z';
const entryAt = (dir: string, url = URL_OF, launch: { command: string; args: string[] } = { command: 'npx', args: ['-y', 'mcp-remote@0.16.0', url] }): ServerEntry =>
    ({ type: 'stdio', ...launch, env: { npm_config_before: CUTOFF, MCP_REMOTE_CONFIG_DIR: dir } });
// the file mcp-remote 0.16.0 writes the sign-in to: <config dir>/mcp-remote-v1/<md5 of the URL>_tokens.json (docs/sources.md)
const tokensFileOf = (dir: string, url: string) => path.join(dir, 'mcp-remote-v1', `${crypto.createHash('md5').update(url).digest('hex')}_tokens.json`);
const never: SignInRun = async () => { throw new Error('the client must not start'); };

test('signInCommand builds the client line from the registration', () => {
    const entry = entryAt('/work/shop/.alfred-tools');
    const posix = signInCommand(entry, 'darwin')!;
    assert.strictEqual(posix.command, 'npx');
    assert.deepStrictEqual(posix.args, ['-y', '-p', 'mcp-remote@0.16.0', 'mcp-remote-client', URL_OF, '--auth-timeout', '300']);
    assert.deepStrictEqual(posix.env, { npm_config_before: CUTOFF, MCP_REMOTE_CONFIG_DIR: '/work/shop/.alfred-tools' });

    const winEntry = entryAt('C:\\my work\\.alfred-tools', URL_OF, { command: 'cmd', args: ['/c', 'npx', '-y', 'mcp-remote@0.16.0', URL_OF] });
    const win = signInCommand(winEntry, 'win32')!;
    assert.strictEqual(win.command, 'cmd');
    assert.deepStrictEqual(win.args, ['/c', 'npx', '-y', '-p', 'mcp-remote@0.16.0', 'mcp-remote-client', URL_OF, '--auth-timeout', '300']);
    assert.strictEqual(win.env['MCP_REMOTE_CONFIG_DIR'], 'C:\\my work\\.alfred-tools');
    assert.strictEqual(win.env['npm_config_before'], CUTOFF);

    assert.strictEqual(signInCommand({ type: 'http', url: URL_OF }, 'darwin'), null, 'a plain http entry');
    assert.strictEqual(signInCommand({ command: 'npx', args: ['-y', 'mcp-remote@0.16.0', URL_OF] }, 'darwin'), null, 'mcp-remote with no sign-in folder is not the plugin\'s');
});

test('sign-in against the fake OAuth server stores tokens and prints none', async () => {
    const w = world();
    const oauth = await oauthStub();
    try
    {
        const url = `${oauth.base}${MCP_PATH}`;
        const root = path.join(w.project, '.alfred-tools');
        writeJson(path.join(w.project, '.mcp.json'), { mcpServers: { atlassian: entryAt(root, url) } });
        const ran: { command: string; args: string[]; env: Record<string, string | undefined> }[] = [];
        const run: SignInRun = async (command, args, options) =>
        {
            ran.push({ command, args, env: options.env });
            fs.mkdirSync(path.dirname(tokensFileOf(root, url)), { recursive: true });
            fs.writeFileSync(tokensFileOf(root, url), JSON.stringify({ access_token: 'tok-123', refresh_token: 'tok-456' }));
            return { status: 0, error: null, signal: null };
        };
        const result = await signIn('atlassian', 'project', { env: w.env, run, project: w.project });
        assert.deepStrictEqual(result, { ok: true, line: 'signed in' });
        assert.strictEqual(ran.length, 1);
        assert.strictEqual(ran[0]!.env['MCP_REMOTE_CONFIG_DIR'], root, 'the registration\'s sign-in folder reaches the client');
        assert.ok(ran[0]!.args.includes(url) && ran[0]!.args.includes('mcp-remote-client'));

        const printed: string[] = [];
        const code = await runSignInCommand(['atlassian', 'project'], { env: w.env, run, project: w.project, log: (...lines: string[]) => printed.push(...lines) });
        assert.strictEqual(code, 0);
        assert.deepStrictEqual(printed, ['atlassian: signed in']);
        assert.ok(!printed.join('\n').includes('tok-'), 'no token text is printed');
    }
    finally { await oauth.close(); w.clean(); }
});

test('sign-in names the exit code of a client that failed, and a client that exited 0 without storing a sign-in', async () => {
    const w = world();
    try
    {
        const root = path.join(w.project, '.alfred-tools');
        writeJson(path.join(w.project, '.mcp.json'), { mcpServers: { atlassian: entryAt(root) } });
        const failed = await signIn('atlassian', 'project', { env: w.env, project: w.project, run: async () => ({ status: 3, error: null, signal: null }) });
        assert.strictEqual(failed.ok, false);
        assert.match(failed.line, /exit 3/);
        const empty = await signIn('atlassian', 'project', { env: w.env, project: w.project, run: async () => ({ status: 0, error: null, signal: null }) });
        assert.strictEqual(empty.ok, false);
        assert.match(empty.line, /no sign-in was stored/);
        const timedOut = await signIn('atlassian', 'project', { env: w.env, project: w.project, run: async () => ({ status: null, error: null, signal: 'SIGTERM' }) });
        assert.strictEqual(timedOut.ok, false);
        assert.match(timedOut.line, /stopped by SIGTERM/);
        const spawnFailed = await signIn('atlassian', 'project', { env: w.env, project: w.project, run: async () => ({ status: null, error: new Error('spawn npx ENOENT'), signal: null }) });
        assert.strictEqual(spawnFailed.ok, false);
        assert.match(spawnFailed.line, /spawn npx ENOENT/);
        const printed: string[] = [];
        assert.strictEqual(await runSignInCommand(['atlassian', 'project'], { env: w.env, project: w.project, run: async () => ({ status: 3, error: null, signal: null }), log: (...lines: string[]) => printed.push(...lines) }), 1);
        assert.match(printed.join('\n'), /atlassian: .*exit 3/);
    }
    finally { w.clean(); }
});

test('sign-in refuses a server that is missing or not in the shared sign-in form, and starts nothing', async () => {
    const w = world();
    try
    {
        writeJson(path.join(w.project, '.mcp.json'), { mcpServers: { plain: { type: 'http', url: URL_OF } } });
        const missing = await signIn('nope', 'project', { env: w.env, project: w.project, run: never });
        assert.strictEqual(missing.ok, false);
        assert.match(missing.line, /no server 'nope' at project scope/);
        const plain = await signIn('plain', 'project', { env: w.env, project: w.project, run: never });
        assert.strictEqual(plain.ok, false);
        assert.match(plain.line, /not the shared sign-in/);
        assert.strictEqual(await runSignInCommand(['plain'], { env: w.env, project: w.project, run: never, log: () => {} }), 2, 'a missing scope is a usage error');
        assert.strictEqual(await runSignInCommand(['plain', 'elsewhere'], { env: w.env, project: w.project, run: never, log: () => {} }), 2, 'an unknown scope is a usage error');
    }
    finally { w.clean(); }
});

test('each command runs sign-in.ts with a timeout of 330000 or more', () => {
    for (const command of ['update', 'configure', 'install'])
    {
        const text = fs.readFileSync(path.join(import.meta.dirname, '..', 'commands', `${command}.md`), 'utf8');
        const at = text.indexOf('scripts/sign-in.ts');
        assert.ok(at >= 0, `${command}.md calls sign-in.ts`);
        const near = /timeout: (\d+)/.exec(text.slice(at, at + 1500));
        assert.ok(near && Number(near[1]) >= 330000, `${command}.md gives the sign-in call a timeout of 330000 or more`);
        const allowed = /^allowed-tools:.*$/m.exec(text);
        assert.ok(!allowed || !allowed[0].includes('sign-in.ts'), `${command}.md does not pre-approve sign-in.ts`);
    }
});

test('signInSpawnArgs: Windows is one command line read twice (cmdArg\'s two reads), POSIX the plain array', () => {
    const url = 'https://mcp.example.com/v1/mcp?a=1&b=2|c%PATH%';
    const args = ['-y', '-p', 'mcp-remote@0.16.0', 'mcp-remote-client', url, '--auth-timeout', '300'];
    const win = signInSpawnArgs('cmd', ['/c', 'npx', ...args], 'win32');
    assert.deepStrictEqual(win, { file: ['npx', ...args.map(cmdArg)].join(' '), args: [], shell: true });
    assert.ok(!win.file.includes('cmd /c'), 'no inner cmd /c, which would add a third read');
    assert.ok(!/(?<!\^)&/.test(win.file), 'the & of the URL is escaped for the shell');
    assert.deepStrictEqual(signInSpawnArgs('npx', args, 'win32'), { file: ['npx', ...args.map(cmdArg)].join(' '), args: [], shell: true }, 'a bare npx entry gives the same line');
    assert.deepStrictEqual(signInSpawnArgs('npx', args, 'darwin'), { file: 'npx', args, shell: false });
});

test('a timeout of the run itself reads as giving up on the browser, not as spawnSync ETIMEDOUT', async () => {
    const w = world();
    try
    {
        const root = path.join(w.project, '.alfred-tools');
        writeJson(path.join(w.project, '.mcp.json'), { mcpServers: { atlassian: entryAt(root) } });
        const error = Object.assign(new Error('spawnSync npx ETIMEDOUT'), { code: 'ETIMEDOUT' });
        const result = await signIn('atlassian', 'project', { env: w.env, project: w.project, run: async () => ({ status: null, error, signal: 'SIGTERM' }) });
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.line, 'sign-in failed: gave up after 300 s waiting for the browser sign-in');
        assert.ok(RUN_TIMEOUT_MS < 330000, 'the run ends before the Bash tool\'s own timeout, so its failure line is printed');
    }
    finally { w.clean(); }
});

test('a stale tokens file does not turn a failed run into a sign-in', async () => {
    const w = world();
    try
    {
        const root = path.join(w.project, '.alfred-tools');
        writeJson(path.join(w.project, '.mcp.json'), { mcpServers: { atlassian: entryAt(root) } });
        fs.mkdirSync(path.dirname(tokensFileOf(root, URL_OF)), { recursive: true });
        fs.writeFileSync(tokensFileOf(root, URL_OF), '{}');
        const result = await signIn('atlassian', 'project', { env: w.env, project: w.project, run: async () => ({ status: 1, error: null, signal: null }) });
        assert.deepStrictEqual(result, { ok: false, line: 'sign-in failed: exit 1' });
    }
    finally { w.clean(); }
});

// What mcp-remote 0.16.0 logs to stderr, as `[<pid>] <text>` (docs/sources.md, mcp-remote-client): the authorize block, then
// either 'Browser opened automatically.' or the could-not-open line. A made-up URL and a made-up token line.
const AUTHORIZE_URL = 'https://auth.example.com/authorize?response_type=code&client_id=abc&state=s1';
const PLEASE = '[4242] Please authorize this client by visiting:';
const COULD_NOT_OPEN = '[4242] Could not open a browser automatically. Please copy and paste the URL above into your browser.';
const OPENED = '[4242] Browser opened automatically.';
const OK: RunResult = { status: 0, error: null, signal: null };

// A runner that feeds the given stderr lines, then stores a sign-in for `url` unless told not to, and ends with `result`.
const feeding = (lines: string[], { root, url = URL_OF, result = OK }: { root?: string; url?: string; result?: RunResult } = {}): SignInRun => async (_command, _args, _options, onStderrLine) =>
{
    for (const line of lines) onStderrLine(line);
    if (root && result.status === 0)
    {
        fs.mkdirSync(path.dirname(tokensFileOf(root, url)), { recursive: true });
        fs.writeFileSync(tokensFileOf(root, url), '{}');
    }
    return result;
};

const withServer = async (body: (context: { w: ReturnType<typeof world>; root: string }) => Promise<void>) =>
{
    const w = world();
    try
    {
        const root = path.join(w.project, '.alfred-tools');
        writeJson(path.join(w.project, '.mcp.json'), { mcpServers: { atlassian: entryAt(root) } });
        await body({ w, root });
    }
    finally { w.clean(); }
};

test('sign-in prints the link once, on the could-not-open line, and still waits for the sign-in', async () =>
{
    await withServer(async ({ w, root }) =>
    {
        const printed: string[] = [];
        const lines = ['[4242] Using config dir: x', PLEASE, AUTHORIZE_URL, COULD_NOT_OPEN, '[4242] Waiting for authorization...'];
        const seen: string[] = [];
        const run: SignInRun = async (command, args, options, onStderrLine) =>
        {
            for (const line of lines) { onStderrLine(line); seen.push(`${line}|${printed.length}`); }
            return feeding([], { root })(command, args, options, onStderrLine);
        };
        const result = await signIn('atlassian', 'project', { env: w.env, project: w.project, run, print: (line) => printed.push(line) });
        assert.deepStrictEqual(printed, [`atlassian: no browser opened - open this link to sign in: ${AUTHORIZE_URL}`]);
        assert.deepStrictEqual(result, { ok: true, line: 'signed in' }, 'the wait goes on to the success rule');
        assert.ok(seen.find((entry) => entry.startsWith(AUTHORIZE_URL))!.endsWith('|0'), 'nothing is printed before the could-not-open line');
        assert.ok(seen.find((entry) => entry.startsWith(COULD_NOT_OPEN))!.endsWith('|1'), 'the line is printed at once on it');
    });
});

test('sign-in takes the link without the pid prefix and after a prefixed marker', async () =>
{
    await withServer(async ({ w, root }) =>
    {
        const printed: string[] = [];
        await signIn('atlassian', 'project', { env: w.env, project: w.project, print: (line) => printed.push(line), run: feeding([PLEASE, `[4242] ${AUTHORIZE_URL}`, COULD_NOT_OPEN], { root }) });
        assert.deepStrictEqual(printed, [`atlassian: no browser opened - open this link to sign in: ${AUTHORIZE_URL}`]);
    });
});

test('sign-in prints nothing when the browser opened', async () =>
{
    await withServer(async ({ w, root }) =>
    {
        const printed: string[] = [];
        const result = await signIn('atlassian', 'project', { env: w.env, project: w.project, print: (line) => printed.push(line), run: feeding([PLEASE, AUTHORIZE_URL, OPENED], { root }) });
        assert.deepStrictEqual(printed, []);
        assert.strictEqual(result.ok, true);
    });
});

test('sign-in never prints a link that is not https or does not parse', async () =>
{
    for (const bad of ['http://auth.example.com/authorize', 'javascript:alert(1)', 'file:///etc/passwd', 'not a url', '', 'tok-123 https://auth.example.com/x'])
    {
        await withServer(async ({ w, root }) =>
        {
            const printed: string[] = [];
            await signIn('atlassian', 'project', { env: w.env, project: w.project, print: (line) => printed.push(line), run: feeding([PLEASE, bad, COULD_NOT_OPEN], { root }) });
            assert.deepStrictEqual(printed, [], `printed for ${JSON.stringify(bad)}`);
        });
    }
});

test('sign-in remembers only the first link, and only the line right after the marker', async () =>
{
    await withServer(async ({ w, root }) =>
    {
        const printed: string[] = [];
        const other = 'https://elsewhere.example.com/authorize';
        const lines = ['https://early.example.com/not-after-marker', PLEASE, AUTHORIZE_URL, PLEASE, other, COULD_NOT_OPEN, COULD_NOT_OPEN];
        await signIn('atlassian', 'project', { env: w.env, project: w.project, print: (line) => printed.push(line), run: feeding(lines, { root }) });
        assert.deepStrictEqual(printed, [`atlassian: no browser opened - open this link to sign in: ${AUTHORIZE_URL}`], 'one line, the first link');
    });
});

test('no other stderr text reaches the output', async () =>
{
    await withServer(async ({ w, root }) =>
    {
        const printed: string[] = [];
        const lines = ['[4242] token: tok-123', PLEASE, AUTHORIZE_URL, '[4242] access_token=tok-123 refresh_token=tok-456', COULD_NOT_OPEN, 'Error: tok-123', '[4242] Authorization code: tok-123'];
        const code = await runSignInCommand(['atlassian', 'project'], { env: w.env, project: w.project, run: feeding(lines, { root }), log: (...out: string[]) => printed.push(...out) });
        assert.strictEqual(code, 0);
        assert.deepStrictEqual(printed, [`atlassian: no browser opened - open this link to sign in: ${AUTHORIZE_URL}`, 'atlassian: signed in']);
        assert.ok(!printed.join('\n').includes('tok-'), 'no stderr text but the link');
    });
});

test('a timeout after a link was seen adds the link to the failure line; without a link the line is as before', async () =>
{
    await withServer(async ({ w }) =>
    {
        const error = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
        const timedOut: RunResult = { status: null, error, signal: 'SIGTERM' };
        const printed: string[] = [];
        const withLink = await signIn('atlassian', 'project', { env: w.env, project: w.project, print: (line) => printed.push(line), run: feeding([PLEASE, AUTHORIZE_URL, COULD_NOT_OPEN], { result: timedOut }) });
        assert.deepStrictEqual(withLink, { ok: false, line: `sign-in failed: gave up after 300 s waiting for the browser sign-in - open ${AUTHORIZE_URL} and run it again` });
        const noLink = await signIn('atlassian', 'project', { env: w.env, project: w.project, print: (line) => printed.push(line), run: feeding(['[4242] Using config dir: x'], { result: timedOut }) });
        assert.deepStrictEqual(noLink, { ok: false, line: 'sign-in failed: gave up after 300 s waiting for the browser sign-in' });
        assert.deepStrictEqual(printed.length, 1, 'only the could-not-open run printed a line');
    });
});

const POSIX_ONLY = process.platform === 'win32' && 'NOT RUN: the real run is proved on POSIX here; the Windows route is spawnArgs\' own tests';

test('realRun hands the client\'s stderr over line by line, drops its stdout, and returns its exit code', { skip: POSIX_ONLY }, async () =>
{
    const lines: string[] = [];
    const script = 'console.log("tool list tok-123"); console.error("first"); console.error("[7] second"); process.exitCode = 3;';
    const result = await realRun(process.execPath, ['-e', script], { cwd: process.cwd(), env: process.env, timeoutMs: 30000 }, (line) => lines.push(line));
    assert.deepStrictEqual(result, { status: 3, signal: null, error: null });
    assert.deepStrictEqual(lines, ['first', '[7] second']);
});

test('realRun stops a client that outlasts the timeout and says so with ETIMEDOUT', { skip: POSIX_ONLY }, async () =>
{
    const result = await realRun(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { cwd: process.cwd(), env: process.env, timeoutMs: 300 }, () => {});
    assert.strictEqual(result.status, null);
    assert.strictEqual(result.signal, 'SIGTERM');
    assert.strictEqual((result.error as NodeJS.ErrnoException).code, 'ETIMEDOUT');
});

test('realRun reports a client that cannot start', { skip: POSIX_ONLY }, async () =>
{
    const result = await realRun('alfred-tools-no-such-client', [], { cwd: process.cwd(), env: process.env, timeoutMs: 30000 }, () => {});
    assert.ok(result.error, 'a spawn error');
});
