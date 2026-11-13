'use strict';
// plan-lists.js - the list-write steps a plan writes into each family's mcps.json (spec D1).
const test = require('node:test');
const assert = require('node:assert');
const { listSteps } = require('../scripts/plan-lists.js');

const POSIX_FIXTURE = process.platform === 'win32' && 'NOT RUN: a darwin fixture meets node\'s win32 path module on this host (the matrix covers Windows)';
const PROJECT_LIST = '/work/shop/.preferred-tools/mcps.json';
const GLOBAL_LIST = '/Users/me/.preferred-tools/mcps.json';
const C7 = { type: 'http', url: 'https://mcp.context7.com/mcp' };
const listed = (name, scope, extra = {}) => ({ name, scope, row: 'context7', route: 'remote', clients: ['claude'], entry: C7, key: null, ...extra });
const inv = (lists = { project: null, global: null }) => ({ project: '/work/shop', os: 'darwin', registrations: [], roots: { map: null }, lists });
const ctx = (roots = { project: '/work/shop/.preferred-tools', global: '/Users/me/.preferred-tools' }) => ({ platform: 'darwin', project: '/work/shop', home: '/Users/me', roots, uses: [], exists: () => false });
const add = (name, scope) => ({ op: 'mcp-add', name, scope, entry: C7, row: 'context7', route: 'remote' });

test('an add upserts into its family root\'s list, after its own registration step, entry filled at apply', { skip: POSIX_FIXTURE }, () => {
    const c = ctx();
    const steps = listSteps(inv(), c, { notes: [] }, [add('c7', 'user'), add('c7l', 'local')]);
    assert.deepStrictEqual(steps.map((s) => [s.file, s.family, s.upserts.map((u) => [u.server.name, u.after, u.server.entry])]), [
        [GLOBAL_LIST, 'global', [['c7', 'mcp:c7~user', null]]],
        [PROJECT_LIST, 'project', [['c7l', 'mcp:c7l~local', null]]],
    ]);
    assert.deepStrictEqual(c.uses.map((u) => u.family).sort(), ['global', 'project'], 'each list\'s root is a root this run writes into');
});

test('a move drops its from key and upserts the destination, keeping the clients and key it was listed with', { skip: POSIX_FIXTURE }, () => {
    const was = listed('c7', 'local', { clients: ['claude', 'cursor'], key: 'WORK_C7' });
    const i = inv({ project: { file: PROJECT_LIST, servers: [was], own: [] }, global: null });
    const move = { op: 'mcp-move', from: { name: 'c7', scope: 'local' }, to: { name: 'docs', scope: 'user' }, entry: C7, row: 'context7', route: 'remote' };
    const steps = listSteps(i, ctx(), { notes: [] }, [move]);
    const byFile = Object.fromEntries(steps.map((s) => [s.file, s]));
    assert.deepStrictEqual(byFile[PROJECT_LIST].drops, [{ key: 'mcp:c7~local', after: 'mcp:docs~user' }]);
    const u = byFile[GLOBAL_LIST].upserts[0];
    assert.deepStrictEqual([u.server.name, u.server.scope, u.server.clients, u.server.key, u.after], ['docs', 'user', ['claude', 'cursor'], 'WORK_C7', 'mcp:docs~user']);
});

test('a root change drops the server from the old root\'s list and lists it in the new one', { skip: POSIX_FIXTURE }, () => {
    const i = inv({ project: { file: PROJECT_LIST, servers: [listed('c7', 'local')], own: [] }, global: null });
    const replace = { op: 'mcp-replace', name: 'c7', scope: 'local', entry: C7, old: C7, row: 'context7', route: 'remote' };
    const steps = listSteps(i, ctx({ project: '/work/shop/tools', global: null }), { notes: [] }, [replace]);
    assert.deepStrictEqual(steps.map((s) => [s.file, s.upserts.map((u) => u.server.name), s.drops.map((d) => d.key)]), [
        [PROJECT_LIST, [], ['mcp:c7~local']],
        ['/work/shop/tools/mcps.json', ['c7'], []],
    ]);
});

test('a family with no root and no list gets no step; a remove of a server no list holds plans nothing', { skip: POSIX_FIXTURE }, () => {
    assert.deepStrictEqual(listSteps(inv(), ctx({ project: null, global: null }), { notes: [] }, [add('c7', 'user')]), []);
    assert.deepStrictEqual(listSteps(inv(), ctx(), { notes: [] }, [{ op: 'mcp-remove', name: 'c7', scope: 'user' }]), []);
});

test('install over 0.4.x registrations imports the family it writes', { skip: POSIX_FIXTURE }, () => {
    const serena = { name: 'serena', scope: 'project', rowId: 'serena', route: 'local', own: false, alfredRetired: false, choice: null, entry: { command: 'uvx', args: ['--from', 'serena-agent@2.1.0', 'serena', 'start-mcp-server'] } };
    const i = { ...inv({ project: { file: PROJECT_LIST, servers: [], own: [], old: '/work/shop/.preferred-tools/preferred-tools.json' }, global: null }), registrations: [serena] };
    const steps = listSteps(i, ctx(), { notes: [] }, [add('memory', 'project')]);
    assert.deepStrictEqual(steps.map((s) => s.op), ['list-write', 'retire-record']);
    assert.deepStrictEqual(steps[0].upserts.map((u) => [u.server.name, u.after, u.server.clients]), [['memory', 'mcp:memory~project', ['claude']], ['serena', null, ['claude']]]);
    assert.deepStrictEqual(steps[0].upserts[1].server.entry, serena.entry, 'an imported server carries its entry as read');
    assert.strictEqual(steps[1].file, '/work/shop/.preferred-tools/preferred-tools.json');
});

