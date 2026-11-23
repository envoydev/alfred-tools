// The smoke run of the bundles: starts the eight entries that refuse with no arguments and runs the tmpdir -> inventory ->
// table -> plan chain, all from dist/ and all in a throwaway world, then compares with EXPECTED. It imports only
// tests/dist-world.mjs and Node built-ins, so Node 20.19 - the oldest Node a user may have - runs it with no
// install and no type stripping (the CI `node20` job). tests/dist.test.ts checks EXPECTED against the source's own run
// so it cannot drift: when it fails after a deliberate change, copy the values it shows in here.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { distWorld, runEntry, mask, chain, condense, REFUSING } from './dist-world.mjs';

const EXIT_REFUSED = 2;

export const EXPECTED = {
    starts: {
        plan: {
            status: EXIT_REFUSED,
            stdout: '',
            stderr: 'usage: plan.ts <inventory.json> <answers.json> [--out plan.json] [--data <dir>]\n       plan.ts --questions <inventory.json> [<picks.json>] [--data <dir>] [--connectors <Name>,<Name>]\n       plan.ts --record <inventory.json> <picks.json> <answers.json> <step.json> [--data <dir>] [--connectors <Name>,<Name>]\n       plan.ts --rewind <inventory.json> <picks.json> <answers.json> [<pick>] [--data <dir>] [--connectors <Name>,<Name>]\n       plan.ts --skip <inventory.json> <picks.json> <answers.json> <pick> [--data <dir>]\n',
        },
        apply: { status: EXIT_REFUSED, stdout: '', stderr: 'usage: apply.ts <plan.json> [--tmp <dir>] [--data <plugin data dir>]\n' },
        fetch: { status: EXIT_REFUSED, stdout: '', stderr: 'usage: fetch.ts <fetch.json>\n' },
        table: { status: EXIT_REFUSED, stdout: 'usage: table.ts <inventory.json>\n', stderr: '' },
        prereq: { status: EXIT_REFUSED, stdout: 'usage: prereq.ts <answers.json> | --rows id,id  [--json]\n', stderr: '' },
        'sign-in': { status: EXIT_REFUSED, stdout: '', stderr: 'usage: sign-in.ts <name> <project|local|user>\n' },
        update: {
            status: EXIT_REFUSED,
            stdout: 'update: give exactly one of --check, --questions or --apply\nusage: node scripts/update.ts --check | --questions | --apply <id,id|all|none> [--input key=value] [--no-refresh] [--project <dir>] [--tmp <dir>] [--data <dir>]\n',
            stderr: '',
        },
        fix: {
            status: EXIT_REFUSED,
            stdout: 'fix: give exactly one of --detect, --questions or --apply\nusage: node scripts/fix.ts --detect | --questions | --apply <id,id|all> [--only <x>] [--input key=value] [--project <dir>] [--data <dir>]\n',
            stderr: '',
        },
    },
    chain: {
        tmpdir: { status: 0, stdout: '<TMP>\n', stderr: '' },
        inventory: {
            status: 0,
            stdout: 'inventory: 0 registrations (0 match a catalog row, 0 are your own), 0 plugins -> <TMP>/inv.json\n',
            stderr: '',
            file: 'sha256:6581c4d10dae4439717ad9405737c5d9f030de63e2d06bdd0fcdf71c92dd255b',
        },
        table: { status: 0, stdout: 'sha256:96e4a6d0d9392c78451c6ff7f7d00961224e9e25d80e67b2264e897f81aa9f73', stderr: '' },
        plan: { status: 0, stdout: 'sha256:06a018666524ddcd1672f895b5eff0430340b128d0ae699cfb44e39aa14e9cd7', stderr: '' },
    },
};

/** The refusing entries' starts, as the smoke and its test record them. */
export function startsOf(world, entryFile)
{
    const starts = {};
    for (const name of REFUSING)
    {
        const run = runEntry(world, entryFile(name), []);
        starts[name] = { status: run.status, stdout: mask(world, run.stdout), stderr: mask(world, run.stderr) };
    }
    return starts;
}

// every leaf of two values as `a.b.c`, so a mismatch names where it is
function leaves(value, prefix = '')
{
    if (value === null || typeof value !== 'object') return [[prefix, value]];
    return Object.entries(value).flatMap(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key));
}

export function mismatches(actual, expected)
{
    const wanted = new Map(leaves(expected));
    const found = new Map(leaves(actual));
    const names = new Set([...wanted.keys(), ...found.keys()]);
    return [...names].filter((name) => wanted.get(name) !== found.get(name))
        .map((name) => `${name}: expected ${JSON.stringify(wanted.get(name))}, got ${JSON.stringify(found.get(name))}`);
}

function main()
{
    const world = distWorld();
    try
    {
        const actual = { starts: startsOf(world, (name) => `dist/${name}.mjs`), chain: condense(chain(world, 'mjs')) };
        const problems = mismatches(actual, EXPECTED);
        for (const problem of problems) process.stderr.write(`dist-smoke: ${problem}\n`);
        if (problems.length === 0) process.stdout.write(`dist-smoke: ${REFUSING.length} starts and the chain match on node ${process.version}\n`);
        return problems.length === 0 ? 0 : 1;
    }
    finally
    {
        world.clean();
    }
}

// import.meta.url is the real path; argv[1] is as typed, so a symlinked start needs it resolved or main() never runs and
// the gate prints nothing and passes
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) process.exitCode = main();
