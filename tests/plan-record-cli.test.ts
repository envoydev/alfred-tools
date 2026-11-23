// plan.ts --record, --rewind and --skip (spec D1, D1b, D1c): the file reads and writes and the refusals. The mappings
// themselves are tests/record*.test.ts's.
import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeTempDir } from '../scripts/core/tmpdir.ts';
import { plan } from '../scripts/plan/plan.ts';
import { mapKey } from '../scripts/roots/roots.ts';
import { inv, installed, MAC } from './record-helpers.ts';
import type { Inventory } from '../scripts/inventory/types.ts';
import type { Answers, Picks, Question } from '../scripts/plan/types.ts';

const PLAN_ENTRY = path.join(import.meta.dirname, '..', 'scripts', 'plan.ts');
const HOME = '/Users/me';

interface Work
{
    dir: string;
    home: string;
    inventory: string;
    picks: string;
    answers: string;
    step: string;
    run: (...args: string[]) => { status: number | null; stdout: string; stderr: string };
    read: (file: string) => unknown;
}

// a run's temp folder (or the folder given) holding the four files, and a runner for plan.ts under a temp home
function work(t: TestContext, inventory: Inventory, picks: Picks, answers: Answers | null = null, dir = makeTempDir()): Work
{
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rec-home-'));
    t.after(() => { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); });
    const files = { inventory: path.join(dir, 'inventory.json'), picks: path.join(dir, 'picks.json'), answers: path.join(dir, 'answers.json'), step: path.join(dir, 'step.json') };
    fs.writeFileSync(files.inventory, JSON.stringify(inventory));
    fs.writeFileSync(files.picks, JSON.stringify(picks));
    if (answers) fs.writeFileSync(files.answers, JSON.stringify(answers));
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    const run = (...args: string[]) => spawnSync(process.execPath, [PLAN_ENTRY, ...args], { encoding: 'utf8', env });
    return { dir, home, ...files, run, read: (file) => JSON.parse(fs.readFileSync(file, 'utf8')) };
}

const I = inv(MAC);
const EACH: Picks = { rows: ['gitlab'], walk: 'each', done: ['clients', 'settings'] };
const files = (w: Work) => [w.inventory, w.picks, w.answers, w.step];
const record = (w: Work) => w.run('--record', ...files(w));
const listing = (dir: string) => fs.readdirSync(dir).sort();
const firstLabels = (next: { call: Question[] }) => Object.fromEntries(next.call.map((question) => [question.id, question.options[0]!.label]));

test('record writes both files and prints the next step', (t) => {
    const w = work(t, I, EACH);
    const next = JSON.parse(w.run('--questions', w.inventory, w.picks).stdout).next;
    assert.strictEqual(next.id, 'gitlab:questions');
    fs.writeFileSync(w.step, JSON.stringify({ id: next.id, answers: firstLabels(next) }));
    const done = record(w);
    assert.strictEqual(done.status, 0, done.stderr);
    const written = w.read(w.picks) as Picks;
    assert.ok(written.done!.includes('gitlab:questions'));
    assert.ok(written.scopes?.['gitlab']);
    assert.deepStrictEqual(w.read(w.answers), { picks: { gitlab: { scope: written.scopes!['gitlab'], name: 'keep', params: { host: 'gitlab.com' }, token: true } } });
    const printed = JSON.parse(done.stdout);
    assert.notStrictEqual(printed.next.id, 'gitlab:questions');
    assert.deepStrictEqual(printed, JSON.parse(w.run('--questions', w.inventory, w.picks).stdout));
    assert.deepStrictEqual(listing(w.dir), ['answers.json', 'inventory.json', 'picks.json', 'step.json']);
});