// ---- Cursor's files (spec D2, D4, D4a): cursor-write steps and the cursor-name-taken question --------------------------
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { cursorSteps, takenNames, renderLine } = require('../scripts/plan-lists.js');
const { cursorNameQuestion } = require('../scripts/asks.js');
const applyLib = require('../scripts/apply.js');
const cursorMcp = require('../scripts/cursor-mcp.js');
const catalogAll = require('../scripts/catalog.js').load();

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pt-plcur-')));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
let worlds = 0;
const SERENA_E = { command: 'uvx', args: ['--from', 'serena-agent@2.1.0', 'serena', 'start-mcp-server'] };
const MEMORY_E = { command: 'uvx', args: ['mcp-memory-service'] };
const srv = (name, scope = 'project', clients = ['claude', 'cursor'], row = name, entry = name === 'serena' ? SERENA_E : MEMORY_E) => ({ name, scope, row, route: 'local', clients, entry, key: null });
function cursorWorld({ cursor, servers = [], under = null } = {})
{
    const dir = path.join(tmp, `w${++worlds}`);
    const project = path.join(dir, under || '', 'shop');
    const home = path.join(dir, 'home');
    for (const d of [project, home]) fs.mkdirSync(d, { recursive: true });
    const listFile = path.join(project, '.preferred-tools', 'mcps.json');
    const cursorFile = path.join(project, '.cursor', 'mcp.json');
    if (servers.length) { fs.mkdirSync(path.dirname(listFile), { recursive: true }); fs.writeFileSync(listFile, JSON.stringify({ version: 1, servers, own: [] })); }
    if (typeof cursor === 'string') { fs.mkdirSync(path.dirname(cursorFile), { recursive: true }); fs.writeFileSync(cursorFile, cursor); }
    const i = { project, os: process.platform, registrations: [], roots: { map: null }, lists: { project: servers.length ? { file: listFile, servers, own: [] } : null, global: null } };
    const c = { platform: process.platform, project, env: { HOME: home, USERPROFILE: home }, home, roots: { project: path.dirname(listFile), global: null }, uses: [], catalog: catalogAll };
    return { dir, project, home, listFile, cursorFile, inv: i, ctx: c };
}
const listWriteOf = (w, servers, drops = []) => ({ op: 'list-write', file: w.listFile, family: 'project', upserts: servers.map((server) => ({ server, after: null, cursorFile: null })), drops, own: null, why: 'x' });
const outOf = (...steps) => ({ steps, notes: [], errors: [] });
const runFiles = (w, out, extra) =>
{
    const report = { appliedKeys: new Set(), cursorFiles: new Set() };
    for (const s of [...out.steps, ...extra])
    {
        const r = s.op === 'list-write' ? applyLib.listWrite(s, { project: w.project, env: w.ctx.env, report }) : cursorMcp.cursorWrite(s, { catalog: catalogAll });
        assert.strictEqual(r.ok, true, r.detail);
        if (s.op === 'cursor-write') report.cursorFiles.add(s.file);
    }
};
const readList = (w) => JSON.parse(fs.readFileSync(w.listFile, 'utf8'));

test('a name Cursor already has asks cursor-name-taken, Replace recommended for the same row', () => {
    const f = '/work/shop/.cursor/mcp.json';
    const { question: q, answers } = cursorNameQuestion({ file: f, name: 'serena', sameRow: true });
    assert.match(q.options[0].label, /^Replace it with the plugin's \(Recommended\)$/);
    assert.equal(q.options.length, 2);
    assert.strictEqual(q.id, `cursor-name-serena@${f}`);
    assert.ok(q.header.length <= 12, q.header);
    assert.deepStrictEqual(Object.values(answers), ['replace', 'keep']);
    assert.match(q.question, /already has a server named serena that preferred-tools did not write/);
});

test('another server under that name recommends Keep', () => {
    const { question: q, answers } = cursorNameQuestion({ file: '/work/shop/.cursor/mcp.json', name: 'serena', sameRow: false });
    assert.strictEqual(q.options[0].label, "Keep Cursor's own (Recommended)");
    assert.strictEqual(q.options[1].label, "Replace it with the plugin's");
    assert.deepStrictEqual(Object.values(answers), ['keep', 'replace']);
    assert.match(q.options[0].description, /^serena is set up for Claude Code only/);
});

test('a plan that sets a server up for Cursor writes one cursor-write per file, after the list-write, before from the lists', () => {
    const w = cursorWorld({ servers: [srv('memory')] });
    const out = outOf(listWriteOf(w, [srv('serena')]));
    const steps = cursorSteps(w.inv, w.ctx, out, {});
    assert.deepStrictEqual(out.errors, []);
    assert.deepStrictEqual(steps.map((s) => [s.op, s.file, s.family, s.before, s.replace]), [['cursor-write', w.cursorFile, 'project', ['memory'], []]]);
    assert.deepStrictEqual(steps[0].lists, [{ file: w.listFile, scopes: ['local', 'project'] }]);
    assert.strictEqual(out.steps[0].upserts[0].cursorFile, w.cursorFile, 'the upsert names the Cursor file it waits on');
    // a plan that leaves every Cursor entry as it was writes none
    assert.deepStrictEqual(cursorSteps(w.inv, w.ctx, outOf(listWriteOf(w, [srv('c7', 'project', ['claude'], 'context7', { type: 'http', url: 'https://mcp.context7.com/mcp' })])), {}), []);
});

test('Keep leaves Cursor\'s entry byte-identical and records clients claude', () => {
    const text = '{\n  "mcpServers": {\n    "serena": { "command": "my-serena" }\n  }\n}\n';
    const w = cursorWorld({ cursor: text });
    const out = outOf(listWriteOf(w, [srv('serena')]));
    const steps = cursorSteps(w.inv, w.ctx, out, { cursorNames: { [`serena@${w.cursorFile}`]: 'keep' } });
    assert.deepStrictEqual(out.errors, []);
    assert.deepStrictEqual(out.steps[0].upserts[0].server.clients, ['claude']);
    runFiles(w, out, steps);
    assert.strictEqual(fs.readFileSync(w.cursorFile, 'utf8'), text);
    assert.deepStrictEqual(readList(w).servers.map((s) => [s.name, s.clients]), [['serena', ['claude']]]);
});

test('Replace puts the name in the step\'s replace and the plan line names it', () => {
    const w = cursorWorld({ cursor: '{"mcpServers":{"serena":{"command":"my-serena"},"mine":{"command":"node"}}}' });
    const out = outOf(listWriteOf(w, [srv('serena')]));
    const steps = cursorSteps(w.inv, w.ctx, out, { cursorNames: { [`serena@${w.cursorFile}`]: 'replace' } });
    assert.deepStrictEqual(steps[0].replace, ['serena']);
    assert.match(renderLine(steps[0]), new RegExp(`replaces your own serena in ${w.cursorFile.replace(/[\\.]/g, '\\$&')}`));
    runFiles(w, out, steps);
    const doc = JSON.parse(fs.readFileSync(w.cursorFile, 'utf8'));
    assert.deepStrictEqual(doc.mcpServers.serena, SERENA_E);
    assert.deepStrictEqual(Object.keys(doc.mcpServers), ['serena', 'mine']);
});

test('no answer for a taken name is a plan error and nothing is written', () => {
    const text = '{"mcpServers":{"serena":{"command":"my-serena"}}}';
    const w = cursorWorld({ cursor: text });
    const out = outOf(listWriteOf(w, [srv('serena')]));
    const steps = cursorSteps(w.inv, w.ctx, out, {});
    assert.deepStrictEqual(out.errors, [`cursor: ${w.cursorFile} already has serena - answer cursor-name-serena@${w.cursorFile}`]);
    assert.deepStrictEqual(out.taken, [{ file: w.cursorFile, name: 'serena', sameRow: false }], 'plan.js turns each into a cursor-name question in plan.json');
    const planFile = path.join(w.dir, 'plan.json');
    fs.writeFileSync(planFile, JSON.stringify({ version: 1, project: w.project, steps: [...out.steps, ...steps], notes: out.notes, errors: out.errors }));
    const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'apply.js'), planFile], { encoding: 'utf8' });
    assert.strictEqual(r.status, 1, r.stderr);
    assert.strictEqual(fs.readFileSync(w.cursorFile, 'utf8'), text);
    assert.ok(!fs.existsSync(w.listFile));
});

