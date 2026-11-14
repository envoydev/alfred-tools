// BUILDING A REGISTRATION ENTRY - the pure part of the plan. A fresh add builds from the catalog row; a change to an
// installed row edits the entry as read (see plan.js), using the helpers here for the pieces it touches.
// Nothing here reads a machine: the OS, the arch, the home and the project come in through `ctx`.
import path from 'node:path';
import * as keys from '../keys/keys.ts';
import { templateNames } from '../copied/mcp-bridge.js';
import { pathFor, pythonRequest } from './platform.ts';
import { rootOfEntry, rootOf, applyRoot } from './locations.ts';
import { signInParts } from './sign-in.ts';
import type { ServerEntry } from '../core/types.ts';
import type { CatalogRoute, CatalogRow, CatalogRules } from '../catalog/types.ts';
import type { BridgeParts, BuildAnswers, Current, HelperParts, Machine, Registration } from './types.ts';

// The installed registration's own answers, read back from the entry.
export function currentOf(row: CatalogRow, registration: Registration): Current
{
    const entry = registration.entry;
    const flag = (flagName: string) => { const i = (entry.args || []).indexOf(flagName); return i >= 0 ? entry.args![i + 1] : undefined; };
    const bridge = bridgeParts(entry);
    if (bridge)
    {
        // each catalog URL name, by position, to the name the template holds
        const route = Object.values(row.routes).find((candidate) => candidate.runtime === 'bridge');
        const held = templateNames(bridge.template) || [];
        const urlNames = Object.fromEntries(((route && route.urlVars) || []).map((urlVar, i) => [urlVar.var, held[i] ? held[i]!.name : urlVar.var]));
        return { name: registration.name, scope: registration.scope, route: registration.route, entry: entry, rootStr: null, executablePath: undefined, token: true, keyName: bridge.keyName, urlNames, host: null };
    }
    return {
        name: registration.name, scope: registration.scope, route: registration.route, entry: entry,
        rootStr: row.locations ? rootOfEntry(row, entry) : null,
        executablePath: flag('--executable-path'),
        token: Boolean(entry.headersHelper || (entry.headers && entry.headers['Authorization']) || (entry.args || []).includes('--api-key')),
        keyName: helperNameOf(entry.headersHelper),
        // the shared sign-in form (D5) holds its URL as an argument
        host: entry.url ? new URL(entry.url).hostname : signInParts(entry) ? new URL(signInParts(entry)!.url).hostname : null,
    };
}

// ---- the entry ------------------------------------------------------------------------------------------------------

export function subst(text: unknown, values: Record<string, string>): string
{
    return String(text).replace(/\{(\w+)\}/g, (match: string, placeholder: string) => (placeholder in values ? values[placeholder]! : match));
}

// ---- the server's settings (spec D9) ---------------------------------------------------------------------------------

// appium's SDK homes: resolved on this machine (appium-sdk-env), never a setting
export const APPIUM_SDK_ENV = ['ANDROID_HOME', 'JAVA_HOME'];

// The settings a stdio route's env holds, as [[NAME, value]]: the registration's env when there is one, else the
// catalog's; the values install resolves (a data folder, an SDK home, the npm cut-off) and the key are not settings.
export function settingsOf(row: CatalogRow, routeId: string, entry: ServerEntry | null = null): [string, string][]
{
    const route = row.routes[routeId]!;
    if (route.runtime === 'bridge') return [];
    const derived = new Set(((row.locations && row.locations.derived) || []).filter((derivedLocation) => derivedLocation.in === 'env').map((derivedLocation) => derivedLocation.key));
    const env = (entry ? entry.env : route.env) || {};
    return Object.entries(env).filter(([variableName]) => variableName !== route.tokenVar && !derived.has(variableName) && !APPIUM_SDK_ENV.includes(variableName) && variableName !== 'npm_config_before' && !keys.credentialName(variableName));
}

