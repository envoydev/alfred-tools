// alfred-tools mcp-bridge 4
'use strict';
// The bridge a hosted route of runtime 'bridge' registers (0.4.0): `node <root>/mcp-bridge.js <url template> <KEY_NAME>
// <SCHEME> <package@version> [<global root>] [--header NAME=VAR | --header NAME:value]...`. A hosted server whose URL holds a per-project value - Sentry's
// organization slug - has no header for it, and headersHelper changes headers only; so at each start this file fills
// the template's `{NAME}` segments from .mcps-secrets and runs the pinned mcp-remote through npx against the filled URL.
// Changing a value and restarting the server is enough. The registration holds variable names only.
//
// It is copied into the root folder beside mcp-headers.js and runs outside the plugin, so it requires only node: modules
// and ./mcp-headers.js, whose reader it shares (helper 4 or newer): the same .mcps-secrets chain, the first non-empty
// value wins - but for an optional name the nearest file that has its line decides, even empty, so 'leave it empty for
// the whole organization' holds whatever a farther file says. A key reaches mcp-remote only as PT_BRIDGE_AUTH in its environment; the command line holds
// `Authorization:${PT_BRIDGE_AUTH}`, which mcp-remote expands itself (docs/sources.md, 'mcp-remote 0.16.0'). The bridge
// prints nothing but its own one error line, which names variables and files, never a value - so it needs no
// CLAUDE_CODE_MCP_SERVER_NAME guard.
//
// A URL value must be a plain name (`^[A-Za-z0-9][A-Za-z0-9_.-]*$`), so no value can change the path, reach cmd.exe as a
// metacharacter or read as a flag; a template name that is the key's name or reads as a credential is refused before
// any file is read, and a value equal to the key's is refused, so a key never goes in a URL. A missing key exits 1
// before npx starts: mcp-remote never sends a request with no Authorization header, the one that would open its OAuth
// sign-in in a browser.
//
// A `--header` pair (bridge 3) sends one more header, in the grammar the helper's pairs have - its own copy here, so a root
// with helper 4 or 5 still runs the bridge; tests/lint.ts checks the rules are equal. `NAME=VAR` reads VAR from the same
// chain as the key; its value reaches mcp-remote only as PT_BRIDGE_H<i> in its environment, and the command line holds
// `NAME:${PT_BRIDGE_H<i>}`. An empty one is left out and takes no number. `NAME:value` is a fixed setting and goes in the
// command line as written. A VAR that is the key's name, or a value equal to the key's, is refused.
//
// The run mode (bridge 4): `node mcp-bridge.js --run <ENV>=<KEY_NAME>[?] [<global root>] -- <command> [<args>...]` starts a
// stdio server with one key. At each start it reads KEY_NAME from the stdio chain - .mcps-secrets beside the bridge, then
// in the global root, the first non-empty value wins - and starts the command with the value as ENV in the child's
// environment only; the registration holds names, never a value. `?` makes the key optional: with none, the child starts
// without it. A usage error exits 2 before any file is read; a required key with no value exits 1 before the command starts.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const BRIDGE_VERSION = 4;
const NEEDS_HELPER = 4;
// a copy of keys.js credentialName's test (tests/lint.js checks the two are equal)
const CREDENTIAL = /TOKEN|SECRET|PASSWORD|KEY|AUTH/i;
const NAME_RULE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SCHEME_RULE = /^[!-~]+$/;
const PACKAGE_RULE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*@[0-9A-Za-z][0-9A-Za-z.+-]*$/;
const HEADER_RULE = /^[A-Za-z0-9_-]+$/;
const FIXED_VALUE_RULE = /^[A-Za-z0-9_.,-]+$/;
const ENV_PREFIX = 'PT_BRIDGE_H';
const SLUG = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const ARG_RULE = /^[A-Za-z0-9_./:@+,=${}-]+$/;
const PLACEHOLDER = /^\{([^{}?]*)(\?)?\}$/;
const USAGE = 'usage: node mcp-bridge.js <url template> <KEY_NAME> <SCHEME> <package@version> [<root>] [--header NAME=VAR | --header NAME:value]...';
const PLAIN = 'is not a plain name (letters, digits, _ . -)';
const RUN_FLAG = '--run';
const RUN_END = '--';
const RUN_PAIR = /^([A-Za-z_][A-Za-z0-9_]*)=([A-Za-z_][A-Za-z0-9_]*)(\?)?$/;
const RESERVED_ENV = /^PT_BRIDGE_/;
const SECRETS = '.mcps-secrets';
const RUN_USAGE = 'usage: node mcp-bridge.js --run <ENV>=<KEY_NAME>[?] [<root>] -- <command> [<args>...]';
const EXIT = { usage: 2, failed: 1 };

