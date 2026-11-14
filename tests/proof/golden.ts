// @ts-nocheck - typed in Task 12
// The golden: every entry the commands run, in fixed worlds over the fake CLI, with its stdout, stderr, exit code and
// every file it leaves, normalised so two runs on one machine compare equal. The base is recorded before the
// restructure moves anything; each later task compares against it (docs/superpowers/specs, Proof 2).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const TREE = path.resolve(import.meta.dirname, '..', '..');
const FLOWS = path.join(import.meta.dirname, 'flows.json');
const FIXTURES = path.join(import.meta.dirname, 'fixtures');

// The files a step can leave, by base name: the registrations, the lists, the settings, the roots map, the account
// file, the ignore files, the key file (names only) and what the copy step puts in a root.
const KEPT = new Set(['.mcp.json', 'mcp.json', 'mcps.json', 'settings.json', 'settings.local.json', 'roots.json', '.claude.json',
    '.gitignore', '.mcps-secrets', 'mcp-headers.js', 'mcp-bridge.js', 'serena-context.yml', 'package.json', 'preferred-tools.json',
    'preferred-tools.json.0.4.bak', 'fetch.json', 'plan.json']);
const SKIP_DIRS = new Set(['bin', 'state', 'node_modules', '.git']);

// Every spelling of a path a script can print: as given, its real path, with forward slashes, and JSON-escaped.
function spellings(p)
{
    const out = new Set([p]);
    try { out.add(fs.realpathSync(p)); } catch { /* not there yet */ }
    for (const s of [...out]) { out.add(s.replace(/\\/g, '/')); out.add(JSON.stringify(s).slice(1, -1)); }
    return [...out].filter(Boolean).sort((a, b) => b.length - a.length);
}

// One machine's text made comparable: a world root and the tree root by token, a tests file's extension, mkdtemp
// suffixes, times, ports, elapsed seconds, age counts and the node binary.
export function normalise(text, { root = null, tree = null, extra = [] } = {})
{
    let out = String(text);
    const tokens = [...extra];
    if (root) tokens.push([root, '<ROOT>']);
    if (tree) tokens.push([tree, '<TREE>']);
    tokens.push([process.execPath, '<NODE>']);
    const pairs = tokens.flatMap(([p, token]) => spellings(p).map((s) => [s, token])).sort((a, b) => b[0].length - a[0].length);
    for (const [s, token] of pairs) out = out.split(s).join(token);
    out = out.replace(/(<TREE>[\\/]+tests[\\/]+(?:[\w-]+[\\/]+)*[\w.-]+)\.(?:js|ts)\b/g, '$1.<EXT>');
    out = out.replace(/((?:preferred-tools|pt)-(?:[a-z0-9]+-)*)[A-Za-z0-9]{6}\b/g, '$1XXXXXX');
    out = out.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, '<TIME>');
    out = out.replace(/127\.0\.0\.1:\d+/g, '127.0.0.1:<PORT>');
    out = out.replace(/\(\d+(?:\.\d+)?s\)/g, '(<N>s)');
    out = out.replace(/\b\d+ days? old\b/g, '<N> days old');
    // a stack's frames name files and lines that every move changes: one token per run of frames
    out = out.replace(/(?:^[ \t]+at .*(?:\r?\n|$))+/gm, '    at <FRAMES>\n');
    return out;
}

// The account file keeps what the scripts write: the servers at user scope and each project's servers.
export function accountView(doc)
{
    const out = {};
    if (doc && doc.mcpServers) out.mcpServers = doc.mcpServers;
    if (doc && doc.projects)
    {
        out.projects = {};
        for (const [k, v] of Object.entries(doc.projects)) if (v && v.mcpServers) out.projects[k] = { mcpServers: v.mcpServers };
    }
    return out;
}

// A file's comparable text: the account file by its view, the key file by its names, the rest as written.
export function fileText(file)
{
    const base = path.basename(file);
    const text = fs.readFileSync(file, 'utf8');
    if (base === '.claude.json') { try { return `${JSON.stringify(accountView(JSON.parse(text)), null, 2)}\n`; } catch { return text; } }
    if (base === '.mcps-secrets') return text.replace(/^(\s*[A-Za-z_][A-Za-z0-9_]*\s*=).*$/gm, '$1<VALUE>');
    return text;
}

