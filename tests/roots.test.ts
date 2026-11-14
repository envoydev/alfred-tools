// roots.ts - one root folder per scope family (spec D2): the options, the root in use, a named folder, the roots map and
// the record file. Pure where a ctx stands in for the disk; the map and record tests use a throwaway folder.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as roots from '../scripts/roots/roots.ts';
import * as asks from '../scripts/plan/asks-all.ts';
import * as catalogLib from '../scripts/catalog/catalog.ts';
import { OTHER_RE } from './ask-texts.ts';
import * as lists from '../scripts/mcps-list/mcps-list.ts';
import type { Inventory, InvRegistration } from '../scripts/inventory/types.ts';
import type { Machine } from '../scripts/entries/types.ts';
import type { Picks } from '../scripts/plan/types.ts';
import type { Family, RecordEntry } from '../scripts/roots/types.ts';
import type { ServerEntry } from '../scripts/core/types.ts';
import { BRIDGE_VERSION } from '../scripts/copied/mcp-bridge.js';
// POSIX fixture paths (/work/shop): on a Windows host node's path module resolves them under a drive
const POSIX_FIXTURE = process.platform === 'win32' && 'NOT RUN: POSIX fixture paths meet node\'s win32 path module on this host';

const catalog = catalogLib.load();
// alfred-code 3.9.2's pattern, cited where it lives
const inv = (extra: Partial<Inventory> = {}) => ({ version: 1, project: '/work/shop', os: 'darwin', arch: 'arm64', cli: { ok: true }, unreadable: [], registrations: [], plugins: [], marketplaces: [], alfredCodeEnabled: false, sources: {}, ...extra }) as Inventory;
const ctxOf = (present: string[] = [], extra: Partial<Machine> = {}): Machine => ({ project: '/work/shop', home: '/Users/me', platform: 'darwin', catalog, exists: (p: string) => present.includes(p), ...extra });
const ids = (list: { id: string }[]) => list.map((o) => o.id);
const reg = (name: string, scope: string, entry: ServerEntry, rowId: string | null, route: string | null): InvRegistration => ({ name, scope, entry, rowId, route, own: !rowId, alfredRetired: false });
const ALFRED_SET_UP = '/work/shop/.alfred/.gitignore';

test('project root options: .alfred first where alfred-code is set up, else .preferred-tools; \'A folder you name\' last', () => {
    const set = roots.options(inv({ alfredCodeEnabled: true }), 'project', ctxOf([ALFRED_SET_UP]));
    assert.deepStrictEqual(ids(set), ['alfred', 'preferred-tools', 'named']);
    assert.deepStrictEqual(set.map((o) => o.root), ['/work/shop/.alfred', '/work/shop/.preferred-tools', null]);
    assert.strictEqual(set[2]!.label, 'A folder you name');
    assert.deepStrictEqual(ids(roots.options(inv({ alfredCodeEnabled: false }), 'project', ctxOf([ALFRED_SET_UP]))), ['preferred-tools', 'named'], 'alfred-code not enabled');
    assert.deepStrictEqual(ids(roots.options(inv({ alfredCodeEnabled: true }), 'project', ctxOf([]))), ['preferred-tools', 'named'], 'no .alfred/.gitignore');
});

test('global root options: ~/.preferred-tools first; ~/.alfred only when it exists', () => {
    assert.deepStrictEqual(ids(roots.options(inv(), 'global', ctxOf([]))), ['preferred-tools', 'named']);
    const both = roots.options(inv(), 'global', ctxOf(['/Users/me/.alfred']));
    assert.deepStrictEqual(ids(both), ['preferred-tools', 'home-alfred', 'named']);
    assert.deepStrictEqual(both.map((o) => o.root), ['/Users/me/.preferred-tools', '/Users/me/.alfred', null]);
    assert.deepStrictEqual(both.map((o) => o.label).slice(0, 2), ['~/.preferred-tools', '~/.alfred']);
});

