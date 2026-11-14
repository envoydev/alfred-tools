// client-drift and cursor-file (spec D9, 0.5.0): a list entry whose copy in Claude Code or Cursor was edited or removed
// by hand, asked per entry - never in 'Apply all found' - and a Cursor file preferred-tools cannot read, as advice.
// Every case runs against the fake claude in a throwaway world.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { world, readJson, writeJson } from './helpers.ts';
import * as inventory from '../scripts/inventory/inventory.ts';
import { makeCtx, detectAll, applyFixes, questions } from '../scripts/fix/fix.ts';
import * as cli from '../scripts/core/claude-cli.ts';
import { plan } from '../scripts/plan/plan.ts';
import { apply } from '../scripts/apply/run.ts';
import { accountFile } from '../scripts/core/account.ts';
import type { Answers } from '../scripts/plan/types.ts';
import type { DriftQuestion, Finding, MachineProbe } from '../scripts/fix/types.ts';
import type { ServerEntry } from '../scripts/core/types.ts';
import type { World } from './types.ts';

const noMachine = (): MachineProbe => ({ exists: () => false, realpath: () => null, which: () => null, run: () => ({ status: 1, stdout: '', stderr: '' }), nodeVersion: '24.0.0' });

function installIn(w: World, project: string, answers: Answers)
{
    const p = plan(inventory.buildInventory({ project, env: w.env }), { clients: ['claude', 'cursor'], ...answers }, { home: w.home, env: w.env });
    assert.deepStrictEqual(p.errors, []);
    assert.strictEqual(apply(p, { env: w.env, tmp: path.join(w.dir, 'tmp'), log: () => {} }).failed, null);
}
const install = (w: World, answers: Answers) => installIn(w, w.project, answers);
const ctxOf = (w: World, project = w.project) => makeCtx({ inventory: inventory.buildInventory({ project, env: w.env }), env: w.env, machine: noMachine() });
const drifts = (w: World, project?: string) => detectAll(ctxOf(w, project), { only: 'client-drift' }).found;
function run(w: World, ids: string[], input: Record<string, string> = {}, project = w.project)
{
    const lines: string[] = [];
    const res = applyFixes(ctxOf(w, project), ids, { tmp: path.join(w.dir, 'tmp'), log: (...a) => lines.push(a.join(' ')), input });
    return { res, text: lines.join('\n') };
}
const listFile = (w: World) => path.join(w.project, '.preferred-tools', 'mcps.json');
const globalList = (w: World) => path.join(w.home, '.preferred-tools', 'mcps.json');
const cursorFile = (w: World, dir = w.project) => path.join(dir, '.cursor', 'mcp.json');
const globalCursor = (w: World) => path.join(w.home, '.cursor', 'mcp.json');
const entryOf = (file: string, name: string) => readJson(file).servers.find((x: { name: string }) => x.name === name);
const copyOf = (file: string, name: string) => readJson(file).mcpServers[name];
const localReg = (w: World, name: string) => inventory.buildInventory({ project: w.project, env: w.env }).registrations.find((r) => r.name === name && r.scope === 'local')!;
function reAdd(w: World, name: string, entry: ServerEntry, scope = 'local')
{
    cli.runClaude(['mcp', 'remove', name, '-s', scope], { cwd: w.project, env: w.env });
    assert.strictEqual(cli.runClaude(['mcp', 'add-json', name, JSON.stringify(entry), '-s', scope], { cwd: w.project, env: w.env }).status, 0);
}
// a Cursor copy as the tests edit it
type Copy = { args: string[]; env: Record<string, string> & { SENTRY_ACCESS_TOKEN?: string; MINE?: string }; headers: Record<string, string> };
function editCursor(file: string, name: string, change: ((copy: Copy) => unknown) | null)
{
    const doc = readJson(file);
    if (change === null) delete doc.mcpServers[name];
    else change(doc.mcpServers[name]);
    writeJson(file, doc);
}
const shape = (f: Finding) => [f.app, f.change, f.keyGuard, f.rowGone, f.inherited];
const driftQs = (w: World, project?: string) => questions(detectAll(ctxOf(w, project))).drift.flat();
const labels = (q: DriftQuestion) => q.options.map((o) => o.label);

