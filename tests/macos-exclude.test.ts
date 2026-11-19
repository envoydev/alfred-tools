// macos-mcp's Shell tool off (spec D4): the question, the --config pair in the entry, and (Task 8) the root file, the
// root's .gitignore and the macos-config row.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import * as catalogLib from '../scripts/catalog/catalog.ts';
import { plan } from '../scripts/plan/plan.ts';
import { excludeQuestion } from '../scripts/plan/asks-keys.ts';
import { excludeArgAt, withExclude } from '../scripts/entries/exclude.ts';
import * as asks from '../scripts/plan/asks-all.ts';
import * as inventory from '../scripts/inventory/inventory.ts';
import { apply } from '../scripts/apply/run.ts';
import { renderPlan } from '../scripts/plan/render.ts';
import * as rootsLib from '../scripts/roots/roots.ts';
import * as F from '../scripts/fix/fix-functions.ts';
import { detectAll, applyFixes } from '../scripts/fix/fix.ts';
import { world } from './helpers.ts';
import { MAC, inv, opts, pickOne, addStep, reg, changeOf, OLD_ROOT, usedRoots, PFILE } from './plan-helpers.ts';
import { runSteps, mcpJson } from './apply-helpers.ts';
import { reg as fixReg, ctxFor, detect, noMachine, seed, ctxOf, put, ptRoot, logged, gitInit, SERENA_OLD } from './fix-helpers.ts';
import type { ExcludeFileStep, McpMoveStep, McpReplaceStep, MoveRootFileStep } from '../scripts/plan/types.ts';
import type { Finding } from '../scripts/fix/types.ts';

const catalog = catalogLib.load();

test('macos-control: the Shell question recommends Off with no ~/.macos-mcp/config.toml, Keep with one, and at configure what it has (spec D4)', () => {
    const row = catalog.byId.get('macos-control')!;
    const context = { platform: 'darwin', project: '/work/shop', home: '/Users/me', exists: () => false };
    const fresh = excludeQuestion(row, 'local', { context })!;
    assert.deepStrictEqual([fresh.question.id, fresh.question.options.map((o) => o.label)], ['exclude-macos-control', ['Turn off the Shell tool (Recommended)', 'Keep every tool']]);
    assert.deepStrictEqual(Object.values(fresh.answers), [true, false]);
    const theirs = excludeQuestion(row, 'local', { context: { ...context, exists: (f: string) => f === '/Users/me/.macos-mcp/config.toml' } })!;
    assert.deepStrictEqual(theirs.question.options.map((o) => o.label), ['Keep every tool (Recommended)', 'Turn off the Shell tool']);
    assert.match(theirs.question.options[0]!.description, /\[tools\] exclude/);
    assert.strictEqual(excludeQuestion(catalog.byId.get('windows-control')!, 'local', { context }), null);
    const on = { command: 'uvx', args: ['--from', 'macos-mcp==0.4.7', 'macos-mcp', 'serve', '--config', '/work/shop/.alfred-tools/macos-mcp.toml'] };
    assert.strictEqual(excludeQuestion(row, 'local', { entry: on, context })!.question.options[0]!.label, 'Turn off the Shell tool (Recommended)');
    assert.strictEqual(excludeQuestion(row, 'local', { entry: { ...on, args: on.args.slice(0, -2) }, context: { ...context, exists: () => true } })!.question.options[0]!.label, 'Keep every tool (Recommended)');
    assert.strictEqual(excludeQuestion(row, 'local', { entry: { ...on, args: [...on.args.slice(0, -1), '/Users/me/mine.toml'] }, context }), null, "a --config of the user's is not asked");
    assert.strictEqual(excludeQuestion(row, 'local', { entry: { ...on, args: [...on.args.slice(0, -1), '/Users/me/configs/macos-mcp.toml'] }, context }), null, 'the same file name outside every root is the user\'s');
    const q = asks.allQuestions(inv(MAC), { rows: ['macos-control'] }, catalog, { env: {}, home: '/Users/me' });
    assert.strictEqual(q.excludes!['macos-control']!.question.id, 'exclude-macos-control');
});

