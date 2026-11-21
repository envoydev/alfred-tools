// Step 9: the fix engine - every detector found and not found, the fixes as pure edits of the entry as read, the
// composition into one replace per registration, the asks, and the apply path against the fake claude.
import test from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { world, readJson, helperCmd, writeJson, files, serenaFolderLine, tempOf } from './helpers.ts';
import * as catalogLib from '../scripts/catalog/catalog.ts';
import * as inventory from '../scripts/inventory/inventory.ts';
import { pythonRequest, pathFor } from '../scripts/entries/platform.ts';
import { expandVars } from '../scripts/entries/locations.ts';
import { buildEntry } from '../scripts/entries/entry.ts';
import { launcherRoute } from '../scripts/entries/launcher-form.ts';
import * as cli from '../scripts/core/claude-cli.ts';
import * as account from '../scripts/core/account.ts';
import * as F from '../scripts/fix/fix-functions.ts';
import { makeCtx, detectAll, applyFixes, questions, renderFixes } from '../scripts/fix/fix.ts';
import { runFixCommand } from '../scripts/fix/command.ts';
import * as C from '../scripts/fix/common.ts';
import { READ_GUARD_RESIDUAL } from '../scripts/fix/constants.ts';
import { retirableHelper, retireHelperSteps } from '../scripts/plan/retire-context.ts';
import fs from 'node:fs';
import fsx from 'node:fs';
import { existsSync } from 'node:fs';
import cryptox from 'node:crypto';
import { createHash } from 'node:crypto';
import os from 'node:os';
import * as declines from '../scripts/core/declines.ts';
import { add } from '../scripts/core/declines.ts';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fill, SHAPES } from '../scripts/hud/hud-statusline.ts';
import * as rootsLib from '../scripts/roots/roots.ts';
import { writeMinimalConfig } from '../scripts/apply/serena-config.ts';
import { HELPER_VERSION as HV } from '../scripts/copied/mcp-headers.js';
import { expandedText } from '../scripts/apply/fetch.ts';
import { PARENT_HELPER_IN_CHILD } from '../scripts/plan/asks-keys.ts';
import * as existingLib from '../scripts/inventory/existing.ts';
import * as X from '../scripts/inventory/existing.ts';
import { BRIDGE_VERSION as BV } from '../scripts/copied/mcp-bridge.js';
import { plan } from '../scripts/plan/plan.ts';
import { apply } from '../scripts/apply/run.ts';
import { configDirsWithPlugin } from '../scripts/plan/repair-tail.ts';
import * as kept5 from '../scripts/core/kept.ts';
import type { Detected, Finding, MachineProbe, RunResult, FixCtx } from '../scripts/fix/types.ts';
import type { CatalogRoute, FixRow } from '../scripts/catalog/types.ts';
import type { OwnEntry } from '../scripts/mcps-list/types.ts';
import type { InvRegistration, PluginRow } from '../scripts/inventory/types.ts';
import type { ListServer } from '../scripts/mcps-list/types.ts';
import type { Env, ServerEntry } from '../scripts/core/types.ts';
import type { Machine } from '../scripts/entries/types.ts';
import type { Answers } from '../scripts/plan/types.ts';
import type { World } from './types.ts';
import type { CtxFor } from './fix-helpers.ts';
import { installPlain } from './update-helpers.ts';
import { noMachine, reg, ctxFor, detect, seed, ctxOf, put, ptRoot, localEntry, logged, gitInit, shownOf, SERENA_OLD } from './fix-helpers.ts';

const catalog = catalogLib.load();
const row = (id: string) => catalog.byId.get(id)!;

// a registration fix a test calls with the finding too, as fix-functions' table does
type WithFinding = (entry: ServerEntry, f: Finding) => ServerEntry;
// the env keys the appium and serena fixes set
type SdkEnv = Record<string, string> & { ANDROID_HOME?: string; NO_UI?: string };

// ---- a hand-built inventory and ctx -------------------------------------------------------------------------------

// a fresh entry the way the catalog builds it, for the row's local route
function fresh(rowId: string, platform = 'darwin', arch = 'x64', scope = 'local', where: Partial<Machine> = {})
{
    const win = platform === 'win32';
    const r = row(rowId);
    const ctx = { platform, arch, env: {}, home: win ? 'C:\\Users\\dev' : '/home/dev', project: win ? 'C:\\proj' : '/proj', ...where };
    // with a real home and project (a world's), serena's home is the install's: <root>/serena
    const placed = where.home && where.project ? path.join(scope === 'user' ? where.home : where.project, '.alfred-tools', 'serena') : null;
    const rootStr = r.locations ? (placed || (win ? 'C:\\Users\\dev\\.pt\\x' : '/home/dev/.pt/x')) : undefined;
    return buildEntry(r, 'local', { rootStr, scope, token: false }, ctx, catalog.rules);
}

const ids = (list: { id: string }[]) => list.map((f) => f.id);

// ---- the catalog is wired ------------------------------------------------------------------------------------------

test('every live fix row names a detector and a fix that exist, a tool the catalog has, and an OS; a held row is listed, not run', () =>
{
    const seen = new Set();
    for (const f of catalog.fixes)
    {
        assert.ok(!seen.has(f.id), `duplicate fix id ${f.id}`);
        seen.add(f.id);
        for (const t of f.tool) assert.ok(catalog.byId.has(t), `${f.id}: unknown tool ${t}`);
        for (const o of f.os) assert.ok(['darwin', 'linux', 'win32'].includes(o), `${f.id}: ${o}`);
        for (const k of ['symptom', 'verifiedOn', 'source']) assert.ok((f as unknown as Record<string, unknown>)[k], `${f.id}: no ${k}`);
        if (f.hold) continue;
        assert.strictEqual(typeof (F as Record<string, unknown>)[f.detect], 'function', `${f.id}: no ${f.detect}`);
        if (f.advice) assert.strictEqual(f.fix, null, `${f.id}: an advice row has no fix`);
        else if (f.kind === 'file') assert.deepStrictEqual([f.fix, typeof (F as Record<string, unknown>)[f.steps!]], [null, 'function'], `${f.id}: a file row plans through ${f.steps}`);
        else assert.strictEqual(typeof (F as Record<string, unknown>)[f.fix!], 'function', `${f.id}: no ${f.fix}`);
    }
    const held = detect(ctxFor({ platform: 'win32' })).held;
    assert.deepStrictEqual(ids(held), ['serena-windows-ts-shim']);
});

test('a fresh entry from the catalog is clean on every OS - no detector fires on what the installer writes', () =>
{
    for (const [platform, arch] of [['darwin', 'arm64'], ['linux', 'x64'], ['win32', 'x64'], ['win32', 'arm64']] as [string, string][])
    {
        for (const r of catalog.tools.filter((t) => t.kind === 'mcp' && t.routes.local && t.os.includes(platform)))
        {
            const entry = fresh(r.id, platform, arch);
            // serena's home is a real folder holding the context and config files the install writes before serena starts
            const realHome = r.id === 'serena' && platform !== 'win32';
            if (realHome)
            {
                const serenaHome = fsx.mkdtempSync(path.join(os.tmpdir(), 'pt-fresh-serena-'));
                entry.env!.SERENA_HOME = serenaHome;
                // the path as the product joins it for the simulated platform, so a posix platform on a Windows host keeps its `/`
                entry.args![entry.args!.indexOf('--context') + 1] = pathFor(platform).join(serenaHome, 'serena-context.yml');
                put(path.join(serenaHome, 'serena-context.yml'), rootsLib.shippedSource('serenaContext'));
                leaveConfig(serenaHome);
            }
            const m = inventory.matchEntry(entry, catalog);
            assert.deepStrictEqual(m, { rowId: r.id, route: 'local' }, `${r.id} on ${platform} is recognised`);
            const found = detect(ctxFor({ platform, arch, registrations: [reg(r.id, entry, { route: 'local' })] })).found;
            if (realHome) fsx.rmSync(entry.env!.SERENA_HOME!, { recursive: true, force: true });
            // appium's SDK paths are looked up on the machine by this very fix: with none on it, the finding is blocked
            // a Windows-shaped home cannot be made on this host, so there the one config-on-disk finding is the fixture's, not the installer's
            const fixtureOnly = (f: { id: string }) => f.id === 'serena-project-folder' && r.id === 'serena' && platform === 'win32';
            // the builder's plain entry of a stdio key route is the form before 0.7.0, which the install now wraps in the launcher: key-to-launcher offers the move, blocked here as no key file is on the machine
            const plainKeyForm = (f: { id: string }) => f.id === 'key-to-launcher' && launcherRoute(r.routes.local!, 'local', 'local');
            assert.deepStrictEqual(found.filter((f) => f.id !== 'appium-sdk-env' && !fixtureOnly(f) && !plainKeyForm(f)), [], `${r.id} on ${platform}/${arch}`);
            for (const f of found.filter((candidate) => !fixtureOnly(candidate))) assert.ok(f.blocked, `${r.id}: ${f.id} should be blocked with nothing on the machine`);
        }
    }
});

// ---- serena-windows-home --------------------------------------------------------------------------------------------

test('serena-windows-home: slashes keep the folder, a space needs another one, a relative path resolves against the project', () =>
{
    const homes = (ctx: FixCtx) => detect(ctx).found.filter((f) => f.id === 'serena-windows-home');
    const mk = (home: string, extra = {}, opts: { name?: string; scope?: string; route?: string; ctx?: CtxFor } = {}) => ctxFor({ platform: 'win32', registrations: [reg('serena', { command: 'uvx', args: ['--python', '3.13', '--context', 'C:\\proj\\.alfred-tools\\serena-context.yml'], env: { SERENA_HOME: home, ...extra } }, opts)], ...opts.ctx });
    // slashes only
    let [f] = homes(mk('C:/Users/dev/.serena')) as [Finding];
    assert.strictEqual(f.id, 'serena-windows-home');
    assert.deepStrictEqual(f.proposal, { SERENA_HOME: 'C:\\Users\\dev\\.serena' });
    assert.match(f.note!, /same folder/);
    const edited = F.serenaWindowsHomeFix({ command: 'uvx', args: ['x'], env: { SERENA_HOME: 'C:/Users/dev/.serena', KEEP: '1' } }, f, ctxFor({ platform: 'win32' }));
    assert.deepStrictEqual(edited.env, { SERENA_HOME: 'C:\\Users\\dev\\.serena', KEEP: '1' }, 'the other env survives');
    // already right
    assert.deepStrictEqual(homes(mk('C:\\Users\\dev\\.serena')), []);
    // a space, a profile without one: a new home, said plainly
    [f] = homes(mk('C:\\Users\\dev\\my serena')) as [Finding];
    assert.deepStrictEqual(f.proposal, { SERENA_HOME: 'C:\\Users\\dev\\.serena' });
    assert.match(f.note!, /not moved/);
    // a space and a profile with one: it asks, and applies nothing without the answer
    const spaced = ctxFor({ platform: 'win32', home: 'C:\\Users\\Jo Doe', registrations: [reg('serena', { command: 'uvx', args: [], env: { SERENA_HOME: 'C:\\Users\\Jo Doe\\.serena' } })] });
    [f] = homes(spaced) as [Finding];
    assert.strictEqual(f.input!.id, 'serenaHome');
    assert.throws(() => F.serenaWindowsHomeFix({ env: {} }, f, spaced, {}), /absolute Windows folder/);
    assert.throws(() => F.serenaWindowsHomeFix({ env: {} }, f, spaced, { serenaHome: 'C:\\has space' }), /absolute Windows folder/);
    assert.strictEqual(F.serenaWindowsHomeFix({ env: {} }, f, spaced, { serenaHome: 'C:\\serena-home' }).env!.SERENA_HOME, 'C:\\serena-home');
    // relative -> the project folder
    [f] = homes(mk('.serena\\home')) as [Finding];
    assert.deepStrictEqual(f.proposal, { SERENA_HOME: 'C:\\proj\\.serena\\home' });
    // a ${VAR} form at project scope is 0.2.0's: project-relative-path writes it out absolute, not this row
    assert.deepStrictEqual(homes(mk('${USERPROFILE}/.serena', {}, { scope: 'project' })), []);
    // not Windows, or no SERENA_HOME at all: nothing
    assert.deepStrictEqual(detect(ctxFor({ platform: 'darwin', registrations: [reg('serena', { command: 'uvx', args: [], env: { SERENA_HOME: 'C:/x' } })] })).found.filter((x) => x.id === 'serena-windows-home'), []);
    assert.deepStrictEqual(detect(ctxFor({ platform: 'win32', registrations: [reg('serena', { command: 'uvx', args: ['--python', '3.13'], env: { SERENA_USAGE_REPORTING: 'false' } })] })).found.filter((x) => x.id === 'serena-windows-home'), []);
});

test('serena-windows-home: no SERENA_HOME is serena\'s default <profile>\\.serena - found on a profile with a space, never on one without', () =>
{
    const homes = (ctx: FixCtx) => detect(ctx).found.filter((f) => f.id === 'serena-windows-home');
    // a registration made by hand, as alfred-code's guide writes it: no SERENA_HOME
    const bare = (scope = 'local') => reg('serena', { command: 'uvx', args: ['--python', '3.13'], env: { SERENA_USAGE_REPORTING: 'false' } }, { scope });
    assert.deepStrictEqual(homes(ctxFor({ platform: 'win32', home: 'C:\\Users\\dev', registrations: [bare()] })), [], 'a space-free profile: the default home works');
    // a profile with a space: the space-free folder install offers in its place (E.serenaSpaceFree)
    const spaced = ctxFor({ platform: 'win32', home: 'C:\\Users\\Jo Doe', env: { SystemDrive: 'D:' }, registrations: [bare()] });
    const [f] = homes(spaced) as [Finding];
    assert.ok(f, 'found');
    assert.match(f.found, /no SERENA_HOME/);
    assert.ok(f.found.includes('C:\\Users\\Jo Doe\\.serena'), f.found);
    assert.deepStrictEqual(f.proposal, { SERENA_HOME: 'D:\\serena-home' });
    assert.match(f.note!, /not moved/);
    assert.deepStrictEqual(F.serenaWindowsHomeFix(bare().entry, f, spaced).env, { SERENA_USAGE_REPORTING: 'false', SERENA_HOME: 'D:\\serena-home' });
    // project scope: named, with the Location question to pick a space-free folder
    const [p] = homes(ctxFor({ platform: 'win32', home: 'C:\\Users\\Jo Doe', registrations: [bare('project')] })) as [Finding];
    assert.match(p.blocked!, /pick a space-free folder with \/alfred-tools:configure, Location/);
    assert.deepStrictEqual(homes(ctxFor({ platform: 'darwin', home: '/Users/Jo Doe', registrations: [bare()] })), [], 'not Windows');
});

// ---- uvx-python / windows-arm-python --------------------------------------------------------------------------------

test('uvx-python: a uvx server with no --python gets the row\'s minor first, its pin and cut-off untouched', () =>
{
    const entry = fresh('serena');
    const bare = { ...entry, args: entry.args!.filter((a, i, all) => a !== '--python' && all[i - 1] !== '--python') };
    bare.args = bare.args.map((a) => (a === 'serena-agent@2.1.0' ? 'serena-agent@2.0.0' : a)); // the user's own, older pin
    const ctx = ctxFor({ registrations: [reg('serena', bare)] });
    const found = detect(ctx).found.filter((f) => f.id === 'uvx-python');
    assert.strictEqual(found.length, 1);
    assert.deepStrictEqual(found[0]!.proposal, { python: '3.13' });
    const out = F.uvxPythonFix(bare, found[0]!, ctx);
    assert.deepStrictEqual(out.args!.slice(0, 2), ['--python', '3.13']);
    assert.deepStrictEqual(out.args!.slice(2), bare.args, 'everything the user had follows, in order');
    assert.ok(out.args!.includes('serena-agent@2.0.0'), 'the pin is not moved to the catalog\'s');
    // present: nothing; the other forms of the flag count
    const foundIds = (registrations: ReturnType<typeof reg>[]) => ids(detect(ctxFor({ registrations })).found).filter((id) => id !== 'serena-project-folder');
    assert.deepStrictEqual(foundIds([reg('serena', entry)]), []);
    assert.deepStrictEqual(foundIds([reg('serena', { ...bare, args: ['--python=3.12', ...bare.args] })]), []);
    assert.deepStrictEqual(foundIds([reg('serena', { ...bare, args: ['-p', '3.12', ...bare.args] })]), []);
    // on Windows ARM64 the request is the x64 build
    const arm = ctxFor({ platform: 'win32', arch: 'arm64', registrations: [reg('memory', { command: 'uvx', args: ['--from', 'mcp-memory-service[sqlite]==12.1.1', 'memory', 'server'], env: {} })] });
    assert.strictEqual(detect(arm).found.find((f) => f.id === 'uvx-python')!.proposal!.python, 'cpython-3.13-windows-x86_64-none');
});

test('windows-arm-python: a plain minor on Windows ARM64 becomes the x64 build; a build the user chose, or another CPU, is left', () =>
{
    const entry = { command: 'uvx', args: ['--python', '3.12', '--from', 'mcp-memory-service[sqlite]==12.1.1', 'memory', 'server'], env: {} };
    const arm = ctxFor({ platform: 'win32', arch: 'arm64', registrations: [reg('memory', entry)] });
    const [f] = detect(arm).found as [Finding];
    assert.strictEqual(f.id, 'windows-arm-python');
    assert.strictEqual(f.proposal!.python, 'cpython-3.12-windows-x86_64-none', 'the entry\'s own minor, not the catalog\'s');
    assert.strictEqual(F.windowsArmPythonFix(entry, f).args![1], 'cpython-3.12-windows-x86_64-none');
    // x64 node emulated on ARM: the machine-wide identifier tells the truth
    const emulated = ctxFor({ platform: 'win32', arch: 'x64', env: { PROCESSOR_IDENTIFIER: 'ARMv8 (64-bit) Family 8 Model 1' }, registrations: [reg('memory', entry)] });
    assert.deepStrictEqual(ids(detect(emulated).found), ['windows-arm-python']);
    assert.deepStrictEqual(detect(ctxFor({ platform: 'win32', arch: 'x64', registrations: [reg('memory', entry)] })).found, []);
    const chosen = { ...entry, args: ['--python', 'cpython-3.12-windows-x86_64-none', ...entry.args.slice(2)] };
    assert.deepStrictEqual(detect(ctxFor({ platform: 'win32', arch: 'arm64', registrations: [reg('memory', chosen)] })).found, []);
    assert.deepStrictEqual(detect(ctxFor({ platform: 'darwin', arch: 'arm64', registrations: [reg('memory', entry)] })).found, []);
});

// ---- windows-npx-cmd ------------------------------------------------------------------------------------------------

test('windows-npx-cmd: a direct npx on Windows is wrapped in cmd /c, flagged as an unproved precaution; a wrapped one and other OSes are clean', () =>
{
    const direct = { command: 'npx', args: ['-y', '@upstash/context7-mcp@4.4.4'], env: { npm_config_before: '2026-10-20T23:59:59Z' } };
    const win = ctxFor({ platform: 'win32', registrations: [reg('context7', direct, { name: 'context7' })] });
    const [f] = detect(win).found as [Finding];
    assert.strictEqual(f.id, 'windows-npx-cmd');
    assert.strictEqual(f.documented, false);
    assert.match(f.note!, /no longer documents/);
    assert.deepStrictEqual(F.windowsNpxCmdFix(direct), { command: 'cmd', args: ['/c', 'npx', '-y', '@upstash/context7-mcp@4.4.4'], env: direct.env });
    assert.deepStrictEqual(detect(ctxFor({ platform: 'win32', registrations: [reg('context7', fresh('context7', 'win32'))] })).found, []);
    assert.deepStrictEqual(detect(ctxFor({ platform: 'darwin', registrations: [reg('context7', direct)] })).found, []);
    assert.deepStrictEqual(ids(detect(ctxFor({ platform: 'win32', registrations: [reg('context7', { ...direct, command: 'npx.cmd' })] })).found), ['windows-npx-cmd']);
});

// ---- playwright-webmcp ----------------------------------------------------------------------------------------------

test('playwright-webmcp: --no-webmcp goes right after --browser, an executable path is kept, an older pin blocks it', () =>
{
    const base = fresh('playwright-chrome');
    const without = { ...base, args: base.args!.filter((a) => a !== '--no-webmcp').concat(['--executable-path', '/Applications/Chrome']) };
    const ctx = ctxFor({ registrations: [reg('playwright-chrome', without)] });
    const [f] = detect(ctx).found as [Finding];
    assert.strictEqual(f.id, 'playwright-webmcp');
    assert.ok(!f.blocked);
    const out = (F.playwrightWebmcpFix as WithFinding)(without, f);
    const at = out.args!.indexOf('--browser');
    assert.deepStrictEqual(out.args!.slice(at, at + 3), ['--browser', 'chrome', '--no-webmcp']);
    assert.deepStrictEqual(out.args!.slice(-2), ['--executable-path', '/Applications/Chrome']);
    // through the Windows wrapper
    const wrapped = { command: 'cmd', args: ['/c', 'npx', '-y', '@playwright/mcp@0.0.83', '--browser', 'msedge'], env: {} };
    const w = detect(ctxFor({ platform: 'win32', registrations: [reg('playwright-msedge', wrapped)] })).found[0];
    assert.deepStrictEqual((F.playwrightWebmcpFix as WithFinding)(wrapped, w!).args, ['/c', 'npx', '-y', '@playwright/mcp@0.0.83', '--browser', 'msedge', '--no-webmcp']);
    // present: clean
    assert.deepStrictEqual(detect(ctxFor({ registrations: [reg('playwright-chrome', base)] })).found, []);
    // a pin older than the documented version
    const old = { ...without, args: without.args.map((a) => (a.startsWith('@playwright/mcp@') ? '@playwright/mcp@0.0.50' : a)) };
    const [b] = detect(ctxFor({ registrations: [reg('playwright-chrome', old)] })).found as [Finding];
    assert.match(b.blocked!, /older than 0\.0\.83/);
    // the floor is the release that documents the flag, not the catalog's moving pin: 0.0.83 is fixed, never blocked
    const at83 = { ...without, args: without.args.map((a) => (a.startsWith('@playwright/mcp@') ? '@playwright/mcp@0.0.83' : a)) };
    const [ok83] = detect(ctxFor({ registrations: [reg('playwright-chrome', at83)] })).found as [Finding];
    assert.strictEqual(ok83.id, 'playwright-webmcp');
    assert.strictEqual(ok83.blocked, undefined, 'a pin that documents --no-webmcp is not blocked by a newer catalog pin');
    // a dist-tag compares as unknown, so it is not blocked
    const tagged = { ...without, args: without.args.map((a) => (a.startsWith('@playwright/mcp@') ? '@playwright/mcp@latest' : a)) };
    assert.ok(!detect(ctxFor({ registrations: [reg('playwright-chrome', tagged)] })).found[0]!.blocked);
});

// ---- appium-sdk-env -------------------------------------------------------------------------------------------------

test('appium-sdk-env: ANDROID_HOME and JAVA_HOME are looked up on the machine and added, never over a value the user set', () =>
{
    const appium = fresh('appium');
    const files = ['/Users/dev/Library/Android/sdk', '/opt/jdk-21', '/opt/jdk-21/bin/java'];
    const machine = noMachine({
        exists: (p) => files.includes(p),
        run: (cmd) => (cmd === '/usr/libexec/java_home' ? { status: 0, stdout: '/opt/jdk-21\n' } : { status: 1 }) as RunResult,
    });
    const ctx = ctxFor({ platform: 'darwin', home: '/Users/dev', machine, registrations: [reg('appium', appium, { name: 'appium-mcp' })] });
    const [f] = detect(ctx).found as [Finding];
    assert.strictEqual(f.id, 'appium-sdk-env');
    assert.deepStrictEqual(f.proposal, { ANDROID_HOME: '/Users/dev/Library/Android/sdk', JAVA_HOME: '/opt/jdk-21' });
    const out = F.appiumSdkEnvFix(appium, f);
    assert.strictEqual((out.env as SdkEnv).ANDROID_HOME, '/Users/dev/Library/Android/sdk');
    assert.strictEqual((out.env as SdkEnv).NO_UI, 'true', 'the rest of the env stays');
    // the shell's variables win over the default folders
    const viaEnv = ctxFor({ platform: 'darwin', home: '/Users/dev', env: { ANDROID_HOME: '/sdk', JAVA_HOME: '/jdk' }, machine: noMachine({ exists: (p) => ['/sdk', '/jdk'].includes(p) }), registrations: [reg('appium', appium, { name: 'appium-mcp' })] });
    assert.deepStrictEqual(detect(viaEnv).found[0]!.proposal, { ANDROID_HOME: '/sdk', JAVA_HOME: '/jdk' });
    // java found by the PATH, resolved through the symlink to its home (Linux)
    const linux = ctxFor({
        platform: 'linux', home: '/home/dev', registrations: [reg('appium', appium, { name: 'appium-mcp' })],
        machine: noMachine({ exists: (p) => ['/home/dev/Android/Sdk', '/usr/lib/jvm/java-21/bin/java'].includes(p), which: (n) => (n === 'java' ? '/usr/bin/java' : null), realpath: () => '/usr/lib/jvm/java-21/bin/java' }),
    });
    assert.deepStrictEqual(detect(linux).found[0]!.proposal, { ANDROID_HOME: '/home/dev/Android/Sdk', JAVA_HOME: '/usr/lib/jvm/java-21' });
    // one found, one not: apply the one, say so
    const half = ctxFor({ platform: 'darwin', home: '/Users/dev', machine: noMachine({ exists: (p) => p === '/Users/dev/Library/Android/sdk' }), registrations: [reg('appium', appium, { name: 'appium-mcp' })] });
    const h = detect(half).found[0];
    assert.deepStrictEqual(h!.proposal, { ANDROID_HOME: '/Users/dev/Library/Android/sdk' });
    assert.match(h!.note!, /JAVA_HOME not found on this machine and left unset/);
    // neither found: blocked, with what to install
    const none = detect(ctxFor({ registrations: [reg('appium', appium, { name: 'appium-mcp' })] })).found[0];
    assert.match(none!.blocked!, /ANDROID_HOME and JAVA_HOME not found/);
    // already set: clean; the user's value is never replaced
    const set = { ...appium, env: { ...appium.env, ANDROID_HOME: '/mine', JAVA_HOME: '/mine-jdk' } };
    assert.deepStrictEqual(detect(ctxFor({ machine, registrations: [reg('appium', set, { name: 'appium-mcp' })] })).found, []);
    const partly = { ...appium, env: { ...appium.env, ANDROID_HOME: '/mine' } };
    assert.deepStrictEqual(Object.keys(detect(ctxFor({ home: '/Users/dev', machine, registrations: [reg('appium', partly, { name: 'appium-mcp' })] })).found[0]!.proposal!), ['JAVA_HOME']);
    // project scope holds this machine's paths too: the same proposal
    const committed = detect(ctxFor({ home: '/Users/dev', machine, registrations: [reg('appium', appium, { name: 'appium-mcp', scope: 'project' })] })).found[0];
    assert.deepStrictEqual(committed!.proposal, { ANDROID_HOME: '/Users/dev/Library/Android/sdk', JAVA_HOME: '/opt/jdk-21' });
});

// ---- serena-telemetry -----------------------------------------------------------------------------------------------

