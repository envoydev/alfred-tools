// The key-to-launcher fix row (spec Step 5): a plain stdio registration of github, sentry or context7 at Local or Global
// scope holds its key in its env; the row moves it to the launcher, which reads the key from .mcps-secrets at each start.
// Every key value is built at run time and compared in process: no test prints one.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as roots from '../scripts/roots/roots.ts';
import * as cli from '../scripts/core/claude-cli.ts';
import * as kept from '../scripts/core/kept.ts';
import { load } from '../scripts/catalog/catalog.ts';
import { accountFile, readAccount } from '../scripts/core/account.ts';
import { launcherParts } from '../scripts/entries/launcher.ts';
import { detectAll, applyFixes } from '../scripts/fix/fix.ts';
import { pinnedVersion } from '../scripts/fix/common.ts';
import { world, readJson, writeJson, files } from './helpers.ts';
import { reg, ctxFor, ctxOf, localEntry, logged, put, seed, shownOf } from './fix-helpers.ts';
import { run, fakeRegistry, ago, installPlain, localReg } from './update-helpers.ts';
import type { Finding } from '../scripts/fix/types.ts';
import type { ServerEntry } from '../scripts/core/types.ts';
import type { World } from './types.ts';

const catalog = load();
const GITHUB_KEY = 'GITHUB_PERSONAL_ACCESS_TOKEN';
const SENTRY_KEY = 'SENTRY_ACCESS_TOKEN';
const SENTRY_ENV = 'SENTRY_AUTH_TOKEN';
const CONTEXT7_KEY = 'CONTEXT7_API_KEY';
const SENTRY_CUTOFF = '2026-11-19T23:59:59Z';
const GITHUB_IMAGE = 'ghcr.io/github/github-mcp-server:v2.1.0';
const keyValue = (): string => ['k', crypto.randomBytes(12).toString('hex')].join('-');
const projectRoot = (w: World): string => path.join(w.project, '.alfred-tools');
const globalRoot = (w: World): string => path.join(w.home, '.alfred-tools');
const secrets = (dir: string, pairs: Record<string, string>): void => put(path.join(dir, '.mcps-secrets'), Object.entries(pairs).map(([name, value]) => `${name}=${value}\n`).join(''));
const plainGithub = (value: string, after: string[] = []): ServerEntry => ({ command: 'docker', args: ['run', '-i', '--rm', '-e', GITHUB_KEY, GITHUB_IMAGE, 'stdio', ...after], env: { [GITHUB_KEY]: value } });
const plainSentry = (value: string, envName = SENTRY_ENV, version = '0.49.0'): ServerEntry => ({ command: 'npx', args: ['-y', `@sentry/mcp-server@${version}`], env: { npm_config_before: SENTRY_CUTOFF, [envName]: value } });
const found = (w: World): Finding[] => detectAll(ctxOf(w)).found.filter((finding) => finding.id === 'key-to-launcher');
const tmpOf = (w: World): string => path.join(w.dir, 'tmp');
// the account file and the claude calls made since `from`: where a registration's key would show
const showsAny = (w: World, from: number, ...values: string[]): boolean =>
{
    const text = `${fs.readFileSync(accountFile(w.env), 'utf8')}${JSON.stringify(w.calls().slice(from))}`;
    return values.some((value) => text.includes(value));
};
const filesShowing = (w: World, value: string): string[] => files(w.dir).filter((file) => ![path.basename(file)].some((base) => base === '.mcps-secrets' || base === 'calls.jsonl') && fs.readFileSync(file, 'utf8').includes(value));