test('macos-control: Off adds --config <root>/macos-mcp.toml, Keep adds none; configure adds or removes the pair, never touches a --config of the user\'s (spec D4)', () => {
    const off = addStep(plan(inv(MAC), pickOne('macos-control'), opts('/Users/me'))).entry;
    assert.deepStrictEqual(off.args!.slice(-2), ['--config', '/work/shop/.alfred-tools/macos-mcp.toml']);
    assert.ok(!addStep(plan(inv(MAC), pickOne('macos-control', { exclude: false }), opts('/Users/me'))).entry.args!.includes('--config'));
    assert.ok(!addStep(plan(inv(MAC), pickOne('macos-control'), opts('/Users/me', { exists: (f) => f === '/Users/me/.macos-mcp/config.toml' }))).entry.args!.includes('--config'), "the user's own config there: Keep");
    const r = reg('macos-desktop', 'project', off, 'macos-control', 'local');
    const keep = plan(inv(MAC, { registrations: [r] }), changeOf(r, { exclude: false }), opts('/Users/me'));
    assert.ok(!(keep.steps.find((s) => s.op === 'mcp-replace') as McpReplaceStep).entry.args!.includes('--config'));
    assert.ok(!plan(inv(MAC, { registrations: [r] }), changeOf(r, {}), opts('/Users/me')).steps.some((s) => s.op === 'mcp-replace'), 'no answer: as it is');
    const bare = reg('macos-desktop', 'project', { ...off, args: off.args!.slice(0, -2) }, 'macos-control', 'local');
    const turnOff = plan(inv(MAC, { registrations: [bare] }), changeOf(bare, { exclude: true }), opts('/Users/me'));
    assert.deepStrictEqual((turnOff.steps.find((s) => s.op === 'mcp-replace') as McpReplaceStep).entry.args!.slice(-2), ['--config', '/work/shop/.alfred-tools/macos-mcp.toml']);
    const mine = reg('macos-desktop', 'project', { ...off, args: [...off.args!.slice(0, -1), '/Users/me/mine.toml'] }, 'macos-control', 'local');
    assert.ok(!plan(inv(MAC, { registrations: [mine] }), changeOf(mine, { exclude: true }), opts('/Users/me')).steps.some((s) => s.op === 'mcp-replace'), "a --config of the user's: kept, no second one");
    // the same file name outside every root (Review Focus 2): not re-pointed by a scope move, not removed by Keep
    const sameName = reg('macos-desktop', 'project', { ...off, args: [...off.args!.slice(0, -1), '/Users/me/configs/macos-mcp.toml'] }, 'macos-control', 'local');
    assert.ok(!plan(inv(MAC, { registrations: [sameName] }), changeOf(sameName, { exclude: false }), opts('/Users/me')).steps.some((s) => s.op === 'mcp-replace'), 'Keep leaves it');
    const moved = plan(inv(MAC, { registrations: [sameName] }), changeOf(sameName, { scope: 'user' }), opts('/Users/me'));
    assert.deepStrictEqual(moved.errors, []);
    assert.deepStrictEqual((moved.steps.find((s) => s.op === 'mcp-move') as McpMoveStep).entry.args!.slice(-2), ['--config', '/Users/me/configs/macos-mcp.toml'], 'a scope move leaves it');
    assert.ok(!moved.steps.some((s) => s.op === 'write-exclude-file'), 'a file of the user\'s is not ours to write');
});

