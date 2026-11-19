// key-to-launcher for a server kept for Cursor alone (a client-drift 'drop' of Claude Code's copy): its list entry is the
// user-scope plain keyed form, and Cursor's file holds the key value. The move rewrites the list entry and Cursor's copy to
// the launcher. Also: a 'leave' answer on a drifted server never lets the move go ahead. Key values are built at run time
// and compared in process: no test prints one.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as roots from '../scripts/roots/roots.ts';
import * as cli from '../scripts/core/claude-cli.ts';
import * as kept from '../scripts/core/kept.ts';
import { load } from '../scripts/catalog/catalog.ts';
import { readAccount } from '../scripts/core/account.ts';
import { launcherParts } from '../scripts/entries/launcher.ts';
import { detectAll, applyFixes } from '../scripts/fix/fix.ts';
import { world, readJson, writeJson, files } from './helpers.ts';
import { ctxOf, localEntry, logged, put, seed, shownOf } from './fix-helpers.ts';
import { run, installPlain } from './update-helpers.ts';
import type { Finding } from '../scripts/fix/types.ts';
import type { ServerEntry } from '../scripts/core/types.ts';
import type { World } from './types.ts';

const catalog = load();
const GITHUB_KEY = 'GITHUB_PERSONAL_ACCESS_TOKEN';
const GITHUB_IMAGE = 'ghcr.io/github/github-mcp-server:v2.1.0';
const keyValue = (): string => ['k', crypto.randomBytes(12).toString('hex')].join('-');
const projectRoot = (w: World): string => path.join(w.project, '.alfred-tools');
const globalRoot = (w: World): string => path.join(w.home, '.alfred-tools');
const cursorFile = (w: World): string => path.join(w.home, '.cursor', 'mcp.json');
const listFile = (w: World): string => path.join(globalRoot(w), 'mcps.json');
const secrets = (dir: string, pairs: Record<string, string>): void => put(path.join(dir, '.mcps-secrets'), Object.entries(pairs).map(([name, value]) => `${name}=${value}\n`).join(''));
const plainGithub = (value: string, after: string[] = []): ServerEntry => ({ command: 'docker', args: ['run', '-i', '--rm', '-e', GITHUB_KEY, GITHUB_IMAGE, 'stdio', ...after], env: { [GITHUB_KEY]: value } });
const found = (w: World): Finding[] => detectAll(ctxOf(w)).found.filter((finding) => finding.id === 'key-to-launcher');
const tmpOf = (w: World): string => path.join(w.dir, 'tmp');
const listed = (w: World) => readJson(listFile(w)).servers.find((server: { name: string }) => server.name === 'github');
const filesShowing = (w: World, value: string): string[] => files(w.dir).filter((file) => !['.mcps-secrets', 'calls.jsonl'].includes(path.basename(file)) && fs.readFileSync(file, 'utf8').includes(value));

// github at user scope in the plain form for both apps, then Claude Code's copy dropped: the list entry is Cursor's alone
function cursorOnlyGithub(w: World, key: string): void
{
    secrets(globalRoot(w), { [GITHUB_KEY]: key });
    installPlain(w, 'github', 'user', plainGithub(key));
    assert.strictEqual(cli.runClaude(['mcp', 'remove', 'github', '-s', 'user'], { cwd: w.project, env: w.env }).status, 0);
    const out = logged();
    const result = applyFixes(ctxOf(w), ['none'], { tmp: tmpOf(w), log: out.log, input: { 'drift:claude:github~user': 'drop' } });
    assert.strictEqual(result.failed, null, out.text());
    assert.deepStrictEqual(listed(w).clients, ['cursor'], 'the list entry is for Cursor alone');
    assert.strictEqual(readJson(cursorFile(w)).mcpServers.github.env[GITHUB_KEY], key, "Cursor's copy holds the key before the move");
}