test('a root in use is listed first and recommended: the map, else a managed registration\'s helper or data folder, else the root holding .mcps-secrets', { skip: POSIX_FIXTURE }, () => {
    const named = '/work/shop/tools/keys';
    const helper = reg('gh', 'local', { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headersHelper: 'node "/work/shop/kit/mcp-headers.js" GITHUB_PERSONAL_ACCESS_TOKEN Bearer' }, 'github', 'remote');
    const data = reg('pw', 'local', { command: 'npx', args: ['-y', '@playwright/mcp@0.0.83', '--browser', 'chrome', '--user-data-dir', '/work/shop/.preferred-tools/playwright-chrome'] }, 'playwright-chrome', 'local');
    const secrets = '/work/shop/.preferred-tools/.mcps-secrets';
    const map = { version: 1, global: '/k', projects: { '/work/shop': named } };
    const on = [ALFRED_SET_UP, named, '/k', secrets];
    const base = { alfredCodeEnabled: true };

    assert.deepStrictEqual(roots.inUse(inv({ ...base, roots: { map }, registrations: [helper, data] }), 'project', ctxOf(on)), { path: named, from: 'map' });
    assert.deepStrictEqual(roots.inUse(inv({ ...base, roots: { map }, registrations: [helper] }), 'global', ctxOf(on)), { path: '/k', from: 'map' });
    assert.deepStrictEqual(roots.inUse(inv({ ...base, registrations: [data, helper] }), 'project', ctxOf(on)), { path: '/work/shop/kit', from: 'registration' }, 'a helper before a data folder');
    assert.deepStrictEqual(roots.inUse(inv({ ...base, registrations: [data] }), 'project', ctxOf(on)), { path: '/work/shop/.preferred-tools', from: 'registration' });
    assert.deepStrictEqual(roots.inUse(inv(base), 'project', ctxOf(on)), { path: '/work/shop/.preferred-tools', from: 'secrets' });
    assert.strictEqual(roots.inUse(inv(base), 'project', ctxOf([ALFRED_SET_UP])), null);
    assert.strictEqual(roots.inUse(inv({ ...base, roots: { map } }), 'project', ctxOf([])), null, 'a mapped folder that is gone is not in use');
    const own = { ...helper, rowId: null, own: true };
    assert.strictEqual(roots.inUse(inv({ ...base, registrations: [own] }), 'project', ctxOf([ALFRED_SET_UP])), null, 'the user\'s own server is not read');
    const user = { ...helper, scope: 'user' };
    assert.strictEqual(roots.inUse(inv({ ...base, registrations: [user] }), 'project', ctxOf([ALFRED_SET_UP])), null, 'a user registration is the global family\'s');
    assert.deepStrictEqual(roots.inUse(inv({ ...base, registrations: [user] }), 'global', ctxOf([])), { path: '/work/shop/kit', from: 'registration' });

    // listed first and recommended in its place
    const mapped = roots.options(inv({ ...base, roots: { map } }), 'project', ctxOf(on));
    assert.deepStrictEqual(ids(mapped), ['in-use', 'alfred', 'preferred-tools', 'named']);
    assert.strictEqual(mapped[0]!.root, named);
    const standard = roots.options(inv({ ...base, registrations: [data] }), 'project', ctxOf(on));
    assert.deepStrictEqual(ids(standard), ['preferred-tools', 'alfred', 'named'], 'a standard folder in use moves first');
});

test('a named project root must lie inside the project', () => {
    const ctx = ctxOf();
    for (const [text, rule] of [['../x', /\.\./], ['/abs', /inside the project/], ['.git', /\.git/], ['.claude', /\.claude/], ['.claude/keys', /\.claude/], ['tools/../../x', /\.\./], ['', /folder/], ['.', /inside the project/]] as [string, RegExp][])
    {
        const r = roots.resolveNamed('project', text, ctx);
        assert.ok(r.error && !r.root, `${text}: ${JSON.stringify(r)}`);
        assert.match(r.error, rule, text);
    }
    assert.deepStrictEqual(roots.resolveNamed('project', 'tools/keys', ctx), { root: '/work/shop/tools/keys' });
    assert.deepStrictEqual(roots.resolveNamed('project', './tools/keys/', ctx), { root: '/work/shop/tools/keys' });
    const win = { project: 'C:\\ws', home: 'C:\\Users\\mac', platform: 'win32' };
    assert.deepStrictEqual(roots.resolveNamed('project', 'tools\\keys', win), { root: 'C:\\ws\\tools\\keys' });
    assert.match(roots.resolveNamed('project', 'D:\\keys', win).error!, /inside the project/);
});

