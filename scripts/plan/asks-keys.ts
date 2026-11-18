// The key questions: which key a hosted route reads, and the name it is kept under.
import { pathFor } from '../entries/platform.ts';
import { rootOf } from '../entries/locations.ts';
import { settingsOf } from '../entries/entry.ts';
import { hostedSettingsQuestion } from './hosted-settings.ts';
import * as keys from '../keys/keys.ts';
import { readRegistration } from '../core/account.ts';
import { ALL_SCOPES } from '../core/constants.ts';
import { PREFIX, RECOMMENDED_SUFFIX } from './record-constants.ts';
import { plainLabel } from './record-resolve.ts';
import type { Env, ServerEntry } from '../core/types.ts';
import type { CatalogRoute, CatalogRow } from '../catalog/types.ts';
import type { AskCtx, Asked, HostedSettingsAnswer, KeyState, NameAt } from './types.ts';

// record-constants.ts is the suffix's home; the builders here, plan/walk.ts and update/asks.ts read it through this file.
export { RECOMMENDED_SUFFIX };
// The `remote` route is worded 'hosted' in every ask: alfred-code's stop guard reads a bare 'remote' in an ask as git
// state and sends Claude to fetch and re-ask (docs/sources.md, 'alfred-code hooks over the commands').
export const ROUTE_WORD: Record<string, string> = { remote: 'hosted', local: 'local', bridge: 'bridge' };
// A word with its first letter in capitals: a route's word as its option label shows it, which record.ts reads back.
export const capitalized = (word: string): string => `${word[0]!.toUpperCase()}${word.slice(1)}`;
export const HEADER: Record<string, string> = { code: 'Code', docs: 'Docs, forges', browsers: 'Browsers', machine: 'Machine', own: 'On their own', roots: 'Root folders' };
export const SCOPE_TEXT: Record<string, string> = {
    local: 'this project, only you (~/.claude.json, under this project)',
    project: "the .mcp.json in this folder - every session started here or below it; it names this machine's paths, so a teammate's clone points at yours, and never holds a key",
    user: "every project on this machine (Claude Code's user scope, in ~/.claude.json)",
};
// Only words change (spec D1): the value stays user, project or local in picks, answers, the plan and on the CLI.
export const SCOPE_LABEL: Record<string, string> = { user: 'Global', project: 'Project', local: 'Local' };
export const scopeOfLabel = (label: unknown): string | null => Object.keys(SCOPE_LABEL).find((scope) => SCOPE_LABEL[scope] === plainLabel(String(label))) || null;
export const scopeText = (scope: string): string | undefined => SCOPE_TEXT[scope];
// every scope question lists the recommended scope first, then the others in this order (the user's ruling, 2026-11-10)
export const SCOPE_ORDER = ['user', 'project', 'local'];
// every scope a registration can have: its home is core/constants.ts, which inventory/ reads too; pick.ts reads it here
export { ALL_SCOPES };

// M1 (docs/sources.md 'Claude Code - headersHelper', 2026-11-11, Claude Code 2.1.322): does a parent folder's helper,
// named by absolute path, run in a session started in a child folder? Measured: no.
export const PARENT_HELPER_IN_CHILD = false;
// what a user does about it, said wherever a plan or an ask says a child folder's session has no key
export const CHILD_FOLDER_REMEDY = 'start a session in the folder that holds `.mcp.json`, or move the server to Global with configure';

// A row's word in a key name: its id in capitals, dashes as underscores (SENTRY for sentry).
const rowWord = (row: CatalogRow): string => row.id.toUpperCase().replace(/-/g, '_');