test('serena-telemetry: an absent variable is set to false; a value the user chose, either way, is left', () =>
{
    const entry = fresh('serena');
    const stripped = { ...entry, env: { SERENA_HOME: entry.env!.SERENA_HOME } } as ServerEntry;
    const ctx = ctxFor({ registrations: [reg('serena', stripped)] });
    const [f] = detect(ctx).found.filter((candidate) => candidate.id !== 'serena-project-folder') as [Finding];
    assert.strictEqual(f.id, 'serena-telemetry');
    assert.deepStrictEqual(F.serenaTelemetryFix(stripped).env, { SERENA_HOME: entry.env!.SERENA_HOME, SERENA_USAGE_REPORTING: 'false' });
    const foundIds = (registration: ServerEntry) => ids(detect(ctxFor({ registrations: [reg('serena', registration)] })).found).filter((id) => id !== 'serena-project-folder');
    assert.deepStrictEqual(foundIds(entry), []);
    const optedIn = { ...entry, env: { ...entry.env, SERENA_USAGE_REPORTING: 'true' } };
    assert.deepStrictEqual(foundIds(optedIn), []);
    // an entry with no env at all
    const bare = { command: 'uvx', args: entry.args };
    assert.deepStrictEqual(F.serenaTelemetryFix(bare).env, { SERENA_USAGE_REPORTING: 'false' });
});

// ---- data-folder-ignore ---------------------------------------------------------------------------------------------

test('data-folder-ignore: a relative folder here with no ignore is found and fixed; its own .gitignore or alfred-code\'s covers it', () =>
{
    const w = world();
    try
    {
        const pw = (root: string) => ({ command: 'npx', args: ['-y', '@playwright/mcp@0.0.83', '--browser', 'chrome', '--user-data-dir', root] });
        // a parent's .mcp.json server: it starts here too, and this row reads it (the other rows never do)
        const parent = (root: string, extra = {}): InvRegistration => ({ ...reg('playwright-chrome', pw(root), { scope: 'inherited' }), from: path.dirname(w.project), approval: 'pending', shadowed: null, ...extra });
        // a real git: this world is no work tree, so git cannot answer and the folder's own files decide
        const ctx = (registrations: InvRegistration[]) => ctxFor({ platform: process.platform, project: w.project, registrations, machine: noMachine({ exists: (p) => fs.existsSync(p), run: C.realMachine().run }) });
        const found = (registrations: InvRegistration[]) => F.dataFolderIgnoreDetect(ctx(registrations));
        const folder = path.join(w.project, '.alfred-tools', 'playwright-chrome');

        const f = found([parent('.alfred-tools/playwright-chrome')]);
        assert.deepStrictEqual(f.map((x) => [x.id, x.name, x.scope, x.proposal!.path]), [['data-folder-ignore', 'playwright-chrome', 'inherited', folder]]);
        assert.match(f[0]!.found, /\.alfred-tools\/playwright-chrome .*not git-ignored/);
        // through the engine: a machine fix, offered
        const d = detectAll(ctx([parent('.alfred-tools/playwright-chrome')]), { only: 'data-folder-ignore' });
        assert.deepStrictEqual(d.found.map((x) => [x.id, x.kind, Boolean(x.blocked)]), [['data-folder-ignore', 'machine', false]]);

        const r = F.dataFolderIgnoreFix(f[0]!, ctx([]));
        assert.strictEqual(r.ok, true, r.detail);
        assert.strictEqual(fs.readFileSync(path.join(folder, '.gitignore'), 'utf8'), '*\n');
        assert.deepStrictEqual(found([parent('.alfred-tools/playwright-chrome')]), [], 'read back: covered');
        // a .gitignore already there is left as it is
        fs.writeFileSync(path.join(folder, '.gitignore'), 'mine\n');
        assert.strictEqual(F.dataFolderIgnoreFix(f[0]!, ctx([])).ok, true);
        assert.strictEqual(fs.readFileSync(path.join(folder, '.gitignore'), 'utf8'), 'mine\n');

        // .alfred/<name>: alfred-code's .alfred/.gitignore covers it, and only it
        assert.deepStrictEqual(found([parent('.alfred/playwright-chrome')]).map((x) => x.proposal!.path), [path.join(w.project, '.alfred', 'playwright-chrome')]);
        fs.mkdirSync(path.join(w.project, '.alfred'));
        fs.writeFileSync(path.join(w.project, '.alfred', '.gitignore'), '*\n');
        assert.deepStrictEqual(found([parent('.alfred/playwright-chrome')]), []);
        assert.strictEqual(found([parent('.alfred-tools/pw2')]).length, 1, "alfred-code's file does not cover .alfred-tools");

        // what is not found: a parent's server rejected here or shadowed, an absolute, ${HOME} or ~ folder, a user's own server
        assert.deepStrictEqual(found([parent('.alfred-tools/pw3', { approval: 'rejected' })]), []);
        assert.deepStrictEqual(found([parent('.alfred-tools/pw3', { shadowed: { scope: 'project' } })]), []);
        for (const root of [path.join(w.home, 'pw'), '${HOME}/.alfred-tools/pw', '~/.alfred-tools/pw']) assert.deepStrictEqual(found([parent(root)]), [], root);
        assert.deepStrictEqual(found([{ ...parent('.alfred-tools/pw3'), own: true, rowId: null }]), []);
        // this folder's own project-scope server; local and user scope write absolute folders, never relative ones
        assert.strictEqual(found([reg('playwright-chrome', pw('.alfred-tools/pw3'), { scope: 'project' })]).length, 1);
        assert.deepStrictEqual(found([reg('playwright-chrome', pw('.alfred-tools/pw3'), { scope: 'local' })]), []);
        // two registrations naming one folder are one finding
        assert.strictEqual(found([parent('.alfred-tools/pw3'), reg('playwright-chrome', pw('.alfred-tools/pw3'), { scope: 'project', name: 'pw' })]).length, 1);
    }
    finally { w.clean(); }
});

// ---- npx-cache-entry ------------------------------------------------------------------------------------------------

// npx's folder for one package spec, as npm 11.6.1's libnpmexec names it: sha512 of the spec, hex, the first 16
const npxFolder = (cache: string, spec: string) => path.join(cache, '_npx', createHash('sha512').update(spec).digest('hex').slice(0, 16));
// npm in force with this cache, as npm 10.9.2 and 11.6.1 answer (measured): `config get cache` is refused, and
// `config ls -l` prints each source's value, all but the one in force commented out; any other call fails
const npmAt = (cache: string, over: Partial<MachineProbe> = {}) => noMachine({
    exists: (p) => existsSync(p),
    run: (cmd, args) =>
    {
        const a = `${cmd} ${args.join(' ')}`;
        if (a === 'npm config get cache') return { status: 1, stdout: '', stderr: 'npm error The cache option is protected, and can not be retrieved in this way\n' };
        if (a === 'npm config ls -l') return { status: 0, stdout: `; "default" config\n; cache = ${JSON.stringify(path.join(cache, 'not-this'))} ; overridden by env\ncache-max = null\n\n; "env" config from environment\ncache = ${JSON.stringify(cache)}\r\n`, stderr: '' };
        return { status: 1, stdout: '', stderr: '' };
    },
    ...over,
});

test('npx-cache-entry: an npx server whose cache folder lost its package.json is found; the fix removes that folder only and fetches it again', () =>
{
    const w = world();
    try
    {
        const cache = path.join(w.home, '.npm');
        const spec = '@playwright/mcp@0.0.84';
        const folder = npxFolder(cache, spec);
        const pw = reg('playwright-chrome', { command: 'npx', args: ['-y', spec, '--browser', 'chrome'], env: { npm_config_before: '2026-11-10T23:59:59Z' } }, { scope: 'project' });
        const ctx = (registrations = [pw], machine = npmAt(cache)) => ctxFor({ platform: process.platform, project: w.project, registrations, machine });
        const found = (registrations?: InvRegistration[], machine?: MachineProbe) => F.npxCacheEntryDetect(ctx(registrations, machine));

        assert.deepStrictEqual(found(), [], 'no folder yet: npx has not run');
        fs.mkdirSync(path.join(folder, 'node_modules'), { recursive: true });
        fs.writeFileSync(path.join(folder, 'package.json'), '{}\n');
        assert.deepStrictEqual(found(), [], 'a whole folder');
        fs.rmSync(path.join(folder, 'package.json'));
        const [f] = found() as [Finding];
        assert.deepStrictEqual([f.id, f.row, f.name, f.scope, f.proposal], ['npx-cache-entry', 'playwright-chrome', 'playwright-chrome', 'project', { path: folder, what: spec }]);
        assert.match(f.found, /no package\.json/);
        assert.match(f.found, /ENOENT/);
        assert.ok(!JSON.stringify(f).includes('npm_config_before'), 'a finding carries no env - a key could be in it');
        assert.deepStrictEqual(detectAll(ctx(), { only: 'npx-cache-entry' }).found.map((x) => [x.id, x.kind, Boolean(x.blocked)]), [['npx-cache-entry', 'machine', false]]);
        // Windows' cmd /c npx is the same package, the same folder: two registrations of it, one finding
        const edge = reg('playwright-msedge', { command: 'cmd', args: ['/c', 'npx', '-y', spec, '--browser', 'msedge'] }, { scope: 'local' });
        assert.strictEqual(found([pw, edge]).length, 1);
        // a parent folder's server, as a child folder inherits it: npx's cache is the machine's, so fix run here finds
        // it too; one a nearer server of its name shadows, or one rejected here, does not start here
        const parentDir = path.dirname(w.project);
        const inherited: InvRegistration = { ...pw, scope: 'inherited', from: parentDir, approval: 'pending', shadowed: null };
        const [fi] = found([inherited]) as [Finding];
        assert.deepStrictEqual([fi && fi.scope, fi && fi.proposal!.path], ['inherited', folder]);
        assert.deepStrictEqual(found([{ ...inherited, shadowed: { scope: 'local', from: null } }]), []);
        assert.deepStrictEqual(found([{ ...inherited, approval: 'rejected' }]), []);
        assert.deepStrictEqual(found([{ ...pw, approval: 'rejected' }]), []);
        // the registration's own npm_config_cache wins over npm's answer
        const other = path.join(w.home, 'other-cache');
        fs.mkdirSync(npxFolder(other, spec), { recursive: true });
        const own = reg('playwright-chrome', { command: 'npx', args: ['-y', spec], env: { npm_config_cache: other } }, { name: 'pw-own' });
        assert.deepStrictEqual(found([own], npmAt(path.join(w.home, 'nowhere'))).map((x) => x.proposal!.path), [npxFolder(other, spec)]);
        // npm_config_cache in the environment fix runs in is npm's own first source, ahead of any .npmrc - and npm prints
        // a UUID-shaped part of a path as *** (measured), so a value it redacted is no folder
        const inEnv = (env: Env, machine: MachineProbe) => F.npxCacheEntryDetect(ctxFor({ platform: process.platform, project: w.project, registrations: [pw], machine, env }));
        assert.deepStrictEqual(inEnv({ NPM_CONFIG_CACHE: other }, npmAt(path.join(w.home, 'nowhere'))).map((x) => x.proposal!.path), [npxFolder(other, spec)]);
        assert.deepStrictEqual(inEnv({ npm_config_cache: '' }, npmAt(cache)).map((x) => x.proposal!.path), [folder], 'an empty value is no value to npm');
        assert.deepStrictEqual(inEnv({}, npmAt(path.join(w.home, '***', 'npm-cache'), { exists: (p) => !p.endsWith('package.json') })), []);

        // what is not found: npm cannot answer, a user's own server, an alfred-code leftover, a uvx server
        assert.deepStrictEqual(found([pw], noMachine({ exists: (p) => fs.existsSync(p) })), []);
        assert.deepStrictEqual(found([{ ...pw, own: true, rowId: null }]), []);
        assert.deepStrictEqual(found([{ ...pw, alfredRetired: true }]), []);
        assert.deepStrictEqual(found([reg('serena', { command: 'uvx', args: ['--from', 'serena-agent@2.1.0', 'serena'] })]), []);

        // the fix: that folder goes, its neighbour stays, and the package is asked for again from the registration as read
        const neighbour = path.join(cache, '_npx', '0123456789abcdef');
        fs.mkdirSync(neighbour, { recursive: true });
        const r = F.npxCacheEntryFix(f, ctx());
        assert.strictEqual(r.ok, true, r.detail);
        assert.ok(!fs.existsSync(folder));
        assert.ok(fs.existsSync(neighbour));
        assert.deepStrictEqual([r.fetch!.op, r.fetch!.name, r.fetch!.scope, r.fetch!.what, r.fetch!.argv], ['fetch', 'playwright-chrome', 'project', spec, ['npm', 'exec', '--yes', '--package', spec, '--', 'node', '-e', '0']]);
        assert.deepStrictEqual(r.fetch!.env, { npm_config_before: '2026-11-10T23:59:59Z' }, 'the fetch resolves as the registration does');
        assert.deepStrictEqual(found(), [], 'read back');
        // a parent's server: the fetch reads it from the nearest parent's .mcp.json naming it, never a farther one it shadows
        fs.mkdirSync(folder, { recursive: true });
        const farther: InvRegistration = { ...inherited, from: path.dirname(parentDir), entry: { command: 'npx', args: ['-y', '@playwright/mcp@0.0.80'] }, shadowed: { scope: 'inherited', from: parentDir } };
        const ri = F.npxCacheEntryFix(fi, ctx([farther, inherited]));
        assert.strictEqual(ri.ok, true, ri.detail);
        assert.deepStrictEqual([ri.fetch!.name, ri.fetch!.scope, ri.fetch!.from, ri.fetch!.what], ['playwright-chrome', 'project', parentDir, spec]);
        assert.ok(!fs.existsSync(folder));
        // never a folder that is not an npx cache folder
        for (const bad of [w.project, path.join(cache, '_npx'), path.join(w.home, 'x', '0123456789abcdef')])
        {
            const no = F.npxCacheEntryFix({ ...f, proposal: { ...f.proposal, path: bad } }, ctx());
            assert.strictEqual(no.ok, false, bad);
            assert.match(no.detail, /not an npx cache folder/);
        }
        assert.ok(fs.existsSync(w.project) && fs.existsSync(neighbour));
    }
    finally { w.clean(); }
});

test('apply: npx-cache-entry removes the folder and hands the package to fetch.js; the restart waits for the fetch', () =>
{
    const w = world();
    try
    {
        const spec = '@playwright/mcp@0.0.84';
        seed(w, 'playwright-chrome', 'user', { command: 'npx', args: ['-y', spec, '--browser', 'chrome', '--no-webmcp'], env: {} });
        const cache = path.join(w.home, '.npm');
        const folder = npxFolder(cache, spec);
        fs.mkdirSync(path.join(folder, 'node_modules'), { recursive: true });
        const lines: string[] = [];
        const res = applyFixes(ctxOf(w, { machine: npmAt(cache) }), ['npx-cache-entry'], { tmp: path.join(w.dir, 'tmp'), log: (...a) => lines.push(a.join(' ')) });
        const text = lines.join('\n');
        assert.strictEqual(res.failed, null, text);
        assert.ok(!fs.existsSync(folder));
        assert.deepStrictEqual(res.applied.map((f) => f.id), ['npx-cache-entry']);
        assert.strictEqual(res.steps, 0, 'no registration is rewritten');
        assert.ok(res.fetchFile && fs.existsSync(res.fetchFile), text);
        const job = readJson(res.fetchFile);
        assert.deepStrictEqual(job.fetch.map((s: { name: string; scope: string; what: string }) => [s.name, s.scope, s.what]), [['playwright-chrome', 'user', spec]]);
        assert.deepStrictEqual(job.check, ['playwright-chrome']);
        assert.match(text, /Fetch next, in the background/);
        assert.match(text, /fixed +npx-cache-entry on playwright-chrome/);
        assert.match(text, /Restart Claude Code.*after the fetch reports/);
        assert.deepStrictEqual(w.writes(), [['mcp', 'add-json', 'playwright-chrome', JSON.stringify({ command: 'npx', args: ['-y', spec, '--browser', 'chrome', '--no-webmcp'], env: {} }), '-s', 'user']], 'only the seed: the fix writes no registration');
    }
    finally { w.clean(); }
});

// ---- retired-plugin (spec D8, D9) -----------------------------------------------------------------------------------

const RETIRED = { ts: 'typescript-lsp@claude-plugins-official', cs: 'csharp-lsp@claude-plugins-official', hud: 'claude-hud@claude-hud' };
const plug = (id: string, scope: string, over: Partial<PluginRow> = {}) => ({ id, plugin: id.split('@')[0], marketplace: id.split('@')[1], scope, enabled: true, rowId: null, alfredRetired: false, ...over }) as PluginRow;

test('retired-plugin offers an uninstall per installed id and scope', () =>
{
    const ctx = ctxFor({ plugins: [plug(RETIRED.ts, 'project'), plug(RETIRED.hud, 'user'), plug(RETIRED.hud, 'local'), plug('tidy@someone', 'user')] });
    const found = detect(ctx).found.filter((f) => f.id === 'retired-plugin');
    assert.deepStrictEqual(found.map((f) => [f.name, f.scope, f.kind, f.alfred, Boolean(f.blocked)]), [
        [RETIRED.ts, 'project', 'machine', false, false], [RETIRED.hud, 'user', 'machine', false, false], [RETIRED.hud, 'local', 'machine', false, false]]);
    assert.match(found[0]!.found, /no longer lists it - it works in Claude Code alone/);
    assert.deepStrictEqual(found[0]!.proposal, { command: `claude plugin uninstall ${RETIRED.ts} --scope project` });
    // alfred-code set up: each finding says it removes it for both
    const both = detect({ ...ctx, inventory: { ...ctx.inventory, alfredCodeEnabled: true } }).found.filter((f) => f.id === 'retired-plugin');
    assert.ok(both.every((f) => f.alfred === true));
    assert.match(both[0]!.found, new RegExp(`${RETIRED.ts} - alfred-code also installs it, and this removes it for both$`));
});

test('fix reports a declined id with no apply step', () =>
{
    const data = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-declined-'));
    try
    {
        add(data, [{ id: RETIRED.hud, scope: 'user' }]);
        const ctx = makeCtx({ ...ctxFor({ plugins: [plug(RETIRED.hud, 'user')] }), inventory: ctxFor({ plugins: [plug(RETIRED.hud, 'user')] }).inventory, catalog, machine: noMachine(), data });
        const [f] = detect(ctx).found.filter((x) => x.id === 'retired-plugin') as [Finding];
        assert.strictEqual(f.declined, true);
        assert.strictEqual(f.blocked, `${RETIRED.hud} is kept at user; remove it with claude plugin uninstall ${RETIRED.hud} --scope user`);
        assert.ok(!(questions(detect(ctx)).pick.flat().flatMap((q) => q.options.map((o) => o.label))).includes('retired-plugin'), 'no apply step is offered');
        assert.match(renderFixes(detect(ctx)), /NOT APPLICABLE: claude-hud@claude-hud is kept at user/);
    }
    finally { fs.rmSync(data, { recursive: true, force: true }); }
});

// ---- windows-mcp-one-per-desktop ------------------------------------------------------------------------------------

test('windows-mcp-one-per-desktop: two servers give one blocked finding naming both and how to drop each; one gives none; non-win32 gives none', () =>
{
    const wd = reg('windows-control', fresh('windows-control', 'win32'));
    const alfred = { id: 'windows-control@envoydev', plugin: 'windows-control', marketplace: 'envoydev', scope: 'user', enabled: true, rowId: null, alfredRetired: true } as PluginRow;
    const two = (platform: string) => ctxFor({ platform, registrations: [wd], plugins: [alfred] });
    const mine = (d: Detected) => d.found.filter((f) => f.id === 'windows-mcp-one-per-desktop');
    const found = mine(detect(two('win32')));
    assert.strictEqual(found.length, 1);
    assert.match(found[0]!.found, /^2 windows-mcp servers start in this project: windows-desktop \(local\), windows-control@envoydev \(user\)/);
    assert.match(found[0]!.blocked!, /claude plugin disable windows-control@envoydev --scope user/);
    assert.match(found[0]!.blocked!, /\/alfred-tools:configure/);
    assert.match(found[0]!.blocked!, /a stuck one recovers only in a new Claude Code session/);
    assert.strictEqual(mine(detect(two('win32'), 'windows-control')).length, 1, '--only by the tool finds it');
    assert.deepStrictEqual(F.windowsMcpOneDetect(ctxFor({ platform: 'win32', registrations: [wd] })), []);
    assert.deepStrictEqual(mine(detect(two('darwin'))), []);
});

test("windows-mcp-one-per-desktop: each owner's own drop line", () =>
{
    const wd = reg('windows-control', fresh('windows-control', 'win32'));
    const blockedWith = (other: InvRegistration) => F.windowsMcpOneDetect(ctxFor({ platform: 'win32', project: '/proj', registrations: [wd, other] }))[0]!.blocked;
    const alfred = { name: 'windows-control', scope: 'local', entry: {}, rowId: null, route: null, own: true, alfredRetired: true };
    const parent = (r: InvRegistration): InvRegistration => ({ ...r, scope: 'inherited', from: '/', approval: 'approved', shadowed: null });
    assert.match(blockedWith(alfred)!, /claude mcp remove windows-control -s local/);
    assert.match(blockedWith(parent(reg('windows-control', fresh('windows-control', 'win32'), { name: 'wd-parent' })))!, /\/alfred-tools:configure \(Remove\), run in \.\./);
    assert.match(blockedWith(parent(alfred))!, /claude mcp remove windows-control -s project, run in \.\./);
});

test('questions: only NOT APPLICABLE findings give no apply ask', () =>
{
    const advice = { id: 'windows-mcp-one-per-desktop', name: 'windows-desktop', scope: 'local', kind: 'registration', found: 'x', blocked: 'y' };
    assert.deepStrictEqual(questions({ found: [advice], held: [] } as unknown as Detected), { choose: null, pick: [], drift: [] });
    assert.deepStrictEqual(questions({ found: [], held: [] } as unknown as Detected), { choose: null, pick: [], drift: [] });
    const q = questions({ found: [advice, { id: 'uvx-python', name: 'memory', scope: 'local', kind: 'registration', found: 'z' }], held: [] } as unknown as Detected);
    assert.strictEqual(q.choose!.question, '1 known problem found. Apply?');
});

// ---- narrowing and rendering ----------------------------------------------------------------------------------------

test('data-folder-ignore: in a git work tree git decides - the project\'s own ignore covers the folder, a .gitignore that leaves its data out does not', () =>
{
    const w = world();
    try
    {
        spawnSync('git', ['init', '-q'], { cwd: w.project });
        const pw = (root: string) => reg('playwright-chrome', { command: 'npx', args: ['-y', '@playwright/mcp@0.0.83', '--browser', 'chrome', '--user-data-dir', root] }, { scope: 'project' });
        const found = (root: string) => F.dataFolderIgnoreDetect(ctxFor({ platform: process.platform, project: w.project, registrations: [pw(root)], machine: noMachine({ exists: (p) => fs.existsSync(p), run: C.realMachine().run }) }));
        // the project ignores .alfred-tools/: covered, though the folder has no .gitignore of its own
        fs.writeFileSync(path.join(w.project, '.gitignore'), '.alfred-tools/\n');
        assert.deepStrictEqual(found('.alfred-tools/playwright-chrome'), []);
        // a folder's own .gitignore that ignores only logs: its data is not covered, and the fix leaves the user's file
        const own = path.join(w.project, 'tools', 'pw');
        fs.mkdirSync(own, { recursive: true });
        fs.writeFileSync(path.join(own, '.gitignore'), '*.log\n');
        const [f] = found('tools/pw') as [Finding];
        assert.ok(f, 'a .gitignore that leaves the data out is a finding');
        assert.match(f.blocked!, /tools\/pw\/\.gitignore .*does not ignore .*add \*/);
        // alfred-code's .alfred/.gitignore, when git reads it, covers .alfred/<name>
        fs.mkdirSync(path.join(w.project, '.alfred'));
        fs.writeFileSync(path.join(w.project, '.alfred', '.gitignore'), '*\n');
        assert.deepStrictEqual(found('.alfred/playwright-chrome'), []);
    }
    finally { w.clean(); }
});

test('fix detectors never return an inherited registration (data-folder-ignore, project-relative-path, mcp-order and helper-child-folder read the parents, in their own tests)', () =>
{
    const entry = fresh('serena');
    const stripped = { ...entry, env: { SERENA_HOME: entry.env!.SERENA_HOME } } as ServerEntry;
    assert.deepStrictEqual(ids(detect(ctxFor({ registrations: [reg('serena', stripped)] })).found), ['serena-telemetry', 'serena-project-folder'], 'the same entry at local scope has findings');
    assert.deepStrictEqual(detect(ctxFor({ registrations: [reg('serena', stripped, { scope: 'inherited' })] })).found, []);
});

test('--only narrows by fix id, tool or registration name; the table names the held row; nothing found says so', () =>
{
    const entry = fresh('serena');
    const stripped = { command: 'uvx', args: entry.args!.filter((a, i, all) => a !== '--python' && all[i - 1] !== '--python'), env: { SERENA_HOME: entry.env!.SERENA_HOME! } };
    const ctx = ctxFor({ registrations: [reg('serena', stripped), reg('memory', { command: 'uvx', args: ['--from', 'mcp-memory-service[sqlite]==12.1.1', 'memory', 'server'] })] });
    assert.deepStrictEqual(ids(detect(ctx).found).sort(), ['serena-project-folder', 'serena-telemetry', 'uvx-python', 'uvx-python']);
    assert.strictEqual(detect(ctx, 'serena').found.length, 2, 'a file finding is named for its file, so only the two on the registration');
    assert.strictEqual(detect(ctx, 'memory').found.length, 1);
    assert.strictEqual(detect(ctx, 'serena-telemetry').found.length, 1);
    assert.deepStrictEqual(detect(ctx, 'nope').found, []);
    const text = renderFixes(detect(ctx));
    assert.match(text, /Known problems found \(4\):/);
    assert.match(text, /uvx-python +serena \(local\) +no --python/);
    assert.match(renderFixes(detect(ctxFor({ platform: 'win32' }))), /^No known problem found\.\n\nHeld, not checked: serena-windows-ts-shim - left out by the user's ruling/);
});

test('the asks stay inside the AskUserQuestion limits: one Recommended, first; four options a question; four questions a call', () =>
{
    const mkFound = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `fix-${i}`, name: `t${i}`, scope: 'local', kind: 'registration', found: 'x' }));
    for (const n of [1, 2, 4, 5, 9, 17])
    {
        const q = questions({ found: mkFound(n), held: [] } as unknown as Detected);
        const rec = q.choose!.options.filter((o) => /\(Recommended\)$/.test(o.label));
        assert.strictEqual(rec.length, 1, 'exactly one Recommended');
        assert.strictEqual(q.choose!.options[0], rec[0], 'and it is first');
        assert.ok(q.choose!.options.length >= 2 && q.choose!.options.length <= 4);
        assert.strictEqual(q.choose!.options.some((o) => o.label === 'Pick which'), n > 1);
        for (const call of q.pick)
        {
            assert.ok(call.length >= 1 && call.length <= 4, `${call.length} questions in a call`);
            for (const question of call) assert.ok(question.options.length >= 2 || n % 4 === 1, 'a lone last option is allowed only as the remainder');
        }
        assert.strictEqual(q.pick.flat().flatMap((x) => x.options).length, n);
    }
    // a blocked finding is not offered
    const q = questions({ found: [{ id: 'a', name: 'x', scope: 'local', kind: 'registration', found: 'f', blocked: 'no' }, { id: 'b', name: 'y', scope: 'local', kind: 'registration', found: 'f' }], held: [] } as unknown as Detected);
    assert.deepStrictEqual(q.pick.flat().flatMap((x) => x.options).map((o) => o.label), ['b']);
});

// ---- applying, against the fake claude ------------------------------------------------------------------------------

const userEntry = (w: World, name: string) => account.readAccount(w.env, w.project).user[name];

