// Retired MCP rows (spec D3): the inventory and the table here; fix's retired-server row and update's offer (Task 6).
import test from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as catalogLib from '../scripts/catalog/catalog.ts';
import * as inventory from '../scripts/inventory/inventory.ts';
import * as account from '../scripts/core/account.ts';
import { renderPlan } from '../scripts/plan/render.ts';
import { renderTable } from '../scripts/inventory/table.ts';
import { markRetired } from '../scripts/inventory/retired.ts';
import { isManaged } from '../scripts/inventory/fingerprint.ts';
import { plan } from '../scripts/plan/plan.ts';
import { apply } from '../scripts/apply/run.ts';
import * as cli from '../scripts/core/claude-cli.ts';
import { makeCtx, detectAll, applyFixes, renderFixes } from '../scripts/fix/fix.ts';
import { declineIdOf } from '../scripts/fix/retired-server.ts';
import { makeCtx as makeUpdateCtx, checkUpdates } from '../scripts/update/check.ts';
import { applyUpdates } from '../scripts/update/apply.ts';
import { world, writeJson, accountKey, readJson } from './helpers.ts';
import { noMachine, seed, ptRoot, localEntry, logged } from './fix-helpers.ts';
import { fakeRegistry, NOW, noLsp, listed0 } from './update-helpers.ts';
import type { Finding } from '../scripts/fix/types.ts';
import type { UpgradeOffer } from '../scripts/update/types.ts';
import type { ServerEntry } from '../scripts/core/types.ts';
import type { World } from './types.ts';

// The text a decline id hashes: the project's absolute path, lowercased on Windows, whose paths are case-blind
const projectKeyOf = (project: string) => (process.platform === 'win32' ? path.resolve(project).toLowerCase() : path.resolve(project));

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

// an emptied list is removed by writeList, so a missing file holds no entry
const listedNames = (file: string): string[] => (fs.existsSync(file) ? readJson(file).servers.map((server: { name: string }) => server.name) : []);
const retiredCtx = (w: World, data: string | null = null, env = w.env, project = w.project) => { const cat = { ...catalog, retired: [RETIRED_ROW] }; return makeCtx({ inventory: inventory.buildInventory({ project, env: w.env, catalog: cat, data }), catalog: cat, env, machine: noMachine(), data }); };

test("retired-server offers a managed retired server for removal, never one off the list; removing it drops its list entry and Cursor's copy (spec D3)", () =>
{
    const w = world();
    try
    {
        seed(w, 'old', 'local', OLD_TOOL);
        seed(w, 'mine', 'local', OLD_TOOL);
        writeJson(path.join(ptRoot(w), 'mcps.json'), { version: 1, servers: [{ name: 'old', scope: 'local', row: 'old-tool', route: 'local', clients: ['claude', 'cursor'], entry: OLD_TOOL, key: null }], own: [] });
        writeJson(path.join(w.project, '.cursor', 'mcp.json'), { mcpServers: { old: OLD_TOOL } });
        const found = detectAll(retiredCtx(w)).found.filter((f) => f.id === 'retired-server');
        assert.deepStrictEqual(found.map((f) => [f.name, f.scope]), [['old', 'local']]);
        const hash = createHash('sha256').update(projectKeyOf(w.project)).digest('hex').slice(0, 12);
        assert.strictEqual(found[0]!.declineId, `mcp:old:${hash}`);
        assert.match(renderFixes(detectAll(retiredCtx(w))), new RegExp(`retired-declined=mcp:old:${hash}~local`));
        const out = logged();
        const res = applyFixes(retiredCtx(w), ['retired-server'], { log: out.log });
        assert.strictEqual(res.failed, null, out.text());
        assert.strictEqual(localEntry(w, 'old'), undefined);
        assert.ok(localEntry(w, 'mine'), "the user's own is left");
        assert.ok(!listedNames(path.join(ptRoot(w), 'mcps.json')).includes('old'));
        assert.ok(!('old' in readJson(path.join(w.project, '.cursor', 'mcp.json')).mcpServers));
    }
    finally { w.clean(); }
});

