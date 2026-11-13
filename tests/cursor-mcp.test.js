'use strict';
// cursor-mcp.js - Cursor's mcp.json from the list (spec D2): read, refuse, compose, write, read back.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const catalogLib = require('../scripts/catalog.js');
const C = require('../scripts/cursor-mcp.js');

const catalog = catalogLib.load();
const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pt-cursor-')));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
let n = 0;
const fresh = () => { const d = path.join(dir, `c${++n}`); fs.mkdirSync(d, { recursive: true }); return d; };
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const readDoc = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const SERENA = { command: 'uvx', args: ['--from', 'serena-agent@2.1.0', 'serena', 'start-mcp-server'] };
const MEMORY = { command: 'uvx', args: ['mcp-memory-service'] };
const C7 = { type: 'http', url: 'https://mcp.context7.com/mcp' };
const srv = (name, scope, entry, extra = {}) => ({ name, scope, row: name, route: 'local', clients: ['claude', 'cursor'], entry, key: null, ...extra });
const listFile = (d, servers) => { const f = path.join(d, '.preferred-tools', 'mcps.json'); write(f, JSON.stringify({ version: 1, servers, own: [] })); return f; };
const ctx = { catalog };
const step = (file, lists, extra = {}) => ({ op: 'cursor-write', file, family: 'project', lists, before: [], skip: [], replace: [], ...extra });

test('cursor-mcp keeps the user\'s entries and their order', () => {
    const d = fresh();
    const file = path.join(d, '.cursor', 'mcp.json');
    const mine = { command: 'node', args: ['mine.js'], env: { Z: '1', A: '2' } };
    write(file, JSON.stringify({ mcpServers: { mine, serena: { command: 'old' }, other: { url: 'https://x.example/mcp' } } }, null, 2));
    const lists = [{ file: listFile(d, [srv('serena', 'local', SERENA)]), scopes: ['local', 'project'] }];
    const r = C.cursorWrite(step(file, lists, { before: ['serena'] }), ctx);
    assert.strictEqual(r.ok, true, r.detail);
    const doc = readDoc(file);
    assert.deepStrictEqual(Object.keys(doc.mcpServers), ['serena', 'mine', 'other']);
    assert.deepStrictEqual(doc.mcpServers.serena, SERENA);
    assert.strictEqual(JSON.stringify(doc.mcpServers.mine), JSON.stringify(mine), 'the user\'s entry, its key order kept');
});

test('cursor-mcp removes a managed name the list dropped', () => {
    const d = fresh();
    const file = path.join(d, '.cursor', 'mcp.json');
    write(file, JSON.stringify({ mcpServers: { memory: MEMORY, mine: { command: 'node' } } }));
    const r = C.cursorWrite(step(file, [{ file: listFile(d, []), scopes: ['local', 'project'] }], { before: ['memory'] }), ctx);
    assert.strictEqual(r.ok, true, r.detail);
    assert.deepStrictEqual(Object.keys(readDoc(file).mcpServers), ['mine']);
});

test('cursor-mcp writes the local entry over the project one for one name', () => {
    const local = { ...SERENA, args: [...SERENA.args, '--local'] };
    const set = C.managedSet([{ file: 'own', scopes: ['local', 'project'], servers: [srv('serena', 'project', SERENA), srv('serena', 'local', local)] }]);
    assert.deepStrictEqual([...set.keys()], ['serena']);
    assert.deepStrictEqual([set.get('serena').entry, set.get('serena').scope], [local, 'local']);
    // only servers set up for Cursor; an inherited list gives project scope only; a name taken nearer is skipped
    const two = C.managedSet([
        { file: 'own', scopes: ['local', 'project'], servers: [srv('memory', 'local', MEMORY), srv('c7', 'local', C7, { clients: ['claude'] })] },
        { file: 'parent', scopes: ['project'], servers: [srv('memory', 'project', { command: 'parent' }), srv('local-up', 'local', MEMORY), srv('serena', 'project', SERENA, { cursorEntry: { command: 'cursor-copy' } })] },
    ]);
    assert.deepStrictEqual([...two.keys()], ['memory', 'serena']);
    assert.deepStrictEqual(two.get('memory').entry, MEMORY);
    assert.deepStrictEqual(two.get('serena').entry, { command: 'cursor-copy' }, 'cursorEntry wins over entry');
});

