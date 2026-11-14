import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { parseAskBlocks, problemsOf, staticAsk } from './ask-blocks.ts';
import { logicalRoot } from '../scripts/entries/locations.ts';
import { currentOf } from '../scripts/entries/entry.ts';
import { STATIC } from '../scripts/plan/asks-other.ts';

const block = (body, id = 'menu') => parseAskBlocks(`\`\`\`ask${id ? ` ${id}` : ''}\n${body}\n\`\`\``)[0];
const GOOD = "What do you want to change?\n- 'Change tools (Recommended)' - a\n- 'Remove tools' - b\n- 'Done' - d";

test('a sound block parses and has no problems; a block may omit an option the walk omits, never reorder one', () =>
{
    const b = block(GOOD);
    assert.strictEqual(b.options.length, 3, 'the menu has no claude-hud item since 0.5.0');
    assert.strictEqual(b.question, 'What do you want to change?');
    assert.deepStrictEqual(problemsOf(b), []);
    assert.deepStrictEqual(problemsOf(block("What do you want to change?\n- 'Change tools (Recommended)' - a\n- 'Done' - d")), [], 'Remove tools left out when nothing is installed');
    assert.match(problemsOf(block("What do you want to change?\n- 'Change tools (Recommended)' - a\n- 'claude-hud settings' - c\n- 'Done' - d")).join(), /do not match asks\.STATIC\.menu/, 'the configure menu has no claude-hud item');
    assert.match(problemsOf(block("What do you want to change?\n- 'Change tools (Recommended)' - a\n- 'Done' - d\n- 'Remove tools' - b")).join(), /do not match asks\.STATIC\.menu/);
});

test('every way a block can break the limits is named', () =>
{
    const bad = (body, id) => problemsOf(block(body, id)).join(' | ');
    assert.match(bad("Q?\n- 'Only (Recommended)' - a"), /1 options \(2 to 4 allowed\)/);
    assert.match(bad("Q?\n- 'A (Recommended)' - a\n- 'B' - b\n- 'C' - c\n- 'D' - d\n- 'E' - e", null), /5 options/);
    assert.match(bad("Q?\n- 'A' - a\n- 'B' - b", null), /0 options marked \(Recommended\)/);
    assert.match(bad("Q?\n- 'A (Recommended)' - a\n- 'B (Recommended)' - b", null), /2 options marked \(Recommended\)/);
    assert.match(bad("Q?\n- 'A' - a\n- 'B (Recommended)' - b", null), /must be listed first/);
    assert.match(bad("- 'A (Recommended)' - a\n- 'B' - b", null), /no question/);
    assert.match(bad("Q?\n- A (Recommended) - a\n- 'B' - b", null), /not written as/);
    assert.match(bad(GOOD, 'no-such-ask'), /not a key of asks\.STATIC/);
    assert.match(bad(GOOD, null), /no id after/);
    assert.match(problemsOf(parseAskBlocks('```ask menu\nQ?\n- \'A (Recommended)\' - a')[0]).join(), /never closed/);
});

test('a command file with CRLF line endings - a Windows checkout under Git\'s default autocrlf - parses as with LF', () => {
    const lf = fs.readFileSync(path.join(import.meta.dirname, '..', 'commands', 'configure.md'), 'utf8').replace(/\r\n/g, '\n');
    const crlf = lf.replace(/\n/g, '\r\n');
    assert.deepStrictEqual(parseAskBlocks(crlf), parseAskBlocks(lf));
    assert.deepStrictEqual(parseAskBlocks(crlf).flatMap(problemsOf), []);
});

test('the commands hold every ask block to the limits', () =>
{
    const root = path.join(import.meta.dirname, '..');
    let seen = 0;
    const walk = (d) => fs.existsSync(d) && fs.readdirSync(d, { withFileTypes: true }).forEach((e) =>
    {
        const p = path.join(d, e.name);
        if (e.isDirectory()) return walk(p);
        if (!p.endsWith('.md')) return;
        for (const b of parseAskBlocks(fs.readFileSync(p, 'utf8')))
        {
            seen++;
            assert.deepStrictEqual(problemsOf(b), [], p);
        }
    });
    walk(path.join(root, 'commands'));
    walk(path.join(root, 'skills'));
    assert.ok(seen >= 9, `${seen} ask blocks found; install.md has three, configure.md five, update.md one`);
});

