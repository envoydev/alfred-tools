// recordStep, install side (spec D1): each row of install.md's step 4 table as one test, then the refusals and the
// guarantees every call keeps. The steps are the walk's own, built by allQuestions and nextQuestion.
import test from 'node:test';
import assert from 'node:assert';
import { recordStep } from '../scripts/plan/record.ts';
import { attempt, advanceTo, inv, MAC, record, start, stepOf, WIN } from './record-helpers.ts';
import type { State } from './record-helpers.ts';

const I = inv(MAC);
const GITLAB = { scope: 'project', name: 'keep', params: { host: 'gitlab.com' }, token: true };
const each = (rows: string[], extra: object = {}, base = I): State => start(base, { rows, walk: 'each', done: ['clients', 'settings'], ...extra });
const gitlab = (picks: object = {}, until = 'gitlab:questions'): State => advanceTo(each(['gitlab'], picks), until);
const entryOf = (state: State, row = 'gitlab') => state.answers.picks![row];

test('apps: the answer is clients in picks.json and at the top of answers.json', () => {
    const state = record(start(I, { rows: ['gitlab'] }), { clients: 'Claude Code and Cursor' });
    assert.deepStrictEqual(state.picks.clients, ['claude', 'cursor']);
    assert.deepStrictEqual(state.answers, { clients: ['claude', 'cursor'], picks: { gitlab: {} } });
    assert.deepStrictEqual(state.picks.recorded!['clients'], { tool: null, picks: [['clients']], answers: [['clients']] });
    assert.deepStrictEqual(record(start(I, { rows: ['gitlab'] })).answers.clients, ['claude']);
});

test("settings: the answer is walk in picks.json and nothing in answers.json", () => {
    const state = advanceTo(start(I, { rows: ['gitlab'] }), 'settings');
    const each = record(state, { settings: 'Set gitlab up' });
    assert.strictEqual(each.picks.walk, 'each');
    assert.deepStrictEqual(each.answers, { clients: ['claude'], picks: { gitlab: {} } });
    assert.strictEqual(record(state).picks.walk, 'recommended');
    assert.deepStrictEqual(each.picks.recorded!['settings'], { tool: null, picks: [['walk']], answers: [] });
});

test('route Hosted / Local / Bridge is remote / local / bridge', () => {
    const state = advanceTo(each(['sentry']), 'sentry:route');
    for (const [label, route] of [['Hosted', 'remote'], ['Local', 'local'], ['Bridge', 'bridge']] as const)
    {
        const next = record(state, { 'route-sentry': label });
        assert.deepStrictEqual(next.picks.routes, { sentry: route }, label);
        assert.deepStrictEqual(entryOf(next, 'sentry'), { route }, label);
    }
});

test('scope Global / Project / Local is user / project / local', () => {
    for (const [label, scope] of [['Global', 'user'], ['Project', 'project'], ['Local', 'local']] as const)
    {
        const next = record(gitlab(), { 'scope-gitlab': label });
        assert.deepStrictEqual(next.picks.scopes, { gitlab: scope }, label);
        assert.deepStrictEqual(entryOf(next), { ...GITLAB, scope }, label);
    }
});

test("name: 'Keep ...' is keep, 'Use `x`' and a name typed are the name", () => {
    assert.deepStrictEqual([record(gitlab()).picks.names, entryOf(record(gitlab()))!.name], [{ gitlab: 'keep' }, 'keep']);
    const used = record(gitlab(), { 'name-gitlab': 'Use `shop-gitlab`' });
    assert.deepStrictEqual([used.picks.names, entryOf(used)!.name], [{ gitlab: 'shop-gitlab' }, 'shop-gitlab']);
});

test('location: the entry next.answers gives for the label, and Another ...folder with the folder typed', () => {
    const win = advanceTo(each(['serena'], { roots: { project: { id: 'alfred-tools' } } }, inv(WIN)), 'serena:questions');
    assert.deepStrictEqual(stepOf(win).step.call!.map((question) => question.id), ['location-serena']);
    const profile = record(win, { 'location-serena': "Your profile's .serena" });
    assert.deepStrictEqual(entryOf(profile, 'serena'), { scope: 'project', name: 'keep', location: { side: 'default' } });
    const typed = record(win, { 'location-serena': { label: 'Another space-free folder', typed: 'D:\\serena' } });
    assert.deepStrictEqual(entryOf(typed, 'serena'), { scope: 'project', name: 'keep', location: { side: 'path', path: 'D:\\serena' } });
    const folder = record(win, { 'location-serena': { other: 'D:\\serena' } });
    assert.deepStrictEqual(entryOf(folder, 'serena'), { scope: 'project', name: 'keep', location: { side: 'path', path: 'D:\\serena' } });
});

