// keys.ts - the key files' grammar and chains (D3), and how a key is written into a stdio registration by scope.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { world } from './helpers.ts';
import * as catalogLib from '../scripts/catalog/catalog.ts';
import * as keys from '../scripts/keys/keys.ts';
import type { CatalogRow } from '../scripts/catalog/types.ts';

const catalog = catalogLib.load();
const row = (id: string) => catalog.byId.get(id);
const val = () => `v-${crypto.randomBytes(8).toString('hex')}`;
const S = 'SENTRY_ACCESS_TOKEN';
const G = 'GITHUB_PERSONAL_ACCESS_TOKEN';
const put = (file: string, text: string | Buffer) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const dotenv = (pairs: Record<string, string>) => `${Object.entries(pairs).map(([k, v]) => `${k}=${v}`).join('\n')}\n`;

test('the dotenv grammar: comments, export, quotes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-keys-'));
    try
    {
        const f = path.join(dir, '.secrets');
        fs.writeFileSync(f, '﻿# a comment\n; another\n\nexport A=1\r\nB = "two words" \nC=\'q\'\nD=x=y\nnot a pair\n9BAD=no\nE=\n');
        assert.deepStrictEqual(keys.readDotenv(f), { A: '1', B: 'two words', C: 'q', D: 'x=y', E: '' });
        fs.writeFileSync(f, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('A=wide\r\n', 'utf16le')]));
        assert.deepStrictEqual(keys.readDotenv(f), { A: 'wide' }, 'a UTF-16 file from a Windows editor');
        assert.strictEqual(keys.readDotenv(path.join(dir, 'none')), null);
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fillKeys writes each token field a stdio route defines: the ${VAR} form at project scope, the value at local and user; a hosted route has none', () => {
    const v = `x%y^z"${val()}`;
    // a hosted route's key is read by mcp-headers.js: the entry holds no token field, and an old header is fix's to move
    const hosted = { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: { Authorization: 'Bearer old', 'X-Other': 'keep' } };
    for (const scope of ['project', 'local', 'user']) assert.deepStrictEqual(keys.fillKeys(hosted, row('github'), 'remote', scope, { [G]: v }), hosted, scope);
    const docker = { command: 'docker', args: ['run', '-i', '--rm', '-e', G, 'ghcr.io/github/github-mcp-server:v2.1.0', 'stdio'], env: { [G]: 'old' } };
    assert.deepStrictEqual(keys.fillKeys(docker, row('github'), 'local', 'project', { [G]: v }).env, { [G]: `\${${G}}` }, 'a project registration already there keeps the reference');
    assert.deepStrictEqual(keys.fillKeys(docker, row('github'), 'local', 'local', { [G]: v }).env, { [G]: v });
    assert.deepStrictEqual(keys.fillKeys(docker, row('github'), 'local', 'user', {}), docker, 'a missing key keeps what the entry holds');
    const c7 = { command: 'npx', args: ['-y', '@upstash/context7-mcp@4.7.0'], env: { CONTEXT7_API_KEY: '${CONTEXT7_API_KEY}' } };
    assert.deepStrictEqual(keys.fillKeys(c7, row('context7'), 'local', 'local', { CONTEXT7_API_KEY: v }).env, { CONTEXT7_API_KEY: v });
    const c7old = { command: 'npx', args: ['-y', '@upstash/context7-mcp@4.4.4', '--api-key', '${CONTEXT7_API_KEY}'] };
    assert.deepStrictEqual(keys.fillKeys(c7old, row('context7'), 'local', 'local', { CONTEXT7_API_KEY: v }).args!.slice(-2), ['--api-key', v], 'a former --api-key is filled where it is');
    const noToken = { type: 'http', url: 'https://mcp.context7.com/mcp' };
    assert.deepStrictEqual(keys.fillKeys(noToken, row('context7'), 'remote', 'local', { CONTEXT7_API_KEY: v }), noToken, 'an optional token not asked for is not added');
    const sentry = { command: 'npx', args: ['-y', '@sentry/mcp-server@0.42.0'], env: { [S]: 'old', OTHER: '1' } };
    assert.deepStrictEqual(keys.fillKeys(sentry, row('sentry'), 'local', 'local', { [S]: v }).env, { [S]: v, OTHER: '1' });
    assert.strictEqual(sentry.env[S], 'old', 'the entry given is not changed');
    assert.deepStrictEqual(keys.fillKeys(sentry, row('serena'), 'local', 'local', { [S]: v }), sentry, 'a route with no token');
});

