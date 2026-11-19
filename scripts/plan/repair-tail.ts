// A repair's tail (spec D1, D9): the list and Cursor steps after a fix or an update rewrote registrations.
import fs from 'node:fs';
import path from 'node:path';
import { pathFor } from '../entries/platform.ts';
import { signInParts } from '../entries/sign-in.ts';
import * as catalogLib from '../catalog/catalog.ts';
import * as roots from '../roots/roots.ts';
import * as keys from '../keys/keys.ts';
import * as lists from '../mcps-list/mcps-list.ts';
import * as cursorMcp from '../cursor/cursor-mcp.ts';
import { deepEqual, stripBom } from '../core/json-file.ts';
import { isRecord } from '../core/shapes.ts';
import { errorCode } from '../core/guards.ts';
import { fetchStep } from '../entries/names.ts';
import { SETTINGS_ENV_KEY, START_TIMEOUT } from './start-timeout-constants.ts';
import { CONFIG_DIR_NAME, INSTALLED_PLUGINS_FILE, PLUGINS_DIR, PLUGIN_KEY_PREFIXES, SETTINGS_FILE } from './read-guard-constants.ts';
import { REG_OPS, listSteps } from './lists.ts';
import { cursorSteps, SCOPES, heldCopies, keepOf } from './cursor-steps.ts';
import type { ServerEntry } from '../core/types.ts';
import type { Catalog } from '../catalog/types.ts';
import type { Inventory } from '../inventory/types.ts';
import type { CursorWritePlanStep, DenyReadStep, FileStep, ListCtx, ListWriteStep, PlanOut, PlanStep, RegistrationStep, RepairCtx, SettingsCtx, SettingsEnvStep } from './types.ts';

// ---- a repair's tail (spec D1, D9) -------------------------------------------------------------------------------------