test('fixes/lists.js loads before plan-lists.js and both export every function', () =>
{
    const scripts = path.join(import.meta.dirname, '..', 'scripts');
    for (const order of [['fix/lists.ts', 'plan/lists.ts', 'plan/cursor-steps.ts', 'plan/repair-tail.ts'], ['plan/repair-tail.ts', 'plan/cursor-steps.ts', 'plan/lists.ts', 'fix/lists.ts']])
    {
        const urls = order.map((f) => pathToFileURL(path.join(scripts, f)).href);
        const code = `const out = []; for (const u of ${JSON.stringify(urls)}) out.push(await import(u)); const bad = out.flatMap((m, i) => Object.entries(m).filter(([, v]) => v === undefined).map(([k]) => ${JSON.stringify(order)}[i] + ':' + k)); if (bad.length) { console.log(bad.join(',')); process.exit(1); }`;
        const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
        assert.strictEqual(r.status, 0, `${order.join(' then ')}: ${r.stdout}${r.stderr}`);
    }
});

test('drift: Keep the change takes the edited entry into the list and the other app', () =>
{
    const w = world();
    try
    {
        install(w, { picks: { serena: { scope: 'local' } } });
        const e = localReg(w, 'serena').entry;
        reAdd(w, 'serena', { ...e, args: [...e.args!, '--mine'] });
        const found = drifts(w);
        assert.deepStrictEqual(found.map(shape), [['claude', 'differs', false, false, null]]);
        const [q] = driftQs(w) as [DriftQuestion];
        assert.strictEqual(q.id, 'drift-claude-serena~local');
        assert.strictEqual(q.question, 'serena in Claude Code differs from the plugin\'s list. Which should stay?');
        assert.deepStrictEqual(labels(q), ['Keep the change in Claude Code (Recommended)', 'Restore from the list']);
        const r = run(w, ['none'], { 'drift:claude:serena~local': 'keep' });
        assert.strictEqual(r.res.failed, null, r.text);
        assert.ok(entryOf(listFile(w), 'serena').entry.args.includes('--mine'), 'the list takes Claude Code\'s copy');
        assert.ok(copyOf(cursorFile(w), 'serena').args.includes('--mine'), 'and Cursor takes the list');
        assert.deepStrictEqual(drifts(w), []);
    }
    finally { w.clean(); }
});

test('drift: Restore from the list gives the app the list\'s entry back', () =>
{
    const w = world();
    try
    {
        install(w, { picks: { serena: { scope: 'local' } } });
        const claudeBefore = JSON.stringify(localReg(w, 'serena').entry);
        editCursor(cursorFile(w), 'serena', (s) => s.args.push('--extra'));
        assert.deepStrictEqual(drifts(w).map(shape), [['cursor', 'differs', false, false, null]]);
        const r = run(w, ['none'], { 'drift:cursor:serena~local': 'restore' });
        assert.strictEqual(r.res.failed, null, r.text);
        assert.deepStrictEqual(copyOf(cursorFile(w), 'serena'), entryOf(listFile(w), 'serena').entry);
        assert.strictEqual(JSON.stringify(localReg(w, 'serena').entry), claudeBefore, 'Claude Code is not touched');
        assert.deepStrictEqual(drifts(w), []);
    }
    finally { w.clean(); }
});

test('a stdio keyed route at global scope picked for Cursor is not drift', () =>
{
    const w = world();
    try
    {
        const root = path.join(w.home, '.preferred-tools');
        fs.mkdirSync(root, { recursive: true });
        fs.writeFileSync(path.join(root, '.mcps-secrets'), `SENTRY_ACCESS_TOKEN=sntryu_${'0a'.repeat(16)}\n`);
        install(w, { picks: { sentry: { route: 'local', scope: 'user', token: true } } });
        assert.deepStrictEqual(entryOf(globalList(w), 'sentry').clients, ['claude', 'cursor']);
        assert.deepStrictEqual(drifts(w), []);
    }
    finally { w.clean(); }
});

// A 0.2.x/0.3.x key: the value lives in ~/.claude.json's registration, and the global root's .mcps-secrets holds only
// the name (the old key files are read for names only). Cursor's copy is filled from the registration as read.
function keyInRegistrationOnly(w: World)
{
    const root = path.join(w.home, '.preferred-tools');
    fs.mkdirSync(root, { recursive: true });
    const value = `sntryu_${'0b'.repeat(16)}`;
    fs.writeFileSync(path.join(root, '.mcps-secrets'), `SENTRY_ACCESS_TOKEN=${value}\n`);
    install(w, { picks: { sentry: { route: 'local', scope: 'user', token: true } } });
    fs.writeFileSync(path.join(root, '.mcps-secrets'), 'SENTRY_ACCESS_TOKEN=\n');
    return value;
}
const sentryKey = (e: { env: Record<string, string> & { SENTRY_ACCESS_TOKEN?: string } }) => e.env.SENTRY_ACCESS_TOKEN;

