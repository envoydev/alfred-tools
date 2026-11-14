// cursor-mcp.js - Cursor's mcp.json from the list (spec D2): read, refuse, compose, write, read back.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as catalogLib from '../scripts/catalog/catalog.ts';
import * as C from '../scripts/cursor/cursor-mcp.ts';
import { spawnSync } from 'node:child_process';
import { buildEntry, helperParts, bridgeParts } from '../scripts/entries/entry.ts';
import { signInFormOf, signInParts } from '../scripts/entries/sign-in.ts';
import type { CursorWriteStep, Managed } from '../scripts/cursor/types.ts';
import type { ServerEntry, ServerMap } from '../scripts/core/types.ts';
import type { ListServer } from '../scripts/mcps-list/types.ts';

const catalog = catalogLib.load();
const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pt-cursor-')));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
let n = 0;
const fresh = () => { const d = path.join(dir, `c${++n}`); fs.mkdirSync(d, { recursive: true }); return d; };
const write = (file: string, text: string) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const readDoc = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const SERENA = { command: 'uvx', args: ['--from', 'serena-agent@2.1.0', 'serena', 'start-mcp-server'] };
const MEMORY = { command: 'uvx', args: ['mcp-memory-service'] };
const C7 = { type: 'http', url: 'https://mcp.context7.com/mcp' };
const srv = (name: string, scope: string, entry: ServerEntry, extra: Partial<ListServer> = {}): ListServer => ({ name, scope, row: name, route: 'local', clients: ['claude', 'cursor'], entry, key: null, ...extra });
const listFile = (d: string, servers: ListServer[]) => { const f = path.join(d, '.preferred-tools', 'mcps.json'); write(f, JSON.stringify({ version: 1, servers, own: [] })); return f; };
const ctx = { catalog };
const step = (file: string, lists: { file: string; scopes: string[] }[], extra: Partial<CursorWriteStep> = {}) => ({ op: 'cursor-write', file, family: 'project', lists, before: [], skip: [], replace: [], ...extra });

test('cursor-mcp keeps the user\'s entries and their order', () => {
    const d = fresh();
    const file = path.join(d, '.cursor', 'mcp.json');
    const mine = { command: 'node', args: ['mine.js'], env: { Z: '1', A: '2' } };
    write(file, JSON.stringify({ mcpServers: { mine, serena: { command: 'old' }, other: { url: 'https://x.example/mcp' } } }, null, 2));
    const lists = [{ file: listFile(d, [srv('serena', 'local', SERENA)]), scopes: ['local', 'project'] }];
    const r = C.cursorWrite(step(file, lists, { before: ['serena'] }), ctx);
    assert.strictEqual(r.ok, true, r.detail);
    const doc = readDoc(file);
    assert.deepStrictEqual(Object.keys(doc.mcpServers), ['serena', 'mine', 'other']);
    assert.deepStrictEqual(doc.mcpServers.serena, SERENA);
    assert.strictEqual(JSON.stringify(doc.mcpServers.mine), JSON.stringify(mine), 'the user\'s entry, its key order kept');
});

test('cursor-mcp keeps the file\'s own mode: a 0600 Cursor file stays 0600', { skip: process.platform === 'win32' && 'NOT RUN: POSIX modes' }, () => {
    const d = fresh();
    const file = path.join(d, '.cursor', 'mcp.json');
    write(file, JSON.stringify({ mcpServers: { mine: { command: 'node' } } }, null, 2));
    fs.chmodSync(file, 0o600);
    const lists = [{ file: listFile(d, [srv('serena', 'local', SERENA)]), scopes: ['local', 'project'] }];
    const r = C.cursorWrite(step(file, lists), ctx);
    assert.strictEqual(r.ok, true, r.detail);
    assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
});

test('cursor-mcp removes a managed name the list dropped', () => {
    const d = fresh();
    const file = path.join(d, '.cursor', 'mcp.json');
    write(file, JSON.stringify({ mcpServers: { memory: MEMORY, mine: { command: 'node' } } }));
    const r = C.cursorWrite(step(file, [{ file: listFile(d, []), scopes: ['local', 'project'] }], { before: ['memory'] }), ctx);
    assert.strictEqual(r.ok, true, r.detail);
    assert.deepStrictEqual(Object.keys(readDoc(file).mcpServers), ['mine']);
});