// The template's origin and path segments. -> { origin, segments } | null (not http(s), a brace in the origin, a query or
// a fragment)
function partsOf(template)
{
    if (typeof template !== 'string') return null;
    const m = /^(https?:\/\/[^/{}?#]+)((?:\/[^/]*)*)$/.exec(template);
    if (!m) return null;
    const segments = m[2] ? m[2].split('/').slice(1) : [];
    if (segments.some((s) => !PLACEHOLDER.test(s) && /[{}?#]/.test(s))) return null;
    return { origin: m[1], segments };
}

// The template's variables, in order. `{NAME}` is a required whole segment; `{NAME?}` is optional and only the last.
// -> [{ name, optional }] | null (a usage error)
function templateNames(template)
{
    const parts = partsOf(template);
    if (!parts) return null;
    const names = [];
    for (const [i, s] of parts.segments.entries())
    {
        const m = PLACEHOLDER.exec(s);
        if (!m) continue;
        if (!NAME_RULE.test(m[1])) return null;
        if (m[2] && i !== parts.segments.length - 1) return null;
        if (names.some((n) => n.name === m[1])) return null;
        names.push({ name: m[1], optional: Boolean(m[2]) });
    }
    return names;
}

// The URL with each variable filled; an empty optional segment and its `/` are left out. `values` is
// { NAME: string | undefined }. -> { url } | { error } (naming the variable, never the value)
function fillTemplate(template, values)
{
    const parts = partsOf(template);
    if (!parts || !templateNames(template)) return { error: USAGE };
    const out = [];
    for (const s of parts.segments)
    {
        const m = PLACEHOLDER.exec(s);
        if (!m) { out.push(s); continue; }
        const v = values[m[1]];
        if (v === undefined || v === '')
        {
            if (m[2]) continue;
            return { error: `no value for ${m[1]}` };
        }
        if (!SLUG.test(v)) return { error: `${m[1]} ${PLAIN}` };
        out.push(v);
    }
    return { url: parts.origin + out.map((s) => `/${s}`).join('') };
}

// https, or http on the two hosts mcp-remote takes it for (127.0.0.1, localhost)
function originAllowed(origin)
{
    let u;
    try { u = new URL(origin); }
    catch { return false; }
    return u.protocol === 'https:' || (u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost'));
}

// One `--header` pair: NAME=VAR (the value of VAR from the chain) or NAME:value (a fixed value). -> pair | null
function parsePair(text)
{
    const at = text.search(/[=:]/);
    if (at < 1) return null;
    const header = text.slice(0, at);
    const rest = text.slice(at + 1);
    if (!HEADER_RULE.test(header) || header.toLowerCase() === 'authorization') return null;
    if (text[at] === '=') return NAME_RULE.test(rest) ? { header, var: rest } : null;
    return FIXED_VALUE_RULE.test(rest) ? { header, value: rest } : null;
}

// The arguments after <package@version>: at most one root, and any number of `--header <pair>`. -> { root, pairs } | null
function parsePairs(argv)
{
    let root = null;
    const pairs = [];
    for (let i = 0; i < argv.length; i++)
    {
        if (argv[i] === '--header')
        {
            const pair = i + 1 < argv.length ? parsePair(argv[i + 1]) : null;
            if (!pair) return null;
            pairs.push(pair);
            i++;
        }
        else if (root === null) root = argv[i];
        else return null;
    }
    return { root, pairs };
}

// What to start, read from argv and the .mcps-secrets chain; nothing is started here.
// argv: [template, KEY_NAME, SCHEME, '<package>@<version>', globalRoot?, ...'--header', pair]
// -> { error } | { url, keyName, keyFile, names, auth, command, args, childEnv }
function launch(argv, env, { dir, platform, helper } = {})
{
    const [template, keyName, scheme, pkg, ...extra] = argv;
    if (!template || !keyName || !NAME_RULE.test(keyName) || !scheme || !SCHEME_RULE.test(scheme) || !pkg || !PACKAGE_RULE.test(pkg)) return { error: USAGE };
    const parsed = parsePairs(extra);
    if (!parsed) return { error: USAGE };
    const { root: globalRoot, pairs } = parsed;
    const names = templateNames(template);
    if (!names) return { error: USAGE };
    if (!originAllowed(partsOf(template).origin)) return { error: 'the URL template is not https - mcp-remote takes http only on 127.0.0.1 or localhost' };
    // before any file is read: a key never goes in a URL
    const keyLike = names.find((n) => n.name === keyName || CREDENTIAL.test(n.name));
    if (keyLike) return { error: `${keyLike.name} in the URL template names a key - a key never goes in a URL` };
    const keyPair = pairs.find((p) => p.var === keyName);
    if (keyPair) return { error: `${keyPair.var} in a --header pair is the key's name - a key never goes in another header` };
    const h = helper || require('./mcp-headers.js');
    const home = env.HOME || env.USERPROFILE || os.homedir();
    const files = h.chainOf(dir, globalRoot ? path.resolve(globalRoot) : null, home);
    const key = h.valueIn(keyName, files);
    if (!key) return { error: `no value for ${keyName} in ${files.join(', ')}` };
    // an optional name: the nearest file that has its line, even empty
    const nearest = (name) =>
    {
        for (const file of files)
        {
            const all = h.readDotenv(file);
            if (all && Object.hasOwn(all, name)) return all[name] ? { value: all[name], file } : null;
        }
        return null;
    };
    const values = {};
    for (const n of names)
    {
        const v = n.optional ? nearest(n.name) : h.valueIn(n.name, files);
        if (!v)
        {
            if (n.optional) continue;
            return { error: `no value for ${n.name} in ${files.join(', ')}` };
        }
        if (!SLUG.test(v.value)) return { error: `${n.name} in ${v.file} ${PLAIN}` };
        // a key pasted under a URL name too: a key that is a slug would reach mcp-remote's argv and its log
        if (v.value === key.value) return { error: `${n.name} in ${v.file} holds the key's value - a key never goes in a URL` };
        values[n.name] = v.value;
    }
    const filled = fillTemplate(template, values);
    if (filled.error) return { error: filled.error };
    // each pair in the order it came; a =pair's value goes to the environment, numbered from 1 among those sent
    const pairArgs = [];
    const pairEnv = {};
    for (const pair of pairs)
    {
        if (!('var' in pair))
        {
            pairArgs.push('--header', `${pair.header}:${pair.value}`);
            continue;
        }
        const v = h.valueIn(pair.var, files);
        if (!v) continue;
        if (v.value === key.value) return { error: `${pair.var} in ${v.file} holds the key's value - a key never goes in another header` };
        const envName = `${ENV_PREFIX}${Object.keys(pairEnv).length + 1}`;
        pairEnv[envName] = v.value;
        pairArgs.push('--header', `${pair.header}:\${${envName}}`);
    }
    const tail = ['-y', pkg, filled.url, '--header', 'Authorization:${PT_BRIDGE_AUTH}', ...pairArgs, '--transport', 'http-only'];
    if (tail.some((a) => !ARG_RULE.test(a))) return { error: USAGE };
    const win = platform === 'win32';
    return {
        url: filled.url,
        keyName,
        keyFile: key.file,
        names,
        auth: h.authValue(scheme, key.value),
        command: win ? (env.ComSpec || 'cmd.exe') : 'npx',
        args: win ? ['/d', '/c', 'npx', ...tail] : tail,
        childEnv: { ...env, ...pairEnv, PT_BRIDGE_AUTH: h.authValue(scheme, key.value) },
    };
}

// The files the run mode reads a key from: .mcps-secrets in `dir` (the folder beside the bridge), then in the global root;
// equal to keys.js stdioChain at Local (dir = the project root) and at Global (dir = the global root, no globalRoot).
function runChain(dir, globalRoot)
{
    return [...new Set([dir, globalRoot].filter(Boolean).map((d) => path.join(d, SECRETS)))];
}

// The run mode's arguments, as they follow `--run`; no file is read. -> { envVar, keyName, optional, globalRoot, command, args } | { error, code }
function parseRun(argv)
{
    const usage = { error: RUN_USAGE, code: EXIT.usage };
    const pair = RUN_PAIR.exec(argv[0] || '');
    if (!pair || RESERVED_ENV.test(pair[1])) return usage;
    const end = argv.indexOf(RUN_END);
    if (end < 0) return usage;
    const between = argv.slice(1, end);
    const command = argv[end + 1];
    if (between.length > 1 || !command) return usage;
    return { envVar: pair[1], keyName: pair[2], optional: Boolean(pair[3]), globalRoot: between[0] || null, command, args: argv.slice(end + 2) };
}

// On Windows a command that is cmd, a .exe or a .com, or has a <name>.exe or <name>.com in a PATH folder, starts as it is;
// anything else (npx.cmd, a script) goes through cmd.exe. -> { command, args }
function winLaunch(command, args, env, exists)
{
    const base = path.win32.basename(command).toLowerCase();
    const direct = base === 'cmd' || base === 'cmd.exe' || /\.(exe|com)$/.test(base);
    const folders = String(env.PATH || env.Path || '').split(';').filter(Boolean);
    if (direct || folders.some((folder) => ['.exe', '.com'].some((ext) => exists(path.win32.join(folder, command + ext))))) return { command, args };
    return { command: env.ComSpec || 'cmd.exe', args: ['/d', '/c', command, ...args] };
}

// What to start for the run mode, read from argv (after `--run`) and the stdio chain; nothing is started here.
// -> { command, args, childEnv, envVar, keyName, keyFile } | { error, code }
function runLaunch(argv, env, { dir, platform, helper, exists } = {})
{
    const parsed = parseRun(argv);
    if (parsed.error) return parsed;
    const h = helper || require('./mcp-headers.js');
    const files = runChain(dir, parsed.globalRoot ? path.resolve(parsed.globalRoot) : null);
    const found = h.valueIn(parsed.keyName, files);
    if (!found && !parsed.optional) return { error: `no value for ${parsed.keyName} in ${files.join(', ')}`, code: EXIT.failed };
    const start = platform === 'win32' ? winLaunch(parsed.command, parsed.args, env, exists || fs.existsSync) : { command: parsed.command, args: parsed.args };
    return {
        ...start,
        childEnv: found ? { ...env, [parsed.envVar]: found.value } : { ...env },
        envVar: parsed.envVar,
        keyName: parsed.keyName,
        keyFile: found ? found.file : null,
        startName: parsed.command,
    };
}

const fail = (text, code = EXIT.failed) => { process.stderr.write(`mcp-bridge: ${String(text).replace(/[\r\n]+/g, ' ')}\n`); process.exit(code); };

function main()
{
    const argv = process.argv.slice(2);
    const run = argv[0] === RUN_FLAG;
    if (run)
    {
        const checked = parseRun(argv.slice(1));
        if (checked.error) fail(checked.error, checked.code);
    }
    let helper = null;
    try { helper = require('./mcp-headers.js'); }
    catch { helper = null; }
    const number = helper && Number.isInteger(helper.HELPER_VERSION) ? helper.HELPER_VERSION : 'missing';
    if (!helper || !(helper.HELPER_VERSION >= NEEDS_HELPER) || typeof helper.valueIn !== 'function' || typeof helper.readDotenv !== 'function' || typeof helper.authValue !== 'function')
        fail(`mcp-headers.js beside it is helper ${number} - the bridge needs ${NEEDS_HELPER}; run /alfred-tools:fix`);
    let r;
    try
    {
        const options = { dir: __dirname, platform: process.platform, helper };
        r = run ? runLaunch(argv.slice(1), process.env, options) : launch(argv, process.env, options);
    }
    catch { r = { error: 'could not read the key files' }; }
    if (r.error) fail(r.error, r.code);
    const child = spawn(r.command, r.args, { stdio: 'inherit', windowsHide: true, env: r.childEnv });
    child.on('error', (e) => fail(`could not start ${run ? r.startName : 'npx'} - ${e.message}`));
    for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { try { child.kill(sig); } catch { /* already gone */ } });
    child.on('exit', (code, signal) => process.exit(signal ? 1 : (code === null ? 1 : code)));
}

if (require.main === module) main();

module.exports = { BRIDGE_VERSION, NEEDS_HELPER, CREDENTIAL, RUN_FLAG, templateNames, fillTemplate, launch, runChain, parseRun, runLaunch };
