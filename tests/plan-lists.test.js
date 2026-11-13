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
