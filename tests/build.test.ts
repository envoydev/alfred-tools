// build.ts: the ten dist/ entries, their esbuild options, and the check that dist/ matches the source.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ENTRIES, buildOptions, compareDist } from './build.ts';

const BANNER_LINES = [
    '// Built from the TypeScript in scripts/ by npm run build - do not edit.',
    "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
];

test('the entries are the ten command scripts, in the order the plan names them', () =>
{
    assert.deepStrictEqual([...ENTRIES], ['plan', 'update', 'fix', 'prereq', 'tmpdir', 'table', 'inventory', 'fetch', 'sign-in', 'apply']);
});

test('compareDist names a missing, a changed and an extra file, and nothing else', () =>
{
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'build-test-'));
    try
    {
        fs.mkdirSync(path.join(root, 'dist'));
        const built = new Map<string, string>([['dist/plan.mjs', 'one'], ['dist/fix.mjs', 'two'], ['dist/table.mjs', 'three']]);
        fs.writeFileSync(path.join(root, 'dist', 'plan.mjs'), 'one');
        fs.writeFileSync(path.join(root, 'dist', 'fix.mjs'), 'edited by hand');
        fs.writeFileSync(path.join(root, 'dist', 'old.mjs'), 'left over');
        const problems = compareDist(root, built);
        assert.strictEqual(problems.length, 3, problems.join('\n'));
        assert.ok(problems.some((problem) => problem.includes('dist/fix.mjs') && problem.includes('differs')), problems.join('\n'));
        assert.ok(problems.some((problem) => problem.includes('dist/table.mjs') && problem.includes('missing')), problems.join('\n'));
        assert.ok(problems.some((problem) => problem.includes('dist/old.mjs') && problem.includes('extra')), problems.join('\n'));
    }
    finally
    {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('compareDist returns no problem when dist/ holds exactly the built files', () =>
{
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'build-test-'));
    try
    {
        fs.mkdirSync(path.join(root, 'dist'));
        fs.writeFileSync(path.join(root, 'dist', 'plan.mjs'), 'one');
        assert.deepStrictEqual(compareDist(root, new Map([['dist/plan.mjs', 'one']])), []);
    }
    finally
    {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('buildOptions bundles every entry for Node 26 as ESM with the two-line banner, unminified and with no source map', () =>
{
    const root = path.join(os.tmpdir(), 'build-test-root');
    const options = buildOptions(root);
    assert.deepStrictEqual(options.entryPoints, ENTRIES.map((entry) => path.join('scripts', `${entry}.ts`)));
    assert.strictEqual(options.bundle, true);
    assert.strictEqual(options.platform, 'node');
    assert.strictEqual(options.format, 'esm');
    assert.strictEqual(options.target, 'node26');
    assert.strictEqual(options.outdir, 'dist');
    assert.deepStrictEqual(options.outExtension, { '.js': '.mjs' });
    assert.strictEqual(options.charset, 'utf8');
    assert.strictEqual(options.legalComments, 'none');
    assert.strictEqual(options.absWorkingDir, root);
    assert.deepStrictEqual(options.banner, { js: BANNER_LINES.join('\n') });
    assert.ok(!options.minify, 'minify stays off');
    assert.ok(!options.sourcemap, 'no source map');
    assert.strictEqual(options.write, false);
});

test('build.ts --check runs and reports when it is started through a symlink', { skip: process.platform === 'win32' && 'a symlink needs a privilege on Windows' }, (t) =>
{
    const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'build-link-')));
    t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
    fs.symlinkSync(import.meta.dirname, path.join(scratch, 'tests'), 'dir');
    // node resolves import.meta.url to the real file but leaves argv[1] as typed: a guard that compares them
    // unresolved never starts main(), so the check prints nothing and exits 0 - it looks like a pass
    const run = spawnSync(process.execPath, [path.join(scratch, 'tests', 'build.ts'), '--check'], {
        env: { PATH: process.env['PATH'] ?? '', TMPDIR: scratch },
        encoding: 'utf8',
    });
    assert.strictEqual(run.status, 0, run.stderr);
    assert.match(run.stdout, /^build: dist\/ matches the source/);
});
