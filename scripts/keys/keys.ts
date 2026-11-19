// KEYS - the key files, and how a key goes into a stdio registration (spec D3, D7).
//
// A key is read here, in the process that writes the registration, and goes nowhere else: never printed, never in a file
// a command line names, never asked for. The user fills the key files by hand; the plugin writes names only.
//
//   .mcps-secrets      one per root folder (the project root, the global root), in the header helper's dotenv grammar. A hosted
//                      route's key is read by mcp-headers.js when Claude Code connects (hostedChain), a stdio route's by
//                      the apply (stdioChain); project scope takes no stdio key.
//   the 0.1.x files    alfred-code's two stores and alfred-tools' own key files: read for a name only (oldHolding),
//                      so a blocked fix can say where a key still sits.
import path from 'node:path';
import { readDotenv, valueIn as helperValueIn } from '../copied/mcp-headers.js';
import { ALFRED_DATA, FILES, FORMER_ROOT_NAME, ROOT_NAME } from '../core/constants.ts';
import { PLACEHOLDER, valueAt } from '../core/kept.ts';
import { pathFor } from '../entries/platform.ts';
import { isRecord, isServerEntry } from '../core/guards.ts';
import type { ServerEntry } from '../core/types.ts';
import type { CatalogRoute, CatalogRow, TokenForm } from '../catalog/types.ts';
import type { FileNames, KeyChain, KeyHit, TokenField } from './types.ts';

// 0.1.x's key file, at this plugin's folder and at its former one (spec D2), read in that order
const KEY_FILES = [path.join(ROOT_NAME, '.secrets'), path.join(FORMER_ROOT_NAME, '.secrets')];
const alfredStores = (project: string): string[] => ['.secrets', '.sensitive-data'].map((storeName) => path.join(project, ALFRED_DATA, storeName));

// A key file's names and values, read with the header helper's dotenv grammar (copied/mcp-headers.js), so a plan reads
// a key file the way the helper reads it when Claude Code connects.
export { readDotenv };

// A name D9 offers for a key: the catalog's default, or a key-shaped name (ending in TOKEN, KEY or PAT, in any case) that
// holds the row word (GITHUB, SENTRY, CONTEXT7) - a key kept under a name the catalog does not use; a webhook secret or a
// client id is not one.
const KEY_SHAPED = /(?:TOKEN|KEY|PAT)$/;
const nearMiss = (candidate: string, name: string, word: string | null | undefined): boolean => candidate !== name && typeof word === 'string' && word !== '' && candidate.toUpperCase().includes(word) && KEY_SHAPED.test(candidate.toUpperCase());
export const offeredName = (candidate: string, name: string, word: string | null | undefined): boolean => candidate === name || nearMiss(candidate, name, word);

// The token fields a form defines and an entry holds: its env pairs and optional env pair, then its optional args pair.
function formFields(entry: ServerEntry, form: TokenForm, ref: string): TokenField[]
{
    const out: TokenField[] = [];
    const envTemplates: Record<string, string> = { ...(form.env || {}), ...((form.optionalEnv && form.optionalEnv.token) || {}) };
    for (const [fieldName, template] of Object.entries(envTemplates))
        if (template.includes(ref) && entry.env && Object.hasOwn(entry.env, fieldName)) out.push({ at: ['env', fieldName], template });
    const [tokenFlag, tokenTemplate] = (form.optionalArgs && form.optionalArgs.token) || [];
    const args = Array.isArray(entry.args) ? entry.args : [];
    const i = tokenFlag === undefined ? -1 : args.indexOf(tokenFlag);
    if (i >= 0 && i + 1 < args.length && tokenTemplate !== undefined) out.push({ at: ['args', i + 1], template: tokenTemplate });
    return out;
}