test("a server kept for Cursor alone moves to the launcher: the list entry and Cursor's copy hold no value, and Claude Code gets no copy", () =>
{
    const w = world();
    try
    {
        const key = keyValue();
        cursorOnlyGithub(w, key);
        const [finding, ...rest] = found(w) as [Finding];
        assert.deepStrictEqual([rest.length, finding.name, finding.scope, finding.keyName, finding.blocked], [0, 'github', 'user', GITHUB_KEY, undefined]);
        assert.match(finding.found, /Cursor/);
        assert.ok(!shownOf(detectAll(ctxOf(w))).includes(key), 'no value shown');
        const out = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['key-to-launcher'], { tmp: tmpOf(w), log: out.log }).failed, null, out.text());
        assert.ok(launcherParts(readJson(cursorFile(w)).mcpServers.github), "Cursor's copy is the launcher");
        assert.ok(launcherParts(listed(w).entry), 'the list entry is the launcher');
        assert.deepStrictEqual(listed(w).clients, ['cursor'], 'still for Cursor alone');
        assert.strictEqual(readAccount(w.env, w.project).user['github'], undefined, 'no Claude Code registration added');
        assert.strictEqual(roots.shippedState('bridge', path.join(globalRoot(w), 'mcp-bridge.js')).state, 'same', "the root's bridge is written");
        assert.deepStrictEqual(filesShowing(w, key), [], 'no file but .mcps-secrets holds the key');
        assert.ok(!out.text().includes(key), 'no key printed');
        assert.deepStrictEqual(found(w), [], 'a second detect finds nothing');
        const [cursorText, list] = [fs.readFileSync(cursorFile(w), 'utf8'), fs.readFileSync(listFile(w), 'utf8')];
        assert.strictEqual(applyFixes(ctxOf(w), ['all'], { tmp: tmpOf(w), log: () => {} }).failed, null);
        assert.strictEqual(fs.readFileSync(cursorFile(w), 'utf8'), cursorText, 'a later run leaves Cursor\'s file alone: no key value is filled back');
        assert.strictEqual(fs.readFileSync(listFile(w), 'utf8'), list);
    }
    finally { w.clean(); }
});

test("a server kept for Cursor alone is blocked when no .mcps-secrets holds the key, and nothing is written", () =>
{
    const w = world();
    try
    {
        const key = keyValue();
        cursorOnlyGithub(w, key);
        fs.rmSync(path.join(globalRoot(w), '.mcps-secrets'));
        const [finding] = found(w) as [Finding];
        assert.ok(finding && finding.blocked, 'blocked');
        assert.strictEqual(finding.blocked, `github holds a key no .mcps-secrets holds - put it in ${finding.chain![0]} as ${GITHUB_KEY}, then run fix again`);
        assert.ok(!`${finding.blocked}${finding.found}${shownOf(detectAll(ctxOf(w)))}`.includes(key));
        const [cursorText, list] = [fs.readFileSync(cursorFile(w), 'utf8'), fs.readFileSync(listFile(w), 'utf8')];
        assert.deepStrictEqual(applyFixes(ctxOf(w), ['key-to-launcher'], { tmp: tmpOf(w), log: () => {} }).skipped.map((skipped) => skipped.id), ['key-to-launcher']);
        assert.strictEqual(fs.readFileSync(cursorFile(w), 'utf8'), cursorText, "Cursor's file, the only copy of the key, is as it was");
        assert.strictEqual(fs.readFileSync(listFile(w), 'utf8'), list, 'the list is as it was');
        assert.ok(!fs.existsSync(path.join(globalRoot(w), 'mcp-bridge.js')), 'no bridge written for a blocked move');
    }
    finally { w.clean(); }
});

test("a server kept for Cursor alone is blocked when Cursor's copy holds a key that differs from the file's, and nothing is written", () =>
{
    const w = world();
    try
    {
        const [key, other] = [keyValue(), keyValue()];
        cursorOnlyGithub(w, key);
        const doc = readJson(cursorFile(w));
        doc.mcpServers.github.env[GITHUB_KEY] = other;
        writeJson(cursorFile(w), doc);
        const [finding] = found(w) as [Finding];
        assert.ok(finding && finding.blocked, 'blocked');
        assert.match(finding.blocked, new RegExp(`^github: Cursor's copy in ${cursorFile(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} holds a key that differs from the one in .*\\.mcps-secrets - put the key that works`));
        for (const value of [key, other]) assert.ok(!`${finding.blocked}${finding.found}${shownOf(detectAll(ctxOf(w)))}`.includes(value), 'no value shown');
        const [cursorText, list] = [fs.readFileSync(cursorFile(w), 'utf8'), fs.readFileSync(listFile(w), 'utf8')];
        assert.deepStrictEqual(applyFixes(ctxOf(w), ['key-to-launcher'], { tmp: tmpOf(w), log: () => {} }).skipped.map((skipped) => skipped.id), ['key-to-launcher']);
        assert.strictEqual(fs.readFileSync(cursorFile(w), 'utf8'), cursorText);
        assert.strictEqual(fs.readFileSync(listFile(w), 'utf8'), list);
    }
    finally { w.clean(); }
});