test('apply: two fixes on one registration are ONE replace, from the entry as read - the user\'s pin and extra args survive', () =>
{
    const w = world();
    try
    {
        // the entry as the installer writes it on this machine, so the same two fixes apply on every OS - with its
        // context file in the global root, as the install leaves it
        const entry = fresh('serena', process.platform, process.arch, 'user', { project: w.project, home: w.home });
        put(path.join(w.home, '.alfred-tools', 'serena', 'serena-context.yml'), rootsLib.shippedSource('serenaContext'));
        leaveConfig(path.join(w.home, '.alfred-tools', 'serena'));
        const theirs = {
            command: 'uvx',
            args: entry.args!.filter((a, i, all) => a !== '--python' && all[i - 1] !== '--python').map((a) => (a === 'serena-agent@2.1.0' ? 'serena-agent@2.0.0' : a)).concat(['--verbose']),
            env: { SERENA_HOME: entry.env!.SERENA_HOME },
        } as ServerEntry;
        seed(w, 'serena', 'user', theirs);
        const own = { command: 'node', args: ['mine.js'] };
        seed(w, 'my-own-server', 'user', own);
        const before = w.calls().length;
        const lines: string[] = [];
        const res = applyFixes(ctxOf(w), ['all'], { tmp: path.join(w.dir, 'tmp'), log: (...a) => lines.push(a.join(' ')) });
        assert.strictEqual(res.failed, null, lines.join('\n'));
        const mine = w.calls().slice(before).filter((a) => a[0] === 'mcp' && ['add-json', 'remove'].includes(a[1]));
        assert.deepStrictEqual(mine.map((a) => [a[1], a[2]]), [['remove', 'serena'], ['add-json', 'serena']], 'one remove and one add, nothing else touched');
        const now = userEntry(w, 'serena');
        // the row's minor, as this machine takes it: on Windows ARM64 the x64 build (windows-arm-python)
        const c = ctxOf(w);
        assert.deepStrictEqual(now!.args!.slice(0, 2), ['--python', pythonRequest({ python: '3.13' } as CatalogRoute, c, c.rules)]);
        assert.ok(now!.args!.includes('serena-agent@2.0.0') && now!.args!.includes('--verbose'));
        assert.strictEqual(now!.env!.SERENA_USAGE_REPORTING, 'false');
        assert.strictEqual(now!.env!.SERENA_HOME, entry.env!.SERENA_HOME);
        assert.deepStrictEqual(userEntry(w, 'my-own-server'), own, 'a registration that matches no row is never touched');
        // and the 0.4.x install moves onto the list (list-import)
        assert.deepStrictEqual(res.applied.map((f) => f.id).sort(), ['list-import', 'serena-telemetry', 'start-timeout', 'uvx-python']);
        assert.deepStrictEqual(res.remaining, []);
        assert.match(lines.join('\n'), /fixed +uvx-python on serena \(user\)/);
        assert.match(lines.join('\n'), /Restart Claude Code/);
        // a second run finds nothing and writes nothing
        const again = w.calls().length;
        const lines2: string[] = [];
        applyFixes(ctxOf(w), ['all'], { log: (...a) => lines2.push(a.join(' ')) });
        assert.match(lines2.join('\n'), /Nothing to apply/);
        assert.strictEqual(w.calls().slice(again).filter((a) => a[0] === 'mcp' && ['add-json', 'remove'].includes(a[1])).length, 0);
    }
    finally { w.clean(); }
});

test('apply: picked ids only; --only narrows to one registration; an unknown id fails before anything is written', () =>
{
    const w = world();
    try
    {
        const bare = { command: 'uvx', args: ['--python', '3.13', '--from', 'serena-agent@2.1.0', 'serena', 'start-mcp-server'], env: {} };
        seed(w, 'serena', 'user', bare);
        seed(w, 'serena-two', 'user', bare);
        const before = w.calls().length;
        const res = applyFixes(ctxOf(w), ['serena-telemetry'], { only: 'serena-two', tmp: path.join(w.dir, 'tmp'), log: () => {} });
        assert.strictEqual(res.failed, null);
        assert.strictEqual(userEntry(w, 'serena-two')!.env!.SERENA_USAGE_REPORTING, 'false');
        assert.strictEqual(userEntry(w, 'serena')!.env!.SERENA_USAGE_REPORTING, undefined, 'the other registration is left');
        const bad = applyFixes(ctxOf(w), ['no-such-fix'], { log: () => {} });
        assert.match(bad.failed!, /unknown fix id: no-such-fix/);
        assert.ok(w.calls().slice(before).filter((a) => a[1] === 'add-json').length === 1);
        // a held row cannot be picked into a change
        const held = applyFixes(ctxOf(w, { platform: 'win32' }), ['serena-windows-ts-shim'], { log: () => {} });
        assert.strictEqual(held.applied.length, 0);
    }
    finally { w.clean(); }
});

test('an advice row never reaches a fix: a finding it returns unblocked is blocked by detectAll', () =>
{
    const w = world();
    try
    {
        const entry = fresh('serena', process.platform, process.arch);
        seed(w, 'serena', 'user', { ...entry, env: { SERENA_HOME: entry.env!.SERENA_HOME } } as ServerEntry);
        // a future advice row whose detector forgot `blocked`
        const advice = { ...catalog.fixes.find((f) => f.id === 'serena-telemetry'), advice: true, fix: null } as FixRow;
        const ctx = { ...ctxOf(w), catalog: { ...catalog, fixes: [advice] } };
        const found = detectAll(ctx).found;
        assert.deepStrictEqual(found.map((f) => [f.id, f.blocked]), [['serena-telemetry', 'advice only - nothing here is applied']]);
        assert.deepStrictEqual(questions(detectAll(ctx)), { choose: null, pick: [], drift: [] });
        const before = w.writes().length;
        const lines: string[] = [];
        const res = applyFixes(ctx, ['all'], { log: (...a) => lines.push(a.join(' ')) });
        assert.strictEqual(res.failed, null, lines.join('\n'));
        assert.strictEqual(res.steps, 0);
        assert.ok(lines.some((l) => l.startsWith('skipped serena-telemetry')), lines.join('\n'));
        assert.deepStrictEqual(w.writes().slice(before), []);
    }
    finally { w.clean(); }
});

test('apply: a blocked finding, and one that needs an answer, are named and skipped - never guessed', () =>
{
    const w = world();
    try
    {
        const old = { command: 'npx', args: ['-y', '@playwright/mcp@0.0.50', '--browser', 'chrome'], env: {} };
        seed(w, 'playwright-chrome', 'user', old);
        const before = w.calls().length;
        const lines: string[] = [];
        const res = applyFixes(ctxOf(w), ['playwright-webmcp'], { log: (...a) => lines.push(a.join(' ')) });
        assert.strictEqual(res.skipped.length, 1);
        assert.match(lines.join('\n'), /skipped playwright-webmcp on playwright-chrome \(user\): pinned @0\.0\.50 is older than 0\.0\.83/);
        assert.strictEqual(w.calls().slice(before).filter((a) => a[1] === 'add-json').length, 0);
        assert.deepStrictEqual(userEntry(w, 'playwright-chrome'), old);

        const spaced = ctxFor({ platform: 'win32', home: 'C:\\Users\\Jo Doe', registrations: [reg('serena', { command: 'uvx', args: ['--python', '3.13'], env: { SERENA_HOME: 'C:\\Users\\Jo Doe\\.serena' } }, { scope: 'user' })] });
        const out: string[] = [];
        const r2 = applyFixes({ ...spaced, env: w.env, inventory: { ...spaced.inventory, project: w.project } }, ['serena-windows-home'], { log: (...a) => out.push(a.join(' ')) });
        assert.match(out.join('\n'), /needs --input serenaHome=<value>/);
        assert.strictEqual(r2.applied.length, 0);
    }
    finally { w.clean(); }
});

test('apply: a failing add puts the old registration back; if that fails too, the exact restore line is printed; neither prints the restart line', () =>
{
    const w = world();
    try
    {
        const bare = { command: 'uvx', args: ['--python', '3.13', '--from', 'serena-agent@2.1.0', 'serena', 'start-mcp-server'], env: {} };
        seed(w, 'serena', 'user', bare);
        // only the NEW entry (it carries SERENA_USAGE_REPORTING) is refused: the old one is re-added
        let lines: string[] = [];
        let res = applyFixes(ctxOf(w, { env: { ...w.env, FAKE_CLAUDE_FAIL: 'SERENA_USAGE_REPORTING' } }), ['serena-telemetry'], { tmp: path.join(w.dir, 'tmp'), log: (...a) => lines.push(a.join(' ')) });
        assert.ok(res.failed, lines.join('\n'));
        assert.deepStrictEqual(userEntry(w, 'serena'), bare, 'the registration is back exactly as it was');
        assert.ok(!lines.join('\n').includes('Restart Claude Code'));
        // every add is refused: nothing can be put back, and the user is handed the line that does it
        lines = [];
        res = applyFixes(ctxOf(w, { env: { ...w.env, FAKE_CLAUDE_FAIL: 'add-json' } }), ['serena-telemetry'], { tmp: path.join(w.dir, 'tmp'), log: (...a) => lines.push(a.join(' ')) });
        assert.ok(res.failed);
        assert.match(lines.join('\n'), /RESTORE BY HAND: claude mcp add-json serena '\{"command":"uvx"/);
        assert.ok(!lines.join('\n').includes('Restart Claude Code'));
    }
    finally { w.clean(); }
});

// A world whose fake claude has these plugins installed, alfred-code among them when `alfred`.
function plugWorld(w: World, installed: [string, string][], { alfred = false }: { alfred?: boolean } = {})
{
    const all: [string, string][] = alfred ? [...installed, ['alfred-code@envoydev', 'user']] : installed;
    const file = path.join(w.dir, 'state', 'plugins.json');
    fs.writeFileSync(file, JSON.stringify({
        marketplaces: [],
        installed: all.map(([id, scope]) => ({ id, version: '1.0.0', scope, enabled: true, installPath: path.join(w.dir, 'cache', id), ...(scope === 'user' ? {} : { projectPath: fs.realpathSync(w.project) }) })),
    }));
    // the fake reads enabledPlugins from each scope's settings file
    const settings: Record<string, string> = { user: path.join(w.account, 'settings.json'), project: path.join(w.project, '.claude', 'settings.json'), local: path.join(w.project, '.claude', 'settings.local.json') };
    for (const [id, scope] of all)
    {
        fs.mkdirSync(path.dirname(settings[scope]!), { recursive: true });
        const doc = fs.existsSync(settings[scope]!) ? JSON.parse(fs.readFileSync(settings[scope]!, 'utf8')) : {};
        doc.enabledPlugins = { ...(doc.enabledPlugins || {}), [id]: true };
        fs.writeFileSync(settings[scope]!, JSON.stringify(doc, null, 2));
    }
}

test('the machine fix runs after the registration edits and is read back; its failure stops the run', () =>
{
    const w = world();
    try
    {
        plugWorld(w, [[RETIRED.hud, 'user'], [RETIRED.ts, 'project']]);
        // claude-hud's own statusLine in the account settings
        const settings = path.join(w.account, 'settings.json');
        const doc = JSON.parse(fs.readFileSync(settings, 'utf8'));
        doc.statusLine = { type: 'command', command: `${fill(SHAPES.sortV, { RUNTIME_PATH: process.execPath, SOURCE: 'dist/index.js' })}` };
        fs.writeFileSync(settings, JSON.stringify(doc, null, 2));
        const lines: string[] = [];
        const res = applyFixes(ctxOf(w), ['retired-plugin'], { log: (...a) => lines.push(a.join(' ')) });
        assert.strictEqual(res.failed, null, lines.join('\n'));
        const text = lines.join('\n');
        assert.match(text, /ok +retired-plugin: uninstalled claude-hud@claude-hud \(user\); removed claude-hud's statusLine from /);
        assert.match(text, /ok +retired-plugin: uninstalled typescript-lsp@claude-plugins-official \(project\)/);
        assert.match(text, /fixed +retired-plugin on claude-hud@claude-hud/);
        assert.deepStrictEqual(w.calls().filter((a) => a[0] === 'plugin' && a[1] === 'uninstall').map((a) => a.slice(2)), [[RETIRED.hud, '--scope', 'user'], [RETIRED.ts, '--scope', 'project']]);
        assert.strictEqual(JSON.parse(fs.readFileSync(settings, 'utf8')).statusLine, undefined, 'claude-hud\'s statusLine is gone');
        assert.match(text, /Restart Claude Code/);
        // a refused uninstall stops the run and says so
        plugWorld(w, [[RETIRED.cs, 'user']]);
        const failing: string[] = [];
        const bad = applyFixes(ctxOf(w, { env: { ...w.env, FAKE_CLAUDE_FAIL: 'uninstall' } }), ['retired-plugin'], { log: (...a) => failing.push(a.join(' ')) });
        assert.ok(bad.failed);
        assert.match(failing.join('\n'), /FAILED retired-plugin: claude plugin uninstall csharp-lsp@claude-plugins-official --scope user failed/);
    }
    finally { w.clean(); }
});

test('declines per answer: unpicked recorded; kept out for alfred-code recorded and named; Skip records nothing; fix with one id', () =>
{
    const w = world();
    const data = path.join(w.dir, 'data');
    try
    {
        plugWorld(w, [[RETIRED.hud, 'user'], [RETIRED.ts, 'project']], { alfred: true });
        // 'Skip' runs nothing: no file
        assert.deepStrictEqual(declines.read(data), []);
        // 'Apply all found' with alfred-code set up: both are kept out, the command passes them as declined, and each is named
        const lines: string[] = [];
        const res = applyFixes(ctxOf(w, { data }), ['all'], { input: { 'retired-declined': `${RETIRED.hud}~user,${RETIRED.ts}~project` }, log: (...a) => lines.push(a.join(' ')) });
        assert.strictEqual(res.failed, null, lines.join('\n'));
        assert.match(lines.join('\n'), /claude-hud@claude-hud kept - alfred-code installs it; fix lists it/);
        assert.match(lines.join('\n'), /typescript-lsp@claude-plugins-official kept - alfred-code installs it; fix lists it/);
        assert.ok(!w.calls().some((a) => a[0] === 'plugin' && a[1] === 'uninstall'), 'nothing uninstalled');
        assert.deepStrictEqual(declines.read(data), [{ id: RETIRED.hud, scope: 'user' }, { id: RETIRED.ts, scope: 'project' }]);
        // the next detect: advice only
        const again = detectAll(ctxOf(w, { data })).found.filter((f) => f.id === 'retired-plugin');
        assert.ok(again.every((f) => f.declined && f.blocked), JSON.stringify(again));
        // 'Pick which' with one id picked: the other, shown and unpicked, is the one passed as declined
        const data2 = path.join(w.dir, 'data2');
        applyFixes(ctxOf(w, { data: data2 }), ['none'], { input: { 'retired-declined': `${RETIRED.ts}~project` }, log: () => {} });
        assert.deepStrictEqual(declines.read(data2), [{ id: RETIRED.ts, scope: 'project' }]);
        // fix with retired-plugin as its only pick reaches an alfred-code one
        const one: string[] = [];
        const r = applyFixes(ctxOf(w, { data: data2 }), ['retired-plugin'], { log: (...a) => one.push(a.join(' ')) });
        assert.strictEqual(r.failed, null, one.join('\n'));
        assert.match(one.join('\n'), /uninstalled claude-hud@claude-hud \(user\)/);
        assert.match(one.join('\n'), /skipped retired-plugin on typescript-lsp@claude-plugins-official: typescript-lsp@claude-plugins-official is kept at project/);
        assert.ok(fs.existsSync(path.join(data2, 'retired-declined.json')));
    }
    finally { w.clean(); }
});

test('a fix that only writes a data folder\'s .gitignore asks for no restart', () =>
{
    const w = world();
    try
    {
        seed(w, 'playwright-chrome', 'project', { command: 'npx', args: ['-y', '@playwright/mcp@0.0.83', '--browser', 'chrome', '--user-data-dir', '.alfred-tools/playwright-chrome'] });
        const lines: string[] = [];
        const res = applyFixes(ctxOf(w, { machine: noMachine({ exists: (p) => fs.existsSync(p), run: C.realMachine().run }) }), ['data-folder-ignore'], { log: (...a) => lines.push(a.join(' ')) });
        assert.strictEqual(res.failed, null, lines.join('\n'));
        assert.match(lines.join('\n'), /fixed +data-folder-ignore/);
        assert.ok(!lines.join('\n').includes('Restart Claude Code'), lines.join('\n'));
    }
    finally { w.clean(); }
});

// ---- the CLI --------------------------------------------------------------------------------------------------------

test('CLI: --detect and --questions print; --apply applies; bad arguments exit 2', () =>
{
    const w = world();
    try
    {
        const bare = { command: 'uvx', args: ['--python', '3.13', '--from', 'serena-agent@2.1.0', 'serena', 'start-mcp-server'], env: {} };
        seed(w, 'serena', 'user', bare);
        let text = '';
        const out = (s: string) => { text += `${s}\n`; };
        assert.strictEqual(runFixCommand(['--detect', '--project', w.project], { env: w.env, out, machine: noMachine() }), 0);
        assert.match(text, /serena-telemetry +serena \(user\)/);
        text = '';
        assert.strictEqual(runFixCommand(['--questions', '--project', w.project], { env: w.env, out, machine: noMachine() }), 0);
        assert.strictEqual(JSON.parse(text).choose.options[0].label, 'Apply all found (Recommended)');
        text = '';
        assert.strictEqual(runFixCommand(['--apply', 'serena-telemetry', '--project', w.project, '--tmp', path.join(w.dir, 'tmp')], { env: w.env, out, machine: noMachine() }), 0);
        assert.strictEqual(userEntry(w, 'serena')!.env!.SERENA_USAGE_REPORTING, 'false');
        for (const bad of [[], ['--detect', '--apply', 'x'], ['--bogus'], ['--apply'], ['--detect', '--only'], ['--input', 'novalue', '--detect'], ['--detect', '--project', 'a', '--project', 'b']])
        {
            text = '';
            assert.strictEqual(runFixCommand(bad, { env: w.env, out, machine: noMachine() }), 2, JSON.stringify(bad));
            assert.match(text, /^fix: /);
        }
        const missing = readJson(account.accountFile(w.env));
        assert.ok(missing.mcpServers.serena, 'the registration is still there after all of it');
    }
    finally { w.clean(); }
});

test('fix makes its temp folder as tmpdir.ts does: in the real temp folder, after sweeping this plugin\'s folders older than 24 hours', () =>
{
    const w = world();
    // applyFixes runs in this process: its os.tmpdir() is pointed at the world's own temp folder for the test
    const saved = { TMPDIR: process.env.TMPDIR, TEMP: process.env.TEMP, TMP: process.env.TMP };
    try
    {
        const t = tempOf(w);
        Object.assign(process.env, { TMPDIR: t.root, TEMP: t.root, TMP: t.root });
        const old = t.made();
        const day = new Date(Date.now() - 25 * 3600 * 1000);
        fs.utimesSync(old, day, day);
        seed(w, 'serena', 'user', { command: 'uvx', args: ['--python', '3.13', '--from', 'serena-agent@2.1.0', 'serena', 'start-mcp-server'], env: {} });
        const run = applyFixes(ctxOf(w), ['serena-telemetry'], { log: () => {} });
        assert.strictEqual(run.failed, null);
        assert.ok(!fs.existsSync(old), 'its own folder older than 24 hours is swept');
        assert.strictEqual(path.dirname(run.tmp ?? ''), fs.realpathSync.native(t.root));
    }
    finally
    {
        for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
        w.clean();
    }
});

// ---- the 0.2.0 key rows (D7): key-to-helper, helper-missing, helper-stale, root-ignore, token-sync on stdio -----------

const SK = 'SENTRY_ACCESS_TOKEN';
const SA = 'SENTRY_AUTH_TOKEN';
const GK = 'GITHUB_PERSONAL_ACCESS_TOKEN';
const SENTRY = (value: string) => ({ command: 'npx', args: ['-y', '@sentry/mcp-server@0.42.0'], env: { [SK]: value } });
const GITHUB = (value: string) => ({ command: 'docker', args: ['run', '-i', '--rm', '-e', GK, 'ghcr.io/github/github-mcp-server:v2.1.0', 'stdio'], env: { [GK]: value } });
const HOSTED_GH = (auth: string) => ({ type: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: { Authorization: auth } });
const HOSTED_SENTRY = (auth: string) => ({ type: 'http', url: 'https://mcp.sentry.dev/mcp', headers: { Authorization: auth } });
const hexv = (p: string) => `${p}-${cryptox.randomBytes(10).toString('hex')}`;
const secretsAt = (root: string, pairs: Record<string, string>) => put(path.join(root, '.mcps-secrets'), Object.entries(pairs).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
const homeRoot = (w: World) => path.join(w.home, '.alfred-tools');
const ctxData = (w: World, data: string) => makeCtx({ inventory: inventory.buildInventory({ project: w.project, env: w.env, data }), env: w.env, machine: noMachine(), data });
const helperAt = (root: string, number: number | string, extra = '') => put(path.join(root, 'mcp-headers.js'), rootsLib.helperSource().replace(/^\/\/ alfred-tools mcp-headers \d+/, `// alfred-tools mcp-headers ${number}`) + extra);
const leaveConfig = (home: string) => writeMinimalConfig(path.join(home, 'serena_config.yml'), home);

test('key-to-helper: a ${VAR} filled in the chain is moved to the helper under that name', () =>
{
    const w = world();
    try
    {
        const v = hexv('gh');
        seed(w, 'github', 'local', HOSTED_GH('Bearer ${ACME_GH}'));
        secretsAt(ptRoot(w), { ACME_GH: v });
        const d = detect(ctxOf(w));
        const [f] = d.found.filter((x) => x.id === 'key-to-helper') as [Finding];
        assert.deepStrictEqual([f.name, f.scope, f.keyName, Boolean(f.blocked)], ['github', 'local', 'ACME_GH', false]);
        assert.ok(!shownOf(d).includes(v), 'the detection names the key, never its value');
        const l = logged();
        const res = applyFixes(ctxOf(w), ['key-to-helper'], { tmp: path.join(w.dir, 'tmp'), log: l.log });
        assert.strictEqual(res.failed, null, l.text());
        const e = localEntry(w, 'github');
        assert.strictEqual(e!.headers, undefined, 'the header is gone');
        assert.strictEqual(e!.headersHelper, helperCmd(path.join(ptRoot(w), 'mcp-headers.js'), 'ACME_GH', 'Bearer'));
        assert.strictEqual(fsx.readFileSync(path.join(ptRoot(w), 'mcp-headers.js'), 'utf8'), rootsLib.helperSource(), 'R9: the helper is written with it');
        assert.match(l.text(), new RegExp(`root ${ptRoot(w).replace(/[\\.]/g, '\\$&')}`), 'the root is named');
        assert.deepStrictEqual(res.applied.map((x) => x.id), ['key-to-helper']);
        assert.ok(!l.text().includes(v));
        assert.deepStrictEqual(detect(ctxOf(w)).found.filter((x) => x.id === 'key-to-helper'), []);
    }
    finally { w.clean(); }
});

test('key-to-helper: a ${VAR} not filled is blocked and names the old file that holds it', () =>
{
    const w = world();
    try
    {
        seed(w, 'github', 'local', HOSTED_GH(`Bearer \${${GK}}`));
        put(path.join(w.project, '.alfred-tools', '.secrets'), `${GK}=${hexv('old')}\n`);
        const [f] = detect(ctxOf(w)).found.filter((x) => x.id === 'key-to-helper') as [Finding];
        const chain0 = path.join(ptRoot(w), '.mcps-secrets');
        assert.strictEqual(f.blocked, `put ${GK}'s value in ${chain0}, then run /alfred-tools:fix; ${GK} is in ${path.join(w.project, '.alfred-tools', '.secrets')}, which alfred-tools no longer reads`);
        const res = applyFixes(ctxOf(w), ['key-to-helper'], { log: () => {} });
        assert.deepStrictEqual(res.skipped.map((x) => x.id), ['key-to-helper']);
        assert.deepStrictEqual(localEntry(w, 'github')!.headers, { Authorization: `Bearer \${${GK}}` }, 'never moved to a helper that would send no key');
    }
    finally { w.clean(); }
});

test('key-to-helper: a literal equal to a filled value applies with that name; one equal to none is blocked; neither prints the literal', () =>
{
    const w = world();
    try
    {
        const [v1, v2] = [hexv('sentry'), hexv('nobody')];
        seed(w, 'sentry', 'user', HOSTED_SENTRY(`Bearer ${v1}`));
        seed(w, 'github', 'local', HOSTED_GH(`Bearer ${v2}`));
        secretsAt(homeRoot(w), { MY_SENTRY: v1 });
        const d = detect(ctxOf(w));
        const s = d.found.find((x) => x.id === 'key-to-helper' && x.name === 'sentry');
        assert.deepStrictEqual([s!.keyName, Boolean(s!.blocked)], ['MY_SENTRY', false]);
        const g = d.found.find((x) => x.id === 'key-to-helper' && x.name === 'github');
        assert.match(g!.blocked!, /^the key in this registration matches no name in .*\.mcps-secrets.*: put the working key there under a name, then run \/alfred-tools:fix$/);
        for (const v of [v1, v2]) assert.ok(!shownOf(d).includes(v), 'no literal in the report');
        const l = logged();
        const res = applyFixes(ctxOf(w), ['key-to-helper'], { tmp: path.join(w.dir, 'tmp'), log: l.log });
        assert.strictEqual(res.failed, null, l.text());
        const e = userEntry(w, 'sentry');
        assert.strictEqual(e!.headers, undefined);
        assert.strictEqual(e!.headersHelper, helperCmd(path.join(homeRoot(w), 'mcp-headers.js'), 'MY_SENTRY', 'Sentry-Bearer'));
        assert.deepStrictEqual(localEntry(w, 'github')!.headers, { Authorization: `Bearer ${v2}` }, 'blocked: unchanged');
        for (const v of [v1, v2]) assert.ok(!l.text().includes(v), 'nothing printed holds a literal');
        for (const file of files(path.join(w.dir, 'tmp'))) for (const v of [v1, v2]) assert.ok(!fsx.readFileSync(file, 'utf8').includes(v), path.basename(file));
    }
    finally { w.clean(); }
});

test('helper-missing writes the helper; helper-stale rewrites a lower number, names a hand edit, and leaves a higher number with a note', () =>
{
    const w = world();
    try
    {
        const file = path.join(ptRoot(w), 'mcp-headers.js');
        seed(w, 'github', 'local', { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headersHelper: `node ${file} ${GK} Bearer` });
        const [m] = detect(ctxOf(w)).found.filter((x) => x.id === 'helper-missing') as [Finding];
        assert.deepStrictEqual([m.name, m.kind, Boolean(m.blocked)], [file, 'machine', false]);
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['helper-missing'], { log: l.log }).failed, null, l.text());
        assert.strictEqual(fsx.readFileSync(file, 'utf8'), rootsLib.helperSource());
        assert.deepStrictEqual(detect(ctxOf(w)).found.filter((x) => /^helper-/.test(x.id)), []);
        assert.doesNotMatch(l.text(), /Restart Claude Code/, 'the helper runs at each connect: no restart');

        helperAt(ptRoot(w), 0);
        const [lower] = detect(ctxOf(w)).found.filter((x) => x.id === 'helper-stale') as [Finding];
        assert.match(lower.found, new RegExp(`helper 0 - this plugin's is ${HV}`));
        applyFixes(ctxOf(w), ['helper-stale'], { log: () => {} });
        assert.strictEqual(fsx.readFileSync(file, 'utf8'), rootsLib.helperSource());

        helperAt(ptRoot(w), HV, '// mine\n');
        const [edited] = detect(ctxOf(w)).found.filter((x) => x.id === 'helper-stale') as [Finding];
        assert.match(edited.found, /changed since alfred-tools wrote it/);
        assert.ok(!edited.blocked, 'a hand edit is rewritten on the confirmed plan');

        helperAt(ptRoot(w), HV + 1);
        const [higher] = detect(ctxOf(w)).found.filter((x) => x.id === 'helper-stale') as [Finding];
        assert.strictEqual(higher.blocked, `mcp-headers.js in ${ptRoot(w)} is newer than this plugin - update alfred-tools`);
        applyFixes(ctxOf(w), ['helper-stale'], { log: () => {} });
        assert.match(fsx.readFileSync(file, 'utf8'), new RegExp(`^// alfred-tools mcp-headers ${HV + 1}`), 'never rewritten');
    }
    finally { w.clean(); }
});

test('a machine fix that throws is named FAILED and ends the run, as a registration or file fix does', () =>
{
    const w = world();
    try
    {
        const root = ptRoot(w);
        seed(w, 'github', 'local', { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headersHelper: `node ${path.join(root, 'mcp-headers.js')} ${GK} Bearer` });
        fsx.writeFileSync(root, 'a file where the root folder should be');
        const l = logged();
        const run = applyFixes(ctxOf(w), ['helper-missing'], { log: l.log });
        assert.match(run.failed ?? '', /^helper-missing: /);
        assert.match(l.text(), /^FAILED helper-missing: /m);
    }
    finally { w.clean(); }
});

test('helper-stale offers helper 6 to a root whose helper is older, for a sonarqube registration with header pairs', () =>
{
    const w = world();
    try
    {
        const file = path.join(ptRoot(w), 'mcp-headers.js');
        seed(w, 'sonarqube', 'local', { type: 'http', url: 'https://api.sonarcloud.io/mcp', headersHelper: `node ${file} SONARQUBE_TOKEN Bearer --header SONARQUBE_ORG=SONARQUBE_ORG --header SONARQUBE_READ_ONLY:true` });
        helperAt(ptRoot(w), HV - 1);
        const [stale] = detect(ctxOf(w)).found.filter((x) => x.id === 'helper-stale') as [Finding];
        assert.match(stale.found, new RegExp(`helper ${HV - 1} - this plugin's is ${HV}`));
        assert.strictEqual(applyFixes(ctxOf(w), ['helper-stale'], { log: () => {} }).failed, null);
        assert.strictEqual(fsx.readFileSync(file, 'utf8'), rootsLib.helperSource());
    }
    finally { w.clean(); }
});

test('helper-stale never rewrites a file with no alfred-tools number line: it is blocked and named', () =>
{
    const w = world();
    try
    {
        const file = path.join(ptRoot(w), 'mcp-headers.js');
        seed(w, 'github', 'local', { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headersHelper: `node ${file} ${GK} Bearer` });
        const mine = "#!/usr/bin/env node\nconsole.log('{}');\n";
        put(file, mine);
        const [f] = detect(ctxOf(w)).found.filter((x) => x.id === 'helper-stale') as [Finding];
        assert.strictEqual(f.blocked, `${file} has no alfred-tools number line - it is not this plugin's helper, and fix never overwrites it: rename yours, or delete it and run /alfred-tools:fix`);
        applyFixes(ctxOf(w), ['helper-stale'], { log: () => {} });
        assert.strictEqual(fsx.readFileSync(file, 'utf8'), mine, 'left as it is');
    }
    finally { w.clean(); }
});

test('helper-stale finds nothing for a CRLF copy of the same helper', () =>
{
    const w = world();
    try
    {
        const file = path.join(ptRoot(w), 'mcp-headers.js');
        seed(w, 'github', 'local', { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headersHelper: `node ${file} ${GK} Bearer` });
        put(file, rootsLib.helperSource().replace(/\n/g, '\r\n'));
        assert.deepStrictEqual(detect(ctxOf(w)).found.filter((x) => /^helper-/.test(x.id)), []);
    }
    finally { w.clean(); }
});

test('root-ignore covers a project or global root inside a git work tree: appends the missing lines to a 0.1.x .gitignore holding *, so mcp-headers.js is no longer ignored, and blocks when another .gitignore re-includes .mcps-secrets', () =>
{
    const w = world();
    try
    {
        gitInit(w.project);
        gitInit(w.home);
        secretsAt(ptRoot(w), { A: '' });
        put(path.join(ptRoot(w), '.gitignore'), '*\n');
        secretsAt(homeRoot(w), { B: '' });
        const found = detect(ctxOf(w)).found.filter((x) => x.id === 'root-ignore');
        assert.deepStrictEqual(found.map((f) => [f.name, f.kind, Boolean(f.blocked)]), [[ptRoot(w), 'machine', false], [homeRoot(w), 'machine', false]]);
        assert.match(found[0]!.found, /git ignores .*mcp-headers\.js, which a project-scope server needs committed/);
        assert.match(found[1]!.found, /git would commit .*\.mcps-secrets/);
        const l = logged();
        const res = applyFixes(ctxOf(w), ['root-ignore'], { log: l.log });
        assert.strictEqual(res.failed, null, l.text());
        assert.strictEqual(fsx.readFileSync(path.join(ptRoot(w), '.gitignore'), 'utf8'), rootsLib.GITIGNORE, 'appended, never rewritten');
        assert.strictEqual(fsx.readFileSync(path.join(homeRoot(w), '.gitignore'), 'utf8'), rootsLib.GITIGNORE);
        assert.strictEqual(rootsLib.gitIgnores(path.join(ptRoot(w), 'mcp-headers.js')), false);
        assert.strictEqual(rootsLib.gitIgnores(path.join(homeRoot(w), '.mcps-secrets')), true);
        assert.deepStrictEqual(detect(ctxOf(w)).found.filter((x) => x.id === 'root-ignore'), []);
        assert.doesNotMatch(l.text(), /Restart Claude Code/);

        // a later line re-includes the key file: the plugin's lines are all there, so appending cannot help
        fsx.appendFileSync(path.join(ptRoot(w), '.gitignore'), '!.mcps-secrets\n');
        const [b] = detect(ctxOf(w)).found.filter((x) => x.id === 'root-ignore') as [Finding];
        assert.match(b.blocked!, /re-includes \.mcps-secrets/);
    }
    finally { w.clean(); }
});

test('root-ignore appends mcp-remote-v1/ to a root of the user\'s own files where git would commit it', () =>
{
    const w = world();
    try
    {
        gitInit(w.home);
        secretsAt(homeRoot(w), { B: '' });
        put(path.join(homeRoot(w), 'notes.md'), 'mine\n');
        put(path.join(homeRoot(w), '.gitignore'), '.mcps-secrets\npreferred-tools.json\nmcps.json\n');
        const found = detect(ctxOf(w)).found.filter((x) => x.id === 'root-ignore');
        assert.deepStrictEqual(found.map((f) => [f.name, Boolean(f.blocked)]), [[homeRoot(w), false]]);
        assert.match(found[0]!.found, /git would commit .*mcp-remote-v1\//);
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['root-ignore'], { log: l.log }).failed, null, l.text());
        assert.ok(fsx.readFileSync(path.join(homeRoot(w), '.gitignore'), 'utf8').endsWith('mcps.json\nmcp-remote-v1/\n'));
        assert.deepStrictEqual(detect(ctxOf(w)).found.filter((x) => x.id === 'root-ignore'), []);
    }
    finally { w.clean(); }
});