// Where a route's key is, by name only (spec D3, D9): { variable, kind, scope, files, found } - or null for a route that
// takes no key. `variable` is the catalog's default name; `kind` 'helper' for a hosted route (mcp-headers.js reads the
// hosted chain when Claude Code connects), 'stdio' for a local one (the apply reads the stdio chain); `files` that chain
// at `scope`; `names` each name D9 offers that a file there fills, with the first such file ({ name, file }), in chain
// order; `found` the default name's entry when it is filled, else the first other, else null. `old` the same for the
// files 0.1.x read (names only). `context.keyHome`, when the context has one, decides whether files outside the project
// are read (null: none); else they are.
export function keyStateOf(row: CatalogRow, routeId: string, context: AskCtx | null | undefined, _alfredEnabled: unknown, scope: string = 'user'): KeyState | null
{
    const route = row.routes && row.routes[routeId];
    if (!route || !context) return null;
    const variable = route.helper ? route.helper.var : route.tokenVar;
    if (!variable) return null;
    const kind: KeyState['kind'] = route.helper ? 'helper' : 'stdio';
    const projectRoot = rootOf('project', context);
    const globalRoot = rootOf('global', context);
    const files = kind === 'helper'
        ? keys.hostedChain({ scope, projectRoot, globalRoot, globalNamed: Boolean(context.roots && context.roots.globalNamed), home: context.home, platform: context.platform })
        : keys.stdioChain({ scope, projectRoot, globalRoot, platform: context.platform });
    const readHome = Object.hasOwn(context, 'keyHome') ? Boolean(context.keyHome) : true;
    const pathApi = pathFor(context.platform);
    const inProject = (filePath: string) => { const relativePath = pathApi.relative(context.project, filePath); return Boolean(relativePath) && !relativePath.startsWith('..') && !pathApi.isAbsolute(relativePath); };
    const word = rowWord(row);
    const offered = (list: string[]) =>
    {
        const out: NameAt[] = [];
        for (const { file, names } of keys.filledNames(readHome ? list : list.filter(inProject)))
            for (const name of names) if (keys.offeredName(name, variable, word) && !out.some((nameAt) => nameAt.name === name)) out.push({ name, file });
        return out;
    };
    const names = offered(files);
    const found = names.find((nameAt) => nameAt.name === variable) || names[0] || null;
    const old = offered(keys.oldFiles(context.project, context.home)).filter((nameAt) => !names.some((filled) => filled.name === nameAt.name));
    return { variable, kind, scope, files, names, found, old };
}

// D9: which name holds a tool's key in .mcps-secrets. Options: the catalog's name, up to two other names found holding
// the row id (in the chain, then in a file 0.1.x read), and 'A name you choose', asked next. Recommended: `current` (the
// name the registration uses, for configure), else a name filled in the chain - the default first when both are -
// else the default. -> { question, answers: { <label as shown>: NAME | 'named' } } | null for a route with no key here.
export function keyNameQuestion(row: CatalogRow, routeId: string, scope: string, context: AskCtx | null | undefined, { current = null }: { current?: string | null | undefined } = {}): Asked<string> | null
{
    const keyState = keyStateOf(row, routeId, context, null, scope);
    if (!keyState || (keyState.kind === 'stdio' && scope === 'project')) return null;
    const descriptions = new Map<string, string>();
    for (const nameAt of keyState.names) descriptions.set(nameAt.name, `filled in ${nameAt.file}`);
    for (const nameAt of keyState.old) descriptions.set(nameAt.name, `in ${nameAt.file} - move it to .mcps-secrets under this name`);
    if (!descriptions.has(keyState.variable)) descriptions.set(keyState.variable, `the catalog's name - add it to ${keyState.files[0]}`);
    const recommended = current || (keyState.found ? keyState.found.name : keyState.variable);
    if (!descriptions.has(recommended)) descriptions.set(recommended, 'the name it uses now');
    const others = [...keyState.names, ...keyState.old].map((nameAt) => nameAt.name).filter((name) => name !== keyState.variable && name !== recommended).slice(0, 2);
    const order = [recommended, ...[keyState.variable, ...others].filter((name) => name !== recommended)].slice(0, 3);
    const options = [...order.map((name, i) => ({ label: `${name}${i === 0 ? RECOMMENDED_SUFFIX : ''}`, description: descriptions.get(name)!, value: name })), { label: 'A name you choose', description: 'a name of yours, asked next - its value goes in .mcps-secrets, never in the chat', value: 'named' }];
    return {
        question: { id: `${PREFIX.keyName}${row.id}`, header: 'Key name', multiSelect: false, question: `Which name holds ${row.label}'s key in .mcps-secrets?`, options: options.map(({ label, description }) => ({ label, description })) },
        answers: Object.fromEntries(options.map((option) => [option.label, option.value])),
    };
}

