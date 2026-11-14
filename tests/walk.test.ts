// The walk (spec F1, F2): `asks.next` hands the command one step of one tool at a time - settings first, then each
// tool's route, scope and name, its root when this run has not answered it, its location and extras, its key name and
// settings - and `done` once nothing is left. Each step is answered with its recommended option here, and recorded into
// picks.json as the commands do.
import test from 'node:test';
import assert from 'node:assert';
import { scopeOfLabel, recommendedScope, PARENT_HELPER_IN_CHILD, settingsQuestion } from '../scripts/plan/asks-keys.ts';
import { routeQuestion, scopesFor } from '../scripts/plan/asks-tool.ts';
import { STATIC, clientsQuestion } from '../scripts/plan/asks-other.ts';
import { all } from '../scripts/plan/asks-all.ts';
import { next, ownStep } from '../scripts/plan/walk.ts';
import { plan } from '../scripts/plan/plan.ts';
import { load } from '../scripts/catalog/catalog.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as cursorMcp from '../scripts/cursor/cursor-mcp.ts';
import { render } from '../scripts/plan/render.ts';
import type { Inventory, InvRegistration } from '../scripts/inventory/types.ts';
import type { ListServer } from '../scripts/mcps-list/types.ts';
import type { CursorWritePlanStep, ListWriteStep, Picks, WalkStep } from '../scripts/plan/types.ts';
import type { Family } from '../scripts/roots/types.ts';
const catalog = load();

const MAC = { os: 'darwin', arch: 'arm64', project: '/work/shop' };
const LINUX = { os: 'linux', arch: 'x64', project: '/work/shop' };
const WIN = { os: 'win32', arch: 'x64', project: 'C:\\work\\shop' };
const HOME = { darwin: '/Users/me', linux: '/home/me', win32: 'C:\\Users\\me' };
const inv = (base: { os: string; arch: string; project: string }, extra: Record<string, unknown> = {}) => ({ version: 1, ...base, cli: { ok: true }, unreadable: [], registrations: [], plugins: [], pluginServers: [], marketplaces: [], alfredCodeEnabled: false, sources: {}, lists: { project: null, global: null }, ...extra }) as unknown as Inventory;
const OPTS = (base: { os: string }) => ({ env: {}, home: HOME[base.os as keyof typeof HOME] });

// one answer: the first option of each question, recorded as install.md and configure.md record it
type WalkPicks = Picks & { clients?: string[] };
type WalkAnswers = Record<string, unknown> & { settings: unknown; clients: unknown };
function record(picks: WalkPicks, step: WalkStep)
{
    const t = step.tool;
    for (const q of step.call!)
    {
        const label = q.options[0]!.label;
        const map = (step.answers && step.answers[q.id]) as Record<string, unknown>;
        const id = q.id;
        if (id === 'settings') picks.walk = map[label] as string;
        else if (id === 'clients') picks.clients = map[label] as string[];
        else if (id.startsWith('route-')) (picks.routes = picks.routes || {})[t!] = label.startsWith('Hosted') ? 'remote' : 'local';
        else if (id.startsWith('scope-')) (picks.scopes = picks.scopes || {})[t!] = scopeOfLabel(label) as string;
        else if (id.startsWith('name-')) (picks.names = picks.names || {})[t!] = 'keep';
        else if (id.startsWith('root-')) (picks.roots = picks.roots || {})[(map[label] as { family: Family }).family] = { id: (map[label] as { id: string }).id };
        else if (id.startsWith('token-')) (picks.tokens = picks.tokens || {})[t!] = label.startsWith('Use a key');
        else if (id.startsWith('own-')) (picks.existing = picks.existing || {})[(map[label] as { key: string }).key] = (map[label] as { choice: string }).choice;
    }
    picks.done = [...(picks.done || []), step.id];
}

// the whole walk: -> [step]
function walk(i: Inventory, picks: WalkPicks, { answer = record, max = 60 }: { answer?: (picks: WalkPicks, step: WalkStep) => void; max?: number } = {})
{
    const steps: WalkStep[] = [];
    for (let n = 0; n < max; n++)
    {
        const s = next(i, picks, catalog, OPTS(i));
        if (s.id === 'done') return steps;
        steps.push(s);
        answer(picks, s);
    }
    throw new Error(`no end after ${max} steps: ${steps.map((s) => s.id).join(', ')}`);
}

