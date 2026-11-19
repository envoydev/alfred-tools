// The stdio key launcher's parts (`node <root>/mcp-bridge.js --run <ENV>=<KEY_NAME>[?] [<global root>] -- <command> <args>`)
// and every reader that looks through it to the inner launch.
import test from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { load } from '../scripts/catalog/catalog.ts';
import { bridgeFileOf, bridgeParts, buildEntry, launcherPlace, mergeSettings } from '../scripts/entries/entry.ts';
import { launcherForm, launcherParts, launcherRoute, launchOf, relaunchedArgs, unlaunched, withLaunch } from '../scripts/entries/launcher.ts';
import { fetchStep } from '../scripts/entries/names.ts';
import { catalogMatch, launcher, launchArgs, pinnedVersion } from '../scripts/inventory/fingerprint.ts';
import { renameSinceEnv } from '../scripts/keys/keys.ts';
import { credentialPaths, maskCredentials } from '../scripts/core/kept.ts';
import { launchesPackage } from '../scripts/plan/repair-tail.ts';
import { bumpEntry } from '../scripts/update/offers-plugins.ts';
import * as F from '../scripts/fix/fix-functions.ts';
import { ctxFor, ctxOf, detect, ptRoot, put, reg, seed } from './fix-helpers.ts';
import { world } from './helpers.ts';
import { makeCtx, checkUpdates } from '../scripts/update/check.ts';
import * as inventory from '../scripts/inventory/inventory.ts';
import * as rootsLib from '../scripts/roots/roots.ts';
import { BRIDGE_VERSION, parseRun } from '../scripts/copied/mcp-bridge.js';
import { fakeRegistry, noLsp } from './update-helpers.ts';
import type { Finding } from '../scripts/fix/types.ts';
import { detectAll } from '../scripts/fix/fix.ts';
import type { ServerEntry } from '../scripts/core/types.ts';
import type { LauncherPlace } from '../scripts/entries/types.ts';

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

const bridgeNumbered = (root: string, number: number) => put(path.join(root, 'mcp-bridge.js'), rootsLib.shippedSource('bridge').replace(/^\/\/ alfred-tools mcp-bridge \d+/, `// alfred-tools mcp-bridge ${number}`));

test('a launcher whose root lacks the bridge is helper-missing, does not start, and asks for a restart', () =>
{
    const w = world();
    try
    {
        seed(w, 'github', 'local', LAUNCHER(ptRoot(w), path.join(w.home, '.alfred-tools')));
        const found = detect(ctxOf(w), 'helper-missing').found.filter((x) => x.id === 'helper-missing');
        assert.deepStrictEqual(found.map((x) => x.shipped).sort(), ['bridge', 'helper']);
        for (const finding of found)
        {
            assert.match(finding.found, /github \(local\) does not start$/);
            assert.strictEqual(finding.bridged, true);
        }
        const bridgeFinding = found.find((x) => x.shipped === 'bridge') as Finding;
        assert.strictEqual(F.helperMissingFix(bridgeFinding).restart, true);
    }
    finally { w.clean(); }
});

test('a launcher whose root holds bridge 3 is helper-stale', () =>
{
    const w = world();
    try
    {
        seed(w, 'github', 'local', LAUNCHER(ptRoot(w), path.join(w.home, '.alfred-tools')));
        bridgeNumbered(ptRoot(w), 3);
        const stale = detect(ctxOf(w), 'helper-stale').found.filter((x) => x.id === 'helper-stale');
        assert.ok(stale.some((x) => x.found === `mcp-bridge.js is bridge 3 - this plugin's is ${BRIDGE_VERSION}`), stale.map((x) => x.found).join('\n'));
    }
    finally { w.clean(); }
});

test('update offers a newer bridge for a root only a launcher names', async () =>
{
    const w = world();
    try
    {
        seed(w, 'github', 'local', LAUNCHER(ptRoot(w), path.join(w.home, '.alfred-tools')));
        bridgeNumbered(ptRoot(w), 3);
        const inv = inventory.buildInventory({ project: w.project, env: w.env });
        const out = await checkUpdates(makeCtx({ inventory: inv, project: w.project, env: w.env, machine: noLsp, registry: fakeRegistry({}), refresh: false }));
        const offer = out.offers.find((x) => x.kind === 'bridge');
        assert.ok(offer, JSON.stringify(out));
        assert.strictEqual(offer.from, '3');
        assert.strictEqual(offer.to, String(BRIDGE_VERSION));
    }
    finally { w.clean(); }
});

test("pointsIntoRoot reads a launcher as this plugin's root", () =>
{
    const w = world();
    try
    {
        const entry = LAUNCHER(ptRoot(w), path.join(w.home, '.alfred-tools'));
        const registration = { name: 'github', scope: 'local', entry };
        const machine = { platform: process.platform, project: w.project, home: w.home };
        assert.strictEqual(rootsLib.pointsIntoRoot(registration, { registrations: [] }, machine), ptRoot(w));
        bridgeNumbered(ptRoot(w), BRIDGE_VERSION);
        assert.strictEqual(rootsLib.pointsIntoRoot(registration, { registrations: [] }, machine), ptRoot(w));
        put(path.join(ptRoot(w), 'mcp-bridge.js'), 'module.exports = {};\n');
        assert.strictEqual(rootsLib.pointsIntoRoot(registration, { registrations: [] }, machine), null);
    }
    finally { w.clean(); }
});

