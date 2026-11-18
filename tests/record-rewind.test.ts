// rewindPick and skipPick (spec D1b, D1c): going back to a pick drops its steps and what they wrote, skipping a tool
// takes its entries out, and the question that asks which pick to change.
import test from 'node:test';
import assert from 'node:assert';
import { rewindPick, skipPick } from '../scripts/plan/record.ts';
import { rewindQuestion } from '../scripts/plan/asks-other.ts';
import { sendsToOther } from './ask-texts.ts';
import { inv, MAC, record, start, stepOf } from './record-helpers.ts';
import type { State } from './record-helpers.ts';
import type { Answers, Picks, RecordResult } from '../scripts/plan/types.ts';

const I = inv(MAC);

// the walk to its end, the first option of every question
function walked(rows: string[], extra: Picks = {}, from: State = start(I, { rows, ...extra })): State
{
    let at = from;
    for (let count = 0; count < 60; count++)
    {
        if (stepOf(at).step.id === 'done') return at;
        at = record(at);
    }
    throw new Error('the walk did not end in 60 steps');
}
const eachWalk = (rows: string[], extra: Picks = {}) => walked(rows, { walk: 'each', done: ['clients', 'settings'], ...extra });
// the whole walk from the first question, each tool set up in turn
const everything = (rows: string[]): State => walked([], {}, record(record(start(I, { rows })), { settings: rows.length === 1 ? `Set ${rows[0]} up` : 'Set each tool' }));
const files = (result: RecordResult): { picks: Picks; answers: Answers } =>
{
    assert.ok(!('refused' in result), 'refused' in result ? result.refused : '');
    return result;
};
const stepsOf = (picks: Picks, tool: string) => Object.entries(picks.recorded ?? {}).filter(([, step]) => step.tool === tool).map(([id]) => id);

test('rewinding a tool drops its steps and what they wrote, and keeps another tool\'s', () => {
    const state = eachWalk(['gitlab', 'sentry']);
    const before = stepsOf(state.picks, 'gitlab');
    assert.ok(before.length > 0 && state.picks.routes?.['sentry'] !== undefined && state.picks.scopes?.['gitlab'] !== undefined);
    const after = files(rewindPick(state.picks, state.answers, 'gitlab'));
    for (const id of before)
    {
        assert.ok(!after.picks.done!.includes(id), id);
        assert.strictEqual(after.picks.recorded![id], undefined, id);
    }
    assert.strictEqual(after.picks.scopes?.['gitlab'], undefined);
    assert.strictEqual(after.picks.names?.['gitlab'], undefined);
    assert.strictEqual(after.picks.tokens?.['gitlab'], undefined);
    assert.deepStrictEqual(after.answers.picks!['gitlab'], {});
    assert.deepStrictEqual(after.picks.scopes, { sentry: state.picks.scopes!['sentry'] });
    assert.deepStrictEqual(after.answers.picks!['sentry'], state.answers.picks!['sentry']);
    assert.deepStrictEqual(stepsOf(after.picks, 'sentry'), stepsOf(state.picks, 'sentry'));
    assert.ok(stepsOf(state.picks, 'sentry').every((id) => after.picks.done!.includes(id)));
    assert.deepStrictEqual(Object.keys(after.picks.routes ?? {}), ['sentry']);
});

test('rewinding does not change its inputs', () => {
    const state = eachWalk(['gitlab']);
    const before = structuredClone({ picks: state.picks, answers: state.answers });
    files(rewindPick(state.picks, state.answers, 'gitlab'));
    assert.deepStrictEqual({ picks: state.picks, answers: state.answers }, before);
});

test('rewinding settings drops every step', () => {
    const state = everything(['gitlab', 'sentry']);
    assert.ok(state.picks.done!.includes('gitlab:questions'));
    const after = files(rewindPick(state.picks, state.answers, 'settings'));
    assert.deepStrictEqual(after.picks.done, []);
    assert.deepStrictEqual(after.picks.recorded, {});
    assert.strictEqual(after.picks.walk, undefined);
    assert.strictEqual(after.picks.clients, undefined);
    assert.strictEqual(after.answers.clients, undefined);
});

