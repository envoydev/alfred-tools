// Step 7 check: the harness runs the REAL claude CLI in a throwaway world and leaves the real account byte-identical.
// Skipped (not failed) when no claude CLI is on PATH.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as cli from '../scripts/core/claude-cli.ts';
import * as account from '../scripts/core/account.ts';
import { pythonRequest } from '../scripts/entries/platform.ts';
import { Harness, isolationCheck } from './harness.ts';
import { makeCtx, detectAll, applyFixes } from '../scripts/fix/fix.ts';
import type { RunResult } from '../scripts/fix/types.ts';
import type { CatalogRoute } from '../scripts/catalog/types.ts';
import type { ServerEntry, ServerMap } from '../scripts/core/types.ts';

const skip = cli.available() ? false : 'no claude CLI on PATH';
const roots: string[] = [];
const root = () => { const r = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-harness-')); roots.push(r); return r; };
test.after(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

test('isolation: the CLI writes in the throwaway account and the real one is byte-identical', { skip }, () =>
{
    const h = new Harness({ root: root() });
    const r = isolationCheck(h);
    assert.ok(r.ok, r.lines.join('\n'));
});

test('the real CLI treats an empty or {} .mcp.json as fresh and refuses a malformed one untouched', { skip }, () =>
{
    const h = new Harness({ root: root() });
    for (const [name, content, ok] of [['empty', '', true], ['blank', '  \n', true], ['obj', '{}', true], ['bad', '{ nope', false]] as [string, string, boolean][])
    {
        const p = h.project(`mcp-${name}`);
        const file = path.join(p, '.mcp.json');
        fs.writeFileSync(file, content);
        const r = h.claude(p, ['mcp', 'add-json', 'probe', JSON.stringify({ command: 'echo', args: ['x'] }), '-s', 'project']);
        assert.equal(r.status === 0, ok, `${name}: exit ${r.status}`);
        if (ok) assert.ok(JSON.parse(fs.readFileSync(file, 'utf8')).mcpServers.probe, name);
        else assert.equal(fs.readFileSync(file, 'utf8'), content, 'a malformed file is left as it was');
    }
    assert.ok(h.realUntouched().ok);
});

test('the fix engine against the REAL CLI: detect, apply as one replace, read back, a second run finds nothing, the real account untouched', { skip }, () =>
{
    const h = new Harness({ root: root() });
    const project = h.project('fix-real');
    const theirs = { command: 'uvx', args: ['--from', 'serena-agent@2.0.0', 'serena', 'start-mcp-server', '--verbose'], env: { SERENA_HOME: path.join(h.home, 'serena-home') } };
    const own = { command: 'node', args: ['mine.js'] };
    for (const [name, entry] of [['serena', theirs], ['my-own-server', own]] as [string, ServerEntry][])
        assert.strictEqual(h.claude(project, ['mcp', 'add-json', name, JSON.stringify(entry), '-s', 'user']).status, 0);
    const machine = { exists: () => false, realpath: () => null, which: () => null, run: () => ({ status: 1 } as RunResult), nodeVersion: process.versions.node };
    const ctx = () => makeCtx({ inv: h.inventory(project), env: h.env, machine });
    const found = detectAll(ctx()).found;
    // and the 0.4.x install moves onto the list
    assert.deepStrictEqual(found.map((f) => f.id).sort(), ['list-import', 'serena-context', 'serena-telemetry', 'uvx-python']);
    const lines: string[] = [];
    const res = applyFixes(ctx(), ['all'], { tmp: path.join(h.root, 'tmp'), log: (...a) => lines.push(a.join(' ')) });
    assert.strictEqual(res.failed, null, lines.join('\n'));
    const now = account.readAccount(h.env, project).user as ServerMap & { serena: ServerEntry };
    // the row's minor, as this machine takes it: on Windows ARM64 the x64 build (windows-arm-python)
    const c = ctx();
    assert.deepStrictEqual(now.serena.args!.slice(0, 2), ['--python', pythonRequest({ python: '3.13' } as CatalogRoute, c, c.rules)]);
    assert.ok(now.serena.args!.includes('serena-agent@2.0.0') && now.serena.args!.includes('--verbose'), 'the user\'s pin and arg survive the real CLI round trip');
    assert.strictEqual(now.serena.env!.SERENA_USAGE_REPORTING, 'false');
    assert.deepStrictEqual(now['my-own-server'], own);
    assert.deepStrictEqual(detectAll(ctx()).found, []);
    const list = JSON.parse(fs.readFileSync(path.join(h.home, '.preferred-tools', 'mcps.json'), 'utf8'));
    assert.deepStrictEqual(list.servers.map((s: { name: string; scope: string; entry: ServerEntry }) => [s.name, s.scope, s.entry.args![0]]), [['serena', 'user', '--python']], 'the list holds the repaired entry, as the real CLI reads it back');
    assert.ok(h.realUntouched().ok);
});
