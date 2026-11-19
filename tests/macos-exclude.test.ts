// macos-mcp's Shell tool off (spec D4): the question, the --config pair in the entry, and (Task 8) the root file, the
// root's .gitignore and the macos-config row.
import test from 'node:test';
import assert from 'node:assert';
import * as catalogLib from '../scripts/catalog/catalog.ts';
import { plan } from '../scripts/plan/plan.ts';
import { excludeQuestion } from '../scripts/plan/asks-keys.ts';
import { excludeArgAt, withExclude } from '../scripts/entries/exclude.ts';
import * as asks from '../scripts/plan/asks-all.ts';
import { MAC, inv, opts, pickOne, addStep, reg, changeOf } from './plan-helpers.ts';
import type { McpMoveStep, McpReplaceStep } from '../scripts/plan/types.ts';

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
    assert.ok(!moved.steps.some((s) => String(s.op) === 'write-exclude-file')); // the step is Task 8's: its op is not in the union yet
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
