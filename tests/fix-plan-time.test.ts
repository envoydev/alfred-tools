// The plan-time pass of fix: a picked file finding that the second detect finds blocked is named and skipped, never
// dropped in silence; and the drift wait line lists three answers as a reader would say them.
import test from 'node:test';
import assert from 'node:assert';
import { blockedAtPlan } from '../scripts/fix/common.ts';
import { driftAnswersOf } from '../scripts/fix/key-to-launcher.ts';
import type { Finding } from '../scripts/fix/types.ts';

const finding = (over: Partial<Finding>): Finding => ({ id: 'key-to-launcher', row: 'github', name: 'github', scope: 'user', found: 'x', ...over });

test('a picked finding the plan-time detect finds blocked is returned with its block, others are not', () =>
{
    const picked = [finding({ listOnly: true }), finding({ id: 'read-guard', kind: 'file', name: '/s.json', scope: null })];
    const redetected = [
        finding({ listOnly: true, blocked: 'github: ~/.cursor/mcp.json is not JSON - then run fix again' }),
        finding({ id: 'read-guard', kind: 'file', name: '/s.json', scope: null }),
        finding({ name: 'sentry', listOnly: true, blocked: 'not picked' }),
    ];
    assert.deepStrictEqual(blockedAtPlan(redetected, picked).map((found: Finding) => [found.name, found.blocked]), [['github', 'github: ~/.cursor/mcp.json is not JSON - then run fix again']]);
    assert.deepStrictEqual(blockedAtPlan(redetected.slice(1), picked), []);
});

test("three settling answers read 'restore, keep or drop'", () =>
{
    const move = finding({ listOnly: true });
    const drifts = [
        finding({ id: 'client-drift', app: 'claude' }),
        finding({ id: 'client-drift', app: 'cursor', change: 'missing' }),
    ];
    assert.strictEqual(driftAnswersOf(move, drifts), "restore, keep or drop; 'leave' does not settle it");
    assert.strictEqual(driftAnswersOf(move, drifts.slice(1)), "restore or drop; 'leave' does not settle it");
});
