// Matching a registration to a catalog row by what it launches: the package in its args, or the URL host and path.
import path from 'node:path';
import { bridgeParts } from '../entries/entry.ts';
import { signInParts } from '../entries/sign-in.ts';
import type { ServerEntry } from '../core/types.ts';
import type { Catalog, Fingerprint } from '../catalog/types.ts';
import type { CatalogMatch, InvRegistration } from './types.ts';

// `cmd /c npx ...` and `cmd.exe /d /s /c npx ...` are the Windows spelling of `npx ...`: look through the wrapper.
export function launchTokens(entry: ServerEntry): { command: string; args: string[] }
{
    const command = String(entry.command || '');
    let args = Array.isArray(entry.args) ? entry.args.map(String) : [];
    if (/^cmd(\.exe)?$/i.test(path.basename(command)))
    {
        const at = args.findIndex((argument) => /^\/c$/i.test(argument));
        if (at >= 0) return { command: args[at + 1] || '', args: args.slice(at + 2) };
    }
    return { command, args };
}

// 'serena-agent@2.1.0', 'mcp-memory-service[sqlite]==12.1.1', '@playwright/mcp@0.0.83', 'ghcr.io/x/y:v2' -> the bare name.
export function bareName(token: string): string
{
    const lead = token.startsWith('@') ? '@' : '';
    const body = lead ? token.slice(1) : token;
    const cut = body.search(/[@=\[<>~!:]/);
    return lead + (cut >= 0 ? body.slice(0, cut) : body);
}

const flagValue = (args: string[], flag: string): string | undefined =>
{
    for (const [i, argument] of args.entries())
    {
        if (argument === flag) return args[i + 1];
        if (argument.startsWith(`${flag}=`)) return argument.slice(flag.length + 1);
    }
    return undefined;
};

export function matchesFingerprint(entry: ServerEntry, fingerprint: Fingerprint): boolean
{
    // a bridge (0.4.0): `node <root>/mcp-bridge.js <template> ...`, matched by the file's exact name and the template's host
    // and path - never by the URL branch below, which would take every hosted URL for a fingerprint with no host
    const bridge = bridgeParts(entry);
    if (fingerprint.bridge) return bridge !== null && bridge.template.replace(/^https?:\/\//i, '').toLowerCase().startsWith(fingerprint.bridge);
    if (bridge) return false;
    const byUrl = (url: unknown) =>
    {
        if (fingerprint.pkg || fingerprint.command) return false;
        let parsedUrl: URL;
        try { parsedUrl = new URL(String(url)); } catch { return false; }
        if (fingerprint.host && parsedUrl.hostname.toLowerCase() !== fingerprint.host) return false;
        return parsedUrl.pathname.startsWith(fingerprint.pathPrefix || '/');
    };
    // the shared sign-in form (0.5.0, D5): mcp-remote with MCP_REMOTE_CONFIG_DIR, matched by its URL as an http entry, so
    // it is the row's remote route; a hand-made mcp-remote entry has no parts and matches no row below
    const signIn = signInParts(entry);
    if (signIn) return byUrl(signIn.url);
    if (entry.url || entry.type === 'http' || entry.type === 'sse') return byUrl(entry.url);
    const { command, args } = launchTokens(entry);
    if (fingerprint.command) return path.basename(command).replace(/\.(exe|cmd)$/i, '') === fingerprint.command;
    if (!fingerprint.pkg) return false;
    // the first argument that names the package; a flag value like --from <spec> is such an argument
    const named = args.filter((argument) => !argument.startsWith('-')).some((argument) => bareName(argument) === fingerprint.pkg);
    if (!named) return false;
    return fingerprint.flag ? flagValue(args, fingerprint.flag) === fingerprint.value : true;
}

// The first catalog fingerprint a launch matches, with its row and route, in the catalog's order; null for the user's own.
export function catalogMatch(entry: ServerEntry | null | undefined, catalog: Catalog): CatalogMatch | null
{
    if (!entry || typeof entry !== 'object') return null;
    for (const row of catalog.tools)
    {
        if (row.kind !== 'mcp') continue;
        for (const [route, routeDefinition] of Object.entries(row.routes))
        {
            const fingerprint = routeDefinition.fingerprints.find((candidate) => matchesFingerprint(entry, candidate));
            if (fingerprint) return { rowId: row.id, route, fingerprint };
        }
    }
    return null;
}

// ---- what a registration launches -------------------------------------------------------------------------------

// The executable a registration launches, looking through a `cmd /c` wrapper.
export const launcher = (entry: ServerEntry): string => path.basename(launchTokens(entry).command).replace(/\.(exe|cmd)$/i, '');
export const launchArgs = (entry: ServerEntry): string[] => launchTokens(entry).args;

// The version a launch pins for a package: '@playwright/mcp@0.0.83' -> '0.0.83', '--from serena-agent@2.1.0' -> '2.1.0',
// 'mcp-memory-service[sqlite]==12.1.1' -> '12.1.1'. null when the launch names the package with no version.
export function pinnedVersion(entry: ServerEntry, packageSpec: string): string | null
{
    for (const argument of launchArgs(entry).filter((token) => !token.startsWith('-')))
    {
        if (bareName(argument) !== packageSpec) continue;
        const [, version] = /(?:==|@)([^@=\s]+)$/.exec(argument.slice(packageSpec.length)) ?? [];
        return version ?? null;
    }
    return null;
}

// A registration this plugin manages: not the user's own, not an alfred-code leftover, not one left on its own (spec D6).
export const isManaged = (registration: InvRegistration): boolean => !registration.own && !registration.alfredRetired && registration.choice !== 'own';
