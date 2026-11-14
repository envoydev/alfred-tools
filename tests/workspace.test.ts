// workspace.js - alfred-code's workspace record, read-only (spec D4a). The line-file fixtures follow the grammar in
// alfred-code's stack/hooks/workspace-file.js (parseLegacy's header): `parent ..`, `parent none`, `role root`,
// `child <path>`.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as ws from '../scripts/roots/workspace.ts';

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pt-ws-')));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
let n = 0;
const world = () => { const d = path.join(tmp, `w${++n}`); fs.mkdirSync(d); return d; };
const put = (file: string, text: string) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const rec = (folder: string, doc: unknown) => put(path.join(folder, '.alfred', 'workspace.json'), typeof doc === 'string' ? doc : JSON.stringify(doc));
const line = (folder: string, text: string) => put(path.join(folder, '.alfred', 'workspace'), text);
const dir = (p: string) => { fs.mkdirSync(p, { recursive: true }); return p; };

test('workspace: a root with two joined children and an ignored one', () => {
    const root = world();
    rec(root, { role: 'root', children: ['a', 'b', 'c'], ignoredChildren: ['c'] });
    for (const c of ['a', 'b', 'c']) rec(dir(path.join(root, c)), { parent: '..' });
    const got = ws.workspaceOf(path.join(root, 'a'), {});
    assert.deepStrictEqual(got, { root, members: [path.join(root, 'a'), path.join(root, 'b')], ancestors: [root], notes: [] });
    assert.deepStrictEqual(ws.workspaceOf(root, {}).ancestors, []);
    // the ignored child is no member, so from it there is no workspace
    assert.deepStrictEqual(ws.workspaceOf(path.join(root, 'c'), {}).root, null);
});

test('workspace: a record that is not JSON, and a standalone child, read as no workspace', () => {
    const root = world();
    rec(root, '{ not json');
    assert.deepStrictEqual(ws.workspaceOf(root, {}), { root: null, members: [], ancestors: [], notes: [`${path.join(root, '.alfred', 'workspace.json')} is not JSON - read as no workspace`] });
    const solo = world();
    rec(solo, { role: 'standalone' });
    assert.deepStrictEqual(ws.workspaceOf(solo, {}).notes, [`${solo} is standalone`]);
    // no record anywhere: no note
    assert.deepStrictEqual(ws.workspaceOf(world(), {}), { root: null, members: [], ancestors: [], notes: [] });
    // JSON that is not an object
    const arr = world();
    rec(arr, '[]');
    assert.deepStrictEqual(ws.readRecord(arr), { error: 'not JSON', file: path.join(arr, '.alfred', 'workspace.json') });
});

test('workspace: the old line file is read like workspace.json', () => {
    const root = world();
    line(root, '﻿# a comment\r\nrole root\r\nchild a\r\nchild b\r\nabove none\r\nignore skill x\r\n');
    for (const c of ['a', 'b']) line(dir(path.join(root, c)), 'parent ..\n');
    assert.deepStrictEqual(ws.readRecord(root), { role: 'root', children: ['a', 'b'], ignoredChildren: [] });
    assert.deepStrictEqual(ws.workspaceOf(path.join(root, 'b'), {}).members, [path.join(root, 'a'), path.join(root, 'b')]);
    // a child folder name with inner whitespace reads back as itself
    line(dir(path.join(root, 'x')), 'child two  words\nchild two  words\nparent ..\nparent ../..\n');
    assert.deepStrictEqual(ws.readRecord(path.join(root, 'x')), { parent: '..', children: ['two  words'], ignoredChildren: [] });
});

test('workspace: parent none reads as standalone, and both files read as a union, the JSON first', () => {
    const solo = world();
    line(solo, 'parent none\n');
    assert.deepStrictEqual(ws.readRecord(solo), { role: 'standalone', children: [], ignoredChildren: [] });
    const root = world();
    rec(root, { role: 'root', children: ['b'] });
    line(root, 'child a\nchild b\n');
    assert.deepStrictEqual(ws.readRecord(root), { role: 'root', children: ['b', 'a'], ignoredChildren: [] });
    // both parent and role: parent wins
    const both = world();
    rec(both, { parent: '..', role: 'root' });
    assert.deepStrictEqual(ws.readRecord(both), { parent: '..', children: [], ignoredChildren: [] });
    // an empty workspace.json is an empty record; the line file beside it still adds its lines
    const empty = world();
    rec(empty, '');
    line(empty, 'role root\n');
    assert.deepStrictEqual(ws.readRecord(empty), { role: 'root', children: [], ignoredChildren: [] });
});

