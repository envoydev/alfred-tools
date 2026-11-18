// Which servers a Cursor offer moves onto the shared mcp-remote sign-in (ruling 12), and the line that says so. Pure.
import * as roots from '../roots/roots.ts';
import { pathFor } from '../entries/platform.ts';
import { signInParts } from '../entries/sign-in.ts';
import type { Catalog } from '../catalog/types.ts';
import type { ListServer } from '../mcps-list/types.ts';
import type { OAuthLine } from '../plan/types.ts';
import type { SignInMove } from './types.ts';

// The servers the plan would move: a remote route that has OAuth, no key now, not yet in the shared sign-in form
// (scripts/plan/pick.ts moves exactly these when Cursor is added). -> names
export function signInNames(servers: ListServer[], catalog: Catalog): string[]
{
    const moving = servers.filter((server) =>
    {
        const row = server.row ? catalog.byId.get(server.row) : undefined;
        const route = row && server.route ? row.routes[server.route] : undefined;
        return Boolean(route) && server.route === 'remote' && route!.keyless === 'oauth' && !server.key && !signInParts(server.entry);
    });
    return [...new Set(moving.map((server) => server.name))];
}

// The built plan's sign-in lines for the names the offer announced: the servers it really put on the shared sign-in
// (one left for Claude Code only, because git would commit the folder, is not among them). `signedIn` starts false;
// a sign-in done in this run sets it.
export function signInMoves(oauth: OAuthLine[], names: string[], os: string): SignInMove[]
{
    const pathApi = pathFor(os);
    return oauth
        .filter((line) => line.signin && line.root && names.includes(line.name))
        .map((line) => ({ name: line.name, scope: line.scope, folder: pathApi.join(line.root!, roots.FILES.signIns), signedIn: false }));
}

export const signInLine = (move: SignInMove): string => `${move.name}: now the shared sign-in in ${move.folder}/ (Cursor added) - sign-in ${move.signedIn ? 'done' : 'not done yet'}`;
