// The key-name readers over a stdio key launcher (`node <root>/mcp-bridge.js --run <ENV>=<KEY_NAME>[?] [<global root>] --
// <command> <args>`): configure, the list and a root change keep the key name the launcher holds, and read no key value.
import test from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { load } from '../scripts/catalog/catalog.ts';
import { currentOf, launcherPlace } from '../scripts/entries/entry.ts';
import { launcherForm, launcherParts } from '../scripts/entries/launcher.ts';
import { heldKey } from '../scripts/plan/asks-keys.ts';
import { fromRegistration } from '../scripts/mcps-list/mcps-list.ts';
import { plan } from '../scripts/plan/plan.ts';
import { renderPlan } from '../scripts/plan/render.ts';
import * as asks from '../scripts/plan/asks-all.ts';
import { MAC, POSIX_FIXTURE, inv, opts, reg, changeOf, usedRoots } from './plan-helpers.ts';
import type { ServerEntry } from '../scripts/core/types.ts';
import type { EnsureKeyNameStep, McpAddStep, McpReplaceStep, Plan } from '../scripts/plan/types.ts';

const PROJECT_ROOT = '/work/shop/.alfred-tools';
const GLOBAL_ROOT = '/Users/me/.alfred-tools';
const TOKEN_VAR = 'GITHUB_PERSONAL_ACCESS_TOKEN';
const KEY_NAME = 'ACME_GITHUB_TOKEN';
const DOCKER_ARGS = ['run', '-i', '--rm', '-e', TOKEN_VAR, 'ghcr.io/github/github-mcp-server:v2.1.0', 'stdio'];
const place = launcherPlace('local', { platform: 'darwin', project: '/work/shop', home: '/Users/me', roots: { project: PROJECT_ROOT, global: GLOBAL_ROOT } });
const launched = (pair: string, command: string, args: string[]): ServerEntry => ({ command: 'node', args: [place.bridgePath, '--run', pair, ...(place.globalRoot ? [place.globalRoot] : []), '--', command, ...args], env: {} });
const LAUNCHER = launched(`${TOKEN_VAR}=${KEY_NAME}`, 'docker', DOCKER_ARGS);
const C7_LAUNCHER = launched('CONTEXT7_API_KEY=CONTEXT7_API_KEY?', 'npx', ['-y', '@upstash/context7-mcp@4.7.0']);
const catalog = load();
const row = (id: string) => catalog.byId.get(id)!;
const githubLauncher = () => reg('gh', 'local', LAUNCHER, 'github', 'local');
const stepsOf = <Op extends Plan['steps'][number]['op']>(p: Plan, op: Op) => p.steps.filter((step): step is Extract<Plan['steps'][number], { op: Op }> => step.op === op);

test('the fixture is a launcher whose name is not the route\'s own', () =>
{
    assert.strictEqual(launcherParts(LAUNCHER)?.keyName, KEY_NAME);
    assert.strictEqual(launcherParts(LAUNCHER)?.globalRoot, GLOBAL_ROOT);
});

test('currentOf of a launcher gives token true and its key name', () =>
{
    const current = currentOf(row('context7'), reg('c7', 'local', C7_LAUNCHER, 'context7', 'local'));
    assert.strictEqual(current.token, true);
    assert.strictEqual(current.keyName, 'CONTEXT7_API_KEY');
    const github = currentOf(row('github'), githubLauncher());
    assert.deepStrictEqual([github.token, github.keyName], [true, KEY_NAME]);
});

test('heldKey reads no key from a launcher', () =>
{
    assert.strictEqual(heldKey(LAUNCHER, row('github').routes.local ?? null), null);
});

test('the list\'s key is the launcher\'s key name', () =>
{
    const item = fromRegistration(githubLauncher(), row('github'), ['claude']);
    assert.strictEqual(item.key, KEY_NAME);
    assert.deepStrictEqual(item.entry, LAUNCHER, 'the entry has no kept marker: it holds no key value');
    assert.strictEqual(fromRegistration(reg('c7', 'local', C7_LAUNCHER, 'context7', 'local'), row('context7'), ['claude']).key, 'CONTEXT7_API_KEY');
});

