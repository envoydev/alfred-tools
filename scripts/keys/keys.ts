// KEYS - the key files, and how a key goes into a stdio registration (spec D3, D7).
//
// A key is read here, in the process that writes the registration, and goes nowhere else: never printed, never in a file
// a command line names, never asked for. The user fills the key files by hand; the plugin writes names only.
//
//   .mcps-secrets      one per root folder (the project root, the global root), in the dotenv grammar below. A hosted
//                      route's key is read by mcp-headers.js when Claude Code connects (hostedChain), a stdio route's by
//                      the apply (stdioChain); project scope takes no stdio key.
//   the 0.1.x files    alfred-code's two stores and preferred-tools' own key files: read for a name only (oldHolding),
//                      so a blocked fix can say where a key still sits.
import fs from 'node:fs';
import path from 'node:path';

const KEY_FILE = path.join('.preferred-tools', '.secrets');
const projectFile = (project) => path.join(project, KEY_FILE);
const alfredStores = (project) => ['.secrets', '.sensitive-data'].map((n) => path.join(project, '.alfred', n));

// alfred-code's dotenv grammar (v3.2.1 stack/hooks/layout.js readDotenv): `KEY=value`, `export ` allowed before it, one
// pair of matching quotes around the trimmed value dropped; `#` and `;` lines and blank lines are comments, any other line
// is skipped. A BOM decides UTF-16 or UTF-8. -> { KEY: value } | null when the file cannot be read
const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;
const COMMENT = /^\s*(?:[#;]|$)/;
// A value as written: inside matching quotes it stands as it is; unquoted, a note after whitespace and # is dropped -
// `NAME=abc # work` is abc, `NAME=abc#1` is abc#1
const unquote = (raw) =>
{
    const q = /^\s*(["'])(.*?)\1(?:\s+#.*)?\s*$/.exec(raw);
    return q ? q[2] : raw.replace(/\s+#.*$/, '').trim();
};
export function readDotenv(file)
{
    let buf;
    try { buf = fs.readFileSync(file); }
    catch { return null; }
    const text = buf[0] === 0xff && buf[1] === 0xfe ? buf.subarray(2).toString('utf16le') : buf.toString('utf8').replace(/^﻿/, '');
    const values = {};
    for (const line of text.split(/\r?\n/))
    {
        if (COMMENT.test(line)) continue;
        const m = LINE.exec(line);
        if (m) values[m[1]] = unquote(m[2]);
    }
    return values;
}

// A name D9 offers for a key: the catalog's default, or a key-shaped name (ending in TOKEN, KEY or PAT, in any case) that
// holds the row word (GITHUB, SENTRY, CONTEXT7) - a key kept under a name the catalog does not use; a webhook secret or a
// client id is not one.
const KEY_SHAPED = /(?:TOKEN|KEY|PAT)$/;
const nearMiss = (n, name, word) => n !== name && Boolean(word) && n.toUpperCase().includes(word) && KEY_SHAPED.test(n.toUpperCase());
export const offeredName = (n, name, word) => n === name || nearMiss(n, name, word);

// The token fields a catalog route defines and an entry holds: [{ at: ['env', K] | ['headers', H] | ['args', i], template }]
export function tokenFields(entry, route)
{
    if (!route || !route.tokenVar || !entry) return [];
    const ref = `\${${route.tokenVar}}`;
    const out = [];
    for (const key of ['env', 'headers'])
        for (const [k, template] of Object.entries(route[key] || {}))
            if (typeof template === 'string' && template.includes(ref) && entry[key] && Object.hasOwn(entry[key], k)) out.push({ at: [key, k], template });
    const opt = route.optionalArgs && route.optionalArgs.token;
    const i = opt && Array.isArray(entry.args) ? entry.args.indexOf(opt[0]) : -1;
    if (i >= 0 && i + 1 < entry.args.length) out.push({ at: ['args', i + 1], template: opt[1] });
    return out;
}

export const valueAt = (entry, at) => at.reduce((o, k) => (o == null ? undefined : o[k]), entry);
export const PLACEHOLDER = /^\s*(?:[A-Za-z][\w-]*\s+)?(?:\$\{[A-Za-z_][A-Za-z0-9_]*(?::-[^}]*)?\})+\s*$/;

// fillKeys(entry, row, routeId, scope, found) -> a copy with each token field set by the target scope: at project scope
// the route's ${VAR} form, whatever the entry held; at local and user scope the found value in the route's form, or, when
// the key is missing, what the entry holds.
export function fillKeys(entry, row, routeId, scope, found = {})
{
    const route = row && row.routes ? row.routes[routeId] : null;
    const fields = tokenFields(entry, route);
    if (!fields.length) return entry;
    const value = found[route.tokenVar];
    if (scope !== 'project' && typeof value !== 'string') return entry;
    const out = JSON.parse(JSON.stringify(entry));
    for (const f of fields)
    {
        const parent = valueAt(out, f.at.slice(0, -1));
        parent[f.at[f.at.length - 1]] = scope === 'project' ? f.template : f.template.split(`\${${route.tokenVar}}`).join(value);
    }
    return out;
}

// ---- .mcps-secrets (spec D3) -----------------------------------------------------------------------------------------
// One key file per root folder, `.mcps-secrets`, in the grammar above, its values written by the user alone. A hosted
// route's key is read by the header helper (mcp-headers.js) when Claude Code connects, a stdio route's by the apply; each
// chain below is the order its reader takes, so a plan reads what the registration will read. A value leaves this file
// only through valueIn, in the process that asked.
export const SECRETS = '.mcps-secrets';
export const NAME_RULE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const secretsIn = (dir) => path.join(dir, SECRETS);
const uniq = (list) => [...new Set(list)];

// hostedChain({ scope, projectRoot, globalRoot, globalNamed, home }) -> the files the helper reads, in order: the root
// beside it (the project root at project and local scope, the global root at user scope); at local scope the global root
// when it is a named folder (the helper's third argument); then ~/.preferred-tools, then ~/.alfred.
export function hostedChain({ scope, projectRoot, globalRoot, globalNamed = false, home })
{
    const beside = scope === 'user' ? globalRoot : projectRoot;
    const named = scope === 'local' && globalNamed ? globalRoot : null;
    return uniq([beside, named, path.join(home, '.preferred-tools'), path.join(home, '.alfred')].filter(Boolean).map(secretsIn));
}

// stdioChain({ scope, projectRoot, globalRoot }) -> the files the apply reads a stdio key from: local scope the project
// root's, then the global root's; user scope the global root's. Project scope takes no stdio key (spec D5).
export function stdioChain({ scope, projectRoot, globalRoot })
{
    if (scope === 'local') return uniq([projectRoot, globalRoot].filter(Boolean).map(secretsIn));
    if (scope === 'user') return globalRoot ? [secretsIn(globalRoot)] : [];
    return [];
}

// The first non-empty value of `name` in `files` -> { value, file } | null. An empty value counts as missing.
export function valueIn(files, name)
{
    for (const file of files)
    {
        const values = readDotenv(file);
        if (values && values[name]) return { value: values[name], file };
    }
    return null;
}

// The names each file holds with a value -> [{ file, names }]. Every value is dropped here.
// The names a key file defines, filled or not - the values stay in this process. [] when the file cannot be read.
export const namesIn = (file) => Object.keys(readDotenv(file) || {});
export const filledNames = (files) => files.map((file) => ({ file, names: Object.entries(readDotenv(file) || {}).filter(([, v]) => v !== '').map(([k]) => k) }));

// The key files 0.1.x read, which 0.2.0 reads for names only: alfred-code's store in the project and in each parent folder
// (its chain walks the parents, so a workspace root's store served its child repos), the project's
// .preferred-tools/.secrets, then the home one.
export function oldFiles(project, home)
{
    const stores = [];
    for (let dir = path.resolve(project); ; dir = path.dirname(dir))
    {
        stores.push(...alfredStores(dir));
        if (path.dirname(dir) === dir) break;
    }
    return uniq([...stores, projectFile(project), path.join(home, KEY_FILE)]);
}

// The first old file holding `name` with a value -> its path | null. The value is never returned.
export function oldHolding(project, home, name)
{
    return oldFiles(project, home).find((file) => Boolean((readDotenv(file) || {})[name])) || null;
}

// The first name in `files` whose value equals `value` -> its name | null. Compared in this process; the value is never
// returned or printed.
export function nameOfValue(files, value)
{
    if (typeof value !== 'string' || value === '') return null;
    for (const file of files)
    {
        const hit = Object.entries(readDotenv(file) || {}).find(([, v]) => v === value);
        if (hit) return hit[0];
    }
    return null;
}

// A name that looks like a credential (spec D9, the docs' own test): a key belongs in .mcps-secrets, never in a setting.
export const credentialName = (n) => /TOKEN|SECRET|PASSWORD|KEY|AUTH/i.test(String(n));

