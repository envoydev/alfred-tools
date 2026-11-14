'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { world, writeJson, readJson, tempOf, helperCmd } = require('./helpers.js');
const inventory = require('../scripts/inventory/inventory.js');
const { plan } = require('../scripts/plan.js');
const { apply } = require('../scripts/apply/run.js');
const cli = require('../scripts/core/claude-cli.js');
const update = require('../scripts/update.js');
const registry = require('../scripts/catalog/registry.js');
const { pinnedVersion } = require('../scripts/fixes/common.js');

const DAY = 86400000;
const NOW = Date.parse('2026-10-27T12:00:00Z');
const ago = (days) => NOW - days * DAY;

// a fake registry: { 'pypi:serena-agent': [{ version, time }] }
const fakeRegistry = (table) => ({ versionsOf: async (reg, name) => { const v = table[`${reg}:${name}`]; if (!v) throw new Error(`no such package ${name}`); return v; } });
// a machine with no runtimes on it
const noLsp = { which: () => null, run: () => ({ status: 1, stdout: '', stderr: '' }), nodeVersion: process.versions.node };

const install = (w, answers) =>
{
    const inv = inventory.buildInventory({ project: w.project, env: w.env });
    const p = plan(inv, answers, { home: w.home, env: w.env });
    assert.deepStrictEqual(p.errors, []);
    const r = apply(p, { env: w.env, tmp: path.join(w.dir, 'tmp'), log: () => {} });
    assert.strictEqual(r.failed, null);
};

async function run(w, argv, opts = {})
{
    const lines = [];
    // an apply that hands a fetch file on keeps its <tmp> for the command's next step: inside the world, w.clean() takes it
    const tmp = argv.includes('--apply') && !argv.includes('--tmp') ? ['--tmp', fs.mkdtempSync(path.join(w.dir, 'preferred-tools-'))] : [];
    const code = await update.main([...argv, ...tmp, '--project', w.project], { env: w.env, out: (s) => lines.push(s), machine: noLsp, now: NOW, registry: fakeRegistry({}), ...opts });
    return { code, text: lines.join('\n') };
}

const pypiSerena = (...v) => ({ 'pypi:serena-agent': v.map(([version, days]) => ({ version, time: ago(days) })) });

// ---- the pin edit --------------------------------------------------------------------------------------------------

test('bumpEntry moves the pin and the cut-off beside it, and nothing else', () =>
{
    const serena = { command: 'uvx', args: ['--python', '3.13', '--exclude-newer', '2026-10-20T23:59:59Z', '--from', 'serena-agent@2.1.0', 'serena', 'start-mcp-server', '--my-flag'], env: { SERENA_HOME: '/x' } };
    const b = update.bumpEntry(serena, 'serena-agent', '2.2.0', '2026-10-27T23:59:59Z');
    assert.deepStrictEqual(b.args, ['--python', '3.13', '--exclude-newer', '2026-10-27T23:59:59Z', '--from', 'serena-agent@2.2.0', 'serena', 'start-mcp-server', '--my-flag']);
    assert.deepStrictEqual(b.env, serena.env);
    assert.strictEqual(serena.args[5], 'serena-agent@2.1.0', 'the input is not mutated');

    const memory = { command: 'uvx', args: ['--from', 'mcp-memory-service[sqlite]==12.1.1', 'memory', 'server'] };
    assert.strictEqual(update.bumpEntry(memory, 'mcp-memory-service', '12.2.0', 'C').args[1], 'mcp-memory-service[sqlite]==12.2.0');
    assert.deepStrictEqual(update.bumpEntry(memory, 'mcp-memory-service', '12.2.0', 'C').args.includes('--exclude-newer'), false, 'a cut-off the user removed stays removed');

    const npx = { command: 'npx', args: ['-y', '@playwright/mcp@0.0.83', '--browser', 'chrome', '--user-data-dir', '/p'], env: { npm_config_before: '2026-10-20T23:59:59Z', MINE: '1' } };
    const n = update.bumpEntry(npx, '@playwright/mcp', '0.0.90', '2026-10-27T23:59:59Z');
    assert.deepStrictEqual(n.args, ['-y', '@playwright/mcp@0.0.90', '--browser', 'chrome', '--user-data-dir', '/p']);
    assert.deepStrictEqual(n.env, { npm_config_before: '2026-10-27T23:59:59Z', MINE: '1' });

    const win = { command: 'cmd', args: ['/c', 'npx', '-y', 'appium-mcp@1.97.1'], env: { npm_config_before: 'old' } };
    assert.deepStrictEqual(update.bumpEntry(win, 'appium-mcp', '1.98.0', 'new').args, ['/c', 'npx', '-y', 'appium-mcp@1.98.0']);

    assert.strictEqual(update.bumpEntry({ command: 'npx', args: ['-y', 'appium-mcp'] }, 'appium-mcp', '1.98.0', 'x'), null, 'no pin, no edit');
});

// ---- the age gate --------------------------------------------------------------------------------------------------

test('choose: newest stable release at least 7 days old and newer than the pin; younger ones are held back', () =>
{
    const v = (version, days, extra = {}) => ({ version, time: ago(days), ...extra });
    const list = [v('2.1.0', 40), v('2.2.0', 20), v('2.3.0', 8), v('2.4.0', 2), v('2.5.0rc1', 30), v('2.4.1.dev3', 30)];
    const r = registry.choose(list, { registry: 'pypi', now: NOW, current: '2.1.0' });
    assert.strictEqual(r.offer.version, '2.3.0');
    assert.deepStrictEqual(r.held, [{ version: '2.4.0', ageDays: 2 }], 'a pre-release is neither offered nor held back');
    assert.strictEqual(registry.choose(list, { registry: 'pypi', now: NOW, current: '2.3.0' }).offer, null, 'at the newest eligible already');
    assert.strictEqual(registry.choose(list, { registry: 'pypi', now: NOW, current: '9.0.0' }).offer, null, 'a pin ahead of the registry is left');
    // exactly 7 days old is eligible
    assert.strictEqual(registry.choose([v('1.0.0', 8), v('1.1.0', 7)], { registry: 'npm', now: NOW, current: '1.0.0' }).offer.version, '1.1.0');
    assert.strictEqual(registry.choose([v('1.0.0', 8), v('1.1.0-beta.1', 30)], { registry: 'npm', now: NOW, current: '1.0.0' }).offer, null);
    assert.strictEqual(registry.cutoffOf(NOW), '2026-10-27T23:59:59Z');
});