test('retired-server: a decline is advice from then on, in this project only (spec D3)', () =>
{
    const w = world();
    const data = path.join(w.dir, 'data');
    try
    {
        seed(w, 'old', 'local', OLD_TOOL);
        writeJson(path.join(ptRoot(w), 'mcps.json'), { version: 1, servers: [{ name: 'old', scope: 'local', row: 'old-tool', route: 'local', clients: ['claude'], entry: OLD_TOOL, key: null }], own: [] });
        const [f] = detectAll(retiredCtx(w, data)).found.filter((x) => x.id === 'retired-server') as [Finding];
        applyFixes(retiredCtx(w, data), ['none'], { input: { 'retired-declined': `${f.declineId}~local` }, log: () => {} });
        const [again] = detectAll(retiredCtx(w, data)).found.filter((x) => x.id === 'retired-server') as [Finding];
        assert.deepStrictEqual([again.declined, Boolean(again.blocked)], [true, true]);
        assert.ok(localEntry(w, 'old'), 'nothing removed');
    }
    finally { w.clean(); }
});

const seedRetired = (w: World, project = w.project) =>
{
    assert.strictEqual(cli.runClaude(['mcp', 'add-json', 'old', JSON.stringify(OLD_TOOL), '-s', 'local'], { cwd: project, env: w.env }).status, 0);
    writeJson(path.join(project, '.alfred-tools', 'mcps.json'), { version: 1, servers: [{ name: 'old', scope: 'local', row: 'old-tool', route: 'local', clients: ['claude'], entry: OLD_TOOL, key: null }], own: [] });
};

test('update offers a retired server once under New ways to pass data; an install between keeps its list entry; a decline holds in this project only; the removal applies (spec D3)', async () =>
{
    const w = world();
    const data = path.join(w.dir, 'data');
    try
    {
        const cat = { ...catalog, retired: [RETIRED_ROW] };
        const ctxAt = (project: string) => makeUpdateCtx({ inventory: inventory.buildInventory({ project, env: w.env, catalog: cat, data }), project, catalog: cat, env: w.env, machine: noLsp, registry: fakeRegistry({}), now: NOW, refresh: false, data });
        seedRetired(w);
        // an install between the release and the update: the list keeps the retired entry, and inventory reads it retiredRow
        const p = plan(inventory.buildInventory({ project: w.project, env: w.env, catalog: cat }), { picks: { 'playwright-chrome': { scope: 'local' } } }, { home: w.home, env: w.env, catalog: cat });
        assert.deepStrictEqual(p.errors, []);
        assert.strictEqual(apply(p, { env: w.env, tmp: path.join(w.dir, 'tmp'), log: () => {} }).failed, null);
        assert.ok(listed0(w, 'old'), 'the list still holds the retired entry');
        const reg = inventory.buildInventory({ project: w.project, env: w.env, catalog: cat }).registrations.find((r) => r.name === 'old')!;
        assert.deepStrictEqual([reg.retiredRow, reg.own], ['old-tool', false]);
        const found = await checkUpdates(ctxAt(w.project));
        const offer = found.offers.find((o) => o.id === 'upgrade:retired-server:old~local') as UpgradeOffer | undefined;
        assert.ok(offer, found.offers.map((o) => o.id).join());
        // a retired registration has no row and no route: update offers it no pin move (offers-pins.ts:33-35 already holds)
        assert.ok(!found.offers.some((o) => o.id === 'mcp:old~local'), 'no pin offer for a retired server');
        const declineId = `mcp:old:${createHash('sha256').update(projectKeyOf(w.project)).digest('hex').slice(0, 12)}`;
        assert.strictEqual(offer.declineId, declineId);
        assert.ok((offer.notes || []).some((note) => note.includes(`retired-declined=${declineId}~local`)));
        // another project with the same name: its own offer
        const other = path.join(w.dir, 'other');
        fs.mkdirSync(other, { recursive: true });
        seedRetired(w, other);
        // declined here: not offered again here, still offered there
        applyUpdates(ctxAt(w.project), ['none'], found, { log: () => {}, input: { 'retired-declined': `${declineId}~local` } });
        assert.ok(!(await checkUpdates(ctxAt(w.project))).offers.some((o) => o.id.startsWith('upgrade:retired-server:')));
        const there = await checkUpdates(ctxAt(other));
        assert.ok(there.offers.some((o) => o.id === 'upgrade:retired-server:old~local'), 'the other project is offered still');
        // picked there: removed with its list entry
        const run2 = applyUpdates(ctxAt(other), ['upgrade:retired-server:old~local'], there, { log: () => {}, tmp: path.join(w.dir, 'tmp2') });
        assert.deepStrictEqual(run2.failed, []);
        assert.strictEqual(account.readAccount(w.env, other).local['old'], undefined);
        assert.ok(!listedNames(path.join(other, '.alfred-tools', 'mcps.json')).includes('old'));
    }
    finally { w.clean(); }
});