test('cursor-mcp puts catalog.order first, then the user\'s', () => {
    const managed = new Map([['serena', { entry: SERENA, row: 'serena' }], ['context7', { entry: C7, row: 'context7' }]]);
    const doc = C.compose({ mcpServers: { zz: { command: 'z' }, aa: { command: 'a' } } }, managed, { before: [], skip: [], order: catalog.order });
    const want = ['serena', 'context7'].sort((a, b) => catalog.order.indexOf(a) - catalog.order.indexOf(b));
    assert.deepStrictEqual(Object.keys(doc.mcpServers), [...want, 'zz', 'aa']);
});

test('cursor-mcp refuses a symlink, non-JSON and a file without mcpServers, writing nothing', { skip: process.platform === 'win32' && 'NOT RUN: a symlink needs Developer Mode on Windows' }, () => {
    const d = fresh();
    const lists = [{ file: listFile(d, [srv('serena', 'local', SERENA)]), scopes: ['local', 'project'] }];
    const target = path.join(d, 'elsewhere.json');
    const cases = [
        ['symlink', (f) => { write(target, '{"mcpServers":{}}'); fs.symlinkSync(target, f); }],
        ['bad', (f) => write(f, '{ nope')],
        ['shape', (f) => write(f, '{"servers":{}}')],
    ];
    for (const [state, setup] of cases)
    {
        const file = path.join(d, state, '.cursor', 'mcp.json');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        setup(file);
        assert.strictEqual(C.readCursor(file).state, state);
        assert.ok(C.refusal(C.readCursor(file)), state);
        const before = fs.readFileSync(file, 'utf8');
        const r = C.cursorWrite(step(file, lists), ctx);
        assert.strictEqual(r.ok, false, state);
        assert.ok(r.detail.includes(file), r.detail);
        assert.strictEqual(fs.readFileSync(file, 'utf8'), before, `${state}: byte-identical`);
        assert.strictEqual(fs.lstatSync(file).isSymbolicLink(), state === 'symlink');
    }
    assert.strictEqual(fs.readFileSync(target, 'utf8'), '{"mcpServers":{}}', 'nothing written through the link');
});

test('cursor-mcp refuses a JSONC file and leaves it byte-identical', () => {
    const d = fresh();
    const file = path.join(d, '.cursor', 'mcp.json');
    const text = '{ // mine\n  "mcpServers": {},\n}\n';
    write(file, text);
    const r = C.cursorWrite(step(file, [{ file: listFile(d, [srv('serena', 'local', SERENA)]), scopes: ['local', 'project'] }]), ctx);
    assert.strictEqual(r.ok, false);
    assert.match(r.detail, /not JSON/);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), text);
});

test('cursor-mcp keeps CRLF and drops the BOM', () => {
    const d = fresh();
    const file = path.join(d, '.cursor', 'mcp.json');
    write(file, '﻿{\r\n  "mcpServers": {\r\n    "mine": { "command": "node" }\r\n  }\r\n}\r\n');
    assert.strictEqual(C.readCursor(file).eol, '\r\n');
    const r = C.cursorWrite(step(file, [{ file: listFile(d, [srv('serena', 'local', SERENA)]), scopes: ['local', 'project'] }]), ctx);
    assert.strictEqual(r.ok, true, r.detail);
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(!text.startsWith('﻿'), 'no BOM');
    assert.ok(text.includes('\r\n') && !/[^\r]\n/.test(text), 'CRLF throughout');
    assert.deepStrictEqual(Object.keys(JSON.parse(text).mcpServers), ['serena', 'mine']);
});

test('cursor-mcp writes through a temporary file then a rename, and makes the folder', (t) => {
    const d = fresh();
    const file = path.join(d, '.cursor', 'mcp.json');
    const calls = [];
    const real = fs.renameSync;
    t.mock.method(fs, 'renameSync', (a, b) => { calls.push([a, b]); return real(a, b); });
    const r = C.cursorWrite(step(file, [{ file: listFile(d, [srv('serena', 'local', SERENA)]), scopes: ['local', 'project'] }]), ctx);
    assert.strictEqual(r.ok, true, r.detail);
    assert.deepStrictEqual(calls, [[`${file}.${process.pid}.tmp`, file]]);
    assert.ok(!fs.existsSync(path.join(d, '.cursor', '.gitignore')), 'a folder it makes gets no .gitignore');
    // the same again: nothing written
    calls.length = 0;
    assert.match(C.cursorWrite(step(file, [{ file: path.join(d, '.preferred-tools', 'mcps.json'), scopes: ['local', 'project'] }]), ctx).detail, /already holds/);
    assert.deepStrictEqual(calls, []);
});

