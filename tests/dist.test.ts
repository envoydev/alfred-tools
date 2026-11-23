// dist/: the committed bundles equal a fresh build, start like their source and give its output, and a registration
// never points into the plugin's own folders. Every run happens in tests/dist-world.mjs's throwaway world.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
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
