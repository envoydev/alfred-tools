// The stdio key launcher's parts: `node <path>/mcp-bridge.js --run <ENV>=<KEY_NAME>[?] [<global root>] -- <command> <args>...`.
// Pure; the run mode itself is scripts/copied/mcp-bridge.js, which a root runs outside the plugin.
import path from 'node:path';
import { FILES } from '../core/constants.ts';
import { RUN, RUN_PAIR } from './constants.ts';
import type { ServerEntry } from '../core/types.ts';
import type { LauncherParts } from './types.ts';

const isNode = (command: string): boolean => path.basename(command.replace(/\\/g, '/')).replace(/\.exe$/i, '').toLowerCase() === 'node';
const isBridgePath = (argument: string): boolean => argument.replace(/\\/g, '/').split('/').pop() === FILES.bridge;

// -> the launcher's parts, or null for an entry that is not one (a URL bridge, a plain launch, a malformed run line).
export function launcherParts(entry: ServerEntry | null | undefined): LauncherParts | null
{
    if (!entry || typeof entry !== 'object' || typeof entry.command !== 'string' || !Array.isArray(entry.args) || !isNode(entry.command)) return null;
    const args = entry.args.map(String);
    const at = args.findIndex(isBridgePath);
    const bridgePath = args[at];
    if (at < 0 || bridgePath === undefined || args[at + 1] !== RUN.flag) return null;
    const pair = RUN_PAIR.exec(args[at + 2] ?? '');
    const [, envVar, keyName, optional] = pair ?? [];
    if (envVar === undefined || keyName === undefined) return null;
    const end = args.indexOf(RUN.end, at + 3);
    if (end < 0 || end > at + 4) return null;
    const command = args[end + 1];
    if (command === undefined) return null;
    const globalRoot = end === at + 4 ? (args[at + 3] ?? null) : null;
    const inner: ServerEntry = { command, args: args.slice(end + 2), ...(entry.env ? { env: entry.env } : {}) };
    return { path: bridgePath, envVar, keyName, optional: optional === RUN.optional, globalRoot, inner };
}

// What the entry launches: a launcher's inner launch, any other entry as it is.
export const launchOf = (entry: ServerEntry): ServerEntry => launcherParts(entry)?.inner ?? entry;

// A launcher's args for a new bridge path, pair and global root: the args before the bridge path and everything after
// `--` are kept as read.
export function relaunchedArgs(args: readonly string[], parts: Pick<LauncherParts, 'envVar' | 'keyName' | 'optional' | 'globalRoot'> & { path: string }): string[]
{
    const at = args.findIndex(isBridgePath);
    const end = args.indexOf(RUN.end, at + 1);
    return [
        ...args.slice(0, at), parts.path, RUN.flag, `${parts.envVar}=${parts.keyName}${parts.optional ? RUN.optional : ''}`,
        ...(parts.globalRoot ? [parts.globalRoot] : []), RUN.end, ...args.slice(end + 1),
    ];
}

// The entry with a new launch: a launcher keeps its slots before `--` and takes the command and args after it; any other
// entry takes them as its own.
export function withLaunch(entry: ServerEntry, inner: ServerEntry): ServerEntry
{
    if (!launcherParts(entry)) return { ...entry, command: inner.command, args: inner.args };
    const args = entry.args ?? [];
    return { ...entry, args: [...args.slice(0, args.indexOf(RUN.end, args.findIndex(isBridgePath)) + 1), String(inner.command), ...(inner.args ?? [])] };
}

// A launcher's inner command and args with the entry's env; any other entry as it is.
export const unlaunched = (entry: ServerEntry): ServerEntry => launchOf(entry);