test('moves a plain registration to the launcher when .mcps-secrets holds the same value', () =>
{
    const w = world();
    try
    {
        const key = keyValue();
        secrets(projectRoot(w), { [GITHUB_KEY]: key });
        seed(w, 'github', 'local', plainGithub(key));
        const [finding, ...rest] = found(w) as [Finding];
        assert.deepStrictEqual([rest.length, finding.name, finding.scope, finding.keyName, finding.blocked], [0, 'github', 'local', GITHUB_KEY, undefined]);
        assert.match(finding.found, /^the registration holds its key - it moves to the launcher, which reads GITHUB_PERSONAL_ACCESS_TOKEN from .*\.mcps-secrets each time the server starts$/);
        assert.ok(!shownOf(detectAll(ctxOf(w))).includes(key));
        const before = w.calls().length;
        const out = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['key-to-launcher'], { tmp: tmpOf(w), log: out.log }).failed, null, out.text());
        const parts = launcherParts(localEntry(w, 'github'));
        assert.ok(parts, 'the registration is a launcher');
        assert.deepStrictEqual([parts.envVar, parts.keyName, parts.optional], [GITHUB_KEY, GITHUB_KEY, false]);
        assert.ok(!showsAny(w, before, key), 'no key in the account file or in a claude call');
        assert.ok(!out.text().includes(key), 'no key printed');
        assert.deepStrictEqual(found(w), []);
    }
    finally { w.clean(); }
});

test('blocks the move when the file holds a different value', () =>
{
    const w = world();
    try
    {
        const [held, newer] = [keyValue(), keyValue()];
        secrets(projectRoot(w), { [GITHUB_KEY]: newer });
        seed(w, 'github', 'local', plainGithub(held));
        const [finding] = found(w) as [Finding];
        assert.ok(finding.blocked, 'blocked');
        assert.match(finding.blocked, /^github holds a key that differs from the one in .*\.mcps-secrets - put the key that works in .*\.mcps-secrets as GITHUB_PERSONAL_ACCESS_TOKEN \(or run fix, whose token-sync takes the file's\), then run fix again$/);
        for (const value of [held, newer]) assert.ok(!`${finding.blocked}${finding.found}${shownOf(detectAll(ctxOf(w)))}`.includes(value));
        const [writesBefore, entry] = [w.writes().length, localEntry(w, 'github')];
        const out = logged();
        const result = applyFixes(ctxOf(w), ['key-to-launcher'], { tmp: tmpOf(w), log: out.log });
        assert.deepStrictEqual(result.skipped.map((skipped) => skipped.id), ['key-to-launcher']);
        assert.strictEqual(w.writes().length, writesBefore, 'no registration call');
        assert.deepStrictEqual(localEntry(w, 'github'), entry, 'the registration, and the only copy of its key, is untouched');
        assert.ok(!files(w.dir).some((file) => path.basename(file) === 'mcp-bridge.js'), 'no bridge written for a blocked move');
    }
    finally { w.clean(); }
});

test('moves after token-sync took the file value', () =>
{
    const w = world();
    try
    {
        const [held, newer] = [keyValue(), keyValue()];
        secrets(projectRoot(w), { [GITHUB_KEY]: newer });
        seed(w, 'github', 'local', plainGithub(held));
        const out = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['token-sync', 'key-to-launcher'], { tmp: tmpOf(w), log: out.log }).failed, null, out.text());
        assert.strictEqual(launcherParts(localEntry(w, 'github')), null, 'the first run syncs and leaves the move blocked');
        assert.strictEqual(localEntry(w, 'github')!.env![GITHUB_KEY], newer, 'the file value is in the registration');
        const [after] = found(w) as [Finding];
        assert.ok(after && !after.blocked, 'unblocked once the values agree');
        const before = w.calls().length;
        assert.strictEqual(applyFixes(ctxOf(w), ['token-sync', 'key-to-launcher'], { tmp: tmpOf(w), log: out.log }).failed, null, out.text());
        assert.ok(launcherParts(localEntry(w, 'github')), 'the second run moves');
        assert.ok(!showsAny(w, before, held, newer), 'neither value in the account file');
    }
    finally { w.clean(); }
});

test('blocked when no .mcps-secrets holds the name', () =>
{
    const w = world();
    try
    {
        const key = keyValue();
        seed(w, 'github', 'local', plainGithub(key));
        const [finding] = found(w) as [Finding];
        assert.ok(finding, 'found');
        assert.strictEqual(finding.blocked, `github holds a key no .mcps-secrets holds - put it in ${finding.chain![0]} as ${GITHUB_KEY}, then run fix again`);
        assert.ok(!`${finding.blocked}${shownOf(detectAll(ctxOf(w)))}`.includes(key));
    }
    finally { w.clean(); }
});

