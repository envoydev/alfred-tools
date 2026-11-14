// The registration fixes: each finds a known problem in an installed registration and edits that entry AS READ (its pin,
// its cut-off and the args or env the user added stay). The edit is applied by `claude mcp remove` + `add-json` through
// apply.js's mcp-replace, with a rollback; this file never writes.
//
// A finding the machine cannot act on carries `blocked` (the reason), is shown, and is never applied.
import path from 'node:path';
import { pythonRequest, isWindowsArm, pathFor } from '../entries/platform.ts';
import { validWindowsSerenaHome, serenaWindowsHome, serenaSpaceFree } from '../entries/locations.ts';
import * as keys from '../keys/keys.ts';
import * as roots from '../roots/roots.ts';
import * as C from './common.ts';
import { windowsMcpServers, fromHere } from '../inventory/inventory.ts';
import * as cursorMcp from '../cursor/cursor-mcp.ts';
import type { Env, ServerEntry } from '../core/types.ts';
import type { CatalogRoute } from '../catalog/types.ts';
import type { Root } from '../entries/types.ts';
import type { InvRegistration, WindowsMcp } from '../inventory/types.ts';
import type { Finding, FixCtx, MachineProbe } from './types.ts';

const eachReg = (context: FixCtx, id: string, toFinding: (registration: InvRegistration, route: CatalogRoute) => Finding | null): Finding[] => C.registrationsOf(context, id).map((registration) => toFinding(registration, C.routeOf(context, registration)!)).filter(Boolean) as Finding[];

// ---- serena-windows-home --------------------------------------------------------------------------------------------
// SERENA_HOME absolute, in backslashes and space-free. A value that is only wrong in its slashes keeps its folder (so the
// ~327MB of language servers serena already fetched are found again); a value with a space needs another folder.
function windowsHomeOf(value: string, context: FixCtx): string
{
    const expanded = value.replace(/\$\{(?:HOME|USERPROFILE)\}/g, context.home);
    return path.win32.resolve(context.inventory.project, expanded).replace(/\\+$/, '');
}

export function serenaWindowsHomeDetect(context: FixCtx): Finding[]
{
    if (context.platform !== 'win32') return [];
    return eachReg(context, 'serena-windows-home', (registration) =>
    {
        const value = (registration.entry.env || {}).SERENA_HOME;
        // none set (a registration made by hand): serena's default home is <profile>\.serena, cut at a space in the
        // profile path like any other; the space-free folder install offers takes its place
        if (value === undefined) return unsetSerenaHome(registration, context);
        if (typeof value !== 'string' || validWindowsSerenaHome(value)) return null;
        // a ${VAR} form in this folder's .mcp.json is 0.2.0's: project-relative-path writes it out absolute
        if (registration.scope === 'project' && value.includes('${')) return null;
        const faults = [!path.win32.isAbsolute(value) && 'not absolute', value.includes('/') && 'forward slashes', /\s/.test(value) && 'a space'].filter(Boolean);
        const what = `SERENA_HOME is '${value}' (${faults.join(', ')})`;
        const same = windowsHomeOf(value, context);
        if (validWindowsSerenaHome(same)) return C.finding('serena-windows-home', registration, what, { proposal: { SERENA_HOME: same }, note: `same folder, written absolute with backslashes: ${same}` });
        const fresh = serenaWindowsHome({ home: context.home });
        if (fresh.root) return C.finding('serena-windows-home', registration, what, { proposal: { SERENA_HOME: (fresh.root as Extract<Root, { kind: 'abs' }>).path }, note: `a new home, ${(fresh.root as Extract<Root, { kind: 'abs' }>).path} - serena's data in '${value}' is not moved and its language servers download again (~327MB)` });
        if (registration.scope === 'project') return C.finding('serena-windows-home', registration, what, { blocked: SPACED_PROJECT });
        return C.finding('serena-windows-home', registration, what, { input: { id: 'serenaHome', prompt: fresh.needsInput } });
    });
}

// serena's home in this folder's .mcp.json when no space-free folder is in reach (F7)
const SPACED_PROJECT = "serena's home on Windows must be space-free - pick a space-free folder with /preferred-tools:configure, Location";

