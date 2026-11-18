// replace-file.ts: a file written whole through a temporary file and a rename.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { replaceFile } from '../scripts/core/replace-file.ts';

test('replaceFile leaves no temporary file when the rename fails, and the error reaches the caller', () =>
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-replace-'));
    try
    {
        // a folder that holds a file cannot be renamed over, on any OS
        const target = path.join(dir, 'taken');
        fs.mkdirSync(path.join(target, 'inside'), { recursive: true });
        assert.throws(() => replaceFile(target, 'text\n'));
        assert.deepStrictEqual(fs.readdirSync(dir), ['taken']);
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