test('versionsOf reads the npm and PyPI document shapes (a deprecated or yanked release is left out)', async () =>
{
    const server = http.createServer((req, res) =>
    {
        res.setHeader('content-type', 'application/json');
        if (req.url === '/@scope%2Fpkg') return res.end(JSON.stringify({ versions: { '1.0.0': {}, '1.1.0': { deprecated: 'use 1.2' }, '1.2.0': {} }, time: { created: '2026-01-01T00:00:00Z', '1.0.0': '2026-01-01T00:00:00Z', '1.1.0': '2026-02-01T00:00:00Z', '1.2.0': '2026-03-01T00:00:00Z' } }));
        if (req.url === '/mypkg/json') return res.end(JSON.stringify({ releases: { '1.0': [{ upload_time_iso_8601: '2026-01-01T00:00:00.000000Z', yanked: false }], '1.1': [{ upload_time_iso_8601: '2026-02-01T00:00:00.000000Z', yanked: true }], '1.2': [] } }));
        res.statusCode = 404;
        res.end('{}');
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try
    {
        const env = { PREFERRED_TOOLS_NPM_URL: base, PREFERRED_TOOLS_PYPI_URL: base };
        assert.deepStrictEqual((await registry.versionsOf('npm', '@scope/pkg', { env })).map((x) => x.version), ['1.0.0', '1.2.0']);
        assert.deepStrictEqual((await registry.versionsOf('pypi', 'mypkg', { env })).map((x) => x.version), ['1.0']);
        await assert.rejects(registry.versionsOf('npm', 'missing', { env }), /HTTP 404/);
    }
    finally { server.close(); }
});

// ---- MCP pins ------------------------------------------------------------------------------------------------------

test('an offer: serena is behind, the table shows current -> offered, apply rewrites it under the same name and scope', async () =>
{
    const w = world();
    try
    {
        install(w, { picks: { serena: { scope: 'local' } } });
        const before = inventory.buildInventory({ project: w.project, env: w.env }).registrations.find((r) => r.name === 'serena');
        // the user's own addition, which an update must keep
        const mine = { ...before.entry, args: [...before.entry.args, '--my-flag'] };
        cli.run(['mcp', 'remove', 'serena', '-s', 'local'], { cwd: w.project, env: w.env });
        cli.run(['mcp', 'add-json', 'serena', JSON.stringify(mine), '-s', 'local'], { cwd: w.project, env: w.env });

        const reg = fakeRegistry(pypiSerena(['2.1.0', 60], ['2.2.0', 20]));
        const setupWrites = w.writes().length;
        const c = await run(w, ['--check', '--no-refresh'], { registry: reg });
        assert.strictEqual(c.code, 0);
        assert.match(c.text, /MCP servers \(pin -> newest release at least 7 days old\):\n\s+serena \(local\)\s+2\.1\.0 -> 2\.2\.0\s+\(20 days old\)/);
        assert.doesNotMatch(c.text, /everything current/);
        assert.strictEqual(w.writes().length, setupWrites, 'a check writes nothing');

        const a = await run(w, ['--apply', 'mcp:serena~local'], { registry: reg });
        assert.strictEqual(a.code, 0, a.text);
        assert.match(a.text, /ok\s+serena \(local\): serena-agent 2\.1\.0 -> 2\.2\.0/);
        const after = inventory.buildInventory({ project: w.project, env: w.env }).registrations.find((r) => r.name === 'serena');
        assert.strictEqual(after.scope, 'local');
        assert.strictEqual(pinnedVersion(after.entry, 'serena-agent'), '2.2.0');
        assert.ok(after.entry.args.includes('--my-flag'), 'the user\'s added arg survives');
        assert.strictEqual(after.entry.args[after.entry.args.indexOf('--exclude-newer') + 1], '2026-10-27T23:59:59Z', 'the cut-off is the bump day');
        assert.deepStrictEqual(after.entry.env, before.entry.env);
        assert.strictEqual(after.rowId, 'serena', 'still matched by what it launches');
    }
    finally { w.clean(); }
});

test('nothing behind: one line, and no write call', async () =>
{
    const w = world();
    try
    {
        install(w, { picks: { serena: { scope: 'local' } } });
        const c = await run(w, ['--check', '--no-refresh'], { registry: fakeRegistry(pypiSerena(['2.1.0', 60])) });
        assert.match(c.text, /^preferred-tools: everything current$/m);
        const writesBefore = w.writes().length;
        const q = await run(w, ['--questions', '--no-refresh'], { registry: fakeRegistry(pypiSerena(['2.1.0', 60])) });
        assert.deepStrictEqual(JSON.parse(q.text), { offer: null, pick: [], cursorOffers: [], cursorNameQuestions: [] });
        assert.strictEqual(w.writes().length, writesBefore);
    }
    finally { w.clean(); }
});

test('a release younger than 7 days is held back, never offered', async () =>
{
    const w = world();
    try
    {
        install(w, { picks: { serena: { scope: 'local' } } });
        const c = await run(w, ['--check', '--no-refresh'], { registry: fakeRegistry(pypiSerena(['2.1.0', 60], ['2.2.0', 3])) });
        assert.match(c.text, /serena \(local\): serena-agent 2\.2\.0 is 3 day\(s\) old - held back until it is 7/);
        assert.doesNotMatch(c.text, /->\s*2\.2\.0/);
        const a = await run(w, ['--apply', 'all', '--no-refresh'], { registry: fakeRegistry(pypiSerena(['2.1.0', 60], ['2.2.0', 3])) });
        assert.strictEqual(a.code, 0);
        assert.strictEqual(w.calls().filter((x) => x[1] === 'add-json').length, 1, 'only the install add; the update changed nothing');
    }
    finally { w.clean(); }
});

test('a remote route, a docker tag and the user\'s own server are skipped or left alone; a registry failure is reported, not read as current', async () =>
{
    const w = world();
    try
    {
        install(w, { picks: { context7: { route: 'remote', scope: 'project' }, serena: { scope: 'local' } } });
        cli.run(['mcp', 'add-json', 'my-own', JSON.stringify({ command: 'npx', args: ['-y', 'some-pkg@1.0.0'] }), '-s', 'user'], { cwd: w.project, env: w.env });
        const c = await run(w, ['--check', '--no-refresh'], { registry: fakeRegistry({ 'npm:some-pkg': [{ version: '2.0.0', time: ago(90) }] }) });
        assert.match(c.text, /context7 \(project\): a hosted URL has no pin/);
        assert.match(c.text, /Could not check:\n\s+serena \(local\): pypi lookup for serena-agent failed - no such package/);
        assert.doesNotMatch(c.text, /everything current/);
        assert.doesNotMatch(c.text, /my-own|some-pkg/, 'a registration that matches no row is not looked at');
    }
    finally { w.clean(); }
});

test('an inherited server is skipped with its folder named', async () =>
{
    const w = world();
    try
    {
        writeJson(path.join(w.dir, '.mcp.json'), { mcpServers: { context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp@2.0.0'] } } });
        const c = await run(w, ['--check', '--no-refresh'], { registry: fakeRegistry({ 'npm:@upstash/context7-mcp': [{ version: '9.0.0', time: ago(90) }] }) });
        assert.match(c.text, /context7 \(inherited\): inherited from \.\. - update it there/);
        assert.doesNotMatch(c.text, /2\.0\.0 -> 9\.0\.0/, 'never offered, however far behind');
    }
    finally { w.clean(); }
});

test('apply names an id nothing is behind under, and exits 1', async () =>
{
    const w = world();
    try
    {
        install(w, { picks: { serena: { scope: 'local' } } });
        const a = await run(w, ['--apply', 'mcp:serena~user', '--no-refresh'], { registry: fakeRegistry(pypiSerena(['2.1.0', 60], ['2.2.0', 20])) });
        assert.strictEqual(a.code, 1);
        assert.match(a.text, /NOT OFFERED mcp:serena~user/);
    }
    finally { w.clean(); }
});

// ---- plugins -------------------------------------------------------------------------------------------------------

// a marketplace clone the fake lists, holding the given plugin entries; plugin folders carry their own plugin.json
function marketplace(w, name, plugins)
{
    const loc = path.join(w.dir, 'clones', name);
    writeJson(path.join(loc, '.claude-plugin', 'marketplace.json'), { name, owner: { name: 'o' }, plugins: plugins.map((p) => ({ name: p.name, source: p.source || `./plugins/${p.name}`, ...(p.entryVersion ? { version: p.entryVersion } : {}) })) });
    for (const p of plugins) if (p.version) writeJson(path.join(loc, 'plugins', p.name, '.claude-plugin', 'plugin.json'), { name: p.name, version: p.version });
    return loc;
}
function seed(w, { markets, installed })
{
    const f = path.join(w.dir, 'state', 'plugins.json');
    writeJson(f, {
        marketplaces: markets.map(([name, loc]) => ({ name, repo: `x/${name}`, installLocation: loc })),
        installed: installed.map(([id, version, scope]) => ({ id, version, scope, enabled: true, installPath: path.join(w.dir, 'cache', id), ...(scope === 'user' ? {} : { projectPath: fs.realpathSync(w.project) }) })),
    });
}

test('plugins: every installed plugin is offered under Other plugins; the marketplace is refreshed; apply updates at the plugin\'s own scope and reads the version back', async () =>
{
    const w = world();
    try
    {
        const official = marketplace(w, 'claude-plugins-official', [{ name: 'pyright-lsp', version: '1.1.0' }]);
        const mine = marketplace(w, 'someone', [{ name: 'tidy', version: '0.5.0' }, { name: 'same', version: '1.0.0' }]);
        seed(w, { markets: [['claude-plugins-official', official], ['someone', mine]], installed: [['pyright-lsp@claude-plugins-official', '1.0.0', 'project'], ['tidy@someone', '0.4.0', 'user'], ['same@someone', '1.0.0', 'user']] });
        const c = await run(w, ['--check']);
        assert.doesNotMatch(c.text, /Catalog plugins:/, 'the catalog lists no plugin');
        assert.match(c.text, /Other plugins:\n\s+pyright-lsp@claude-plugins-official \(project\)\s+1\.0\.0 -> 1\.1\.0\n\s+tidy@someone \(user\)\s+0\.4\.0 -> 0\.5\.0/);
        assert.doesNotMatch(c.text, /same@someone/, 'a plugin at the listed version is not offered');
        assert.ok(w.calls().some((a) => a.join(' ') === 'plugin marketplace update someone'), 'each marketplace is refreshed');

        const env = { ...w.env, FAKE_CLAUDE_VERSIONS: JSON.stringify({ 'pyright-lsp@claude-plugins-official': '1.1.0', 'tidy@someone': '0.5.0' }) };
        const a = await run(w, ['--apply', 'all', '--no-refresh'], { env });
        assert.strictEqual(a.code, 0, a.text);
        assert.match(a.text, /ok\s+pyright-lsp@claude-plugins-official \(project\): 1\.0\.0 -> 1\.1\.0/);
        assert.match(a.text, /ok\s+tidy@someone \(user\): 0\.4\.0 -> 0\.5\.0/);
        const updates = w.calls().filter((x) => x[0] === 'plugin' && x[1] === 'update');
        assert.deepStrictEqual(updates.map((x) => x.slice(2)), [['pyright-lsp@claude-plugins-official', '--scope', 'project'], ['tidy@someone', '--scope', 'user']]);
    }
    finally { w.clean(); }
});

test('a marketplace entry with no version is unchecked: listed, and updated only on its own id', async () =>
{
    const w = world();
    try
    {
        const loc = path.join(w.dir, 'clones', 'gh');
        writeJson(path.join(loc, '.claude-plugin', 'marketplace.json'), { name: 'gh', owner: { name: 'o' }, plugins: [{ name: 'remote-one', source: { source: 'github', repo: 'a/b' } }] });
        seed(w, { markets: [['gh', loc]], installed: [['remote-one@gh', '1.0.0', 'user']] });
        const env = { ...w.env, FAKE_CLAUDE_VERSIONS: JSON.stringify({ 'remote-one@gh': '1.0.1' }) };
        const c = await run(w, ['--check', '--no-refresh'], { env });
        assert.match(c.text, /lists no version.*\n\s+remote-one@gh \(user\)\s+1\.0\.0/);
        assert.doesNotMatch(c.text, /everything current/);
        const all = await run(w, ['--apply', 'all', '--no-refresh'], { env });
        assert.strictEqual(w.calls().filter((x) => x[1] === 'update').length, 0, '"all" does not run an update that has no known newer version');
        assert.strictEqual(all.code, 0);
        const one = await run(w, ['--apply', 'plugin:remote-one@gh~user', '--no-refresh'], { env });
        assert.match(one.text, /ok\s+remote-one@gh \(user\): 1\.0\.0 -> 1\.0\.1/);
    }
    finally { w.clean(); }
});

test('a marketplace that is not registered is skipped with a line, and a failed refresh is said, not hidden', async () =>
{
    const w = world();
    try
    {
        const loc = marketplace(w, 'known', [{ name: 'p', version: '2.0.0' }]);
        seed(w, { markets: [['known', loc]], installed: [['p@known', '1.0.0', 'user'], ['q@gone', '1.0.0', 'user']] });
        const env = { ...w.env, FAKE_CLAUDE_FAIL: 'marketplace update known' };
        const c = await run(w, ['--check'], { env });
        assert.match(c.text, /q@gone \(user\): its marketplace 'gone' is not registered/);
        assert.match(c.text, /marketplace known did not refresh .* compared against its last clone/);
        assert.match(c.text, /p@known \(user\)\s+1\.0\.0 -> 2\.0\.0/);
    }
    finally { w.clean(); }
});

// ---- retired-plugin (spec D8, D9) -----------------------------------------------------------------------------------

const HUD = 'claude-hud@claude-hud';
const TSL = 'typescript-lsp@claude-plugins-official';

test('retired-plugin at two scopes is two offers, and picking one uninstalls only that scope', async () =>
{
    const w = world();
    try
    {
        seed(w, { markets: [], installed: [[HUD, '0.15.0', 'user'], [HUD, '0.15.0', 'project']] });
        const c = await run(w, ['--check', '--no-refresh', '--data', path.join(w.dir, 'data')]);
        assert.match(c.text, /New ways to pass data:\n\s+claude-hud@claude-hud \(user\)\s+retired-plugin: /);
        const q = update.questions(JSON.parse((await run(w, ['--check', '--json', '--no-refresh'])).text));
        const ids = q.pick.flat().flatMap((i) => i.options.map((o) => o.description));
        assert.deepStrictEqual(ids.filter((d) => d.startsWith('upgrade:retired-plugin')).sort(), [`upgrade:retired-plugin:${HUD}~project`, `upgrade:retired-plugin:${HUD}~user`]);
        const a = await run(w, ['--apply', `upgrade:retired-plugin:${HUD}~project`, '--no-refresh']);
        assert.strictEqual(a.code, 0, a.text);
        assert.deepStrictEqual(w.calls().filter((x) => x[0] === 'plugin' && x[1] === 'uninstall').map((x) => x.slice(2)), [[HUD, '--scope', 'project']]);
        assert.match(a.text, /ok +claude-hud@claude-hud \(project\): retired-plugin/);
        assert.match(a.text, /claude-hud's statusLine is kept - claude-hud is still installed at user/);
    }
    finally { w.clean(); }
});

test('a declined id and scope lands in retired-declined.json and the next update does not offer it', async () =>
{
    const w = world();
    const data = path.join(w.dir, 'data');
    try
    {
        seed(w, { markets: [], installed: [[HUD, '0.15.0', 'user'], [TSL, '1.0.0', 'project']] });
        // 'Pick which' with the typescript-lsp offer picked: claude-hud, shown and left unpicked, is passed as declined
        const a = await run(w, ['--apply', `upgrade:retired-plugin:${TSL}~project`, '--input', `retired-declined=${HUD}~user`, '--no-refresh', '--data', data]);
        assert.strictEqual(a.code, 0, a.text);
        assert.deepStrictEqual(readJson(path.join(data, 'retired-declined.json')).declined, [{ id: HUD, scope: 'user' }]);
        const c = await run(w, ['--check', '--json', '--no-refresh', '--data', data]);
        const out = JSON.parse(c.text);
        assert.ok(!out.offers.some((o) => o.fix === 'retired-plugin'), 'not offered again');
        assert.ok(!out.offers.some((o) => o.kind === 'plugin' && o.plugin === HUD), 'nor updated in place of the uninstall it waits on');
    }
    finally { w.clean(); }
});

test('a declined retired-plugin adds no note and no waiting count to update', async () =>
{
    const w = world();
    const data = path.join(w.dir, 'data');
    try
    {
        seed(w, { markets: [], installed: [[HUD, '0.15.0', 'user']] });
        require('../scripts/core/declines.js').add(data, [{ id: HUD, scope: 'user' }]);
        const out = JSON.parse((await run(w, ['--check', '--json', '--no-refresh', '--data', data])).text);
        assert.deepStrictEqual([out.offers.filter((o) => o.fix === 'retired-plugin').length, out.notes.filter((n) => n.includes('claude-hud')).length, out.waiting], [0, 0, 0]);
    }
    finally { w.clean(); }
});

test('where alfred-code is set up, All of them keeps the retired plugins out, names each and passes on the decline', async () =>
{
    const w = world();
    const data = path.join(w.dir, 'data');
    try
    {
        seed(w, { markets: [], installed: [[HUD, '0.15.0', 'user'], ['alfred-code@envoydev', '2.12.0', 'user']] });
        const out = JSON.parse((await run(w, ['--check', '--json', '--no-refresh', '--data', data])).text);
        const offer = out.offers.find((o) => o.fix === 'retired-plugin');
        assert.strictEqual(offer.alfred, true);
        assert.strictEqual(offer.label, `${HUD} - alfred-code also installs it, and this removes it for both`);
        const a = await run(w, ['--apply', 'all', '--input', `retired-declined=${HUD}~user`, '--no-refresh', '--data', data]);
        assert.match(a.text, /claude-hud@claude-hud kept - alfred-code installs it; fix lists it/);
        assert.ok(!w.calls().some((x) => x[0] === 'plugin' && x[1] === 'uninstall'));
        assert.deepStrictEqual(readJson(path.join(data, 'retired-declined.json')).declined, [{ id: HUD, scope: 'user' }]);
    }
    finally { w.clean(); }
});

test('update parseArgs takes repeated --input key=value and refuses one without =', () =>
{
    assert.deepStrictEqual(update.parseArgs(['--apply', 'all', '--input', 'a=1', '--input', 'retired-declined=x@y~user,z@y~local']).input, { a: '1', 'retired-declined': 'x@y~user,z@y~local' });
    assert.throws(() => update.parseArgs(['--apply', 'all', '--input', 'novalue']), /--input needs key=value/);
    assert.deepStrictEqual(update.parseArgs(['--check']).input, {});
});

// ---- the asks ------------------------------------------------------------------------------------------------------

test('the asks stay within the AskUserQuestion limits; every pick option carries its offer id', () =>
{
    const mk = (n, group, kind) => Array.from({ length: n }, (_, i) => ({ kind, id: `${kind}:${group}${i}~user`, group, label: `${group}${i}`, from: '1.0.0', to: '1.1.0' }));
    const out = { offers: [...mk(6, 'catalog', 'plugin'), ...mk(5, 'other', 'plugin'), ...mk(3, 'mcp', 'mcp')], unchecked: mk(2, 'other', 'plugin').map((o) => ({ ...o, id: o.id + 'u', to: null })), skipped: [], held: [], errors: [], lsp: [], notes: [] };
    const q = update.questions(out);
    assert.deepStrictEqual(q.offer.options.map((o) => o.label), ['All of them (Recommended)', 'Pick which', 'Skip']);
    assert.ok(q.pick.length >= 1);
    for (const call of q.pick)
    {
        assert.ok(call.length >= 1 && call.length <= 4);
        for (const item of call)
        {
            assert.ok(item.options.length <= 4);
            for (const o of item.options) assert.match(o.description, /^(plugin|mcp):/);
        }
    }
    const labels = q.pick.flat().flatMap((i) => i.options.map((o) => o.label));
    assert.strictEqual(new Set(labels).size, labels.length, 'labels are unique');
    // only unchecked plugins: 'All of them' would update nothing, so the recommended option is 'Pick which'
    const only = update.questions({ ...out, offers: [] });
    assert.deepStrictEqual(only.offer.options.map((o) => o.label), ['Pick which (Recommended)', 'Skip']);
});

test('arguments: exactly one mode, and a stray flag is refused', async () =>
{
    const w = world();
    try
    {
        assert.strictEqual((await run(w, [])).code, 2);
        assert.strictEqual((await run(w, ['--check', '--questions'])).code, 2);
        assert.match((await run(w, ['--nope'])).text, /unknown argument/);
    }
    finally { w.clean(); }
});

test('update --apply keeps <tmp> while a fetch file is handed on, and apply() called per server never removes it', async () =>
{
    const w = world();
    // update.main runs in this process: its os.tmpdir() is pointed at the world's own temp folder for the test
    const saved = { TMPDIR: process.env.TMPDIR, TEMP: process.env.TEMP, TMP: process.env.TMP };
    try
    {
        const t = tempOf(w);
        Object.assign(process.env, { TMPDIR: t.root, TEMP: t.root, TMP: t.root });
        install(w, { picks: { sentry: { route: 'local', scope: 'local' }, serena: { scope: 'local' } } });
        // a live token in the sentry registration, as a user may have written it there
        const token = `sntryu_${crypto.randomBytes(16).toString('hex')}`;
        const before = inventory.buildInventory({ project: w.project, env: w.env }).registrations.find((r) => r.rowId === 'sentry');
        cli.run(['mcp', 'remove', before.name, '-s', 'local'], { cwd: w.project, env: w.env });
        cli.run(['mcp', 'add-json', before.name, JSON.stringify({ ...before.entry, env: { ...before.entry.env, SENTRY_ACCESS_TOKEN: token } }), '-s', 'local'], { cwd: w.project, env: w.env });
        const reg = fakeRegistry({ ...pypiSerena(['2.1.0', 60], ['2.2.0', 20]), 'npm:@sentry/mcp-server': [{ version: '0.42.0', time: ago(60) }, { version: '0.43.0', time: ago(20) }] });

        const dir = t.made();
        fs.writeFileSync(path.join(dir, 'inventory.json'), '{}');
        const a = await run(w, ['--apply', `mcp:serena~local,mcp:${before.name}~local`, '--tmp', dir], { registry: reg });
        assert.strictEqual(a.code, 0, a.text);
        assert.ok(fs.existsSync(path.join(dir, 'inventory.json')), 'apply() per server never removes the shared folder');
        const job = fs.readFileSync(path.join(dir, 'fetch.json'), 'utf8');
        assert.deepStrictEqual(JSON.parse(job).fetch.map((s) => s.name).sort(), [before.name, 'serena'].sort());
        assert.ok(!job.includes(token), 'the fetch file holds no live value');
        assert.ok(!a.text.includes(token));

        const none = t.made();
        const b = await run(w, ['--apply', 'mcp:nothing~local', '--tmp', none], { registry: reg });
        assert.strictEqual(b.code, 1);
        assert.ok(!fs.existsSync(none), 'nothing handed on: the folder is removed');
    }
    finally
    {
        for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
        w.clean();
    }
});

// ---- a server left on its own (spec D6) --------------------------------------------------------------------------------
const C7_PINNED = { command: 'npx', args: ['-y', '@upstash/context7-mcp@2.0.0'] };
const C7_AHEAD = () => fakeRegistry({ 'npm:@upstash/context7-mcp': [{ version: '9.0.0', time: ago(90) }] });
const ownRecord = (dir) => writeJson(path.join(dir, 'preferred-tools.json'), { version: 1, servers: [{ name: 'context7', scope: 'local', fingerprint: 'pkg:@upstash/context7-mcp', choice: 'own' }] });

test('update: a pinned server on its own is skipped, not offered', async () =>
{
    const w = world();
    try
    {
        assert.strictEqual(cli.run(['mcp', 'add-json', 'context7', JSON.stringify(C7_PINNED), '-s', 'local'], { cwd: w.project, env: w.env }).status, 0);
        assert.match((await run(w, ['--check', '--no-refresh'], { registry: C7_AHEAD() })).text, /2\.0\.0 -> 9\.0\.0/, 'managed: offered');
        ownRecord(path.join(w.project, '.preferred-tools'));
        const c = await run(w, ['--check', '--no-refresh'], { registry: C7_AHEAD() });
        assert.strictEqual(c.code, 0);
        assert.match(c.text, /context7 \(local\): on its own - not checked/);
        assert.doesNotMatch(c.text, /2\.0\.0 -> 9\.0\.0/);
        const q = await run(w, ['--questions', '--no-refresh'], { registry: C7_AHEAD() });
        assert.doesNotMatch(q.text, /context7/, 'not in the asks either');
    }
    finally { w.clean(); }
});

test('fix and update take --data after their read-only flag', async () =>
{
    const fix = require('../scripts/fix.js');
    const roots = require('../scripts/roots/roots.js');
    const w = world();
    try
    {
        assert.strictEqual(cli.run(['mcp', 'add-json', 'context7', JSON.stringify(C7_PINNED), '-s', 'local'], { cwd: w.project, env: w.env }).status, 0);
        const data = path.join(w.dir, 'data');
        const named = path.join(w.project, 'tools');
        ownRecord(named);
        writeJson(path.join(data, 'roots.json'), { version: 1, global: null, projects: { [roots.mapKey(w.project)]: named } });
        const lines = [];
        assert.strictEqual(fix.main(['--detect', '--data', data, '--project', w.project], { env: w.env, out: (s) => lines.push(s) }), 0, lines.join('\n'));
        assert.match(lines.join('\n'), /context7 \(local\): on its own - not checked/);
        const c = await run(w, ['--check', '--no-refresh', '--data', data], { registry: C7_AHEAD() });
        assert.strictEqual(c.code, 0, c.text);
        assert.match(c.text, /context7 \(local\): on its own - not checked/);
        assert.doesNotMatch(c.text, /2\.0\.0 -> 9\.0\.0/);
        // without --data the named root's record is not found: managed, so offered
        assert.match((await run(w, ['--check', '--no-refresh'], { registry: C7_AHEAD() })).text, /2\.0\.0 -> 9\.0\.0/);
        assert.strictEqual(fix.main(['--detect', '--data'], { env: w.env, out: () => {} }), 2, 'a flag without its value');
    }
    finally { w.clean(); }
});

test('update offers and rewrites a lower-numbered helper copy; leaves a higher one', async () =>
{
    const roots = require('../scripts/roots/roots.js');
    const w = world();
    try
    {
        const pt = path.join(w.project, '.preferred-tools');
        const home = path.join(w.home, '.preferred-tools');
        const helperAt = (root, n) => { fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(path.join(root, 'mcp-headers.js'), roots.helperSource().replace(/^\/\/ preferred-tools mcp-headers \d+/, `// preferred-tools mcp-headers ${n}`)); };
        const lower = path.join(pt, 'mcp-headers.js');
        const higher = path.join(home, 'mcp-headers.js');
        assert.strictEqual(cli.run(['mcp', 'add-json', 'github', JSON.stringify({ type: 'http', url: 'https://api.githubcopilot.com/mcp/', headersHelper: `node ${lower} GITHUB_PERSONAL_ACCESS_TOKEN Bearer` }), '-s', 'local'], { cwd: w.project, env: w.env }).status, 0);
        assert.strictEqual(cli.run(['mcp', 'add-json', 'sentry', JSON.stringify({ type: 'http', url: 'https://mcp.sentry.dev/mcp', headersHelper: `node ${higher} SENTRY_ACCESS_TOKEN Sentry-Bearer` }), '-s', 'user'], { cwd: w.project, env: w.env }).status, 0);
        helperAt(pt, 0);
        const HV = require('../scripts/mcp-headers.js').HELPER_VERSION;
        helperAt(home, HV + 1);
        const c = await run(w, ['--check', '--no-refresh']);
        assert.strictEqual(c.code, 0, c.text);
        assert.match(c.text, new RegExp(`Key helpers:\\n {2}mcp-headers\\.js in .*\\.preferred-tools +0 -> ${HV}`));
        assert.match(c.text, /mcp-headers\.js in .*home.\.preferred-tools is newer than this plugin - update preferred-tools/);
        const q = JSON.parse((await run(w, ['--questions', '--no-refresh'])).text);
        const group = q.pick.flat().find((x) => x.id === 'update-helper');
        assert.strictEqual(group.header, 'Key helpers');
        // a group of one is asked with 'None of these' beside it: AskUserQuestion takes 2 to 4 options
        assert.deepStrictEqual(group.options.map((o) => o.description), [`helper:${lower}`, 'none']);
        const a = await run(w, ['--apply', `helper:${lower}`]);
        assert.strictEqual(a.code, 0, a.text);
        assert.strictEqual(fs.readFileSync(lower, 'utf8'), roots.helperSource());
        assert.match(fs.readFileSync(higher, 'utf8'), new RegExp(`^// preferred-tools mcp-headers ${HV + 1}`), 'a higher number is left');
        assert.doesNotMatch((await run(w, ['--check', '--no-refresh'])).text, /Key helpers:/);
    }
    finally { w.clean(); }
});

// ---- the bridge (0.4.0) -------------------------------------------------------------------------------------------------

const bridgeEntry = (root, pin = '0.16.0') => ({ command: 'node', args: [path.join(root, 'mcp-bridge.js'), 'https://mcp.sentry.dev/mcp/{SENTRY_ORG}/{SENTRY_PROJECT?}', 'SENTRY_ACCESS_TOKEN', 'Sentry-Bearer', `mcp-remote@${pin}`], env: { npm_config_before: '2026-11-11T23:59:59Z' } });

test('update offers a lower mcp-bridge.js for rewriting beside the helper', async () => {
    const roots = require('../scripts/roots/roots.js');
    const w = world();
    try
    {
        const pt = path.join(w.project, '.preferred-tools');
        fs.mkdirSync(pt, { recursive: true });
        fs.writeFileSync(path.join(pt, 'mcp-headers.js'), roots.helperSource());
        const bridgeFile = path.join(pt, 'mcp-bridge.js');
        fs.writeFileSync(bridgeFile, roots.shippedSource('bridge').replace(/^\/\/ preferred-tools mcp-bridge \d+/, '// preferred-tools mcp-bridge 0'));
        assert.strictEqual(cli.run(['mcp', 'add-json', 'sentry', JSON.stringify(bridgeEntry(pt)), '-s', 'local'], { cwd: w.project, env: w.env }).status, 0);
        const BV = require('../scripts/mcp-bridge.js').BRIDGE_VERSION;
        const c = await run(w, ['--check', '--no-refresh'], { registry: fakeRegistry({ 'npm:mcp-remote': [{ version: '0.16.0', time: ago(20) }] }) });
        assert.strictEqual(c.code, 0, c.text);
        assert.match(c.text, new RegExp(`mcp-bridge\\.js in .*\\.preferred-tools +0 -> ${BV}`));
        const a = await run(w, ['--apply', `bridge:${bridgeFile}`], { registry: fakeRegistry({ 'npm:mcp-remote': [{ version: '0.16.0', time: ago(20) }] }) });
        assert.strictEqual(a.code, 0, a.text);
        assert.strictEqual(fs.readFileSync(bridgeFile, 'utf8'), roots.shippedSource('bridge'));
        assert.strictEqual(fs.readFileSync(path.join(pt, 'package.json'), 'utf8'), '{"type":"commonjs"}\n', 'the root says CommonJS');
    }
    finally { w.clean(); }
});

test("update moves a bridge's mcp-remote pin and its cut-off", async () => {
    const w = world();
    try
    {
        const pt = path.join(w.project, '.preferred-tools');
        const e = bridgeEntry(pt);
        assert.strictEqual(cli.run(['mcp', 'add-json', 'sentry', JSON.stringify(e), '-s', 'local'], { cwd: w.project, env: w.env }).status, 0);
        const reg = fakeRegistry({ 'npm:mcp-remote': [{ version: '0.16.0', time: ago(25) }, { version: '0.16.4', time: ago(8) }] });
        const inv = inventory.buildInventory({ project: w.project, env: w.env });
        const ctx = update.makeCtx({ inv, project: w.project, env: w.env, machine: noLsp, registry: reg, now: NOW, refresh: false });
        const out = await update.check(ctx);
        const offers = out.offers.filter((o) => o.kind === 'mcp');
        assert.strictEqual(offers.length, 1, JSON.stringify(out));
        assert.strictEqual(offers[0].entry.args[4], 'mcp-remote@0.16.4');
        assert.deepStrictEqual(offers[0].entry.args.slice(0, 4), e.args.slice(0, 4));
        assert.notStrictEqual(offers[0].entry.env.npm_config_before, e.env.npm_config_before);
    }
    finally { w.clean(); }
});

// ---- new ways to pass data (the user's ruling, 2026-11-12) ---------------------------------------------------------------

// a 0.5.0 root: its list names these servers, so list-import has nothing to do
const listed = (root, servers) => writeJson(path.join(root, 'mcps.json'), { version: 1, servers: servers.map(([name, scope, entry]) => ({ name, scope, row: name, route: 'local', clients: ['claude'], entry, key: null })), own: [] });

test('the fix rows update applies are the ones marked upgrade, each with the version that brought its way', () =>
{
    const catalog = require('../scripts/catalog/catalog.js').load();
    assert.deepStrictEqual(catalog.fixes.filter((f) => f.upgrade).map((f) => [f.id, f.upgrade]), [['serena-context', '0.5.0'], ['serena-base-modes', '0.5.0'], ['list-import', '0.5.0'], ['retired-plugin', '0.5.0'], ['read-guard', '0.5.0'], ['key-to-helper', '0.2.0'], ['root-ignore', '0.2.0'], ['project-relative-path', '0.3.0'], ['mcp-order', '0.3.0']]);
});

test('update offers the new ways to pass data that fix knows - a 0.1.x key header, a relative project path - and applies them after the pins, by registration', async () =>
{
    const account = require('../scripts/core/account.js');
    const w = world();
    try
    {
        const v = `gh-${crypto.randomBytes(10).toString('hex')}`;
        const pt = path.join(w.project, '.preferred-tools');
        for (const root of [pt, path.join(w.home, '.preferred-tools')]) { fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(path.join(root, '.mcps-secrets'), `ACME_GH=${v}\n`); }
        const gh = { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: { Authorization: 'Bearer ${ACME_GH}' } };
        for (const scope of ['local', 'user']) assert.strictEqual(cli.run(['mcp', 'add-json', 'github', JSON.stringify(gh), '-s', scope], { cwd: w.project, env: w.env }).status, 0);
        // 0.2.0's shape: a project-scope data path relative to the project
        const memory = { command: 'uvx', args: ['--python', '3.13', '--from', 'mcp-memory-service[sqlite]==12.1.1', 'memory', 'server'], env: { MCP_MEMORY_SQLITE_PATH: '.preferred-tools/memory/memory.db' } };
        assert.strictEqual(cli.run(['mcp', 'add-json', 'memory', JSON.stringify(memory), '-s', 'project'], { cwd: w.project, env: w.env }).status, 0);
        const registry = fakeRegistry({ 'pypi:mcp-memory-service': [{ version: '12.1.1', time: ago(40) }, { version: '12.5.0', time: ago(20) }] });
        // already on the list (0.5.0), so list-import has nothing to offer here
        listed(pt, [['github', 'local', gh], ['memory', 'project', memory]]);
        listed(path.join(w.home, '.preferred-tools'), [['github', 'user', gh]]);

        const c = await run(w, ['--check', '--no-refresh'], { registry });
        assert.strictEqual(c.code, 0, c.text);
        assert.match(c.text, /New ways to pass data:\n/);
        assert.match(c.text, /\n {2}github \(local\) +key-to-helper: /);
        assert.match(c.text, /\n {2}github \(user\) +key-to-helper: /);
        assert.match(c.text, /\n {2}memory \(project\) +project-relative-path: /);
        assert.ok(!c.text.includes(v), 'the check names the key, never its value');
        const q = JSON.parse((await run(w, ['--questions', '--no-refresh'], { registry })).text);
        const group = q.pick.flat().find((x) => x.id === 'update-upgrade');
        assert.ok(group.header.length <= 12, group.header);
        // the key file in the project root, with no deny rule for it yet: read-guard (0.5.0) is offered beside them
        const settings = path.join(w.env.CLAUDE_CONFIG_DIR, 'settings.json');
        assert.deepStrictEqual(group.options.map((o) => o.description).sort(), ['upgrade:key-to-helper:github~local', 'upgrade:key-to-helper:github~user', 'upgrade:project-relative-path:memory~project', `upgrade:read-guard:${settings}`]);
        assert.ok(group.options.some((o) => o.label === 'github (local): key-to-helper'), group.options.map((o) => o.label).join('\n'));

        // an upgrade picked before the pin still runs after it, on the registration as it is then: both changes stay
        const tmp = fs.mkdtempSync(path.join(w.dir, 'preferred-tools-'));
        const a = await run(w, ['--apply', 'upgrade:project-relative-path:memory~project,mcp:memory~project,upgrade:key-to-helper:github~local', '--tmp', tmp], { registry });
        assert.strictEqual(a.code, 0, a.text);
        assert.ok(!a.text.includes(v), 'no key printed');
        const doc = readJson(account.accountFile(w.env));
        const local = account.projectEntry(doc.projects, w.project).mcpServers.github;
        assert.strictEqual(local.headers, undefined, 'the header is gone');
        assert.strictEqual(local.headersHelper, helperCmd(path.join(pt, 'mcp-headers.js'), 'ACME_GH', 'Bearer'));
        assert.ok(fs.existsSync(path.join(pt, 'mcp-headers.js')), 'the helper is written with it');
        assert.deepStrictEqual(doc.mcpServers.github.headers, gh.headers, 'github (user) was not picked: left');
        const mem = readJson(path.join(w.project, '.mcp.json')).mcpServers.memory;
        assert.ok(mem.args.includes('mcp-memory-service[sqlite]==12.5.0'), JSON.stringify(mem));
        assert.strictEqual(mem.env.MCP_MEMORY_SQLITE_PATH, path.join(pt, 'memory', 'memory.db'));
        // one fetch file, one step per server, the last launch written
        assert.strictEqual((a.text.match(/Fetch next/g) || []).length, 1, a.text);
        const job = readJson(path.join(tmp, 'fetch.json'));
        assert.deepStrictEqual(job.fetch.map((s) => s.name), ['memory']);
        assert.strictEqual(job.fetch[0].env.MCP_MEMORY_SQLITE_PATH, mem.env.MCP_MEMORY_SQLITE_PATH);

        const after = await run(w, ['--check', '--no-refresh'], { registry });
        assert.match(after.text, /\n {2}github \(user\) +key-to-helper: /);
        assert.doesNotMatch(after.text, /github \(local\) +key-to-helper|memory \(project\) +project-relative-path/);
    }
    finally { w.clean(); }
});

test('an upgrade that cannot apply on its own - a key not filled - is a note naming /preferred-tools:fix, never an offer', async () =>
{
    const w = world();
    try
    {
        const gh = { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: { Authorization: 'Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}' } };
        assert.strictEqual(cli.run(['mcp', 'add-json', 'github', JSON.stringify(gh), '-s', 'local'], { cwd: w.project, env: w.env }).status, 0);
        listed(path.join(w.project, '.preferred-tools'), [['github', 'local', gh]]);
        const c = await run(w, ['--check', '--no-refresh']);
        assert.strictEqual(c.code, 0, c.text);
        assert.doesNotMatch(c.text, /New ways to pass data/);
        assert.match(c.text, /Notes:\n(.*\n)* {2}github \(local\): .* - not applied here: put GITHUB_PERSONAL_ACCESS_TOKEN's value in .*, then run \/preferred-tools:fix\n/);
        assert.strictEqual((c.text.match(/\/preferred-tools:fix/g) || []).length, 1, 'the note names fix once');
        // never 'everything current' while a note waits on the user (review)
        assert.strictEqual(c.text.trim().split('\n').pop(), 'preferred-tools: nothing to update - 1 waits on you first (the notes above)');
        const q = JSON.parse((await run(w, ['--questions', '--no-refresh'])).text);
        assert.ok(!q.pick.flat().some((x) => x.id === 'update-upgrade'));
    }
    finally { w.clean(); }
});

// ---- the upgrade review (2026-11-12): the 0.2.0 path, one registration per pick, one fetch step per server and scope ---------

const PW = (pin) => ({ command: 'npx', args: ['-y', `@playwright/mcp@${pin}`, '--browser', 'chrome', '--user-data-dir', '.preferred-tools/playwright-chrome', '--output-dir', '.preferred-tools/playwright-chrome/output', '--viewport-size', '1280x720'] });
const MEM = (pin = '12.1.1') => ({ command: 'uvx', args: ['--python', '3.13', '--from', `mcp-memory-service[sqlite]==${pin}`, 'memory', 'server'], env: { MCP_MEMORY_SQLITE_PATH: '.preferred-tools/memory/memory.db' } });

test("'All of them' on a 0.2.0 .mcp.json - relative paths, out of order, a pin behind - ends in order with no CHECK, the new pin never health-checked before its fetch", async () =>
{
    const w = world();
    try
    {
        // as 0.2.0 wrote it: playwright-chrome before memory, both relative
        for (const [name, entry] of [['playwright-chrome', PW('0.0.83')], ['memory', MEM()]])
            assert.strictEqual(cli.run(['mcp', 'add-json', name, JSON.stringify(entry), '-s', 'project'], { cwd: w.project, env: w.env }).status, 0);
        const registry = fakeRegistry({ 'npm:@playwright/mcp': [{ version: '0.0.83', time: ago(60) }, { version: '0.0.90', time: ago(10) }], 'pypi:mcp-memory-service': [{ version: '12.1.1', time: ago(40) }] });
        const c = await run(w, ['--check', '--no-refresh'], { registry });
        assert.match(c.text, /\n {2}\S*\.mcp\.json +mcp-order: /, c.text);
        const tmp = fs.mkdtempSync(path.join(w.dir, 'preferred-tools-'));
        const before = w.calls().length;
        const a = await run(w, ['--apply', 'all', '--tmp', tmp], { registry });
        assert.strictEqual(a.code, 0, a.text);
        assert.doesNotMatch(a.text, /^(CHECK|FAILED)/m, a.text);
        const doc = readJson(path.join(w.project, '.mcp.json'));
        assert.deepStrictEqual(Object.keys(doc.mcpServers), ['memory', 'playwright-chrome'], 'in the catalog order');
        const pw = doc.mcpServers['playwright-chrome'];
        assert.ok(pw.args.includes('@playwright/mcp@0.0.90'), JSON.stringify(pw));
        assert.strictEqual(pw.args[pw.args.indexOf('--user-data-dir') + 1], path.join(w.project, '.preferred-tools', 'playwright-chrome'));
        assert.strictEqual(doc.mcpServers.memory.env.MCP_MEMORY_SQLITE_PATH, path.join(w.project, '.preferred-tools', 'memory', 'memory.db'));
        // no `claude mcp get` of the new pin before fetch.js has downloaded it (fetch.js says why)
        const calls = w.calls().slice(before);
        const newPin = calls.findIndex((x) => x[1] === 'add-json' && x[2] === 'playwright-chrome' && x[3].includes('@playwright/mcp@0.0.90'));
        assert.ok(newPin >= 0, JSON.stringify(calls));
        assert.ok(!calls.slice(newPin).some((x) => x[1] === 'get' && x[2] === 'playwright-chrome'), JSON.stringify(calls.slice(newPin)));
        const job = readJson(path.join(tmp, 'fetch.json'));
        assert.ok(job.fetch.find((s) => s.name === 'playwright-chrome').argv.join(' ').includes('@playwright/mcp@0.0.90'));
        const after = await run(w, ['--check', '--no-refresh'], { registry });
        assert.doesNotMatch(after.text, /New ways to pass data/, after.text);
    }
    finally { w.clean(); }
});

test('an upgrade picked for one registration never rewrites another of the same row', async () =>
{
    const w = world();
    try
    {
        for (const name of ['memory', 'memory-work']) assert.strictEqual(cli.run(['mcp', 'add-json', name, JSON.stringify(MEM()), '-s', 'project'], { cwd: w.project, env: w.env }).status, 0);
        const registry = fakeRegistry({ 'pypi:mcp-memory-service': [{ version: '12.1.1', time: ago(40) }] });
        const a = await run(w, ['--apply', 'upgrade:project-relative-path:memory~project'], { registry });
        assert.strictEqual(a.code, 0, a.text);
        const doc = readJson(path.join(w.project, '.mcp.json'));
        assert.strictEqual(doc.mcpServers.memory.env.MCP_MEMORY_SQLITE_PATH, path.join(w.project, '.preferred-tools', 'memory', 'memory.db'));
        assert.strictEqual(doc.mcpServers['memory-work'].env.MCP_MEMORY_SQLITE_PATH, '.preferred-tools/memory/memory.db', 'not picked: left');
        const all = await run(w, ['--apply', 'all'], { registry });
        assert.strictEqual(all.code, 0, all.text);
        assert.doesNotMatch(all.text, /^CHECK/m, all.text);
    }
    finally { w.clean(); }
});

test('one server pin-bumped at two scopes keeps a fetch step for each', async () =>
{
    const w = world();
    try
    {
        const m = { command: 'uvx', args: ['--python', '3.13', '--from', 'mcp-memory-service[sqlite]==12.1.1', 'memory', 'server'], env: { MCP_MEMORY_SQLITE_PATH: path.join(w.home, 'mem.db') } };
        for (const scope of ['user', 'local']) assert.strictEqual(cli.run(['mcp', 'add-json', 'memory', JSON.stringify(m), '-s', scope], { cwd: w.project, env: w.env }).status, 0);
        const registry = fakeRegistry({ 'pypi:mcp-memory-service': [{ version: '12.1.1', time: ago(40) }, { version: '12.5.0', time: ago(20) }] });
        const tmp = fs.mkdtempSync(path.join(w.dir, 'preferred-tools-'));
        const a = await run(w, ['--apply', 'all', '--tmp', tmp], { registry });
        assert.strictEqual(a.code, 0, a.text);
        assert.deepStrictEqual(readJson(path.join(tmp, 'fetch.json')).fetch.map((s) => `${s.name}~${s.scope}`).sort(), ['memory~local', 'memory~user']);
    }
    finally { w.clean(); }
});

test('a group with one offer is asked with two options: the offer and None of these', () =>
{
    const out = { offers: [{ kind: 'upgrade', id: 'upgrade:mcp-order:/p/.mcp.json', fix: 'mcp-order', name: '/p/.mcp.json', scope: null, group: 'upgrade', label: '/p/.mcp.json' }], unchecked: [], skipped: [], held: [], errors: [], lsp: [], notes: [] };
    const [q] = update.questions(out).pick.flat();
    assert.deepStrictEqual(q.options, [{ label: '/p/.mcp.json: mcp-order', description: 'upgrade:mcp-order:/p/.mcp.json' }, { label: 'None of these', description: 'none' }]);
});

test('a 0.4.x own server is skipped before list-import: update all leaves it byte-identical', async () =>
{
    const w = world();
    try
    {
        assert.strictEqual(cli.run(['mcp', 'add-json', 'context7', JSON.stringify(C7_PINNED), '-s', 'local'], { cwd: w.project, env: w.env }).status, 0);
        ownRecord(path.join(w.project, '.preferred-tools'));
        const before = JSON.stringify(require('../scripts/core/account.js').readAccount(w.env, w.project).local.context7);
        const a = await run(w, ['--apply', 'all', '--no-refresh'], { registry: C7_AHEAD() });
        assert.doesNotMatch(a.text, /2\.0\.0 -> 9\.0\.0/, a.text);
        assert.strictEqual(JSON.stringify(require('../scripts/core/account.js').readAccount(w.env, w.project).local.context7), before, 'byte-identical');
    }
    finally { w.clean(); }
});

// ---- 0.5.0: mcp-remote's pin in Cursor's bridge copy and in the shared sign-in form (spec D5) -------------------------
const npmRemote = (...v) => ({ 'npm:mcp-remote': v.map(([version, days]) => ({ version, time: ago(days) })) });
const accountOf = (w) => readJson(require('../scripts/core/account.js').accountFile(w.env));

function bothContext7(w)
{
    install(w, { clients: ['claude', 'cursor'], picks: { context7: { route: 'remote', scope: 'user', token: true } } });
    const listFile = path.join(w.home, '.preferred-tools', 'mcps.json');
    const cursorFile = path.join(w.home, '.cursor', 'mcp.json');
    // an env pair the user kept in Cursor's copy ('Keep the change in Cursor'): in the list and in the file alike
    const list = readJson(listFile);
    const s = list.servers.find((x) => x.name === 'context7');
    assert.ok(s.cursorEntry, 'the install listed Cursor\'s bridge copy');
    s.cursorEntry.env.MINE = '1';
    writeJson(listFile, list);
    const doc = readJson(cursorFile);
    doc.mcpServers.context7.env.MINE = '1';
    writeJson(cursorFile, doc);
    return { listFile, cursorFile };
}

test('update moves cursorEntry\'s mcp-remote pin from Cursor\'s copy as read', async () =>
{
    const w = world();
    try
    {
        const { listFile, cursorFile } = bothContext7(w);
        const claudeBefore = JSON.stringify(accountOf(w).mcpServers.context7);
        const reg = fakeRegistry(npmRemote(['0.16.0', 60], ['0.17.0', 8]));
        const c = await run(w, ['--check', '--no-refresh'], { registry: reg });
        assert.match(c.text, /context7 \(user, Cursor\)\s+0\.16\.0 -> 0\.17\.0/);
        const a = await run(w, ['--apply', 'cursor-pin:context7~user'], { registry: reg });
        assert.strictEqual(a.code, 0, a.text);
        const copy = readJson(cursorFile).mcpServers.context7;
        assert.strictEqual(copy.args[4], 'mcp-remote@0.17.0');
        assert.strictEqual(copy.env.MINE, '1', 'the kept pair survives');
        assert.strictEqual(copy.env.npm_config_before, '2026-10-27T23:59:59Z');
        assert.deepStrictEqual(readJson(listFile).servers.find((x) => x.name === 'context7').cursorEntry, copy);
        assert.strictEqual(JSON.stringify(accountOf(w).mcpServers.context7), claudeBefore, 'Claude Code\'s helper entry byte-identical');
    }
    finally { w.clean(); }
});

test('a drifted Cursor copy gets no cursor-pin offer and is named', async () =>
{
    const w = world();
    try
    {
        const { cursorFile } = bothContext7(w);
        const doc = readJson(cursorFile);
        doc.mcpServers.context7.args.push('--extra');
        writeJson(cursorFile, doc);
        const c = await run(w, ['--check', '--no-refresh'], { registry: fakeRegistry(npmRemote(['0.16.0', 60], ['0.17.0', 8])) });
        assert.doesNotMatch(c.text, /cursor-pin|\(user, Cursor\)\s+0\.16\.0/);
        assert.match(c.text, /context7 \(user\): Cursor's copy in .*mcp\.json differs from the list - not checked; \/preferred-tools:fix settles it/);
    }
    finally { w.clean(); }
});

test('update moves the shared form\'s mcp-remote pin in Claude Code', async () =>
{
    const w = world();
    try
    {
        install(w, { clients: ['claude', 'cursor'], picks: { atlassian: { route: 'remote', scope: 'user', token: false } } });
        const reg = fakeRegistry(npmRemote(['0.16.0', 60], ['0.17.0', 8]));
        const c = await run(w, ['--check', '--no-refresh'], { registry: reg });
        assert.match(c.text, /atlassian \(user\)\s+0\.16\.0 -> 0\.17\.0/);
        const a = await run(w, ['--apply', 'mcp:atlassian~user'], { registry: reg });
        assert.strictEqual(a.code, 0, a.text);
        const e = accountOf(w).mcpServers.atlassian;
        assert.ok(e.args.includes('mcp-remote@0.17.0'), JSON.stringify(e));
        assert.strictEqual(e.env.MCP_REMOTE_CONFIG_DIR, path.join(w.home, '.preferred-tools'));
    }
    finally { w.clean(); }
});

test('update offers a lower serena-context.yml as context:<file> and rewrites it', async () => {
    const roots = require('../scripts/roots/roots.js');
    const w = world();
    try
    {
        const pt = path.join(w.project, '.preferred-tools');
        fs.mkdirSync(pt, { recursive: true });
        const file = path.join(pt, 'serena-context.yml');
        fs.writeFileSync(file, roots.shippedSource('serenaContext').replace(/^# preferred-tools serena-context \d+/, '# preferred-tools serena-context 0'));
        const S = { command: 'uvx', args: ['--python', '3.13', '--exclude-newer', '2026-10-20T23:59:59Z', '--from', 'serena-agent@2.1.0', 'serena', 'start-mcp-server', '--context', file, '--project-from-cwd'], env: { SERENA_USAGE_REPORTING: 'false', SERENA_HOME: path.join(pt, 'serena') } };
        assert.strictEqual(cli.run(['mcp', 'add-json', 'serena', JSON.stringify(S), '-s', 'local'], { cwd: w.project, env: w.env }).status, 0);
        const registry = fakeRegistry({ 'pypi:serena-agent': [{ version: '2.1.0', time: ago(30) }] });
        const c = await run(w, ['--check', '--no-refresh'], { registry });
        assert.strictEqual(c.code, 0, c.text);
        assert.match(c.text, /serena-context\.yml in .*\.preferred-tools +0 -> 1/);
        const a = await run(w, ['--apply', `context:${file}`], { registry });
        assert.strictEqual(a.code, 0, a.text);
        assert.strictEqual(fs.readFileSync(file, 'utf8'), roots.shippedSource('serenaContext'));
        assert.ok(!fs.existsSync(path.join(pt, 'package.json')), 'a YAML file needs no package.json');
    }
    finally { w.clean(); }
});

// ---- 0.5.0: every pin move reaches the list and Cursor; update offers Cursor once per root (spec D1, D9) ------------
const projectList = (w) => path.join(w.project, '.preferred-tools', 'mcps.json');
const projectCursor = (w) => path.join(w.project, '.cursor', 'mcp.json');
const listed0 = (w, name) => readJson(projectList(w)).servers.find((x) => x.name === name);
const cursorCopy = (w, name, file = projectCursor(w)) => readJson(file).mcpServers[name];
const localReg = (w, name) => inventory.buildInventory({ project: w.project, env: w.env }).registrations.find((r) => r.name === name && r.scope === 'local');
const reAdd = (w, name, entry) =>
{
    cli.run(['mcp', 'remove', name, '-s', 'local'], { cwd: w.project, env: w.env });
    assert.strictEqual(cli.run(['mcp', 'add-json', name, JSON.stringify(entry), '-s', 'local'], { cwd: w.project, env: w.env }).status, 0);
};
const serenaPin = (e) => pinnedVersion(e, 'serena-agent');

test('a registration whose pin is newer than its list entry is updated from the registration, never downgraded', async () =>
{
    const w = world();
    try
    {
        install(w, { clients: ['claude', 'cursor'], picks: { serena: { scope: 'local' } } });
        assert.strictEqual(serenaPin(listed0(w, 'serena').entry), '2.1.0');
        reAdd(w, 'serena', update.bumpEntry(localReg(w, 'serena').entry, 'serena-agent', '2.2.0', '2026-10-01T23:59:59Z'));
        const reg = fakeRegistry(pypiSerena(['2.1.0', 90], ['2.2.0', 40], ['2.3.0', 20]));
        const c = await run(w, ['--check', '--no-refresh'], { registry: reg });
        assert.match(c.text, /serena was changed outside preferred-tools/);
        assert.match(c.text, /serena \(local\)\s+2\.2\.0 -> 2\.3\.0/, 'the offer starts from the registration, not the list');
        const a = await run(w, ['--apply', 'mcp:serena~local'], { registry: reg });
        assert.strictEqual(a.code, 0, a.text);
        assert.strictEqual(serenaPin(localReg(w, 'serena').entry), '2.3.0');
        assert.strictEqual(serenaPin(listed0(w, 'serena').entry), '2.3.0', 'the list takes the registration as read');
        assert.strictEqual(serenaPin(cursorCopy(w, 'serena')), '2.3.0', 'and Cursor takes the list');
    }
    finally { w.clean(); }
});

test('a Claude registration with a hand-added arg has its pin moved by update, keeps the arg, and the list and Cursor take it', async () =>
{
    const w = world();
    try
    {
        install(w, { clients: ['claude', 'cursor'], picks: { serena: { scope: 'local' } } });
        const e = localReg(w, 'serena').entry;
        reAdd(w, 'serena', { ...e, args: [...e.args, '--my-flag'] });
        const reg = fakeRegistry(pypiSerena(['2.1.0', 60], ['2.2.0', 20]));
        const a = await run(w, ['--apply', 'mcp:serena~local'], { registry: reg });
        assert.strictEqual(a.code, 0, a.text);
        for (const [where, entry] of [['Claude Code', localReg(w, 'serena').entry], ['the list', listed0(w, 'serena').entry], ['Cursor', cursorCopy(w, 'serena')]])
        {
            assert.strictEqual(serenaPin(entry), '2.2.0', where);
            assert.ok(entry.args.includes('--my-flag'), `${where} keeps the hand-added arg`);
        }
    }
    finally { w.clean(); }
});

test('update moves the shared sign-in form\'s mcp-remote pin, and the list and the Cursor copy follow', async () =>
{
    const w = world();
    try
    {
        install(w, { clients: ['claude', 'cursor'], picks: { atlassian: { route: 'remote', scope: 'user', token: false } } });
        const reg = fakeRegistry(npmRemote(['0.16.0', 60], ['0.17.0', 8]));
        const a = await run(w, ['--apply', 'mcp:atlassian~user'], { registry: reg });
        assert.strictEqual(a.code, 0, a.text);
        const has = (e) => e.args.includes('mcp-remote@0.17.0');
        assert.ok(has(accountOf(w).mcpServers.atlassian), 'Claude Code');
        assert.ok(has(readJson(path.join(w.home, '.preferred-tools', 'mcps.json')).servers.find((x) => x.name === 'atlassian').entry), 'the list');
        assert.ok(has(cursorCopy(w, 'atlassian', path.join(w.home, '.cursor', 'mcp.json'))), 'Cursor');
    }
    finally { w.clean(); }
});

test('a pin move that changes Cursor\'s copy prints the re-approval line in the plan and the update report', async () =>
{
    const planLists = require('../scripts/plan-lists.js');
    const LINE = /Cursor asks you to approve atlassian again - it re-asks whenever an entry changes/;
    const w = world();
    try
    {
        install(w, { clients: ['claude', 'cursor'], picks: { atlassian: { route: 'remote', scope: 'user', token: false } } });
        const inv = inventory.buildInventory({ project: w.project, env: w.env });
        const r = inv.registrations.find((x) => x.name === 'atlassian');
        const step = { op: 'mcp-replace', name: 'atlassian', scope: 'user', old: r.entry, entry: update.bumpEntry(r.entry, 'mcp-remote', '0.17.0', '2026-10-27T23:59:59Z'), row: 'atlassian', route: r.route };
        const notes = [];
        const tail = planLists.repairTail(inv, { platform: process.platform, project: w.project, home: w.home, env: w.env, notes }, [step]);
        assert.deepStrictEqual(tail.map((s) => s.op), ['list-write', 'cursor-write']);
        assert.deepStrictEqual(tail[1].reapprove, ['atlassian']);
        assert.ok(notes.some((n) => LINE.test(n)), notes.join('\n'));
        const a = await run(w, ['--apply', 'mcp:atlassian~user'], { registry: fakeRegistry(npmRemote(['0.16.0', 60], ['0.17.0', 8])) });
        assert.match(a.text, LINE);
    }
    finally { w.clean(); }
});

test('an entry update does not write is named and its list entry left unchanged', async () =>
{
    const w = world();
    try
    {
        install(w, { clients: ['claude', 'cursor'], picks: { serena: { scope: 'local' }, memory: {} } });
        const before = JSON.stringify(listed0(w, 'memory'));
        const cursorBefore = JSON.stringify(cursorCopy(w, 'memory'));
        const m = localReg(w, 'memory').entry;
        reAdd(w, 'memory', { ...m, args: [...m.args, '--debug'] });
        const reg = fakeRegistry(pypiSerena(['2.1.0', 60], ['2.2.0', 20]));
        const c = await run(w, ['--check', '--no-refresh'], { registry: reg });
        assert.match(c.text, /memory was changed outside preferred-tools/);
        const a = await run(w, ['--apply', 'mcp:serena~local'], { registry: reg });
        assert.strictEqual(a.code, 0, a.text);
        assert.strictEqual(JSON.stringify(listed0(w, 'memory')), before, 'the list keeps memory as it was');
        assert.strictEqual(JSON.stringify(cursorCopy(w, 'memory')), cursorBefore, 'and so does Cursor');
        assert.ok(localReg(w, 'memory').entry.args.includes('--debug'), 'the registration is not touched');
    }
    finally { w.clean(); }
});

test('update neither re-adds a missing copy nor rewrites a drifted Cursor copy', async () =>
{
    const w = world();
    try
    {
        install(w, { clients: ['claude', 'cursor'], picks: { serena: { scope: 'local' }, memory: {}, 'playwright-chrome': {} } });
        // memory gone from Claude Code, playwright-chrome gone from Cursor, serena edited in Cursor
        cli.run(['mcp', 'remove', 'memory', '-s', 'local'], { cwd: w.project, env: w.env });
        const doc = readJson(projectCursor(w));
        delete doc.mcpServers['playwright-chrome'];
        doc.mcpServers.serena.args.push('--extra');
        writeJson(projectCursor(w), doc);
        const reg = fakeRegistry(pypiSerena(['2.1.0', 60], ['2.2.0', 20]));
        const c = await run(w, ['--check', '--no-refresh'], { registry: reg });
        assert.match(c.text, /memory is on the list but not in Claude Code - run \/preferred-tools:fix/);
        const a = await run(w, ['--apply', 'mcp:serena~local'], { registry: reg });
        assert.strictEqual(a.code, 0, a.text);
        assert.match(a.text, /serena: Cursor's copy was changed by hand - left; run \/preferred-tools:fix/);
        assert.strictEqual(serenaPin(localReg(w, 'serena').entry), '2.2.0', 'Claude Code moves');
        const copy = cursorCopy(w, 'serena');
        assert.ok(copy.args.includes('--extra') && serenaPin(copy) === '2.1.0', 'the drifted Cursor copy is left as it is');
        assert.strictEqual(localReg(w, 'memory'), undefined, 'memory is not re-added in Claude Code');
        assert.ok(!Object.hasOwn(readJson(projectCursor(w)).mcpServers, 'playwright-chrome'), 'playwright-chrome is not re-added in Cursor');
    }
    finally { w.clean(); }
});

test('cursor-offer: two options, Set them up recommended and first; Not now is kept per root; Skip writes nothing', async () =>
{
    const w = world();
    try
    {
        install(w, { clients: ['claude'], picks: { serena: { scope: 'local' } } });
        fs.mkdirSync(path.join(w.home, '.cursor'), { recursive: true });
        const root = path.join(w.project, '.preferred-tools');
        const q = JSON.parse((await run(w, ['--questions', '--no-refresh'])).text);
        assert.strictEqual(q.cursorOffers.length, 1);
        const ask = q.cursorOffers[0];
        assert.strictEqual(ask.id, `cursor-offer:${root}`);
        assert.strictEqual(ask.question, `Cursor is on this machine, and the 1 servers in ${root} are set up for Claude Code only. Set them up for Cursor too?`);
        assert.deepStrictEqual(ask.options.map((o) => o.label), ['Set them up for Cursor too (Recommended)', 'Not now']);
        // Skip: nothing passed, nothing written
        const listText = fs.readFileSync(projectList(w), 'utf8');
        assert.strictEqual((await run(w, ['--apply', 'none'])).code, 0);
        assert.strictEqual(fs.readFileSync(projectList(w), 'utf8'), listText);
        assert.ok(!fs.existsSync(projectCursor(w)));
        // Not now: kept in this root's list, and not asked again
        const n = await run(w, ['--apply', 'none', '--input', `cursor-offer:${root}=declined`]);
        assert.strictEqual(n.code, 0, n.text);
        assert.strictEqual(readJson(projectList(w)).cursorOffer, 'declined');
        assert.deepStrictEqual(JSON.parse((await run(w, ['--questions', '--no-refresh'])).text).cursorOffers, []);
        assert.ok(!fs.existsSync(projectCursor(w)));
        // Set them up: configure's apps change for each entry
        const doc = readJson(projectList(w));
        delete doc.cursorOffer;
        writeJson(projectList(w), doc);
        const s = await run(w, ['--apply', 'none', '--input', `cursor-offer:${root}=set`]);
        assert.strictEqual(s.code, 0, s.text);
        assert.deepStrictEqual(listed0(w, 'serena').clients, ['claude', 'cursor']);
        assert.deepStrictEqual(cursorCopy(w, 'serena'), listed0(w, 'serena').entry);
    }
    finally { w.clean(); }
});

test('cursor-offer from 0.4.x: a root with no list yet is offered in the same update, after list-import, and needs it picked', async () =>
{
    const w = world();
    try
    {
        install(w, { clients: ['claude'], picks: { serena: { scope: 'local' } } });
        fs.rmSync(projectList(w)); // 0.4.x wrote no list
        fs.mkdirSync(path.join(w.home, '.cursor'), { recursive: true });
        const root = path.join(w.project, '.preferred-tools');
        const q = JSON.parse((await run(w, ['--questions', '--no-refresh'])).text);
        assert.deepStrictEqual(q.cursorOffers.map((x) => x.id), [`cursor-offer:${root}`], 'asked in the first update');
        // without the import picked, the offer has no list to write: left, and said so
        const skipped = await run(w, ['--apply', 'none', '--input', `cursor-offer:${root}=set`]);
        assert.strictEqual(skipped.code, 0, skipped.text);
        assert.match(skipped.text, new RegExp(`NOT OFFERED cursor-offer:${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: its servers join the list through upgrade:list-import:.*, which was not picked - run /preferred-tools:update again`));
        assert.ok(!fs.existsSync(projectCursor(w)) && !fs.existsSync(projectList(w)));
        // picked with the import: the list is written, then Cursor
        const a = await run(w, ['--apply', 'all', '--input', `cursor-offer:${root}=set`, '--no-refresh']);
        assert.strictEqual(a.code, 0, a.text);
        assert.deepStrictEqual(listed0(w, 'serena').clients, ['claude', 'cursor']);
        assert.deepStrictEqual(cursorCopy(w, 'serena'), listed0(w, 'serena').entry);
    }
    finally { w.clean(); }
});

test('update\'s Cursor offer asks for a taken name, and an unanswered one is left Claude Code only', async () =>
{
    const w = world();
    try
    {
        install(w, { clients: ['claude'], picks: { serena: { scope: 'local' }, memory: {} } });
        fs.mkdirSync(path.join(w.home, '.cursor'), { recursive: true });
        const mine = { command: 'my-memory' };
        writeJson(projectCursor(w), { mcpServers: { memory: mine } });
        const root = path.join(w.project, '.preferred-tools');
        const q = JSON.parse((await run(w, ['--questions', '--no-refresh'])).text);
        assert.deepStrictEqual(q.cursorNameQuestions.map((x) => x.question.id), [`cursor-name-memory@${projectCursor(w)}`]);
        const a = await run(w, ['--apply', 'none', '--input', `cursor-offer:${root}=set`]);
        assert.strictEqual(a.code, 0, a.text);
        assert.match(a.text, /memory: Cursor's .*mcp\.json already has its own memory - left; run \/preferred-tools:configure to choose/);
        assert.deepStrictEqual(cursorCopy(w, 'memory'), mine);
        assert.deepStrictEqual(listed0(w, 'memory').clients, ['claude']);
        assert.deepStrictEqual(listed0(w, 'serena').clients, ['claude', 'cursor'], 'the rest of the offer applies');
        assert.ok(cursorCopy(w, 'serena'));
    }
    finally { w.clean(); }
});

test('the upgrade rows run in order: list-import, serena-context, serena-base-modes, retired-plugin, read-guard', () =>
{
    const catalog = require('../scripts/catalog/catalog.js').load();
    const o = (fix, scope, fixKind) => ({ kind: 'upgrade', id: `upgrade:${fix}`, fix, scope, fixKind });
    const offers = [o('read-guard', null, 'file'), o('retired-plugin', 'user', 'machine'), o('serena-base-modes', null, 'file'), o('serena-context', 'local', 'registration'), o('list-import', null, 'file'), { kind: 'mcp', id: 'mcp:serena~local' }];
    assert.deepStrictEqual(update.ordered(offers, catalog).map((x) => x.fix || x.id), ['list-import', 'serena-context', 'serena-base-modes', 'retired-plugin', 'read-guard', 'mcp:serena~local']);
});