test('root-ignore blocks a helper gap no appended line can close - a .gitignore above excludes the root - and names the line to remove', () =>
{
    const w = world();
    try
    {
        gitInit(w.project);
        put(path.join(w.project, '.gitignore'), '.alfred-tools/\n');
        put(path.join(ptRoot(w), '.gitignore'), rootsLib.GITIGNORE);
        secretsAt(ptRoot(w), { [GK]: '' });
        helperAt(ptRoot(w), HV);
        seed(w, 'github', 'project', { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headersHelper: `node .alfred-tools/mcp-headers.js ${GK} Bearer` });
        const [f] = detect(ctxOf(w)).found.filter((x) => x.id === 'root-ignore') as [Finding];
        assert.ok(f, 'found');
        assert.strictEqual(f.blocked, `a .gitignore above excludes ${ptRoot(w)} - remove that line (git check-ignore -v ${ptRoot(w)} names it): git never re-includes a file inside an excluded folder`);
    }
    finally { w.clean(); }
});

test('root-ignore finds nothing for a root outside a git work tree', () =>
{
    const w = world();
    try
    {
        secretsAt(ptRoot(w), { A: '' });
        assert.strictEqual(rootsLib.gitIgnores(path.join(ptRoot(w), '.mcps-secrets')), null, 'the world is outside any work tree');
        assert.deepStrictEqual(detect(ctxOf(w)).found.filter((x) => x.id === 'root-ignore'), []);
    }
    finally { w.clean(); }
});

test('root-ignore in a named root holding the user\'s files appends .mcps-secrets, preferred-tools.json, mcps.json and mcp-remote-v1/, never *', () =>
{
    const w = world();
    try
    {
        gitInit(w.project);
        const named = path.join(w.project, 'tools');
        put(path.join(named, 'notes.md'), 'mine\n');
        secretsAt(named, { A: '' });
        const data = path.join(w.dir, 'data');
        writeJson(path.join(data, 'roots.json'), { version: 1, global: null, projects: { [rootsLib.mapKey(w.project)]: named } });
        const [f] = detect(ctxData(w, data)).found.filter((x) => x.id === 'root-ignore') as [Finding];
        assert.strictEqual(f.name, named);
        const l = logged();
        assert.strictEqual(applyFixes(ctxData(w, data), ['root-ignore'], { log: l.log }).failed, null, l.text());
        assert.strictEqual(fsx.readFileSync(path.join(named, '.gitignore'), 'utf8'), '.mcps-secrets\npreferred-tools.json\nmcps.json\nmcp-remote-v1/\n');
        assert.strictEqual(rootsLib.gitIgnores(path.join(named, 'notes.md')), false, 'the user\'s files stay visible to git');
        assert.strictEqual(rootsLib.gitIgnores(path.join(named, '.mcps-secrets')), true);
    }
    finally { w.clean(); }
});

test('token-sync checks stdio routes only, from the stdio chain, by any filled name', () =>
{
    const w = world();
    try
    {
        const [v1, v2, v3] = [hexv('one'), hexv('two'), hexv('three')];
        seed(w, 'sentry', 'local', SENTRY(v1));
        seed(w, 'github', 'local', HOSTED_GH(`Bearer ${hexv('hosted')}`));
        const ts = () => detect(ctxOf(w)).found.filter((x) => x.id === 'token-sync');
        secretsAt(homeRoot(w), { ANY_NAME: v1 });
        assert.deepStrictEqual(ts(), [], 'held by a filled name in the global root, the second file of the local chain');
        put(path.join(w.project, '.alfred-tools', '.secrets'), `${SK}=${v3}\n`);
        secretsAt(homeRoot(w), { ANY_NAME: v2 });
        const [f] = ts() as [Finding];
        assert.deepStrictEqual([f.name, f.scope, Boolean(f.blocked)], ['sentry', 'local', true], 'the default name is filled nowhere in the chain: the old file is not read');
        assert.strictEqual(f.blocked, "pick the key's name with /alfred-tools:configure");
        assert.match(f.found, /matches no name in .*\.mcps-secrets/);
        secretsAt(ptRoot(w), { [SK]: v3 });
        const [g] = ts() as [Finding];
        assert.ok(!g.blocked);
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['token-sync'], { tmp: path.join(w.dir, 'tmp'), log: l.log }).failed, null, l.text());
        assert.strictEqual(localEntry(w, 'sentry')!.env![SK], v3, 'the default name\'s value');
        assert.deepStrictEqual(ts(), []);
        // a ${VAR} left by 0.1.x takes the value of the name it holds
        seed(w, 'sentry-b', 'local', SENTRY('${ANY_NAME}'));
        const [p] = ts() as [Finding];
        assert.match(p.found, /holds \$\{ANY_NAME\} while .*\.mcps-secrets has the key/);
        applyFixes(ctxOf(w), ['token-sync'], { only: 'sentry-b', tmp: path.join(w.dir, 'tmp'), log: l.log });
        assert.strictEqual(localEntry(w, 'sentry-b')!.env![SK], v2);
        for (const v of [v1, v2, v3]) assert.ok(!`${l.text()}${shownOf(detect(ctxOf(w)))}`.includes(v), 'no value printed');
    }
    finally { w.clean(); }
});

test('token-sync blocks an empty stdio key and never writes the default name\'s value', () =>
{
    const w = world();
    try
    {
        const v = hexv('gh');
        seed(w, 'github', 'local', GITHUB(''));
        secretsAt(ptRoot(w), { ACME_GITHUB_TOKEN: '', [GK]: v });
        const [f] = detect(ctxOf(w)).found.filter((x) => x.id === 'token-sync') as [Finding];
        assert.strictEqual(f.blocked, "pick the key's name with /alfred-tools:configure");
        const before = fsx.readFileSync(account.accountFile(w.env), 'utf8');
        const res = applyFixes(ctxOf(w), ['token-sync'], { log: () => {} });
        assert.deepStrictEqual(res.skipped.map((x) => x.id), ['token-sync']);
        assert.strictEqual(fsx.readFileSync(account.accountFile(w.env), 'utf8'), before, 'the account file unchanged');
        assert.strictEqual(localEntry(w, 'github')!.env![GK], '');
    }
    finally { w.clean(); }
});

test('fix notes an untrusted declaring folder', () =>
{
    const helperReg = (scope: string) => reg('github', { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headersHelper: 'node /proj/.alfred-tools/mcp-headers.js X Bearer' }, { scope, route: 'remote' });
    const at = (trusted: boolean, scope: string) => { const ctx = ctxFor({ registrations: [helperReg(scope)] }); ctx.inventory.trusted = trusted; return detect(ctx); };
    const d = at(false, 'local');
    assert.deepStrictEqual(d.notes, ['github (local): accept the trust dialog the next time Claude Code starts in /proj - until then the server connects without its key']);
    assert.match(renderFixes(d), /note: github \(local\): accept the trust dialog/);
    assert.deepStrictEqual(at(true, 'local').notes, []);
    assert.deepStrictEqual(at(false, 'user').notes, [], 'a global helper needs no folder trust');
    assert.ok(!at(false, 'local').found.some((f) => /trust/.test(f.id)), 'not a fix');
});

test('expandVars: ${NAME} from the environment, ${NAME:-fallback} when unset, null when a bare name is unset', () => {
    assert.strictEqual(C.expandVars('${A}\\x', { A: 'C:\\a' }), 'C:\\a\\x');
    assert.strictEqual(C.expandVars('${B:-C:\\b}', {}), 'C:\\b');
    assert.strictEqual(C.expandVars('${B:-C:\\b}', { B: 'D:\\d' }), 'D:\\d');
    assert.strictEqual(C.expandVars('${MISSING}\\x', {}), null);
    assert.strictEqual(C.expandVars('plain', {}), 'plain');
});

test('one ${VAR} expander, Claude Code\'s rule (2.1.322): a variable set to empty is empty, the fallback only when unset - fix and fetch agree', () => {
    assert.strictEqual(expandVars('${B:-C:\\b}', { B: '' }).value, '');
    assert.deepStrictEqual(expandVars('${A}/${MISSING}', { A: 'a' }), { value: 'a/${MISSING}', unset: ['MISSING'] });
    assert.strictEqual(C.expandVars('${B:-C:\\b}', { B: '' }), '', 'set to empty: no fallback');
    assert.strictEqual(C.expandVars('${A}', { A: '' }), '', 'set to empty: set');
    assert.strictEqual(C.firstUnset('${A}', { A: '' }), null);
    assert.strictEqual(expandedText('${B:-x}', { B: '' }), C.expandVars('${B:-x}', { B: '' }));
    assert.strictEqual(expandedText('${B:-x}', {}), 'x');
});

// ---- a registration left on its own (spec D6) --------------------------------------------------------------------------
test('fix: a registration on its own is not checked and is listed once', () =>
{
    const direct = { command: 'npx', args: ['-y', '@upstash/context7-mcp@4.4.4'], env: { npm_config_before: '2026-10-20T23:59:59Z' } };
    const r = reg('context7', direct, { name: 'context7' });
    assert.deepStrictEqual(ids(detect(ctxFor({ platform: 'win32', registrations: [r] })).found), ['windows-npx-cmd']);
    const own = detect(ctxFor({ platform: 'win32', registrations: [{ ...r, choice: 'own' }, { ...r, name: 'c7-managed', choice: 'manage' }] }));
    assert.deepStrictEqual(own.found.map((f) => [f.id, f.name]), [['windows-npx-cmd', 'c7-managed']], 'only the one on its own is left out');
    assert.deepStrictEqual(own.own, [{ name: 'context7', scope: 'local' }]);
    const text = renderFixes(own);
    assert.deepStrictEqual(text.split('\n').filter((l) => l.includes('on its own - not checked')), ['context7 (local): on its own - not checked']);
    assert.deepStrictEqual(detect(ctxFor({ platform: 'win32', registrations: [r] })).own, []);
});

// ---- 0.3.0: project scope holds this machine's absolute paths (F7, Optional 3) ----------------------------------------

test('serena-windows-home at project scope: an absolute bad home is fixed in place; a spaced root says pick a space-free folder', () =>
{
    const homes = (ctx: FixCtx) => detect(ctx).found.filter((f) => f.id === 'serena-windows-home');
    const at = (home: string | undefined, extra = {}) => ctxFor({ platform: 'win32', ...extra, registrations: [reg('serena', { command: 'uvx', args: ['--python', '3.13'], env: home === undefined ? {} : { SERENA_HOME: home } }, { scope: 'project' })] });
    let [f] = homes(at('C:/work/shop/.alfred-tools/serena')) as [Finding];
    assert.deepStrictEqual(f.proposal, { SERENA_HOME: 'C:\\work\\shop\\.alfred-tools\\serena' });
    assert.ok(!f.blocked);
    [f] = homes(at(undefined, { home: 'C:\\Users\\Jo Doe' })) as [Finding];
    assert.ok(f.blocked!.includes('pick a space-free folder with /alfred-tools:configure, Location'), f.blocked);
    // a ${VAR} value is project-relative-path's to convert
    assert.deepStrictEqual(homes(at('${USERPROFILE}/.serena', { env: { USERPROFILE: 'C:\\Users\\dev' } })), []);
});

test('appium-sdk-env at project scope finds and proposes the SDK homes as at local scope', () =>
{
    const appium = fresh('appium', 'darwin', 'x64', 'project');
    const machine = noMachine({ exists: (p) => ['/Users/dev/Library/Android/sdk', '/opt/jdk-21', '/opt/jdk-21/bin/java'].includes(p), run: (cmd) => (cmd === '/usr/libexec/java_home' ? { status: 0, stdout: '/opt/jdk-21\n' } : { status: 1 }) as RunResult });
    const [f] = detect(ctxFor({ platform: 'darwin', home: '/Users/dev', machine, registrations: [reg('appium', appium, { name: 'appium-mcp', scope: 'project' })] })).found.filter((x) => x.id === 'appium-sdk-env') as [Finding];
    assert.deepStrictEqual(f.proposal, { ANDROID_HOME: '/Users/dev/Library/Android/sdk', JAVA_HOME: '/opt/jdk-21' });
    assert.ok(!f.blocked);
    // a machine path there is kept, not taken out
    const held = { ...appium, env: { ...appium.env, ANDROID_HOME: '/opt/sdk', JAVA_HOME: '/opt/jdk' } };
    assert.deepStrictEqual(detect(ctxFor({ platform: 'darwin', home: '/Users/dev', env: { ANDROID_HOME: '/opt/sdk', JAVA_HOME: '/opt/jdk' }, machine, registrations: [reg('appium', held, { name: 'appium-mcp', scope: 'project' })] })).found.filter((x) => x.id === 'appium-sdk-env'), []);
});

// ---- 0.3.0: 0.2.0's relative project paths, the .mcp.json order and a parent's helper (F7, F8, F3a) -------------------

const GH = { type: 'http', url: 'https://api.githubcopilot.com/mcp/' };
const C7 = { type: 'http', url: 'https://mcp.context7.com/mcp' };
const ctxIn = (w: World, dir: string, machine = noMachine()) => makeCtx({ inventory: inventory.buildInventory({ project: dir, env: w.env }), env: w.env, machine });

test('project-relative-path: relative, ${HOME}, ${USERPROFILE}\\.serena and a relative helper are found and fixed as read, a user arg kept', () =>
{
    const pw = { command: 'npx', args: ['-y', '@playwright/mcp@0.0.83', '--browser', 'chrome', '--user-data-dir', '.alfred/playwright-chrome', '--output-dir', '.alfred/playwright-chrome/output', '--viewport-size', '1280x720'] };
    const memory = { command: 'uvx', args: ['--python', '3.13', '--from', 'mcp-memory-service[sqlite]==12.1.1', 'memory', 'server'], env: { MCP_MEMORY_SQLITE_PATH: '${HOME}/.alfred-tools/memory/memory.db' } };
    const c7 = { ...C7, headersHelper: 'node .alfred-tools/mcp-headers.js CONTEXT7_API_KEY Bearer' };
    const regs = [reg('playwright-chrome', pw, { scope: 'project' }), reg('memory', memory, { scope: 'project' }), reg('context7', c7, { scope: 'project', route: 'remote' })];
    const at = (registrations: InvRegistration[], over: CtxFor = {}) => ctxFor({ project: '/work/shop', home: '/home/dev', registrations, ...over });
    const ctx = at(regs);
    const found = F.projectRelativePathDetect(ctx);
    assert.deepStrictEqual(found.map((f) => [f.id, f.name, f.scope, Boolean(f.blocked)]), ['playwright-chrome', 'memory', 'context7'].map((n) => ['project-relative-path', n, 'project', false]));
    for (const f of found) assert.match(f.found, /a copy in a child folder is kept out of git by \/alfred-tools:fix run there$/);
    // the same folder, written out: no data to name
    assert.ok(!found.some((f) => /old data stays/.test(f.found)), found.map((f) => f.found).join('\n'));
    const fixed = regs.map((r, i) => F.projectRelativePathFix(r.entry, found[i]!, ctx));
    assert.deepStrictEqual(fixed[0], { command: 'npx', args: ['-y', '@playwright/mcp@0.0.83', '--browser', 'chrome', '--user-data-dir', '/work/shop/.alfred/playwright-chrome', '--output-dir', '/work/shop/.alfred/playwright-chrome/output', '--viewport-size', '1280x720'] });
    assert.deepStrictEqual(fixed[1], { ...memory, env: { MCP_MEMORY_SQLITE_PATH: '/home/dev/.alfred-tools/memory/memory.db' } });
    assert.deepStrictEqual(fixed[2], { ...C7, headersHelper: 'node /work/shop/.alfred-tools/mcp-headers.js CONTEXT7_API_KEY Bearer' });
    // read back: the fixed entries are clean
    assert.deepStrictEqual(F.projectRelativePathDetect(at(regs.map((r, i) => ({ ...r, entry: fixed[i]! })))), []);
    // not found: local scope, ~ and another variable
    assert.deepStrictEqual(F.projectRelativePathDetect(at(regs.map((r) => ({ ...r, scope: 'local' })))), []);
    for (const v of ['~/.pw', '${WORK}/pw']) assert.deepStrictEqual(F.projectRelativePathDetect(at([reg('playwright-chrome', { ...pw, args: ['-y', '@playwright/mcp@0.0.83', '--user-data-dir', v] }, { scope: 'project' })])), [], v);
    // an unset variable is blocked: nothing to write it as
    const [b] = F.projectRelativePathDetect(at([reg('memory', { ...memory, env: { MCP_MEMORY_SQLITE_PATH: '${USERPROFILE}/.alfred-tools/memory/memory.db' } }, { scope: 'project' })])) as [Finding];
    assert.match(b.blocked!, /USERPROFILE is not set/);

    // serena on Windows: 0.2.0's ${USERPROFILE}\.serena becomes <project root>\serena, a new folder - the old one is named
    const serena = { command: 'uvx', args: ['--python', '3.13', '--from', 'serena-agent@1.0.0', 'serena', 'start-mcp-server'], env: { SERENA_HOME: '${USERPROFILE}\\.serena' } };
    const win = (project: string, registrations: InvRegistration[]) => ctxFor({ platform: 'win32', project, home: 'C:\\Users\\dev', env: { USERPROFILE: 'C:\\Users\\dev' }, registrations });
    const wctx = win('C:\\work\\shop', [reg('serena', serena, { scope: 'project' })]);
    const [s] = F.projectRelativePathDetect(wctx) as [Finding];
    assert.match(s.found, /the old data stays at C:\\Users\\dev\\\.serena - moving the path moves no data/);
    assert.match(s.found, /about 327MB/);
    assert.deepStrictEqual(F.projectRelativePathFix(serena, s, wctx), { ...serena, env: { SERENA_HOME: 'C:\\work\\shop\\.alfred-tools\\serena' } });
    // a project root with a space: the profile's .serena, written out
    const spaced = win('C:\\my work\\shop', [reg('serena', serena, { scope: 'project' })]);
    assert.deepStrictEqual(F.projectRelativePathFix(serena, F.projectRelativePathDetect(spaced)[0]!, spaced).env, { SERENA_HOME: 'C:\\Users\\dev\\.serena' });
    // a relative helper on Windows: absolute, in the forward slashes node and cmd both take
    const wc = win('C:\\work\\shop', [reg('context7', c7, { scope: 'project', route: 'remote' })]);
    assert.strictEqual(F.projectRelativePathFix(c7, F.projectRelativePathDetect(wc)[0]!, wc).headersHelper, 'node C:/work/shop/.alfred-tools/mcp-headers.js CONTEXT7_API_KEY Bearer');
});

test('project-relative-path and mcp-order in a child folder name the parent', () =>
{
    const w = world();
    try
    {
        writeJson(path.join(w.project, '.mcp.json'), { mcpServers: {
            'playwright-chrome': { command: 'npx', args: ['-y', '@playwright/mcp@0.0.83', '--browser', 'chrome', '--user-data-dir', '.alfred/playwright-chrome'] },
            github: GH,
        } });
        const child = path.join(w.project, 'C');
        fs.mkdirSync(child);
        const ours = (d: Detected) => d.found.filter((f) => ['project-relative-path', 'mcp-order'].includes(f.id));
        const d = detect(ctxIn(w, child));
        assert.deepStrictEqual(ours(d).map((f) => [f.id, f.blocked]), [['project-relative-path', 'run /alfred-tools:fix in ..'], ['mcp-order', 'run /alfred-tools:fix in ..']]);
        const text = renderFixes(d);
        assert.match(text, /project-relative-path .* NOT APPLICABLE: run \/alfred-tools:fix in \.\./);
        assert.match(text, /mcp-order .* NOT APPLICABLE: run \/alfred-tools:fix in \.\./);
        // in the parent itself, both apply
        assert.deepStrictEqual(ours(detect(ctxIn(w, w.project))).map((f) => [f.id, Boolean(f.blocked)]), [['project-relative-path', false], ['mcp-order', false]]);
    }
    finally { w.clean(); }
});

