// The builders and seams tests/fix.test.ts shares with the flat fix test files: a hand-built inventory and ctx, and the helpers that seed the fake claude.
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as catalogLib from '../scripts/catalog/catalog.ts';
import * as inventory from '../scripts/inventory/inventory.ts';
import * as cli from '../scripts/core/claude-cli.ts';
import * as account from '../scripts/core/account.ts';
import { makeCtx, detectAll, renderFixes } from '../scripts/fix/fix.ts';
import type { Detected, Finding, FixCtx, MachineProbe } from '../scripts/fix/types.ts';
import type { Inventory, InvList, InvRegistration, PluginRow } from '../scripts/inventory/types.ts';
import type { ListServer } from '../scripts/mcps-list/types.ts';
import type { Env, ServerEntry } from '../scripts/core/types.ts';
import type { World } from './types.ts';

const catalog = catalogLib.load();
const row = (id: string) => catalog.byId.get(id)!;

export const noMachine = (over: Partial<MachineProbe> = {}): MachineProbe => ({ exists: () => false, realpath: () => null, which: () => null, run: () => ({ status: 1, stdout: '', stderr: '' }), nodeVersion: '24.0.0', ...over });

export function reg(rowId: string, entry: ServerEntry, { name = row(rowId).name, scope = 'local', route = 'local' }: { name?: string; scope?: string; route?: string } = {}): InvRegistration { return { name, scope, entry, rowId, route, own: false, alfredRetired: false }; }

export type CtxFor = { platform?: string; arch?: string; registrations?: InvRegistration[]; plugins?: PluginRow[]; env?: Env; machine?: MachineProbe; project?: string; home?: string };
export function ctxFor({ platform = 'darwin', arch = 'x64', registrations = [], plugins = [], env = {}, machine = noMachine(), project, home }: CtxFor = {}): FixCtx
{
    const win = platform === 'win32';
    const inv = { version: 1, project: project || (win ? 'C:\\proj' : '/proj'), os: platform, arch, registrations, plugins, cli: { ok: true } } as Inventory;
    // a 0.5.0 install: every registration is in its family's list, so list-import has nothing to do here
    const P = win ? path.win32 : path.posix;
    const listOf = (family: string, root: string): InvList => ({ file: P.join(root, '.alfred-tools', 'mcps.json'), servers: registrations.filter((r) => r.scope !== 'inherited' && (family === 'global') === (r.scope === 'user')) as unknown as ListServer[], own: [] });
    inv.lists = { project: listOf('project', inv.project), global: listOf('global', home || (win ? 'C:\\Users\\dev' : '/home/dev')) };
    return makeCtx({ inventory: inv, catalog, env: { ...env, HOME: home || (win ? 'C:\\Users\\dev' : '/home/dev') }, machine, platform, arch });
}

// a synthetic /proj and its home never hold the serena-context.yml an install writes in serena's home (tests/plan.test.ts and
// tests/apply.test.ts prove that write): the findings about that missing file are left out here, and only here
// (start-timeout likewise: the synthetic home holds no Claude Code settings.json)
export const synthetic = (f: Finding) => (f.id === 'start-timeout' && /^(?:\/home\/dev|C:\\Users\\dev)[\\/]\.claude[\\/]settings\.json$/.test(f.name)) || (f.id === 'helper-missing' && f.shipped === 'serenaContext' && /^(?:\/proj|\/home\/dev|C:\\proj|C:\\Users\\dev)[\\/]/.test(f.path!)) || (f.id === 'serena-context' && /, which is not there$/.test(f.found));
export const detect = (ctx: FixCtx, only?: string) => { const d = detectAll(ctx, { only }); return { ...d, found: d.found.filter((f) => !synthetic(f)) }; };

export function seed(w: World, name: string, scope: string, entry: ServerEntry)
{
    const r = cli.runClaude(['mcp', 'add-json', name, JSON.stringify(entry), '-s', scope], { cwd: w.project, env: w.env });
    assert.strictEqual(r.status, 0, r.stderr);
}
export const ctxOf = (w: World, over: Partial<Parameters<typeof makeCtx>[0]> = {}) => makeCtx({ inventory: inventory.buildInventory({ project: w.project, env: w.env }), env: w.env, machine: noMachine(), ...over });

export const put = (file: string, text: string) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
export const ptRoot = (w: World) => path.join(w.project, '.alfred-tools');
export const localEntry = (w: World, name: string) => account.readAccount(w.env, w.project).local[name];
export const logged = () => { const lines: string[] = []; return { lines, log: (...a: string[]) => lines.push(a.join(' ')), text: () => lines.join('\n') }; };
export const gitInit = (dir: string) => { fs.mkdirSync(dir, { recursive: true }); assert.strictEqual(spawnSync('git', ['init', '-q', dir]).status, 0); };
export const shownOf = (d: Detected) => `${renderFixes(d)}${JSON.stringify(d)}`;

export const SERENA_OLD = (home: string) => ({ command: 'uvx', args: ['--python', '3.13', '--exclude-newer', '2026-10-20T23:59:59Z', '--from', 'serena-agent@2.1.0', 'serena', 'start-mcp-server', '--context', 'claude-code', '--enable-web-dashboard', 'false', '--project-from-cwd', '--agent-interface', 'tools'], env: { SERENA_USAGE_REPORTING: 'false', SERENA_HOME: home } });