test('three picks: each tool\'s steps are contiguous, and no call names two tools', () => {
    // 'Set each tool' at the settings step, the recommended option after it
    const each = (picks: WalkPicks, step: WalkStep) => { record(picks, step); if (step.id === 'settings') picks.walk = 'each'; };
    const steps = walk(inv(MAC), { rows: ['playwright-chrome', 'gitlab', 'serena'] }, { answer: each });
    const ids = steps.map((s) => s.id);
    assert.deepStrictEqual(ids.slice(0, 2), ['clients', 'settings']);
    const tools = steps.slice(2).map((s) => s.tool);
    assert.deepStrictEqual([...new Set(tools)], ['serena', 'gitlab', 'playwright-chrome'], 'catalog group order');
    for (const tool of new Set(tools))
    {
        const at = tools.map((x, k) => (x === tool ? k : -1)).filter((k) => k >= 0);
        assert.strictEqual(at.at(-1)! - at[0]! + 1, at.length, `${tool}'s steps are contiguous: ${ids.join(', ')}`);
    }
    for (const s of steps.slice(2))
    {
        assert.ok(s.call!.length <= 4 && (s.call!.length || s.set), s.id);
        if (!s.id.startsWith('root:')) for (const q of s.call!) assert.ok(q.id.endsWith(s.tool!), `${q.id} in ${s.id}`);
    }
    assert.strictEqual(new Set(ids).size, ids.length, 'no id twice');
});

test('one pick asks the one-tool settings question and nothing about any other tool', () => {
    const s = next(inv(MAC), { rows: ['gitlab'], done: ['clients'] }, catalog, OPTS(MAC));
    assert.strictEqual(s.id, 'settings');
    assert.deepStrictEqual(s.call, [STATIC.settingsOne('gitlab')]);
    assert.deepStrictEqual(STATIC.settingsOne('gitlab').options.map((o) => [o.label, o.description]), [
        ['Use the recommended settings for gitlab (Recommended)', 'route, scope, name and location as recommended'],
        ['Set gitlab up', 'ask its route, scope, name and location'],
    ]);
    assert.deepStrictEqual((s.answers as WalkAnswers).settings, { 'Use the recommended settings for gitlab (Recommended)': 'recommended', 'Set gitlab up': 'each' });
    const many = next(inv(MAC), { rows: ['gitlab', 'serena'], done: ['clients'] }, catalog, OPTS(MAC));
    assert.deepStrictEqual(many.call, [STATIC.settings]);
    for (const step of walk(inv(MAC), { rows: ['gitlab'], walk: 'each', done: ['clients', 'settings'] })) assert.strictEqual(step.tool, 'gitlab', step.id);
});

test("'Use the recommended settings' ends the walk", () => {
    const picks: Picks = { rows: ['gitlab', 'serena'] };
    assert.deepStrictEqual(walk(inv(MAC), picks).map((s) => s.id), ['clients', 'settings']);
    assert.strictEqual(picks.walk, 'recommended');
    assert.deepStrictEqual(next(inv(MAC), picks, catalog, OPTS(MAC)), { id: 'done' });
});

test('a root is asked once, inside the first tool of its family', () => {
    const ids = walk(inv(MAC), { rows: ['serena', 'playwright-chrome', 'memory'], walk: 'each', done: ['clients', 'settings'] }).map((s) => s.id);
    assert.strictEqual(ids.filter((x) => x === 'root:project').length, 1, ids.join(', '));
    assert.ok(ids.indexOf('serena:first') < ids.indexOf('root:project'), ids.join(', '));
    const after = ids.indexOf('serena:questions') >= 0 ? ids.indexOf('serena:questions') : ids.indexOf('serena:keys');
    assert.ok(ids.indexOf('root:project') < after, ids.join(', '));
    // a root already answered is not asked
    assert.ok(!walk(inv(MAC), { rows: ['serena'], walk: 'each', done: ['clients', 'settings'], roots: { project: { id: 'preferred-tools' } } }).some((s) => s.id.startsWith('root:')));
});