test('files outside a tmpdir folder are refused and untouched', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'not-ours-'));
    const w = work(t, I, EACH, { picks: {} }, dir);
    const next = JSON.parse(w.run('--questions', w.inventory, w.picks).stdout).next;
    fs.writeFileSync(w.step, JSON.stringify({ id: next.id, answers: firstLabels(next) }));
    const before = files(w).map((file) => fs.readFileSync(file, 'utf8'));
    for (const args of [['--record', ...files(w)], ['--rewind', w.inventory, w.picks, w.answers, 'gitlab'], ['--skip', w.inventory, w.picks, w.answers, 'gitlab']])
    {
        const refused = w.run(...args);
        assert.strictEqual(refused.status, 2, args[0]);
        assert.match(refused.stderr, /files must sit in one folder tmpdir\.mjs made/);
    }
    assert.deepStrictEqual(files(w).map((file) => fs.readFileSync(file, 'utf8')), before);
    assert.deepStrictEqual(listing(dir), ['answers.json', 'inventory.json', 'picks.json', 'step.json']);
});

test('files in two different folders are refused even when both are ours', (t) => {
    const w = work(t, I, EACH, {});
    const other = work(t, I, EACH, {});
    const refused = w.run('--skip', w.inventory, w.picks, other.answers, 'gitlab');
    assert.strictEqual(refused.status, 2);
    assert.match(refused.stderr, /files must sit in one folder tmpdir\.mjs made/);
});

test('a refusal exits 2 and writes nothing', (t) => {
    const w = work(t, I, EACH, { picks: { gitlab: {} } });
    const stepFile = (content: string) => fs.writeFileSync(w.step, content);
    const snapshot = () => [w.inventory, w.picks, w.answers].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    const before = snapshot();
    const full = JSON.parse(w.run('--questions', w.inventory, w.picks).stdout).next;
    const labels = firstLabels(full);
    const badLabel = { id: full.id, answers: { ...labels, [Object.keys(labels)[0]!]: 'Nowhere' } };
    const cases: [string, string, RegExp][] = [
        ['a step id that is not the next one', JSON.stringify({ id: 'other', answers: labels }), /step\.json is for 'other', the step to answer is 'gitlab:questions'/],
        ['a label that is not an option', JSON.stringify(badLabel), /Nowhere/],
        ['an answer for a question the step does not ask', JSON.stringify({ id: full.id, answers: { ...labels, 'route-gitlab': 'Hosted' } }), /route-gitlab: not a question of this step/],
        ['step.json that is not JSON', '{ not json', /step\.json: .*not a JSON file/],
    ];
    for (const [name, content, message] of cases)
    {
        stepFile(content);
        const refused = record(w);
        assert.strictEqual(refused.status, 2, name);
        assert.strictEqual(refused.stderr.trim().split('\n').length, 1, `${name}: one line - ${refused.stderr}`);
        assert.match(refused.stderr, message, name);
        assert.strictEqual(refused.stdout, '', name);
        assert.strictEqual(snapshot(), before, name);
    }
    fs.rmSync(w.step);
    assert.strictEqual(record(w).status, 2, 'step.json missing');
    fs.rmSync(w.picks);
    stepFile(JSON.stringify({ id: 'gitlab:questions', answers: {} }));
    assert.strictEqual(record(w).status, 2, 'picks.json missing');
    assert.ok(!fs.existsSync(w.picks));
    assert.ok(!listing(w.dir).some((name) => name.endsWith('.tmp')));
});

test('a step.json that is not { id, answers } is refused before anything is recorded', (t) => {
    const w = work(t, I, EACH, {});
    const before = fs.readFileSync(w.picks, 'utf8');
    for (const content of [{ id: 'gitlab:questions' }, { id: 'gitlab:questions', answers: null }, { id: 'gitlab:questions', answers: ['x'] }, { id: 7, answers: {} }, [], null, 'text'])
    {
        fs.writeFileSync(w.step, JSON.stringify(content));
        const refused = record(w);
        assert.strictEqual(refused.status, 2, JSON.stringify(content));
        assert.ok(!refused.stderr.includes('TypeError') && refused.stderr.trim().split('\n').length === 1, refused.stderr);
    }
    assert.strictEqual(fs.readFileSync(w.picks, 'utf8'), before);
    assert.deepStrictEqual(w.read(w.answers), {});
});