test('a stdio keyed copy restored in Cursor takes the value from the registration when the key files lack it', () =>
{
    const w = world();
    try
    {
        const value = keyInRegistrationOnly(w);
        editCursor(globalCursor(w), 'sentry', null);
        const r = run(w, ['none'], { 'drift:cursor:sentry~user': 'restore' });
        assert.strictEqual(r.res.failed, null, r.text);
        assert.strictEqual(sentryKey(copyOf(globalCursor(w), 'sentry')), value, 'the registration\'s value, not an empty one');
        assert.ok(!r.text.includes(value), 'no key printed');
        assert.deepStrictEqual(drifts(w), []);
    }
    finally { w.clean(); }
});

test('a Cursor copy whose key field is empty where the list holds the key offers Restore and Leave, never Keep', () =>
{
    const w = world();
    try
    {
        const value = keyInRegistrationOnly(w);
        editCursor(globalCursor(w), 'sentry', (e) => { e.env.SENTRY_ACCESS_TOKEN = ''; });
        const found = drifts(w);
        assert.deepStrictEqual(found.map((f) => [f.app, f.change, f.keyEmpty]), [['cursor', 'differs', true]]);
        const [q] = driftQs(w) as [DriftQuestion];
        assert.deepStrictEqual(labels(q), ['Restore from the list (Recommended)', 'Leave Cursor\'s copy as it is']);
        const keep = run(w, ['none'], { 'drift:cursor:sentry~user': 'keep' });
        assert.match(keep.text, /its key field is empty, so Keep is not offered - answer restore or leave/);
        assert.strictEqual(sentryKey(readJson(accountFile(w.env)).mcpServers.sentry), value, 'Claude Code keeps its key');
        const r = run(w, ['none'], { 'drift:cursor:sentry~user': 'restore' });
        assert.strictEqual(r.res.failed, null, r.text);
        assert.strictEqual(sentryKey(copyOf(globalCursor(w), 'sentry')), value);
    }
    finally { w.clean(); }
});

test('a kept edit that fails the fingerprint leaves the list', () =>
{
    const w = world();
    try
    {
        install(w, { picks: { serena: { scope: 'local' } } });
        const mine = { command: 'node', args: ['mine.js'] };
        reAdd(w, 'serena', mine);
        assert.deepStrictEqual(drifts(w).map(shape), [['claude', 'differs', false, true, null]]);
        const [q] = driftQs(w) as [DriftQuestion];
        assert.deepStrictEqual(labels(q), ['Keep the change in Claude Code (Recommended)', 'Restore from the list']);
        assert.strictEqual(q.options[0]!.description, 'the list lets go of it - it is no longer the plugin\'s server');
        const r = run(w, ['none'], { 'drift:claude:serena~local': 'keep' });
        assert.strictEqual(r.res.failed, null, r.text);
        assert.ok(!fs.existsSync(listFile(w)) || !entryOf(listFile(w), 'serena'), 'serena leaves the list');
        assert.deepStrictEqual(localReg(w, 'serena').entry, mine, 'the registration is the user\'s own, untouched');
    }
    finally { w.clean(); }
});

// every file under a folder, for the search below
const filesUnder = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((d) => d.isFile()).map((d) => path.join(d.parentPath || d.path, d.name)) : []);