// What a fix or an update writes after its registration steps: each list the steps' servers sit in, from the
// registrations as read back, and Cursor's files from those lists - a copy Cursor lacks or one changed by hand left out
// and named. Only lists that exist are written: a family with none waits for list-import. `refresh`: [{ name, scope }]
// whose Cursor copy is refilled from .mcps-secrets at apply with no list change (token-sync). `repoint`: [{ name, scope }]
// whose list entry and Cursor copy follow a moved root (root-repoint, spec D3), `normalize` re-pointing an entry - a
// Cursor copy that differs from its list only by the moved root is written, not held. Notes go to context.notes.
// -> [step]
export function repairTail(inventory: Inventory, context: RepairCtx, regSteps: PlanStep[], { refresh = [], repoint = [], normalize, clientsFor, bridgeFor }: { refresh?: { name: string; scope: string }[]; repoint?: { name: string; scope: string }[]; clientsFor?: Map<string, string[]> | undefined; bridgeFor?: Set<string> | undefined; normalize?: ((entry: ServerEntry) => ServerEntry) | undefined } = {}): PlanStep[]
{
    const catalog = context.catalog || catalogLib.load();
    const notes = context.notes || [];
    const usable = (family: string) => { const familyList = inventory.lists && inventory.lists[family]; return familyList && !familyList.note && !familyList.old ? familyList : null; };
    // a two-form entry keeps two forms: apply builds Cursor's bridge again from the entry as read, its pin kept
    const formFor = new Map<string, string | null>();
    for (const step of regSteps.filter((candidate): candidate is RegistrationStep => REG_OPS.includes(candidate.op)))
    {
        const key = lists.regKey(step);
        const familyList = usable(roots.familyOf(step.op === 'mcp-move' ? step.to.scope : step.scope));
        const prior = familyList ? (familyList.servers || []).find((server) => lists.serverKey(server) === key) : null;
        // a two-form entry keeps two forms; so does one `bridgeFor` names - an adopted server whose helper just became this
        // plugin's, so its Cursor copy is built as the bridge (helper-foreign). No other repair changes a copy's form.
        if (key !== null && ((prior && prior.cursorEntry) || (bridgeFor && bridgeFor.has(key)))) formFor.set(key, 'two');
    }
    const listContext: ListCtx = { platform: context.platform, project: context.project || inventory.project, home: context.home, env: context.env || {}, catalog, roots: null, uses: [], formFor, clientsFor, exists: context.exists, normalizeCopy: normalize };
    const out: PlanOut = { steps: [], notes, errors: [] };
    const listWrites = listSteps(inventory, listContext, out, regSteps);
    // the key's name, from the key files of the roots in use
    const rootPaths = { project: inventory.roots && inventory.roots.project ? inventory.roots.project.path : null, global: inventory.roots && inventory.roots.global ? inventory.roots.global.path : null };
    for (const listStep of listWrites)
        for (const upsert of (listStep.op === 'list-write' && listStep.upserts) || [])
            if (!upsert.keyFiles)
            {
                const files = keys.stdioChain({ scope: upsert.server.scope, projectRoot: rootPaths.project, globalRoot: rootPaths.global, platform: context.platform });
                if (files.length) upsert.keyFiles = files;
            }
    // a re-pointed server the registration steps did not reach: its list entry as listed, re-pointed (root-repoint)
    for (const item of repoint)
    {
        const family = roots.familyOf(item.scope);
        const familyList = usable(family);
        const prior = familyList ? (familyList.servers || []).find((server) => server.name === item.name && server.scope === item.scope) : null;
        if (!familyList || !prior) continue;
        let write = listWrites.find((step): step is ListWriteStep => step.op === 'list-write' && step.file === familyList.file);
        if (!write)
        {
            write = { op: 'list-write', file: familyList.file, family, upserts: [], drops: [], own: null, why: `${familyList.file}: the paths into the moved root re-pointed` };
            listWrites.push(write);
        }
        if (write.upserts.some((upsert) => upsert.server.name === item.name && upsert.server.scope === item.scope)) continue;
        const again = (entry: ServerEntry) => (normalize ? normalize(entry) : entry);
        write.upserts.push({ server: { ...prior, entry: again(prior.entry), ...(prior.cursorEntry ? { cursorEntry: again(prior.cursorEntry) } : {}) }, after: null, cursorFile: null });
    }
    out.steps = [...regSteps, ...listWrites];
    const cursor = cursorSteps(inventory, listContext, out, {});
    for (const error of out.errors) notes.push(`${error} - Cursor's file is left; run /alfred-tools:configure`);
    const blocked = new Set(out.errors.length ? cursor.map((cursorStep) => cursorStep.file) : []);
    const written = cursor.filter((cursorStep) => !blocked.has(cursorStep.file));
    // a Cursor copy refilled from .mcps-secrets with the list as it is
    for (const family of [...new Set(refresh.map((item) => roots.familyOf(item.scope)))])
    {
        const familyList = usable(family);
        const file = cursorMcp.fileFor(family, listContext);
        if (!familyList || written.some((cursorStep) => cursorStep.file === file)) continue;
        const why = cursorMcp.refusal(cursorMcp.readCursor(file));
        if (why) { notes.push(`Cursor: ${file} ${why} - not written`); continue; }
        const scopes = SCOPES[family];
        const before = cursorMcp.managedSet([{ file: familyList.file, scopes, servers: familyList.servers || [] }]);
        const hold = heldCopies(file, before, before, listContext, out);
        written.push({ op: 'cursor-write', file, family: family, lists: [{ file: familyList.file, scopes }], before: [...before.keys()], skip: hold, replace: [], reapprove: refresh.filter((item) => roots.familyOf(item.scope) === family && !hold.includes(item.name)).map((item) => item.name), why: `${file}: the key refilled from .mcps-secrets` });
    }
    return [...listWrites, ...written];
}

// What changed outside alfred-tools (spec D1): each list entry whose Claude registration differs after kept.maskCredentials,
// then each the list names that Claude Code no longer has. Install, configure and update print these first; only fix
// changes either. -> [line]
export function changedOutside(inventory: Inventory, catalog: Catalog = catalogLib.load()): string[]
{
    const changed: string[] = [];
    const missing: string[] = [];
    for (const family of roots.FAMILIES)
    {
        const familyList = inventory.lists && inventory.lists[family];
        if (!familyList || familyList.note || familyList.old) continue;
        for (const server of familyList.servers || [])
        {
            if (!(server.clients || ['claude']).includes('claude')) continue;
            const registration = (inventory.registrations || []).find((candidate) => candidate.name === server.name && candidate.scope === server.scope);
            if (!registration) missing.push(`${server.name} is on the list but not in Claude Code - run /alfred-tools:fix`);
            else if (!deepEqual(keepOf(catalog, registration.entry, server.row), server.entry)) changed.push(`${server.name} was changed outside alfred-tools`);
        }
    }
    return [...changed, ...missing];
}

// Claude Code's settings file: `dir`'s, else CLAUDE_CONFIG_DIR's, else <home>/.claude's - the one read guard and the start limit guard share.
function settingsFileOf(context: SettingsCtx, dir?: string): string
{
    const pathApi = pathFor(context.platform);
    const env = context.env || {};
    return dir ? pathApi.join(dir, SETTINGS_FILE) : env.CLAUDE_CONFIG_DIR ? pathApi.resolve(env.CLAUDE_CONFIG_DIR, SETTINGS_FILE) : pathApi.join(context.home, CONFIG_DIR_NAME, SETTINGS_FILE);
}