// ---- .mcps-secrets chains (spec D3) ----------------------------------------------------------------------------------

const sec = (dir: string) => path.join(dir, '.mcps-secrets');

test('hosted chain per scope: the root beside the helper, the named global root at local scope only, then the two home files', () => {
    const p = path.join(path.sep, 'w', 'p', '.alfred');
    const k = path.join(path.sep, 'k');
    const h = path.join(path.sep, 'h');
    const homeFiles = [sec(path.join(h, '.alfred-tools')), sec(path.join(h, '.alfred'))];
    assert.deepStrictEqual(keys.hostedChain({ scope: 'project', projectRoot: p, globalRoot: k, globalNamed: true, home: h }), [sec(p), ...homeFiles]);
    assert.deepStrictEqual(keys.hostedChain({ scope: 'local', projectRoot: p, globalRoot: k, globalNamed: true, home: h }), [sec(p), sec(k), ...homeFiles]);
    assert.deepStrictEqual(keys.hostedChain({ scope: 'local', projectRoot: p, globalRoot: k, globalNamed: false, home: h }), [sec(p), ...homeFiles], 'a global root that is not named is not the third argument');
    assert.deepStrictEqual(keys.hostedChain({ scope: 'user', projectRoot: p, globalRoot: path.join(h, '.alfred-tools'), globalNamed: false, home: h }), homeFiles, 'duplicates dropped');
    assert.deepStrictEqual(keys.hostedChain({ scope: 'user', projectRoot: p, globalRoot: k, globalNamed: true, home: h }), [sec(k), ...homeFiles]);
});

test('a chain is built in the path form of the platform it is for, whatever the host', () => {
    const mac = { project: '/work/shop/.alfred-tools', global: '/Users/me/.alfred-tools', home: '/Users/me' };
    assert.deepStrictEqual(keys.hostedChain({ scope: 'local', projectRoot: mac.project, globalRoot: mac.global, globalNamed: true, home: mac.home, platform: 'darwin' }), [
        '/work/shop/.alfred-tools/.mcps-secrets', '/Users/me/.alfred-tools/.mcps-secrets', '/Users/me/.alfred/.mcps-secrets']);
    assert.deepStrictEqual(keys.stdioChain({ scope: 'local', projectRoot: mac.project, globalRoot: mac.global, platform: 'linux' }), ['/work/shop/.alfred-tools/.mcps-secrets', '/Users/me/.alfred-tools/.mcps-secrets']);
    assert.deepStrictEqual(keys.hostedChain({ scope: 'project', projectRoot: 'C:\\work\\shop\\.alfred-tools', globalRoot: 'C:\\Users\\me\\.alfred-tools', home: 'C:\\Users\\me', platform: 'win32' }), [
        'C:\\work\\shop\\.alfred-tools\\.mcps-secrets', 'C:\\Users\\me\\.alfred-tools\\.mcps-secrets', 'C:\\Users\\me\\.alfred\\.mcps-secrets']);
    assert.deepStrictEqual(keys.stdioChain({ scope: 'user', projectRoot: null, globalRoot: 'C:\\Users\\me\\.alfred-tools', platform: 'win32' }), ['C:\\Users\\me\\.alfred-tools\\.mcps-secrets']);
});

test('stdio chain: local reads the project root then the global root; global reads the global root alone', () => {
    const p = path.join(path.sep, 'w', 'p', '.alfred-tools');
    const g = path.join(path.sep, 'h', '.alfred-tools');
    assert.deepStrictEqual(keys.stdioChain({ scope: 'local', projectRoot: p, globalRoot: g }), [sec(p), sec(g)]);
    assert.deepStrictEqual(keys.stdioChain({ scope: 'user', projectRoot: p, globalRoot: g }), [sec(g)]);
    assert.deepStrictEqual(keys.stdioChain({ scope: 'project', projectRoot: p, globalRoot: g }), [], 'a stdio keyed route is not offered at project scope');
});

