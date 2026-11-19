// One MCP pick's form for Cursor (D5): a keyless OAuth route for both apps is the shared mcp-remote sign-in in the
// family's root, for Claude Code only the http form; a keyed one keeps its helper for Claude Code and gets the bridge
// for Cursor (the list's cursorEntry), unless it sends a header of its own the bridge has no place for. A stdio route
// holding its key in the registration (D6) reaches Cursor at global scope only.
import fs from 'node:fs';
import { pathFor } from '../../entries/platform.ts';
import { subst } from '../../entries/entry.ts';
import { signInParts, signInFormOf } from '../../entries/sign-in.ts';
import { ALFRED_DATA } from '../../core/constants.ts';
import * as roots from '../../roots/roots.ts';
import * as cursorMcp from '../../cursor/cursor-mcp.ts';
import { required } from '../required.ts';
import type { ServerEntry } from '../../core/types.ts';
import type { Catalog } from '../../catalog/types.ts';
import type { PickAnswers, PickBase, PickCursor, Plan, PlanCtx } from '../types.ts';

export function pickCursor(base: PickBase, answers: PickAnswers, built: ServerEntry, context: PlanCtx, catalog: Catalog, out: Plan): PickCursor
{
    const { row, current, routeId, route, scope, name } = base;
    const { params, wantToken } = answers;
    let entry = built;
    let clients = base.clients;
    let form: string | null = null;
    let signInRoot: string | null = null;
    if (routeId === 'remote' && route.keyless === 'oauth' && !wantToken)
    {
        const family = roots.familyOf(scope);
        const root = context.roots && context.roots[family];
        const pathApi = pathFor(context.platform);
        const was = signInParts(entry);
        const httpUrl = row.params && params.host ? subst(route.url, params) : (was ? was.url : entry.url);
        const exists = context.exists || ((filePath) => fs.existsSync(filePath));
        if (clients.includes('cursor') && root && (exists(root) || pathApi.basename(root) === ALFRED_DATA) && roots.gitIgnores(pathApi.join(root, roots.FILES.signIns, roots.SIGN_IN_PROBE)) === false)
        {
            out.notes.push(`${root}: git would commit ${roots.FILES.signIns}/ - ${name} is set up for Claude Code only; /alfred-tools:fix (root-ignore) covers it, then configure adds Cursor`);
            clients = clients.filter((client) => client !== 'cursor');
        }
        if (clients.includes('cursor') && root)
        {
            // a hosted OAuth route has a URL: the catalog's, or the sign-in's as read
            const url = required(httpUrl, `${row.id}: its hosted route has no URL`);
            entry = was
                ? { ...entry, args: (entry.args || []).map((argument) => (argument === was.url ? url : argument)), env: { ...(entry.env || {}), MCP_REMOTE_CONFIG_DIR: root } }
                : signInFormOf(url, root, catalog, context);
            delete entry.url;
            form = 'signin';
            signInRoot = root;
            if (current && !signInParts(current.entry)) out.notes.push(`${name}: sign in once more - the sign-in now lives in ${pathApi.join(root, roots.FILES.signIns)}/ and serves both apps`);
        }
        else
        {
            if (was) entry = { type: 'http', url: httpUrl };
            if (current && signInParts(current.entry)) out.notes.push(`${name}: Claude Code signs in on its own again (/mcp)`);
        }
    }
    else if (routeId === 'remote' && entry.headersHelper && clients.includes('cursor'))
    {
        const other = cursorMcp.otherHeaders(entry);
        if (other.length)
        {
            out.notes.push(`${name}: set up for Claude Code only - its ${other.join(', ')} header${other.length > 1 ? 's have' : ' has'} no bridge equivalent`);
            clients = clients.filter((client) => client !== 'cursor');
        }
        else form = 'two';
    }

    // .cursor/mcp.json may be committed, and project scope is closed to a stdio key already
    if (scope === 'local' && clients.includes('cursor') && cursorMcp.stdioKeyed(entry, row, routeId))
    {
        out.notes.push('Cursor: not written - this route keeps its key in the registration, and .cursor/mcp.json may be committed; pick the hosted route for Cursor');
        clients = clients.filter((client) => client !== 'cursor');
    }
    return { entry, form, clients, signInRoot };
}