test('cursor-mcp writes the local entry over the project one for one name', () => {
    const local = { ...SERENA, args: [...SERENA.args, '--local'] };
    const set = C.managedSet([{ file: 'own', scopes: ['local', 'project'], servers: [srv('serena', 'project', SERENA), srv('serena', 'local', local)] }]);
    assert.deepStrictEqual([...set.keys()], ['serena']);
    assert.deepStrictEqual([set.get('serena')!.entry, set.get('serena')!.scope], [local, 'local']);
    // only servers set up for Cursor; an inherited list gives project scope only; a name taken nearer is skipped
    const two = C.managedSet([
        { file: 'own', scopes: ['local', 'project'], servers: [srv('memory', 'local', MEMORY), srv('c7', 'local', C7, { clients: ['claude'] })] },
        { file: 'parent', scopes: ['project'], servers: [srv('memory', 'project', { command: 'parent' }), srv('local-up', 'local', MEMORY), srv('serena', 'project', SERENA, { cursorEntry: { command: 'cursor-copy' } })] },
    ]);
    assert.deepStrictEqual([...two.keys()], ['memory', 'serena']);
    assert.deepStrictEqual(two.get('memory')!.entry, MEMORY);
    assert.deepStrictEqual(two.get('serena')!.entry, { command: 'cursor-copy' }, 'cursorEntry wins over entry');
});

test('cursor-mcp puts catalog.order first, then the user\'s', () => {
    const managed = new Map<string, Managed>([['serena', { entry: SERENA, row: 'serena' } as Managed], ['context7', { entry: C7, row: 'context7' } as Managed]]);
    const doc = C.compose({ mcpServers: { zz: { command: 'z' }, aa: { command: 'a' } } }, managed, { before: [], skip: [], order: catalog.order }) as { mcpServers: ServerMap };
    const want = ['serena', 'context7'].sort((a, b) => catalog.order.indexOf(a) - catalog.order.indexOf(b));
    assert.deepStrictEqual(Object.keys(doc.mcpServers), [...want, 'zz', 'aa']);
});

test('cursor-mcp refuses a symlink, non-JSON and a file without mcpServers, writing nothing', { skip: process.platform === 'win32' && 'NOT RUN: a symlink needs Developer Mode on Windows' }, () => {
    const d = fresh();
    const lists = [{ file: listFile(d, [srv('serena', 'local', SERENA)]), scopes: ['local', 'project'] }];
    const target = path.join(d, 'elsewhere.json');
    const cases: [string, (f: string) => void][] = [
        ['symlink', (f: string) => { write(target, '{"mcpServers":{}}'); fs.symlinkSync(target, f); }],
        ['bad', (f: string) => write(f, '{ nope')],
        ['shape', (f: string) => write(f, '{"servers":{}}')],
    ];
    for (const [state, setup] of cases)
    {
        const file = path.join(d, state, '.cursor', 'mcp.json');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        setup(file);
        assert.strictEqual(C.readCursor(file).state, state);
        assert.ok(C.refusal(C.readCursor(file)), state);
        const before = fs.readFileSync(file, 'utf8');
        const r = C.cursorWrite(step(file, lists), ctx);
        assert.strictEqual(r.ok, false, state);
        assert.ok(r.detail.includes(file), r.detail);
        assert.strictEqual(fs.readFileSync(file, 'utf8'), before, `${state}: byte-identical`);
        assert.strictEqual(fs.lstatSync(file).isSymbolicLink(), state === 'symlink');
    }
    assert.strictEqual(fs.readFileSync(target, 'utf8'), '{"mcpServers":{}}', 'nothing written through the link');
});

test('cursor-mcp refuses a JSONC file and leaves it byte-identical', () => {
    const d = fresh();
    const file = path.join(d, '.cursor', 'mcp.json');
    const text = '{ // mine\n  "mcpServers": {},\n}\n';
    write(file, text);
    const r = C.cursorWrite(step(file, [{ file: listFile(d, [srv('serena', 'local', SERENA)]), scopes: ['local', 'project'] }]), ctx);
    assert.strictEqual(r.ok, false);
    assert.match(r.detail, /not JSON/);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), text);
});