function unsetSerenaHome(registration: InvRegistration, context: FixCtx): Finding | null
{
    const profile = context.home || '';
    if (!/\s/.test(profile)) return null;
    const what = `no SERENA_HOME: serena's default home, ${path.win32.join(profile, '.serena')}, has a space`;
    if (registration.scope === 'project') return C.finding('serena-windows-home', registration, what, { blocked: SPACED_PROJECT });
    const free = (serenaSpaceFree(context) as Extract<Root, { kind: 'abs' }>).path;
    return C.finding('serena-windows-home', registration, what, { proposal: { SERENA_HOME: free }, note: `a new home, ${free} - serena's data in ${path.win32.join(profile, '.serena')} is not moved and its language servers download again (~327MB)` });
}

export function serenaWindowsHomeFix(entry: ServerEntry, finding: Finding, _context: FixCtx, input: Record<string, string> & { serenaHome?: string } = {}): ServerEntry
{
    const home = (finding.proposal && finding.proposal.SERENA_HOME) || input.serenaHome;
    if (!home || !validWindowsSerenaHome(home)) throw new Error(`serena's home must be an absolute Windows folder in backslashes with no space; '${home || ''}' is not (pass --input serenaHome=<folder>)`);
    return { ...entry, env: { ...(entry.env || {}), SERENA_HOME: home } };
}

// ---- uvx-python / windows-arm-python --------------------------------------------------------------------------------
const pythonAt = (args: string[]) => args.findIndex((argument) => argument === '--python' || argument === '-p' || argument.startsWith('--python='));

export function uvxPythonDetect(context: FixCtx): Finding[]
{
    return eachReg(context, 'uvx-python', (registration) =>
    {
        if (C.launcher(registration.entry) !== 'uvx' || pythonAt(C.launchArgs(registration.entry)) >= 0) return null;
        const want = pythonRequest(C.routeOf(context, registration)!, context, context.rules);
        return C.finding('uvx-python', registration, `no --python: uvx picks the newest CPython, which has no wheel for some dependencies`, { proposal: { python: want } });
    });
}

export function uvxPythonFix(entry: ServerEntry, finding: Finding, _context: FixCtx): ServerEntry
{
    return { ...entry, args: ['--python', finding.proposal!.python!, ...entry.args!] };
}

export function windowsArmPythonDetect(context: FixCtx): Finding[]
{
    if (!isWindowsArm(context)) return [];
    return eachReg(context, 'windows-arm-python', (registration) =>
    {
        if (C.launcher(registration.entry) !== 'uvx') return null;
        const args = C.launchArgs(registration.entry);
        const at = args.indexOf('--python');
        const minor = at >= 0 ? args[at + 1] : null;
        if (!minor || !/^\d+\.\d+$/.test(minor)) return null; // none (uvx-python's), or a build the user chose
        return C.finding('windows-arm-python', registration, `--python ${minor} on Windows ARM64: several dependencies ship no ARM64 wheel`, { proposal: { python: context.rules.windowsArmPython.replace('{minor}', minor), from: minor } });
    });
}

export function windowsArmPythonFix(entry: ServerEntry, finding: Finding): ServerEntry
{
    const args = [...entry.args!];
    args[args.indexOf('--python') + 1] = finding.proposal!.python!;
    return { ...entry, args };
}

// ---- windows-npx-cmd ------------------------------------------------------------------------------------------------
export function windowsNpxCmdDetect(context: FixCtx): Finding[]
{
    if (context.platform !== 'win32') return [];
    return eachReg(context, 'windows-npx-cmd', (registration) =>
    {
        if (path.basename(String(registration.entry.command || '')).replace(/\.(exe|cmd)$/i, '') !== 'npx') return null;
        return C.finding('windows-npx-cmd', registration, 'npx is launched directly on native Windows', { note: 'a precaution: Claude Code no longer documents the cmd /c wrapper and this build has not proved it on a Windows machine' });
    });
}

export function windowsNpxCmdFix(entry: ServerEntry): ServerEntry
{
    return { ...entry, command: 'cmd', args: ['/c', 'npx', ...(entry.args || [])] };
}