test('a location option that is one of the options but has no value is the typed folder, whatever its wording', () => {
    const win = advanceTo(each(['serena'], { roots: { project: { id: 'alfred-tools' } } }, inv(WIN)), 'serena:questions');
    const { step, built } = stepOf(win);
    const renamed = { ...step, call: step.call!.map((question) => ({ ...question, options: question.options.map((option) => (option.label.startsWith('Another ') ? { ...option, label: 'A folder of mine' } : option)) })) };
    const result = recordStep({ step: renamed, built, picks: win.picks, answers: win.answers, chosen: { id: step.id, answers: { 'location-serena': { label: 'A folder of mine', typed: 'D:\\serena' } } } });
    assert.deepStrictEqual((result as { answers: State['answers'] }).answers.picks!['serena'], { scope: 'project', name: 'keep', location: { side: 'path', path: 'D:\\serena' } });
    const other = recordStep({ step: renamed, built, picks: win.picks, answers: win.answers, chosen: { id: step.id, answers: { 'location-serena': { other: 'D:\\serena' } } } });
    assert.deepStrictEqual((other as { answers: State['answers'] }).answers.picks!['serena'], { scope: 'project', name: 'keep', location: { side: 'path', path: 'D:\\serena' } });
    assert.match((recordStep({ step: renamed, built, picks: win.picks, answers: win.answers, chosen: { id: step.id, answers: { 'location-serena': 'A folder of mine' } } }) as { refused: string }).refused, /needs its typed value/);
});

test("browser: 'A browser binary I name' is the path typed, 'Default for this engine' writes nothing", () => {
    const state = advanceTo(each(['playwright-chrome']), 'playwright-chrome:questions');
    assert.deepStrictEqual(entryOf(record(state, { 'browser-playwright-chrome': { label: 'A browser binary I name', typed: '/opt/chrome' } }), 'playwright-chrome'), { scope: 'project', name: 'keep', executablePath: '/opt/chrome', location: { side: 'project' } });
    assert.deepStrictEqual(entryOf(record(state), 'playwright-chrome'), { scope: 'project', name: 'keep', location: { side: 'project' } });
});

test("API key: 'Use a key ...' is true, 'Sign in with OAuth' false, every answer written", () => {
    const keyed = record(gitlab());
    assert.deepStrictEqual([keyed.picks.tokens, entryOf(keyed)!.token], [{ gitlab: true }, true]);
    const oauth = record(gitlab(), { 'token-gitlab': 'Sign in with OAuth' });
    assert.deepStrictEqual([oauth.picks.tokens, entryOf(oauth)!.token], [{ gitlab: false }, false]);
});

test('host: the default host is its label, a self-managed host is typed, a region is its description', () => {
    assert.deepStrictEqual(entryOf(record(gitlab(), { 'host-gitlab': { label: 'A self-managed host', typed: 'git.corp.example' } })), { ...GITLAB, params: { host: 'git.corp.example' } });
    assert.deepStrictEqual(entryOf(record(gitlab())), GITLAB);
    const sonar = advanceTo(each(['sonarqube']), 'sonarqube:questions');
    assert.deepStrictEqual(entryOf(record(sonar, { 'host-sonarqube': 'SonarQube Cloud US' }), 'sonarqube')!.params, { host: 'api.sonarqube.us' });
    assert.deepStrictEqual(entryOf(record(sonar), 'sonarqube')!.params, { host: 'api.sonarcloud.io' });
});

test('key name: a name, or one typed after A name you choose, goes to keyNames at the top', () => {
    const keys = gitlab({}, 'gitlab:keys');
    assert.deepStrictEqual(record(keys).answers.keyNames, { gitlab: 'GITLAB_TOKEN' });
    assert.deepStrictEqual(record(keys, { 'keyname-gitlab': { label: 'A name you choose', typed: 'MY_GITLAB' } }).answers.keyNames, { gitlab: 'MY_GITLAB' });
    assert.deepStrictEqual(record(keys, { 'keyname-gitlab': { other: 'MY_GITLAB' } }).answers.keyNames, { gitlab: 'MY_GITLAB' });
});

test('URL name: a name or a typed one goes to urlNames[tool][VAR] at the top', () => {
    const urls = advanceTo(each(['sentry'], { routes: { sentry: 'bridge' }, done: ['clients', 'settings', 'sentry:route'] }), 'sentry:keys');
    const next = record(urls, { 'urlname-sentry-SENTRY_PROJECT': { label: 'A name you choose', typed: 'ACME_PROJECT' } });
    assert.deepStrictEqual(next.answers.urlNames, { sentry: { SENTRY_ORG: 'SENTRY_ORG', SENTRY_PROJECT: 'ACME_PROJECT' } });
    assert.deepStrictEqual(next.answers.keyNames, { sentry: 'SENTRY_ACCESS_TOKEN' });
});

