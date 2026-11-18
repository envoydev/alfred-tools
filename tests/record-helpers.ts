// Builders for the record tests: an inventory, a registration installed the way the plan writes it, and a walk driven
// through recordStep with the first option of every question unless a test names another.
import assert from 'node:assert';
import { load } from '../scripts/catalog/catalog.ts';
import { allQuestions } from '../scripts/plan/asks-all.ts';
import { nextQuestion } from '../scripts/plan/walk.ts';
import { plan } from '../scripts/plan/plan.ts';
import { recordStep } from '../scripts/plan/record.ts';
import type { Inventory, InvRegistration } from '../scripts/inventory/types.ts';
import type { Answers, McpAddStep, PickAnswer, Picks, Questions, StepAnswer, WalkStep } from '../scripts/plan/types.ts';

export const catalog = load();
export const MAC = { os: 'darwin', arch: 'arm64', project: '/work/shop' };
export const WIN = { os: 'win32', arch: 'x64', project: 'C:\\work\\my shop' };
export const inv = (base: { os: string; arch: string; project: string }, extra: Record<string, unknown> = {}) => ({ version: 1, ...base, cli: { ok: true }, unreadable: [], registrations: [], plugins: [], pluginServers: [], marketplaces: [], alfredCodeEnabled: false, sources: {}, lists: { project: null, global: null }, ...extra }) as unknown as Inventory;
export const homeOf = (base: { os: string }) => (base.os === 'win32' ? 'C:\\Users\\me' : '/Users/me');
export const OPTS = (base: { os: string }) => ({ env: {}, home: homeOf(base) });

// a registration as the plan writes a fresh install of `row`, read back as the inventory lists it
export function installed(row: string, answers: PickAnswer = {}): InvRegistration
{
    const made = plan(inv(MAC), { picks: { [row]: answers } }, { home: '/Users/me', env: {}, exists: () => false, machine: { docker: true } });
    assert.deepStrictEqual(made.errors, []);
    const step = made.steps.find((candidate) => candidate.op === 'mcp-add') as McpAddStep;
    return { name: step.name, scope: step.scope, entry: step.entry, rowId: row, route: answers.route || catalog.byId.get(row)!.recommendedRoute, own: false, alfredRetired: false } as InvRegistration;
}

export interface State
{
    inventory: Inventory;
    picks: Picks;
    answers: Answers;
}
export const start = (inventory: Inventory, picks: Picks, answers: Answers = {}): State => ({ inventory, picks, answers });

export function stepOf(state: State): { step: WalkStep; built: Questions }
{
    const base = state.inventory.os === 'win32' ? WIN : MAC;
    const built = allQuestions(state.inventory, state.picks, catalog, OPTS(base));
    return { step: nextQuestion(state.inventory, state.picks, catalog, OPTS(base), built), built };
}

// the first option of each question of the step, the typed or other answers of `overrides` in its place
export function answersFor(step: WalkStep, overrides: Record<string, StepAnswer> = {}): Record<string, StepAnswer>
{
    return Object.fromEntries((step.call ?? []).map((question) => [question.id, overrides[question.id] ?? question.options[0]!.label]));
}

// -> the result of recordStep, refused or not
export function attempt(state: State, overrides: Record<string, StepAnswer> = {}, edit: (chosen: { id: string; answers: Record<string, StepAnswer> }) => void = () => undefined)
{
    const { step, built } = stepOf(state);
    const chosen = { id: step.id, answers: answersFor(step, overrides) };
    edit(chosen);
    return recordStep({ step, built, picks: state.picks, answers: state.answers, chosen });
}

export function record(state: State, overrides: Record<string, StepAnswer> = {}): State
{
    const result = attempt(state, overrides);
    assert.ok(!('refused' in result), 'refused' in result ? result.refused : '');
    return { inventory: state.inventory, picks: result.picks, answers: result.answers };
}

// the walk, the first option of every question, up to (not including) the step `id`
export function advanceTo(state: State, id: string): State
{
    let at = state;
    for (let count = 0; count < 60; count++)
    {
        const { step } = stepOf(at);
        if (step.id === id) return at;
        assert.notStrictEqual(step.id, 'done', `no step ${id}`);
        at = record(at);
    }
    throw new Error(`no step ${id} in 60 steps`);
}