test('a walk that is done has no step to record', (t) => {
    const w = work(t, I, { rows: ['gitlab'], walk: 'recommended', done: ['clients', 'settings'] }, {});
    assert.strictEqual(JSON.parse(w.run('--questions', w.inventory, w.picks).stdout).next.id, 'done');
    fs.writeFileSync(w.step, JSON.stringify({ id: 'done', answers: {} }));
    const refused = record(w);
    assert.strictEqual(refused.status, 2);
    assert.match(refused.stderr, /walk is done/);
    assert.deepStrictEqual(w.read(w.picks), { rows: ['gitlab'], walk: 'recommended', done: ['clients', 'settings'] });
});

test('rewind with no pick prints the which-pick ask and writes nothing', (t) => {
    const w = work(t, I, EACH);
    const next = JSON.parse(w.run('--questions', w.inventory, w.picks).stdout).next;
    fs.writeFileSync(w.step, JSON.stringify({ id: next.id, answers: firstLabels(next) }));
    assert.strictEqual(record(w).status, 0);
    const before = files(w).map((file) => fs.readFileSync(file, 'utf8'));
    const asked = w.run('--rewind', w.inventory, w.picks, w.answers);
    assert.strictEqual(asked.status, 0, asked.stderr);
    const printed = JSON.parse(asked.stdout);
    assert.strictEqual(printed.call.length, 1);
    assert.strictEqual(printed.call[0].id, 'rewind');
    assert.deepStrictEqual(Object.values(printed.answers.rewind), ['gitlab', '']);
    assert.strictEqual(printed.call[0].options.at(-1).label, 'Change nothing');
    assert.strictEqual(printed.call[0].options[0].label, 'gitlab (Recommended)');
    assert.deepStrictEqual(files(w).map((file) => fs.readFileSync(file, 'utf8')), before);
});

test('rewind with a pick drops its steps and prints that pick first again', (t) => {
    const w = work(t, I, EACH);
    const next = JSON.parse(w.run('--questions', w.inventory, w.picks).stdout).next;
    fs.writeFileSync(w.step, JSON.stringify({ id: next.id, answers: firstLabels(next) }));
    assert.strictEqual(record(w).status, 0);
    const rewound = w.run('--rewind', w.inventory, w.picks, w.answers, 'gitlab');
    assert.strictEqual(rewound.status, 0, rewound.stderr);
    assert.strictEqual(JSON.parse(rewound.stdout).next.id, 'gitlab:questions');
    assert.deepStrictEqual((w.read(w.picks) as Picks).done, ['clients', 'settings']);
    assert.deepStrictEqual(w.read(w.answers), { picks: { gitlab: {} } });
    const unknown = w.run('--rewind', w.inventory, w.picks, w.answers, 'sentry');
    assert.strictEqual(unknown.status, 2);
    assert.match(unknown.stderr, /no recorded answer/);
});

test('skip removes the tool and prints it', (t) => {
    const w = work(t, I, { ...EACH, rows: ['gitlab', 'sentry'] }, { picks: { gitlab: { scope: 'user' }, sentry: {} } });
    const skipped = w.run('--skip', w.inventory, w.picks, w.answers, 'gitlab');
    assert.strictEqual(skipped.status, 0, skipped.stderr);
    assert.strictEqual(skipped.stdout.trim(), 'gitlab');
    assert.deepStrictEqual((w.read(w.picks) as Picks).skipped, ['gitlab']);
    assert.deepStrictEqual(w.read(w.answers), { picks: { sentry: {} } });
    const refused = w.run('--skip', w.inventory, w.picks, w.answers, 'nothing');
    assert.strictEqual(refused.status, 2);
    assert.deepStrictEqual((w.read(w.picks) as Picks).skipped, ['gitlab']);
});

test('a missing pick, or a missing file count, is a usage error', (t) => {
    const w = work(t, I, EACH, {});
    assert.strictEqual(w.run('--skip', w.inventory, w.picks, w.answers).status, 2);
    assert.strictEqual(w.run('--record', w.inventory, w.picks, w.answers).status, 2);
    assert.strictEqual(w.run('--rewind', w.inventory, w.picks).status, 2);
});

