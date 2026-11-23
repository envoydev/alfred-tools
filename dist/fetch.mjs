#!/usr/bin/env node
// Built from the TypeScript in scripts/ by npm run build - do not edit.
import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// scripts/copied/mcp-headers.js
var require_mcp_headers = __commonJS({
  "scripts/copied/mcp-headers.js"(exports, module) {
    "use strict";
    var fs7 = __require("node:fs");
    var os3 = __require("node:os");
    var path8 = __require("node:path");
    var crypto = __require("node:crypto");
    var HELPER_VERSION = 6;
    var SECRETS2 = ".mcps-secrets";
    var NAME_RULE = /^[A-Za-z_][A-Za-z0-9_]*$/;
    var SCHEME_RULE = /^[!-~]+$/;
    var HEADER_RULE = /^[A-Za-z0-9_-]+$/;
    var FIXED_VALUE_RULE = /^[A-Za-z0-9_.,-]+$/;
    var USAGE = "mcp-headers: usage: node mcp-headers.js <NAME> <SCHEME> [<root>] [--header NAME=VAR | --header NAME:value]...";
    var LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;
    var COMMENT = /^\s*(?:[#;]|$)/;
    var unquote = (raw) => {
      const q = /^\s*(["'])(.*?)\1(?:\s+#.*)?\s*$/.exec(raw);
      return q ? q[2] : raw.replace(/\s+#.*$/, "").trim();
    };
    function readDotenv2(file) {
      let buf;
      try {
        buf = fs7.readFileSync(file);
      } catch {
        return null;
      }
      const text = buf[0] === 255 && buf[1] === 254 ? buf.subarray(2).toString("utf16le") : buf.toString("utf8").replace(/^﻿/, "");
      const values = {};
      for (const line of text.split(/\r?\n/)) {
        if (COMMENT.test(line)) continue;
        const m = LINE.exec(line);
        if (m) values[m[1]] = unquote(m[2]);
      }
      return values;
    }
    function chainOf(dir, extraRoot, home) {
      const dirs = [dir, extraRoot, path8.join(home, ".alfred-tools"), path8.join(home, ".alfred")].filter(Boolean);
      return [...new Set(dirs.map((d) => path8.join(d, SECRETS2)))];
    }
    var digestOf = (text) => crypto.createHash("sha256").update(String(text).replace(/\r\n/g, "\n")).digest("hex");
    function valueIn(name, files) {
      for (const file of files) {
        const value = (readDotenv2(file) || {})[name];
        if (value) return { value, file };
      }
      return null;
    }
    var authValue = (scheme, value) => `${scheme} ${scheme === "Basic" && value.includes(":") ? Buffer.from(value, "utf8").toString("base64") : value}`;
    function parsePair(text) {
      const at = text.search(/[=:]/);
      if (at < 1) return null;
      const header = text.slice(0, at);
      const rest = text.slice(at + 1);
      if (!HEADER_RULE.test(header) || header.toLowerCase() === "authorization") return null;
      if (text[at] === "=") return NAME_RULE.test(rest) ? { header, var: rest } : null;
      return FIXED_VALUE_RULE.test(rest) ? { header, value: rest } : null;
    }
    function parsePairs2(argv) {
      let root = null;
      const pairs = [];
      for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--header") {
          const pair = i + 1 < argv.length ? parsePair(argv[i + 1]) : null;
          if (!pair) return { error: USAGE };
          pairs.push(pair);
          i++;
        } else if (root === null) root = argv[i];
        else return { error: USAGE };
      }
      return { root, pairs };
    }
    function headers(argv, env) {
      if (!env.CLAUDE_CODE_MCP_SERVER_NAME)
        return { out: {}, note: "mcp-headers: prints a header only when Claude Code runs it as a headersHelper (CLAUDE_CODE_MCP_SERVER_NAME is unset) - no key file read" };
      const [name, scheme] = argv;
      if (!name || !NAME_RULE.test(name) || !scheme || !SCHEME_RULE.test(scheme)) return { out: {}, note: USAGE };
      const parsed = parsePairs2(argv.slice(2));
      if ("error" in parsed) return { out: {}, note: parsed.error };
      const { root: extraRoot, pairs } = parsed;
      const home = env.HOME || env.USERPROFILE || os3.homedir();
      const files = chainOf(__dirname, extraRoot ? path8.resolve(extraRoot) : null, home);
      const found = valueIn(name, files);
      if (found) {
        const out = { Authorization: authValue(scheme, found.value) };
        for (const pair of pairs) {
          const value = "var" in pair ? (valueIn(pair.var, files) || {}).value : pair.value;
          if (value) out[pair.header] = value;
        }
        return { out, note: null };
      }
      return { out: {}, note: `mcp-headers: no value for ${name} in ${files.join(", ")}` };
    }
    function main() {
      let result;
      try {
        result = headers(process.argv.slice(2), process.env);
      } catch {
        result = { out: {}, note: "mcp-headers: could not read the key files" };
      }
      if (result.note) process.stderr.write(`${result.note.replace(/[\r\n]+/g, " ")}
`);
      process.stdout.write(`${JSON.stringify(result.out)}
`);
    }
    if (__require.main === module) main();
    module.exports = { HELPER_VERSION, chainOf, digestOf, readDotenv: readDotenv2, valueIn, authValue, parsePairs: parsePairs2 };
  }
});

// scripts/copied/mcp-bridge.js
var require_mcp_bridge = __commonJS({
  "scripts/copied/mcp-bridge.js"(exports, module) {
    "use strict";
    var fs7 = __require("node:fs");
    var os3 = __require("node:os");
    var path8 = __require("node:path");
    var { spawn: spawn2 } = __require("node:child_process");
    var BRIDGE_VERSION = 4;
    var NEEDS_HELPER = 4;
    var CREDENTIAL = /TOKEN|SECRET|PASSWORD|KEY|AUTH/i;
    var NAME_RULE = /^[A-Za-z_][A-Za-z0-9_]*$/;
    var SCHEME_RULE = /^[!-~]+$/;
    var PACKAGE_RULE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*@[0-9A-Za-z][0-9A-Za-z.+-]*$/;
    var HEADER_RULE = /^[A-Za-z0-9_-]+$/;
    var FIXED_VALUE_RULE = /^[A-Za-z0-9_.,-]+$/;
    var ENV_PREFIX = "PT_BRIDGE_H";
    var SLUG = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
    var ARG_RULE = /^[A-Za-z0-9_./:@+,=${}-]+$/;
    var PLACEHOLDER2 = /^\{([^{}?]*)(\?)?\}$/;
    var USAGE = "usage: node mcp-bridge.js <url template> <KEY_NAME> <SCHEME> <package@version> [<root>] [--header NAME=VAR | --header NAME:value]...";
    var PLAIN = "is not a plain name (letters, digits, _ . -)";
    var RUN_FLAG = "--run";
    var RUN_END = "--";
    var RUN_PAIR2 = /^([A-Za-z_][A-Za-z0-9_]*)=([A-Za-z_][A-Za-z0-9_]*)(\?)?$/;
    var RESERVED_ENV = /^PT_BRIDGE_/;
    var SECRETS2 = ".mcps-secrets";
    var RUN_USAGE = "usage: node mcp-bridge.js --run <ENV>=<KEY_NAME>[?] [<root>] -- <command> [<args>...]";
    var EXIT = { usage: 2, failed: 1 };
    function partsOf(template) {
      if (typeof template !== "string") return null;
      const m = /^(https?:\/\/[^/{}?#]+)((?:\/[^/]*)*)$/.exec(template);
      if (!m) return null;
      const segments = m[2] ? m[2].split("/").slice(1) : [];
      if (segments.some((s) => !PLACEHOLDER2.test(s) && /[{}?#]/.test(s))) return null;
      return { origin: m[1], segments };
    }
    function templateNames2(template) {
      const parts = partsOf(template);
      if (!parts) return null;
      const names = [];
      for (const [i, s] of parts.segments.entries()) {
        const m = PLACEHOLDER2.exec(s);
        if (!m) continue;
        if (!NAME_RULE.test(m[1])) return null;
        if (m[2] && i !== parts.segments.length - 1) return null;
        if (names.some((n) => n.name === m[1])) return null;
        names.push({ name: m[1], optional: Boolean(m[2]) });
      }
      return names;
    }
    function fillTemplate(template, values) {
      const parts = partsOf(template);
      if (!parts || !templateNames2(template)) return { error: USAGE };
      const out = [];
      for (const s of parts.segments) {
        const m = PLACEHOLDER2.exec(s);
        if (!m) {
          out.push(s);
          continue;
        }
        const v = values[m[1]];
        if (v === void 0 || v === "") {
          if (m[2]) continue;
          return { error: `no value for ${m[1]}` };
        }
        if (!SLUG.test(v)) return { error: `${m[1]} ${PLAIN}` };
        out.push(v);
      }
      return { url: parts.origin + out.map((s) => `/${s}`).join("") };
    }
    function originAllowed(origin) {
      let u;
      try {
        u = new URL(origin);
      } catch {
        return false;
      }
      return u.protocol === "https:" || u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
    }
    function parsePair(text) {
      const at = text.search(/[=:]/);
      if (at < 1) return null;
      const header = text.slice(0, at);
      const rest = text.slice(at + 1);
      if (!HEADER_RULE.test(header) || header.toLowerCase() === "authorization") return null;
      if (text[at] === "=") return NAME_RULE.test(rest) ? { header, var: rest } : null;
      return FIXED_VALUE_RULE.test(rest) ? { header, value: rest } : null;
    }
    function parsePairs2(argv) {
      let root = null;
      const pairs = [];
      for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--header") {
          const pair = i + 1 < argv.length ? parsePair(argv[i + 1]) : null;
          if (!pair) return null;
          pairs.push(pair);
          i++;
        } else if (root === null) root = argv[i];
        else return null;
      }
      return { root, pairs };
    }
    function launch(argv, env, { dir, platform, helper } = {}) {
      const [template, keyName, scheme, pkg, ...extra] = argv;
      if (!template || !keyName || !NAME_RULE.test(keyName) || !scheme || !SCHEME_RULE.test(scheme) || !pkg || !PACKAGE_RULE.test(pkg)) return { error: USAGE };
      const parsed = parsePairs2(extra);
      if (!parsed) return { error: USAGE };
      const { root: globalRoot, pairs } = parsed;
      const names = templateNames2(template);
      if (!names) return { error: USAGE };
      if (!originAllowed(partsOf(template).origin)) return { error: "the URL template is not https - mcp-remote takes http only on 127.0.0.1 or localhost" };
      const keyLike = names.find((n) => n.name === keyName || CREDENTIAL.test(n.name));
      if (keyLike) return { error: `${keyLike.name} in the URL template names a key - a key never goes in a URL` };
      const keyPair = pairs.find((p) => p.var === keyName);
      if (keyPair) return { error: `${keyPair.var} in a --header pair is the key's name - a key never goes in another header` };
      const h = helper || require_mcp_headers();
      const home = env.HOME || env.USERPROFILE || os3.homedir();
      const files = h.chainOf(dir, globalRoot ? path8.resolve(globalRoot) : null, home);
      const key = h.valueIn(keyName, files);
      if (!key) return { error: `no value for ${keyName} in ${files.join(", ")}` };
      const nearest = (name) => {
        for (const file of files) {
          const all = h.readDotenv(file);
          if (all && Object.hasOwn(all, name)) return all[name] ? { value: all[name], file } : null;
        }
        return null;
      };
      const values = {};
      for (const n of names) {
        const v = n.optional ? nearest(n.name) : h.valueIn(n.name, files);
        if (!v) {
          if (n.optional) continue;
          return { error: `no value for ${n.name} in ${files.join(", ")}` };
        }
        if (!SLUG.test(v.value)) return { error: `${n.name} in ${v.file} ${PLAIN}` };
        if (v.value === key.value) return { error: `${n.name} in ${v.file} holds the key's value - a key never goes in a URL` };
        values[n.name] = v.value;
      }
      const filled = fillTemplate(template, values);
      if (filled.error) return { error: filled.error };
      const pairArgs = [];
      const pairEnv = {};
      for (const pair of pairs) {
        if (!("var" in pair)) {
          pairArgs.push("--header", `${pair.header}:${pair.value}`);
          continue;
        }
        const v = h.valueIn(pair.var, files);
        if (!v) continue;
        if (v.value === key.value) return { error: `${pair.var} in ${v.file} holds the key's value - a key never goes in another header` };
        const envName = `${ENV_PREFIX}${Object.keys(pairEnv).length + 1}`;
        pairEnv[envName] = v.value;
        pairArgs.push("--header", `${pair.header}:\${${envName}}`);
      }
      const tail = ["-y", pkg, filled.url, "--header", "Authorization:${PT_BRIDGE_AUTH}", ...pairArgs, "--transport", "http-only"];
      if (tail.some((a) => !ARG_RULE.test(a))) return { error: USAGE };
      const win = platform === "win32";
      return {
        url: filled.url,
        keyName,
        keyFile: key.file,
        names,
        auth: h.authValue(scheme, key.value),
        command: win ? env.ComSpec || "cmd.exe" : "npx",
        args: win ? ["/d", "/c", "npx", ...tail] : tail,
        childEnv: { ...env, ...pairEnv, PT_BRIDGE_AUTH: h.authValue(scheme, key.value) }
      };
    }
    function runChain(dir, globalRoot) {
      return [...new Set([dir, globalRoot].filter(Boolean).map((d) => path8.join(d, SECRETS2)))];
    }
    function parseRun(argv) {
      const usage = { error: RUN_USAGE, code: EXIT.usage };
      const pair = RUN_PAIR2.exec(argv[0] || "");
      if (!pair || RESERVED_ENV.test(pair[1])) return usage;
      const end = argv.indexOf(RUN_END);
      if (end < 0) return usage;
      const between = argv.slice(1, end);
      const command = argv[end + 1];
      if (between.length > 1 || !command) return usage;
      return { envVar: pair[1], keyName: pair[2], optional: Boolean(pair[3]), globalRoot: between[0] || null, command, args: argv.slice(end + 2) };
    }
    function winLaunch(command, args, env, exists) {
      const base = path8.win32.basename(command).toLowerCase();
      const direct = base === "cmd" || base === "cmd.exe" || /\.(exe|com)$/.test(base);
      const folders = String(env.PATH || env.Path || "").split(";").filter(Boolean);
      if (direct || folders.some((folder) => [".exe", ".com"].some((ext) => exists(path8.win32.join(folder, command + ext))))) return { command, args };
      return { command: env.ComSpec || "cmd.exe", args: ["/d", "/c", command, ...args] };
    }
    function runLaunch(argv, env, { dir, platform, helper, exists } = {}) {
      const parsed = parseRun(argv);
      if (parsed.error) return parsed;
      const h = helper || require_mcp_headers();
      const files = runChain(dir, parsed.globalRoot ? path8.resolve(parsed.globalRoot) : null);
      const found = h.valueIn(parsed.keyName, files);
      if (!found && !parsed.optional) return { error: `no value for ${parsed.keyName} in ${files.join(", ")}`, code: EXIT.failed };
      const start = platform === "win32" ? winLaunch(parsed.command, parsed.args, env, exists || fs7.existsSync) : { command: parsed.command, args: parsed.args };
      return {
        ...start,
        childEnv: found ? { ...env, [parsed.envVar]: found.value } : { ...env },
        envVar: parsed.envVar,
        keyName: parsed.keyName,
        keyFile: found ? found.file : null,
        startName: parsed.command
      };
    }
    var fail = (text, code = EXIT.failed) => {
      process.stderr.write(`mcp-bridge: ${String(text).replace(/[\r\n]+/g, " ")}
`);
      process.exit(code);
    };
    function main() {
      const argv = process.argv.slice(2);
      const run = argv[0] === RUN_FLAG;
      if (run) {
        const checked = parseRun(argv.slice(1));
        if (checked.error) fail(checked.error, checked.code);
      }
      let helper = null;
      try {
        helper = require_mcp_headers();
      } catch {
        helper = null;
      }
      const number = helper && Number.isInteger(helper.HELPER_VERSION) ? helper.HELPER_VERSION : "missing";
      if (!helper || !(helper.HELPER_VERSION >= NEEDS_HELPER) || typeof helper.valueIn !== "function" || typeof helper.readDotenv !== "function" || typeof helper.authValue !== "function")
        fail(`mcp-headers.js beside it is helper ${number} - the bridge needs ${NEEDS_HELPER}; run /alfred-tools:fix`);
      let r;
      try {
        const options = { dir: __dirname, platform: process.platform, helper };
        r = run ? runLaunch(argv.slice(1), process.env, options) : launch(argv, process.env, options);
      } catch {
        r = { error: "could not read the key files" };
      }
      if (r.error) fail(r.error, r.code);
      const child = spawn2(r.command, r.args, { stdio: "inherit", windowsHide: true, env: r.childEnv });
      child.on("error", (e) => fail(`could not start ${run ? r.startName : "npx"} - ${e.message}`));
      for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => {
        try {
          child.kill(sig);
        } catch {
        }
      });
      child.on("exit", (code, signal) => process.exit(signal ? 1 : code === null ? 1 : code));
    }
    if (__require.main === module) main();
    module.exports = { BRIDGE_VERSION, NEEDS_HELPER, CREDENTIAL, RUN_FLAG, templateNames: templateNames2, fillTemplate, launch, runChain, parseRun, runLaunch };
  }
});

// scripts/core/exit.ts
function exitWhenSettled(result, script) {
  void result.then(
    (code) => process.exit(code),
    (error) => {
      console.error(`${script}: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  );
}

// scripts/apply/fetch-command.ts
import fs6 from "node:fs";
import path7 from "node:path";

// scripts/core/tmpdir.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
var PREFIX = "alfred-tools-";
var MAX_AGE_MS = 24 * 3600 * 1e3;
var realPathOf = (target) => fs.realpathSync.native(target);
var tempRoot = () => realPathOf(os.tmpdir());
function isOurTempDir(dir) {
  try {
    const real = realPathOf(dir);
    return path.dirname(real) === tempRoot() && path.basename(real).startsWith(PREFIX) && fs.statSync(real).isDirectory();
  } catch {
    return false;
  }
}
function releaseTempDir(dir, log = console.log) {
  if (!dir) return false;
  if (!isOurTempDir(dir)) {
    log(`${dir} left as it is: not a folder alfred-tools made in the temp folder`);
    return false;
  }
  fs.rmSync(realPathOf(dir), { recursive: true, force: true });
  return true;
}

// scripts/core/shapes.ts
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var isTextList = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");
var isTextMap = (value) => isRecord(value) && Object.values(value).every((item) => typeof item === "string");

// scripts/core/guards.ts
var isString = (value) => typeof value === "string";
var isOptionalString = (value) => value === void 0 || isString(value);
function isJson(value) {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isJson);
  return isRecord(value) && Object.values(value).every(isJson);
}
var isJsonObject = (value) => isRecord(value) && isJson(value);
var isServerEntry = (value) => isJsonObject(value) && [value["type"], value["command"], value["url"], value["headersHelper"]].every(isOptionalString) && (value["args"] === void 0 || isTextList(value["args"])) && (value["env"] === void 0 || isTextMap(value["env"])) && (value["headers"] === void 0 || isTextMap(value["headers"]));
var isServerMap = (value) => isRecord(value) && Object.values(value).every(isServerEntry);
var isAccountProject = (value) => isRecord(value) && (value["mcpServers"] === void 0 || isServerMap(value["mcpServers"])) && (value["hasTrustDialogAccepted"] === void 0 || typeof value["hasTrustDialogAccepted"] === "boolean");
var errorCode = (caught) => caught instanceof Error && "code" in caught && typeof caught.code === "string" ? caught.code : void 0;
var errorMessage = (caught) => caught instanceof Error ? caught.message : String(caught);

// scripts/core/json-file.ts
var stripBom = (text) => typeof text === "string" && text.charCodeAt(0) === 65279 ? text.slice(1) : text;
var parseJson = (text) => JSON.parse(stripBom(text));
function blockingStdio(streams = [process.stdout, process.stderr]) {
  for (const stream of streams) {
    try {
      const handle = stream && "_handle" in stream ? stream._handle : null;
      if (isRecord(handle) && typeof handle["setBlocking"] === "function") handle["setBlocking"](true);
    } catch {
    }
  }
}

// scripts/apply/fetch.ts
import fs5 from "node:fs";
import { spawn, spawnSync as spawnSync3 } from "node:child_process";

// scripts/core/claude-cli.ts
import { spawnSync } from "node:child_process";

// scripts/core/cmd-line.ts
import path2 from "node:path";

// scripts/core/constants.ts
var PATH_LIST_SEPARATOR = ";";
var DEFAULT_PATHEXT = ".COM;.EXE;.BAT;.CMD";
var PATH_SEPARATOR_PATTERN = /[\\/]/;
var QUOTED_PATH_ENTRY_PATTERN = /^"(.*)"$/;
var SHIM_FILE_PATTERN = /\.(?:cmd|bat)$/i;
var SHIM_NAME_PATTERN = /^(?:(?:npm|npx|pnpm|yarn)|.*\.(?:cmd|bat))$/i;
var CMD_PROGRAM_PATTERN = /^cmd(\.exe)?$/i;
var CMD_RUN_FLAG_PATTERN = /^\/c$/i;
var CMD_META_PATTERN = /([()\][%!^"`<>&|;, *?])/g;
var CLI_TIMEOUT_MS = 12e4;
var CLI_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
var FILES = { secrets: ".mcps-secrets", helper: "mcp-headers.js", record: "preferred-tools.json", map: "roots.json", bridge: "mcp-bridge.js", list: "mcps.json", signIns: "mcp-remote-v1", serenaContext: "serena-context.yml", macosExclude: "macos-mcp.toml" };
var ROOT_NAME = ".alfred-tools";
var FORMER_ROOT_NAME = ".preferred-tools";
var MCP_JSON = ".mcp.json";

// scripts/core/cmd-line.ts
function argvQuote(arg) {
  let out = '"';
  let slashes2 = 0;
  for (const character of String(arg)) {
    if (character === "\\") {
      slashes2++;
      continue;
    }
    out += character === '"' ? `${"\\".repeat(slashes2 * 2 + 1)}"` : `${"\\".repeat(slashes2)}${character}`;
    slashes2 = 0;
  }
  return `${out}${"\\".repeat(slashes2 * 2)}"`;
}
var cmdArgOnce = (arg) => argvQuote(arg).replace(CMD_META_PATTERN, "^$1");
var cmdArg = (arg) => cmdArgOnce(arg).replace(CMD_META_PATTERN, "^$1");
function envValue(env, name) {
  const last = Object.keys(env).filter((key) => key.toUpperCase() === name).at(-1);
  return last === void 0 ? void 0 : env[last];
}
function resolveOnPath(name, env, exists, cwd) {
  const hasPath = PATH_SEPARATOR_PATTERN.test(name);
  const hasExtension = path2.extname(name) !== "";
  const asWritten = cwd === void 0 || path2.isAbsolute(name) ? name : path2.resolve(cwd, name);
  if ((hasPath || hasExtension) && exists(asWritten)) return asWritten;
  if (hasPath) return null;
  const extensions = [...hasExtension ? [""] : [], ...(envValue(env, "PATHEXT") || DEFAULT_PATHEXT).split(PATH_LIST_SEPARATOR).filter(Boolean)];
  const directories = [...cwd === void 0 ? [] : [cwd], ...(envValue(env, "PATH") ?? "").split(PATH_LIST_SEPARATOR).map((directory) => directory.replace(QUOTED_PATH_ENTRY_PATTERN, "$1")).filter(Boolean)];
  for (const directory of directories) {
    for (const extension of extensions) {
      const file = path2.join(directory, `${name}${extension}`);
      if (exists(file)) return file;
    }
  }
  return null;
}
var throughCmd = (command, args) => CMD_PROGRAM_PATTERN.test(command) && CMD_RUN_FLAG_PATTERN.test(args[0] || "");
function launchOf(command, args) {
  const [name = command, ...rest] = throughCmd(command, args) ? args.slice(1) : [command, ...args];
  return { name, rest };
}
function shimOfLaunch(command, args, env, exists, cwd) {
  const resolved = resolveOnPath(launchOf(command, args).name, env, exists, cwd);
  return resolved === null ? void 0 : SHIM_FILE_PATTERN.test(resolved);
}
function spawnArgs(command, args, platform, shim) {
  if (platform !== "win32") return { file: command, args, shell: false };
  const { name, rest } = launchOf(command, args);
  const doubled = shim ?? SHIM_NAME_PATTERN.test(name);
  return { file: [name, ...rest.map(doubled ? cmdArg : cmdArgOnce)].join(" "), args: [], shell: true };
}

// scripts/core/claude-cli.ts
function runClaude(args, { cwd, env, input, timeout = CLI_TIMEOUT_MS } = {}) {
  const options = { encoding: "utf8", cwd, env: env || process.env, input, timeout, windowsHide: true, maxBuffer: CLI_MAX_BUFFER_BYTES };
  let result = spawnSync("claude", args, options);
  if (process.platform === "win32" && result.error && ["ENOENT", "EINVAL"].includes(errorCode(result.error) ?? ""))
    result = spawnSync(["claude", ...args.map(cmdArg)].join(" "), { ...options, shell: true });
  return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "", error: result.error || null, signal: result.signal };
}

// scripts/core/account.ts
import fs2 from "node:fs";
import os2 from "node:os";
import path3 from "node:path";
import { spawnSync as spawnSync2 } from "node:child_process";
var homeDir = (env = process.env) => env.HOME || env.USERPROFILE || os2.homedir();
var accountFile = (env = process.env) => env.CLAUDE_CONFIG_DIR ? path3.join(path3.resolve(env.CLAUDE_CONFIG_DIR), ".claude.json") : path3.join(homeDir(env), ".claude.json");
function projectKey(dir) {
  try {
    return fs2.realpathSync.native(dir);
  } catch {
    return path3.resolve(dir);
  }
}
function localRoot(project) {
  if (fs2.existsSync(path3.join(project, ".git")) || !fs2.existsSync(project)) return project;
  const result = spawnSync2("git", ["rev-parse", "--show-toplevel"], { cwd: project, encoding: "utf8", windowsHide: true });
  return result.status === 0 && result.stdout.trim() ? path3.resolve(result.stdout.trim()) : project;
}
function readState(file, isDoc) {
  let text;
  try {
    text = fs2.readFileSync(file, "utf8");
  } catch (caught) {
    const missing = errorCode(caught) === "ENOENT";
    return { file, state: missing ? "missing" : "unreadable", doc: null, error: missing ? null : errorMessage(caught) };
  }
  if (!text.trim()) return { file, state: "empty", doc: null, error: null };
  try {
    const doc = parseJson(text);
    if (!isRecord(doc)) return { file, state: "malformed", doc: null, error: "not a JSON object" };
    if (!isDoc(doc)) return { file, state: "malformed", doc: null, error: "a field holds a value of the wrong type" };
    return { file, state: "ok", doc, error: null };
  } catch (caught) {
    return { file, state: "malformed", doc: null, error: errorMessage(caught) };
  }
}
var isAccountTop = (value) => (value["mcpServers"] === void 0 || isServerMap(value["mcpServers"])) && (value["projects"] === void 0 || isRecord(value["projects"]));
function entryKey(projects, project, platform) {
  if (platform !== "win32") return [projectKey(project), path3.resolve(project)].find((key) => Boolean(projects[key]));
  let real = null;
  try {
    real = fs2.realpathSync.native(project);
  } catch {
  }
  const want = [path3.win32.resolve(project), real].filter((folder) => Boolean(folder)).map((folder) => folder.replace(/\\/g, "/"));
  return want.find((candidate) => Object.hasOwn(projects, candidate)) ?? Object.keys(projects).find((projectPath) => want.some((candidate) => candidate.toLowerCase() === projectPath.toLowerCase()));
}
function readAccount(env, project, platform = process.platform) {
  const file = accountFile(env);
  const state = readState(file, isAccountTop);
  const top = state.doc || {};
  const entries = top.projects || {};
  const key = entryKey(entries, localRoot(project), platform);
  const entry = key === void 0 ? void 0 : entries[key];
  if (entry !== void 0 && !isAccountProject(entry)) return { file, state: "malformed", doc: null, error: "a field holds a value of the wrong type", user: {}, local: {}, projects: {} };
  const projects = Object.fromEntries(Object.entries(entries).filter((pair) => isAccountProject(pair[1])));
  const doc = state.doc ? { ...state.doc, projects } : null;
  return { ...state, doc, user: top.mcpServers || {}, local: entry && entry.mcpServers || {}, projects };
}
function readRegistration(name, scope, project, env) {
  if (scope === "project") {
    const state = readState(path3.join(project, MCP_JSON), isAccountProject);
    return state.doc && state.doc.mcpServers ? state.doc.mcpServers[name] : void 0;
  }
  const account = readAccount(env, project);
  return (scope === "user" ? account.user : account.local)[name];
}

// scripts/entries/platform.ts
import path4 from "node:path";
var pathApiOf = (pathText) => /^(?:[A-Za-z]:[\\/]|\\\\)/.test(pathText) ? path4.win32 : path4.posix;

// scripts/entries/locations.ts
function expandVars(text, env) {
  const unset = [];
  const value = String(text).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (match, name, fallback) => {
    const set = env[name];
    if (typeof set === "string") return set;
    if (fallback !== void 0) return fallback;
    unset.push(name);
    return match;
  });
  return { value, unset };
}
function alfredSerenaHome(home) {
  return /(^|\/)\.alfred\/serena\/home$/.test(String(home || "").replace(/\\/g, "/").replace(/\/+$/, ""));
}

// scripts/entries/entry.ts
import path6 from "node:path";

// scripts/keys/keys.ts
var import_mcp_headers = __toESM(require_mcp_headers(), 1);
import path5 from "node:path";

// scripts/entries/constants.ts
var RUN = { flag: "--run", end: "--", optional: "?" };

// scripts/keys/keys.ts
var KEY_FILES = [path5.join(ROOT_NAME, ".secrets"), path5.join(FORMER_ROOT_NAME, ".secrets")];
var SECRETS = FILES.secrets;

// scripts/entries/entry.ts
var import_mcp_bridge = __toESM(require_mcp_bridge(), 1);
var import_mcp_headers2 = __toESM(require_mcp_headers(), 1);

// scripts/entries/sign-in.ts
function signInParts(entry) {
  if (!entry || typeof entry !== "object" || typeof entry.command !== "string" || !Array.isArray(entry.args)) return null;
  let cmd = entry.command;
  let args = entry.args.map(String);
  if (throughCmd(cmd, args)) {
    cmd = args[1] || "";
    args = args.slice(2);
  }
  const slashed = cmd.replace(/\\/g, "/");
  if (slashed.slice(slashed.lastIndexOf("/") + 1).replace(/\.(cmd|exe)$/i, "").toLowerCase() !== "npx") return null;
  const at = args.findIndex((argument) => /^mcp-remote@\S+$/.test(argument));
  const pin = args[at];
  if (at < 0 || pin === void 0) return null;
  const url = args.slice(at + 1).find((argument) => !argument.startsWith("-"));
  if (url === void 0) return null;
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(parsedUrl.protocol)) return null;
  const dir = entry.env && entry.env["MCP_REMOTE_CONFIG_DIR"];
  return typeof dir === "string" && dir ? { url, dir, pin } : null;
}

// scripts/entries/entry.ts
var pairText = (pair) => "var" in pair ? `${pair.header}=${pair.var}` : `${pair.header}:${pair.value}`;
function bridgeParts(entry) {
  if (!entry || typeof entry !== "object" || typeof entry.command !== "string" || !Array.isArray(entry.args)) return null;
  if (path6.basename(entry.command.replace(/\\/g, "/")).replace(/\.exe$/i, "").toLowerCase() !== "node") return null;
  const args = entry.args.map(String);
  const at = args.findIndex((argument) => argument.replace(/\\/g, "/").split("/").pop() === FILES.bridge);
  const bridgePath = args[at];
  const template = args[at + 1];
  if (at < 0 || bridgePath === void 0 || !template || template === RUN.flag) return null;
  const [keyName = null, scheme = null, packageSpec = null, ...after] = args.slice(at + 2);
  const parsed = (0, import_mcp_headers2.parsePairs)(after);
  const read = "error" in parsed ? { root: after[0] !== void 0 && after[0] !== "--header" ? after[0] : null, pairs: [] } : { root: parsed.root, pairs: parsed.pairs.map(pairText) };
  return { path: bridgePath, template, keyName, scheme, packageSpec, globalRoot: read.root, pairs: read.pairs };
}

// scripts/apply/serena-config.ts
import fs4 from "node:fs";

// scripts/core/replace-file.ts
import fs3 from "node:fs";
function replaceFile(file, text, mode) {
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs3.writeFileSync(temporary, text, mode === void 0 ? void 0 : { mode });
    if (mode !== void 0) fs3.chmodSync(temporary, mode);
    fs3.renameSync(temporary, file);
  } catch (error) {
    fs3.rmSync(temporary, { force: true });
    throw error;
  }
}

// scripts/apply/yaml.ts
function scalarOf(raw) {
  const text = raw.trim();
  const single = /^'((?:[^']|'')*)'(?:\s+#.*)?$/.exec(text);
  if (single) {
    const [, inner = ""] = single;
    return inner.replace(/''/g, "'");
  }
  const double = /^"((?:[^"\\]|\\.)*)"(?:\s+#.*)?$/.exec(text);
  if (double) {
    const [, inner = ""] = double;
    return inner.replace(/\\(.)/g, "$1");
  }
  return text.replace(/\s+#.*$/, "");
}

