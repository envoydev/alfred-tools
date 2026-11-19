// mcps-list.ts - the list of servers the plugin manages, one per root folder (spec D1): read, merge, write.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as kept from '../scripts/core/kept.ts';
import * as catalogLib from '../scripts/catalog/catalog.ts';
import type { ListServer } from '../scripts/mcps-list/types.ts';
import { LIST_VERSION, readList, writeList, mergeList, fromRegistration, serverKey, regKey, listFile } from '../scripts/mcps-list/mcps-list.ts';
const { join } = path;

const catalog = catalogLib.load();
const row = (id: string) => catalog.byId.get(id);
const dir = fs.mkdtempSync(join(os.tmpdir(), 'pt-mcps-list-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
const write = (name: string, text: string) => fs.writeFileSync(join(dir, name), text);
const fresh = (name: string) => { const f = join(dir, name); fs.rmSync(f, { force: true }); fs.rmSync(`${f}.bak`, { force: true }); return f; };
const srv = (name: string, scope: string, extra: Partial<ListServer> = {}): ListServer => ({ name, scope, row: name, route: 'local', clients: ['claude'], entry: { type: 'stdio', command: 'uvx', args: [name] }, key: null, ...extra });
const githubDockerEntry = (value: string) => ({ type: 'stdio', command: 'docker', args: ['run', '-i', '--rm', '-e', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'ghcr.io/github/github-mcp-server:v2.1.0', 'stdio'], env: { GITHUB_PERSONAL_ACCESS_TOKEN: value } });

test('readList: missing is null, not JSON is bad, newer is kept', () => {
    assert.equal(readList(join(dir, 'none.json')), null);
    write('bad.json', '{'); assert.equal(readList(join(dir, 'bad.json'))!.state, 'bad');
    write('new.json', '{"version":2,"servers":[],"own":[]}'); assert.equal(readList(join(dir, 'new.json'))!.state, 'newer');
    write('ok.json', JSON.stringify({ version: 1, servers: [srv('serena', 'project')], own: [], cursorOffer: 'declined' }));
    const ok = readList(join(dir, 'ok.json'))!;
    assert.equal(ok.state, undefined);
    assert.equal(ok.servers.length, 1);
    assert.equal(ok.cursorOffer, 'declined');
});

test('readList: a server or own entry not in the shape the plugin writes is not read', () => {
    const good = srv('serena', 'project');
    write('shape.json', JSON.stringify({ version: 1, servers: [good, { ...good, name: 'no-entry', entry: 'npx x' }, { ...good, name: 'no-clients', clients: 'claude' }, { ...good, name: 'bad-key', key: 5 }], own: [{ name: 'mine', scope: 'local', choice: 'own' }, { name: 7, scope: 'local' }] }));
    const read = readList(join(dir, 'shape.json'))!;
    assert.deepStrictEqual(read.servers.map((server) => server.name), ['serena']);
    assert.deepStrictEqual(read.own, [{ name: 'mine', scope: 'local', choice: 'own' }]);
});

test('writeList: unchanged is not rewritten', () => {
    const f = fresh('same.json');
    const doc = { version: LIST_VERSION, servers: [srv('serena', 'project')], own: [] };
    writeList(f, doc, null);
    const m = fs.statSync(f).mtimeMs;
    assert.match(writeList(f, doc, readList(f)).detail, /left as it is/);
    assert.equal(fs.statSync(f).mtimeMs, m);
});

test('writeList: a non-JSON file is kept as .bak first', () => {
    const f = fresh('nonjson.json');
    fs.writeFileSync(f, '{');
    const r = writeList(f, { version: LIST_VERSION, servers: [srv('memory', 'project')], own: [] }, readList(f));
    assert.ok(r.ok);
    assert.equal(fs.readFileSync(`${f}.bak`, 'utf8'), '{');
    assert.equal(readList(f)!.servers[0]!.name, 'memory');
});

test('writeList: a newer list is never replaced', () => {
    const f = fresh('newer.json');
    const text = '{"version":2,"servers":[],"own":[]}';
    fs.writeFileSync(f, text);
    const r = writeList(f, { version: LIST_VERSION, servers: [srv('memory', 'project')], own: [] }, readList(f));
    assert.equal(fs.readFileSync(f, 'utf8'), text);
    assert.match(r.detail, /newer/);
});

test('writeList: empty servers and own delete the file', () => {
    const f = fresh('empty.json');
    writeList(f, { version: LIST_VERSION, servers: [srv('memory', 'project')], own: [] }, null);
    assert.ok(fs.existsSync(f));
    const r = writeList(f, { version: LIST_VERSION, servers: [], own: [] }, readList(f));
    assert.ok(!fs.existsSync(f));
    assert.match(r.detail, /removed/);
});

test('writeList: through a temporary file then a rename', (t) => {
    const f = fresh('tmp.json');
    const calls: [fs.PathLike, fs.PathLike][] = [];
    const real = fs.renameSync;
    t.mock.method(fs, 'renameSync', (a: fs.PathLike, b: fs.PathLike) => { calls.push([a, b]); return real(a, b); });
    writeList(f, { version: LIST_VERSION, servers: [srv('memory', 'project')], own: [] }, null);
    assert.deepStrictEqual(calls, [[`${f}.${process.pid}.tmp`, f]]);
});

test('mergeList: an upsert replaces by name and scope, a drop removes, own replaces own', () => {
    const list = { version: 1, servers: [srv('serena', 'project'), srv('memory', 'project'), srv('memory', 'local')], own: [{ name: 'x', scope: 'user', choice: 'own' }] };
    const doc = mergeList(list, {
        upserts: [srv('serena', 'project', { clients: ['claude', 'cursor'] }), srv('context7', 'user')],
        drops: ['mcp:memory~local'],
        own: [{ name: 'y', scope: 'user', choice: 'own' }],
    });
    assert.deepStrictEqual(doc.servers.map(serverKey), ['mcp:serena~project', 'mcp:memory~project', 'mcp:context7~user']);
    assert.deepStrictEqual(doc.servers[0]!.clients, ['claude', 'cursor']);
    assert.deepStrictEqual(doc.own, [{ name: 'y', scope: 'user', choice: 'own' }]);
    assert.equal(doc.version, LIST_VERSION);
    assert.deepStrictEqual(mergeList(list, {}).own, list.own, 'no own given keeps the list\'s');
    assert.equal(mergeList({ ...list, cursorOffer: 'declined' }, {}).cursorOffer, 'declined');
});

test('serverKey and regKey: mcp:<name>~<scope>, the destination of a move', () => {
    assert.equal(serverKey({ name: 'serena', scope: 'local' }), 'mcp:serena~local');
    assert.equal(regKey({ op: 'mcp-add', name: 'a', scope: 'user' }), 'mcp:a~user');
    assert.equal(regKey({ op: 'mcp-move', name: 'a', scope: 'local', to: { name: 'b', scope: 'project' } }), 'mcp:b~project');
    assert.equal(regKey({ op: 'fetch' }), null);
});

test('listFile: <root>/mcps.json', () => {
    assert.equal(listFile('/work/shop/.alfred-tools'), path.join('/work/shop/.alfred-tools', 'mcps.json'));
});

test('fromRegistration: a stdio key is the kept marker, never the value', () => {
    const s = fromRegistration({ name: 'github', scope: 'user', route: 'local', entry: githubDockerEntry('ghp_' + 'x'.repeat(36)) }, row('github'), ['claude']);
    assert.ok(JSON.stringify(s).includes(kept.MARKER));
    assert.ok(!JSON.stringify(s).includes('ghp_'));
    assert.equal(s.key, 'GITHUB_PERSONAL_ACCESS_TOKEN');
    assert.deepStrictEqual(s.clients, ['claude']);
    assert.equal(s.row, 'github');
});

test('fromRegistration: the name a key file gives the value wins over the route\'s variable', () => {
    const file = join(dir, '.mcps-secrets');
    const value = 'ghp_' + 'y'.repeat(36);
    fs.writeFileSync(file, `WORK_GITHUB_TOKEN=${value}\n`);
    const s = fromRegistration({ name: 'github', scope: 'user', route: 'local', entry: githubDockerEntry(value) }, row('github'), ['claude'], [file]);
    assert.equal(s.key, 'WORK_GITHUB_TOKEN');
});

test('fromRegistration: a route with no key in the entry has key null', () => {
    const s = fromRegistration({ name: 'memory', scope: 'project', route: 'local', entry: { type: 'stdio', command: 'uvx', args: ['mcp-memory-service'] } }, row('memory'), ['claude', 'cursor']);
    assert.equal(s.key, null);
});

test('a list holding the old marker reads as the new one', () => {
    const old = '${PREFERRED_TOOLS_KEPT}';
    write('old-marker.json', JSON.stringify({ version: 1, servers: [srv('github', 'local', { entry: { type: 'stdio', command: 'npx', args: ['-y', 'gh'], env: { GITHUB_TOKEN: old } } })], own: [] }));
    const read = readList(join(dir, 'old-marker.json'))!;
    assert.equal(kept.OLD_MARKER, old);
    assert.equal(read.servers[0]!.entry.env!['GITHUB_TOKEN'], kept.MARKER);
    assert.ok(!JSON.stringify(read).includes(old));
});
