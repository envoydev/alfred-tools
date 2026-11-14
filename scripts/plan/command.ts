// The plan command: reads its files and flags, prints the plan or the questions, and writes the plan file.
import fs from 'node:fs';
import * as catalogLib from '../catalog/catalog.ts';
import { all } from './asks-all.ts';
import { next } from './walk.ts';
import * as account from '../core/account.ts';
import * as roots from '../roots/roots.ts';
import * as existing from '../inventory/existing.ts';
import { blockingStdio } from '../core/json-file.ts';
import { plan } from './plan.ts';
import { render } from './render.ts';
import type { Inventory } from '../inventory/types.ts';
import type { Answers, Picks } from './types.ts';

interface PlanArgs
{
    questions: boolean;
    files: string[];
    data: string | null;
    connectors: string | null;
    out: string | null;
    error: string | null;
}

// The arguments, by flag: `--questions` first or not at all, then at most two files, and the flags anywhere after them.
// An unknown flag, or a flag without its value, is an error - never read as a file.
const VALUE_FLAGS: Record<string, 'data' | 'connectors' | 'out'> = { '--data': 'data', '--connectors': 'connectors', '--out': 'out' };
export function parseArgs(argv: string[]): PlanArgs
{
    const out: PlanArgs = { questions: argv[0] === '--questions', files: [], data: null, connectors: null, out: null, error: null };
    for (let i = out.questions ? 1 : 0; i < argv.length; i++)
    {
        const a = argv[i]!;
        if (Object.hasOwn(VALUE_FLAGS, a))
        {
            if (i + 1 >= argv.length) return { ...out, error: `${a} needs a value` };
            out[VALUE_FLAGS[a]!] = argv[++i]!;
        }
        else if (a.startsWith('--')) return { ...out, error: `unknown flag '${a}'` };
        else out.files.push(a);
    }
    if (out.files.length > 2) return { ...out, error: `one inventory file and one ${out.questions ? 'picks' : 'answers'} file, not ${out.files.length} files` };
    return out;
}

const USAGE = 'usage: plan.ts <inventory.json> <answers.json> [--out plan.json] [--data <dir>]\n       plan.ts --questions <inventory.json> [<picks.json>] [--data <dir>] [--connectors <Name>,<Name>]';

export function main(argv: string[]): number
{
    blockingStdio();
    const read = (f: string): unknown => JSON.parse(fs.readFileSync(f, 'utf8'));
    const args = parseArgs(argv);
    if (args.error) { console.error(`plan.ts: ${args.error}\n${USAGE}`); return 2; }
    const [invFile, second] = args.files;
    if (!invFile || (!args.questions && !second)) { console.error(USAGE); return 2; }
    const inv = read(invFile) as Inventory;
    // the roots map is read fresh from the plugin's data folder when one is given
    if (args.data !== null) inv.roots = { ...(inv.roots || {}), map: roots.readMap(args.data) };
    if (args.questions)
    {
        const picks = second ? read(second) as Picks : null;
        const catalog = catalogLib.load();
        // --connectors: the claude.ai connectors this session has loaded, named in the pick list (spec F4)
        const qopts = { env: process.env, home: account.homeDir(process.env), connectors: args.connectors !== null ? existing.parseConnectors(args.connectors) : null };
        const built = all(inv, picks, catalog, qopts);
        // the walk's one step: what to ask now, about one tool (spec F1)
        const q = { ...built, next: next(inv, picks, catalog, qopts, built) };
        console.log(JSON.stringify(q, null, 2));
        return 0;
    }
    const p = plan(inv, read(second!) as Answers, { env: process.env, connectors: args.connectors !== null ? existing.parseConnectors(args.connectors) : null });
    if (args.out) fs.writeFileSync(args.out, JSON.stringify(p, null, 2));
    console.log(render(p));
    return p.errors.length ? 1 : 0;
}

