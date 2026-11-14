// The rename driver (tests/proof/rename.ts): TypeScript's rename service over a tree, keeping shorthand keys, telling
// two bindings on a line apart by column, and refusing a stored field or a function catalog/fixes.json names.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DRIVER = path.join(import.meta.dirname, 'proof', 'rename.ts');

interface RenameItem
{
    file: string;
    line: number;
    column: number;
    name: string;
    to: string;
}

// A throwaway tree with a tsconfig over its .ts files, the given files, and the run of the driver over `items`.
function tree(files: Record<string, string>): string
{
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-rename-'));
    const config = { compilerOptions: { target: 'es2023', module: 'nodenext', moduleResolution: 'nodenext', noEmit: true, allowImportingTsExtensions: true, strict: true }, include: ['**/*.ts'] };
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify(config));
    for (const [file, text] of Object.entries(files))
    {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), text);
    }
    return root;
}
function rename(root: string, items: RenameItem[])
{
    const list = path.join(root, 'renames.json');
    fs.writeFileSync(list, JSON.stringify(items));
    return spawnSync(process.execPath, [DRIVER, list], { cwd: root, encoding: 'utf8' });
}
const read = (root: string, file: string) => fs.readFileSync(path.join(root, file), 'utf8');

test('a local used as a shorthand key keeps its key', () =>
{
    const root = tree({ 'a.ts': 'declare function f(x: { n: number }): void;\nconst n = 1; f({ n });\n' });
    try
    {
        const r = rename(root, [{ file: 'a.ts', line: 2, column: 7, name: 'n', to: 'count' }]);
        assert.equal(r.status, 0, r.stderr);
        assert.equal(read(root, 'a.ts'), 'declare function f(x: { n: number }): void;\nconst count = 1; f({ n: count });\n');
    }
    finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a parameter is renamed at every use across files', () =>
{
    const root = tree({
        'lib.ts': 'export function size(inv: string[]): number\n{\n    return inv.length;\n}\nexport const twice = (inv: string[]) => size(inv) * 2;\n',
        'use.ts': "import { size } from './lib.ts';\nexport const n = size(['a']);\n",
    });
    try
    {
        const r = rename(root, [{ file: 'lib.ts', line: 1, column: 22, name: 'inv', to: 'inventory' }]);
        assert.equal(r.status, 0, r.stderr);
        assert.equal(read(root, 'lib.ts'), 'export function size(inventory: string[]): number\n{\n    return inventory.length;\n}\nexport const twice = (inv: string[]) => size(inv) * 2;\n');
        assert.equal(read(root, 'use.ts'), "import { size } from './lib.ts';\nexport const n = size(['a']);\n");
    }
    finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('an exported function is renamed in the files that import it', () =>
{
    const root = tree({
        'lib.ts': 'export function all(): number[]\n{\n    return [1];\n}\n',
        'use.ts': "import { all } from './lib.ts';\nexport const n = all().length;\n",
    });
    try
    {
        const r = rename(root, [{ file: 'lib.ts', line: 1, column: 17, name: 'all', to: 'allQuestions' }]);
        assert.equal(r.status, 0, r.stderr);
        assert.equal(read(root, 'use.ts'), "import { allQuestions } from './lib.ts';\nexport const n = allQuestions().length;\n");
    }
    finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('two bindings of one name on a line are told apart by column', () =>
{
    const root = tree({ 'a.ts': 'export const b = [1].map((x) => x).map((x) => x + 1);\n' });
    try
    {
        const r = rename(root, [{ file: 'a.ts', line: 1, column: 41, name: 'x', to: 'count' }]);
        assert.equal(r.status, 0, r.stderr);
        assert.equal(read(root, 'a.ts'), 'export const b = [1].map((x) => x).map((count) => count + 1);\n');
    }
    finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a position that does not hold the name is refused and no file changes', () =>
{
    const text = 'export const b = [1].map((x) => x);\n';
    const root = tree({ 'a.ts': text });
    try
    {
        const r = rename(root, [{ file: 'a.ts', line: 1, column: 30, name: 'x', to: 'count' }]);
        assert.equal(r.status, 1);
        assert.match(r.stderr, /a\.ts:1:30 x -> count: the position holds/);
        assert.equal(read(root, 'a.ts'), text);
    }
    finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a stored property is refused and no file changes', () =>
{
    const types = 'export interface Row\n{\n    name: string; // stored - do not rename\n}\n';
    const use = "import type { Row } from './types.ts';\nexport const n = (r: Row) => r.name;\nexport const ok = 1;\n";
    const root = tree({ 'types.ts': types, 'use.ts': use });
    try
    {
        // the first item alone would pass: a refused item anywhere in the list writes nothing
        const r = rename(root, [
            { file: 'use.ts', line: 3, column: 14, name: 'ok', to: 'okay' },
            { file: 'use.ts', line: 2, column: 32, name: 'name', to: 'label' },
        ]);
        assert.equal(r.status, 1);
        assert.match(r.stderr, /use\.ts:2:32 name -> label: .*stored - do not rename/);
        assert.equal(read(root, 'types.ts'), types);
        assert.equal(read(root, 'use.ts'), use);
    }
    finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a function catalog/fixes.json names is refused and no file changes', () =>
{
    const text = 'export function keyStaleFix(): number\n{\n    return 1;\n}\n';
    const fixes = { fixes: [{ id: 'key-stale', detect: 'keyStaleDetect', fix: 'keyStaleFix' }, { id: 'modes', steps: 'modesSteps' }] };
    const root = tree({ 'fix.ts': text, 'catalog/fixes.json': JSON.stringify(fixes) });
    try
    {
        const r = rename(root, [{ file: 'fix.ts', line: 1, column: 17, name: 'keyStaleFix', to: 'fixKeyStale' }]);
        assert.equal(r.status, 1);
        assert.match(r.stderr, /fix\.ts:1:17 keyStaleFix -> fixKeyStale: catalog\/fixes\.json names it/);
        assert.equal(read(root, 'fix.ts'), text);
    }
    finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('several items apply in order, the later positions read against the original text', () =>
{
    const root = tree({ 'a.ts': 'export const f = (o: number, v: number) => o + v;\n' });
    try
    {
        const r = rename(root, [
            { file: 'a.ts', line: 1, column: 19, name: 'o', to: 'offset' },
            { file: 'a.ts', line: 1, column: 30, name: 'v', to: 'value' },
        ]);
        assert.equal(r.status, 0, r.stderr);
        assert.equal(read(root, 'a.ts'), 'export const f = (offset: number, value: number) => offset + value;\n');
        assert.match(r.stdout, /renamed 2 bindings at 4 places in 1 file/);
    }
    finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a name already in scope at any use is refused and no file changes', () =>
{
    const text = 'const row = 1;\nexport const f = (r: number) => r + row;\nexport const g = (r: number) => { const label = 2; return r + label; };\n';
    const root = tree({ 'a.ts': text });
    try
    {
        const outer = rename(root, [{ file: 'a.ts', line: 2, column: 19, name: 'r', to: 'row' }]);
        assert.equal(outer.status, 1);
        assert.match(outer.stderr, /a\.ts:2:19 r -> row: 'row' is already in scope at a\.ts:2:/);
        const inner = rename(root, [{ file: 'a.ts', line: 3, column: 19, name: 'r', to: 'label' }]);
        assert.equal(inner.status, 1);
        assert.match(inner.stderr, /'label' is already in scope at a\.ts:3:/);
        assert.equal(read(root, 'a.ts'), text);
    }
    finally { fs.rmSync(root, { recursive: true, force: true }); }
});