test('a key answered No key or OAuth leaves out the key name', () => {
    const noKey = (picks: WalkPicks, step: WalkStep) =>
    {
        record(picks, step);
        if (step.id === 'gitlab:questions') picks.tokens = { gitlab: false };
    };
    const ids = walk(inv(MAC), { rows: ['gitlab'], walk: 'each', done: ['clients', 'settings'] }, { answer: noKey }).map((s) => s.id);
    assert.ok(!ids.includes('gitlab:keys'), ids.join(', '));
    const keyed = walk(inv(MAC), { rows: ['gitlab'], walk: 'each', done: ['clients', 'settings'] });
    const keys = keyed.find((s) => s.id === 'gitlab:keys');
    assert.deepStrictEqual(keys!.call!.map((q) => q.id), ['keyname-gitlab']);
    assert.ok(keys!.answers!['keyname-gitlab']);
});

test("configure: a registration target starts with its own question; 'Leave it on its own' ends it", () => {
    const reg: InvRegistration = { name: 'gitlab', scope: 'project', entry: { type: 'http', url: 'https://gitlab.com/api/v4/mcp' }, rowId: 'gitlab', route: 'remote', own: false, alfredRetired: false, choice: null };
    const c7: InvRegistration = { name: 'context7', scope: 'local', entry: { type: 'http', url: 'https://mcp.context7.com/mcp' }, rowId: 'context7', route: 'remote', own: false, alfredRetired: false, choice: null };
    const i = inv(MAC, { registrations: [reg, c7] });
    const first = next(i, { targets: ['mcp:gitlab~project', 'mcp:context7~local'] }, catalog, OPTS(MAC));
    assert.strictEqual(first.id, 'mcp:gitlab~project:own');
    assert.strictEqual(first.tool, 'mcp:gitlab~project');
    const q = first.call![0];
    assert.strictEqual(q!.question, 'Who looks after gitlab?');
    assert.deepStrictEqual(q!.options.map((o) => [o.label, o.description]), [
        ['preferred-tools (Recommended)', 'configure, update and fix look after it'],
        ['Leave it on its own', 'nothing in this plugin changes its entry again; in .mcp.json it sits with your own servers, after the managed ones; saved in /work/shop/.preferred-tools/mcps.json'],
    ]);
    assert.deepStrictEqual(Object.values(first.answers![q!.id] as object), [{ key: 'mcp:gitlab~project', choice: 'manage' }, { key: 'mcp:gitlab~project', choice: 'own' }]);
    // a local target: no .mcp.json line
    const local = ownStep({ key: 'mcp:context7~local', name: 'context7', scope: 'local' }, '/work/shop/.preferred-tools');
    assert.strictEqual(local.question.options[1]!.description, 'nothing in this plugin changes its entry again; saved in /work/shop/.preferred-tools/mcps.json');
    // 'Leave it on its own': the next step is the next target's
    const left = next(i, { targets: ['mcp:gitlab~project', 'mcp:context7~local'], existing: { 'mcp:gitlab~project': 'own' }, done: ['mcp:gitlab~project:own'] }, catalog, OPTS(MAC));
    assert.strictEqual(left.id, 'mcp:context7~local:own');
    // 'preferred-tools': its own questions follow
    const managed = walk(i, { targets: ['mcp:gitlab~project'] });
    assert.deepStrictEqual(managed.map((s) => s.id).slice(0, 2), ['mcp:gitlab~project:own', 'mcp:gitlab~project:questions']);
    assert.ok(!managed.some((s) => s.id.startsWith('root:')), 'configure asks no root for a target');
});

