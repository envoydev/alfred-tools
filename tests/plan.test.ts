import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as catalogLib from '../scripts/catalog/catalog.ts';
import { plan } from '../scripts/plan/plan.ts';
import { serenaConfigInitStep } from '../scripts/plan/serena-init.ts';
import { renderPlan, argvOf, reconnectLine } from '../scripts/plan/render.ts';
import { makeCtx } from '../scripts/plan/context.ts';
import { fileSteps } from '../scripts/plan/root-files.ts';
import { scopeOfLabel, SCOPE_LABEL, PARENT_HELPER_IN_CHILD, keyNameQuestion, settingsQuestion, SCOPE_TEXT } from '../scripts/plan/asks-keys.ts';
import { pickQuestions, packed, alsoProvided } from '../scripts/plan/asks-picks.ts';
import { scopeQuestion, routeQuestion, changeQuestions, scopesFor } from '../scripts/plan/asks-tool.ts';
import { locationQuestion } from '../scripts/plan/asks-location.ts';
import { toolAsk, STATIC, toolQuestions, removeQuestions } from '../scripts/plan/asks-other.ts';
import * as asks from '../scripts/plan/asks-all.ts';
import * as inventoryLib from '../scripts/inventory/inventory.ts';
import { MARKER } from '../scripts/core/kept.ts';
import { world, writeJson, helperCmd } from './helpers.ts';
import { parseAskBlocks } from './ask-blocks.ts';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { ALFRED_ENTRIES, alfredNameProblem, formatRoot } from '../scripts/entries/locations.ts';
import * as roots from '../scripts/roots/roots.ts';
import * as rootsLib from '../scripts/roots/roots.ts';
import { FILES } from '../scripts/roots/roots.ts';
import { runPlanCommand } from '../scripts/plan/command.ts';
import { OTHER_RE } from './ask-texts.ts';
import { helperCommand, helperNameOf, helperArgv, buildEntry, currentOf, settingsOf, bridgeParts, renameTemplate } from '../scripts/entries/entry.ts';
import * as cli from '../scripts/core/claude-cli.ts';
import * as X from '../scripts/inventory/existing.ts';
import { apply } from '../scripts/apply/run.ts';
import * as keys from '../scripts/keys/keys.ts';
import * as account from '../scripts/core/account.ts';
import { readAccount } from '../scripts/core/account.ts';
import * as fix from '../scripts/fix/fix.ts';
import { BRIDGE_VERSION } from '../scripts/copied/mcp-bridge.js';
import type { Catalog, CatalogRow } from '../scripts/catalog/types.ts';
import type { MachineProbe } from '../scripts/fix/types.ts';
import type { ServerEntry, ServerMap } from '../scripts/core/types.ts';
import type { Root, Machine, Roots } from '../scripts/entries/types.ts';
import type { Approval, Inventory, InvRegistration } from '../scripts/inventory/types.ts';
import type { Answers, AskCtx, CursorWritePlanStep, EnsureKeyNameStep, FileStep, ListWriteStep, McpAddStep, McpMoveStep, McpReplaceStep, MoveRootFileStep, PathStep, PickAnswer, Plan, Asked, Picks, PlanOptions, PlanStep, Question, RecordRootStep, RetireShippedStep, ToolBlock } from '../scripts/plan/types.ts';

// the names the tests read off a map by a dotted read, named on its type
type EntryEnv = Record<string, string> & { ALLOW_REMOTE_APP_URLS?: string; ANDROID_HOME?: string; ANONYMIZED_TELEMETRY?: string; EXTRA_FLAG?: string; GITHUB_TOOLSETS?: string; JAVA_HOME?: string; MCP_EXTRA_DIR?: string; MCP_MEMORY_SQLITE_PATH?: string; MCP_REMOTE_CONFIG_DIR?: string; MEMORY_API_TOKEN?: string; MY_FLAG?: string; MY_TOOL?: string; MY_VAR?: string; NO_UI?: string; PAGE_SOURCES_DIR?: string; SCREENSHOTS_DIR?: string; SENTRY_ACCESS_TOKEN?: string; SERENA_LOG_LEVEL?: string; TOOL_DIR?: string };
type Grp = { id: string; label: string };
type ToolsKeyed = Record<string, ToolBlock> & { atlassian?: ToolBlock; context7?: ToolBlock; memory?: ToolBlock; serena?: ToolBlock };
type MapKeyed = ServerMap & { context7?: ServerEntry; github?: ServerEntry };
const catalog = catalogLib.load();
const clone = (): Catalog => JSON.parse(JSON.stringify({ ...catalog, reserved: [...catalog.reserved], byId: undefined }));
// a catalog where the named rows are proven (or not) to resolve a relative data folder against the folder they start in
// (tests/probes/relative-root.ts measures that per row; the shipped flags come from it, and tests/catalog.test.ts pins
// them) - so a test of the rule names its flag rather than lean on the shipped one
function relativeAs(value: boolean, ids: string[])
{
    const raw = clone();
    for (const t of raw.tools) if (ids.includes(t.id)) t.locations!.relative = value;
    return { ...raw, reserved: new Set(raw.reserved), byId: new Map(raw.tools.map((r) => [r.id, r])) };
}
const withRelative = (...ids: string[]) => relativeAs(true, ids);
const withoutRelative = (...ids: string[]) => relativeAs(false, ids);
const flag = (e: ServerEntry, f: string) => e.args![e.args!.indexOf(f) + 1];

const MAC = { os: 'darwin', arch: 'arm64', project: '/work/shop' };
const LINUX = { os: 'linux', arch: 'x64', project: '/work/shop' };
const WIN = { os: 'win32', arch: 'x64', project: 'C:\\work\\shop' };
const WINARM = { os: 'win32', arch: 'arm64', project: 'C:\\work\\shop' };
// a test of a darwin plan whose fixture paths (/work/shop, /Users/me) or real folders meet node's own path module: on a
// Windows host that module is win32 and the two never agree - the plan runs with one platform's paths on a real machine,
// and the matrix runs these flows on Windows
const POSIX_FIXTURE = process.platform === 'win32' && 'NOT RUN: a darwin fixture meets node\'s win32 path module on this host (the matrix covers Windows)';
const inv = (base: { os: string; arch: string; project: string }, extra: Record<string, unknown> = {}) => ({ version: 1, ...base, cli: { ok: true }, unreadable: [], registrations: [], plugins: [], marketplaces: [], alfredCodeEnabled: false, sources: {}, ...extra }) as unknown as Inventory;
const opts = (home: string, extra: PlanOptions = {}) => ({ home, env: {}, exists: () => false, machine: { docker: true }, ...extra });
const pickOne = (id: string, pick: PickAnswer = {}): Answers => ({ picks: { [id]: pick } });
// the steps that change a registration, without the root's file steps and the records (spec D8)
const FILE_OPS = ['root-ignore', 'write-helper', 'write-bridge', 'serena-config-init', 'ensure-key-name', 'deny-read', 'list-write', 'record-root'];
const regSteps = (p: Plan) => p.steps.filter((s) => !FILE_OPS.includes(s.op));
const addStep = (p: Plan, i = 0) => (p.steps.filter((s) => s.op === 'mcp-add') as McpAddStep[])[i] as McpAddStep;
const reg = (name: string, scope: string, entry: ServerEntry, rowId: string | null = null, route: string | null = null, flags: Partial<InvRegistration> = {}): InvRegistration => ({ name, scope, entry, rowId, route, own: !rowId, alfredRetired: false, ...flags });
const changeOf = (r: { name: string; scope: string }, answers: PickAnswer = {}): Answers => ({ change: { [`mcp:${r.name}~${r.scope}`]: answers } });

test('serena, fresh, per OS: python request, cut-off, telemetry off, home by the OS\'s rules', () => {
    const mac = plan(inv(MAC), pickOne('serena'), opts('/Users/me'));
    assert.deepStrictEqual(mac.errors, []);
    const s = addStep(mac);
    assert.strictEqual(s.scope, 'local');
    assert.deepStrictEqual(s.entry.args!.slice(0, 6), ['--python', '3.13', '--exclude-newer', '2026-10-20T23:59:59Z', '--from', 'serena-agent@2.1.0']);
    assert.strictEqual(s.entry.env!.SERENA_USAGE_REPORTING, 'false');
    assert.strictEqual(s.entry.env!.SERENA_HOME, '/work/shop/.alfred-tools/serena');
    assert.strictEqual(plan(inv(LINUX), pickOne('serena'), opts('/home/me')).steps.find((x) => x.op === 'mcp-add')!.entry.args![1], '3.13');
});

