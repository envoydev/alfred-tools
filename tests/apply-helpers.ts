// The builders tests/apply.test.ts shares with the flat apply test files: the written .mcp.json and a run of plan steps.
import path from 'node:path';
import { apply } from '../scripts/apply/run.ts';
import { readJson } from './helpers.ts';
import type { ApplyOptions, ApplyPlan } from '../scripts/apply/types.ts';
import type { PlanStep } from '../scripts/plan/types.ts';
import type { World } from './types.ts';

export const mcpJson = (w: World) => readJson(path.join(w.project, '.mcp.json'));

export function runSteps(w: World, list: unknown[], opts: ApplyOptions = {})
{
    const lines: string[] = [];
    const report = apply({ version: 1, project: w.project, steps: list as PlanStep[], errors: [] } as ApplyPlan, { env: w.env, tmp: path.join(w.dir, 'tmp'), log: (...a) => lines.push(a.join(' ')), ...opts });
    return { report, text: lines.join('\n') };
}