test('cursor-mcp keeps CRLF and drops the BOM', () => {
    const d = fresh();
    const file = path.join(d, '.cursor', 'mcp.json');
    write(file, '﻿{\r\n  "mcpServers": {\r\n    "mine": { "command": "node" }\r\n  }\r\n}\r\n');
    assert.strictEqual(C.readCursor(file).eol, '\r\n');
    const r = C.cursorWrite(step(file, [{ file: listFile(d, [srv('serena', 'local', SERENA)]), scopes: ['local', 'project'] }]), ctx);
    assert.strictEqual(r.ok, true, r.detail);
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(!text.startsWith('﻿'), 'no BOM');
    assert.ok(text.includes('\r\n') && !/[^\r]\n/.test(text), 'CRLF throughout');
    assert.deepStrictEqual(Object.keys(JSON.parse(text).mcpServers), ['serena', 'mine']);
});

test('cursor-mcp writes through a temporary file then a rename, and makes the folder', (t) => {
    const d = fresh();
    const file = path.join(d, '.cursor', 'mcp.json');
    const calls: [fs.PathLike, fs.PathLike][] = [];
    const real = fs.renameSync;
    t.mock.method(fs, 'renameSync', (a: fs.PathLike, b: fs.PathLike) => { calls.push([a, b]); return real(a, b); });
    const r = C.cursorWrite(step(file, [{ file: listFile(d, [srv('serena', 'local', SERENA)]), scopes: ['local', 'project'] }]), ctx);
    assert.strictEqual(r.ok, true, r.detail);
    assert.deepStrictEqual(calls, [[`${file}.${process.pid}.tmp`, file]]);
    assert.ok(!fs.existsSync(path.join(d, '.cursor', '.gitignore')), 'a folder it makes gets no .gitignore');
    // the same again: nothing written
    calls.length = 0;
    assert.match(C.cursorWrite(step(file, [{ file: path.join(d, '.preferred-tools', 'mcps.json'), scopes: ['local', 'project'] }]), ctx).detail, /already holds/);
    assert.deepStrictEqual(calls, []);
});

test('cursor-mcp reports a read-back mismatch and stops the apply', (t) => {
    const d = fresh();
    const file = path.join(d, '.cursor', 'mcp.json');
    const lists = [{ file: listFile(d, [srv('serena', 'local', SERENA)]), scopes: ['local', 'project'] }];
    const real = fs.readFileSync;
    let wrote = false;
    t.mock.method(fs, 'renameSync', (a: fs.PathLike, b: fs.PathLike) => { wrote = true; return fs.copyFileSync(a, b); });
    t.mock.method(fs, 'readFileSync', (f: unknown, ...rest: unknown[]) => (wrote && f === file ? '{"mcpServers":{"serena":{"command":"other"}}}' : (real as (...a: unknown[]) => unknown)(f, ...rest)));
    const r = C.cursorWrite(step(file, lists), ctx);
    assert.strictEqual(r.ok, false);
    assert.match(r.detail, /serena/);
    assert.match(r.detail, /did not read back as written/);
});

test('fileFor: the project\'s .cursor/mcp.json, or the home\'s', () => {
    assert.strictEqual(C.fileFor('project', { project: '/work/shop', env: { HOME: '/Users/me' }, platform: 'darwin' }), '/work/shop/.cursor/mcp.json');
    assert.strictEqual(C.fileFor('global', { project: '/work/shop', env: { HOME: '/Users/me' }, platform: 'darwin' }), '/Users/me/.cursor/mcp.json');
    assert.strictEqual(C.fileFor('global', { project: '/work/shop', home: '/Users/plan', env: {}, platform: 'darwin' }), '/Users/plan/.cursor/mcp.json', 'the plan\'s home wins');
});

