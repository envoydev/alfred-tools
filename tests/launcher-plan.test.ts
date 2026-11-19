// The key-name readers over a stdio key launcher (`node <root>/mcp-bridge.js --run <ENV>=<KEY_NAME>[?] [<global root>] --
// <command> <args>`): configure, the list and a root change keep the key name the launcher holds, and read no key value.
import test from 'node:test';
import assert from 'node:assert';
import { load } from '../scripts/catalog/catalog.ts';
import { currentOf, launcherPlace } from '../scripts/entries/entry.ts';
import { launcherParts } from '../scripts/entries/launcher.ts';
import { heldKey } from '../scripts/plan/asks-keys.ts';
import { fromRegistration } from '../scripts/mcps-list/mcps-list.ts';
import { plan } from '../scripts/plan/plan.ts';
import * as asks from '../scripts/plan/asks-all.ts';
import { MAC, POSIX_FIXTURE, inv, opts, reg, changeOf, usedRoots } from './plan-helpers.ts';
import type { ServerEntry } from '../scripts/core/types.ts';
import type { EnsureKeyNameStep, McpAddStep, Plan } from '../scripts/plan/types.ts';

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
const stepsOf = <Op extends Plan['steps'][number]['op']>(p: Plan, op: Op) => p.steps.filter((step) => step.op === op);

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

// A re-plan shows as an mcp-replace step, or - until the launcher is re-pathed with its root - as planMcp's 'already as
// answered' line: either way planMcp ran for the target.
const replanned = (p: Plan, name: string): boolean => stepsOf(p, 'mcp-replace').some((step) => (step as McpAddStep).name === name)
    || p.unchanged.some((line) => line.includes(`'${name}' at local scope`));

test('a global root change re-plans a Local launcher that names it, standard root or not', { skip: POSIX_FIXTURE }, () =>
{
    const standard = plan(inv(MAC, { registrations: [githubLauncher()], roots: usedRoots(PROJECT_ROOT, GLOBAL_ROOT) }), { rootChange: ['global'], roots: { global: { id: 'named', path: '/Users/me/keys' } } }, opts('/Users/me'));
    assert.deepStrictEqual(standard.errors, []);
    assert.ok(replanned(standard, 'gh'), 'a launcher naming the standard old root is re-planned');
    for (const step of stepsOf(standard, 'mcp-replace') as McpAddStep[]) assert.ok((step.entry.args ?? []).includes(`${TOKEN_VAR}=${KEY_NAME}`), 'its key name is kept');
    assert.match(standard.notes.join('\n'), /a local server in another project whose (helper or )?launcher names \/Users\/me\/\.alfred-tools keeps reading its \.mcps-secrets until \/alfred-tools:configure runs there/);
    // a named old root
    const named = githubLauncher();
    named.entry = { ...LAUNCHER, args: (LAUNCHER.args ?? []).map((argument) => (argument === GLOBAL_ROOT ? '/Users/me/keys' : argument)) };
    const moved = plan(inv(MAC, { registrations: [named], roots: usedRoots(PROJECT_ROOT, '/Users/me/keys') }), { rootChange: ['global'], roots: { global: { id: 'named', path: '/Users/me/vault' } } }, opts('/Users/me'));
    assert.deepStrictEqual(moved.errors, []);
    assert.ok(replanned(moved, 'gh'), 'a launcher naming a named old root is re-planned');
    // a launcher that names another global root is left alone
    const elsewhere = plan(inv(MAC, { registrations: [named], roots: usedRoots(PROJECT_ROOT, GLOBAL_ROOT) }), { rootChange: ['global'], roots: { global: { id: 'named', path: '/Users/me/vault' } } }, opts('/Users/me'));
    assert.ok(!replanned(elsewhere, 'gh'), 'a launcher that names another root is not');
});
