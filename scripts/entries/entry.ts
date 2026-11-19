// BUILDING A REGISTRATION ENTRY - the pure part of the plan. A fresh add builds from the catalog row; a change to an
// installed row edits the entry as read (see plan.ts), using the helpers here for the pieces it touches.
// Nothing here reads a machine: the OS, the arch, the home and the project come in through `ctx`.
import path from 'node:path';
import * as keys from '../keys/keys.ts';
import { templateNames } from '../copied/mcp-bridge.js';
import { parsePairs } from '../copied/mcp-headers.js';
import { pathFor, pythonRequest } from './platform.ts';
import { alfredSerenaHome, applyRoot, familyOf, rootOf, rootOfEntry } from './locations.ts';
import { FILES } from '../core/constants.ts';
import { API_KEY_FLAG, BRIDGE_SLOT, EXECUTABLE_PATH_FLAG } from './constants.ts';
import { signInParts } from './sign-in.ts';
import { withExclude } from './exclude.ts';
import { routeField, routeNamed } from '../catalog/rows.ts';
import type { ServerEntry } from '../core/types.ts';
import type { CatalogRoute, CatalogRow, CatalogRules } from '../catalog/types.ts';
import type { BridgeParts, BuildAnswers, Current, HelperParts, Machine, Registration } from './types.ts';

// The installed registration's own answers, read back from the entry.
export function currentOf(row: CatalogRow, registration: Registration): Current
{
    const entry = registration.entry;
    const args = entry.args || [];
    const flag = (flagName: string) => { const i = args.indexOf(flagName); return i >= 0 ? args[i + 1] : undefined; };
    const bridge = bridgeParts(entry);
    if (bridge)
    {
        // each catalog URL name, by position, to the name the template holds
        const route = Object.values(row.routes).find((candidate) => candidate.runtime === 'bridge');
        const held = templateNames(bridge.template) || [];
        const urlNames = Object.fromEntries(((route && route.urlVars) || []).map((urlVar, i) => [urlVar.var, held[i]?.name ?? urlVar.var]));
        return { name: registration.name, scope: registration.scope, route: registration.route, entry: entry, rootStr: null, executablePath: undefined, token: true, keyName: bridge.keyName, urlNames, host: null };
    }
    const route = registration.route ? row.routes[registration.route] : undefined;
    // the shared sign-in form (D5) holds its URL as an argument
    const signIn = entry.url ? null : signInParts(entry);
    return {
        name: registration.name, scope: registration.scope, route: registration.route, entry: entry,
        rootStr: row.locations ? rootOfEntry(row, entry) : null,
        executablePath: flag(EXECUTABLE_PATH_FLAG),
        token: Boolean(entry.headersHelper || (entry.headers && entry.headers['Authorization']) || args.includes(API_KEY_FLAG) || (route?.authMode === 'optional-token' && keys.tokenFields(entry, route).length > 0)),
        keyName: helperNameOf(entry.headersHelper),
        host: entry.url ? new URL(entry.url).hostname : signIn ? new URL(signIn.url).hostname : null,
    };
}

// ---- the entry ------------------------------------------------------------------------------------------------------

export function subst(text: unknown, values: Record<string, string | undefined>): string
{
    return String(text).replace(/\{(\w+)\}/g, (match: string, placeholder: string) => (placeholder in values ? String(values[placeholder]) : match));
}

// ---- the server's settings (spec D9) ---------------------------------------------------------------------------------

// appium's SDK homes: resolved on this machine (appium-sdk-env), never a setting
const APPIUM_SDK_ENV = ['ANDROID_HOME', 'JAVA_HOME'];

