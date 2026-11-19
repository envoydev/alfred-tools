// THE RENAME (spec 2026-11-14, D3-D5) end to end: the REAL claude CLI in throwaway homes and accounts (tests/harness.ts).
// A machine set up by preferred-tools is made the way it would be - today's install, then written back to the old names:
// the folders `.preferred-tools`, the old copied files (tests/matrix/fixtures, byte for byte), every registration
// re-added through the CLI naming the old folders, the roots map in the old id's data folder. Then update runs as the
// command does - check, apply all, RECHECK, check, apply all - and every written file is read back.
//
//   R1  a 0.4.0 machine: the 0.4.x record and no list, helper 4 and bridge 1, gitlab and memory at project scope,
//       sentry's bridge at user scope - Claude Code only
//   R2  a pre-rename 0.5.0 machine: lists with the old kept marker, Cursor's copies, serena's context 1
import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as cli from '../../scripts/core/claude-cli.ts';
import * as account from '../../scripts/core/account.ts';
import { launcherParts } from '../../scripts/entries/launcher.ts';
import * as kept from '../../scripts/core/kept.ts';
import * as roots from '../../scripts/roots/roots.ts';
import * as catalogLib from '../../scripts/catalog/catalog.ts';
import * as existing from '../../scripts/inventory/existing.ts';
import { runUpdateCommand } from '../../scripts/update/command.ts';
import * as fake from '../fake-mcp-http.ts';
import type { MachineProbe } from '../../scripts/fix/types.ts';
import type { McpsList } from '../../scripts/mcps-list/types.ts';
import { Harness } from '../harness.ts';
import { keepWritten } from '../proof/matrix-keep.ts';

// Does `text` name `folder`? As written, with '/' (a helper path on Windows) or JSON-escaped (a stringified entry)
const namesFolder = (text: string, folder: string): boolean => [folder, folder.replace(/\\/g, '/'), JSON.stringify(folder).slice(1, -1)].some((form) => text.includes(form));

const skipAll = cli.available() ? false : 'NOT RUN: no claude CLI on PATH';
const T = { skip: skipAll, timeout: 900000 };
const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pt-r-')));
test.after(() => { keepWritten(base, 'rename'); fs.rmSync(base, { recursive: true, force: true }); });

const catalog = catalogLib.load();
const FIXTURES = path.join(import.meta.dirname, 'fixtures');
const OLD = '.preferred-tools';
const NEW = '.alfred-tools';
const key = () => `mx-${crypto.randomBytes(12).toString('hex')}`;
const readJson = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const exists = (file: string) => fs.existsSync(file);
// a machine with no runtimes and no Cursor on it, and a registry that answers nothing: only the rename's offers move
const noMachine = { which: () => null, run: () => ({ status: 1, stdout: '', stderr: '' }), nodeVersion: process.versions.node } as unknown as MachineProbe;
const noRegistry = { versionsOf: async () => { throw new Error('no registry in this case'); } };

// a world whose plugin data folder is named as Claude Code names it (`<plugin>-<marketplace>`, A1), every project server approved
function world(name: string)
{
    const h = new Harness({ root: path.join(base, name) });
    h.data = path.join(h.root, 'plugins-data', 'alfred-tools-envoydev');
    fs.mkdirSync(h.data, { recursive: true });
    fs.writeFileSync(path.join(h.account, 'settings.json'), JSON.stringify({ enableAllProjectMcpServers: true }));
    return h;
}

const listOf = (root: string): McpsList | null => (exists(path.join(root, roots.FILES.list)) ? readJson(path.join(root, roots.FILES.list)) : null);
const back = (text: string) => text.split(NEW).join(OLD).split(kept.MARKER).join(kept.OLD_MARKER);
const rewrite = (file: string) => { if (exists(file)) fs.writeFileSync(file, back(fs.readFileSync(file, 'utf8'))); };