test('a token pasted into a hosted entry\'s headers in .cursor/mcp.json offers no Keep, and no file but Cursor\'s holds it afterwards', () =>
{
    const w = world();
    try
    {
        install(w, { picks: { context7: { route: 'remote', scope: 'user', token: false } } });
        const token = `ctx7sk-${'0f'.repeat(12)}`;
        editCursor(globalCursor(w), 'context7', (s) => { s.headers = { Authorization: `Bearer ${token}` }; });
        assert.deepStrictEqual(drifts(w).map(shape), [['cursor', 'differs', true, false, null]]);
        const [q] = driftQs(w) as [DriftQuestion];
        assert.deepStrictEqual(labels(q), ['Restore from the list (Recommended)', 'Leave Cursor\'s copy as it is']);
        // a Keep passed anyway is refused, and Leave writes nothing
        const k = run(w, ['none'], { 'drift:cursor:context7~user': 'keep' });
        assert.match(k.text, /skipped client-drift on context7 \(user\): .*key/);
        const l = run(w, ['none'], { 'drift:cursor:context7~user': 'leave' });
        assert.strictEqual(l.res.failed, null, l.text);
        const holders = [...filesUnder(w.home), ...filesUnder(w.account), ...filesUnder(w.project), ...filesUnder(path.join(w.dir, 'tmp'))]
            .filter((f) => fs.readFileSync(f, 'utf8').includes(token));
        assert.deepStrictEqual(holders, [globalCursor(w)], 'only Cursor\'s file holds the pasted token');
        assert.ok(!`${k.text}${l.text}`.includes(token), 'nothing printed holds it');
        const r = run(w, ['none'], { 'drift:cursor:context7~user': 'restore' });
        assert.strictEqual(r.res.failed, null, r.text);
        assert.ok(!fs.readFileSync(globalCursor(w), 'utf8').includes(token), 'Restore takes it out of Cursor too');
    }
    finally { w.clean(); }
});

test('a missing copy asks drift-missing, and its recommended answer takes the app off the entry', () =>
{
    const w = world();
    try
    {
        install(w, { picks: { serena: { scope: 'local' } } });
        editCursor(cursorFile(w), 'serena', null);
        assert.deepStrictEqual(drifts(w).map(shape), [['cursor', 'missing', false, false, null]]);
        const [q] = driftQs(w) as [DriftQuestion];
        assert.strictEqual(q.question, 'serena is on the plugin\'s list for Cursor but Cursor no longer has it. What should happen?');
        assert.deepStrictEqual(labels(q), ['Take Cursor off its list entry (Recommended)', 'Restore from the list']);
        const r = run(w, ['none'], { 'drift:cursor:serena~local': 'drop' });
        assert.strictEqual(r.res.failed, null, r.text);
        assert.deepStrictEqual(entryOf(listFile(w), 'serena').clients, ['claude']);
        assert.ok(!Object.hasOwn(readJson(cursorFile(w)).mcpServers, 'serena'));
        assert.deepStrictEqual(drifts(w), []);
    }
    finally { w.clean(); }
});

test('Apply all found applies list-import and serena-base-modes and leaves every drift entry to its own question', () =>
{
    const w = world();
    try
    {
        install(w, { picks: { serena: { scope: 'local' } } });
        // a managed server not on the list yet, serena's base modes set, and serena edited in Cursor
        assert.strictEqual(cli.runClaude(['mcp', 'add-json', 'memory', JSON.stringify({ command: 'uvx', args: ['--python', '3.13', '--from', 'mcp-memory-service[sqlite]==12.1.1', 'memory', 'server'], env: { MCP_MEMORY_SQLITE_PATH: path.join(w.project, '.preferred-tools', 'memory', 'memory.db') } }), '-s', 'local'], { cwd: w.project, env: w.env }).status, 0);
        const home = localReg(w, 'serena').entry.env!.SERENA_HOME!;
        fs.mkdirSync(home, { recursive: true });
        fs.writeFileSync(path.join(home, 'serena_config.yml'), 'base_modes:\n  - interactive\n  - editing\n');
        editCursor(cursorFile(w), 'serena', (s) => s.args.push('--extra'));
        const d = detectAll(ctxOf(w));
        const q = questions(d);
        assert.ok(!JSON.stringify(q.choose).includes('client-drift') && !JSON.stringify(q.pick).includes('client-drift'), 'drift is in neither the choice nor the pick');
        assert.deepStrictEqual(q.drift.flat().map((x) => x.id), ['drift-cursor-serena~local']);
        const r = run(w, ['all']);
        assert.strictEqual(r.res.failed, null, r.text);
        assert.ok(entryOf(listFile(w), 'memory'), 'list-import applied');
        assert.match(fs.readFileSync(path.join(home, 'serena_config.yml'), 'utf8'), /^base_modes: \[\]$/m, 'serena-base-modes applied');
        assert.ok(copyOf(cursorFile(w), 'serena').args.includes('--extra'), 'the drifted copy is left to its question');
        assert.match(r.text, /skipped client-drift on serena \(local\): needs --input drift:cursor:serena~local=<answer>/);
    }
    finally { w.clean(); }
});

