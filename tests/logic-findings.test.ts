// Pinned behaviour the TypeScript restructure exposed that looks unintended at first read, and was ruled to stay. Each
// test says what is kept and why. The findings with no observable behaviour (dead code, checks that can never fail) are
// listed in the ledger only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { plan } from '../scripts/plan/plan.ts';
import { apply } from '../scripts/apply/run.ts';
import type { Inventory } from '../scripts/inventory/types.ts';
import type { PathStep } from '../scripts/plan/types.ts';

const MAC = { os: 'darwin', arch: 'arm64', project: '/work/shop' };
const inventory = { version: 1, ...MAC, cli: { ok: true }, unreadable: [], registrations: [], plugins: [], marketplaces: [], alfredCodeEnabled: false, sources: {} } as unknown as Inventory;

// scripts/plan/pick/root.ts says a default data folder is ensured on purpose: defaultRoot names no folder already on
// disk, so the plan holds the ensure-dir step whatever `exists` says. Harmless, since ensure-dir (scripts/apply/run.ts)
// leaves an existing folder as it is and writes no .gitignore into it - the ruling keeps both halves.
test('a default data folder already on disk still gets an ensure-dir step, and apply leaves that folder as it is', () =>
{
    const made = plan(inventory, { picks: { 'playwright-chrome': {} } }, { home: '/Users/me', env: {}, exists: () => true, machine: { docker: true } });
    assert.deepEqual(made.steps.filter((step) => step.op === 'ensure-dir').map((step) => (step as PathStep).path), ['/work/shop/.alfred/playwright-chrome']);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ensure-dir-'));
    try
    {
        const folder = path.join(dir, 'data');
        fs.mkdirSync(folder);
        fs.writeFileSync(path.join(folder, 'kept.txt'), 'mine');
        const lines: string[] = [];
        const report = apply({ project: dir, steps: [{ op: 'ensure-dir', path: folder, why: 'a data folder' }] }, { env: {}, tmp: path.join(dir, 'tmp'), log: (...text: unknown[]) => lines.push(text.join(' ')), fetchFile: false });
        assert.equal(report.failed, null, lines.join('\n'));
        assert.deepEqual(fs.readdirSync(folder), ['kept.txt'], 'no .gitignore written into an existing folder');
        assert.ok(lines.some((line) => line.includes('left as it is')), lines.join('\n'));
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