test('serena install inits its config before the registration', () => {
    const p = plan(inv(MAC), pickOne('serena'), opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    const ops = p.steps.map((s) => s.op);
    const init = p.steps.find((s) => s.op === 'serena-config-init');
    assert.ok(init && init.op === 'serena-config-init');
    assert.strictEqual(init.file, '/work/shop/.alfred-tools/serena/serena_config.yml');
    assert.strictEqual(init.home, '/work/shop/.alfred-tools/serena');
    assert.ok(ops.indexOf('serena-config-init') < ops.indexOf('mcp-add'), ops.join());
    assert.ok(renderPlan(p).includes('writes /work/shop/.alfred-tools/serena/serena_config.yml'), renderPlan(p));
    assert.ok(p.notes.some((n) => n.includes('project_serena_folder_location') && n.includes('/work/shop/.alfred-tools/serena/projects')), p.notes.join('\n'));
    // a config already there is left to serena and the fix row
    const there = plan(inv(MAC), pickOne('serena'), opts('/Users/me', { exists: (f) => f.endsWith('serena_config.yml') }));
    assert.ok(!there.steps.some((s) => s.op === 'serena-config-init'));
    // an alfred-code 2.x home and an entry with no home get no step
    const alfred = { command: 'uvx', args: [], env: { SERENA_HOME: '/work/shop/.alfred/serena/home' } };
    assert.strictEqual(serenaConfigInitStep(alfred, { platform: 'darwin', exists: () => false }), null);
    assert.strictEqual(serenaConfigInitStep({ command: 'uvx', args: [] }, { platform: 'darwin', exists: () => false }), null);
    // a home holding a $ gets a note and no step
    const dollar = plan(inv(MAC), pickOne('serena', { location: { side: 'path', path: '/work/$shop/serena' } }), opts('/Users/me'));
    assert.deepStrictEqual(dollar.errors, []);
    assert.ok(!dollar.steps.some((s) => s.op === 'serena-config-init'));
    assert.ok(dollar.notes.some((n) => n.includes('holds a $')), dollar.notes.join('\n'));
});

test('serena on Windows: SERENA_HOME is absolute, in backslashes and space-free; x64 uses 3.13, ARM64 the x64 build', () => {
    const x64 = plan(inv(WIN), pickOne('serena'), opts('C:\\Users\\me'));
    assert.deepStrictEqual(x64.errors, []);
    const e = addStep(x64).entry;
    assert.strictEqual(e.env!.SERENA_HOME, 'C:\\work\\shop\\.alfred-tools\\serena', 'a space-free root: <root>\\<name>');
    assert.match(e.env!.SERENA_HOME, /^[A-Za-z]:\\[^/\s]*$/);
    assert.strictEqual(e.args![1], '3.13');
    const arm = addStep(plan(inv(WINARM), pickOne('serena'), opts('C:\\Users\\me'))).entry;
    assert.strictEqual(arm.args![1], 'cpython-3.13-windows-x86_64-none');
    // an x64 node emulated on ARM is still ARM
    const emu = plan(inv({ ...WIN }), pickOne('serena'), opts('C:\\Users\\me', { env: { PROCESSOR_IDENTIFIER: 'ARMv8 (64-bit) Family 8 Model 1' } }));
    assert.strictEqual(addStep(emu).entry.args![1], 'cpython-3.13-windows-x86_64-none');
});

test('serena on Windows: a root and a profile path with a space take the space-free folder by default; a typed one must be absolute and space-free', () => {
    const spaced = plan(inv(WIN), pickOne('serena', { scope: 'user' }), opts('C:\\Users\\Jo Doe'));
    assert.deepStrictEqual(spaced.errors, []);
    assert.strictEqual(addStep(spaced).entry.env!.SERENA_HOME, 'C:\\serena-home');
    const typed = plan(inv(WIN), pickOne('serena', { location: { side: 'path', path: 'C:/serena-home' } }), opts('C:\\Users\\Jo Doe'));
    assert.deepStrictEqual(typed.errors, []);
    assert.strictEqual(addStep(typed).entry.env!.SERENA_HOME, 'C:\\serena-home');
    const bad = plan(inv(WIN), pickOne('serena', { location: { side: 'path', path: 'C:\\my serena' } }), opts('C:\\Users\\me'));
    assert.match(bad.errors.join(' '), /absolute, in backslashes and space-free/);
    // a relative or ~ spelling is written out absolute, in backslashes
    for (const [typedPath, want] of [['relative\\serena', 'C:\\work\\shop\\relative\\serena'], ['~/serena', 'C:\\Users\\me\\serena']])
        assert.strictEqual(addStep(plan(inv(WIN), pickOne('serena', { location: { side: 'path', path: typedPath } }), opts('C:\\Users\\me'))).entry.env!.SERENA_HOME, want);
    // a project folder with a space cannot hold the home: the typed path is refused, not silently moved
    const spacedProject = plan(inv({ ...WIN, project: 'C:\\my work\\shop' }), pickOne('serena', { location: { side: 'path', path: 'sub' } }), opts('C:\\Users\\me'));
    assert.match(spacedProject.errors.join(' '), /space-free/);
    // the Windows rule wins over alfred-code data already on disk
    const alfred = plan(inv(WIN), pickOne('serena'), opts('C:\\Users\\me', { exists: (p) => p === 'C:\\work\\shop\\.alfred\\serena\\home' }));
    assert.strictEqual(addStep(alfred).entry.env!.SERENA_HOME, 'C:\\work\\shop\\.alfred-tools\\serena');
});

test('uvx rows get their own python: windows-control 3.14 (x64 build on ARM64), memory 3.13', () => {
    const w = addStep(plan(inv(WIN), pickOne('windows-control'), opts('C:\\Users\\me'))).entry;
    assert.deepStrictEqual(w.args!.slice(0, 4), ['--python', '3.14', '--exclude-newer', '2026-10-20T23:59:59Z']);
    assert.deepStrictEqual(w.args!.slice(-3), ['serve', '--exclude-tools', 'PowerShell,Registry,Process,FileSystem']);
    assert.strictEqual((w.env as EntryEnv).ANONYMIZED_TELEMETRY, 'false');
    const arm = addStep(plan(inv(WINARM), pickOne('windows-control'), opts('C:\\Users\\me'))).entry;
    assert.strictEqual(arm.args![1], 'cpython-3.14-windows-x86_64-none');
    const mem = addStep(plan(inv(MAC), pickOne('memory'), opts('/Users/me'))).entry;
    assert.ok(mem.args!.includes('mcp-memory-service[sqlite]==12.5.0'));
    assert.ok(!mem.args!.includes('--with'), 'numpy is a core dependency of the pin');
    assert.strictEqual((mem.env as EntryEnv).MCP_MEMORY_SQLITE_PATH, '/work/shop/.alfred-tools/memory/memory.db');
});

test('desktop control is offered only on its own OS', () => {
    assert.match(plan(inv(MAC), pickOne('windows-control'), opts('/Users/me')).errors[0]!, /not offered on darwin/);
    assert.match(plan(inv(WIN), pickOne('macos-control'), opts('C:\\Users\\me')).errors[0]!, /not offered on win32/);
    assert.match(plan(inv(LINUX), pickOne('macos-control'), opts('/home/me')).errors[0]!, /not offered on linux/);
    assert.deepStrictEqual(plan(inv(MAC), pickOne('macos-control'), opts('/Users/me')).errors, []);
});

test('npx rows: pinned, with the cut-off in npm_config_before; native Windows gets the cmd /c precaution', () => {
    const mac = addStep(plan(inv(MAC), pickOne('playwright-chrome'), opts('/Users/me'))).entry;
    assert.strictEqual(mac.command, 'npx');
    assert.deepStrictEqual(mac.args!.slice(0, 4), ['-y', '@playwright/mcp@0.0.84', '--browser', 'chrome']);
    assert.ok(mac.args!.includes('--no-webmcp'));
    assert.strictEqual(mac.env!.npm_config_before, '2026-11-10T23:59:59Z');
    const win = addStep(plan(inv(WIN), pickOne('playwright-chrome'), opts('C:\\Users\\me'))).entry;
    assert.strictEqual(win.command, 'cmd');
    assert.deepStrictEqual(win.args!.slice(0, 3), ['/c', 'npx', '-y']);
    assert.strictEqual(win.env!.npm_config_before, '2026-11-10T23:59:59Z');
    const ap = addStep(plan(inv(MAC), pickOne('appium'), opts('/Users/me'))).entry;
    assert.deepStrictEqual(ap.args, ['-y', 'appium-mcp@1.99.3']);
    assert.strictEqual((ap.env as EntryEnv).SCREENSHOTS_DIR, '/work/shop/.alfred-tools/appium-mcp/screenshots');
    assert.strictEqual((ap.env as EntryEnv).PAGE_SOURCES_DIR, '/work/shop/.alfred-tools/appium-mcp/page-sources');
    assert.strictEqual((ap.env as EntryEnv).ALLOW_REMOTE_APP_URLS, 'false');
});

test('routes: context7, github and sentry each build both ways; the others have one', () => {
    const c7r = addStep(plan(inv(MAC), pickOne('context7', { route: 'remote', token: false }), opts('/h'))).entry;
    assert.deepStrictEqual(c7r, { type: 'http', url: 'https://mcp.context7.com/mcp' });
    // no key answer: the key is sent, from the global root (spec F2)
    const c7k = addStep(plan(inv(MAC), pickOne('context7', { route: 'remote' }), opts('/h'))).entry;
    assert.deepStrictEqual(c7k, { type: 'http', url: 'https://mcp.context7.com/mcp', headersHelper: 'node /h/.alfred-tools/mcp-headers.js CONTEXT7_API_KEY Bearer' });
    // a stdio key whose name is filled nowhere: no key argument, never an empty one (spec F2)
    const c7l = addStep(plan(inv(MAC), pickOne('context7', { route: 'local', token: true }), opts('/h'))).entry;
    assert.deepStrictEqual(c7l.args, ['-y', '@upstash/context7-mcp@4.5.0']);
    const gh = addStep(plan(inv(MAC), pickOne('github', { route: 'local' }), opts('/h'))).entry;
    assert.deepStrictEqual(gh.args, ['run', '-i', '--rm', '-e', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'ghcr.io/github/github-mcp-server:v2.1.0', 'stdio']);
    assert.deepStrictEqual(gh.env, { GITHUB_PERSONAL_ACCESS_TOKEN: '${GITHUB_PERSONAL_ACCESS_TOKEN}' });
    const ghb = addStep(plan(inv(MAC), pickOne('github', { route: 'local' }), opts('/h', { machine: { docker: false } }))).entry;
    assert.deepStrictEqual([ghb.command, ghb.args], ['github-mcp-server', ['stdio']]);
    const ghr = addStep(plan(inv(MAC), pickOne('github', { route: 'remote' }), opts('/h'))).entry;
    assert.deepStrictEqual(ghr, { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headersHelper: 'node /h/.alfred-tools/mcp-headers.js GITHUB_PERSONAL_ACCESS_TOKEN Bearer' });
    const sr = addStep(plan(inv(MAC), pickOne('sentry', { route: 'remote' }), opts('/h'))).entry;
    assert.deepStrictEqual(sr, { type: 'http', url: 'https://mcp.sentry.dev/mcp', headersHelper: 'node /h/.alfred-tools/mcp-headers.js SENTRY_ACCESS_TOKEN Sentry-Bearer' });
    assert.deepStrictEqual(addStep(plan(inv(MAC), pickOne('sentry', { route: 'remote', token: false }), opts('/h'))).entry, { type: 'http', url: 'https://mcp.sentry.dev/mcp' });
    const sl = addStep(plan(inv(MAC), pickOne('sentry', { route: 'local' }), opts('/h'))).entry;
    assert.strictEqual((sl.env as EntryEnv).SENTRY_ACCESS_TOKEN, '${SENTRY_ACCESS_TOKEN}');
    assert.match(plan(inv(MAC), pickOne('gitlab', { route: 'local' }), opts('/h')).errors[0]!, /no local route/);
    assert.match(plan(inv(MAC), pickOne('atlassian', { route: 'local' }), opts('/h')).errors[0]!, /no local route/);
    assert.strictEqual(addStep(plan(inv(MAC), pickOne('gitlab', { params: { host: 'git.corp.example' } }), opts('/h'))).entry.url, 'https://git.corp.example/api/v4/mcp');
    assert.strictEqual(addStep(plan(inv(MAC), pickOne('gitlab'), opts('/h'))).entry.url, 'https://gitlab.com/api/v4/mcp');
    assert.strictEqual(addStep(plan(inv(MAC), pickOne('atlassian'), opts('/h'))).entry.url, 'https://mcp.atlassian.com/v2/mcp');
});

test('a keyed route\'s plan line names the files its reader takes and whether the name is filled; no key value is ever in the plan', () => {
    const fake = ['gh', 'p_', 'FAKE0123456789abcdefFAKE0123456789'].join('');
    // the shell's variable plays no part (spec D5): the helper reads .mcps-secrets, so a value set here moves no scope
    const p = plan(inv(MAC), pickOne('github', { route: 'remote' }), opts('/h', { env: { GITHUB_PERSONAL_ACCESS_TOKEN: fake } }));
    assert.strictEqual(addStep(p).scope, 'user');
    const files = [path.join('/h', '.alfred-tools', '.mcps-secrets'), path.join('/h', '.alfred', '.mcps-secrets')];
    assert.deepStrictEqual(p.keys, [{ row: 'github', name: 'github', scope: 'user', variable: 'GITHUB_PERSONAL_ACCESS_TOKEN', kind: 'helper', files, filled: false, old: null }]);
    assert.ok(!JSON.stringify(p).includes(fake));
    assert.ok(!renderPlan(p).includes(fake));
    assert.ok(renderPlan(p).includes(`Not filled yet: add GITHUB_PERSONAL_ACCESS_TOKEN=<your key> to ${files[0]} - until then the server connects without its key.`), renderPlan(p));
});

const G = 'GITHUB_PERSONAL_ACCESS_TOKEN';
// a key file of the test world's, written by name: the value is a fake that the assertions check never leaks
const ALFRED_STORE = ['.alfred', ['.', 'secrets'].join('')];
function putKeys(dir: string, parts: string[], lines: string[])
{
    const file = path.join(dir, ...parts);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${lines.join('\n')}\n`);
    return file;
}

test('the key line names an old file holding the name, never a near name\'s file or any value', () => {
    const w = world();
    try
    {
        const fakeValue = `v-${Date.now()}-not-printed`;
        const store = putKeys(w.project, ALFRED_STORE, [`ACME_GITHUB_ACCESS_TOKEN=${fakeValue}`]);
        const at = () => plan(inv({ ...MAC, os: process.platform, project: w.project }, { alfredCodeEnabled: true }), pickOne('github', { route: 'remote', scope: 'project' }), { home: w.home, env: {} });
        const missing = at();
        const file = path.join(missing.roots!.project!, '.mcps-secrets');
        assert.deepStrictEqual([missing.keys[0]!.filled, missing.keys[0]!.old], [false, null], 'a near name is the name question\'s to offer, not an old file to move');
        assert.ok(renderPlan(missing).includes(`Not filled yet: add ${G}=<your key> to ${file}`), renderPlan(missing));
        putKeys(w.project, ALFRED_STORE, [`${G}=${fakeValue}`]);
        const found = at();
        assert.strictEqual(found.keys[0]!.old, store);
        assert.ok(renderPlan(found).includes(`${G} is in ${store}, which alfred-tools no longer reads: move it to ${file}`), renderPlan(found));
        for (const p of [missing, found]) assert.ok(!renderPlan(p).includes(fakeValue) && !JSON.stringify(p).includes(fakeValue));
    }
    finally { w.clean(); }
});

test('the key line names the chain its reader takes; a workspace child finds an old key in a parent\'s alfred-code store by name only', () => {
    const w = world();
    try
    {
        const P = (...a: string[]) => path.join(...a);
        const child = P(w.project, 'api');
        fs.mkdirSync(child, { recursive: true });
        const parentStore = putKeys(w.project, ALFRED_STORE, [`${G}=v-not-printed`]);
        const local = plan(inv({ ...MAC, os: process.platform, project: child }, { alfredCodeEnabled: true }), pickOne('github', { route: 'remote', scope: 'local' }), { home: w.home, env: {} });
        const k = local.keys[0];
        assert.deepStrictEqual(k!.files, [P(child, '.alfred-tools', '.mcps-secrets'), P(w.home, '.alfred-tools', '.mcps-secrets'), P(w.home, '.alfred', '.mcps-secrets')]);
        assert.deepStrictEqual([k!.filled, k!.old], [false, parentStore]);
        assert.ok(renderPlan(local).includes(`from ${k!.files.join(', then ')}`), renderPlan(local));
        assert.ok(!renderPlan(local).includes('v-not-printed'));
    }
    finally { w.clean(); }
});

test('at local and global scope the key line names the files its reader takes, in order, and never a value', () => {
    const P = (...a: string[]) => path.join(...a);
    const local = plan(inv(MAC), pickOne('github', { route: 'remote', scope: 'local' }), opts('/h'));
    assert.deepStrictEqual(local.keys[0]!.files, [P('/work/shop', '.alfred-tools', '.mcps-secrets'), P('/h', '.alfred-tools', '.mcps-secrets'), P('/h', '.alfred', '.mcps-secrets')]);
    assert.ok(renderPlan(local).includes(`Key: github (local scope) - ${G}; mcp-headers.js reads it each time Claude Code connects, from ${local.keys[0]!.files.join(', then ')}. The key is never printed.`), renderPlan(local));
    assert.ok(!local.steps.some((s) => (s.op as string) === 'ensure-ignore'), 'the root\'s own .gitignore keeps .mcps-secrets out of git');
    assert.strictEqual(addStep(local).route, 'remote', 'the route id, never the route object');
    assert.ok(!JSON.stringify(local.steps).includes('"auth"'));
    const user = plan(inv(MAC), pickOne('github', { route: 'remote', scope: 'user' }), opts('/h'));
    assert.deepStrictEqual(user.keys[0]!.files, [P('/h', '.alfred-tools', '.mcps-secrets'), P('/h', '.alfred', '.mcps-secrets')]);
    // a stdio route: the apply writes the key in from the stdio chain - the project root's file, then the global root's
    const docker = plan(inv(MAC), pickOne('github', { route: 'local', scope: 'local' }), opts('/h'));
    assert.deepStrictEqual([docker.keys[0]!.kind, docker.keys[0]!.files], ['stdio', [P('/work/shop', '.alfred-tools', '.mcps-secrets'), P('/h', '.alfred-tools', '.mcps-secrets')]]);
    assert.match(renderPlan(docker), /the apply writes it into the registration, from /);
});

test('scopes: every scope writes absolute paths with ~ expanded; project scope too, proven relative or not', () => {
    const user = addStep(plan(inv(MAC), pickOne('memory', { scope: 'user' }), opts('/Users/me'))).entry;
    assert.strictEqual((user.env as EntryEnv).MCP_MEMORY_SQLITE_PATH, '/Users/me/.alfred-tools/memory/memory.db');
    assert.ok(!(user.env as EntryEnv).MCP_MEMORY_SQLITE_PATH!.includes('~'));
    const typed = addStep(plan(inv(MAC), pickOne('playwright-chrome', { scope: 'local', location: { side: 'path', path: '~/pw/chrome' } }), opts('/Users/me'))).entry;
    assert.strictEqual(typed.args![typed.args!.indexOf('--user-data-dir') + 1], '/Users/me/pw/chrome');
    assert.strictEqual(typed.args![typed.args!.indexOf('--output-dir') + 1], '/Users/me/pw/chrome/output');
    const rel = addStep(plan(inv(MAC), pickOne('playwright-chrome', { location: { side: 'path', path: 'tools/pw' } }), opts('/Users/me'))).entry;
    assert.strictEqual(rel.args![rel.args!.indexOf('--user-data-dir') + 1], '/work/shop/tools/pw');
    const p = plan(inv(MAC), pickOne('serena', { scope: 'project' }), opts('/Users/me', { catalog: withoutRelative('serena') }));
    assert.deepStrictEqual(p.errors, []);
    assert.strictEqual(addStep(p).entry.env!.SERENA_HOME, '/work/shop/.alfred-tools/serena');
    assert.strictEqual(addStep(plan(inv(MAC), pickOne('serena', { scope: 'project' }), opts('/Users/me'))).entry.env!.SERENA_HOME, '/work/shop/.alfred-tools/serena');
});

test('every MCP route offers user, project and local: recommended first, then user, project, local', () => {
    const scopes = (id: string, route: string, base = MAC, home = '/Users/me') => scopeQuestion(catalog.byId.get(id)!, inv(base), { route, context: { project: base.project, platform: base.os, home, env: {}, exists: () => false } })!.options.map((o) => scopeOfLabel(o.label));
    assert.deepStrictEqual(scopes('serena', 'local'), ['local', 'user', 'project']);
    assert.deepStrictEqual(scopes('context7', 'remote'), ['user', 'project', 'local']);
    assert.deepStrictEqual(scopes('context7', 'local'), ['local', 'user', 'project']);
    assert.deepStrictEqual(scopes('serena', 'local', WIN, 'C:\\Users\\me'), ['local', 'user', 'project']);
    assert.deepStrictEqual(scopes('serena', 'local', WIN, 'C:\\Users\\Jo Doe'), ['local', 'user', 'project'], 'Project on Windows whatever the profile path');
});

test('project scope for a local route: the project root, absolute, whether the row is proven relative or not', () => {
    for (const cat of [withoutRelative('playwright-chrome'), withRelative('playwright-chrome')])
    {
        const plain = plan(inv(MAC), pickOne('playwright-chrome', { scope: 'project' }), opts('/Users/me', { catalog: cat }));
        assert.deepStrictEqual(plain.errors, []);
        assert.strictEqual(flag(addStep(plain).entry, '--user-data-dir'), '/work/shop/.alfred-tools/playwright-chrome');
        const typed = plan(inv(MAC), pickOne('playwright-chrome', { scope: 'project', location: { side: 'project' } }), opts('/Users/me', { catalog: cat }));
        assert.deepStrictEqual(typed.errors, []);
    }
});

test('project scope takes an absolute folder of the user\'s and the global root\'s folder, written absolute', () => {
    const abs = plan(inv(MAC), pickOne('playwright-chrome', { scope: 'project', location: { side: 'path', path: '/abs/pw' } }), opts('/Users/me'));
    assert.deepStrictEqual(abs.errors, []);
    assert.strictEqual(flag(addStep(abs).entry, '--user-data-dir'), '/abs/pw');
    const home = addStep(plan(inv(MAC), pickOne('playwright-chrome', { scope: 'project', location: { side: 'account' } }), opts('/Users/me'))).entry;
    assert.strictEqual(flag(home, '--user-data-dir'), '/Users/me/.alfred-tools/playwright-chrome');
    const memWin = addStep(plan(inv(WIN), pickOne('memory', { scope: 'project' }), opts('C:\\Users\\me'))).entry;
    assert.strictEqual((memWin.env as EntryEnv).MCP_MEMORY_SQLITE_PATH, 'C:\\work\\shop\\.alfred-tools\\memory\\memory.db');
    for (const e of [home, memWin]) assert.ok(!JSON.stringify(e).includes('${'), JSON.stringify(e));
});

test('hosted routes may sit at project scope; a stdio route that needs a key may not', () => {
    for (const id of ['context7', 'github', 'gitlab', 'atlassian', 'sentry'])
    {
        const p = plan(inv(MAC), pickOne(id, { route: 'remote', scope: 'project' }), opts('/h'));
        assert.deepStrictEqual(p.errors, [], id);
        assert.strictEqual(addStep(p).scope, 'project');
    }
    for (const id of ['github', 'sentry'])
    {
        const p = plan(inv(MAC), pickOne(id, { route: 'local', scope: 'project' }), opts('/h'));
        assert.match(p.errors.join(), /not offered at project scope - the committed \.mcp\.json carries no key/, id);
        assert.deepStrictEqual(p.steps, [], id);
    }
    const c7 = plan(inv(MAC), pickOne('context7', { route: 'local', scope: 'project' }), opts('/h'));
    assert.deepStrictEqual(c7.errors, []);
    assert.ok(!JSON.stringify(addStep(c7).entry).includes('${'), 'keyless: the committed entry holds no reference');
});

test('locations: the plugin\'s own folder by default, even with alfred-code data on disk; memory too', () => {
    const has = (p: string) => p === '/work/shop/.alfred/chrome-control' || p === '/Users/me/.alfred-memory' || p === '/work/shop/.alfred/serena/home';
    const o = opts('/Users/me', { exists: has });
    const chrome = addStep(plan(inv(MAC), pickOne('playwright-chrome'), o)).entry;
    assert.strictEqual(chrome.args![chrome.args!.indexOf('--user-data-dir') + 1], '/work/shop/.alfred-tools/playwright-chrome');
    const mem = addStep(plan(inv(MAC), pickOne('memory'), o)).entry;
    assert.strictEqual((mem.env as EntryEnv).MCP_MEMORY_SQLITE_PATH, '/work/shop/.alfred-tools/memory/memory.db');
    const serena = addStep(plan(inv(MAC), pickOne('serena'), o)).entry;
    assert.strictEqual(serena.env!.SERENA_HOME, '/work/shop/.alfred-tools/serena');
    // alfred-code's folder only on the user's pick, and only when it is on disk
    const reuse = addStep(plan(inv(MAC), pickOne('playwright-chrome', { location: { side: 'alfred' } }), o)).entry;
    assert.strictEqual(reuse.args![reuse.args!.indexOf('--user-data-dir') + 1], '/work/shop/.alfred/chrome-control');
    const reuseMem = addStep(plan(inv(MAC), pickOne('memory', { location: { side: 'alfred' } }), o)).entry;
    assert.strictEqual((reuseMem.env as EntryEnv).MCP_MEMORY_SQLITE_PATH, '/Users/me/.alfred-memory/memory.db');
    assert.match(plan(inv(MAC), pickOne('playwright-firefox', { location: { side: 'alfred' } }), o).errors[0]!, /no alfred-code data folder/);
    const firefox = addStep(plan(inv(MAC), pickOne('playwright-firefox'), o)).entry;
    assert.strictEqual(firefox.args![firefox.args!.indexOf('--user-data-dir') + 1], '/work/shop/.alfred-tools/playwright-firefox');
    // the other place is always offered
    const acct = addStep(plan(inv(MAC), pickOne('playwright-firefox', { location: { side: 'account' } }), o)).entry;
    assert.strictEqual(acct.args![acct.args!.indexOf('--user-data-dir') + 1], '/Users/me/.alfred-tools/playwright-firefox');
    const proj = addStep(plan(inv(MAC), pickOne('memory', { location: { side: 'project' } }), o)).entry;
    assert.strictEqual((proj.env as EntryEnv).MCP_MEMORY_SQLITE_PATH, '/work/shop/.alfred-tools/memory/memory.db');
});

test('a data folder the plugin creates gets a .gitignore step; one that exists does not', () => {
    const p = plan(inv(MAC), pickOne('playwright-chrome'), opts('/Users/me'));
    assert.deepStrictEqual(p.steps.map((s) => s.op), ['root-ignore', 'ensure-dir', 'mcp-add', 'fetch', 'list-write', 'record-root']);
    assert.strictEqual((p.steps[1] as PathStep).path, '/work/shop/.alfred-tools/playwright-chrome');
    assert.match(renderPlan(p), /\.gitignore {2}\(contents: \*\)/);
    // alfred-code's folder, picked, is the user's data as it is: no step creates or marks it
    const old = plan(inv(MAC), pickOne('playwright-chrome', { location: { side: 'alfred' } }), opts('/Users/me', { exists: () => true }));
    assert.deepStrictEqual(regSteps(old).map((s) => s.op), ['mcp-add', 'fetch']);
    assert.ok(!old.steps.some((s) => ['root-ignore', 'ensure-dir'].includes(s.op)), JSON.stringify(old.steps.map((s) => s.op)));
});

test('four Playwright engines in one project: four entries, four distinct user data dirs and names', () => {
    const p = plan(inv(MAC), { picks: { 'playwright-chrome': {}, 'playwright-msedge': {}, 'playwright-firefox': {}, 'playwright-webkit': {} } }, opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    const adds = (p.steps.filter((s) => s.op === 'mcp-add') as McpAddStep[]);
    assert.strictEqual(adds.length, 4);
    assert.strictEqual(new Set(adds.map((a) => a.name)).size, 4);
    const dirs = adds.map((a) => a.entry.args![a.entry.args!.indexOf('--user-data-dir') + 1]);
    assert.strictEqual(new Set(dirs).size, 4);
    assert.deepStrictEqual(adds.map((a) => a.entry.args![a.entry.args!.indexOf('--browser') + 1]), ['chrome', 'msedge', 'firefox', 'webkit']);
});

test('a browser binary the user names sets --executable-path, and only then', () => {
    const none = addStep(plan(inv(MAC), pickOne('playwright-chrome'), opts('/h'))).entry;
    assert.ok(!none.args!.includes('--executable-path'));
    const named = addStep(plan(inv(MAC), pickOne('playwright-chrome', { executablePath: '/Apps/Chromium' }), opts('/h'))).entry;
    assert.strictEqual(named.args![named.args!.indexOf('--executable-path') + 1], '/Apps/Chromium');
});

test('names: the 64-character limit, characters, the reserved set, a collision, and the per-project spelling', () => {
    const ok64 = 'a'.repeat(64);
    assert.deepStrictEqual(plan(inv(MAC), pickOne('serena', { name: ok64 }), opts('/h')).errors, []);
    assert.match(plan(inv(MAC), pickOne('serena', { name: 'a'.repeat(65) }), opts('/h')).errors[0]!, /must match/);
    assert.match(plan(inv(MAC), pickOne('serena', { name: 'has space' }), opts('/h')).errors[0]!, /must match/);
    assert.match(plan(inv(MAC), pickOne('serena', { name: '' }), opts('/h')).errors[0]!, /must match/);
    for (const reserved of ['alfred-navigation', 'chrome-control', 'browser', 'windows-control'])
        assert.match(plan(inv(MAC), pickOne('serena', { name: reserved }), opts('/h')).errors[0]!, /alfred-code once registered/, reserved);
    assert.deepStrictEqual(plan(inv(MAC), pickOne('serena', { name: 'memory-x' }), opts('/h')).errors, []);
    const coll = plan(inv(MAC, { registrations: [reg('serena', 'local', { command: 'node' })] }), pickOne('serena'), opts('/h'));
    assert.match(coll.errors[0]!, /already belongs to another registration at local scope/);
    assert.strictEqual(coll.steps.length, 0, 'asked, never overwritten');
    // the same name at ANOTHER scope is a note, not a collision
    const other = plan(inv(MAC, { registrations: [reg('serena', 'user', { command: 'node' })] }), pickOne('serena'), opts('/h'));
    assert.deepStrictEqual(other.errors, []);
    assert.match(other.notes.join(' '), /also exists at user scope/);
    const pre = addStep(plan(inv(MAC), pickOne('serena', { name: 'prefixed' }), opts('/h')));
    assert.strictEqual(pre.name, 'shop-serena');
    for (const row of catalog.tools.filter((r) => r.kind === 'mcp')) assert.ok(!catalog.reserved.has(row.name));
});

test('an unreadable scope gets nothing written', () => {
    const p = plan(inv(MAC, { unreadable: [{ scope: 'project', file: '/work/shop/.mcp.json', state: 'malformed' }] }), pickOne('context7', { route: 'remote', scope: 'project' }), opts('/h'));
    assert.match(p.errors[0]!, /project scope is unreadable/);
    assert.strictEqual(p.steps.length, 0);
    const acct = plan(inv(MAC, { unreadable: [{ scope: 'local', file: '/h/.claude.json', state: 'malformed' }, { scope: 'user', file: '/h/.claude.json', state: 'malformed' }] }), pickOne('serena'), opts('/h'));
    assert.match(acct.errors[0]!, /unreadable/);
});

// ---- starting from what is installed ----------------------------------------------------------------------------------

function installed(row: string, answers: PickAnswer = {}, base = MAC, home = '/Users/me', extra: PlanOptions = {})
{
    const first = plan(inv(base), pickOne(row, answers), opts(home, extra));
    assert.deepStrictEqual(first.errors, []);
    const s = (first.steps.find((x) => x.op === 'mcp-add') as McpAddStep);
    return reg(s.name, s.scope, s.entry, row, answers.route || catalog.byId.get(row)!.recommendedRoute);
}

test('a re-run with the same answers plans nothing', () => {
    for (const [id, answers] of [['serena', {}], ['memory', {}], ['playwright-chrome', { scope: 'user' }], ['context7', { route: 'remote', token: true }], ['gitlab', { params: { host: 'git.corp.example' } }], ['appium', {}], ['github', { route: 'local' }]] as [string, PickAnswer][])
    {
        const r = installed(id, answers);
        const again = plan(inv(MAC, { registrations: [r] }), pickOne(id, answers), opts('/Users/me'));
        assert.deepStrictEqual(again.errors, [], id);
        assert.strictEqual(again.steps.length, 0, `${id}: ${renderPlan(again)}`);
        assert.strictEqual(again.noop, true);
        assert.match(renderPlan(again), /Nothing to do/);
    }
});

test('a rename starts from the registration as read: an updated pin and a user-added arg survive', () => {
    const r = installed('serena');
    r.entry.args = r.entry.args!.map((a) => a.replace('serena-agent@2.1.0', 'serena-agent@2.4.0')).concat(['--user-added', 'yes']);
    (r.entry.env as EntryEnv).MY_VAR = 'kept';
    const p = plan(inv(MAC, { registrations: [r] }), changeOf(r, { name: 'shop-serena' }), opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    assert.deepStrictEqual(p.steps.map((s) => s.op), ['root-ignore', 'write-serena-context', 'serena-config-init', 'mcp-move', 'list-write', 'record-root'], 'its data folder and its context file sit in the project root');
    const s = (p.steps.find((x) => x.op === 'mcp-move') as McpMoveStep);
    assert.deepStrictEqual([s.from, s.to], [{ name: 'serena', scope: 'local' }, { name: 'shop-serena', scope: 'local' }]);
    assert.ok(s.entry.args!.includes('serena-agent@2.4.0'), 'the updated pin is not downgraded to the catalog pin');
    assert.deepStrictEqual(s.entry.args!.slice(-2), ['--user-added', 'yes']);
    assert.strictEqual((s.entry.env as EntryEnv).MY_VAR, 'kept');
    assert.match(renderPlan(p), /add first, read back, then remove the old one/);
});

test('a location change edits only the paths and keeps the pin; the old data is named and left', () => {
    const r = installed('playwright-chrome');
    r.entry.args = r.entry.args!.map((a) => a.replace(/^@playwright\/mcp@.+$/, '@playwright/mcp@0.0.90'));
    const p = plan(inv(MAC, { registrations: [r] }), changeOf(r, { location: { side: 'account' } }), opts('/Users/me'));
    // the data folder goes to the global root; the server stays at local scope, so it is listed in the project root
    assert.deepStrictEqual(p.steps.map((s) => [s.op, (s as PathStep).path || (s as RecordRootStep).root || (s as McpAddStep).name || (s as ListWriteStep).file]), [['root-ignore', '/work/shop/.alfred-tools'], ['root-ignore', '/Users/me/.alfred-tools'], ['ensure-dir', '/Users/me/.alfred-tools/playwright-chrome'], ['mcp-replace', 'playwright-chrome'], ['list-write', '/work/shop/.alfred-tools/mcps.json'], ['record-root', '/work/shop/.alfred-tools'], ['record-root', '/Users/me/.alfred-tools']]);
    const replace = (p.steps.find((s) => s.op === 'mcp-replace') as McpReplaceStep);
    const e = replace.entry;
    assert.ok(e.args!.includes('@playwright/mcp@0.0.90'));
    assert.strictEqual(e.args![e.args!.indexOf('--user-data-dir') + 1], '/Users/me/.alfred-tools/playwright-chrome');
    assert.strictEqual(e.args![e.args!.indexOf('--output-dir') + 1], '/Users/me/.alfred-tools/playwright-chrome/output');
    assert.match(p.notes.join('\n'), /old data stays at \/work\/shop\/\.alfred-tools\/playwright-chrome/);
    assert.deepStrictEqual(replace.old, r.entry, 'the old entry is kept for the rollback');
});

test('a scope change moves the registration and rewrites its paths for the new scope', () => {
    const r = installed('context7', { route: 'remote', scope: 'project', token: false });
    const p = plan(inv(MAC, { registrations: [r] }), changeOf(r, { route: 'remote', scope: 'user' }), opts('/h'));
    assert.deepStrictEqual(p.steps.map((s) => s.op), ['root-ignore', 'mcp-move', 'list-write', 'record-root'], 'the moved server is listed in the global root');
    const mv = (p.steps.find((s) => s.op === 'mcp-move') as McpMoveStep);
    assert.deepStrictEqual([mv.from.scope, mv.to.scope], ['project', 'user']);
    const cat = withRelative('playwright-chrome');
    const local = installed('playwright-chrome', { scope: 'local' });
    const toProject = plan(inv(MAC, { registrations: [local] }), changeOf(local, { scope: 'project' }), opts('/Users/me', { catalog: cat }));
    assert.deepStrictEqual(toProject.errors, []);
    const e = (toProject.steps.find((s) => s.op === 'mcp-move') as McpMoveStep).entry;
    assert.strictEqual(e.args![e.args!.indexOf('--user-data-dir') + 1], '/work/shop/.alfred-tools/playwright-chrome', 'absolute in the project root, as at local scope');
});

test('changing the route rebuilds from the catalog; changing only the key adds the helper to the entry as read', { skip: POSIX_FIXTURE }, () => {
    const r = installed('context7', { route: 'remote', scope: 'project', token: false });
    const key = plan(inv(MAC, { registrations: [r] }), changeOf(r, { token: true }), opts('/h'));
    assert.deepStrictEqual(key.steps.map((s) => s.op), ['root-ignore', 'write-helper', 'ensure-key-name', 'mcp-replace', 'deny-read', 'list-write', 'record-root', 'order-mcp-json']);
    assert.deepStrictEqual((key.steps[3] as McpAddStep).entry, { type: 'http', url: 'https://mcp.context7.com/mcp', headersHelper: 'node /work/shop/.alfred-tools/mcp-headers.js CONTEXT7_API_KEY Bearer' });
    // remote at project scope becomes local there: the local launch replaces it in the committed file
    const toLocal = plan(inv(MAC, { registrations: [r] }), changeOf(r, { route: 'local' }), opts('/h'));
    assert.deepStrictEqual(toLocal.errors, []);
    const toLocalReplace = (toLocal.steps.find((s) => s.op === 'mcp-replace') as McpReplaceStep);
    assert.deepStrictEqual([toLocalReplace.scope, toLocalReplace.entry.command], ['project', 'npx']);
    // a keyed hosted one: the local launch, with no key argument while the name is filled nowhere (spec F2)
    const user = installed('context7', { route: 'remote', scope: 'user' });
    const local = plan(inv(MAC, { registrations: [user] }), changeOf(user, { route: 'local' }), opts('/h'));
    const replace = (local.steps.find((x) => x.op === 'mcp-replace') as McpReplaceStep);
    assert.deepStrictEqual([replace.entry.command, replace.entry.args!.includes('--api-key')], ['npx', false]);
    assert.ok(local.notes.some((n) => n.startsWith('context7: fill CONTEXT7_API_KEY in ')), local.notes.join('\n'));
    const moved = plan(inv(MAC, { registrations: [r] }), changeOf(r, { route: 'local', scope: 'local' }), opts('/h'));
    assert.deepStrictEqual(regSteps(moved).map((s) => s.op), ['mcp-move', 'fetch'], 'a hosted route had nothing in the cache');
});

test('registrations that are not the catalog\'s are not touched: a user\'s own, and alfred-code\'s retired names', () => {
    const own = reg('serena', 'user', { command: 'node' });
    const retired = reg('chrome-control', 'local', { command: 'npx', args: ['-y', '@playwright/mcp@0.0.83', '--browser', 'chrome'] }, 'playwright-chrome', 'local', { alfredRetired: true });
    const p = plan(inv(MAC, { registrations: [own, retired] }), { picks: { 'playwright-chrome': {} }, remove: [{ kind: 'mcp', name: 'serena', scope: 'user' }, { kind: 'mcp', name: 'chrome-control', scope: 'local' }] }, opts('/h'));
    assert.deepStrictEqual(p.steps.map((s) => s.op), ['root-ignore', 'ensure-dir', 'mcp-add', 'fetch', 'list-write', 'record-root'], 'a fresh add beside the retired one; nothing removed');
    assert.strictEqual(p.errors.length, 2);
    assert.match(p.errors[0]!, /your own server/);
    assert.match(p.errors[1]!, /alfred-code's \(retired\)/);
});

test('remove plans one remove per pick, at the scope shown', () => {
    const r = installed('serena');
    const p = plan(inv(MAC, { registrations: [r] }), { remove: [{ kind: 'mcp', name: 'serena', scope: 'local' }] }, opts('/h'));
    assert.deepStrictEqual(p.steps.map((s) => [s.op, (s as McpAddStep).name, (s as McpAddStep).scope]), [['mcp-remove', 'serena', 'local']]);
    assert.deepStrictEqual(argvOf(p.steps[0]!), ['mcp', 'remove', 'serena', '-s', 'local']);
    assert.match(plan(inv(MAC), { remove: [{ kind: 'mcp', name: 'ghost', scope: 'local' }] }, opts('/h')).errors[0]!, /no registration/);
});

test('code-running tools are named in the plan', () => {
    const p = plan(inv(MAC), pickOne('playwright-chrome'), opts('/h'));
    assert.match(renderPlan(p), /browser_run_code_unsafe/);
    assert.match(renderPlan(plan(inv(MAC), pickOne('macos-control'), opts('/h'))), /Shell/);
});

// ---- the questions ----------------------------------------------------------------------------------------------------

function checkQuestion(q: Question)
{
    assert.ok(q.header.length <= 12, `${q.id}: header '${q.header}'`);
    assert.ok(q.options.length >= 2 && q.options.length <= 4, `${q.id}: ${q.options.length} options`);
    for (const o of q.options) assert.ok(o.label && o.description, q.id);
    if (!q.multiSelect)
    {
        const rec = q.options.filter((o) => o.label.endsWith('(Recommended)'));
        assert.strictEqual(rec.length, 1, `${q.id}: exactly one Recommended`);
        assert.ok(q.options[0]!.label.endsWith('(Recommended)'), `${q.id}: Recommended is first`);
    }
}

test('every question has 2 to 4 options, one Recommended and first, and a call has at most four questions', () => {
    for (const base of [MAC, LINUX, WIN, WINARM])
    {
        const i = inv(base);
        const calls = pickQuestions(i, catalog);
        for (const call of calls) { assert.ok(call.length >= 1 && call.length <= 4); call.forEach(checkQuestion); }
        const offered = calls.flat().flatMap((q) => q.options).length;
        const rows = catalog.tools.filter((r) => r.os.includes(i.os)).length;
        assert.strictEqual(offered, rows, base.os);
        for (const row of catalog.tools.filter((r) => r.os.includes(i.os)))
        {
            const ctx = { project: i.project, platform: i.os, arch: i.arch, home: base.os === 'win32' ? 'C:\\Users\\me' : '/Users/me', env: {} };
            for (const route of row.kind === 'mcp' ? Object.keys(row.routes) : [undefined])
            {
                // a row with a data folder asks scope and name first; its second call (the folder, an extra) may be empty,
                // and an empty call is not made
                const t = toolAsk(row, i, { route, context: ctx, catalog });
                const calls = [t.first, t.questions].filter((c) => c && c.length);
                assert.ok(calls.length >= 1, `${row.id}: no question at all`);
                for (const c of calls) { assert.ok(c!.length <= 4, `${row.id}: ${c!.length} questions in one call`); c!.forEach(checkQuestion); }
            }
            const rq = row.kind === 'mcp' ? routeQuestion(row) : null;
            if (rq) { checkQuestion(rq); assert.strictEqual(rq.options.length, Object.keys(row.routes).length); }
        }
    }
    Object.values(STATIC).map((q) => (typeof q === 'function' ? (q as (...args: unknown[]) => Question)(1, 2, 3) : q)).forEach(checkQuestion);
});

test('no ask names git or remote state: alfred-code\'s stop guard reads such a word as a repository measurement and sends Claude to git fetch', () => {
    // alfred-code v3.2.1 stack/hooks/guard-stop-contract.js :2528 (REMOTE_STATE_RE) and :2871 (git state), as written there
    const REMOTE_STATE_RE = /\b(?:merged?|merging|pull request|PRs?|remote|upstream|deploy(?:ed|ment)?|pipeline|CI|workflow run)\b/i;
    const GIT_STATE_RE = /\b(commit|branch|pull request|\bPRs?\b|merge|rebase|stash|staged|unstaged|uncommitted|untracked|remote|upstream|deploy(ed|ment)?|pipeline|\bCI\b|workflow run|job)\b/i;
    const texts: string[] = [];
    const add = (q: Pick<Question, 'question' | 'options'>) => texts.push(q.question, ...q.options.flatMap((o) => [o.label, o.description || '']));
    const collect = (node: unknown) =>
    {
        if (Array.isArray(node)) return node.forEach(collect);
        if (!node || typeof node !== 'object') return undefined;
        for (const [k, v] of Object.entries(node)) if (['question', 'label', 'description'].includes(k) && typeof v === 'string') texts.push(v); else collect(v);
        return undefined;
    };
    for (const base of [MAC, LINUX, WIN])
    {
        const home = base.os === 'win32' ? 'C:\\Users\\me' : '/Users/me';
        const rows = catalog.tools.filter((r) => r.os.includes(base.os));
        // nothing installed, and every MCP row installed at each of its routes: install's picks, configure's change pick
        // and each target's questions, the remove pick
        const regs = rows.filter((r) => r.kind === 'mcp').flatMap((r) => Object.keys(r.routes).map((route) => installed(r.id, { route }, base, home)));
        for (const i of [inv(base), inv(base, { registrations: regs })])
            collect(asks.allQuestions(i, { rows: rows.map((r) => r.id), targets: i.registrations.map((r) => `mcp:${r.name}~${r.scope}`) }, catalog));
        const i = inv(base);
        for (const row of rows)
        {
            const ctx = { project: i.project, platform: i.os, arch: i.arch, home, env: {} };
            for (const route of row.kind === 'mcp' ? Object.keys(row.routes) : [undefined]) toolQuestions(row, i, { route, context: ctx, catalog }).forEach(add);
        }
    }
    Object.values(STATIC).map((q) => (typeof q === 'function' ? (q as (...args: unknown[]) => Question)(1, 2, 3) : q)).forEach(add);
    for (const f of fs.readdirSync(path.join(import.meta.dirname, '..', 'commands'))) parseAskBlocks(fs.readFileSync(path.join(import.meta.dirname, '..', 'commands', f), 'utf8')).forEach(add);
    const hits = [...new Set(texts.filter((t) => REMOTE_STATE_RE.test(t) || GIT_STATE_RE.test(t)))];
    assert.deepStrictEqual(hits, []);
});

test('the grouping: Code, Docs and forges, Browsers, Machine and monitoring; two machine rows on Linux, windows-control only on Windows', () => {
    const calls = (b: { os: string; arch: string; project: string }) => pickQuestions(inv(b), catalog)[0];
    assert.deepStrictEqual(calls(MAC)!.map((q) => q.options.length), [2, 4, 4, 3]);
    assert.deepStrictEqual(calls(LINUX)!.map((q) => q.options.length), [2, 4, 4, 2]);
    assert.match(calls(WIN)![3]!.options.map((o) => o.label).join(), /windows-control/);
    assert.doesNotMatch(calls(MAC)![3]!.options.map((o) => o.label).join(), /windows-control/);
    assert.match(calls(MAC)![3]!.options.map((o) => o.label).join(), /macos-control/);
});

test('install offers only what is not installed; configure offers what is, one option per registration', () => {
    const i = inv(MAC, {
        registrations: [reg('shop-serena', 'local', { command: 'uvx', args: ['--from', 'serena-agent@2.1.0'] }, 'serena', 'local'), reg('serena', 'user', { command: 'uvx', args: ['--from', 'serena-agent@2.1.0'] }, 'serena', 'local'), reg('mine', 'user', { command: 'my-server' })],
        plugins: [{ id: 'claude-hud@claude-hud', plugin: 'claude-hud', scope: 'user', version: '0.13.1', enabled: true, rowId: null, alfredRetired: false }],
    });
    const offered = pickQuestions(i, catalog).flat().flatMap((q) => q.options.map((o) => o.label));
    assert.ok(!offered.includes('serena') && !offered.some((l) => l.startsWith('claude-hud')), 'installed rows are configure\'s; an old plugin is no row');
    assert.strictEqual(offered.length, catalog.tools.filter((r) => r.os.includes('darwin')).length - 1);
    const ch = changeQuestions(i, catalog);
    const labels = ch.calls.flat().flatMap((q) => q.options.map((o) => o.label));
    assert.deepStrictEqual(labels, ['shop-serena (serena, local)', 'serena (serena, user)'], 'a row at two scopes is two options; the user\'s own server and an old plugin are not offered');
    assert.deepStrictEqual(ch.keys, { 'shop-serena (serena, local)': 'mcp:shop-serena~local', 'serena (serena, user)': 'mcp:serena~user' });
    assert.match(ch.calls[0]![0]!.options[0]!.description, /^local route, pin 2\.1\.0$/);
});

test('a multi-select never has one option: a lone item joins a neighbour or takes one from it, and one in all gets None', () => {
    const g = (id: string): Grp => ({ id, label: id });
    const items = (spec: [Grp, number][]) => spec.flatMap(([grp, n]) => Array.from({ length: n }, (_, k) => ({ group: grp, label: `${grp.id}${k}`, description: 'd' })));
    const sizes = (spec: [Grp, number][]) => packed(items(spec), { id: 'x', question: 'which?', none: 'nothing' }).flat().map((q) => q.options.length);
    const [a, b, c, d] = ['code', 'docs', 'browsers', 'machine'].map(g) as [Grp, Grp, Grp, Grp];
    assert.deepStrictEqual(sizes([[a, 4], [b, 4], [c, 4], [d, 4]]), [4, 4, 4, 4]);
    assert.deepStrictEqual(sizes([[a, 3], [b, 1], [c, 4]]), [4, 4], 'a lone item joins the group before it that has room');
    assert.deepStrictEqual(sizes([[a, 4], [b, 1], [c, 4]]), [3, 2, 4], 'both neighbours full: it takes one from the one before');
    assert.deepStrictEqual(sizes([[a, 1], [b, 4]]), [2, 3]);
    assert.deepStrictEqual(sizes([[a, 5]]), [3, 2], 'a group of five splits 3 + 2, never 4 + 1');
    const one = packed(items([[a, 1]]), { id: 'x', question: 'which?', none: 'nothing' })[0]![0];
    assert.deepStrictEqual(one!.options.map((o) => o.label), ['code0', 'None of these']);
    const mixed = packed(items([[a, 3], [b, 1]]), { id: 'x', question: 'which?', none: 'nothing' })[0]![0];
    assert.strictEqual(mixed!.header, 'Tools');
    assert.strictEqual(mixed!.question, 'Which?');
    for (const n of [1, 2, 3, 5, 6, 7, 9, 13, 17])
        for (const call of packed(items([[a, n], [b, 1], [c, 2]]), { id: 'x', question: 'which?', none: 'nothing' })) { assert.ok(call.length <= 4); call.forEach(checkQuestion); }
});

test('install only adds: a tool installed for every project gets this project\'s own copy, and the account-wide one is never touched', () => {
    const glob = installed('memory', { scope: 'user' });
    const i = inv(MAC, { registrations: [glob] });
    const p = plan(i, pickOne('memory'), opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    assert.deepStrictEqual(regSteps(p).map((s) => [s.op, (s as McpAddStep).name, (s as McpAddStep).scope]), [['ensure-dir', undefined, undefined], ['mcp-add', 'memory', 'local'], ['fetch', 'memory', undefined]]);
    assert.strictEqual((addStep(p).entry.env as EntryEnv).MCP_MEMORY_SQLITE_PATH, '/work/shop/.alfred-tools/memory/memory.db', 'its own data, in the project folder');
    assert.ok(!p.steps.some((s) => /remove|move|replace|uninstall/.test(s.op)), 'nothing happens to the copy for every project');
    assert.match(p.notes.join(' '), /also installed as 'memory' at user scope - left as it is/);
    assert.match(p.notes.join(' '), /nearer one wins/);
    // an answer that names the copy for every project is not a change of it
    const again = plan(i, pickOne('memory', { scope: 'user', name: 'keep' }), opts('/Users/me'));
    assert.strictEqual(again.noop, true);
    assert.match(again.unchanged.join(' '), /already installed at user scope - a change to it is \/alfred-tools:configure/);
    const renamed = plan(i, pickOne('memory', { scope: 'user', name: 'mem2' }), opts('/Users/me'));
    assert.deepStrictEqual(regSteps(renamed).map((s) => s.op).filter((o) => o !== 'ensure-dir' && o !== 'fetch'), ['mcp-add'], 'a second name at the same scope is a second copy, never a rename');
});

test('a copy and a configure change on Windows and Linux: each OS\'s paths, the Windows cmd /c, the user-scope one untouched', () => {
    const cases = [
        [WIN, 'C:\\Users\\me', 'C:\\work\\shop\\.alfred-tools\\memory\\memory.db', 'C:\\Users\\me\\.alfred-tools\\pw2', 'cmd'],
        [LINUX, '/home/me', '/work/shop/.alfred-tools/memory/memory.db', '/home/me/.alfred-tools/pw2', 'npx'],
    ] as [typeof WIN, string, string, string, string][];
    for (const [base, home, memDb, pwDir, command] of cases)
    {
        const first = plan(inv(base), { picks: { memory: { scope: 'user' }, 'playwright-chrome': { scope: 'user' } } }, opts(home));
        const regs = (first.steps.filter((s) => s.op === 'mcp-add') as McpAddStep[]).map((s) => reg(s.name, s.scope, s.entry, s.row, 'local'));
        const copy = plan(inv(base, { registrations: regs }), { picks: { memory: {}, 'playwright-chrome': {} } }, opts(home));
        assert.deepStrictEqual(copy.errors, [], base.os);
        assert.deepStrictEqual((copy.steps.filter((s) => s.op === 'mcp-add') as McpAddStep[]).map((s) => [s.name, s.scope]), [['memory', 'local'], ['playwright-chrome', 'local']]);
        assert.strictEqual((addStep(copy).entry.env as EntryEnv).MCP_MEMORY_SQLITE_PATH, memDb, base.os);
        assert.strictEqual(addStep(copy, 1).entry.command, command, base.os);
        assert.ok(!copy.steps.some((s) => (s as McpAddStep).scope === 'user' || (s as McpMoveStep).from), `${base.os}: nothing at user scope is touched`);
        const ch = plan(inv(base, { registrations: regs }), changeOf(regs[1]!, { name: 'pw2', location: { side: 'account' } }), opts(home));
        assert.deepStrictEqual(ch.errors, [], base.os);
        const mv = (ch.steps.find((s) => s.op === 'mcp-move') as McpMoveStep);
        assert.deepStrictEqual([mv.from, mv.to], [{ name: 'playwright-chrome', scope: 'user' }, { name: 'pw2', scope: 'user' }]);
        assert.strictEqual(mv.entry.command, command, `${base.os}: the launch as read is kept`);
        assert.strictEqual(mv.entry.args![mv.entry.args!.indexOf('--user-data-dir') + 1], pwDir, base.os);
    }
});

test('a hosted row installed for every project at its recommended Global scope is still offered as this project\'s own copy', () => {
    const i = inv(MAC, { registrations: [installed('github', { route: 'remote', scope: 'user' }), installed('context7', { route: 'remote', scope: 'user' })] });
    const offered = pickQuestions(i, catalog).flat().flatMap((q) => q.options.map((o) => o.label));
    assert.ok(offered.includes('github (installed for every project as github)'), offered.join('\n'));
    assert.ok(offered.includes('context7 (installed for every project as context7)'), offered.join('\n'));
    // an old plugin is no row, so it is never offered
    const hud = inv(MAC, { plugins: [{ id: 'claude-hud@claude-hud', plugin: 'claude-hud', scope: 'user', version: '0.13.1', enabled: true, rowId: null, alfredRetired: false }] });
    assert.ok(!pickQuestions(hud, catalog).flat().flatMap((q) => q.options.map((o) => o.label)).some((l) => l.startsWith('claude-hud')));
});

test('install questions for a copy: the taken scope is not offered, and an account-default folder becomes the project one', { skip: POSIX_FIXTURE }, (t) => {
    // a home of its own holding alfred-code's old memory folder, the second place that makes the location a question:
    // read from the real home, this passed only on a machine that still had ~/.alfred-memory
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-plan-home-'));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    fs.mkdirSync(path.join(home, '.alfred-memory'));
    const i = inv(MAC, { registrations: [reg('memory', 'user', { command: 'uvx', args: ['--from', 'mcp-memory-service[sqlite]==12.1.1'] }, 'memory', 'local')] });
    const offered = pickQuestions(i, catalog).flat().flatMap((q) => q.options);
    const mem = offered.find((o) => o.label.startsWith('memory'));
    assert.strictEqual(mem!.label, 'memory (installed for every project as memory)');
    assert.match(mem!.description, /adds this project's own copy; the one for every project stays/);
    const q = asks.allQuestions(i, { rows: ['memory'] }, catalog, { home });
    // memory has a data folder: its scope and name come first, in a call of their own
    assert.deepStrictEqual((q.tools as ToolsKeyed).memory!.first!.map((x) => x.id), ['scope-memory', 'name-memory']);
    assert.deepStrictEqual((q.tools as ToolsKeyed).memory!.first!.find((x) => x.id === 'scope-memory')!.options.map((o) => o.label), ['Local (Recommended)', 'Project'], 'the copy\'s user scope is not offered again');
    assert.match((q.tools as ToolsKeyed).memory!.first!.find((x) => x.id === 'name-memory')!.options[0]!.description, /used instead of the copy for every project/);
    const loc = (q.tools as ToolsKeyed).memory!.questions!.find((x) => x.id === 'location-memory');
    assert.strictEqual(loc!.options[0]!.label, "The project root's folder (Recommended)", 'a copy gets this project\'s own memory');
    assert.match(loc!.options[0]!.description, /^\/work\/shop\/\.alfred-tools\/memory /);
    for (const t of Object.values(q.tools)) [...(t.first || []), ...t.questions!].forEach(checkQuestion);
});

test('configure: one of two registrations of a row is changed by its key, the other is left and not noted', () => {
    const e = (name: string) => ({ command: 'uvx', args: ['--python', '3.13', '--from', 'serena-agent@2.1.0', 'serena', 'start-mcp-server'], env: { SERENA_HOME: `/work/shop/.alfred-tools/${name}` } });
    const i = inv(MAC, { registrations: [reg('serena', 'local', e('serena'), 'serena', 'local'), reg('serena', 'user', e('serena'), 'serena', 'local')] });
    const p = plan(i, { change: { 'mcp:serena~user': { row: 'serena', name: 'nav' } } }, opts('/h'));
    assert.deepStrictEqual(p.errors, []);
    assert.strictEqual(regSteps(p).length, 1);
    assert.deepStrictEqual([regSteps(p)[0]!.op, (regSteps(p)[0] as McpMoveStep).from, (regSteps(p)[0] as McpMoveStep).to], ['mcp-move', { name: 'serena', scope: 'user' }, { name: 'nav', scope: 'user' }]);
    assert.match(p.notes.join(' '), /also installed as 'serena' at local scope - left as it is/);
    const both = plan(i, { change: { 'mcp:serena~user': { name: 'nav' }, 'mcp:serena~local': { name: 'nav-here' } } }, opts('/h'));
    assert.deepStrictEqual(both.errors, []);
    assert.strictEqual(regSteps(both).length, 2);
    assert.doesNotMatch(both.notes.join(' '), /left as it is/, 'a registration changed in the same plan is not called left');
    assert.strictEqual(plan(i, { change: { 'mcp:serena~user': { row: 'serena' } } }, opts('/h')).noop, true, 'every answer kept: nothing to do');
});

test('configure: a plugin is not changed here, and an unknown key or a user\'s own server is refused', () => {
    const known = [{ name: 'claude-plugins-official', source: '' }];
    const old = { rowId: null, id: 'csharp-lsp@claude-plugins-official', scope: 'user', enabled: true, alfredRetired: false };
    const i = inv(MAC, { marketplaces: known, plugins: [old], registrations: [reg('mine', 'user', { command: 'my-server' })] });
    const p = plan(i, { change: { 'plugin:csharp-lsp@claude-plugins-official~user': { scope: 'project' } } }, opts('/h'));
    assert.deepStrictEqual(p.steps, []);
    assert.match(p.errors.join(), /'plugin:csharp-lsp@claude-plugins-official~user' is a plugin - the catalog lists none since 0\.5\.0/);
    assert.match(plan(i, { change: { 'mcp:serena~local': {} } }, opts('/h')).errors.join(), /nothing is installed as 'mcp:serena~local'/);
    assert.match(plan(i, { change: { 'mcp:mine~user': { name: 'x' } } }, opts('/h')).errors.join(), /'mine' is your own .* left alone/);
    assert.match(plan(i, { change: { 'serena': {} } }, opts('/h')).errors.join(), /a key is mcp:<name>~<scope>/);
});

test('configure questions start from what is installed: its route, scope, name, data folder, binary, key and host are Keep', () => {
    const play = { command: 'npx', args: ['-y', '@playwright/mcp@0.0.83', '--browser', 'chrome', '--user-data-dir', '/work/shop/.alfred-tools/pw/profile', '--executable-path', '/opt/chrome'] };
    const c7 = { type: 'http', url: 'https://mcp.context7.com/mcp' };
    const i = inv(MAC, { registrations: [reg('pw', 'local', play, 'playwright-chrome', 'local'), reg('c7', 'project', c7, 'context7', 'remote')] });
    const q = asks.allQuestions(i, { targets: ['mcp:pw~local', 'mcp:c7~project', 'mcp:none~user'] }, catalog);
    const first = (key: string, id: string) => [...(q.targets[key]!.first || []), ...q.targets[key]!.questions!].find((x) => x.id.startsWith(id))!.options[0]!.label;
    assert.strictEqual(q.targets['mcp:pw~local']!.row, 'playwright-chrome');
    assert.strictEqual(first('mcp:pw~local', 'scope'), 'Local (Recommended)');
    assert.strictEqual(first('mcp:pw~local', 'name'), 'Keep `pw` (Recommended)');
    assert.strictEqual(first('mcp:pw~local', 'location'), 'The folder it uses now (Recommended)');
    assert.strictEqual(q.targets['mcp:pw~local']!.questions!.find((x) => x.id.startsWith('location'))!.options[0]!.description, '/work/shop/.alfred-tools/pw/profile', 'the folder as registered');
    assert.strictEqual(first('mcp:pw~local', 'browser'), 'Keep `/opt/chrome` (Recommended)');
    assert.strictEqual(q.targets['mcp:c7~project']!.route!.options[0]!.label, 'Hosted (Recommended)');
    assert.strictEqual(first('mcp:c7~project', 'scope'), 'Project (Recommended)');
    assert.match(q.targets['mcp:none~user']!.error!, /not a catalog tool installed here/);
    const local = asks.allQuestions(inv(MAC, { registrations: [reg('c7', 'local', { command: 'npx', args: ['-y', '@upstash/context7-mcp@2.0.0'] }, 'context7', 'local')] }), { targets: ['mcp:c7~local'] }, catalog);
    assert.strictEqual(local.targets['mcp:c7~local']!.route!.options[0]!.label, 'Local (Recommended)', 'the route it has now is recommended, not the catalog\'s');
    for (const t of Object.values(q.targets).filter((x) => !x.error)) { [...(t.first || []), ...t.questions!].forEach(checkQuestion); if (t.route) checkQuestion(t.route); }
});

test('the scope question follows the route: its recommended scope first, then user, project, local', () => {
    const i = inv(MAC);
    const scopes = (id: string, route: string) => scopeQuestion(catalog.byId.get(id)!, i, { route, context: { project: '/p', platform: 'darwin', home: '/h', env: {} } })!.options.map((o) => scopeOfLabel(o.label));
    assert.deepStrictEqual(scopes('serena', 'local'), ['local', 'user', 'project']);
    assert.deepStrictEqual(scopes('context7', 'remote'), ['user', 'project', 'local']);
    assert.deepStrictEqual(scopes('context7', 'local'), ['local', 'user', 'project']);
});

test('plan.js plans every route at project scope but a stdio route that needs a key (spec D5)', () => {
    for (const row of catalog.tools.filter((r) => r.kind === 'mcp'))
        for (const routeId of Object.keys(row.routes))
        {
            const p = plan(inv(row.os.includes('win32') && !row.os.includes('darwin') ? WIN : MAC), pickOne(row.id, { route: routeId, scope: 'project' }), opts('/h'));
            if (routeId === 'local' && row.routes.local!.authMode === 'token') { assert.match(p.errors.join(), /not offered at project scope/, `${row.id}/${routeId}`); continue; }
            assert.deepStrictEqual(p.errors, [], `${row.id}/${routeId}`);
            assert.strictEqual(addStep(p).scope, 'project', `${row.id}/${routeId}`);
        }
});

test('the CLI form prints a plan and writes it for apply.js', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-plan-'));
    try
    {
        fs.writeFileSync(path.join(d, 'inv.json'), JSON.stringify(inv(MAC)));
        fs.writeFileSync(path.join(d, 'ans.json'), JSON.stringify(pickOne('atlassian', { token: false })));
        const r = spawnSync(process.execPath, [path.join(import.meta.dirname, '..', 'scripts', 'plan.ts'), path.join(d, 'inv.json'), path.join(d, 'ans.json'), '--out', path.join(d, 'plan.json')], { encoding: 'utf8' });
        assert.strictEqual(r.status, 0, r.stderr);
        assert.match(r.stdout, /claude mcp add-json atlassian .*-s user/);
        assert.match(r.stdout, /OAuth: run \/mcp once/);
        assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(d, 'plan.json'), 'utf8')).steps.map((s: PlanStep) => s.op), ['root-ignore', 'mcp-add', 'list-write', 'record-root']);
        const q = spawnSync(process.execPath, [path.join(import.meta.dirname, '..', 'scripts', 'plan.ts'), '--questions', path.join(d, 'inv.json')], { encoding: 'utf8' });
        assert.strictEqual(q.status, 0, q.stderr);
        assert.ok(JSON.parse(q.stdout).pick.length >= 1);
        assert.deepStrictEqual(JSON.parse(q.stdout).next, { id: 'done' }, 'no picks: nothing to walk');
    }
    finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('answers.machine from prereq.js reaches the plan: no docker picks the github binary, docker keeps the image; an explicit option wins', () => {
    const entryOf = (answers: Answers, machine?: { docker?: boolean }) => addStep(plan(inv(MAC), answers, opts('/Users/me', { machine }))).entry;
    const github = { picks: { github: { route: 'local' } } };
    assert.strictEqual(entryOf({ ...github, machine: { docker: true } }).command, 'docker');
    const bin = entryOf({ ...github, machine: { docker: false } });
    assert.deepStrictEqual([bin.command, bin.args], ['github-mcp-server', ['stdio']]);
    assert.strictEqual(entryOf(github).command, 'docker', 'unsaid means the image');
    assert.strictEqual(entryOf({ ...github, machine: { docker: false } }, { docker: true }).command, 'docker', 'the option wins over the answers');
});

test('--questions takes the route answered so far: it decides the recommended scope', () => {
    const i = inv(MAC);
    const scopes = (route: string) => (asks.allQuestions(i, { rows: ['context7'], routes: { context7: route } }, catalog).tools as ToolsKeyed).context7!.questions!.find((q) => q.id === 'scope-context7')!.options.map((o) => scopeOfLabel(o.label));
    assert.deepStrictEqual(scopes('remote'), ['user', 'project', 'local']);
    assert.deepStrictEqual(scopes('local'), ['local', 'user', 'project']);
    assert.strictEqual((asks.allQuestions(i, { rows: ['serena'] }, catalog).tools as ToolsKeyed).serena!.route, null, 'a one-route row has no route ask');
});

test('the remove asks carry what to remove in their descriptions, in a form the walk can read back', () => {
    const i = inv(MAC, {
        registrations: [
            { name: 'proj-serena', scope: 'local', entry: { command: 'uvx' }, rowId: 'serena', route: 'local', own: false, alfredRetired: false },
            { name: 'context7', scope: 'project', entry: { type: 'http' }, rowId: 'context7', route: 'remote', own: false, alfredRetired: false },
        ],
        plugins: [{ id: 'claude-hud@claude-hud', plugin: 'claude-hud', scope: 'user', version: '0.13.1', enabled: true, errors: [], rowId: null, alfredRetired: false }],
    });
    const options = removeQuestions(i, catalog).flat().flatMap((q) => q.options);
    assert.strictEqual(options.length, 2, 'an old plugin is not removed here');
    for (const o of options) assert.match(o.description, /^claude mcp remove \S+ -s (local|project|user)$/);
    assert.deepStrictEqual(options.map((o) => o.description), ['claude mcp remove proj-serena -s local', 'claude mcp remove context7 -s project']);
});

test('location: alfred-code data on disk is a second answer, not the recommended one, and absent without the folder', () => {
    const ctx = (exists: (file: string) => boolean) => ({ project: '/work/shop', platform: 'darwin', arch: 'arm64', home: '/Users/me', env: {}, exists });
    const loc = (exists: (file: string) => boolean) => toolQuestions(catalog.byId.get('playwright-chrome')!, inv(MAC), { route: 'local', context: ctx(exists), catalog }).find((q) => q.id === 'location-playwright-chrome');
    const withData = loc((p: string) => p === '/work/shop/.alfred/chrome-control');
    checkQuestion(withData!);
    assert.strictEqual(withData!.options[0]!.label, "The project root's folder (Recommended)");
    const old = withData!.options.find((o) => o.label === 'Carry over alfred-code 2.x data');
    assert.match(old!.description, /^\/work\/shop\/\.alfred\/chrome-control - carries over the data alfred-code 2\.x left there; the folder is alfred-code's, so deleting it erases this tool's data$/);
    assert.strictEqual(loc(() => false), undefined, 'no alfred-code folder: one place, no question');
});

test('plan.js from a kept inventory file leaves location keys as they are', () => {
    // memory at user scope, renamed by configure from the inventory as inventory.ts writes it
    const live = `sk-live-${randomBytes(16).toString('hex')}`;
    const db = '/h/.alfred-tools/memory/memory.db';
    const r = reg('memory', 'user', { command: 'uvx', args: ['--python', '3.13', '--exclude-newer', '2026-10-20T23:59:59Z', '--from', 'mcp-memory-service[sqlite]==12.1.1', 'memory', 'server'], env: { MCP_MEMORY_STORAGE_BACKEND: 'sqlite_vec', MCP_MEMORY_SQLITE_PATH: db, MEMORY_API_TOKEN: live } }, 'memory', 'local');
    const kept = inventoryLib.keptOf(inv(MAC, { registrations: [r] }), catalog);
    assert.strictEqual((kept.registrations[0]!.entry.env as EntryEnv).MEMORY_API_TOKEN, MARKER);
    const p = plan(kept, changeOf(r, { name: 'mem' }), opts('/h'));
    assert.deepStrictEqual(p.errors, []);
    assert.deepStrictEqual(p.steps.map((s) => s.op), ['root-ignore', 'mcp-move', 'list-write', 'record-root'], 'its data folder sits in the global root');
    assert.strictEqual(((p.steps[1] as McpAddStep).entry.env as EntryEnv).MCP_MEMORY_SQLITE_PATH, db);
    assert.strictEqual(((p.steps[1] as McpAddStep).entry.env as EntryEnv).MEMORY_API_TOKEN, MARKER, 'the value travels as the marker');
    assert.ok(!JSON.stringify(p).includes(live));
});

test('configure plan.js from a kept inventory prints no live value', () => {
    const token = `sntryu_${randomBytes(16).toString('hex')}`;
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-plan-'));
    try
    {
        const r = reg('sentry-live', 'local', { command: 'npx', args: ['-y', '@sentry/mcp-server@0.42.0'], env: { SENTRY_ACCESS_TOKEN: token } }, 'sentry', 'local');
        fs.writeFileSync(path.join(d, 'inv.json'), JSON.stringify(inventoryLib.keptOf(inv(MAC, { registrations: [r] }), catalog)));
        fs.writeFileSync(path.join(d, 'ans.json'), JSON.stringify(changeOf(r, { name: 'sentry-moved' })));
        const out = spawnSync(process.execPath, [path.join(import.meta.dirname, '..', 'scripts', 'plan.ts'), path.join(d, 'inv.json'), path.join(d, 'ans.json'), '--out', path.join(d, 'plan.json')], { encoding: 'utf8' });
        assert.strictEqual(out.status, 0, out.stderr);
        assert.match(out.stdout, /claude mcp add-json sentry-moved .*\$\{ALFRED_TOOLS_KEPT\}/);
        for (const where of [out.stdout, out.stderr, fs.readFileSync(path.join(d, 'plan.json'), 'utf8')]) assert.ok(!where.includes(token));
    }
    finally { fs.rmSync(d, { recursive: true, force: true }); }
});

// ---- inherited servers (a parent folder's .mcp.json): offered as this project's own copy, never changed from here ----

const C7_HOSTED = { type: 'http', url: 'https://mcp.context7.com/mcp' };
const inheritedC7 = (approval: Approval = 'pending', extra: Partial<InvRegistration> = {}) => reg('context7', 'inherited', C7_HOSTED, 'context7', 'remote', { from: '/work', file: '/work/.mcp.json', approval, shadowed: null, ...extra });

test('install offers an inherited row as this project\'s own copy, labelled with its folder and approval', () => {
    const i = inv(MAC, { registrations: [inheritedC7()] });
    const o = pickQuestions(i, catalog).flat().flatMap((q) => q.options).find((x) => x.label.startsWith('context7'));
    assert.strictEqual(o!.label, 'context7 (inherited from .. as context7, pending)');
    assert.match(o!.description, /^adds this project's own copy; the one inherited from \.\. stays in its folder - /);
    const both = inv(MAC, { registrations: [inheritedC7('approved'), reg('c7', 'user', C7_HOSTED, 'context7', 'remote')] });
    assert.strictEqual(pickQuestions(both, catalog).flat().flatMap((q) => q.options).find((x) => x.label.startsWith('context7'))!.label,
        'context7 (inherited from .. as context7, approved; installed for every project as c7)');
    const two = inv(MAC, { registrations: [inheritedC7(), inheritedC7('pending', { from: '/', file: '/.mcp.json' })] });
    assert.match(pickQuestions(two, catalog).flat().flatMap((q) => q.options).find((x) => x.label.startsWith('context7'))!.description,
        /^adds this project's own copy; the one inherited from \.\. and the one inherited from \.\.\/\.\. stay in their folders - /);
    const q = asks.allQuestions(i, { rows: ['context7'], routes: { context7: 'remote' } }, catalog);
    assert.match((q.tools as ToolsKeyed).context7!.questions!.find((x) => x.id === 'name-context7')!.options[0]!.description, /used instead of the one inherited from \.\./);
    const p = plan(i, pickOne('context7', { route: 'remote', scope: 'project' }), opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    assert.strictEqual(addStep(p).scope, 'project');
});

test('configure never lists an inherited server', () => {
    const own = reg('c7', 'local', { command: 'npx', args: ['-y', '@upstash/context7-mcp@4.4.4'] }, 'context7', 'local');
    const i = inv(MAC, { registrations: [inheritedC7(), own] });
    const ch = changeQuestions(i, catalog);
    assert.deepStrictEqual(Object.values(ch.keys), ['mcp:c7~local']);
    assert.deepStrictEqual(removeQuestions(i, catalog).flat().flatMap((q) => q.options.map((o) => o.label)).filter((l) => /inherited/.test(l)), []);
    assert.strictEqual(inventoryLib.targetOf(i, 'mcp:context7~inherited'), null);
    assert.ok(plan(i, { change: { 'mcp:context7~inherited': { row: 'context7', name: 'x' } } }, opts('/h')).errors.length > 0, 'a change keyed on it is refused');
});

test('a local copy over an inherited one notes which Claude Code uses', () => {
    const i = inv(MAC, { registrations: [inheritedC7('approved')] });
    const local = plan(i, pickOne('context7', { route: 'remote', scope: 'local' }), opts('/Users/me'));
    assert.deepStrictEqual(local.errors, []);
    assert.ok(local.notes.some((n) => /context7: 'context7' is also inherited from \.\. \(approved\); Claude Code uses this project's local copy/.test(n)), local.notes.join('\n'));
    const user = plan(i, pickOne('context7', { route: 'remote', scope: 'user' }), opts('/Users/me'));
    assert.ok(user.notes.some((n) => /Claude Code uses the inherited one from \.\. in this project/.test(n)), user.notes.join('\n'));
    const renamed = plan(i, pickOne('context7', { route: 'remote', scope: 'project', name: 'docs' }), opts('/Users/me'));
    assert.ok(renamed.notes.some((n) => /context7: also inherited as 'context7' from \.\. \(approved\) - change it there/.test(n)), renamed.notes.join('\n'));
});

// ---- windows-mcp: keep one per desktop --------------------------------------------------------------------------------

const WMCP = { command: 'uvx', args: ['--from', 'windows-mcp==0.8.8', 'windows-mcp', 'serve'] };
const alfredWin = (scope = 'user') => ({ id: 'windows-control@envoydev', plugin: 'windows-control', marketplace: 'envoydev', scope, enabled: true, rowId: null, alfredRetired: true });
const wdOption = (i: Inventory) => pickQuestions(i, catalog).flat().flatMap((q) => q.options).find((o) => o.label.startsWith(catalog.byId.get('windows-control')!.label));
const wdNotes = (p: Plan) => p.notes.filter((n) => n.startsWith('windows-control: keep one windows-mcp per Windows desktop'));

test('the windows-control pick names a windows-mcp that already starts here', () => {
    assert.match(wdOption(inv(WIN, { plugins: [alfredWin()] }))!.description, /; another windows-mcp already starts here \(windows-control@envoydev \(user\)\) - keep one per desktop$/);
    const atUser = wdOption(inv(WIN, { registrations: [reg('windows-desktop', 'user', WMCP, 'windows-control', 'local')] }));
    assert.ok(atUser, "offered as this project's own copy");
    assert.doesNotMatch(atUser.description, /another windows-mcp/);
    assert.doesNotMatch(wdOption(inv(WIN))!.description, /another windows-mcp/);
});

test('adding windows-control notes one windows-mcp per desktop', () => {
    const alone = plan(inv(WIN), pickOne('windows-control'), opts('C:\\Users\\me'));
    assert.deepStrictEqual(alone.errors, []);
    assert.deepStrictEqual(wdNotes(alone), ['windows-control: keep one windows-mcp per Windows desktop - another Claude Code session with it open can leave its tools unavailable until a new session starts it again']);
    const beside = wdNotes(plan(inv(WIN, { plugins: [alfredWin()] }), pickOne('windows-control'), opts('C:\\Users\\me')));
    assert.strictEqual(beside.length, 1);
    assert.match(beside[0]!, /another Claude Code session with it open, or windows-control@envoydev \(user\), can leave its tools unavailable/);
});

test('a copy that keeps the name is not another windows-mcp', () => {
    const i = inv(WIN, { registrations: [reg('windows-desktop', 'user', WMCP, 'windows-control', 'local')] });
    const kept = wdNotes(plan(i, pickOne('windows-control', { scope: 'local' }), opts('C:\\Users\\me')));
    assert.strictEqual(kept.length, 1);
    assert.doesNotMatch(kept[0]!, /windows-desktop \(user\)/);
    const prefixed = wdNotes(plan(i, pickOne('windows-control', { scope: 'local', name: 'prefixed' }), opts('C:\\Users\\me')));
    assert.strictEqual(prefixed.length, 1);
    assert.match(prefixed[0]!, /, or windows-desktop \(user\), can leave/);
});

// ---- alfred-code's folder (D3) --------------------------------------------------------------------------------------
const ALFRED = (p: string) => p === '/work/shop/.alfred/.gitignore';
const ALFRED_WIN = (p: string) => p === 'C:\\work\\shop\\.alfred\\.gitignore';

test('with alfred-code installed: .alfred/<name> at project and local, the account folder at user; memory too', () => {
    const at = (id: string, scope?: string, cat?: Catalog) => addStep(plan(inv(MAC, { alfredCodeEnabled: true }), pickOne(id, { scope }), opts('/Users/me', { exists: ALFRED, catalog: cat } as PlanOptions))).entry;
    assert.strictEqual(flag(at('playwright-chrome', 'local'), '--user-data-dir'), '/work/shop/.alfred/playwright-chrome');
    assert.strictEqual(flag(at('playwright-chrome', 'project', withRelative('playwright-chrome')), '--user-data-dir'), '/work/shop/.alfred/playwright-chrome');
    assert.strictEqual(flag(at('playwright-chrome', 'project', withoutRelative('playwright-chrome')), '--user-data-dir'), '/work/shop/.alfred/playwright-chrome', 'proven or not: the project root, absolute');
    assert.strictEqual(flag(at('playwright-chrome', 'user'), '--user-data-dir'), '/Users/me/.alfred-tools/playwright-chrome');
    assert.strictEqual((at('memory', 'local').env as EntryEnv).MCP_MEMORY_SQLITE_PATH, '/work/shop/.alfred/memory/memory.db');
    assert.strictEqual(at('serena', 'local').env!.SERENA_HOME, '/work/shop/.alfred/serena');
    // 'Use the recommended settings for all': no scope, no location - local scope, then the D3 table
    assert.strictEqual(flag(at('playwright-chrome', undefined), '--user-data-dir'), '/work/shop/.alfred/playwright-chrome');
    // a custom name names the folder
    const named = addStep(plan(inv(MAC, { alfredCodeEnabled: true }), pickOne('playwright-chrome', { name: 'shop-pw' }), opts('/Users/me', { exists: ALFRED }))).entry;
    assert.strictEqual(flag(named, '--user-data-dir'), '/work/shop/.alfred/shop-pw');
    // the plan creates the folder with its own .gitignore, inside .alfred too
    const p = plan(inv(MAC, { alfredCodeEnabled: true }), pickOne('playwright-chrome'), opts('/Users/me', { exists: ALFRED }));
    assert.ok(p.steps.some((s) => s.op === 'ensure-dir' && s.path === '/work/shop/.alfred/playwright-chrome'), JSON.stringify(p.steps.map((s) => s.op)));
});

test('without .alfred/.gitignore there is no alfred-data: today\'s folders, and an explicit pick is an error', () => {
    for (const [enabled, exists] of [[true, () => false], [false, ALFRED]] as [boolean, (p: string) => boolean][])
    {
        const p = plan(inv(MAC, { alfredCodeEnabled: enabled }), pickOne('playwright-chrome'), opts('/Users/me', { exists }));
        assert.deepStrictEqual(p.errors, []);
        assert.strictEqual(flag(addStep(p).entry, '--user-data-dir'), '/work/shop/.alfred-tools/playwright-chrome', `enabled ${enabled}`);
        assert.strictEqual(flag(addStep(plan(inv(MAC, { alfredCodeEnabled: enabled }), pickOne('playwright-chrome', { scope: 'user' }), opts('/Users/me', { exists }))).entry, '--user-data-dir'), '/Users/me/.alfred-tools/playwright-chrome', 'global scope: the global root');
        const picked = plan(inv(MAC, { alfredCodeEnabled: enabled }), pickOne('playwright-chrome', { location: { side: 'alfred-data' } }), opts('/Users/me', { exists }));
        assert.match(picked.errors.join(' '), /alfred-code is not set up here \(no \.alfred\/\.gitignore\) - pick another folder/);
        assert.strictEqual(picked.steps.length, 0);
    }
});

test('the name guard: docs, state, statistics, workspace, flow and an .alfred/<name> file are refused', () => {
    assert.deepStrictEqual(ALFRED_ENTRIES, ['docs', 'state', 'statistics', 'workspace', 'flow']);
    for (const name of ['docs', 'state', 'statistics', 'workspace', 'flow'])
    {
        const picked = plan(inv(MAC, { alfredCodeEnabled: true }), pickOne('playwright-chrome', { name, location: { side: 'alfred-data' } }), opts('/Users/me', { exists: ALFRED }));
        assert.match(picked.errors.join(' '), new RegExp(`'${name}' is one of alfred-code's own entries under \\.alfred`), name);
        // no location picked: the recommended root is .alfred, which refuses the name too (spec D2); the plugin's own
        // root takes it
        const recommended = plan(inv(MAC, { alfredCodeEnabled: true }), pickOne('playwright-chrome', { name }), opts('/Users/me', { exists: ALFRED }));
        assert.match(recommended.errors.join(' '), /alfred-code's own entries/, name);
        const own = plan(inv(MAC, { alfredCodeEnabled: true }), { ...pickOne('playwright-chrome', { name }), roots: { project: { id: 'alfred-tools' } } }, opts('/Users/me', { exists: ALFRED }));
        assert.deepStrictEqual(own.errors, [], name);
        assert.strictEqual(flag(addStep(own).entry, '--user-data-dir'), `/work/shop/.alfred-tools/${name}`, name);
    }
    const file = (p: string) => ALFRED(p) || p === '/work/shop/.alfred/shop-pw';
    const asFile = plan(inv(MAC, { alfredCodeEnabled: true }), pickOne('playwright-chrome', { name: 'shop-pw', location: { side: 'alfred-data' } }), opts('/Users/me', { exists: file, isDir: () => false }));
    assert.match(asFile.errors.join(' '), /\.alfred\/shop-pw exists and is not a folder/);
    const asDir = plan(inv(MAC, { alfredCodeEnabled: true }), pickOne('playwright-chrome', { name: 'shop-pw', location: { side: 'alfred-data' } }), opts('/Users/me', { exists: file, isDir: () => true }));
    assert.deepStrictEqual(asDir.errors, []);
    assert.strictEqual(flag(addStep(asDir).entry, '--user-data-dir'), '/work/shop/.alfred/shop-pw');
});