test("a server kept for Cursor alone is blocked over an edited bridge, with the helper-stale text", () =>
{
    const w = world();
    try
    {
        cursorOnlyGithub(w, keyValue());
        put(path.join(globalRoot(w), 'mcp-bridge.js'), `${roots.shippedSource('bridge')}// mine\n`);
        const [finding] = found(w) as [Finding];
        assert.strictEqual(finding.blocked, `mcp-bridge.js in ${globalRoot(w)} changed since alfred-tools wrote it - /alfred-tools:fix (helper-stale) rewrites it, or delete it, then run fix again`);
        const cursorText = fs.readFileSync(cursorFile(w), 'utf8');
        assert.deepStrictEqual(applyFixes(ctxOf(w), ['key-to-launcher'], { tmp: tmpOf(w), log: () => {} }).skipped.map((skipped) => skipped.id), ['key-to-launcher']);
        assert.strictEqual(fs.readFileSync(cursorFile(w), 'utf8'), cursorText);
    }
    finally { w.clean(); }
});

test("a server kept for Cursor alone waits while a client-drift is open on Cursor's copy", () =>
{
    const w = world();
    try
    {
        cursorOnlyGithub(w, keyValue());
        const doc = readJson(cursorFile(w));
        doc.mcpServers.github.args.push('--read-only');
        writeJson(cursorFile(w), doc);
        const out = logged();
        const result = applyFixes(ctxOf(w), ['key-to-launcher'], { tmp: tmpOf(w), log: out.log });
        assert.deepStrictEqual(result.skipped.map((skipped) => skipped.id), ['key-to-launcher']);
        assert.match(out.text(), /skipped key-to-launcher on .*github.*client-drift/);
        assert.deepStrictEqual(readJson(cursorFile(w)).mcpServers.github.args.slice(-1), ['--read-only'], "the hand edit in Cursor's copy is kept");
    }
    finally { w.clean(); }
});

test("update offers the Cursor-only move under 'New ways to pass data' and applies it", async () =>
{
    const w = world();
    try
    {
        const key = keyValue();
        cursorOnlyGithub(w, key);
        const check = await run(w, ['--check', '--no-refresh']);
        assert.match(check.text, /New ways to pass data:[\s\S]*github \(user\)\s+key-to-launcher: /);
        assert.ok(!check.text.includes(key));
        const applied = await run(w, ['--apply', 'upgrade:key-to-launcher:github~user', '--no-refresh']);
        assert.strictEqual(applied.code, 0, applied.text);
        assert.ok(launcherParts(readJson(cursorFile(w)).mcpServers.github), "Cursor's copy is the launcher");
        assert.ok(launcherParts(listed(w).entry), 'the list entry is the launcher');
        assert.ok(!applied.text.includes(key));
        assert.deepStrictEqual(filesShowing(w, key), [], 'no file but .mcps-secrets holds the key');
        const again = await run(w, ['--check', '--no-refresh']);
        assert.doesNotMatch(again.text, /key-to-launcher/);
    }
    finally { w.clean(); }
});

// a 0.6.0 list holding plain github at Local, and a registration that drifted from it with an arg the list lacks
function driftedLocalGithub(w: World, key: string): void
{
    secrets(projectRoot(w), { [GITHUB_KEY]: key });
    writeJson(path.join(projectRoot(w), 'mcps.json'), { version: 1, servers: [{ name: 'github', scope: 'local', row: 'github', route: 'local', clients: ['claude'], entry: kept.maskCredentials(plainGithub(key), catalog.byId.get('github')), key: GITHUB_KEY }], own: [] });
    seed(w, 'github', 'local', plainGithub(key, ['--read-only']));
}

test("an answer of leave on the drifted server does not let the move go ahead: both are skipped and the registration is untouched", () =>
{
    const w = world();
    try
    {
        driftedLocalGithub(w, keyValue());
        const entry = localEntry(w, 'github');
        const list = fs.readFileSync(path.join(projectRoot(w), 'mcps.json'), 'utf8');
        const out = logged();
        const result = applyFixes(ctxOf(w), ['key-to-launcher'], { tmp: tmpOf(w), log: out.log, input: { 'drift:claude:github~local': 'leave' } });
        assert.strictEqual(result.failed, null, out.text());
        assert.deepStrictEqual(result.skipped.map((skipped) => skipped.id).sort(), ['client-drift', 'key-to-launcher']);
        assert.match(out.text(), /skipped key-to-launcher on .*github.*client-drift is open on it - answer that first \(restore or keep\)/);
        assert.deepStrictEqual(localEntry(w, 'github'), entry, 'the registration is as it was');
        assert.strictEqual(fs.readFileSync(path.join(projectRoot(w), 'mcps.json'), 'utf8'), list, 'the drifted registration is not written into the list');
    }
    finally { w.clean(); }
});