test('configure keeps a launcher\'s own key name with no key-name answer', { skip: POSIX_FIXTURE }, () =>
{
    const target = githubLauncher();
    const inventory = inv(MAC, { registrations: [target], roots: usedRoots(PROJECT_ROOT, GLOBAL_ROOT) });
    // the key-name question recommends the launcher's own name, so taking the recommended option keeps it
    const asked = asks.allQuestions(inventory, { targets: ['mcp:gh~local'] }, catalog, { home: '/Users/me' }).keyNames?.['mcp:gh~local'];
    assert.ok(asked, 'a launcher\'s key name is asked');
    const [first] = asked.question.options;
    assert.strictEqual(first?.label, `${KEY_NAME} (Recommended)`);
    assert.strictEqual(asked.answers[first?.label ?? ''], KEY_NAME);
    const p = plan(inventory, changeOf(target, { name: 'gh2' }), opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    const [step] = p.steps.filter((candidate) => candidate.op === 'mcp-add' || candidate.op === 'mcp-replace' || candidate.op === 'mcp-move') as McpAddStep[];
    assert.ok(step, 'the change is planned');
    assert.ok((step.entry.args ?? []).includes(`${TOKEN_VAR}=${KEY_NAME}`), `the step's pair keeps the name: ${(step.entry.args ?? []).join(' ')}`);
    for (const keyStep of stepsOf(p, 'ensure-key-name') as EnsureKeyNameStep[]) assert.ok(!keyStep.names.includes(TOKEN_VAR), 'the route\'s own name is not put back');
});

test('a project root change keeps the key name of a launcher in it', { skip: POSIX_FIXTURE }, () =>
{
    const p = plan(inv(MAC, { registrations: [githubLauncher()], roots: usedRoots(PROJECT_ROOT, GLOBAL_ROOT) }), { rootChange: ['project'], roots: { project: { id: 'named', path: 'tools' } } }, opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    const names = (stepsOf(p, 'ensure-key-name') as EnsureKeyNameStep[]).map((step) => [step.file, step.names]);
    assert.deepStrictEqual(names, [['/work/shop/tools/.mcps-secrets', [KEY_NAME]]]);
    assert.ok(p.notes.includes(`copy the values from ${PROJECT_ROOT}/.mcps-secrets to /work/shop/tools/.mcps-secrets yourself - until then those servers connect without their keys`), p.notes.join('\n'));
});

// Where the launcher's args put its root slot: the one after the pair, before `--`.
const slotOf = (entry: ServerEntry): string | null => launcherParts(entry)?.globalRoot ?? null;
const replacedOf = (p: Plan, name: string): McpReplaceStep | undefined => stepsOf(p, 'mcp-replace').find((step) => step.name === name);

test('a global root change re-plans a Local launcher that names it, standard root or not', { skip: POSIX_FIXTURE }, () =>
{
    const standard = plan(inv(MAC, { registrations: [githubLauncher()], roots: usedRoots(PROJECT_ROOT, GLOBAL_ROOT) }), { rootChange: ['global'], roots: { global: { id: 'named', path: '/Users/me/keys' } } }, opts('/Users/me'));
    assert.deepStrictEqual(standard.errors, []);
    const step = replacedOf(standard, 'gh');
    assert.ok(step, 'a launcher naming the standard old root is re-planned as an mcp-replace');
    assert.strictEqual(slotOf(step.entry), '/Users/me/keys', 'the new global root is in the launcher\'s root slot');
    assert.strictEqual(launcherParts(step.entry)?.keyName, KEY_NAME, 'its key name is kept');
    assert.strictEqual(launcherParts(step.entry)?.path, PROJECT_ROOT + '/mcp-bridge.js');
    assert.deepStrictEqual(launcherParts(step.entry)?.inner, launcherParts(LAUNCHER)?.inner, 'nothing after -- changes');
    assert.match(standard.notes.join('\n'), /a local server in another project whose (helper or )?launcher names \/Users\/me\/\.alfred-tools keeps reading its \.mcps-secrets until \/alfred-tools:configure runs there/);
    // a named old root
    const named = githubLauncher();
    named.entry = { ...LAUNCHER, args: (LAUNCHER.args ?? []).map((argument) => (argument === GLOBAL_ROOT ? '/Users/me/keys' : argument)) };
    const moved = plan(inv(MAC, { registrations: [named], roots: usedRoots(PROJECT_ROOT, '/Users/me/keys') }), { rootChange: ['global'], roots: { global: { id: 'named', path: '/Users/me/vault' } } }, opts('/Users/me'));
    assert.deepStrictEqual(moved.errors, []);
    assert.strictEqual(slotOf(replacedOf(moved, 'gh')?.entry ?? {}), '/Users/me/vault', 'a launcher naming a named old root is re-planned');
    // a launcher that names another global root is left alone
    const elsewhere = plan(inv(MAC, { registrations: [named], roots: usedRoots(PROJECT_ROOT, GLOBAL_ROOT) }), { rootChange: ['global'], roots: { global: { id: 'named', path: '/Users/me/vault' } } }, opts('/Users/me'));
    assert.strictEqual(replacedOf(elsewhere, 'gh'), undefined, 'a launcher that names another root is not');
});

const planOf = (inventory: ReturnType<typeof inv>, answers: Parameters<typeof plan>[1]): Plan => plan(inventory, answers, opts('/Users/me'));
const both = () => inv(MAC, { registrations: [githubLauncher()], roots: usedRoots(PROJECT_ROOT, GLOBAL_ROOT) });
const entryOf = (p: Plan): ServerEntry =>
{
    const [step] = p.steps.filter((candidate) => candidate.op === 'mcp-add' || candidate.op === 'mcp-replace' || candidate.op === 'mcp-move') as McpAddStep[];
    assert.ok(step, `a registration step is planned: ${p.unchanged.join('; ')} ${p.errors.join('; ')}`);
    return step.entry;
};

test('configure over an unchanged launcher plans no step', { skip: POSIX_FIXTURE }, () =>
{
    const p = planOf(both(), changeOf(githubLauncher(), {}));
    assert.deepStrictEqual(p.errors, []);
    assert.strictEqual(p.unchanged.length, 1, p.unchanged.join('; '));
    assert.strictEqual(stepsOf(p, 'mcp-replace').length, 0);
    const optional = planOf(inv(MAC, { registrations: [reg('c7', 'local', C7_LAUNCHER, 'context7', 'local')], roots: usedRoots(PROJECT_ROOT, GLOBAL_ROOT) }), changeOf({ name: 'c7', scope: 'local' }, {}));
    assert.strictEqual(stepsOf(optional, 'mcp-replace').length, 0, 'an optional key left unfilled is no change either');
});

test('configure over a launcher whose key is filled in the chain plans no step (no stale key)', { skip: POSIX_FIXTURE }, () =>
{
    const folder = mkdtempSync(path.join(tmpdir(), 'launcher-filled-'));
    try
    {
        const root = path.join(folder, '.alfred-tools');
        mkdirSync(root);
        writeFileSync(path.join(root, '.mcps-secrets'), `${TOKEN_VAR}=${['fake', 'value'].join('-')}\n`);
        const entry: ServerEntry = { command: 'node', args: [path.join(root, 'mcp-bridge.js'), '--run', `${TOKEN_VAR}=${TOKEN_VAR}`, GLOBAL_ROOT, '--', 'docker', ...DOCKER_ARGS], env: {} };
        const target = reg('gh', 'local', entry, 'github', 'local');
        const p = plan(inv({ ...MAC, project: folder }, { registrations: [target], roots: usedRoots(root, GLOBAL_ROOT) }), changeOf(target, {}), opts('/Users/me'));
        assert.deepStrictEqual(p.errors, []);
        assert.strictEqual(stepsOf(p, 'mcp-replace').length, 0, p.steps.map((step) => step.op).join(' '));
        assert.strictEqual(p.unchanged.length, 1);
    }
    finally { rmSync(folder, { recursive: true, force: true }); }
});

test('configure moving a launcher between Local and Global re-paths its two slots and nothing after -- (Review Focus 5)', { skip: POSIX_FIXTURE }, () =>
{
    const toGlobal = planOf(both(), changeOf(githubLauncher(), { scope: 'user' }));
    assert.deepStrictEqual(toGlobal.errors, []);
    const down = launcherParts(entryOf(toGlobal));
    assert.strictEqual(down?.path, `${GLOBAL_ROOT}/mcp-bridge.js`);
    assert.strictEqual(down?.globalRoot, null);
    assert.deepStrictEqual(down?.inner, launcherParts(LAUNCHER)?.inner);
    assert.strictEqual(down?.keyName, KEY_NAME);
    const atGlobal = launched(`${TOKEN_VAR}=${KEY_NAME}`, 'docker', DOCKER_ARGS);
    atGlobal.args = [`${GLOBAL_ROOT}/mcp-bridge.js`, '--run', `${TOKEN_VAR}=${KEY_NAME}`, '--', 'docker', ...DOCKER_ARGS];
    const toLocal = planOf(inv(MAC, { registrations: [reg('gh', 'user', atGlobal, 'github', 'local')], roots: usedRoots(PROJECT_ROOT, GLOBAL_ROOT) }), changeOf({ name: 'gh', scope: 'user' }, { scope: 'local' }));
    assert.deepStrictEqual(toLocal.errors, []);
    const up = launcherParts(entryOf(toLocal));
    assert.strictEqual(up?.path, `${PROJECT_ROOT}/mcp-bridge.js`);
    assert.strictEqual(up?.globalRoot, GLOBAL_ROOT);
    assert.deepStrictEqual(up?.inner, launcherParts(LAUNCHER)?.inner);
    assert.ok(stepsOf(toLocal, 'mcp-move').length === 1 && stepsOf(toGlobal, 'mcp-move').length === 1);
});

test('configure turning context7\'s key off, or moving it to Project, gives the plain keyless entry', { skip: POSIX_FIXTURE }, () =>
{
    const target = { name: 'c7', scope: 'local' };
    const inventory = inv(MAC, { registrations: [reg('c7', 'local', C7_LAUNCHER, 'context7', 'local')], roots: usedRoots(PROJECT_ROOT, GLOBAL_ROOT) });
    const plain = { command: 'npx', args: ['-y', '@upstash/context7-mcp@4.7.0'], env: C7_LAUNCHER.env };
    assert.deepStrictEqual(entryOf(planOf(inventory, changeOf(target, { token: false }))), plain);
    const project = planOf(inventory, changeOf(target, { scope: 'project' }));
    assert.deepStrictEqual(entryOf(project), plain);
    assert.ok(!(entryOf(project).args ?? []).some((argument) => argument.endsWith('mcp-bridge.js')));
});

test('configure renaming the key writes the new name into the launcher and its key file', { skip: POSIX_FIXTURE }, () =>
{
    const target = githubLauncher();
    const renamed = 'ACME_OTHER_TOKEN';
    const p = planOf(both(), { ...changeOf(target, {}), keyNames: { 'mcp:gh~local': renamed } });
    assert.deepStrictEqual(p.errors, []);
    const step = entryOf(p);
    assert.ok((step.args ?? []).includes(`${TOKEN_VAR}=${renamed}`), (step.args ?? []).join(' '));
    const names = (stepsOf(p, 'ensure-key-name') as EnsureKeyNameStep[]).flatMap((keyStep) => keyStep.names);
    assert.ok(names.includes(renamed), `the new name is written to the key file: ${names.join(', ')}`);
    for (const registration of stepsOf(p, 'mcp-replace')) assert.strictEqual(registration.key, undefined, 'no key is written into a launcher');
});

test('a re-pathed launcher brings write-helper and write-bridge before its step', { skip: POSIX_FIXTURE }, () =>
{
    const p = planOf(both(), { rootChange: ['project'], roots: { project: { id: 'named', path: 'tools' } } });
    assert.deepStrictEqual(p.errors, []);
    const ops = p.steps.map((step) => step.op);
    const at = (op: string) => ops.indexOf(op as never);
    assert.ok(at('root-ignore') >= 0 && at('root-ignore') < at('write-helper'), ops.join(' '));
    assert.ok(at('write-helper') < at('write-bridge') && at('write-bridge') < at('ensure-key-name') && at('ensure-key-name') < at('mcp-replace'), ops.join(' '));
});

test("a launcher's key line says the launcher reads it", { skip: POSIX_FIXTURE }, () =>
{
    const filled = planOf(both(), changeOf(githubLauncher(), { name: 'gh2' }));
    assert.match(renderPlan(filled), /mcp-bridge\.js reads it each time the server starts/);
    const unfilled = planOf(inv(MAC, { registrations: [reg('c7', 'local', C7_LAUNCHER, 'context7', 'local')], roots: usedRoots(PROJECT_ROOT, GLOBAL_ROOT) }), changeOf({ name: 'c7', scope: 'local' }, { name: 'c7b' }));
    const text = renderPlan(unfilled);
    assert.match(text, /mcp-bridge\.js reads it each time the server starts/);
    assert.match(text, /until then the server starts without its key/);
    assert.match(unfilled.notes.join('\n'), /context7: fill CONTEXT7_API_KEY in .*\(optional\); the launcher reads it each time the server starts/);
});

test('a launcher keeps no key in a second env field', () =>
{
    const route = catalog.byId.get('sentry')!.routes.local!;
    const inner: ServerEntry = { command: 'npx', args: ['-y', '@sentry/mcp-server@0.49.0'], env: { SENTRY_AUTH_TOKEN: '${SENTRY_ACCESS_TOKEN}', SENTRY_ACCESS_TOKEN: '${SENTRY_ACCESS_TOKEN}', npm_config_before: 'x' } };
    const form = launcherForm(route, 'SENTRY_ACCESS_TOKEN', place, inner);
    assert.ok(form);
    assert.deepStrictEqual(form.env, { npm_config_before: 'x' });
    assert.ok(!JSON.stringify(form).includes('${'), 'no placeholder is left');
});