test('rewinding clients drops only that step', () => {
    const state = everything(['gitlab']);
    const after = files(rewindPick(state.picks, state.answers, 'clients'));
    assert.deepStrictEqual(Object.keys(after.picks.recorded!), Object.keys(state.picks.recorded!).filter((id) => id !== 'clients'));
    assert.strictEqual(after.picks.walk, 'each');
    assert.strictEqual(after.picks.recorded!['clients'], undefined);
    assert.ok(!after.picks.done!.includes('clients'));
    assert.strictEqual(after.picks.clients, undefined);
    assert.strictEqual(after.answers.clients, undefined);
    assert.strictEqual(after.picks.recorded!['gitlab:questions']!.tool, 'gitlab');
    assert.ok(after.picks.done!.includes('gitlab:questions'));
});

test('rewinding a pick with no recorded step is refused', () => {
    const state = eachWalk(['gitlab']);
    assert.deepStrictEqual(rewindPick(state.picks, state.answers, 'memory'), { refused: "'memory' has no recorded answer to change" });
    assert.ok('refused' in rewindPick({}, {}, 'settings'));
});

test('a skipped tool is not seeded again after a rewind and a record', () => {
    const state = start(I, { rows: ['gitlab', 'sentry'], walk: 'each', done: ['clients', 'settings'] });
    const skipped = files(skipPick(state.picks, state.answers, 'gitlab'));
    const walkedOn = walked([], {}, start(I, skipped.picks, skipped.answers));
    const rewound = files(rewindPick(walkedOn.picks, walkedOn.answers, 'sentry'));
    const again = walked([], {}, start(I, rewound.picks, rewound.answers));
    assert.strictEqual(again.answers.picks?.['gitlab'], undefined);
    assert.notStrictEqual(again.answers.picks?.['sentry'], undefined);
});

test('rewinding a skipped tool un-skips it, and its record writes it again', () => {
    const state = start(I, { rows: ['gitlab'], walk: 'each', done: ['clients', 'settings'] });
    const skipped = files(skipPick(state.picks, state.answers, 'gitlab'));
    const once = walked([], {}, start(I, skipped.picks, skipped.answers));
    assert.strictEqual(once.answers.picks?.['gitlab'], undefined);
    const rewound = files(rewindPick(once.picks, once.answers, 'gitlab'));
    assert.deepStrictEqual(rewound.picks.skipped, []);
    const again = walked([], {}, start(I, rewound.picks, rewound.answers));
    assert.strictEqual(again.answers.picks!['gitlab']!.scope, 'project');
});

test('a record for a skipped key writes no answers entry', () => {
    const state = eachWalk(['gitlab']);
    const skipped = files(skipPick(state.picks, state.answers, 'gitlab'));
    assert.deepStrictEqual(skipped.picks.skipped, ['gitlab']);
    assert.strictEqual(skipped.answers.picks?.['gitlab'], undefined);
    const again = files(skipPick(skipped.picks, skipped.answers, 'gitlab'));
    assert.deepStrictEqual(again.picks.skipped, ['gitlab']);
    assert.notStrictEqual(state.answers.keyNames?.['gitlab'], undefined);
    const redone = walked([], {}, start(I, { rows: ['gitlab'], skipped: ['gitlab'], walk: 'each', done: ['clients', 'settings'] }));
    assert.strictEqual(redone.answers.picks?.['gitlab'], undefined);
    assert.strictEqual(redone.answers.keyNames?.['gitlab'], undefined);
    assert.strictEqual(redone.answers.settings?.['gitlab'], undefined);
    assert.strictEqual(redone.answers.urlNames?.['gitlab'], undefined);
});

test('skipping removes its install and configure entries, and a pick that is not asked is refused', () => {
    const answers: Answers = { picks: { gitlab: { scope: 'user' }, sentry: {} }, change: { 'mcp:a~local': { row: 'a', route: 'remote' } } };
    const installSkip = files(skipPick({ rows: ['gitlab', 'sentry'] }, answers, 'gitlab'));
    assert.deepStrictEqual(installSkip.answers.picks, { sentry: {} });
    const configureSkip = files(skipPick({ targets: ['mcp:a~local'] }, answers, 'mcp:a~local'));
    assert.deepStrictEqual(configureSkip.answers.change, {});
    assert.deepStrictEqual(skipPick({ rows: ['gitlab'] }, answers, 'memory'), { refused: "'memory' is not a pick of this run" });
});

