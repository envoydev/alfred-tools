// sentry's local route passes SENTRY_AUTH_TOKEN where its pin reads it (spec D2): the sentry-auth-env row, token-sync on a
// key in a former place (D0), and update's pin move renaming the field in the same rewrite.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { load } from '../scripts/catalog/catalog.ts';
import * as inventory from '../scripts/inventory/inventory.ts';
import { plan } from '../scripts/plan/plan.ts';
import { apply } from '../scripts/apply/run.ts';
import { readAccount } from '../scripts/core/account.ts';
import { pinnedVersion } from '../scripts/fix/common.ts';
import * as F from '../scripts/fix/fix-functions.ts';
import { world, readJson } from './helpers.ts';
import { reg, ctxFor, detect, shownOf } from './fix-helpers.ts';
import { run, fakeRegistry, ago } from './update-helpers.ts';
import type { Catalog, CatalogRow } from '../scripts/catalog/types.ts';
import type { Finding } from '../scripts/fix/types.ts';

const row = (id: string) => load().byId.get(id)!;

test('sentry-auth-env is offered at a pin that reads SENTRY_AUTH_TOKEN, never below; its fix renames the field, value kept (spec D2)', () =>
{
    const at = (version: string) => reg('sentry', { command: 'npx', args: ['-y', `@sentry/mcp-server@${version}`], env: { npm_config_before: '2026-11-19T23:59:59Z', SENTRY_ACCESS_TOKEN: 'test-key-not-real' } });
    const offered = (version: string) => detect(ctxFor({ registrations: [at(version)] })).found.filter((f) => f.id === 'sentry-auth-env');
    assert.deepStrictEqual(offered('0.42.0'), []);
    assert.deepStrictEqual(offered('0.47.0'), []);
    assert.deepStrictEqual(offered('latest'), [], 'a pin that is not a version');
    const ctx = ctxFor({ registrations: [at('0.48.0')] });
    const [f] = offered('0.48.0') as [Finding];
    assert.ok(f);
    assert.ok(!shownOf(detect(ctx)).includes('test-key-not-real'));
    assert.deepStrictEqual(F.sentryAuthEnvFix(at('0.48.0').entry, f, ctx).env, { npm_config_before: '2026-11-19T23:59:59Z', SENTRY_AUTH_TOKEN: 'test-key-not-real' });
    assert.deepStrictEqual(detect(ctxFor({ registrations: [reg('sentry', { command: 'npx', args: ['-y', '@sentry/mcp-server@0.49.0'], env: { SENTRY_AUTH_TOKEN: 'k' } })] })).found.filter((x) => x.id === 'sentry-auth-env'), []);
});

test('token-sync reads a key in a former place: context7 --api-key and sentry SENTRY_ACCESS_TOKEN (spec D0)', () =>
{
    const c7 = reg('context7', { command: 'npx', args: ['-y', '@upstash/context7-mcp@4.5.0', '--api-key', ''] });
    const sentry = reg('sentry', { command: 'npx', args: ['-y', '@sentry/mcp-server@0.42.0'], env: { SENTRY_ACCESS_TOKEN: '' } });
    const found = detect(ctxFor({ registrations: [c7, sentry] })).found.filter((f) => f.id === 'token-sync');
    assert.deepStrictEqual(found.map((f) => f.name).sort(), [row('context7').name, row('sentry').name].sort());
});

// 0.6.0's sentry local: the 0.42.0 pin and SENTRY_ACCESS_TOKEN, the name that pin reads
const catalog060 = (): Catalog =>
{
    const cat = load();
    const sentry = cat.byId.get('sentry')!;
    const local = sentry.routes['local']!;
    const old: CatalogRow = { ...sentry, routes: { ...sentry.routes, local: { ...local, package: { ...local.package!, version: '0.42.0' }, env: { SENTRY_ACCESS_TOKEN: '${SENTRY_ACCESS_TOKEN}' } } } };
    const tools = cat.tools.map((row) => (row.id === 'sentry' ? old : row));
    return { ...cat, tools, byId: new Map(tools.map((row) => [row.id, row])) };
};

test('update moving sentry local to 0.49.0 passes SENTRY_AUTH_TOKEN in the same rewrite, in Claude Code and Cursor; a move below 0.48.0 keeps the old name (spec D2)', async () =>
{
    for (const [to, name] of [['0.49.0', 'SENTRY_AUTH_TOKEN'], ['0.47.0', 'SENTRY_ACCESS_TOKEN']] as const)
    {
        const w = world();
        try
        {
            const root = path.join(w.home, '.alfred-tools');
            fs.mkdirSync(root, { recursive: true });
            fs.writeFileSync(path.join(root, '.mcps-secrets'), 'SENTRY_ACCESS_TOKEN=test-key-not-real\n');
            const p = plan(inventory.buildInventory({ project: w.project, env: w.env }), { clients: ['claude', 'cursor'], picks: { sentry: { route: 'local', scope: 'user', token: true } } }, { home: w.home, env: w.env, catalog: catalog060() });
            assert.deepStrictEqual(p.errors, []);
            assert.strictEqual(apply(p, { env: w.env, tmp: path.join(w.dir, 'tmp'), log: () => {} }).failed, null);
            const cursorFile = path.join(w.home, '.cursor', 'mcp.json');
            assert.ok('SENTRY_ACCESS_TOKEN' in readJson(cursorFile).mcpServers.sentry.env, 'the 0.6.0 shape in Cursor before the update');
            const a = await run(w, ['--apply', 'mcp:sentry~user', '--no-refresh'], { registry: fakeRegistry({ 'npm:@sentry/mcp-server': [{ version: to, time: ago(30) }] }) });
            assert.strictEqual(a.code, 0, a.text);
            assert.ok(!a.text.includes('test-key-not-real'));
            const entry = readAccount(w.env, w.project).user['sentry']!;
            const sentryNames = (env: Record<string, string> | undefined) => Object.keys(env || {}).filter((key) => key.startsWith('SENTRY_'));
            assert.strictEqual(pinnedVersion(entry, '@sentry/mcp-server'), to);
            assert.deepStrictEqual(sentryNames(entry.env), [name], to);
            assert.strictEqual(entry.env![name], 'test-key-not-real', to);
            assert.deepStrictEqual(sentryNames(readJson(cursorFile).mcpServers.sentry.env), [name], `${to}: Cursor's copy follows`);
        }
        finally { w.clean(); }
    }
});