test('mcp-order: found when out of order, not found when in order or when a server left on its own sits among the user\'s', () =>
{
    const w = world();
    try
    {
        const mine = { command: 'my-server' };
        const file = path.join(w.project, '.mcp.json');
        const at = (servers: Record<string, ServerEntry>) => { writeJson(file, { mcpServers: servers }); return F.mcpOrderDetect(ctxIn(w, w.project)); };
        const [f] = at({ mine, c7: C7, gh: GH }) as [Finding];
        assert.deepStrictEqual([f.id, f.row, f.name, f.scope, Boolean(f.blocked)], ['mcp-order', 'github', '.mcp.json', 'project', false]);
        assert.match(f.found, /mine, c7, gh .*gh, c7, mine/);
        const r = F.mcpOrderFix(f, ctxIn(w, w.project));
        assert.deepStrictEqual([r.ok, r.restart], [true, false], r.detail);
        assert.deepStrictEqual(Object.keys(readJson(file).mcpServers), ['gh', 'c7', 'mine']);
        assert.deepStrictEqual(F.mcpOrderDetect(ctxIn(w, w.project)), [], 'read back: in order');
        // gh left on its own sits with the user's servers: in order where it is
        const record = path.join(w.project, '.alfred-tools', 'preferred-tools.json');
        writeJson(record, { version: 1, servers: [{ name: 'gh', scope: 'project', fingerprint: existingLib.fingerprintOf(GH, catalog), choice: 'own' }] });
        assert.deepStrictEqual(at({ c7: C7, mine, gh: GH }), []);
        fs.rmSync(record);
        assert.strictEqual(at({ c7: C7, mine, gh: GH }).length, 1, 'managed, the same file is out of order');
        fs.rmSync(file);
        assert.deepStrictEqual(F.mcpOrderDetect(ctxIn(w, w.project)), [], 'no .mcp.json');
    }
    finally { w.clean(); }
});

test('helper-child-folder: found from a child for an inherited helper, not found at the root', () =>
{
    if (PARENT_HELPER_IN_CHILD) { assert.ok(!catalog.fixes.some((f) => f.id === 'helper-child-folder')); return; }
    const w = world();
    try
    {
        const helper = `node ${path.join(w.project, '.alfred-tools', 'mcp-headers.js')} CONTEXT7_API_KEY Bearer`;
        writeJson(path.join(w.project, '.mcp.json'), { mcpServers: { context7: { ...C7, headersHelper: helper } } });
        const child = path.join(w.project, 'C');
        fs.mkdirSync(child);
        const d = detect(ctxIn(w, child), 'helper-child-folder');
        assert.deepStrictEqual(d.found.map((f) => [f.id, f.name, f.scope, f.kind]), [['helper-child-folder', 'context7', 'inherited', 'registration']]);
        assert.match(d.found[0]!.found, /connects here without its key/);
        assert.strictEqual(d.found[0]!.blocked, 'move it to Global with /alfred-tools:configure in .., or start Claude in ..');
        assert.deepStrictEqual(detect(ctxIn(w, w.project), 'helper-child-folder').found, []);
    }
    finally { w.clean(); }
});

test('data-folder-ignore: after the paths are absolute, a 0.2.0 copy in a child is found once and gets its .gitignore; an ignored one is not', () =>
{
    const w = world();
    try
    {
        const root = path.join(w.project, '.alfred', 'playwright-chrome');
        writeJson(path.join(w.project, '.mcp.json'), { mcpServers: { 'playwright-chrome': { command: 'npx', args: ['-y', '@playwright/mcp@0.0.83', '--browser', 'chrome', '--user-data-dir', root, '--output-dir', path.join(root, 'output')] } } });
        const child = path.join(w.project, 'C');
        fs.mkdirSync(child);
        const machine = noMachine({ exists: (p) => fs.existsSync(p), run: C.realMachine().run });
        const at = (dir: string) => F.dataFolderIgnoreDetect(ctxIn(w, dir, machine));
        assert.deepStrictEqual(at(child), [], 'no copy on disk');
        const copy = path.join(child, '.alfred', 'playwright-chrome');
        fs.mkdirSync(path.join(copy, 'output'), { recursive: true });
        const found = at(child);
        assert.deepStrictEqual(found.map((f) => [f.id, f.name, f.scope, f.proposal!.path]), [['data-folder-ignore', 'playwright-chrome', 'inherited', copy]]);
        assert.match(found[0]!.found, /a 0\.2\.0 copy no server uses any more - its data is left, never moved or deleted/);
        // in the declaring folder the absolute root is the one in use, not a copy
        assert.deepStrictEqual(at(w.project), []);
        const r = F.dataFolderIgnoreFix(found[0]!, ctxIn(w, child, machine));
        assert.strictEqual(r.ok, true, r.detail);
        assert.strictEqual(fs.readFileSync(path.join(copy, '.gitignore'), 'utf8'), '*\n');
        assert.deepStrictEqual(at(child), [], 'read back');
        // git ignores it: nothing
        fs.rmSync(path.join(copy, '.gitignore'));
        spawnSync('git', ['init', '-q'], { cwd: w.project });
        fs.writeFileSync(path.join(w.project, '.gitignore'), '.alfred/\n');
        assert.deepStrictEqual(at(child), []);
    }
    finally { w.clean(); }
});

test('fix prints the reconnect line for each hosted keyed registration it rewrote', () =>
{
    const w = world();
    try
    {
        // key-to-helper on github at local scope, its key filled: the Reconnect line
        seed(w, 'github', 'local', HOSTED_GH('Bearer ${ACME_GH}'));
        secretsAt(ptRoot(w), { ACME_GH: hexv('gh') });
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['key-to-helper'], { tmp: path.join(w.dir, 'tmp'), log: l.log }).failed, null, l.text());
        assert.ok(l.text().includes('github: connects with its key at the next session start; in a session already running, /mcp -> github -> Reconnect'), l.text());
        // project-relative-path on context7's 0.2.0 helper at project scope, its key not filled: the fill line
        seed(w, 'context7', 'project', { ...C7, headersHelper: 'node .alfred-tools/mcp-headers.js CONTEXT7_API_KEY Bearer' });
        const m = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['project-relative-path'], { tmp: path.join(w.dir, 'tmp2'), log: m.log }).failed, null, m.text());
        assert.ok(m.text().includes(`context7: fill CONTEXT7_API_KEY in ${path.join(ptRoot(w), '.mcps-secrets')}, then Reconnect it in /mcp - until then it runs without the key, at lower rate limits`), m.text());
        assert.ok(!/github: connects/.test(m.text()), 'only what this run rewrote');
    }
    finally { w.clean(); }
});

// ---- the bridge (0.4.0): its file and the helper beside it, and its mcp-remote cache folder -------------------------

const BRIDGE = (root: string, pin = '0.16.0') => ({ command: 'node', args: [path.join(root, 'mcp-bridge.js'), 'https://mcp.sentry.dev/mcp/{SENTRY_ORG}/{SENTRY_PROJECT?}', SK, 'Sentry-Bearer', `mcp-remote@${pin}`], env: { npm_config_before: '2026-11-11T23:59:59Z' } });
const bridgeAt = (root: string, number: number | string, extra = '') => put(path.join(root, 'mcp-bridge.js'), rootsLib.shippedSource('bridge').replace(/^\/\/ alfred-tools mcp-bridge \d+/, `// alfred-tools mcp-bridge ${number}`) + extra);

test('helper-missing finds both files of a bridge registration and writes both', () =>
{
    const w = world();
    try
    {
        seed(w, 'sentry', 'local', BRIDGE(ptRoot(w)));
        const helper = path.join(ptRoot(w), 'mcp-headers.js');
        const bridge = path.join(ptRoot(w), 'mcp-bridge.js');
        const found = detect(ctxOf(w)).found.filter((x) => x.id === 'helper-missing');
        assert.deepStrictEqual(found.map((x) => x.name).sort(), [bridge, helper].sort());
        assert.ok(found.some((x) => x.found === 'mcp-bridge.js is missing - sentry (local) does not start'), found.map((x) => x.found).join('\n'));
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['helper-missing'], { log: l.log }).failed, null, l.text());
        // a bridge with a file missing did not start: unlike a hosted helper, it needs a new start (review)
        assert.match(l.text(), /Restart Claude Code/);
        assert.strictEqual(fsx.readFileSync(helper, 'utf8'), rootsLib.helperSource());
        assert.strictEqual(fsx.readFileSync(bridge, 'utf8'), rootsLib.shippedSource('bridge'));
        assert.strictEqual(fsx.readFileSync(path.join(ptRoot(w), 'package.json'), 'utf8'), '{"type":"commonjs"}\n', 'the root says CommonJS');
        assert.deepStrictEqual(detect(ctxOf(w)).found.filter((x) => /^helper-/.test(x.id)), []);
    }
    finally { w.clean(); }
});

test('helper-stale finds helper 3 beside a bridge, and a hand-edited bridge, and leaves a newer one blocked', () =>
{
    const w = world();
    try
    {
        seed(w, 'sentry', 'local', BRIDGE(ptRoot(w)));
        const bridge = path.join(ptRoot(w), 'mcp-bridge.js');
        helperAt(ptRoot(w), 3);
        bridgeAt(ptRoot(w), BV);
        const [lower] = detect(ctxOf(w)).found.filter((x) => x.id === 'helper-stale') as [Finding];
        assert.match(lower.found, new RegExp(`^mcp-headers\\.js is helper 3 - this plugin's is ${HV}`));
        const l = logged();
        applyFixes(ctxOf(w), ['helper-stale'], { log: l.log });
        assert.match(l.text(), /Restart Claude Code/, 'the bridge exited beside helper 3');
        assert.strictEqual(fsx.readFileSync(path.join(ptRoot(w), 'mcp-headers.js'), 'utf8'), rootsLib.helperSource());

        bridgeAt(ptRoot(w), BV, '// mine\n');
        const [edited] = detect(ctxOf(w)).found.filter((x) => x.id === 'helper-stale') as [Finding];
        assert.strictEqual(edited.name, bridge);
        assert.match(edited.found, /^mcp-bridge\.js changed since alfred-tools wrote it/);
        applyFixes(ctxOf(w), ['helper-stale'], { log: () => {} });
        assert.strictEqual(fsx.readFileSync(bridge, 'utf8'), rootsLib.shippedSource('bridge'));

        bridgeAt(ptRoot(w), BV + 1);
        const [higher] = detect(ctxOf(w)).found.filter((x) => x.id === 'helper-stale') as [Finding];
        assert.strictEqual(higher.blocked, `mcp-bridge.js in ${ptRoot(w)} is newer than this plugin - update alfred-tools`);
        applyFixes(ctxOf(w), ['helper-stale'], { log: () => {} });
        assert.match(fsx.readFileSync(bridge, 'utf8'), new RegExp(`^// alfred-tools mcp-bridge ${BV + 1}`), 'never rewritten');
    }
    finally { w.clean(); }
});

test("npx-cache-entry finds a bridge registration's mcp-remote folder without package.json", () =>
{
    const w = world();
    try
    {
        const cache = path.join(w.home, '.npm');
        const folder = npxFolder(cache, 'mcp-remote@0.16.0');
        const b = reg('sentry', BRIDGE(path.join(w.project, '.alfred-tools')), { scope: 'local' });
        const found = () => F.npxCacheEntryDetect(ctxFor({ platform: process.platform, project: w.project, registrations: [b], machine: npmAt(cache) }));
        assert.deepStrictEqual(found(), []);
        fsx.mkdirSync(path.join(folder, 'node_modules'), { recursive: true });
        const [f] = found() as [Finding];
        assert.deepStrictEqual([f.id, f.name, f.proposal], ['npx-cache-entry', 'sentry', { path: folder, what: 'mcp-remote@0.16.0' }]);
    }
    finally { w.clean(); }
});

// ---- 0.5.0: a 0.4.x server left on its own, before list-import (spec D1) ----------------------------------------------
test('a 0.4.x own server is skipped before list-import: fix all leaves it byte-identical and list-import moves it to own', () =>
{
    const w = world();
    try
    {
        // two rows would fire on it: no python request, no telemetry setting
        const entry = fresh('serena', process.platform, process.arch);
        const theirs = { command: 'uvx', args: entry.args!.filter((a, i, all) => a !== '--python' && all[i - 1] !== '--python'), env: { SERENA_HOME: entry.env!.SERENA_HOME } } as ServerEntry;
        seed(w, 'serena', 'local', theirs);
        const root = path.join(w.project, '.alfred-tools');
        fs.mkdirSync(root, { recursive: true });
        fs.writeFileSync(path.join(root, 'preferred-tools.json'), JSON.stringify({ version: 1, servers: [{ name: 'serena', scope: 'local', fingerprint: X.fingerprintOf(theirs, catalog), choice: 'own' }] }));
        const before = (account.readAccount(w.env, w.project).local as Record<string, ServerEntry> & { serena?: ServerEntry }).serena;
        assert.deepStrictEqual(detectAll(ctxOf(w)).own, [{ name: 'serena', scope: 'local' }]);
        const lines: string[] = [];
        const res = applyFixes(ctxOf(w), ['all'], { tmp: path.join(w.dir, 'tmp'), log: (...a) => lines.push(a.join(' ')) });
        assert.strictEqual(res.failed, null, lines.join('\n'));
        assert.deepStrictEqual((account.readAccount(w.env, w.project).local as Record<string, ServerEntry> & { serena?: ServerEntry }).serena, before, 'byte-identical');
        const list = JSON.parse(fs.readFileSync(path.join(root, 'mcps.json'), 'utf8'));
        assert.deepStrictEqual([list.servers, list.own.map((e: OwnEntry) => e.name)], [[], ['serena']], 'not a managed server; its own entry moved');
    }
    finally { w.clean(); }
});

// ---- 0.5.0: list-import, and the file pass (spec D1, D9) ---------------------------------------------------------------
const C7_HOSTED = { type: 'http', url: 'https://mcp.context7.com/mcp' };
const listAt = (root: string) => { const f = path.join(root, 'mcps.json'); return fsx.existsSync(f) ? readJson(f) : null; };
const recordAt = (root: string, servers: unknown) => put(path.join(root, 'preferred-tools.json'), JSON.stringify({ version: 1, servers }));
const OWN_X = { name: 'x', scope: 'local', fingerprint: 'pkg:x', choice: 'own' };

test('list-import writes each managed registration with clients claude and moves the record to own', () =>
{
    const w = world();
    try
    {
        seed(w, 'serena', 'project', fresh('serena', process.platform, process.arch, 'project'));
        seed(w, 'context7', 'user', C7_HOSTED);
        const proot = path.join(w.project, '.alfred-tools');
        recordAt(proot, [OWN_X]);
        const l = logged();
        const res = applyFixes(ctxOf(w), ['list-import'], { tmp: path.join(w.dir, 'tmp'), log: l.log });
        assert.strictEqual(res.failed, null, l.text());
        const list = listAt(proot);
        assert.deepStrictEqual(list.servers.map((s: ListServer) => [s.name, s.scope, s.clients]), [['serena', 'project', ['claude']]]);
        assert.deepStrictEqual(list.own, [OWN_X]);
        assert.ok(fsx.existsSync(path.join(proot, 'preferred-tools.json.0.4.bak')), l.text());
        assert.ok(!fsx.existsSync(path.join(proot, 'preferred-tools.json')));
        assert.deepStrictEqual(listAt(path.join(w.home, '.alfred-tools')).servers.map((s: ListServer) => [s.name, s.scope, s.clients]), [['context7', 'user', ['claude']]]);
        assert.deepStrictEqual(res.applied.map((f) => f.id), ['list-import', 'list-import']);
        // a second run finds nothing
        assert.deepStrictEqual(ids(detectAll(ctxOf(w)).found.filter((f) => f.id === 'list-import')), []);
    }
    finally { w.clean(); }
});

test('list-import into a family with no root writes its .gitignore first and records the root', () =>
{
    const w = world();
    try
    {
        seed(w, 'context7', 'user', C7_HOSTED);
        const data = path.join(w.dir, 'data');
        const ctx = ctxData(w, data);
        const [f] = ctx.catalog && detectAll(ctx).found.filter((x) => x.id === 'list-import') as [Finding];
        const groot = path.join(w.home, '.alfred-tools');
        assert.deepStrictEqual([f.name, f.scope, f.family, f.record], [path.join(groot, 'mcps.json'), null, 'global', null]);
        assert.deepStrictEqual(F.listImportSteps(f, ctx).map((s) => s.op), ['root-ignore', 'list-write', 'record-root']);
        const l = logged();
        assert.strictEqual(applyFixes(ctx, ['list-import'], { tmp: path.join(w.dir, 'tmp'), log: l.log }).failed, null, l.text());
        assert.strictEqual(fsx.readFileSync(path.join(groot, '.gitignore'), 'utf8'), rootsLib.GITIGNORE);
        assert.strictEqual(readJson(path.join(data, 'roots.json')).global, groot);
        assert.deepStrictEqual(listAt(groot).servers.map((s: ListServer) => s.name), ['context7']);
    }
    finally { w.clean(); }
});

test('retire-record after a rollback keeps both backups and list-import finds nothing next run', () =>
{
    const w = world();
    try
    {
        seed(w, 'context7', 'local', C7_HOSTED);
        const proot = path.join(w.project, '.alfred-tools');
        recordAt(proot, [OWN_X]);
        put(path.join(proot, 'preferred-tools.json.0.4.bak'), 'the first backup\n');
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['list-import'], { tmp: path.join(w.dir, 'tmp'), log: l.log }).failed, null, l.text());
        assert.strictEqual(fsx.readFileSync(path.join(proot, 'preferred-tools.json.0.4.bak'), 'utf8'), 'the first backup\n');
        assert.deepStrictEqual(readJson(path.join(proot, 'preferred-tools.json.0.4.bak.2')).servers, [OWN_X]);
        assert.ok(!fsx.existsSync(path.join(proot, 'preferred-tools.json')));
        assert.deepStrictEqual(ids(detectAll(ctxOf(w)).found.filter((f) => f.id === 'list-import')), []);
    }
    finally { w.clean(); }
});

test('the file pass runs after the registration pass, detects on what it wrote, and is read back', () =>
{
    const w = world();
    try
    {
        // uvx-python fires on it: no python request (its context file in place, as the install leaves it)
        const entry = fresh('serena', process.platform, process.arch, 'local', { project: w.project, home: w.home });
        put(path.join(w.project, '.alfred-tools', 'serena', 'serena-context.yml'), rootsLib.shippedSource('serenaContext'));
        leaveConfig(path.join(w.project, '.alfred-tools', 'serena'));
        seed(w, 'serena', 'local', { ...entry, args: entry.args!.filter((a, i, all) => a !== '--python' && all[i - 1] !== '--python') });
        const l = logged();
        const res = applyFixes(ctxOf(w), ['all'], { tmp: path.join(w.dir, 'tmp'), log: l.log });
        assert.strictEqual(res.failed, null, l.text());
        assert.deepStrictEqual(res.applied.map((f) => f.id).sort(), ['list-import', 'start-timeout', 'uvx-python']);
        const text = l.text();
        assert.ok(text.indexOf("'serena'") >= 0 && text.indexOf("'serena'") < text.indexOf('mcps.json'), text);
        const [s] = listAt(path.join(w.project, '.alfred-tools')).servers;
        assert.strictEqual(s.entry.args[0], '--python', 'the list holds the repaired entry');
        assert.match(text, /fixed +list-import on .*mcps\.json/);
    }
    finally { w.clean(); }
});

test("install's first touch retires the old record, and a configure 'manage' answer given then survives a later fix run", () =>
{
    const w = world();
    try
    {
        seed(w, 'context7', 'local', C7_HOSTED);
        const proot = path.join(w.project, '.alfred-tools');
        recordAt(proot, [{ name: 'context7', scope: 'local', fingerprint: X.fingerprintOf(C7_HOSTED, catalog), choice: 'own' }, OWN_X]);
        const inv0 = inventory.buildInventory({ project: w.project, env: w.env });
        assert.strictEqual(inv0.registrations.find((r) => r.name === 'context7')!.choice, 'own');
        const p = plan(inv0, { existing: { 'mcp:context7~local': 'manage' } }, { home: w.home, env: w.env });
        assert.deepStrictEqual(p.errors, []);
        assert.ok(p.steps.some((s) => s.op === 'retire-record'), p.steps.map((s) => s.op).join());
        const l = logged();
        assert.strictEqual(apply(p, { env: w.env, tmp: path.join(w.dir, 'tmp'), log: l.log }).failed, null, l.text());
        const list = listAt(proot);
        // x's server is gone, so its own entry goes, as 0.4.x dropped it
        assert.deepStrictEqual([list.servers.map((s: ListServer) => s.name), list.own], [['context7'], []]);
        assert.ok(!fsx.existsSync(path.join(proot, 'preferred-tools.json')) && fsx.existsSync(path.join(proot, 'preferred-tools.json.0.4.bak')));
        applyFixes(ctxOf(w), ['all'], { tmp: path.join(w.dir, 'tmp2'), log: () => {} });
        const inv1 = inventory.buildInventory({ project: w.project, env: w.env });
        assert.strictEqual(inv1.registrations.find((r) => r.name === 'context7')!.choice, null, 'managed');
        assert.deepStrictEqual(listAt(proot).servers.map((s: ListServer) => s.name), ['context7']);
    }
    finally { w.clean(); }
});

// ---- 0.5.0: read-guard (rulings 12, 13) --------------------------------------------------------------------------------
const settingsOf = (w: World) => path.join(w.env.CLAUDE_CONFIG_DIR || path.join(w.home, '.claude'), 'settings.json');

test('read-guard finds a root with .mcps-secrets and no rule, applies deny-read, then finds nothing', () =>
{
    const w = world();
    try
    {
        const proot = path.join(w.project, '.alfred-tools');
        put(path.join(proot, '.mcps-secrets'), '');
        put(settingsOf(w), JSON.stringify({ permissions: { deny: ['Bash(rm:*)'] }, theme: 'dark' }));
        const found = detectAll(ctxOf(w)).found.filter((f) => f.id === 'read-guard');
        assert.deepStrictEqual(found.map((f) => [f.name, f.rules]), [[settingsOf(w), ['Read(//**/.mcps-secrets)']]]);
        assert.match(found[0]!.found, /\.mcps-secrets/);
        const l = logged();
        const res = applyFixes(ctxOf(w), ['read-guard'], { tmp: path.join(w.dir, 'tmp'), log: l.log });
        assert.strictEqual(res.failed, null, l.text());
        assert.deepStrictEqual(readJson(settingsOf(w)), { permissions: { deny: ['Bash(rm:*)', 'Read(//**/.mcps-secrets)'] }, theme: 'dark' });
        assert.deepStrictEqual(detectAll(ctxOf(w)).found.filter((f) => f.id === 'read-guard'), []);
        // the sign-in folder adds its own rule
        fsx.mkdirSync(path.join(proot, 'mcp-remote-v1'));
        assert.deepStrictEqual(detectAll(ctxOf(w)).found.filter((f) => f.id === 'read-guard').map((f) => f.rules), [['Read(//**/mcp-remote-v1/**)']]);
    }
    finally { w.clean(); }
});

// Part E: every config dir under the home that has the plugin installed (a second CLAUDE_CONFIG_DIR, an old plugin id)
const SECRETS_RULE = 'Read(//**/.mcps-secrets)';
const installedIn = (dir: string, text: string) => put(path.join(dir, 'plugins', 'installed_plugins.json'), text);
const installedKeys = (...keys: string[]) => JSON.stringify({ version: 2, plugins: Object.fromEntries(keys.map((key) => [key, [{ scope: 'user', version: '0.5.0' }]])) });

function otherDirsWorld(w: World)
{
    const dirs = Object.fromEntries(['', '-personal', '-old', '-other', '-broken'].map((suffix) => [suffix, path.join(w.home, `.claude${suffix}`)])) as Record<string, string>;
    w.env.CLAUDE_CONFIG_DIR = dirs['']!;
    put(path.join(ptRoot(w), '.mcps-secrets'), '');
    put(path.join(dirs['']!, 'settings.json'), JSON.stringify({ permissions: { deny: [SECRETS_RULE] } }));
    installedIn(dirs['']!, installedKeys('alfred-tools@envoydev'));
    installedIn(dirs['-personal']!, installedKeys('alfred-tools@envoydev', 'other@somewhere'));
    put(path.join(dirs['-personal']!, 'settings.json'), JSON.stringify({ theme: 'dark', permissions: { deny: ['Bash(rm:*)'] } }));
    installedIn(dirs['-old']!, installedKeys('preferred-tools@envoydev'));
    installedIn(dirs['-other']!, installedKeys('unrelated@somewhere'));
    installedIn(dirs['-broken']!, '{ not json');
    put(path.join(dirs['-broken']!, 'settings.json'), '{}');
    // a folder that is no config dir at all, and a file named like one
    installedIn(path.join(w.home, '.claudeish'), installedKeys('alfred-tools@envoydev'));
    return dirs;
}

test('read-guard finds every config dir with the plugin', () =>
{
    const w = world();
    try
    {
        const dirs = otherDirsWorld(w);
        const found = detectAll(ctxOf(w)).found.filter((f) => f.id === 'read-guard');
        assert.deepStrictEqual(found.map((f) => f.name).sort(), [path.join(dirs['-old']!, 'settings.json'), path.join(dirs['-personal']!, 'settings.json')].sort());
        assert.ok(found.find((f) => f.name.startsWith(dirs['-personal']!))!.found.startsWith(`${dirs['-personal']!} has alfred-tools installed and does not deny ${SECRETS_RULE}`));
        // the routes the rules leave open, residual by the user's ruling (2026-11-19): named in every finding
        const residual = process.platform === 'win32' ? READ_GUARD_RESIDUAL.win32 : READ_GUARD_RESIDUAL.sandboxed;
        for (const finding of found) assert.ok(finding.found.endsWith(residual), finding.found);
        assert.deepStrictEqual(configDirsWithPlugin(w.home, dirs['']!).sort(), [dirs['-old']!, dirs['-personal']!].sort());
        const l = logged();
        const res = applyFixes(ctxOf(w), ['read-guard'], { tmp: path.join(w.dir, 'tmp'), log: l.log });
        assert.strictEqual(res.failed, null, l.text());
        assert.deepStrictEqual(readJson(path.join(dirs['-personal']!, 'settings.json')), { theme: 'dark', permissions: { deny: ['Bash(rm:*)', SECRETS_RULE] } });
        assert.deepStrictEqual(readJson(path.join(dirs['-old']!, 'settings.json')), { permissions: { deny: [SECRETS_RULE] } });
        // the others are as they were: no file for the dir with no record, '{}' for the broken one, the current one unchanged
        assert.ok(!fsx.existsSync(path.join(dirs['-other']!, 'settings.json')));
        assert.deepStrictEqual(readJson(path.join(dirs['-broken']!, 'settings.json')), {});
        assert.deepStrictEqual(readJson(path.join(dirs['']!, 'settings.json')), { permissions: { deny: [SECRETS_RULE] } });
        assert.ok(!fsx.existsSync(path.join(w.home, '.claudeish', 'settings.json')));
        assert.deepStrictEqual(detectAll(ctxOf(w)).found.filter((f) => f.id === 'read-guard'), []);
        // update's summary says the dir and that it keeps its own plugin data
        const note = l.lines.find((line) => line.startsWith('note: ') && line.includes(dirs['-personal']!));
        assert.strictEqual(note, `note: ${dirs['-personal']!}: read guard added - it keeps its own plugin data, so an update there may offer a declined uninstall again`);
    }
    finally { w.clean(); }
});

test('read-guard in another config dir with no settings file creates it with the rules, as the current dir does', () =>
{
    const w = world();
    try
    {
        const dirs = otherDirsWorld(w);
        const file = path.join(dirs['-old']!, 'settings.json');
        assert.ok(!fsx.existsSync(file));
        assert.strictEqual(applyFixes(ctxOf(w), ['read-guard'], { tmp: path.join(w.dir, 'tmp'), log: () => {} }).failed, null);
        assert.deepStrictEqual(readJson(file), { permissions: { deny: [SECRETS_RULE] } });
    }
    finally { w.clean(); }
});

