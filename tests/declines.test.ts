// declines.ts - the retired-plugin uninstall offers the user declined (spec D9), in <plugin data>/retired-declined.json.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as declines from '../scripts/core/declines.ts';

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pt-declines-')));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
let n = 0;
const dataDir = () => { const d = path.join(tmp, `d${++n}`); fs.mkdirSync(d); return d; };

test('declines: none at first; added ones read back once each, the file versioned', () =>
{
    const d = dataDir();
    assert.deepStrictEqual(declines.read(d), []);
    const r = declines.add(d, [{ id: 'claude-hud@claude-hud', scope: 'user' }, { id: 'typescript-lsp@claude-plugins-official', scope: 'project' }]);
    assert.strictEqual(r.ok, true);
    declines.add(d, [{ id: 'claude-hud@claude-hud', scope: 'user' }]);
    assert.deepStrictEqual(declines.read(d), [{ id: 'claude-hud@claude-hud', scope: 'user' }, { id: 'typescript-lsp@claude-plugins-official', scope: 'project' }]);
    const doc = JSON.parse(fs.readFileSync(path.join(d, 'retired-declined.json'), 'utf8'));
    assert.strictEqual(doc.version, 1);
    assert.strictEqual(doc.declined.length, 2);
    assert.deepStrictEqual(fs.readdirSync(d), ['retired-declined.json'], 'no temporary file left');
});

test('declines: no data folder writes nothing and says so; a malformed file reads as none and is not overwritten silently', () =>
{
    const r = declines.add(null, [{ id: 'claude-hud@claude-hud', scope: 'user' }]);
    assert.deepStrictEqual(r, { ok: false, detail: 'no plugin data folder given - the decline is not recorded, so the offer comes back next time' });
    assert.deepStrictEqual(declines.read(null), []);
    const d = dataDir();
    fs.writeFileSync(path.join(d, 'retired-declined.json'), '{ nope');
    assert.deepStrictEqual(declines.read(d), []);
    const bad = declines.add(d, [{ id: 'claude-hud@claude-hud', scope: 'user' }]);
    assert.strictEqual(bad.ok, false);
    assert.match(bad.detail, /is not JSON - nothing recorded/);
    assert.strictEqual(fs.readFileSync(path.join(d, 'retired-declined.json'), 'utf8'), '{ nope');
});

test('declines: parse reads <id>~<scope>,... and refuses an item with no scope', () =>
{
    assert.deepStrictEqual(declines.parse('claude-hud@claude-hud~user,csharp-lsp@claude-plugins-official~local'), [{ id: 'claude-hud@claude-hud', scope: 'user' }, { id: 'csharp-lsp@claude-plugins-official', scope: 'local' }]);
    assert.deepStrictEqual(declines.parse(''), []);
    assert.throws(() => declines.parse('claude-hud@claude-hud'), /retired-declined needs <id>~<scope>/);
});

test('declines: a file saved with a byte order mark reads as its declines, and an add keeps them', () =>
{
    const d = dataDir();
    fs.writeFileSync(path.join(d, 'retired-declined.json'), `\uFEFF${JSON.stringify({ version: 1, declined: [{ id: 'claude-hud@claude-hud', scope: 'user' }] })}`);
    assert.deepStrictEqual(declines.read(d), [{ id: 'claude-hud@claude-hud', scope: 'user' }]);
    assert.strictEqual(declines.add(d, [{ id: 'csharp-lsp@claude-plugins-official', scope: 'local' }]).ok, true);
    assert.deepStrictEqual(declines.read(d), [{ id: 'claude-hud@claude-hud', scope: 'user' }, { id: 'csharp-lsp@claude-plugins-official', scope: 'local' }]);
});

test('declines: an unreadable file is not taken for no file - an add refuses and leaves it', { skip: (process.platform === 'win32' || process.getuid?.() === 0) && 'NOT RUN: POSIX modes, and root reads any file' }, () =>
{
    const d = dataDir();
    const file = path.join(d, 'retired-declined.json');
    fs.writeFileSync(file, JSON.stringify({ version: 1, declined: [{ id: 'claude-hud@claude-hud', scope: 'user' }] }));
    fs.chmodSync(file, 0o000);
    try
    {
        const refused = declines.add(d, [{ id: 'csharp-lsp@claude-plugins-official', scope: 'local' }]);
        assert.strictEqual(refused.ok, false);
        assert.match(refused.detail, /cannot be read or is not JSON - nothing recorded/);
    }
    finally { fs.chmodSync(file, 0o600); }
    assert.deepStrictEqual(declines.read(d), [{ id: 'claude-hud@claude-hud', scope: 'user' }]);
});
