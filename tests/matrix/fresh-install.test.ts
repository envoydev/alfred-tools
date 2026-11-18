// Step 10 check: a fresh install for every catalog row and route, from an answers file, through the REAL claude CLI in
// the throwaway world (tests/harness.ts), then read back from the files the CLI wrote - never from an exit code.
//
//   npm run matrix        (about five minutes: each case is real CLI calls)
//
// A case whose OS the row is not offered on, and a case with no network, is reported as skipped with the reason
// ('NOT RUN'), never as passed.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as cli from '../../scripts/core/claude-cli.ts';
import * as account from '../../scripts/core/account.ts';
import { load } from '../../scripts/catalog/catalog.ts';
import * as keys from '../../scripts/keys/keys.ts';
import type { McpAddStep } from '../../scripts/plan/types.ts';
import { Harness } from '../harness.ts';
import { keepWritten } from '../proof/matrix-keep.ts';
import { entryStrings, localPathsOutside } from './local-paths.ts';
import type { StoredEntry } from './local-paths.ts';
const catalog = load();
const spec = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fresh-answers.json'), 'utf8'));

const skipAll = cli.available() ? false : 'NOT RUN: no claude CLI on PATH';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-fresh-'));
test.after(() => { keepWritten(root, 'fresh-install'); fs.rmSync(root, { recursive: true, force: true }); });

const h = new Harness({ root });
// fake key values, built at run time, in the throwaway global root's .mcps-secrets - the one file 0.2.0 reads a key from
// (spec D3): it serves Global scope and comes second in the Local chain. A local route's key is written into its
// registration at Local and Global scope (D5); the last test searches every other config file for the values.
const FAKE: Record<string, string> = {
    GITHUB_PERSONAL_ACCESS_TOKEN: ['fake', 'github', 'value', 'a1b2c3d4e5f6'].join('-'),
    SENTRY_ACCESS_TOKEN: ['fake', 'sentry', 'value', 'a1b2c3d4e5f6'].join('-'),
    CONTEXT7_API_KEY: ['fake', 'context7', 'value', 'a1b2c3d4e5f6'].join('-'),
};
const globalRoot = path.join(h.home, '.alfred-tools');
fs.mkdirSync(globalRoot, { recursive: true });
fs.writeFileSync(path.join(globalRoot, keys.SECRETS), Object.entries(FAKE).map(([k, v]) => `${k}=${v}\n`).join(''));
// the registrations a key was written into: { scope, name, project }
const writtenIn: { scope: string; name: string; project: string }[] = [];

const NETWORK = /could not resolve|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|network|clone|fetch|timed out|ECONNREFUSED/i;