test('serena on Windows with alfred-code: local takes <project>\\.alfred\\serena, global the global root; a spaced project path keeps <profile>\\.serena', () => {
    const home = (base: { os: string; arch: string; project: string }, pick: PickAnswer, exists: (p: string) => boolean) => {
        const p = plan(inv(base, { alfredCodeEnabled: true }), pickOne('serena', pick), opts('C:\\Users\\me', { exists }));
        assert.deepStrictEqual(p.errors, [], JSON.stringify(pick));
        return addStep(p).entry.env!.SERENA_HOME;
    };
    assert.strictEqual(home(WIN, {}, ALFRED_WIN), 'C:\\work\\shop\\.alfred\\serena');
    assert.strictEqual(home(WIN, { scope: 'user' }, ALFRED_WIN), 'C:\\Users\\me\\.alfred-tools\\serena');
    assert.strictEqual(home(WIN, { scope: 'project' }, ALFRED_WIN), 'C:\\work\\shop\\.alfred\\serena');
    assert.strictEqual(home(WIN, { location: { side: 'account' } }, ALFRED_WIN), 'C:\\Users\\me\\.alfred-tools\\serena', "serena's account folder on Windows is the global root's");
    assert.strictEqual(home(WIN, { location: { side: 'default' } }, ALFRED_WIN), 'C:\\Users\\me\\.serena', "'default' is the profile's .serena");
    const spaced = { ...WIN, project: 'C:\\my work\\shop' };
    assert.strictEqual(home(spaced, {}, (p: string) => p === 'C:\\my work\\shop\\.alfred\\.gitignore'), 'C:\\Users\\me\\.serena');
    const picked = plan(inv(spaced, { alfredCodeEnabled: true }), pickOne('serena', { location: { side: 'alfred-data' } }), opts('C:\\Users\\me', { exists: (p) => p === 'C:\\my work\\shop\\.alfred\\.gitignore' }));
    assert.match(picked.errors.join(' '), /space-free/);
});

test('configure: a local .alfred folder moved to project scope stays absolute, proven relative or not', () => {
    const local = installed('playwright-chrome', { scope: 'local', location: { side: 'path', path: '/work/shop/.alfred/playwright-chrome' } });
    assert.strictEqual(flag(local.entry, '--user-data-dir'), '/work/shop/.alfred/playwright-chrome');
    const i = inv(MAC, { registrations: [local], alfredCodeEnabled: true });
    for (const cat of [withRelative('playwright-chrome'), withoutRelative('playwright-chrome')])
    {
        const p = plan(i, changeOf(local, { scope: 'project' }), opts('/Users/me', { exists: ALFRED, catalog: cat }));
        assert.deepStrictEqual(p.errors, []);
        assert.strictEqual(flag((p.steps.find((s) => s.op === 'mcp-move') as McpMoveStep).entry, '--user-data-dir'), '/work/shop/.alfred/playwright-chrome');
    }
});