test('workspace walk refuses a child outside the root and a loop', () => {
    const root = world();
    rec(root, { role: 'root', children: ['a', '../x'] });
    dir(path.join(path.dirname(root), 'x'));
    rec(dir(path.join(root, 'a')), { parent: '..', children: ['..'] });
    const got = ws.workspaceOf(path.join(root, 'a'), {});
    assert.deepStrictEqual(got.members, [path.join(root, 'a')]);
    assert.strictEqual(got.notes.length, 2, got.notes.join('\n'));
    assert.ok(got.notes.some((l) => l.includes(path.join(path.dirname(root), 'x')) && l.includes('outside')), got.notes.join('\n'));
    assert.ok(got.notes.some((l) => l.startsWith(`${root} is listed twice`)), got.notes.join('\n'));
});

test('workspace: a missing child is skipped and named; a child whose record names another parent is no member', () => {
    const root = world();
    rec(root, { role: 'root', children: ['gone', 'a', 'b'] });
    rec(dir(path.join(root, 'a')), { parent: '..' });
    rec(dir(path.join(root, 'b')), { role: 'standalone' });
    const got = ws.workspaceOf(root, {});
    assert.deepStrictEqual(got.members, [path.join(root, 'a')]);
    assert.deepStrictEqual(got.notes, [`${path.join(root, 'gone')} is listed as a child of ${root} but is missing - skipped`]);
});

test('workspace: nested members walk down, and each one\'s folders above are nearest first', () => {
    const root = world();
    rec(root, { role: 'root', children: ['apps'] });
    rec(dir(path.join(root, 'apps')), { parent: '..', children: ['web/admin'] });
    rec(dir(path.join(root, 'apps', 'web', 'admin')), { parent: '../..' });
    const admin = path.join(root, 'apps', 'web', 'admin');
    const got = ws.workspaceOf(admin, {});
    assert.deepStrictEqual(got.members, [path.join(root, 'apps'), admin]);
    assert.deepStrictEqual(got.ancestors, [path.join(root, 'apps'), root]);
    assert.deepStrictEqual(ws.membersBelow(got, root), [{ folder: path.join(root, 'apps'), ancestors: [root] }, { folder: admin, ancestors: [path.join(root, 'apps'), root] }]);
    assert.deepStrictEqual(ws.membersBelow(got, path.join(root, 'apps')), [{ folder: admin, ancestors: [path.join(root, 'apps'), root] }]);
});

test('workspace: an absolute ALFRED_CODE_DATA_PATH reads as no workspace, with its note only where a record is', () => {
    const root = world();
    rec(root, { role: 'root' });
    const note = 'alfred-code\'s data is moved by ALFRED_CODE_DATA_PATH - its workspace record is not read';
    assert.deepStrictEqual(ws.workspaceOf(root, { ALFRED_CODE_DATA_PATH: path.join(tmp, 'elsewhere') }), { root: null, members: [], ancestors: [], notes: [note] });
    assert.deepStrictEqual(ws.workspaceOf(world(), { ALFRED_CODE_DATA_PATH: path.join(tmp, 'elsewhere') }).notes, []);
    // a relative one is alfred-code's .alfred still
    assert.strictEqual(ws.workspaceOf(root, { ALFRED_CODE_DATA_PATH: 'data' }).root, root);
});

test('workspace: nothing under .alfred is written', () => {
    const root = world();
    rec(root, { role: 'root', children: ['a'] });
    rec(dir(path.join(root, 'a')), { parent: '..' });
    const snap = () => [root, path.join(root, 'a')].map((f) => fs.readdirSync(path.join(f, '.alfred')).map((x) => [x, fs.readFileSync(path.join(f, '.alfred', x), 'utf8')]));
    const before = JSON.stringify(snap());
    ws.workspaceOf(path.join(root, 'a'), {});
    assert.strictEqual(JSON.stringify(snap()), before);
});
