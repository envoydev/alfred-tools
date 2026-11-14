// The key questions: which key a hosted route reads, and the name it is kept under.
import path from 'node:path';
import { rootOf } from '../entries/locations.ts';
import { settingsOf } from '../entries/entry.ts';
import * as keys from '../keys/keys.ts';
import { readRegistration } from '../core/account.ts';

export const REC = ' (Recommended)';
// The `remote` route is worded 'hosted' in every ask: alfred-code's stop guard reads a bare 'remote' in an ask as git
// state and sends Claude to fetch and re-ask (docs/sources.md, 'alfred-code hooks over the commands').
export const ROUTE_WORD = { remote: 'hosted', local: 'local', bridge: 'bridge' };
export const HEADER = { code: 'Code', docs: 'Docs, forges', browsers: 'Browsers', machine: 'Machine', own: 'On their own', roots: 'Root folders' };
export const SCOPE_TEXT = {
    local: 'this project, only you (~/.claude.json, under this project)',
    project: "the .mcp.json in this folder - every session started here or below it; it names this machine's paths, so a teammate's clone points at yours, and never holds a key",
    user: "every project on this machine (Claude Code's user scope, in ~/.claude.json)",
};
// Only words change (spec D1): the value stays user, project or local in picks, answers, the plan and on the CLI.
export const SCOPE_LABEL = { user: 'Global', project: 'Project', local: 'Local' };
export const scopeOfLabel = (label) => Object.keys(SCOPE_LABEL).find((s) => SCOPE_LABEL[s] === String(label).replace(/ \(Recommended\)$/, '')) || null;
export const scopeText = (s) => SCOPE_TEXT[s];
// every scope question lists the recommended scope first, then the others in this order (the user's ruling, 2026-11-10)
export const SCOPE_ORDER = ['user', 'project', 'local'];

// M1 (docs/sources.md 'Claude Code - headersHelper', 2026-11-11, Claude Code 2.1.322): does a parent folder's helper,
// named by absolute path, run in a session started in a child folder? Measured: no.
export const PARENT_HELPER_IN_CHILD = false;

// Where a route's key is, by name only (spec D3, D9): { variable, kind, scope, files, found } - or null for a route that
// takes no key. `variable` is the catalog's default name; `kind` 'helper' for a hosted route (mcp-headers.js reads the
// hosted chain when Claude Code connects), 'stdio' for a local one (the apply reads the stdio chain); `files` that chain
// at `scope`; `names` each name D9 offers that a file there fills, with the first such file ({ name, file }), in chain
// order; `found` the default name's entry when it is filled, else the first other, else null. `old` the same for the
// files 0.1.x read (names only). `ctx.keyHome`, when the ctx has one, decides whether files outside the project are
// read (null: none); else they are.
export function keyStateOf(row, routeId, ctx, alfredEnabled, scope = 'user')
{
    const route = row.routes && row.routes[routeId];
    if (!route || !ctx) return null;
    const variable = route.helper ? route.helper.var : route.tokenVar;
    if (!variable) return null;
    const kind = route.helper ? 'helper' : 'stdio';
    const projectRoot = rootOf('project', ctx);
    const globalRoot = rootOf('global', ctx);
    const files = kind === 'helper'
        ? keys.hostedChain({ scope, projectRoot, globalRoot, globalNamed: Boolean(ctx.roots && ctx.roots.globalNamed), home: ctx.home })
        : keys.stdioChain({ scope, projectRoot, globalRoot });
    const readHome = Object.hasOwn(ctx, 'keyHome') ? Boolean(ctx.keyHome) : true;
    const inProject = (f) => { const rel = path.relative(ctx.project, f); return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel); };
    const word = row.id.toUpperCase().replace(/-/g, '_');
    const offered = (list) =>
    {
        const out = [];
        for (const { file, names } of keys.filledNames(readHome ? list : list.filter(inProject)))
            for (const name of names) if (keys.offeredName(name, variable, word) && !out.some((n) => n.name === name)) out.push({ name, file });
        return out;
    };
    const names = offered(files);
    const found = names.find((n) => n.name === variable) || names[0] || null;
    const old = offered(keys.oldFiles(ctx.project, ctx.home)).filter((n) => !names.some((c) => c.name === n.name));
    return { variable, kind, scope, files, names, found, old };
}