test('a settings file that is not an object is named, never written', () =>
{
    const w = world();
    try
    {
        const dirs = otherDirsWorld(w);
        const file = path.join(dirs['-personal']!, 'settings.json');
        put(file, '[1, 2]');
        const found = detectAll(ctxOf(w)).found.filter((f) => f.id === 'read-guard' && f.name === file);
        assert.strictEqual(found.length, 1);
        assert.match(found[0]!.found, /not a settings object alfred-tools can read/);
        assert.strictEqual(found[0]!.blocked, `add ${SECRETS_RULE} to permissions.deny yourself`);
        const l = logged();
        applyFixes(ctxOf(w), ['read-guard'], { tmp: path.join(w.dir, 'tmp'), log: l.log });
        assert.strictEqual(fsx.readFileSync(file, 'utf8'), '[1, 2]');
        assert.ok(l.lines.some((line) => line.startsWith('skipped read-guard') && line.includes(file)), l.text());
    }
    finally { w.clean(); }
});

type Spied = (this: unknown, ...args: unknown[]) => unknown;

test('read-guard never opens a file in mcp-remote-v1 or .mcps-secrets', () =>
{
    const w = world();
    const opened: string[] = [];
    const spy = (name: string) => { const orig = (fsx as unknown as Record<string, Spied>)[name]!; (fsx as unknown as Record<string, Spied>)[name] = function (this: unknown, p: unknown, ...rest: unknown[]) { opened.push(String(p)); return orig.call(this, p, ...rest); }; return () => { (fsx as unknown as Record<string, Spied>)[name] = orig; }; };
    let undo: (() => void)[] = [];
    try
    {
        const proot = path.join(w.project, '.alfred-tools');
        put(path.join(proot, '.mcps-secrets'), '');
        put(path.join(proot, 'mcp-remote-v1', 'tokens.json'), '{}');
        const ctx = ctxOf(w);
        undo = ['openSync', 'readFileSync', 'createReadStream', 'readdirSync'].map(spy);
        const found = F.readGuardDetect(ctx);
        undo.forEach((u) => u()); undo = [];
        assert.deepStrictEqual(found.map((f) => f.rules), [['Read(//**/.mcps-secrets)', 'Read(//**/mcp-remote-v1/**)']]);
        assert.deepStrictEqual(opened.filter((p) => p.includes('mcp-remote-v1') || p.endsWith('.mcps-secrets')), []);
    }
    finally { undo.forEach((u) => u()); w.clean(); }
});

// ---- 0.5.0: serena navigation only (spec D7) ---------------------------------------------------------------------------
const ctxArg = (entry: ServerEntry) => entry.args![entry.args!.indexOf('--context') + 1];

test('serena-context rewrites --context and writes the file first', () =>
{
    const w = world();
    try
    {
        seed(w, 'serena', 'local', SERENA_OLD(path.join(ptRoot(w), 'serena')));
        const found = detectAll(ctxOf(w)).found.filter((f) => f.id === 'serena-context');
        assert.deepStrictEqual(found.map((f) => [f.name, f.scope]), [['serena', 'local']]);
        const l = logged();
        const res = applyFixes(ctxOf(w), ['serena-context'], { tmp: path.join(w.dir, 'tmp'), log: l.log });
        assert.strictEqual(res.failed, null, l.text());
        const want = path.join(ptRoot(w), 'serena', 'serena-context.yml');
        assert.strictEqual(ctxArg(localEntry(w, 'serena')!), want);
        assert.strictEqual(fsx.readFileSync(want, 'utf8'), rootsLib.shippedSource('serenaContext'));
        assert.ok(l.text().indexOf(`wrote ${want}`) < l.text().indexOf('rewrote \'serena\''), 'the file is written before the registration');
        assert.deepStrictEqual(detectAll(ctxOf(w)).found.filter((f) => f.id === 'serena-context'), []);
    }
    finally { w.clean(); }
});

test('serena-context fires on the root copy and on a missing file', () =>
{
    const w = world();
    try
    {
        const home = path.join(ptRoot(w), 'serena');
        const want = path.join(home, 'serena-context.yml');
        const rootCopy = path.join(ptRoot(w), 'serena-context.yml');
        const named = (file: string) => { const e = SERENA_OLD(home); e.args[e.args.indexOf('claude-code')] = file; return e; };
        const foundFor = () => detectAll(ctxOf(w)).found.filter((f) => f.id === 'serena-context');
        // a 0.5.2-shaped registration: the context is the root's copy
        put(rootCopy, rootsLib.shippedSource('serenaContext'));
        seed(w, 'serena', 'local', named(rootCopy));
        assert.deepStrictEqual(foundFor().map((f) => [f.name, f.want]), [['serena', want]]);
        // the home's path with no file there is found too
        fsx.rmSync(rootCopy);
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['serena-context'], { tmp: path.join(w.dir, 'tmp0'), log: l.log }).failed, null, l.text());
        assert.deepStrictEqual(foundFor(), [], 'the repoint writes the home copy');
        fsx.rmSync(want);
        assert.deepStrictEqual(foundFor().map((f) => [f.name, f.want]), [['serena', want]], 'the registration names the home and the file is not there');
        const l2 = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['serena-context'], { tmp: path.join(w.dir, 'tmp1'), log: l2.log }).failed, null, l2.text());
        assert.strictEqual(fsx.readFileSync(want, 'utf8'), rootsLib.shippedSource('serenaContext'));
        assert.deepStrictEqual(foundFor(), []);
        // alfred-code's home keeps the root's path: nothing to move
        const alfredHome = path.join(w.project, '.alfred', 'serena', 'home');
        put(rootCopy, rootsLib.shippedSource('serenaContext'));
        const alfredEntry = named(rootCopy);
        alfredEntry.env.SERENA_HOME = alfredHome;
        seed(w, 'serena-alfred', 'project', alfredEntry);
        assert.deepStrictEqual(foundFor().filter((f) => f.name === 'serena-alfred'), []);
    }
    finally { w.clean(); }
});

test('the root\'s old copy goes only when unedited and unnamed', () =>
{
    const home = (w: World) => path.join(ptRoot(w), 'serena');
    const rootCopy = (w: World) => path.join(ptRoot(w), 'serena-context.yml');
    const seedOld = (w: World, name = 'serena') => { const e = SERENA_OLD(home(w)); e.args[e.args.indexOf('claude-code')] = rootCopy(w); seed(w, name, 'local', e); };
    // unedited and unnamed once the registration moves: removed
    const a = world();
    try
    {
        put(rootCopy(a), rootsLib.shippedSource('serenaContext'));
        seedOld(a);
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(a), ['serena-context'], { tmp: path.join(a.dir, 'tmp'), log: l.log }).failed, null, l.text());
        assert.ok(!fsx.existsSync(rootCopy(a)), l.text());
        assert.ok(l.text().includes(`removed ${rootCopy(a)}`), l.text());
        assert.strictEqual(fsx.readFileSync(path.join(home(a), 'serena-context.yml'), 'utf8'), rootsLib.shippedSource('serenaContext'));
        assert.strictEqual(ctxArg(localEntry(a, 'serena')!), path.join(home(a), 'serena-context.yml'));
    }
    finally { a.clean(); }
    // edited by hand: left and named
    const b = world();
    try
    {
        put(rootCopy(b), `${rootsLib.shippedSource('serenaContext')}# my own line\n`);
        seedOld(b);
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(b), ['serena-context'], { tmp: path.join(b.dir, 'tmp'), log: l.log }).failed, null, l.text());
        assert.ok(fsx.existsSync(rootCopy(b)));
        assert.ok(l.text().includes(`left ${rootCopy(b)} - edited by hand`), l.text());
    }
    finally { b.clean(); }
    // another registration still names it: left
    const c = world();
    try
    {
        put(rootCopy(c), rootsLib.shippedSource('serenaContext'));
        seedOld(c);
        seed(c, 'theirs', 'local', { command: 'node', args: ['their-launcher.js', '--context', rootCopy(c)] });
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(c), ['serena-context'], { tmp: path.join(c.dir, 'tmp'), log: l.log }).failed, null, l.text());
        assert.ok(fsx.existsSync(rootCopy(c)));
        assert.ok(l.text().includes(`left ${rootCopy(c)} - still named by theirs`), l.text());
    }
    finally { c.clean(); }
});

test('helper-missing covers serena\'s context file', () =>
{
    const w = world();
    try
    {
        const want = path.join(ptRoot(w), 'serena-context.yml');
        const e = SERENA_OLD(path.join(ptRoot(w), 'serena'));
        e.args[e.args.indexOf('claude-code')] = want;
        seed(w, 'serena', 'local', e);
        const found = detectAll(ctxOf(w)).found.filter((f) => f.id === 'helper-missing');
        assert.deepStrictEqual(found.map((f) => f.name), [want]);
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['helper-missing'], { tmp: path.join(w.dir, 'tmp'), log: l.log }).failed, null, l.text());
        assert.strictEqual(fsx.readFileSync(want, 'utf8'), rootsLib.shippedSource('serenaContext'));
        assert.ok(!fsx.existsSync(path.join(ptRoot(w), 'package.json')), 'a YAML file needs no package.json');
        // a lower one is helper-stale
        fsx.writeFileSync(want, rootsLib.shippedSource('serenaContext').replace(/^# alfred-tools serena-context \d+/, '# alfred-tools serena-context 0'));
        assert.deepStrictEqual(detectAll(ctxOf(w)).found.filter((f) => f.id === 'helper-stale').map((f) => f.name), [want]);
    }
    finally { w.clean(); }
});

test('serena-base-modes: Apply all found runs the op and the finding is gone', () =>
{
    const w = world();
    try
    {
        const home = path.join(ptRoot(w), 'serena');
        const e = SERENA_OLD(home);
        e.args[e.args.indexOf('claude-code')] = path.join(ptRoot(w), 'serena-context.yml');
        put(path.join(ptRoot(w), 'serena-context.yml'), rootsLib.shippedSource('serenaContext'));
        seed(w, 'serena', 'local', e);
        const cfg = path.join(home, 'serena_config.yml');
        put(cfg, 'base_modes:\n- interactive\n- editing\nauth_secret: s3cr3t-fixture\n');
        const found = detectAll(ctxOf(w)).found.filter((f) => f.id === 'serena-base-modes');
        assert.deepStrictEqual(found.map((f) => [f.name, f.kind]), [[cfg, 'file']]);
        assert.ok(!shownOf(detectAll(ctxOf(w))).includes('s3cr3t'));
        const l = logged();
        const res = applyFixes(ctxOf(w), ['all'], { tmp: path.join(w.dir, 'tmp'), log: l.log });
        assert.strictEqual(res.failed, null, l.text());
        assert.match(fsx.readFileSync(cfg, 'utf8'), /^base_modes: \[\]\nauth_secret: s3cr3t-fixture\nproject_serena_folder_location: .*\n$/, 'base_modes is emptied and the folder key appended: apply all runs both rows');
        assert.ok(!l.text().includes('s3cr3t'));
        assert.deepStrictEqual(detectAll(ctxOf(w)).found.filter((f) => f.id === 'serena-base-modes'), []);
        // an alfred-code 2.x home is never found
        const alfredHome = path.join(w.project, '.alfred', 'serena', 'home');
        put(path.join(alfredHome, 'serena_config.yml'), 'base_modes:\n- editing\n');
        seed(w, 'serena2', 'project', { ...e, env: { ...e.env, SERENA_HOME: alfredHome } });
        assert.deepStrictEqual(detectAll(ctxOf(w)).found.filter((f) => f.id === 'serena-base-modes'), []);
    }
    finally { w.clean(); }
});

test('serena-project-folder finds a home without the key and names in-tree .serena folders', () =>
{
    const w = world();
    try
    {
        const home = path.join(ptRoot(w), 'serena');
        const e = SERENA_OLD(home);
        e.args[e.args.indexOf('claude-code')] = path.join(home, 'serena-context.yml');
        put(path.join(home, 'serena-context.yml'), rootsLib.shippedSource('serenaContext'));
        seed(w, 'serena', 'local', e);
        const proj = path.join(w.dir, 'repos', 'shop');
        const clean = path.join(w.dir, 'repos', 'clean');
        put(path.join(proj, '.serena', 'project.yml'), 'project_name: shop\n');
        fsx.mkdirSync(clean, { recursive: true });
        const cfg = path.join(home, 'serena_config.yml');
        put(cfg, `projects:\n- ${proj}\n- ${clean}\nbase_modes: []\nauth_secret: s3cr3t-fixture\n`);
        const found = detectAll(ctxOf(w)).found.filter((f) => f.id === 'serena-project-folder');
        assert.deepStrictEqual(found.map((f) => [f.name, f.kind]), [[cfg, 'file']]);
        assert.ok(!shownOf(detectAll(ctxOf(w))).includes('s3cr3t'));
        const l = logged();
        const res = applyFixes(ctxOf(w), ['serena-project-folder'], { tmp: path.join(w.dir, 'tmp'), log: l.log });
        assert.strictEqual(res.failed, null, l.text());
        assert.strictEqual(fsx.readFileSync(cfg, 'utf8'), `projects:\n- ${proj}\n- ${clean}\nbase_modes: []\nauth_secret: s3cr3t-fixture\n${serenaFolderLine(home)}\n`);
        assert.ok(l.text().includes(`serena keeps using ${path.join(proj, '.serena')} - the project has no .git, so serena would lose the project`), l.text());
        assert.ok(!l.text().includes(`${clean}/.serena`), 'a project with no in-tree folder is not named');
        assert.ok(!l.text().includes('s3cr3t'));
        assert.ok(fsx.existsSync(path.join(proj, '.serena', 'project.yml')), 'a project with no .git keeps its folder');
        assert.deepStrictEqual(detectAll(ctxOf(w)).found.filter((f) => f.id === 'serena-project-folder'), []);
        // a home with no config yet is found, and the fix writes the file
        const bare = path.join(ptRoot(w), 'bare');
        seed(w, 'serena2', 'project', { ...e, env: { ...e.env, SERENA_HOME: bare } });
        assert.deepStrictEqual(detectAll(ctxOf(w)).found.filter((f) => f.id === 'serena-project-folder').map((f) => f.name), [path.join(bare, 'serena_config.yml')]);
        assert.strictEqual(applyFixes(ctxOf(w), ['serena-project-folder'], { tmp: path.join(w.dir, 'tmp2'), log: l.log }).failed, null, l.text());
        assert.match(fsx.readFileSync(path.join(bare, 'serena_config.yml'), 'utf8'), /^projects: \[\]\nbase_modes: \[\]\nproject_serena_folder_location: /);
        // an alfred-code 2.x home and a $ home are not found
        const alfredHome = path.join(w.project, '.alfred', 'serena', 'home');
        put(path.join(alfredHome, 'serena_config.yml'), 'base_modes: []\n');
        seed(w, 'serena3', 'project', { ...e, env: { ...e.env, SERENA_HOME: alfredHome } });
        seed(w, 'serena4', 'user', { ...e, env: { ...e.env, SERENA_HOME: path.join(w.dir, '$odd', 'serena') } });
        assert.deepStrictEqual(detectAll(ctxOf(w)).found.filter((f) => f.id === 'serena-project-folder'), []);
    }
    finally { w.clean(); }
});

// a managed serena whose home already holds a context file and the folder key (0.7.0 set it), listing the given projects
function serenaWith(w: World, projects: string[], { keySet = true } = {})
{
    const home = path.join(ptRoot(w), 'serena');
    const e = SERENA_OLD(home);
    e.args[e.args.indexOf('claude-code')] = path.join(home, 'serena-context.yml');
    put(path.join(home, 'serena-context.yml'), rootsLib.shippedSource('serenaContext'));
    seed(w, 'serena', 'local', e);
    const cfg = path.join(home, 'serena_config.yml');
    put(cfg, `projects:\n${projects.map((project) => `- ${project}\n`).join('')}base_modes: []\n${keySet ? `${serenaFolderLine(home)}\n` : ''}`);
    return { home, cfg };
}
// a project folder holding a .serena folder with a project.yml, a git work tree when `git` is set
function projectWithSerena(dir: string, { git = true } = {})
{
    if (git) gitInit(dir);
    put(path.join(dir, '.serena', 'project.yml'), `project_name: ${path.basename(dir)}\n`);
    return dir;
}

test('serena-project-folder moves a movable .serena folder to the home, also when the key is already set', () =>
{
    const w = world();
    try
    {
        const shop = projectWithSerena(path.join(w.dir, 'repos', 'shop'));
        const { home, cfg } = serenaWith(w, [shop]);
        const found = detectAll(ctxOf(w)).found.filter((f) => f.id === 'serena-project-folder');
        assert.deepStrictEqual(found.map((f) => f.name), [cfg], 'the key is set and a folder can move: found');
        const l = logged();
        const res = applyFixes(ctxOf(w), ['serena-project-folder'], { tmp: path.join(w.dir, 'tmp'), log: l.log });
        assert.strictEqual(res.failed, null, l.text());
        assert.ok(fsx.existsSync(path.join(home, 'projects', 'shop', 'project.yml')), 'the folder is under the home');
        assert.ok(!fsx.existsSync(path.join(shop, '.serena')), 'and gone from the project');
        assert.match(l.text(), /restart Claude Code so serena reads the moved folder/);
        assert.deepStrictEqual(detectAll(ctxOf(w)).found.filter((f) => f.id === 'serena-project-folder'), [], 'nothing left to move');
    }
    finally { w.clean(); }
});

test('serena-project-folder with the key unset sets it and then moves a movable folder', () =>
{
    const w = world();
    try
    {
        const shop = projectWithSerena(path.join(w.dir, 'repos', 'shop'));
        const { home, cfg } = serenaWith(w, [shop], { keySet: false });
        const l = logged();
        const res = applyFixes(ctxOf(w), ['serena-project-folder'], { tmp: path.join(w.dir, 'tmp'), log: l.log });
        assert.strictEqual(res.failed, null, l.text());
        assert.ok(fsx.readFileSync(cfg, 'utf8').includes(serenaFolderLine(home)), 'the key is set');
        assert.ok(fsx.existsSync(path.join(home, 'projects', 'shop', 'project.yml')) && !fsx.existsSync(path.join(shop, '.serena')));
    }
    finally { w.clean(); }
});

test('serena-project-folder is not found with the key set when no folder can move, and a folder that cannot move stays, named with its reason', () =>
{
    const w = world();
    try
    {
        const bare = projectWithSerena(path.join(w.dir, 'repos', 'bare'), { git: false });
        const tracked = projectWithSerena(path.join(w.dir, 'repos', 'tracked'));
        assert.strictEqual(spawnSync('git', ['-C', tracked, 'add', '.serena']).status, 0);
        const taken = projectWithSerena(path.join(w.dir, 'repos', 'taken'));
        const { home, cfg } = serenaWith(w, [bare, tracked, taken]);
        put(path.join(home, 'projects', 'taken', 'other.yml'), 'x: 1\n');
        assert.deepStrictEqual(detectAll(ctxOf(w)).found.filter((f) => f.id === 'serena-project-folder'), [], 'key set and nothing movable: not found');
        // one movable project joins: found, moved; the three others stay and the finding names why
        const shop = projectWithSerena(path.join(w.dir, 'repos', 'shop'));
        put(cfg, `projects:\n${[bare, tracked, taken, shop].map((project) => `- ${project}\n`).join('')}base_modes: []\n${serenaFolderLine(home)}\n`);
        const [finding] = detectAll(ctxOf(w)).found.filter((f) => f.id === 'serena-project-folder') as [Finding];
        assert.match(finding.found, /the project has no \.git/);
        assert.match(finding.found, /git tracks files under/);
        assert.match(finding.found, /is there already/);
        const res = applyFixes(ctxOf(w), ['serena-project-folder'], { tmp: path.join(w.dir, 'tmp'), log: () => {} });
        assert.strictEqual(res.failed, null);
        for (const kept of [bare, tracked, taken]) assert.ok(fsx.existsSync(path.join(kept, '.serena', 'project.yml')), `${kept} keeps its folder`);
        assert.ok(fsx.existsSync(path.join(home, 'projects', 'shop', 'project.yml')));
    }
    finally { w.clean(); }
});

test('a 0.4.x root .gitignore gains !mcp-bridge.js and !serena-context.yml from the plan and from fix root-ignore', () =>
{
    const w = world();
    try
    {
        gitInit(w.project);
        const OLD = '*\n!.gitignore\n!mcp-headers.js\n';
        put(path.join(ptRoot(w), '.gitignore'), OLD);
        put(path.join(ptRoot(w), 'preferred-tools.json.0.4.bak'), '{}\n');
        put(path.join(ptRoot(w), '.mcps-secrets'), '');
        seed(w, 'serena', 'project', SERENA_OLD(path.join(ptRoot(w), 'serena')));
        // the plan that writes serena-context.yml plans the root's .gitignore first
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['serena-context'], { tmp: path.join(w.dir, 'tmp'), log: l.log }).failed, null, l.text());
        assert.strictEqual(fsx.readFileSync(path.join(ptRoot(w), '.gitignore'), 'utf8'), `${OLD}!mcp-bridge.js\n!serena-context.yml\n!macos-mcp.toml\n`);
        assert.strictEqual(rootsLib.gitIgnores(path.join(ptRoot(w), 'mcp-bridge.js')), false);
        assert.strictEqual(rootsLib.gitIgnores(path.join(ptRoot(w), '.mcps-secrets')), true, 'the key file stays ignored');
        assert.deepStrictEqual(detectAll(ctxOf(w)).found.filter((f) => f.id === 'root-ignore'), []);
        // fix root-ignore on its own: a root holding mcp-bridge.js under the old .gitignore
        fsx.writeFileSync(path.join(ptRoot(w), '.gitignore'), OLD);
        put(path.join(ptRoot(w), 'mcp-bridge.js'), rootsLib.shippedSource('bridge'));
        put(path.join(ptRoot(w), 'serena-context.yml'), rootsLib.shippedSource('serenaContext'));
        const [f] = detectAll(ctxOf(w)).found.filter((x) => x.id === 'root-ignore') as [Finding];
        assert.ok(f && !f.blocked, JSON.stringify(f));
        assert.match(f.found, /mcp-bridge\.js/);
        assert.match(f.found, /serena-context\.yml/);
        const l2 = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['root-ignore'], { tmp: path.join(w.dir, 'tmp2'), log: l2.log }).failed, null, l2.text());
        assert.strictEqual(rootsLib.gitIgnores(path.join(ptRoot(w), 'mcp-bridge.js')), false);
        assert.deepStrictEqual(detectAll(ctxOf(w)).found.filter((x) => x.id === 'root-ignore'), []);
    }
    finally { w.clean(); }
});