// The settings a stdio route's env holds, as [[NAME, value]]: the registration's env when there is one, else the
// catalog's; the values install resolves (a data folder, an SDK home, the npm cut-off) and the key are not settings.
export function settingsOf(row: CatalogRow, routeId: string, entry: ServerEntry | null = null): [string, string][]
{
    const route = routeNamed(row, routeId);
    if (route.runtime === 'bridge') return [];
    const derived = new Set(((row.locations && row.locations.derived) || []).filter((derivedLocation) => derivedLocation.in === 'env').map((derivedLocation) => derivedLocation.key));
    const env = (entry ? entry.env : route.env) || {};
    return Object.entries(env).filter(([variableName]) => variableName !== route.tokenVar && !derived.has(variableName) && !APPIUM_SDK_ENV.includes(variableName) && variableName !== 'npm_config_before' && !keys.credentialName(variableName));
}

// `pairs` merged into the entry's env; a Docker route also passes each new name into the container (`-e NAME` before
// the image).
export function mergeSettings(entry: ServerEntry, route: CatalogRoute, pairs: Record<string, string>): ServerEntry
{
    const out = structuredClone(entry);
    out.env = { ...(out.env || {}), ...pairs };
    const args = out.args;
    const image = route.image;
    if (out.command === 'docker' && Array.isArray(args) && image)
    {
        const at = args.findIndex((argument) => typeof argument === 'string' && argument.startsWith(`${image.name}:`));
        const passed = new Set(args.filter((_argument, i) => args[i - 1] === '-e'));
        const add = Object.keys(pairs).filter((variableName) => !passed.has(variableName)).flatMap((variableName) => ['-e', variableName]);
        if (at >= 0 && add.length) args.splice(at, 0, ...add);
    }
    return out;
}

// ---- the header helper (spec D4) ------------------------------------------------------------------------------------

// One path in a `headersHelper` command, written so the shell that runs it passes it to node whole.
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

