// The builders tests/update.test.ts shares with the flat update test files: a fake registry, a machine with no runtimes, the command runner and the 0.5.0 list helpers.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import * as update from '../scripts/update/command.ts';
import * as inventory from '../scripts/inventory/inventory.ts';
import * as cli from '../scripts/core/claude-cli.ts';
import { plan } from '../scripts/plan/plan.ts';
import { apply } from '../scripts/apply/run.ts';
import { readJson } from './helpers.ts';
import type { Catalog, Release } from '../scripts/catalog/types.ts';
import type { ServerEntry } from '../scripts/core/types.ts';
import type { MachineProbe } from '../scripts/fix/types.ts';
import type { World } from './types.ts';

export type MainOpts = NonNullable<Parameters<typeof update.runUpdateCommand>[1]>;

export const DAY = 86400000;
export const NOW = Date.parse('2026-10-27T12:00:00Z');
export const ago = (days: number) => NOW - days * DAY;

// a fake registry: { 'pypi:serena-agent': [{ version, time }] }
export const fakeRegistry = (table: Record<string, Release[]>) => ({ versionsOf: async (reg: string, name: string) => { const v = table[`${reg}:${name}`]; if (!v) throw new Error(`no such package ${name}`); return v; } });
// a machine with no runtimes on it
export const noLsp = { which: () => null, run: () => ({ status: 1, stdout: '', stderr: '' }), nodeVersion: process.versions.node } as unknown as MachineProbe;

export async function run(w: World, argv: string[], opts: MainOpts = {})
{
    const lines: string[] = [];
    // an apply that hands a fetch file on keeps its <tmp> for the command's next step: inside the world, w.clean() takes it
    const tmp = argv.includes('--apply') && !argv.includes('--tmp') ? ['--tmp', fs.mkdtempSync(path.join(w.dir, 'alfred-tools-'))] : [];
    const code = await update.runUpdateCommand([...argv, ...tmp, '--project', w.project], { env: w.env, out: (s) => lines.push(s), machine: noLsp, now: NOW, registry: fakeRegistry({}), ...opts });
    return { code, text: lines.join('\n') };
}

export const projectList = (w: World) => path.join(w.project, '.alfred-tools', 'mcps.json');
export const listed0 = (w: World, name: string) => readJson(projectList(w)).servers.find((x: { name: string }) => x.name === name);
export const localReg = (w: World, name: string) => inventory.buildInventory({ project: w.project, env: w.env }).registrations.find((r) => r.name === name && r.scope === 'local')!;
export const reAdd = (w: World, name: string, entry: unknown) =>
{
    cli.runClaude(['mcp', 'remove', name, '-s', 'local'], { cwd: w.project, env: w.env });
    assert.strictEqual(cli.runClaude(['mcp', 'add-json', name, JSON.stringify(entry), '-s', 'local'], { cwd: w.project, env: w.env }).status, 0);
};

// A stdio registration in the plain form an alfred-tools before 0.7.0 wrote, its key in its env: it is registered as it is, then
// a configure that only adds Cursor writes the list entry and Cursor's copy from it. A plain entry that holds its key stays
// plain through a change, so this is the form the install no longer builds.
export function installPlain(w: World, name: string, scope: string, entry: ServerEntry, catalog?: Catalog)
{
    assert.strictEqual(cli.runClaude(['mcp', 'add-json', name, JSON.stringify(entry), '-s', scope], { cwd: w.project, env: w.env }).status, 0);
    const p = plan(inventory.buildInventory({ project: w.project, env: w.env }), { change: { [`mcp:${name}~${scope}`]: { clients: ['claude', 'cursor'] } } }, { home: w.home, env: w.env, ...(catalog ? { catalog } : {}) });
    assert.deepStrictEqual(p.errors, []);
    assert.strictEqual(apply(p, { env: w.env, tmp: path.join(w.dir, 'tmp'), log: () => {} }).failed, null);
}