// ---- playwright-webmcp ----------------------------------------------------------------------------------------------
// The release whose README documents --no-webmcp (catalog/fixes.json verifiedOn): a fixed floor, never the catalog's pin,
// which moves on every refresh and would block a registration that already has the flag.
const NO_WEBMCP_SINCE = '0.0.83';
export function playwrightWebmcpDetect(context: FixCtx): Finding[]
{
    return eachReg(context, 'playwright-webmcp', (registration) =>
    {
        if (C.launchArgs(registration.entry).includes('--no-webmcp')) return null;
        const pin = C.pinnedVersion(registration.entry, '@playwright/mcp');
        const documented = NO_WEBMCP_SINCE;
        const older = pin && C.compareVersions(pin, documented) === -1;
        return C.finding('playwright-webmcp', registration, 'page-registered WebMCP tools are not switched off (no --no-webmcp)',
            older ? { blocked: `pinned @${pin} is older than ${documented}, the version whose README documents --no-webmcp - update it first (/preferred-tools:update), then fix` } : {});
    });
}

export function playwrightWebmcpFix(entry: ServerEntry): ServerEntry
{
    const args = [...entry.args!];
    const at = args.indexOf('--browser');
    args.splice(at >= 0 ? at + 2 : args.length, 0, '--no-webmcp');
    return { ...entry, args };
}

// ---- appium-sdk-env -------------------------------------------------------------------------------------------------
const SDK_ENV = ['ANDROID_HOME', 'JAVA_HOME'];
export function androidSdk(context: { env: Env; machine: MachineProbe; platform: string; home: string }): string | null
{
    const { env, machine: machine } = context;
    for (const sdkFolder of [env.ANDROID_HOME, env.ANDROID_SDK_ROOT]) if (sdkFolder && machine.exists(sdkFolder)) return sdkFolder;
    const pathApi = pathFor(context.platform);
    const defaults = context.platform === 'darwin' ? [pathApi.join(context.home, 'Library', 'Android', 'sdk')]
        : context.platform === 'win32' ? [pathApi.join(env.LOCALAPPDATA || pathApi.join(context.home, 'AppData', 'Local'), 'Android', 'Sdk')]
            : [pathApi.join(context.home, 'Android', 'Sdk'), pathApi.join(context.home, 'Android', 'sdk')];
    return defaults.find((candidate) => machine.exists(candidate)) || null;
}

export function javaHome(context: { env: Env; machine: MachineProbe; platform: string }): string | null
{
    const { env, machine: machine } = context;
    if (env.JAVA_HOME && machine.exists(env.JAVA_HOME)) return env.JAVA_HOME;
    if (context.platform === 'darwin')
    {
        const result = machine.run('/usr/libexec/java_home', []);
        if (result && result.status === 0 && String(result.stdout).trim()) return String(result.stdout).trim();
    }
    const java = machine.which('java');
    const real = java && machine.realpath(java);
    if (!real) return null;
    const pathApi = pathFor(context.platform);
    const home = pathApi.dirname(pathApi.dirname(real));
    return machine.exists(pathApi.join(home, 'bin', context.platform === 'win32' ? 'java.exe' : 'java')) ? home : null;
}

export function appiumSdkEnvDetect(context: FixCtx): Finding[]
{
    return eachReg(context, 'appium-sdk-env', (registration) =>
    {
        const env = registration.entry.env || {};
        // every scope holds this machine's SDK homes since 0.3.0, this folder's .mcp.json included
        const missing = SDK_ENV.filter((k) => !env[k]);
        if (!missing.length) return null;
        const what = `${missing.join(' and ')} not set in the registration`;
        const lookup = { ANDROID_HOME: missing.includes('ANDROID_HOME') ? androidSdk(context) : null, JAVA_HOME: missing.includes('JAVA_HOME') ? javaHome(context) : null };
        const proposal = Object.fromEntries(Object.entries(lookup).filter(([, value]) => value));
        const notFound = missing.filter((k) => !proposal[k]);
        if (!Object.keys(proposal).length) return C.finding('appium-sdk-env', registration, what, { blocked: `${notFound.join(' and ')} not found on this machine - install the Android SDK / a JDK first` });
        return C.finding('appium-sdk-env', registration, what, { proposal, note: notFound.length ? `${notFound.join(' and ')} not found on this machine and left unset` : undefined });
    });
}

export function appiumSdkEnvFix(entry: ServerEntry, finding: Finding): ServerEntry
{
    return { ...entry, env: { ...(entry.env || {}), ...(finding.proposal as Record<string, string>) } };
}

