// plan.ts and its record modes read three files a person or a script may get wrong - the inventory, the picks and the
// answers: one of the wrong shape is refused with one line and exit 2, never read into a crash or a plan. And a location
// answer that names no folder is refused, never placed in a folder named 'undefined'.
import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeTempDir } from '../scripts/core/tmpdir.ts';
import { plan } from '../scripts/plan/plan.ts';
import { inv, MAC } from './record-helpers.ts';

const PLAN_ENTRY = path.join(import.meta.dirname, '..', 'scripts', 'plan.ts');

// The files written into a temp folder plan.ts may write in, and a runner for plan.ts under a temp home.
function files(t: TestContext, contents: Record<string, unknown>): { paths: Record<string, string>; run: (...args: string[]) => { status: number | null; stdout: string; stderr: string } }
{
    const dir = makeTempDir();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'shape-home-'));
    t.after(() => { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); });
    const paths = Object.fromEntries(Object.entries(contents).map(([name, value]) => { const file = path.join(dir, `${name}.json`); fs.writeFileSync(file, JSON.stringify(value)); return [name, file]; }));
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    return { paths, run: (...args: string[]) => spawnSync(process.execPath, [PLAN_ENTRY, ...args], { encoding: 'utf8', env }) };
}

test('a picks file given where the inventory goes is refused in one line, exit 2', (t) =>
{
    const { paths, run } = files(t, { inventory: { rows: ['gitlab'] }, answers: { picks: { gitlab: {} } } });
    const refused = run(paths['inventory'] ?? '', paths['answers'] ?? '');
    assert.strictEqual(refused.status, 2, refused.stderr);
    assert.strictEqual(refused.stderr.trim(), `plan.mjs: ${paths['inventory']}: is not an inventory file: no os or registrations`);
});

test('an answers file whose pick is not an object is refused in one line, exit 2', (t) =>
{
    const { paths, run } = files(t, { inventory: inv(MAC), answers: { picks: { gitlab: 5 } } });
    const refused = run(paths['inventory'] ?? '', paths['answers'] ?? '');
    assert.strictEqual(refused.status, 2, refused.stderr);
    assert.strictEqual(refused.stderr.trim(), `plan.mjs: ${paths['answers']}: is not an answers file: its picks or change are not a map of picks`);
});

test('the walk refuses a picks file whose rows are not a list, exit 2', (t) =>
{
    const { paths, run } = files(t, { inventory: inv(MAC), picks: { rows: 'gitlab' } });
    const refused = run('--questions', paths['inventory'] ?? '', paths['picks'] ?? '');
    assert.strictEqual(refused.status, 2, refused.stderr);
    assert.strictEqual(refused.stderr.trim(), `plan.mjs: ${paths['picks']}: is not a picks file: a list or a map of it is not one`);
});

test("a 'path' location with no folder is a plan error, not a data folder named 'undefined'", () =>
{
    const made = plan(inv(MAC), { picks: { memory: { scope: 'local', location: { side: 'path' } } } }, { home: '/Users/me', env: {}, exists: () => false, machine: { docker: true } });
    assert.deepStrictEqual(made.errors, [`memory: a 'path' location names its folder: { "side": "path", "path": <folder> }`]);
    assert.deepStrictEqual(made.steps.filter((step) => step.op === 'ensure-dir'), []);
});