// The settings file the deny rules go in, and which of `want` it lacks: { file, rules } | { file, bad: true }. Shared by
// install and configure (denyReadSteps) and fix's read-guard row. Claude Code's own settings: CLAUDE_CONFIG_DIR, else
// ~/.claude - from context.home, so a test never reads the real one. `dir` is another config dir (configDirsWithPlugin): its
// settings.json is read the same way, and one it has not got yet is created with the rules, as the current dir's is.
export function readGuardOf(context: SettingsCtx, want: string[], dir?: string): { file: string; bad: true; rules?: undefined } | { file: string; rules: string[]; bad?: undefined }
{
    const file = settingsFileOf(context, dir);
    let text: string | null = null;
    try { text = fs.readFileSync(file, 'utf8'); } catch { /* absent: {} */ }
    let deny: string[] = [];
    if (text !== null)
    {
        let doc: unknown = null;
        try { doc = JSON.parse(stripBom(text)); } catch { /* below */ }
        const permissions = isRecord(doc) ? doc['permissions'] : undefined;
        const listed = isRecord(permissions) ? permissions['deny'] : undefined;
        if (!isRecord(doc) || (permissions !== undefined && !isRecord(permissions)) || (listed !== undefined && !Array.isArray(listed))) return { file, bad: true };
        // a rule that is not a string matches none of `want`
        deny = Array.isArray(listed) ? listed.filter((rule) => typeof rule === 'string') : [];
    }
    return { file, rules: want.filter((rule) => !deny.includes(rule)) };
}

// The config dirs other than `current` that have this plugin installed (Part E): each folder directly under `home` named
// `.claude` or `.claude-<suffix>` whose plugins/installed_plugins.json is JSON with a key of the plugin's ids. Names
// only - the file's content is never kept, and one that is absent, not JSON or without a `plugins` object skips the dir.
// Dirs are compared by real path, so a symlink to the current dir or to a dir already listed is no dir of its own (the
// first name in sort order is the one listed); `platform` (the caller's context) says whether case is folded.
export function configDirsWithPlugin(home: string, current: string, platform: string = process.platform): string[]
{
    const realKey = (dir: string) =>
    {
        let real = path.resolve(dir);
        try { real = fs.realpathSync(dir); } catch { /* not there, or a loop: the resolved form */ }
        return platform === 'win32' ? real.toLowerCase() : real;
    };
    const currentKey = realKey(current);
    const listed = new Set<string>();
    let names: string[] = [];
    try { names = fs.readdirSync(home); } catch { return []; }
    const found: string[] = [];
    for (const name of names.sort())
    {
        if (name !== CONFIG_DIR_NAME && !name.startsWith(`${CONFIG_DIR_NAME}-`)) continue;
        const dir = path.join(home, name);
        const key = realKey(dir);
        if (key === currentKey || listed.has(key)) continue;
        try
        {
            const doc: unknown = JSON.parse(stripBom(fs.readFileSync(path.join(dir, PLUGINS_DIR, INSTALLED_PLUGINS_FILE), 'utf8')));
            const plugins = isRecord(doc) ? doc['plugins'] : null;
            if (isRecord(plugins) && Object.keys(plugins).some((pluginKey) => PLUGIN_KEY_PREFIXES.some((prefix) => pluginKey.startsWith(prefix)))) { found.push(dir); listed.add(key); }
        }
        catch { /* no record, or not JSON: skipped */ }
    }
    return found;
}

// The deny-read step as one plan line - or none when the file has every rule.
export function denyReadStep(file: string, rules: string[]): DenyReadStep
{
    return { op: 'deny-read', file, rules, why: `${file}: keeps an AI session's Read tool out of ${rules.map((rule) => (rule === roots.READ_GUARD.signIns ? 'the sign-in tokens' : 'the key file')).join(' and ')}` };
}

// The read guard (ruling 13): one deny-read for the plan, with the sign-in rule when it writes the shared sign-in form
// and the key-file rule when it writes a key name - each only when Claude Code's settings file lacks it. A settings file
// that is not a JSON object is a note: the rest of the plan is still written. -> [deny-read step]
export function denyReadSteps(steps: PlanStep[], context: SettingsCtx, out: Pick<PlanOut, 'notes'>): DenyReadStep[]
{
    const writesSignIn = steps.some((step) => (step.op === 'mcp-add' || step.op === 'mcp-replace' || step.op === 'mcp-move') && signInParts(step.entry));
    const writesKeyName = steps.some((step) => step.op === 'ensure-key-name');
    const want = [...(writesSignIn ? [roots.READ_GUARD.signIns] : []), ...(writesKeyName ? [roots.READ_GUARD.secrets] : [])];
    if (!want.length) return [];
    const readGuard = readGuardOf(context, want);
    if (readGuard.bad)
    {
        out.notes.push(`${readGuard.file} is not a settings object alfred-tools can read - add ${want.join(' and ')} to permissions.deny yourself`);
        return [];
    }
    return readGuard.rules.length ? [denyReadStep(readGuard.file, readGuard.rules)] : [];
}