// ---- serena-telemetry -----------------------------------------------------------------------------------------------
// Only an ABSENT variable is a finding: a user who set it to something else chose that.
export function serenaTelemetryDetect(context: FixCtx): Finding[]
{
    return eachReg(context, 'serena-telemetry', (registration) =>
        (registration.entry.env || {}).SERENA_USAGE_REPORTING === undefined ? C.finding('serena-telemetry', registration, 'SERENA_USAGE_REPORTING is not set - serena sends a usage ping at every start') : null);
}

export function serenaTelemetryFix(entry: ServerEntry): ServerEntry
{
    return { ...entry, env: { ...(entry.env || {}), SERENA_USAGE_REPORTING: 'false' } };
}

// ---- serena-context (0.5.0, D7) --------------------------------------------------------------------------------------
// A managed serena whose --context is not the context file in its family's root: 0.4.x ran Serena's own claude-code
// context, whose instructions name Claude Code's tools. The fix points it at <root>/serena-context.yml; fix.js plans the
// file's write before the replace.
export function serenaContextDetect(context: FixCtx): Finding[]
{
    const resolvedRoots = roots.resolve(context.inventory, null, { project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog }).roots;
    return eachReg(context, 'serena-context', (registration) =>
    {
        const root = resolvedRoots[roots.familyOf(registration.scope)];
        if (!root) return null;
        const want = pathFor(context.platform).join(root, roots.FILES.serenaContext);
        const args = registration.entry.args || [];
        const i = args.indexOf('--context');
        const now = i >= 0 ? args[i + 1] : null;
        if (now === want) return null;
        return C.finding('serena-context', registration, `serena runs with ${now ? `the context ${now}` : 'no --context'} - this plugin's ${want} gives it code navigation only, for Claude Code and Cursor`, { want, roots: resolvedRoots });
    });
}

export function serenaContextFix(entry: ServerEntry, finding: Finding): ServerEntry
{
    const args = [...(entry.args || [])];
    const i = args.indexOf('--context');
    if (i >= 0 && i + 1 < args.length) args[i + 1] = finding.want!;
    else args.push('--context', finding.want!);
    return { ...entry, args };
}

// ---- token-sync -----------------------------------------------------------------------------------------------------
// A local or user registration of a stdio token route whose key no filled name in its stdio chain holds (spec D3, D7):
// the key changed in the key file since, or the registration still holds the ${VAR} 0.1.x left. Compared in this process;
// a finding names the files, never a value. The fix writes the value of the name a ${VAR} holds, else of the catalog's
// default name. A stdio registration stores its key and not the key's name, so an empty one is never guessed at (R7): the
// default name may hold another account's key.
const PICK_NAME = "pick the key's name with /preferred-tools:configure";
const ONE_VAR = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

// The key inside a token field: the field's text less the route template's text around ${VAR}.
function keyIn(value: unknown, template: string, tokenVar: string): string
{
    const [prefix, post = ''] = template.split(`\${${tokenVar}}`) as [string, string?];
    const text = String(value);
    return text.length >= prefix.length + post.length && text.startsWith(prefix) && text.endsWith(post) ? text.slice(prefix.length, text.length - post.length) : text;
}

function stdioChainOf(context: FixCtx, scope: string): string[]
{
    const resolvedRoots = roots.resolve(context.inventory, null, { project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog }).roots;
    return keys.stdioChain({ scope, projectRoot: resolvedRoots.project, globalRoot: resolvedRoots.global });
}

export function tokenSyncDetect(context: FixCtx): Finding[]
{
    return eachReg(context, 'token-sync', (registration, route) =>
    {
        if (registration.route === 'remote' || !['local', 'user'].includes(registration.scope)) return null;
        const fields = keys.tokenFields(registration.entry, route);
        if (!fields.length) return null;
        const tokenVar = route.tokenVar!;
        const key = keyIn(fields[0]!.at.reduce<unknown>((node, k) => (node as Record<string | number, unknown>)[k], registration.entry), fields[0]!.template, tokenVar);
        const chain = stdioChainOf(context, registration.scope);
        const extra = { route: registration.route, chain };
        if (key === '') return C.finding('token-sync', registration, `the registration's ${tokenVar} is empty`, { ...extra, blocked: PICK_NAME });
        const one = ONE_VAR.exec(key);
        if (one)
        {
            const at = keys.valueIn(chain, one[1]!);
            return at ? C.finding('token-sync', registration, `the registration holds \${${one[1]}} while ${at.file} has the key`, { ...extra, keyName: one[1]! }) : null;
        }
        if (keys.nameOfValue(chain, key)) return cursorBehind(context, registration, route, chain, extra);
        const what = `the key in the registration matches no name in ${chain.join(', ')}`;
        return C.finding('token-sync', registration, what, keys.valueIn(chain, tokenVar) ? { ...extra, keyName: tokenVar } : { ...extra, blocked: PICK_NAME });
    });
}