test('valueIn: the first non-empty value wins, an empty value is missing, and the dotenv grammar is readDotenv\'s', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-keys-'));
    try
    {
        const a = path.join(dir, 'a', '.mcps-secrets');
        const b = path.join(dir, 'b', '.mcps-secrets');
        const v = val();
        put(a, 'A=\n# comment\n');
        put(b, `A=${v}\n`);
        assert.deepStrictEqual(keys.valueIn([a, b], 'A'), { value: v, file: b });
        assert.strictEqual(keys.valueIn([a, path.join(dir, 'none')], 'A'), null, 'empty and missing are both missing');
        const forms = {
            crlf: Buffer.from('X=1\r\nA=crlf\r\n'),
            bom: Buffer.from('﻿A=bom\n'),
            utf16: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('A=utf16\n', 'utf16le')]),
            export: Buffer.from('export A=exported\n'),
            quoted: Buffer.from('A="quoted"\n'),
            equals: Buffer.from('A=b=c\n'),
        };
        for (const [name, bytes] of Object.entries(forms))
        {
            const f = path.join(dir, name, '.mcps-secrets');
            put(f, bytes);
            assert.strictEqual(keys.valueIn([f], 'A')!.value, (keys.readDotenv(f) as Record<string, string> & { A?: string }).A, name);
        }
        assert.strictEqual(keys.valueIn([path.join(dir, 'equals', '.mcps-secrets')], 'A')!.value, 'b=c');
        assert.deepStrictEqual(keys.filledNames([a, b]), [{ file: a, names: [] }, { file: b, names: ['A'] }], 'names only');
        assert.ok(!JSON.stringify(keys.filledNames([a, b])).includes(v), 'no value in filledNames');
        assert.ok(keys.NAME_RULE.test('ACME_GITHUB_TOKEN') && !keys.NAME_RULE.test('1BAD') && !keys.NAME_RULE.test('A-B'));
        assert.strictEqual(keys.SECRETS, '.mcps-secrets');
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('oldHolding names the old file and never the value', () => {
    const w = world();
    try
    {
        const v = val();
        const store = path.join(w.project, '.alfred', '.secrets');
        put(store, dotenv({ [G]: v }));
        const found = keys.oldHolding(w.project, w.home, G);
        assert.strictEqual(found, store);
        assert.ok(!JSON.stringify(found).includes(v));
        assert.strictEqual(keys.oldHolding(w.project, w.home, S), null);
        const files = keys.oldFiles(w.project, w.home);
        assert.deepStrictEqual(files.slice(0, 2), [store, path.join(w.project, '.alfred', '.sensitive-data')]);
        assert.ok(files.includes(path.join(w.project, '.alfred-tools', '.secrets')) && files.includes(path.join(w.home, '.alfred-tools', '.secrets')));
    }
    finally { w.clean(); }
});

test('oldHolding finds a key in a parent folder\'s alfred-code store', () => {
    const w = world();
    try
    {
        const child = path.join(w.project, 'api');
        fs.mkdirSync(child, { recursive: true });
        const rootStore = path.join(w.project, '.alfred', '.secrets');
        put(rootStore, dotenv({ [G]: val() }));
        assert.strictEqual(keys.oldHolding(child, w.home, G), rootStore);
    }
    finally { w.clean(); }
});

test('the 0.1.x key file is read at both folders', () => {
    const w = world();
    try
    {
        const files = keys.oldFiles(w.project, w.home);
        for (const folder of ['.alfred-tools', '.preferred-tools'])
        {
            assert.ok(files.includes(path.join(w.project, folder, '.secrets')), `${folder} in the project`);
            assert.ok(files.includes(path.join(w.home, folder, '.secrets')), `${folder} at home`);
        }
    }
    finally { w.clean(); }
});