test('rewinding a configure root change takes it out of the array without a hole', () => {
    const picks: Picks = { done: ['root-project', 'root-global'], recorded: {
        'root-project': { tool: 'mcp:a~local', picks: [['roots', 'project']], answers: [['roots', 'project'], ['rootChange', 'project']] },
        'root-global': { tool: null, picks: [['roots', 'global']], answers: [['roots', 'global'], ['rootChange', 'global']] },
    } };
    const answers: Answers = { roots: { project: { id: 'x' }, global: { id: 'y' } }, rootChange: ['project', 'global'] };
    const after = files(rewindPick(picks, answers, 'mcp:a~local'));
    assert.deepStrictEqual(after.answers.rootChange, ['global']);
    assert.deepStrictEqual(after.answers.roots, { global: { id: 'y' } });
});

test('rewinding tolerates a path whose parent is already gone', () => {
    const picks: Picks = { done: ['a:questions'], recorded: { 'a:questions': { tool: 'a', picks: [['routes', 'a']], answers: [['change', 'k', 'route'], ['rootChange', 'project']] } } };
    const after = files(rewindPick(picks, {}, 'a'));
    assert.deepStrictEqual(after, { picks: { done: [], recorded: {} }, answers: {} });
});

const ids = (picks: string[]): Picks => ({ recorded: Object.fromEntries(picks.map((tool) => [`${tool}:questions`, { tool, picks: [], answers: [] }])) });
const labelOf = (pick: string) => pick.toUpperCase();

test('rewindQuestion offers the last recorded pick first and at most four', () => {
    const asked = rewindQuestion(ids(['a', 'b', 'c']), labelOf)!;
    assert.deepStrictEqual(asked.question.options.map((option) => option.label), ['C (Recommended)', 'B', 'A']);
    assert.deepStrictEqual([asked.question.id, asked.question.header, asked.question.multiSelect, asked.question.question], ['rewind', 'Change', false, 'Which answers do you want to change?']);
    assert.deepStrictEqual(asked.answers, { 'C (Recommended)': 'c', B: 'b', A: 'a' });
    assert.strictEqual(rewindQuestion(ids(['a', 'b', 'c', 'd']), labelOf)!.question.options.length, 4);
});

test('rewindQuestion with five picks offers three and Another one, and no text sendsToOther', () => {
    const asked = rewindQuestion(ids(['a', 'b', 'c', 'd', 'e']), labelOf)!;
    assert.deepStrictEqual(asked.question.options.map((option) => option.label), ['E (Recommended)', 'D', 'C', 'Another one']);
    assert.strictEqual(asked.question.options[3]!.description, 'named next');
    assert.strictEqual(asked.answers['Another one'], 'another');
    const texts = [asked.question.question, asked.question.header, ...asked.question.options.flatMap((option) => [option.label, option.description])];
    assert.ok(texts.every((text) => !sendsToOther(text)));
});

test('rewindQuestion with one pick offers Change nothing, and with none returns null', () => {
    const asked = rewindQuestion(ids(['a']), labelOf)!;
    assert.deepStrictEqual(asked.question.options.map((option) => option.label), ['A (Recommended)', 'Change nothing']);
    assert.strictEqual(asked.question.options[1]!.description, 'go back to the plan');
    assert.strictEqual(asked.answers['Change nothing'], '');
    assert.strictEqual(rewindQuestion({}, labelOf), null);
});

test('rewindQuestion lists a pick once even when it has several steps', () => {
    const picks: Picks = { recorded: { 'a:route': { tool: 'a', picks: [], answers: [] }, 'b:questions': { tool: 'b', picks: [], answers: [] }, 'a:questions': { tool: 'a', picks: [], answers: [] }, clients: { tool: null, picks: [], answers: [] }, settings: { tool: null, picks: [], answers: [] } } };
    assert.deepStrictEqual(rewindQuestion(picks, labelOf)!.question.options.map((option) => option.label), ['SETTINGS (Recommended)', 'CLIENTS', 'A', 'B']);
});