test('matchesRow matches context7\'s bridge copy to the context7 row and an unrelated bridge to none', () => {
    const bridge = (url: string, key = 'CONTEXT7_API_KEY') => ({ command: 'node', args: ['/r/.preferred-tools/mcp-bridge.js', url, key, 'Bearer', 'mcp-remote@0.1.37'] });
    const rows = catalog.tools.filter((r) => r.kind === 'mcp');
    const hits = (entry: ServerEntry) => rows.filter((r) => C.matchesRow(entry, r)).map((r) => r.id);
    assert.deepStrictEqual(hits(bridge('https://mcp.context7.com/mcp')), ['context7']);
    assert.deepStrictEqual(hits(bridge('https://mcp.example.com/mcp', 'MINE')), []);
    assert.deepStrictEqual(hits(C7), ['context7']);
    assert.deepStrictEqual(hits(SERENA), ['serena']);
    assert.deepStrictEqual(hits({ command: 'node', args: ['mine.js'] }), []);
    assert.deepStrictEqual(hits(bridge('https://mcp.sentry.dev/mcp/{SENTRY_ORG}/{SENTRY_PROJECT?}', 'SENTRY_ACCESS_TOKEN')), ['sentry']);
});

test('cursor-mcp loads before and after inventory without a partial export', () => {
    const root = path.join(import.meta.dirname, '..', 'scripts');
    const url = (...parts: string[]) => JSON.stringify(pathToFileURL(path.join(root, ...parts)).href);
    const probe = (first: string, second: string) => `await import(${url(first)}); await import(${url(second)});`
        + ` const c = await import(${url('cursor', 'cursor-mcp.ts')}); const i = await import(${url('inventory', 'inventory.ts')});`
        + " if (typeof c.matchesRow !== 'function' || typeof c.readCursor !== 'function' || typeof i.buildInventory !== 'function' || typeof i.matchesFingerprint !== 'function') { process.exit(3); }"
        + ` if (!c.matchesRow({ type: 'http', url: 'https://mcp.context7.com/mcp' }, (await import(${url('catalog', 'catalog.ts')})).load().byId.get('context7'))) process.exit(4);`;
    for (const [a, b] of [['cursor/cursor-mcp.ts', 'inventory/inventory.ts'], ['inventory/inventory.ts', 'cursor/cursor-mcp.ts']] as [string, string][])
    {
        const r = spawnSync(process.execPath, ['--input-type=module', '-e', probe(a, b)], { encoding: 'utf8' });
        assert.strictEqual(r.status, 0, `${a} first: ${r.stderr}`);
    }
});

// ---- hosted routes (spec D5) ----------------------------------------------------------------------------------------
const HOSTED_CTX = { platform: 'darwin', project: '/work/shop', home: '/Users/me', roots: { project: '/work/shop/.preferred-tools', global: '/Users/me/.preferred-tools' } };
const helperEntry = (id: string, scope = 'user', ctx = HOSTED_CTX) => buildEntry(catalog.byId.get(id)!, 'remote', { scope, token: true, params: { host: 'gitlab.com' } }, ctx, catalog.rules);
const MR = catalog.byId.get('sentry')!.routes!.bridge!.package!;

for (const id of ['context7', 'github', 'gitlab', 'atlassian', 'sentry'])
{
    test(`${id}: Claude keeps the helper form; Cursor's copy is the bridge with the catalog pin`, () => {
        const e = helperEntry(id);
        const b = C.bridgeFormOf(e, catalog) as ServerEntry & { args: string[] };
        assert.equal(b.command, 'node');
        assert.strictEqual(b.args[4], `mcp-remote@${MR.version}`);
        assert.match(b.args[4], /^mcp-remote@0\.16\.0$/);
        assert.equal(b.args[0], '/Users/me/.preferred-tools/mcp-bridge.js');
        assert.equal(b.args[1], e.url);
        assert.deepEqual(b.args.slice(2, 4), helperParts(e.headersHelper)!.args.slice(0, 2));
        assert.deepStrictEqual(b.env, { npm_config_before: MR.cutoff });
        assert.ok(bridgeParts(b), 'the bridge form parses as a bridge');
    });
}