test('a drift entry with no --input drift: answer is skipped and reported', () =>
{
    const w = world();
    try
    {
        install(w, { picks: { serena: { scope: 'local' } } });
        editCursor(cursorFile(w), 'serena', (s) => s.args.push('--extra'));
        const before = fs.readFileSync(cursorFile(w), 'utf8');
        const r = run(w, ['client-drift']);
        assert.strictEqual(r.res.failed, null, r.text);
        assert.match(r.text, /skipped client-drift on serena \(local\): needs --input drift:cursor:serena~local=<answer>/);
        assert.strictEqual(fs.readFileSync(cursorFile(w), 'utf8'), before);
    }
    finally { w.clean(); }
});

test('both apps drifted: Claude Code\'s question first, its Keep skips Cursor\'s, each answer keyed drift:<app>:', () =>
{
    const w = world();
    try
    {
        install(w, { picks: { serena: { scope: 'local' } } });
        const e = localReg(w, 'serena').entry;
        reAdd(w, 'serena', { ...e, args: [...e.args!, '--mine'] });
        editCursor(cursorFile(w), 'serena', (s) => s.args.push('--extra'));
        const qs = driftQs(w);
        assert.deepStrictEqual(qs.map((x) => x.id), ['drift-claude-serena~local', 'drift-cursor-serena~local']);
        assert.deepStrictEqual(qs[1]!.askAfter, { id: 'drift-claude-serena~local', answers: ['restore', 'leave'] }, 'Cursor\'s is put only after a Restore or Leave in Claude Code');
        const r = run(w, ['none'], { 'drift:claude:serena~local': 'keep', 'drift:cursor:serena~local': 'restore' });
        assert.strictEqual(r.res.failed, null, r.text);
        const copy = copyOf(cursorFile(w), 'serena');
        assert.ok(copy.args.includes('--mine') && !copy.args.includes('--extra'), 'Cursor takes Claude Code\'s kept copy through the list');
        assert.match(r.text, /client-drift on serena \(local\): Cursor's answer is not used - Claude Code's copy was kept, and Cursor takes it/);
        assert.deepStrictEqual(drifts(w), []);
    }
    finally { w.clean(); }
});

test('Keep the change in Cursor on a one-form entry ends with an mcp-replace', () =>
{
    const w = world();
    try
    {
        install(w, { picks: { serena: { scope: 'local' } } });
        editCursor(cursorFile(w), 'serena', (s) => s.args.push('--extra'));
        const calls = w.calls().length;
        const r = run(w, ['none'], { 'drift:cursor:serena~local': 'keep' });
        assert.strictEqual(r.res.failed, null, r.text);
        const writes = w.calls().slice(calls).filter((a) => a[0] === 'mcp' && ['add-json', 'remove'].includes(a[1])).map((a) => [a[1], a[2]]);
        assert.deepStrictEqual(writes, [['remove', 'serena'], ['add-json', 'serena']], 'Claude Code takes Cursor\'s copy');
        assert.ok(localReg(w, 'serena').entry.args!.includes('--extra'));
        assert.ok(entryOf(listFile(w), 'serena').entry.args.includes('--extra'));
        assert.deepStrictEqual(drifts(w), []);
    }
    finally { w.clean(); }
});