// Today's install written back to what preferred-tools left: `record` makes it 0.4.0 (the record, no list, no context)
function age(h: Harness, dir: string, { record }: { record: boolean })
{
    const rootsOf = [path.join(dir, NEW), path.join(h.home, NEW)].filter(exists);
    const servers = rootsOf.flatMap((root) => (listOf(root)?.servers || []).map((s) => ({ ...s, root })));
    for (const s of servers)
    {
        const entry = account.readRegistration(s.name, s.scope, dir, h.env);
        assert.ok(entry, `${s.name} (${s.scope}) is registered`);
        assert.strictEqual(h.claude(dir, ['mcp', 'remove', s.name, '-s', s.scope]).status, 0);
        assert.strictEqual(h.claude(dir, ['mcp', 'add-json', s.name, back(JSON.stringify(entry)), '-s', s.scope]).status, 0, `${s.name} re-added`);
    }
    for (const file of [path.join(dir, '.cursor', 'mcp.json'), path.join(h.home, '.cursor', 'mcp.json')]) rewrite(file);
    for (const root of rootsOf)
    {
        const list = path.join(root, roots.FILES.list);
        if (record)
        {
            const doc = readJson(list) as McpsList;
            fs.writeFileSync(path.join(root, roots.FILES.record), back(JSON.stringify({ version: 1, servers: doc.servers.map((s) => ({ name: s.name, scope: s.scope, fingerprint: existing.fingerprintOf(s.entry, catalog), choice: 'manage' })) }, null, 2)));
            fs.rmSync(list);
            for (const folder of [root, path.join(root, 'serena')]) fs.rmSync(path.join(folder, roots.FILES.serenaContext), { force: true });
        }
        else
        {
            rewrite(list);
            // 0.5.0 kept the context in the root; today's install keeps it in serena's home: either is aged to the 0.5.0 copy
            for (const folder of [root, path.join(root, 'serena')]) if (exists(path.join(folder, roots.FILES.serenaContext))) fs.copyFileSync(path.join(FIXTURES, '0.5.0', 'serena-context.yml'), path.join(folder, roots.FILES.serenaContext));
        }
        for (const file of [roots.FILES.helper, roots.FILES.bridge]) if (exists(path.join(root, file))) fs.copyFileSync(path.join(FIXTURES, '0.4.0', file), path.join(root, file));
        fs.renameSync(root, path.join(path.dirname(root), OLD));
    }
    // the roots map, where the plugin kept it under its former id
    const former = path.join(path.dirname(h.data), 'preferred-tools-envoydev');
    fs.mkdirSync(former, { recursive: true });
    fs.writeFileSync(path.join(former, roots.FILES.map), back(fs.readFileSync(path.join(h.data, roots.FILES.map), 'utf8')));
    fs.rmSync(path.join(h.data, roots.FILES.map));
    return servers;
}

// context7's local route as 0.5.0 wrote it at Local scope: npx, the pinned package and the key in the env - in the account,
// in Cursor's project file and, as the kept marker, in the project root's list
function seedPlainContext7(h: Harness, dir: string, value: string)
{
    const { package: pinned } = catalog.byId.get('context7')!.routes.local!;
    const plain = { command: 'npx', args: ['-y', `${pinned!.name}@${pinned!.version}`], env: { npm_config_before: pinned!.cutoff, CONTEXT7_API_KEY: value } };
    assert.strictEqual(h.claude(dir, ['mcp', 'add-json', 'context7', JSON.stringify(plain), '-s', 'local']).status, 0, 'context7 seeded in the account');
    const cursorFile = path.join(dir, '.cursor', 'mcp.json');
    const cursorDoc = readJson(cursorFile);
    cursorDoc.mcpServers.context7 = plain;
    fs.writeFileSync(cursorFile, `${JSON.stringify(cursorDoc, null, 2)}\n`);
    const listFile = path.join(dir, NEW, roots.FILES.list);
    const list = readJson(listFile) as McpsList;
    list.servers.push({ name: 'context7', scope: 'local', row: 'context7', route: 'local', clients: ['claude', 'cursor'], entry: { ...plain, env: { ...plain.env, CONTEXT7_API_KEY: kept.MARKER } }, key: 'CONTEXT7_API_KEY' });
    fs.writeFileSync(listFile, `${JSON.stringify(list, null, 2)}\n`);
}

// update as the command runs it: check, apply all; on RECHECK, check and apply all once more
// `afterMove` runs once the folders moved and before the second apply, to read the state the move alone left
async function updateAll(h: Harness, dir: string, afterMove?: () => void)
{
    const go = async (argv: string[]) =>
    {
        const lines: string[] = [];
        const tmp = argv.includes('--apply') ? ['--tmp', fs.mkdtempSync(path.join(h.root, 'update-'))] : [];
        const code = await runUpdateCommand([...argv, ...tmp, '--no-refresh', '--project', dir, '--data', h.data], { env: h.env, out: (s) => lines.push(s), machine: noMachine, registry: noRegistry, now: Date.now() });
        return { code, text: lines.join('\n') };
    };
    const first = await go(['--check', '--json']);
    const firstIds = (JSON.parse(first.text).offers as { id: string }[]).map((o) => o.id);
    assert.ok(firstIds.some((id) => id.startsWith('upgrade:root-move:')), first.text);
    assert.ok(firstIds.every((id) => /^upgrade:(root-move|root-repoint|retired-plugin):/.test(id)), `only the move is offered first: ${firstIds.join(', ')}`);
    const applied = await go(['--apply', 'all']);
    assert.strictEqual(applied.code, 0, applied.text);
    assert.match(applied.text, /^RECHECK - the folders moved; checking again$/m);
    const second = await go(['--check', '--json']);
    const secondIds = (JSON.parse(second.text).offers as { id: string }[]).map((o) => o.id);
    assert.ok(!secondIds.some((id) => /root-move|root-repoint/.test(id)), secondIds.join(', '));
    afterMove?.();
    const again = secondIds.length ? await go(['--apply', 'all']) : { code: 0, text: '' };
    assert.strictEqual(again.code, 0, again.text);
    assert.doesNotMatch(again.text, /RECHECK/);
    return { first, applied, second, again };
}

