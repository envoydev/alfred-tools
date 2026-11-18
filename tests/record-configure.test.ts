// recordStep, configure side (spec D1): each row of configure.md's step 5 table as one test - the answer that changes
// something is written to the target's `change` entry, the one that keeps what it has now is not.
import test from 'node:test';
import assert from 'node:assert';
import { advanceTo, installed, inv, MAC, record, start, stepOf } from './record-helpers.ts';
import type { State } from './record-helpers.ts';
import type { PickAnswer } from '../scripts/plan/types.ts';

// a configure walk over one installed row, its own question already answered
function target(row: string, answers: PickAnswer = {}, extra: Record<string, unknown> = {}): { state: State; key: string; change: (state: State) => unknown }
{
    const registration = installed(row, answers);
    const key = `mcp:${registration.name}~${registration.scope}`;
    const state = start(inv(MAC, { registrations: [registration], ...extra }), { targets: [key], done: [`${key}:own`], existing: { [key]: 'manage' } });
    return { state, key, change: (next) => next.answers.change?.[key] };
}
const at = (state: State, id: string) => advanceTo(state, id);

test('route, when it is not current.route', () => {
    const { state, key, change } = target('sentry', { route: 'bridge', scope: 'user' });
    const route = at(state, `${key}:route`);
    assert.deepStrictEqual(change(record(route, { 'route-sentry': 'Hosted' })), { row: 'sentry', route: 'remote' });
    const kept = record(route, { 'route-sentry': 'Bridge' });
    assert.strictEqual(change(kept), undefined);
    assert.deepStrictEqual(kept.picks.routes, { [key]: 'bridge' });
});

test('scope, when it is not current.scope', () => {
    const { state, key, change } = target('gitlab', { scope: 'user', token: false });
    const questions = at(state, `${key}:questions`);
    assert.deepStrictEqual(change(record(questions, { 'scope-gitlab': 'Project' })), { row: 'gitlab', scope: 'project' });
    assert.deepStrictEqual(record(questions, { 'scope-gitlab': 'Project' }).picks.scopes, { [key]: 'project' });
});

test("name 'Keep ...' writes nothing; 'Use `x`' and a name typed write the name", () => {
    const { state, key, change } = target('gitlab', { scope: 'user', token: false });
    const questions = at(state, `${key}:questions`);
    const kept = record(questions);
    assert.deepStrictEqual([change(kept), kept.picks.names], [undefined, { [key]: 'keep' }]);
    assert.deepStrictEqual(change(record(questions, { 'name-gitlab': 'Use `shop-gitlab`' })), { row: 'gitlab', name: 'shop-gitlab' });
    assert.deepStrictEqual(change(record(questions, { 'name-gitlab': { other: 'my-gitlab' } })), { row: 'gitlab', name: 'my-gitlab' });
});

test("location 'The folder it uses now' writes nothing, another label writes its entry, a folder typed is a path", () => {
    const { state, key, change } = target('playwright-chrome', { scope: 'local', location: { side: 'path', path: '/work/shop/tools/pw' } });
    const questions = at(state, `${key}:questions`);
    const labels = stepOf(questions).step.call!.find((question) => question.id === 'location-playwright-chrome')!.options.map((option) => option.label);
    assert.strictEqual(labels[0], 'The folder it uses now (Recommended)');
    assert.strictEqual(change(record(questions)), undefined);
    assert.deepStrictEqual(change(record(questions, { 'location-playwright-chrome': labels[1]! })), { row: 'playwright-chrome', location: { side: 'project' } });
});

test('next.set is written as the location, as the command says', () => {
    const { state, key, change } = target('playwright-chrome', { scope: 'user' });
    const questions = at(state, `${key}:questions`);
    assert.deepStrictEqual(stepOf(questions).step.set, { location: { side: 'keep' } });
    assert.deepStrictEqual(change(record(questions)), { row: 'playwright-chrome', location: { side: 'keep' } });
});

test("browser 'A browser binary I name' writes the path typed; 'Default for this engine' empties a binary it has now", () => {
    const fresh = target('playwright-chrome', { scope: 'user' });
    const named = record(at(fresh.state, `${fresh.key}:questions`), { 'browser-playwright-chrome': { label: 'A browser binary I name', typed: '/opt/chrome' } });
    assert.strictEqual((fresh.change(named) as { executablePath: string }).executablePath, '/opt/chrome');
    const has = target('playwright-chrome', { scope: 'user', executablePath: '/opt/chrome' });
    const questions = at(has.state, `${has.key}:questions`);
    assert.strictEqual((has.change(record(questions, { 'browser-playwright-chrome': 'Default for this engine' })) as { executablePath: string }).executablePath, '');
    assert.strictEqual((has.change(record(questions)) as { executablePath?: string }).executablePath, undefined);
});

test('API key, when it is not first', () => {
    const { state, key, change } = target('gitlab', { scope: 'user', token: false });
    const questions = at(state, `${key}:questions`);
    const keyed = record(questions, { 'token-gitlab': 'Use a key from .mcps-secrets' });
    assert.deepStrictEqual([change(keyed), keyed.picks.tokens], [{ row: 'gitlab', token: true }, { [key]: true }]);
    assert.deepStrictEqual([change(record(questions)), record(questions).picks.tokens], [undefined, { [key]: false }]);
});