// `pairs` merged into the entry's env; a Docker route also passes each new name into the container (`-e NAME` before
// the image).
export function mergeSettings(entry: ServerEntry, route: CatalogRoute, pairs: Record<string, string>): ServerEntry
{
    const out = JSON.parse(JSON.stringify(entry)) as ServerEntry;
    out.env = { ...(out.env || {}), ...pairs };
    if (out.command === 'docker' && Array.isArray(out.args) && route.image)
    {
        const at = out.args.findIndex((argument) => typeof argument === 'string' && argument.startsWith(`${route.image!.name}:`));
        const passed = new Set(out.args.filter((_argument, i) => out.args![i - 1] === '-e'));
        const add = Object.keys(pairs).filter((variableName) => !passed.has(variableName)).flatMap((variableName) => ['-e', variableName]);
        if (at >= 0 && add.length) out.args.splice(at, 0, ...add);
    }
    return out;
}

// ---- the header helper (spec D4) ------------------------------------------------------------------------------------

// One path in a `headersHelper` command, written so the shell that runs it passes it to node whole (Review Focus 1).
// `style`: 'posix' - single quotes, a quote inside as '\\'' ; 'win32' - forward slashes, which node takes and cmd,
// PowerShell and Git Bash all pass as they are, in double quotes when needed; 'portable' - the committed file's relative
// path, read by any OS's shell, in double quotes when needed. Letters, digits and _ . / : @ + , = - need no quotes.
const PLAIN_ARG = /^[A-Za-z0-9_./:@+,=-]+$/;
export function shellArg(text: string, style: string): string
{
    const normalized = style === 'win32' ? text.replace(/\\/g, '/') : text;
    if (PLAIN_ARG.test(normalized)) return normalized;
    return style === 'posix' ? `'${normalized.replace(/'/g, "'\\''")}'` : `"${normalized}"`;
}

// The registration's `headersHelper`: `node <path> <NAME> <SCHEME> [<global root>]`, each path quoted for `style` (see
// shellArg). The command line names the helper and a variable name, never the key file or a value.
export function helperCommand({ helperPath, name, scheme, globalRoot = null, style = 'portable' }: { helperPath: string; name: string; scheme: string; globalRoot?: string | null | undefined; style?: string }): string
{
    return ['node', shellArg(helperPath, style), name, scheme, ...(globalRoot ? [shellArg(globalRoot, style)] : [])].join(' ');
}

// A `headersHelper` command split as its shell reads it: quoted text kept as it is, '\\'' joined into one argument, and a
// backslash outside quotes kept unless a quote follows it (a Windows path written by hand). -> [string]
export function helperArgv(command: unknown): string[]
{
    const out: string[] = [];
    let current: string | null = null;
    const text = String(command);
    for (let i = 0; i < text.length; i++)
    {
        const character = text[i]!;
        if (character === "'" || character === '"')
        {
            const end = text.indexOf(character, i + 1);
            const stop = end < 0 ? text.length : end;
            current = (current || '') + text.slice(i + 1, stop);
            i = stop;
        }
        else if (character === '\\' && (text[i + 1] === "'" || text[i + 1] === '"')) { current = (current || '') + text[i + 1]; i++; }
        else if (/\s/.test(character)) { if (current !== null) out.push(current); current = null; }
        else current = (current || '') + character;
    }
    if (current !== null) out.push(current);
    return out;
}

// The helper file a `headersHelper` command names, and the arguments after it -> { path, args } | null
export function helperParts(command: unknown): HelperParts | null
{
    if (typeof command !== 'string') return null;
    const argv = helperArgv(command);
    const at = argv.findIndex((argument) => /mcp-headers\.js$/.test(argument));
    return at < 0 ? null : { path: argv[at]!, args: argv.slice(at + 1) };
}

// Where a registration at `scope` finds the helper: absolute at every scope, in the root of the scope's family (F7).
export function helperPathFor(scope: string, context: Machine): string
{
    return pathFor(context.platform).join(rootOf(scope === 'user' ? 'global' : 'project', context), 'mcp-headers.js');
}