test('write-helper and write-bridge precede the replace, on a root with no bridge and with bridge 3', () =>
{
    for (const old of [null, '// alfred-tools mcp-bridge 3\n// the bridge before the run mode\n'])
    {
        const w = world();
        try
        {
            const key = keyValue();
            secrets(projectRoot(w), { [GITHUB_KEY]: key });
            seed(w, 'github', 'local', plainGithub(key));
            const bridge = path.join(projectRoot(w), 'mcp-bridge.js');
            if (old) put(bridge, old);
            assert.deepStrictEqual(found(w).map((finding) => Boolean(finding.blocked)), [false], `${old ? 'bridge 3' : 'no bridge'}: not blocked`);
            const out = logged();
            assert.strictEqual(applyFixes(ctxOf(w), ['key-to-launcher'], { tmp: tmpOf(w), log: out.log }).failed, null, out.text());
            const at = (pattern: RegExp): number => out.lines.findIndex((line) => pattern.test(line));
            const [helper, bridgeLine, replace] = [at(/mcp-headers\.js/), at(/mcp-bridge\.js/), at(/ok .*github/)];
            assert.ok(helper >= 0 && helper < bridgeLine && bridgeLine < replace, out.text());
            assert.strictEqual(roots.shippedState('bridge', bridge).state, 'same', 'the root\'s bridge reads 4 after');
            assert.ok(launcherParts(localEntry(w, 'github')));
        }
        finally { w.clean(); }
    }
});

test('blocked over an edited bridge', () =>
{
    const w = world();
    try
    {
        const key = keyValue();
        secrets(projectRoot(w), { [GITHUB_KEY]: key });
        seed(w, 'github', 'local', plainGithub(key));
        put(path.join(projectRoot(w), 'mcp-bridge.js'), `${roots.shippedSource('bridge')}// mine\n`);
        const [finding] = found(w) as [Finding];
        assert.strictEqual(finding.blocked, `mcp-bridge.js in ${projectRoot(w)} changed since alfred-tools wrote it - /alfred-tools:fix (helper-stale) rewrites it, or delete it, then run fix again`);
        const entry = localEntry(w, 'github');
        assert.deepStrictEqual(applyFixes(ctxOf(w), ['key-to-launcher'], { tmp: tmpOf(w), log: () => {} }).skipped.map((skipped) => skipped.id), ['key-to-launcher']);
        assert.deepStrictEqual(localEntry(w, 'github'), entry);
    }
    finally { w.clean(); }
});

test("Cursor's copy and the list entry move with it", () =>
{
    const w = world();
    try
    {
        const key = keyValue();
        secrets(globalRoot(w), { [GITHUB_KEY]: key });
        installPlain(w, 'github', 'user', plainGithub(key));
        const cursorFile = path.join(w.home, '.cursor', 'mcp.json');
        const listFile = path.join(globalRoot(w), 'mcps.json');
        assert.ok(readJson(cursorFile).mcpServers.github.env[GITHUB_KEY] === key, 'the plain copy holds the key before');
        const out = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['key-to-launcher'], { tmp: tmpOf(w), log: out.log }).failed, null, out.text());
        assert.ok(launcherParts(readAccount(w.env, w.project).user['github']), 'Claude Code');
        assert.ok(launcherParts(readJson(cursorFile).mcpServers.github), "Cursor's copy");
        assert.ok(launcherParts(readJson(listFile).servers.find((server: { name: string }) => server.name === 'github').entry), 'the list entry');
        assert.deepStrictEqual(filesShowing(w, key), [], 'no file but .mcps-secrets holds the key');
    }
    finally { w.clean(); }
});

