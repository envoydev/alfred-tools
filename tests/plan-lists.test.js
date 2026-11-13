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