test('the walks write what the step sets (`next.set`, the one location left) and make no call for an empty one', () => {
    const root = path.join(import.meta.dirname, '..');
    for (const file of ['install.md', 'configure.md'])
    {
        const text = fs.readFileSync(path.join(root, 'commands', file), 'utf8').replace(/\s+/g, ' ');
        assert.ok(text.includes('`next.set`'), `${file} names next.set`);
        assert.match(text, /When `next\.call` is empty, make no call/, `${file} skips an empty call`);
    }
});

test("install maps both API key answers: 'No key' is written, since 'Use a key from .mcps-secrets' is the default when a key is found", () => {
    const text = fs.readFileSync(path.join(import.meta.dirname, '..', 'commands', 'install.md'), 'utf8');
    const row = text.split('\n').find((l) => l.startsWith('| API key'));
    // the labels toolAsk prints (scripts/plan/asks-other.ts), each mapped
    for (const label of ['Use a key from .mcps-secrets', 'No key - lower rate limits', 'Sign in with OAuth']) assert.ok(row && row.includes(`'${label}'`), `${label}: ${row}`);
    assert.ok(row.includes('"token": true') && row.includes('"token": false'), row);
});

test('install has no step for servers already set up', () => {
    const text = fs.readFileSync(path.join(import.meta.dirname, '..', 'commands', 'install.md'), 'utf8');
    assert.deepStrictEqual(text.split('\n').filter((l) => /^## /.test(l) && /already set up/.test(l)), []);
    assert.ok(!text.includes('existing.calls'));
});

test('asks.js never requires plan.js: the shared readers (currentOf, logicalRoot) live in entries.js, so there is no require cycle', () => {
    const plan = path.join(import.meta.dirname, '..', 'scripts', 'plan');
    const asks = fs.readdirSync(plan).filter((x) => /^(asks-.*|walk)\.ts$/.test(x));
    assert.ok(asks.length >= 8, `the asks split: ${asks.join(', ')}`);
    for (const f of asks)
        assert.doesNotMatch(fs.readFileSync(path.join(plan, f), 'utf8'), /^\s*(?:import|export)\b[^;]*?\bfrom\s+'(?:\.\/|\.\.\/plan\/)(plan|context|pick|change|render|command)\.ts'/m, f);
    assert.strictEqual(typeof currentOf, 'function');
    assert.deepStrictEqual(logicalRoot('/work/shop/.preferred-tools/serena', { platform: 'darwin', project: '/work/shop', home: '/Users/me' }), { kind: 'project', rel: '.preferred-tools/serena' });
    assert.deepStrictEqual(logicalRoot('/Users/me/.preferred-tools/serena', { platform: 'darwin', project: '/work/shop', home: '/Users/me' }), { kind: 'home', rel: '.preferred-tools/serena' });
});

test('staticAsk fills a STATIC function\'s own placeholders', () => {
    assert.deepStrictEqual(STATIC['cursor-name-taken'].placeholders, ['<file>', '<name>']);
    const q = staticAsk('cursor-name-taken');
    assert.match(q.question, /^Cursor's <file> already has a server named <name> that preferred-tools did not write/);
    assert.deepStrictEqual(q.options.map((o) => o.label), ["Replace it with the plugin's (Recommended)", "Keep Cursor's own"]);
    // a function with no placeholders of its own still gets '<n>', '<m>', '<k>'
    assert.match(staticAsk('prereqMissing').question, /^<n> needs <m>, which is missing/);
    // install and configure both carry the block, and it is sound
    for (const cmd of ['install.md', 'configure.md'])
    {
        const blocks = parseAskBlocks(fs.readFileSync(path.join(import.meta.dirname, '..', 'commands', cmd), 'utf8')).filter((b) => b.id === 'cursor-name-taken');
        assert.strictEqual(blocks.length, 1, cmd);
        assert.deepStrictEqual(problemsOf(blocks[0]), [], cmd);
    }
});