// At user scope a server set up for Cursor holds its key in ~/.cursor/mcp.json too (spec D6): its copy is behind when
// its value is not the one its list's key name has in the chain. The fix refills that copy alone, from .mcps-secrets
// at apply (plan-lists.js repairTail), with Claude Code's registration as it is. -> finding | null
function cursorBehind(context: FixCtx, registration: InvRegistration, route: CatalogRoute, chain: string[], extra: { route: string | null; chain: string[] }): Finding | null
{
    if (registration.scope !== 'user') return null;
    const list = context.inventory.lists && context.inventory.lists.global;
    const server = list && !list.note && !list.old ? (list.servers || []).find((candidate) => candidate.name === registration.name && candidate.scope === 'user' && (candidate.clients || []).includes('cursor')) : null;
    if (!server || !server.key) return null;
    const file = cursorMcp.fileFor('global', context);
    const read = cursorMcp.readCursor(file);
    const copy = read.state === 'ok' ? read.doc!.mcpServers[registration.name] : null;
    const fields = copy ? keys.tokenFields(copy, route) : [];
    const at = keys.valueIn(chain, server.key);
    if (!fields.length || !at) return null;
    const held = keyIn(fields[0]!.at.reduce<unknown>((node, k) => (node == null ? node : (node as Record<string | number, unknown>)[k]), copy), fields[0]!.template, route.tokenVar!);
    if (held === at.value) return null;
    return C.finding('token-sync', registration, `Cursor's copy in ${file} holds a key other than ${server.key} in ${at.file}`, { ...extra, keyName: server.key, cursorOnly: true });
}

export function tokenSyncFix(entry: ServerEntry, finding: Finding, context: FixCtx): ServerEntry
{
    // Cursor's copy alone: Claude Code's registration stays as it is
    if (finding.cursorOnly) return entry;
    const at = keys.valueIn(finding.chain!, finding.keyName!);
    if (!at) throw new Error(`${finding.keyName} is filled in none of ${finding.chain!.join(', ')} any more - nothing written`);
    const row = C.rowOf(context, finding.row!)!;
    return keys.fillKeys(entry, row, finding.route!, finding.scope!, { [row.routes[finding.route!]!.tokenVar!]: at.value });
}

// ---- windows-mcp-one-per-desktop ------------------------------------------------------------------------------------
// Advice only (`fix: null`): windows-mcp 0.8.8 makes one missed overlay confirmation permanent for its process, and a
// second server on the same desktop is the likely cause. The finding is always blocked: each server is dropped by its
// owner's own command, and preferred-tools changes none of them.
function windowsMcpDrop(server: WindowsMcp, context: FixCtx): string
{
    if (server.kind === 'plugin') return `claude plugin disable ${server.name} --scope ${server.scope}`;
    const how = server.owner === 'catalog' ? '/preferred-tools:configure (Remove)' : `claude mcp remove ${server.name} -s ${server.scope === 'inherited' ? 'project' : server.scope}`;
    return server.scope === 'inherited' ? `${how}, run in ${fromHere(context.inventory, server.from!)}` : how;
}

export function windowsMcpOneDetect(context: FixCtx): Finding[]
{
    const servers = windowsMcpServers(context.inventory);
    if (servers.length < 2) return [];
    const at = servers.find((server) => server.owner === 'catalog') || servers[0];
    const list = servers.map((server) => `${server.name} (${server.scope})`).join(', ');
    const drop = servers.map((server) => `${server.name} (${server.scope}): ${windowsMcpDrop(server, context)}`).join('; ');
    // `row` set by hand: a server is not a registration row, and --only narrows by it
    return [C.finding('windows-mcp-one-per-desktop', { ...at, rowId: 'windows-control' } as { rowId: string; name: string; scope: string }, `${servers.length} windows-mcp servers start in this project: ${list}`,
        { blocked: `keep one per Windows desktop - ${drop}; a stuck one recovers only in a new Claude Code session` })];
}

