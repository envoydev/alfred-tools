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
import { RestoreBlocked, keyToLauncherCursorSteps } from '../scripts/fix/key-to-launcher.ts';
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
const listed = (w: World, name = 'github') => readJson(listFile(w)).servers.find((server: { name: string }) => server.name === name);
const filesShowing = (w: World, value: string): string[] => files(w.dir).filter((file) => !['.mcps-secrets', 'calls.jsonl'].includes(path.basename(file)) && fs.readFileSync(file, 'utf8').includes(value));

// `name` at user scope in the plain form for both apps, then Claude Code's copy dropped: the list entry is Cursor's alone
function cursorOnlyServer(w: World, name: string, keyName: string, plain: ServerEntry, key: string): void
{
    secrets(globalRoot(w), { [keyName]: key });
    installPlain(w, name, 'user', plain);
    assert.strictEqual(cli.runClaude(['mcp', 'remove', name, '-s', 'user'], { cwd: w.project, env: w.env }).status, 0);
    const out = logged();
    const result = applyFixes(ctxOf(w), ['none'], { tmp: tmpOf(w), log: out.log, input: { [`drift:claude:${name}~user`]: 'drop' } });
    assert.strictEqual(result.failed, null, out.text());
    assert.deepStrictEqual(listed(w, name).clients, ['cursor'], 'the list entry is for Cursor alone');
    assert.ok(JSON.stringify(readJson(cursorFile(w)).mcpServers[name]).includes(key), "Cursor's copy holds the key before the move");
}
const cursorOnlyGithub = (w: World, key: string): void => cursorOnlyServer(w, 'github', GITHUB_KEY, plainGithub(key), key);

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
        assert.ok(finding.blocked.endsWith(`as ${GITHUB_KEY}, then run fix again`) && !finding.blocked.includes('token-sync'), 'no token-sync advice: it walks registrations, never a list entry');
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

// root files a blocked move must not write
const rootFiles = (w: World): string[] => ['mcp-bridge.js', 'mcp-headers.js'].filter((file) => fs.existsSync(path.join(globalRoot(w), file)));

test("a Cursor file the writer refuses blocks the move before anything is written: not JSON, a symbolic link, a copy in a shape Cursor does not read", (t) =>
{
    const cases: [string, (w: World) => void, RegExp][] = [
        ['not JSON', (w) => fs.writeFileSync(cursorFile(w), '{ "mcpServers": // a comment\n'), /^github: .*mcp\.json is not JSON .* - then run fix again$/],
        ['a symbolic link', (w) =>
        {
            const target = path.join(w.dir, 'dotfiles-mcp.json');
            fs.renameSync(cursorFile(w), target);
            fs.symlinkSync(target, cursorFile(w));
        }, /^github: .*mcp\.json is a symbolic link .* - then run fix again$/],
        ['a copy in a shape Cursor does not read', (w) =>
        {
            const doc = readJson(cursorFile(w));
            doc.mcpServers.github.args = 'not-a-list';
            writeJson(cursorFile(w), doc);
        }, /^github: its copy in .*mcp\.json is not in the shape Cursor reads .* - then run fix again$/],
    ];
    for (const [label, spoil, text] of cases)
    {
        if (label === 'a symbolic link' && process.platform === 'win32') { t.diagnostic('symbolic links need a privilege on Windows: skipped there'); continue; }
        const w = world();
        try
        {
            const key = keyValue();
            cursorOnlyGithub(w, key);
            spoil(w);
            const [finding] = found(w) as [Finding];
            assert.ok(finding && finding.blocked, `${label}: blocked`);
            assert.match(finding.blocked, text, label);
            assert.ok(!`${finding.blocked}${finding.found}${shownOf(detectAll(ctxOf(w)))}`.includes(key), 'no value shown');
            const [list, cursorText] = [fs.readFileSync(listFile(w), 'utf8'), fs.readFileSync(cursorFile(w), 'utf8')];
            const out = logged();
            const result = applyFixes(ctxOf(w), ['key-to-launcher'], { tmp: tmpOf(w), log: out.log });
            assert.deepStrictEqual(result.skipped.map((skipped) => skipped.id), ['key-to-launcher'], label);
            assert.strictEqual(fs.readFileSync(listFile(w), 'utf8'), list, `${label}: the list is as it was`);
            assert.strictEqual(fs.readFileSync(cursorFile(w), 'utf8'), cursorText, `${label}: Cursor's file is as it was`);
            assert.deepStrictEqual(rootFiles(w), [], `${label}: no root file written`);
        }
        finally { w.clean(); }
    }
});

