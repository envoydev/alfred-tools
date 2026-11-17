// alfred-tools mcp-headers 6
'use strict';
// The header helper a hosted registration names as `headersHelper` (spec D4): `node <root>/mcp-headers.js <NAME> <SCHEME>
// [<global root>] [--header <pair>]...`. Claude Code runs it before it connects and sends the JSON it prints as request headers, so the key stays
// in a key file and never enters a registration.
//
// It reads <NAME> from `.mcps-secrets` beside it, then from the third argument's folder, then ~/.alfred-tools, then
// ~/.alfred - the first non-empty value wins - and prints {"Authorization":"<SCHEME> <value>"}. With no value it prints {}
// and one stderr line naming <NAME> and the files it read, never a value. It always exits 0 with JSON on stdout.
// A pair adds one more header beside Authorization, only when the key was found: `--header NAME=VAR` sends header NAME with
// the first non-empty value of VAR in the same chain, `--header NAME:value` sends the fixed value (letters, digits and
// `_ . , -`). A pair whose value is empty or missing sends nothing, and Authorization is never a pair. A bad pair is a usage
// note and {}.
// For `Basic`, a value holding `:` is `email:api_token` as the user wrote it and is sent base64-encoded; any other value
// is sent as it is. mcp-bridge.js requires this file for its reader; it prints nothing itself.
//
// It prints a header only when Claude Code runs it: Claude Code sets CLAUDE_CODE_MCP_SERVER_NAME for a headersHelper
// (2.1.85+). Run by hand - a terminal, or an agent's shell tool - it reads no key file and prints {} and one stderr
// line, so a key never lands in a terminal or a transcript.
//
// This file is copied into the user's root folder and runs outside the plugin, so it needs nothing but Node: `node:`
// modules only, and its own copy of keys.js's dotenv grammar. Its bytes are pinned by tests/lint.js (HELPER_SHA256); a
// change here bumps HELPER_VERSION and the first line together.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const HELPER_VERSION = 6;
const SECRETS = '.mcps-secrets';
const NAME_RULE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SCHEME_RULE = /^[!-~]+$/;
const HEADER_RULE = /^[A-Za-z0-9_-]+$/;
const FIXED_VALUE_RULE = /^[A-Za-z0-9_.,-]+$/;
const USAGE = 'mcp-headers: usage: node mcp-headers.js <NAME> <SCHEME> [<root>] [--header NAME=VAR | --header NAME:value]...';

// The same grammar as keys.js readDotenv: `KEY=value`, `export ` allowed before it, one pair of matching quotes around the
// trimmed value dropped; `#` and `;` lines and blank lines are comments. A BOM decides UTF-16 or UTF-8. -> {} | null
const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;
const COMMENT = /^\s*(?:[#;]|$)/;
// A value as written: inside matching quotes it stands as it is; unquoted, a note after whitespace and # is dropped -
// `NAME=abc # work` is abc, `NAME=abc#1` is abc#1
const unquote = (raw) =>
{
    const q = /^\s*(["'])(.*?)\1(?:\s+#.*)?\s*$/.exec(raw);
    return q ? q[2] : raw.replace(/\s+#.*$/, '').trim();
};
function readDotenv(file)
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

// The files read, in order: beside the helper, the extra root, then the two home roots. Equal to keys.js hostedChain.
function chainOf(dir, extraRoot, home)
{
    const dirs = [dir, extraRoot, path.join(home, '.alfred-tools'), path.join(home, '.alfred')].filter(Boolean);
    return [...new Set(dirs.map((d) => path.join(d, SECRETS)))];
}

// sha256 hex of the text with CRLF turned to LF: one digest for every comparison of helper bytes, so a CRLF copy is the
// same helper.
const digestOf = (text) => crypto.createHash('sha256').update(String(text).replace(/\r\n/g, '\n')).digest('hex');

// The first non-empty value of <name> in `files` order, and the file it came from. -> { value, file } | null
function valueIn(name, files)
{
    for (const file of files)
    {
        const value = (readDotenv(file) || {})[name];
        if (value) return { value, file };
    }
    return null;
}

// The Authorization value: `<scheme> <value>`; for Basic, a value holding `:` is email:api_token, sent base64-encoded.
const authValue = (scheme, value) => `${scheme} ${scheme === 'Basic' && value.includes(':') ? Buffer.from(value, 'utf8').toString('base64') : value}`;

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

// The arguments after <SCHEME>: at most one root, and any number of `--header <pair>`. -> { root, pairs } | { error }
function parsePairs(argv)
{
    let root = null;
    const pairs = [];
    for (let i = 0; i < argv.length; i++)
    {
        if (argv[i] === '--header')
        {
            const pair = i + 1 < argv.length ? parsePair(argv[i + 1]) : null;
            if (!pair) return { error: USAGE };
            pairs.push(pair);
            i++;
        }
        else if (root === null) root = argv[i];
        else return { error: USAGE };
    }
    return { root, pairs };
}

function headers(argv, env)
{
    if (!env.CLAUDE_CODE_MCP_SERVER_NAME)
        return { out: {}, note: 'mcp-headers: prints a header only when Claude Code runs it as a headersHelper (CLAUDE_CODE_MCP_SERVER_NAME is unset) - no key file read' };
    const [name, scheme] = argv;
    if (!name || !NAME_RULE.test(name) || !scheme || !SCHEME_RULE.test(scheme)) return { out: {}, note: USAGE };
    const parsed = parsePairs(argv.slice(2));
    if ('error' in parsed) return { out: {}, note: parsed.error };
    const { root: extraRoot, pairs } = parsed;
    const home = env.HOME || env.USERPROFILE || os.homedir();
    const files = chainOf(__dirname, extraRoot ? path.resolve(extraRoot) : null, home);
    const found = valueIn(name, files);
    if (found)
    {
        const out = { Authorization: authValue(scheme, found.value) };
        for (const pair of pairs)
        {
            const value = 'var' in pair ? (valueIn(pair.var, files) || {}).value : pair.value;
            if (value) out[pair.header] = value;
        }
        return { out, note: null };
    }
    return { out: {}, note: `mcp-headers: no value for ${name} in ${files.join(', ')}` };
}

function main()
{
    let result;
    try { result = headers(process.argv.slice(2), process.env); }
    catch { result = { out: {}, note: 'mcp-headers: could not read the key files' }; }
    if (result.note) process.stderr.write(`${result.note.replace(/[\r\n]+/g, ' ')}\n`);
    process.stdout.write(`${JSON.stringify(result.out)}\n`);
}

if (require.main === module) main();

module.exports = { HELPER_VERSION, chainOf, digestOf, readDotenv, valueIn, authValue, parsePairs };