// no file or registration the update left names the old folder
function noOld(h: Harness, dir: string, label: string)
{
    const files = [path.join(dir, '.mcp.json'), account.accountFile(h.env), path.join(dir, '.cursor', 'mcp.json'), path.join(h.home, '.cursor', 'mcp.json'), path.join(h.data, roots.FILES.map), path.join(dir, NEW, roots.FILES.list), path.join(h.home, NEW, roots.FILES.list)];
    for (const file of files.filter(exists)) assert.ok(!fs.readFileSync(file, 'utf8').includes(OLD), `${label}: ${file} still names ${OLD}`);
    for (const at of [dir, h.home]) assert.ok(!exists(path.join(at, OLD)), `${label}: ${path.join(at, OLD)} is gone`);
}

const firstLine = (file: string) => fs.readFileSync(file, 'utf8').split('\n')[0];
// the first line of the copy this branch ships, so the next version bump does not break the case
const SHIPPED = path.join(import.meta.dirname, '..', '..', 'scripts', 'copied');
const shippedLine = (file: string) => firstLine(path.join(SHIPPED, file));

test('R1 - a 0.4.0 machine: one update moves both folders, imports the record into a list, rewrites the copied files and re-points every registration', T, async () =>
{
    const h = world('r1');
    const dir = h.project('p');
    const r = h.run(dir, { picks: { gitlab: { scope: 'project', token: true }, memory: { scope: 'project' }, sentry: { route: 'bridge', scope: 'user', token: true } } });
    assert.deepStrictEqual(r.plan.errors, [], r.rendered);
    assert.strictEqual(r.report.failed, null, `${r.rendered}\n${r.text}`);
    const gitlabKey = key();
    fake.fill(path.join(dir, NEW, roots.FILES.secrets), 'GITLAB_TOKEN', gitlabKey);
    const servers = age(h, dir, { record: true });
    assert.deepStrictEqual(servers.map((s) => `${s.name}~${s.scope}`).sort(), ['gitlab~project', 'memory~project', 'sentry~user']);
    assert.ok(readJson(path.join(dir, '.mcp.json')).mcpServers.gitlab.headersHelper.includes(OLD), 'the 0.4.0 registration names the old folder');

    await updateAll(h, dir);
    noOld(h, dir, 'R1');
    for (const at of [dir, h.home])
    {
        const root = path.join(at, NEW);
        assert.ok(listOf(root), `${root}: the record came in as a list`);
        assert.ok(!exists(path.join(root, roots.FILES.record)), `${root}: the record is gone`);
        assert.strictEqual(firstLine(path.join(root, roots.FILES.helper)), shippedLine('mcp-headers.js'));
    }
    assert.strictEqual(firstLine(path.join(h.home, NEW, roots.FILES.bridge)), shippedLine('mcp-bridge.js'));
    const project = readJson(path.join(dir, '.mcp.json')).mcpServers;
    assert.ok(namesFolder(project.gitlab.headersHelper, path.join(dir, NEW, roots.FILES.helper)), project.gitlab.headersHelper);
    assert.ok(namesFolder(JSON.stringify(project.memory), path.join(dir, NEW, 'memory')), JSON.stringify(project.memory));
    const sentry = account.readRegistration('sentry', 'user', dir, h.env)!;
    assert.strictEqual(sentry.args![0], path.join(h.home, NEW, roots.FILES.bridge));
    const map = readJson(path.join(h.data, roots.FILES.map));
    assert.strictEqual(map.global, path.join(h.home, NEW));
    assert.strictEqual(map.projects[roots.mapKey(dir)], path.join(dir, NEW));
    // the moved helper reads the moved key file: the key reaches the header (compared, never printed)
    const helper = spawnSync(process.execPath, [path.join(dir, NEW, roots.FILES.helper), 'GITLAB_TOKEN', 'Bearer'], { cwd: dir, env: { ...h.env, CLAUDE_CODE_MCP_SERVER_NAME: 'gitlab' }, encoding: 'utf8' });
    assert.strictEqual(helper.status, 0, 'the helper runs');
    assert.ok(helper.stdout.includes(`Bearer ${gitlabKey}`), 'the moved helper finds the key in the moved .mcps-secrets');
    assert.deepStrictEqual(h.realUntouched().changed, [], 'the real home and account are untouched');
});

