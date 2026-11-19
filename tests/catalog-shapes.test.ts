// catalog/shapes.ts - the catalog's three JSON files are checked by their top level before a reader takes them: a file
// of another shape stops the load, or refresh-pins, with the file named, never a TypeError later.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { load, CATALOG_DIR } from '../scripts/catalog/catalog.ts';
import { runRefreshPinsCommand } from '../scripts/catalog/refresh-pins.ts';

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pt-catalog-shapes-')));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const FILES = ['tools.json', 'reserved-names.json', 'fixes.json'];
// A catalog folder with the shipped files, one of them replaced by `text`.
const catalogWith = (name: string, text: string): string =>
{
    const dir = fs.mkdtempSync(path.join(tmp, 'c-'));
    for (const file of FILES) fs.copyFileSync(path.join(CATALOG_DIR, file), path.join(dir, file));
    fs.writeFileSync(path.join(dir, name), text);
    return dir;
};

test('load refuses a tools.json of another shape, naming the file', () => {
    const dir = catalogWith('tools.json', JSON.stringify({ tools: [{ name: 'no id' }], rules: {}, groups: [], order: [] }));
    assert.throws(() => load(dir), { message: `catalog: ${path.join(dir, 'tools.json')} is not in the shape alfred-tools ships - reinstall the plugin` });
});

test('load refuses a reserved-names.json of another shape, naming the file', () => {
    const dir = catalogWith('reserved-names.json', JSON.stringify({ names: 'serena' }));
    assert.throws(() => load(dir), { message: `catalog: ${path.join(dir, 'reserved-names.json')} is not in the shape alfred-tools ships - reinstall the plugin` });
});

test('load refuses a fixes.json of another shape, naming the file', () => {
    const dir = catalogWith('fixes.json', JSON.stringify({ fixes: {} }));
    assert.throws(() => load(dir), { message: `catalog: ${path.join(dir, 'fixes.json')} is not in the shape alfred-tools ships - reinstall the plugin` });
});

test('the shipped catalog passes every check', () => {
    assert.ok(load().byId.size > 0);
});

test('refresh-pins refuses a tools.json of another shape with exit 2 and one line naming it', async () => {
    const file = path.join(tmp, 'tools-bad.json');
    fs.writeFileSync(file, JSON.stringify({ tools: 'none' }));
    const lines: string[] = [];
    assert.strictEqual(await runRefreshPinsCommand([], { file, out: (text) => lines.push(text) }), 2);
    assert.deepStrictEqual(lines, [`refresh-pins: ${file} is not a tools.json of rows, rules, groups and order - nothing read`]);
});

test('load refuses a tools.json with no retired list, or one retiring an id a row still has; the shipped list is empty (spec D3)', () => {
    const tools: Record<string, unknown> = JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, 'tools.json'), 'utf8'));
    const refused = (text: string) => { const dir = catalogWith('tools.json', text); assert.throws(() => load(dir), { message: `catalog: ${path.join(dir, 'tools.json')} is not in the shape alfred-tools ships - reinstall the plugin` }); };
    const without = { ...tools };
    delete without['retired'];
    refused(JSON.stringify(without));
    refused(JSON.stringify({ ...tools, retired: [{ id: 'serena', fingerprints: [{ pkg: 'serena-agent' }], since: '0.7.0', reason: 'test fixture' }] }));
    refused(JSON.stringify({ ...tools, retired: [{ id: 'old-tool', fingerprints: [{ pkg: 'old-tool-mcp' }], since: '0.7.0' }] }));
    const ok = catalogWith('tools.json', JSON.stringify({ ...tools, retired: [{ id: 'old-tool', fingerprints: [{ pkg: 'old-tool-mcp' }], since: '0.7.0', reason: 'test fixture' }] }));
    assert.deepStrictEqual(load(ok).retired.map((entry) => entry.id), ['old-tool']);
    assert.deepStrictEqual(load().retired, []);
});