// the walk: each step answered with the first label of its questions (a label chosen by `label` where it names one)
function drive(w: Work, label: (question: Question) => string = (question) => question.options[0]!.label): number
{
    let out = JSON.parse(w.run('--questions', w.inventory, w.picks).stdout);
    for (let count = 0; count < 120; count++)
    {
        const next = out.next;
        if (next.id === 'done') return count;
        fs.writeFileSync(w.step, JSON.stringify({ id: next.id, answers: Object.fromEntries(next.call.map((question: Question) => [question.id, label(question)])) }));
        const result = record(w);
        assert.strictEqual(result.status, 0, `${next.id}: ${result.stderr}`);
        out = JSON.parse(result.stdout);
    }
    throw new Error('the walk did not end');
}

test('a recommended install walk through --record plans the same as answers with every pick {}', (t) => {
    const rows = ['context7', 'gitlab', 'serena', 'sonarqube'];
    const w = work(t, I, { rows });
    const steps = drive(w, (question) => (question.id === 'settings' ? question.options.find((option) => option.label === 'Set each tool')!.label : question.options[0]!.label));
    assert.ok(steps > 8, `${steps} steps`);
    const picks = w.read(w.picks) as Picks;
    assert.ok(Object.values(picks.recorded!).some((step) => step.tool === 'gitlab'));
    const answers = w.read(w.answers) as Answers;
    const opts = { env: {}, home: HOME };
    const expected = { picks: Object.fromEntries(rows.map((row) => [row, {}])), clients: answers.clients };
    assert.deepStrictEqual(plan(I, answers, opts), plan(I, expected as Answers, opts));
});

test('a configure walk that keeps everything through --record has no change entry', (t) => {
    const registration = installed('sentry', { route: 'bridge', scope: 'user' });
    const key = `mcp:${registration.name}~${registration.scope}`;
    const w = work(t, inv(MAC, { registrations: [registration] }), { targets: [key] });
    const steps = drive(w);
    assert.ok(steps >= 1);
    const answers = w.read(w.answers) as Answers;
    assert.strictEqual(answers.change?.[key], undefined);
    assert.deepStrictEqual((w.read(w.picks) as Picks).existing, { [key]: 'manage' });
});

test('plan mode reads the roots map from --data, as it did before the modes', (t) => {
    const w = work(t, I, {}, {});
    const data = path.join(w.dir, 'data');
    fs.mkdirSync(data);
    const named = '/work/shop/.alfred-tools';
    fs.writeFileSync(path.join(data, 'roots.json'), JSON.stringify({ version: 1, global: null, projects: { [mapKey(I.project)]: named } }));
    fs.writeFileSync(w.answers, JSON.stringify({ picks: { gitlab: {} } }));
    const recordsOf = (...extra: string[]) =>
    {
        const out = path.join(w.dir, 'plan.json');
        const made = w.run(w.inventory, w.answers, '--out', out, ...extra);
        assert.strictEqual(made.status, 0, made.stderr);
        return (w.read(out) as { steps: { op: string; family?: string }[] }).steps.filter((step) => step.op === 'record-root' && step.family === 'project');
    };
    assert.strictEqual(recordsOf().length, 1, 'no map: the project root is to be recorded');
    assert.deepStrictEqual(recordsOf('--data', data), [], 'the map names it already');
});

test('a link planted at <file>.tmp does not let a write leave the folder', (t) => {
    const w = work(t, I, { ...EACH, rows: ['gitlab', 'sentry'] }, { picks: { gitlab: {}, sentry: {} } });
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'));
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    const victim = path.join(outside, 'victim.txt');
    fs.writeFileSync(victim, 'untouched');
    fs.symlinkSync(victim, `${w.picks}.tmp`);
    fs.symlinkSync(victim, `${w.answers}.tmp`);
    const skipped = w.run('--skip', w.inventory, w.picks, w.answers, 'gitlab');
    assert.strictEqual(fs.readFileSync(victim, 'utf8'), 'untouched', skipped.stderr);
    assert.strictEqual(skipped.status, 0, skipped.stderr);
    assert.deepStrictEqual((w.read(w.picks) as Picks).skipped, ['gitlab']);
    assert.ok(!fs.lstatSync(w.picks).isSymbolicLink());
});

