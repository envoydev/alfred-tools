// The unit suite's test names, keyed by file (without its extension, so a .js and its .ts compare equal) and the path
// of names from the top-level test down. Used as a node:test reporter (its events carry the file; TAP output does
// not), and run by proof.js beside the spec reporter, so the suite runs once.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

// the part of a node:test reporter event read here
interface TestEvent
{
    type: string;
    data?: { file?: string; nesting: number; name: string };
}

const keyOf = (file: string, tree: string) => path.relative(tree, file).split(path.sep).join('/').replace(/\.(?:js|ts)$/, '');

// -> sorted unique `<file>\t<name > name>` keys from test:start events.
function namesOf(events: TestEvent[], tree: string)
{
    const stacks = new Map();
    const out = new Set();
    for (const e of events)
    {
        if (e.type !== 'test:start' || !e.data || !e.data.file) continue;
        const stack = stacks.get(e.data.file) || [];
        stack.length = e.data.nesting;
        stack.push(e.data.name);
        stacks.set(e.data.file, stack);
        out.add(`${keyOf(e.data.file, tree)}\t${stack.join(' > ')}`);
    }
    return [...out].sort();
}

// The reporter: every event kept, the names written once the run ends.
async function* reporter(source: AsyncIterable<TestEvent>)
{
    const events: TestEvent[] = [];
    for await (const e of source) if (e.type === 'test:start') events.push(e);
    yield `${namesOf(events, process.cwd()).join('\n')}\n`;
}

const unitFiles = (tree: string) => fs.readdirSync(path.join(tree, 'tests')).filter((f) => /\.test\.(?:js|ts)$/.test(f)).sort().map((f) => path.join('tests', f));

// The unit suite run once in a tree: { code, names, log } - `log` the spec reporter's output file.
function run(tree: string, { env = process.env }: { env?: NodeJS.ProcessEnv } = {}): Promise<{ code: number | null; names: string[]; log: string; dir: string }>
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-names-'));
    const log = path.join(dir, 'spec.log');
    const namesFile = path.join(dir, 'names.txt');
    const args = ['--test', '--test-reporter=spec', `--test-reporter-destination=${log}`, `--test-reporter=${import.meta.filename}`, `--test-reporter-destination=${namesFile}`, ...unitFiles(tree)];
    return new Promise((resolve) =>
    {
        const child = spawn(process.execPath, args, { cwd: tree, env, stdio: 'ignore' });
        child.on('close', (code) =>
        {
            const read = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
            resolve({ code, names: read(namesFile).split('\n').filter(Boolean), log: read(log), dir });
        });
    });
}

export default reporter;
export { namesOf, run, unitFiles };