test('host: a self-managed host typed, the hosted host or a region when it is not first', () => {
    const fresh = target('gitlab', { scope: 'user', token: false });
    const typed = record(at(fresh.state, `${fresh.key}:questions`), { 'host-gitlab': { label: 'A self-managed host', typed: 'git.corp.example' } });
    assert.deepStrictEqual(fresh.change(typed), { row: 'gitlab', params: { host: 'git.corp.example' } });
    const own = target('gitlab', { scope: 'user', token: false, params: { host: 'git.corp.example' } });
    const questions = at(own.state, `${own.key}:questions`);
    assert.deepStrictEqual(own.change(record(questions, { 'host-gitlab': 'gitlab.com' })), { row: 'gitlab', params: { host: 'gitlab.com' } });
    assert.strictEqual(own.change(record(questions)), undefined);
    const sonar = target('sonarqube', { scope: 'user', params: { host: 'api.sonarqube.us' } });
    const region = at(sonar.state, `${sonar.key}:questions`);
    assert.deepStrictEqual(sonar.change(record(region, { 'host-sonarqube': 'SonarQube Cloud' })), { row: 'sonarqube', params: { host: 'api.sonarcloud.io' } });
    assert.strictEqual(sonar.change(record(region)), undefined);
});

test('key name, when it is not first: a name typed goes to keyNames, and no change entry is made', () => {
    const { state, key, change } = target('gitlab', { scope: 'user', token: true });
    const keys = at(state, `${key}:keys`);
    assert.deepStrictEqual(record(keys, { 'keyname-gitlab': { label: 'A name you choose', typed: 'MY_GITLAB' } }).answers.keyNames, { [key]: 'MY_GITLAB' });
    assert.strictEqual(change(record(keys, { 'keyname-gitlab': { label: 'A name you choose', typed: 'MY_GITLAB' } })), undefined);
    assert.strictEqual(record(keys).answers.keyNames, undefined);
});

test('URL name, when it is not first', () => {
    const { state, key } = target('sentry', { route: 'bridge', scope: 'user' });
    const keys = at(state, `${key}:keys`);
    const next = record(keys, { 'urlname-sentry-SENTRY_ORG': { label: 'A name you choose', typed: 'ACME_ORG' } });
    assert.deepStrictEqual(next.answers.urlNames, { [key]: { SENTRY_ORG: 'ACME_ORG' } });
    assert.strictEqual(record(keys).answers.urlNames, undefined);
});

test("settings: pairs typed after 'Change or add a setting'; 'Keep these settings' nothing", () => {
    const { state, key } = target('serena', { scope: 'local' });
    const keys = at(state, `${key}:keys`);
    assert.deepStrictEqual(record(keys, { 'settings-serena': { label: 'Change or add a setting', typed: { SERENA_LOG: 'debug' } } }).answers.settings, { [key]: { SERENA_LOG: 'debug' } });
    assert.strictEqual(record(keys).answers.settings, undefined);
});

test('tools (sonarqube), when it is not first: the answer, toolsets typed in', () => {
    const { state, key } = target('sonarqube', { scope: 'user' });
    const keys = at(state, `${key}:keys`);
    assert.strictEqual(record(keys).answers.settings, undefined);
    assert.deepStrictEqual(record(keys, { 'settings-sonarqube': 'Read and write' }).answers.settings, { [key]: {} });
    assert.deepStrictEqual(record(keys, { 'settings-sonarqube': { label: 'Read-only, chosen toolsets', typed: 'rules,issues' } }).answers.settings, { [key]: { SONARQUBE_READ_ONLY: 'true', SONARQUBE_TOOLSETS: 'rules,issues' } });
});

test("root: another root than the one in use is written with rootChange; the one in use writes nothing but picks.json", () => {
    const used = { map: null, project: { path: '/work/shop/.alfred-tools', from: 'registration' }, global: null };
    const state = start(inv(MAC, { roots: used }), { targets: ['root:project'] });
    const named = record(state, { 'root-project': { label: 'A folder you name', typed: 'tools' } });
    assert.deepStrictEqual([named.picks.roots, named.answers.roots, named.answers.rootChange], [{ project: { id: 'named', path: 'tools' } }, { project: { id: 'named', path: 'tools' } }, ['project']]);
    assert.strictEqual(named.answers.change, undefined);
    assert.deepStrictEqual(named.picks.recorded!['root:project']!.answers, [['roots', 'project'], ['rootChange', 'project']]);
    const kept = record(state);
    assert.deepStrictEqual([kept.picks.roots, kept.answers], [{ project: { id: 'alfred-tools' } }, {}]);
});

test('own: the choice goes to existing in both files and makes no change entry', () => {
    const { state, key, change } = target('gitlab', { scope: 'user' });
    const own = start(state.inventory, { targets: [key] });
    const left = record(own, { [`own-${key}`]: 'Leave it on its own' });
    assert.deepStrictEqual([left.picks.existing, left.answers.existing, change(left)], [{ [key]: 'own' }, { [key]: 'own' }, undefined]);
});

test('apps: the list when it is not current.clients', () => {
    const { state, key, change } = target('gitlab', { scope: 'user' });
    const clients = at(state, `${key}:clients`);
    assert.deepStrictEqual(change(record(clients, { [`clients-${key}`]: 'Claude Code and Cursor' })), { row: 'gitlab', clients: ['claude', 'cursor'] });
    assert.strictEqual(change(record(clients)), undefined);
});

test('a configure walk that keeps everything writes no change entry', () => {
    const { state, key } = target('gitlab', { scope: 'user', token: false });
    let next = start(state.inventory, { targets: [key] });
    while (stepOf(next).step.id !== 'done') next = record(next);
    assert.deepStrictEqual(next.answers, { existing: { [key]: 'manage' } });
    assert.deepStrictEqual(next.picks.done, [`${key}:own`, `${key}:questions`, `${key}:clients`]);
});