test('rewind with a pick stops at the former-name folder before it writes', (t) => {
    const w = work(t, I, EACH);
    const next = JSON.parse(w.run('--questions', w.inventory, w.picks).stdout).next;
    fs.writeFileSync(w.step, JSON.stringify({ id: next.id, answers: firstLabels(next) }));
    assert.strictEqual(record(w).status, 0);
    fs.mkdirSync(path.join(w.home, '.preferred-tools'));
    const before = [w.picks, w.answers].map((file) => fs.readFileSync(file, 'utf8'));
    const stopped = w.run('--rewind', w.inventory, w.picks, w.answers, 'gitlab');
    assert.strictEqual(stopped.status, 1, stopped.stderr);
    assert.match(stopped.stderr, /run \/alfred-tools:update first/);
    assert.deepStrictEqual([w.picks, w.answers].map((file) => fs.readFileSync(file, 'utf8')), before);
});

test('the which-pick ask labels the walk\'s own two picks', (t) => {
    const w = work(t, I, { rows: ['gitlab'] });
    drive(w);
    const asked = JSON.parse(w.run('--rewind', w.inventory, w.picks, w.answers).stdout);
    const labels = asked.call[0].options.map((option: { label: string }) => option.label);
    assert.deepStrictEqual(labels, ['Settings (Recommended)', 'Apps', 'Change nothing']);
});

test('the which-pick ask tells two configure targets of one name apart by scope', (t) => {
    const copies = [installed('sentry', { route: 'bridge', scope: 'user' }), installed('sentry', { route: 'bridge', scope: 'local' })];
    const keys = copies.map((registration) => `mcp:${registration.name}~${registration.scope}`);
    assert.strictEqual(copies[0]!.name, copies[1]!.name);
    const w = work(t, inv(MAC, { registrations: copies }), { targets: keys });
    drive(w);
    const asked = JSON.parse(w.run('--rewind', w.inventory, w.picks, w.answers).stdout);
    const labels = asked.call[0].options.map((option: { label: string }) => option.label.replace(' (Recommended)', ''));
    assert.deepStrictEqual([...labels].sort(), ['Change nothing', 'sentry (Global)', 'sentry (Local)']);
    assert.deepStrictEqual(Object.values(asked.answers.rewind).sort(), ['', ...keys].sort());
});

test('--skip takes a row id when one configure target has that row, and refuses it when several do', (t) => {
    const copies = [installed('sentry', { route: 'bridge', scope: 'user' }), installed('sentry', { route: 'bridge', scope: 'local' }), installed('gitlab', { scope: 'user', token: false })];
    const [first, second, other] = copies.map((registration) => `mcp:${registration.name}~${registration.scope}`) as [string, string, string];
    const w = work(t, inv(MAC, { registrations: copies }), { targets: [first, second, other] }, { change: { [other]: { row: 'gitlab', scope: 'project' } } });
    const several = w.run('--skip', w.inventory, w.picks, w.answers, 'sentry');
    assert.strictEqual(several.status, 2);
    assert.match(several.stderr, /'sentry' names 2 targets/);
    assert.strictEqual((w.read(w.picks) as Picks).skipped, undefined);
    const one = w.run('--skip', w.inventory, w.picks, w.answers, 'gitlab');
    assert.strictEqual(one.status, 0, one.stderr);
    assert.strictEqual(one.stdout.trim(), other);
    assert.deepStrictEqual((w.read(w.picks) as Picks).skipped, [other]);
    assert.strictEqual((w.read(w.answers) as Answers).change?.[other], undefined);
});

test('--out outside a folder tmpdir.mjs made is refused with exit 2 and writes nothing', (t) => {
    const w = work(t, I, {}, { picks: { gitlab: {} } });
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'));
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    const target = path.join(outside, 'plan.json');
    const refused = w.run(w.inventory, w.answers, '--out', target);
    assert.strictEqual(refused.status, 2, refused.stderr);
    assert.match(refused.stderr, /--out/);
    assert.strictEqual(refused.stderr.trim().split('\n').filter((line) => line.startsWith('plan.mjs:')).length, 1);
    assert.ok(!fs.existsSync(target));
    const relative = w.run(w.inventory, w.answers, '--out', 'plan-relative.json');
    assert.strictEqual(relative.status, 2, relative.stderr);
});

