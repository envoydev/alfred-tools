// Names: whether a registration name is usable at its scope.
import { bridgeParts } from './entry.ts';
import type { ServerEntry } from '../core/types.ts';
import type { Catalog } from '../catalog/types.ts';
import type { FetchStep } from './types.ts';

// ---- names ----------------------------------------------------------------------------------------------------------

// null when the name is usable, else the reason. `taken` = the registrations at the target scope, as inventory reads them.
export function nameProblem(name: string, { catalog, taken = [], self = null }: { catalog: Catalog; taken?: { name: string; scope: string }[]; self?: { name: string; scope: string } | null }): string | null
{
    if (!new RegExp(catalog.rules.nameRe).test(name)) return `'${name}' must match ${catalog.rules.nameRe}`;
    if (catalog.reserved.has(name)) return `'${name}' is a name alfred-code once registered and may retire`;
    const other = taken.find((r) => r.name === name && !(self && r.name === self.name && r.scope === self.scope));
    if (other) return `'${name}' already belongs to another registration at ${other.scope} scope`;
    return null;
}

// The first start of a package route downloads the package, and Claude Code gives a server 30 s to answer: measured on
// 2.1.311, `claude mcp get` reports appium-mcp's first npx install and memory's first uvx one as 'connection timed out
// after 30000ms', and the first session start meets the same limit. So a written registration is followed by a fetch of
// exactly what it launches - same pin, same cut-off, from its env - into the runtime's cache. -> a plan step, or null for a
// launch with nothing to fetch (a hosted URL, a binary) or, given the entry it replaces, one that fetches the same thing.
const UVX_VALUE = new Set(['--python', '-p', '--exclude-newer', '--from', '--with', '--with-requirements', '--with-editable', '--index', '--index-url', '--extra-index-url']);
export function fetchStep(name: string, entry: ServerEntry | null | undefined, rowId?: string | null | undefined, old?: ServerEntry | null): FetchStep | null
{
    const step = fetchOf(name, entry, rowId);
    const was = old ? fetchOf(name, old, rowId) : null;
    if (step && was && JSON.stringify([step.argv, step.env]) === JSON.stringify([was.argv, was.env])) return null;
    return step;
}

function fetchOf(name: string, entry: ServerEntry | null | undefined, rowId: string | null | undefined): FetchStep | null
{
    if (!entry || !entry.command) return null;
    const bridge = bridgeParts(entry);
    if (bridge)
    {
        if (!bridge.pkg) return null;
        const npm = ['npm', 'exec', '--yes', '--package', bridge.pkg, '--', 'node', '-e', '0'];
        const argv = /^[A-Za-z]:/.test(bridge.path) ? ['cmd', '/c', ...npm] : npm;
        return { op: 'fetch', name, row: rowId, what: bridge.pkg, argv, env: entry.env || {}, why: `${rowId || name}: fetch ${bridge.pkg} so the first start answers in time` };
    }
    let cmd: string | undefined = entry.command;
    let args = (entry.args || []).slice();
    const viaCmd = /^cmd(\.exe)?$/i.test(cmd) && /^\/c$/i.test(args[0] || '');
    if (viaCmd) { cmd = args[1]; args = args.slice(2); }
    let argv: string[];
    let what: string | undefined;
    if (/^npx(\.cmd)?$/i.test(cmd || ''))
    {
        what = args.find((a) => !a.startsWith('-'));
        if (!what) return null;
        // `-e 0`, not `-e ''`: on Windows the fetch goes through cmd.exe, where an empty argument is dropped
        argv = ['npm', 'exec', '--yes', '--package', what, '--', 'node', '-e', '0'];
    }
    else if (/^uvx(\.exe)?$/i.test(cmd || ''))
    {
        // the options up to the tool's own command, then its --help: uv builds the environment and runs nothing else
        const out: string[] = [];
        for (let i = 0; i < args.length; i++)
        {
            if (args[i]!.startsWith('-')) { out.push(args[i]!); if (UVX_VALUE.has(args[i]!)) out.push(args[++i]!); continue; }
            out.push(args[i]!, '--help');
            break;
        }
        what = out[out.indexOf('--from') + 1] || out[out.length - 2];
        argv = ['uvx', ...out];
    }
    else if (/^docker(\.exe)?$/i.test(cmd || ''))
    {
        what = args.find((a) => /^[a-z0-9.-]+(\/[a-z0-9._-]+)+:[\w.-]+$/.test(a));
        if (!what) return null;
        argv = ['docker', 'pull', what];
    }
    else return null;
    if (viaCmd) argv = [entry.command, '/c', ...argv];
    return { op: 'fetch', name, row: rowId, what: what!, argv, env: entry.env || {}, why: `${rowId || name}: fetch ${what} so the first start answers in time` };
}