test('a symlinked .cursor/mcp.json is a note: Claude Code is written, the entries recorded without cursor, no cursor-write', { skip: process.platform === 'win32' && 'NOT RUN: a symlink needs Developer Mode on Windows' }, () => {
    const w = cursorWorld();
    const target = path.join(w.dir, 'elsewhere.json');
    fs.writeFileSync(target, '{"mcpServers":{}}');
    fs.mkdirSync(path.dirname(w.cursorFile), { recursive: true });
    fs.symlinkSync(target, w.cursorFile);
    const out = outOf(listWriteOf(w, [srv('serena')]));
    assert.deepStrictEqual(cursorSteps(w.inv, w.ctx, out, {}), []);
    assert.deepStrictEqual(out.errors, []);
    assert.strictEqual(out.notes.length, 1);
    assert.match(out.notes[0], new RegExp(`^Cursor: ${w.cursorFile.replace(/[\\.]/g, '\\$&')} is a symbolic link.* - not written; Claude Code is$`));
    assert.deepStrictEqual(out.steps[0].upserts[0].server.clients, ['claude']);
    assert.strictEqual(out.steps[0].upserts[0].cursorFile, null);
});

test('under a refusal a new entry is recorded without cursor and an entry already marked keeps it', () => {
    const w = cursorWorld({ cursor: '{ // mine\n "mcpServers": {} }', servers: [srv('memory')] });
    const out = outOf(listWriteOf(w, [srv('memory'), srv('serena')]));
    assert.deepStrictEqual(cursorSteps(w.inv, w.ctx, out, {}), []);
    assert.match(out.notes.join('\n'), /not JSON .* - not written; Claude Code is/);
    assert.deepStrictEqual(out.steps[0].upserts.map((u) => [u.server.name, u.server.clients]), [['memory', ['claude', 'cursor']], ['serena', ['claude']]]);
});

const GIT = spawnSync('git', ['--version']).status === 0;
const gitInit = (dir) => assert.strictEqual(spawnSync('git', ['init', '-q', dir]).status, 0);
const GIT_NOTE = '.cursor/mcp.json now holds this machine\'s local servers; add it to .gitignore to keep them private';

test('a local entry in an unignored .cursor/mcp.json gets the git note', { skip: !GIT && 'NOT RUN: git is not on PATH' }, () => {
    const w = cursorWorld();
    gitInit(w.project);
    const out = outOf(listWriteOf(w, [srv('serena', 'local')]));
    assert.strictEqual(cursorSteps(w.inv, w.ctx, out, {}).length, 1);
    assert.ok(out.notes.includes(GIT_NOTE), out.notes.join('\n'));
    // ignored, or project scope only: no note
    fs.writeFileSync(path.join(w.project, '.gitignore'), '.cursor/mcp.json\n');
    const again = outOf(listWriteOf(w, [srv('serena', 'local')]));
    cursorSteps(w.inv, w.ctx, again, {});
    assert.ok(!again.notes.includes(GIT_NOTE));
    fs.rmSync(path.join(w.project, '.gitignore'));
    const project = outOf(listWriteOf(w, [srv('serena', 'project')]));
    cursorSteps(w.inv, w.ctx, project, {});
    assert.ok(!project.notes.includes(GIT_NOTE));
});

test('cursor plan with git absent adds no git note and does not throw', () => {
    const w = cursorWorld();
    fs.mkdirSync(path.join(w.project, '.git'));
    const empty = path.join(w.dir, 'no-bin');
    fs.mkdirSync(empty);
    const keep = { PATH: process.env.PATH, Path: process.env.Path };
    try
    {
        process.env.PATH = empty;
        if (keep.Path !== undefined) process.env.Path = empty;
        const out = outOf(listWriteOf(w, [srv('serena', 'local')]));
        assert.strictEqual(cursorSteps(w.inv, w.ctx, out, {}).length, 1);
        assert.ok(!out.notes.includes(GIT_NOTE), out.notes.join('\n'));
    }
    finally
    {
        process.env.PATH = keep.PATH;
        if (keep.Path !== undefined) process.env.Path = keep.Path;
    }
});

test('a project inside a parent repo gets the no-workspace note; a repo root with no child repos gets none', () => {
    const note = (w) => `Cursor reads .cursor/mcp.json only from the folder it opens (its git root for the CLI), never a parent's: open Cursor at ${w.project}, or install at Global scope for servers every folder needs`;
    const notesOf = (w) => { const out = outOf(listWriteOf(w, [srv('serena')])); cursorSteps(w.inv, w.ctx, out, {}); return out.notes; };
    // a folder of a parent repo
    const inside = cursorWorld({ under: 'mono' });
    fs.mkdirSync(path.join(inside.dir, 'mono', '.git'), { recursive: true });
    assert.ok(notesOf(inside).includes(note(inside)));
    // a repo root of its own, no child repos
    const root = cursorWorld();
    fs.mkdirSync(path.join(root.project, '.git'));
    assert.deepStrictEqual(notesOf(root), []);
    // a folder holding child repos
    const holder = cursorWorld();
    fs.mkdirSync(path.join(holder.project, 'app', '.git'), { recursive: true });
    assert.ok(notesOf(holder).includes(note(holder)));
    // Global scope alone: no note
    const g = cursorWorld({ under: 'mono2' });
    fs.mkdirSync(path.join(g.dir, 'mono2', '.git'), { recursive: true });
    const gl = path.join(g.home, '.preferred-tools', 'mcps.json');
    const out = outOf({ op: 'list-write', file: gl, family: 'global', upserts: [{ server: srv('serena', 'user'), after: null, cursorFile: null }], drops: [], own: null, why: 'x' });
    const steps = cursorSteps(g.inv, { ...g.ctx, roots: { project: null, global: path.dirname(gl) } }, out, {});
    assert.deepStrictEqual(steps.map((s) => [s.file, s.lists]), [[path.join(g.home, '.cursor', 'mcp.json'), [{ file: gl, scopes: ['user'] }]]]);
    assert.deepStrictEqual(out.notes, []);
});

test('a member file holding the name asks for that file, keyed <name>@<file>', () => {
    const w = cursorWorld({ cursor: '{"mcpServers":{"serena":{"command":"uvx","args":["--from","serena-agent@2.0.0","serena","start-mcp-server"]}}}' });
    const member = path.join(w.project, 'app', '.cursor', 'mcp.json');
    fs.mkdirSync(path.dirname(member), { recursive: true });
    fs.writeFileSync(member, '{"mcpServers":{"serena":{"command":"something-else"}}}');
    const upserts = [{ server: srv('serena'), cursorFile: w.cursorFile }, { server: srv('serena'), cursorFile: member }];
    const taken = takenNames(w.inv, w.ctx, upserts);
    assert.deepStrictEqual(taken, [{ file: w.cursorFile, name: 'serena', sameRow: true }, { file: member, name: 'serena', sameRow: false }]);
    const ids = taken.map((t) => cursorNameQuestion(t).question.id);
    assert.deepStrictEqual(ids, [`cursor-name-serena@${w.cursorFile}`, `cursor-name-serena@${member}`]);
    // a name the list already marks for Cursor is not taken
    const marked = cursorWorld({ cursor: '{"mcpServers":{"serena":{"command":"x"}}}', servers: [srv('serena')] });
    assert.deepStrictEqual(takenNames(marked.inv, marked.ctx, [{ server: srv('serena'), cursorFile: marked.cursorFile }]), []);
});

