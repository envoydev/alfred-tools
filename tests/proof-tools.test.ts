// The proof harness (tests/proof/): what it masks, what it compares, and that its inputs reach every form the
// commands run.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import * as golden from './proof/golden.ts';
import * as testNames from './proof/test-names.ts';
import os from 'node:os';
import { keepWritten } from './proof/matrix-keep.ts';
import type { Flow, FlowStep } from './proof/golden.ts';


test('normalise replaces the world root, mkdtemp suffixes, ISO times and 127.0.0.1 ports', () =>
{
    assert.strictEqual(
        golden.normalise('/tmp/pt-AbC123/project 2026-11-14T01:02:03.456Z 127.0.0.1:53211', { root: '/tmp/pt-AbC123' }),
        '<ROOT>/project <TIME> 127.0.0.1:<PORT>',
    );
    assert.strictEqual(golden.normalise('/x/preferred-tools-Q1w2E3/plan.json'), '/x/preferred-tools-XXXXXX/plan.json');
});

test('normalise replaces the tree root and a tests file\'s extension', () =>
{
    const tree = path.join(path.sep, 'work', 'wt-3');
    for (const ext of ['js', 'ts'])
        assert.strictEqual(golden.normalise(path.join(tree, 'tests', `fake-mcp-server.${ext}`).split(path.sep).join('/'), { tree: tree.split(path.sep).join('/') }), '<TREE>/tests/fake-mcp-server.<EXT>');
    assert.strictEqual(golden.normalise('Error: x\n    at f (/a/b.js:1:2)\n    at g (/a/c.js:3:4)\nnext'), 'Error: x\n    at <FRAMES>\nnext');
});

test('collect keeps every file two temp folders hold under one name, in the order of their text', () =>
{
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-collect-'));
    try
    {
        const norm = (t: string) => golden.normalise(t, { root });
        for (const [suffix, text] of [['Zz9Zz9', '{"b":2}'], ['Aa1Aa1', '{"a":1}']] as [string, string][])
        {
            fs.mkdirSync(path.join(root, 'temp', `preferred-tools-${suffix}`), { recursive: true });
            fs.writeFileSync(path.join(root, 'temp', `preferred-tools-${suffix}`, 'fetch.json'), text);
        }
        assert.deepStrictEqual(golden.collect(root, norm), {
            'temp/preferred-tools-XXXXXX/fetch.json': '{"a":1}',
            'temp/preferred-tools-XXXXXX/fetch.json#2': '{"b":2}',
        });
    }
    finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('keepWritten masks what changes from run to run: a generated key, the temp folder in a case-folded rule, update- folders, the uv cache', () =>
{
    const run = (suffix: string, hex: string) =>
    {
        const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-keep-'));
        const root = path.join(base, `pt-ws-${suffix}`);
        const ci = fs.realpathSync(base).split('').map((c) => (/[a-z]/i.test(c) ? `[${c.toLowerCase()}${c.toUpperCase()}]` : c)).join('');
        fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
        fs.writeFileSync(path.join(root, '.claude', 'settings.local.json'), JSON.stringify({ deny: [`Read(/${ci}/pt-ws-${suffix}/**)`], key: `mx-${hex}` }));
        fs.mkdirSync(path.join(root, `update-${suffix.slice(0, 6)}`), { recursive: true });
        fs.writeFileSync(path.join(root, `update-${suffix.slice(0, 6)}`, 'plan.json'), '{}');
        fs.mkdirSync(path.join(root, '.cache', 'uv', 'archive-v0', suffix), { recursive: true });
        fs.writeFileSync(path.join(root, '.cache', 'uv', 'archive-v0', suffix, 'package.json'), '{}');
        const keep = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-kept-'));
        keepWritten(root, 'x', { PT_PROOF_DIR: keep });
        const out: Record<string, string> = {};
        const walk = (d: string): void => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else out[path.relative(keep, f)] = fs.readFileSync(f, 'utf8'); } };
        walk(keep);
        fs.rmSync(base, { recursive: true, force: true });
        fs.rmSync(keep, { recursive: true, force: true });
        return out;
    };
    const one = run('AbC123', '0123456789abcdef01234567');
    assert.deepStrictEqual(one, run('xYz789', 'fedcba9876543210fedcba98'));
    assert.ok(!Object.keys(one).some((f) => f.includes('.cache')), 'the uv cache is not kept');
});

test('compare passes equal records and an allowed line, fails any other difference', () =>
{
    const rec = (usage: string, file = '{}\n') => ({ flows: [{ name: 'f', steps: [{ entry: 'plan', code: 2, stdout: '', stderr: usage, files: { '.mcp.json': file } }] }] });
    const allowed = [{ entry: 'plan', from: 'plan.js', to: 'plan.ts' }];
    assert.deepStrictEqual(golden.compare(rec('usage: plan.js x'), rec('usage: plan.js x')), []);
    assert.deepStrictEqual(golden.compare(rec('usage: plan.js x'), rec('usage: plan.ts x'), allowed), []);
    assert.deepStrictEqual(golden.compare(rec('usage: plan.js x'), rec('usage: plan.ts x')), ['flow f step 1 (plan): stderr differs']);
    assert.deepStrictEqual(golden.compare(rec('u', '{}\n'), rec('u', '{ }\n')), ['flow f step 1 (plan): .mcp.json differs']);
    assert.deepStrictEqual(golden.compare(rec('u'), { flows: [{ name: 'f', steps: [{ entry: 'plan', code: 2, stdout: '', stderr: 'u', files: {} }] }] }), ['flow f step 1 (plan): .mcp.json gone']);
});

