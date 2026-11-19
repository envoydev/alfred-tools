// The stdio key launcher's parts (`node <root>/mcp-bridge.js --run <ENV>=<KEY_NAME>[?] [<global root>] -- <command> <args>`)
// and every reader that looks through it to the inner launch.
import test from 'node:test';
import assert from 'node:assert';
import { load } from '../scripts/catalog/catalog.ts';
import { bridgeFileOf, bridgeParts, launcherPlace, mergeSettings } from '../scripts/entries/entry.ts';
import { launcherParts, launchOf, relaunchedArgs, unlaunched, withLaunch } from '../scripts/entries/launcher.ts';
import { fetchStep } from '../scripts/entries/names.ts';
import { catalogMatch, launcher, launchArgs, pinnedVersion } from '../scripts/inventory/fingerprint.ts';
import { renameSinceEnv } from '../scripts/keys/keys.ts';
import { credentialPaths, maskCredentials } from '../scripts/core/kept.ts';
import { launchesPackage } from '../scripts/plan/repair-tail.ts';
import { bumpEntry } from '../scripts/update/offers-plugins.ts';
import * as F from '../scripts/fix/fix-functions.ts';
import { ctxFor, detect, reg } from './fix-helpers.ts';
import { detectAll } from '../scripts/fix/fix.ts';
import type { ServerEntry } from '../scripts/core/types.ts';

const R = '/proj/.alfred-tools';
const R2 = '/other/.alfred-tools';
const G = '/home/dev/.alfred-tools';
const CUT = '2026-11-19T23:59:59Z';
const GITHUB_ENV = 'GITHUB_PERSONAL_ACCESS_TOKEN';
const DOCKER_ARGS = ['run', '-i', '--rm', '-e', GITHUB_ENV, 'ghcr.io/github/github-mcp-server:v2.1.0', 'stdio'];
const LAUNCHER = (root: string, globalRoot: string | null): ServerEntry => ({ command: 'node', args: [`${root}/mcp-bridge.js`, '--run', `${GITHUB_ENV}=${GITHUB_ENV}`, ...(globalRoot ? [globalRoot] : []), '--', 'docker', ...DOCKER_ARGS], env: {} });
const C7 = (root: string, globalRoot: string | null): ServerEntry => ({ command: 'node', args: [`${root}/mcp-bridge.js`, '--run', 'CONTEXT7_API_KEY=CONTEXT7_API_KEY?', ...(globalRoot ? [globalRoot] : []), '--', 'npx', '-y', '@upstash/context7-mcp@4.7.0'], env: { npm_config_before: '2026-11-01T23:59:59Z' } });
const SENTRY = (): ServerEntry => ({ command: 'node', args: [`${R}/mcp-bridge.js`, '--run', 'SENTRY_ACCESS_TOKEN=SENTRY_ACCESS_TOKEN', G, '--', 'npx', '-y', '@sentry/mcp-server@0.49.0'], env: { npm_config_before: CUT } });
const URL_BRIDGE: ServerEntry = { command: 'node', args: [`${R}/mcp-bridge.js`, 'https://mcp.sentry.dev/mcp/{SENTRY_ORG}/{SENTRY_PROJECT?}', 'SENTRY_ACCESS_TOKEN', 'Sentry-Bearer', 'mcp-remote@0.16.0'], env: { npm_config_before: CUT } };
const row = (id: string) => load().byId.get(id)!;

test('each reader over a URL bridge, a launcher and a plain entry', () =>
{
    assert.strictEqual(bridgeParts(LAUNCHER(R, G)), null);
    assert.deepStrictEqual(launcherParts(LAUNCHER(R, G)), { path: `${R}/mcp-bridge.js`, envVar: GITHUB_ENV, keyName: GITHUB_ENV, optional: false, globalRoot: G, inner: { command: 'docker', args: [...DOCKER_ARGS], env: {} } });
    assert.strictEqual(launcherParts(C7(R, null))!.optional, true);
    assert.strictEqual(launcherParts(C7(R, null))!.globalRoot, null);
    assert.strictEqual(launcherParts(URL_BRIDGE), null);
    assert.strictEqual(launcherParts({ command: 'npx', args: ['-y', 'x@1'] }), null);
    assert.strictEqual(launcherParts(null), null);
    const path = `${R}/mcp-bridge.js`;
    const prefix = [path, '--run', 'A=B'];
    for (const bad of [[...prefix, 'docker'], [...prefix, '--'], [path, '--run', 'BAD', '--', 'x'], [...prefix, 'one', 'two', '--', 'x']])
    {
        assert.strictEqual(launcherParts({ command: 'node', args: bad }), null, bad.join(' '));
    }
    assert.strictEqual(launcherParts({ command: 'node.exe', args: [...prefix, '--', 'x'] })!.inner.command, 'x');
    assert.strictEqual(bridgeFileOf(LAUNCHER(R, G)), `${R}/mcp-bridge.js`);
    assert.strictEqual(bridgeFileOf(URL_BRIDGE), URL_BRIDGE.args![0]);
    assert.strictEqual(bridgeFileOf({ command: 'npx', args: [] }), null);
});

