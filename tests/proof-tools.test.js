'use strict';
// The proof harness (tests/proof/): what it masks, what it compares, and that its inputs reach every form the
// commands run.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const golden = require('./proof/golden.js');
const testNames = require('./proof/test-names.js');

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
    const os = require('node:os');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-collect-'));
    try
    {
        const norm = (t) => golden.normalise(t, { root });
        for (const [suffix, text] of [['Zz9Zz9', '{"b":2}'], ['Aa1Aa1', '{"a":1}']])
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

test('compare passes equal records and an allowed line, fails any other difference', () =>
{
    const rec = (usage, file = '{}\n') => ({ flows: [{ name: 'f', steps: [{ entry: 'plan', code: 2, stdout: '', stderr: usage, files: { '.mcp.json': file } }] }] });
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
    const ev = (type, nesting, file, name) => ({ type, data: { nesting, file: path.join(tree, file), name } });
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
    const fixtures = path.join(__dirname, 'proof', 'fixtures');
    const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
    const names = (answers) => [...Object.keys(answers.picks || {}), ...Object.values(answers.change || {}).map((c) => c.name).filter(Boolean), ...(answers.remove || []).map((r) => r.name)];
    const { registry, ctx } = await golden.openWorld();
    try
    {
        const env = ctx.env;
        const run = (name, argv) => golden.runEntry(golden.TREE, name, argv, { cwd: ctx.w.project, env });
        const inv = path.join(ctx.tmp, 'inventory.json');
        const planOf = async (file) =>
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
    const steps = golden.readFlows().flows.flatMap((f) => f.steps).filter((s) => s.entry);
    for (const line of lines)
    {
        const entry = /scripts\/([a-z-]+)\./.exec(line)[1];
        const flags = [...new Set(line.match(/--[a-z-]+/g) || [])];
        for (const flag of flags)
            assert.ok(steps.some((s) => s.entry === entry && s.argv.includes(flag)), `no flow step runs ${entry} with ${flag} (${line})`);
        const required = (line.replace(/\[[^\]]*\]/g, '').match(/--[a-z-]+/g) || []);
        assert.ok(steps.some((s) => s.entry === entry && required.every((f) => s.argv.includes(f))), `no flow step runs the form: ${line}`);
    }
});