test('R2 - a pre-rename 0.5.0 machine: lists, Cursor\'s copies, the old kept marker and serena\'s context 1, moved by one update', T, async () =>
{
    const h = world('r2');
    const dir = h.project('p');
    // the stdio keyed route: since 0.7.0 an install writes a launcher, so context7's plain 0.5.0 form is seeded by hand -
    // the key in the registration's env, the kept marker in its list entry and in Cursor's copy - to keep the old marker
    // this case moves
    fs.mkdirSync(path.join(dir, NEW), { recursive: true });
    const c7Key = key();
    fake.fill(path.join(dir, NEW, roots.FILES.secrets), 'CONTEXT7_API_KEY', c7Key);
    const r = h.run(dir, { clients: ['claude', 'cursor'], picks: { serena: { scope: 'project' }, memory: { scope: 'project' }, gitlab: { scope: 'user', token: true } } });
    assert.deepStrictEqual(r.plan.errors, [], r.rendered);
    assert.strictEqual(r.report.failed, null, `${r.rendered}\n${r.text}`);
    seedPlainContext7(h, dir, c7Key);
    const servers = age(h, dir, { record: false });
    const oldList = fs.readFileSync(path.join(dir, OLD, roots.FILES.list), 'utf8') + (exists(path.join(h.home, OLD, roots.FILES.list)) ? fs.readFileSync(path.join(h.home, OLD, roots.FILES.list), 'utf8') : '');
    assert.ok(oldList.includes(kept.OLD_MARKER), 'the pre-rename list holds the old kept marker');

    const listsOf = () => [listOf(path.join(dir, NEW)), listOf(path.join(h.home, NEW))].filter(Boolean) as McpsList[];
    // after the move alone: the kept marker reads in its new name, and the plain entry still holds it
    await updateAll(h, dir, () =>
    {
        const moved = listsOf().map((l) => JSON.stringify(l)).join('\n');
        assert.ok(!moved.includes(kept.OLD_MARKER), 'the move left no old marker');
        assert.ok(moved.includes(kept.MARKER), 'the kept marker reads in its new name');
    });
    noOld(h, dir, 'R2');
    const lists = listsOf();
    assert.deepStrictEqual(lists.flatMap((l) => l.servers.map((s) => `${s.name}~${s.scope}`)).sort(), servers.map((s) => `${s.name}~${s.scope}`).sort(), 'every server still listed');
    const listText = lists.map((l) => JSON.stringify(l)).join('\n');
    assert.ok(!listText.includes(kept.OLD_MARKER), 'no old marker left');
    // then key-to-launcher moved the key: context7 is the launcher in the account, the list and Cursor's copy, with the
    // key's name and no marker and no value; the key stays only in the root's .mcps-secrets
    assert.ok(!listText.includes(kept.MARKER), 'the launcher entry holds no kept marker');
    const account7 = account.readRegistration('context7', 'local', dir, h.env)!;
    assert.strictEqual(account7.command, 'node');
    assert.notStrictEqual(launcherParts(account7), null, `context7 is a launcher: ${JSON.stringify(account7.args)}`);
    assert.ok(account7.args!.includes('CONTEXT7_API_KEY=CONTEXT7_API_KEY?'), 'the launcher names the key');
    const cursorC7 = readJson(path.join(dir, '.cursor', 'mcp.json')).mcpServers.context7;
    assert.deepStrictEqual(cursorC7, account7, 'Cursor\'s copy is the same launcher');
    const entry7 = lists.flatMap((l) => l.servers).find((s) => s.name === 'context7')!;
    assert.deepStrictEqual(entry7.entry, account7, 'the list entry is the launcher');
    for (const [label, text] of [['account file', fs.readFileSync(account.accountFile(h.env), 'utf8')], ['Cursor project file', fs.readFileSync(path.join(dir, '.cursor', 'mcp.json'), 'utf8')], ['list', listText]] as const)
        assert.ok(!text.includes(c7Key), `${label} holds no key value`);
    assert.ok(fs.readFileSync(path.join(dir, NEW, roots.FILES.secrets), 'utf8').includes(c7Key), 'the key stays in the root\'s .mcps-secrets');
    assert.strictEqual(firstLine(path.join(dir, NEW, 'serena', roots.FILES.serenaContext)), shippedLine('serena-context.yml'));
    for (const root of [path.join(dir, NEW), path.join(h.home, NEW)].filter((root) => exists(path.join(root, roots.FILES.helper))))
        assert.strictEqual(firstLine(path.join(root, roots.FILES.helper)), shippedLine('mcp-headers.js'));
    const cursorProject = readJson(path.join(dir, '.cursor', 'mcp.json')).mcpServers;
    assert.ok(namesFolder(JSON.stringify(cursorProject.serena), path.join(dir, NEW)), JSON.stringify(cursorProject.serena));
    assert.deepStrictEqual(h.realUntouched().changed, [], 'the real home and account are untouched');
});