// Every kept file below a folder, keyed by its path relative to it, in '/'.
export function collect(dir, norm)
{
    const out = {};
    const walk = (d) =>
    {
        let names = [];
        try { names = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of names)
        {
            const full = path.join(d, e.name);
            if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full); continue; }
            if (!e.isFile() || !KEPT.has(e.name)) continue;
            const key = norm(path.relative(dir, full).split(path.sep).join('/'));
            (out[key] = out[key] || []).push(norm(fileText(full)));
        }
    };
    walk(dir);
    // two temp folders normalise to one name: each file is kept, in the order of its text, never the order the folder
    // lists them in (a random suffix)
    const flat = Object.entries(out).flatMap(([key, texts]) => texts.sort().map((text, i) => [i ? `${key}#${i + 1}` : key, text]));
    return Object.fromEntries(flat.sort(([a], [b]) => a.localeCompare(b)));
}

// The entry file a name runs: scripts/<name>.ts once it exists, else scripts/<name>.js - one harness for every phase.
export const entryPath = (tree, name) => [`${name}.ts`, `${name}.js`].map((f) => path.join(tree, 'scripts', f)).find((f) => fs.existsSync(f))
    || path.join(tree, 'scripts', `${name}.js`);

export function runEntry(tree, name, argv, { cwd, env })
{
    return new Promise((resolve) =>
    {
        const started = process.hrtime.bigint();
        const child = spawn(process.execPath, [entryPath(tree, name), ...argv], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
        const out = [];
        const err = [];
        child.stdout.on('data', (b) => out.push(b));
        child.stderr.on('data', (b) => err.push(b));
        child.on('close', (code, signal) => resolve({
            stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8'),
            code: code === null ? `signal ${signal}` : code, ms: Number(process.hrtime.bigint() - started) / 1e6,
        }));
    });
}

// A registry on 127.0.0.1 that answers every package with two releases dated 2020, so the 7-day age gate decides the
// same on any day and update always has a newer release to offer.
function startRegistry()
{
    const old = '2020-01-01T00:00:00.000Z';
    const server = http.createServer((req, res) =>
    {
        const url = decodeURIComponent(req.url || '');
        const body = url.endsWith('/json')
            ? { releases: { '1.0.0': [{ upload_time_iso_8601: old }], '99.0.0': [{ upload_time_iso_8601: old }] } }
            : { versions: { '1.0.0': {}, '99.0.0': {} }, time: { '1.0.0': old, '99.0.0': old } };
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) })));
}

// tests/helpers.ts, or helpers.js in a tree from before the move, loaded by its file URL.
const helpers = await import(pathToFileURL(path.join(TREE, 'tests', fs.existsSync(path.join(TREE, 'tests', 'helpers.ts')) ? 'helpers.ts' : 'helpers.js')).href);

// The world a flow runs in: tests/helpers.ts's world, its temp folder and plugin data folder, Cursor present.
function makeWorld(registry)
{
    const { world, tempOf } = helpers;
    const w = world('pt-golden-');
    const temp = tempOf(w);
    const data = path.join(w.dir, 'data');
    const tmp = path.join(w.dir, 'tmp');
    for (const d of [data, tmp, path.join(w.home, '.cursor')]) fs.mkdirSync(d, { recursive: true });
    fs.mkdirSync(path.join(w.project, '.git'), { recursive: true });
    const env = { ...temp.env, PREFERRED_TOOLS_NPM_URL: registry.url, PREFERRED_TOOLS_PYPI_URL: `${registry.url}/pypi` };
    return { w, env, data, tmp };
}