test('restore from a 0.6.0 list entry builds the launcher and writes no value', () =>
{
    const w = world();
    try
    {
        const key = keyValue();
        secrets(projectRoot(w), { [GITHUB_KEY]: key });
        // a 0.6.0 list: the entry in the plain form with its key masked
        writeJson(path.join(projectRoot(w), 'mcps.json'), { version: 1, servers: [{ name: 'github', scope: 'local', row: 'github', route: 'local', clients: ['claude'], entry: kept.maskCredentials(plainGithub(key), catalog.byId.get('github')), key: GITHUB_KEY }], own: [] });
        seed(w, 'github', 'local', plainGithub(key));
        // a registration that drifted from the list: its plain entry with an arg the list lacks
        const drifted = plainGithub(key, ['--read-only']);
        cli.runClaude(['mcp', 'remove', 'github', '-s', 'local'], { cwd: w.project, env: w.env });
        assert.strictEqual(cli.runClaude(['mcp', 'add-json', 'github', JSON.stringify(drifted), '-s', 'local'], { cwd: w.project, env: w.env }).status, 0);
        const before = w.calls().length;
        const out = logged();
        const result = applyFixes(ctxOf(w), ['none'], { tmp: tmpOf(w), log: out.log, input: { 'drift:claude:github~local': 'restore' } });
        assert.strictEqual(result.failed, null, out.text());
        const parts = launcherParts(localEntry(w, 'github'));
        assert.ok(parts, `the restored registration is a launcher: ${out.text()}`);
        assert.deepStrictEqual(parts.inner.args, plainGithub(key).args, 'the list entry as it was, less the key');
        assert.ok(!showsAny(w, before, key), 'no key in the account file or in a claude call');
        assert.ok(!out.text().includes(key));
    }
    finally { w.clean(); }
});

test('composed with token-sync and sentry-auth-env on one registration gives one launcher replace', () =>
{
    const w = world();
    try
    {
        const newer = keyValue();
        secrets(projectRoot(w), { [SENTRY_KEY]: newer });
        // a 0.1.x registration at a pin that reads SENTRY_AUTH_TOKEN: the old name, holding a ${VAR} where the key goes
        seed(w, 'sentry', 'local', plainSentry(`\${${SENTRY_KEY}}`, SENTRY_KEY));
        const ids = found(w).map((finding) => finding.id);
        assert.deepStrictEqual(ids, ['key-to-launcher']);
        assert.deepStrictEqual(detectAll(ctxOf(w)).found.filter((finding) => ['token-sync', 'sentry-auth-env', 'key-to-launcher'].includes(finding.id)).map((finding) => finding.id), ['token-sync', 'sentry-auth-env', 'key-to-launcher']);
        const before = w.calls().length;
        const out = logged();
        const result = applyFixes(ctxOf(w), ['token-sync', 'sentry-auth-env', 'key-to-launcher'], { tmp: tmpOf(w), log: out.log });
        assert.strictEqual(result.failed, null, out.text());
        assert.strictEqual(w.calls().slice(before).filter((call) => call[0] === 'mcp' && call[1] === 'add-json').length, 1, 'one replace');
        const parts = launcherParts(localEntry(w, 'sentry'));
        assert.ok(parts);
        assert.strictEqual(`${parts.envVar}=${parts.keyName}`, `${SENTRY_ENV}=${SENTRY_KEY}`);
        assert.ok(!showsAny(w, before, newer));
    }
    finally { w.clean(); }
});

test("context7's former --api-key moves too when key-to-launcher runs alone", () =>
{
    const w = world();
    try
    {
        const key = keyValue();
        secrets(projectRoot(w), { [CONTEXT7_KEY]: key });
        seed(w, 'context7', 'local', { command: 'npx', args: ['-y', '@upstash/context7-mcp@4.7.0', '--api-key', key] });
        const before = w.calls().length;
        const out = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['key-to-launcher'], { tmp: tmpOf(w), log: out.log }).failed, null, out.text());
        const entry = localEntry(w, 'context7');
        const parts = launcherParts(entry);
        assert.ok(parts);
        assert.strictEqual(`${parts.envVar}=${parts.keyName}${parts.optional ? '?' : ''}`, `${CONTEXT7_KEY}=${CONTEXT7_KEY}?`);
        assert.ok(!entry!.args!.slice(entry!.args!.indexOf('--')).includes('--api-key'), 'no --api-key after --');
        assert.ok(!showsAny(w, before, key));
    }
    finally { w.clean(); }
});