test("macos-control: a user's --config=<path> is foreign - not asked, not re-pointed, not removed, never doubled (spec D4)", () => {
    const row = catalog.byId.get('macos-control')!;
    const route = row.routes['local']!;
    const context = { platform: 'darwin', project: '/work/shop', home: '/Users/me', exists: () => false };
    const entry = { command: 'uvx', args: ['--from', 'macos-mcp==0.4.7', 'macos-mcp', 'serve', '--config=/Users/me/configs/x.toml'] };
    assert.strictEqual(excludeQuestion(row, 'local', { entry, context }), null);
    for (const on of [true, false]) assert.deepStrictEqual(withExclude(entry, route, on, 'project', context).args, entry.args, `on=${on}`);
    const mineInRoot = { ...entry, args: [...entry.args.slice(0, -1), '--config=/work/shop/.alfred-tools/macos-mcp.toml'] };
    assert.strictEqual(excludeArgAt(mineInRoot, route.excludeFile, context), -1, 'the = form is never the plugin\'s');
    const r = reg('macos-desktop', 'project', entry, 'macos-control', 'local');
    for (const exclude of [true, false])
        assert.ok(!plan(inv(MAC, { registrations: [r] }), changeOf(r, { exclude }), opts('/Users/me')).steps.some((s) => s.op === 'mcp-replace'), `change exclude=${exclude}`);
});

test('macos-control: the known-root match ignores trailing separators, and is case-blind on win32 only (spec D4)', () => {
    const excludeFile = catalog.byId.get('macos-control')!.routes['local']!.excludeFile;
    const at = (platform: string, root: string, value: string) => excludeArgAt({ command: 'uvx', args: ['serve', '--config', value] }, excludeFile, { platform, project: '/p', home: '/h', knownRoots: [root] });
    assert.strictEqual(at('darwin', '/a/root/', '/a/root/macos-mcp.toml'), 2, 'a root with a trailing slash still owns its file');
    assert.strictEqual(at('win32', 'C:\\a\\root\\', 'C:\\a\\root\\macos-mcp.toml'), 2);
    assert.strictEqual(at('win32', 'c:\\a\\root', 'C:\\A\\Root\\macos-mcp.toml'), 2, 'win32 compares without case');
    assert.strictEqual(at('win32', 'C:\\a\\root', 'C:/a/root/macos-mcp.toml'), 2, 'win32 reads both slash forms');
    assert.strictEqual(at('darwin', '/a/root', '/A/Root/macos-mcp.toml'), -1, 'posix stays case-sensitive');
    assert.strictEqual(at('darwin', '/a/root', '/a/root-other/macos-mcp.toml'), -1);
    assert.strictEqual(at('win32', 'C:\\a\\root', 'C:\\a\\root-other\\macos-mcp.toml'), -1);
});

test('write-exclude-file writes [tools] exclude once, and never over a file there (spec D4)', () => {
    const w = world();
    try
    {
        const root = path.join(w.project, '.alfred-tools');
        const file = path.join(root, 'macos-mcp.toml');
        let r = runSteps(w, [{ op: 'write-exclude-file', path: root, tools: ['Shell'], why: 'test' }]);
        assert.strictEqual(r.report.failed, null, r.text);
        assert.strictEqual(fs.readFileSync(file, 'utf8'), '[tools]\nexclude = ["Shell"]\n');
        fs.writeFileSync(file, '[tools]\nexclude = ["Shell", "App"]\n');
        r = runSteps(w, [{ op: 'write-exclude-file', path: root, tools: ['Shell'], why: 'test' }]);
        assert.strictEqual(r.report.failed, null, r.text);
        assert.match(r.text, /kept as it is/);
        assert.strictEqual(fs.readFileSync(file, 'utf8'), '[tools]\nexclude = ["Shell", "App"]\n');
    }
    finally { w.clean(); }
});