// ---- hosted routes in both apps (spec D5, ruling 12, ruling 13) -----------------------------------------------------
const planLib = require('../scripts/plan.js');
const E = require('../scripts/entries.js');
const { READ_GUARD } = require('../scripts/roots.js');
const MR = catalogAll.byId.get('sentry').routes.bridge.package;
const hinv = (extra = {}) => ({ version: 1, os: 'darwin', arch: 'arm64', project: '/work/shop', cli: { ok: true }, unreadable: [], registrations: [], plugins: [], pluginServers: [], marketplaces: [], alfredCodeEnabled: false, sources: {}, roots: { map: null }, lists: { project: null, global: null }, ...extra });
const HOPTS = { env: {}, home: '/Users/me' };
const GROOT = '/Users/me/.preferred-tools';
const GLIST = `${GROOT}/mcps.json`;
const hreg = (name, rowId, entry, scope = 'user', route = 'remote') => ({ name, scope, entry, rowId, route, own: false, alfredRetired: false, choice: null });
const hlisted = (name, row, entry, clients, scope = 'user', extra = {}) => ({ name, scope, row, route: 'remote', clients, entry, key: null, ...extra });
const ops = (p) => p.steps.map((s) => s.op);
const upsertsOf = (p) => p.steps.filter((s) => s.op === 'list-write').flatMap((s) => s.upserts);
const HELPER_C7 = { type: 'http', url: 'https://mcp.context7.com/mcp', headersHelper: `node ${GROOT}/mcp-headers.js CONTEXT7_API_KEY Bearer` };
const ATL_URL = 'https://mcp.atlassian.com/v2/mcp';

for (const [id, url] of [['gitlab', 'https://gitlab.com/api/v4/mcp'], ['atlassian', ATL_URL], ['sentry', 'https://mcp.sentry.dev/mcp']])
{
    test(`${id} with no key, for both apps: both get the same mcp-remote entry with the root as MCP_REMOTE_CONFIG_DIR`, { skip: POSIX_FIXTURE }, () => {
        const p = planLib.plan(hinv(), { clients: ['claude', 'cursor'], picks: { [id]: { route: 'remote', scope: 'user', token: false } } }, HOPTS);
        assert.deepStrictEqual(p.errors, []);
        const add = p.steps.find((s) => s.op === 'mcp-add');
        assert.deepStrictEqual(add.entry, { type: 'stdio', command: 'npx', args: ['-y', `mcp-remote@${MR.version}`, url], env: { npm_config_before: MR.cutoff, MCP_REMOTE_CONFIG_DIR: GROOT } });
        const [u] = upsertsOf(p);
        assert.deepStrictEqual([u.server.clients, u.server.form, u.server.cursorEntry], [['claude', 'cursor'], 'signin', undefined]);
        assert.deepStrictEqual(p.steps.filter((s) => s.op === 'cursor-write').map((s) => s.file), ['/Users/me/.cursor/mcp.json']);
        assert.deepStrictEqual(p.oauth.map((o) => [o.name, o.signin]), [[id, true]]);
        assert.ok(planLib.render(p).includes(`OAuth: ${id}: your browser opens to sign in the first time it starts, in Claude Code or Cursor; the sign-in is kept in ${GROOT}/mcp-remote-v1/ and serves both.`), planLib.render(p));
    });
}

test('a keyless OAuth entry for Claude Code only is the http form', { skip: POSIX_FIXTURE }, () => {
    const p = planLib.plan(hinv(), { clients: ['claude'], picks: { atlassian: { route: 'remote', scope: 'user', token: false } } }, HOPTS);
    assert.deepStrictEqual(p.steps.find((s) => s.op === 'mcp-add').entry, { type: 'http', url: ATL_URL });
    assert.match(planLib.render(p), /OAuth: run \/mcp once in a session to log in to atlassian\./);
    assert.ok(!ops(p).includes('deny-read'), 'no sign-in form, no key name: no rule');
});

test('context7 with no key stays http in both apps', { skip: POSIX_FIXTURE }, () => {
    const p = planLib.plan(hinv(), { clients: ['claude', 'cursor'], picks: { context7: { route: 'remote', scope: 'user', token: false } } }, HOPTS);
    assert.deepStrictEqual(p.steps.find((s) => s.op === 'mcp-add').entry, { type: 'http', url: 'https://mcp.context7.com/mcp' });
    const [u] = upsertsOf(p);
    assert.deepStrictEqual([u.server.clients, u.server.form], [['claude', 'cursor'], null]);
});

test('sentry\'s bridge route has no cursorEntry and both apps get the same entry', { skip: POSIX_FIXTURE }, () => {
    const p = planLib.plan(hinv(), { clients: ['claude', 'cursor'], picks: { sentry: { route: 'bridge', scope: 'user' } } }, HOPTS);
    assert.deepStrictEqual(p.errors, []);
    const [u] = upsertsOf(p);
    assert.deepStrictEqual([u.server.clients, u.server.form], [['claude', 'cursor'], null], 'no Cursor form: the list-write keeps no cursorEntry');
});

test('a keyed hosted entry for both apps is two forms: Claude keeps the helper, the plan writes the bridge into the root', { skip: POSIX_FIXTURE }, () => {
    const p = planLib.plan(hinv(), { clients: ['claude', 'cursor'], picks: { context7: { route: 'remote', scope: 'user', token: true } } }, HOPTS);
    assert.deepStrictEqual(p.errors, []);
    assert.ok(p.steps.find((s) => s.op === 'mcp-add').entry.headersHelper);
    assert.strictEqual(upsertsOf(p)[0].server.form, 'two');
    assert.ok(ops(p).includes('write-bridge'), ops(p).join());
});

test('adding Cursor to a 0.4.x helper-form context7 writes mcp-bridge.js into the root and makes no Claude call', { skip: POSIX_FIXTURE }, () => {
    const i = hinv({ registrations: [hreg('context7', 'context7', HELPER_C7)], lists: { project: null, global: { file: GLIST, servers: [hlisted('context7', 'context7', HELPER_C7, ['claude'])], own: [] } } });
    const p = planLib.plan(i, { change: { 'mcp:context7~user': { row: 'context7', clients: ['claude', 'cursor'] } } }, HOPTS);
    assert.deepStrictEqual(p.errors, []);
    assert.deepStrictEqual(ops(p).filter((o) => o.startsWith('mcp-')), []);
    assert.ok(ops(p).includes('write-bridge'), ops(p).join());
    assert.ok(ops(p).indexOf('cursor-write') > ops(p).indexOf('list-write'));
    const [u] = upsertsOf(p);
    assert.deepStrictEqual([u.server.clients, u.server.form, u.after], [['claude', 'cursor'], 'two', null]);
});