// The start limit guard: the settings file MCP_TIMEOUT goes in, and whether its env lacks it - { file, missing } - or
// { file, bad: true } for a file that is not a JSON object or whose env is not one. Shared by install and configure
// (startTimeoutSteps) and fix's start-timeout row; `dir` is another config dir (configDirsWithPlugin). A value the file
// holds, of any kind, counts as set.
export function startTimeoutOf(context: SettingsCtx, dir?: string): { file: string; missing: boolean; bad?: undefined } | { file: string; bad: true; missing?: undefined }
{
    const file = settingsFileOf(context, dir);
    // a value the environment holds already - a shell's export, or the settings' env a session hands its commands - counts
    // as set, so a limit the user chose is never overridden
    if ((context.env || {})[START_TIMEOUT.name]) return { file, missing: false };
    let text: string | null = null;
    // absent: {}; there but unreadable: no file to write, so bad, never missing
    try { text = fs.readFileSync(file, 'utf8'); } catch (caught) { if (errorCode(caught) !== 'ENOENT') return { file, bad: true }; }
    if (text === null) return { file, missing: true };
    let doc: unknown = null;
    try { doc = JSON.parse(stripBom(text)); } catch { /* below */ }
    const held = isRecord(doc) ? doc[SETTINGS_ENV_KEY] : undefined;
    if (!isRecord(doc) || (held !== undefined && !isRecord(held))) return { file, bad: true };
    return { file, missing: !Object.hasOwn(held ?? {}, START_TIMEOUT.name) };
}

// The settings-env step as one plan line.
export function settingsEnvStep(file: string): SettingsEnvStep
{
    return { op: 'settings-env', file, env: { [START_TIMEOUT.name]: START_TIMEOUT.value }, why: `${file}: gives a server 90 s to start, where npx asks the npm registry first` };
}

// Whether a launch resolves a package at every start - npx, uvx, docker or the bridge, through cmd /c too: the launches
// fetchStep knows.
export const launchesPackage = (name: string, entry: ServerEntry | null | undefined): boolean => fetchStep(name, entry) !== null;

// The start limit guard: one settings-env for the plan when a registration it writes launches through npx, uvx or docker
// and Claude Code's settings lack MCP_TIMEOUT. A settings file that is not a JSON object is a note: the rest of the plan
// is still written. -> [settings-env step]
export function startTimeoutSteps(steps: PlanStep[], context: SettingsCtx, out: Pick<PlanOut, 'notes'>): SettingsEnvStep[]
{
    const launches = steps.some((step) => (step.op === 'mcp-add' || step.op === 'mcp-replace' || step.op === 'mcp-move') && launchesPackage(step.op === 'mcp-move' ? step.to.name : step.name, step.entry));
    if (!launches) return [];
    const current = startTimeoutOf(context);
    if (current.bad)
    {
        out.notes.push(`${current.file} is not a settings object alfred-tools can read - add ${START_TIMEOUT.name}=${START_TIMEOUT.value} to ${SETTINGS_ENV_KEY} yourself`);
        return [];
    }
    return current.missing ? [settingsEnvStep(current.file)] : [];
}

// The plan line of a list-write, retire-record, cursor-write, deny-read or settings-env step.
export function renderLine(step: ListWriteStep | FileStep | CursorWritePlanStep | DenyReadStep | SettingsEnvStep): string
{
    if (step.op === 'settings-env') return `   adds ${Object.entries(step.env).map(([name, value]) => `${name}=${value}`).join(' and ')} to ${SETTINGS_ENV_KEY} in ${step.file}  (gives a server 90 s to start - npx asks the npm registry first)`;
    if (step.op === 'deny-read') return `   adds ${step.rules.join(' and ')} to permissions.deny in ${step.file}  (keeps AI sessions out of the sign-in tokens and the key file)`;
    if (step.op === 'cursor-write') return [`   writes ${step.file}  (Cursor: the servers set up for it; your own entries kept)`, ...(step.replace || []).map((name) => `   replaces your own ${name} in ${step.file}`)].join('\n');
    if (step.op === 'retire-record') return `   moves ${step.file} aside as ${roots.FILES.record}.0.4.bak  (its entries are in mcps.json now)`;
    return step.empty ? `   removes ${step.file}  (no server is listed)` : `   writes ${step.file}  (the servers alfred-tools manages, and the ones left on their own)`;
}