// The registration's `headersHelper`: `node <path> <NAME> <SCHEME> [<global root>] [--header <pair>]...`, each path quoted
// for `style` (see shellArg). A pair is `<HEADER>=<VAR>` (the header's value is VAR's, read from .mcps-secrets at each
// connect) or `<HEADER>:<value>` (fixed). The command line names the helper, variable names and fixed settings, never the
// key file or a key value.
export function helperCommand({ helperPath, name, scheme, globalRoot = null, style = 'portable', pairs = [] }: { helperPath: string; name: string; scheme: string; globalRoot?: string | null | undefined; style?: string; pairs?: string[] }): string
{
    return ['node', shellArg(helperPath, style), name, scheme, ...(globalRoot ? [shellArg(globalRoot, style)] : []), ...pairs.flatMap((pair) => ['--header', shellArg(pair, style)])].join(' ');
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
        const character = text.charAt(i);
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

// A `--header` pair back to the text it was written as: NAME=VAR or NAME:value.
const pairText = (pair: { header: string; var: string } | { header: string; value: string }): string => ('var' in pair ? `${pair.header}=${pair.var}` : `${pair.header}:${pair.value}`);

// The helper file a `headersHelper` command names, the arguments after it, and those read as the helper reads them: the
// global root (the third argument, only when it is not `--header`) and the `--header` pairs, each as its text.
// -> { path, args, root, pairs } | null
export function helperParts(command: unknown): HelperParts | null
{
    if (typeof command !== 'string') return null;
    const argv = helperArgv(command);
    const at = argv.findIndex((argument) => argument.endsWith(FILES.helper));
    const helperPath = argv[at];
    if (at < 0 || helperPath === undefined) return null;
    const args = argv.slice(at + 1);
    const parsed = parsePairs(args.slice(2));
    const read = 'error' in parsed ? { root: args[2] !== undefined && args[2] !== '--header' ? args[2] : null, pairs: [] } : { root: parsed.root, pairs: parsed.pairs.map(pairText) };
    return { path: helperPath, args, ...read };
}

// Where a registration at `scope` finds the helper: absolute at every scope, in the root of the scope's family (F7).
function helperPathFor(scope: string, context: Machine): string
{
    return pathFor(context.platform).join(rootOf(familyOf(scope), context), FILES.helper);
}

// The helper's third argument: the global root, at local scope only and only when it is a named folder - the helper reads
// ~/.alfred-tools and ~/.alfred itself.
export const helperGlobalRoot = (scope: string, context: Machine): string | null | undefined => (scope === 'local' && context.roots && context.roots.globalNamed ? context.roots.global : null);

// The key name a `headersHelper` passes, or null: the helper's arguments as this plugin writes them, `<NAME> <SCHEME>`.
export function helperNameOf(command: unknown): string | null
{
    const [name, scheme] = helperParts(command)?.args ?? [];
    return name !== undefined && scheme !== undefined && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && /^[A-Za-z][\w-]*$/.test(scheme) ? name : null;
}

// A `--header` pair's text split at its first separator, as the helper's parser does: `NAME=VAR` is a name read from
// .mcps-secrets, `NAME:value` a fixed value.
export function splitPair(text: string): { header: string; kind: 'name' | 'fixed'; rest: string } | null
{
    const at = text.search(/[=:]/);
    return at < 1 ? null : { header: text.slice(0, at), kind: text[at] === '=' ? 'name' : 'fixed', rest: text.slice(at + 1) };
}

// The pairs a hosted route's helper command carries. A fresh command takes each of the route's `helper.headers` as
// `<header>=<var>`, then each setting as `<header>:<value>`, in the order the catalog lists them. A command being
// rewritten (`asRead`: its pairs as read) keeps its `=` pairs and every `:` pair the route does not list as a setting
// exactly as they were, in that order, and only its settings are replaced.
function helperPairs(route: CatalogRoute, settings: Record<string, string> = {}, asRead: string[] | null = null): string[]
{
    const order = (route.settings || []).map((setting) => setting.header);
    const rank = (header: string) => { const i = order.indexOf(header); return i < 0 ? order.length : i; };
    const fixed = Object.entries(settings).sort(([first], [second]) => rank(first) - rank(second)).map(([header, value]) => `${header}:${value}`);
    if (asRead === null) return [...((route.helper && route.helper.headers) || []).map((header) => `${header.header}=${header.var}`), ...fixed];
    const kept = asRead.flatMap((pair) => { const parts = splitPair(pair); return parts !== null && (parts.kind === 'name' || !order.includes(parts.header)) ? [{ pair, kind: parts.kind }] : []; });
    return [...kept.filter((held) => held.kind === 'name').map((held) => held.pair), ...kept.filter((held) => held.kind === 'fixed').map((held) => held.pair), ...fixed];
}

// The helper command a hosted keyed route gets at `scope`: the key's name (`keyName`, else the catalog's default), the
// route's scheme, its header pairs and the `settings` the user chose. `asRead`: the pairs of the registration being
// rewritten, which a change starts from.
export function helperFor(route: CatalogRoute, scope: string, context: Machine, keyName: string | null | undefined = null, settings: Record<string, string> = {}, asRead: string[] | null = null): string
{
    const helper = route.helper;
    if (!helper) throw new Error('a route with no helper block gets no helper command');
    return helperCommand({ helperPath: helperPathFor(scope, context), name: keyName || helper.var, scheme: helper.scheme, globalRoot: helperGlobalRoot(scope, context), style: context.platform === 'win32' ? 'win32' : 'posix', pairs: helperPairs(route, settings, asRead) });
}

// ---- the bridge (0.4.0) --------------------------------------------------------------------------------------------

// Where a bridge registration at `scope` finds mcp-bridge.js: beside the helper, absolute at every scope.
export function bridgePathFor(scope: string, context: Machine): string
{
    return pathFor(context.platform).join(rootOf(familyOf(scope), context), FILES.bridge);
}

// serena's context file (D7): in the entry's SERENA_HOME when serena's own settings there are the plugin's to keep (an
// editable home), else in the scope's family root; absolute at every scope. With no entry it is the root's.
function contextPathFor(scope: string, context: Machine, entry: ServerEntry | null | undefined = null): string
{
    const pathApi = pathFor(context.platform);
    const home = entry && entry.env && entry.env.SERENA_HOME;
    if (home && !alfredSerenaHome(home)) return pathApi.join(home, FILES.serenaContext);
    return pathApi.join(rootOf(familyOf(scope), context), FILES.serenaContext);
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
    if (at < 0 || !entry.args) return entry;
    const args = [...entry.args];
    args[at] = contextPathFor(scope, context, entry);
    return { ...entry, args };
}

// A bridge registration's parts, read from its launch: `node <path>/mcp-bridge.js <template> <KEY> <SCHEME> <pkg> [<root>] [--header <pair>]...`, the root
// and the pairs read as the bridge reads them. -> { path, template, keyName, scheme, packageSpec, globalRoot, pairs } | null
export function bridgeParts(entry: ServerEntry | null | undefined): BridgeParts | null
{
    if (!entry || typeof entry !== 'object' || typeof entry.command !== 'string' || !Array.isArray(entry.args)) return null;
    if (path.basename(entry.command.replace(/\\/g, '/')).replace(/\.exe$/i, '').toLowerCase() !== 'node') return null;
    const args = entry.args.map(String);
    const at = args.findIndex((argument) => argument.replace(/\\/g, '/').split('/').pop() === FILES.bridge);
    const bridgePath = args[at];
    const template = args[at + 1];
    if (at < 0 || bridgePath === undefined || !template) return null;
    const [keyName = null, scheme = null, packageSpec = null, ...after] = args.slice(at + 2);
    const parsed = parsePairs(after);
    const read = 'error' in parsed ? { root: after[0] !== undefined && after[0] !== '--header' ? after[0] : null, pairs: [] } : { root: parsed.root, pairs: parsed.pairs.map(pairText) };
    return { path: bridgePath, template, keyName, scheme, packageSpec: packageSpec, globalRoot: read.root, pairs: read.pairs };
}

// A bridge launch at `at` in `args` rewritten for a new path, template, key name and global root: the scheme, the pin
// and what follows the root slot are kept as read.
export function rebridgedArgs(args: readonly string[], at: number, parts: { path: string; template: string; keyName: string; globalRoot: string | null | undefined }): string[]
{
    return [
        ...args.slice(0, at), parts.path, parts.template, parts.keyName,
        ...args.slice(at + BRIDGE_SLOT.scheme, at + BRIDGE_SLOT.globalRoot), ...(parts.globalRoot ? [parts.globalRoot] : []),
        ...args.slice(at + BRIDGE_SLOT.globalRoot + 1),
    ];
}

// Arguments without their `--header <pair>` couples.
export function withoutPairs(args: readonly string[]): string[]
{
    const out: string[] = [];
    let pairNext = false;
    for (const argument of args)
    {
        if (pairNext) pairNext = false;
        else if (argument === '--header') pairNext = true;
        else out.push(argument);
    }
    return out;
}

// A template with each catalog name replaced by the user's: { SENTRY_ORG: 'SENTRY_SLUG' } turns {SENTRY_ORG} into
// {SENTRY_SLUG}, and keeps an optional segment's `?`.
export const renameTemplate = (template: string, names: Record<string, string>): string => template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)(\?)?\}/g, (_match: string, name: string, optional: string | undefined) => `{${names[name] || name}${optional || ''}}`);