// ---- the launcher form: a built entry wrapped for the bridge's run mode ------------------------------------------------

const catalog = load();
const FORM_MACHINE = { platform: 'darwin', project: '/work/shop', home: '/Users/me', machine: { docker: true } };
const DARWIN_PLACE = { bridgePath: '/work/shop/.alfred-tools/mcp-bridge.js', globalRoot: '/Users/me/.alfred-tools' };
const WIN_PLACE = { bridgePath: 'C:\\Users\\First Last\\proj\\.alfred-tools\\mcp-bridge.js', globalRoot: 'C:\\Users\\First Last\\.alfred-tools' };
const routeOf = (id: string) => row(id).routes.local!;
const plainEntry = (id: string, token: boolean, machine: Record<string, unknown> = FORM_MACHINE) => buildEntry(row(id), 'local', { scope: 'local', token, keyName: undefined }, machine as never, catalog.rules);
const formOf = (id: string, keyName: string, place: LauncherPlace = DARWIN_PLACE, token = true) => launcherForm(routeOf(id), keyName, place, plainEntry(id, token));

test('launcherForm per route, on darwin and win32 path forms', () =>
{
    const github = formOf('github', GITHUB_ENV)!;
    assert.deepStrictEqual(github, { command: 'node', args: [DARWIN_PLACE.bridgePath, '--run', `${GITHUB_ENV}=${GITHUB_ENV}`, DARWIN_PLACE.globalRoot, '--', 'docker', ...DOCKER_ARGS], env: {} });
    const sentry = formOf('sentry', 'SENTRY_ACCESS_TOKEN')!;
    assert.deepStrictEqual(sentry.args!.slice(0, 4), [DARWIN_PLACE.bridgePath, '--run', 'SENTRY_AUTH_TOKEN=SENTRY_ACCESS_TOKEN', DARWIN_PLACE.globalRoot]);
    assert.deepStrictEqual(sentry.env, { npm_config_before: routeOf('sentry').package!.cutoff });
    const context7 = formOf('context7', 'CONTEXT7_API_KEY')!;
    assert.strictEqual(context7.args![2], 'CONTEXT7_API_KEY=CONTEXT7_API_KEY?');
    assert.deepStrictEqual(context7.env, { npm_config_before: routeOf('context7').package!.cutoff });
    // no global root slot when the place has none
    assert.strictEqual(launcherForm(routeOf('github'), GITHUB_ENV, { bridgePath: DARWIN_PLACE.bridgePath, globalRoot: null }, plainEntry('github', true))!.args![3], '--');
    // win32: the bridge path is one argument, whole; the inner launch is cmd /c npx
    const win = launcherForm(routeOf('sentry'), 'SENTRY_ACCESS_TOKEN', WIN_PLACE, plainEntry('sentry', true, { ...FORM_MACHINE, platform: 'win32', project: 'C:\\proj', home: 'C:\\Users\\First Last' }))!;
    assert.strictEqual(win.args![0], WIN_PLACE.bridgePath);
    assert.deepStrictEqual(win.args!.slice(win.args!.indexOf('--') + 1, win.args!.indexOf('--') + 4), ['cmd', '/c', 'npx']);
    assert.strictEqual(launcherParts(win)!.path, WIN_PLACE.bridgePath);
    // context7 without a key has no env token field to name
    assert.strictEqual(formOf('context7', 'CONTEXT7_API_KEY', DARWIN_PLACE, false), null);
});

test("the bridge's parser takes every form launcherForm builds", () =>
{
    const forms = [formOf('github', 'ACME_GITHUB_TOKEN'), formOf('sentry', 'SENTRY_ACCESS_TOKEN'), formOf('context7', 'CONTEXT7_API_KEY'), formOf('github', GITHUB_ENV, { bridgePath: DARWIN_PLACE.bridgePath, globalRoot: null })];
    for (const form of forms)
    {
        const parts = launcherParts(form);
        const parsed = parseRun(form!.args!.slice(2));
        assert.ok(parts && !('error' in parsed), JSON.stringify(parsed));
        assert.deepStrictEqual({ envVar: parsed.envVar, keyName: parsed.keyName, optional: parsed.optional, globalRoot: parsed.globalRoot, command: parsed.command, args: parsed.args }, { envVar: parts.envVar, keyName: parts.keyName, optional: parts.optional, globalRoot: parts.globalRoot, command: parts.inner.command, args: parts.inner.args });
    }
});

test('launcherRoute: a stdio route with a key, not at Project, not a bridge or a hosted route', () =>
{
    assert.strictEqual(launcherRoute(routeOf('github'), 'local', 'local'), true);
    assert.strictEqual(launcherRoute(routeOf('github'), 'local', 'user'), true);
    assert.strictEqual(launcherRoute(routeOf('github'), 'local', 'project'), false);
    assert.strictEqual(launcherRoute(row('github').routes.remote!, 'remote', 'local'), false);
    assert.strictEqual(launcherRoute(row('sentry').routes.bridge!, 'bridge', 'local'), false);
    assert.strictEqual(launcherRoute(routeOf('context7'), 'local', 'local'), true);
});