test('the walk offers no plugin', () => {
    // an old plugin installed here is no row: install's pick, configure's pick and remove name none of them
    const plug = (id: string, scope: string) => ({ id, plugin: id.split('@')[0], marketplace: id.split('@')[1], scope, version: '1.0.0', enabled: true, enabledHere: true, rowId: null, alfredRetired: false });
    const i = inv(MAC, { plugins: [plug('claude-hud@claude-hud', 'user'), plug('typescript-lsp@claude-plugins-official', 'project')] });
    const b = all(i, {}, catalog);
    const text = JSON.stringify([b.pick, b.change, b.remove]);
    for (const name of ['claude-hud', 'typescript-lsp', 'csharp-lsp']) assert.ok(!text.includes(name), name);
    assert.ok(catalog.tools.every((r) => r.kind === 'mcp'));
});

test('a tool with nothing to ask is passed over, and no id comes twice', () => {
    const steps = walk(inv(MAC), { rows: ['serena', 'gitlab'], walk: 'each', done: ['clients', 'settings'] });
    for (const s of steps) assert.ok(s.call!.length || s.set, s.id);
    const ids = steps.map((s) => s.id);
    assert.strictEqual(new Set(ids).size, ids.length);
});

test('gitlab asks scope, name, host and its key in one call', () => {
    const steps = walk(inv(MAC), { rows: ['gitlab'], walk: 'each', done: ['clients', 'settings'] });
    const q = steps.find((s) => s.id === 'gitlab:questions');
    assert.deepStrictEqual(q!.call!.map((x) => x.id), ['scope-gitlab', 'name-gitlab', 'host-gitlab', 'token-gitlab']);
    assert.deepStrictEqual(steps.map((s) => s.id), ['gitlab:questions', 'root:global', 'gitlab:keys']);
});

test('every catalog row on every OS asks at most four questions per step', () => {
    for (const base of [MAC, LINUX, WIN])
    {
        const rows = catalog.tools.filter((r) => r.os.includes(base.os));
        for (const r of rows)
            for (const s of walk(inv(base), { rows: [r.id], walk: 'each', done: ['clients', 'settings'] }))
            {
                assert.ok(s.call!.length <= 4, `${base.os} ${s.id}: ${s.call!.length}`);
                assert.ok(s.call!.length || s.set, `${base.os} ${s.id}: an empty step`);
            }
        // configure: each MCP row installed once, as its recommended install writes it
        const regs = rows.filter((r) => r.kind === 'mcp').map((r) =>
        {
            const add = plan(inv(base), { picks: { [r.id]: {} } }, { home: HOME[base.os as keyof typeof HOME], env: {}, exists: () => false, machine: { docker: true } }).steps.find((x) => x.op === 'mcp-add');
            return add && { name: add.name, scope: add.scope, entry: add.entry, rowId: r.id, route: add.route, own: false, alfredRetired: false, choice: null };
        }).filter(Boolean);
        const i = inv(base, { registrations: regs });
        for (const s of walk(i, { targets: regs.map((x) => `mcp:${x!.name}~${x!.scope}`) }, { max: 200 }))
            assert.ok(s.call!.length <= 4 && (s.call!.length || s.set), `${base.os} configure ${s.id}: ${s.call!.length}`);
    }
});

test('the key is first and recommended at install for context7, sentry, gitlab and atlassian; configure keeps the current answer first', () => {
    for (const id of ['context7', 'sentry', 'gitlab', 'atlassian'])
    {
        const t = all(inv(MAC), { rows: [id] }, catalog, OPTS(MAC)).tools[id];
        const q = t!.questions!.find((x) => x.id === `token-${id}`);
        assert.strictEqual(q!.options[0]!.label, 'Use a key from .mcps-secrets (Recommended)', id);
    }
    const hint = (id: string) => all(inv(MAC), { rows: [id] }, catalog, OPTS(MAC)).tools[id]!.questions!.find((x) => x.id === `token-${id}`)!.options[0]!.description;
    assert.match(hint('gitlab'), /; a fine-grained personal access token with the MCP tool resource and the Execute permission - a legacy token is refused \(403\)$/);
    assert.match(hint('atlassian'), /; an org admin must turn API tokens on; the value is email:api_token; some tools are missing with a token - OAuth has them all$/);
    // configure: a registration with no key keeps 'Sign in with OAuth' first
    const reg: InvRegistration = { name: 'gitlab', scope: 'user', entry: { type: 'http', url: 'https://gitlab.com/api/v4/mcp' }, rowId: 'gitlab', route: 'remote', own: false, alfredRetired: false, choice: null };
    const t = all(inv(MAC, { registrations: [reg] }), { targets: ['mcp:gitlab~user'] }, catalog, OPTS(MAC)).targets['mcp:gitlab~user'];
    assert.strictEqual(t!.questions!.find((x) => x.id === 'token-gitlab')!.options[0]!.label, 'Sign in with OAuth (Recommended)');
});