test('an entry with other headers is Claude Code only, with the reason', { skip: POSIX_FIXTURE }, () => {
    const e = { ...HELPER_C7, headers: { 'X-Team': 'docs' } };
    const i = hinv({ registrations: [hreg('context7', 'context7', e)], lists: { project: null, global: { file: GLIST, servers: [hlisted('context7', 'context7', e, ['claude'])], own: [] } } });
    const p = planLib.plan(i, { change: { 'mcp:context7~user': { row: 'context7', clients: ['claude', 'cursor'] } } }, HOPTS);
    assert.ok(p.notes.includes('context7: set up for Claude Code only - its X-Team header has no bridge equivalent'), p.notes.join('\n'));
    assert.ok(!ops(p).includes('cursor-write'), ops(p).join());
    assert.ok(upsertsOf(p).every((u) => !u.server.clients.includes('cursor')));
});

test('adding Cursor to an http atlassian entry plans mcp-replace, list-write and cursor-write, with the sign-in line', { skip: POSIX_FIXTURE }, () => {
    const http = { type: 'http', url: ATL_URL };
    const i = hinv({ registrations: [hreg('atlassian', 'atlassian', http)], lists: { project: null, global: { file: GLIST, servers: [hlisted('atlassian', 'atlassian', http, ['claude'])], own: [] } } });
    const p = planLib.plan(i, { change: { 'mcp:atlassian~user': { row: 'atlassian', clients: ['claude', 'cursor'] } } }, HOPTS);
    assert.deepStrictEqual(p.errors, []);
    const rep = p.steps.find((s) => s.op === 'mcp-replace');
    assert.ok(E.signInParts(rep.entry), JSON.stringify(rep.entry));
    for (const op of ['list-write', 'cursor-write']) assert.ok(ops(p).includes(op), ops(p).join());
    assert.ok(p.notes.includes(`atlassian: sign in once more - the sign-in now lives in ${GROOT}/mcp-remote-v1/ and serves both apps`), p.notes.join('\n'));
});

test('taking Cursor off a shared entry plans mcp-replace back to http, with the /mcp line', { skip: POSIX_FIXTURE }, () => {
    const shared = E.signInFormOf(ATL_URL, GROOT, catalogAll, { platform: 'darwin' });
    const i = hinv({ registrations: [hreg('atlassian', 'atlassian', shared)], lists: { project: null, global: { file: GLIST, servers: [hlisted('atlassian', 'atlassian', shared, ['claude', 'cursor'])], own: [] } } });
    const p = planLib.plan(i, { change: { 'mcp:atlassian~user': { row: 'atlassian', clients: ['claude'] } } }, HOPTS);
    assert.deepStrictEqual(p.errors, []);
    assert.deepStrictEqual(p.steps.find((s) => s.op === 'mcp-replace').entry, { type: 'http', url: ATL_URL });
    assert.ok(p.notes.includes('atlassian: Claude Code signs in on its own again (/mcp)'), p.notes.join('\n'));
    assert.deepStrictEqual(p.steps.filter((s) => s.op === 'cursor-write').map((s) => s.before), [['atlassian']]);
});

test('a root where git would commit mcp-remote-v1/ gets the Claude-only http form and the note', { skip: (!GIT && 'NOT RUN: git is not on PATH') || POSIX_FIXTURE }, () => {
    const w = cursorWorld();
    gitInit(w.project);
    const root = path.join(w.project, 'tools');
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'notes.md'), 'mine\n');
    fs.writeFileSync(path.join(root, '.gitignore'), '.mcps-secrets\npreferred-tools.json\nmcps.json\n');
    const i = hinv({ project: w.project });
    const p = planLib.plan(i, { clients: ['claude', 'cursor'], roots: { project: { id: 'named', path: 'tools' } }, picks: { atlassian: { route: 'remote', scope: 'project', token: false } } }, { env: {}, home: w.home });
    assert.deepStrictEqual(p.errors, []);
    assert.deepStrictEqual(p.steps.find((s) => s.op === 'mcp-add').entry, { type: 'http', url: ATL_URL });
    assert.ok(p.notes.includes(`${root}: git would commit mcp-remote-v1/ - atlassian is set up for Claude Code only; /preferred-tools:fix (root-ignore) covers it, then configure adds Cursor`), p.notes.join('\n'));
    assert.deepStrictEqual(upsertsOf(p).map((u) => u.server.clients), [['claude']]);
});

test('a plan writing a shared sign-in entry adds the sign-in rule; one with ensure-key-name adds the key-file rule', { skip: POSIX_FIXTURE }, () => {
    const p = planLib.plan(hinv(), { clients: ['claude', 'cursor'], picks: { atlassian: { route: 'remote', scope: 'user', token: false } } }, HOPTS);
    const d = p.steps.find((s) => s.op === 'deny-read');
    assert.deepStrictEqual([d.file, d.rules], ['/Users/me/.claude/settings.json', [READ_GUARD.signIns]]);
    assert.strictEqual(ops(p).indexOf('deny-read'), ops(p).indexOf('list-write') - 1, 'last before list-write');
    assert.ok(planLib.render(p).includes(`   adds ${READ_GUARD.signIns} to permissions.deny in /Users/me/.claude/settings.json  (keeps AI sessions out of the sign-in tokens and the key file)`), planLib.render(p));
    const k = planLib.plan(hinv(), { picks: { context7: { route: 'remote', scope: 'user', token: true } } }, HOPTS);
    assert.ok(ops(k).includes('ensure-key-name'), ops(k).join());
    assert.deepStrictEqual(k.steps.find((s) => s.op === 'deny-read').rules, [READ_GUARD.secrets]);
});

test('a second plan with the rules present plans no deny-read', () => {
    const w = cursorWorld();
    const conf = path.join(w.dir, 'claude-config');
    fs.mkdirSync(conf);
    fs.writeFileSync(path.join(conf, 'settings.json'), JSON.stringify({ permissions: { deny: [READ_GUARD.secrets, READ_GUARD.signIns] } }));
    const p = planLib.plan(hinv({ project: w.project, os: process.platform }), { clients: ['claude', 'cursor'], picks: { atlassian: { route: 'remote', scope: 'user', token: false } } }, { env: { CLAUDE_CONFIG_DIR: conf }, home: w.home });
    assert.deepStrictEqual(p.errors, []);
    assert.ok(!ops(p).includes('deny-read'), ops(p).join());
});

