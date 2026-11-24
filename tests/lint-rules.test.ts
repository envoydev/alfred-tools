// The lint's command rules (tests/lint-rules.ts): each one fires on a bad line and stays quiet on a good one.
import test from 'node:test';
import assert from 'node:assert';
import { CALL, FIRST_CALL, OLD_ENTRY_CALL, OLD_NODE, PLUGIN_ROOT_CALL, WRITES } from './lint-rules.ts';

test('PLUGIN_ROOT_CALL flags a call that skips the plugin root', () =>
{
    assert.ok(PLUGIN_ROOT_CALL.test('node dist/plan.mjs --questions x'));
    assert.ok(PLUGIN_ROOT_CALL.test('node ./dist/plan.mjs'));
    assert.ok(PLUGIN_ROOT_CALL.test('node scripts/plan.ts'));
    assert.strictEqual(PLUGIN_ROOT_CALL.test('node "${CLAUDE_PLUGIN_ROOT}/dist/plan.mjs"'), false);
});

test('WRITES flags a pre-approved call that changes an install', () =>
{
    assert.ok(WRITES.test('Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/apply.mjs")'));
    assert.ok(WRITES.test('Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/fetch.mjs" *)'));
    assert.ok(WRITES.test('Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/sign-in.mjs" *)'));
    assert.ok(WRITES.test('Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/fix.mjs" --apply)'));
    assert.ok(WRITES.test('Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/fix.mjs" *)'));
    assert.ok(WRITES.test('Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/update.mjs")'));
});

test('WRITES passes the read-only flags', () =>
{
    assert.strictEqual(WRITES.test('Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/fix.mjs" --detect)'), false);
    assert.strictEqual(WRITES.test('Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/fix.mjs" --detect *)'), false);
    assert.strictEqual(WRITES.test('Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/update.mjs" --questions *)'), false);
    assert.strictEqual(WRITES.test('Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/plan.mjs" *)'), false);
});

test('CALL finds the entries that read the roots map and the flag after them', () =>
{
    const found = [...'node "${CLAUDE_PLUGIN_ROOT}/dist/plan.mjs" --questions x'.matchAll(CALL)];
    assert.strictEqual(found.length, 1);
    assert.strictEqual(found[0]![1], 'plan');
    assert.strictEqual(found[0]![2], '--questions x');
    assert.strictEqual([...'`fix.mjs` --detect'.matchAll(CALL)].length, 0);
    assert.strictEqual([...'node "${CLAUDE_PLUGIN_ROOT}/dist/table.mjs" x.json'.matchAll(CALL)].length, 0);
});

test('OLD_ENTRY_CALL flags a call left on a source entry', () =>
{
    assert.ok(OLD_ENTRY_CALL.test('node "${CLAUDE_PLUGIN_ROOT}/scripts/plan.ts"'));
    assert.ok(OLD_ENTRY_CALL.test('run node scripts/sign-in.ts now'));
    assert.strictEqual(OLD_ENTRY_CALL.test('node "${CLAUDE_PLUGIN_ROOT}/dist/plan.mjs"'), false);
    assert.strictEqual(OLD_ENTRY_CALL.test('`apply.ts` calls it'), false);
});

test('FIRST_CALL is the start of a bundle call', () =>
{
    assert.strictEqual(FIRST_CALL, 'node "${CLAUDE_PLUGIN_ROOT}/dist/');
});

test('OLD_NODE names the Node 26.13 floor', () =>
{
    assert.strictEqual(
        OLD_NODE,
        'If a script fails to start with a `SyntaxError`, a `TypeError` that names a missing function, or an error naming a `node:` module, stop and tell the user: alfred-tools needs Node 26.13 or newer - `node --version` shows yours.',
    );
});