// scripts/apply/serena-config.ts
var CONFIG = "serena_config.yml";
var KEY = /^base_modes[ \t]*:(.*?)(\r?)$/;
var configOf = (home) => pathApiOf(home).join(home, CONFIG);
function linesOf(text) {
  const out = [];
  const linePattern = /([^\n]*?)(\r?\n|$)/g;
  let match;
  while ((match = linePattern.exec(text)) !== null) {
    const [whole, body = "", ending = ""] = match;
    if (whole === "") break;
    out.push([body, ending]);
  }
  return out;
}
function locate(lines) {
  const at = lines.findIndex(([body]) => KEY.test(body));
  const keyLine = lines[at];
  if (!keyLine) return null;
  const [, raw = ""] = KEY.exec(keyLine[0]) ?? [];
  const value = raw.replace(/\s+#.*$/, "").trim();
  const bodyAt = (index) => {
    const line = lines[index];
    return line ? line[0] : "";
  };
  let end = at + 1;
  if (value.startsWith("[") && !value.includes("]")) {
    while (end < lines.length && !bodyAt(end).includes("]")) end += 1;
    end = Math.min(end + 1, lines.length);
  } else if (value === "")
    while (end < lines.length && /^[ \t]*-([ \t]|$)/.test(bodyAt(end))) end += 1;
  return { at, end, inline: value };
}
var readText = (file) => {
  try {
    return fs4.readFileSync(file, "utf8");
  } catch {
    return null;
  }
};
function emptyBaseModes(file) {
  const text = readText(file);
  if (text === null) return { changed: false, detail: `${file} is not there yet - serena writes it at its first start` };
  const lines = linesOf(text);
  const location = locate(lines);
  const lineEnd = text.includes("\r\n") ? "\r\n" : "\n";
  let next;
  if (!location) next = `${text}${text === "" || /\n$/.test(text) ? "" : lineEnd}base_modes: []${lineEnd}`;
  else {
    if (location.inline === "[]") return { changed: false, detail: `${file}: base_modes is [] already` };
    const endingAt = (index) => {
      const line = lines[index];
      return line ? line[1] : "";
    };
    const keyEol = endingAt(location.end - 1) || endingAt(location.at);
    const head = lines.slice(0, location.at).map(([body, ending]) => body + ending).join("");
    const tail = lines.slice(location.end).map(([body, ending]) => body + ending).join("");
    next = `${head}base_modes: []${keyEol}${tail}`;
  }
  if (next === text) return { changed: false, detail: `${file}: base_modes is [] already` };
  replaceInPlace(file, next);
  return { changed: true, detail: `set base_modes: [] in ${file}` };
}
function replaceInPlace(file, next) {
  replaceFile(file, next, fs4.statSync(file).mode & 511);
}
var FOLDER_KEY = "project_serena_folder_location";
var FOLDER_LINE = new RegExp(`^${FOLDER_KEY}[ \\t]*:(.*?)(\\r?)$`);
var folderOfLine = (body) => {
  const [, raw = ""] = FOLDER_LINE.exec(body) ?? [];
  return scalarOf(raw);
};
function folderValue(home) {
  if (home.includes("$")) return { error: `${home} holds a $ - serena would read it as a placeholder, so ${FOLDER_KEY} is not set` };
  const base = home.replace(/\\/g, "/").replace(/\/+$/, "");
  return { value: `'${base.replace(/'/g, "''")}/projects/$projectFolderName'` };
}
function folderState(file, home) {
  const text = readText(file);
  if (text === null) return "absent";
  const line = linesOf(text).find(([body]) => FOLDER_LINE.test(body));
  if (!line) return "absent";
  const wanted = folderValue(home);
  if ("error" in wanted) return "other";
  return folderOfLine(line[0]) === scalarOf(wanted.value) ? "same" : "other";
}
function folderCurrent(file) {
  const text = readText(file);
  const line = text === null ? void 0 : linesOf(text).find(([body]) => FOLDER_LINE.test(body));
  return line ? folderOfLine(line[0]) : null;
}
function setProjectFolder(file, home) {
  const wanted = folderValue(home);
  if ("error" in wanted) return { changed: false, detail: wanted.error };
  const text = readText(file);
  if (text === null) return { changed: false, detail: `${file} not found` };
  const lines = linesOf(text);
  const at = lines.findIndex(([body]) => FOLDER_LINE.test(body));
  const lineEnd = text.includes("\r\n") ? "\r\n" : "\n";
  let next;
  if (at < 0) next = `${text}${text === "" || /\n$/.test(text) ? "" : lineEnd}${FOLDER_KEY}: ${wanted.value}${lineEnd}`;
  else {
    if (folderState(file, home) === "same") return { changed: false, detail: `${file}: ${FOLDER_KEY} is set already` };
    next = lines.map(([body, ending], index) => index === at ? `${FOLDER_KEY}: ${wanted.value}${ending}` : body + ending).join("");
  }
  replaceInPlace(file, next);
  return { changed: true, detail: `set ${FOLDER_KEY} in ${file}` };
}
function editableHome(home, context = {}) {
  if (alfredSerenaHome(home))
    return { ok: false, reason: `serena's settings at ${configOf(home)} are alfred-code's - base_modes is left; its manual still names edit tools serena does not have` };
  return { ok: true, shared: context.platform === "win32" };
}

// scripts/apply/constants.ts
var FETCH_LIMIT_MS = 18e5;
var KILL_AFTER_MS = 5e3;

// scripts/apply/fetch.ts
var VERSION = 1;
var START_MS = 6e5;
var INIT = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "alfred-tools", version: "0" } } };
var expandedText = (text, env) => expandVars(text, env).value;
var unsetVar = (entry, env) => [...JSON.stringify([entry.command, entry.args || [], entry.env || {}]).matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map(([, variableName = ""]) => variableName).find((variableName) => env[variableName] === void 0) || null;
function fetchSpawnArgs(argv, platform, shim) {
  const [command = "", ...rest] = argv;
  return spawnArgs(command, rest, platform, shim);
}
function realFetch(argv, { cwd, env }) {
  const [command = "", ...rest] = argv;
  const shim = process.platform === "win32" ? shimOfLaunch(command, rest, env, fs5.existsSync, cwd) : void 0;
  const spawnArguments = fetchSpawnArgs(argv, process.platform, shim);
  return spawnSync3(spawnArguments.file, spawnArguments.args, { cwd, env, encoding: "utf8", timeout: FETCH_LIMIT_MS, windowsHide: true, shell: spawnArguments.shell, stdio: ["ignore", "pipe", "pipe"] });
}
function stopTree(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    if (process.platform === "win32") {
      spawnSync3("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
      return resolve();
    }
    const pid = child.pid;
    const kill = (signal) => {
      if (pid === void 0) return;
      try {
        process.kill(-pid, signal);
      } catch {
      }
    };
    const hard = setTimeout(() => {
      kill("SIGKILL");
      resolve();
    }, KILL_AFTER_MS);
    child.once("exit", () => {
      clearTimeout(hard);
      kill("SIGKILL");
      resolve();
    });
    kill("SIGTERM");
  });
}
function realStart(entry, { cwd, env, ms: timeoutMilliseconds = START_MS }) {
  return new Promise((resolve) => {
    const childEnv = { ...env };
    for (const [variableName, value] of Object.entries(entry.env || {})) childEnv[variableName] = expandedText(value, env);
    const startedAt = Date.now();
    let child;
    try {
      child = spawn(expandedText(entry.command, env), (entry.args || []).map((argument) => expandedText(argument, env)), { cwd, env: childEnv, stdio: ["pipe", "pipe", "pipe"], detached: process.platform !== "win32", windowsHide: true });
    } catch (caught) {
      resolve({ ok: false, ms: 0, why: errorMessage(caught) });
      return;
    }
    let out = "";
    let err = "";
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const took = Date.now() - startedAt;
      stopTree(child).then(() => resolve({ ...result, ms: took }));
    };
    const timer = setTimeout(() => done({ ok: false, why: `no answer in ${timeoutMilliseconds / 1e3}s` }), timeoutMilliseconds);
    child.on("error", (error) => done({ ok: false, why: error.message }));
    child.on("exit", (code) => done({ ok: false, why: `exited ${code} before answering${err.trim() ? `: ${err.trim().split("\n").slice(-1)[0]}` : ""}` }));
    child.stdin.on("error", () => {
    });
    child.stderr.on("data", (chunk) => {
      err = `${err}${chunk}`.slice(-4e3);
    });
    child.stdout.on("data", (chunk) => {
      const lines = `${out}${chunk}`.split("\n");
      out = lines.pop() ?? "";
      for (const line of lines) {
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id === 1) return done(msg.result ? { ok: true } : { ok: false, why: `initialize error: ${JSON.stringify(msg.error)}` });
      }
    });
    child.stdin.write(`${JSON.stringify(INIT)}
`);
  });
}
function serverStatus(names, { cwd, env, runCli = runClaude, log = console.log }) {
  if (names.length) log("", "Status, from the CLI:");
  return names.map((name) => {
    const result = runCli(["mcp", "get", name], { cwd, env });
    const lines = `${result.stdout || ""}${result.stderr || ""}`.trim().split("\n").map((line) => line.trim()).filter(Boolean);
    const out = lines.find((line) => /^Status:/i.test(line)) || lines.slice(-1)[0] || "(no output)";
    log(`  ${name}: ${out}`);
    return { name, out, issue: lines.find((line) => /^Issue:/i.test(line)) || null };
  });
}
async function runFetchJob(job, { env = process.env, runFetch = realFetch, start = realStart, runCli = runClaude, log = console.log } = {}) {
  const report = { fetched: [], started: [], skipped: [], warnings: [], status: [] };
  const cwd = job.project;
  const warn = (stepNumber, detail) => {
    report.warnings.push(detail);
    log(`${stepNumber}. warn   ${detail}`);
  };
  for (const [i, step] of job.fetch.entries()) {
    const stepNumber = i + 1;
    const stepEnv = { ...env };
    for (const [variableName, value] of Object.entries(step.env || {})) stepEnv[variableName] = expandedText(value, env);
    log(`${stepNumber}. ...    fetching ${step.what} for '${step.name}'`);
    const startedAt = Date.now();
    const result = runFetch(step.argv, { cwd, env: stepEnv });
    if (result.error || result.status !== 0) {
      const why = result.error ? result.error.message : `exit ${result.status}: ${`${result.stderr || ""}${result.stdout || ""}`.trim().split("\n").slice(-2).join(" | ")}`;
      warn(stepNumber, `could not fetch ${step.what} for '${step.name}' (${why}) - the registration stays; its first start fetches it and may time out once`);
      continue;
    }
    report.fetched.push(step.what);
    log(`${stepNumber}. ok     ${step.what} is in the cache (${Math.round((Date.now() - startedAt) / 1e3)}s)`);
    const entry = step.scope ? readRegistration(step.name, step.scope, step.from || cwd, env) : void 0;
    if (!entry || !entry.command) {
      warn(stepNumber, `'${step.name}' is not at ${step.scope || "a known"} scope any more - not started`);
      continue;
    }
    if (bridgeParts(entry)) {
      const line = `'${step.name}' not started: a bridge has no first-run work beyond its package`;
      report.skipped.push(line);
      log(`${stepNumber}. skip   ${line}`);
      continue;
    }
    if (signInParts(entry)) {
      const line = `'${step.name}' not started: its first start opens the sign-in, which belongs to Claude Code or Cursor - sign in now with dist/sign-in.mjs ${step.name} ${step.scope}`;
      report.skipped.push(line);
      log(`${stepNumber}. skip   ${line}`);
      continue;
    }
    const missing = unsetVar(entry, env);
    if (missing) {
      const line = `'${step.name}' not started: \${${missing}} is not set - its first session start with it set does the first-run work`;
      report.skipped.push(line);
      log(`${stepNumber}. skip   ${line}`);
      continue;
    }
    log(`${stepNumber}. ...    starting '${step.name}' once (a first start can download more, such as a model)`);
    const home = step.row === "serena" && entry.env && entry.env.SERENA_HOME || null;
    const editable = home !== null && editableHome(home, { platform: process.platform }).ok;
    const keyWasThere = home !== null && editable && folderState(configOf(home), home) === "same";
    const startResult = await start(entry, { cwd, env });
    if (startResult.ok) {
      report.started.push(step.name);
      log(`${stepNumber}. ok     '${step.name}' answered its first start in ${(startResult.ms / 1e3).toFixed(1)}s`);
      if (home && editable) {
        const file = configOf(home);
        log(`${stepNumber}. ok     ${emptyBaseModes(file).detail}`);
        const replaced = folderCurrent(file);
        const folder = setProjectFolder(file, home);
        const was = replaced !== null ? `serena's first start left ${FOLDER_KEY} at ${replaced} - ` : keyWasThere ? `serena's first start dropped ${FOLDER_KEY} - ` : "";
        if (folder.changed) log(`${stepNumber}. ok     ${was}serena: project folders set to ${home}/projects`);
      }
    } else warn(stepNumber, `'${step.name}' did not answer its first start (${startResult.why}) - the registration stays; its first session start tries again`);
  }
  report.status = serverStatus(job.check, { cwd, env, runCli, log });
  log("", report.warnings.length ? `Done, with ${report.warnings.length} warning${report.warnings.length > 1 ? "s" : ""}. Restart Claude Code now so the registrations load.` : "Done. Restart Claude Code now so the registrations load.");
  return report;
}

// scripts/apply/fetch-command.ts
async function runFetchCommand(argv) {
  blockingStdio();
  const file = argv[0];
  if (!file) {
    console.error("usage: fetch.mjs <fetch.json>");
    return 2;
  }
  let job;
  try {
    job = JSON.parse(fs6.readFileSync(file, "utf8"));
  } catch (caught) {
    console.error(`fetch: cannot read ${file} (${errorMessage(caught)})`);
    return 2;
  }
  if (job.version !== VERSION || !Array.isArray(job.fetch) || !Array.isArray(job.check) || !job.project) {
    console.error(`fetch: ${file} is not a fetch file of version ${VERSION}`);
    return 2;
  }
  const log = (...lines) => console.log(lines.join("\n"));
  const result = await runFetchJob(job, { log });
  releaseTempDir(path7.dirname(path7.resolve(file)), log);
  return result.warnings.length ? 1 : 0;
}

// scripts/fetch.ts
exitWhenSettled(runFetchCommand(process.argv.slice(2)), "fetch");