test('deny-read\'s file sits under the isolated CLAUDE_CONFIG_DIR, never the real config folder', () => {
    const w = cursorWorld();
    const conf = path.join(w.dir, 'claude-config');
    const p = planLib.plan(hinv({ project: w.project, os: process.platform }), { clients: ['claude', 'cursor'], picks: { atlassian: { route: 'remote', scope: 'user', token: false } } }, { env: { CLAUDE_CONFIG_DIR: conf }, home: w.home });
    assert.strictEqual(p.steps.find((s) => s.op === 'deny-read').file, path.join(conf, 'settings.json'));
    // a settings file that is not JSON: a note, no step, and Claude Code and Cursor are still written
    fs.mkdirSync(conf, { recursive: true });
    fs.writeFileSync(path.join(conf, 'settings.json'), '{ nope');
    const bad = planLib.plan(hinv({ project: w.project, os: process.platform }), { clients: ['claude', 'cursor'], picks: { atlassian: { route: 'remote', scope: 'user', token: false } } }, { env: { CLAUDE_CONFIG_DIR: conf }, home: w.home });
    assert.ok(!ops(bad).includes('deny-read'));
    assert.ok(ops(bad).includes('mcp-add') && ops(bad).includes('cursor-write'), ops(bad).join());
    assert.ok(bad.notes.some((n) => n.startsWith(`${path.join(conf, 'settings.json')} is not a settings object`)), bad.notes.join('\n'));
});

// ---- a workspace in Cursor (spec D4a) ----------------------------------------------------------------------------------
const wsLib = require('../scripts/workspace.js');
const wsRec = (folder, doc) => { fs.mkdirSync(path.join(folder, '.alfred'), { recursive: true }); fs.writeFileSync(path.join(folder, '.alfred', 'workspace.json'), JSON.stringify(doc)); };
const MEMORY_A = { command: 'uvx', args: ['mcp-memory-service', '--a'] };
// a root (the project, `shop`) listing a, b and c, c ignored; each member's record names the root. `own`: a's own list.
function wsWorld({ own = [], at = null } = {})
{
    const w = cursorWorld();
    wsRec(w.project, { role: 'root', children: ['a', 'b', 'c'], ignoredChildren: ['c'] });
    const m = Object.fromEntries(['a', 'b', 'c'].map((c) => { const d = path.join(w.project, c); fs.mkdirSync(d); wsRec(d, { parent: '..' }); return [c, d]; }));
    const aList = path.join(m.a, '.preferred-tools', 'mcps.json');
    if (own.length) { fs.mkdirSync(path.dirname(aList), { recursive: true }); fs.writeFileSync(aList, JSON.stringify({ version: 1, servers: own, own: [] })); }
    w.inv.workspace = wsLib.of(at || w.project, {});
    const cf = (d) => path.join(d, '.cursor', 'mcp.json');
    return { ...w, m, aList, cf };
}
const cursorNames = (file) => (fs.existsSync(file) ? Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).mcpServers) : null);
const cursorDoc = (file) => JSON.parse(fs.readFileSync(file, 'utf8')).mcpServers;

test('workspace: two joined children get the root\'s project entries after their own; the ignored one gets none', () => {
    const w = wsWorld({ own: [srv('memory', 'project', ['claude', 'cursor'], 'memory', MEMORY_A)] });
    const out = outOf(listWriteOf(w, [srv('serena'), srv('memory')]));
    const steps = cursorSteps(w.inv, w.ctx, out, {});
    assert.deepStrictEqual(out.errors, []);
    assert.deepStrictEqual(steps.map((s) => [s.file, s.lists]), [
        [w.cursorFile, [{ file: w.listFile, scopes: ['local', 'project'] }]],
        [w.cf(w.m.a), [{ file: w.aList, scopes: ['local', 'project'] }, { file: w.listFile, scopes: ['project'] }]],
        [w.cf(w.m.b), [{ file: w.listFile, scopes: ['project'] }]],
    ]);
    runFiles(w, out, steps);
    assert.deepStrictEqual(cursorNames(w.cf(w.m.b)).sort(), ['memory', 'serena']);
    assert.deepStrictEqual(cursorDoc(w.cf(w.m.a)).memory, MEMORY_A, 'a\'s own memory wins over the root\'s: the nearest first');
    assert.deepStrictEqual(cursorDoc(w.cf(w.m.a)).serena, SERENA_E);
    assert.strictEqual(cursorNames(w.cf(w.m.c)), null, 'the ignored child is not written');
    for (const c of ['b', 'c']) assert.ok(!fs.existsSync(path.join(w.m[c], '.preferred-tools')), `${c} gets no root`);
});

test('workspace: local-scope root entries are not passed down', () => {
    const w = wsWorld();
    const out = outOf(listWriteOf(w, [srv('serena', 'local')]));
    const steps = cursorSteps(w.inv, w.ctx, out, {});
    assert.deepStrictEqual(steps.map((s) => s.file), [w.cursorFile], 'a local change writes no member');
    const both = outOf(listWriteOf(w, [srv('serena', 'local'), srv('memory', 'project')]));
    const bsteps = cursorSteps(w.inv, w.ctx, both, {});
    runFiles(w, both, bsteps);
    assert.deepStrictEqual(cursorNames(w.cf(w.m.b)), ['memory']);
});

test('workspace: removing a root entry removes it from each member, and no member gets a root or a list', () => {
    const w = wsWorld();
    const first = outOf(listWriteOf(w, [srv('serena'), srv('memory')]));
    runFiles(w, first, cursorSteps(w.inv, w.ctx, first, {}));
    assert.deepStrictEqual(cursorNames(w.cf(w.m.a)).sort(), ['memory', 'serena']);
    // the inventory as the next run reads it
    const servers = readList(w).servers;
    w.inv.lists.project = { file: w.listFile, servers, own: [] };
    const out = outOf({ ...listWriteOf(w, []), drops: [{ key: 'mcp:serena~project', after: null }] });
    const steps = cursorSteps(w.inv, w.ctx, out, {});
    assert.deepStrictEqual(steps.map((s) => [s.file, [...s.before].sort()]), [[w.cursorFile, ['memory', 'serena']], [w.cf(w.m.a), ['memory', 'serena']], [w.cf(w.m.b), ['memory', 'serena']]]);
    runFiles(w, out, steps);
    for (const c of ['a', 'b']) assert.deepStrictEqual(cursorNames(w.cf(w.m[c])), ['memory'], c);
    for (const c of ['a', 'b', 'c']) assert.ok(!fs.existsSync(path.join(w.m[c], '.preferred-tools')), `${c} gets no root`);
});

test('workspace: a member copy edited or removed by hand is left as it is when the root changes, and named', () => {
    const w = wsWorld();
    const first = outOf(listWriteOf(w, [srv('serena'), srv('memory')]));
    runFiles(w, first, cursorSteps(w.inv, w.ctx, first, {}));
    // a's serena edited by hand, b's memory removed by hand
    const aDoc = JSON.parse(fs.readFileSync(w.cf(w.m.a), 'utf8'));
    aDoc.mcpServers.serena = { ...aDoc.mcpServers.serena, args: [...aDoc.mcpServers.serena.args, '--mine'] };
    fs.writeFileSync(w.cf(w.m.a), JSON.stringify(aDoc, null, 2));
    const bDoc = JSON.parse(fs.readFileSync(w.cf(w.m.b), 'utf8'));
    delete bDoc.mcpServers.memory;
    fs.writeFileSync(w.cf(w.m.b), JSON.stringify(bDoc, null, 2));
    const editedA = fs.readFileSync(w.cf(w.m.a), 'utf8');
    // the next run at the root drops memory's root entry and keeps serena
    w.inv.lists.project = { file: w.listFile, servers: readList(w).servers, own: [] };
    const out = outOf({ ...listWriteOf(w, [srv('serena')]), drops: [{ key: 'mcp:memory~project', after: null }] });
    const steps = cursorSteps(w.inv, w.ctx, out, {});
    assert.deepStrictEqual(steps.find((s) => s.file === w.cf(w.m.a)).skip, ['serena']);
    assert.ok(out.notes.includes(`serena: Cursor's copy was changed by hand - left; run /preferred-tools:fix`), out.notes.join('\n'));
    runFiles(w, out, steps);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(w.cf(w.m.a), 'utf8')).mcpServers.serena, JSON.parse(editedA).mcpServers.serena, 'the hand edit stays');
    assert.ok(!cursorNames(w.cf(w.m.a)).includes('memory'), 'the dropped root entry still leaves');
});

