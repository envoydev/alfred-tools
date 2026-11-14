'use strict';
// serena-config.js - base_modes: [] in <SERENA_HOME>/serena_config.yml (spec D7, F9). The file holds Serena's
// auth_secret: the edit reads only the key it changes, touches no other byte and never prints the file.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sc = require('../scripts/apply/serena-config.js');
const { plan } = require('../scripts/plan/plan.js');

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pt-serena-')));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
let n = 0;
const fileWith = (text) => { const d = path.join(tmp, `h${++n}`); fs.mkdirSync(d); const f = path.join(d, 'serena_config.yml'); fs.writeFileSync(f, text); return f; };
const SECRET = 'auth_secret: s3cr3t-fixture';

test('the base-modes edit changes only base_modes and the secret line is byte-identical', () => {
    const text = `web_dashboard: false\nbase_modes:\n- interactive\n- editing\n${SECRET}\n`;
    const f = fileWith(text);
    assert.strictEqual(sc.baseModesState(f), 'set');
    const r = sc.emptyBaseModes(f);
    assert.strictEqual(r.changed, true);
    const after = fs.readFileSync(f, 'utf8');
    assert.strictEqual(after, `web_dashboard: false\nbase_modes: []\n${SECRET}\n`);
    assert.strictEqual((after.match(/base_modes: \[\]/g) || []).length, 1);
    assert.strictEqual(sc.baseModesState(f), 'empty');
    assert.deepStrictEqual(sc.emptyBaseModes(f).changed, false, 'a second run changes nothing');
    assert.ok(!r.detail.includes('s3cr3t'), 'the detail never quotes the file');
    // the inline form, indented items, CRLF and a mode of 600 kept
    const g = fileWith(`a: 1\r\nbase_modes: [interactive, editing]\r\n${SECRET}\r\n`);
    if (process.platform !== 'win32') fs.chmodSync(g, 0o600);
    sc.emptyBaseModes(g);
    assert.strictEqual(fs.readFileSync(g, 'utf8'), `a: 1\r\nbase_modes: []\r\n${SECRET}\r\n`);
    if (process.platform !== 'win32') assert.strictEqual(fs.statSync(g).mode & 0o777, 0o600);
    const h = fileWith(`base_modes:\n  - interactive\n  - editing\n\n${SECRET}\n`);
    sc.emptyBaseModes(h);
    assert.strictEqual(fs.readFileSync(h, 'utf8'), `base_modes: []\n\n${SECRET}\n`);
    // no key: appended once; no file: nothing written
    const k = fileWith(`${SECRET}\n`);
    assert.strictEqual(sc.baseModesState(k), 'absent');
    sc.emptyBaseModes(k);
    assert.strictEqual(fs.readFileSync(k, 'utf8'), `${SECRET}\nbase_modes: []\n`);
    const none = path.join(tmp, 'none', 'serena_config.yml');
    assert.strictEqual(sc.baseModesState(none), 'absent');
    assert.deepStrictEqual(sc.emptyBaseModes(none).changed, false);
    assert.ok(!fs.existsSync(none));
});

test('the base-modes edit prints nothing', () => {
    const f = fileWith(`base_modes:\n- interactive\n${SECRET}\n`);
    const out = [];
    const keep = { log: console.log, err: console.error, write: process.stdout.write, ew: process.stderr.write };
    console.log = (...a) => out.push(a.join(' '));
    console.error = (...a) => out.push(a.join(' '));
    process.stdout.write = (s) => { out.push(String(s)); return true; };
    process.stderr.write = (s) => { out.push(String(s)); return true; };
    try { sc.baseModesState(f); sc.emptyBaseModes(f); }
    finally { console.log = keep.log; console.error = keep.err; process.stdout.write = keep.write; process.stderr.write = keep.ew; }
    assert.strictEqual(out.join(''), '');
});

test('an alfred-code 2.x home is not edited', () => {
    const home = path.join(tmp, 'proj', '.alfred', 'serena', 'home');
    assert.deepStrictEqual(sc.editableHome(home, { platform: 'darwin' }).ok, false);
    assert.match(sc.editableHome(home, { platform: 'darwin' }).reason, /alfred-code's - base_modes is left/);
    assert.deepStrictEqual(sc.editableHome('C:\\work\\shop\\.alfred\\serena\\home', { platform: 'win32', home: 'C:\\Users\\me' }).ok, false);
    assert.deepStrictEqual(sc.editableHome(path.join(tmp, 'proj', '.preferred-tools', 'serena'), { platform: 'darwin' }), { ok: true, shared: false });
});

test('a Windows <profile>\\.serena home is edited and the plan carries the shared-file line', () => {
    assert.deepStrictEqual(sc.editableHome('C:\\Users\\me\\.serena', { platform: 'win32', home: 'C:\\Users\\me' }), { ok: true, shared: true });
    assert.deepStrictEqual(sc.editableHome('C:\\serena-home', { platform: 'win32', home: 'C:\\Users\\Jo Smith' }), { ok: true, shared: true });
    const entry = { command: 'uvx', args: [], env: { SERENA_HOME: 'C:\\Users\\me\\.serena' } };
    assert.strictEqual(sc.planNote(entry, { platform: 'win32', home: 'C:\\Users\\me' }), 'serena\'s settings at C:\\Users\\me\\.serena\\serena_config.yml are shared with any other Serena on this machine; base_modes: [] applies to all of them');
});

test('install\'s plan carries the base_modes line for each serena home kind', () => {
    const inv = { version: 1, os: 'darwin', arch: 'arm64', project: '/work/shop', cli: { ok: true }, unreadable: [], registrations: [], plugins: [], pluginServers: [], marketplaces: [], alfredCodeEnabled: false, sources: {} };
    const p = plan(inv, { picks: { serena: { scope: 'project' } } }, { home: '/h', env: {}, exists: () => false, machine: { docker: true } });
    assert.deepStrictEqual(p.errors, []);
    const home = p.steps.find((s) => s.op === 'mcp-add').entry.env.SERENA_HOME;
    assert.ok(p.notes.includes(`serena's settings at ${home}/serena_config.yml: base_modes: [] after its first start, so its manual names only the tools it has`), p.notes.join('\n'));
    // an alfred-code 2.x home
    const alfred = { command: 'uvx', args: [], env: { SERENA_HOME: '/work/shop/.alfred/serena/home' } };
    assert.strictEqual(sc.planNote(alfred, { platform: 'darwin' }), 'serena\'s settings at /work/shop/.alfred/serena/home/serena_config.yml are alfred-code\'s - base_modes is left; its manual still names edit tools serena does not have');
    assert.strictEqual(sc.planNote({ command: 'uvx', args: [] }, { platform: 'darwin' }), null);
});
