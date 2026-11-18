// The passages the commands carry word for word. Each is wrapped in `<!-- shared:<name> -->` and `<!-- /shared:<name> -->`,
// each marker alone on its line and never inside a fenced block, and listed in REGISTRY with the command files that
// carry it. A copy that drifts - one word changed in one file - fails here, so a fix to a shared passage goes into
// every copy or into none.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const COMMANDS = path.join(import.meta.dirname, '..', 'commands');
const NAME = /^[a-z][a-z0-9-]*$/;
const MARKER = /^<!-- (\/?)shared:(\S+) -->$/;
const LOOSE_MARKER = /<!--\s*\/?\s*shared:/;

// The registry: a passage name -> the command files that carry it.
const REGISTRY: Record<string, string[]> = {
    'sign-in': ['install.md', 'configure.md', 'update.md'],
    fetch: ['install.md', 'configure.md', 'update.md', 'fix.md'],
    rules: ['install.md', 'configure.md'],
    'inventory-table': ['install.md', 'configure.md'],
    'walk-steps': ['install.md', 'configure.md'],
    'typed-values': ['install.md', 'configure.md'],
    prereq: ['install.md', 'configure.md'],
    'cursor-name': ['install.md', 'configure.md'],
    'apply-ask': ['install.md', 'configure.md'],
    'key-lines': ['install.md', 'configure.md'],
};

interface Copy
{
    name: string;
    line: number;
    text: string;
}

const readCommand = (file: string): string => fs.readFileSync(path.join(COMMANDS, file), 'utf8').replace(/\r\n/g, '\n');
const commandFiles = (): string[] => fs.readdirSync(COMMANDS).filter((file) => file.endsWith('.md')).sort();

// -> the copies in a command's text, in order; a marker that is not alone on its line, sits inside a fenced block, is
// opened twice, is closed without being open or names another passage than the open one, is a problem returned in
// `problems`. A fence is a line of three backticks or tildes, indented or not.
function copiesIn(text: string, file: string): { copies: Copy[]; problems: string[] }
{
    const copies: Copy[] = [];
    const problems: string[] = [];
    let open: { name: string; line: number; lines: string[] } | null = null;
    let fenced = false;
    for (const [index, line] of text.split('\n').entries())
    {
        const at = `${file}:${index + 1}`;
        if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
        const marker = MARKER.exec(line);
        if (!marker)
        {
            if (LOOSE_MARKER.test(line)) problems.push(`${at}: a shared marker must be alone on its line, as <!-- shared:<name> -->`);
            open?.lines.push(line);
            continue;
        }
        if (fenced) problems.push(`${at}: a shared marker inside a fenced block`);
        const [, closing, name] = marker as unknown as [string, string, string];
        if (!closing)
        {
            if (open) problems.push(`${at}: shared:${name} opens inside shared:${open.name}, which is still open`);
            else open = { name, line: index + 1, lines: [] };
        }
        else if (open?.name !== name) problems.push(`${at}: /shared:${name} closes nothing`);
        else
        {
            copies.push({ name, line: open.line, text: open.lines.join('\n') });
            open = null;
        }
    }
    if (open) problems.push(`${file}:${open.line}: shared:${open.name} is never closed`);
    return { copies, problems };
}

const copiesOf = (file: string): { copies: Copy[]; problems: string[] } => copiesIn(readCommand(file), file);

test('a marker inside a fenced block, indented or tilde, or not alone on its line, is a problem', () =>
{
    const inside = (fence: string): string[] => copiesIn(`${fence}\n<!-- shared:one -->\ntext\n<!-- /shared:one -->\n${fence}`, 'x.md').problems;
    assert.strictEqual(inside('```').length, 2);
    assert.strictEqual(inside('   ```').length, 2);
    assert.strictEqual(inside('~~~').length, 2);
    assert.strictEqual(copiesIn('a <!-- shared:one --> b', 'x.md').problems.length, 1);
    assert.deepStrictEqual(copiesIn('<!-- shared:one -->\ntext\n<!-- /shared:one -->', 'x.md'), { copies: [{ name: 'one', line: 1, text: 'text' }], problems: [] });
});

test('every marker sits alone on its line, outside a fenced block, opened and closed in order', () =>
{
    for (const file of commandFiles()) assert.deepStrictEqual(copiesOf(file).problems, [], file);
});

test('every registered passage is in each listed command once', () =>
{
    for (const [name, files] of Object.entries(REGISTRY))
    {
        assert.ok(NAME.test(name), `'${name}' is a lower-case name with digits and dashes`);
        assert.ok(files.length >= 2, `'${name}' is carried by two or more commands`);
        for (const file of files)
        {
            const found = copiesOf(file).copies.filter((copy) => copy.name === name);
            assert.strictEqual(found.length, 1, `${file} carries shared:${name} ${found.length} times (once)`);
        }
    }
});

test('every copy of a registered passage is byte-identical', () =>
{
    for (const [name, files] of Object.entries(REGISTRY))
    {
        const texts = files.map((file) => ({ file, text: copiesOf(file).copies.find((copy) => copy.name === name)?.text }));
        const [first, ...rest] = texts;
        assert.ok(first && first.text !== undefined && first.text.trim() !== '', `${first?.file} carries a non-empty shared:${name}`);
        for (const other of rest) assert.strictEqual(other.text, first.text, `shared:${name} differs between ${first.file} and ${other.file}`);
    }
});

test('every marker names a registered passage', () =>
{
    for (const file of commandFiles())
        for (const copy of copiesOf(file).copies)
        {
            assert.ok(NAME.test(copy.name), `${file}:${copy.line}: '${copy.name}' is a lower-case name with digits and dashes`);
            assert.ok(copy.name in REGISTRY, `${file}:${copy.line}: shared:${copy.name} is not in the registry of tests/shared-passages.test.ts`);
        }
});

test('no command carries a passage it is not listed for', () =>
{
    for (const file of commandFiles())
        for (const copy of copiesOf(file).copies)
            assert.ok(REGISTRY[copy.name]?.includes(file), `${file}:${copy.line}: shared:${copy.name} is not listed for ${file}`);
});