// The helper's third argument: the global root, at local scope only and only when it is a named folder - the helper reads
// ~/.preferred-tools and ~/.alfred itself.
export const helperGlobalRoot = (scope: string, context: Machine): string | null | undefined => (scope === 'local' && context.roots && context.roots.globalNamed ? context.roots.global : null);

// The key name a `headersHelper` passes, or null: the helper's arguments as this plugin writes them, `<NAME> <SCHEME>`.
export function helperNameOf(command: unknown): string | null
{
    const helper = helperParts(command);
    return helper && helper.args.length >= 2 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(helper.args[0]!) && /^[A-Za-z][\w-]*$/.test(helper.args[1]!) ? helper.args[0]! : null;
}

// The helper command a hosted keyed route gets at `scope`: the key's name (`keyName`, else the catalog's default) and
// the route's scheme.
export const helperFor = (route: CatalogRoute, scope: string, context: Machine, keyName: string | null | undefined = null): string => helperCommand({ helperPath: helperPathFor(scope, context), name: keyName || route.helper!.var, scheme: route.helper!.scheme, globalRoot: helperGlobalRoot(scope, context), style: context.platform === 'win32' ? 'win32' : 'posix' });

// ---- the bridge (0.4.0) --------------------------------------------------------------------------------------------

// Where a bridge registration at `scope` finds mcp-bridge.js: beside the helper, absolute at every scope.
export function bridgePathFor(scope: string, context: Machine): string
{
    return pathFor(context.platform).join(rootOf(scope === 'user' ? 'global' : 'project', context), 'mcp-bridge.js');
}

// serena's context file (D7): in the scope's family root, absolute at every scope.
export function contextPathFor(scope: string, context: Machine): string
{
    return pathFor(context.platform).join(rootOf(scope === 'user' ? 'global' : 'project', context), 'serena-context.yml');
}

// The --context an entry runs with points at this plugin's file (any root) - the path form D7 writes, not a name such as
// claude-code. -> its index in args, or -1
export function contextArgAt(entry: ServerEntry | null | undefined): number
{
    const args = (entry && Array.isArray(entry.args)) ? entry.args : [];
    const i = args.indexOf('--context');
    return i >= 0 && i + 1 < args.length && /(^|[\\/])serena-context\.yml$/.test(String(args[i + 1])) ? i + 1 : -1;
}

// The entry with its context file following the scope's root (a root change, a scope move). A named context is fix's to
// change (serena-context), so it is left.
export function applyContext(entry: ServerEntry, scope: string, context: Machine): ServerEntry
{
    const at = contextArgAt(entry);
    if (at < 0) return entry;
    const args = [...entry.args!];
    args[at] = contextPathFor(scope, context);
    return { ...entry, args };
}

// A bridge registration's parts, read from its launch: `node <path>/mcp-bridge.js <template> <KEY> <SCHEME> <pkg> [<root>]`.
// -> { path, template, keyName, scheme, pkg, globalRoot } | null
export function bridgeParts(entry: ServerEntry | null | undefined): BridgeParts | null
{
    if (!entry || typeof entry !== 'object' || typeof entry.command !== 'string' || !Array.isArray(entry.args)) return null;
    if (path.basename(entry.command.replace(/\\/g, '/')).replace(/\.exe$/i, '').toLowerCase() !== 'node') return null;
    const args = entry.args.map(String);
    const at = args.findIndex((argument) => argument.replace(/\\/g, '/').split('/').pop() === 'mcp-bridge.js');
    if (at < 0 || !args[at + 1]) return null;
    const [template, keyName = null, scheme = null, packageSpec = null, globalRoot = null] = args.slice(at + 1);
    return { path: args[at]!, template: template!, keyName, scheme, packageSpec: packageSpec, globalRoot };
}

