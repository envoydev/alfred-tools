// A stub HTTP MCP server on 127.0.0.1, in the calling process: it answers initialize and tools/list, and records per
// request the path, the JSON-RPC method and whether the `Authorization` header equals the expected value - never the
// value itself. Used by tests/probes/headers-helper.ts and the matrix's key cases (keys.test.js, workspace.test.js W4).
import fs from 'node:fs';
import http from 'node:http';
import { execFile } from 'node:child_process';
import * as account from '../scripts/core/account.ts';
import * as catalogLib from '../scripts/catalog/catalog.ts';
import type { Env } from '../scripts/core/types.ts';
import type { Catalog, CatalogRow } from '../scripts/catalog/types.ts';

// one request the stub saw
export interface Seen
{
    path: string | undefined;
    rpc: string | null;
    auth: 'none' | 'expected' | 'other';
}
export interface Stub
{
    server: http.Server;
    port: number;
    seen: Seen[];
    close: () => Promise<void>;
}
// the part of a JSON-RPC message the stub reads
interface RpcMessage
{
    method?: string;
    id?: unknown;
    params?: { protocolVersion?: string };
}

// -> Promise<{ server, port, seen: [{ path, rpc, auth: 'none' | 'expected' | 'other' }], close }>. `expected`: the whole
// header value a request must carry to count as 'expected'. `status`: 401 answers every POST with 401 and
// `WWW-Authenticate: Bearer` (a key the server refused), 403 with 403 (gitlab's answer to a legacy token), any other
// status with that status.
export function stub({ expected, status = null }: { expected: string | undefined; status?: number | null }): Promise<Stub>
{
    const seen: Seen[] = [];
    const server = http.createServer((req, res) =>
    {
        let body = '';
        req.on('data', (d) => (body += d));
        req.on('end', (): void | http.ServerResponse =>
        {
            let m: RpcMessage = {};
            try { m = JSON.parse(body); }
            catch { /* not JSON */ }
            const a = req.headers.authorization;
            seen.push({ path: req.url, rpc: m.method || null, auth: a === undefined ? 'none' : a === expected ? 'expected' : 'other' });
            if (req.method !== 'POST') { res.writeHead(404); return res.end(); }
            if (status) { res.writeHead(status, status === 401 ? { 'www-authenticate': 'Bearer' } : {}); return res.end(); }
            if (m.method && m.id === undefined) { res.writeHead(202); return res.end(); }
            let result: Record<string, unknown> = {};
            if (m.method === 'initialize') result = { protocolVersion: (m.params && m.params.protocolVersion) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'probe', version: '0.0.1' } };
            if (m.method === 'tools/list') result = { tools: [] };
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }));
        });
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as { port: number }).port, seen, close: () => new Promise<void>((r) => server.close(r as () => void)) })));
}

// `claude` without blocking this process, so the stub can answer while it runs -> Promise<{ status, out }>
export function claude(cwd: string, argv: string[], env: Env, timeout = 90000): Promise<{ status: number; out: string }>
{
    return new Promise((resolve) =>
    {
        execFile('claude', argv, { cwd, env, encoding: 'utf8', timeout }, (err, stdout, stderr) =>
            resolve({ status: err ? (typeof err.code === 'number' ? err.code : 1) : 0, out: `${stdout || ''}${stderr || ''}` }));
    });
}

// What the stub saw on the last initialize of one `claude mcp get <name>` in `cwd` - the connection the server keeps:
// 'expected', 'other', 'none' or 'no request'. The first get in a fresh world was seen to connect twice, first without
// the helper's header and then with it, the second followed by tools/list (2.1.322, 2026-11-10); `inits` lists each.
export async function authOnGet(s: Stub, cwd: string, name: string, env: Env)
{
    const s0 = s.seen.length;
    const res = await claude(cwd, ['mcp', 'get', name], env);
    const inits = s.seen.slice(s0).filter((x) => x.rpc === 'initialize').map((x) => x.auth);
    return { auth: inits.length ? inits[inits.length - 1] : 'no request', inits, status: (res.out.split('\n').find((l) => /Status:/.test(l)) || '').trim(), exit: res.status };
}

// A copy of the catalog, `edit` applied to its raw rows
export function catalogWith(edit: (raw: Catalog) => void): Catalog
{
    const c = catalogLib.load();
    const raw = JSON.parse(JSON.stringify({ ...c, reserved: [...c.reserved], byId: undefined }));
    edit(raw);
    return { ...raw, reserved: new Set(raw.reserved), byId: new Map(raw.tools.map((r: CatalogRow) => [r.id, r])) };
}

// The catalog with github's hosted route pointed at a stub: its URL and the fingerprint the inventory matches it by
export const stubCatalog = (port: number) => catalogWith((raw) =>
{
    const remote = raw.tools.find((r) => r.id === 'github')!.routes.remote!;
    remote.url = `http://127.0.0.1:${port}/mcp/`;
    remote.fingerprints = [{ host: '127.0.0.1', pathPrefix: '/mcp' }];
});

// The catalog with sentry's bridge route pointed at a stub (0.4.0): its URL template - http on 127.0.0.1, which
// mcp-bridge.js and mcp-remote take - and the fingerprint the inventory matches it by
export const stubBridgeCatalog = (port: number) => catalogWith((raw) =>
{
    const bridge = raw.tools.find((r) => r.id === 'sentry')!.routes.bridge!;
    bridge.url = `http://127.0.0.1:${port}/mcp/{SENTRY_ORG}/{SENTRY_PROJECT?}`;
    bridge.fingerprints = [{ bridge: `127.0.0.1:${port}/mcp/` }];
});

// A folder's trust, as the trust dialog writes it in the account file of a harness world (tests/harness.ts), under the
// key Claude Code reads: on Windows the folder with `/` (account.js projectEntry) - a `\` key leaves the folder untrusted,
// so a project-scope headersHelper never runs (measured, Windows 11 ARM64, 2.1.309, 2026-11-12)
export function trust(h: { env: NodeJS.ProcessEnv }, dir: string, on = true)
{
    const file = account.accountFile(h.env);
    const doc = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    doc.projects = doc.projects || {};
    const key = process.platform === 'win32' ? dir.replace(/\\/g, '/') : dir;
    doc.projects[key] = { ...(doc.projects[key] || {}), hasTrustDialogAccepted: on };
    fs.writeFileSync(file, JSON.stringify(doc, null, 2));
}

// The user fills a name the apply wrote (`NAME=`), or adds it
export function fill(file: string, name: string, value: string)
{
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const re = new RegExp(`^${name}=.*$`, 'm');
    fs.writeFileSync(file, re.test(text) ? text.replace(re, () => `${name}=${value}`) : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${name}=${value}\n`);
}