test('two-form: Keep in Cursor changes cursorEntry only; Keep in Claude Code rebuilds it', () =>
{
    const w = world();
    try
    {
        install(w, { picks: { context7: { route: 'remote', scope: 'user', token: true } } });
        const listed = entryOf(globalList(w), 'context7');
        assert.ok(listed.cursorEntry, 'two forms');
        // Cursor's bridge copy edited: only cursorEntry moves, and Claude Code is not called
        editCursor(globalCursor(w), 'context7', (s) => { s.env.MINE = '1'; });
        assert.deepStrictEqual(drifts(w).map(shape), [['cursor', 'differs', false, false, null]]);
        const calls = w.calls().length;
        const r = run(w, ['none'], { 'drift:cursor:context7~user': 'keep' });
        assert.strictEqual(r.res.failed, null, r.text);
        const after = entryOf(globalList(w), 'context7');
        assert.strictEqual(after.cursorEntry.env.MINE, '1');
        assert.deepStrictEqual(after.entry, listed.entry, 'entry unchanged');
        assert.strictEqual(w.calls().slice(calls).filter((a) => a[0] === 'mcp' && ['add-json', 'remove'].includes(a[1])).length, 0);
        // Claude Code's helper entry edited: entry moves, and cursorEntry is built again from it with its pin and pairs kept
        const reg = inventory.buildInventory({ project: w.project, env: w.env }).registrations.find((x) => x.name === 'context7');
        reAdd(w, 'context7', { ...reg!.entry, timeout: 60000 }, 'user');
        assert.deepStrictEqual(drifts(w).map(shape), [['claude', 'differs', false, false, null]]);
        const r2 = run(w, ['none'], { 'drift:claude:context7~user': 'keep' });
        assert.strictEqual(r2.res.failed, null, r2.text);
        const last = entryOf(globalList(w), 'context7');
        assert.strictEqual(last.entry.timeout, 60000);
        assert.strictEqual(last.cursorEntry.env.MINE, '1', 'the bridge keeps the pair kept in Cursor');
        assert.deepStrictEqual(copyOf(globalCursor(w), 'context7'), last.cursorEntry);
        assert.deepStrictEqual(drifts(w), []);
    }
    finally { w.clean(); }
});

test('an inherited drifted copy asks Restore from <folder> or Leave, and Leave asks again next run', () =>
{
    const w = world();
    try
    {
        const rec = (dir: string, doc: unknown) => { fs.mkdirSync(path.join(dir, '.alfred'), { recursive: true }); fs.writeFileSync(path.join(dir, '.alfred', 'workspace.json'), JSON.stringify(doc)); };
        const member = path.join(w.project, 'b');
        fs.mkdirSync(member);
        rec(w.project, { role: 'root', children: ['b'] });
        rec(member, { parent: '..' });
        install(w, { picks: { memory: { scope: 'project' } } });
        assert.ok(copyOf(cursorFile(w, member), 'memory'), 'the member got the root\'s project server');
        editCursor(cursorFile(w, member), 'memory', (s) => s.args.push('--extra'));
        assert.deepStrictEqual(drifts(w, member).map(shape), [['cursor', 'differs', false, false, w.project]]);
        const [q] = driftQs(w, member) as [DriftQuestion];
        assert.deepStrictEqual(labels(q), [`Restore from ${w.project} (Recommended)`, 'Leave it as it is']);
        const l = run(w, ['none'], { 'drift:cursor:memory~project': 'leave' }, member);
        assert.strictEqual(l.res.failed, null, l.text);
        assert.ok(copyOf(cursorFile(w, member), 'memory').args.includes('--extra'));
        assert.strictEqual(drifts(w, member).length, 1, 'Leave is not recorded: the next run asks again');
        const r = run(w, ['none'], { 'drift:cursor:memory~project': 'restore' }, member);
        assert.strictEqual(r.res.failed, null, r.text);
        assert.ok(!copyOf(cursorFile(w, member), 'memory').args.includes('--extra'));
        assert.deepStrictEqual(drifts(w, member), []);
    }
    finally { w.clean(); }
});

test('cursor-file names a symlinked or non-JSON .cursor/mcp.json as advice only', () =>
{
    const w = world();
    try
    {
        fs.mkdirSync(path.dirname(cursorFile(w)), { recursive: true });
        fs.writeFileSync(cursorFile(w), '{ // mine\n  "mcpServers": {}\n}\n');
        const found = () => detectAll(ctxOf(w), { only: 'cursor-file' }).found;
        const [f] = found() as [Finding];
        assert.strictEqual(f.name, cursorFile(w));
        assert.match(f.found, /is not JSON \(Cursor reads comments and trailing commas, preferred-tools does not\) - remove them/);
        assert.strictEqual(f.blocked, 'advice only - nothing here is applied');
        assert.strictEqual(questions(detectAll(ctxOf(w), { only: 'cursor-file' })).choose, null, 'never offered');
        if (process.platform !== 'win32')
        {
            const real = path.join(w.dir, 'elsewhere.json');
            fs.writeFileSync(real, '{ "mcpServers": {} }\n');
            fs.mkdirSync(path.dirname(globalCursor(w)), { recursive: true });
            fs.symlinkSync(real, globalCursor(w));
            assert.ok(found().some((x) => x.name === globalCursor(w) && /is a symbolic link/.test(x.found)));
        }
    }
    finally { w.clean(); }
});