test('tokenFields and fillKeys see a key in a former place the route declares, and fill it there (spec D0)', () => {
    const v = val();
    const sentry = row('sentry')!;
    const moved: CatalogRow = { ...sentry, routes: { ...sentry.routes, local: { ...sentry.routes['local']!, env: { SENTRY_AUTH_TOKEN: `\${${S}}` }, formerly: [{ env: { [S]: `\${${S}}` } }] } } };
    const route = moved.routes['local'];
    const old = { command: 'npx', args: ['-y', '@sentry/mcp-server@0.42.0'], env: { [S]: 'old' } };
    const now = { command: 'npx', args: ['-y', '@sentry/mcp-server@0.49.0'], env: { SENTRY_AUTH_TOKEN: 'old' } };
    assert.deepStrictEqual(keys.tokenFields(old, route), [{ at: ['env', S], template: `\${${S}}` }]);
    assert.deepStrictEqual(keys.tokenFields(now, route), [{ at: ['env', 'SENTRY_AUTH_TOKEN'], template: `\${${S}}` }]);
    assert.deepStrictEqual(keys.fillKeys(old, moved, 'local', 'local', { [S]: v }).env, { [S]: v }, 'a former field stays former');
    assert.deepStrictEqual(keys.fillKeys(now, moved, 'local', 'local', { [S]: v }).env, { SENTRY_AUTH_TOKEN: v });
    // an optional env pair, and a former optional args pair
    const c7 = row('context7')!;
    const c7moved: CatalogRow = { ...c7, routes: { ...c7.routes, local: { ...c7.routes['local']!, optionalArgs: {}, optionalEnv: { token: { CONTEXT7_API_KEY: '${CONTEXT7_API_KEY}' } }, formerly: [{ optionalArgs: { token: ['--api-key', '${CONTEXT7_API_KEY}'] } }] } } };
    const inArgs = { command: 'npx', args: ['-y', '@upstash/context7-mcp@4.5.0', '--api-key', '${CONTEXT7_API_KEY}'] };
    assert.deepStrictEqual(keys.fillKeys(inArgs, c7moved, 'local', 'local', { CONTEXT7_API_KEY: v }).args!.slice(-2), ['--api-key', v]);
    const inEnv = { command: 'npx', args: ['-y', '@upstash/context7-mcp@4.7.0'], env: { npm_config_before: 'x', CONTEXT7_API_KEY: '${CONTEXT7_API_KEY}' } };
    assert.deepStrictEqual(keys.fillKeys(inEnv, c7moved, 'local', 'local', { CONTEXT7_API_KEY: v }).env, { npm_config_before: 'x', CONTEXT7_API_KEY: v });
    assert.deepStrictEqual(keys.tokenFields({ command: 'npx', args: ['-y', '@upstash/context7-mcp@4.7.0'] }, c7moved.routes['local']), [], 'a keyless entry holds no field');
});

test('renameSinceEnv renames a former env field from the pin that reads the new name, value kept (spec D2)', () => {
    const route = row('sentry')!.routes['local']!;
    const at = (version: string) => ({ command: 'npx', args: ['-y', `@sentry/mcp-server@${version}`], env: { npm_config_before: 'x', [S]: 'test-key-not-real' } });
    assert.deepStrictEqual(keys.renameSinceEnv(at('0.42.0'), route, '0.49.0').env, { npm_config_before: 'x', SENTRY_AUTH_TOKEN: 'test-key-not-real' });
    assert.deepStrictEqual(keys.renameSinceEnv(at('0.42.0'), route, '0.48.0').env, { npm_config_before: 'x', SENTRY_AUTH_TOKEN: 'test-key-not-real' });
    const below = at('0.42.0');
    assert.strictEqual(keys.renameSinceEnv(below, route, '0.47.0'), below, 'below 0.48.0: as it is');
    assert.strictEqual(keys.renameSinceEnv(below, route, 'latest'), below, 'a pin that is not a version: as it is');
    assert.strictEqual(keys.renameSinceEnv(below, route, null), below);
    const now = { command: 'npx', args: ['-y', '@sentry/mcp-server@0.49.0'], env: { SENTRY_AUTH_TOKEN: 'k' } };
    assert.strictEqual(keys.renameSinceEnv(now, route, '0.49.0'), now, 'already the new name');
});