for (const c of spec.cases)
{
    test(`fresh: ${c.name}`, { skip: skipAll, timeout: 300000 }, (t) =>
    {
        if (!c.os.includes(process.platform)) return t.skip(`NOT RUN: ${c.row} is offered on ${c.os.join(', ')}, this is ${process.platform}`);
        const project = h.project(c.name.replace(/[^A-Za-z0-9]+/g, '-'));
        const answers = { ...c.answers, machine: spec.machine };
        const r = h.run(project, answers);
        assert.deepStrictEqual(r.plan.errors, [], r.rendered);
        if (r.report.failed && c.network && NETWORK.test(r.report.failed.detail)) return t.skip(`NOT RUN: no network for ${c.name} (${r.report.failed.detail.slice(0, 120)})`);
        assert.strictEqual(r.report.failed, null, r.text);

        const inv = h.inventory(project);
        if (c.expect.kind === 'mcp')
        {
            const step = r.plan.steps.find((s): s is McpAddStep => s.op === 'mcp-add')!;
            const got = inv.registrations.find((x) => x.rowId === c.row && x.scope === c.expect.scope && x.route === c.expect.route);
            assert.ok(got, `${c.row}: no ${c.expect.route}-route registration at ${c.expect.scope} scope read back\n${r.text}`);
            assert.strictEqual(got.name, step.name);
            // a local route's key, written in by the apply from .mcps-secrets (D5); a hosted route's entry holds none
            const route = catalog.byId.get(c.row)!.routes[step.route!]!;
            const want = step.key ? keys.fillKeys(step.entry, catalog.byId.get(c.row), step.route!, step.scope, { [route.tokenVar!]: FAKE[step.key.name]! }) : step.entry;
            if (step.key) writtenIn.push({ scope: step.scope, name: step.name, project });
            assert.deepStrictEqual(got.entry, want, 'what the CLI stored is what the plan built, with the key written in');
            // read from the file that scope lives in, not from the inventory alone
            const stored = c.expect.scope === 'project'
                ? JSON.parse(fs.readFileSync(path.join(project, '.mcp.json'), 'utf8')).mcpServers
                : (c.expect.scope === 'user' ? account.readAccount(h.env, project).user : account.readAccount(h.env, project).local);
            assert.deepStrictEqual(stored[step.name], want);
            if (c.expect.files)
            {
                // the data folder, in the project root on every platform since 0.3.0 - serena's Windows home included
                // (absolute and in backslashes there, serena-windows-home)
                assert.strictEqual(fs.readFileSync(path.join(project, c.expect.files, '.gitignore'), 'utf8'), '*\n', 'the data folder keeps itself out of git');
            }
            if (c.expect.scope === 'project')
            {
                // 'Absolute, always' (AGENTS.md, 2026-11-11): a data folder is named by an absolute path, which must lie under
                // the project's root folder, written as the project path or as its real path (a /var or /tmp symlink); a route
                // with no data folder holds no absolute local path at all. Every string of the entry - command, url,
                // headersHelper, each arg, each env and header value - is checked either way: an embedded `--cfg=/path` too.
                const dataRoots = [...new Set([path.join(project, '.alfred-tools'), path.join(fs.realpathSync(project), '.alfred-tools')])];
                const entry = stored[step.name] as StoredEntry;
                const underDataRoot = (value: string) => dataRoots.some((dataRoot) => path.relative(dataRoot, path.resolve(value)).split(path.sep)[0] !== '..' && !path.isAbsolute(path.relative(dataRoot, path.resolve(value))));
                const absolutes = [...(entry.args || []), ...Object.values(entry.env || {})].filter((value) => path.isAbsolute(value) && !/^\/[a-z]$/i.test(value));
                for (const value of absolutes) assert.ok(underDataRoot(value), `${value} lies outside ${dataRoots.join(' and ')}`);
                for (const text of entryStrings(entry)) assert.deepStrictEqual(localPathsOutside(text, dataRoots), [], `${c.row}: '${text}' names a local path outside the data folder`);
                if (c.expect.files) assert.ok(absolutes.length > 0, `${c.row}: its data folder is named by an absolute path`);
                else if (!absolutes.length) assert.ok(!/(?:^|[^$])\/(?:Users|home)\//.test(JSON.stringify(stored)), 'the committed file holds no absolute local path');
            }
        }
        else assert.fail(`${c.row}: the catalog lists only MCP servers since 0.5.0, not a ${c.expect.kind}`);
    });
}

test('no config file holds a key value outside a local route written in at Local or Global scope, and the real account is untouched', { skip: skipAll }, () =>
{
    const accountFile = path.join(h.account, '.claude.json');
    const files = [accountFile, path.join(h.account, 'settings.json')];
    for (const f of h.files()) if (/(^|[\\/])\.mcp\.json$|[\\/]\.claude[\\/]settings(\.local)?\.json$/.test(f)) files.push(f);
    let scanned = 0;
    for (const f of files)
    {
        if (!fs.existsSync(f)) continue;
        scanned++;
        let text = fs.readFileSync(f, 'utf8');
        if (f === accountFile)
        {
            // the registrations a key was written into, as D5 says, are taken out; nothing else may hold a value
            const doc = JSON.parse(text);
            for (const w of writtenIn)
            {
                const servers = w.scope === 'user' ? doc.mcpServers : account.projectEntry(doc.projects, w.project)!.mcpServers;
                assert.ok(Object.values(FAKE).some((v) => JSON.stringify(servers[w.name]).includes(v)), `${w.name} (${w.scope}) holds its key`);
                delete servers[w.name];
            }
            text = JSON.stringify(doc);
        }
        for (const [name, value] of Object.entries(FAKE)) assert.ok(!text.includes(value), `${name}'s value is in ${f}`);
    }
    assert.ok(scanned >= 3, `${scanned} files scanned`);
    const real = h.realUntouched();
    assert.ok(real.ok, `the real account changed: ${real.changed.join(', ')}`);
});