test("settings: 'Change or add a setting' writes the typed pairs, 'Keep these settings' nothing", () => {
    const keys = advanceTo(each(['serena']), 'serena:keys');
    assert.deepStrictEqual(record(keys, { 'settings-serena': { label: 'Change or add a setting', typed: { SERENA_LOG: 'debug' } } }).answers.settings, { serena: { SERENA_LOG: 'debug' } });
    assert.strictEqual(record(keys).answers.settings, undefined);
});

test('tools (sonarqube): the answer without toolsets, toolsets typed in; {} for Read and write', () => {
    const keys = advanceTo(each(['sonarqube']), 'sonarqube:keys');
    const settings = (answer: string | object) => record(keys, { 'settings-sonarqube': answer as never }).answers.settings;
    assert.deepStrictEqual(settings('Read-only'), { sonarqube: { SONARQUBE_READ_ONLY: 'true' } });
    assert.deepStrictEqual(settings('Read and write'), { sonarqube: {} });
    assert.deepStrictEqual(settings({ label: 'Read-only, chosen toolsets', typed: ['rules', 'issues'] }), { sonarqube: { SONARQUBE_READ_ONLY: 'true', SONARQUBE_TOOLSETS: 'rules,issues' } });
    assert.deepStrictEqual(settings({ label: 'Read and write, chosen toolsets', typed: 'rules' }), { sonarqube: { SONARQUBE_TOOLSETS: 'rules' } });
});

test('root: an option is its id, a folder typed is named with its path, both files', () => {
    const root = gitlab({}, 'root:project');
    const first = record(root);
    assert.deepStrictEqual([first.picks.roots, first.answers.roots], [{ project: { id: 'alfred-tools' } }, { project: { id: 'alfred-tools' } }]);
    const named = record(root, { 'root-project': { label: 'A folder you name', typed: 'tools' } });
    assert.deepStrictEqual([named.picks.roots, named.answers.roots], [{ project: { id: 'named', path: 'tools' } }, { project: { id: 'named', path: 'tools' } }]);
    assert.strictEqual(named.answers.rootChange, undefined);
});

test('a label with or without (Recommended) maps the same', () => {
    const questions = gitlab();
    const plain = record(questions, { 'scope-gitlab': 'Project', 'token-gitlab': 'Use a key from .mcps-secrets' });
    const marked = record(questions, { 'scope-gitlab': 'Project (Recommended)', 'token-gitlab': 'Use a key from .mcps-secrets (Recommended)' });
    assert.deepStrictEqual(marked, plain);
    assert.deepStrictEqual(plain, record(questions));
});

test('an Other answer on a route question is refused', () => {
    const state = advanceTo(each(['sentry']), 'sentry:route');
    assert.deepStrictEqual(attempt(state, { 'route-sentry': { other: 'remote' } }), { refused: "route-sentry: 'Other' is not taken here - ask again with one of the options" });
});

test('an Other answer on the name question is the name', () => {
    const next = record(gitlab(), { 'name-gitlab': { other: 'my-gitlab' } });
    assert.deepStrictEqual([next.picks.names, entryOf(next)!.name], [{ gitlab: 'my-gitlab' }, 'my-gitlab']);
});

test('an Other answer on a question with one typed option is that option typed', () => {
    const next = record(gitlab({}, 'gitlab:keys'), { 'keyname-gitlab': { other: 'MY_GITLAB' } });
    assert.deepStrictEqual(next.answers.keyNames, { gitlab: 'MY_GITLAB' });
    const sonar = advanceTo(each(['sonarqube']), 'sonarqube:keys');
    assert.match((attempt(sonar, { 'settings-sonarqube': { other: 'rules' } }) as { refused: string }).refused, /^settings-sonarqube: 'Other' is not taken here/);
});

test('a typed-value label without typed is refused, and typed on a label that takes none', () => {
    assert.deepStrictEqual(attempt(gitlab(), { 'host-gitlab': 'A self-managed host' }), { refused: "host-gitlab: 'A self-managed host' needs its typed value" });
    assert.deepStrictEqual(attempt(gitlab(), { 'scope-gitlab': { label: 'Global', typed: 'x' } }), { refused: "scope-gitlab: 'Global' takes no typed value" });
    assert.deepStrictEqual(attempt(gitlab(), { 'host-gitlab': { label: 'A self-managed host', typed: ['a'] } }), { refused: 'host-gitlab: the typed value must be one string' });
    assert.deepStrictEqual(attempt(gitlab(), { 'scope-gitlab': ['Global'] as never }), { refused: 'scope-gitlab: a list is given where one label is expected' });
});

