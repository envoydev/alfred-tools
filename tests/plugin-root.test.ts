import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findPluginRoot, pluginRoot } from '../scripts/core/plugin-root.ts';
import { CATALOG_DIR } from '../scripts/catalog/catalog.ts';
import { PLUGIN_MANIFEST } from '../scripts/core/constants.ts';

const REPO = path.join(import.meta.dirname, '..');

function tempDir(): string
{
    return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pt-root-')));
}

test('findPluginRoot walks up to the folder that holds the manifest', () =>
{
    const tmp = tempDir();
    try
    {
        const manifest = path.join(tmp, 'a', PLUGIN_MANIFEST);
        fs.mkdirSync(path.dirname(manifest), { recursive: true });
        fs.writeFileSync(manifest, '{}');
        const start = path.join(tmp, 'a', 'x', 'y');
        fs.mkdirSync(start, { recursive: true });
        assert.strictEqual(findPluginRoot(start), path.join(tmp, 'a'));
    }
    finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('findPluginRoot names the start folder when no manifest is above it', () =>
{
    const tmp = tempDir();
    try
    {
        assert.throws(() => findPluginRoot(tmp), (error: unknown) => error instanceof Error && error.message === `alfred-tools: no ${PLUGIN_MANIFEST} above ${tmp}`);
    }
    finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('pluginRoot is the repo root, and the catalog sits under it', () =>
{
    assert.strictEqual(pluginRoot(), REPO);
    assert.strictEqual(CATALOG_DIR, path.join(REPO, 'catalog'));
});
