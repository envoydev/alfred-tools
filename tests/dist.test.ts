// dist/: the committed bundles equal a fresh build, start like their source and give its output, and a registration
// never points into the plugin's own folders. Every run happens in tests/dist-world.mjs's throwaway world.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ENTRIES, buildInMemory, compareDist } from './build.ts';
import { distWorld, runEntry, mask, chain, condense, REFUSING } from './dist-world.mjs';
import { EXPECTED, startsOf } from './dist-smoke.mjs';
import { load } from '../scripts/catalog/catalog.ts';
import { pluginRoot } from '../scripts/core/plugin-root.ts';
import { plan } from '../scripts/plan/plan.ts';
import { MAC, inv, opts, pickOne } from './plan-helpers.ts';

const ROOT = path.join(import.meta.dirname, '..');
const STUB_VERSION = '2.1.330 (Claude Code)';
// a `dist` or `scripts` folder in a path, or the variable a command file uses for the plugin's folder
// fixes.json fields that tell a person where something came from: the note names scripts/fix/, the source of one row
// names alfred-code's own scripts/ folder - neither is a path a registration or a fix runs
const PROSE_KEYS = new Set(['note', 'source', 'verifiedOn', 'hold', 'symptom']);
const PLUGIN_FOLDER = /(^|[\\/"'\s=])(dist|scripts)[\\/]|\$\{?CLAUDE_PLUGIN_ROOT\}?/;

// every string below a JSON value, but those under a prose key
function stringsOf(value: unknown): string[]
{
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(stringsOf);
    if (typeof value !== 'object' || value === null) return [];
    return Object.entries(value).filter(([key]) => !PROSE_KEYS.has(key)).flatMap(([, child]) => stringsOf(child));
}

test('dist/ equals a fresh build', async () =>
{
    assert.deepStrictEqual(compareDist(ROOT, await buildInMemory(ROOT)), []);
});

test('each refusing bundle starts like its source', (t) =>
{
    const world = distWorld();
    t.after(world.clean);
    assert.strictEqual(REFUSING.length, 8);
    for (const name of REFUSING)
    {
        const source = runEntry(world, `scripts/${name}.ts`, []);
        const bundle = runEntry(world, `dist/${name}.mjs`, []);
        assert.ok(ENTRIES.includes(name), `${name} is an entry`);
        assert.ok(source.stdout + source.stderr !== '', `${name}: the source printed its usage`);
        assert.deepStrictEqual(
            { status: bundle.status, stdout: mask(world, bundle.stdout), stderr: mask(world, bundle.stderr) },
            { status: source.status, stdout: mask(world, source.stdout), stderr: mask(world, source.stderr) },
            name,
        );
    }
});

test('the bundles give the source\'s output', (t) =>
{
    const world = distWorld();
    t.after(world.clean);
    const fromSource = chain(world, 'ts');
    assert.strictEqual(fromSource.plan.status, 0, fromSource.plan.stderr);
    assert.deepStrictEqual(chain(world, 'mjs'), fromSource);
});

// every `dist/<entry>.mjs` a command or the README calls
function calledBundles(): Set<string>
{
    const files = [...fs.readdirSync(path.join(ROOT, 'commands')).map((name) => path.join(ROOT, 'commands', name)), path.join(ROOT, 'README.md')];
    const called = new Set<string>();
    for (const file of files)
        for (const match of fs.readFileSync(file, 'utf8').matchAll(/\/dist\/([a-z-]+)\.mjs/g)) called.add(match[1]!);
    return called;
}

test('the commands call exactly the built entries', () =>
{
    assert.deepStrictEqual([...calledBundles()].sort(), [...ENTRIES].sort());
    for (const name of ENTRIES) assert.ok(fs.existsSync(path.join(ROOT, 'scripts', `${name}.ts`)), `scripts/${name}.ts exists`);
});

// a comment names a source module and stays; a usage line, the sign-in hint and a message that prefixes, cites or
// credits an entry (`plan.ts: `, `tmpdir.ts made`, `(fetch.ts`) name the bundle the user runs
const ENTRY_NAMES = 'plan|update|fix|prereq|tmpdir|table|inventory|fetch|sign-in|apply';
const ENTRY_NAMED = new RegExp(
    `(usage:?\\s|sign in now with )[^'"\`]*\\b(scripts\\/)?(${ENTRY_NAMES})\\.ts\\b`
    + `|\\b(${ENTRY_NAMES})\\.ts(:\\s| made\\b)|\\((${ENTRY_NAMES})\\.ts\\b`);

function sourceFiles(dir: string): string[]
{
    return fs.readdirSync(dir, { withFileTypes: true })
        .flatMap((entry) => entry.isDirectory() ? sourceFiles(path.join(dir, entry.name)) : entry.name.endsWith('.ts') ? [path.join(dir, entry.name)] : []);
}

test('no message names a .ts entry', () =>
{
    const found: string[] = [];
    for (const file of sourceFiles(path.join(ROOT, 'scripts')))
        fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) =>
        {
            if (/^\s*(\/\/|\*)/.test(line)) return;
            if (ENTRY_NAMED.test(line)) found.push(`${path.relative(ROOT, file)}:${index + 1}: ${line.trim().slice(0, 100)}`);
        });
    assert.deepStrictEqual(found, []);
});