// D9: which name holds a tool's key in .mcps-secrets. Options: the catalog's name, up to two other names found holding
// the row id (in the chain, then in a file 0.1.x read), and 'A name you choose', asked next. Recommended: `current` (the
// name the registration uses, for configure), else a name filled in the chain - the default first when both are -
// else the default. -> { question, answers: { <label as shown>: NAME | 'named' } } | null for a route with no key here.
export function keyNameQuestion(row, routeId, scope, ctx, { current = null } = {})
{
    const ks = keyStateOf(row, routeId, ctx, null, scope);
    if (!ks || (ks.kind === 'stdio' && scope === 'project')) return null;
    const desc = new Map();
    for (const n of ks.names) desc.set(n.name, `filled in ${n.file}`);
    for (const n of ks.old) desc.set(n.name, `in ${n.file} - move it to .mcps-secrets under this name`);
    if (!desc.has(ks.variable)) desc.set(ks.variable, `the catalog's name - add it to ${ks.files[0]}`);
    const rec = current || (ks.found ? ks.found.name : ks.variable);
    if (!desc.has(rec)) desc.set(rec, 'the name it uses now');
    const others = [...ks.names, ...ks.old].map((n) => n.name).filter((n) => n !== ks.variable && n !== rec).slice(0, 2);
    const order = [rec, ...[ks.variable, ...others].filter((n) => n !== rec)].slice(0, 3);
    const opts = [...order.map((n, i) => ({ label: `${n}${i === 0 ? REC : ''}`, description: desc.get(n), value: n })), { label: 'A name you choose', description: 'a name of yours, asked next - its value goes in .mcps-secrets, never in the chat', value: 'named' }];
    return {
        question: { id: `keyname-${row.id}`, header: 'Key name', multiSelect: false, question: `Which name holds ${row.label}'s key in .mcps-secrets?`, options: opts.map(({ label, description }) => ({ label, description })) },
        answers: Object.fromEntries(opts.map((o) => [o.label, o.value])),
    };
}

// 0.4.0: which names fill a bridge route's URL, one question per catalog URL variable. Options: the recommended name, the
// catalog's, one other name found, 'A name you choose' (asked next). Recommended: `current[VAR]` (configure), else the
// catalog's - never a name found, which is a guess: SENTRY_ENVIRONMENT=production is a valid slug and would connect to
// the wrong URL with no warning, while an unfilled catalog name stops the bridge with its name (review I2). A name found
// is filled in the hosted chain, holds the row word (SENTRY for sentry), and is not a credential, the key's name, or a
// name an earlier question recommends. -> [{ var, question, answers }] ([] for another route)
export function urlNameQuestions(row, routeId, scope, ctx, { current = null, keyName = null } = {})
{
    const route = row.routes && row.routes[routeId];
    if (!route || route.runtime !== 'bridge' || !ctx) return [];
    const ks = keyStateOf(row, routeId, ctx, null, scope);
    const word = row.id.toUpperCase().replace(/-/g, '_');
    const key = keyName || route.helper.var;
    const catalogNames = new Set((route.urlVars || []).map((v) => v.var));
    const found = [];
    for (const { file, names } of keys.filledNames(ks ? ks.files : []))
        for (const name of names)
            if (name.includes(word) && !keys.credentialName(name) && name !== key && !catalogNames.has(name) && !found.some((n) => n.name === name)) found.push({ name, file });
    const taken = new Set();
    return (route.urlVars || []).map((v) =>
    {
        const desc = new Map();
        const free = found.filter((n) => !taken.has(n.name));
        for (const n of free) desc.set(n.name, `filled in ${n.file}`);
        const filledHere = ks ? keys.filledNames(ks.files).find((f) => f.names.includes(v.var)) : null;
        desc.set(v.var, filledHere ? `the catalog's name - filled in ${filledHere.file}` : `the catalog's name - add it to ${ks ? ks.files[0] : '.mcps-secrets'}`);
        const rec = (current && current[v.var]) || v.var;
        if (!desc.has(rec)) desc.set(rec, 'the name it uses now');
        taken.add(rec);
        const other = free.map((n) => n.name).find((n) => n !== rec && n !== v.var);
        const order = [rec, ...[v.var, other].filter((n) => n && n !== rec)].slice(0, 3);
        const opts = [...order.map((n, i) => ({ label: `${n}${i === 0 ? REC : ''}`, description: desc.get(n), value: n })), { label: 'A name you choose', description: 'a name of yours, asked next - its value goes in .mcps-secrets', value: 'named' }];
        return {
            var: v.var,
            question: { id: `urlname-${row.id}-${v.var}`, header: 'URL name', multiSelect: false, question: `Which name holds ${row.label}'s ${v.label} in .mcps-secrets?`, options: opts.map(({ label, description }) => ({ label, description })) },
            answers: Object.fromEntries(opts.map((o) => [o.label, o.value])),
        };
    });
}