test('--out replaces a link planted at the file or its .tmp name instead of writing through it', (t) => {
    const w = work(t, I, {}, { picks: { gitlab: {} } });
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'));
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    const victim = path.join(outside, 'victim.txt');
    fs.writeFileSync(victim, 'untouched');
    const target = path.join(w.dir, 'plan.json');
    fs.symlinkSync(victim, target);
    fs.symlinkSync(victim, `${target}.tmp`);
    const made = w.run(w.inventory, w.answers, '--out', target);
    assert.strictEqual(made.status, 0, made.stderr);
    assert.strictEqual(fs.readFileSync(victim, 'utf8'), 'untouched');
    assert.ok(!fs.lstatSync(target).isSymbolicLink());
    assert.ok(Array.isArray((w.read(target) as { steps: unknown[] }).steps));
});

test('--out and the record files resolve through the checked folder, so <dir>/<link>/../x lands nowhere outside it', (t) => {
    const w = work(t, I, {}, { picks: { gitlab: {} } });
    const elsewhere = makeTempDir();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'));
    t.after(() => { fs.rmSync(elsewhere, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); });
    // path.join would collapse the `..` by text: the call must get it as typed
    const through = (link: string, name: string) => `${path.join(w.dir, link)}${path.sep}..${path.sep}${name}`;
    fs.mkdirSync(path.join(outside, 'sub'));
    fs.mkdirSync(path.join(elsewhere, 'sub'));
    fs.symlinkSync(path.join(outside, 'sub'), path.join(w.dir, 'to-outside'));
    fs.symlinkSync(path.join(elsewhere, 'sub'), path.join(w.dir, 'to-ours'));
    if (process.platform === 'win32')
    {
        // Windows removes `<link>\..` from the path text before the file system sees it (docs/sources.md, 'Windows - `..`
        // in a path'): every such path names w.dir itself, one of ours, and the write lands there and nowhere else
        const written = w.run(w.inventory, w.answers, '--out', through('to-outside', 'victim.json'));
        assert.strictEqual(written.status, 0, written.stderr);
        assert.ok(fs.existsSync(path.join(w.dir, 'victim.json')));
        assert.deepStrictEqual(fs.readdirSync(outside), ['sub']);
        assert.deepStrictEqual(fs.readdirSync(elsewhere), ['sub']);
        return;
    }
    // the folder the text names is outside every tmpdir.ts folder: refused, nothing written
    const refused = w.run(w.inventory, w.answers, '--out', through('to-outside', 'victim.json'));
    assert.strictEqual(refused.status, 2, refused.stderr);
    assert.deepStrictEqual(fs.readdirSync(outside), ['sub']);
    // the folder it names is another of ours: written there, the folder that was checked
    const written = w.run(w.inventory, w.answers, '--out', through('to-ours', 'planned.json'));
    assert.strictEqual(written.status, 0, written.stderr);
    assert.ok(fs.existsSync(path.join(elsewhere, 'planned.json')));
    assert.ok(!fs.existsSync(path.join(w.dir, 'planned.json')));
    // a record file through the same link is refused the same way
    const record = w.run('--skip', through('to-outside', 'inventory.json'), w.picks, w.answers, 'gitlab');
    assert.strictEqual(record.status, 2, record.stderr);
});

test('--out with no file name (a folder, ..) is refused with exit 2, not a crash', (t) => {
    const w = work(t, I, {}, { picks: { gitlab: {} } });
    for (const out of [`${w.dir}${path.sep}..`, `${w.dir}${path.sep}.`, w.dir])
    {
        const refused = w.run(w.inventory, w.answers, '--out', out);
        assert.strictEqual(refused.status, 2, `${out}: ${refused.stderr}`);
        assert.match(refused.stderr, /^plan\.mjs: --out/);
    }
});
