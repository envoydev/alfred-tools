// context7's key in its environment (spec D1): what the plan builds and configure changes, and (Task 3) the
// context7-key-env row in fix and update.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as catalogLib from '../scripts/catalog/catalog.ts';
import { plan } from '../scripts/plan/plan.ts';
import { renderPlan } from '../scripts/plan/render.ts';
import { currentOf } from '../scripts/entries/entry.ts';
import * as cursorMcp from '../scripts/cursor/cursor-mcp.ts';
import { MAC, POSIX_FIXTURE, inv, opts, pickOne, addStep, reg, changeOf } from './plan-helpers.ts';
import type { McpReplaceStep } from '../scripts/plan/types.ts';

const catalog = catalogLib.load();

test('stdioKeyed reads a context7 key in env.CONTEXT7_API_KEY: Cursor is refused at Local (spec D1)', () => {
    assert.strictEqual(cursorMcp.stdioKeyed({ command: 'npx', args: ['-y', '@upstash/context7-mcp'], env: { CONTEXT7_API_KEY: 'x' } }, catalog.byId.get('context7'), 'local'), true);
});

test("context7's local route with a key at Local and Global puts it in env.CONTEXT7_API_KEY, never --api-key (spec D1)", { skip: POSIX_FIXTURE }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c7-env-'));
    try
    {
        const home = path.join(dir, 'home');
        const project = path.join(dir, 'shop');
        for (const root of [path.join(project, '.alfred-tools'), path.join(home, '.alfred-tools')])
        {
            fs.mkdirSync(root, { recursive: true });
            fs.writeFileSync(path.join(root, '.mcps-secrets'), 'CONTEXT7_API_KEY=test-key-not-real\n');
        }
        for (const scope of ['local', 'user'])
        {
            const p = plan(inv({ ...MAC, project }), pickOne('context7', { route: 'local', scope, token: true }), opts(home, { exists: (f) => fs.existsSync(f) }));
            assert.deepStrictEqual(p.errors, [], scope);
            const add = addStep(p);
            assert.ok(!add.entry.args!.includes('--api-key'), scope);
            assert.strictEqual(add.entry.env!['CONTEXT7_API_KEY'], '${CONTEXT7_API_KEY}', scope);
            assert.strictEqual(add.key!.name, 'CONTEXT7_API_KEY', scope);
            assert.ok(!JSON.stringify(p).includes('test-key-not-real'), scope);
        }
        const keyless = addStep(plan(inv({ ...MAC, project }), pickOne('context7', { route: 'local', scope: 'local', token: false }), opts(home))).entry;
        assert.ok(!('CONTEXT7_API_KEY' in (keyless.env || {})), 'no key: no CONTEXT7_API_KEY at all');
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('configure switching context7 local key off removes it from env, and a former --api-key with it (spec D1)', () => {
    const c7 = catalog.byId.get('context7')!;
    const inEnv = reg('c7', 'local', { command: 'npx', args: ['-y', '@upstash/context7-mcp@4.7.0'], env: { npm_config_before: '2026-11-19T23:59:59Z', CONTEXT7_API_KEY: 'test-key-not-real' } }, 'context7', 'local');
    const inArgs = reg('c7', 'local', { command: 'npx', args: ['-y', '@upstash/context7-mcp@4.5.0', '--api-key', 'test-key-not-real'], env: { npm_config_before: '2026-11-03T23:59:59Z' } }, 'context7', 'local');
    for (const r of [inEnv, inArgs])
    {
        assert.strictEqual(currentOf(c7, r).token, true, 'a key in either place reads as kept');
        const p = plan(inv(MAC, { registrations: [r] }), changeOf(r, { token: false }), opts('/Users/me'));
        assert.deepStrictEqual(p.errors, []);
        const replace = p.steps.find((s) => s.op === 'mcp-replace') as McpReplaceStep;
        assert.ok(!replace.entry.args!.includes('--api-key'), JSON.stringify(replace.entry));
        assert.ok(!('CONTEXT7_API_KEY' in (replace.entry.env || {})), JSON.stringify(replace.entry));
        assert.ok(!renderPlan(p).includes('test-key-not-real'));
        // kept as it is: nothing to do
        assert.ok(!plan(inv(MAC, { registrations: [r] }), changeOf(r, {}), opts('/Users/me')).steps.some((s) => s.op === 'mcp-replace'));
    }
});

test("a key route's env key is not read as a kept optional key: sentry local -> remote with no key answer stays OAuth (spec D1, currentOf)", () => {
    const sentry = catalog.byId.get('sentry')!;
    const r = reg('sentry', 'local', { command: 'npx', args: ['-y', '@sentry/mcp-server@0.49.0'], env: { npm_config_before: '2026-11-19T23:59:59Z', SENTRY_AUTH_TOKEN: 'test-key-not-real' } }, 'sentry', 'local');
    assert.strictEqual(currentOf(sentry, r).token, false, 'token reads an optional key only');
    const p = plan(inv(MAC, { registrations: [r] }), changeOf(r, { route: 'remote' }), opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    const step = p.steps.find((s) => (s.op === 'mcp-replace' || s.op === 'mcp-add') && s.name === 'sentry') as McpReplaceStep;
    assert.ok(step && !('headersHelper' in step.entry), JSON.stringify(step && step.entry));
    assert.ok(!renderPlan(p).includes('test-key-not-real'));
});
