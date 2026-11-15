// Every child process the scripts start is hidden on Windows: without `windowsHide` a console window flashes on
// screen each time git, npm or the claude CLI runs.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const SCRIPTS = path.join(import.meta.dirname, '..', 'scripts');
const PROCESS_START = /\b(?:spawnSync|spawn|execFileSync|execSync|execFile)\(/g;
const HIDDEN = 'windowsHide: true';

function sourceFiles(dir: string): string[]
{
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) return sourceFiles(file);
        return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [file] : [];
    });
}

// The text of a call, from its name to the parenthesis that closes it.
function callText(source: string, start: number): string
{
    let depth = 0;
    for (let index = source.indexOf('(', start); index < source.length; index++)
    {
        if (source[index] === '(') depth++;
        else if (source[index] === ')' && --depth === 0) return source.slice(start, index + 1);
    }
    return source.slice(start);
}

// A call is hidden when it spells the option itself, or passes options declared with it in the same file.
function isHidden(call: string, source: string): boolean
{
    if (call.includes(HIDDEN)) return true;
    const named = /(?:\.\.\.|,\s*)([A-Za-z_]\w*)\s*(?:,\s*shell: true\s*)?\}?\)$/.exec(call)?.[1];
    if (named === undefined) return false;
    const declaration = new RegExp(`\\bconst ${named} = \\{[^\\n]*`).exec(source)?.[0] ?? '';
    return declaration.includes(HIDDEN);
}

test('no script starts a child process that would open a console window on Windows', () =>
{
    const visible: string[] = [];
    for (const file of sourceFiles(SCRIPTS))
    {
        const source = fs.readFileSync(file, 'utf8');
        for (const match of source.matchAll(PROCESS_START))
        {
            if (isHidden(callText(source, match.index), source)) continue;
            const line = source.slice(0, match.index).split('\n').length;
            visible.push(`${path.relative(SCRIPTS, file)}:${line}`);
        }
    }

    assert.deepStrictEqual(visible, []);
});