test("a retired managed server is never called the user's own in a change plan; a plan neither re-lists it nor keeps it on a remove (spec D3)", () =>
{
    const w = world();
    try
    {
        const cat = { ...catalog, retired: [RETIRED_ROW] };
        localServers(w, { old: OLD_TOOL });
        writeJson(path.join(w.project, '.alfred-tools', 'mcps.json'), { version: 1, servers: [{ name: 'old', scope: 'local', row: 'old-tool', route: 'local', clients: ['claude'], entry: OLD_TOOL, key: null }], own: [] });
        const i = build(w, cat);
        const old = i.registrations.find((r) => r.name === 'old')!;
        assert.deepStrictEqual([old.rowId, old.own, isManaged(old)], [null, false, true]);
        const changed = plan(i, { change: { 'mcp:old~local': { name: 'renamed' } } }, { home: w.home, env: w.env, catalog: cat });
        assert.strictEqual(changed.errors.length, 1);
        assert.match(changed.errors[0]!, /retired/);
        assert.ok(!/your own|matches no catalog row/.test(changed.errors[0]!), changed.errors[0]);
        // an unrelated install never upserts the retired entry into the list
        const added = plan(i, { picks: { 'playwright-chrome': { scope: 'local' } } }, { home: w.home, env: w.env, catalog: cat });
        const upserted = added.steps.flatMap((step) => (step.op === 'list-write' ? step.upserts.map((upsert) => upsert.server.name) : []));
        assert.ok(upserted.length > 0 && !upserted.includes('old'), upserted.join());
        // a remove takes the registration and drops its list entry
        const removed = plan(i, { remove: [{ kind: 'mcp', name: 'old', scope: 'local' }] }, { home: w.home, env: w.env, catalog: cat });
        assert.deepStrictEqual(removed.errors, []);
        const dropped = removed.steps.flatMap((step) => (step.op === 'list-write' ? step.drops.map((drop) => drop.key) : []));
        assert.deepStrictEqual([removed.steps.some((step) => step.op === 'mcp-remove' && step.name === 'old'), dropped], [true, ['mcp:old~local']]);
    }
    finally { w.clean(); }
});

test('a user-scope retired server has the decline id mcp:<name>, and a decline holds from a second project (spec D3)', async () =>
{
    const w = world();
    const data = path.join(w.dir, 'data');
    try
    {
        const cat = { ...catalog, retired: [RETIRED_ROW] };
        seed(w, 'old', 'user', OLD_TOOL);
        writeJson(path.join(w.home, '.alfred-tools', 'mcps.json'), { version: 1, servers: [{ name: 'old', scope: 'user', row: 'old-tool', route: 'local', clients: ['claude'], entry: OLD_TOOL, key: null }], own: [] });
        const other = path.join(w.dir, 'other');
        fs.mkdirSync(other, { recursive: true });
        const [here] = detectAll(retiredCtx(w, data)).found.filter((f) => f.id === 'retired-server') as [Finding];
        assert.deepStrictEqual([here.scope, here.declineId], ['user', 'mcp:old']);
        assert.match(here.note || '', /retired-declined=mcp:old~user/);
        applyFixes(retiredCtx(w, data), ['none'], { input: { 'retired-declined': 'mcp:old~user' }, log: () => {} });
        for (const project of [w.project, other])
        {
            const [again] = detectAll(retiredCtx(w, data, w.env, project)).found.filter((f) => f.id === 'retired-server') as [Finding];
            assert.deepStrictEqual([again.declineId, again.declined], ['mcp:old', true], project);
            const updateCtx = makeUpdateCtx({ inventory: inventory.buildInventory({ project, env: w.env, catalog: cat, data }), project, catalog: cat, env: w.env, machine: noLsp, registry: fakeRegistry({}), now: NOW, refresh: false, data });
            assert.ok(!(await checkUpdates(updateCtx)).offers.some((o) => o.id.startsWith('upgrade:retired-server:')), project);
        }
    }
    finally { w.clean(); }
});

