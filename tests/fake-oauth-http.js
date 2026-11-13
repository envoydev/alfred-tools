'use strict';
// A stub OAuth vendor on 127.0.0.1, in the calling process, for the matrix's shared sign-in case (spec M3, D5, F13): the
// protected-resource and authorization-server metadata, dynamic client registration, `/authorize` redirecting back
// with a code, `/token` issuing an access token that lives `ttl` seconds and a refresh token, and an MCP endpoint at
// `/v2/mcp` that answers only with a live token. It counts the hits per path and each grant type; no token value is
// ever printed.
const crypto = require('node:crypto');
const http = require('node:http');
const { catalogWith } = require('./fake-mcp-http.js');

const MCP_PATH = '/v2/mcp';

// -> Promise<{ port, base, hits: { [path]: n }, grants: [grant_type], close }>
function oauthStub({ ttl = 5 } = {})
{
    const hits = {};
    const grants = [];
    const codes = new Set();
    const refresh = new Set();
    const access = new Map(); // token -> expiry (ms)
    let clients = 0;
    let base = '';
    const json = (res, status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };
    const token = () => crypto.randomBytes(16).toString('hex');
    const issue = (res) =>
    {
        const a = token();
        const r = token();
        access.set(a, Date.now() + ttl * 1000);
        refresh.add(r);
        json(res, 200, { access_token: a, token_type: 'Bearer', expires_in: ttl, refresh_token: r });
    };
    const server = http.createServer((req, res) =>
    {
        let body = '';
        req.on('data', (d) => (body += d));
        req.on('end', () =>
        {
            const url = new URL(req.url, base);
            const p = url.pathname;
            const key = p.startsWith('/.well-known/oauth-protected-resource') ? '/.well-known/oauth-protected-resource'
                : p.startsWith('/.well-known/oauth-authorization-server') ? '/.well-known/oauth-authorization-server' : p;
            hits[key] = (hits[key] || 0) + 1;
            if (key === '/.well-known/oauth-protected-resource') return json(res, 200, { resource: `${base}${MCP_PATH}`, authorization_servers: [base], bearer_methods_supported: ['header'] });
            if (key === '/.well-known/oauth-authorization-server') return json(res, 200, {
                issuer: base, authorization_endpoint: `${base}/authorize`, token_endpoint: `${base}/token`, registration_endpoint: `${base}/register`,
                response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
                code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'],
            });
            if (p === '/register' && req.method === 'POST')
            {
                let meta = {};
                try { meta = JSON.parse(body); } catch { /* not JSON */ }
                clients += 1;
                return json(res, 201, { ...meta, client_id: `client-${clients}`, client_id_issued_at: Math.floor(Date.now() / 1000), token_endpoint_auth_method: 'none' });
            }
            if (p === '/authorize')
            {
                const redirect = url.searchParams.get('redirect_uri');
                if (!redirect || url.searchParams.get('response_type') !== 'code' || !url.searchParams.get('code_challenge')) { res.writeHead(400); return res.end(); }
                const code = token();
                codes.add(code);
                const to = new URL(redirect);
                to.searchParams.set('code', code);
                if (url.searchParams.get('state')) to.searchParams.set('state', url.searchParams.get('state'));
                res.writeHead(302, { location: to.toString() });
                return res.end();
            }
            if (p === '/token' && req.method === 'POST')
            {
                const form = new URLSearchParams(body);
                const grant = form.get('grant_type');
                grants.push(grant);
                if (grant === 'authorization_code' && codes.delete(form.get('code'))) return issue(res);
                if (grant === 'refresh_token' && refresh.has(form.get('refresh_token'))) return issue(res);
                return json(res, 400, { error: 'invalid_grant' });
            }
            if (p === MCP_PATH)
            {
                const auth = req.headers.authorization || '';
                const t = auth.startsWith('Bearer ') ? auth.slice(7) : '';
                if (!access.has(t) || access.get(t) < Date.now())
                {
                    res.writeHead(401, { 'www-authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource${MCP_PATH}"` });
                    return res.end();
                }
                if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
                let m = {};
                try { m = JSON.parse(body); } catch { /* not JSON */ }
                if (m.method && m.id === undefined) { res.writeHead(202); return res.end(); }
                let result = {};
                if (m.method === 'initialize') result = { protocolVersion: (m.params && m.params.protocolVersion) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'oauth-probe', version: '0.0.1' } };
                if (m.method === 'tools/list') result = { tools: [{ name: 'probe_tool', description: 'a stub tool', inputSchema: { type: 'object', properties: {} } }] };
                return json(res, 200, { jsonrpc: '2.0', id: m.id, result });
            }
            res.writeHead(404);
            res.end();
        });
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () =>
    {
        const port = server.address().port;
        base = `http://127.0.0.1:${port}`;
        resolve({ port, base, hits, grants, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) });
    }));
}

// The catalog with atlassian's hosted route pointed at the stub: its URL and the fingerprint the inventory matches it by,
// so the shared sign-in form reads back as atlassian's `remote` route
const stubOAuthCatalog = (port) => catalogWith((raw) =>
{
    const remote = raw.tools.find((r) => r.id === 'atlassian').routes.remote;
    remote.url = `http://127.0.0.1:${port}${MCP_PATH}`;
    remote.fingerprints = [{ host: '127.0.0.1', pathPrefix: MCP_PATH }];
});

// A stand-in for macOS's `open`, put first on PATH: mcp-remote opens the sign-in page through the `open` package, which
// runs `open <url>` on macOS (F13). This one fetches the URL and follows the redirects back to mcp-remote's callback, as
// a browser would, and writes each URL's path to `log` - never the query, which carries the code.
const BROWSER_SCRIPT = `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const url = process.argv[process.argv.length - 1];
fetch(url, { redirect: 'follow' })
    .then((r) => { fs.appendFileSync(process.env.PT_BROWSER_LOG, new URL(url).pathname + ' -> ' + r.status + '\\n'); process.exit(0); })
    .catch((e) => { fs.appendFileSync(process.env.PT_BROWSER_LOG, 'failed ' + e.message + '\\n'); process.exit(1); });
`;

module.exports = { oauthStub, stubOAuthCatalog, BROWSER_SCRIPT, MCP_PATH };