test("a launcher's fingerprint is its catalog row's", () =>
{
    const catalog = load();
    const hit = (entry: ServerEntry) => { const match = catalogMatch(entry, catalog); return match && { rowId: match.rowId, route: match.route }; };
    assert.deepStrictEqual(hit(LAUNCHER(R, G)), { rowId: 'github', route: 'local' });
    assert.deepStrictEqual(hit(C7(R, G)), { rowId: 'context7', route: 'local' });
    assert.deepStrictEqual(hit(SENTRY()), { rowId: 'sentry', route: 'local' });
});

test('fetchStep of a launcher fetches the inner package, and launchesPackage is true', () =>
{
    assert.deepStrictEqual(fetchStep('c7', C7(R, G))!.argv, ['npm', 'exec', '--yes', '--package', '@upstash/context7-mcp@4.7.0', '--', 'node', '-e', '0']);
    assert.deepStrictEqual(fetchStep('github', LAUNCHER(R, G))!.argv, ['docker', 'pull', 'ghcr.io/github/github-mcp-server:v2.1.0']);
    assert.deepStrictEqual(fetchStep('c7', C7(R, G))!.env, { npm_config_before: '2026-11-01T23:59:59Z' });
    assert.strictEqual(launchesPackage('c7', C7(R, G)), true);
    assert.strictEqual(fetchStep('sentry', URL_BRIDGE)!.what, 'mcp-remote@0.16.0');
});

test('a project whose only npx server is a launcher gets the start-timeout finding (spec Step 6)', () =>
{
    const found = detectAll(ctxFor({ registrations: [reg('context7', C7('/proj/.alfred-tools', '/home/dev/.alfred-tools'))] }), { only: 'start-timeout' }).found.filter((f) => f.id === 'start-timeout');
    assert.strictEqual(found.length, 1);
});

test('launcher, launchArgs and pinnedVersion read the inner launch', () =>
{
    assert.strictEqual(launcher(C7(R, G)), 'npx');
    assert.strictEqual(launcher(LAUNCHER(R, G)), 'docker');
    assert.deepStrictEqual(launchArgs(C7(R, G)), ['-y', '@upstash/context7-mcp@4.7.0']);
    assert.strictEqual(pinnedVersion(C7(R, G), '@upstash/context7-mcp'), '4.7.0');
});

test("update's pin bump moves the inner pin and keeps the launcher (Review Focus 4)", () =>
{
    const bumped = bumpEntry(C7(R, G), '@upstash/context7-mcp', '4.8.0', CUT)!;
    const before = launcherParts(C7(R, G))!;
    const after = launcherParts(bumped)!;
    assert.deepStrictEqual({ ...after, inner: null }, { ...before, inner: null });
    assert.strictEqual(after.inner.args![1], '@upstash/context7-mcp@4.8.0');
    assert.strictEqual(bumped.env!.npm_config_before, CUT);
    assert.deepStrictEqual(bumped.args!.slice(0, 5), C7(R, G).args!.slice(0, 5));
});

test('relaunchedArgs rewrites the bridge path, the pair and the global root, and nothing after --', () =>
{
    const old = LAUNCHER(R, G).args!;
    const args = relaunchedArgs(old, { path: `${R2}/mcp-bridge.js`, envVar: GITHUB_ENV, keyName: 'ACME_GITHUB_TOKEN', optional: false, globalRoot: null });
    assert.deepStrictEqual(args.slice(0, 4), [`${R2}/mcp-bridge.js`, '--run', `${GITHUB_ENV}=ACME_GITHUB_TOKEN`, '--']);
    assert.deepStrictEqual(args.slice(4), old.slice(old.indexOf('--') + 1));
    const kept = relaunchedArgs(['-x', ...C7(R, null).args!], { path: `${R}/mcp-bridge.js`, envVar: 'CONTEXT7_API_KEY', keyName: 'CONTEXT7_API_KEY', optional: true, globalRoot: G });
    assert.deepStrictEqual(kept.slice(0, 5), ['-x', `${R}/mcp-bridge.js`, '--run', 'CONTEXT7_API_KEY=CONTEXT7_API_KEY?', G]);
    assert.strictEqual(kept[5], '--');
});

