'use strict';
// declines.js - the retired-plugin uninstall offers the user declined (spec D9), in <plugin data>/retired-declined.json.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const declines = require('../scripts/core/declines.js');

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