test('a root of the user\'s own files gets the advice to add !<file> for the bridge', () =>
{
    const w = world();
    try
    {
        gitInit(w.project);
        put(path.join(ptRoot(w), '.gitignore'), '*\n!.gitignore\n!mcp-headers.js\n');
        put(path.join(ptRoot(w), 'notes.txt'), 'mine\n');
        put(path.join(ptRoot(w), 'mcp-bridge.js'), rootsLib.shippedSource('bridge'));
        put(path.join(ptRoot(w), '.mcps-secrets'), '');
        seed(w, 'serena', 'project', SERENA_OLD(path.join(ptRoot(w), 'serena')));
        const [f] = detectAll(ctxOf(w)).found.filter((x) => x.id === 'root-ignore') as [Finding];
        assert.ok(f, 'found');
        assert.match(f.blocked || f.note || '', new RegExp(`add !mcp-bridge\\.js at the end of ${path.join(ptRoot(w), '.gitignore').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    }
    finally { w.clean(); }
});

// ---- 0.5.0: a repair reaches the list and Cursor in the same run (spec D1) --------------------------------------------
const installBoth = (w: World, answers: Answers) =>
{
    const p = plan(inventory.buildInventory({ project: w.project, env: w.env }), { clients: ['claude', 'cursor'], ...answers }, { home: w.home, env: w.env });
    assert.deepStrictEqual(p.errors, []);
    assert.strictEqual(apply(p, { env: w.env, tmp: path.join(w.dir, 'tmp'), log: () => {} }).failed, null);
};
const noPython = (e: ServerEntry) => ({ ...e, args: e.args!.filter((a, i, all) => a !== '--python' && all[i - 1] !== '--python') });

test('a windows-npx-cmd repair on an entry with cursor ends with list-write and cursor-write, and a fix run after it finds no drift', () =>
{
    // windows-npx-cmd fires on win32 alone; uvx-python is the same registration repair on every OS (Task 13 ruling)
    const w = world();
    try
    {
        installBoth(w, { picks: { serena: { scope: 'local' } } });
        const listFile = path.join(w.project, '.alfred-tools', 'mcps.json');
        const cursorFile = path.join(w.project, '.cursor', 'mcp.json');
        // an older install wrote serena with no --python in all three places
        const e = noPython(localEntry(w, 'serena')!);
        cli.runClaude(['mcp', 'remove', 'serena', '-s', 'local'], { cwd: w.project, env: w.env });
        seed(w, 'serena', 'local', e);
        const list = readJson(listFile);
        list.servers[0].entry = noPython(list.servers[0].entry);
        writeJson(listFile, list);
        const doc = readJson(cursorFile);
        doc.mcpServers.serena = noPython(doc.mcpServers.serena);
        writeJson(cursorFile, doc);
        assert.deepStrictEqual(ids(detect(ctxOf(w), 'uvx-python').found), ['uvx-python']);
        const l = logged();
        const res = applyFixes(ctxOf(w), ['uvx-python'], { tmp: path.join(w.dir, 'tmp'), log: l.log });
        assert.strictEqual(res.failed, null, l.text());
        assert.match(l.text(), /wrote .*mcps\.json/);
        assert.match(l.text(), /wrote .*\.cursor[\\/]mcp\.json/);
        const now = localEntry(w, 'serena');
        assert.ok(now!.args!.includes('--python'));
        const row = catalog.byId.get('serena');
        assert.deepStrictEqual(readJson(listFile).servers[0].entry, kept5.maskCredentials(now, row), 'the list holds the repaired registration');
        assert.deepStrictEqual(readJson(cursorFile).mcpServers.serena, readJson(listFile).servers[0].entry, 'Cursor holds the list\'s entry');
        assert.deepStrictEqual(detect(ctxOf(w), 'uvx-python').found, []);
    }
    finally { w.clean(); }
});

test('token-sync with a key changed in .mcps-secrets refills ~/.cursor/mcp.json as well as ~/.claude.json', () =>
{
    const w = world();
    try
    {
        const [v1, v2] = [hexv('one'), hexv('two')];
        secretsAt(homeRoot(w), { [SK]: v1 });
        // the plain form of an alfred-tools before 0.7.0: a fresh install now writes the launcher, which holds no key to sync
        installPlain(w, 'sentry', 'user', { command: 'npx', args: ['-y', '@sentry/mcp-server@0.49.0'], env: { npm_config_before: '2026-11-19T23:59:59Z', [SA]: v1 } });
        const cursorFile = path.join(w.home, '.cursor', 'mcp.json');
        assert.strictEqual(readJson(cursorFile).mcpServers.sentry.env[SA], v1, 'the plain copy holds the key in Cursor');
        secretsAt(homeRoot(w), { [SK]: v2 });
        const ts = () => detect(ctxOf(w), 'token-sync').found;
        assert.deepStrictEqual(ts().map((f) => [f.name, f.scope, Boolean(f.blocked)]), [['sentry', 'user', false]]);
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['token-sync'], { tmp: path.join(w.dir, 'tmp'), log: l.log }).failed, null, l.text());
        assert.strictEqual(userEntry(w, 'sentry')!.env![SA], v2);
        assert.strictEqual(readJson(cursorFile).mcpServers.sentry.env[SA], v2, 'Cursor\'s copy refilled');
        assert.deepStrictEqual(ts(), []);
        // Cursor's copy alone behind: found, and refilled with no claude call
        const doc = readJson(cursorFile);
        doc.mcpServers.sentry.env[SA] = v1;
        writeJson(cursorFile, doc);
        const [f] = ts() as [Finding];
        assert.match(f.found, /Cursor's copy in .*mcp\.json holds a key/);
        const calls = w.calls().length;
        assert.strictEqual(applyFixes(ctxOf(w), ['token-sync'], { tmp: path.join(w.dir, 'tmp'), log: l.log }).failed, null, l.text());
        assert.strictEqual(readJson(cursorFile).mcpServers.sentry.env[SA], v2);
        assert.strictEqual(w.calls().slice(calls).filter((a) => a[0] === 'mcp' && a[1] !== 'list' && a[1] !== 'get').length, 0, 'Claude Code is not touched');
        assert.deepStrictEqual(ts(), []);
        for (const v of [v1, v2]) assert.ok(!l.text().includes(v), 'no value printed');
    }
    finally { w.clean(); }
});

// ---- the rename (spec D3) -----------------------------------------------------------------------------------------
const moved = [{ from: '/h/.preferred-tools', to: '/h/.alfred-tools' }];
const posixMachine = { platform: 'darwin', home: '/h', project: '/p' };
const repoint = (entry: ServerEntry, list = moved, machine: Machine = posixMachine) => (F as unknown as { repointEntry: (e: ServerEntry, m: typeof moved, c: Machine) => ServerEntry }).repointEntry(entry, list, machine);

test('repointEntry rewrites each written form of a moved root and nothing else', () =>
{
    const entry: ServerEntry = { type: 'stdio', command: 'node', args: ['/h/.preferred-tools/x', '~/.preferred-tools/y', '${HOME}/.preferred-tools', '/elsewhere/.preferred-tools', '--data=/h/.preferred-tools/d'], env: { MCP_REMOTE_CONFIG_DIR: '/h/.preferred-tools', OTHER: 'keep' }, url: 'https://x/.preferred-tools' } as ServerEntry;
    const out = repoint(entry);
    assert.deepStrictEqual(out.args, ['/h/.alfred-tools/x', '~/.alfred-tools/y', '${HOME}/.alfred-tools', '/elsewhere/.preferred-tools', '--data=/h/.alfred-tools/d']);
    assert.deepStrictEqual(out.env, { MCP_REMOTE_CONFIG_DIR: '/h/.alfred-tools', OTHER: 'keep' });
    assert.strictEqual((out as { url?: string }).url, 'https://x/.preferred-tools');
    assert.deepStrictEqual(repoint({ type: 'stdio', command: 'npx', args: ['-y', 'pkg'] }), { type: 'stdio', command: 'npx', args: ['-y', 'pkg'] });
});

test('repointEntry rewrites the helper inside headersHelper, a quoted path with a space kept quoted', () =>
{
    const spaced = [{ from: '/Users/my name/.preferred-tools', to: '/Users/my name/.alfred-tools' }];
    const machine = { platform: 'darwin', home: '/Users/my name', project: '/p' };
    const out = repoint({ type: 'http', url: 'https://u', headersHelper: "node '/Users/my name/.preferred-tools/mcp-headers.js' K Bearer" }, spaced, machine);
    assert.strictEqual(out.headersHelper, "node '/Users/my name/.alfred-tools/mcp-headers.js' K Bearer");
    const plain = repoint({ type: 'http', url: 'https://u', headersHelper: 'node /h/.preferred-tools/mcp-headers.js K Bearer /h/.preferred-tools' });
    assert.strictEqual(plain.headersHelper, 'node /h/.alfred-tools/mcp-headers.js K Bearer /h/.alfred-tools');
});

test("repointEntry rewrites a path inside a Windows cmd /c wrapper's arguments", () =>
{
    const winMoved = [{ from: 'C:\\Users\\x\\.preferred-tools', to: 'C:\\Users\\x\\.alfred-tools' }];
    const machine = { platform: 'win32', home: 'C:\\Users\\x', project: 'C:\\p' };
    const out = repoint({ type: 'stdio', command: 'cmd', args: ['/c', 'node', 'C:\\Users\\x\\.preferred-tools\\mcp-bridge.js', 'https://u'] }, winMoved, machine);
    assert.deepStrictEqual(out.args, ['/c', 'node', 'C:\\Users\\x\\.alfred-tools\\mcp-bridge.js', 'https://u']);
});

test('repointEntry on win32 matches case-insensitively and keeps the written case of the rest', () =>
{
    const winMoved = [{ from: 'C:\\Users\\x\\.preferred-tools', to: 'C:\\Users\\x\\.alfred-tools' }];
    const machine = { platform: 'win32', home: 'C:\\Users\\x', project: 'C:\\p' };
    const out = repoint({ type: 'stdio', command: 'node', args: ['c:\\Users\\x\\.Preferred-Tools\\mcp-headers.js', 'C:/Users/x/.preferred-tools/pw'] }, winMoved, machine);
    assert.deepStrictEqual(out.args, ['c:\\Users\\x\\.alfred-tools\\mcp-headers.js', 'C:/Users/x/.alfred-tools/pw']);
});

// a 0.5.0 install whose files were moved: serena set up for both apps, then every place it is written named back to the
// former folder while the folder itself is .alfred-tools - what a move leaves before root-repoint runs
const formerOf = <T>(value: T): T => JSON.parse(JSON.stringify(value).replaceAll('.alfred-tools', '.preferred-tools'));
function movedSerena(w: World, { reg = true, list = true, cursor = true } = {})
{
    installBoth(w, { picks: { serena: { scope: 'local' } } });
    const listFile = path.join(w.project, '.alfred-tools', 'mcps.json');
    const cursorFile = path.join(w.project, '.cursor', 'mcp.json');
    if (reg)
    {
        const e = localEntry(w, 'serena')!;
        cli.runClaude(['mcp', 'remove', 'serena', '-s', 'local'], { cwd: w.project, env: w.env });
        seed(w, 'serena', 'local', formerOf(e));
    }
    if (list) { const doc = readJson(listFile); doc.servers[0].entry = formerOf(doc.servers[0].entry); writeJson(listFile, doc); }
    if (cursor) { const doc = readJson(cursorFile); doc.mcpServers.serena = formerOf(doc.mcpServers.serena); writeJson(cursorFile, doc); }
    return { listFile, cursorFile };
}
const namesFormer = (value: unknown) => JSON.stringify(value).includes('.preferred-tools');

test('root-repoint finds a managed registration naming a moved root, not a user-owned one, not while the old folder still holds root files', () =>
{
    const w = world();
    try
    {
        movedSerena(w);
        seed(w, 'mine', 'local', { type: 'stdio', command: 'node', args: [path.join(w.project, '.preferred-tools', 'x.js')] });
        const found = detect(ctxOf(w), 'root-repoint').found;
        assert.deepStrictEqual(found.map((f) => [f.id, f.name, f.scope, Boolean(f.tailOnly)]), [['root-repoint', 'serena', 'local', false]]);
        assert.match(found[0]!.found, /Claude Code's entry, the list .*, Cursor's copy name .*\.preferred-tools - the folder moved to .*\.alfred-tools/);
        put(path.join(w.project, '.preferred-tools', '.mcps-secrets'), '');
        assert.deepStrictEqual(detect(ctxOf(w), 'root-repoint').found, [], 'a .preferred-tools holding root files has not moved');
    }
    finally { w.clean(); }
});

test('root-repoint applied: one mcp-replace with the re-pointed entry; the Cursor copy and the list follow', () =>
{
    const w = world();
    try
    {
        const { listFile, cursorFile } = movedSerena(w);
        const l = logged();
        const res = applyFixes(ctxOf(w), ['root-repoint'], { tmp: path.join(w.dir, 'tmp'), log: l.log });
        assert.strictEqual(res.failed, null, l.text());
        assert.strictEqual(w.writes().filter((a) => a[1] === 'add-json').length - 2, 1, 'one add-json after the install and the seed');
        for (const [what, value] of [['registration', localEntry(w, 'serena')], ['list', readJson(listFile).servers[0]], ['cursor', readJson(cursorFile).mcpServers.serena]] as const)
            assert.ok(!namesFormer(value) && JSON.stringify(value).includes('.alfred-tools'), `${what}: ${JSON.stringify(value)}`);
        assert.deepStrictEqual(detect(ctxOf(w), 'root-repoint').found, []);
    }
    finally { w.clean(); }
});

test('root-repoint with only the Cursor copy stale: no mcp-replace, the repair tail rewrites the copy', () =>
{
    const w = world();
    try
    {
        const { cursorFile } = movedSerena(w, { reg: false, list: false });
        const [f] = detect(ctxOf(w), 'root-repoint').found as [Finding];
        assert.ok(f.tailOnly);
        const calls = w.writes().length;
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['root-repoint'], { tmp: path.join(w.dir, 'tmp'), log: l.log }).failed, null, l.text());
        assert.strictEqual(w.writes().length, calls, 'Claude Code is not touched');
        assert.ok(!namesFormer(readJson(cursorFile).mcpServers.serena), l.text());
        assert.deepStrictEqual(detect(ctxOf(w), 'root-repoint').found, []);
    }
    finally { w.clean(); }
});

test('root-repoint with only the list entry stale: no mcp-replace, the list entry is re-pointed', () =>
{
    const w = world();
    try
    {
        const { listFile } = movedSerena(w, { reg: false, cursor: false });
        const calls = w.writes().length;
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['root-repoint'], { tmp: path.join(w.dir, 'tmp'), log: l.log }).failed, null, l.text());
        assert.strictEqual(w.writes().length, calls, 'Claude Code is not touched');
        assert.ok(!namesFormer(readJson(listFile).servers[0]), l.text());
        assert.deepStrictEqual(detect(ctxOf(w), 'root-repoint').found, []);
    }
    finally { w.clean(); }
});

test('a Cursor copy changed by hand and naming the old root is advice, not a gate: the rest is offered, the edit kept', () =>
{
    const w = world();
    try
    {
        const { cursorFile } = movedSerena(w, { reg: false, list: false });
        const doc = readJson(cursorFile);
        doc.mcpServers.serena.args.push('--mine');
        writeJson(cursorFile, doc);
        const d = detect(ctxOf(w));
        const [f] = d.found.filter((x) => x.id === 'root-repoint') as [Finding];
        assert.match(f.blocked || '', /Cursor's copy of serena in .*mcp\.json was changed by hand and names .*\.preferred-tools/);
        assert.strictEqual(d.afterMove, undefined, 'nothing waits behind it');
        const l = logged();
        applyFixes(ctxOf(w), ['root-repoint'], { tmp: path.join(w.dir, 'tmp'), log: l.log });
        assert.ok(readJson(cursorFile).mcpServers.serena.args.includes('--mine'), 'the hand edit is kept');
    }
    finally { w.clean(); }
});

// ---- the final review's findings ------------------------------------------------------------------------------------
test('after the move, the reconnect line reads the key in the moved root', () =>
{
    const w = world();
    try
    {
        const root = oldRoot(w);
        put(path.join(root, '.mcps-secrets'), 'ACME_GH=test-value-not-a-key\n');
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['root-move'], { tmp: path.join(w.dir, 'tmp'), log: l.log }).failed, null, l.text());
        assert.match(l.text(), /^ ?github: connects with its key at the next session start/m);
        assert.doesNotMatch(l.text(), /\.preferred-tools[\\/]\.mcps-secrets/);
    }
    finally { w.clean(); }
});

test('a roots map that is not JSON is not carried: the data finding is advice, the move and re-point still apply, the old uninstall waits on nothing', () =>
{
    const w = world();
    try
    {
        oldRoot(w);
        const { data, former } = dataDirs(w);
        put(path.join(former, 'roots.json'), 'not json');
        const found = moveOf(w, { data });
        const dataFinding = found.find((f) => f.name === 'data');
        assert.match(dataFinding?.blocked || '', /not JSON/);
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(w, { data }), ['all'], { tmp: path.join(w.dir, 'tmp'), log: l.log }).failed, null, l.text());
        assert.strictEqual(entryAt(w, 'github', 'local').headersHelper, helperCmd(path.join(ptRoot(w), 'mcp-headers.js'), 'ACME_GH', 'Bearer'));
        const ctx = ctxOf(w, { data });
        const old = detect({ ...ctx, inventory: { ...ctx.inventory, plugins: [plug(OLD_ID, 'user')] } }).found.find((x) => x.id === 'retired-plugin');
        assert.ok(old && !old.blocked, JSON.stringify(old));
    }
    finally { w.clean(); }
});

test('a helper path holding an apostrophe or a space is re-pointed, its quoting kept', () =>
{
    const apostrophe = [{ from: "/Users/o'brien/.preferred-tools", to: "/Users/o'brien/.alfred-tools" }];
    const quoted = "node '/Users/o'\\''brien/.preferred-tools/mcp-headers.js' K Bearer";
    assert.strictEqual(repoint({ type: 'http', url: 'u', headersHelper: quoted } as ServerEntry, apostrophe).headersHelper, quoted.replace('.preferred-tools', '.alfred-tools'));
    const spaced = [{ from: '/Users/a b/.preferred-tools', to: '/Users/a b/.alfred-tools' }];
    const double = 'node "/Users/a b/.preferred-tools/mcp-headers.js" K Bearer';
    assert.strictEqual(repoint({ type: 'http', url: 'u', headersHelper: double } as ServerEntry, spaced).headersHelper, double.replace('.preferred-tools', '.alfred-tools'));
});

test('a rename whose folder already moved reports it, never throws (a project that is the home, written in another case)', () =>
{
    const w = world();
    try
    {
        oldRoot(w);
        const [f] = moveOf(w) as [Finding];
        assert.ok(F.rootMoveFix(f, ctxOf(w)).ok);
        const again = F.rootMoveFix(f, ctxOf(w));
        assert.deepStrictEqual([again.ok, /already moved/.test(again.detail)], [true, true], again.detail);
    }
    finally { w.clean(); }
});

// Hold `root` so its rename fails, the way each host refuses it: on Windows a process whose working folder is inside it
// (measured: EPERM on Windows 11, EBUSY on the windows-2025 runner, docs/sources.md A7 - a read-only folder does not stop
// a rename there); elsewhere a folder the rename cannot write. -> the error codes the rename may meet and how to let go
async function holdFolder(parent: string, root: string): Promise<{ code: string; release: () => Promise<void> }>
{
    if (process.platform !== 'win32')
    {
        fs.chmodSync(parent, 0o555);
        return { code: 'EACCES', release: async () => { fs.chmodSync(parent, 0o755); } };
    }
    return { code: WINDOWS_IN_USE, release: await heldByChild('', root) };
}

// Windows' answer to a rename of a folder in use: EPERM on Windows 11, EBUSY on the windows-2025 runner (A7)
const WINDOWS_IN_USE = '(?:EPERM|EBUSY)';

// A child process, started in `cwd`, that runs `script` (with `args` as process.argv[1..]) and then stays alive: it says
// 'held' once the script has run, so the caller knows the hold is in place. -> how to let go
async function heldByChild(script: string, cwd: string, args: string[] = []): Promise<() => Promise<void>>
{
    const child = spawn(process.execPath, ['-e', `${script};process.stdout.write('held');setInterval(() => {}, 1000)`, ...args], { cwd, stdio: ['ignore', 'pipe', 'inherit'] });
    const [chunk] = await once(child.stdout, 'data') as [Buffer];
    assert.strictEqual(String(chunk), 'held');
    return async () => { const exited = once(child, 'exit'); child.kill(); await exited; };
}

test('a rename Windows refuses names the servers that keep files in the folder, and how to stop them first', async () =>
{
    const w = world();
    try
    {
        const root = oldRoot(w);
        seed(w, 'mine', 'local', { type: 'stdio', command: 'node', args: [path.join(root, 'server.js')] });
        const [f] = moveOf(w) as [Finding];
        const hold = await holdFolder(w.project, root);
        try
        {
            const win = F.rootMoveFix(f, { ...ctxOf(w), platform: 'win32' });
            assert.strictEqual(win.ok, false, win.detail);
            assert.match(win.detail, new RegExp(`not moved: a file in it is open \\(${hold.code}\\) - in /mcp disable mine \\(a server that keeps files in it\\), close Claude Code and Cursor, start Claude Code again, run /alfred-tools:update, then enable them in /mcp`));
            const posix = F.rootMoveFix(f, { ...ctxOf(w), platform: 'linux' });
            assert.match(posix.detail, new RegExp(`not moved: ${hold.code}`));
            assert.doesNotMatch(posix.detail, /a file in it is open/, 'the open-file advice is for Windows only');
        }
        finally { await hold.release(); }
    }
    finally { w.clean(); }
});

test('a rename Windows refuses while another process holds a file open in the folder gives the same advice', { skip: process.platform !== 'win32' && 'POSIX renames a folder whose files are open: the refusal exists on Windows only' }, async () =>
{
    const w = world();
    try
    {
        const root = oldRoot(w);
        seed(w, 'mine', 'local', { type: 'stdio', command: 'node', args: [path.join(root, 'server.js')] });
        const [f] = moveOf(w) as [Finding];
        // a Node fs.openSync handle in another process, the first case A7 measured (EPERM on Windows 11)
        const release = await heldByChild("require('node:fs').openSync(process.argv[1], 'r')", w.project, [path.join(root, 'preferred-tools.json')]);
        try
        {
            const held = F.rootMoveFix(f, ctxOf(w));
            assert.strictEqual(held.ok, false, held.detail);
            assert.match(held.detail, new RegExp(`not moved: a file in it is open \\(${WINDOWS_IN_USE}\\) - in /mcp disable mine \\(a server that keeps files in it\\), close Claude Code and Cursor`));
        }
        finally { await release(); }
        assert.ok(F.rootMoveFix(f, ctxOf(w)).ok, 'the move goes through once the process has let go');
    }
    finally { w.clean(); }
});

// a 0.4.0 root under the former name: its record, helper 4 and a GitHub server through the helper
const formerRoot = (base: string) => path.join(base, '.preferred-tools');
function oldRoot(w: World, base = w.project, scope = 'local', name = 'github')
{
    const root = formerRoot(base);
    put(path.join(root, 'preferred-tools.json'), '{"version":1,"servers":[]}\n');
    put(path.join(root, '.gitignore'), '*\n!.gitignore\n!mcp-headers.js\n');
    put(path.join(root, 'mcp-headers.js'), rootsLib.helperSource().replace(/^\/\/ alfred-tools mcp-headers \d+/, '// preferred-tools mcp-headers 4'));
    seed(w, name, scope, { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headersHelper: helperCmd(path.join(root, 'mcp-headers.js'), 'ACME_GH', 'Bearer') });
    return root;
}
const moveOf = (w: World, over = {}) => detect(ctxOf(w, over), 'root-move').found;
const entryAt = (w: World, name: string, scope: string) => (scope === 'user' ? userEntry(w, name) : localEntry(w, name))!;

test('root-move moves a root and re-points its registrations in one apply', () =>
{
    const w = world();
    try
    {
        oldRoot(w);
        const [f] = moveOf(w) as [Finding];
        assert.deepStrictEqual([f.name, f.scope, Boolean(f.blocked)], ['project', null, false]);
        assert.match(f.found, /renames .*\.preferred-tools to .*\.alfred-tools \(keys, list, helpers, sign-ins and data move unread\) and points 1 registration\(s\) at it; close other Claude Code and Cursor windows first/);
        const l = logged();
        const res = applyFixes(ctxOf(w), ['root-move'], { tmp: path.join(w.dir, 'tmp'), log: l.log });
        assert.strictEqual(res.failed, null, l.text());
        assert.ok(!fs.existsSync(formerRoot(w.project)) && fs.existsSync(ptRoot(w)));
        assert.strictEqual(fs.readFileSync(path.join(ptRoot(w), 'mcp-headers.js'), 'utf8').split('\n')[0], `// alfred-tools mcp-headers ${HV}`);
        assert.strictEqual(entryAt(w, 'github', 'local').headersHelper, helperCmd(path.join(ptRoot(w), 'mcp-headers.js'), 'ACME_GH', 'Bearer'));
        assert.ok(fs.existsSync(path.join(ptRoot(w), 'preferred-tools.json')), 'the record moved unread');
        assert.match(l.text(), /RECHECK - the folders moved; checking again/);
        assert.strictEqual(l.lines.filter((line) => /^ok +root-move: renamed/.test(line)).length, 1, 'renamed once: the machine pass does not rename a second time');
        assert.ok(res.applied.some((x) => x.id === 'root-move'), JSON.stringify(res.applied.map((x) => x.id)));
        assert.deepStrictEqual(moveOf(w), []);
        assert.deepStrictEqual(detect(ctxOf(w), 'root-repoint').found, []);
    }
    finally { w.clean(); }
});

test('a root holding only .gitignore and a data folder moves; so does a 0.1.x root holding only .secrets', () =>
{
    const w = world();
    try
    {
        put(path.join(formerRoot(w.project), '.gitignore'), '*\n');
        fs.mkdirSync(path.join(formerRoot(w.project), 'memory'));
        put(path.join(formerRoot(w.home), '.secrets'), 'NAME=\n');
        assert.deepStrictEqual(moveOf(w).map((f) => [f.name, Boolean(f.blocked)]), [['project', false], ['global', false]]);
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['root-move'], { tmp: path.join(w.dir, 'tmp'), log: l.log }).failed, null, l.text());
        assert.ok(fs.existsSync(path.join(ptRoot(w), 'memory')) && fs.existsSync(path.join(homeRoot(w), '.secrets')));
    }
    finally { w.clean(); }
});

test('an empty .alfred-tools is renamed over', () =>
{
    const w = world();
    try
    {
        oldRoot(w);
        fs.mkdirSync(ptRoot(w));
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['root-move'], { tmp: path.join(w.dir, 'tmp'), log: l.log }).failed, null, l.text());
        assert.ok(fs.existsSync(path.join(ptRoot(w), 'mcp-headers.js')) && !fs.existsSync(formerRoot(w.project)));
    }
    finally { w.clean(); }
});

test('both-present is blocked with the merge text; came-back is advice and root-repoint still runs', () =>
{
    const w = world();
    try
    {
        oldRoot(w);
        put(path.join(ptRoot(w), 'mcps.json'), '{"version":1,"servers":[],"own":[]}\n');
        const [both] = moveOf(w) as [Finding];
        assert.match(both.blocked!, /both \.preferred-tools and \.alfred-tools are in .*: move what you keep from \.preferred-tools into \.alfred-tools, delete \.preferred-tools, then run \/alfred-tools:fix/);
        assert.deepStrictEqual(detect(ctxOf(w), 'root-repoint').found, [], 'nothing re-points while the old root holds root files');
        for (const file of ['preferred-tools.json', 'mcp-headers.js', '.gitignore']) fs.rmSync(path.join(formerRoot(w.project), file));
        fs.mkdirSync(path.join(formerRoot(w.project), 'memory'));
        const [back] = moveOf(w) as [Finding];
        assert.match(back.blocked!, /\.preferred-tools came back after the move and holds memory - a server started before the move wrote there; close the Claude Code and Cursor windows using it, move what you keep into \.alfred-tools, then delete it/);
        put(path.join(ptRoot(w), 'mcp-headers.js'), rootsLib.helperSource());
        assert.deepStrictEqual(detect(ctxOf(w), 'root-repoint').found.filter((f) => f.id === 'root-repoint').map((f) => [f.name, Boolean(f.blocked)]), [['github', false]]);
    }
    finally { w.clean(); }
});

test('a symlink is blocked; a rename that throws fails with nothing changed', { skip: process.platform === 'win32' }, (t) =>
{
    const w = world();
    try
    {
        fs.mkdirSync(path.join(w.dir, 'target'));
        fs.symlinkSync(path.join(w.dir, 'target'), formerRoot(w.project));
        assert.match((moveOf(w) as [Finding])[0].blocked!, /a link - move its target by hand/);
        fs.unlinkSync(formerRoot(w.project));
        oldRoot(w);
        t.mock.method(fs, 'renameSync', () => { throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' }); });
        const l = logged();
        const res = applyFixes(ctxOf(w), ['root-move'], { tmp: path.join(w.dir, 'tmp'), log: l.log });
        t.mock.restoreAll();
        assert.match(res.failed!, /not moved: EBUSY: resource busy or locked$/, 'off Windows the error as it is; the open-file advice is Windows\' (see the next rename test)');
        assert.ok(fs.existsSync(path.join(formerRoot(w.project), 'mcp-headers.js')) && !fs.existsSync(ptRoot(w)));
        assert.match(entryAt(w, 'github', 'local').headersHelper!, /\.preferred-tools/);
    }
    finally { w.clean(); }
});

test('a project registration naming the moved global root is re-pointed in the same apply', () =>
{
    const w = world();
    try
    {
        oldRoot(w, w.home, 'local');
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['root-move'], { tmp: path.join(w.dir, 'tmp'), log: l.log }).failed, null, l.text());
        assert.strictEqual(entryAt(w, 'github', 'local').headersHelper, helperCmd(path.join(homeRoot(w), 'mcp-headers.js'), 'ACME_GH', 'Bearer'));
    }
    finally { w.clean(); }
});

test('an unmanaged registration naming the root is listed and left', () =>
{
    const w = world();
    try
    {
        oldRoot(w);
        const mine = { type: 'stdio', command: 'node', args: [path.join(formerRoot(w.project), 'mine.js')] } as ServerEntry;
        seed(w, 'mine', 'local', mine);
        const [f] = moveOf(w) as [Finding];
        assert.match(f.note!, /mine \(local\) names .*mine\.js - not re-pointed, yours to change/);
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['root-move'], { tmp: path.join(w.dir, 'tmp'), log: l.log }).failed, null, l.text());
        assert.deepStrictEqual(entryAt(w, 'mine', 'local'), mine);
    }
    finally { w.clean(); }
});

test('project equal to home: one rename, both families re-pointed', () =>
{
    const w = world();
    try
    {
        const env = { ...w.env, HOME: w.project, USERPROFILE: w.project };
        const ww = { ...w, env };
        oldRoot(ww, w.project, 'local', 'github');
        oldRoot(ww, w.project, 'user', 'github-user');
        const [f] = moveOf(ww) as [Finding];
        assert.strictEqual(f.name, 'project+global');
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(ww), ['root-move'], { tmp: path.join(w.dir, 'tmp'), log: l.log }).failed, null, l.text());
        assert.strictEqual(l.lines.filter((line) => /^ok +root-move: renamed/.test(line)).length, 1);
        for (const [name, scope] of [['github', 'local'], ['github-user', 'user']] as const)
            assert.match(entryAt(ww, name, scope).headersHelper!, /\.alfred-tools/, `${name} (${scope})`);
    }
    finally { w.clean(); }
});

// ---- the gate: the move first, the rest checked again after it (spec D3) --------------------------------------------
test('with a move pending, only the move is offered and the rest waits', () =>
{
    const w = world();
    try
    {
        oldRoot(w);
        const d = detect(ctxOf(w));
        assert.deepStrictEqual(ids(d.found), ['root-move']);
        assert.ok(d.afterMove!.some((f) => f.id === 'helper-stale') && d.afterMove!.some((f) => f.id === 'list-import'), JSON.stringify(ids(d.afterMove!)));
        assert.match(renderFixes(d), /After the move \(checked again once it is done\):/);
    }
    finally { w.clean(); }
});

