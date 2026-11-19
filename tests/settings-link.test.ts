// The settings writers and a linked settings.json: a dotfiles manager links Claude Code's settings file, and the temp-file
// rename of writeJson would replace the link with a plain file. The writers write the target and keep the link.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readJson, writeJson } from './helpers.ts';
import { denyRead, settingsEnv } from '../scripts/apply/file-steps.ts';

const POSIX_ONLY = { skip: process.platform === 'win32' ? 'a symbolic link needs a privilege the Windows runner may lack' : false };
const RULE = 'Read(//**/mcp-remote-v1/**)';

// each test makes its own temp home: <dir>/dotfiles/settings.json is the real file, <dir>/.claude/settings.json the link
function linked(content: unknown | null): { dir: string; link: string; real: string }
{
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pt-link-')));
    const real = path.join(dir, 'dotfiles', 'settings.json');
    const link = path.join(dir, '.claude', 'settings.json');
    if (content !== null) writeJson(real, content);
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(real, link);
    return { dir, link, real };
}

test('settingsEnv writes through a linked settings.json and keeps the link', POSIX_ONLY, () =>
{
    const { dir, link, real } = linked({ theme: 'dark' });
    try
    {
        assert.strictEqual(settingsEnv(link, { MCP_TIMEOUT: '90000' }).ok, true);
        assert.strictEqual(fs.lstatSync(link).isSymbolicLink(), true);
        assert.deepStrictEqual(readJson(real), { theme: 'dark', env: { MCP_TIMEOUT: '90000' } });
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('denyRead writes through a linked settings.json and keeps the link', POSIX_ONLY, () =>
{
    const { dir, link, real } = linked({ theme: 'dark' });
    try
    {
        assert.strictEqual(denyRead(link, [RULE]).ok, true);
        assert.strictEqual(fs.lstatSync(link).isSymbolicLink(), true);
        assert.deepStrictEqual(readJson(real), { theme: 'dark', permissions: { deny: [RULE] } });
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a dangling link is refused, named, and nothing is written', POSIX_ONLY, () =>
{
    const { dir, link, real } = linked(null);
    try
    {
        for (const result of [settingsEnv(link, { MCP_TIMEOUT: '90000' }), denyRead(link, [RULE])])
        {
            assert.strictEqual(result.ok, false);
            assert.ok(result.detail.includes(link), result.detail);
            assert.ok(result.detail.includes('is a link to a file that is not there'), result.detail);
        }
        assert.strictEqual(fs.lstatSync(link).isSymbolicLink(), true);
        assert.strictEqual(fs.existsSync(real), false);
        assert.deepStrictEqual(fs.readdirSync(path.dirname(link)), ['settings.json']);
        assert.strictEqual(fs.existsSync(path.dirname(real)), false);
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