test('a label that is not an option is refused', () => {
    assert.deepStrictEqual(attempt(gitlab(), { 'scope-gitlab': 'Nowhere' }), { refused: "scope-gitlab: 'Nowhere' is not one of its options" });
});

test('a step id that is not next.id is refused', () => {
    assert.deepStrictEqual(attempt(gitlab(), {}, (chosen) => { chosen.id = 'gitlab:keys'; }), { refused: "step.json is for 'gitlab:keys', the step to answer is 'gitlab:questions'" });
});

test('a missing answer is refused, and so is an answer to a question not in the step', () => {
    assert.deepStrictEqual(attempt(gitlab(), {}, (chosen) => { delete chosen.answers['host-gitlab']; }), { refused: 'host-gitlab: no answer for this question' });
    assert.deepStrictEqual(attempt(gitlab(), {}, (chosen) => { chosen.answers['keyname-gitlab'] = 'GITLAB_TOKEN'; }), { refused: 'keyname-gitlab: not a question of this step' });
});

test('install seeds every picked row but a skipped one', () => {
    const state = start(inv(MAC), { rows: ['gitlab', 'serena', 'memory'], skipped: ['memory'] }, { picks: { serena: { scope: 'local' } } });
    const next = record(state);
    assert.deepStrictEqual(next.answers.picks, { serena: { scope: 'local' }, gitlab: {} });
});

test('a skipped tool gets no entry from a later step, and picks.json still records it', () => {
    const state = gitlab({ skipped: ['gitlab'] });
    const next = record(state, { 'scope-gitlab': 'Global' });
    assert.strictEqual(next.answers.picks?.['gitlab'], undefined);
    assert.deepStrictEqual(next.picks.scopes, { gitlab: 'user' });
    assert.deepStrictEqual(next.picks.recorded!['gitlab:questions']!.answers, []);
});

test('next.set writes the one location left, and every step is appended to done once', () => {
    const state = advanceTo(each(['playwright-chrome']), 'playwright-chrome:questions');
    const next = record(state);
    assert.deepStrictEqual(entryOf(next, 'playwright-chrome')!.location, { side: 'project' });
    assert.deepStrictEqual(next.picks.recorded!['playwright-chrome:questions']!.answers, [['picks', 'playwright-chrome', 'location']]);
    const again = record(start(I, { ...next.picks, done: next.picks.done!.filter((id) => id !== 'playwright-chrome:questions') }, next.answers));
    assert.deepStrictEqual(again.picks.done, next.picks.done);
});

test('each write is listed under recorded, as the key paths in each file', () => {
    const next = record(gitlab({}, 'gitlab:questions'));
    assert.deepStrictEqual(next.picks.recorded!['gitlab:questions'], {
        tool: 'gitlab',
        picks: [['scopes', 'gitlab'], ['names', 'gitlab'], ['tokens', 'gitlab']],
        answers: [['picks', 'gitlab', 'scope'], ['picks', 'gitlab', 'name'], ['picks', 'gitlab', 'params'], ['picks', 'gitlab', 'token']],
    });
});

test('recordStep does not mutate its inputs', () => {
    const state = gitlab({}, 'gitlab:questions');
    const before = structuredClone({ picks: state.picks, answers: state.answers });
    const { step, built } = stepOf(state);
    const chosen = { id: step.id, answers: { 'scope-gitlab': 'Global', 'name-gitlab': 'Keep `gitlab`', 'host-gitlab': 'gitlab.com', 'token-gitlab': 'Sign in with OAuth' } };
    const beforeStep = JSON.parse(JSON.stringify({ step, built, chosen }));
    attempt(state);
    const result = attempt(state, chosen.answers);
    assert.ok(!('refused' in result));
    assert.deepStrictEqual({ picks: state.picks, answers: state.answers }, before);
    assert.deepStrictEqual(JSON.parse(JSON.stringify({ step, built, chosen })), beforeStep);
    assert.notStrictEqual((result as { picks: object }).picks, state.picks);
});

test("macos-control's Shell question: 'Turn off the Shell tool' is exclude true, 'Keep every tool' false (spec D4)", () => {
    const state = advanceTo(each(['macos-control']), 'macos-control:keys');
    assert.ok(stepOf(state).step.call!.some((question) => question.id === 'exclude-macos-control'));
    assert.strictEqual(entryOf(record(state), 'macos-control')!.exclude, true);
    assert.strictEqual(entryOf(record(state, { 'exclude-macos-control': 'Keep every tool' }), 'macos-control')!.exclude, false);
});