test('test names are read from the reporter\'s events, keyed by file without its extension and the name path', () =>
{
    const tree = path.join(path.sep, 'repo');
    const ev = (type: string, nesting: number, file: string, name: string) => ({ type, data: { nesting, file: path.join(tree, file), name } });
    const names = testNames.namesOf([
        ev('test:start', 0, 'tests/a.test.js', 'one'),
        ev('test:start', 0, 'tests/b.test.ts', 'group'),
        ev('test:start', 1, 'tests/b.test.ts', 'inner'),
        ev('test:pass', 1, 'tests/b.test.ts', 'inner'),
        ev('test:start', 0, 'tests/a.test.js', 'two'),
    ], tree);
    assert.deepStrictEqual(names, ['tests/a.test\tone', 'tests/a.test\ttwo', 'tests/b.test\tgroup', 'tests/b.test\tgroup > inner']);
});

test('the account file keeps only mcpServers and each project\'s mcpServers', () =>
{
    const doc = { numStartups: 3, mcpServers: { a: { url: 'u' } }, projects: { '/p': { mcpServers: { b: { command: 'c' } }, allowedTools: [] }, '/q': { history: [] } } };
    assert.deepStrictEqual(golden.accountView(doc), { mcpServers: { a: { url: 'u' } }, projects: { '/p': { mcpServers: { b: { command: 'c' } } } } });
});

test('every answers fixture plans cleanly', async () =>
{
    const fixtures = path.join(import.meta.dirname, 'proof', 'fixtures');
    const read = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8'));
    const names = (answers: { picks?: Record<string, unknown>; change?: Record<string, { name?: string }>; remove?: { name: string }[] }) => [...Object.keys(answers.picks || {}), ...Object.values(answers.change || {}).map((c) => c.name).filter(Boolean) as string[], ...(answers.remove || []).map((r) => r.name)];
    const { registry, ctx } = await golden.openWorld();
    try
    {
        const env = ctx.env;
        const run = (name: string, argv: string[]) => golden.runEntry(golden.TREE, name, argv, { cwd: ctx.w.project, env });
        const inv = path.join(ctx.tmp, 'inventory.json');
        const planOf = async (file: string) =>
        {
            assert.strictEqual((await run('inventory', ['--json', inv, '--data', ctx.data])).code, 0);
            const out = path.join(ctx.tmp, `plan-${path.basename(file)}`);
            const r = await run('plan', [inv, file, '--out', out, '--data', ctx.data]);
            assert.strictEqual(r.code, 0, `${path.basename(file)}: ${r.stdout}${r.stderr}`);
            assert.strictEqual(r.stderr, '', path.basename(file));
            const text = fs.readFileSync(out, 'utf8');
            for (const n of names(read(file))) assert.ok(text.includes(n), `${path.basename(file)}: the plan names ${n}`);
            return out;
        };
        for (const f of ['f1-answers.json', 'f2-add.json', 'f3-answers.json']) await planOf(path.join(fixtures, f));
        // a change and a removal need what flow 1 installs
        const installed = await planOf(path.join(fixtures, 'f1-answers.json'));
        assert.strictEqual((await run('apply', [installed, '--tmp', ctx.tmp, '--data', ctx.data])).code, 0);
        fs.mkdirSync(ctx.tmp, { recursive: true });
        await planOf(path.join(fixtures, 'f2-change.json'));
    }
    finally { await golden.closeWorld({ registry, ctx }); }
});

test('the flows run every script call the commands name, with each of its flags', () =>
{
    const commands = path.join(golden.TREE, 'commands');
    const lines = fs.readdirSync(commands).filter((f) => f.endsWith('.md'))
        .flatMap((f) => fs.readFileSync(path.join(commands, f), 'utf8').match(/scripts\/[a-z-]+\.[jt]s[^`\n]*/g) || [])
        .filter((l) => !l.includes('), Bash('));
    assert.ok(lines.length >= 18, `${lines.length} call forms`);
    const steps = golden.readFlows().flows.flatMap((f: Flow) => f.steps).filter((s: FlowStep) => s.entry);
    for (const line of lines)
    {
        const entry = /scripts\/([a-z-]+)\./.exec(line)![1];
        const flags = [...new Set(line.match(/--[a-z-]+/g) || [])];
        for (const flag of flags)
            assert.ok(steps.some((s: FlowStep) => s.entry === entry && s.argv!.includes(flag)), `no flow step runs ${entry} with ${flag} (${line})`);
        const required = (line.replace(/\[[^\]]*\]/g, '').match(/--[a-z-]+/g) || []);
        assert.ok(steps.some((s: FlowStep) => s.entry === entry && required.every((f) => s.argv!.includes(f))), `no flow step runs the form: ${line}`);
    }
});