test("a Cursor file spoiled after the detect is caught when the move is planned: only that finding is skipped, nothing written", () =>
{
    const w = world();
    try
    {
        cursorOnlyGithub(w, keyValue());
        const [finding] = found(w) as [Finding];
        assert.ok(finding && !finding.blocked, 'not blocked while the file reads');
        fs.writeFileSync(cursorFile(w), 'not json');
        assert.throws(() => keyToLauncherCursorSteps(finding, ctxOf(w)), (caught: unknown) => caught instanceof RestoreBlocked && /is not JSON/.test(caught.message));
        assert.deepStrictEqual(rootFiles(w), []);
    }
    finally { w.clean(); }
});

test("the move for sentry (npx route) and for context7 local with a former --api-key in its args", () =>
{
    const cases: [string, string, ServerEntry, (entry: ServerEntry) => void][] = [
        ['sentry', 'SENTRY_ACCESS_TOKEN', { command: 'npx', args: ['-y', '@sentry/mcp-server@0.49.0'], env: { npm_config_before: '2026-11-19T23:59:59Z', SENTRY_AUTH_TOKEN: '' } }, (entry) =>
        {
            const parts = launcherParts(entry)!;
            assert.strictEqual(`${parts.envVar}=${parts.keyName}`, 'SENTRY_AUTH_TOKEN=SENTRY_ACCESS_TOKEN');
        }],
        ['context7', 'CONTEXT7_API_KEY', { command: 'npx', args: ['-y', '@upstash/context7-mcp@4.7.0', '--api-key', ''] }, (entry) =>
        {
            const parts = launcherParts(entry)!;
            assert.strictEqual(`${parts.envVar}=${parts.keyName}${parts.optional ? '?' : ''}`, 'CONTEXT7_API_KEY=CONTEXT7_API_KEY?');
            assert.ok(!(entry.args ?? []).slice((entry.args ?? []).indexOf('--')).includes('--api-key'), 'no --api-key after --');
        }],
    ];
    for (const [name, keyName, shape, check] of cases)
    {
        const w = world();
        try
        {
            const key = keyValue();
            const plain: ServerEntry = JSON.parse(JSON.stringify(shape).replace('""', JSON.stringify(key)));
            cursorOnlyServer(w, name, keyName, plain, key);
            const [finding] = found(w) as [Finding];
            assert.ok(finding && !finding.blocked, `${name}: found, not blocked: ${finding?.blocked}`);
            const out = logged();
            assert.strictEqual(applyFixes(ctxOf(w), ['key-to-launcher'], { tmp: tmpOf(w), log: out.log }).failed, null, out.text());
            check(readJson(cursorFile(w)).mcpServers[name]);
            check(listed(w, name).entry);
            assert.deepStrictEqual(filesShowing(w, key), [], `${name}: no file but .mcps-secrets holds the key`);
            assert.deepStrictEqual(found(w), [], `${name}: a second detect finds nothing`);
        }
        finally { w.clean(); }
    }
});

test("a stale cursorEntry on the list entry is gone after the move, so Cursor gets the launcher", () =>
{
    const w = world();
    try
    {
        const key = keyValue();
        cursorOnlyGithub(w, key);
        const doc = readJson(listFile(w));
        const server = doc.servers.find((candidate: { name: string }) => candidate.name === 'github');
        // the plain form again, as the entry holds it: no drift, but a stale copy the writer would prefer to the launcher
        server.cursorEntry = JSON.parse(JSON.stringify(server.entry));
        writeJson(listFile(w), doc);
        const out = logged();
        assert.strictEqual(applyFixes(ctxOf(w), ['key-to-launcher'], { tmp: tmpOf(w), log: out.log }).failed, null, out.text());
        assert.strictEqual(listed(w).cursorEntry, undefined, 'no cursorEntry left on the list entry');
        assert.ok(launcherParts(readJson(cursorFile(w)).mcpServers.github), "Cursor's copy is the launcher, not the stale copy");
    }
    finally { w.clean(); }
});

test("the wait line names the answers the open drift accepts: a missing Cursor copy takes restore or drop", () =>
{
    const w = world();
    try
    {
        cursorOnlyGithub(w, keyValue());
        const doc = readJson(cursorFile(w));
        delete doc.mcpServers.github;
        writeJson(cursorFile(w), doc);
        const out = logged();
        const result = applyFixes(ctxOf(w), ['key-to-launcher'], { tmp: tmpOf(w), log: out.log });
        assert.deepStrictEqual(result.skipped.map((skipped) => skipped.id), ['key-to-launcher']);
        assert.match(out.text(), /skipped key-to-launcher on .*github.*: client-drift is open on it - answer that first \(restore or drop; 'leave' does not settle it\), then run fix again/);
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
        assert.match(out.text(), /skipped key-to-launcher on .*github.*client-drift is open on it - answer that first \(restore or keep; 'leave' does not settle it\)/);
        assert.deepStrictEqual(localEntry(w, 'github'), entry, 'the registration is as it was');
        assert.strictEqual(fs.readFileSync(path.join(projectRoot(w), 'mcps.json'), 'utf8'), list, 'the drifted registration is not written into the list');
    }
    finally { w.clean(); }
});