test('the world never reaches a real claude', (t) =>
{
    const world = distWorld();
    t.after(world.clean);
    assert.strictEqual(fs.existsSync(world.marker), false, 'the stub has not run yet');
    const parts = (world.env['PATH'] ?? '').split(path.delimiter);
    assert.strictEqual(parts[0], world.bin);
    for (const name of ['HOME', 'USERPROFILE', 'CLAUDE_CONFIG_DIR', 'TMPDIR', 'TEMP', 'TMP'])
        assert.ok(world.env[name]?.startsWith(world.dir), `${name} is inside the world`);
    const result = chain(world, 'mjs');
    assert.ok(fs.existsSync(world.marker), 'the stub answered');
    assert.match(result.inventory.file ?? '', new RegExp(STUB_VERSION.replace(/[().]/g, '\\$&')));
    if (process.platform === 'win32')
        for (const folder of parts.slice(1))
            for (const name of ['claude.exe', 'claude.com'])
                assert.strictEqual(fs.existsSync(path.join(folder, name)), false, `${folder} holds ${name}`);
});

test('no registration names dist/ or scripts/', () =>
{
    const root = pluginRoot();
    const hits = (what: string, text: string): string[] =>
        (PLUGIN_FOLDER.test(text) || text.includes(root) ? [`${what}: ${text.slice(0, 160)}`] : []);
    const catalog = load();
    const found: string[] = [];
    for (const row of catalog.tools)
        for (const [routeName, route] of Object.entries(row.routes ?? {}))
        {
            const launch = [...((route as { run?: string[] }).run ?? []), ...(((route as { command?: string }).command) ? [(route as { command?: string }).command as string] : [])];
            for (const part of launch) found.push(...hits(`catalog ${row.id}/${routeName}`, part));
            // a registration the plan builds for the row, on a platform the row is offered on
            if (!row.os.includes(MAC.os)) continue;
            const built = plan(inv(MAC), pickOne(row.id, { route: routeName }), opts('/Users/me'));
            assert.deepStrictEqual(built.errors, [], `${row.id}/${routeName} plans`);
            for (const step of built.steps)
                if (step.op === 'mcp-add') found.push(...hits(`plan ${row.id}/${routeName}`, JSON.stringify(step.entry)));
        }
    for (const text of stringsOf(JSON.parse(fs.readFileSync(path.join(root, 'catalog', 'fixes.json'), 'utf8'))))
        found.push(...hits('catalog/fixes.json', text));
    assert.deepStrictEqual(found, []);
});

test('the smoke expectations match the source', { skip: process.platform === 'win32' && 'the smoke runs on Linux; Windows paths need no embedded form' }, (t) =>
{
    const world = distWorld();
    t.after(world.clean);
    const fromSource = { starts: startsOf(world, (name: string) => `scripts/${name}.ts`), chain: condense(chain(world, 'ts')) };
    assert.deepStrictEqual(EXPECTED, fromSource);
});

test('the smoke runs and reports when it is started through a symlink', { skip: process.platform === 'win32' && 'a symlink needs a privilege on Windows' }, (t) =>
{
    const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dist-link-')));
    t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
    fs.symlinkSync(import.meta.dirname, path.join(scratch, 'tests'), 'dir');
    // node resolves import.meta.url to the real file but leaves argv[1] as typed: a guard that compares them
    // unresolved never starts main(), so the run prints nothing and exits 0 - it looks like a pass
    const run = spawnSync(process.execPath, [path.join(scratch, 'tests', 'dist-smoke.mjs')], {
        env: { PATH: process.env['PATH'] ?? '', TMPDIR: scratch },
        encoding: 'utf8',
    });
    assert.strictEqual(run.status, 0, run.stderr);
    assert.match(run.stdout, /^dist-smoke: /);
});