test('the recommended scope for a hosted key follows M1', () => {
    for (const id of ['gitlab', 'atlassian', 'context7', 'sentry', 'github'])
        assert.strictEqual(recommendedScope(catalog.byId.get(id)!, 'remote'), PARENT_HELPER_IN_CHILD ? 'project' : 'user', id);
    assert.strictEqual(recommendedScope(catalog.byId.get('serena')!, 'local'), 'local');
});

// ---- the bridge (0.4.0) ---------------------------------------------------------------------------------------------


test('sentry offers three routes, Hosted first, and the bridge recommends Project', () => {
    const sentry = catalog.byId.get('sentry');
    const q = routeQuestion(sentry!);
    assert.strictEqual(q!.question, 'sentry: which route?');
    assert.deepStrictEqual(q!.options.map((o) => o.label), ['Hosted (Recommended)', 'Local', 'Bridge']);
    assert.strictEqual(recommendedScope(sentry!, 'bridge'), 'project');
    assert.strictEqual(settingsQuestion(sentry!, 'bridge'), null);
    assert.ok(scopesFor(sentry!, 'bridge').includes('project'));
});

// a real project folder: the URL-name questions read the .mcps-secrets chain from disk
const bridgeWalk = (base: { os: string; arch: string; project: string }, { secrets = null }: { secrets?: string | null } = {}) =>
{
    const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pt-bwalk-')));
    const project = path.join(d, 'shop');
    const home = path.join(d, 'home');
    fs.mkdirSync(project, { recursive: true });
    fs.mkdirSync(home, { recursive: true });
    if (secrets) { fs.mkdirSync(path.join(project, '.preferred-tools')); fs.writeFileSync(path.join(project, '.preferred-tools', '.mcps-secrets'), secrets); }
    const i = inv({ ...base, project });
    const steps: WalkStep[] = [];
    const picks: Picks = { rows: ['sentry'], walk: 'each', done: ['clients', 'settings'], routes: { sentry: 'bridge' } };
    try
    {
        for (let n = 0; n < 20; n++)
        {
            const s = next(i, picks, catalog, { env: {}, home });
            if (s.id === 'done') break;
            steps.push(s);
            record(picks, s);
            picks.routes = { sentry: 'bridge' };
        }
    }
    finally { fs.rmSync(d, { recursive: true, force: true }); }
    return steps;
};

