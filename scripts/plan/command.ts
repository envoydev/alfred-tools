// The plan command: reads its files and flags, prints the plan or the questions, and writes the plan file.
import fs from 'node:fs';
import * as catalogLib from '../catalog/catalog.ts';
import { allQuestions } from './asks-all.ts';
import { nextQuestion } from './walk.ts';
import * as account from '../core/account.ts';
import * as roots from '../roots/roots.ts';
import * as existing from '../inventory/existing.ts';
import { blockingStdio } from '../core/json-file.ts';
import { plan, waitsFor } from './plan.ts';
import { renderPlan } from './render.ts';
import type { Inventory } from '../inventory/types.ts';
import type { Answers, Picks, PlanArgs } from './types.ts';

// The arguments, by flag: `--questions` first or not at all, then at most two files, and the flags anywhere after them.
// An unknown flag, or a flag without its value, is an error - never read as a file.
const VALUE_FLAGS: Record<string, 'data' | 'connectors' | 'out'> = { '--data': 'data', '--connectors': 'connectors', '--out': 'out' };
export function parseArgs(argv: string[]): PlanArgs
{
    const out: PlanArgs = { questions: argv[0] === '--questions', files: [], data: null, connectors: null, out: null, error: null };
    for (let i = out.questions ? 1 : 0; i < argv.length; i++)
    {
        const argument = argv[i]!;
        if (Object.hasOwn(VALUE_FLAGS, argument))
        {
            if (i + 1 >= argv.length) return { ...out, error: `${argument} needs a value` };
            out[VALUE_FLAGS[argument]!] = argv[++i]!;
        }
        else if (argument.startsWith('--')) return { ...out, error: `unknown flag '${argument}'` };
        else out.files.push(argument);
    }
    if (out.files.length > 2) return { ...out, error: `one inventory file and one ${out.questions ? 'picks' : 'answers'} file, not ${out.files.length} files` };
    return out;
}

const USAGE = 'usage: plan.ts <inventory.json> <answers.json> [--out plan.json] [--data <dir>]\n       plan.ts --questions <inventory.json> [<picks.json>] [--data <dir>] [--connectors <Name>,<Name>]';

export function runPlanCommand(argv: string[]): number
{
    blockingStdio();
    const read = (filePath: string): unknown => JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const args = parseArgs(argv);
    if (args.error) { console.error(`plan.ts: ${args.error}\n${USAGE}`); return 2; }
    const [invFile, second] = args.files;
    if (!invFile || (!args.questions && !second)) { console.error(USAGE); return 2; }
    const inventory = read(invFile) as Inventory;
    // the roots map is read fresh from the plugin's data folder when one is given
    if (args.data !== null) inventory.roots = { ...(inventory.roots || {}), map: roots.readMap(args.data) };
    // a folder under the former name waits to move: nothing is asked before update moves it (spec D3)
    const waits = args.questions ? waitsFor({ project: inventory.project, home: account.homeDir(process.env), platform: inventory.os || process.platform }, inventory.registrations || []) : null;
    if (waits) { console.error(waits); return 1; }
    if (args.questions)
    {
        const picks = second ? read(second) as Picks : null;
        const catalog = catalogLib.load();
        // --connectors: the claude.ai connectors this session has loaded, named in the pick list (spec F4)
        const qopts = { env: process.env, home: account.homeDir(process.env), connectors: args.connectors !== null ? existing.parseConnectors(args.connectors) : null };
        const built = allQuestions(inventory, picks, catalog, qopts);
        // the walk's one step: what to ask now, about one tool (spec F1)
        const output = { ...built, next: nextQuestion(inventory, picks, catalog, qopts, built) };
        console.log(JSON.stringify(output, null, 2));
        return 0;
    }
    const madePlan = plan(inventory, read(second!) as Answers, { env: process.env, connectors: args.connectors !== null ? existing.parseConnectors(args.connectors) : null });
    if (args.out) fs.writeFileSync(args.out, JSON.stringify(madePlan, null, 2));
    console.log(renderPlan(madePlan));
    return madePlan.errors.length ? 1 : 0;
}