// The token fields a catalog route defines and an entry holds: [{ at: ['env', K] | ['headers', H] | ['args', i], template }].
// The route's own form first, then each place it kept the key before (`formerly`, spec D0), so every reader - Cursor's
// refusal at Local, token-sync, fillKeys, the apply's held key, the list - sees a key wherever a registration keeps it.
export function tokenFields(entry: ServerEntry | null | undefined, route: CatalogRoute | null | undefined): TokenField[]
{
    if (!route || !route.tokenVar || !entry) return [];
    const ref = `\${${route.tokenVar}}`;
    const out: TokenField[] = [];
    const seen = new Set<string>();
    const add = (field: TokenField) => { const key = field.at.join('\u0000'); if (!seen.has(key)) { seen.add(key); out.push(field); } };
    const current: TokenForm = { ...(route.env ? { env: route.env } : {}), ...(route.optionalEnv ? { optionalEnv: route.optionalEnv } : {}), ...(route.optionalArgs && route.optionalArgs.token ? { optionalArgs: { token: route.optionalArgs.token } } : {}) };
    formFields(entry, current, ref).forEach(add);
    // a route declares no headers today; one that carries them is read as the env is
    const routeHeaders = 'headers' in route && isRecord(route.headers) ? route.headers : undefined;
    for (const [fieldName, template] of Object.entries(routeHeaders || {}))
        if (typeof template === 'string' && template.includes(ref) && entry.headers && Object.hasOwn(entry.headers, fieldName)) add({ at: ['headers', fieldName], template });
    for (const form of route.formerly || []) formFields(entry, form, ref).forEach(add);
    return out;
}

// The entry with every token field tokenFields finds taken out: an args field with the flag before it, an env or header
// name. Configure's 'no key' answer runs it, so a key goes whichever place it was in (spec D1).
export function withoutTokenFields(entry: ServerEntry, route: CatalogRoute | null | undefined): ServerEntry
{
    const fields = tokenFields(entry, route);
    if (!fields.length) return entry;
    const out: ServerEntry = { ...entry };
    if (entry.args) out.args = [...entry.args];
    if (entry.env) out.env = { ...entry.env };
    if (entry.headers) out.headers = { ...entry.headers };
    const argsAt = fields.flatMap((field) => (field.at[0] === 'args' ? [field.at[1]] : [])).sort((left, right) => right - left);
    for (const at of argsAt) if (out.args) out.args.splice(at - 1, 2);
    for (const field of fields)
    {
        const [where, name] = field.at;
        if (where === 'args') continue;
        const holder = out[where];
        if (holder) delete holder[name];
    }
    return out;
}

// valueAt and PLACEHOLDER are core/kept.ts's, which masks by them too; plan, apply, cursor, fix and mcps-list read them here.
export { PLACEHOLDER, valueAt };

// fillKeys(entry, row, routeId, scope, found) -> a copy with each token field set by the target scope: at project scope
// the route's ${VAR} form, whatever the entry held; at local and user scope the found value in the route's form, or, when
// the key is missing, what the entry holds.
export function fillKeys(entry: ServerEntry, row: CatalogRow | null | undefined, routeId: string, scope: string, found: Record<string, string> = {}): ServerEntry
{
    const route = row && row.routes ? row.routes[routeId] : null;
    const tokenVar = route ? route.tokenVar : undefined;
    const fields = tokenFields(entry, route);
    // tokenFields finds none without a route and its tokenVar
    if (!fields.length || tokenVar === undefined) return entry;
    const value = found[tokenVar];
    if (scope !== 'project' && typeof value !== 'string') return entry;
    // a copy through JSON, as the entry is stored; one that does not come back as an entry is left as it is
    const out: unknown = JSON.parse(JSON.stringify(entry));
    if (!isServerEntry(out)) return entry;
    for (const field of fields)
    {
        const text = scope === 'project' ? field.template : field.template.split(`\${${tokenVar}}`).join(value);
        const [where, at] = field.at;
        if (where === 'args' && out.args) out.args[at] = text;
        else if (where !== 'args' && out[where]) out[where][at] = text;
    }
    return out;
}

// ---- .mcps-secrets (spec D3) -----------------------------------------------------------------------------------------
// One key file per root folder, `.mcps-secrets`, in the helper's grammar, its values written by the user alone. A hosted
// route's key is read by the header helper (mcp-headers.js) when Claude Code connects, a stdio route's by the apply; each
// chain below is the order its reader takes, so a plan reads what the registration will read. A value leaves this file
// only through valueIn, in the process that asked.
export const SECRETS = FILES.secrets;
export const NAME_RULE = /^[A-Za-z_][A-Za-z0-9_]*$/;
// A chain is built in the path form of the platform it is for (the plan's or the fix's context), not the host's: a plan for
// a posix machine run on Windows names `/`-separated files, which the root-matching code reads with the context's own path.
const pathApiOn = (platform?: string): path.PlatformPath => (platform ? pathFor(platform) : path);
const secretsIn = (dir: string, platform?: string): string => pathApiOn(platform).join(dir, SECRETS);
const uniq = <Item>(list: Item[]): Item[] => [...new Set(list)];

