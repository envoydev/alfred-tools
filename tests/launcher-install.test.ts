// Install writes the stdio key launcher: github, sentry and context7 local start through mcp-bridge.js --run at Local and
// Global scope, so no key value is in a registration, the list or Cursor's file. A plain entry that holds its key stays plain.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { load } from '../scripts/catalog/catalog.ts';
import * as inventory from '../scripts/inventory/inventory.ts';
import * as account from '../scripts/core/account.ts';
import * as roots from '../scripts/roots/roots.ts';
import { plan } from '../scripts/plan/plan.ts';
import { renderPlan } from '../scripts/plan/render.ts';
import { apply } from '../scripts/apply/run.ts';
import { launcherParts } from '../scripts/entries/launcher.ts';
import { world, readJson, files } from './helpers.ts';
import { MAC, inv, opts, pickOne, addStep } from './plan-helpers.ts';
import { detect, ctxOf, put } from './fix-helpers.ts';
import { installPlain } from './update-helpers.ts';
import type { Answers, Plan } from '../scripts/plan/types.ts';
import type { World } from './types.ts';

const catalog = load();
const NEW_CURSOR_NOTE = 'Cursor: not written - Cursor has no private per-project file, and .cursor/mcp.json may be committed; install at user scope for Cursor';
const ROWS = ['github', 'sentry', 'context7'];
const keyValue = (): string => ['k', crypto.randomBytes(12).toString('hex')].join('-');
const nameOf = (rowId: string): string => catalog.byId.get(rowId)!.name;
const tokenVarOf = (rowId: string): string => catalog.byId.get(rowId)!.routes['local']!.tokenVar!;
const globalRoot = (w: World): string => path.join(w.home, '.alfred-tools');
const projectRoot = (w: World): string => path.join(w.project, '.alfred-tools');
const fillKeys = (w: World, value: string): void => put(path.join(globalRoot(w), '.mcps-secrets'), ROWS.map((rowId) => `${tokenVarOf(rowId)}=${value}\n`).join(''));

// the plan as the commands build it, applied, with Claude Code and Cursor picked
function installBoth(w: World, answers: Answers): Plan
{
    const p = plan(inventory.buildInventory({ project: w.project, env: w.env }), { clients: ['claude', 'cursor'], ...answers }, { home: w.home, env: w.env });
    assert.deepStrictEqual(p.errors, []);
    assert.strictEqual(apply(p, { env: w.env, tmp: path.join(w.dir, 'tmp'), log: () => {} }).failed, null);
    return p;
}

test('install writes the launcher for github, sentry and context7 local at Local and Global, and no key anywhere', () =>
{
    for (const rowId of ROWS) for (const scope of ['local', 'user'] as const)
    {
        const w = world();
        try
        {
            const value = keyValue();
            fillKeys(w, value);
            const p = installBoth(w, { picks: { [rowId]: { route: 'local', scope, token: true } } });
            const read = account.readAccount(w.env, w.project);
            const registration = (scope === 'local' ? read.local : read.user)[nameOf(rowId)];
            const parts = launcherParts(registration);
            assert.ok(parts, `${rowId} ${scope}: the registration is a launcher`);
            assert.strictEqual(parts.keyName, tokenVarOf(rowId), `${rowId} ${scope}`);
            for (const file of files(w.dir).filter((candidate) => path.basename(candidate) !== '.mcps-secrets'))
                assert.ok(!fs.readFileSync(file, 'utf8').includes(value), `${rowId} ${scope}: a key value in ${path.relative(w.dir, file)}`);
            assert.ok(!JSON.stringify(p).includes(value), `${rowId} ${scope}: no key value in the plan`);
            // the list holds the launcher as its entry
            const listFile = path.join(scope === 'local' ? projectRoot(w) : globalRoot(w), 'mcps.json');
            const listed = readJson(listFile).servers.find((server: { name: string }) => server.name === nameOf(rowId));
            assert.deepStrictEqual(listed.entry, registration, `${rowId} ${scope}: the list's entry is the launcher`);
        }
        finally { w.clean(); }
    }
});

test('write-helper and write-bridge come before the add', () =>
{
    const p = plan(inv(MAC), pickOne('github', { route: 'local', scope: 'local' }), opts('/h'));
    assert.deepStrictEqual(p.errors, []);
    const ops = p.steps.map((step) => step.op);
    assert.ok(ops.indexOf('write-helper') >= 0 && ops.indexOf('write-helper') < ops.indexOf('write-bridge') && ops.indexOf('write-bridge') < ops.indexOf('mcp-add'), ops.join(', '));
});

test('token-sync finds nothing over a launcher', () =>
{
    const w = world();
    try
    {
        const value = keyValue();
        fillKeys(w, value);
        installBoth(w, { picks: { sentry: { route: 'local', scope: 'user', token: true } } });
        assert.deepStrictEqual(detect(ctxOf(w), 'token-sync').found, []);
    }
    finally { w.clean(); }
});