// The fixed worlds a flow can start from, built by hand where the flows table says so.
const BUILDERS = {
    // a retired plugin installed in the fake CLI, as tests/fix.test.ts plugWorld does
    retiredPlugin: (ctx) =>
    {
        const { w } = ctx;
        const id = 'claude-hud@claude-hud';
        fs.writeFileSync(path.join(w.dir, 'state', 'plugins.json'), JSON.stringify({ marketplaces: [], installed: [{ id, version: '1.0.0', scope: 'user', enabled: true, installPath: path.join(w.dir, 'cache', id) }] }));
        const settings = path.join(w.account, 'settings.json');
        const doc = fs.existsSync(settings) ? JSON.parse(fs.readFileSync(settings, 'utf8')) : {};
        doc.enabledPlugins = { ...(doc.enabledPlugins || {}), [id]: true };
        fs.writeFileSync(settings, JSON.stringify(doc, null, 2));
    },
    // flow 2's breakage: .mcp.json's servers reversed, the root's helper deleted, sentry's Cursor copy edited by hand
    breakFlow2: (ctx) =>
    {
        const { w } = ctx;
        const mcp = path.join(w.project, '.mcp.json');
        const doc = JSON.parse(fs.readFileSync(mcp, 'utf8'));
        doc.mcpServers = Object.fromEntries(Object.entries(doc.mcpServers).reverse());
        fs.writeFileSync(mcp, `${JSON.stringify(doc, null, 2)}\n`);
        fs.rmSync(path.join(w.project, '.preferred-tools', 'mcp-headers.js'), { force: true });
        const cursor = path.join(w.project, '.cursor', 'mcp.json');
        const cdoc = JSON.parse(fs.readFileSync(cursor, 'utf8'));
        if (cdoc.mcpServers && cdoc.mcpServers.sentry) cdoc.mcpServers.sentry = { ...cdoc.mcpServers.sentry, url: 'https://example.invalid/mcp' };
        fs.writeFileSync(cursor, `${JSON.stringify(cdoc, null, 2)}\n`);
        BUILDERS.retiredPlugin(ctx);
    },
    // a 0.4.x root: installed for Claude Code only, no list (0.4.x wrote none), Cursor holding the user's own memory
    from04: (ctx) =>
    {
        const { w } = ctx;
        fs.rmSync(path.join(w.project, '.preferred-tools', 'mcps.json'), { force: true });
        const cursor = path.join(w.project, '.cursor', 'mcp.json');
        fs.mkdirSync(path.dirname(cursor), { recursive: true });
        fs.writeFileSync(cursor, `${JSON.stringify({ mcpServers: { memory: { command: 'my-memory' } } }, null, 2)}\n`);
        BUILDERS.retiredPlugin(ctx);
    },
    // a workspace: the project is its root with one child, each with alfred-code's record (tests/workspace.test.ts)
    workspace: (ctx) =>
    {
        const { w } = ctx;
        const child = path.join(w.project, 'api');
        const rec = (folder, doc) => { fs.mkdirSync(path.join(folder, '.alfred'), { recursive: true }); fs.writeFileSync(path.join(folder, '.alfred', 'workspace.json'), JSON.stringify(doc)); };
        fs.mkdirSync(path.join(child, '.git'), { recursive: true });
        rec(w.project, { role: 'root', children: ['api'] });
        rec(child, { parent: '..' });
        ctx.cwd = child;
    },
};

// A step's argv with its placeholders filled: <w> the world's tmp folder, <data> its plugin data folder, <root> the
// project root folder, <cursor> the project's Cursor file, <fixture:name> a fixture copied into <w>, <first> the first
// id the step before printed.
function fill(argv, ctx)
{
    return argv.map((a) => a
        .replace(/<fixture:([\w.-]+)>/g, (_, name) => { fs.mkdirSync(ctx.tmp, { recursive: true }); const to = path.join(ctx.tmp, name); fs.copyFileSync(path.join(FIXTURES, name), to); return to; })
        .replace(/<w>/g, ctx.tmp).replace(/<data>/g, ctx.data)
        .replace(/<root>/g, path.join(ctx.w.project, '.preferred-tools'))
        .replace(/<cursor>/g, path.join(ctx.w.project, '.cursor', 'mcp.json'))
        .replace(/<first>/g, ctx.first || 'none')
        .replace(/<missing>/g, path.join(ctx.w.dir, 'no-alfred-code')));
}

// The first id a --questions printed, for a step that applies one id: the first option whose description is an id
// (`mcp:serena~local`, `cursor-pin:sentry~project`).
export function firstId(stdout)
{
    let doc;
    try { doc = JSON.parse(stdout); }
    catch { return 'none'; }
    const ids = [];
    const walk = (v) =>
    {
        if (Array.isArray(v)) return v.forEach(walk);
        if (!v || typeof v !== 'object') return undefined;
        if (typeof v.description === 'string' && /^[a-z-]+:\S+$/.test(v.description)) ids.push(v.description);
        return Object.values(v).forEach(walk);
    };
    walk(doc);
    return ids[0] || 'none';
}

// A flow's steps, with the steps of the flow it runs after first.
const stepsOf = (flow, all) => [...(flow.after ? stepsOf(all.find((f) => f.name === flow.after), all) : []), ...flow.steps];

