// The builders tests/plan.test.ts shares with the flat plan test files: the fixtures, an inventory, the options and the answers.
import type { Inventory, InvRegistration } from '../scripts/inventory/types.ts';
import type { ServerEntry } from '../scripts/core/types.ts';
import type { Answers, McpAddStep, PickAnswer, Plan, PlanOptions } from '../scripts/plan/types.ts';

export const MAC = { os: 'darwin', arch: 'arm64', project: '/work/shop' };
// a test of a darwin plan whose fixture paths (/work/shop, /Users/me) or real folders meet node's own path module: on a
// Windows host that module is win32 and the two never agree - the plan runs with one platform's paths on a real machine,
// and the matrix runs these flows on Windows
export const POSIX_FIXTURE = process.platform === 'win32' && 'NOT RUN: a darwin fixture meets node\'s win32 path module on this host (the matrix covers Windows)';
export const inv = (base: { os: string; arch: string; project: string }, extra: Record<string, unknown> = {}) => ({ version: 1, ...base, cli: { ok: true }, unreadable: [], registrations: [], plugins: [], marketplaces: [], alfredCodeEnabled: false, sources: {}, ...extra }) as unknown as Inventory;
export const opts = (home: string, extra: PlanOptions = {}) => ({ home, env: {}, exists: () => false, machine: { docker: true }, ...extra });
export const pickOne = (id: string, pick: PickAnswer = {}): Answers => ({ picks: { [id]: pick } });
export const addStep = (p: Plan, i = 0) => (p.steps.filter((s) => s.op === 'mcp-add') as McpAddStep[])[i] as McpAddStep;
export const reg = (name: string, scope: string, entry: ServerEntry, rowId: string | null = null, route: string | null = null, flags: Partial<InvRegistration> = {}): InvRegistration => ({ name, scope, entry, rowId, route, own: !rowId, alfredRetired: false, ...flags });
export const changeOf = (r: { name: string; scope: string }, answers: PickAnswer = {}): Answers => ({ change: { [`mcp:${r.name}~${r.scope}`]: answers } });

export const PFILE = '/work/shop/.alfred-tools/mcps.json';
export const OLD_ROOT = '/work/shop/.alfred-tools';
export const usedRoots = (project: string | null, global: string | null = null) => ({ map: null, project: project && { path: project, from: 'registration' }, global: global && { path: global, from: 'registration' } });