test('the bridge keys step asks the key name and each URL name, the catalog name first and a filled SENTRY_SLUG beside it', () => {
    const steps = bridgeWalk(MAC, { secrets: 'SENTRY_SLUG=x\n' });
    const keys = steps.find((s) => s.id === 'sentry:keys');
    assert.deepStrictEqual(keys!.call!.map((q) => q.id), ['keyname-sentry', 'urlname-sentry-SENTRY_ORG', 'urlname-sentry-SENTRY_PROJECT']);
    const org = keys!.call![1];
    assert.strictEqual(org!.header, 'URL name');
    assert.strictEqual(org!.question, "Which name holds sentry's organization slug in .mcps-secrets?");
    assert.strictEqual(org!.options[0]!.label, 'SENTRY_ORG (Recommended)');
    assert.match(org!.options.find((o) => o.label === 'SENTRY_SLUG')!.description, /^filled in /, 'a filled name is offered beside it');
    assert.ok(!org!.options.some((o) => /SENTRY_ACCESS_TOKEN/.test(o.label)), 'never the key');
    assert.strictEqual(org!.options[org!.options.length - 1]!.label, 'A name you choose');
    assert.strictEqual((keys!.answers![org!.id] as Record<string, string>)['SENTRY_ORG (Recommended)'], 'SENTRY_ORG');
    assert.strictEqual((keys!.answers![org!.id] as Record<string, string> & { SENTRY_SLUG: string }).SENTRY_SLUG, 'SENTRY_SLUG');
    assert.strictEqual((keys!.answers![org!.id] as Record<string, string>)['A name you choose'], 'named');
    assert.strictEqual(keys!.call![2]!.options[0]!.label, 'SENTRY_PROJECT (Recommended)');
    // another SENTRY name filled - a URL, a DSN, an environment - is never recommended over the catalog's (review I2):
    // SENTRY_ENVIRONMENT=production is a valid slug and would connect to the wrong URL with no warning
    const other = bridgeWalk(MAC, { secrets: 'SENTRY_URL=https://sentry.io/\nSENTRY_DSN=https://k@o1.ingest.sentry.io/1\nSENTRY_ENVIRONMENT=production\nSENTRY_ORG=acme\n' }).find((s) => s.id === 'sentry:keys');
    assert.deepStrictEqual(other!.call!.slice(1).map((q) => q.options[0]!.label), ['SENTRY_ORG (Recommended)', 'SENTRY_PROJECT (Recommended)']);
    const unfilled = bridgeWalk(MAC, { secrets: 'SENTRY_ENVIRONMENT=production\n' }).find((s) => s.id === 'sentry:keys');
    assert.deepStrictEqual(unfilled!.call!.slice(1).map((q) => q.options[0]!.label), ['SENTRY_ORG (Recommended)', 'SENTRY_PROJECT (Recommended)']);
    // with nothing filled, the catalog's names are recommended
    const plain = bridgeWalk(MAC).find((s) => s.id === 'sentry:keys');
    assert.strictEqual(plain!.call![1]!.options[0]!.label, 'SENTRY_ORG (Recommended)');
});

test('every bridge step asks at most four questions with two to four options', () => {
    for (const base of [MAC, LINUX, WIN])
        for (const s of bridgeWalk(base, { secrets: 'SENTRY_SLUG=x\nSENTRY_ORG_NAME=y\nSENTRY_TEAM=z\n' }))
        {
            assert.ok(s.call!.length >= 1 && s.call!.length <= 4, `${base.os} ${s.id}: ${s.call!.length}`);
            for (const q of s.call!) assert.ok(q.options.length >= 2 && q.options.length <= 4, `${base.os} ${q.id}: ${q.options.length}`);
        }
});

// ---- which apps (spec D3) -------------------------------------------------------------------------------------------

const appsDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pt-apps-')));
test.after(() => fs.rmSync(appsDir, { recursive: true, force: true }));
let apps = 0;
function appsHome({ cursorDir = false, onPath = [] }: { cursorDir?: boolean; onPath?: string[] } = {})
{
    const d = path.join(appsDir, `h${++apps}`);
    const home = path.join(d, 'home');
    const bin = path.join(d, 'bin');
    for (const x of [home, bin]) fs.mkdirSync(x, { recursive: true });
    if (cursorDir) fs.mkdirSync(path.join(home, '.cursor'));
    for (const n of onPath) fs.writeFileSync(path.join(bin, process.platform === 'win32' ? `${n}.cmd` : n), '');
    return { platform: process.platform, home, env: { PATH: bin, Path: bin } };
}
const C7_HTTP = { type: 'http', url: 'https://mcp.context7.com/mcp' };
const c7reg = (scope = 'project'): InvRegistration => ({ name: 'c7', scope, entry: C7_HTTP, rowId: 'context7', route: 'remote', own: false, alfredRetired: false, choice: null });
const c7listed = (scope: string, clients: string[]): ListServer => ({ name: 'c7', scope, row: 'context7', route: 'remote', clients, entry: C7_HTTP, key: null });
const LIST = '/work/shop/.preferred-tools/mcps.json';

