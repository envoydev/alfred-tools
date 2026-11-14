import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { MARKER, maskCredentials, restore } from '../scripts/core/kept.ts';
import * as catalogLib from '../scripts/catalog/catalog.ts';
import type { CatalogRow } from '../scripts/catalog/types.ts';
import type { ServerEntry } from '../scripts/core/types.ts';

// live-shaped values are made per run, so no file here holds one a guard would read as a credential
const hex = (n: number) => crypto.randomBytes(n).toString('hex');
const rowOf = (id: string) => catalogLib.load().byId.get(id);
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

type Live = ServerEntry & { args: string[]; env: Record<string, string> & { API_KEY?: string; NEW?: string }; headers: Record<string, string>; options: { nested: { userPass: string; auth: { secret: string } } } };

function liveEntry()
{
    const v = {
        api: `sk-live-${hex(16)}`, db: hex(8), req: hex(8), user: hex(8), deep: hex(8), flag: hex(12),
        custom: `Token ${hex(12)}`, sentry: `sntryu_${hex(16)}`, ctx: `ctx7sk-${hex(8)}-${hex(8)}`,
        pem: `-----BEGIN RSA PRIVATE KEY-----\n${hex(24)}\n-----END RSA PRIVATE KEY-----`,
    };
    const entry: Live = {
        command: 'npx',
        args: ['-y', 'some-server@1.0.0', '--api-key', v.flag, `--note=${v.sentry}`],
        env: { API_KEY: v.api, DB_PASS: v.db, requirepass: v.req, OTHER: 'plain', GH_TOKEN: '${GH_TOKEN}', FALLBACK_TOKEN: '${A:-b}', CERT: v.pem },
        headers: { 'X-Custom': v.custom, Authorization: 'Bearer ${CONTEXT7_API_KEY}', 'X-API-Key': v.ctx },
        options: { nested: { userPass: v.user, auth: { secret: v.deep } } },
    };
    return { v, entry };
}

test('keep masks every value under a key the guard\'s credKey names, at any depth (API_KEY, DB_PASS, requirepass, userPass), every header, token shapes, PEM keys and embedded passwords - never a ${VAR} or a location key', () => {
    const { v, entry } = liveEntry();
    const before = clone(entry);
    const kept = maskCredentials(entry, null);
    assert.deepStrictEqual(entry, before, 'the entry handed in is not changed');
    assert.deepStrictEqual(kept.args, ['-y', 'some-server@1.0.0', '--api-key', MARKER, `--note=${MARKER}`]);
    assert.deepStrictEqual(kept.env, { API_KEY: MARKER, DB_PASS: MARKER, requirepass: MARKER, OTHER: 'plain', GH_TOKEN: '${GH_TOKEN}', FALLBACK_TOKEN: '${A:-b}', CERT: MARKER });
    assert.deepStrictEqual(kept.headers, { 'X-Custom': MARKER, Authorization: 'Bearer ${CONTEXT7_API_KEY}', 'X-API-Key': MARKER });
    assert.deepStrictEqual(kept.options, { nested: { userPass: MARKER, auth: { secret: MARKER } } });
    const text = JSON.stringify(kept);
    for (const [k, value] of Object.entries(v)) assert.ok(!text.includes(value.split('\n')[0]!.slice(-12)), `${k} is not in the kept entry`);

    // a catalog row's location key is read by configure, so it stays as written whatever its value holds
    const memory = rowOf('memory');
    const odd = `/data/ctx7sk-${hex(8)}-${hex(8)}/memory.db`;
    const loc = maskCredentials({ command: 'uvx', args: ['--from', 'mcp-memory-service[sqlite]==12.1.1', 'memory', 'server'], env: { MCP_MEMORY_SQLITE_PATH: odd, API_TOKEN: v.api } }, memory);
    assert.strictEqual(loc.env.MCP_MEMORY_SQLITE_PATH, odd);
    assert.strictEqual(loc.env.API_TOKEN, MARKER);
});

test('keep masks only the password part of a connection string or userinfo URL', () => {
    const pw = hex(8);
    const kept = maskCredentials({
        type: 'http', url: `https://u:p${pw}@mcp.example.test/mcp`,
        args: [`postgresql://app:pw${pw}@localhost/db`, 'postgresql://app:${DB_PW}@localhost/db'],
        env: { DATABASE_URL: `Host=db;Username=app;Password=${pw};Port=5432` },
    }, null);
    assert.strictEqual(kept.url, `https://u:${MARKER}@mcp.example.test/mcp`);
    assert.deepStrictEqual(kept.args, [`postgresql://app:${MARKER}@localhost/db`, 'postgresql://app:${DB_PW}@localhost/db']);
    assert.strictEqual(kept.env.DATABASE_URL, `Host=db;Username=app;Password=${MARKER};Port=5432`);
});

test('restore puts the real values back from the source', () => {
    const { entry } = liveEntry();
    const kept = maskCredentials(entry, null);
    assert.deepStrictEqual(restore(kept, entry, null), { entry });
    // a change that keeps the kept fields as they were - a new env key, an extra arg - keeps the change
    const changed = clone(kept);
    changed.env.NEW = 'x';
    changed.args.push('--verbose');
    const r = restore(changed, entry, null);
    assert.deepStrictEqual(r.entry!.env, { ...entry.env, NEW: 'x' });
    assert.deepStrictEqual(r.entry!.args, [...entry.args, '--verbose']);
});

test('restore refuses when the source changed a kept field', () => {
    const { entry } = liveEntry();
    const kept = maskCredentials(entry, null);
    const placeholder = clone(entry);
    placeholder.env.API_KEY = '${API_KEY}';
    assert.match(restore(kept, placeholder, null).error!, /env\.API_KEY/);
    const gone = clone(entry);
    delete gone.headers['X-API-Key'];
    assert.match(restore(kept, gone, null).error!, /headers\.X-API-Key/);
    const fewer = clone(entry);
    fewer.args.splice(2, 2);
    assert.match(restore(kept, fewer, null).error!, /args/);
});

test('restore matches a kept arg a splice moved', () => {
    const key = hex(12);
    const pw = hex(8);
    const source = { command: 'npx', args: ['-y', 'pkg@1.0.0', '--api-key', key, `postgresql://app:${pw}@h/db`] };
    const kept = maskCredentials(source, null);
    const moved = clone(kept);
    moved.args.splice(2, 0, '--user-data-dir', '/x');
    assert.deepStrictEqual(restore(moved, source, null), { entry: { command: 'npx', args: ['-y', 'pkg@1.0.0', '--user-data-dir', '/x', '--api-key', key, `postgresql://app:${pw}@h/db`] } });
});

test('an entry with nothing live is unchanged', () => {
    const serena = {
        command: 'uvx', args: ['--python', '3.13', '--from', 'serena-agent@2.1.0', 'serena', 'start-mcp-server'],
        env: { SERENA_HOME: '/p/.alfred-tools/serena', SERENA_USAGE_REPORTING: 'false', SENTRY_ACCESS_TOKEN: '${SENTRY_ACCESS_TOKEN}' },
    };
    const remote = { type: 'http', url: 'https://mcp.context7.com/mcp', headers: { Authorization: 'Bearer ${CONTEXT7_API_KEY}' } };
    for (const [entry, row] of [[serena, rowOf('serena')], [remote, rowOf('context7')], [{}, null]] as [ServerEntry, CatalogRow | null | undefined][])
    {
        assert.deepStrictEqual(maskCredentials(entry, row), entry);
        assert.deepStrictEqual(restore(maskCredentials(entry, row), entry, row), { entry });
    }
});
