import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { world, writeJson } from './helpers.ts';
import { oauthStub, MCP_PATH } from './fake-oauth-http.ts';
import { signIn, signInCommand } from '../scripts/sign-in/sign-in.ts';
import { runSignInCommand } from '../scripts/sign-in/command.ts';
import { signInSpawnArgs } from '../scripts/sign-in/effects.ts';
import { RUN_TIMEOUT_MS } from '../scripts/sign-in/constants.ts';
import { cmdArg } from '../scripts/core/claude-cli.ts';
import type { ServerEntry } from '../scripts/core/types.ts';
import type { SignInRun } from '../scripts/sign-in/types.ts';

const URL_OF = 'https://mcp.atlassian.com/v1/mcp';
const CUTOFF = '2026-11-11T23:59:59Z';
const entryAt = (dir: string, url = URL_OF, launch: { command: string; args: string[] } = { command: 'npx', args: ['-y', 'mcp-remote@0.16.0', url] }): ServerEntry =>
    ({ type: 'stdio', ...launch, env: { npm_config_before: CUTOFF, MCP_REMOTE_CONFIG_DIR: dir } });
// the file mcp-remote 0.16.0 writes the sign-in to: <config dir>/mcp-remote-v1/<md5 of the URL>_tokens.json (docs/sources.md)
const tokensFileOf = (dir: string, url: string) => path.join(dir, 'mcp-remote-v1', `${crypto.createHash('md5').update(url).digest('hex')}_tokens.json`);
const never: SignInRun = () => { throw new Error('the client must not start'); };

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
        const run: SignInRun = (command, args, options) =>
        {
            ran.push({ command, args, env: options.env });
            fs.mkdirSync(path.dirname(tokensFileOf(root, url)), { recursive: true });
            fs.writeFileSync(tokensFileOf(root, url), JSON.stringify({ access_token: 'tok-123', refresh_token: 'tok-456' }));
            return { status: 0, error: null, signal: null };
        };
        const result = signIn('atlassian', 'project', { env: w.env, run, project: w.project });
        assert.deepStrictEqual(result, { ok: true, line: 'signed in' });
        assert.strictEqual(ran.length, 1);
        assert.strictEqual(ran[0]!.env['MCP_REMOTE_CONFIG_DIR'], root, 'the registration\'s sign-in folder reaches the client');
        assert.ok(ran[0]!.args.includes(url) && ran[0]!.args.includes('mcp-remote-client'));

        const printed: string[] = [];
        const code = runSignInCommand(['atlassian', 'project'], { env: w.env, run, project: w.project, log: (...lines: string[]) => printed.push(...lines) });
        assert.strictEqual(code, 0);
        assert.deepStrictEqual(printed, ['atlassian: signed in']);
        assert.ok(!printed.join('\n').includes('tok-'), 'no token text is printed');
    }
    finally { await oauth.close(); w.clean(); }
});

test('sign-in names the exit code of a client that failed, and a client that exited 0 without storing a sign-in', () => {
    const w = world();
    try
    {
        const root = path.join(w.project, '.alfred-tools');
        writeJson(path.join(w.project, '.mcp.json'), { mcpServers: { atlassian: entryAt(root) } });
        const failed = signIn('atlassian', 'project', { env: w.env, project: w.project, run: () => ({ status: 3, error: null, signal: null }) });
        assert.strictEqual(failed.ok, false);
        assert.match(failed.line, /exit 3/);
        const empty = signIn('atlassian', 'project', { env: w.env, project: w.project, run: () => ({ status: 0, error: null, signal: null }) });
        assert.strictEqual(empty.ok, false);
        assert.match(empty.line, /no sign-in was stored/);
        const timedOut = signIn('atlassian', 'project', { env: w.env, project: w.project, run: () => ({ status: null, error: null, signal: 'SIGTERM' }) });
        assert.strictEqual(timedOut.ok, false);
        assert.match(timedOut.line, /stopped by SIGTERM/);
        const spawnFailed = signIn('atlassian', 'project', { env: w.env, project: w.project, run: () => ({ status: null, error: new Error('spawn npx ENOENT'), signal: null }) });
        assert.strictEqual(spawnFailed.ok, false);
        assert.match(spawnFailed.line, /spawn npx ENOENT/);
        const printed: string[] = [];
        assert.strictEqual(runSignInCommand(['atlassian', 'project'], { env: w.env, project: w.project, run: () => ({ status: 3, error: null, signal: null }), log: (...lines: string[]) => printed.push(...lines) }), 1);
        assert.match(printed.join('\n'), /atlassian: .*exit 3/);
    }
    finally { w.clean(); }
});

test('sign-in refuses a server that is missing or not in the shared sign-in form, and starts nothing', () => {
    const w = world();
    try
    {
        writeJson(path.join(w.project, '.mcp.json'), { mcpServers: { plain: { type: 'http', url: URL_OF } } });
        const missing = signIn('nope', 'project', { env: w.env, project: w.project, run: never });
        assert.strictEqual(missing.ok, false);
        assert.match(missing.line, /no server 'nope' at project scope/);
        const plain = signIn('plain', 'project', { env: w.env, project: w.project, run: never });
        assert.strictEqual(plain.ok, false);
        assert.match(plain.line, /not the shared sign-in/);
        assert.strictEqual(runSignInCommand(['plain'], { env: w.env, project: w.project, run: never, log: () => {} }), 2, 'a missing scope is a usage error');
        assert.strictEqual(runSignInCommand(['plain', 'elsewhere'], { env: w.env, project: w.project, run: never, log: () => {} }), 2, 'an unknown scope is a usage error');
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

test('a timeout of the run itself reads as giving up on the browser, not as spawnSync ETIMEDOUT', () => {
    const w = world();
    try
    {
        const root = path.join(w.project, '.alfred-tools');
        writeJson(path.join(w.project, '.mcp.json'), { mcpServers: { atlassian: entryAt(root) } });
        const error = Object.assign(new Error('spawnSync npx ETIMEDOUT'), { code: 'ETIMEDOUT' });
        const result = signIn('atlassian', 'project', { env: w.env, project: w.project, run: () => ({ status: null, error, signal: 'SIGTERM' }) });
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.line, 'sign-in failed: gave up after 300 s waiting for the browser sign-in');
        assert.ok(RUN_TIMEOUT_MS < 330000, 'the run ends before the Bash tool\'s own timeout, so its failure line is printed');
    }
    finally { w.clean(); }
});

test('a stale tokens file does not turn a failed run into a sign-in', () => {
    const w = world();
    try
    {
        const root = path.join(w.project, '.alfred-tools');
        writeJson(path.join(w.project, '.mcp.json'), { mcpServers: { atlassian: entryAt(root) } });
        fs.mkdirSync(path.dirname(tokensFileOf(root, URL_OF)), { recursive: true });
        fs.writeFileSync(tokensFileOf(root, URL_OF), '{}');
        const result = signIn('atlassian', 'project', { env: w.env, project: w.project, run: () => ({ status: 1, error: null, signal: null }) });
        assert.deepStrictEqual(result, { ok: false, line: 'sign-in failed: exit 1' });
    }
    finally { w.clean(); }
});