test("a server kept in its plain form keeps its key in Cursor's copy", () =>
{
    const w = world();
    try
    {
        const value = keyValue();
        fillKeys(w, value);
        installPlain(w, 'sentry', 'user', { command: 'npx', args: ['-y', '@sentry/mcp-server@0.49.0'], env: { npm_config_before: '2026-11-19T23:59:59Z', SENTRY_AUTH_TOKEN: value } });
        const cursorFile = path.join(w.home, '.cursor', 'mcp.json');
        assert.strictEqual(readJson(cursorFile).mcpServers.sentry.env.SENTRY_AUTH_TOKEN, value, 'the plain copy holds the key');
        // a rename keeps the plain form: the Cursor copy is written again with the key, the residual of 'no key in a file'
        const p = plan(inventory.buildInventory({ project: w.project, env: w.env }), { change: { 'mcp:sentry~user': { name: 'sentry-2', clients: ['claude', 'cursor'] } } }, { home: w.home, env: w.env });
        assert.deepStrictEqual(p.errors, []);
        assert.strictEqual(launcherParts(p.steps.find((step) => step.op === 'mcp-move' || step.op === 'mcp-replace')!.entry), null, 'a plain entry that holds its key stays plain');
        assert.strictEqual(apply(p, { env: w.env, tmp: path.join(w.dir, 'tmp'), log: () => {} }).failed, null);
        assert.strictEqual(readJson(cursorFile).mcpServers['sentry-2'].env.SENTRY_AUTH_TOKEN, value);
        assert.strictEqual(account.readAccount(w.env, w.project).user['sentry-2']!.env!['SENTRY_AUTH_TOKEN'], value);
    }
    finally { w.clean(); }
});

test('context7 at Project scope is the plain keyless entry with no write-bridge', () =>
{
    const p = plan(inv(MAC), pickOne('context7', { route: 'local', scope: 'project' }), opts('/h'));
    assert.deepStrictEqual(p.errors, []);
    const entry = addStep(p).entry;
    assert.strictEqual(entry.command, 'npx');
    assert.strictEqual(launcherParts(entry), null);
    assert.ok(!p.steps.some((step) => step.op === 'write-bridge'), p.steps.map((step) => step.op).join(', '));
});

test("an edited bridge in the root blocks the launcher add and writes no key", () =>
{
    const w = world();
    try
    {
        fillKeys(w, keyValue());
        put(path.join(projectRoot(w), 'mcp-bridge.js'), `${roots.shippedSource('bridge')}// mine\n`);
        const p = plan(inventory.buildInventory({ project: w.project, env: w.env }), pickOne('github', { route: 'local', scope: 'local' }), { home: w.home, env: w.env });
        assert.ok(p.errors[0]?.includes('mcp-bridge.js in'), p.errors.join('\n'));
        assert.ok(p.errors[0]?.includes('(helper-stale)'), p.errors.join('\n'));
        assert.ok(!p.steps.some((step) => step.op === 'mcp-add'), 'no registration is planned, and no plain entry with the key instead');
    }
    finally { w.clean(); }
});

test('a launcher at Local with Cursor picked writes no .cursor/mcp.json entry and gives the new note', () =>
{
    const w = world();
    try
    {
        fillKeys(w, keyValue());
        const p = installBoth(w, { picks: { github: { route: 'local', scope: 'local', token: true } } });
        assert.ok(p.notes.includes(NEW_CURSOR_NOTE), p.notes.join('\n'));
        const cursorFile = path.join(w.project, '.cursor', 'mcp.json');
        assert.ok(!fs.existsSync(cursorFile) || !readJson(cursorFile).mcpServers?.github, 'no github entry in the project file');
        assert.deepStrictEqual(readJson(path.join(projectRoot(w), 'mcps.json')).servers.find((server: { name: string }) => server.name === 'github').clients, ['claude']);
    }
    finally { w.clean(); }
});

test("a launcher at Global writes Cursor's launcher copy to ~/.cursor/mcp.json", () =>
{
    const w = world();
    try
    {
        const value = keyValue();
        fillKeys(w, value);
        installBoth(w, { picks: { github: { route: 'local', scope: 'user', token: true } } });
        const registration = account.readAccount(w.env, w.project).user['github'];
        const listed = readJson(path.join(globalRoot(w), 'mcps.json')).servers.find((server: { name: string }) => server.name === 'github');
        const copy = readJson(path.join(w.home, '.cursor', 'mcp.json')).mcpServers.github;
        assert.notStrictEqual(launcherParts(copy), null, 'Cursor starts the launcher too');
        assert.deepStrictEqual(copy, listed.entry);
        assert.deepStrictEqual(copy, registration);
        assert.ok(!JSON.stringify(copy).includes(value));
    }
    finally { w.clean(); }
});

test('context7 with its key filled nowhere is the optional launcher, and its key line says so', () =>
{
    const p = plan(inv(MAC), pickOne('context7', { route: 'local', scope: 'local', token: true }), opts('/h'));
    assert.deepStrictEqual(p.errors, []);
    const parts = launcherParts(addStep(p).entry);
    assert.strictEqual(parts?.optional, true);
    assert.strictEqual(p.keys[0]?.optional, true);
    assert.match(renderPlan(p), /Not filled yet: add CONTEXT7_API_KEY=<your key> to \S+ - until then the server starts without its key\./);
});