test('install macos-control with Shell off: the root file is written before the registration names it (spec D4)', { skip: process.platform !== 'darwin' && 'macos-control is offered on darwin only' }, () => {
    const w = world();
    try
    {
        const p = plan(inventory.buildInventory({ project: w.project, env: w.env }), { picks: { 'macos-control': { scope: 'project' } } }, { home: w.home, env: w.env });
        assert.deepStrictEqual(p.errors, []);
        assert.strictEqual(apply(p, { env: w.env, tmp: path.join(w.dir, 'tmp'), log: () => {} }).failed, null);
        const file = path.join(w.project, '.alfred-tools', 'macos-mcp.toml');
        assert.strictEqual(fs.readFileSync(file, 'utf8'), '[tools]\nexclude = ["Shell"]\n');
        assert.deepStrictEqual(mcpJson(w).mcpServers['macos-desktop'].args.slice(-2), ['--config', file]);
    }
    finally { w.clean(); }
});

test('macos-control install with Shell off plans the root file before the add; a file there already is not planned (spec D4)', () => {
    const p = plan(inv(MAC), pickOne('macos-control'), opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    const write = p.steps.find((s) => s.op === 'write-exclude-file') as ExcludeFileStep;
    assert.deepStrictEqual([write.path, write.tools], ['/work/shop/.alfred-tools', ['Shell']]);
    assert.ok(p.steps.indexOf(write) < p.steps.indexOf(addStep(p)));
    assert.match(renderPlan(p), /writes \/work\/shop\/\.alfred-tools\/macos-mcp\.toml/);
    assert.ok(!plan(inv(MAC), pickOne('macos-control', { exclude: false }), opts('/Users/me')).steps.some((s) => s.op === 'write-exclude-file'));
    assert.ok(!plan(inv(MAC), pickOne('macos-control'), opts('/Users/me', { exists: (f) => f === '/work/shop/.alfred-tools/macos-mcp.toml' })).steps.some((s) => s.op === 'write-exclude-file'), 'the file there is kept');
});

test('macos-control: a root change moves macos-mcp.toml and re-points --config; a Local -> Global move writes it in the global root (spec D4)', () => {
    const oldFile = `${OLD_ROOT}/macos-mcp.toml`;
    const entry = { command: 'uvx', args: ['--python', '3.13', '--exclude-newer', '2026-11-10T23:59:59Z', '--from', 'macos-mcp==0.4.7', 'macos-mcp', 'serve', '--config', oldFile], env: { ANONYMIZED_TELEMETRY: 'false' } };
    const r = reg('macos-desktop', 'local', entry, 'macos-control', 'local');
    const i = inv(MAC, { registrations: [r], roots: usedRoots(OLD_ROOT), lists: { project: { file: PFILE, servers: [], own: [] }, global: null } });
    const p = plan(i, { rootChange: ['project'], roots: { project: { id: 'named', path: 'tools' } } }, opts('/Users/me', { exists: (f) => f === oldFile }));
    assert.deepStrictEqual(p.errors, []);
    const move = p.steps.find((s) => s.op === 'move-root-file' && (s as MoveRootFileStep).from === oldFile) as MoveRootFileStep;
    assert.strictEqual(move.to, '/work/shop/tools/macos-mcp.toml');
    const replace = p.steps.find((s) => s.op === 'mcp-replace') as McpReplaceStep;
    assert.deepStrictEqual(replace.entry.args!.slice(-2), ['--config', '/work/shop/tools/macos-mcp.toml']);
    assert.ok(p.steps.indexOf(move) < p.steps.indexOf(replace));
    // Local -> Global: written in the global root by the same op, and --config names it
    const g = plan(inv(MAC, { registrations: [r] }), changeOf(r, { scope: 'user' }), opts('/Users/me'));
    assert.deepStrictEqual(g.errors, []);
    const write = g.steps.find((s) => s.op === 'write-exclude-file') as ExcludeFileStep;
    assert.deepStrictEqual([write.path, write.tools], ['/Users/me/.alfred-tools', ['Shell']]);
    const mv = g.steps.find((s) => s.op === 'mcp-move') as McpMoveStep;
    assert.deepStrictEqual(mv.entry.args!.slice(-2), ['--config', '/Users/me/.alfred-tools/macos-mcp.toml']);
    assert.ok(g.steps.indexOf(write) < g.steps.indexOf(mv));
    // a global root that holds the user's edited file: no write, the file stays
    assert.ok(!plan(inv(MAC, { registrations: [r] }), changeOf(r, { scope: 'user' }), opts('/Users/me', { exists: (f) => f === '/Users/me/.alfred-tools/macos-mcp.toml' })).steps.some((s) => s.op === 'write-exclude-file'));
});

test('macos-config: a --config naming a root\'s macos-mcp.toml that is not there is written again; one of the user\'s is not ours (spec D4)', () =>
{
    const at = (file: string) => fixReg('macos-control', { command: 'uvx', args: ['--from', 'macos-mcp==0.4.7', 'macos-mcp', 'serve', '--config', file] });
    const rootFile = '/proj/.alfred-tools/macos-mcp.toml';
    const ctx = ctxFor({ registrations: [at(rootFile)] });
    const [f] = detect(ctx).found.filter((x) => x.id === 'macos-config') as [Finding];
    assert.strictEqual(f.path, rootFile);
    assert.deepStrictEqual(F.macosConfigSteps(f, ctx), [{ op: 'write-exclude-file', path: '/proj/.alfred-tools', tools: ['Shell'], why: `${rootFile}: written again - the tools macos-mcp leaves out` }]);
    assert.deepStrictEqual(detect(ctxFor({ registrations: [at(rootFile)], machine: noMachine({ exists: (p: string) => p === rootFile }) })).found.filter((x) => x.id === 'macos-config'), [], 'the file is there');
    assert.deepStrictEqual(detect(ctxFor({ registrations: [at('/elsewhere/macos-mcp.toml')] })).found.filter((x) => x.id === 'macos-config'), [], "outside a root: the user's");
});

test('a 0.6.0 root .gitignore gains !macos-mcp.toml from fix root-ignore, so a committed --config names a file git keeps (spec D4, M3 ruling)', () =>
{
    const w = world();
    try
    {
        gitInit(w.project);
        const OLD = '*\n!.gitignore\n!mcp-headers.js\n!mcp-bridge.js\n!serena-context.yml\n';
        put(path.join(ptRoot(w), '.gitignore'), OLD);
        put(path.join(ptRoot(w), '.mcps-secrets'), '');
        put(path.join(ptRoot(w), 'macos-mcp.toml'), '[tools]\nexclude = ["Shell"]\n');
        // the root is in use through a seeded serena, as in the 0.4.x .gitignore test
        seed(w, 'serena', 'project', SERENA_OLD(path.join(ptRoot(w), 'serena')));
        assert.strictEqual(rootsLib.gitIgnores(path.join(ptRoot(w), 'macos-mcp.toml')), true, 'ignored before');
        const [f] = detectAll(ctxOf(w)).found.filter((x) => x.id === 'root-ignore') as [Finding];
        assert.ok(f && !f.blocked, JSON.stringify(f));
        assert.match(f.found, /macos-mcp\.toml/);
        const l = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['root-ignore'], { tmp: path.join(w.dir, 'tmp'), log: l.log }).failed, null, l.text());
        assert.strictEqual(fs.readFileSync(path.join(ptRoot(w), '.gitignore'), 'utf8'), `${OLD}!macos-mcp.toml\n`);
        assert.strictEqual(rootsLib.gitIgnores(path.join(ptRoot(w), 'macos-mcp.toml')), false);
        assert.strictEqual(rootsLib.gitIgnores(path.join(ptRoot(w), '.mcps-secrets')), true, 'the key file stays ignored');
        assert.deepStrictEqual(detectAll(ctxOf(w)).found.filter((x) => x.id === 'root-ignore'), []);
    }
    finally { w.clean(); }
});