test('the bridge form is the object buildEntry makes for sentry\'s bridge route, field for field, with the helper\'s global root', () => {
    const ctx = { ...HOSTED_CTX, roots: { ...HOSTED_CTX.roots, globalNamed: true } };
    const e = helperEntry('sentry', 'local', ctx);
    const built = buildEntry(catalog.byId.get('sentry')!, 'bridge', { scope: 'local', urlNames: {} }, ctx, catalog.rules);
    const b = C.bridgeFormOf(e, catalog) as ServerEntry & { args: string[] };
    assert.deepStrictEqual(Object.keys(b), Object.keys(built));
    assert.deepStrictEqual({ ...b, args: [...b.args.slice(0, 1), ...b.args.slice(2)] }, { ...built, args: [...built.args!.slice(0, 1), ...built.args!.slice(2)] });
    assert.strictEqual(b.args[5], '/Users/me/.preferred-tools');
});

test('bridgeFormOf keeps a prior copy\'s pin, cut-off and the args and env pairs it does not set', () => {
    const e = helperEntry('context7');
    const prior = { command: 'node', args: ['--no-warnings', '/old/mcp-bridge.js', 'https://old.example/mcp', 'OLD', 'Bearer', 'mcp-remote@0.17.0'], env: { npm_config_before: '2026-12-01T00:00:00Z', MINE: '1' } };
    const b = C.bridgeFormOf(e, catalog, prior) as ServerEntry & { args: string[] };
    assert.deepStrictEqual(b.args, ['--no-warnings', '/Users/me/.preferred-tools/mcp-bridge.js', e.url, 'CONTEXT7_API_KEY', 'Bearer', 'mcp-remote@0.17.0']);
    assert.deepStrictEqual(b.env, { npm_config_before: '2026-12-01T00:00:00Z', MINE: '1' });
});

test('bridgeFormOf is null for an entry with no helper, or a header besides the helper\'s; otherHeaders names them', () => {
    assert.strictEqual(C.bridgeFormOf(C7, catalog), null);
    const e = { ...helperEntry('context7'), headers: { 'X-Team': 'docs' } };
    assert.strictEqual(C.bridgeFormOf(e, catalog), null);
    assert.deepStrictEqual(C.otherHeaders(e), ['X-Team']);
    assert.deepStrictEqual(C.otherHeaders(helperEntry('context7')), []);
});

test('signInParts reads the plugin form and returns null without MCP_REMOTE_CONFIG_DIR', () => {
    const f = signInFormOf('https://mcp.atlassian.com/v2/mcp', '/Users/me/.preferred-tools', catalog, { platform: 'darwin' });
    assert.deepStrictEqual(f, { type: 'stdio', command: 'npx', args: ['-y', `mcp-remote@${MR.version}`, 'https://mcp.atlassian.com/v2/mcp'], env: { npm_config_before: MR.cutoff, MCP_REMOTE_CONFIG_DIR: '/Users/me/.preferred-tools' } });
    assert.deepStrictEqual(signInParts(f), { url: 'https://mcp.atlassian.com/v2/mcp', dir: '/Users/me/.preferred-tools', pin: `mcp-remote@${MR.version}` });
    const { MCP_REMOTE_CONFIG_DIR: _d, ...env } = f.env;
    assert.strictEqual(signInParts({ ...f, env }), null);
    assert.strictEqual(signInParts({ command: 'npx', args: ['-y', 'mcp-remote@0.16.0', 'not a url'], env: { MCP_REMOTE_CONFIG_DIR: '/x' } }), null);
    assert.strictEqual(signInParts(C7), null);
});

test('on win32 the shared sign-in form is wrapped in cmd /c npx', () => {
    const f = signInFormOf('https://mcp.sentry.dev/mcp', 'C:\\Users\\me\\.preferred-tools', catalog, { platform: 'win32' });
    assert.deepStrictEqual([f.command, f.args!.slice(0, 4)], ['cmd', ['/c', 'npx', '-y', `mcp-remote@${MR.version}`]]);
    assert.deepStrictEqual(signInParts(f), { url: 'https://mcp.sentry.dev/mcp', dir: 'C:\\Users\\me\\.preferred-tools', pin: `mcp-remote@${MR.version}` });
});