async function runFlow(flow, tree, all = [flow])
{
    const registry = await startRegistry();
    const ctx = makeWorld(registry);
    ctx.cwd = ctx.w.project;
    const norm = (t) => normalise(t, { root: ctx.w.dir, tree });
    const steps = [];
    try
    {
        for (const step of stepsOf(flow, all))
        {
            if (step.build) { BUILDERS[step.build](ctx); steps.push({ build: step.build, files: collect(ctx.w.dir, norm) }); continue; }
            const argv = fill(step.argv, ctx);
            const r = await runEntry(tree, step.entry, argv, { cwd: ctx.cwd, env: ctx.env });
            if (step.takeFirst) ctx.first = firstId(r.stdout);
            if (step.setTmp && r.code === 0 && r.stdout.trim()) ctx.tmp = r.stdout.trim();
            steps.push({ entry: step.entry, argv: argv.map(norm), code: r.code, stdout: norm(r.stdout), stderr: norm(r.stderr), files: collect(ctx.w.dir, norm) });
        }
    }
    finally
    {
        await registry.close();
        ctx.w.clean();
    }
    return { name: flow.name, steps };
}

// The argument an entry's timing and error runs give it: `--bogus`, except refresh-reserved, whose `--bogus` builds
// the catalog file from the alfred-code checkout beside the tree - a folder that is not there is its error path.
const errorArgv = (name, dir) => (name === 'refresh-reserved' ? ['--alfred', path.join(dir, 'no-alfred-code')] : ['--bogus']);

// The start cost of each entry: five runs of its error path in a world of fakes, the median in milliseconds.
export async function timeEntries(tree, entries, runs = 5)
{
    const out = {};
    const registry = await startRegistry();
    const ctx = makeWorld(registry);
    try
    {
        for (const name of entries)
        {
            const ms = [];
            for (let i = 0; i < runs; i++) ms.push((await runEntry(tree, name, errorArgv(name, ctx.w.dir), { cwd: ctx.w.project, env: ctx.env })).ms);
            ms.sort((a, b) => a - b);
            out[name] = Math.round(ms[Math.floor(runs / 2)] * 10) / 10;
        }
    }
    finally
    {
        await registry.close();
        ctx.w.clean();
    }
    return out;
}

export const readFlows = () => JSON.parse(fs.readFileSync(FLOWS, 'utf8'));

// The golden record of a tree: each flow's steps, and each entry's median start time.
export async function record(tree = TREE)
{
    const { flows, entries } = readFlows();
    const out = { flows: [] };
    for (const flow of flows) out.flows.push(await runFlow(flow, tree, flows));
    out.ms = await timeEntries(tree, entries);
    return out;
}

// Two records compared: every difference, as one line each. An allowed line is the base's text with `from` read as
// `to` in that entry's output only.
export function compare(base, now, allowed = [])
{
    const diffs = [];
    const allow = (entry, text) => allowed.filter((a) => a.entry === entry).reduce((t, a) => t.split(a.from).join(a.to), text);
    const flows = new Map(now.flows.map((f) => [f.name, f]));
    for (const bf of base.flows)
    {
        const nf = flows.get(bf.name);
        if (!nf) { diffs.push(`flow ${bf.name}: missing`); continue; }
        if (nf.steps.length !== bf.steps.length) diffs.push(`flow ${bf.name}: ${bf.steps.length} steps, now ${nf.steps.length}`);
        bf.steps.forEach((bs, i) =>
        {
            const ns = nf.steps[i];
            const at = `flow ${bf.name} step ${i + 1}${bs.entry ? ` (${bs.entry})` : ` (${bs.build})`}`;
            if (!ns) return;
            for (const k of ['code', 'stdout', 'stderr'])
                if (k in bs && String(allow(bs.entry, String(bs[k]))) !== String(ns[k])) diffs.push(`${at}: ${k} differs`);
            const names = new Set([...Object.keys(bs.files || {}), ...Object.keys(ns.files || {})]);
            for (const f of names)
            {
                if (!(f in (ns.files || {}))) diffs.push(`${at}: ${f} gone`);
                else if (!(f in (bs.files || {}))) diffs.push(`${at}: ${f} new`);
                else if (bs.files[f] !== ns.files[f]) diffs.push(`${at}: ${f} differs`);
            }
        });
    }
    return diffs;
}

// Entries over the base's median start time by more than the budget (the spec's 100 ms).
export const slower = (base, now, budgetMs = 100) => Object.keys(base.ms || {}).filter((e) => now.ms && Number.isFinite(now.ms[e]) && now.ms[e] - base.ms[e] > budgetMs);

// A world of fakes with its registry, for a test that runs entries itself; closeWorld stops and removes both.
export async function openWorld()
{
    const registry = await startRegistry();
    return { registry, ctx: makeWorld(registry) };
}
export async function closeWorld({ registry, ctx })
{
    await registry.close();
    ctx.w.clean();
}