test('cursor-mcp reports a read-back mismatch and stops the apply', (t) => {
    const d = fresh();
    const file = path.join(d, '.cursor', 'mcp.json');
    const lists = [{ file: listFile(d, [srv('serena', 'local', SERENA)]), scopes: ['local', 'project'] }];
    const real = fs.readFileSync;
    let wrote = false;
    t.mock.method(fs, 'renameSync', (a, b) => { wrote = true; return fs.copyFileSync(a, b); });
    t.mock.method(fs, 'readFileSync', (f, ...rest) => (wrote && f === file ? '{"mcpServers":{"serena":{"command":"other"}}}' : real(f, ...rest)));
    const r = C.cursorWrite(step(file, lists), ctx);
    assert.strictEqual(r.ok, false);
    assert.match(r.detail, /serena/);
    assert.match(r.detail, /did not read back as written/);
});

test('fileFor: the project\'s .cursor/mcp.json, or the home\'s', () => {
    assert.strictEqual(C.fileFor('project', { project: '/work/shop', env: { HOME: '/Users/me' }, platform: 'darwin' }), '/work/shop/.cursor/mcp.json');
    assert.strictEqual(C.fileFor('global', { project: '/work/shop', env: { HOME: '/Users/me' }, platform: 'darwin' }), '/Users/me/.cursor/mcp.json');
});

test('matchesRow matches context7\'s bridge copy to the context7 row and an unrelated bridge to none', () => {
    const bridge = (url, key = 'CONTEXT7_API_KEY') => ({ command: 'node', args: ['/r/.preferred-tools/mcp-bridge.js', url, key, 'Bearer', 'mcp-remote@0.1.37'] });
    const rows = catalog.tools.filter((r) => r.kind === 'mcp');
    const hits = (entry) => rows.filter((r) => C.matchesRow(entry, r)).map((r) => r.id);
    assert.deepStrictEqual(hits(bridge('https://mcp.context7.com/mcp')), ['context7']);
    assert.deepStrictEqual(hits(bridge('https://mcp.example.com/mcp', 'MINE')), []);
    assert.deepStrictEqual(hits(C7), ['context7']);
    assert.deepStrictEqual(hits(SERENA), ['serena']);
    assert.deepStrictEqual(hits({ command: 'node', args: ['mine.js'] }), []);
    assert.deepStrictEqual(hits(bridge('https://mcp.sentry.dev/mcp/{SENTRY_ORG}/{SENTRY_PROJECT?}', 'SENTRY_ACCESS_TOKEN')), ['sentry']);
});

test('cursor-mcp loads before and after inventory without a partial export', () => {
    const { spawnSync } = require('node:child_process');
    const root = path.join(__dirname, '..', 'scripts');
    const probe = (first, second) => `const a = require(${JSON.stringify(path.join(root, first))}); const b = require(${JSON.stringify(path.join(root, second))});`
        + ' const c = require(' + JSON.stringify(path.join(root, 'cursor-mcp.js')) + '); const i = require(' + JSON.stringify(path.join(root, 'inventory.js')) + ');'
        + " if (typeof c.matchesRow !== 'function' || typeof c.readCursor !== 'function' || typeof i.buildInventory !== 'function' || typeof i.matchesFingerprint !== 'function') { process.exit(3); }"
        + " if (!c.matchesRow({ type: 'http', url: 'https://mcp.context7.com/mcp' }, require(" + JSON.stringify(path.join(root, 'catalog.js')) + ").load().byId.get('context7'))) process.exit(4);";
    for (const [a, b] of [['cursor-mcp.js', 'inventory.js'], ['inventory.js', 'cursor-mcp.js']])
    {
        const r = spawnSync(process.execPath, ['-e', probe(a, b)], { encoding: 'utf8' });
        assert.strictEqual(r.status, 0, `${a} first: ${r.stderr}`);
    }
});
