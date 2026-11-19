// Retired MCP rows (spec D3): the inventory and the table here; fix's retired-server row and update's offer (Task 6).
import test from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import * as catalogLib from '../scripts/catalog/catalog.ts';
import * as inventory from '../scripts/inventory/inventory.ts';
import * as account from '../scripts/core/account.ts';
import { renderTable } from '../scripts/inventory/table.ts';
import { markRetired } from '../scripts/inventory/retired.ts';
import { world, writeJson, accountKey } from './helpers.ts';
import type { ServerEntry } from '../scripts/core/types.ts';
import type { World } from './types.ts';

const catalog = catalogLib.load();
const RETIRED_ROW = { id: 'old-tool', fingerprints: [{ pkg: 'old-tool-mcp' }], since: '0.7.0', reason: 'test fixture: the vendor stopped it' };
const OLD_TOOL: ServerEntry = { command: 'npx', args: ['-y', 'old-tool-mcp@1.0.0'] };
// the account file with these servers at local scope, as tests/inventory.test.ts's accountWith writes it
const localServers = (w: World, local: Record<string, ServerEntry>) => writeJson(account.accountFile(w.env), { mcpServers: {}, projects: { [accountKey(w.project)]: { mcpServers: local } } });
const build = (w: World, cat = catalog) => inventory.buildInventory({ project: w.project, env: w.env, catalog: cat });

test("a registration a retired entry fingerprints reads retiredRow: managed while its list holds it, the user's otherwise (spec D3)", () => {
    const w = world();
    try
    {
        const cat = { ...catalog, retired: [RETIRED_ROW] };
        localServers(w, { old: OLD_TOOL, mine: OLD_TOOL, kept: OLD_TOOL });
        writeJson(path.join(w.project, '.alfred-tools', 'mcps.json'), { version: 1, servers: [{ name: 'old', scope: 'local', row: 'old-tool', route: 'local', clients: ['claude'], entry: OLD_TOOL, key: null }], own: [{ name: 'kept', scope: 'local', fingerprint: 'pkg:old-tool-mcp', choice: 'own' }] });
        const i = build(w, cat);
        const at = (name: string) => i.registrations.find((r) => r.name === name)!;
        assert.deepStrictEqual([at('old').retiredRow, at('old').rowId, at('old').own], ['old-tool', null, false]);
        assert.deepStrictEqual([at('mine').retiredRow, at('mine').own], ['old-tool', true], 'no list entry: the user\'s');
        assert.deepStrictEqual([at('kept').retiredRow, at('kept').own], ['old-tool', true], 'left on its own: the user\'s');
        assert.match(renderTable(i, cat), /Retired from the catalog: .*old \(local, retired in 0\.7\.0\)/);
        // the shipped catalog retires nothing: the same launch is the user's own
        const shipped = build(w).registrations.find((r) => r.name === 'old')!;
        assert.deepStrictEqual([shipped.retiredRow, shipped.own], [undefined, true]);
    }
    finally { w.clean(); }
});

test('a registration a current row matches stays that row, whatever a retired entry fingerprints (spec D3)', () => {
    const w = world();
    try
    {
        const cat = { ...catalog, retired: [{ ...RETIRED_ROW, fingerprints: [{ pkg: '@upstash/context7-mcp' }] }] };
        localServers(w, { docs: { command: 'npx', args: ['-y', '@upstash/context7-mcp@4.7.0'] } });
        const docs = build(w, cat).registrations.find((r) => r.name === 'docs')!;
        assert.deepStrictEqual([docs.rowId, docs.retiredRow], ['context7', undefined]);
    }
    finally { w.clean(); }
});

test("an inherited registration a retired entry fingerprints stays the parent folder's (spec D3)", () => {
    const w = world();
    try
    {
        writeJson(path.join(w.dir, '.mcp.json'), { mcpServers: { above: OLD_TOOL } });
        const above = build(w, { ...catalog, retired: [RETIRED_ROW] }).registrations.find((r) => r.name === 'above' && r.scope === 'inherited')!;
        assert.deepStrictEqual([above.retiredRow, above.own], [undefined, true]);
    }
    finally { w.clean(); }
});

test('a list that carries a note or comes from the 0.4.x record holds no server as managed (spec D3)', () => {
    const w = world();
    try
    {
        localServers(w, { old: OLD_TOOL });
        writeJson(path.join(w.project, '.alfred-tools', 'mcps.json'), { version: 1, servers: [{ name: 'old', scope: 'local', row: 'old-tool', route: 'local', clients: ['claude'], entry: OLD_TOOL, key: null }], own: [] });
        const cat = { ...catalog, retired: [RETIRED_ROW] };
        const inventoryOf = (extra: { note?: string; old?: string }) =>
        {
            const built = build(w);
            built.lists!.project = { ...built.lists!.project!, ...extra };
            markRetired(built, cat);
            return built.registrations.find((r) => r.name === 'old')!;
        };
        assert.deepStrictEqual([inventoryOf({}).retiredRow, inventoryOf({}).own], ['old-tool', false], 'a plain list names it: managed');
        assert.strictEqual(inventoryOf({ note: 'the list is unreadable - read as empty' }).own, true, 'a note: not listed');
        assert.strictEqual(inventoryOf({ old: 'record.json' }).own, true, 'the old record: not listed');
    }
    finally { w.clean(); }
});