// hostedChain({ scope, projectRoot, globalRoot, globalNamed, home, platform }) -> the files the helper reads, in order: the root
// beside it (the project root at project and local scope, the global root at user scope); at local scope the global root
// when it is a named folder (the helper's third argument); then ~/.alfred-tools, then ~/.alfred.
export function hostedChain({ scope, projectRoot, globalRoot, globalNamed = false, home, platform }: KeyChain): string[]
{
    const pathApi = pathApiOn(platform);
    const beside = scope === 'user' ? globalRoot : projectRoot;
    const named = scope === 'local' && globalNamed ? globalRoot : null;
    return uniq([beside, named, pathApi.join(home, ROOT_NAME), pathApi.join(home, ALFRED_DATA)].filter((dir): dir is string => Boolean(dir)).map((dir) => secretsIn(dir, platform)));
}

// stdioChain({ scope, projectRoot, globalRoot, platform }) -> the files the apply reads a stdio key from: local scope the project
// root's, then the global root's; user scope the global root's. Project scope takes no stdio key (spec D5).
export function stdioChain({ scope, projectRoot, globalRoot, platform }: Omit<KeyChain, 'home'> & { home?: string | undefined }): string[]
{
    if (scope === 'local') return uniq([projectRoot, globalRoot].filter((dir): dir is string => Boolean(dir)).map((dir) => secretsIn(dir, platform)));
    if (scope === 'user') return globalRoot ? [secretsIn(globalRoot, platform)] : [];
    return [];
}

// The first non-empty value of `name` in `files` -> { value, file } | null. An empty value counts as missing.
export function valueIn(files: string[], name: string): KeyHit | null
{
    return helperValueIn(name, files);
}

// The names a key file defines, filled or not - the values stay in this process. [] when the file cannot be read.
export const namesIn = (file: string): string[] => Object.keys(readDotenv(file) || {});
// The names each file holds with a value -> [{ file, names }]. Every value is dropped here.
export const filledNames = (files: string[]): FileNames[] => files.map((file) => ({ file, names: Object.entries(readDotenv(file) || {}).filter(([, value]) => value !== '').map(([name]) => name) }));

// The key files 0.1.x read, which 0.2.0 reads for names only: alfred-code's store in the project and in each parent folder
// (its chain walks the parents, so a workspace root's store served its child repos), the project's
// .alfred-tools/.secrets and its former folder's, then the home ones.
export function oldFiles(project: string, home: string): string[]
{
    const stores: string[] = [];
    for (let dir = path.resolve(project); ; dir = path.dirname(dir))
    {
        stores.push(...alfredStores(dir));
        if (path.dirname(dir) === dir) break;
    }
    return uniq([...stores, ...KEY_FILES.map((file) => path.join(project, file)), ...KEY_FILES.map((file) => path.join(home, file))]);
}

// The first old file holding `name` with a value -> its path | null. The value is never returned.
export function oldHolding(project: string, home: string, name: string): string | null
{
    return oldFiles(project, home).find((file) => Boolean((readDotenv(file) || {})[name])) || null;
}

// The first name in `files` whose value equals `value` -> its name | null. Compared in this process; the value is never
// returned or printed.
export function nameOfValue(files: string[], value: unknown): string | null
{
    if (typeof value !== 'string' || value === '') return null;
    for (const file of files)
    {
        const hit = Object.entries(readDotenv(file) || {}).find(([, heldValue]) => heldValue === value);
        if (hit) return hit[0];
    }
    return null;
}

// A name that looks like a credential (spec D9, the docs' own test): a key belongs in .mcps-secrets, never in a setting.
export const credentialName = (name: unknown): boolean => /TOKEN|SECRET|PASSWORD|KEY|AUTH/i.test(String(name));