// ---- the location question (D4) and scope and name first (D5) -----------------------------------------------------
test('location labels name the place; descriptions give the exact folder; the answers map covers every label', () => {
    const q = (scope: string, alfred: boolean, cat = catalog) => locationQuestion(cat.byId.get('memory')!, inv(WIN, { alfredCodeEnabled: alfred }), { scope, context: { project: WIN.project, platform: 'win32', home: 'C:\\Users\\mac', env: {}, exists: (p) => alfred && p === 'C:\\work\\shop\\.alfred\\.gitignore' } });
    // memory keeps its data in the root of its scope: one place, nothing to ask
    for (const scope of ['local', 'project']) assert.deepStrictEqual([q(scope, true).question, q(scope, true).only], [null, { side: 'project' }], scope);
    const unproven = q('project', true, withoutRelative('memory'));
    assert.deepStrictEqual([unproven.question, unproven.only], [null, { side: 'project' }], 'proven relative or not');
    // a tool with one place asks nothing
    const pw = locationQuestion(catalog.byId.get('playwright-chrome')!, inv(MAC, { alfredCodeEnabled: true }), { scope: 'local', context: { project: '/work/shop', platform: 'darwin', home: '/Users/me', env: {}, exists: ALFRED } });
    assert.deepStrictEqual([pw.question, pw.only], [null, { side: 'project' }]);
    // serena: a folder in each project downloads its language servers once per project
    const serena = locationQuestion(catalog.byId.get('serena')!, inv(MAC, { alfredCodeEnabled: true }), { scope: 'local', current: { name: 'serena', scope: 'local', rootStr: '/Users/me/.serena' }, context: { project: '/work/shop', platform: 'darwin', home: '/Users/me', env: {}, exists: ALFRED } });
    assert.deepStrictEqual(serena.question!.options.map((o) => o.label), ['The folder it uses now (Recommended)', "The project root's folder"]);
    assert.match(serena.question!.options[1]!.description, /^\/work\/shop\/\.alfred\/serena - this project's own; its language servers \(about 327MB\) download once per project$/);
});

test('serena on Windows: the root when it is space-free, the profile .serena when the root has a space, Another space-free folder', () => {
    const q = (project: string, scope: string) => locationQuestion(catalog.byId.get('serena')!, inv({ ...WIN, project }, { alfredCodeEnabled: true }), { scope, context: { project, platform: 'win32', home: 'C:\\Users\\me', env: {}, exists: (p) => p === `${project}\\.alfred\\.gitignore` } });
    assert.deepStrictEqual(q('C:\\work\\shop', 'local'), { question: null, answers: {}, only: { side: 'project' } });
    const spaced = q('C:\\my work\\shop', 'local');
    assert.deepStrictEqual(spaced.question!.options.map((o) => o.label), ["Your profile's .serena (Recommended)", 'Another space-free folder']);
    assert.match(spaced.question!.options[0]!.description, /^C:\\Users\\me\\\.serena - the root's path has a space/);
    assert.deepStrictEqual(Object.values(spaced.answers), [{ side: 'default' }]);
    assert.deepStrictEqual(q('C:\\work\\shop', 'project'), { question: null, answers: {}, only: { side: 'project' } }, 'project scope: <root>\\serena too');
});

test('--questions: a location row asks scope and name first; the location follows them; no scopes or names - the recommended scope and the original name', { skip: POSIX_FIXTURE }, () => {
    // a row with two places: Playwright with alfred-code 2.x data on disk
    const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pt-loc-')));
    fs.mkdirSync(path.join(project, '.alfred', 'chrome-control'), { recursive: true });
    try
    {
        const at = (picks: Picks) => asks.allQuestions(inv({ ...MAC, project }), { rows: ['playwright-chrome'], ...picks }, catalog, { home: '/Users/me' }).tools['playwright-chrome'];
        const loc = (t: ToolBlock) => t.questions!.find((q) => q.id === 'location-playwright-chrome');
        const first = at({});
        assert.deepStrictEqual(first!.first!.map((q) => q.id), ['scope-playwright-chrome', 'name-playwright-chrome']);
        assert.ok(!first!.questions!.some((q) => /^(scope|name)-/.test(q.id)));
        assert.ok(loc(first!)!.options[0]!.description.startsWith(`${project}/.alfred-tools/playwright-chrome`), loc(first!)!.options[0]!.description); // Review Focus 1
        assert.deepStrictEqual(Object.values(first!.answers!), [{ side: 'project' }, { side: 'alfred' }]);
        assert.match(loc(at({ scopes: { 'playwright-chrome': 'local' }, names: { 'playwright-chrome': 'shop-pw' } })!)!.options[0]!.description, /\.alfred-tools[\\/]shop-pw/);
        assert.match(loc(at({ names: { 'playwright-chrome': 'keep' } })!)!.options[0]!.description, /\.alfred-tools\/playwright-chrome /);
        // the roots answered so far place the folder
        assert.ok(loc(at({ roots: { project: { id: 'named', path: 'tools/keys' } } })!)!.options[0]!.description.startsWith(`${project}/tools/keys/playwright-chrome `));
    }
    finally { fs.rmSync(project, { recursive: true, force: true }); }
    // memory keeps its data in the root of its scope: scope and name first, no location question
    const mem = (asks.allQuestions(inv(MAC), { rows: ['memory'] }, catalog, { home: '/Users/me' }).tools as ToolsKeyed).memory;
    assert.deepStrictEqual([mem!.first!.map((q) => q.id), mem!.questions!.some((q) => q.id === 'location-memory'), mem!.only], [['scope-memory', 'name-memory'], false, { side: 'project' }]);
    const pw = asks.allQuestions(inv(MAC), { rows: ['playwright-chrome'] }, catalog).tools['playwright-chrome'];
    assert.deepStrictEqual([pw!.questions!.some((q) => q.id === 'location-playwright-chrome'), pw!.only], [false, { side: 'project' }], 'one place: no location question');
    const c7 = (asks.allQuestions(inv(MAC), { rows: ['context7'] }, catalog).tools as ToolsKeyed).context7;
    assert.strictEqual(c7!.first, null);
    assert.deepStrictEqual(c7!.answers, {});
    assert.ok(c7!.questions!.some((q) => q.id === 'scope-context7'), 'a row without a folder keeps scope in its one call');
    // configure: the same order for a target
    const play = { command: 'npx', args: ['-y', '@playwright/mcp@0.0.83', '--browser', 'chrome', '--user-data-dir', '/work/shop/.alfred-tools/pw'] };
    const t = asks.allQuestions(inv(MAC, { registrations: [reg('pw', 'local', play, 'playwright-chrome', 'local')] }), { targets: ['mcp:pw~local'], scopes: { 'mcp:pw~local': 'user' } }, catalog).targets['mcp:pw~local'];
    assert.deepStrictEqual(t!.first!.map((q) => q.id), ['scope-playwright-chrome', 'name-playwright-chrome']);
    const loc = t!.questions!.find((q) => q.id === 'location-playwright-chrome');
    assert.strictEqual(loc!.options[0]!.label, 'The folder it uses now (Recommended)');
    assert.strictEqual(t!.answers!['The folder it uses now (Recommended)']!.side, 'keep');
});

test('every question has 2 to 4 options, one Recommended and first: each scope, with and without alfred-code, relative or not', () => {
    const located = catalog.tools.filter((r) => r.locations).map((r) => r.id);
    for (const base of [MAC, LINUX, WIN, WINARM])
        for (const alfred of [false, true])
            for (const old of [false, true])
                for (const cat of [catalog, withRelative(...located)])
                {
                    const i = inv(base, { alfredCodeEnabled: alfred });
                    const P = base.os === 'win32' ? path.win32 : path.posix;
                    const gi = P.join(base.project, '.alfred', '.gitignore');
                    // old: alfred-code 2.x data on disk as well (its folders are under .alfred and ~)
                    const exists = (p: string) => p === gi || (old && /alfred/.test(p) && !p.endsWith('.gitignore'));
                    const ctx = { project: base.project, platform: base.os, arch: base.arch, home: base.os === 'win32' ? 'C:\\Users\\me' : '/Users/me', env: {}, exists, isDir: () => true };
                    for (const row of cat.tools.filter((r) => r.os.includes(base.os) && r.locations))
                        for (const scope of scopesFor(row, row.recommendedRoute, ctx))
                        {
                            const l = locationQuestion(row, i, { scope, context: ctx });
                            const at = `${base.os} ${row.id} ${scope} alfred:${alfred} 2.x:${old}`;
                            if (!l.question) { assert.ok(l.only, at); continue; }
                            checkQuestion(l.question);
                            for (const o of l.question.options) assert.ok(l.answers[o.label] || /^Another/.test(o.label), `${at}: '${o.label}' has no answer`);
                        }
                    for (const row of cat.tools.filter((r) => r.os.includes(base.os)))
                    {
                        const s = scopeQuestion(row, i, { context: ctx });
                        if (s) checkQuestion(s);
                    }
                }
});

// ---- final review fixes ---------------------------------------------------------------------------------------------
test("the alfred-code name guard ignores case: 'Docs' or 'STATE' is alfred-code's own folder on macOS and Windows", () => {
    const ctx = { project: '/work/shop', platform: 'darwin', exists: () => false } as unknown as Machine;
    assert.match(alfredNameProblem('Docs', ctx) || '', /one of alfred-code's own entries under \.alfred/);
    assert.match(alfredNameProblem('STATE', ctx) || '', /one of alfred-code's own entries under \.alfred/);
    assert.strictEqual(alfredNameProblem('docs-browser', ctx), null);
    const p = plan(inv(MAC, { alfredCodeEnabled: true }), pickOne('playwright-chrome', { scope: 'local', name: 'Docs', location: { side: 'alfred-data' } }), opts('/Users/me', { exists: ALFRED }));
    assert.match(p.errors.join(' '), /'Docs' is one of alfred-code's own entries/);
});

test('configure: a move that leaves one folder writes it - --questions carries `only` and the plan takes it', () => {
    // serena on Windows in alfred-code's folder, moved to project scope: the folder it uses now is the one place left
    const serena = installed('serena', { scope: 'local', location: { side: 'path', path: 'C:\\work\\shop\\.alfred\\serena' } }, WIN, 'C:\\Users\\me');
    const i = inv(WIN, { registrations: [serena], alfredCodeEnabled: true });
    const key = `mcp:${serena.name}~local`;
    const t = asks.allQuestions(i, { targets: [key], scopes: { [key]: 'project' } }, catalog, { home: 'C:\\Users\\me' }).targets[key];
    assert.ok(!t!.questions!.some((q) => q.id === 'location-serena'), JSON.stringify(t!.questions!.map((q) => q.id)));
    assert.deepStrictEqual(t!.only, { side: 'keep' });
    const moved = plan(i, changeOf(serena, { scope: 'project', location: t!.only }), opts('C:\\Users\\me'));
    assert.deepStrictEqual(moved.errors, []);
    assert.strictEqual((moved.steps.find((s) => s.op === 'mcp-move') as McpMoveStep).entry.env!.SERENA_HOME, 'C:\\work\\shop\\.alfred\\serena');
    // a row not proven relative, moved to project: its folder in the project root stays, absolute
    const cat = withoutRelative('playwright-chrome');
    const pw = installed('playwright-chrome', { scope: 'local' });
    const j = inv(MAC, { registrations: [pw] });
    const k = `mcp:${pw.name}~local`;
    const u = asks.allQuestions(j, { targets: [k], scopes: { [k]: 'project' } }, cat, { home: '/Users/me' }).targets[k];
    assert.deepStrictEqual(u!.only, { side: 'keep' });
    assert.deepStrictEqual(plan(j, changeOf(pw, { scope: 'project', location: u!.only }), opts('/Users/me', { catalog: cat })).errors, []);
    // a location question asked: no `only`
    const elsewhere = installed('playwright-chrome', { scope: 'local', location: { side: 'path', path: '/work/shop/tools/pw' } });
    const m = inv(MAC, { registrations: [elsewhere] });
    assert.strictEqual(asks.allQuestions(m, { targets: [`mcp:${elsewhere.name}~local`] }, catalog, { home: '/Users/me' }).targets[`mcp:${elsewhere.name}~local`]!.only, null);
    // the folder it uses now is the root's: the one place left is to keep it
    assert.deepStrictEqual(asks.allQuestions(j, { targets: [k] }, catalog, { home: '/Users/me' }).targets[k]!.only, { side: 'keep' });
});

test('project scope: --executable-path takes this machine\'s binary - named, kept on a move, and the browser question keeps it', () => {
    const bin = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const named = plan(inv(MAC), pickOne('playwright-chrome', { scope: 'project', executablePath: bin }), opts('/Users/me'));
    assert.deepStrictEqual(named.errors, []);
    assert.strictEqual(flag(addStep(named).entry, '--executable-path'), bin);
    const local = installed('playwright-chrome', { scope: 'local', executablePath: '/opt/chrome' });
    const i = inv(MAC, { registrations: [local] });
    const moved = plan(i, changeOf(local, { scope: 'project' }), opts('/Users/me'));
    assert.deepStrictEqual(moved.errors, []);
    assert.strictEqual(flag((moved.steps.find((s) => s.op === 'mcp-move') as McpMoveStep).entry, '--executable-path'), '/opt/chrome');
    assert.ok(!moved.notes.some((n) => /left out/.test(n)), moved.notes.join('\n'));
    const key = `mcp:${local.name}~local`;
    const browser = asks.allQuestions(i, { targets: [key], scopes: { [key]: 'project' } }, catalog, { home: '/Users/me' }).targets[key]!.questions!.find((q) => q.id === 'browser-playwright-chrome');
    assert.strictEqual(browser!.options[0]!.label, 'Keep `/opt/chrome` (Recommended)');
    const fresh = asks.allQuestions(inv(MAC), { rows: ['playwright-chrome'], scopes: { 'playwright-chrome': 'project' } }, catalog, { home: '/Users/me' }).tools['playwright-chrome']!.questions!.find((q) => q.id === 'browser-playwright-chrome');
    assert.strictEqual(fresh!.options.find((o) => o.label === 'A browser binary I name')!.description, 'sets --executable-path to the binary you name, asked next');
});

test("a move to project scope keeps the machine paths in env: appium's SDK homes and the user's own", () => {
    const local = installed('appium', { scope: 'local' });
    const withSdk = { ...local, entry: { ...local.entry, env: { ...local.entry.env, ANDROID_HOME: '/Users/me/Library/Android/sdk', JAVA_HOME: '/Library/Java/JavaVirtualMachines/jdk-21/Contents/Home', MY_TOOL: '/Users/me/bin/tool' } } };
    const moved = plan(inv(MAC, { registrations: [withSdk] }), changeOf(withSdk, { scope: 'project' }), opts('/Users/me'));
    assert.deepStrictEqual(moved.errors, []);
    const env = (moved.steps.find((s) => s.op === 'mcp-move') as McpMoveStep).entry.env;
    assert.deepStrictEqual([(env as EntryEnv).ANDROID_HOME, (env as EntryEnv).JAVA_HOME, (env as EntryEnv).MY_TOOL], ['/Users/me/Library/Android/sdk', '/Library/Java/JavaVirtualMachines/jdk-21/Contents/Home', '/Users/me/bin/tool']);
    assert.ok(!moved.notes.some((n) => /left out/.test(n)), moved.notes.join('\n'));
});

// ---- minor findings -------------------------------------------------------------------------------------------------
test('serena on Windows with a spaced root and profile: a space-free folder is offered and recommended, so the question has two options', () => {
    const home = 'C:\\Users\\Jane Doe';
    const project = 'C:\\my work\\shop';
    const ctx = { project, platform: 'win32', home, env: {}, exists: () => false };
    const l = locationQuestion(catalog.byId.get('serena')!, inv({ ...WIN, project }), { scope: 'local', context: ctx });
    assert.ok(l.question, 'asked');
    checkQuestion(l.question);
    assert.strictEqual(l.question.options[0]!.label, 'A space-free folder (Recommended)');
    assert.match(l.question.options[0]!.description, /^C:\\serena-home - /);
    assert.deepStrictEqual(l.answers['A space-free folder (Recommended)'], { side: 'path', path: 'C:\\serena-home' });
    // the plan's default is the same folder, never an error
    const p = plan(inv({ ...WIN, project }), pickOne('serena', { scope: 'local' }), opts(home));
    assert.deepStrictEqual(p.errors, []);
    assert.strictEqual(addStep(p).entry.env!.SERENA_HOME, 'C:\\serena-home');
    // the system drive, when the environment names it
    const d = locationQuestion(catalog.byId.get('serena')!, inv({ ...WIN, project }), { scope: 'local', context: { ...ctx, env: { SystemDrive: 'D:' } } });
    assert.deepStrictEqual(d.answers['A space-free folder (Recommended)'], { side: 'path', path: 'D:\\serena-home' });
});

test("the question's recommended folder and the plan's default write the same entry: every located row and scope, alfred-code or not, a spaced profile, a guarded name", () => {
    const located = catalog.tools.filter((r) => r.locations);
    for (const base of [MAC, WIN])
        for (const home of base.os === 'win32' ? ['C:\\Users\\me', 'C:\\Users\\Jane Doe'] : ['/Users/me'])
            for (const alfred of [false, true])
                for (const name of [undefined, 'docs'])
                {
                    const P = base.os === 'win32' ? path.win32 : path.posix;
                    const gi = P.join(base.project, '.alfred', '.gitignore');
                    const exists = (p: string) => alfred && p === gi;
                    const i = inv(base, { alfredCodeEnabled: alfred });
                    const ctx = { project: base.project, platform: base.os, arch: base.arch, home, env: {}, exists };
                    for (const row of located.filter((r) => r.os.includes(base.os)))
                        for (const scope of scopesFor(row, row.recommendedRoute, ctx))
                        {
                            const at = `${base.os} ${home} ${row.id} ${scope} alfred:${alfred} name:${name}`;
                            const l = locationQuestion(row, i, { scope, name, context: ctx });
                            if (l.question) checkQuestion(l.question);
                            const rec = l.question ? l.answers[l.question.options[0]!.label] : l.only;
                            assert.ok(rec, `${at}: the recommended option has an answer`);
                            const pick = { scope, ...(name ? { name } : {}) };
                            const byDefault = plan(i, pickOne(row.id, pick), opts(home, { exists }));
                            const byAnswer = plan(i, pickOne(row.id, { ...pick, location: rec }), opts(home, { exists }));
                            assert.deepStrictEqual(byDefault.errors, byAnswer.errors, at);
                            assert.deepStrictEqual(addStep(byDefault) && addStep(byDefault).entry, addStep(byAnswer) && addStep(byAnswer).entry, at);
                        }
                }
});

test('scope options read Global, Project and Local, the recommended first; the value stays user, project or local', () => {
    const q = (asks.allQuestions(inv(MAC), { rows: ['atlassian'] }, catalog).tools as ToolsKeyed).atlassian!.questions!.find((x) => x.id === 'scope-atlassian');
    assert.deepStrictEqual(q!.options.map((o) => o.label), ['Global (Recommended)', 'Project', 'Local']);
    assert.match(q!.options[0]!.description, /every project on this machine \(Claude Code's user scope, in ~\/\.claude\.json\)/);
    assert.match(q!.options[2]!.description, /this project, only you \(~\/\.claude\.json, under this project\)/);
    assert.deepStrictEqual(q!.options.map((o) => scopeOfLabel(o.label)), ['user', 'project', 'local']);
    assert.deepStrictEqual(SCOPE_LABEL, { user: 'Global', project: 'Project', local: 'Local' });
    const step = addStep(plan(inv(MAC), pickOne('atlassian', { scope: 'user' }), opts('/Users/me')));
    assert.deepStrictEqual(argvOf(step)!.slice(-2), ['-s', 'user']);
});

test('the plan output says \'global (user scope)\' once, then \'global\'', () => {
    const p = plan(inv(MAC), { picks: { atlassian: { scope: 'user' }, gitlab: { scope: 'user' } } }, opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    const text = renderPlan(p);
    assert.strictEqual(text.split('global (user scope)').length - 1, 1, text);
    assert.match(text.slice(text.indexOf('global (user scope)') + 1), /\bglobal\b/);
    assert.doesNotMatch(text, /\buser scope\b(?!\))/, 'no bare user scope in the prose');
    assert.match(text, /-s user/, 'the command keeps the value');
});

test('answers.roots: a named project folder outside the project is a plan error with its reason; none given takes the recommended root', () => {
    const pick = pickOne('playwright-chrome');
    const bad = plan(inv(MAC), { ...pick, roots: { project: { id: 'named', path: '../keys' } } }, opts('/Users/me'));
    assert.match(bad.errors.join(), /root.*\.\./);
    const none = plan(inv(MAC), pick, opts('/Users/me'));
    assert.deepStrictEqual(none.errors, []);
    assert.deepStrictEqual(none.roots, { project: '/work/shop/.alfred-tools', global: '/Users/me/.alfred-tools', globalNamed: false });
    const named = plan(inv(MAC), { ...pick, roots: { project: { id: 'named', path: 'tools/keys' }, global: { id: 'named', path: '~/keys' } } }, opts('/Users/me'));
    assert.deepStrictEqual(named.roots, { project: '/work/shop/tools/keys', global: '/Users/me/keys', globalNamed: true });
    assert.match(plan(inv(MAC), { ...pick, roots: { global: { id: 'nowhere' } } }, opts('/Users/me')).errors.join(), /nowhere/);
});

test('plan.js --questions takes --data after its files and refuses an unknown flag', () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pt-plan-main-')));
    const out: string[] = [];
    const log = console.log;
    const err = console.error;
    try
    {
        const project = path.join(dir, 'shop');
        const named = path.join(project, 'tools', 'keys');
        const data = path.join(dir, 'data');
        for (const d of [named, data]) fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(data, 'roots.json'), JSON.stringify({ version: 1, global: null, projects: { [roots.mapKey(project)]: named } }));
        const invFile = path.join(dir, 'inv.json');
        const picksFile = path.join(dir, 'picks.json');
        fs.writeFileSync(invFile, JSON.stringify(inv({ ...MAC, project })));
        fs.writeFileSync(picksFile, JSON.stringify({ rows: ['playwright-chrome'] }));
        console.log = (s) => out.push(s);
        console.error = () => {};
        assert.strictEqual(runPlanCommand(['--questions', invFile, picksFile, '--data', data]), 0);
        const q = JSON.parse(out.pop()!).roots.questions[0];
        assert.strictEqual(q.options[0].description.startsWith(named), true, q.options[0].description);
        assert.strictEqual(runPlanCommand(['--questions', invFile, '--data', data]), 0);
        const bare = JSON.parse(out.pop()!);
        assert.deepStrictEqual([bare.tools, bare.roots.questions], [{}, []], 'no picks file read');
        assert.strictEqual(runPlanCommand(['--questions', invFile, picksFile, '--bogus']), 2);
        assert.strictEqual(runPlanCommand(['--questions', invFile, '--data']), 2, 'a flag without its value');
    }
    finally
    {
        console.log = log;
        console.error = err;
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

// ---- 0.2.0: data folders in the root (spec D2) ----------------------------------------------------------------------
// alfred-code 3.9.2's pattern, cited where it lives
const ALFRED_ROOT = { project: { id: 'alfred' } };
const callsOf = (x: Question[][] | { calls: Question[][] } | null) => (Array.isArray(x) ? x : (x && x.calls) || []).flat();

test('a pick\'s data folder is <root>/<name>, absolute at every scope', () => {
    const o = opts('/Users/me', { exists: ALFRED });
    const at = (scope: string, extra: PickAnswer = {}) => flag(addStep(plan(inv(MAC, { alfredCodeEnabled: true }), { picks: { 'playwright-chrome': { scope, ...extra } }, roots: ALFRED_ROOT }, o)).entry, '--user-data-dir');
    assert.strictEqual(at('project'), '/work/shop/.alfred/playwright-chrome');
    assert.strictEqual(at('local'), '/work/shop/.alfred/playwright-chrome');
    assert.strictEqual(at('user'), '/Users/me/.alfred-tools/playwright-chrome', 'global scope: the global root');
    assert.strictEqual(at('local', { name: 'shop-pw' }), '/work/shop/.alfred/shop-pw', 'named after the registration');
    const named = (scope: string) => flag(addStep(plan(inv(MAC), { picks: { 'playwright-chrome': { scope } }, roots: { project: { id: 'named', path: 'tools/keys' }, global: { id: 'named', path: '/srv/keys' } } }, opts('/Users/me'))).entry, '--user-data-dir');
    assert.strictEqual(named('project'), '/work/shop/tools/keys/playwright-chrome');
    assert.strictEqual(named('local'), '/work/shop/tools/keys/playwright-chrome');
    assert.strictEqual(named('user'), '/srv/keys/playwright-chrome');
    // no roots answer: the recommended root, as the walk's 'recommended for all' takes it
    assert.strictEqual(flag(addStep(plan(inv(MAC), pickOne('playwright-chrome'), opts('/Users/me'))).entry, '--user-data-dir'), '/work/shop/.alfred-tools/playwright-chrome');
    assert.strictEqual(flag(addStep(plan(inv(MAC, { alfredCodeEnabled: true }), pickOne('playwright-chrome'), o)).entry, '--user-data-dir'), '/work/shop/.alfred/playwright-chrome');
});

test('memory: its data in the root of its scope - the project root at project and local scope, the global root at user scope, nothing asked', () => {
    const q = (scope: string, rootAnswers: Roots | null = null) => locationQuestion(catalog.byId.get('memory')!, inv(MAC), { scope, context: { project: '/work/shop', platform: 'darwin', home: '/Users/me', env: {}, exists: () => false, roots: rootAnswers } });
    for (const scope of ['local', 'project']) assert.deepStrictEqual([q(scope).question, q(scope).only], [null, { side: 'project' }], scope);
    const far = q('project', { project: '/work/shop/.alfred-tools', global: '/srv/keys', globalNamed: true });
    assert.deepStrictEqual([far.question, far.only], [null, { side: 'project' }]);
    assert.deepStrictEqual([q('user').question, q('user').only], [null, { side: 'account' }], 'global scope: one place');
    const db = (scope: string, roots?: Answers['roots']) => (addStep(plan(inv(MAC), { picks: { memory: { scope } }, roots } as Answers, opts('/Users/me'))).entry.env as EntryEnv).MCP_MEMORY_SQLITE_PATH;
    assert.strictEqual(db('local'), '/work/shop/.alfred-tools/memory/memory.db');
    assert.strictEqual(db('user'), '/Users/me/.alfred-tools/memory/memory.db');
    assert.strictEqual(db('project'), '/work/shop/.alfred-tools/memory/memory.db');
    assert.strictEqual(db('project', { global: { id: 'named', path: '/srv/keys' } }), '/work/shop/.alfred-tools/memory/memory.db');
    assert.strictEqual((addStep(plan(inv(MAC), { picks: { memory: { location: { side: 'project' } } } }, opts('/Users/me'))).entry.env as EntryEnv).MCP_MEMORY_SQLITE_PATH, '/work/shop/.alfred-tools/memory/memory.db');
});

test('serena on Windows: a spaced root gets the space-free folder recommended; project scope as local scope', () => {
    const serena = catalog.byId.get('serena');
    const ctxOf = (project: string, home: string) => ({ project, platform: 'win32', home, env: {}, exists: () => false });
    const spaced = locationQuestion(serena!, inv({ ...WIN, project: 'C:\\my work\\shop' }), { scope: 'local', context: ctxOf('C:\\my work\\shop', 'C:\\Users\\me') });
    assert.deepStrictEqual(spaced.question!.options.map((o) => o.label), ["Your profile's .serena (Recommended)", 'Another space-free folder']);
    assert.match(spaced.question!.options[1]!.description, /asked next$/);
    const both = locationQuestion(serena!, inv(WIN), { scope: 'user', context: ctxOf('C:\\work\\shop', 'C:\\Users\\Jo Doe') });
    assert.deepStrictEqual(both.question!.options.map((o) => o.label), ['A space-free folder (Recommended)', 'Another space-free folder']);
    const clean = locationQuestion(serena!, inv(WIN), { scope: 'local', context: ctxOf('C:\\work\\shop', 'C:\\Users\\Jo Doe') });
    assert.deepStrictEqual([clean.question, clean.only], [null, { side: 'project' }], 'a space-free root: <root>\\<name>, nothing to ask');
    const home = (base: { os: string; arch: string; project: string }, home: string, pick: PickAnswer = {}) => addStep(plan(inv(base), pickOne('serena', pick), opts(home))).entry.env!.SERENA_HOME;
    assert.strictEqual(home(WIN, 'C:\\Users\\Jo Doe'), 'C:\\work\\shop\\.alfred-tools\\serena');
    assert.strictEqual(home({ ...WIN, project: 'C:\\my work\\shop' }, 'C:\\Users\\me'), 'C:\\Users\\me\\.serena');
    assert.strictEqual(home(WIN, 'C:\\Users\\Jo Doe', { scope: 'user' }), 'C:\\serena-home');
    assert.strictEqual(home(WIN, 'C:\\Users\\me', { scope: 'project' }), 'C:\\work\\shop\\.alfred-tools\\serena');
    assert.strictEqual(home(WIN, 'C:\\Users\\Jo Doe', { scope: 'project' }), 'C:\\work\\shop\\.alfred-tools\\serena', 'a spaced profile no longer matters at project scope');
});

test('alfred-code 2.x data on disk adds \'Carry over alfred-code 2.x data\' beside <root>/<name>', () => {
    const pw = catalog.byId.get('playwright-chrome');
    const ctx = (present: string[]) => ({ project: '/work/shop', platform: 'darwin', home: '/Users/me', env: {}, exists: (p: string) => present.includes(p) });
    const old = locationQuestion(pw!, inv(MAC), { scope: 'local', context: ctx(['/work/shop/.alfred/chrome-control']) });
    assert.deepStrictEqual(old.question!.options.map((o) => o.label), ["The project root's folder (Recommended)", 'Carry over alfred-code 2.x data']);
    assert.deepStrictEqual(Object.values(old.answers), [{ side: 'project' }, { side: 'alfred' }]);
    const none = locationQuestion(pw!, inv(MAC), { scope: 'local', context: ctx([]) });
    assert.deepStrictEqual([none.question, none.only], [null, { side: 'project' }]);
});

test('the three typed values are asked next and no text the walk produces mentions Other', () => {
    const texts: string[] = [];
    const typed: Record<string, string> = {};
    for (const [base, home, alfred] of [[MAC, '/Users/me', false], [MAC, '/Users/me', true], [{ ...WIN, project: 'C:\\my work\\shop' }, 'C:\\Users\\Jo Doe', false], [{ ...WIN, project: 'C:\\my work\\shop' }, 'C:\\Users\\Jo Doe', true]] as [{ os: string; arch: string; project: string }, string, boolean][])
    {
        const rows = catalog.tools.filter((r) => r.kind === 'mcp' && !((r as CatalogRow & { platforms?: string[] }).platforms && !(r as CatalogRow & { platforms?: string[] }).platforms!.includes(base.os)));
        // every MCP row installed once, so each gets a configure target
        const regs = rows.map((r) => { const s = addStep(plan(inv(base), pickOne(r.id), opts(home, { exists: () => false }))); return s && reg(s.name, s.scope, s.entry, r.id, s.route); }).filter(Boolean);
        const i = inv(base, { alfredCodeEnabled: alfred, registrations: regs });
        const env = {};
        const q = asks.allQuestions(i, { rows: catalog.tools.map((r) => r.id), targets: regs.map((r) => `mcp:${r.name}~${r.scope}`) }, catalog, { env, home });
        const all = [
            ...Object.values(q.static as Record<string, Question>).flatMap((x) => (x.options ? [x] : [])), ...callsOf(q.pick), ...callsOf(q.change), ...callsOf(q.remove), ...q.roots!.questions,
            ...Object.values(q.tools).flatMap((t) => [...(t.first || []), ...(t.questions || []), ...(t.route ? [t.route] : [])]),
            ...Object.values(q.targets).flatMap((t) => [...(t.first || []), ...(t.questions || []), ...(t.route ? [t.route] : [])]),
        ];
        assert.ok(alfred || base.os !== 'win32' || Object.values(q.tools).some((t) => (t.questions || []).some((x) => x.id === 'location-serena')), 'the spaced Windows root asks serena\'s folder');
        for (const x of all)
        {
            texts.push(x.question, x.header, ...x.options.flatMap((o) => [o.label, o.description]));
            for (const o of x.options) if (['Another space-free folder', 'A browser binary I name', 'A self-managed host'].includes(o.label.replace(/ \(Recommended\)$/, ''))) typed[o.label] = o.description;
        }
    }
    for (const t of texts.filter(Boolean))
    {
        assert.doesNotMatch(t, OTHER_RE, t);
        assert.doesNotMatch(t, /under Other/, t);
    }
    assert.deepStrictEqual(Object.keys(typed).sort(), ['A browser binary I name', 'A self-managed host', 'Another space-free folder']);
    for (const [label, d] of Object.entries(typed)) assert.match(d, /asked next$/, label);
});

test('an .alfred project root refuses a registration named after one of alfred-code\'s own entries', () => {
    const o = opts('/Users/me', { exists: ALFRED });
    const p = plan(inv(MAC, { alfredCodeEnabled: true }), { picks: { memory: { name: 'state', scope: 'local' } }, roots: ALFRED_ROOT }, o);
    assert.match(p.errors.join(), /alfred-code's own entries under \.alfred/);
    assert.strictEqual((p.steps.filter((s) => s.op === 'mcp-add') as McpAddStep[]).length, 0);
    const fileThere = plan(inv(MAC, { alfredCodeEnabled: true }), { picks: { 'playwright-chrome': { name: 'shop-pw' } }, roots: ALFRED_ROOT }, opts('/Users/me', { exists: (x) => ALFRED(x) || x === '/work/shop/.alfred/shop-pw', isDir: () => false }));
    assert.match(fileThere.errors.join(), /\.alfred\/shop-pw exists and is not a folder/);
    const elsewhere = plan(inv(MAC, { alfredCodeEnabled: true }), { picks: { memory: { name: 'state', scope: 'local' } }, roots: { project: { id: 'alfred-tools' } } }, o);
    assert.deepStrictEqual(elsewhere.errors, [], 'another project root takes the name');
});

// ---- 0.2.0: hosted keys through the header helper; D5's routes and scopes -----------------------------------------
const SECRETS_FILE = FILES.secrets;
const helperOf = (p: Plan, id: string) => { const s = p.steps.find((x) => x.op === 'mcp-add' && x.row === id) as McpAddStep | undefined; return s ? s.entry.headersHelper : undefined; };

test('D5: each keyed route at each scope', () => {
    const o = opts('/Users/me');
    const at = (id: string, pick: PickAnswer) => plan(inv(MAC), pickOne(id, pick), o);
    for (const scope of ['project', 'local', 'user'])
    {
        // github hosted: required - the helper at every scope
        assert.match(helperOf(at('github', { route: 'remote', scope }), 'github')!, /mcp-headers\.js GITHUB_PERSONAL_ACCESS_TOKEN Bearer$/, scope);
        // context7 hosted: the helper when picked, else none
        assert.match(helperOf(at('context7', { route: 'remote', scope, token: true }), 'context7')!, /mcp-headers\.js CONTEXT7_API_KEY Bearer$/, scope);
        assert.strictEqual(helperOf(at('context7', { route: 'remote', scope, token: false }), 'context7'), undefined, scope);
        // sentry hosted: OAuth, or the helper with Sentry-Bearer
        const oauth = at('sentry', { route: 'remote', scope, token: false });
        assert.deepStrictEqual([helperOf(oauth, 'sentry'), oauth.oauth.map((x) => x.row)], [undefined, ['sentry']], scope);
        assert.match(helperOf(at('sentry', { route: 'remote', scope, token: true }), 'sentry')!, /mcp-headers\.js SENTRY_ACCESS_TOKEN Sentry-Bearer$/, scope);
        // gitlab and atlassian hosted: the key by default (spec F2), OAuth when picked
        for (const [id, v, scheme] of [['gitlab', 'GITLAB_TOKEN', 'Bearer'], ['atlassian', 'ATLASSIAN_API_TOKEN', 'Basic']])
        {
            const p = at(id!, { scope });
            assert.deepStrictEqual(p.errors, [], `${id} ${scope}`);
            assert.match(helperOf(p, id!)!, new RegExp(`mcp-headers\\.js ${v} ${scheme}$`), `${id} ${scope}`);
            assert.deepStrictEqual(p.oauth, [], `${id} ${scope}`);
            const o = at(id!, { scope, token: false });
            assert.deepStrictEqual([o.errors, helperOf(o, id!), o.oauth.map((x) => x.row)], [[], undefined, [id]], `${id} ${scope}`);
        }
    }
    // github Docker and sentry npm: not offered at project scope, written in at local and global scope
    for (const [id, route] of [['github', 'local'], ['sentry', 'local']])
    {
        assert.match(at(id!, { route, scope: 'project' }).errors.join(), /not offered at project scope/, id);
        for (const scope of ['local', 'user'])
        {
            const p = at(id!, { route, scope });
            assert.deepStrictEqual(p.errors, [], `${id} ${scope}`);
            assert.strictEqual(p.keys[0]!.kind, 'stdio');
        }
    }
    // context7 npm: keyless only at project scope, written in when picked at local and global scope
    assert.ok(!addStep(at('context7', { route: 'local', scope: 'project' })).entry.args!.includes('--api-key'));
    assert.match(at('context7', { route: 'local', scope: 'project', token: true }).errors.join(), /keyless at project scope/);
    // picked at local and global scope with the name filled nowhere: no key argument, and the line to fill it (spec F2)
    for (const scope of ['local', 'user'])
    {
        const p = at('context7', { route: 'local', scope, token: true });
        assert.ok(!addStep(p).entry.args!.includes('--api-key'), scope);
        assert.ok(p.notes.some((n) => n.startsWith('context7: fill CONTEXT7_API_KEY in ')), scope);
    }
});

test('the helper command per scope', () => {
    assert.strictEqual(helperCommand({ helperPath: '.alfred/mcp-headers.js', name: G, scheme: 'Bearer', style: 'portable' }), `node .alfred/mcp-headers.js ${G} Bearer`);
    assert.strictEqual(helperCommand({ helperPath: 'my keys/mcp-headers.js', name: G, scheme: 'Bearer', style: 'portable' }), `node "my keys/mcp-headers.js" ${G} Bearer`, 'the committed file: double quotes, which every shell reads');
    assert.strictEqual(helperCommand({ helperPath: '/work/my shop/.alfred-tools/mcp-headers.js', name: G, scheme: 'Bearer', style: 'posix' }), `node '/work/my shop/.alfred-tools/mcp-headers.js' ${G} Bearer`);
    assert.strictEqual(helperCommand({ helperPath: '/w/.alfred-tools/mcp-headers.js', name: G, scheme: 'Bearer', globalRoot: '/my keys', style: 'posix' }), `node /w/.alfred-tools/mcp-headers.js ${G} Bearer '/my keys'`);
    const gh = (base: { os: string; arch: string; project: string }, scope: string, roots?: Answers['roots'], home = '/Users/me') => helperOf(plan(inv(base, { alfredCodeEnabled: true }), { picks: { github: { route: 'remote', scope } }, roots } as Answers, opts(home, { exists: ALFRED })), 'github');
    assert.strictEqual(gh(MAC, 'project'), `node /work/shop/.alfred/mcp-headers.js ${G} Bearer`);
    assert.strictEqual(gh({ ...MAC, project: '/work/my shop' }, 'local', { project: { id: 'alfred-tools' } }), `node '/work/my shop/.alfred-tools/mcp-headers.js' ${G} Bearer`);
    assert.strictEqual(gh(MAC, 'user'), `node /Users/me/.alfred-tools/mcp-headers.js ${G} Bearer`);
    // the third argument: at local scope only, only for a named global root
    const named = { global: { id: 'named', path: '/srv/keys' } };
    assert.strictEqual(gh(MAC, 'local', named), `node /work/shop/.alfred/mcp-headers.js ${G} Bearer /srv/keys`);
    assert.strictEqual(gh(MAC, 'local'), `node /work/shop/.alfred/mcp-headers.js ${G} Bearer`, 'the standard global root: no third argument');
    assert.strictEqual(gh(MAC, 'project', named), `node /work/shop/.alfred/mcp-headers.js ${G} Bearer`, 'project scope never names it');
    assert.strictEqual(gh(MAC, 'user', named), `node /srv/keys/mcp-headers.js ${G} Bearer`);
    // Windows: forward slashes, which cmd, PowerShell and Git Bash all pass whole; quoted for a space (Review Focus 1)
    const win = helperOf(plan(inv({ ...WIN, project: 'C:\\work\\my shop' }), pickOne('github', { route: 'remote', scope: 'local' }), opts('C:\\Users\\me')), 'github');
    assert.strictEqual(win, `node "C:/work/my shop/.alfred-tools/mcp-headers.js" ${G} Bearer`);
    assert.strictEqual(helperOf(plan(inv(WIN), pickOne('github', { route: 'remote', scope: 'user' }), opts('C:\\Users\\me')), 'github'), `node C:/Users/me/.alfred-tools/mcp-headers.js ${G} Bearer`);
});

test('a helper path holding shell characters reaches node whole, and the command reads back to its path and key name', () => {
    const cases = [
        ['posix', '/work/R&D/.alfred-tools/mcp-headers.js', `node '/work/R&D/.alfred-tools/mcp-headers.js' ${G} Bearer`],
        ['posix', "/Users/bob's-app/.alfred-tools/mcp-headers.js", `node '/Users/bob'\\''s-app/.alfred-tools/mcp-headers.js' ${G} Bearer`],
        ['posix', '/work/a $b (c)/.alfred-tools/mcp-headers.js', `node '/work/a $b (c)/.alfred-tools/mcp-headers.js' ${G} Bearer`],
        ['win32', 'C:\\Users\\mac\\.alfred-tools\\mcp-headers.js', `node C:/Users/mac/.alfred-tools/mcp-headers.js ${G} Bearer`],
        ['win32', 'C:\\Users\\Jo Doe\\.alfred-tools\\mcp-headers.js', `node "C:/Users/Jo Doe/.alfred-tools/mcp-headers.js" ${G} Bearer`],
    ] as [string, string, string][];
    for (const [style, helperPath, want] of cases)
    {
        const cmd = helperCommand({ helperPath, name: G, scheme: 'Bearer', style });
        assert.strictEqual(cmd, want);
        assert.strictEqual(rootsLib.helperPathOf(cmd), style === 'win32' ? helperPath.replace(/\\/g, '/') : helperPath, `read back: ${cmd}`);
        assert.strictEqual(helperNameOf(cmd), G);
        if (style === 'posix' && process.platform !== 'win32')
        {
            const r = spawnSync('/bin/sh', ['-c', cmd.replace(/^node /, "printf '%s\\n' ")], { encoding: 'utf8' });
            assert.deepStrictEqual(r.stdout.split('\n').slice(0, 3), [helperPath, G, 'Bearer'], `sh -c ${cmd}`);
        }
    }
});

test('no hosted entry holds Authorization or a ${VAR} for a key, at any scope', () => {
    for (const id of ['context7', 'github', 'sentry'])
        for (const scope of ['project', 'local', 'user'])
            for (const token of [true, false])
            {
                const s = addStep(plan(inv(MAC), pickOne(id, { route: 'remote', scope, token }), opts('/Users/me')));
                assert.strictEqual(s.entry.headers, undefined, `${id} ${scope}`);
                assert.ok(!JSON.stringify(s.entry).includes('${'), `${id} ${scope}: ${JSON.stringify(s.entry)}`);
            }
});

test('a hosted keyed route recommends global; a stdio keyed route is not offered at project scope', () => {
    const labels = (id: string, route: string) => scopeQuestion(catalog.byId.get(id)!, inv(MAC), { route, context: { project: '/work/shop', platform: 'darwin', home: '/Users/me', env: {}, exists: () => false } })!.options.map((o) => o.label);
    assert.deepStrictEqual(labels('github', 'remote'), ['Global (Recommended)', 'Project', 'Local']);
    assert.deepStrictEqual(labels('github', 'local'), ['Local (Recommended)', 'Global']);
    assert.deepStrictEqual(labels('sentry', 'local'), ['Local (Recommended)', 'Global']);
    assert.deepStrictEqual(labels('context7', 'local'), ['Local (Recommended)', 'Global', 'Project'], 'an optional key: project scope stays, keyless');
    assert.strictEqual(plan(inv(MAC), pickOne('github', { route: 'remote' }), opts('/Users/me')).steps.find((s) => s.op === 'mcp-add')!.scope, 'user');
});

test('context7 hosted: global recommended and the key first, filled or not (spec F2, M1)', () => {
    const w = world();
    try
    {
        const ctx = () => ({ project: w.project, platform: process.platform, home: w.home, env: {} });
        const i = inv({ ...MAC, os: process.platform, project: w.project });
        const scopeOf = () => scopeQuestion(catalog.byId.get('context7')!, i, { route: 'remote', context: ctx() })!.options[0]!.label;
        const keyQ = (scope: string) => toolAsk(catalog.byId.get('context7')!, i, { route: 'remote', scope, context: ctx(), catalog }).questions.find((q) => q.id === 'token-context7');
        assert.strictEqual(scopeOf(), 'Global (Recommended)');
        assert.deepStrictEqual(keyQ('project')!.options.map((o) => o.label), ['Use a key from .mcps-secrets (Recommended)', 'No key - lower rate limits']);
        const p0 = plan(i, pickOne('context7', { route: 'remote' }), { home: w.home, env: {} });
        assert.strictEqual(addStep(p0).scope, 'user');
        assert.match(addStep(p0).entry.headersHelper!, /CONTEXT7_API_KEY Bearer$/);
        // filled in the global chain: the same, and the value stays in the key file
        fs.mkdirSync(path.join(w.home, '.alfred-tools'), { recursive: true });
        fs.writeFileSync(path.join(w.home, '.alfred-tools', SECRETS_FILE), 'CONTEXT7_API_KEY=ctx7-fake\n');
        assert.strictEqual(scopeOf(), 'Global (Recommended)');
        assert.strictEqual(keyQ('user')!.options[0]!.label, 'Use a key from .mcps-secrets (Recommended)');
        const p1 = plan(i, pickOne('context7', { route: 'remote' }), { home: w.home, env: {} });
        assert.strictEqual(addStep(p1).scope, 'user');
        assert.match(addStep(p1).entry.headersHelper!, /CONTEXT7_API_KEY Bearer$/);
        assert.ok(!JSON.stringify(p1).includes('ctx7-fake'), 'the value stays in the key file');
    }
    finally { w.clean(); }
});

test('sentry: a key recommended, with Sentry-Bearer; OAuth when picked', () => {
    const ctx = { project: '/work/shop', platform: 'darwin', home: '/Users/me', env: {}, exists: () => false };
    const q = toolAsk(catalog.byId.get('sentry')!, inv(MAC), { route: 'remote', scope: 'project', context: ctx, catalog }).questions.find((x) => x.id === 'token-sentry');
    assert.deepStrictEqual(q!.options.map((o) => o.label), ['Use a key from .mcps-secrets (Recommended)', 'Sign in with OAuth']);
    const p = plan(inv(MAC), pickOne('sentry', { route: 'remote', token: false }), opts('/Users/me'));
    assert.deepStrictEqual([addStep(p).scope, addStep(p).entry.headersHelper, p.oauth.map((x) => x.row)], ['user', undefined, ['sentry']]);
    const keyed = plan(inv(MAC), pickOne('sentry', { route: 'remote', scope: 'user', token: true }), opts('/Users/me'));
    assert.strictEqual(addStep(keyed).entry.headersHelper, 'node /Users/me/.alfred-tools/mcp-headers.js SENTRY_ACCESS_TOKEN Sentry-Bearer');
    assert.deepStrictEqual(keyed.oauth, []);
});

test('the plan notes an untrusted folder, a project-scope helper\'s child folders, and node once', () => {
    const p = plan(inv(MAC, { trusted: false }), { picks: { github: { route: 'remote', scope: 'project' }, context7: { route: 'remote', scope: 'local', token: true } } }, opts('/Users/me'));
    const count = (re: RegExp) => p.notes.filter((n) => re.test(n)).length;
    assert.strictEqual(count(/accept the trust dialog the next time Claude Code starts in \/work\/shop - until then the server connects without its key/), 1);
    assert.strictEqual(count(/a session started in a child folder connects without this key/), PARENT_HELPER_IN_CHILD ? 0 : 1);
    if (!PARENT_HELPER_IN_CHILD) assert.match(p.notes.find((n) => /child folder connects without/.test(n))!, /^github:/);
    assert.strictEqual(count(/node must be on the PATH Claude Code starts with/), 1);
    const trusted = plan(inv(MAC, { trusted: true }), pickOne('github', { route: 'remote', scope: 'user' }), opts('/Users/me'));
    assert.ok(!trusted.notes.some((n) => /trust dialog|child folder/.test(n)), trusted.notes.join('\n'));
    assert.strictEqual(plan(inv(MAC, { trusted: false }), pickOne('github', { route: 'remote', scope: 'user' }), opts('/Users/me')).notes.filter((n) => /trust dialog/.test(n)).length, 0, 'a global helper needs no folder trust');
});

test('the old-file line names the project root\'s .mcps-secrets at local scope and the global root\'s at global scope', () => {
    const w = world();
    try
    {
        putKeys(w.project, ALFRED_STORE, [`${G}=old-fake`]);
        const i = inv({ ...MAC, os: process.platform, project: w.project });
        const local = plan(i, pickOne('github', { route: 'remote', scope: 'local' }), { home: w.home, env: {} });
        const old = path.join(w.project, ...ALFRED_STORE);
        assert.strictEqual(local.keys[0]!.old, old);
        assert.ok(renderPlan(local).includes(`${G} is in ${old}, which alfred-tools no longer reads: move it to ${path.join(w.project, '.alfred-tools', SECRETS_FILE)}`), renderPlan(local));
        const user = plan(i, pickOne('github', { route: 'remote', scope: 'user' }), { home: w.home, env: {} });
        assert.ok(renderPlan(user).includes(`move it to ${path.join(w.home, '.alfred-tools', SECRETS_FILE)}`), renderPlan(user));
        assert.ok(!renderPlan(local).includes('old-fake') && !JSON.stringify(local).includes('old-fake'));
    }
    finally { w.clean(); }
});

// ---- 0.2.0: the key's name and the server's settings (spec D9) ------------------------------------------------------
const mcpsAt = (dir: string, lines: string[]) => {  fs.mkdirSync(dir, { recursive: true }); fs.appendFileSync(path.join(dir, '.mcps-secrets'), `${lines.join('\n')}\n`); };

test('key name options: the default, names found holding the row id, \'A name you choose\'; a filled name recommended, the default first when both are', () => {
    const w = world();
    try
    {
        const fake = (n: number) => `v${n}-${Date.now()}-not-printed`;
        const ctx = () => ({ project: w.project, platform: process.platform, home: w.home, env: {} });
        const q = () => keyNameQuestion(catalog.byId.get('github')!, 'remote', 'user', ctx());
        const labels = (k: Asked<string>) => k.question.options.map((o) => o.label);
        let k = q();
        assert.deepStrictEqual(labels(k!), [`${G} (Recommended)`, 'A name you choose']);
        assert.deepStrictEqual(k!.answers, { [`${G} (Recommended)`]: G, 'A name you choose': 'named' });
        assert.deepStrictEqual([k!.question.id, k!.question.header], ['keyname-github', 'Key name']);
        assert.strictEqual(k!.question.question, "Which name holds github's key in .mcps-secrets?");
        // a row-id name in a file 0.1.x read, another in the global root's .mcps-secrets: both offered, the filled one
        // in the chain recommended; a name without the row id, or not key-shaped, is not
        const store = putKeys(w.project, ALFRED_STORE, [`ACME_GITHUB_ACCESS_TOKEN=${fake(1)}`, `OTHER_TOKEN=${fake(2)}`]);
        mcpsAt(path.join(w.home, '.alfred-tools'), [`WORK_GITHUB_TOKEN=${fake(3)}`, `GITHUB_ORG=${fake(4)}`]);
        k = q();
        assert.deepStrictEqual(labels(k!), ['WORK_GITHUB_TOKEN (Recommended)', G, 'ACME_GITHUB_ACCESS_TOKEN', 'A name you choose']);
        const desc = Object.fromEntries(k!.question.options.map((o) => [o.label, o.description]));
        assert.strictEqual(desc['WORK_GITHUB_TOKEN (Recommended)'], `filled in ${path.join(w.home, '.alfred-tools', '.mcps-secrets')}`);
        assert.strictEqual((desc as Record<string, string> & { ACME_GITHUB_ACCESS_TOKEN: string }).ACME_GITHUB_ACCESS_TOKEN, `in ${store} - move it to .mcps-secrets under this name`);
        assert.match(desc[G]!, /the catalog's name - add it to /);
        // the default filled too: the default first
        mcpsAt(path.join(w.home, '.alfred-tools'), [`${G}=${fake(5)}`]);
        k = q();
        assert.deepStrictEqual(labels(k!).slice(0, 2), [`${G} (Recommended)`, 'WORK_GITHUB_TOKEN']);
        assert.ok(!/not-printed/.test(JSON.stringify(k)), 'names only, never a value');
        assert.ok(!k!.question.options.some((o) => OTHER_RE.test(o.description) || /under Other/.test(o.description)));
        // no key name for a route that takes no key, or a stdio route at project scope
        assert.strictEqual(keyNameQuestion(catalog.byId.get('gitlab')!, 'remote', 'user', ctx())!.question.id, 'keyname-gitlab');
        assert.strictEqual(keyNameQuestion(catalog.byId.get('context7')!, 'local', 'project', ctx()), null);
    }
    finally { w.clean(); }
});

test('a key name outside ^[A-Za-z_][A-Za-z0-9_]*$ is a plan error that states the rule', () => {
    const bad = plan(inv(MAC), { picks: { github: { route: 'remote', scope: 'user' } }, keyNames: { github: '1BAD-NAME' } }, opts('/Users/me'));
    assert.match(bad.errors.join(), /github: '1BAD-NAME' is not a key name - a name matches \^\[A-Za-z_\]\[A-Za-z0-9_\]\*\$/);
    assert.deepStrictEqual(bad.steps, []);
    // a good name: the helper passes it, the key line names it
    const ok = plan(inv(MAC), { picks: { github: { route: 'remote', scope: 'user' } }, keyNames: { github: 'ACME_GITHUB_TOKEN' } }, opts('/Users/me'));
    assert.strictEqual(helperOf(ok, 'github'), 'node /Users/me/.alfred-tools/mcp-headers.js ACME_GITHUB_TOKEN Bearer');
    assert.strictEqual(ok.keys[0]!.variable, 'ACME_GITHUB_TOKEN');
    // a stdio route: the step carries the name and the stdio chain; the server's own variable keeps its name
    const d = plan(inv(MAC), { picks: { github: { route: 'local', scope: 'local' } }, keyNames: { github: 'ACME_GITHUB_TOKEN' } }, opts('/Users/me'));
    assert.deepStrictEqual(addStep(d).key, { name: 'ACME_GITHUB_TOKEN', files: [path.join('/work/shop', '.alfred-tools', '.mcps-secrets'), path.join('/Users/me', '.alfred-tools', '.mcps-secrets')] });
    assert.ok(Object.hasOwn(addStep(d).entry.env!, G));
    assert.strictEqual(addStep(plan(inv(MAC), pickOne('github', { route: 'local', scope: 'local' }), opts('/Users/me'))).key!.name, G, 'no answer: the catalog\'s name');
    assert.strictEqual(addStep(plan(inv(MAC), pickOne('context7', { route: 'local', scope: 'local' }), opts('/Users/me'))).key, undefined, 'no key picked: no key step');
});

test('settings: \'Keep these settings\' lists NAME=value; \'No settings\' for an empty env; pairs merge into env', () => {
    const s = (id: string, route: string, entry: ServerEntry | null = null) => settingsQuestion(catalog.byId.get(id)!, route, { entry });
    const a = s('appium', 'local');
    assert.deepStrictEqual(a!.question.options.map((o) => o.label), ['Keep these settings (Recommended)', 'Change or add a setting']);
    assert.deepStrictEqual([a!.question.id, a!.question.header, a!.question.question], ['settings-appium', 'Settings', "appium's settings"]);
    assert.match(a!.question.options[0]!.description, /^NO_UI=true, ALLOW_REMOTE_APP_URLS=false, REMOTE_SERVER_URL_ALLOW_REGEX=/);
    assert.deepStrictEqual(a!.answers, { 'Keep these settings (Recommended)': 'keep', 'Change or add a setting': 'change' });
    for (const [id, route] of [['playwright-chrome', 'local'], ['context7', 'local'], ['github', 'local']] as [string, string][])
        assert.deepStrictEqual(s(id, route)!.question.options[0], { label: 'No settings (Recommended)', description: "the server's own defaults" }, id);
    assert.strictEqual(s('github', 'remote'), null, 'a hosted route takes no environment');
    // configure starts from the registration as read, the user's own additions included; resolved values are not listed
    const serena = { command: 'uvx', args: [], env: { SERENA_USAGE_REPORTING: 'false', SERENA_HOME: '/w/.alfred-tools/serena', MY_FLAG: '1' } };
    assert.strictEqual(s('serena', 'local', serena)!.question.options[0]!.description, 'SERENA_USAGE_REPORTING=false, MY_FLAG=1');
    const appium = { command: 'npx', args: [], env: { NO_UI: 'true', ANDROID_HOME: '/sdk', SCREENSHOTS_DIR: '/w/s', npm_config_before: '2026-11-10T23:59:59Z' } };
    assert.strictEqual(s('appium', 'local', appium)!.question.options[0]!.description, 'NO_UI=true');
    // pairs merge into env
    const p = plan(inv(MAC), { picks: { appium: { scope: 'local' } }, settings: { appium: { NO_UI: 'false', EXTRA_FLAG: '1' } } }, opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    const env = addStep(p).entry.env;
    assert.deepStrictEqual([(env as EntryEnv).NO_UI, (env as EntryEnv).EXTRA_FLAG, (env as EntryEnv).ALLOW_REMOTE_APP_URLS], ['false', '1', 'false']);
    // a Docker route passes each new setting into the container
    const gh = addStep(plan(inv(MAC), { picks: { github: { route: 'local', scope: 'local' } }, settings: { github: { GITHUB_TOOLSETS: 'repos' } } }, opts('/Users/me'))).entry;
    assert.deepStrictEqual(gh.args, ['run', '-i', '--rm', '-e', G, '-e', 'GITHUB_TOOLSETS', 'ghcr.io/github/github-mcp-server:v2.1.0', 'stdio']);
    assert.strictEqual((gh.env as EntryEnv).GITHUB_TOOLSETS, 'repos');
});

test('a credential-shaped setting is refused; a machine path is taken at every scope; a ${VAR} is kept', () => {
    const at = (scope: string, settings: Record<string, string>, id = 'appium') => plan(inv(MAC), { picks: { [id]: { scope } }, settings: { [id]: settings } }, opts('/Users/me'));
    for (const n of ['MY_TOKEN', 'api_key', 'DbPassword', 'CLIENT_SECRET', 'AUTH_HEADER'])
        assert.match(at('local', { [n]: 'x' }).errors.join(), /keep a key in \.mcps-secrets and pick it as the key's name/, n);
    assert.match(at('local', { '1X': 'y' }).errors.join(), /'1X' is not a setting name - a name matches \^\[A-Za-z_\]\[A-Za-z0-9_\]\*\$/);
    assert.deepStrictEqual(at('project', { TOOL_DIR: '/Users/me/tools' }).errors, []);
    const v = at('project', { TOOL_DIR: '${HOME}/tools' });
    assert.deepStrictEqual(v.errors, []);
    assert.strictEqual((addStep(v).entry.env as EntryEnv).TOOL_DIR, '${HOME}/tools');
    assert.deepStrictEqual(at('local', { TOOL_DIR: '/Users/me/tools' }).errors, []);
    assert.match(plan(inv(MAC), { picks: { github: { route: 'remote', scope: 'user' } }, settings: { github: { A: '1' } } }, opts('/Users/me')).errors.join(), /github: a hosted route takes no settings/);
    // a key typed as a setting's value, under a name that does not look like one: refused at every scope, never echoed
    const pat = `ghp_${'a1B2'.repeat(9)}`;
    for (const scope of ['project', 'local'])
    {
        const r = at(scope, { WORKSPACE: pat });
        assert.match(r.errors.join(), /appium: WORKSPACE's value looks like a key - keep a key in \.mcps-secrets and pick its name as the key's name/, scope);
        assert.ok(!JSON.stringify(r).includes(pat), 'the value is not in the plan');
    }
});

// ---- 0.2.0: the file steps (spec D2-D4, D8; plan R13) ----------------------------------------------------------------
test('an existing root without a .gitignore gets no key file step and the plan names the root-ignore fix', () => {
    const w = world();
    try
    {
        assert.strictEqual(spawnSync('git', ['-C', w.project, 'init', '-q']).status, 0);
        const root = path.join(w.project, '.alfred-tools');
        fs.mkdirSync(root, { recursive: true });
        const i = inv({ ...MAC, os: process.platform, project: w.project });
        const at = (scope: string) => plan(i, pickOne('github', { route: 'remote', scope }), { home: w.home, env: {} });
        let p = at('local');
        assert.ok(!p.steps.some((s) => s.op === 'ensure-key-name' || s.op === 'root-ignore'), JSON.stringify(p.steps.map((s) => s.op)));
        assert.ok(p.notes.includes(`${root}: git would commit ${path.join(root, '.mcps-secrets')} - no key file is written there; /alfred-tools:fix (root-ignore) covers it`), p.notes.join('\n'));
        // a 0.1.x .gitignore holding *: the key file is ignored, so its name is written; the helper a committed server
        // needs is ignored too, which matters at project scope only
        fs.writeFileSync(path.join(root, '.gitignore'), '*\n');
        const keyFile = path.join(root, '.mcps-secrets');
        const helperGap = `${root}: git ignores ${path.join(root, 'mcp-headers.js')}, which a project-scope server needs committed`;
        p = at('local');
        assert.deepStrictEqual((p.steps.filter((s) => s.op === 'ensure-key-name') as EnsureKeyNameStep[]).map((s) => s.file), [keyFile]);
        assert.ok(!p.notes.some((n) => n.startsWith(helperGap)), p.notes.join('\n'));
        p = at('project');
        assert.deepStrictEqual((p.steps.filter((s) => s.op === 'ensure-key-name') as EnsureKeyNameStep[]).map((s) => s.file), [keyFile]);
        assert.ok(p.notes.includes(`${helperGap} - /alfred-tools:fix (root-ignore) covers it`), p.notes.join('\n'));
        // a .gitignore above excludes the root: no appended line can bring the helper back
        fs.writeFileSync(path.join(root, '.gitignore'), '*\n!.gitignore\n!mcp-headers.js\n');
        fs.writeFileSync(path.join(w.project, '.gitignore'), '.alfred-tools/\n');
        p = at('project');
        assert.deepStrictEqual((p.steps.filter((s) => s.op === 'ensure-key-name') as EnsureKeyNameStep[]).map((s) => s.file), [keyFile]);
        assert.ok(p.notes.includes(`${helperGap} - a .gitignore above excludes ${root}: remove that line (git check-ignore -v ${root} names it)`), p.notes.join('\n'));
        const sentry = plan(i, pickOne('sentry', { route: 'local', scope: 'local' }), { home: w.home, env: {} });
        assert.deepStrictEqual((sentry.steps.filter((s) => s.op === 'ensure-key-name') as EnsureKeyNameStep[]).map((s) => s.file), [keyFile], 'a stdio key at local scope: its name is written');
        assert.ok(!sentry.notes.some((n) => n.startsWith(helperGap)), sentry.notes.join('\n'));
        fs.rmSync(path.join(w.project, '.gitignore'));
        // a global root outside any work tree gets its key file step
        p = at('user');
        assert.deepStrictEqual((p.steps.filter((s) => s.op === 'ensure-key-name') as EnsureKeyNameStep[]).map((s) => [s.file, s.names]), [[path.join(w.home, '.alfred-tools', '.mcps-secrets'), [G]]]);
    }
    finally { w.clean(); }
});

test('the file steps come before the registration steps and the records last', { skip: POSIX_FIXTURE }, () => {
    const p = plan(inv(MAC), { picks: { github: { route: 'remote', scope: 'user' }, 'playwright-chrome': {}, sentry: { route: 'local', scope: 'local' } } }, opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    const ops = p.steps.map((s) => s.op);
    const files = ['root-ignore', 'write-helper', 'ensure-key-name'];
    const lastFile = Math.max(...ops.map((o, i) => (files.includes(o) ? i : -1)));
    const firstReg = ops.findIndex((o) => !files.includes(o));
    assert.ok(lastFile < firstReg, ops.join(', '));
    assert.deepStrictEqual(ops.slice(-2), ['record-root', 'record-root']);
    const of = (op: string) => p.steps.filter((s) => s.op === op);
    assert.deepStrictEqual(of('root-ignore').map((s) => (s as PathStep).path), ['/work/shop/.alfred-tools', '/Users/me/.alfred-tools']);
    assert.deepStrictEqual(of('write-helper').map((s) => (s as PathStep).path), ['/Users/me/.alfred-tools']);
    assert.deepStrictEqual(of('ensure-key-name').map((s) => [(s as ListWriteStep).file, (s as EnsureKeyNameStep).names]), [['/work/shop/.alfred-tools/.mcps-secrets', [S_VAR]], ['/Users/me/.alfred-tools/.mcps-secrets', [G]]]);
    assert.deepStrictEqual(of('record-root').map((s) => [(s as ListWriteStep).family, (s as RecordRootStep).root]), [['project', '/work/shop/.alfred-tools'], ['global', '/Users/me/.alfred-tools']]);
    const text = renderPlan(p);
    assert.ok(text.includes('writes /Users/me/.alfred-tools/.mcps-secrets  (names only: GITHUB_PERSONAL_ACCESS_TOKEN - you fill in each value)'), text);
    assert.ok(text.includes('writes /Users/me/.alfred-tools/mcp-headers.js'), text);
    assert.ok(text.includes('writes /work/shop/.alfred-tools/.gitignore'), text);
    // under .alfred: no root-ignore
    const a = plan(inv(MAC, { alfredCodeEnabled: true }), pickOne('playwright-chrome'), opts('/Users/me', { exists: ALFRED }));
    assert.ok(!a.steps.some((s) => s.op === 'root-ignore'), a.steps.map((s) => s.op).join());
});
const S_VAR = 'SENTRY_ACCESS_TOKEN';

// ---- 0.2.0: servers already set up (spec D6; plan R12) ---------------------------------------------------------------
test("a tool answered 'own' is not offered; 'add' is offered with the two-servers note", () => {
    const labels = (calls: Question[][]) => calls.flat().flatMap((x) => x.options.map((o) => o.label));
    const has = (calls: Question[][], id: string) => labels(calls).some((l) => l === id || l.startsWith(`${id} (`));
    const sentry = reg('sentry', 'user', { type: 'http', url: 'https://mcp.sentry.dev/mcp' }, 'sentry', 'remote', { choice: null });
    const c7 = { plugin: 'docs@m', server: 'c7', entry: { type: 'http', url: 'https://mcp.context7.com/mcp' }, rowId: 'context7', route: 'remote', choice: null };
    const i = inv(MAC, { registrations: [sentry], pluginServers: [c7], lists: { project: null, global: null } });
    for (const id of ['sentry', 'context7', 'atlassian']) assert.ok(has(pickQuestions(i, catalog), id), id);
    const own = pickQuestions(i, catalog, { 'mcp:sentry~user': 'own', 'plugin-mcp:docs@m/c7': 'own', 'connector:Atlassian': 'own' });
    for (const id of ['sentry', 'context7', 'atlassian']) assert.ok(!has(own, id), id);
    assert.ok(has(own, 'github'), 'a tool not answered is still offered');
    // recorded on their own: the same
    const recorded = inv(MAC, { registrations: [{ ...sentry, choice: 'own' }], pluginServers: [{ ...c7, choice: 'own' }], lists: { project: null, global: { file: '/Users/me/.alfred-tools/mcps.json', servers: [], own: [{ connector: 'Atlassian', choice: 'own' }] } } });
    for (const id of ['sentry', 'context7', 'atlassian']) assert.ok(!has(pickQuestions(recorded, catalog), id), id);
    // 'add' and 'manage': offered; 'add' says two servers then run
    const add = pickQuestions(i, catalog, { 'plugin-mcp:docs@m/c7': 'add', 'connector:Atlassian': 'add', 'mcp:sentry~user': 'manage' });
    const opt = (id: string) => add.flat().flatMap((x) => x.options).find((o) => o.label === id || o.label.startsWith(`${id} (`));
    assert.match(opt('context7')!.description, /two servers of context7 then run - docs's and this one/);
    assert.match(opt('atlassian')!.description, /two servers of atlassian then run - claude\.ai's and this one/);
    assert.doesNotMatch(opt('sentry')!.description, /two servers/);
    // the plan says it too, and lists no own entry: only a server left on its own is one
    const enabled = inv(MAC, { registrations: [sentry], pluginServers: [c7], plugins: [{ id: 'docs@m', plugin: 'docs', scope: 'user', enabled: true, enabledHere: true }], lists: { project: null, global: null } });
    const p = plan(enabled, { picks: { context7: { route: 'remote', scope: 'project' } }, existing: { 'plugin-mcp:docs@m/c7': 'add' } }, opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    assert.ok(p.notes.includes("two servers of context7 then run - docs's and this one"), p.notes.join('\n'));
    assert.deepStrictEqual((p.steps.filter((s) => s.op === 'list-write') as ListWriteStep[]).map((s) => s.own), [null]);
    // an answer the server cannot take, or a server not here: refused
    assert.match(plan(i, { existing: { 'mcp:sentry~user': 'add' } }, opts('/Users/me')).errors.join(), /'add' is not an answer for mcp:sentry~user - own or manage/);
    assert.match(plan(i, { existing: { 'mcp:gone~user': 'own' } }, opts('/Users/me')).errors.join(), /'mcp:gone~user' is not a server found here/);
});

test('plan.js --questions with --connectors prints no existing block, reads no live inventory, and tags the pick list', () => {
    const w = world();
    try
    {
        assert.strictEqual(cli.runClaude(['mcp', 'add-json', 'github', JSON.stringify({ type: 'http', url: 'https://api.githubcopilot.com/mcp/' }), '-s', 'user'], { cwd: w.project, env: w.env }).status, 0);
        const invFile = path.join(w.dir, 'inv.json');
        fs.writeFileSync(invFile, JSON.stringify(inventoryLib.keptOf(inventoryLib.buildInventory({ project: w.project, env: w.env }))));
        const run = (...extra: string[]) => spawnSync(process.execPath, [path.join(import.meta.dirname, '..', 'scripts', 'plan.ts'), '--questions', invFile, ...extra], { encoding: 'utf8', env: w.env, cwd: w.project });
        const before = w.calls().length;
        for (const out of [run(), run('--connectors', ''), run('--connectors', 'GitLab')])
        {
            assert.strictEqual(out.status, 0, out.stderr);
            assert.ok(!('existing' in JSON.parse(out.stdout)));
        }
        assert.strictEqual(w.calls().length, before, 'no inventory read, no detector run');
        const labels = (out: { stdout: string }) => JSON.parse(out.stdout).pick.flat().flatMap((x: Question) => x.options.map((o) => o.label));
        assert.ok(labels(run('--connectors', 'GitLab')).includes('gitlab (also connected through claude.ai)'));
        assert.ok(labels(run()).includes('gitlab'));
    }
    finally { w.clean(); }
});

test("configure: the 'On their own' group, and 'Let alfred-tools manage it' plans only a list-write step", () => {
    const gh = reg('github', 'user', { type: 'http', url: 'https://api.githubcopilot.com/mcp/' }, 'github', 'remote', { choice: 'own' });
    const c7 = reg('context7', 'local', { type: 'http', url: 'https://mcp.context7.com/mcp' }, 'context7', 'remote', { choice: null });
    const ghOwn = { name: 'github', scope: 'user', fingerprint: 'url:api.githubcopilot.com/mcp', choice: 'own' };
    const i = inv(MAC, { registrations: [gh, c7], pluginServers: [], lists: { project: null, global: { file: '/Users/me/.alfred-tools/mcps.json', servers: [], own: [ghOwn] } } });
    const ch = changeQuestions(i, catalog);
    assert.strictEqual(ch.keys['github (github, user) - on its own'], 'mcp:github~user');
    assert.strictEqual(ch.keys['context7 (context7, local)'], 'mcp:context7~local');
    assert.ok(!('github (github, user)' in ch.keys), 'not among the servers configure changes');
    const opt = ch.calls.flat().flatMap((q) => q.options).find((o) => o.label === 'github (github, user) - on its own');
    assert.match(opt!.description, /left on its own/);
    // its pick asks one question: keep it, or hand it over
    const t = asks.allQuestions(i, { targets: ['mcp:github~user'] }, catalog).targets['mcp:github~user'];
    assert.strictEqual(t!.kind, 'own');
    assert.deepStrictEqual(t!.own!.question.options.map((o) => o.label), ['Keep it on its own (Recommended)', 'Let alfred-tools manage it']);
    assert.deepStrictEqual(Object.values(t!.own!.answers).map((a) => (a as { choice: string }).choice), ['own', 'manage']);
    assert.ok(!t!.questions && !t!.route, 'no route, scope or name to change');
    const all = asks.allQuestions(i, { targets: ['mcp:github~user'] }, catalog);
    assert.ok(!('mcp:github~user' in all.keyNames!) && !('mcp:github~user' in all.settings!));
    // the answer is a list-write step only: the own entry goes, and the list with it
    const p = plan(i, { existing: { 'mcp:github~user': 'manage' } }, opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    assert.deepStrictEqual(regSteps(p), []);
    assert.deepStrictEqual((p.steps.filter((s) => s.op === 'list-write') as ListWriteStep[]).map((s) => [s.file, s.own!.entries, s.own!.keep]), [['/Users/me/.alfred-tools/mcps.json', [], []]]);
    assert.ok(renderPlan(p).includes('removes /Users/me/.alfred-tools/mcps.json  (no server is listed)'), renderPlan(p));
});

// ---- 0.3.0: the servers left on their own (spec F4), in the list's own since 0.5.0 -------------------------------------
const PFILE = '/work/shop/.alfred-tools/mcps.json';
const GFILE = '/Users/me/.alfred-tools/mcps.json';
const GH_URL = { type: 'http', url: 'https://api.githubcopilot.com/mcp/' };
const cleans = (p: Plan) => (p.steps.filter((s) => s.op === 'list-write' && s.own) as ListWriteStep[]).map((s) => [s.file, s.own!.entries, s.own!.keep]);

test('an install at project scope ends with the order step; one at local scope has none', () => {
    const p = plan(inv(MAC), pickOne('context7', { route: 'remote', scope: 'project' }), opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    assert.deepStrictEqual(p.steps.at(-1), { op: 'order-mcp-json', file: '/work/shop/.mcp.json', own: [], why: '.mcp.json: the catalog servers in your order, your own after them - no value changes' });
    assert.ok(renderPlan(p).includes('reorders /work/shop/.mcp.json  (no value changes)'), renderPlan(p));
    // a server left on its own at project scope is named, so it sorts with the user's own
    const mine = reg('mine', 'project', { type: 'http', url: 'https://api.githubcopilot.com/mcp/' }, 'github', 'remote', { choice: 'own' });
    assert.deepStrictEqual((plan(inv(MAC, { registrations: [mine] }), pickOne('context7', { route: 'remote', scope: 'project' }), opts('/Users/me')).steps.at(-1) as ListWriteStep).own, ['mine']);
    const local = plan(inv(MAC), pickOne('context7', { route: 'remote', scope: 'local' }), opts('/Users/me'));
    assert.ok(!local.steps.some((s) => s.op === 'order-mcp-json'), local.steps.map((s) => s.op).join());
});

test('install with no key answer: gitlab gets the helper, an empty name line and the fill line; OAuth gives no helper', { skip: POSIX_FIXTURE }, () => {
    const p = plan(inv(MAC), pickOne('gitlab'), opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    const add = (p.steps.find((s) => s.op === 'mcp-add') as McpAddStep);
    assert.strictEqual(add.scope, 'user');
    assert.strictEqual(add.entry.headersHelper, 'node /Users/me/.alfred-tools/mcp-headers.js GITLAB_TOKEN Bearer');
    assert.deepStrictEqual((p.steps.filter((s) => s.op === 'ensure-key-name') as EnsureKeyNameStep[]).map((s) => [s.file, s.names]), [['/Users/me/.alfred-tools/.mcps-secrets', ['GITLAB_TOKEN']]]);
    assert.match(renderPlan(p), /Not filled yet: add GITLAB_TOKEN=<your key> to \/Users\/me\/\.alfred-tools\/\.mcps-secrets/);
    assert.deepStrictEqual(p.oauth, []);
    const oauth = plan(inv(MAC), pickOne('gitlab', { token: false }), opts('/Users/me'));
    const e = (oauth.steps.find((s) => s.op === 'mcp-add') as McpAddStep).entry;
    assert.ok(!e.headersHelper, JSON.stringify(e));
    assert.deepStrictEqual(oauth.oauth.map((o) => o.row), ['gitlab']);
    assert.ok(!oauth.steps.some((s) => s.op === 'ensure-key-name'));
});

test("context7's local route: keyless at project scope; at local scope an unfilled key leaves --api-key out", { skip: POSIX_FIXTURE }, () => {
    const project = plan(inv(MAC), pickOne('context7', { route: 'local', scope: 'project' }), opts('/Users/me'));
    assert.deepStrictEqual(project.errors, []);
    assert.ok(!(project.steps.find((s) => s.op === 'mcp-add') as McpAddStep).entry.args!.includes('--api-key'));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c7-key-'));
    try
    {
        const base = { ...MAC, project: dir };
        const file = path.join(dir, '.alfred-tools', '.mcps-secrets');
        const local = plan(inv(base), pickOne('context7', { route: 'local', scope: 'local' }), opts('/Users/me'));
        assert.deepStrictEqual(local.errors, []);
        const add = (local.steps.find((s) => s.op === 'mcp-add') as McpAddStep);
        assert.ok(!add.entry.args!.includes('--api-key'), JSON.stringify(add.entry));
        assert.strictEqual(add.key, undefined);
        assert.deepStrictEqual((local.steps.filter((s) => s.op === 'ensure-key-name') as EnsureKeyNameStep[]).map((s) => [s.file, s.names]), [[file, ['CONTEXT7_API_KEY']]]);
        assert.ok(local.notes.includes(`context7: fill CONTEXT7_API_KEY in ${file}, then /alfred-tools:configure -> Use a key from .mcps-secrets writes it in`), local.notes.join('\n'));
        // filled: the key goes in
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, 'CONTEXT7_API_KEY=v-not-printed\n');
        const filled = plan(inv(base), pickOne('context7', { route: 'local', scope: 'local' }), opts('/Users/me', { exists: (p) => fs.existsSync(p) }));
        assert.deepStrictEqual(filled.errors, []);
        const f = (filled.steps.find((s) => s.op === 'mcp-add') as McpAddStep);
        assert.ok(f.entry.args!.includes('--api-key'), JSON.stringify(f.entry));
        assert.strictEqual(f.key!.name, 'CONTEXT7_API_KEY');
        assert.ok(!JSON.stringify(filled).includes('v-not-printed'));
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("install plans no own entry when nothing is left on its own; a 0.2.0 record's manage and add entries are dropped", () => {
    const fresh = plan(inv(MAC), pickOne('playwright-chrome'), opts('/Users/me'));
    assert.deepStrictEqual(fresh.errors, []);
    assert.deepStrictEqual(cleans(fresh), []);
    const manage = { name: 'gh', scope: 'local', fingerprint: 'url:api.githubcopilot.com/mcp', choice: 'manage' };
    const add = { plugin: 'docs@m', server: 'c7', fingerprint: 'url:mcp.context7.com/mcp', choice: 'add' };
    const i = inv(MAC, { registrations: [reg('gh', 'local', GH_URL, 'github', 'remote')], lists: { project: { file: PFILE, servers: [], own: [manage, add], old: '/work/shop/.alfred-tools/preferred-tools.json' }, global: null } });
    const p = plan(i, pickOne('playwright-chrome'), opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    assert.deepStrictEqual(cleans(p), [[PFILE, [], []]]);
    const step = (p.steps.find((s) => s.op === 'list-write') as ListWriteStep);
    assert.strictEqual(step.why, `${PFILE}: the servers alfred-tools manages, and the ones you left on their own - configure, update and fix skip those. Remove an entry from its own list, or the file, to hand them back.`);
    // the first touch of a family with no list: its managed registrations join it, the record is moved aside
    assert.deepStrictEqual(step.upserts.map((u) => [u.server.name, u.after]), [['playwright-chrome', 'mcp:playwright-chrome~local'], ['gh', null]]);
    assert.deepStrictEqual((p.steps.filter((s) => s.op === 'retire-record') as FileStep[]).map((s) => s.file), ['/work/shop/.alfred-tools/preferred-tools.json']);
    assert.ok(renderPlan(p).includes('moves /work/shop/.alfred-tools/preferred-tools.json aside as preferred-tools.json.0.4.bak  (its entries are in mcps.json now)'), renderPlan(p));
    // fix's own call to fileSteps has no own part
    const ctx = { ...makeCtx(inv(MAC), opts('/Users/me')), uses: [], roots: { project: '/work/shop/.alfred-tools', global: null } };
    assert.deepStrictEqual(fileSteps(i, ctx, { notes: [] }).after.filter((s) => s.op === 'list-write'), []);
});

test("a global-family own entry in this project's list moves to the global root's list", () => {
    const g = { name: 'g', scope: 'user', fingerprint: 'url:api.githubcopilot.com/mcp', choice: 'own' };
    const i = inv(MAC, { registrations: [reg('g', 'user', GH_URL, 'github', 'remote', { choice: 'own' })], lists: { project: { file: PFILE, servers: [], own: [g] }, global: null } });
    const p = plan(i, {}, opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    assert.deepStrictEqual(cleans(p), [[PFILE, [], []], [GFILE, [g], []]]);
    // the global root is not there yet: its .gitignore and its roots-map entry come with it
    assert.ok(p.steps.some((s) => s.op === 'root-ignore' && s.path === '/Users/me/.alfred-tools'), p.steps.map((s) => s.op).join());
    assert.ok(p.steps.some((s) => s.op === 'record-root' && s.family === 'global' && s.root === '/Users/me/.alfred-tools'));
    assert.ok(renderPlan(p).includes(`writes ${GFILE}  (the servers alfred-tools manages, and the ones left on their own)`), renderPlan(p));
    // a root change: the old root's list is emptied, the new one holds the entry
    const c = { name: 'c7', scope: 'local', fingerprint: 'url:mcp.context7.com/mcp', choice: 'own' };
    const moved = inv(MAC, { registrations: [reg('c7', 'local', { type: 'http', url: 'https://mcp.context7.com/mcp' }, 'context7', 'remote', { choice: 'own' })], roots: usedRoots(OLD_ROOT), lists: { project: { file: PFILE, servers: [], own: [c] }, global: null } });
    const r = plan(moved, { rootChange: ['project'], roots: { project: { id: 'named', path: 'tools' } } }, opts('/Users/me'));
    assert.deepStrictEqual(r.errors, []);
    assert.deepStrictEqual(cleans(r), [['/work/shop/tools/mcps.json', [c], []], [PFILE, [], []]]);
});

test("configure: 'Leave it on its own' writes one own entry in the family root's list, 'alfred-tools' writes none, and a change for an own target is not planned", () => {
    const entry = { type: 'http', url: 'https://gitlab.com/api/v4/mcp' };
    const i = inv(MAC, { registrations: [reg('gitlab', 'project', entry, 'gitlab', 'remote')], lists: { project: null, global: null } });
    const p = plan(i, { existing: { 'mcp:gitlab~project': 'own' }, change: { 'mcp:gitlab~project': { scope: 'local' } } }, opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    assert.deepStrictEqual(cleans(p), [[PFILE, [{ name: 'gitlab', scope: 'project', fingerprint: X.fingerprintOf(entry, catalog), choice: 'own' }], []]]);
    assert.ok(!p.steps.some((s) => s.op === 'mcp-move' || s.op === 'mcp-add' || s.op === 'mcp-replace'), p.steps.map((s) => s.op).join());
    assert.ok(p.unchanged.includes('mcp:gitlab~project: left on its own'), p.unchanged.join('\n'));
    const managed = plan(i, { existing: { 'mcp:gitlab~project': 'manage' } }, opts('/Users/me'));
    assert.deepStrictEqual([managed.errors, cleans(managed)], [[], []]);
});

test('the pick list labels a row that a claude.ai connector or an enabled plugin already provides, and the plan names the two servers', () => {
    const label = (calls: Question[][], id: string) => calls.flat().flatMap((x) => x.options.map((o) => o.label)).find((l) => l === id || l.startsWith(`${id} (`));
    assert.strictEqual(label(pickQuestions(inv(MAC), catalog, {}, ['GitLab']), 'gitlab'), 'gitlab (also connected through claude.ai)');
    assert.strictEqual(label(pickQuestions(inv(MAC), catalog), 'gitlab'), 'gitlab');
    const ps = { plugin: 'gitlab-tools@acme', server: 'gitlab', rowId: 'gitlab', route: 'remote', entry: { type: 'http', url: 'https://gitlab.com/api/v4/mcp' }, choice: null };
    const plugin = (enabled: boolean) => ({ id: 'gitlab-tools@acme', plugin: 'gitlab-tools', scope: 'user', enabled, enabledHere: enabled });
    const withPlugin = inv(MAC, { pluginServers: [ps], plugins: [plugin(true)] });
    assert.strictEqual(label(pickQuestions(withPlugin, catalog), 'gitlab'), 'gitlab (also provided by the gitlab-tools plugin)');
    assert.strictEqual(label(pickQuestions(inv(MAC, { pluginServers: [ps], plugins: [plugin(false)] }), catalog), 'gitlab'), 'gitlab', 'a disabled plugin provides nothing');
    assert.deepStrictEqual(alsoProvided(withPlugin, 'gitlab', ['GitLab']).map((a) => a.owner), ['claude.ai', 'gitlab-tools']);
    const viaConnector = plan(inv(MAC), pickOne('gitlab'), opts('/Users/me', { connectors: ['GitLab'] }));
    assert.ok(viaConnector.notes.includes(X.twoServers('gitlab', 'claude.ai')), viaConnector.notes.join('\n'));
    const viaPlugin = plan(withPlugin, pickOne('gitlab'), opts('/Users/me'));
    assert.ok(viaPlugin.notes.includes(X.twoServers('gitlab', 'gitlab-tools')), viaPlugin.notes.join('\n'));
    assert.ok(!plan(inv(MAC), pickOne('gitlab'), opts('/Users/me')).notes.some((n) => n.startsWith('two servers')));
});

test("a project entry in the global root's list stays there and is named; its manage entries are dropped", () => {
    const x = { name: 'x', scope: 'project', fingerprint: 'pkg:x', choice: 'own' };
    const y = { name: 'y', scope: 'user', fingerprint: 'url:api.githubcopilot.com/mcp', choice: 'manage' };
    const i = inv(MAC, { registrations: [reg('y', 'user', GH_URL, 'github', 'remote')], lists: { project: null, global: { file: GFILE, servers: [], own: [x, y] } } });
    const p = plan(i, {}, opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    assert.deepStrictEqual(cleans(p), [[GFILE, [], [x]]]);
    assert.ok(p.notes.includes(`${GFILE} holds x (project), left on its own in another project - it stays there; remove it there to hand it back`), p.notes.join('\n'));
    assert.ok(renderPlan(p).includes(`writes ${GFILE}  (the servers alfred-tools manages, and the ones left on their own)`), renderPlan(p));
});

// ---- 0.2.0: configure changes a root folder, a key's name and the settings (spec D7, D9; plan R3) ----------------------
const OLD_ROOT = '/work/shop/.alfred-tools';
const ghHelper = (root: string, name = G) => ({ type: 'http', url: 'https://api.githubcopilot.com/mcp/', headersHelper: `node ${root}/mcp-headers.js ${name} Bearer` });
const usedRoots = (project: string | null, global: string | null = null) => ({ map: null, project: project && { path: project, from: 'registration' }, global: global && { path: global, from: 'registration' } });

test('change the root: each managed registration of the family is re-added with its data folder and helper in the new root', () => {
    const pw = installed('playwright-chrome', { scope: 'local' });
    pw.entry.args = pw.entry.args!.map((a) => a.replace(/^@playwright\/mcp@.+$/, '@playwright/mcp@0.0.90'));
    const gh = reg('github', 'local', ghHelper(OLD_ROOT), 'github', 'remote');
    const i = inv(MAC, { registrations: [pw, gh], roots: usedRoots(OLD_ROOT) });
    // the configure pick: a 'Root folders' group, one option per family in use, its path in the description
    const ch = changeQuestions(i, catalog);
    assert.strictEqual(ch.keys['Project root folder'], 'root:project');
    assert.ok(!('Global root folder' in ch.keys), 'no global root in use: not offered');
    const opt = ch.calls.flat().flatMap((q) => q.options).find((o) => o.label === 'Project root folder');
    assert.strictEqual(opt!.description, `${OLD_ROOT} - pick it to move this project's keys, key helper and tool data to another folder`);
    for (const q of ch.calls.flat()) checkQuestion(q);
    // its pick asks D2's root question, the root in use recommended
    const t = asks.allQuestions(i, { targets: ['root:project'] }, catalog).targets['root:project'];
    assert.deepStrictEqual([t!.kind, t!.family], ['root', 'project']);
    assert.strictEqual(t!.root!.question.options[0]!.label, '.alfred-tools in this project (Recommended)');
    checkQuestion(t!.root!.question);
    const p = plan(i, { rootChange: ['project'], roots: { project: { id: 'named', path: 'tools' } } }, opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    assert.deepStrictEqual(p.steps.map((s) => [s.op, (s as PathStep).path || (s as ListWriteStep).file || (s as McpAddStep).name || (s as RecordRootStep).root]), [
        ['root-ignore', '/work/shop/tools'], ['write-helper', '/work/shop/tools'], ['ensure-key-name', '/work/shop/tools/.mcps-secrets'],
        ['ensure-dir', '/work/shop/tools/playwright-chrome'], ['mcp-replace', 'playwright-chrome'], ['mcp-replace', 'github'], ['deny-read', '/Users/me/.claude/settings.json'], ['list-write', '/work/shop/tools/mcps.json'], ['record-root', '/work/shop/tools'],
    ]);
    assert.deepStrictEqual((p.steps[2] as EnsureKeyNameStep).names, [G], 'the names in use');
    const e = (p.steps[4] as McpAddStep).entry;
    assert.ok(e.args!.includes('@playwright/mcp@0.0.90'), 'the entry as read: its pin stays');
    assert.strictEqual(e.args![e.args!.indexOf('--user-data-dir') + 1], '/work/shop/tools/playwright-chrome');
    assert.strictEqual((p.steps[5] as McpAddStep).entry.headersHelper, `node /work/shop/tools/mcp-headers.js ${G} Bearer`);
    assert.match(p.notes.join('\n'), /the old data stays at \/work\/shop\/\.alfred-tools\/playwright-chrome; moving a location moves no data/);
    assert.ok(p.notes.includes(`copy the values from ${OLD_ROOT}/.mcps-secrets to /work/shop/tools/.mcps-secrets yourself - until then those servers connect without their keys`));
    // the same root again: nothing to do
    const same = plan(i, { rootChange: ['project'] }, opts('/Users/me'));
    assert.deepStrictEqual([same.errors, same.steps], [[], []]);
    assert.match(same.unchanged.join('\n'), /the project root is already .*\.alfred-tools/);
});

test('change the root: the old data and the old key file stay, the new key file holds the names with empty values, the list\'s entries move', () => {
    const w = world();
    try
    {
        const data = path.join(w.dir, 'data');
        const old = path.join(w.project, '.alfred-tools');
        const fresh = path.join(w.project, 'tools');
        const v = `v-${Date.now()}-not-printed`;
        const install = plan(inventoryLib.buildInventory({ project: w.project, env: w.env, data }), pickOne('playwright-chrome', { scope: 'local' }), { home: w.home, env: w.env });
        assert.strictEqual(apply(install, { env: w.env, tmp: path.join(w.dir, 'tmp1'), data, log: () => {} }).failed, null);
        const add = (name: string, scope: string, entry: ServerEntry) => assert.strictEqual(cli.runClaude(['mcp', 'add-json', name, JSON.stringify(entry), '-s', scope], { cwd: w.project, env: w.env }).status, 0);
        add('github', 'local', { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headersHelper: `node ${path.join(old, 'mcp-headers.js')} ${G} Bearer` });
        add('context7', 'local', { command: 'npx', args: ['-y', '@upstash/context7-mcp@2.0.0'] });
        mcpsAt(old, [`${G}=${v}`]);
        fs.writeFileSync(path.join(old, 'mcp-headers.js'), roots.helperSource());
        fs.writeFileSync(path.join(old, 'playwright-chrome', 'kept.txt'), 'old data\n');
        const record = { version: 1, servers: [{ name: 'context7', scope: 'local', fingerprint: 'pkg:@upstash/context7-mcp', choice: 'own' }] };
        const oldList = JSON.parse(fs.readFileSync(path.join(old, 'mcps.json'), 'utf8'));
        writeJson(path.join(old, 'mcps.json'), { ...oldList, own: record.servers });
        const keyBytes = fs.readFileSync(path.join(old, '.mcps-secrets'));
        const i = inventoryLib.buildInventory({ project: w.project, env: w.env, data });
        assert.strictEqual(i.roots!.project!.path, old);
        const p = plan(i, { rootChange: ['project'], roots: { project: { id: 'named', path: 'tools' } } }, { home: w.home, env: w.env });
        assert.deepStrictEqual(p.errors, []);
        assert.ok(p.notes.includes(`copy the values from ${path.join(old, '.mcps-secrets')} to ${path.join(fresh, '.mcps-secrets')} yourself - until then those servers connect without their keys`));
        assert.ok(!JSON.stringify(p).includes(v), 'no value in the plan');
        const lines: string[] = [];
        const r = apply(p, { env: w.env, tmp: path.join(w.dir, 'tmp2'), data, log: (...a) => lines.push(a.join(' ')) });
        assert.strictEqual(r.failed, null, lines.join('\n'));
        assert.ok(!lines.join('\n').includes(v));
        assert.deepStrictEqual(fs.readFileSync(path.join(old, '.mcps-secrets')), keyBytes, 'the old key file stays as it was');
        assert.strictEqual(fs.readFileSync(path.join(old, 'playwright-chrome', 'kept.txt'), 'utf8'), 'old data\n', 'the old data stays');
        assert.ok(fs.existsSync(path.join(fresh, 'playwright-chrome')), 'the new data folder is made');
        assert.deepStrictEqual(keys.namesIn(path.join(fresh, '.mcps-secrets')), [G]);
        assert.strictEqual(keys.valueIn([path.join(fresh, '.mcps-secrets')], G), null, 'the name with an empty value');
        assert.strictEqual(fs.readFileSync(path.join(fresh, 'mcp-headers.js'), 'utf8'), roots.helperSource());
        const moved = JSON.parse(fs.readFileSync(path.join(fresh, 'mcps.json'), 'utf8'));
        assert.deepStrictEqual(moved.own, record.servers, 'the own entries move');
        assert.deepStrictEqual(moved.servers.map((s: { name: string }) => s.name), ['playwright-chrome', 'github'], 'the managed servers re-added are listed in the new root');
        assert.ok(!fs.existsSync(path.join(old, 'mcps.json')), 'the old root\'s list, left with nothing, is removed');
        assert.strictEqual(roots.readMap(data).projects[roots.mapKey(w.project)], fresh);
        const local = account.readAccount(w.env, w.project).local;
        assert.strictEqual((local as MapKeyed).github!.headersHelper, helperCmd(path.join(fresh, 'mcp-headers.js'), G, 'Bearer'));
        assert.deepStrictEqual((local as MapKeyed).context7, { command: 'npx', args: ['-y', '@upstash/context7-mcp@2.0.0'] }, 'a server on its own is untouched');
        assert.ok(local['playwright-chrome']!.args!.includes(path.join(fresh, 'playwright-chrome')));
    }
    finally { w.clean(); }
});

test('change the root: the other family\'s registrations are untouched', () => {
    const pw = installed('playwright-chrome', { scope: 'local' });
    const sentry = reg('sentry', 'user', { type: 'http', url: 'https://mcp.sentry.dev/mcp', headersHelper: 'node /Users/me/.alfred-tools/mcp-headers.js SENTRY_ACCESS_TOKEN Sentry-Bearer' }, 'sentry', 'remote');
    const i = inv(MAC, { registrations: [pw, sentry], roots: usedRoots(OLD_ROOT, '/Users/me/.alfred-tools') });
    const ch = changeQuestions(i, catalog);
    assert.deepStrictEqual(['Project root folder', 'Global root folder'].map((l) => ch.keys[l]), ['root:project', 'root:global']);
    const project = plan(i, { rootChange: ['project'], roots: { project: { id: 'named', path: 'tools' } } }, opts('/Users/me'));
    assert.deepStrictEqual(project.errors, []);
    assert.deepStrictEqual(regSteps(project).map((s) => [s.op, (s as McpAddStep).name || (s as PathStep).path]), [['ensure-dir', '/work/shop/tools/playwright-chrome'], ['mcp-replace', 'playwright-chrome']]);
    assert.ok(!JSON.stringify(project.steps).includes('sentry'), 'the global family is untouched');
    const global = plan(i, { rootChange: ['global'], roots: { global: { id: 'named', path: '/Users/me/keys' } } }, opts('/Users/me'));
    assert.deepStrictEqual(global.errors, []);
    assert.deepStrictEqual(regSteps(global).map((s) => [s.op, (s as McpAddStep).name]), [['mcp-replace', 'sentry']]);
    assert.strictEqual((regSteps(global)[0] as McpAddStep).entry.headersHelper, 'node /Users/me/keys/mcp-headers.js SENTRY_ACCESS_TOKEN Sentry-Bearer');
    assert.ok(!JSON.stringify(global.steps).includes('playwright'), 'the project family is untouched');
});

test('change the global root: a local helper that names the old global root is re-pointed here, and the plan names those elsewhere', () => {
    const OLD = '/Users/me/keys';
    const sentry = reg('sentry', 'user', { type: 'http', url: 'https://mcp.sentry.dev/mcp', headersHelper: `node ${OLD}/mcp-headers.js SENTRY_ACCESS_TOKEN Sentry-Bearer` }, 'sentry', 'remote');
    const gh = reg('github', 'local', { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headersHelper: `node /work/shop/.alfred-tools/mcp-headers.js ${G} Bearer ${OLD}` }, 'github', 'remote');
    const i = inv(MAC, { registrations: [sentry, gh], roots: usedRoots('/work/shop/.alfred-tools', OLD) });
    const named = plan(i, { rootChange: ['global'], roots: { global: { id: 'named', path: '/Users/me/vault' } } }, opts('/Users/me'));
    assert.deepStrictEqual(named.errors, []);
    assert.deepStrictEqual(regSteps(named).map((s) => [s.op, (s as McpAddStep).name, (s as McpAddStep).scope]), [['mcp-replace', 'sentry', 'user'], ['mcp-replace', 'github', 'local']]);
    assert.strictEqual((regSteps(named)[1] as McpAddStep).entry.headersHelper, `node /work/shop/.alfred-tools/mcp-headers.js ${G} Bearer /Users/me/vault`);
    assert.ok(named.notes.includes(`a local server in another project whose helper names ${OLD} keeps reading its .mcps-secrets until /alfred-tools:configure runs there`), named.notes.join('\n'));
    // the standard global root: the helper reads it itself, so the third argument goes
    const standard = plan(i, { rootChange: ['global'], roots: { global: { id: 'alfred-tools' } } }, opts('/Users/me'));
    assert.deepStrictEqual(standard.errors, []);
    assert.strictEqual((regSteps(standard).find((s) => (s as McpAddStep).name === 'github') as McpAddStep).entry.headersHelper, `node /work/shop/.alfred-tools/mcp-headers.js ${G} Bearer`);
});

test('configure: the key name and the settings start from the registration as read', () => {
    const gh = reg('gh', 'user', { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: { 'X-Team': 'core' }, headersHelper: 'node /Users/me/.alfred-tools/mcp-headers.js ACME_GH Bearer' }, 'github', 'remote');
    const serena = installed('serena', { scope: 'local' });
    serena.entry.env = { ...serena.entry.env, MY_FLAG: '1' };
    const i = inv(MAC, { registrations: [gh, serena] });
    const q = asks.allQuestions(i, { targets: ['mcp:gh~user', 'mcp:serena~local'] }, catalog, { home: '/Users/me' });
    assert.strictEqual(q.keyNames!['mcp:gh~user']!.question.options[0]!.label, 'ACME_GH (Recommended)', 'the name the helper passes now');
    assert.match(q.settings!['mcp:serena~local']!.question.options[0]!.description, /MY_FLAG=1/);
    const p = plan(i, { change: { 'mcp:gh~user': {} }, keyNames: { 'mcp:gh~user': 'WORK_GH' } }, opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    assert.deepStrictEqual((regSteps(p)[0] as McpAddStep).entry, { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: { 'X-Team': 'core' }, headersHelper: 'node /Users/me/.alfred-tools/mcp-headers.js WORK_GH Bearer' });
    const st = plan(i, { change: { 'mcp:serena~local': {} }, settings: { 'mcp:serena~local': { SERENA_LOG_LEVEL: 'debug' } } }, opts('/Users/me'));
    assert.deepStrictEqual(st.errors, []);
    const e = regSteps(st).find((s) => s.op === 'mcp-replace')!.entry;
    assert.deepStrictEqual([(e.env as EntryEnv).MY_FLAG, (e.env as EntryEnv).SERENA_LOG_LEVEL], ['1', 'debug'], 'the user\'s own setting stays beside the new one');
    assert.deepStrictEqual(e.args, serena.entry.args);
});

test('the 0.1.x key files are read for names only: a held key is never matched against their values', () => {
    const w = world();
    try
    {
        const v = `v-${Date.now()}-not-printed`;
        const entry = installed('sentry', { route: 'local', scope: 'local' }).entry;
        entry.env = { ...entry.env, SENTRY_ACCESS_TOKEN: v };
        assert.strictEqual(cli.runClaude(['mcp', 'add-json', 'sentry', JSON.stringify(entry), '-s', 'local'], { cwd: w.project, env: w.env }).status, 0);
        // the project's 0.1.x key file holds the same value under a name of the user's own
        const old = keys.oldFiles(w.project, w.home).find((f) => f.startsWith(path.join(w.project, '.alfred-tools')));
        fs.mkdirSync(path.dirname(old!), { recursive: true });
        fs.writeFileSync(old!, `ACME_SENTRY_TOKEN=${v}\n`);
        const i = inventoryLib.buildInventory({ project: w.project, env: w.env });
        const q = asks.allQuestions(i, { targets: ['mcp:sentry~local'] }, catalog, { env: w.env, home: w.home });
        const opts2 = q.keyNames!['mcp:sentry~local']!.question.options;
        assert.strictEqual(opts2[0]!.label, 'SENTRY_ACCESS_TOKEN (Recommended)', JSON.stringify(opts2));
        assert.ok(opts2.some((o) => o.label === 'ACME_SENTRY_TOKEN' && o.description === `in ${old} - move it to .mcps-secrets under this name`), 'its name is still offered');
        const p = plan(i, { change: { 'mcp:sentry~local': {} } }, { home: w.home, env: w.env });
        assert.deepStrictEqual(p.errors, []);
        assert.deepStrictEqual(p.keys.map((k) => k.variable), ['SENTRY_ACCESS_TOKEN']);
    }
    finally { w.clean(); }
});

test('configure: a 0.1.x project-scope github Docker registration keeps Project listed, recommends Local, and the move writes the key from the chain, never ${VAR}', () => {
    const docker = { command: 'docker', args: ['run', '-i', '--rm', '-e', G, 'ghcr.io/github/github-mcp-server:v2.1.0', 'stdio'], env: { [G]: `\${${G}}` } };
    const t = asks.allQuestions(inv(MAC, { registrations: [reg('github', 'project', docker, 'github', 'local')] }), { targets: ['mcp:github~project'] }, catalog).targets['mcp:github~project'];
    const scopeQ = [...(t!.first || []), ...t!.questions!].find((q) => q.id === 'scope-github');
    assert.deepStrictEqual(scopeQ!.options.map((o) => o.label), ['Local (Recommended)', 'Global', 'Project']);
    assert.match(scopeQ!.options[2]!.description, /^the scope it has now/);
    checkQuestion(scopeQ!);
    for (const filled of [true, false])
    {
        const w = world();
        try
        {
            const v = `v-${Date.now()}-not-printed`;
            assert.strictEqual(cli.runClaude(['mcp', 'add-json', 'github', JSON.stringify(docker), '-s', 'project'], { cwd: w.project, env: w.env }).status, 0);
            mcpsAt(path.join(w.project, '.alfred-tools'), [filled ? `${G}=${v}` : `${G}=`]);
            const i = inventoryLib.buildInventory({ project: w.project, env: w.env });
            const ctx = fix.makeCtx({ inventory: i, env: w.env, machine: { exists: () => false, realpath: () => null, which: () => null, run: () => ({ status: 1 }) } as unknown as MachineProbe });
            assert.deepStrictEqual(fix.detectAll(ctx).found.filter((f) => f.name === 'github'), [], 'fix leaves it as it is');
            const p = plan(i, { change: { 'mcp:github~project': { scope: 'local' } } }, { home: w.home, env: w.env, machine: { docker: true } });
            assert.deepStrictEqual(p.errors, []);
            const r = apply(p, { env: w.env, tmp: path.join(w.dir, 'tmp'), log: () => {} });
            assert.strictEqual(r.failed, null);
            const e = (account.readAccount(w.env, w.project).local as MapKeyed).github;
            assert.strictEqual(e!.env![G], filled ? v : '', filled ? 'the key from the stdio chain' : 'unfilled: empty, never ${VAR}');
            assert.ok(!fs.existsSync(path.join(w.project, '.mcp.json')) || !JSON.parse(fs.readFileSync(path.join(w.project, '.mcp.json'), 'utf8')).mcpServers.github, 'moved out of the committed file');
        }
        finally { w.clean(); }
    }
});

// ---- 0.3.0: absolute paths at project scope, data in its root (F6, F7, Optional 3) ----------------------------------

test('project scope writes absolute paths on darwin, linux and win32', () => {
    for (const [base, home] of [[MAC, '/Users/me'], [LINUX, '/home/me'], [WIN, 'C:\\Users\\me']] as [typeof MAC, string][])
    {
        const P = base.os === 'win32' ? path.win32 : path.posix;
        const ctx = { project: base.project, platform: base.os, home, env: {} };
        const rel = { kind: 'project', rel: '.alfred-tools/playwright-chrome' } as Root;
        assert.deepStrictEqual(formatRoot(rel, 'project', ctx), formatRoot(rel, 'local', ctx), base.os);
        assert.deepStrictEqual(formatRoot({ kind: 'home', rel: '.serena' }, 'project', ctx), { value: P.join(home, '.serena') }, base.os);
        assert.ok(!(formatRoot({ kind: 'abs', path: base.os === 'win32' ? 'D:\\data' : '/data' }, 'project', ctx) as { value: string; error?: string }).error, base.os);
        const pw = addStep(plan(inv(base), pickOne('playwright-chrome', { scope: 'project' }), opts(home))).entry;
        assert.strictEqual(flag(pw, '--user-data-dir'), P.join(base.project, '.alfred-tools', 'playwright-chrome'), base.os);
        assert.strictEqual(flag(pw, '--output-dir'), P.join(base.project, '.alfred-tools', 'playwright-chrome', 'output'), base.os);
    }
});

test('the helper at project scope is absolute and quoted for its OS', () => {
    const h = (base: { os: string; arch: string; project: string }, home: string) => addStep(plan(inv(base), pickOne('context7', { route: 'remote', scope: 'project', token: true }), opts(home))).entry.headersHelper;
    const cases = [
        [MAC, '/Users/me', 'node /work/shop/.alfred-tools/mcp-headers.js CONTEXT7_API_KEY Bearer', '/work/shop/.alfred-tools/mcp-headers.js'],
        [{ ...MAC, project: "/work/it's shop" }, '/Users/me', "node '/work/it'\\''s shop/.alfred-tools/mcp-headers.js' CONTEXT7_API_KEY Bearer", "/work/it's shop/.alfred-tools/mcp-headers.js"],
        [{ ...WIN, project: 'C:\\work\\my shop' }, 'C:\\Users\\me', 'node "C:/work/my shop/.alfred-tools/mcp-headers.js" CONTEXT7_API_KEY Bearer', 'C:/work/my shop/.alfred-tools/mcp-headers.js'],
    ] as [{ os: string; arch: string; project: string }, string, string, string][];
    for (const [base, home, want, file] of cases)
    {
        const cmd = h(base, home);
        assert.strictEqual(cmd, want);
        assert.strictEqual(helperArgv(cmd)[1], file, 'one argument to node (Review Focus 2)');
    }
});

test('serena on Windows at project scope: <project root>\\serena, or the fallback when the root has a space', () => {
    const at = (base: { os: string; arch: string; project: string }, home: string) => plan(inv(base), pickOne('serena', { scope: 'project' }), opts(home));
    const clean = at(WIN, 'C:\\Users\\me');
    assert.deepStrictEqual(clean.errors, []);
    assert.strictEqual(addStep(clean).entry.env!.SERENA_HOME, 'C:\\work\\shop\\.alfred-tools\\serena');
    const spaced = at({ ...WIN, project: 'C:\\work\\my shop' }, 'C:\\Users\\dev');
    assert.deepStrictEqual(spaced.errors, []);
    assert.strictEqual(addStep(spaced).entry.env!.SERENA_HOME, 'C:\\Users\\dev\\.serena');
    // Project is offered on Windows whatever the profile path
    assert.ok(scopesFor(catalog.byId.get('serena')!, 'local', { platform: 'win32', home: 'C:\\Users\\Jo Doe', env: {} } as AskCtx).includes('project'));
});

test('memory follows the root: the project root at project and local scope, the global root at user scope', () => {
    const db = (scope: string) => (addStep(plan(inv(MAC), pickOne('memory', { scope }), opts('/Users/me'))).entry.env as EntryEnv).MCP_MEMORY_SQLITE_PATH;
    assert.strictEqual(db('local'), '/work/shop/.alfred-tools/memory/memory.db');
    assert.strictEqual(db('project'), '/work/shop/.alfred-tools/memory/memory.db');
    assert.strictEqual(db('user'), '/Users/me/.alfred-tools/memory/memory.db');
    const q = locationQuestion(catalog.byId.get('memory')!, inv(MAC), { scope: 'local', context: { project: '/work/shop', platform: 'darwin', home: '/Users/me', env: {}, exists: () => false } });
    assert.ok(!(q.question ? q.question.options : []).some((o) => o.label.startsWith("The global root's folder")));
});

test('a configure move of serena or memory from Local to Project plans the absolute path', () => {
    for (const [id, key, value] of [['serena', 'SERENA_HOME', '/work/shop/.alfred-tools/serena'], ['memory', 'MCP_MEMORY_SQLITE_PATH', '/work/shop/.alfred-tools/memory/memory.db']] as [string, string, string][])
    {
        const built = addStep(plan(inv(MAC), pickOne(id, { scope: 'local' }), opts('/Users/me'))).entry;
        assert.strictEqual(built.env![key], value, id);
        const r = reg(catalog.byId.get(id)!.name, 'local', built, id, 'local');
        const p = plan(inv(MAC, { registrations: [r] }), changeOf(r, { scope: 'project' }), opts('/Users/me'));
        assert.deepStrictEqual(p.errors, [], id);
        const moves = (p.steps.filter((s) => s.op === 'mcp-move') as McpMoveStep[]);
        assert.strictEqual(moves.length, 1, JSON.stringify(p.steps.map((s) => s.op)));
        assert.strictEqual(moves[0]!.entry.env![key], value, id);
    }
});

test('project scope takes a machine path in a setting and a named browser binary, and a move keeps appium\'s SDK homes', () => {
    const set = plan(inv(MAC), { picks: { memory: { scope: 'project' } }, settings: { memory: { MCP_EXTRA_DIR: '/opt/x' } } }, opts('/Users/me'));
    assert.deepStrictEqual(set.errors, []);
    assert.strictEqual((addStep(set).entry.env as EntryEnv).MCP_EXTRA_DIR, '/opt/x');
    const bin = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const exe = plan(inv(MAC), pickOne('playwright-chrome', { scope: 'project', executablePath: bin }), opts('/Users/me'));
    assert.deepStrictEqual(exe.errors, []);
    assert.strictEqual(flag(addStep(exe).entry, '--executable-path'), bin);
    const appium = addStep(plan(inv(MAC), pickOne('appium', { scope: 'local' }), opts('/Users/me'))).entry;
    const r = reg('appium-mcp', 'local', { ...appium, env: { ...appium.env, ANDROID_HOME: '/opt/sdk' } }, 'appium', 'local');
    const moved = plan(inv(MAC, { registrations: [r] }), changeOf(r, { scope: 'project' }), opts('/Users/me'));
    assert.deepStrictEqual(moved.errors, []);
    assert.strictEqual(((moved.steps.find((s) => s.op === 'mcp-move') as McpMoveStep).entry.env as EntryEnv).ANDROID_HOME, '/opt/sdk');
    assert.ok(!moved.notes.some((n) => /left out/.test(n)), moved.notes.join('\n'));
    // never a key at project scope
    const cred = plan(inv(MAC), { picks: { memory: { scope: 'project' } }, settings: { memory: { MY_API_TOKEN: 'x' } } }, opts('/Users/me'));
    assert.match(cred.errors.join(), /looks like a key/);
});

test('no note says a session in another folder creates the data folder there; a Playwright row names its one profile', () => {
    const p = plan(inv(MAC), pickOne('playwright-chrome', { scope: 'project' }), opts('/Users/me'));
    assert.doesNotMatch(renderPlan(p), /creates .* there/);
    assert.ok(p.notes.includes('playwright-chrome: one browser profile for every session under this folder - two sessions at once cannot both open it'), p.notes.join('\n'));
    const local = plan(inv(MAC), pickOne('playwright-chrome', { scope: 'local' }), opts('/Users/me'));
    assert.ok(!local.notes.some((n) => /one browser profile/.test(n)), 'project scope only');
});

test('every scope question words Project as the folder\'s .mcp.json that names this machine\'s paths', () => {
    const want = "the .mcp.json in this folder - every session started here or below it; it names this machine's paths, so a teammate's clone points at yours, and never holds a key";
    assert.strictEqual((SCOPE_TEXT as Record<string, string> & { project: string }).project, want);
    // a hosted keyed route adds why a child folder's session has no key (docs/sources.md M1); the bridge connects there
    // (F3), so its Project option says nothing of the kind
    const child = PARENT_HELPER_IN_CHILD ? '' : "; a session started in a child folder connects without the key - Claude Code does not run a parent folder's helper there";
    for (const [id, route, tail] of [['memory', 'local', ''], ['context7', 'remote', child], ['context7', 'local', ''], ['sentry', 'bridge', '']])
    {
        const q = scopeQuestion(catalog.byId.get(id!)!, inv(MAC), { route, context: { project: '/work/shop', platform: 'darwin', home: '/Users/me', env: {}, exists: () => false } });
        assert.strictEqual(q!.options.find((o) => o.label.startsWith('Project'))!.description, `${want}${tail}`, `${id}/${route}`);
    }
});

// ---- 0.3.0: 'needs authentication' explained (F3) ---------------------------------------------------------------------

test('a hosted keyed registration gets its reconnect line in the plan: filled, unfilled, unfilled anonymous', () => {
    const w = world();
    try
    {
        const file = putKeys(w.home, ['.alfred-tools', '.mcps-secrets'], ['ATLASSIAN_API_TOKEN=a@b.example:not-printed']);
        const at = (picks: Answers['picks'], extra: Record<string, unknown> = {}) => plan(inv({ ...MAC, os: process.platform, project: w.project }, extra), { picks } as Answers, { home: w.home, env: {} });
        const p = at({ atlassian: { scope: 'user', token: true }, sentry: { route: 'remote', scope: 'user', token: true }, github: { route: 'remote', scope: 'user' }, context7: { route: 'remote', scope: 'user', token: true } });
        assert.deepStrictEqual(p.errors, []);
        const hint = catalog.byId.get('atlassian')!.routes.remote!.helper!.hint;
        assert.deepStrictEqual(p.reconnect.find((r) => r.row === 'atlassian'), { row: 'atlassian', name: catalog.byId.get('atlassian')!.name, variable: 'ATLASSIAN_API_TOKEN', file, filled: true, anonymous: false, hint, untrusted: false });
        assert.deepStrictEqual(p.reconnect.map((r) => [r.row, r.filled, r.anonymous]), [['atlassian', true, false], ['github', false, false], ['context7', false, true], ['sentry', false, false]].sort((a, b) => p.reconnect.findIndex((r) => r.row === a[0]) - p.reconnect.findIndex((r) => r.row === b[0])));
        const text = renderPlan(p);
        const needs = (name: string, v: string) => `${name}: fill ${v} in ${file}, then Reconnect it in /mcp - until then it connects without the key, and /mcp shows needs authentication`;
        const a = catalog.byId.get('atlassian')!.name;
        for (const line of [`${a}: connects with its key at the next session start; in a session already running, /mcp -> ${a} -> Reconnect`, needs('sentry', 'SENTRY_ACCESS_TOKEN'), needs('github', 'GITHUB_PERSONAL_ACCESS_TOKEN'),
            `context7: fill CONTEXT7_API_KEY in ${file}, then Reconnect it in /mcp - until then it runs without the key, at lower rate limits`])
            assert.ok(text.includes(line), `${line}\n---\n${text}`);
        assert.strictEqual(reconnectLine({ name: 'x', variable: 'V', file: '/f', filled: false, anonymous: true }), 'x: fill V in /f, then Reconnect it in /mcp - until then it runs without the key, at lower rate limits');
        assert.ok(!text.includes('not-printed') && !JSON.stringify(p).includes('not-printed'));
        // a keyless pick has no line, and an untrusted folder marks a local one
        assert.deepStrictEqual(at({ sentry: { route: 'remote', scope: 'user', token: false } }).reconnect, []);
        assert.strictEqual(at({ atlassian: { scope: 'local', token: true } }, { trusted: false }).reconnect[0]!.untrusted, true);
        assert.strictEqual(at({ atlassian: { scope: 'user', token: true } }, { trusted: false }).reconnect[0]!.untrusted, false);
    }
    finally { w.clean(); }
});

test('the project-scope helper note says why, once', () => {
    const p = plan(inv(MAC, { trusted: true }), { picks: { github: { route: 'remote', scope: 'project' }, context7: { route: 'remote', scope: 'project', token: true } } }, opts('/Users/me'));
    const why = "a session started in a child folder connects without this key - Claude Code does not run a parent folder's helper there; pick Global, or install it in that folder too";
    const child = p.notes.filter((n) => /child (folder|project)/.test(n));
    if (PARENT_HELPER_IN_CHILD) return assert.deepStrictEqual(child, []);
    assert.deepStrictEqual(child.sort(), [`context7: ${why}`, `github: ${why}`]);
    const q = scopeQuestion(catalog.byId.get('github')!, inv(MAC), { route: 'remote', context: { project: '/work/shop', platform: 'darwin', home: '/Users/me', env: {}, exists: () => false } });
    assert.match(q!.options.find((o) => o.label.startsWith('Project'))!.description, /; a session started in a child folder connects without the key - Claude Code does not run a parent folder's helper there$/);
});

test('buildEntry for the sentry bridge at local, project and user scope', () => {
    const row = catalog.byId.get('sentry');
    const tail = (t: string) => [t, 'SENTRY_ACCESS_TOKEN', 'Sentry-Bearer', 'mcp-remote@0.16.0'];
    const mac = { platform: 'darwin', home: '/Users/me', project: '/work/shop' };
    const local = buildEntry(row!, 'bridge', { scope: 'local', urlNames: { SENTRY_ORG: 'SENTRY_SLUG' } }, mac, catalog.rules);
    assert.deepStrictEqual(local, { command: 'node', args: ['/work/shop/.alfred-tools/mcp-bridge.js', ...tail('https://mcp.sentry.dev/mcp/{SENTRY_SLUG}/{SENTRY_PROJECT?}')], env: { npm_config_before: '2026-11-11T23:59:59Z' } });
    const project = buildEntry(row!, 'bridge', { scope: 'project' }, mac, catalog.rules);
    assert.strictEqual(project.args![0], '/work/shop/.alfred-tools/mcp-bridge.js', 'absolute at project scope too');
    assert.strictEqual(project.args![1], 'https://mcp.sentry.dev/mcp/{SENTRY_ORG}/{SENTRY_PROJECT?}');
    const user = buildEntry(row!, 'bridge', { scope: 'user', keyName: 'MY_SENTRY' }, mac, catalog.rules);
    assert.strictEqual(user.args![0], '/Users/me/.alfred-tools/mcp-bridge.js');
    assert.strictEqual(user.args![2], 'MY_SENTRY');
    const named = buildEntry(row!, 'bridge', { scope: 'local' }, { ...mac, roots: { global: '/keys', globalNamed: true } }, catalog.rules);
    assert.strictEqual(named.args![5], '/keys', 'a named global root is the last argument at local scope');
    const win = buildEntry(row!, 'bridge', { scope: 'project' }, { platform: 'win32', home: 'C:\\Users\\me', project: 'C:\\work\\my shop' }, catalog.rules);
    assert.strictEqual(win.command, 'node');
    assert.strictEqual(win.args![0], 'C:\\work\\my shop\\.alfred-tools\\mcp-bridge.js', 'unquoted: no shell reads it');
    for (const [e, scope, keyName, urlNames] of [[local, 'local', 'SENTRY_ACCESS_TOKEN', { SENTRY_ORG: 'SENTRY_SLUG', SENTRY_PROJECT: 'SENTRY_PROJECT' }], [project, 'project', 'SENTRY_ACCESS_TOKEN', { SENTRY_ORG: 'SENTRY_ORG', SENTRY_PROJECT: 'SENTRY_PROJECT' }], [user, 'user', 'MY_SENTRY', { SENTRY_ORG: 'SENTRY_ORG', SENTRY_PROJECT: 'SENTRY_PROJECT' }]] as [ServerEntry, string, string, Record<string, string>][])
    {
        const cur = currentOf(row!, { name: 'sentry', scope, route: 'bridge', entry: e });
        assert.strictEqual(cur.token, true, scope);
        assert.strictEqual(cur.keyName, keyName, scope);
        assert.deepStrictEqual(cur.urlNames, urlNames, scope);
    }
    assert.deepStrictEqual(settingsOf(row!, 'bridge', local), [], 'the bridge passes no setting of the user\'s');
    assert.deepStrictEqual(bridgeParts(local), { path: '/work/shop/.alfred-tools/mcp-bridge.js', template: 'https://mcp.sentry.dev/mcp/{SENTRY_SLUG}/{SENTRY_PROJECT?}', keyName: 'SENTRY_ACCESS_TOKEN', scheme: 'Sentry-Bearer', packageSpec: 'mcp-remote@0.16.0', globalRoot: null });
    assert.strictEqual(bridgeParts({ command: 'npx', args: ['-y', 'mcp-remote@0.16.0'] }), null);
    assert.strictEqual(renameTemplate('https://h/mcp/{A}/{B?}', { A: 'X', B: 'Y' }), 'https://h/mcp/{X}/{Y?}');
});

// ---- the sentry bridge (0.4.0) ----------------------------------------------------------------------------------------

const bridgeWorld = () =>
{
    const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pt-bplan-')));
    const project = path.join(d, 'shop');
    const home = path.join(d, 'home');
    fs.mkdirSync(project, { recursive: true });
    fs.mkdirSync(home, { recursive: true });
    return { d, project, home, proot: path.join(project, '.alfred-tools'), groot: path.join(home, '.alfred-tools'), clean: () => fs.rmSync(d, { recursive: true, force: true }) };
};
// the folders are real, so the plan runs as this machine does - a MAC fixture on a Windows host would join a real
// C:\ path with '/'
const HOST = { os: process.platform, arch: process.arch };
type BridgeWorld = ReturnType<typeof bridgeWorld>;
const bridgePlan = (b: BridgeWorld, pick: PickAnswer) => plan(inv({ ...MAC, ...HOST, project: b.project }), pickOne('sentry', pick), { home: b.home, env: {}, machine: { docker: true } });
const putSecrets = (dir: string, text: string) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, '.mcps-secrets'), text); };

test('a sentry bridge install writes helper and bridge, names the key and the URL names, and says a restart applies a change', () => {
    const b = bridgeWorld();
    try
    {
        const p = bridgePlan(b, { route: 'bridge', scope: 'project', urlNames: { SENTRY_ORG: 'SENTRY_SLUG' } });
        assert.deepStrictEqual(p.errors, [], 'the project-scope guard passes a bridge route');
        const ops = p.steps.map((s) => s.op);
        assert.ok(ops.indexOf('write-helper') >= 0 && ops.indexOf('write-bridge') === ops.indexOf('write-helper') + 1, ops.join(', '));
        assert.strictEqual((p.steps.find((s) => s.op === 'write-bridge') as PathStep).path, b.proot);
        const names = (p.steps.filter((s) => s.op === 'ensure-key-name') as EnsureKeyNameStep[]);
        assert.deepStrictEqual(names.map((s) => [s.file, s.names]), [[path.join(b.proot, '.mcps-secrets'), ['SENTRY_ACCESS_TOKEN', 'SENTRY_SLUG', 'SENTRY_PROJECT']]]);
        const add = addStep(p);
        assert.strictEqual(add.entry.headersHelper, undefined);
        assert.strictEqual(add.entry.args![1], 'https://mcp.sentry.dev/mcp/{SENTRY_SLUG}/{SENTRY_PROJECT?}');
        assert.strictEqual(add.filled, false);
        assert.ok(p.notes.includes(`sentry: fill SENTRY_ACCESS_TOKEN and SENTRY_SLUG in ${path.join(b.proot, '.mcps-secrets')} (SENTRY_PROJECT is optional); the bridge reads them each time the server starts - after a change, restart Claude Code or reconnect it in /mcp`), p.notes.join('\n'));
        assert.deepStrictEqual(p.reconnect, [], 'no reconnect line: no key goes through Claude Code');
        assert.ok(!p.notes.some((n) => /child folder connects without this key/.test(n)));
        assert.ok(!p.notes.some((n) => /mcp-headers\.js runs under it/.test(n)));
        assert.strictEqual(p.notes.filter((n) => n === 'node must be on the PATH Claude Code starts with - mcp-bridge.js runs under it, as this plugin\'s commands do').length, 1);
        assert.match(renderPlan(p), /writes .*mcp-bridge\.js {2}\(this plugin's URL bridge\)/);
        putSecrets(b.proot, 'SENTRY_ACCESS_TOKEN=x\nSENTRY_SLUG=acme\n');
        assert.strictEqual(addStep(bridgePlan(b, { route: 'bridge', scope: 'project', urlNames: { SENTRY_ORG: 'SENTRY_SLUG' } })).filled, true);
    }
    finally { b.clean(); }
});

test('a bridge names in the project root only what the chain has not filled', () => {
    const b = bridgeWorld();
    try
    {
        putSecrets(b.groot, 'SENTRY_ACCESS_TOKEN=x\n');
        const namesOf = (p: Plan) => (p.steps.filter((s) => s.op === 'ensure-key-name') as EnsureKeyNameStep[]).map((s) => [s.file, s.names]);
        const sec = path.join(b.proot, '.mcps-secrets');
        assert.deepStrictEqual(namesOf(bridgePlan(b, { route: 'bridge', scope: 'project', urlNames: { SENTRY_ORG: 'SENTRY_SLUG' } })), [[sec, ['SENTRY_SLUG', 'SENTRY_PROJECT']]]);
        assert.deepStrictEqual(namesOf(bridgePlan(b, { route: 'bridge', scope: 'project' })), [[sec, ['SENTRY_ORG', 'SENTRY_PROJECT']]]);
        putSecrets(b.proot, 'SENTRY_ORG=acme\nSENTRY_PROJECT=web\n');
        assert.deepStrictEqual(namesOf(bridgePlan(b, { route: 'bridge', scope: 'project' })), []);
    }
    finally { b.clean(); }
});

test('a root with helper 3 and no bridge gets both rewritten for a bridge; a newer bridge is left with a note', () => {
    const b = bridgeWorld();
    try
    {
        fs.mkdirSync(b.proot, { recursive: true });
        fs.writeFileSync(path.join(b.proot, 'mcp-headers.js'), roots.helperSource().replace(/^\/\/ alfred-tools mcp-headers \d+/, '// alfred-tools mcp-headers 3'));
        const ops = (p: Plan) => p.steps.map((s) => s.op);
        assert.deepStrictEqual(ops(bridgePlan(b, { route: 'bridge', scope: 'project' })).filter((o) => o.startsWith('write-')), ['write-helper', 'write-bridge']);
        fs.writeFileSync(path.join(b.proot, 'mcp-bridge.js'), roots.shippedSource('bridge').replace(/^\/\/ alfred-tools mcp-bridge \d+/, `// alfred-tools mcp-bridge ${BRIDGE_VERSION + 1}`));
        const p = bridgePlan(b, { route: 'bridge', scope: 'project' });
        assert.ok(!ops(p).includes('write-bridge'));
        assert.ok(p.notes.includes(`mcp-bridge.js in ${b.proot} is newer than this plugin - update alfred-tools`), p.notes.join('\n'));
    }
    finally { b.clean(); }
});

test("sentry's local route is still refused at project scope", () => {
    const p = plan(inv(MAC), pickOne('sentry', { route: 'local', scope: 'project' }), opts('/h'));
    assert.match(p.errors.join(), /its local route needs a key written into the registration, so it is not offered at project scope/);
});

// ---- the bridge in the walk and configure (0.4.0 Task 5) -----------------------------------------------------------

type BridgeOpts = { template?: string; key?: string; pin?: string };
const bridgeArgs = (root: string, { template = 'https://mcp.sentry.dev/mcp/{SENTRY_ORG}/{SENTRY_PROJECT?}', key = 'SENTRY_ACCESS_TOKEN', pin = '0.16.0' }: BridgeOpts = {}) =>
    [path.join(root, 'mcp-bridge.js'), template, key, 'Sentry-Bearer', `mcp-remote@${pin}`];
const bridgeReg = (b: BridgeWorld, scope: string, o: BridgeOpts = {}) => reg('sentry', scope, { command: 'node', args: bridgeArgs(scope === 'user' ? b.groot : b.proot, o), env: { npm_config_before: '2026-11-11T23:59:59Z' } }, 'sentry', 'bridge');
const bridgeAnswers = (b: BridgeWorld, regs: InvRegistration[], answers: Answers) => plan(inv({ ...MAC, ...HOST, project: b.project }, { registrations: regs }), answers, { home: b.home, env: {}, machine: { docker: true } });
const changedStep = (p: Plan) => p.steps.find((s) => s.op === 'mcp-replace' || s.op === 'mcp-move') as McpReplaceStep | McpMoveStep | undefined;

test('answers.json urlNames reaches the registration at install and at configure', () => {
    const b = bridgeWorld();
    try
    {
        const p = bridgeAnswers(b, [], { picks: { sentry: { route: 'bridge', scope: 'project' } }, urlNames: { sentry: { SENTRY_ORG: 'SENTRY_SLUG' } } });
        assert.deepStrictEqual(p.errors, []);
        assert.strictEqual(addStep(p).entry.args![1], 'https://mcp.sentry.dev/mcp/{SENTRY_SLUG}/{SENTRY_PROJECT?}');
        const r = bridgeReg(b, 'project', { template: 'https://mcp.sentry.dev/mcp/{SENTRY_SLUG}/{SENTRY_PROJECT?}' });
        const c = bridgeAnswers(b, [r], { change: { 'mcp:sentry~project': {} }, urlNames: { 'mcp:sentry~project': { SENTRY_PROJECT: 'MY_SENTRY_PROJ' } } });
        assert.deepStrictEqual(c.errors, []);
        assert.strictEqual(changedStep(c)!.entry.args![1], 'https://mcp.sentry.dev/mcp/{SENTRY_SLUG}/{MY_SENTRY_PROJ?}', 'the org name as the registration had it');
        // no urlNames answer: nothing to change
        assert.strictEqual(changedStep(bridgeAnswers(b, [r], { change: { 'mcp:sentry~project': {} } })), undefined);
    }
    finally { b.clean(); }
});

test('configure: renaming the org name rewrites the template only, and keeps a newer pin', () => {
    const b = bridgeWorld();
    try
    {
        const r = bridgeReg(b, 'project', { pin: '0.16.4' });
        const c = bridgeAnswers(b, [r], { change: { 'mcp:sentry~project': {} }, urlNames: { 'mcp:sentry~project': { SENTRY_ORG: 'SENTRY_SLUG' } } });
        assert.deepStrictEqual(c.errors, []);
        const steps = c.steps.filter((s) => ['mcp-replace', 'mcp-move', 'mcp-add'].includes(s.op));
        assert.strictEqual(steps.length, 1);
        const e = (steps[0] as McpAddStep).entry;
        assert.strictEqual(e.args![1], 'https://mcp.sentry.dev/mcp/{SENTRY_SLUG}/{SENTRY_PROJECT?}');
        assert.deepStrictEqual([e.args![0], e.args![2], e.args![3], e.args![4]], [r.entry.args![0], r.entry.args![2], r.entry.args![3], 'mcp-remote@0.16.4']);
        assert.deepStrictEqual(e.env, r.entry.env);
    }
    finally { b.clean(); }
});

test('configure: global to project moves the bridge path, keeps the names and the pin', () => {
    const b = bridgeWorld();
    try
    {
        const r = bridgeReg(b, 'user', { template: 'https://mcp.sentry.dev/mcp/{SENTRY_SLUG}', key: 'MY_SENTRY_KEY', pin: '0.16.4' });
        const c = bridgeAnswers(b, [r], { change: { 'mcp:sentry~user': { scope: 'project' } } });
        assert.deepStrictEqual(c.errors, []);
        const s = changedStep(c);
        assert.strictEqual(s!.op, 'mcp-move');
        assert.deepStrictEqual(s!.entry.args, [path.join(b.proot, 'mcp-bridge.js'), 'https://mcp.sentry.dev/mcp/{SENTRY_SLUG}', 'MY_SENTRY_KEY', 'Sentry-Bearer', 'mcp-remote@0.16.4']);
        assert.ok(c.steps.some((x) => x.op === 'write-bridge' && x.path === b.proot), 'the new root gets the bridge');
    }
    finally { b.clean(); }
});

test('configure: bridge to hosted keeps the key name in the helper; hosted to bridge keeps it in args[2]', () => {
    const b = bridgeWorld();
    try
    {
        const r = bridgeReg(b, 'project', { key: 'MY_SENTRY_KEY' });
        const hosted = changedStep(bridgeAnswers(b, [r], { change: { 'mcp:sentry~project': { route: 'remote' } } }));
        assert.strictEqual(hosted!.entry.url, catalog.byId.get('sentry')!.routes.remote!.url);
        assert.match(hosted!.entry.headersHelper!, / MY_SENTRY_KEY Sentry-Bearer$/);
        const remote = reg('sentry', 'project', hosted!.entry, 'sentry', 'remote');
        const back = changedStep(bridgeAnswers(b, [remote], { change: { 'mcp:sentry~project': { route: 'bridge' } } }));
        assert.strictEqual(back!.entry.args![2], 'MY_SENTRY_KEY');
        assert.strictEqual(back!.entry.args![1], 'https://mcp.sentry.dev/mcp/{SENTRY_ORG}/{SENTRY_PROJECT?}', "the catalog's URL names");
    }
    finally { b.clean(); }
});

test('a URL name that is the key or a credential name is refused, and nothing is written (Review Focus 1)', () => {
    const b = bridgeWorld();
    try
    {
        const refused = (answers: Answers, regs: InvRegistration[] = []) =>
        {
            const p = bridgeAnswers(b, regs, answers);
            assert.ok(!p.steps.some((s) => ['mcp-add', 'mcp-replace', 'mcp-move'].includes(s.op)), JSON.stringify(p.steps.map((s) => s.op)));
            return p.errors.join('\n');
        };
        const install = (urlNames: Record<string, string>, extra: Answers = {}) => ({ picks: { sentry: { route: 'bridge', scope: 'project' } }, urlNames: { sentry: urlNames }, ...extra });
        assert.strictEqual(refused(install({ SENTRY_ORG: 'SENTRY_ACCESS_TOKEN' })), 'sentry: SENTRY_ACCESS_TOKEN holds a key - a key never goes in a URL; pick another name for the organization slug');
        assert.strictEqual(refused(install({ SENTRY_PROJECT: 'MY_API_KEY' })), 'sentry: MY_API_KEY holds a key - a key never goes in a URL; pick another name for the project slug');
        assert.strictEqual(refused(install({ SENTRY_ORG: 'ORG_NAME' }, { keyNames: { sentry: 'ORG_NAME' } })), 'sentry: ORG_NAME holds a key - a key never goes in a URL; pick another name for the organization slug');
        assert.match(refused(install({ SENTRY_ORG: 'bad name' })), /^sentry: 'bad name' is not a name - a name matches /);
        // read from a registration: a template naming a credential is refused at configure too
        const r = bridgeReg(b, 'project', { template: 'https://mcp.sentry.dev/mcp/{MY_TOKEN}' });
        assert.strictEqual(refused({ change: { 'mcp:sentry~project': { scope: 'local' } } }, [r]), 'sentry: MY_TOKEN holds a key - a key never goes in a URL; pick another name for the organization slug');
    }
    finally { b.clean(); }
});

test('two URL parts under one name are refused at install and configure, and nothing is written (review I4)', () => {
    const b = bridgeWorld();
    try
    {
        const refused = (answers: Answers, regs: InvRegistration[] = []) =>
        {
            const p = bridgeAnswers(b, regs, answers);
            assert.ok(!p.steps.some((s) => ['mcp-add', 'mcp-replace', 'mcp-move'].includes(s.op)), JSON.stringify(p.steps.map((s) => s.op)));
            return p.errors.join('\n');
        };
        const install = { picks: { sentry: { route: 'bridge', scope: 'project' } }, urlNames: { sentry: { SENTRY_ORG: 'SENTRY_SLUG', SENTRY_PROJECT: 'SENTRY_SLUG' } } };
        assert.strictEqual(refused(install), 'sentry: SENTRY_SLUG already names the organization slug - each part of the URL needs its own name; pick another name for the project slug');
        // configure: the org renamed to the name the project already has
        const r = bridgeReg(b, 'project');
        assert.strictEqual(refused({ change: { 'mcp:sentry~project': {} }, urlNames: { 'mcp:sentry~project': { SENTRY_ORG: 'SENTRY_PROJECT' } } }, [r]), 'sentry: SENTRY_PROJECT already names the organization slug - each part of the URL needs its own name; pick another name for the project slug');
        // a swap is two names still
        const swap = bridgeAnswers(b, [r], { change: { 'mcp:sentry~project': {} }, urlNames: { 'mcp:sentry~project': { SENTRY_ORG: 'SENTRY_PROJECT', SENTRY_PROJECT: 'SENTRY_ORG' } } });
        assert.deepStrictEqual(swap.errors, []);
        assert.strictEqual(changedStep(swap)!.entry.args![1], 'https://mcp.sentry.dev/mcp/{SENTRY_PROJECT}/{SENTRY_ORG?}');
    }
    finally { b.clean(); }
});

// ---- 0.3.0 review, Important 1: the key's format reaches the user on the recommended path ---------------------------

test('an unfilled reconnect line names what the key must be: atlassian email:api_token, gitlab a fine-grained token', () => {
    const w = world();
    try
    {
        const p = plan(inv({ ...MAC, os: process.platform, project: w.project }), { picks: { atlassian: {}, gitlab: {} } }, { home: w.home, env: {} });
        assert.deepStrictEqual(p.errors, []);
        const text = renderPlan(p);
        for (const id of ['atlassian', 'gitlab'])
        {
            const r = p.reconnect.find((x) => x.row === id);
            assert.ok(r && !r.filled, id);
            assert.ok(text.includes(`${r.name}: fill ${r.variable} in ${r.file} (${catalog.byId.get(id)!.routes.remote!.helper!.hint}), then Reconnect it in /mcp`), `${id}\n---\n${text}`);
        }
        assert.match(text, /the value is email:api_token/);
        assert.match(text, /a legacy token is refused \(403\)/);
        // filled, or a route with no hint: as before
        assert.strictEqual(reconnectLine({ name: 'x', variable: 'V', file: '/f', filled: false, anonymous: false, hint: null }), 'x: fill V in /f, then Reconnect it in /mcp - until then it connects without the key, and /mcp shows needs authentication');
        assert.strictEqual(reconnectLine({ name: 'x', variable: 'V', file: '/f', filled: true, anonymous: false, hint: 'h' }), 'x: connects with its key at the next session start; in a session already running, /mcp -> x -> Reconnect');
    }
    finally { w.clean(); }
});

// ---- 0.5.0: the list (spec D1) ---------------------------------------------------------------------------------------
const C7_URL = { type: 'http', url: 'https://mcp.context7.com/mcp' };

test('a plan writes list-write after the registration steps and before order-mcp-json', { skip: POSIX_FIXTURE }, () => {
    const p = plan(inv(MAC), pickOne('context7', { route: 'remote', scope: 'project' }), opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    const ops = p.steps.map((s) => s.op);
    assert.ok(ops.indexOf('list-write') > ops.indexOf('mcp-add'), ops.join());
    assert.strictEqual(ops.at(-1), 'order-mcp-json');
    const lw = (p.steps.find((s) => s.op === 'list-write') as ListWriteStep);
    assert.strictEqual(lw.file, PFILE);
    assert.deepStrictEqual(lw.upserts.map((u) => [u.server.name, u.server.scope, u.server.clients, u.server.entry, u.after]), [['context7', 'project', ['claude'], null, 'mcp:context7~project']]);
    assert.ok(renderPlan(p).includes(`   writes ${PFILE}  (the servers alfred-tools manages, and the ones left on their own)`), renderPlan(p));
});

test('a remove of a server set up for Cursor plans a cursor-write after the list-write, last of the plan', { skip: POSIX_FIXTURE }, () => {
    const listed = { name: 'c7', scope: 'project', row: 'context7', route: 'remote', clients: ['claude', 'cursor'], entry: C7_URL, key: null };
    const i = inv(MAC, { registrations: [reg('c7', 'project', C7_URL, 'context7', 'remote')], lists: { project: { file: PFILE, servers: [listed], own: [] }, global: null } });
    const p = plan(i, { remove: [{ kind: 'mcp', name: 'c7', scope: 'project' }] }, opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    const ops = p.steps.map((s) => s.op);
    assert.ok(ops.indexOf('cursor-write') > ops.indexOf('list-write'), ops.join());
    assert.strictEqual(ops.at(-1), 'cursor-write', 'a remove writes no order-mcp-json; withOrderStep appends that after it');
    const cw = (p.steps.find((s) => s.op === 'cursor-write') as CursorWritePlanStep);
    assert.deepStrictEqual([cw.file, cw.before, cw.lists], ['/work/shop/.cursor/mcp.json', ['c7'], [{ file: PFILE, scopes: ['local', 'project'] }]]);
    assert.ok(renderPlan(p).includes('   writes /work/shop/.cursor/mcp.json  (Cursor: the servers set up for it; your own entries kept)'), renderPlan(p));
});

test('remove drops the entry from the list', { skip: POSIX_FIXTURE }, () => {
    const listed = { name: 'c7', scope: 'local', row: 'context7', route: 'remote', clients: ['claude'], entry: C7_URL, key: null };
    const i = inv(MAC, { registrations: [reg('c7', 'local', C7_URL, 'context7', 'remote')], lists: { project: { file: PFILE, servers: [listed], own: [] }, global: null } });
    const p = plan(i, { remove: [{ kind: 'mcp', name: 'c7', scope: 'local' }] }, opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    const ops = p.steps.map((s) => s.op);
    assert.ok(ops.indexOf('list-write') > ops.indexOf('mcp-remove'), ops.join());
    const lw = (p.steps.find((s) => s.op === 'list-write') as ListWriteStep);
    assert.deepStrictEqual([lw.file, lw.upserts, lw.drops], [PFILE, [], [{ key: 'mcp:c7~local', after: 'mcp:c7~local' }]]);
    assert.ok(renderPlan(p).includes(`   removes ${PFILE}  (no server is listed)`), renderPlan(p));
});

// ---- serena: navigation only (spec D7) ---------------------------------------------------------------------------------
test('serena args at project, local and global scope: --context absolute, --project-from-cwd kept', () => {
    for (const [scope, root] of [['project', '/work/shop/.alfred-tools'], ['local', '/work/shop/.alfred-tools'], ['user', '/h/.alfred-tools']])
    {
        const p = plan(inv(MAC), pickOne('serena', { scope }), opts('/h'));
        assert.deepStrictEqual(p.errors, [], scope);
        const args = addStep(p).entry.args;
        assert.strictEqual(args![args!.indexOf('--context') + 1], `${root}/serena/serena-context.yml`, scope);
        assert.ok(args!.includes('--project-from-cwd'), scope);
        assert.ok(!args!.includes('claude-code'), scope);
        assert.deepStrictEqual((p.steps.filter((s) => s.op === 'write-serena-context') as PathStep[]).map((s) => s.path), [`${root}/serena`], scope);
    }
    // a server that is not serena plans no context file
    assert.deepStrictEqual(plan(inv(MAC), pickOne('memory', { scope: 'project' }), opts('/h')).steps.filter((s) => s.op === 'write-serena-context'), []);
});

test('a serena install writes its context in its home', () => {
    const root = '/work/shop/.alfred-tools';
    const p = plan(inv(MAC), pickOne('serena', { scope: 'project' }), opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    assert.deepStrictEqual((p.steps.filter((s) => s.op === 'write-serena-context') as PathStep[]).map((s) => s.path), [`${root}/serena`]);
    const args = addStep(p).entry.args!;
    assert.strictEqual(args[args.indexOf('--context') + 1], `${root}/serena/serena-context.yml`);
    assert.ok(renderPlan(p).includes(`writes ${root}/serena/serena-context.yml`), renderPlan(p));
    // alfred-code's home is not the plugin's to put files in: the root keeps the context
    const alfred = plan(inv(MAC), pickOne('serena', { scope: 'project', location: { side: 'alfred' } }), opts('/Users/me', { exists: (path) => path === '/work/shop/.alfred/serena/home' }));
    assert.deepStrictEqual(alfred.errors, []);
    const alfredEntry = addStep(alfred).entry;
    assert.strictEqual(alfredEntry.env!.SERENA_HOME, '/work/shop/.alfred/serena/home');
    assert.strictEqual(alfredEntry.args![alfredEntry.args!.indexOf('--context') + 1], `${root}/serena-context.yml`);
    assert.deepStrictEqual((alfred.steps.filter((s) => s.op === 'write-serena-context') as PathStep[]).map((s) => s.path), [root]);
});

// ---- configure's root change moves the root's files (spec D1, D5, D7) --------------------------------------------------
function rootMoveWorld(t: TestContext, pick: Answers['picks'])
{
    const w = world();
    t.after(() => w.clean());
    const data = path.join(w.dir, 'data');
    const old = path.join(w.project, '.alfred-tools');
    const fresh = path.join(w.project, 'tools');
    const inv = () => inventoryLib.buildInventory({ project: w.project, env: w.env, data });
    const install = plan(inv(), { clients: ['claude', 'cursor'], picks: pick } as Answers, { home: w.home, env: w.env });
    assert.deepStrictEqual(install.errors, []);
    assert.strictEqual(apply(install, { env: w.env, tmp: path.join(w.dir, 'tmp1'), data, log: () => {} }).failed, null);
    const change = () => plan(inv(), { rootChange: ['project'], roots: { project: { id: 'named', path: 'tools' } } }, { home: w.home, env: w.env });
    const run = (p: Plan, tmp: string) => { const lines: string[] = []; const r = apply(p, { env: w.env, tmp: path.join(w.dir, tmp), data, log: (...a) => lines.push(a.join(' ')) }); return { r, text: lines.join('\n') }; };
    const local = (name: string) => readAccount(w.env, w.project).local[name];
    const cursor = () => JSON.parse(fs.readFileSync(path.join(w.project, '.cursor', 'mcp.json'), 'utf8')).mcpServers;
    return { w, fs, old, fresh, change, run, local, cursor };
}

test('a root change moves mcps.json, writes serena-context.yml in the new home, rewrites --context and writes Cursor', (t) => {
    const m = rootMoveWorld(t, { serena: { scope: 'local' } });
    const ctxOf = (e: ServerEntry) => e.args![e.args!.indexOf('--context') + 1];
    assert.strictEqual(ctxOf(m.local('serena')!), path.join(m.old, 'serena', 'serena-context.yml'));
    const listBefore = m.fs.readFileSync(path.join(m.old, 'mcps.json'), 'utf8');
    const p = m.change();
    assert.deepStrictEqual(p.errors, []);
    const ops = p.steps.map((s) => s.op);
    assert.deepStrictEqual((p.steps.filter((s) => s.op === 'move-root-file') as MoveRootFileStep[]).map((s) => [s.from, s.to]), [
        [path.join(m.old, 'mcps.json'), path.join(m.fresh, 'mcps.json')],
    ], 'serena\'s context file is in its home now, not the root\'s own file: the move leaves it and writes a copy in the new home');
    assert.deepStrictEqual((p.steps.filter((s) => s.op === 'write-serena-context') as PathStep[]).map((s) => s.path), [path.join(m.fresh, 'serena')]);
    assert.ok(ops.lastIndexOf('root-ignore') < ops.indexOf('move-root-file') && ops.lastIndexOf('move-root-file') < ops.indexOf('mcp-replace'), ops.join());
    const { r, text } = m.run(p, 'tmp2');
    assert.strictEqual(r.failed, null, text);
    assert.ok(!m.fs.existsSync(path.join(m.old, 'mcps.json')));
    assert.ok(m.fs.existsSync(path.join(m.fresh, 'serena', 'serena-context.yml')));
    assert.deepStrictEqual(JSON.parse(m.fs.readFileSync(path.join(m.fresh, 'mcps.json'), 'utf8')).servers.map((s: { name: string }) => s.name), JSON.parse(listBefore).servers.map((s: { name: string }) => s.name));
    assert.strictEqual(ctxOf(m.local('serena')!), path.join(m.fresh, 'serena', 'serena-context.yml'));
    assert.strictEqual(ctxOf(m.cursor().serena), path.join(m.fresh, 'serena', 'serena-context.yml'), 'Cursor follows');
});

test('a root change inits serena\'s config in the new home before the replace, unless the home has one', (t) => {
    const m = rootMoveWorld(t, { serena: { scope: 'local' } });
    const newConfig = path.join(m.fresh, 'serena', 'serena_config.yml');
    const p = m.change();
    assert.deepStrictEqual(p.errors, []);
    const ops = p.steps.map((s) => s.op);
    const init = p.steps.find((s) => s.op === 'serena-config-init');
    assert.ok(init && init.op === 'serena-config-init');
    assert.strictEqual(init.file, newConfig);
    assert.ok(ops.indexOf('serena-config-init') < ops.indexOf('mcp-replace'), ops.join());
    const { r, text } = m.run(p, 'tmp2');
    assert.strictEqual(r.failed, null, text);
    assert.match(m.fs.readFileSync(newConfig, 'utf8'), /^projects: \[\]\nbase_modes: \[\]\nproject_serena_folder_location: /);
    // a config already in the new home is left alone: a second world, with the file in place before the plan
    const n = rootMoveWorld(t, { serena: { scope: 'local' } });
    n.fs.mkdirSync(path.join(n.fresh, 'serena'), { recursive: true });
    n.fs.writeFileSync(path.join(n.fresh, 'serena', 'serena_config.yml'), 'base_modes: []\n');
    const kept = n.change();
    assert.deepStrictEqual(kept.errors, []);
    assert.ok(!kept.steps.some((s) => s.op === 'serena-config-init'), kept.steps.map((s) => s.op).join());
    assert.ok(kept.steps.some((s) => s.op === 'mcp-replace'));
});

test('a root change retires the root copy of a 0.5.x serena context instead of moving it', (t) => {
    const m = rootMoveWorld(t, { serena: { scope: 'local' } });
    const ctxOf = (e: ServerEntry) => e.args![e.args!.indexOf('--context') + 1];
    // age the install to 0.5.x: the context is the root's copy
    const rootCopy = path.join(m.old, 'serena-context.yml');
    const aged = JSON.parse(JSON.stringify(m.local('serena')!)) as ServerEntry;
    aged.args![aged.args!.indexOf('--context') + 1] = rootCopy;
    m.fs.copyFileSync(path.join(m.old, 'serena', 'serena-context.yml'), rootCopy);
    m.fs.rmSync(path.join(m.old, 'serena', 'serena-context.yml'));
    const env = m.w.env;
    assert.strictEqual(cli.runClaude(['mcp', 'remove', 'serena', '-s', 'local'], { cwd: m.w.project, env }).status, 0);
    assert.strictEqual(cli.runClaude(['mcp', 'add-json', 'serena', JSON.stringify(aged), '-s', 'local'], { cwd: m.w.project, env }).status, 0);
    const p = m.change();
    assert.deepStrictEqual(p.errors, []);
    assert.deepStrictEqual((p.steps.filter((s) => s.op === 'move-root-file') as MoveRootFileStep[]).map((s) => path.basename(s.from)), ['mcps.json'], 'the root copy is not moved');
    const retire = p.steps.filter((s) => s.op === 'retire-shipped') as RetireShippedStep[];
    assert.deepStrictEqual(retire.map((s) => [s.file, s.namedBy]), [[rootCopy, []]]);
    const ops = p.steps.map((s) => s.op);
    assert.ok(ops.indexOf('retire-shipped') > ops.indexOf('mcp-replace'), ops.join());
    const { r, text } = m.run(p, 'tmp2');
    assert.strictEqual(r.failed, null, text);
    assert.ok(!m.fs.existsSync(rootCopy), 'the old root copy is gone');
    assert.ok(text.includes(`removed ${rootCopy}`), text);
    assert.ok(m.fs.existsSync(path.join(m.fresh, 'serena', 'serena-context.yml')));
    assert.strictEqual(ctxOf(m.local('serena')!), path.join(m.fresh, 'serena', 'serena-context.yml'));
});

test('a rename of a 0.5.x serena retires the root copy of its context', () => {
    const r = installed('serena');
    r.entry.args![r.entry.args!.indexOf('--context') + 1] = '/work/shop/.alfred-tools/serena-context.yml';
    const p = plan(inv(MAC, { registrations: [r] }), changeOf(r, { name: 'shop-serena' }), opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    const ops = p.steps.map((s) => s.op);
    assert.deepStrictEqual(ops, ['root-ignore', 'write-serena-context', 'serena-config-init', 'mcp-move', 'retire-shipped', 'list-write', 'record-root']);
    assert.deepStrictEqual((p.steps.find((s) => s.op === 'retire-shipped') as RetireShippedStep).namedBy, []);
    assert.strictEqual((p.steps.find((s) => s.op === 'retire-shipped') as RetireShippedStep).file, '/work/shop/.alfred-tools/serena-context.yml');
    assert.deepStrictEqual(p.steps.filter((s) => s.op === 'move-root-file'), []);
    assert.ok(renderPlan(p).includes('removes /work/shop/.alfred-tools/serena-context.yml'), renderPlan(p));
    // another registration naming the copy keeps it
    const other = reg('theirs', 'local', { command: 'node', args: ['their.js', '--context', '/work/shop/.alfred-tools/serena-context.yml'] });
    const kept = plan(inv(MAC, { registrations: [r, other] }), changeOf(r, { name: 'shop-serena' }), opts('/Users/me'));
    assert.deepStrictEqual((kept.steps.find((s) => s.op === 'retire-shipped') as RetireShippedStep).namedBy, ['theirs']);
});

test('a root change stops before any registration when the new root holds another mcps.json', (t) => {
    const m = rootMoveWorld(t, { serena: { scope: 'local' } });
    m.fs.mkdirSync(m.fresh, { recursive: true });
    m.fs.writeFileSync(path.join(m.fresh, 'mcps.json'), '{"version":1,"servers":[],"own":[{"name":"x","scope":"local","choice":"own"}]}\n');
    const before = JSON.stringify(m.local('serena'));
    const { r, text } = m.run(m.change(), 'tmp2');
    assert.ok(r.failed, text);
    assert.match(text, new RegExp(`${path.join(m.fresh, 'mcps.json').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.strictEqual(JSON.stringify(m.local('serena')), before, 'no registration moved');
    assert.ok(m.fs.existsSync(path.join(m.old, 'mcps.json')), 'the old list stays');
});

test('a root move renames mcp-remote-v1 and rewrites MCP_REMOTE_CONFIG_DIR in both apps', (t) => {
    const m = rootMoveWorld(t, { atlassian: { route: 'remote', scope: 'local', token: false } });
    assert.strictEqual((m.local('atlassian')!.env as EntryEnv).MCP_REMOTE_CONFIG_DIR, m.old);
    m.fs.mkdirSync(path.join(m.old, 'mcp-remote-v1'), { recursive: true });
    m.fs.writeFileSync(path.join(m.old, 'mcp-remote-v1', 'tokens.json'), '{}');
    const p = m.change();
    assert.ok(p.steps.some((s) => s.op === 'move-root-file' && s.from === path.join(m.old, 'mcp-remote-v1')), p.steps.map((s) => s.op).join());
    const { r, text } = m.run(p, 'tmp2');
    assert.strictEqual(r.failed, null, text);
    assert.ok(m.fs.existsSync(path.join(m.fresh, 'mcp-remote-v1', 'tokens.json')) && !m.fs.existsSync(path.join(m.old, 'mcp-remote-v1')));
    assert.strictEqual((m.local('atlassian')!.env as EntryEnv).MCP_REMOTE_CONFIG_DIR, m.fresh);
    assert.strictEqual(m.cursor().atlassian.env.MCP_REMOTE_CONFIG_DIR, m.fresh);
});

// ---- the rename: install and configure wait for the move (spec D3) ------------------------------------------------
const MOVE_FIRST = ".preferred-tools is this plugin's old folder - run /alfred-tools:update first, which moves it";
const REPOINT_FIRST = "a server still names .preferred-tools, this plugin's old folder - run /alfred-tools:update first, which points it at .alfred-tools";
function oldFolders(state: 'move' | 'came-back')
{
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pt-plan-move-')));
    const project = path.join(dir, 'shop');
    const home = path.join(dir, 'home');
    fs.mkdirSync(path.join(project, '.preferred-tools'), { recursive: true });
    fs.mkdirSync(home, { recursive: true });
    if (state === 'came-back')
    {
        fs.mkdirSync(path.join(project, '.preferred-tools', 'memory'));
        fs.mkdirSync(path.join(project, '.alfred-tools'));
        fs.writeFileSync(path.join(project, '.alfred-tools', 'mcps.json'), '{"version":1,"servers":[],"own":[]}\n');
    }
    else fs.writeFileSync(path.join(project, '.preferred-tools', 'preferred-tools.json'), '{"version":1,"servers":[]}\n');
    return { dir, project, home, clean: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('install stops while .preferred-tools waits to move', () => {
    const f = oldFolders('move');
    try
    {
        const p = plan(inv({ ...MAC, project: f.project }), pickOne('serena'), opts(f.home));
        assert.deepStrictEqual([p.errors, p.steps], [[MOVE_FIRST], []]);
    }
    finally { f.clean(); }
});

test('configure stops the same way', () => {
    const f = oldFolders('move');
    try
    {
        const p = plan(inv({ ...MAC, project: f.project }), { change: { 'mcp:serena~user': { row: 'serena', name: 'nav' } } }, opts(f.home));
        assert.deepStrictEqual([p.errors, p.steps], [[MOVE_FIRST], []]);
    }
    finally { f.clean(); }
});

test('install stops while a moved folder waits for its registrations to be re-pointed', () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pt-plan-repoint-')));
    try
    {
        const project = path.join(dir, 'shop');
        const home = path.join(dir, 'home');
        fs.mkdirSync(path.join(project, '.alfred-tools'), { recursive: true });
        fs.mkdirSync(home, { recursive: true });
        const helper = path.join(project, '.preferred-tools', 'mcp-headers.js');
        const gh = reg('github', 'local', { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headersHelper: `node ${helper} ACME_GH Bearer` }, 'github', 'remote');
        const mine = reg('mine', 'local', { type: 'stdio', command: 'node', args: [path.join(project, '.preferred-tools', 'x.js')] });
        assert.deepStrictEqual(plan(inv({ ...MAC, os: process.platform, project }, { registrations: [gh] }), pickOne('serena'), opts(home)).errors, [REPOINT_FIRST]);
        assert.deepStrictEqual(plan(inv({ ...MAC, os: process.platform, project }, { registrations: [mine] }), pickOne('serena'), opts(home)).errors.filter((e) => e === REPOINT_FIRST), [], 'the user\'s own server does not stop it');
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a came-back folder does not stop install', () => {
    const f = oldFolders('came-back');
    try
    {
        assert.ok(!plan(inv({ ...MAC, project: f.project }), pickOne('serena'), opts(f.home)).errors.includes(MOVE_FIRST));
    }
    finally { f.clean(); }
});

test('the questions call stops before any ask while a move waits', () => {
    const f = oldFolders('move');
    const lines: string[] = [];
    const log = console.log;
    const err = console.error;
    try
    {
        const invFile = path.join(f.dir, 'inv.json');
        fs.writeFileSync(invFile, JSON.stringify(inv({ ...MAC, project: f.project })));
        console.log = (s) => lines.push(s);
        console.error = (s) => lines.push(s);
        const env = { ...process.env };
        const keys = ['HOME', 'USERPROFILE'] as const;
        for (const key of keys) process.env[key] = f.home;
        try { assert.strictEqual(runPlanCommand(['--questions', invFile]), 1); }
        finally { for (const key of keys) { if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key]; } }
        assert.deepStrictEqual(lines, [MOVE_FIRST]);
    }
    finally { console.log = log; console.error = err; f.clean(); }
});