test('fix --only <name> with a move pending offers only the move', () =>
{
    const w = world();
    try
    {
        oldRoot(w);
        assert.deepStrictEqual(ids(detect(ctxOf(w), 'github').found), ['root-move']);
    }
    finally { w.clean(); }
});

test('with only root-repoint fixable, helper-missing waits (no write into a new .preferred-tools); a repoint-only apply prints RECHECK', () =>
{
    const w = world();
    try
    {
        put(path.join(ptRoot(w), 'mcp-headers.js'), rootsLib.helperSource());
        seed(w, 'github', 'local', { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headersHelper: helperCmd(path.join(formerRoot(w.project), 'mcp-headers.js'), 'ACME_GH', 'Bearer') });
        const d = detect(ctxOf(w));
        assert.deepStrictEqual(ids(d.found), ['root-repoint']);
        assert.ok(d.afterMove!.some((f) => f.id === 'helper-missing'), JSON.stringify(ids(d.afterMove!)));
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['all'], { tmp: path.join(w.dir, 'tmp'), log: l.log }).failed, null, l.text());
        assert.ok(!fs.existsSync(formerRoot(w.project)), 'no helper written into a new .preferred-tools');
        assert.match(l.text(), /RECHECK - the folders moved; checking again/);
        assert.strictEqual(entryAt(w, 'github', 'local').headersHelper, helperCmd(path.join(ptRoot(w), 'mcp-headers.js'), 'ACME_GH', 'Bearer'));
    }
    finally { w.clean(); }
});

test('after a move, a second apply finds nothing and prints no RECHECK', () =>
{
    const w = world();
    try
    {
        oldRoot(w);
        assert.strictEqual(applyFixes(ctxOf(w), ['root-move'], { tmp: path.join(w.dir, 'tmp'), log: () => {} }).failed, null);
        const l = logged();
        const res = applyFixes(ctxOf(w), ['root-move', 'root-repoint'], { tmp: path.join(w.dir, 'tmp'), log: l.log });
        assert.ok(res.gone, l.text());
        assert.doesNotMatch(l.text(), /RECHECK/);
    }
    finally { w.clean(); }
});

// ---- the roots map and the former plugin (spec D4, D5) -------------------------------------------------------------
const OLD_ID = 'preferred-tools@envoydev';
function dataDirs(w: World)
{
    const data = path.join(w.dir, 'plugins-data', 'alfred-tools-envoydev');
    const former = path.join(w.dir, 'plugins-data', 'preferred-tools-envoydev');
    fs.mkdirSync(data, { recursive: true });
    fs.mkdirSync(former, { recursive: true });
    return { data, former };
}
const mapOf = (projects: Record<string, string>, global: string | null = null) => ({ version: 1, global, projects });

test('the roots map carries over from the old data folder, re-pointed', () =>
{
    const w = world();
    try
    {
        oldRoot(w);
        const { data, former } = dataDirs(w);
        const key = rootsLib.mapKey(w.project);
        writeJson(path.join(former, 'roots.json'), mapOf({ [key]: formerRoot(w.project), other: '/elsewhere/keys' }));
        const found = moveOf(w, { data });
        assert.deepStrictEqual(found.map((f) => [f.name, Boolean(f.blocked)]), [['project', false], ['data', false]]);
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(w, { data }), ['root-move'], { tmp: path.join(w.dir, 'tmp'), log: l.log }).failed, null, l.text());
        assert.deepStrictEqual(readJson(path.join(data, 'roots.json')), mapOf({ [key]: ptRoot(w), other: '/elsewhere/keys' }));
        assert.deepStrictEqual(readJson(path.join(former, 'roots.json')), mapOf({ [key]: formerRoot(w.project), other: '/elsewhere/keys' }), 'the old folder is never written');
        assert.deepStrictEqual(moveOf(w, { data }), []);
    }
    finally { w.clean(); }
});

test('an existing map is kept and re-pointed on a later move; no --data, no data finding', () =>
{
    const w = world();
    try
    {
        oldRoot(w);
        const { data, former } = dataDirs(w);
        const key = rootsLib.mapKey(w.project);
        writeJson(path.join(former, 'roots.json'), mapOf({ old: '/x' }));
        writeJson(path.join(data, 'roots.json'), mapOf({ [key]: formerRoot(w.project) }));
        assert.deepStrictEqual(moveOf(w, { data }).map((f) => f.name), ['project'], 'a map already here is not replaced');
        assert.deepStrictEqual(moveOf(w).map((f) => f.name), ['project']);
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(w, { data }), ['root-move'], { tmp: path.join(w.dir, 'tmp'), log: l.log }).failed, null, l.text());
        assert.deepStrictEqual(readJson(path.join(data, 'roots.json')), mapOf({ [key]: ptRoot(w) }));
    }
    finally { w.clean(); }
});

test('a data finding alone gates nothing; a data-only apply prints no RECHECK', () =>
{
    const w = world();
    try
    {
        const { data, former } = dataDirs(w);
        writeJson(path.join(former, 'roots.json'), mapOf({ old: '/x' }));
        seed(w, 'github', 'local', { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headersHelper: helperCmd(path.join(ptRoot(w), 'mcp-headers.js'), 'ACME_GH', 'Bearer') });
        const d = detect(ctxOf(w, { data }));
        assert.strictEqual(d.afterMove, undefined);
        assert.ok(d.found.some((f) => f.id === 'root-move' && f.name === 'data') && d.found.some((f) => f.id === 'helper-missing'), JSON.stringify(ids(d.found)));
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(w, { data }), ['root-move'], { tmp: path.join(w.dir, 'tmp'), log: l.log }).failed, null, l.text());
        assert.deepStrictEqual(readJson(path.join(data, 'roots.json')), mapOf({ old: '/x' }));
        assert.doesNotMatch(l.text(), /RECHECK/);
    }
    finally { w.clean(); }
});

test('retired-plugin offers preferred-tools@envoydev with its text, outside the alfred flag; its uninstall is blocked while the data finding is open', () =>
{
    const ctx = ctxFor({ plugins: [plug(OLD_ID, 'user')] });
    const both = { ...ctx, inventory: { ...ctx.inventory, alfredCodeEnabled: true } };
    const [f] = detect(both).found.filter((x) => x.id === 'retired-plugin') as [Finding];
    assert.deepStrictEqual([f.name, f.scope, f.alfred, Boolean(f.blocked)], [OLD_ID, 'user', false, false]);
    assert.match(f.found, /preferred-tools@envoydev is this plugin under its former name, installed at user scope - alfred-tools replaces it/);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-old-data-'));
    try
    {
        const data = path.join(dir, 'alfred-tools-envoydev');
        writeJson(path.join(dir, 'preferred-tools-envoydev', 'roots.json'), mapOf({}));
        fs.mkdirSync(data);
        const open = detect(makeCtx({ inventory: ctx.inventory, catalog, machine: noMachine(), data, env: ctx.env })).found.filter((x) => x.id === 'retired-plugin') as [Finding];
        assert.match(open[0]!.blocked!, /the roots map in .*preferred-tools-envoydev comes over first/);
        // running as the former id (an update during the release window), it never offers to uninstall itself
        const self = detect(makeCtx({ inventory: ctx.inventory, catalog, machine: noMachine(), data: path.join(dir, 'preferred-tools-envoydev'), env: ctx.env })).found.filter((x) => x.id === 'retired-plugin');
        assert.deepStrictEqual(self, []);
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- helper-foreign: a hand-added server with a helper of the user's own (Part C2) ----------------------------------

const ADOPT_NINE = ['atlassian', 'github', 'gitlab', 'context7', 'sentry', 'memory', 'serena', 'windows-control', 'playwright-chrome'];
function adoptRoot(w: World, { secrets = 'SONARQUBE_TOKEN=tok-123\nSONARQUBE_ORG=acme\n', firstArg = 'SONARQUBE_TOKEN', mixed = false, outside = false } = {})
{
    const pt = ptRoot(w);
    put(path.join(pt, '.mcps-secrets'), secrets);
    const clients = (i: number) => (mixed && i === 0 ? ['claude'] : ['claude', 'cursor']);
    put(path.join(pt, 'mcps.json'), `${JSON.stringify({ version: 1, servers: ADOPT_NINE.map((name, i) => ({ name, scope: 'project', row: name, route: 'local', clients: clients(i), entry: { command: 'node', args: [`${name}.js`] }, key: null })), own: [] }, null, 2)}\n`);
    const companion = path.join(outside ? path.join(w.dir, 'elsewhere') : pt, 'mcp-headers-sonarqube.js');
    put(companion, '// mine\n');
    seed(w, 'my-sonarqube', 'project', { type: 'http', url: 'https://api.sonarcloud.io/mcp', headersHelper: `node ${companion} ${firstArg} SONARQUBE_ORG` });
    return { pt, companion };
}

test('helper-foreign is blocked when the key is empty', () =>
{
    const w = world();
    try
    {
        const { pt } = adoptRoot(w, { secrets: 'SONARQUBE_TOKEN=\nSONARQUBE_ORG=acme\n' });
        const [f] = detect(ctxOf(w)).found.filter((x) => x.id === 'helper-foreign') as [Finding];
        assert.deepStrictEqual([f.name, f.keyName], ['my-sonarqube', 'SONARQUBE_TOKEN']);
        assert.strictEqual(f.blocked, `fill SONARQUBE_TOKEN in ${path.join(pt, '.mcps-secrets')}, then run /alfred-tools:fix`);
        const lines = logged();
        const res = applyFixes(ctxOf(w), ['helper-foreign'], { log: lines.log });
        assert.deepStrictEqual(res.applied, []);
        assert.match(lines.text(), /skipped helper-foreign on my-sonarqube \(project\): fill SONARQUBE_TOKEN/);
        assert.match(readJson(path.join(w.project, '.mcp.json')).mcpServers['my-sonarqube'].headersHelper, /mcp-headers-sonarqube\.js/, 'the registration is left as it is');
        // filled in, it is offered; a first argument that is not a name falls back to the row's own
        put(path.join(pt, '.mcps-secrets'), 'SONARQUBE_TOKEN=tok-123\n');
        assert.strictEqual((detect(ctxOf(w)).found.find((x) => x.id === 'helper-foreign') as Finding).blocked, undefined);
    }
    finally { w.clean(); }
});

test('helper-foreign names the row\'s key when the foreign helper\'s first argument is not a name', () =>
{
    const w = world();
    try
    {
        adoptRoot(w, { firstArg: '--weird' });
        const [f] = detect(ctxOf(w)).found.filter((x) => x.id === 'helper-foreign') as [Finding];
        assert.strictEqual(f.keyName, 'SONARQUBE_TOKEN');
        assert.ok(!f.found.includes('tok-123') && !JSON.stringify(f).includes('tok-123'), 'a finding names no key value');
    }
    finally { w.clean(); }
});

test('helper-foreign never echoes a key-shaped first argument: the row\'s key name stands in, in the finding and in the blocked note', () =>
{
    const w = world();
    try
    {
        const shaped = `squ_${'ab12'.repeat(10)}`;
        const { pt } = adoptRoot(w, { firstArg: shaped, secrets: 'SONARQUBE_TOKEN=\nSONARQUBE_ORG=acme\n' });
        const [f] = detect(ctxOf(w)).found.filter((x) => x.id === 'helper-foreign') as [Finding];
        assert.strictEqual(f.keyName, 'SONARQUBE_TOKEN');
        assert.strictEqual(f.blocked, `fill SONARQUBE_TOKEN in ${path.join(pt, '.mcps-secrets')}, then run /alfred-tools:fix`);
        assert.ok(!JSON.stringify(f).includes(shaped), 'no field of the finding holds the argument');
        const lines = logged();
        applyFixes(ctxOf(w), ['helper-foreign'], { log: lines.log });
        assert.ok(!lines.text().includes(shaped), 'no output line holds the argument');
    }
    finally { w.clean(); }
});

test('helper-foreign takes a first argument as the key name only when a key file defines it', () =>
{
    const w = world();
    try
    {
        adoptRoot(w, { firstArg: 'MY_SONAR_PAT', secrets: 'MY_SONAR_PAT=tok-123\nSONARQUBE_ORG=acme\n' });
        assert.strictEqual((detect(ctxOf(w)).found.find((x) => x.id === 'helper-foreign') as Finding).keyName, 'MY_SONAR_PAT', 'a name the key files define');
        put(path.join(ptRoot(w), '.mcps-secrets'), 'SONARQUBE_TOKEN=tok-123\nSONARQUBE_ORG=acme\n');
        assert.strictEqual((detect(ctxOf(w)).found.find((x) => x.id === 'helper-foreign') as Finding).keyName, 'SONARQUBE_TOKEN', 'a name no key file defines falls back to the row\'s');
    }
    finally { w.clean(); }
});

test('a mixed list adopts for Claude Code only and names the configure step', () =>
{
    const w = world();
    try
    {
        const { pt } = adoptRoot(w, { mixed: true });
        const lines = logged();
        const res = applyFixes(ctxOf(w), ['all'], { tmp: path.join(w.dir, 'tmp'), log: lines.log });
        assert.strictEqual(res.failed, null, lines.text());
        const listed = readJson(path.join(pt, 'mcps.json')).servers.filter((s: { name: string }) => s.name === 'my-sonarqube');
        assert.strictEqual(listed.length, 1);
        assert.deepStrictEqual(listed[0].clients, ['claude']);
        assert.strictEqual(listed[0].cursorEntry, undefined);
        assert.ok(!fsx.existsSync(path.join(w.project, '.cursor', 'mcp.json')), 'Cursor gets nothing');
        assert.match(lines.text(), /my-sonarqube.*Claude Code only.*\/alfred-tools:configure.*Cursor/);
        assert.strictEqual(lines.lines.filter((line) => /Claude Code only/.test(line)).length, 1, 'the note is told once, though two findings carry it');
        assert.match(readJson(path.join(w.project, '.mcp.json')).mcpServers['my-sonarqube'].headersHelper, /mcp-headers\.js SONARQUBE_TOKEN Bearer --header SONARQUBE_ORG=SONARQUBE_ORG$/);
    }
    finally { w.clean(); }
});

test('a blocked helper-foreign leaves Cursor\'s foreign-form copy; once the key is filled, fix replaces it with the bridge copy', () =>
{
    const w = world();
    try
    {
        const { pt } = adoptRoot(w, { secrets: 'SONARQUBE_ORG=acme\n' });
        const cursorFile = path.join(w.project, '.cursor', 'mcp.json');
        const first = applyFixes(ctxOf(w), ['list-import'], { tmp: path.join(w.dir, 'tmp'), log: () => {} });
        assert.strictEqual(first.failed, null);
        assert.match(JSON.stringify(readJson(cursorFile).mcpServers['my-sonarqube']), /mcp-headers-sonarqube\.js/, 'listed for both apps, Cursor holds the entry as it is');
        assert.ok((detect(ctxOf(w)).found.find((x) => x.id === 'helper-foreign') as Finding).blocked, 'no key: blocked');
        secretsAt(pt, { SONARQUBE_TOKEN: 'tok-123', SONARQUBE_ORG: 'acme' });
        const lines = logged();
        const second = applyFixes(ctxOf(w), ['helper-foreign'], { tmp: path.join(w.dir, 'tmp2'), log: lines.log });
        assert.strictEqual(second.failed, null, lines.text());
        const copy = readJson(cursorFile).mcpServers['my-sonarqube'];
        assert.ok(copy.args.includes(path.join(pt, 'mcp-bridge.js')) && copy.args.includes('SONARQUBE_ORG=SONARQUBE_ORG'), JSON.stringify(copy));
        assert.strictEqual(copy.headersHelper, undefined);
        assert.ok(fsx.existsSync(path.join(pt, 'mcp-bridge.js')));
    }
    finally { w.clean(); }
});

test('helper-foreign retires the old helper after the replace: removed from a root, left outside the roots', () =>
{
    for (const outside of [false, true])
    {
        const w = world();
        try
        {
            const { companion } = adoptRoot(w, { outside });
            const lines = logged();
            const res = applyFixes(ctxOf(w), ['helper-foreign'], { tmp: path.join(w.dir, 'tmp'), log: lines.log });
            assert.strictEqual(res.failed, null, lines.text());
            assert.match(readJson(path.join(w.project, '.mcp.json')).mcpServers['my-sonarqube'].headersHelper, /mcp-headers\.js/, 'the registration runs the plugin\'s helper');
            if (outside)
            {
                assert.ok(fsx.existsSync(companion), 'a file outside the roots is left');
                assert.match(lines.text(), /mcp-headers-sonarqube\.js is no longer used.*left where it is - it is not directly in a root folder/);
                assert.ok(!/removed .*mcp-headers-sonarqube/.test(lines.text()));
            }
            else
            {
                assert.ok(!fsx.existsSync(companion), 'a file in a root, named by nothing now, is removed');
                assert.ok(lines.text().includes(`removed ${companion}`), lines.text());
            }
        }
        finally { w.clean(); }
    }
});

test('retireHelperSteps plans a step only for a hand-built helper inside a root that the rewrite replaces with the plugin\'s own', () =>
{
    const w = world();
    try
    {
        const { pt } = adoptRoot(w);
        const ctx = ctxOf(w);
        const own = helperCmd(path.join(pt, 'mcp-headers.js'), 'SONARQUBE_TOKEN', 'Bearer');
        const rewrite = (command: string, to = own) => ({ name: 'x', scope: 'project', old: { type: 'http', url: 'https://x', headersHelper: command }, entry: { type: 'http', url: 'https://x', headersHelper: to } });
        const inRoot = path.join(pt, 'mcp-headers-mine.js');
        assert.deepStrictEqual(retireHelperSteps(ctx, [rewrite(`node ${inRoot} A B`)]).map((step) => step.file), [inRoot]);
        assert.deepStrictEqual(retireHelperSteps(ctx, [rewrite(`node ${path.join(w.dir, 'elsewhere', 'mcp-headers-mine.js')} A B`)]), [], 'outside the roots');
        assert.deepStrictEqual(retireHelperSteps(ctx, [rewrite(`node ${path.join(pt, 'mcp-headers.js')} A Bearer`)]), [], 'the plugin\'s own helper is never retired');
        assert.deepStrictEqual(retireHelperSteps(ctx, [rewrite(`node ${inRoot} A B`, `node ${inRoot} A B`)]), [], 'a rewrite that keeps the foreign helper retires nothing');
        assert.deepStrictEqual(retireHelperSteps(ctx, [rewrite(`node ${path.join(pt, 'sub', 'mcp-headers-mine.js')} A B`)]), [], 'a file below a root folder is not retired');
        assert.deepStrictEqual(retireHelperSteps(ctx, [rewrite(`node ${path.join(pt, 'sonar-token.js')} A B`)]), [], 'a script that is not named mcp-headers-<name> is not retired');
        assert.strictEqual(retirableHelper(`node ${path.join(pt, 'sonar-token.js')} A B`, ctx)?.left, 'its name is not mcp-headers-<name>.js');
        assert.strictEqual(retirableHelper(`node ${path.join(pt, 'sub', 'mcp-headers-mine.js')} A B`, ctx)?.left, 'it is not directly in a root folder');
        assert.strictEqual(retirableHelper(`node ${inRoot} A B`, ctx)?.left, null);
    }
    finally { w.clean(); }
});

test('helper-foreign-file finds mcp-headers-<name> files in a root that no registration names, and not mcp-headers.js', () =>
{
    const w = world();
    try
    {
        const { pt, companion } = adoptRoot(w);
        const orphan = path.join(pt, 'mcp-headers-old.js');
        const orphanMjs = path.join(pt, 'mcp-headers-other.mjs');
        put(orphan, '// old\n');
        put(orphanMjs, '// old\n');
        put(path.join(pt, 'mcp-headers.js'), rootsLib.shippedSource('helper'));
        const found = () => detect(ctxOf(w)).found.filter((f) => f.id === 'helper-foreign-file').map((f) => f.name).sort();
        assert.deepStrictEqual(found(), [orphanMjs, orphan].sort(), 'the plugin\'s helper and the one my-sonarqube names are not found');
        const lines = logged();
        const res = applyFixes(ctxOf(w), ['helper-foreign-file'], { tmp: path.join(w.dir, 'tmp'), log: lines.log });
        assert.strictEqual(res.failed, null, lines.text());
        assert.ok(!fsx.existsSync(orphan) && !fsx.existsSync(orphanMjs), 'both are removed');
        assert.ok(fsx.existsSync(companion) && fsx.existsSync(path.join(pt, 'mcp-headers.js')), 'a named file and the plugin\'s helper stay');
        assert.deepStrictEqual(found(), []);
    }
    finally { w.clean(); }
});

test('helper-foreign-file is found only when the apply would remove the file: a name in another project, the account file, Cursor or git keeps it', () =>
{
    const w = world();
    try
    {
        const { pt } = adoptRoot(w);
        const cases: [string, (file: string) => void][] = [
            ['another project\'s .mcp.json', (file) => { const other = path.join(w.dir, 'other'); put(path.join(other, '.mcp.json'), JSON.stringify({ mcpServers: { x: { command: 'node', args: [file] } } })); const doc = fs.existsSync(account.accountFile(w.env)) ? readJson(account.accountFile(w.env)) : {}; writeJson(account.accountFile(w.env), { ...doc, projects: { ...(doc.projects || {}), [other]: {} } }); }],
            ['the account file\'s local server', (file) => { const doc = fs.existsSync(account.accountFile(w.env)) ? readJson(account.accountFile(w.env)) : {}; writeJson(account.accountFile(w.env), { ...doc, projects: { ...(doc.projects || {}), [path.join(w.dir, 'elsewhere')]: { mcpServers: { y: { command: 'node', args: [file] } } } } }); }],
            ['the home Cursor file', (file) => put(path.join(w.home, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { z: { command: 'node', args: [file] } } }))],
            ['git tracking', (file) => { gitInit(w.project); assert.strictEqual(spawnSync('git', ['-C', w.project, 'add', '-f', '--', file]).status, 0); }],
        ];
        for (const [label, keep] of cases)
        {
            const orphan = path.join(pt, `mcp-headers-${label.replace(/\W+/g, '-')}.js`);
            put(orphan, '// old\n');
            assert.ok(detect(ctxOf(w)).found.some((f) => f.name === orphan), `${label}: found before anything names it`);
            keep(orphan);
            assert.ok(!detect(ctxOf(w)).found.some((f) => f.name === orphan), `${label}: not offered`);
        }
    }
    finally { w.clean(); }
});

test('helper-foreign-file compares names without case on darwin and with case on linux', () =>
{
    const w = world();
    try
    {
        const { pt } = adoptRoot(w);
        const orphan = path.join(pt, 'mcp-headers-sonar.js');
        put(orphan, '// old\n');
        put(path.join(w.project, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { z: { command: 'node', args: [path.join(pt, 'MCP-Headers-Sonar.js')] } } }));
        const found = (platform: string) => detectAll(ctxOf(w, { platform })).found.some((f) => f.id === 'helper-foreign-file' && f.name === orphan);
        assert.strictEqual(found('darwin'), false, 'a name in another case still protects the file');
        assert.strictEqual(found('linux'), true, 'a case-sensitive file system treats it as another file');
    }
    finally { w.clean(); }
});

// read-guard lists a config dir once, by its real path: a symlink to another dir or to the current one is no dir of its own
function symlinkOr(t: { skip: (reason: string) => void }, target: string, link: string): boolean
{
    try { fsx.symlinkSync(target, link, 'dir'); return true; }
    catch (error)
    {
        if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
        t.skip('NOT RUN: this account may not create symlinks (EPERM, Windows without the privilege)');
        return false;
    }
}

test('read-guard gives one finding for a config dir that is a symlink to another config dir with the plugin', (t) =>
{
    const w = world();
    try
    {
        const dirs = otherDirsWorld(w);
        if (!symlinkOr(t, dirs['-personal']!, path.join(w.home, '.claude-work'))) return;
        assert.deepStrictEqual(configDirsWithPlugin(w.home, dirs['']!).sort(), [dirs['-old']!, dirs['-personal']!].sort(), 'the symlink is not listed beside its target');
        const found = detectAll(ctxOf(w)).found.filter((f) => f.id === 'read-guard');
        assert.deepStrictEqual(found.map((f) => f.name).sort(), [path.join(dirs['-old']!, 'settings.json'), path.join(dirs['-personal']!, 'settings.json')].sort());
    }
    finally { w.clean(); }
});

test('read-guard skips a config dir that is a symlink to the current one', (t) =>
{
    const w = world();
    try
    {
        const dirs = otherDirsWorld(w);
        if (!symlinkOr(t, dirs['']!, path.join(w.home, '.claude-link'))) return;
        assert.ok(!configDirsWithPlugin(w.home, dirs['']!).includes(path.join(w.home, '.claude-link')));
        assert.ok(!detectAll(ctxOf(w)).found.some((f) => f.id === 'read-guard' && f.name.startsWith(path.join(w.home, '.claude-link'))));
    }
    finally { w.clean(); }
});

test('read-guard skips a .claude-x that is a file, and a dangling symlink, without a throw', (t) =>
{
    const w = world();
    try
    {
        const dirs = otherDirsWorld(w);
        put(path.join(w.home, '.claude-x'), 'not a folder');
        if (symlinkOr(t, path.join(w.home, 'gone'), path.join(w.home, '.claude-dangling')))
        {
            assert.ok(!configDirsWithPlugin(w.home, dirs['']!).includes(path.join(w.home, '.claude-dangling')));
        }
        assert.deepStrictEqual(configDirsWithPlugin(w.home, dirs['']!).sort(), [dirs['-old']!, dirs['-personal']!].sort());
    }
    finally { w.clean(); }
});

test('read-guard with .claude-personal as the current dir reports ~/.claude as the other dir', () =>
{
    const w = world();
    try
    {
        const personal = path.join(w.home, '.claude-personal');
        const plain = path.join(w.home, '.claude');
        w.env.CLAUDE_CONFIG_DIR = personal;
        put(path.join(ptRoot(w), '.mcps-secrets'), '');
        put(path.join(personal, 'settings.json'), JSON.stringify({ permissions: { deny: [SECRETS_RULE] } }));
        installedIn(personal, installedKeys('alfred-tools@envoydev'));
        installedIn(plain, installedKeys('alfred-tools@envoydev'));
        const found = detectAll(ctxOf(w)).found.filter((f) => f.id === 'read-guard');
        assert.deepStrictEqual(found.map((f) => f.name), [path.join(plain, 'settings.json')]);
        assert.deepStrictEqual(configDirsWithPlugin(w.home, personal), [plain]);
    }
    finally { w.clean(); }
});

test('read-guard compares config dirs without case on win32 only, by the platform it is given', () =>
{
    const w = world();
    try
    {
        const dirs = otherDirsWorld(w);
        const shouted = path.join(w.home, '.CLAUDE-PERSONAL');
        assert.ok(!configDirsWithPlugin(w.home, shouted, 'win32').includes(dirs['-personal']!), 'win32 folds case');
        assert.ok(configDirsWithPlugin(w.home, dirs['']!, 'linux').includes(dirs['-personal']!));
    }
    finally { w.clean(); }
});

test('a finding that lacks a field its fix reads stops the fix with the field named, never writes undefined into the entry', () =>
{
    const finding: Finding = { id: 'uvx-python', row: 'serena', name: 'serena', scope: 'local', found: 'no --python', proposal: {} };
    const entry = { command: 'uvx', args: ['--from', 'serena-agent@2.1.0', 'serena', 'start-mcp-server'] };
    assert.throws(() => F.uvxPythonFix(entry, finding, {} as FixCtx), /uvx-python on serena: the proposal has no python/);
    assert.throws(() => C.fieldOf({ ...finding, scope: null }, 'scope'), /uvx-python on serena: the finding has no scope/);
});
