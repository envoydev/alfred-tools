// One sign-in for both apps (spec D5, ruling 12): the mcp-remote form with its sign-in kept in the family's root.
import type { ServerEntry } from '../core/types.ts';
import type { Catalog } from '../catalog/types.ts';
import type { SignInParts } from './types.ts';

// ---- one sign-in for both apps (spec D5, ruling 12) ----------------------------------------------------------------

// A hosted route picked with no key, for Claude Code and Cursor: mcp-remote with its sign-in kept in the family's root
// (MCP_REMOTE_CONFIG_DIR), so both apps share one OAuth sign-in. The pin and cut-off are the catalog's mcp-remote, the
// bridge route's package. Windows launches npx through cmd /c, as every npx entry.
export function signInFormOf(url: string, root: string, catalog: Catalog, context: { platform?: string | undefined } | null | undefined): ServerEntry
{
    const packageSpec = catalog.byId.get('sentry')!.routes.bridge!.package!;
    const args = ['-y', `${packageSpec.name}@${packageSpec.version}`, url];
    const launch = context && context.platform === 'win32' ? { command: 'cmd', args: ['/c', 'npx', ...args] } : { command: 'npx', args };
    return { type: 'stdio', ...launch, env: { npm_config_before: packageSpec.cutoff, MCP_REMOTE_CONFIG_DIR: root } };
}

// The shared sign-in form's parts: npx (through cmd /c too) running mcp-remote@<v> on an http(s) URL, with
// MCP_REMOTE_CONFIG_DIR set. A hand-made mcp-remote entry without that folder is not the plugin's. -> { url, dir, pin } | null
export function signInParts(entry: ServerEntry | null | undefined): SignInParts | null
{
    if (!entry || typeof entry !== 'object' || typeof entry.command !== 'string' || !Array.isArray(entry.args)) return null;
    let cmd = entry.command;
    let args = entry.args.map(String);
    if (/^cmd(\.exe)?$/i.test(cmd) && /^\/c$/i.test(args[0] || '')) { cmd = args[1] || ''; args = args.slice(2); }
    if (cmd.replace(/\\/g, '/').split('/').pop()!.replace(/\.(cmd|exe)$/i, '').toLowerCase() !== 'npx') return null;
    const at = args.findIndex((argument) => /^mcp-remote@\S+$/.test(argument));
    if (at < 0) return null;
    const url = args.slice(at + 1).find((argument) => !argument.startsWith('-'));
    let parsedUrl: URL;
    try { parsedUrl = new URL(url!); } catch { return null; }
    if (!/^https?:$/.test(parsedUrl.protocol)) return null;
    const dir = entry.env && entry.env['MCP_REMOTE_CONFIG_DIR'];
    return typeof dir === 'string' && dir ? { url: url!, dir, pin: args[at]! } : null;
}

