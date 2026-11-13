'use strict';
// CURSOR AND CLAUDE CODE FROM ONE LIST (spec 2026-11-13). Real-CLI cases in a throwaway home and account, each reading
// the written files, never the exit code alone.
//
//   npm run matrix
//
// A missing runtime or no network is NOT RUN, with the reason.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const cli = require('../../scripts/claude-cli.js');
const { Harness } = require('../harness.js');

const skipAll = cli.available() ? false : 'NOT RUN: no claude CLI on PATH';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-cursor-'));
const h = new Harness({ root });
const NETWORK = /could not resolve|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|ECONNRESET|fetch failed|network/i;
const START_MS = 600000;

const children = [];
const stop = (child) =>
{
    if (child.exitCode !== null || child.signalCode !== null) return;
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    else try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
};
test.after(() => { children.forEach(stop); fs.rmSync(root, { recursive: true, force: true }); });

const which = (bin) => spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8' }).status === 0;
const expand = (s, env) => s.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (_, k, d) => (env[k] !== undefined ? env[k] : d !== undefined ? d : ''));

// A minimal MCP client over stdio: initialize, then each request in turn. -> { ok, results?, why? }
function session(entry, cwd, requests)
{
    return new Promise((resolve) =>
    {
        const env = { ...h.env };
        for (const [k, v] of Object.entries(entry.env || {})) env[k] = expand(v, h.env);
        const child = spawn(expand(entry.command, h.env), (entry.args || []).map((a) => expand(a, h.env)), { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
        children.push(child);
        const results = {};
        let out = '';
        let err = '';
        const send = (msg) => child.stdin.write(`${JSON.stringify(msg)}\n`);
        const done = (r) => { clearTimeout(timer); stop(child); resolve(r); };
        const timer = setTimeout(() => done({ ok: false, why: `no answer in ${START_MS / 1000}s; stderr: ${err.slice(-400)}` }), START_MS);
        child.on('error', (e) => done({ ok: false, why: e.message }));
        child.on('exit', (code) => done({ ok: false, why: `exited ${code}; stderr: ${err.slice(-600)}` }));
        child.stderr.on('data', (d) => { err += d; });
        let next = 0;
        child.stdout.on('data', (d) =>
        {
            out += d;
            const lines = out.split('\n');
            out = lines.pop();
            for (const line of lines)
            {
                let msg;
                try { msg = JSON.parse(line); } catch { continue; }
                if (msg.id === undefined || msg.method) continue;
                if (msg.error) return done({ ok: false, why: `request ${msg.id}: ${JSON.stringify(msg.error)}` });
                results[msg.id] = msg.result;
                if (msg.id === 0) send({ jsonrpc: '2.0', method: 'notifications/initialized' });
                if (next === requests.length) return done({ ok: true, results });
                send({ jsonrpc: '2.0', id: next + 1, ...requests[next] });
                next += 1;
            }
        });
        send({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'preferred-tools-matrix', version: '0' } } });
    });
}

// F7: the six the context allows
const ALLOWED = ['initial_instructions', 'get_symbols_overview', 'find_symbol', 'find_referencing_symbols', 'find_implementations', 'find_declaration'];
// Serena 2.1.0's other tools, the ones its manual must not name once base_modes is [] (F9)
const OTHERS = ['replace_symbol_body', 'rename_symbol', 'insert_after_symbol', 'insert_before_symbol', 'safe_delete_symbol', 'search_for_pattern',
    'read_file', 'create_text_file', 'list_dir', 'find_file', 'replace_content', 'execute_shell_command', 'write_memory', 'read_memory',
    'list_memories', 'delete_memory', 'edit_memory', 'activate_project', 'onboarding', 'check_onboarding_performed', 'get_current_config'];

test('M4 serena\'s manual names no tool outside the allow-list', { skip: skipAll, timeout: START_MS * 2 }, async (t) =>
{
    if (!which('uvx')) return t.skip('NOT RUN: uvx not on PATH');
    const p = h.project('m4-serena');
    fs.writeFileSync(path.join(p, 'index.ts'), 'export function greet(name: string): string { return `hi ${name}`; }\n');
    const r = h.run(p, { picks: { serena: { scope: 'local' } } });
    assert.deepStrictEqual(r.plan.errors, []);
    assert.strictEqual(r.report.failed, null, r.text);
    const reg = h.inventory(p).registrations.find((x) => x.name === 'serena' && x.scope === 'local');
    assert.ok(reg, 'read back from the account file');
    const a = reg.entry.args;
    if (a[a.indexOf('--enable-web-dashboard') + 1] !== 'false') return t.skip('NOT RUN: the registration does not turn the web dashboard off, so starting it would open a browser');
    const ctxFile = a[a.indexOf('--context') + 1];
    assert.ok(fs.existsSync(ctxFile) && ctxFile.endsWith('serena-context.yml'), `the context file the registration names is there: ${ctxFile}`);
    // fetch.js as the command runs it: the fetch, the first start (serena writes serena_config.yml), then base_modes: []
    const f = await h.fetch(r.report.fetchFile);
    if (f.warnings.some((w) => NETWORK.test(w))) return t.skip(`NOT RUN: no network (${f.warnings[0].slice(0, 160)})`);
    assert.deepStrictEqual(f.warnings, [], f.text);
    const config = path.join(reg.entry.env.SERENA_HOME, 'serena_config.yml');
    assert.ok(/^base_modes: \[\]\r?$/m.test(fs.readFileSync(config, 'utf8')), 'fetch.js set base_modes: [] (only the key is read here, never printed)');

    const got = await session(reg.entry, p, [
        { method: 'tools/list', params: {} },
        { method: 'tools/call', params: { name: 'initial_instructions', arguments: {} } },
    ]);
    if (!got.ok && NETWORK.test(got.why)) return t.skip(`NOT RUN: no network (${got.why.slice(0, 160)})`);
    assert.ok(got.ok, `serena did not answer: ${got.why}`);
    assert.deepStrictEqual(got.results[1].tools.map((x) => x.name).sort(), [...ALLOWED].sort(), 'tools/list is exactly F7\'s six');
    const manual = (got.results[2].content || []).map((c) => c.text || '').join('\n');
    assert.ok(manual.length > 200, `the manual came back (${manual.length} characters)`);
    const named = OTHERS.filter((n) => new RegExp(`\\b${n}\\b`).test(manual));
    assert.deepStrictEqual(named, [], 'the manual names no tool outside the allow-list');
    t.diagnostic(`serena on ${process.platform}: six tools, a manual of ${manual.length} characters naming none of the others`);
    h.claude(p, ['mcp', 'remove', 'serena', '-s', 'local']);
});