test('workspace: a plan at a member writes its own file with the root\'s project entries after its own', () => {
    const w = wsWorld({ at: null });
    // the root lists serena for Cursor already
    fs.mkdirSync(path.dirname(w.listFile), { recursive: true });
    fs.writeFileSync(w.listFile, JSON.stringify({ version: 1, servers: [srv('serena')], own: [] }));
    const a = { project: w.m.a, listFile: w.aList, cursorFile: w.cf(w.m.a) };
    const inv = { ...w.inv, project: w.m.a, lists: { project: null, global: null }, workspace: wsLib.of(w.m.a, {}) };
    const ctx = { ...w.ctx, project: w.m.a, roots: { project: path.dirname(w.aList), global: null } };
    const out = outOf({ op: 'list-write', file: w.aList, family: 'project', upserts: [{ server: srv('memory'), after: null, cursorFile: null }], drops: [], own: null, why: 'x' });
    const steps = cursorSteps(inv, ctx, out, {});
    assert.deepStrictEqual(steps.map((s) => [s.file, s.lists, s.before]), [[a.cursorFile, [{ file: w.aList, scopes: ['local', 'project'] }, { file: w.listFile, scopes: ['project'] }], ['serena']]]);
    runFiles({ ...w, project: w.m.a }, out, steps);
    assert.deepStrictEqual(cursorNames(a.cursorFile).sort(), ['memory', 'serena']);
});

test('workspace: a root in git with a plain-folder member gets the note for its own entries', { skip: !GIT && 'NOT RUN: git is not on PATH' }, () => {
    const w = wsWorld();
    gitInit(w.project);
    const inv = { ...w.inv, project: w.m.a, lists: { project: null, global: null }, workspace: wsLib.of(w.m.a, {}) };
    const ctx = { ...w.ctx, project: w.m.a, roots: { project: path.dirname(w.aList), global: null } };
    const out = outOf({ op: 'list-write', file: w.aList, family: 'project', upserts: [{ server: srv('memory'), after: null, cursorFile: null }], drops: [], own: null, why: 'x' });
    cursorSteps(inv, ctx, out, {});
    const note = `${w.m.a} is a folder of ${w.project}'s git repo; Cursor's CLI reads ${w.project}/.cursor/mcp.json there, so these servers reach the editor opened at ${w.m.a} only. Install them at the root or at Global scope for the CLI`;
    assert.deepStrictEqual(out.notes, [note]);
    // a member that is its own repo: no note
    gitInit(w.m.b);
    const bout = outOf({ op: 'list-write', file: path.join(w.m.b, '.preferred-tools', 'mcps.json'), family: 'project', upserts: [{ server: srv('memory'), after: null, cursorFile: null }], drops: [], own: null, why: 'x' });
    cursorSteps({ ...inv, project: w.m.b, workspace: wsLib.of(w.m.b, {}) }, { ...ctx, project: w.m.b, roots: { project: path.join(w.m.b, '.preferred-tools'), global: null } }, bout, {});
    assert.deepStrictEqual(bout.notes, []);
});

test('workspace: a member file holding a root name as its own asks for that file; keep skips it there only', () => {
    const w = wsWorld();
    fs.mkdirSync(path.dirname(w.cf(w.m.b)), { recursive: true });
    fs.writeFileSync(w.cf(w.m.b), '{"mcpServers":{"serena":{"command":"mine"}}}\n');
    const out = outOf(listWriteOf(w, [srv('serena')]));
    cursorSteps(w.inv, w.ctx, out, {});
    assert.deepStrictEqual(out.errors, [`cursor: ${w.cf(w.m.b)} already has serena - answer cursor-name-serena@${w.cf(w.m.b)}`]);
    const kept = outOf(listWriteOf(w, [srv('serena')]));
    const steps = cursorSteps(w.inv, w.ctx, kept, { cursorNames: { [`serena@${w.cf(w.m.b)}`]: 'keep' } });
    assert.deepStrictEqual(kept.errors, []);
    assert.deepStrictEqual(kept.steps[0].upserts[0].server.clients, ['claude', 'cursor'], 'keep in a member leaves the root\'s entry for Cursor');
    runFiles(w, kept, steps);
    assert.deepStrictEqual(cursorDoc(w.cf(w.m.b)).serena, { command: 'mine' });
    assert.deepStrictEqual(cursorDoc(w.cf(w.m.a)).serena, SERENA_E);
});

test('workspace: a record read as no workspace is named once in a plan that writes Cursor\'s project file', () => {
    const w = cursorWorld();
    fs.mkdirSync(path.join(w.project, '.alfred'), { recursive: true });
    fs.writeFileSync(path.join(w.project, '.alfred', 'workspace.json'), '{ nope');
    w.inv.workspace = wsLib.of(w.project, {});
    const out = outOf(listWriteOf(w, [srv('serena')]));
    cursorSteps(w.inv, w.ctx, out, {});
    assert.deepStrictEqual(out.notes.filter((l) => l.includes('read as no workspace')), [`${path.join(w.project, '.alfred', 'workspace.json')} is not JSON - read as no workspace`]);
    // a plan that writes no Cursor file says nothing of it
    const quiet = outOf(listWriteOf(w, [srv('c7', 'project', ['claude'], 'context7', { type: 'http', url: 'https://mcp.context7.com/mcp' })]));
    cursorSteps(w.inv, w.ctx, quiet, {});
    assert.deepStrictEqual(quiet.notes, []);
});

