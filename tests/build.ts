// The dist/ build: bundles each command entry in scripts/ into one dist/<entry>.mjs with esbuild (npm run build), and
// checks that the committed dist/ matches the source (npm run build:check, which CI runs). Run it, never edit dist/.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, type BuildOptions } from 'esbuild';

export const ENTRIES: readonly string[] = ['plan', 'update', 'fix', 'prereq', 'tmpdir', 'table', 'inventory', 'fetch', 'sign-in', 'apply'];

const DIST_DIR = 'dist';
const CHECK_FLAG = '--check';

// The second line gives the CommonJS files in scripts/copied/ a `require`: bundled into ESM they fail at start with
// 'Dynamic require of "node:fs" is not supported' without it.
const BANNER = [
    '// Built from the TypeScript in scripts/ by npm run build - do not edit.',
    "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
].join('\n');

export function buildOptions(root: string): BuildOptions
{
    return {
        entryPoints: ENTRIES.map((entry) => path.join('scripts', `${entry}.ts`)),
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: 'node20',
        outdir: DIST_DIR,
        outExtension: { '.js': '.mjs' },
        charset: 'utf8',
        legalComments: 'none',
        absWorkingDir: root,
        banner: { js: BANNER },
        // Both write and check go through these bytes, so the check cannot differ from what a build writes.
        write: false,
    };
}

export async function buildInMemory(root: string): Promise<Map<string, string>>
{
    const result = await build(buildOptions(root));
    const built = new Map<string, string>();
    for (const file of result.outputFiles ?? [])
        built.set(path.relative(root, file.path).split(path.sep).join('/'), file.text);
    const expected = ENTRIES.map((entry) => `${DIST_DIR}/${entry}.mjs`);
    const unexpected = [...built.keys()].filter((name) => !expected.includes(name));
    if (unexpected.length > 0)
        throw new Error(`esbuild wrote a file no entry accounts for: ${unexpected.join(', ')}`);
    return built;
}

export function compareDist(root: string, built: Map<string, string>): string[]
{
    const problems: string[] = [];
    for (const [name, text] of built)
    {
        const file = path.join(root, name);
        if (!fs.existsSync(file))
            problems.push(`${name}: missing`);
        else if (fs.readFileSync(file, 'utf8') !== text)
            problems.push(`${name}: differs from the source - run npm run build`);
    }
    const distFolder = path.join(root, DIST_DIR);
    for (const name of fs.existsSync(distFolder) ? fs.readdirSync(distFolder) : [])
        if (!built.has(`${DIST_DIR}/${name}`))
            problems.push(`${DIST_DIR}/${name}: extra - nothing builds it`);
    return problems;
}

async function main(argv: string[]): Promise<number>
{
    const root = path.join(import.meta.dirname, '..');
    const built = await buildInMemory(root);
    if (argv.includes(CHECK_FLAG))
    {
        const problems = compareDist(root, built);
        if (problems.length > 0)
        {
            for (const problem of problems)
                process.stderr.write(`build: ${problem}\n`);
            return 1;
        }
        process.stdout.write(`build: dist/ matches the source (${built.size} files)\n`);
        return 0;
    }
    fs.rmSync(path.join(root, DIST_DIR), { recursive: true, force: true });
    fs.mkdirSync(path.join(root, DIST_DIR), { recursive: true });
    for (const [name, text] of built)
        fs.writeFileSync(path.join(root, name), text);
    process.stdout.write(`build: wrote ${built.size} files to dist/\n`);
    return 0;
}

// import.meta.url is the real path; argv[1] is as typed, so a symlinked start needs it resolved or main() never runs and
// the check prints nothing and exits 0
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href)
    process.exitCode = await main(process.argv.slice(2));