// D9: a stdio route's settings - 'Keep these settings' listing NAME=value, or 'No settings' for an empty env, then
// 'Change or add a setting', after which the walk asks for NAME=value pairs. `entry`: the registration as read
// (configure), else the catalog's env. -> { question, answers: { <label>: 'keep' | 'change' } } | null for a hosted route.
export function settingsQuestion(row, routeId, { entry = null } = {})
{
    // a hosted route, and a bridge (0.4.0), take no settings
    if (routeId === 'remote' || !row.routes[routeId] || row.routes[routeId].runtime === 'bridge') return null;
    const pairs = settingsOf(row, routeId, entry);
    const keep = pairs.length ? { label: `Keep these settings${REC}`, description: pairs.map(([k, v]) => `${k}=${v}`).join(', ') } : { label: `No settings${REC}`, description: "the server's own defaults" };
    const change = { label: 'Change or add a setting', description: 'NAME=value pairs, asked next - a key goes in .mcps-secrets, never here' };
    return {
        question: { id: `settings-${row.id}`, header: 'Settings', multiSelect: false, question: `${row.label}'s settings`, options: [keep, change] },
        answers: { [keep.label]: 'keep', [change.label]: 'change' },
    };
}

// The live registration, read in this process when the env names an account (R1: the inventory file is masked); a
// caller that passes no env reads none.
export const liveReader = (project, env) => (env && (env.CLAUDE_CONFIG_DIR || env.HOME || env.USERPROFILE) ? (name, scope) => readRegistration(name, scope, project, env) : () => undefined);

// The key a stdio registration holds, from its first token field: a value, or null for none (empty, ${VAR} only).
export function heldKey(entry, route)
{
    const f = keys.tokenFields(entry, route)[0];
    const v = f ? f.at.reduce((o, k) => (o == null ? undefined : o[k]), entry) : undefined;
    return typeof v === 'string' && v !== '' && !keys.PLACEHOLDER.test(v) ? v : null;
}

// local for a local route (its paths and Python are this machine's); for a hosted route that can send a key, the scope M1
// settles (spec F2): global while a parent folder's helper does not run in a child folder's session (a global helper has
// an absolute path, needs no folder trust and serves every session, a workspace child included), else project. A user
// who then picks OAuth or no key keeps the scope picked. A hosted route with no key: project.
export function recommendedScope(row, routeId)
{
    // a bridge holds names only and connects in a child folder too (0.4.0 Ruling 6): this project's own server
    if (row.routes[routeId] && row.routes[routeId].runtime === 'bridge') return 'project';
    if (routeId !== 'remote') return 'local';
    const route = row.routes[routeId];
    if (!route || !route.helper) return 'project';
    return PARENT_HELPER_IN_CHILD ? 'project' : 'user';
}
// an optional key is sent by default when a name D9 offers is filled in the chain the chosen scope reads
export const keyToSend = (keyState) => Boolean(keyState && keyState.found);