// ---- stdio keyed routes (spec D6) --------------------------------------------------------------------------------------
const D6_NOTE = 'Cursor: not written - this route keeps its key in the registration, and .cursor/mcp.json may be committed; pick the hosted route for Cursor';
// context7 local holds its key only once the name is filled (its --api-key arg): a real project with a filled key file
function keyedProject()
{
    const w = cursorWorld();
    const root = path.join(w.project, '.preferred-tools');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, '.mcps-secrets'), `CONTEXT7_API_KEY=ctx7sk-${'z'.repeat(32)}\n`);
    return { inv: hinv({ project: w.project, roots: { map: null, project: { path: root, from: 'secrets' }, global: null } }), opts: { env: { HOME: w.home }, home: w.home } };
}
for (const id of ['github', 'sentry', 'context7'])
{
    test(`${id} local, keyed, at local scope: no Cursor write and the note`, { skip: POSIX_FIXTURE }, () => {
        const k = id === 'context7' ? keyedProject() : { inv: hinv(), opts: HOPTS };
        const p = planLib.plan(k.inv, { clients: ['claude', 'cursor'], picks: { [id]: { route: 'local', scope: 'local', token: true } } }, k.opts);
        assert.ok(cursorMcp.stdioKeyed(p.steps.find((s) => s.op === 'mcp-add').entry, catalogAll.byId.get(id), 'local'), 'the entry holds its key field');
        assert.deepStrictEqual(p.errors, []);
        assert.ok(p.notes.includes(D6_NOTE), p.notes.join('\n'));
        assert.deepStrictEqual(upsertsOf(p).map((u) => u.server.clients), [['claude']]);
        assert.deepStrictEqual(p.steps.filter((s) => s.op === 'cursor-write'), []);
    });
}

test('context7 local with no key is written to Cursor', { skip: POSIX_FIXTURE }, () => {
    const p = planLib.plan(hinv(), { clients: ['claude', 'cursor'], picks: { context7: { route: 'local', scope: 'local', token: false } } }, HOPTS);
    assert.deepStrictEqual(p.errors, []);
    assert.ok(!p.notes.includes(D6_NOTE));
    assert.deepStrictEqual(upsertsOf(p).map((u) => u.server.clients), [['claude', 'cursor']]);
    assert.strictEqual(p.steps.filter((s) => s.op === 'cursor-write').length, 1);
});

test('stdioKeyed is the rule: a route with a tokenVar whose entry holds a token field', () => {
    const gh = catalogAll.byId.get('github');
    const c7 = catalogAll.byId.get('context7');
    assert.strictEqual(cursorMcp.stdioKeyed({ command: 'docker', env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'x' } }, gh, 'local'), true);
    assert.strictEqual(cursorMcp.stdioKeyed({ command: 'npx', args: ['-y', '@upstash/context7-mcp', '--api-key', 'x'] }, c7, 'local'), true);
    assert.strictEqual(cursorMcp.stdioKeyed({ command: 'npx', args: ['-y', '@upstash/context7-mcp'] }, c7, 'local'), false);
    assert.strictEqual(cursorMcp.stdioKeyed({ type: 'http', url: 'https://mcp.context7.com/mcp' }, c7, 'remote'), false);
});

test('at global scope the value goes in ~/.cursor/mcp.json from .mcps-secrets and none in the list', () => {
    const w = cursorWorld();
    const groot = path.join(w.home, '.preferred-tools');
    const glist = path.join(groot, 'mcps.json');
    const secret = `ghp_${'q'.repeat(36)}`;
    fs.mkdirSync(groot, { recursive: true });
    fs.writeFileSync(path.join(groot, '.mcps-secrets'), `WORK_GH=${secret}\n`);
    const kept = require('../scripts/kept.js');
    const GH = { command: 'docker', args: ['run', '-i', '--rm', '-e', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'ghcr.io/github/github-mcp-server:v1.0.0'], env: { GITHUB_PERSONAL_ACCESS_TOKEN: kept.MARKER } };
    fs.writeFileSync(glist, JSON.stringify({ version: 1, own: [], servers: [{ name: 'github', scope: 'user', row: 'github', route: 'local', clients: ['claude', 'cursor'], entry: GH, key: 'WORK_GH' }] }));
    const cfile = path.join(w.home, '.cursor', 'mcp.json');
    const r = cursorMcp.cursorWrite({ file: cfile, family: 'global', lists: [{ file: glist, scopes: ['user'] }], before: [], skip: [], replace: [] }, { catalog: catalogAll });
    assert.strictEqual(r.ok, true, r.detail);
    assert.strictEqual(cursorDoc(cfile).github.env.GITHUB_PERSONAL_ACCESS_TOKEN, secret);
    assert.ok(!fs.readFileSync(glist, 'utf8').includes(secret), 'the list holds no key');
    assert.ok(!r.detail.includes(secret), 'the detail names no key');
    // an unfilled name is written empty, with fillStep's note
    fs.writeFileSync(path.join(groot, '.mcps-secrets'), 'WORK_GH=\n');
    const again = cursorMcp.cursorWrite({ file: cfile, family: 'global', lists: [{ file: glist, scopes: ['user'] }], before: ['github'], skip: [], replace: [] }, { catalog: catalogAll });
    assert.strictEqual(again.ok, true, again.detail);
    assert.strictEqual(cursorDoc(cfile).github.env.GITHUB_PERSONAL_ACCESS_TOKEN, '');
    assert.match(again.detail, /WORK_GH for 'github' \(user\) is in none of .*\.mcps-secrets - written empty: fill WORK_GH in .*, then run \/preferred-tools:configure/);
});

// ---- 0.5.0: what changed outside preferred-tools (spec D1) -----------------------------------------------------------
test('install names a listed server missing from Claude Code and re-adds nothing', () =>
{
    const { world } = require('./helpers.js');
    const planLists = require('../scripts/plan-lists.js');
    const inventoryLib = require('../scripts/inventory.js');
    const { apply } = require('../scripts/apply.js');
    const cli = require('../scripts/claude-cli.js');
    const w = world();
    try
    {
        const first = planLib.plan(inventoryLib.buildInventory({ project: w.project, env: w.env }), { clients: ['claude'], picks: { memory: {}, serena: { scope: 'local' } } }, { home: w.home, env: w.env });
        assert.strictEqual(apply(first, { env: w.env, tmp: path.join(w.dir, 'tmp'), log: () => {} }).failed, null);
        cli.run(['mcp', 'remove', 'memory', '-s', 'local'], { cwd: w.project, env: w.env });
        const s = inventoryLib.buildInventory({ project: w.project, env: w.env }).registrations.find((r) => r.name === 'serena');
        cli.run(['mcp', 'remove', 'serena', '-s', 'local'], { cwd: w.project, env: w.env });
        cli.run(['mcp', 'add-json', 'serena', JSON.stringify({ ...s.entry, args: [...s.entry.args, '--mine'] }), '-s', 'local'], { cwd: w.project, env: w.env });
        const inv = inventoryLib.buildInventory({ project: w.project, env: w.env });
        assert.deepStrictEqual(planLists.changedOutside(inv), ['serena was changed outside preferred-tools', 'memory is on the list but not in Claude Code - run /preferred-tools:fix']);
        const p = planLib.plan(inv, { clients: ['claude'], picks: { context7: { route: 'remote', scope: 'local' } } }, { home: w.home, env: w.env });
        assert.deepStrictEqual(p.errors, []);
        assert.deepStrictEqual(p.outside, planLists.changedOutside(inv));
        assert.ok(!p.steps.some((x) => x.name === 'memory' || x.name === 'serena'), 'neither is written');
        assert.ok(planLib.render(p).startsWith('serena was changed outside preferred-tools\nmemory is on the list but not in Claude Code - run /preferred-tools:fix\n'), planLib.render(p));
    }
    finally { w.clean(); }
});