test('the clients ask: two options, one recommended and first, following detection', () => {
    const withCursorDir = () => appsHome({ cursorDir: true });
    const withCursorAgentOnPath = () => appsHome({ onPath: ['cursor-agent'] });
    const withCursorOnPath = () => appsHome({ onPath: ['cursor'] });
    const neither = () => appsHome();
    for (const [setup, first] of [[withCursorDir, 'Claude Code and Cursor (Recommended)'], [withCursorAgentOnPath, 'Claude Code and Cursor (Recommended)'], [withCursorOnPath, 'Claude Code and Cursor (Recommended)'], [neither, 'Claude Code only (Recommended)']] as [() => ReturnType<typeof appsHome>, string][])
    {
        const { question: q, answers } = clientsQuestion(cursorMcp.cursorFound(setup(), inv(MAC)));
        assert.equal(q.options.length, 2);
        assert.equal(q.options[0]!.label, first);
        assert.strictEqual(q.id, 'clients');
        assert.strictEqual(q.question, 'Which apps should these servers be set up for?');
        assert.deepStrictEqual(answers[q.options.find((o) => o.label.startsWith('Claude Code and Cursor'))!.label], ['claude', 'cursor']);
        assert.deepStrictEqual(answers[q.options.find((o) => o.label.startsWith('Claude Code only'))!.label], ['claude']);
    }
    // a list that already has a Cursor entry counts as found
    const listed = inv(MAC, { lists: { project: { file: LIST, servers: [c7listed('project', ['claude', 'cursor'])], own: [] }, global: null } });
    assert.strictEqual(cursorMcp.cursorFound(appsHome(), listed), true);
    assert.deepStrictEqual(STATIC.clients.options.map((o) => o.label), ['Claude Code and Cursor (Recommended)', 'Claude Code only']);
});

test('bare agent on PATH does not count as Cursor', () => {
    assert.strictEqual(cursorMcp.cursorFound(appsHome({ onPath: ['agent'] }), inv(MAC)), false);
});

test('the install walk asks clients before settings', () => {
    const s = next(inv(MAC), { rows: ['gitlab'] }, catalog, OPTS(MAC));
    assert.strictEqual(s.id, 'clients');
    assert.deepStrictEqual(s.call!.map((q) => q.id), ['clients']);
    assert.ok((s.answers as WalkAnswers).clients, 'next.answers.clients maps each label to its clients');
    assert.strictEqual(next(inv(MAC), { rows: ['gitlab'], done: ['clients'] }, catalog, OPTS(MAC)).id, 'settings');
    // nothing picked: no clients step
    assert.deepStrictEqual(next(inv(MAC), { rows: [] }, catalog, OPTS(MAC)), { id: 'done' });
});

test('install for both writes the list with both clients and one cursor-write per file', { skip: process.platform === 'win32' && 'NOT RUN: a darwin fixture on a win32 host' }, () => {
    const answers = { clients: ['claude', 'cursor'], picks: { context7: { route: 'remote', scope: 'project', token: false }, memory: { scope: 'user' } } };
    const p = plan(inv(MAC), answers, { env: {}, home: '/Users/me' });
    assert.deepStrictEqual(p.errors, []);
    const lw = (p.steps.filter((s) => s.op === 'list-write') as ListWriteStep[]);
    assert.deepStrictEqual(lw.flatMap((s) => s.upserts.map((u) => [u.server.name, u.server.clients])).sort(), [['context7', ['claude', 'cursor']], ['memory', ['claude', 'cursor']]]);
    const cw = (p.steps.filter((s) => s.op === 'cursor-write') as CursorWritePlanStep[]);
    assert.deepStrictEqual(cw.map((s) => s.file).sort(), ['/Users/me/.cursor/mcp.json', '/work/shop/.cursor/mcp.json']);
    const text = render(p);
    assert.ok(text.includes('Apps: Claude Code and Cursor'), text);
    // Claude Code only: no cursor-write, and the plan says so
    const only = plan(inv(MAC), { ...answers, clients: ['claude'] }, { env: {}, home: '/Users/me' });
    assert.deepStrictEqual((only.steps.filter((s) => s.op === 'cursor-write') as CursorWritePlanStep[]), []);
    assert.ok(render(only).includes('Apps: Claude Code\n'), render(only));
    // no answer (an older answers file): Claude Code only, no Apps line
    const none = plan(inv(MAC), { picks: answers.picks }, { env: {}, home: '/Users/me' });
    assert.deepStrictEqual((none.steps.filter((s) => s.op === 'list-write') as ListWriteStep[]).flatMap((s) => s.upserts.map((u) => u.server.clients)), [['claude'], ['claude']]);
    assert.ok(!render(none).includes('Apps:'));
});