test('withLaunch and unlaunched swap the inner launch of a launcher, and the whole launch of a plain entry', () =>
{
    const wrapped = withLaunch(C7(R, G), { command: 'cmd', args: ['/c', 'npx', '-y', 'x@1'] });
    assert.deepStrictEqual(wrapped.args!.slice(0, 4), C7(R, G).args!.slice(0, 4));
    assert.strictEqual(wrapped.command, 'node');
    assert.deepStrictEqual(launchOf(wrapped), { command: 'cmd', args: ['/c', 'npx', '-y', 'x@1'], env: C7(R, G).env });
    assert.deepStrictEqual(withLaunch({ command: 'npx', args: ['a'], env: { K: 'v' } }, { command: 'cmd', args: ['b'] }), { command: 'cmd', args: ['b'], env: { K: 'v' } });
    assert.deepStrictEqual(unlaunched(C7(R, G)), { command: 'npx', args: ['-y', '@upstash/context7-mcp@4.7.0'], env: C7(R, G).env });
    const plain = { command: 'npx', args: ['a'] };
    assert.strictEqual(unlaunched(plain), plain);
    assert.strictEqual(launchOf(plain), plain);
});

test('launcherPlace gives the scope\'s bridge path and, at local scope, the global root', () =>
{
    const context = { platform: 'linux', project: '/proj', home: '/home/dev', roots: { project: R, global: G } };
    assert.deepStrictEqual(launcherPlace('local', context), { bridgePath: `${R}/mcp-bridge.js`, globalRoot: G });
    assert.deepStrictEqual(launcherPlace('user', context), { bridgePath: `${G}/mcp-bridge.js`, globalRoot: null });
    assert.strictEqual(launcherPlace('local', { ...context, roots: { project: R } }).globalRoot, null);
});

test('windows-npx-cmd wraps the inner launch of a launcher', () =>
{
    const entry = C7('C:/proj/.alfred-tools', null);
    const found = detect(ctxFor({ platform: 'win32', registrations: [reg('context7', entry)] })).found.filter((f) => f.id === 'windows-npx-cmd');
    assert.strictEqual(found.length, 1);
    const fixed = F.windowsNpxCmdFix(entry);
    const parts = launcherParts(fixed)!;
    assert.strictEqual(parts.inner.command, 'cmd');
    assert.deepStrictEqual(parts.inner.args!.slice(0, 2), ['/c', 'npx']);
    assert.strictEqual(fixed.command, 'node');
    const wrapped = detect(ctxFor({ platform: 'win32', registrations: [reg('context7', fixed)] })).found.filter((f) => f.id === 'windows-npx-cmd');
    assert.deepStrictEqual(wrapped, []);
});

test('a new github setting reaches the container through a launcher', () =>
{
    const merged = mergeSettings(LAUNCHER(R, G), row('github').routes.local!, { GITHUB_TOOLSETS: 'repos' });
    const args = merged.args!;
    const image = args.indexOf('ghcr.io/github/github-mcp-server:v2.1.0');
    assert.deepStrictEqual(args.slice(image - 2, image), ['-e', 'GITHUB_TOOLSETS']);
    assert.strictEqual(merged.env!['GITHUB_TOOLSETS'], 'repos');
    assert.deepStrictEqual(args.slice(0, 5), LAUNCHER(R, G).args!.slice(0, 5));
});

test("sentry's variable rename reaches a launcher's ENV slot", () =>
{
    const route = row('sentry').routes.local!;
    const renamed = renameSinceEnv(SENTRY(), route, '0.49.0');
    assert.strictEqual(launcherParts(renamed)!.envVar, 'SENTRY_AUTH_TOKEN');
    assert.strictEqual(launcherParts(renamed)!.keyName, 'SENTRY_ACCESS_TOKEN');
    assert.deepStrictEqual(renamed.env, SENTRY().env);
    const below = SENTRY();
    assert.strictEqual(renameSinceEnv(below, route, '0.42.0'), below);
    const already = { ...SENTRY(), args: SENTRY().args!.map((arg) => arg.replace('SENTRY_ACCESS_TOKEN=', 'SENTRY_AUTH_TOKEN=')) };
    assert.strictEqual(renameSinceEnv(already, route, '0.49.0'), already);
});

test('kept.maskCredentials and credentialPaths leave a launcher as it is', () =>
{
    const github = LAUNCHER(R, G);
    assert.deepStrictEqual(maskCredentials(github, row('github')), github);
    assert.deepStrictEqual(credentialPaths(github, row('github')), []);
    assert.deepStrictEqual(maskCredentials(C7(R, G), row('context7')), C7(R, G));
});
