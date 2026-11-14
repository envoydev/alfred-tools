// The logic findings of the TypeScript restructure: behaviour the typing exposed that looks unintended. Each is a todo
// test - it shows the behaviour and fails inside - because the restructure changes no behaviour; the owner rules on a
// fix. The findings with no observable behaviour (dead code, checks that can never fail) are listed in the ledger only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { plan } from '../scripts/plan/plan.ts';
import type { Inventory } from '../scripts/inventory/types.ts';

const MAC = { os: 'darwin', arch: 'arm64', project: '/work/shop' };
const inventory = { version: 1, ...MAC, cli: { ok: true }, unreadable: [], registrations: [], plugins: [], marketplaces: [], alfredCodeEnabled: false, sources: {} } as unknown as Inventory;

// scripts/plan/pick.ts wantedRoot reads `existing` off defaultRoot's answer, which never carries it (DefaultRoot is
// root, alfred, needsInput), so a default data folder that is already on disk still gets an ensure-dir step. Harmless
// today - ensure-dir leaves an existing folder as it is - but the read says the step was meant to be skipped.
test('a default data folder already on disk gets no ensure-dir step', { todo: 'logic finding - the owner rules' }, () =>
{
    const made = plan(inventory, { picks: { 'playwright-chrome': {} } }, { home: '/Users/me', env: {}, exists: () => true, machine: { docker: true } });
    assert.deepEqual(made.steps.filter((step) => step.op === 'ensure-dir'), []);
});