// A template with each catalog name replaced by the user's: { SENTRY_ORG: 'SENTRY_SLUG' } turns {SENTRY_ORG} into
// {SENTRY_SLUG}, and keeps an optional segment's `?`.
export const renameTemplate = (template: string, names: Record<string, string>): string => template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)(\?)?\}/g, (_match: string, name: string, optional: string | undefined) => `{${names[name] || name}${optional || ''}}`);

// A fresh entry from the catalog. `a` = { rootStr, scope, executablePath, token, keyName, params }. A hosted route that
// sends a key gets `headersHelper` and no `headers`: the key stays in .mcps-secrets (spec D4).
export function buildEntry(row: CatalogRow, routeId: string, answers: BuildAnswers, context: Machine, rules: CatalogRules): ServerEntry
{
    const route = row.routes[routeId]!;
    if (routeId === 'remote')
    {
        const entry: ServerEntry = { type: route.type, url: subst(route.url, answers.params || {}) };
        const useKey = route.helper && (route.authMode === 'token' || (route.authMode === 'optional-token' && answers.token));
        if (useKey) entry.headersHelper = helperFor(route, answers.scope, context, answers.keyName);
        return entry;
    }
    if (route.runtime === 'bridge')
    {
        // no shell reads this command line: a path with a space is one argument as it is
        const packageSpec = route.package!;
        const globalRoot = helperGlobalRoot(answers.scope, context);
        return {
            command: 'node',
            args: [bridgePathFor(answers.scope, context), renameTemplate(route.url!, answers.urlNames || {}), answers.keyName || route.helper!.var, route.helper!.scheme, `${packageSpec.name}@${packageSpec.version}`, ...(globalRoot ? [globalRoot] : [])],
            env: { npm_config_before: packageSpec.cutoff },
        };
    }

    let entry!: ServerEntry;
    const extra: string[] = [];
    for (const [key, spec] of Object.entries(route.optionalArgs || {}))
    {
        if (key === 'executablePath' && answers.executablePath) extra.push(...spec!.map((argTemplate) => subst(argTemplate, { value: answers.executablePath! })));
        if (key === 'token' && answers.token) extra.push(...spec!);
    }
    if (route.runtime === 'uvx')
    {
        const packageSpec = route.package!;
        const args = ['--python', pythonRequest(route, context, rules), '--exclude-newer', packageSpec.cutoff];
        for (const withPackage of route.with || []) args.push('--with', withPackage);
        const run = route.run!.some((runArgument) => runArgument.includes('{contextFile}')) ? route.run!.map((runArgument) => subst(runArgument, { contextFile: contextPathFor(answers.scope, context) })) : route.run!;
        args.push('--from', subst(packageSpec.fromSpec, { version: packageSpec.version }), ...run, ...extra);
        entry = { command: 'uvx', args };
        if (Object.keys(route.env || {}).length) entry.env = { ...route.env };
    }
    else if (route.runtime === 'npx')
    {
        const packageSpec = route.package!;
        const args = ['-y', `${packageSpec.name}@${packageSpec.version}`, ...route.run!, ...extra];
        entry = context.platform === 'win32' && rules.windowsNpxCmd ? { command: 'cmd', args: ['/c', 'npx', ...args] } : { command: 'npx', args };
        entry.env = { ...(route.env || {}), npm_config_before: packageSpec.cutoff };
    }
    else if (route.runtime === 'docker')
    {
        const useBinary = context.machine && context.machine.docker === false && route.fallback;
        if (useBinary) entry = { command: route.fallback!.command, args: [...route.fallback!.args] };
        else
        {
            const passEnv = Object.keys(route.env || {}).flatMap((variableName) => ['-e', variableName]);
            entry = { command: 'docker', args: ['run', '-i', '--rm', ...passEnv, `${route.image!.name}:${route.image!.tag}`, ...route.run!] };
        }
        if (Object.keys(route.env || {}).length) entry.env = { ...route.env };
    }
    if (row.locations && answers.rootStr !== undefined) entry = applyRoot(entry, row, answers.rootStr!, answers.scope, context);
    return entry;
}