test('a named global root takes ~ and any absolute folder', () => {
    const ctx = ctxOf();
    assert.deepStrictEqual(roots.resolveNamed('global', '~/keys', ctx), { root: '/Users/me/keys' });
    assert.deepStrictEqual(roots.resolveNamed('global', '/srv/keys/', ctx), { root: '/srv/keys' });
    assert.match(roots.resolveNamed('global', 'keys', ctx).error!, /absolute|~/);
    assert.match(roots.resolveNamed('global', '', ctx).error!, /folder/);
    assert.deepStrictEqual(roots.resolveNamed('global', '~\\keys', { project: 'C:\\ws', home: 'C:\\Users\\mac', platform: 'win32' }), { root: 'C:\\Users\\mac\\keys' });
});

test('each option\'s description gives the exact folder on this machine; the global \'A folder you name\' adds that a project-scope helper does not read keys there', () => {
    const win = { project: 'C:\\ws', home: 'C:\\Users\\mac', platform: 'win32', catalog, exists: (p: string) => ['C:\\ws\\.alfred\\.gitignore', 'C:\\Users\\mac\\.alfred'].includes(p) };
    const project = roots.options(inv({ project: 'C:\\ws', os: 'win32', alfredCodeEnabled: true }), 'project', win);
    assert.match(project[0]!.description!, /^C:\\ws\\\.alfred - kept out of git by alfred-code/);
    assert.match(project[1]!.description!, /^C:\\ws\\\.preferred-tools - /);
    assert.match(project[2]!.description!, /asked next/);
    const global = roots.options(inv({ project: 'C:\\ws', os: 'win32' }), 'global', win);
    assert.match(global[0]!.description!, /^C:\\Users\\mac\\\.preferred-tools - one folder for every project on this machine/);
    assert.match(global[1]!.description!, /^C:\\Users\\mac\\\.alfred - /);
    assert.match(global[2]!.description!, /asked next/);
    assert.match(global[2]!.description!, /a project-scope helper does not read keys here/);
    assert.doesNotMatch(project[2]!.description!, /does not read keys/);
});