// A fresh entry from the catalog. `answers` = { rootStr, scope, executablePath, token, keyName, params }. A hosted route that
// sends a key gets `headersHelper` and no `headers`: the key stays in .mcps-secrets (spec D4).
export function buildEntry(row: CatalogRow, routeId: string, answers: BuildAnswers, context: Machine, rules: CatalogRules): ServerEntry
{
    const route = routeNamed(row, routeId);
    if (routeId === 'remote')
    {
        const entry: ServerEntry = { type: route.type, url: subst(route.url, answers.params || {}) };
        const useKey = route.helper && (route.authMode === 'token' || (route.authMode === 'optional-token' && answers.token));
        if (useKey) entry.headersHelper = helperFor(route, answers.scope, context, answers.keyName, answers.settings);
        return entry;
    }
    if (route.runtime === 'bridge')
    {
        // no shell reads this command line: a path with a space is one argument as it is
        const packageSpec = routeField(route.package, row.id, 'package');
        const helper = routeField(route.helper, row.id, 'helper');
        const globalRoot = helperGlobalRoot(answers.scope, context);
        return {
            command: 'node',
            args: [bridgePathFor(answers.scope, context), renameTemplate(routeField(route.url, row.id, 'url'), answers.urlNames || {}), answers.keyName || helper.var, helper.scheme, `${packageSpec.name}@${packageSpec.version}`, ...(globalRoot ? [globalRoot] : [])],
            env: { npm_config_before: packageSpec.cutoff },
        };
    }

    let entry: ServerEntry | undefined;
    const extra: string[] = [];
    const executablePath = answers.executablePath;
    for (const [key, spec] of Object.entries(route.optionalArgs || {}))
    {
        if (!spec) continue;
        if (key === 'executablePath' && executablePath) extra.push(...spec.map((argTemplate) => subst(argTemplate, { value: executablePath })));
    }
    if (route.runtime === 'uvx')
    {
        const packageSpec = routeField(route.package, row.id, 'package');
        const args = ['--python', pythonRequest(route, context, rules), '--exclude-newer', packageSpec.cutoff];
        for (const withPackage of route.with || []) args.push('--with', withPackage);
        const runArgs = routeField(route.run, row.id, 'run');
        const hasContext = runArgs.some((runArgument) => runArgument.includes('{contextFile}'));
        const run = hasContext ? runArgs.map((runArgument) => subst(runArgument, { contextFile: contextPathFor(answers.scope, context) })) : runArgs;
        args.push('--from', subst(packageSpec.fromSpec, { version: packageSpec.version }), ...run, ...extra);
        entry = { command: 'uvx', args };
        if (Object.keys(route.env || {}).length) entry.env = { ...route.env };
    }
    else if (route.runtime === 'npx')
    {
        const packageSpec = routeField(route.package, row.id, 'package');
        const args = ['-y', `${packageSpec.name}@${packageSpec.version}`, ...routeField(route.run, row.id, 'run'), ...extra];
        entry = context.platform === 'win32' && rules.windowsNpxCmd ? { command: 'cmd', args: ['/c', 'npx', ...args] } : { command: 'npx', args };
        entry.env = { ...(route.env || {}), npm_config_before: packageSpec.cutoff };
    }
    else if (route.runtime === 'docker')
    {
        const binary = context.machine && context.machine.docker === false ? route.fallback : undefined;
        if (binary) entry = { command: binary.command, args: [...binary.args] };
        else
        {
            const passEnv = Object.keys(route.env || {}).flatMap((variableName) => ['-e', variableName]);
            const image = routeField(route.image, row.id, 'image');
            entry = { command: 'docker', args: ['run', '-i', '--rm', ...passEnv, `${image.name}:${image.tag}`, ...routeField(route.run, row.id, 'run')] };
        }
        if (Object.keys(route.env || {}).length) entry.env = { ...route.env };
    }
    if (!entry) throw new Error(`${row.id}: no registration form for the '${String(route.runtime)}' runtime`);
    // an optional key goes in the server's environment, never on its command line, where every process listing shows it (D1)
    if (answers.token && route.optionalEnv && route.optionalEnv.token) entry.env = { ...(entry.env || {}), ...route.optionalEnv.token };
    if (answers.exclude) entry = withExclude(entry, route, true, answers.scope, context);
    if (row.locations && answers.rootStr !== undefined) entry = applyRoot(entry, row, answers.rootStr, answers.scope, context);
    // serena's home is set by now: its context file goes in it
    return applyContext(entry, answers.scope, context);
}