test("a failed retired-server removal leaves the registration, its list entry and Cursor's copy as they were (spec D3)", () =>
{
    const w = world();
    try
    {
        seed(w, 'old', 'local', OLD_TOOL);
        writeJson(path.join(ptRoot(w), 'mcps.json'), { version: 1, servers: [{ name: 'old', scope: 'local', row: 'old-tool', route: 'local', clients: ['claude', 'cursor'], entry: OLD_TOOL, key: null }], own: [] });
        writeJson(path.join(w.project, '.cursor', 'mcp.json'), { mcpServers: { old: OLD_TOOL } });
        const out = logged();
        const res = applyFixes(retiredCtx(w, null, { ...w.env, FAKE_CLAUDE_FAIL: 'mcp remove old' }), ['retired-server'], { log: out.log, tmp: path.join(w.dir, 'tmp') });
        assert.ok(res.failed, out.text());
        assert.ok(localEntry(w, 'old'), 'the registration is still there');
        assert.deepStrictEqual(listedNames(path.join(ptRoot(w), 'mcps.json')), ['old']);
        assert.deepStrictEqual(readJson(path.join(w.project, '.cursor', 'mcp.json')).mcpServers, { old: OLD_TOOL });
    }
    finally { w.clean(); }
});

test("configure's remove of a retired managed server names its retired row in the plan, never null (spec D3)", () =>
{
    const w = world();
    try
    {
        const cat = { ...catalog, retired: [RETIRED_ROW] };
        localServers(w, { old: OLD_TOOL });
        writeJson(path.join(w.project, '.alfred-tools', 'mcps.json'), { version: 1, servers: [{ name: 'old', scope: 'local', row: 'old-tool', route: 'local', clients: ['claude'], entry: OLD_TOOL, key: null }], own: [] });
        const removed = plan(build(w, cat), { remove: [{ kind: 'mcp', name: 'old', scope: 'local' }] }, { home: w.home, env: w.env, catalog: cat });
        assert.deepStrictEqual(removed.errors, []);
        const step = removed.steps.find((candidate) => candidate.op === 'mcp-remove');
        assert.strictEqual(step && 'why' in step ? step.why : undefined, "remove 'old' (old-tool) at local scope");
        const text = renderPlan(removed);
        assert.match(text, /old-tool/);
        assert.ok(!/\bnull\b/.test(text), text);
    }
    finally { w.clean(); }
});

test('the decline id of a project: a posix path hashes as the raw text, a win32 path ignores its drive-letter case (spec D3)', () =>
{
    const hash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 12);
    assert.strictEqual(declineIdOf('old', 'local', '/work/shop', 'darwin'), `mcp:old:${hash('/work/shop')}`);
    assert.strictEqual(declineIdOf('old', 'local', '/work/shop', 'linux'), `mcp:old:${hash('/work/shop')}`);
    assert.strictEqual(declineIdOf('old', 'local', 'C:\\work\\shop', 'win32'), declineIdOf('old', 'local', 'c:\\work\\shop', 'win32'));
    assert.notStrictEqual(declineIdOf('old', 'local', 'C:\\work\\shop', 'win32'), declineIdOf('old', 'local', 'C:\\work\\other', 'win32'));
    assert.strictEqual(declineIdOf('old', 'user', 'C:\\work\\shop', 'win32'), 'mcp:old', 'user scope holds no project');
});