test('configure: a clients change alone plans no mcp step', { skip: process.platform === 'win32' && 'NOT RUN: a darwin fixture on a win32 host' }, () => {
    const i = inv(MAC, { registrations: [c7reg()], lists: { project: { file: LIST, servers: [c7listed('project', ['claude'])], own: [] }, global: null } });
    // the question: what the entry has now first and marked
    const b = all(i, { targets: ['mcp:c7~project'] }, catalog, OPTS(MAC));
    const q = b.targets['mcp:c7~project']!.clients!.question;
    assert.strictEqual(q.id, 'clients-mcp:c7~project');
    assert.strictEqual(q.question, 'Set up c7 for which apps?');
    assert.deepStrictEqual(q.options.map((o) => o.label), ['Claude Code only (Recommended)', 'Claude Code and Cursor']);
    const ids = walk(i, { targets: ['mcp:c7~project'] }).map((s) => s.id);
    assert.ok(ids.includes('mcp:c7~project:clients'), ids.join(', '));
    // the change: list-write and cursor-write only
    const p = plan(i, { change: { 'mcp:c7~project': { row: 'context7', clients: ['claude', 'cursor'] } } }, { env: {}, home: '/Users/me' });
    assert.deepStrictEqual(p.errors, []);
    assert.deepStrictEqual(p.steps.filter((s) => s.op.startsWith('mcp-')), []);
    const lw = (p.steps.find((s) => s.op === 'list-write') as ListWriteStep);
    assert.deepStrictEqual(lw.upserts.map((u) => [u.server.name, u.server.clients, u.after, u.server.entry]), [['c7', ['claude', 'cursor'], null, C7_HTTP]]);
    assert.deepStrictEqual((p.steps.filter((s) => s.op === 'cursor-write') as CursorWritePlanStep[]).map((s) => [s.file, s.before]), [['/work/shop/.cursor/mcp.json', []]]);
    // and back to Claude Code only: the Cursor entry goes
    const both = inv(MAC, { registrations: [c7reg()], lists: { project: { file: LIST, servers: [c7listed('project', ['claude', 'cursor'])], own: [] }, global: null } });
    assert.deepStrictEqual(all(both, { targets: ['mcp:c7~project'] }, catalog, OPTS(MAC)).targets['mcp:c7~project']!.clients!.question.options.map((o) => o.label), ['Claude Code and Cursor (Recommended)', 'Claude Code only']);
    const back = plan(both, { change: { 'mcp:c7~project': { row: 'context7', clients: ['claude'] } } }, { env: {}, home: '/Users/me' });
    assert.deepStrictEqual(back.steps.filter((s) => s.op.startsWith('mcp-')), []);
    assert.deepStrictEqual((back.steps.filter((s) => s.op === 'cursor-write') as CursorWritePlanStep[]).map((s) => s.before), [['c7']]);
});

test('configure remove takes the entry out of both apps and the list', { skip: process.platform === 'win32' && 'NOT RUN: a darwin fixture on a win32 host' }, () => {
    const i = inv(MAC, { registrations: [c7reg('local')], lists: { project: { file: LIST, servers: [c7listed('local', ['claude', 'cursor'])], own: [] }, global: null } });
    const p = plan(i, { remove: [{ kind: 'mcp', name: 'c7', scope: 'local' }] }, { env: {}, home: '/Users/me' });
    assert.deepStrictEqual(p.errors, []);
    assert.deepStrictEqual(p.steps.map((s) => s.op), ['mcp-remove', 'list-write', 'cursor-write']);
    assert.deepStrictEqual((p.steps[1] as ListWriteStep).drops.map((d) => d.key), ['mcp:c7~local']);
    assert.deepStrictEqual((p.steps[2] as CursorWritePlanStep).before, ['c7']);
});