test('an unmanaged registration is untouched', () =>
{
    const own = { ...reg('github', plainGithub(keyValue())), own: true };
    assert.deepStrictEqual(detectAll(ctxFor({ registrations: [own] })).found.filter((finding) => finding.id === 'key-to-launcher'), []);
});

test('the pin and a user arg are kept', () =>
{
    const w = world();
    try
    {
        const key = keyValue();
        secrets(projectRoot(w), { [GITHUB_KEY]: key });
        const plain = plainGithub(key, ['--toolsets', 'repos']);
        seed(w, 'github', 'local', plain);
        assert.strictEqual(applyFixes(ctxOf(w), ['key-to-launcher'], { tmp: tmpOf(w), log: () => {} }).failed, null);
        const parts = launcherParts(localEntry(w, 'github'));
        assert.ok(parts);
        assert.deepStrictEqual(parts.inner.args, plain.args, 'the image pin and the user args after --');
        assert.strictEqual(parts.inner.command, 'docker');
    }
    finally { w.clean(); }
});

test("update offers it under 'New ways to pass data' and applies it", async () =>
{
    const w = world();
    try
    {
        const key = keyValue();
        secrets(projectRoot(w), { [GITHUB_KEY]: key });
        installPlain(w, 'github', 'local', plainGithub(key));
        const check = await run(w, ['--check', '--no-refresh']);
        assert.match(check.text, /New ways to pass data:[\s\S]*github \(local\)\s+key-to-launcher: /);
        assert.ok(!check.text.includes(key));
        const applied = await run(w, ['--apply', 'upgrade:key-to-launcher:github~local', '--no-refresh']);
        assert.strictEqual(applied.code, 0, applied.text);
        assert.ok(launcherParts(localReg(w, 'github').entry), 'a launcher');
        assert.strictEqual(roots.shippedState('bridge', path.join(projectRoot(w), 'mcp-bridge.js')).state, 'same', 'the root bridge reads 4');
        assert.ok(!applied.text.includes(key));
        assert.deepStrictEqual(filesShowing(w, key), [], 'no file but .mcps-secrets holds the key');
    }
    finally { w.clean(); }
});

test('update moves a plain sentry below the env rename to the launcher and the pin move ends with SENTRY_AUTH_TOKEN as the ENV slot', async () =>
{
    const w = world();
    try
    {
        const key = keyValue();
        secrets(projectRoot(w), { [SENTRY_KEY]: key });
        installPlain(w, 'sentry', 'local', plainSentry(key, SENTRY_KEY, '0.42.0'));
        const registry = fakeRegistry({ 'npm:@sentry/mcp-server': [{ version: '0.49.0', time: ago(30) }] });
        const check = await run(w, ['--check', '--no-refresh'], { registry });
        assert.match(check.text, /New ways to pass data:[\s\S]*sentry \(local\)\s+key-to-launcher: /);
        const applied = await run(w, ['--apply', 'upgrade:key-to-launcher:sentry~local,mcp:sentry~local', '--no-refresh'], { registry });
        assert.strictEqual(applied.code, 0, applied.text);
        const entry = localReg(w, 'sentry').entry;
        const parts = launcherParts(entry);
        assert.ok(parts, 'a launcher');
        assert.deepStrictEqual([parts.envVar, parts.keyName], [SENTRY_ENV, SENTRY_KEY]);
        assert.strictEqual(pinnedVersion(entry, '@sentry/mcp-server'), '0.49.0');
        assert.ok(!applied.text.includes(key));
        assert.deepStrictEqual(filesShowing(w, key), [], 'no file but .mcps-secrets holds the key');
    }
    finally { w.clean(); }
});