test('roots map: missing or malformed reads empty with a note; a second project goes beside the first; the key is the trust root', () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pt-roots-')));
    try
    {
        const empty = { version: 1, global: null, projects: {} };
        assert.deepStrictEqual(roots.readMap(dir), empty, 'missing: empty, no note');
        assert.deepStrictEqual(roots.readMap(null), empty, 'no data folder given');
        const file = path.join(dir, roots.FILES.map);
        fs.writeFileSync(file, '{ not json');
        const bad = roots.readMap(dir);
        assert.deepStrictEqual([bad.global, bad.projects], [null, {}]);
        assert.match(bad.note!, /roots\.json/);
        fs.writeFileSync(file, JSON.stringify({ version: 2, global: '/x', projects: {} }));
        assert.match(roots.readMap(dir).note!, /version/);
        fs.writeFileSync(file, '[]');
        assert.ok(roots.readMap(dir).note, 'an array is malformed');

        // the key is the trust root: a git repository's root for a folder inside it
        const repo = path.join(dir, 'repo');
        const child = path.join(repo, 'web');
        fs.mkdirSync(child, { recursive: true });
        spawnSync('git', ['init', '-q'], { cwd: repo });
        assert.strictEqual(roots.mapKey(child), fs.realpathSync.native(repo));
        const other = path.join(dir, 'other');
        fs.mkdirSync(other);
        const one = roots.withRoot(empty, 'project', child, path.join(repo, '.alfred'));
        const two = roots.withRoot(one, 'project', other, path.join(other, '.preferred-tools'));
        const three = roots.withRoot(two, 'global', other, '/k');
        assert.deepStrictEqual(three, { version: 1, global: '/k', projects: { [fs.realpathSync.native(repo)]: path.join(repo, '.alfred'), [fs.realpathSync.native(other)]: path.join(other, '.preferred-tools') } });
        assert.deepStrictEqual(empty, { version: 1, global: null, projects: {} }, 'withRoot leaves its input as it was');
        fs.writeFileSync(file, JSON.stringify(three));
        assert.deepStrictEqual(roots.readMap(dir), three);
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a 0.4.x record file: missing is null, malformed or another version reads empty with a note', { skip: POSIX_FIXTURE }, () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pt-record-')));
    try
    {
        const file = path.join(dir, roots.FILES.record);
        assert.strictEqual(lists.readOldRecord(file), null);
        fs.writeFileSync(file, 'nope');
        assert.deepStrictEqual([lists.readOldRecord(file)!.servers, Boolean(lists.readOldRecord(file)!.note)], [[], true]);
        fs.writeFileSync(file, JSON.stringify({ version: 3, servers: [{ name: 'x' }] }));
        assert.deepStrictEqual([lists.readOldRecord(file)!.servers, /version/.test(lists.readOldRecord(file)!.note!)], [[], true]);
        const good = { version: 1, servers: [{ name: 'gh', scope: 'local', fingerprint: 'api.githubcopilot.com/mcp/', choice: 'own' }] };
        fs.writeFileSync(file, JSON.stringify(good));
        assert.deepStrictEqual(lists.readOldRecord(file), good);
        // where the commands look: the mapped root, the two standard folders, every root a managed registration points into
        const helper = reg('gh', 'local', { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headersHelper: 'node "/work/shop/kit/mcp-headers.js" GITHUB_PERSONAL_ACCESS_TOKEN Bearer' }, 'github', 'remote');
        const files = lists.oldRecordFiles(inv({ roots: { map: { version: 1, global: null, projects: { '/work/shop': '/work/shop/tools/keys' } } }, registrations: [helper] }), 'project', ctxOf(['/work/shop/tools/keys']));
        assert.deepStrictEqual(files, ['/work/shop/tools/keys', '/work/shop/.preferred-tools', '/work/shop/.alfred', '/work/shop/kit'].map((d) => `${d}/preferred-tools.json`));
        assert.deepStrictEqual(lists.oldRecordFiles(inv(), 'global', ctxOf()), ['/Users/me/.preferred-tools/preferred-tools.json', '/Users/me/.alfred/preferred-tools.json']);
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('no option text mentions Other', () => {
    const on = [ALFRED_SET_UP, '/Users/me/.alfred', '/work/shop/tools/keys'];
    const map = { version: 1, global: null, projects: { '/work/shop': '/work/shop/tools/keys' } };
    const all = (['project', 'global'] as Family[]).flatMap((f) => [...roots.options(inv({ alfredCodeEnabled: true }), f, ctxOf(on)), ...roots.options(inv({ alfredCodeEnabled: true, roots: { map } }), f, ctxOf(on))]);
    const q = asks.allQuestions(inv({ alfredCodeEnabled: true }), { rows: ['playwright-chrome', 'github'], scopes: { github: 'user' } }, catalog, { home: '/Users/me' });
    assert.deepStrictEqual(q.roots!.questions.map((x) => x.id), ['root-project', 'root-global']);
    for (const text of [...all.flatMap((o) => [o.label, o.description]), ...q.roots!.questions.flatMap((x) => [x.question, x.header, ...x.options.flatMap((o) => [o.label, o.description])])])
    {
        assert.doesNotMatch(text!, OTHER_RE, text);
        assert.doesNotMatch(text!, /under Other/, text);
    }
});

test('a root is asked for a family only a pick records into', () => {
    const qs = (picks: Picks | null) => asks.allQuestions(inv(), picks, catalog, { home: '/Users/me' }).roots;
    // an answer about a server already set up asks no root: a server left on its own goes to the root in use (Ruling 3)
    assert.deepStrictEqual(qs({ existing: { 'mcp:atlassian~user': 'own', 'connector:Atlassian': 'own', 'plugin-mcp:x@m/srv': 'add' } })!.questions, []);
    assert.deepStrictEqual(qs({ rows: ['playwright-chrome'] })!.questions.map((x) => x.id), ['root-project'], 'a local route: local scope, the project family');
    assert.deepStrictEqual(qs({ rows: ['playwright-chrome'], scopes: { 'playwright-chrome': 'user' } })!.questions.map((x) => x.id), ['root-global']);
    assert.deepStrictEqual(qs(null)!.questions, []);
    // one question per family, however many picks; the answers map each label to its root
    const r = qs({ rows: ['playwright-chrome', 'serena', 'memory'] });
    assert.strictEqual(r!.questions.length, 1);
    const q = r!.questions[0];
    assert.ok(q!.header.length <= 12, q!.header);
    assert.match(q!.options[0]!.label, / \(Recommended\)$/);
    assert.strictEqual(q!.options.filter((o) => /\(Recommended\)/.test(o.label)).length, 1);
    assert.deepStrictEqual(r!.answers['root-project']![q!.options[0]!.label], { family: 'project', id: 'preferred-tools', root: '/work/shop/.preferred-tools' });
    assert.deepStrictEqual(r!.answers['root-project']!['A folder you name'], { family: 'project', id: 'named', root: null });
});

// ---- 0.3.0: the record holds the servers left on their own, each in its scope family's root (spec F4) -----------------
test('recordFamily: user scope and a connector are global; project, local and a plugin server are project', () => {
    assert.strictEqual(roots.recordFamily({ name: 'gh', scope: 'user', choice: 'own' }), 'global');
    assert.strictEqual(roots.recordFamily({ connector: 'GitLab', choice: 'own' }), 'global');
    assert.strictEqual(roots.recordFamily({ name: 'gh', scope: 'project', choice: 'own' }), 'project');
    assert.strictEqual(roots.recordFamily({ name: 'gh', scope: 'local', choice: 'own' }), 'project');
    assert.strictEqual(roots.recordFamily({ plugin: 'docs@m', server: 'c7', choice: 'own' }), 'project');
    const own = { name: 'a', scope: 'local', choice: 'own' };
    assert.deepStrictEqual(roots.ownOnly([own, { ...own, name: 'b', choice: 'manage' }, { connector: 'X', choice: 'add' }, null] as unknown as RecordEntry[]), [own]);
});

test('shippedState reads the bridge like the helper: absent, lower, same, edited, higher', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-shipped-'));
    try
    {
        const file = path.join(dir, roots.FILES.bridge);
        assert.strictEqual(roots.FILES.bridge, 'mcp-bridge.js');
        const src = roots.shippedSource('bridge');
        assert.deepStrictEqual(roots.shippedState('bridge', file), { state: 'absent', number: null });
        fs.writeFileSync(file, src.replace(/^\/\/ preferred-tools mcp-bridge \d+/, '// preferred-tools mcp-bridge 0'));
        assert.deepStrictEqual(roots.shippedState('bridge', file), { state: 'lower', number: 0 });
        fs.writeFileSync(file, src);
        assert.deepStrictEqual(roots.shippedState('bridge', file), { state: 'same', number: BRIDGE_VERSION });
        fs.writeFileSync(file, `${src}// mine\n`);
        assert.deepStrictEqual(roots.shippedState('bridge', file), { state: 'edited', number: BRIDGE_VERSION });
        fs.writeFileSync(file, src.replace(/^\/\/ preferred-tools mcp-bridge \d+/, `// preferred-tools mcp-bridge ${BRIDGE_VERSION + 1}`));
        assert.deepStrictEqual(roots.shippedState('bridge', file), { state: 'higher', number: BRIDGE_VERSION + 1 });
        // the helper reads through the same function
        assert.deepStrictEqual(roots.helperState(path.join(dir, 'none.js')), roots.shippedState('helper', path.join(dir, 'none.js')));
        assert.strictEqual(roots.helperSource(), roots.shippedSource('helper'));
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('registrationRoots finds a root holding only mcps.json', { skip: POSIX_FIXTURE }, () => {
    const serena = reg('serena', 'project', { type: 'stdio', command: 'uvx', args: ['serena'], env: { SERENA_HOME: '/data/x/serena' } }, 'serena', 'local');
    assert.deepStrictEqual(roots.registrationRoots(inv({ registrations: [serena] }), 'project', ctxOf(['/data/x/mcps.json'])), ['/data/x']);
    assert.deepStrictEqual(roots.registrationRoots(inv({ registrations: [serena] }), 'project', ctxOf([])), [], 'no root file there: not a root');
    assert.strictEqual(roots.FILES.list, 'mcps.json');
});

test('ignoreGap names mcp-remote-v1/ when git would commit it, after the key file, and READ_GUARD holds the two rules', { skip: spawnSync('git', ['--version']).status !== 0 && 'NOT RUN: git is not on PATH' }, () => {
    assert.deepStrictEqual(roots.READ_GUARD, { signIns: 'Read(//**/mcp-remote-v1/**)', secrets: 'Read(//**/.mcps-secrets)' });
    assert.strictEqual(roots.FILES.signIns, 'mcp-remote-v1');
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pt-gap-')));
    try
    {
        assert.strictEqual(spawnSync('git', ['init', '-q', dir]).status, 0);
        const root = path.join(dir, 'tools');
        fs.mkdirSync(root);
        fs.writeFileSync(path.join(root, '.gitignore'), '.mcps-secrets\n');
        const gap = roots.ignoreGap(root, 'global');
        assert.deepStrictEqual(gap, { reason: `git would commit ${path.join(root, 'mcp-remote-v1')}/`, signIns: true });
        fs.appendFileSync(path.join(root, '.gitignore'), 'mcp-remote-v1/\n');
        assert.strictEqual(roots.ignoreGap(root, 'global'), null);
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- serena's context file (spec D7) ----------------------------------------------------------------------------------
test('the # version line is read', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-ctx-'));
    try
    {
        assert.strictEqual(roots.FILES.serenaContext, 'serena-context.yml');
        assert.strictEqual(roots.SERENA_CONTEXT_VERSION, 1);
        const file = path.join(dir, roots.FILES.serenaContext);
        const src = roots.shippedSource('serenaContext');
        assert.strictEqual(src.split('\n')[0], '# preferred-tools serena-context 1');
        assert.deepStrictEqual(roots.shippedState('serenaContext', file), { state: 'absent', number: null });
        fs.writeFileSync(file, src.replace(/^# preferred-tools serena-context \d+/, '# preferred-tools serena-context 0'));
        assert.deepStrictEqual(roots.shippedState('serenaContext', file), { state: 'lower', number: 0 });
        fs.writeFileSync(file, src.replace(/\n/g, '\r\n'));
        assert.deepStrictEqual(roots.shippedState('serenaContext', file), { state: 'same', number: 1 });
        fs.writeFileSync(file, `${src}# mine\n`);
        assert.deepStrictEqual(roots.shippedState('serenaContext', file), { state: 'edited', number: 1 });
        fs.writeFileSync(file, src.replace(/^# preferred-tools serena-context \d+/, '# preferred-tools serena-context 2'));
        assert.deepStrictEqual(roots.shippedState('serenaContext', file), { state: 'higher', number: 2 });
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('GITIGNORE keeps mcp-bridge.js and serena-context.yml in git', () => {
    assert.strictEqual(roots.GITIGNORE, '*\n!.gitignore\n!mcp-headers.js\n!mcp-bridge.js\n!serena-context.yml\n');
});