// 0.4.0: which names fill a bridge route's URL, one question per catalog URL variable. Options: the recommended name, the
// catalog's, one other name found, 'A name you choose' (asked next). Recommended: `current[VAR]` (configure), else the
// catalog's - never a name found, which is a guess: SENTRY_ENVIRONMENT=production is a valid slug and would connect to
// the wrong URL with no warning, while an unfilled catalog name stops the bridge with its name (review I2). A name found
// is filled in the hosted chain, holds the row word (SENTRY for sentry), and is not a credential, the key's name, or a
// name an earlier question recommends. -> [{ var, question, answers }] ([] for another route)
export function urlNameQuestions(row: CatalogRow, routeId: string, scope: string, context: AskCtx | null | undefined, { current = null, keyName = null }: { current?: Record<string, string> | null | undefined; keyName?: string | null | undefined } = {}): (Asked<string> & { var: string })[]
{
    const route = row.routes && row.routes[routeId];
    if (!route || route.runtime !== 'bridge' || !context) return [];
    const keyState = keyStateOf(row, routeId, context, null, scope);
    const word = rowWord(row);
    const key = keyName || route.helper!.var;
    const catalogNames = new Set((route.urlVars || []).map((urlVar) => urlVar.var));
    const found: NameAt[] = [];
    for (const { file, names } of keys.filledNames(keyState ? keyState.files : []))
        for (const name of names)
            if (name.includes(word) && !keys.credentialName(name) && name !== key && !catalogNames.has(name) && !found.some((nameAt) => nameAt.name === name)) found.push({ name, file });
    const taken = new Set<string>();
    return (route.urlVars || []).map((urlVar) =>
    {
        const descriptions = new Map<string, string>();
        const free = found.filter((nameAt) => !taken.has(nameAt.name));
        for (const nameAt of free) descriptions.set(nameAt.name, `filled in ${nameAt.file}`);
        const filledHere = keyState ? keys.filledNames(keyState.files).find((filledFile) => filledFile.names.includes(urlVar.var)) : null;
        descriptions.set(urlVar.var, filledHere ? `the catalog's name - filled in ${filledHere.file}` : `the catalog's name - add it to ${keyState ? keyState.files[0] : '.mcps-secrets'}`);
        const recommended = (current && current[urlVar.var]) || urlVar.var;
        if (!descriptions.has(recommended)) descriptions.set(recommended, 'the name it uses now');
        taken.add(recommended);
        const other = free.map((nameAt) => nameAt.name).find((name) => name !== recommended && name !== urlVar.var);
        const order = [recommended, ...[urlVar.var, other].filter((name) => name && name !== recommended)].slice(0, 3) as string[];
        const options = [...order.map((name, i) => ({ label: `${name}${i === 0 ? RECOMMENDED_SUFFIX : ''}`, description: descriptions.get(name)!, value: name })), { label: 'A name you choose', description: 'a name of yours, asked next - its value goes in .mcps-secrets', value: 'named' }];
        return {
            var: urlVar.var,
            question: { id: `${PREFIX.urlName}${row.id}-${urlVar.var}`, header: 'URL name', multiSelect: false, question: `Which name holds ${row.label}'s ${urlVar.label} in .mcps-secrets?`, options: options.map(({ label, description }) => ({ label, description })) },
            answers: Object.fromEntries(options.map((option) => [option.label, option.value])),
        };
    });
}

