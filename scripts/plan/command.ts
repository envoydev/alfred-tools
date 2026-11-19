// The plan command: reads its files and flags, prints the plan or the questions, and writes the plan file. The three
// modes that write the walk's files (--record, --rewind, --skip) are record-modes.ts.
import { blockingStdio } from '../core/json-file.ts';
import { checkedTarget, writeJsonNoFollow } from '../core/temp-write.ts';
import { plan } from './plan.ts';
import { renderPlan } from './render.ts';
import * as existing from '../inventory/existing.ts';
import { readObject, runRecordMode } from './record-modes.ts';
import { EXIT_CODE, REFUSAL } from './record-constants.ts';
import { walkOutput, withRootsMap } from './walk-output.ts';
import { isInventoryFile } from '../inventory/table.ts';
import { isAnswersFile, isPicksFile } from './files/shapes.ts';
import type { PlanArgs, PlanMode } from './types.ts';

// The arguments, by flag: a mode flag first or not at all, then its files, and the value flags anywhere after them. An
// unknown flag, or a flag without its value, is an error - never read as a file. --record takes four files (inventory,
// picks, answers, step), --rewind three and an optional pick, --skip three and a pick; the others at most two files.
const MODE_FLAGS: Record<string, PlanMode> = { '--questions': 'questions', '--record': 'record', '--rewind': 'rewind', '--skip': 'skip' };
const VALUE_FLAGS: Record<string, 'data' | 'connectors' | 'out'> = { '--data': 'data', '--connectors': 'connectors', '--out': 'out' };
const WALK_FILES = 3;
const flagIn = <Value>(flags: Record<string, Value>, argument: string | undefined): Value | undefined => (argument !== undefined && Object.hasOwn(flags, argument) ? flags[argument] : undefined);
function parseArgs(argv: string[]): PlanArgs
{
    const mode = flagIn(MODE_FLAGS, argv[0]) ?? 'plan';
    const out: PlanArgs = { mode, files: [], pick: null, data: null, connectors: null, out: null, error: null };
    // one iterator: a value flag takes the argument after it from the same walk
    const rest = argv.slice(mode === 'plan' ? 0 : 1)[Symbol.iterator]();
    for (const argument of rest)
    {
        const field = flagIn(VALUE_FLAGS, argument);
        if (field !== undefined)
        {
            const value = rest.next();
            if (value.done) return { ...out, error: `${argument} needs a value` };
            out[field] = value.value;
        }
        else if (argument.startsWith('--')) return { ...out, error: `unknown flag '${argument}'` };
        else out.files.push(argument);
    }
    if (mode === 'rewind' || mode === 'skip')
    {
        out.pick = out.files.splice(WALK_FILES)[0] ?? null;
        if (out.files.length !== WALK_FILES || (mode === 'skip' && out.pick === null)) return { ...out, error: `${argv[0]} takes an inventory, picks and answers file${mode === 'skip' ? ' and a pick' : ' and an optional pick'}` };
    }
    else if (mode === 'record')
    {
        if (out.files.length !== WALK_FILES + 1) return { ...out, error: REFUSAL.recordFiles };
    }
    else if (out.files.length > 2) return { ...out, error: `one inventory file and one ${mode === 'questions' ? 'picks' : 'answers'} file, not ${out.files.length} files` };
    return out;
}

const USAGE = [
    'usage: plan.ts <inventory.json> <answers.json> [--out plan.json] [--data <dir>]',
    '       plan.ts --questions <inventory.json> [<picks.json>] [--data <dir>] [--connectors <Name>,<Name>]',
    '       plan.ts --record <inventory.json> <picks.json> <answers.json> <step.json> [--data <dir>] [--connectors <Name>,<Name>]',
    '       plan.ts --rewind <inventory.json> <picks.json> <answers.json> [<pick>] [--data <dir>] [--connectors <Name>,<Name>]',
    '       plan.ts --skip <inventory.json> <picks.json> <answers.json> <pick> [--data <dir>]',
].join('\n');

export function runPlanCommand(argv: string[]): number
{
    blockingStdio();
    const args = parseArgs(argv);
    if (args.error) { console.error(`plan.ts: ${args.error}\n${USAGE}`); return EXIT_CODE.refused; }
    if (args.mode === 'record' || args.mode === 'rewind' || args.mode === 'skip') return runRecordMode(args);
    // the pre-approved call writes only in the run's temp folder, as the record modes do
    const outFile = args.out ? checkedTarget(args.out) : undefined;
    if (outFile === null) { console.error(`plan.ts: ${REFUSAL.outFolder}`); return EXIT_CODE.refused; }
    const [invFile, second] = args.files;
    if (!invFile || (args.mode === 'plan' && !second)) { console.error(USAGE); return EXIT_CODE.refused; }
    const inventoryRead = readObject(invFile);
    if ('refused' in inventoryRead) { console.error(`plan.ts: ${inventoryRead.refused}`); return EXIT_CODE.refused; }
    const secondRead = second ? readObject(second) : { value: null };
    if ('refused' in secondRead) { console.error(`plan.ts: ${secondRead.refused}`); return EXIT_CODE.refused; }
    const inventory = inventoryRead.value;
    if (!isInventoryFile(inventory)) { console.error(`plan.ts: ${invFile}: ${REFUSAL.notInventory}`); return EXIT_CODE.refused; }
    withRootsMap(inventory, args.data);
    if (args.mode === 'questions')
    {
        const picks = secondRead.value;
        if (picks !== null && !isPicksFile(picks)) { console.error(`plan.ts: ${second}: ${REFUSAL.notPicks}`); return EXIT_CODE.refused; }
        const output = walkOutput(inventory, picks, args);
        if ('waits' in output) { console.error(output.waits); return EXIT_CODE.stopped; }
        console.log(JSON.stringify(output, null, 2));
        return EXIT_CODE.ok;
    }
    const answers = secondRead.value;
    if (!isAnswersFile(answers)) { console.error(`plan.ts: ${second}: ${REFUSAL.notAnswers}`); return EXIT_CODE.refused; }
    const madePlan = plan(inventory, answers, { env: process.env, connectors: args.connectors !== null ? existing.parseConnectors(args.connectors) : null });
    if (outFile) writeJsonNoFollow(outFile, madePlan);
    console.log(renderPlan(madePlan));
    return madePlan.errors.length ? EXIT_CODE.stopped : EXIT_CODE.ok;
}