// D9: a stdio route's settings - 'Keep these settings' listing NAME=value, or 'No settings' for an empty env, then
// 'Change or add a setting', after which the walk asks for NAME=value pairs. `entry`: the registration as read
// (configure), else the catalog's env. -> { question, answers: { <label>: 'keep' | 'change' } } | null for a hosted route.
// A hosted route that lists `settings` (sonarqube) asks its tools question instead, answered with fixed pairs.
export function settingsQuestion(row: CatalogRow, routeId: string, { entry = null }: { entry?: ServerEntry | null | undefined } = {}): Asked<string | HostedSettingsAnswer> | null
{
    const hosted = row.routes[routeId];
    if (routeId === 'remote' && hosted && hosted.settings) return hostedSettingsQuestion(row, hosted, entry);
    // a hosted route, and a bridge (0.4.0), take no settings
    if (routeId === 'remote' || !row.routes[routeId] || row.routes[routeId].runtime === 'bridge') return null;
    const pairs = settingsOf(row, routeId, entry);
    const keep = pairs.length ? { label: `Keep these settings${RECOMMENDED_SUFFIX}`, description: pairs.map(([settingName, value]) => `${settingName}=${value}`).join(', ') } : { label: `No settings${RECOMMENDED_SUFFIX}`, description: "the server's own defaults" };
    const change = { label: 'Change or add a setting', description: 'NAME=value pairs, asked next - a key goes in .mcps-secrets, never here' };
    return {
        question: { id: `${PREFIX.settings}${row.id}`, header: 'Settings', multiSelect: false, question: `${row.label}'s settings`, options: [keep, change] },
        answers: { [keep.label]: 'keep', [change.label]: 'change' },
    };
}

// The live registration, read in this process when the env names an account (R1: the inventory file is masked); a
// caller that passes no env reads none.
export const liveReader = (project: string, env: Env | null | undefined): ((name: string, scope: string) => ServerEntry | undefined) => (env && (env.CLAUDE_CONFIG_DIR || env.HOME || env.USERPROFILE) ? (name: string, scope: string) => readRegistration(name, scope, project, env) : () => undefined);

// The key a stdio registration holds, from its first token field: a value, or null for none (empty, ${VAR} only).
export function heldKey(entry: ServerEntry, route: CatalogRoute | null | undefined): string | null
{
    const field = keys.tokenFields(entry, route)[0];
    const value = field ? keys.valueAt(entry, field.at) : undefined;
    return typeof value === 'string' && value !== '' && !keys.PLACEHOLDER.test(value) ? value : null;
}

// Every scope for every row (the user's ruling, 2026-11-10: 'It must give options as user/project/local'). The one left
// out: project for a stdio route that needs a key, which holds it written in - the committed .mcp.json never carries one.
export function scopesFor(row: CatalogRow, routeId: string, _context: AskCtx | null | undefined = null): string[]
{
    const route = row.routes && row.routes[routeId];
    // a bridge holds names only, never a key (0.4.0)
    const stdioKey = routeId !== 'remote' && route && route.runtime !== 'bridge' && route.authMode === 'token';
    return ALL_SCOPES.filter((scope) => scope !== 'project' || !stdioKey);
}

// Project for every route scopesFor offers it to, Local for the one it does not (a stdio route that needs a key: it holds
// the key written in, which the committed .mcp.json never carries). One scope and one root per project (G1, the user's
// request of 2026-11-18: 'install scope is not consolidated'); this reverses 2026-11-11's Global for a hosted keyed
// route. The cost (R1, M1): a session started in a child folder runs no parent folder's helper, so such a server
// connects there without its key - scopeQuestion and the plan note say so (CHILD_NO_KEY), and `configure` moves it to
// Global. A user who then picks OAuth or no key keeps the scope picked.
export function recommendedScope(row: CatalogRow, routeId: string): string
{
    return scopesFor(row, routeId).includes('project') ? 'project' : 'local';
}

