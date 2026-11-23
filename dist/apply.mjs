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
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
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
    var fs21 = __require("node:fs");
    var os3 = __require("node:os");
    var path22 = __require("node:path");
    var crypto = __require("node:crypto");
    var HELPER_VERSION3 = 6;
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
        buf = fs21.readFileSync(file);
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
      const dirs = [dir, extraRoot, path22.join(home, ".alfred-tools"), path22.join(home, ".alfred")].filter(Boolean);
      return [...new Set(dirs.map((d) => path22.join(d, SECRETS2)))];
    }
    var digestOf2 = (text) => crypto.createHash("sha256").update(String(text).replace(/\r\n/g, "\n")).digest("hex");
    function valueIn2(name, files) {
      for (const file of files) {
        const value = (readDotenv2(file) || {})[name];
        if (value) return { value, file };
      }
      return null;
    }
    var authValue = (scheme, value) => `${scheme} ${scheme === "Basic" && value.includes(":") ? Buffer.from(value, "utf8").toString("base64") : value}`;
    function parsePair(text) {
      const at2 = text.search(/[=:]/);
      if (at2 < 1) return null;
      const header = text.slice(0, at2);
      const rest = text.slice(at2 + 1);
      if (!HEADER_RULE.test(header) || header.toLowerCase() === "authorization") return null;
      if (text[at2] === "=") return NAME_RULE.test(rest) ? { header, var: rest } : null;
      return FIXED_VALUE_RULE.test(rest) ? { header, value: rest } : null;
    }
    function parsePairs2(argv) {
      let root2 = null;
      const pairs = [];
      for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--header") {
          const pair = i + 1 < argv.length ? parsePair(argv[i + 1]) : null;
          if (!pair) return { error: USAGE };
          pairs.push(pair);
          i++;
        } else if (root2 === null) root2 = argv[i];
        else return { error: USAGE };
      }
      return { root: root2, pairs };
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
      const files = chainOf(__dirname, extraRoot ? path22.resolve(extraRoot) : null, home);
      const found = valueIn2(name, files);
      if (found) {
        const out = { Authorization: authValue(scheme, found.value) };
        for (const pair of pairs) {
          const value = "var" in pair ? (valueIn2(pair.var, files) || {}).value : pair.value;
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
    module.exports = { HELPER_VERSION: HELPER_VERSION3, chainOf, digestOf: digestOf2, readDotenv: readDotenv2, valueIn: valueIn2, authValue, parsePairs: parsePairs2 };
  }
});

// scripts/copied/mcp-bridge.js
var require_mcp_bridge = __commonJS({
  "scripts/copied/mcp-bridge.js"(exports, module) {
    "use strict";
    var fs21 = __require("node:fs");
    var os3 = __require("node:os");
    var path22 = __require("node:path");
    var { spawn } = __require("node:child_process");
    var BRIDGE_VERSION3 = 4;
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
      const names2 = [];
      for (const [i, s] of parts.segments.entries()) {
        const m = PLACEHOLDER2.exec(s);
        if (!m) continue;
        if (!NAME_RULE.test(m[1])) return null;
        if (m[2] && i !== parts.segments.length - 1) return null;
        if (names2.some((n) => n.name === m[1])) return null;
        names2.push({ name: m[1], optional: Boolean(m[2]) });
      }
      return names2;
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
      const at2 = text.search(/[=:]/);
      if (at2 < 1) return null;
      const header = text.slice(0, at2);
      const rest = text.slice(at2 + 1);
      if (!HEADER_RULE.test(header) || header.toLowerCase() === "authorization") return null;
      if (text[at2] === "=") return NAME_RULE.test(rest) ? { header, var: rest } : null;
      return FIXED_VALUE_RULE.test(rest) ? { header, value: rest } : null;
    }
    function parsePairs2(argv) {
      let root2 = null;
      const pairs = [];
      for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--header") {
          const pair = i + 1 < argv.length ? parsePair(argv[i + 1]) : null;
          if (!pair) return null;
          pairs.push(pair);
          i++;
        } else if (root2 === null) root2 = argv[i];
        else return null;
      }
      return { root: root2, pairs };
    }
    function launch(argv, env, { dir, platform, helper: helper2 } = {}) {
      const [template, keyName, scheme, pkg, ...extra] = argv;
      if (!template || !keyName || !NAME_RULE.test(keyName) || !scheme || !SCHEME_RULE.test(scheme) || !pkg || !PACKAGE_RULE.test(pkg)) return { error: USAGE };
      const parsed = parsePairs2(extra);
      if (!parsed) return { error: USAGE };
      const { root: globalRoot, pairs } = parsed;
      const names2 = templateNames2(template);
      if (!names2) return { error: USAGE };
      if (!originAllowed(partsOf(template).origin)) return { error: "the URL template is not https - mcp-remote takes http only on 127.0.0.1 or localhost" };
      const keyLike = names2.find((n) => n.name === keyName || CREDENTIAL.test(n.name));
      if (keyLike) return { error: `${keyLike.name} in the URL template names a key - a key never goes in a URL` };
      const keyPair = pairs.find((p) => p.var === keyName);
      if (keyPair) return { error: `${keyPair.var} in a --header pair is the key's name - a key never goes in another header` };
      const h = helper2 || require_mcp_headers();
      const home = env.HOME || env.USERPROFILE || os3.homedir();
      const files = h.chainOf(dir, globalRoot ? path22.resolve(globalRoot) : null, home);
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
      for (const n of names2) {
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
        names: names2,
        auth: h.authValue(scheme, key.value),
        command: win ? env.ComSpec || "cmd.exe" : "npx",
        args: win ? ["/d", "/c", "npx", ...tail] : tail,
        childEnv: { ...env, ...pairEnv, PT_BRIDGE_AUTH: h.authValue(scheme, key.value) }
      };
    }
    function runChain(dir, globalRoot) {
      return [...new Set([dir, globalRoot].filter(Boolean).map((d) => path22.join(d, SECRETS2)))];
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
    function winLaunch(command, args, env, exists2) {
      const base = path22.win32.basename(command).toLowerCase();
      const direct = base === "cmd" || base === "cmd.exe" || /\.(exe|com)$/.test(base);
      const folders = String(env.PATH || env.Path || "").split(";").filter(Boolean);
      if (direct || folders.some((folder) => [".exe", ".com"].some((ext) => exists2(path22.win32.join(folder, command + ext))))) return { command, args };
      return { command: env.ComSpec || "cmd.exe", args: ["/d", "/c", command, ...args] };
    }
    function runLaunch(argv, env, { dir, platform, helper: helper2, exists: exists2 } = {}) {
      const parsed = parseRun(argv);
      if (parsed.error) return parsed;
      const h = helper2 || require_mcp_headers();
      const files = runChain(dir, parsed.globalRoot ? path22.resolve(parsed.globalRoot) : null);
      const found = h.valueIn(parsed.keyName, files);
      if (!found && !parsed.optional) return { error: `no value for ${parsed.keyName} in ${files.join(", ")}`, code: EXIT.failed };
      const start = platform === "win32" ? winLaunch(parsed.command, parsed.args, env, exists2 || fs21.existsSync) : { command: parsed.command, args: parsed.args };
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
      let helper2 = null;
      try {
        helper2 = require_mcp_headers();
      } catch {
        helper2 = null;
      }
      const number = helper2 && Number.isInteger(helper2.HELPER_VERSION) ? helper2.HELPER_VERSION : "missing";
      if (!helper2 || !(helper2.HELPER_VERSION >= NEEDS_HELPER) || typeof helper2.valueIn !== "function" || typeof helper2.readDotenv !== "function" || typeof helper2.authValue !== "function")
        fail(`mcp-headers.js beside it is helper ${number} - the bridge needs ${NEEDS_HELPER}; run /alfred-tools:fix`);
      let r;
      try {
        const options = { dir: __dirname, platform: process.platform, helper: helper2 };
        r = run ? runLaunch(argv.slice(1), process.env, options) : launch(argv, process.env, options);
      } catch {
        r = { error: "could not read the key files" };
      }
      if (r.error) fail(r.error, r.code);
      const child = spawn(r.command, r.args, { stdio: "inherit", windowsHide: true, env: r.childEnv });
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
    module.exports = { BRIDGE_VERSION: BRIDGE_VERSION3, NEEDS_HELPER, CREDENTIAL, RUN_FLAG, templateNames: templateNames2, fillTemplate, launch, runChain, parseRun, runLaunch };
  }
});

// scripts/apply/command.ts
import fs20 from "node:fs";

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
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  return value;
}
var deepEqual = (left, right) => JSON.stringify(sortKeys(left)) === JSON.stringify(sortKeys(right));

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
function sweepTempDirs(now = Date.now()) {
  const root2 = tempRoot();
  for (const name of fs.readdirSync(root2)) {
    if (!name.startsWith(PREFIX)) continue;
    const folder = path.join(root2, name);
    try {
      const stats = fs.lstatSync(folder);
      if (stats.isDirectory() && now - stats.mtimeMs > MAX_AGE_MS) fs.rmSync(folder, { recursive: true, force: true });
    } catch {
    }
  }
}
function makeTempDir() {
  try {
    sweepTempDirs();
  } catch {
  }
  return fs.mkdtempSync(path.join(tempRoot(), PREFIX));
}

// scripts/apply/run.ts
import fs19 from "node:fs";
import path21 from "node:path";

// scripts/core/claude-cli.ts
import { spawnSync } from "node:child_process";

// scripts/core/constants.ts
var CMD_PROGRAM_PATTERN = /^cmd(\.exe)?$/i;
var CMD_RUN_FLAG_PATTERN = /^\/c$/i;
var CMD_META_PATTERN = /([()\][%!^"`<>&|;, *?])/g;
var CLI_TIMEOUT_MS = 12e4;
var CLI_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
var FILES = { secrets: ".mcps-secrets", helper: "mcp-headers.js", record: "preferred-tools.json", map: "roots.json", bridge: "mcp-bridge.js", list: "mcps.json", signIns: "mcp-remote-v1", serenaContext: "serena-context.yml", macosExclude: "macos-mcp.toml" };
var ROOT_NAME = ".alfred-tools";
var FORMER_ROOT_NAME = ".preferred-tools";
var ALFRED_DATA = ".alfred";
var MCP_JSON = ".mcp.json";
var ALL_SCOPES = ["local", "project", "user"];
var PLUGIN_MANIFEST = ".claude-plugin/plugin.json";

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
var throughCmd = (command, args) => CMD_PROGRAM_PATTERN.test(command) && CMD_RUN_FLAG_PATTERN.test(args[0] || "");

// scripts/core/claude-cli.ts
function runClaude(args, { cwd, env, input, timeout = CLI_TIMEOUT_MS } = {}) {
  const options = { encoding: "utf8", cwd, env: env || process.env, input, timeout, windowsHide: true, maxBuffer: CLI_MAX_BUFFER_BYTES };
  let result = spawnSync("claude", args, options);
  if (process.platform === "win32" && result.error && ["ENOENT", "EINVAL"].includes(errorCode(result.error) ?? ""))
    result = spawnSync(["claude", ...args.map(cmdArg)].join(" "), { ...options, shell: true });
  return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "", error: result.error || null, signal: result.signal };
}
var available = (options) => {
  const result = runClaude(["--version"], options);
  return !result.error && result.status === 0 ? result.stdout.trim() : null;
};

// scripts/inventory/inventory.ts
import fs11 from "node:fs";
import path15 from "node:path";

// scripts/catalog/catalog.ts
import fs3 from "node:fs";
import path3 from "node:path";

// scripts/core/plugin-root.ts
import fs2 from "node:fs";
import path2 from "node:path";
import { fileURLToPath } from "node:url";
function findPluginRoot(start) {
  let dir = start;
  for (; ; ) {
    if (fs2.existsSync(path2.join(dir, PLUGIN_MANIFEST))) return dir;
    const parent = path2.dirname(dir);
    if (parent === dir) throw new Error(`alfred-tools: no ${PLUGIN_MANIFEST} above ${start}`);
    dir = parent;
  }
}
var root;
function pluginRoot() {
  return root ??= findPluginRoot(path2.dirname(fileURLToPath(import.meta.url)));
}

// scripts/catalog/shapes.ts
var isRowList = (value) => Array.isArray(value) && value.every((row) => isRecord(row) && typeof row["id"] === "string");
var isLaunchFingerprint = (fingerprint) => isRecord(fingerprint) && ["pkg", "command", "host", "bridge"].some((key) => typeof fingerprint[key] === "string" && fingerprint[key] !== "");
var isRetiredEntry = (entry) => isRecord(entry) && typeof entry["id"] === "string" && Array.isArray(entry["fingerprints"]) && entry["fingerprints"].every(isLaunchFingerprint) && typeof entry["since"] === "string" && typeof entry["reason"] === "string";
var isRetiredList = (retired, tools) => Array.isArray(retired) && retired.every(isRetiredEntry) && !retired.some((entry) => isRecord(entry) && Array.isArray(tools) && tools.some((row) => isRecord(row) && row["id"] === entry["id"]));
var isToolsFile = (value) => isRecord(value) && isRowList(value["tools"]) && isRecord(value["rules"]) && isRowList(value["groups"]) && isTextList(value["order"]) && isRetiredList(value["retired"], value["tools"]);
var isReservedFile = (value) => isRecord(value) && isTextList(value["names"]);
var isFixesFile = (value) => isRecord(value) && isRowList(value["fixes"]);

// scripts/catalog/catalog.ts
var CATALOG_DIR = path3.join(pluginRoot(), "catalog");
function readChecked(file, isDoc) {
  const value = JSON.parse(fs3.readFileSync(file, "utf8"));
  if (!isDoc(value)) throw new Error(`catalog: ${file} is not in the shape alfred-tools ships - reinstall the plugin`);
  return value;
}
function load(dir = CATALOG_DIR) {
  const tools = readChecked(path3.join(dir, "tools.json"), isToolsFile);
  const reserved = new Set(readChecked(path3.join(dir, "reserved-names.json"), isReservedFile).names);
  const byId = new Map(tools.tools.map((row) => [row.id, row]));
  return { ...tools, reserved, byId, fixes: readChecked(path3.join(dir, "fixes.json"), isFixesFile).fixes };
}
function fingerprintKey(fingerprint) {
  if (fingerprint.bridge) return `bridge:${fingerprint.bridge}`;
  if (fingerprint.pkg) return `pkg:${fingerprint.pkg}${fingerprint.flag ? `+${fingerprint.flag}=${fingerprint.value}` : ""}`;
  if (fingerprint.command) return `cmd:${fingerprint.command}`;
  return `url:${fingerprint.host || "*"}${fingerprint.pathPrefix || ""}`;
}

// scripts/core/account.ts
var account_exports = {};
__export(account_exports, {
  accountFile: () => accountFile,
  configDir: () => configDir,
  homeDir: () => homeDir,
  localRoot: () => localRoot,
  projectEntry: () => projectEntry,
  projectKey: () => projectKey,
  readAccount: () => readAccount,
  readRegistration: () => readRegistration,
  readState: () => readState
});
import fs4 from "node:fs";
import os2 from "node:os";
import path4 from "node:path";
import { spawnSync as spawnSync2 } from "node:child_process";
var homeDir = (env = process.env) => env.HOME || env.USERPROFILE || os2.homedir();
var configDir = (env = process.env) => env.CLAUDE_CONFIG_DIR ? path4.resolve(env.CLAUDE_CONFIG_DIR) : path4.join(homeDir(env), ".claude");
var accountFile = (env = process.env) => env.CLAUDE_CONFIG_DIR ? path4.join(path4.resolve(env.CLAUDE_CONFIG_DIR), ".claude.json") : path4.join(homeDir(env), ".claude.json");
function projectKey(dir) {
  try {
    return fs4.realpathSync.native(dir);
  } catch {
    return path4.resolve(dir);
  }
}
function localRoot(project) {
  if (fs4.existsSync(path4.join(project, ".git")) || !fs4.existsSync(project)) return project;
  const result = spawnSync2("git", ["rev-parse", "--show-toplevel"], { cwd: project, encoding: "utf8", windowsHide: true });
  return result.status === 0 && result.stdout.trim() ? path4.resolve(result.stdout.trim()) : project;
}
function readState(file, isDoc) {
  let text;
  try {
    text = fs4.readFileSync(file, "utf8");
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
function projectEntry(projects, project, platform = process.platform) {
  const key = entryKey(projects, project, platform);
  return key === void 0 ? void 0 : projects[key];
}
function entryKey(projects, project, platform) {
  if (platform !== "win32") return [projectKey(project), path4.resolve(project)].find((key) => Boolean(projects[key]));
  let real = null;
  try {
    real = fs4.realpathSync.native(project);
  } catch {
  }
  const want = [path4.win32.resolve(project), real].filter((folder) => Boolean(folder)).map((folder) => folder.replace(/\\/g, "/"));
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
    const state = readState(path4.join(project, MCP_JSON), isAccountProject);
    return state.doc && state.doc.mcpServers ? state.doc.mcpServers[name] : void 0;
  }
  const account = readAccount(env, project);
  return (scope === "user" ? account.user : account.local)[name];
}

// scripts/core/kept.ts
var MARKER = "${ALFRED_TOOLS_KEPT}";
var OLD_MARKER = "${PREFERRED_TOOLS_KEPT}";
var SECRET_KEY_RE = /(TOKEN|SECRET|KEY|PASSWORD|PASSWD|DSN|CREDENTIAL|AUTH)$/i;
var FILE_KEY_EXTRA = /(?:^|[._-])pass(?:phrase)?$|(?:^|[._-])(?:client|private)[-_]?key[-_]?data$|^requirepass$/i;
var CAMEL_PASS = /[a-z0-9](?:Pass(?:phrase)?|PWD|Pwd)$/;
var credKey = (key) => SECRET_KEY_RE.test(key) || FILE_KEY_EXTRA.test(key) || CAMEL_PASS.test(key);
var SHAPE = /\b(?:sntryu_[0-9a-f]{16,}|ctx7sk-[0-9a-f-]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|sq[upa]_[0-9a-f]{40}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g;
var PRIVATE_KEY_BLOCK = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----|$)/g;
var PAIR = /((?:^|[;,])\s*(?:password|pwd)\s*=\s*)([^;,]*)/gi;
var USERINFO = /(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]*:)([^@\s/]+)(?=@)/gi;
var PLACEHOLDER = /^\s*(?:[A-Za-z][\w-]*\s+)?(?:\$\{[A-Za-z_][A-Za-z0-9_]*(?::-[^}]*)?\})+\s*$/;
var live = (value) => typeof value === "string" && value.trim() !== "" && !PLACEHOLDER.test(value);
var maskParts = (text) => text.replace(PRIVATE_KEY_BLOCK, MARKER).replace(SHAPE, MARKER).replace(PAIR, (all, head, value) => live(value) ? head + MARKER : all).replace(USERINFO, (all, head, value) => live(value) ? head + MARKER : all);
var keepString = (text, whole) => !live(text) ? text : whole ? MARKER : maskParts(text);
var flagName = (argument) => typeof argument === "string" && /^--?[A-Za-z]/.test(argument) ? argument.replace(/^--?/, "").split("=")[0] ?? "" : null;
function locationKeys(row) {
  const derived = row && row.locations && row.locations.derived || [];
  return { env: new Set(derived.filter((derivedLocation) => derivedLocation.in === "env").map((derivedLocation) => derivedLocation.key)), arg: new Set(derived.filter((derivedLocation) => derivedLocation.in === "arg").map((derivedLocation) => derivedLocation.key)) };
}
function keepArgs(args, whole, locArgs = /* @__PURE__ */ new Set()) {
  return args.map((argument, i) => {
    if (typeof argument !== "string") return keepNode(argument, "", whole);
    const prev = i > 0 ? args[i - 1] : null;
    if (typeof prev === "string" && locArgs.has(prev)) return argument;
    const equalsIndex = argument.indexOf("=");
    const name = flagName(argument);
    if (name !== null && equalsIndex > 0) {
      const flag = argument.slice(0, equalsIndex);
      if (locArgs.has(flag)) return argument;
      const value = argument.slice(equalsIndex + 1);
      return `${flag}=${keepString(value, whole || credKey(name))}`;
    }
    if (name !== null) return argument;
    const prevName = flagName(prev);
    return keepString(argument, whole || Boolean(prevName !== null && typeof prev === "string" && !prev.includes("=") && credKey(prevName)));
  });
}
function keepNode(node, key, whole) {
  if (typeof node === "string") return keepString(node, whole || credKey(key));
  if (Array.isArray(node)) return keepArgs(node, whole || credKey(key));
  if (!node || typeof node !== "object") return node;
  const below = whole || credKey(key);
  return Object.fromEntries(Object.entries(node).map(([childKey, value]) => [childKey, keepNode(value, childKey, below)]));
}
function maskCredentials(entry, row) {
  const out = structuredClone(entry);
  if (Array.isArray(out)) {
    out.forEach((value, i) => {
      out[i] = keepNode(value, String(i), false);
    });
    return out;
  }
  if (!isRecord(out)) return out;
  const fields = out;
  const locations = locationKeys(row);
  for (const [key, value] of Object.entries(fields)) {
    if (key === "args" && Array.isArray(value)) fields[key] = keepArgs(value, false, locations.arg);
    else if (key === "headers" && isRecord(value)) fields[key] = Object.fromEntries(Object.entries(value).map(([headerName, headerValue]) => [headerName, keepNode(headerValue, headerName, true)]));
    else if (key === "env" && isRecord(value)) fields[key] = Object.fromEntries(Object.entries(value).map(([variableName, variableValue]) => [variableName, locations.env.has(variableName) ? variableValue : keepNode(variableValue, variableName, false)]));
    else fields[key] = keepNode(value, key, false);
  }
  return out;
}
var childAt = (node, segment) => Array.isArray(node) ? node[Number(segment)] : isRecord(node) ? node[String(segment)] : void 0;
var valueAt = (node, path22) => path22.reduce(childAt, node);
function restore(entry, source, row) {
  const kept = maskCredentials(source || {}, row);
  const sourceArgs = source && Array.isArray(source.args) ? source.args : [];
  const used = /* @__PURE__ */ new Set();
  let error = null;
  const fill = (node, path22) => {
    if (typeof node === "string") {
      if (!node.includes(MARKER)) return node;
      if (path22.length === 2 && path22[0] === "args") {
        const j = (kept.args || []).findIndex((keptArg, i) => !used.has(i) && keptArg === node);
        if (j < 0) {
          error = error || `args[${path22[1]}] holds a kept value the registration no longer has`;
          return node;
        }
        used.add(j);
        return sourceArgs[j];
      }
      if (valueAt(kept, path22) !== node) {
        error = error || `${path22.join(".")} holds a kept value the registration no longer has`;
        return node;
      }
      return valueAt(source, path22);
    }
    fillChildren(node, path22);
    return node;
  };
  const fillChildren = (node, path22) => {
    if (Array.isArray(node)) node.forEach((item, i) => {
      node[i] = fill(item, [...path22, i]);
    });
    else if (isRecord(node)) for (const [key, value] of Object.entries(node)) node[key] = fill(value, [...path22, key]);
  };
  const out = structuredClone(entry);
  fillChildren(out, []);
  return error ? { error } : { entry: out };
}
var holdsKept = (node) => JSON.stringify(node === void 0 ? null : node).includes(MARKER);

// scripts/roots/roots.ts
import fs6 from "node:fs";
import path9 from "node:path";
import { spawnSync as spawnSync3 } from "node:child_process";

// scripts/core/replace-file.ts
import fs5 from "node:fs";
function replaceFile(file, text, mode) {
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs5.writeFileSync(temporary, text, mode === void 0 ? void 0 : { mode });
    if (mode !== void 0) fs5.chmodSync(temporary, mode);
    fs5.renameSync(temporary, file);
  } catch (error) {
    fs5.rmSync(temporary, { force: true });
    throw error;
  }
}

// scripts/entries/platform.ts
import path5 from "node:path";
var pathFor = (platform) => platform === "win32" ? path5.win32 : path5.posix;
var pathApiOf = (pathText) => /^(?:[A-Za-z]:[\\/]|\\\\)/.test(pathText) ? path5.win32 : path5.posix;
function isInside(pathApi, folder, file, { orSame }) {
  const relativePath = pathApi.relative(folder, file);
  if (relativePath === "") return orSame;
  return !relativePath.startsWith("..") && !pathApi.isAbsolute(relativePath);
}

// scripts/catalog/rows.ts
function locationsOf(row) {
  if (!row.locations) throw new Error(`${row.id}: the catalog gives it no data folder`);
  return row.locations;
}

// scripts/entries/locations.ts
var familyOf = (scope) => scope === "user" ? "global" : "project";
function rootOfEntry(row, entry) {
  const [derivedLocation] = locationsOf(row).derived;
  if (!derivedLocation) throw new Error(`${row.id}: the catalog derives no path from its data folder`);
  let value;
  if (derivedLocation.in === "env") value = (entry.env || {})[derivedLocation.key];
  else {
    const args = entry.args || [];
    const i = args.indexOf(derivedLocation.key);
    value = i >= 0 ? args[i + 1] : void 0;
  }
  if (typeof value !== "string") return null;
  if (!derivedLocation.sub) return value;
  const cut = value.replace(/[\\/]+$/, "");
  const tail = cut.slice(-derivedLocation.sub.length);
  return tail === derivedLocation.sub ? cut.slice(0, -derivedLocation.sub.length).replace(/[\\/]+$/, "") : value;
}

// scripts/entries/entry.ts
import path8 from "node:path";

// scripts/keys/keys.ts
var import_mcp_headers = __toESM(require_mcp_headers(), 1);
import path7 from "node:path";

// scripts/entries/launcher.ts
import path6 from "node:path";

// scripts/entries/constants.ts
var RUN = { flag: "--run", end: "--", optional: "?" };
var RUN_RESERVED_ENV = /^PT_BRIDGE_/;
var RUN_PAIR = /^([A-Za-z_][A-Za-z0-9_]*)=([A-Za-z_][A-Za-z0-9_]*)(\?)?$/;

// scripts/entries/launcher.ts
var isNode = (command) => path6.basename(command.replace(/\\/g, "/")).replace(/\.exe$/i, "").toLowerCase() === "node";
var isBridgePath = (argument) => argument.replace(/\\/g, "/").split("/").pop() === FILES.bridge;
function launcherParts(entry) {
  if (!entry || typeof entry !== "object" || typeof entry.command !== "string" || !Array.isArray(entry.args) || !isNode(entry.command)) return null;
  const args = entry.args.map(String);
  const at2 = args.findIndex(isBridgePath);
  const bridgePath = args[at2];
  if (at2 < 0 || bridgePath === void 0 || args[at2 + 1] !== RUN.flag) return null;
  const pair = RUN_PAIR.exec(args[at2 + 2] ?? "");
  const [, envVar, keyName, optional] = pair ?? [];
  if (envVar === void 0 || keyName === void 0 || RUN_RESERVED_ENV.test(envVar)) return null;
  const end = args.indexOf(RUN.end, at2 + 3);
  if (end < 0 || end > at2 + 4) return null;
  const command = args[end + 1];
  if (!command) return null;
  const globalRoot = end === at2 + 4 ? args[at2 + 3] || null : null;
  const inner = { command, args: args.slice(end + 2), ...entry.env ? { env: entry.env } : {} };
  return { path: bridgePath, envVar, keyName, optional: optional === RUN.optional, globalRoot, inner };
}
var launchOf = (entry) => launcherParts(entry)?.inner ?? entry;

// scripts/keys/keys.ts
var KEY_FILES = [path7.join(ROOT_NAME, ".secrets"), path7.join(FORMER_ROOT_NAME, ".secrets")];
function formFields(entry, form, ref) {
  const out = [];
  const envTemplates = { ...form.env || {}, ...form.optionalEnv && form.optionalEnv.token || {} };
  for (const [fieldName, template] of Object.entries(envTemplates))
    if (template.includes(ref) && entry.env && Object.hasOwn(entry.env, fieldName)) out.push({ at: ["env", fieldName], template });
  const [tokenFlag, tokenTemplate] = form.optionalArgs && form.optionalArgs.token || [];
  const args = Array.isArray(entry.args) ? entry.args : [];
  const i = tokenFlag === void 0 ? -1 : args.indexOf(tokenFlag);
  if (i >= 0 && i + 1 < args.length && tokenTemplate !== void 0) out.push({ at: ["args", i + 1], template: tokenTemplate });
  return out;
}
function tokenFields(entry, route) {
  if (!route || !route.tokenVar || !entry) return [];
  const ref = `\${${route.tokenVar}}`;
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (field) => {
    const key = field.at.join("\0");
    if (!seen.has(key)) {
      seen.add(key);
      out.push(field);
    }
  };
  const current = { ...route.env ? { env: route.env } : {}, ...route.optionalEnv ? { optionalEnv: route.optionalEnv } : {}, ...route.optionalArgs && route.optionalArgs.token ? { optionalArgs: { token: route.optionalArgs.token } } : {} };
  formFields(entry, current, ref).forEach(add);
  const routeHeaders = "headers" in route && isRecord(route.headers) ? route.headers : void 0;
  for (const [fieldName, template] of Object.entries(routeHeaders || {}))
    if (typeof template === "string" && template.includes(ref) && entry.headers && Object.hasOwn(entry.headers, fieldName)) add({ at: ["headers", fieldName], template });
  for (const form of route.formerly || []) formFields(entry, form, ref).forEach(add);
  return out;
}
function fillKeys(entry, row, routeId, scope, found = {}) {
  const route = row && row.routes ? row.routes[routeId] : null;
  const tokenVar = route ? route.tokenVar : void 0;
  const fields = tokenFields(entry, route);
  if (!fields.length || tokenVar === void 0) return entry;
  const value = found[tokenVar];
  if (scope !== "project" && typeof value !== "string") return entry;
  const out = JSON.parse(JSON.stringify(entry));
  if (!isServerEntry(out)) return entry;
  for (const field of fields) {
    const text = scope === "project" ? field.template : field.template.split(`\${${tokenVar}}`).join(value);
    const [where, at2] = field.at;
    if (where === "args" && out.args) out.args[at2] = text;
    else if (where !== "args" && out[where]) out[where][at2] = text;
  }
  return out;
}
var SECRETS = FILES.secrets;
var pathApiOn = (platform) => platform ? pathFor(platform) : path7;
var secretsIn = (dir, platform) => pathApiOn(platform).join(dir, SECRETS);
var uniq = (list) => [...new Set(list)];
function stdioChain({ scope, projectRoot, globalRoot, platform }) {
  if (scope === "local") return uniq([projectRoot, globalRoot].filter((dir) => Boolean(dir)).map((dir) => secretsIn(dir, platform)));
  if (scope === "user") return globalRoot ? [secretsIn(globalRoot, platform)] : [];
  return [];
}
function valueIn(files, name) {
  return (0, import_mcp_headers.valueIn)(name, files);
}
var namesIn = (file) => Object.keys((0, import_mcp_headers.readDotenv)(file) || {});
function nameOfValue(files, value) {
  if (typeof value !== "string" || value === "") return null;
  for (const file of files) {
    const hit = Object.entries((0, import_mcp_headers.readDotenv)(file) || {}).find(([, heldValue]) => heldValue === value);
    if (hit) return hit[0];
  }
  return null;
}

// scripts/entries/entry.ts
var import_mcp_bridge = __toESM(require_mcp_bridge(), 1);
var import_mcp_headers2 = __toESM(require_mcp_headers(), 1);

// scripts/entries/sign-in.ts
function mcpRemotePackage(catalog) {
  const packageSpec = catalog.byId.get("sentry")?.routes.bridge?.package;
  if (!packageSpec) throw new Error("the catalog has no sentry bridge route, whose package is mcp-remote's pin");
  return packageSpec;
}
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
  const at2 = args.findIndex((argument) => /^mcp-remote@\S+$/.test(argument));
  const pin = args[at2];
  if (at2 < 0 || pin === void 0) return null;
  const url = args.slice(at2 + 1).find((argument) => !argument.startsWith("-"));
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

// scripts/entries/exclude.ts
var excludeToml = (tools) => `[tools]
exclude = [${tools.map((tool) => JSON.stringify(tool)).join(", ")}]
`;

// scripts/entries/entry.ts
function helperArgv(command) {
  const out = [];
  let current = null;
  const text = String(command);
  for (let i = 0; i < text.length; i++) {
    const character = text.charAt(i);
    if (character === "'" || character === '"') {
      const end = text.indexOf(character, i + 1);
      const stop = end < 0 ? text.length : end;
      current = (current || "") + text.slice(i + 1, stop);
      i = stop;
    } else if (character === "\\" && (text[i + 1] === "'" || text[i + 1] === '"')) {
      current = (current || "") + text[i + 1];
      i++;
    } else if (/\s/.test(character)) {
      if (current !== null) out.push(current);
      current = null;
    } else current = (current || "") + character;
  }
  if (current !== null) out.push(current);
  return out;
}
var pairText = (pair) => "var" in pair ? `${pair.header}=${pair.var}` : `${pair.header}:${pair.value}`;
function helperParts(command) {
  if (typeof command !== "string") return null;
  const argv = helperArgv(command);
  const at2 = argv.findIndex((argument) => argument.endsWith(FILES.helper));
  const helperPath = argv[at2];
  if (at2 < 0 || helperPath === void 0) return null;
  const args = argv.slice(at2 + 1);
  const parsed = (0, import_mcp_headers2.parsePairs)(args.slice(2));
  const read = "error" in parsed ? { root: args[2] !== void 0 && args[2] !== "--header" ? args[2] : null, pairs: [] } : { root: parsed.root, pairs: parsed.pairs.map(pairText) };
  return { path: helperPath, args, ...read };
}
function bridgeParts(entry) {
  if (!entry || typeof entry !== "object" || typeof entry.command !== "string" || !Array.isArray(entry.args)) return null;
  if (path8.basename(entry.command.replace(/\\/g, "/")).replace(/\.exe$/i, "").toLowerCase() !== "node") return null;
  const args = entry.args.map(String);
  const at2 = args.findIndex((argument) => argument.replace(/\\/g, "/").split("/").pop() === FILES.bridge);
  const bridgePath = args[at2];
  const template = args[at2 + 1];
  if (at2 < 0 || bridgePath === void 0 || !template || template === RUN.flag) return null;
  const [keyName = null, scheme = null, packageSpec = null, ...after] = args.slice(at2 + 2);
  const parsed = (0, import_mcp_headers2.parsePairs)(after);
  const read = "error" in parsed ? { root: after[0] !== void 0 && after[0] !== "--header" ? after[0] : null, pairs: [] } : { root: parsed.root, pairs: parsed.pairs.map(pairText) };
  return { path: bridgePath, template, keyName, scheme, packageSpec, globalRoot: read.root, pairs: read.pairs };
}
function withoutPairs(args) {
  const out = [];
  let pairNext = false;
  for (const argument of args) {
    if (pairNext) pairNext = false;
    else if (argument === "--header") pairNext = true;
    else out.push(argument);
  }
  return out;
}

// scripts/roots/roots.ts
var helper = __toESM(require_mcp_headers(), 1);
var import_mcp_bridge2 = __toESM(require_mcp_bridge(), 1);
var ROOT_FILE_NAMES = [FILES.secrets, FILES.helper, FILES.bridge, FILES.list, FILES.record, FILES.serenaContext, ".secrets"];
var READ_GUARD = { signIns: `Read(//**/${FILES.signIns}/**)`, secrets: `Read(//**/${FILES.secrets})` };
var GITIGNORE = "*\n!.gitignore\n!mcp-headers.js\n!mcp-bridge.js\n!serena-context.yml\n!macos-mcp.toml\n";
var SERENA_CONTEXT_VERSION = 2;
var MAP_VERSION = 1;
var SCOPES_OF = { project: ["project", "local"], global: ["user"] };
var existsOf = (context) => context.exists || ((filePath) => fs6.existsSync(filePath));
var loaded = null;
var catalogOf = (context) => context.catalog || (loaded = loaded || load());
var emptyMap = () => ({ version: MAP_VERSION, global: null, projects: {} });
var newerOrBad = (version, current) => typeof version === "number" && version > current ? "newer" : "bad";
var versionNote = (file, version, current) => newerOrBad(version, current) === "newer" ? `${file} is version ${version}, newer than this plugin's ${current}` : `${file} is version ${JSON.stringify(version)}, not ${current}`;
function readMap(dataDir) {
  if (!dataDir) return emptyMap();
  const file = path9.join(dataDir, FILES.map);
  let text;
  try {
    text = fs6.readFileSync(file, "utf8");
  } catch (caught) {
    const code = errorCode(caught);
    return code === "ENOENT" ? emptyMap() : { ...emptyMap(), note: `${file} cannot be read (${code}) - read as empty`, state: "unreadable" };
  }
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return { ...emptyMap(), note: `${file} is not JSON - read as empty`, state: "bad" };
  }
  if (!isRecord(doc)) return { ...emptyMap(), note: `${file} is not a roots map - read as empty`, state: "bad" };
  const version = doc["version"];
  if (version !== MAP_VERSION) return { ...emptyMap(), note: `${versionNote(file, version, MAP_VERSION)} - read as empty`, state: newerOrBad(version, MAP_VERSION) };
  const projects = {};
  const mapped = doc["projects"];
  if (isRecord(mapped)) {
    for (const [projectPath, value] of Object.entries(mapped)) if (typeof value === "string" && value) projects[projectPath] = value;
  }
  const global = doc["global"];
  return { version: MAP_VERSION, global: typeof global === "string" && global ? global : null, projects };
}
var mapKey = (project) => projectKey(localRoot(project));
function withRoot(map, family, project, root2) {
  const base = map && map.version === MAP_VERSION ? map : emptyMap();
  if (family === "global") return { version: MAP_VERSION, global: root2, projects: { ...base.projects } };
  return { version: MAP_VERSION, global: base.global, projects: { ...base.projects, [mapKey(project)]: root2 } };
}
function standard(family, context) {
  const pathApi = pathFor(context.platform);
  if (family === "global") return [{ id: "alfred-tools", root: pathApi.join(context.home, ROOT_NAME) }, { id: "home-alfred", root: pathApi.join(context.home, ALFRED_DATA) }];
  return [{ id: "alfred", root: pathApi.join(context.project, ALFRED_DATA) }, { id: "alfred-tools", root: pathApi.join(context.project, ROOT_NAME) }];
}
function absOf(text, context) {
  const pathApi = pathFor(context.platform);
  const trimmed = String(text).trim().replace(/^\.[\\/]/, "");
  const home = /^(?:~|\$\{(?:HOME|USERPROFILE)\})(?=[\\/]|$)/.exec(trimmed);
  if (home) return pathApi.join(context.home, trimmed.slice(home[0].length));
  if (path9.win32.isAbsolute(trimmed) && /^([A-Za-z]:|\\\\)/.test(trimmed)) return pathApi.normalize(trimmed);
  if (path9.posix.isAbsolute(trimmed)) return pathApi.normalize(trimmed);
  return pathApi.join(context.project, trimmed);
}
function helperPathOf(command) {
  const parsed = helperParts(command);
  return parsed ? parsed.path : null;
}
var managed = (registration, family) => registration.rowId && !registration.alfredRetired && registration.choice !== "own" && SCOPES_OF[family].includes(registration.scope);
function dataParentOf(row, entry, context) {
  if (!row || !row.locations || !entry) return null;
  let rootText;
  try {
    rootText = rootOfEntry(row, entry);
  } catch {
    rootText = null;
  }
  if (!rootText || rootText.includes("${") && !/^\$\{(?:HOME|USERPROFILE)\}/.test(rootText)) return null;
  return pathFor(context.platform).dirname(absOf(rootText, context));
}
function registrationRoots(inventory, family, context) {
  const pathApi = pathFor(context.platform);
  const exists2 = existsOf(context);
  const managedRegistrations = (inventory.registrations || []).filter((registration) => managed(registration, family));
  const out = [];
  for (const registration of managedRegistrations) {
    const file = helperPathOf(registration.entry && registration.entry.headersHelper);
    if (file) out.push(pathApi.dirname(absOf(file, context)));
  }
  const known = standard(family, context).map((standardRoot) => standardRoot.root);
  const catalog = catalogOf(context);
  for (const registration of managedRegistrations) {
    const parent = dataParentOf(registration.rowId ? catalog.byId.get(registration.rowId) : null, registration.entry, context);
    if (parent && (known.includes(parent) || Object.values(FILES).some((fileName) => fileName !== FILES.map && exists2(pathApi.join(parent, fileName))))) out.push(parent);
  }
  return [...new Set(out)];
}
function inUse(inventory, family, context) {
  const exists2 = existsOf(context);
  const map = inventory.roots && inventory.roots.map || emptyMap();
  const mapped = family === "global" ? map.global : Object.keys(map.projects || {}).length ? map.projects[mapKey(context.project)] : null;
  if (mapped && exists2(mapped)) return { path: mapped, from: "map" };
  const [registrationRoot] = registrationRoots(inventory, family, context);
  if (registrationRoot) return { path: registrationRoot, from: "registration" };
  const pathApi = pathFor(context.platform);
  const held = standard(family, context).find((standardRoot) => exists2(pathApi.join(standardRoot.root, FILES.secrets)));
  return held ? { path: held.root, from: "secrets" } : null;
}
function recordKey(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (typeof entry.name === "string" && typeof entry.scope === "string") return `mcp:${entry.name}~${entry.scope}`;
  if (typeof entry.plugin === "string" && typeof entry.server === "string") return `plugin-mcp:${entry.plugin}/${entry.server}`;
  if (typeof entry.connector === "string") return `connector:${entry.connector}`;
  return null;
}
var ownOnly = (servers) => (servers || []).filter((entry) => entry && typeof entry === "object" && entry.choice === "own");
var isDir = (filePath) => {
  try {
    return fs6.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
};
function gitIgnores(file) {
  let dir = path9.dirname(file);
  while (!isDir(dir)) {
    const up = path9.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
  const result = spawnSync3("git", ["-C", dir, "check-ignore", "-q", "--", path9.relative(dir, file)], { windowsHide: true });
  if (result.error) return null;
  return result.status === 0 ? true : result.status === 1 ? false : null;
}
var SHIPPED_LINE = { helper: /^\/\/ (alfred|preferred)-tools mcp-headers (\d+)\s*$/, bridge: /^\/\/ (alfred|preferred)-tools mcp-bridge (\d+)\s*$/, serenaContext: /^# (alfred|preferred)-tools serena-context (\d+)\s*$/ };
var shippedVersion = (kind) => kind === "bridge" ? import_mcp_bridge2.BRIDGE_VERSION : kind === "serenaContext" ? SERENA_CONTEXT_VERSION : helper.HELPER_VERSION;
var shippedText = {};
var shippedSource = (kind) => shippedText[kind] = shippedText[kind] || fs6.readFileSync(path9.join(pluginRoot(), "scripts", "copied", FILES[kind]), "utf8");
function shippedState(kind, file, exists2 = (filePath) => fs6.existsSync(filePath)) {
  if (!exists2(file)) return { state: "absent", number: null };
  let text;
  try {
    text = fs6.readFileSync(file, "utf8");
  } catch {
    return { state: "absent", number: null };
  }
  const [firstLine = ""] = text.split("\n");
  const match = SHIPPED_LINE[kind].exec(firstLine);
  if (!match) return { state: "edited", number: null };
  const number = Number(match[2]);
  const version = shippedVersion(kind);
  if (number < version) return { state: "lower", number };
  if (match[1] === "preferred") return { state: "edited", number };
  if (number > version) return { state: "higher", number };
  return { state: helper.digestOf(text) === helper.digestOf(shippedSource(kind)) ? "same" : "edited", number };
}

// scripts/inventory/constants.ts
var INVENTORY_VERSION = 1;
var ALFRED_CODE_PLUGIN = "alfred-code";
var MARKETPLACE_LIST_UNREAD = { scope: "marketplaces", file: "claude plugin marketplace list --json" };
var PLUGIN_LIST_UNREAD = { scope: "plugins", file: "claude plugin list --json" };
var LIST_UNREAD_NOTES = /* @__PURE__ */ new Map([
  [PLUGIN_LIST_UNREAD.scope, "the plugin list could not be read, so this run takes no plugin as installed."],
  [MARKETPLACE_LIST_UNREAD.scope, "the marketplace list could not be read, so update offers no plugin update from it."]
]);

// scripts/inventory/guards.ts
var isOptionalString2 = (value) => value === void 0 || typeof value === "string";
var isMcpJsonDoc = (value) => value["mcpServers"] === void 0 || isServerMap(value["mcpServers"]);
var isSettingsDoc = (value) => value["enabledPlugins"] === void 0 || isRecord(value["enabledPlugins"]);
var isPluginListRow = (value) => isRecord(value) && typeof value["id"] === "string" && typeof value["scope"] === "string" && typeof value["enabled"] === "boolean" && [value["version"], value["projectPath"], value["installPath"]].every(isOptionalString2) && (value["errors"] === void 0 || Array.isArray(value["errors"]));
var isMarketplaceListRow = (value) => isRecord(value) && typeof value["name"] === "string" && [value["repo"], value["url"], value["path"], value["installLocation"]].every(isOptionalString2);

// scripts/inventory/fingerprint.ts
import path10 from "node:path";
function launchTokens(entry) {
  const launch = launchOf(entry);
  const command = String(launch.command || "");
  const args = Array.isArray(launch.args) ? launch.args.map(String) : [];
  if (/^cmd(\.exe)?$/i.test(path10.basename(command))) {
    const at2 = args.findIndex((argument) => /^\/c$/i.test(argument));
    if (at2 >= 0) return { command: args[at2 + 1] || "", args: args.slice(at2 + 2) };
  }
  return { command, args };
}
function bareName(token) {
  const lead = token.startsWith("@") ? "@" : "";
  const body = lead ? token.slice(1) : token;
  const cut = body.search(/[@=\[<>~!:]/);
  return lead + (cut >= 0 ? body.slice(0, cut) : body);
}
var flagValue = (args, flag) => {
  for (const [i, argument] of args.entries()) {
    if (argument === flag) return args[i + 1];
    if (argument.startsWith(`${flag}=`)) return argument.slice(flag.length + 1);
  }
  return void 0;
};
function matchesFingerprint(entry, fingerprint) {
  const bridge = bridgeParts(entry);
  if (fingerprint.bridge) return bridge !== null && bridge.template.replace(/^https?:\/\//i, "").toLowerCase().startsWith(fingerprint.bridge);
  if (bridge) return false;
  const byUrl = (url) => {
    if (fingerprint.pkg || fingerprint.command) return false;
    let parsedUrl;
    try {
      parsedUrl = new URL(String(url));
    } catch {
      return false;
    }
    if (fingerprint.host && parsedUrl.hostname.toLowerCase() !== fingerprint.host) return false;
    return parsedUrl.pathname.startsWith(fingerprint.pathPrefix || "/");
  };
  const signIn = signInParts(entry);
  if (signIn) return byUrl(signIn.url);
  const launch = launchOf(entry);
  if (launch.url || launch.type === "http" || launch.type === "sse") return byUrl(launch.url);
  const { command, args } = launchTokens(entry);
  if (fingerprint.command) return path10.basename(command).replace(/\.(exe|cmd)$/i, "") === fingerprint.command;
  if (!fingerprint.pkg) return false;
  const named = args.filter((argument) => !argument.startsWith("-")).some((argument) => bareName(argument) === fingerprint.pkg);
  if (!named) return false;
  return fingerprint.flag ? flagValue(args, fingerprint.flag) === fingerprint.value : true;
}
function catalogMatch(entry, catalog) {
  if (!entry || typeof entry !== "object") return null;
  for (const row of catalog.tools) {
    if (row.kind !== "mcp") continue;
    for (const [route, routeDefinition] of Object.entries(row.routes)) {
      const fingerprint = routeDefinition.fingerprints.find((candidate) => matchesFingerprint(entry, candidate));
      if (fingerprint) return { rowId: row.id, route, fingerprint };
    }
  }
  return null;
}

// scripts/inventory/retired.ts
function retiredMatch(entry, catalog) {
  if (!entry || typeof entry !== "object") return null;
  return catalog.retired.find((retired) => retired.fingerprints.some((fingerprint) => matchesFingerprint(entry, fingerprint))) ?? null;
}
function markRetired(inventory, catalog) {
  for (const registration of inventory.registrations) {
    if (registration.rowId !== null || registration.scope === "inherited" || registration.alfredRetired) continue;
    const retired = retiredMatch(registration.entry, catalog);
    if (!retired) continue;
    const list = inventory.lists ? inventory.lists[familyOf(registration.scope)] : null;
    const listed = Boolean(list && !list.note && !list.old && list.servers.some((server) => server.name === registration.name && server.scope === registration.scope));
    registration.retiredRow = retired.id;
    registration.own = !listed;
  }
}

// scripts/inventory/existing.ts
import fs8 from "node:fs";
import path12 from "node:path";

// scripts/mcps-list/mcps-list.ts
import fs7 from "node:fs";
import path11 from "node:path";

// scripts/mcps-list/guards.ts
var isOptionalString3 = (value) => value === void 0 || isString(value);
var isStringOrNull = (value) => value === null || isString(value);
var isListServer = (value) => isRecord(value) && isString(value["name"]) && isString(value["scope"]) && isStringOrNull(value["row"]) && (value["route"] === void 0 || isStringOrNull(value["route"])) && isTextList(value["clients"]) && isServerEntry(value["entry"]) && isStringOrNull(value["key"]) && (value["cursorEntry"] === void 0 || isServerEntry(value["cursorEntry"]));
var isOwnEntry = (value) => isRecord(value) && ["name", "scope", "plugin", "server", "connector", "choice"].every((field) => isOptionalString3(value[field]));
var isStepEnd = (value) => isRecord(value) && isString(value["name"]) && isString(value["scope"]);

// scripts/mcps-list/mcps-list.ts
var LIST_VERSION = 1;
var newerOrBad2 = (version) => typeof version === "number" && version > LIST_VERSION ? "newer" : "bad";
var empty = (file, note, state) => ({ version: LIST_VERSION, servers: [], own: [], note: `${file} ${note} - read as empty`, state });
function readList(file) {
  let text;
  try {
    text = fs7.readFileSync(file, "utf8");
  } catch (caught) {
    const code = errorCode(caught);
    return code === "ENOENT" || code === "ENOTDIR" ? null : empty(file, `cannot be read (${code})`, "unreadable");
  }
  let doc;
  try {
    doc = JSON.parse(stripBom(text).replaceAll(OLD_MARKER, MARKER));
  } catch {
    return empty(file, "is not JSON", "bad");
  }
  const version = isRecord(doc) ? doc["version"] : void 0;
  if (isRecord(doc) && version !== LIST_VERSION && newerOrBad2(version) === "newer")
    return empty(file, `is version ${version}, newer than this plugin's ${LIST_VERSION}`, "newer");
  const servers = isRecord(doc) ? doc["servers"] : void 0;
  if (!isRecord(doc) || version !== LIST_VERSION || !Array.isArray(servers))
    return empty(file, `is version ${JSON.stringify(doc && version)} or has no servers list`, "bad");
  const own = doc["own"];
  const out = {
    version: LIST_VERSION,
    servers: servers.filter(isListServer),
    own: Array.isArray(own) ? own.filter(isOwnEntry) : []
  };
  if (doc["cursorOffer"] === "declined") out.cursorOffer = "declined";
  return out;
}
function listFiles(inventory, family, context) {
  const pathApi = pathFor(context.platform);
  return oldRecordFiles(inventory, family, context).map((file) => pathApi.join(pathApi.dirname(file), FILES.list));
}
var serverKey = (server) => `mcp:${server.name}~${server.scope}`;
function regKey(step) {
  if (!step || typeof step.op !== "string" || !step.op.startsWith("mcp-")) return null;
  if (step.op === "mcp-move" && isStepEnd(step.to)) return serverKey(step.to);
  return typeof step.name === "string" && typeof step.scope === "string" ? serverKey({ name: step.name, scope: step.scope }) : null;
}
function mergeList(list, { upserts = [], drops = [], own, cursorOffer } = {}) {
  const servers = (list && list.servers || []).slice();
  for (const server of upserts) {
    const at2 = servers.findIndex((existing) => serverKey(existing) === serverKey(server));
    if (at2 >= 0) servers[at2] = server;
    else servers.push(server);
  }
  const dropped = new Set(drops);
  const doc = { version: LIST_VERSION, servers: servers.filter((server) => !dropped.has(serverKey(server))), own: own !== void 0 ? own : list && list.own || [] };
  const offer = cursorOffer !== void 0 ? cursorOffer : list && list.cursorOffer;
  if (offer === "declined") doc.cursorOffer = "declined";
  return doc;
}
function writeList(file, doc, read) {
  if (read && (read.state === "newer" || read.state === "unreadable"))
    return { ok: true, detail: `${read.note.replace(/ - read as empty$/, "")} - left as it is; ${read.state === "newer" ? "update alfred-tools" : "check its permissions"}, then run the command again` };
  const servers = doc.servers || [];
  const own = doc.own || [];
  if (!servers.length && !own.length) {
    if (!read) return { ok: true, detail: `${file}: no server is listed - nothing to write` };
    if (read.state) return { ok: true, detail: `${read.note.replace(/ - read as empty$/, "")} - not this plugin's list, left as it is` };
    fs7.rmSync(file, { force: true });
    return { ok: true, detail: `removed ${file} - no server is listed` };
  }
  const out = { version: LIST_VERSION, servers, own };
  if (doc.cursorOffer === "declined") out.cursorOffer = "declined";
  if (read && !read.state && deepEqual(out, { version: read.version, servers: read.servers, own: read.own, ...read.cursorOffer ? { cursorOffer: read.cursorOffer } : {} }))
    return { ok: true, detail: `${file} already holds these servers - left as it is` };
  fs7.mkdirSync(path11.dirname(file), { recursive: true });
  let backup = null;
  if (read && read.state === "bad" && fs7.existsSync(file)) {
    backup = `${file}.bak`;
    fs7.copyFileSync(file, backup);
  }
  replaceFile(file, `${JSON.stringify(out, null, 2)}
`);
  const count = servers.length;
  return { ok: true, detail: `wrote ${file} (${count} server${count === 1 ? "" : "s"})${backup ? ` - the old file kept as ${backup}` : ""}` };
}
function valueOf(entry, field, tokenVar) {
  const value = valueAt(entry, field.at);
  if (typeof value !== "string") return null;
  const [before = "", after] = field.template.split(`\${${tokenVar}}`);
  if (after === void 0 || !value.startsWith(before) || !value.endsWith(after)) return null;
  return value.slice(before.length, value.length - after.length);
}
function fromRegistration(registration, row, clients, files = []) {
  const route = row && row.routes && registration.route ? row.routes[registration.route] : null;
  let key = launcherParts(registration.entry)?.keyName ?? null;
  const [field] = tokenFields(registration.entry, route);
  const tokenVar = route && route.tokenVar;
  if (field && tokenVar) {
    const value = valueOf(registration.entry, field, tokenVar);
    key = value && nameOfValue(files, value) || tokenVar;
  }
  return { name: registration.name, scope: registration.scope, row: row ? row.id : null, route: registration.route, clients: clients.slice(), entry: maskCredentials(registration.entry, row), key };
}
var OLD_RECORD_VERSION = 1;
var versionNote2 = (file, version, current) => newerOrBad2(version) === "newer" ? `${file} is version ${version}, newer than this plugin's ${current}` : `${file} is version ${JSON.stringify(version)}, not ${current}`;
function oldRecordFiles(inventory, family, context) {
  const pathApi = pathFor(context.platform);
  const map = inventory.roots && inventory.roots.map;
  const projects = map && map.projects || {};
  const mapped = family === "global" ? map && map.global : Object.keys(projects).length ? projects[mapKey(context.project)] : null;
  const order = family === "global" ? standard("global", context) : [...standard("project", context)].reverse();
  const dirs = [mapped, ...order.map((standardRoot) => standardRoot.root), ...registrationRoots(inventory, family, context)].filter((dir) => Boolean(dir));
  return [...new Set(dirs)].map((dir) => pathApi.join(dir, FILES.record));
}
function readOldRecord(file) {
  let text;
  try {
    text = fs7.readFileSync(file, "utf8");
  } catch (caught) {
    const code = errorCode(caught);
    return code === "ENOENT" || code === "ENOTDIR" ? null : { version: OLD_RECORD_VERSION, servers: [], note: `${file} cannot be read (${code}) - read as empty`, state: "unreadable" };
  }
  let doc;
  try {
    doc = JSON.parse(stripBom(text));
  } catch {
    return { version: OLD_RECORD_VERSION, servers: [], note: `${file} is not JSON - read as empty`, state: "bad" };
  }
  const version = isRecord(doc) ? doc["version"] : void 0;
  if (isRecord(doc) && version !== OLD_RECORD_VERSION && newerOrBad2(version) === "newer")
    return { version: OLD_RECORD_VERSION, servers: [], note: `${versionNote2(file, version, OLD_RECORD_VERSION)} - read as empty`, state: "newer" };
  const servers = isRecord(doc) ? doc["servers"] : void 0;
  if (!isRecord(doc) || version !== OLD_RECORD_VERSION || !Array.isArray(servers))
    return { version: OLD_RECORD_VERSION, servers: [], note: `${file} is version ${JSON.stringify(doc && version)} or has no servers list - read as empty`, state: "bad" };
  return { version: OLD_RECORD_VERSION, servers: servers.filter(isOwnEntry) };
}
function mergeOwn(record, entries, live2) {
  const out = [];
  const at2 = /* @__PURE__ */ new Map();
  for (const entry of [...record && record.servers || [], ...entries || []]) {
    const key = recordKey(entry);
    if (!key) continue;
    const index = at2.get(key);
    if (index !== void 0) out[index] = entry;
    else {
      at2.set(key, out.length);
      out.push(entry);
    }
  }
  const servers = live2 && live2.servers || {};
  const connectors = live2 && Array.isArray(live2.connectors) ? live2.connectors : null;
  const kept = out.filter((entry) => {
    if (typeof entry.connector === "string") return !connectors || connectors.includes(entry.connector);
    const key = recordKey(entry);
    if (key === null || !Object.hasOwn(servers, key)) return false;
    return servers[key] === null || deepEqual(servers[key], entry.fingerprint);
  });
  return { version: OLD_RECORD_VERSION, servers: kept };
}
function ownOf({ entries, keep, live: live2 }) {
  const fresh = ownOnly(mergeOwn({ servers: [] }, entries, live2).servers);
  const keys = new Set(fresh.map(recordKey));
  return [...ownOnly(keep).filter((entry) => !keys.has(recordKey(entry))), ...fresh];
}

// scripts/inventory/existing.ts
var readJsonFile = (file) => {
  try {
    return parseJson(fs8.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};
var isEntry = (value) => isServerEntry(value) && (typeof value.command === "string" || typeof value.url === "string");
function serversIn(doc) {
  if (!isRecord(doc)) return [];
  const map = isRecord(doc["mcpServers"]) ? doc["mcpServers"] : doc;
  return Object.entries(map).flatMap(([server, entry]) => isEntry(entry) ? [{ server, entry }] : []);
}
function pluginServers(installPath) {
  if (!installPath || typeof installPath !== "string") return [];
  const out = serversIn(readJsonFile(path12.join(installPath, MCP_JSON)));
  const manifest = readJsonFile(path12.join(installPath, ".claude-plugin", "plugin.json"));
  const declared = isRecord(manifest) ? manifest["mcpServers"] : void 0;
  if (isRecord(declared)) out.push(...serversIn({ mcpServers: declared }));
  for (const serverPath of typeof declared === "string" ? [declared] : Array.isArray(declared) ? declared.filter((item) => typeof item === "string") : []) {
    const relativePath = path12.relative(installPath, path12.resolve(installPath, serverPath));
    if (!serverPath.startsWith("./") || !relativePath || relativePath.startsWith("..") || path12.isAbsolute(relativePath) || relativePath === MCP_JSON) continue;
    out.push(...serversIn(readJsonFile(path12.join(installPath, relativePath))));
  }
  const seen = /* @__PURE__ */ new Set();
  return out.filter((server) => !seen.has(server.server) && seen.add(server.server));
}
function fingerprintOf(entry, catalog) {
  const match = catalogMatch(entry, catalog);
  return match ? fingerprintKey(match.fingerprint) : null;
}

// scripts/roots/workspace.ts
import fs9 from "node:fs";
import path13 from "node:path";
var JSON_NAME = "workspace.json";
var LEGACY_NAME = "workspace";
var PARENT_RE = /^\.\.(\/\.\.)*$/;
var isRole = (value) => value === "root" || value === "standalone";
var isPath = (value) => typeof value === "string" && value.trim() !== "";
function parseLine(raw) {
  const line = raw.trim();
  if (line === "" || line.startsWith("#")) return { kind: "skip" };
  const [word = ""] = line.split(/\s+/);
  const value = line.slice(word.length).replace(/^\s+/, "");
  if (word === "parent" && value === "none") return { kind: "parent-none" };
  if (word === "parent" && PARENT_RE.test(value)) return { kind: "parent", value };
  if (word === "role" && isRole(value)) return { kind: "role", value };
  if (word === "child" && isPath(value)) return { kind: "child", value };
  return { kind: "skip" };
}
function parseLegacy(text) {
  const record = { parent: null, role: null, children: [], ignoredChildren: [] };
  let parentSeen = false;
  for (const raw of String(text).replace(/^﻿/, "").split(/\r?\n/)) {
    const entry = parseLine(raw);
    if (entry.kind === "parent" || entry.kind === "parent-none") {
      if (parentSeen) continue;
      parentSeen = true;
      if (entry.kind === "parent") record.parent = entry.value;
      else record.role = record.role || "standalone";
    } else if (entry.kind === "role") {
      if (!record.role) record.role = entry.value;
    } else if (entry.kind === "child" && !record.children.includes(entry.value)) record.children.push(entry.value);
  }
  return record;
}
function fromObject(workspaceJson) {
  const list = (value) => Array.isArray(value) ? [...new Set(value.filter(isPath))] : [];
  return {
    parent: typeof workspaceJson.parent === "string" && PARENT_RE.test(workspaceJson.parent) ? workspaceJson.parent : null,
    role: isRole(workspaceJson.role) ? workspaceJson.role : null,
    children: list(workspaceJson.children),
    ignoredChildren: list(workspaceJson.ignoredChildren)
  };
}
var readText = (file) => {
  try {
    return { text: fs9.readFileSync(file, "utf8") };
  } catch (caught) {
    const code = errorCode(caught);
    return code === "ENOENT" || code === "ENOTDIR" ? { missing: true } : { error: code };
  }
};
var finish = (record) => record.parent ? { ...record, role: null } : record;
var shape = (record) => {
  const out = { children: record.children, ignoredChildren: record.ignoredChildren };
  if (record.parent) out.parent = record.parent;
  if (record.role) out.role = record.role;
  return out;
};
function readRecord(folder) {
  const jsonFile = path13.join(folder, ALFRED_DATA, JSON_NAME);
  const legacyFile = path13.join(folder, ALFRED_DATA, LEGACY_NAME);
  const json = readText(jsonFile);
  const legacy = readText(legacyFile);
  if (json.error) return { error: `cannot be read (${json.error})`, file: jsonFile };
  if (json.text !== void 0) {
    const body = json.text.replace(/^﻿/, "");
    let parsed = {};
    if (body.trim() !== "") {
      let doc;
      try {
        doc = JSON.parse(body);
      } catch {
        return { error: "not JSON", file: jsonFile };
      }
      if (!isRecord(doc)) return { error: "not JSON", file: jsonFile };
      parsed = doc;
    }
    const record = fromObject(parsed);
    if (legacy.text !== void 0) {
      const old = parseLegacy(legacy.text);
      record.parent = record.parent || old.parent;
      record.role = record.role || old.role;
      for (const child of old.children) if (!record.children.includes(child)) record.children.push(child);
    }
    return shape(finish(record));
  }
  if (legacy.missing) return null;
  if (legacy.error || legacy.text === void 0) return { error: `cannot be read (${legacy.error})`, file: legacyFile };
  return shape(finish(parseLegacy(legacy.text)));
}
var NONE = (notes = []) => ({ root: null, members: [], ancestors: [], notes });
var inside = (child, root2) => isInside(path13, root2, child, { orSame: false });
var at = (folder, relativePath) => path13.resolve(folder, relativePath.replace(/\\/g, "/"));
var movedData = (env) => /^(?:\/|[A-Za-z]:[\\/])/.test(String((env || {}).ALFRED_CODE_DATA_PATH || "").trim());
function anyRecordAbove(folder) {
  for (let dir = folder; ; dir = path13.dirname(dir)) {
    if ([JSON_NAME, LEGACY_NAME].some((fileName) => fs9.existsSync(path13.join(dir, ALFRED_DATA, fileName)))) return true;
    if (path13.dirname(dir) === dir) return false;
  }
}
function workspaceOf(project, env = process.env) {
  const start = path13.resolve(project);
  if (movedData(env)) return NONE(anyRecordAbove(start) ? ["alfred-code's data is moved by ALFRED_CODE_DATA_PATH - its workspace record is not read"] : []);
  const chain = [];
  const seen = /* @__PURE__ */ new Set();
  let found = null;
  for (let folder = start; ; ) {
    if (seen.has(folder)) return NONE();
    seen.add(folder);
    const record = readRecord(folder);
    if (!record) return NONE();
    if (record.error) return NONE([`${record.file} is not JSON - read as no workspace`]);
    if (record.parent) {
      chain.push(folder);
      folder = at(folder, record.parent);
      continue;
    }
    if (record.role === "root") {
      found = folder;
      break;
    }
    if (record.role === "standalone") return NONE([`${folder} is standalone`]);
    return NONE();
  }
  const root2 = found;
  if (root2 === null) return NONE();
  const notes = [];
  const members = [];
  const visited = /* @__PURE__ */ new Set([root2]);
  const walk = (folder, ignored) => {
    const record = readRecord(folder);
    if (!record || record.error) return;
    const ignores = [...ignored, ...(record.ignoredChildren || []).map((childPath) => at(folder, childPath))];
    for (const childPath of record.children || []) {
      const child = at(folder, childPath);
      if (visited.has(child)) {
        notes.push(`${child} is listed twice in the workspace - read once`);
        continue;
      }
      if (!inside(child, root2)) {
        notes.push(`${child} is listed as a child of ${folder} but lies outside the workspace root ${root2} - not a member`);
        continue;
      }
      visited.add(child);
      if (ignores.some((ignoredFolder) => child === ignoredFolder || inside(child, ignoredFolder))) continue;
      if (!fs9.existsSync(child)) {
        notes.push(`${child} is listed as a child of ${folder} but is missing - skipped`);
        continue;
      }
      const own = readRecord(child);
      if (!own || own.error || !own.parent || at(child, own.parent) !== folder) continue;
      members.push(child);
      walk(child, ignores);
    }
  };
  walk(root2, []);
  if (start !== root2 && !members.includes(start)) return NONE();
  const ancestors = chain.slice(1).concat(start === root2 ? [] : [root2]);
  return { root: root2, members, ancestors, notes };
}

// scripts/cursor/cursor-mcp.ts
import fs10 from "node:fs";
import path14 from "node:path";

// scripts/cursor/constants.ts
var CURSOR_FOLDER = ".cursor";
var CURSOR_FILE = "mcp.json";

// scripts/cursor/cursor-mcp.ts
function fileFor(family, context) {
  const pathApi = pathFor(context.platform);
  if (family === "global") return pathApi.join(context.home || homeDir(context.env || process.env), CURSOR_FOLDER, CURSOR_FILE);
  if (!context.project) throw new Error("Cursor's project file needs the project folder, and none was given");
  return pathApi.join(context.project, CURSOR_FOLDER, CURSOR_FILE);
}
var isCursorDoc = (value) => isRecord(value) && isRecord(value["mcpServers"]);
var serversIn2 = (doc) => Object.fromEntries(Object.entries(doc.mcpServers).filter((pair) => isServerEntry(pair[1])));
function readCursor(file) {
  let stats;
  try {
    stats = fs10.lstatSync(file);
  } catch (caught) {
    const code = errorCode(caught);
    return code === "ENOENT" || code === "ENOTDIR" ? { state: "absent", doc: { mcpServers: {} }, servers: {}, lineEnd: "\n" } : { state: "bad", doc: null, lineEnd: "\n", error: code };
  }
  if (stats.isSymbolicLink()) return { state: "symlink", doc: null, lineEnd: "\n" };
  let text;
  try {
    text = fs10.readFileSync(file, "utf8");
  } catch (caught) {
    return { state: "bad", doc: null, lineEnd: "\n", error: errorCode(caught) };
  }
  const lineEnd = text.includes("\r\n") ? "\r\n" : "\n";
  let doc;
  try {
    doc = parseJson(text);
  } catch {
    return { state: "bad", doc: null, lineEnd };
  }
  if (!isCursorDoc(doc)) return { state: "shape", doc: null, lineEnd };
  return { state: "ok", doc, servers: serversIn2(doc), lineEnd, text };
}
function refusal(read) {
  if (read.state === "symlink") return "is a symbolic link - alfred-tools writes no file through a link; replace it with the file itself";
  if (read.state === "bad") return read.error ? `cannot be read (${read.error})` : "is not JSON (Cursor reads comments and trailing commas, alfred-tools does not) - remove them, then run the command again";
  if (read.state === "shape") return "has no mcpServers object - not a file alfred-tools recognises";
  return null;
}
function managedSet(sources) {
  const out = /* @__PURE__ */ new Map();
  for (const src of sources) {
    const rank = (server) => server.scope === "local" ? 0 : 1;
    const mine = (src.servers || []).filter((server) => (server.clients || []).includes("cursor") && (src.scopes || []).includes(server.scope)).sort((first, second) => rank(first) - rank(second));
    for (const server of mine) if (!out.has(server.name)) out.set(server.name, { entry: server.cursorEntry || server.entry, scope: server.scope, list: src.file, row: server.row, route: server.route, key: server.key || null });
  }
  return out;
}
function compose(doc, managed2, { before = [], skip = [], order = [] } = {}) {
  const servers = doc && doc.mcpServers || {};
  const at2 = ({ row }) => {
    const i = row === null ? -1 : order.indexOf(row);
    return i < 0 ? order.length : i;
  };
  const sorted = [...managed2].sort(([, first], [, second]) => at2(first) - at2(second));
  const next = /* @__PURE__ */ Object.create(null);
  for (const [name, server] of sorted) {
    const own = servers[name];
    if (!skip.includes(name)) next[name] = server.entry;
    else if (Object.hasOwn(servers, name) && own !== void 0) next[name] = own;
  }
  for (const [name, value] of Object.entries(servers)) {
    if (Object.hasOwn(next, name)) continue;
    if (before.includes(name) && !skip.includes(name)) continue;
    next[name] = value;
  }
  const base = doc && typeof doc === "object" ? doc : {};
  const out = /* @__PURE__ */ Object.create(null);
  if (!Object.hasOwn(base, "mcpServers")) out["mcpServers"] = next;
  for (const [key, value] of Object.entries(base)) out[key] = key === "mcpServers" ? next : value;
  return out;
}
var textOf = (doc, lineEnd) => `${JSON.stringify(doc, null, 2)}
`.replace(/\n/g, lineEnd);
function cursorWrite(step, context) {
  const read = readCursor(step.file);
  const why = refusal(read);
  if (why) return { ok: false, detail: `${step.file} ${why} - left as it is` };
  const sources = (step.lists || []).map((list) => ({ file: list.file, scopes: list.scopes, servers: (list.file && readList(list.file) || { servers: [] }).servers }));
  const managed2 = managedSet(sources);
  const servers = read.doc ? read.doc.mcpServers : {};
  const misshapen = [...managed2.keys()].filter((name) => Object.hasOwn(servers, name) && !isServerEntry(servers[name]));
  if (misshapen.length) return { ok: false, detail: `${step.file}: ${misshapen.join(", ")} ${misshapen.length > 1 ? "are" : "is"} not in the shape Cursor reads (a string command or url, args a list of strings, env and headers maps of strings) - correct or remove ${misshapen.length > 1 ? "them" : "it"} there; left as it is` };
  const notes = fillStdioKeys(managed2, context);
  const before = step.before || [];
  const theirs = [...managed2.keys()].filter((name) => Object.hasOwn(servers, name) && !before.includes(name) && !(step.replace || []).includes(name));
  const only = step.only;
  const others = only ? [...managed2.keys()].filter((name) => !only.includes(name)) : [];
  const skip = [.../* @__PURE__ */ new Set([...step.skip || [], ...theirs, ...others])];
  const order = context && context.catalog && context.catalog.order || [];
  const doc = compose(read.doc, managed2, { before, skip, order });
  const text = textOf(doc, read.lineEnd);
  const said = notes.length ? `; ${notes.join("; ")}` : "";
  if (read.state === "ok" && read.text === text) return { ok: true, detail: `${step.file} already holds these servers - left as it is${said}` };
  fs10.mkdirSync(path14.dirname(step.file), { recursive: true });
  let mode;
  try {
    mode = fs10.statSync(step.file).mode & 511;
  } catch {
  }
  replaceFile(step.file, text, mode);
  const back = readCursor(step.file);
  const written = back.state === "ok" ? back.doc.mcpServers : null;
  const wrong = written === null ? [...managed2.keys()] : [...managed2].filter(([name, server]) => !skip.includes(name) && !deepEqual(written[name], server.entry)).map(([name]) => name);
  if (wrong.length) return { ok: false, detail: `${step.file}: ${wrong.join(", ")} did not read back as written` };
  const kept = theirs.length ? ` - ${theirs.join(", ")} left as your own` : "";
  return { ok: true, detail: `wrote ${step.file} (${managed2.size - theirs.length} server${managed2.size - theirs.length === 1 ? "" : "s"} from the list)${kept}${said}` };
}
function stdioKeyed(entry, row, routeId) {
  const route = row && row.routes && routeId ? row.routes[routeId] : null;
  return Boolean(route && route.tokenVar && tokenFields(entry, route).length);
}
function fillStdioKeys(managed2, context) {
  const catalog = context && context.catalog || load();
  const notes = [];
  for (const [name, managedServer] of managed2) {
    const { row: rowId, route: routeId } = managedServer;
    if (managedServer.scope !== "user" || !managedServer.key || !managedServer.list || rowId === null || !routeId) continue;
    const row = catalog.byId.get(rowId);
    const route = row ? row.routes[routeId] : void 0;
    if (!row || !route || !route.tokenVar || !stdioKeyed(managedServer.entry, row, routeId)) continue;
    const files = stdioChain({ scope: "user", globalRoot: path14.dirname(managedServer.list) });
    const found = valueIn(files, managedServer.key);
    if (!found) {
      const registration = context && context.env ? readRegistration(name, "user", context.project || process.cwd(), context.env) : void 0;
      const back = registration ? restore(managedServer.entry, registration, row) : null;
      const restored = back && back.entry !== void 0 ? back.entry : null;
      const filled = restored ? tokenFields(restored, route).map((field) => valueAt(restored, field.at)) : [];
      if (restored && filled.length && filled.every((value) => typeof value === "string" && value.trim() && !value.includes(MARKER))) {
        managed2.set(name, { ...managedServer, entry: restored });
        continue;
      }
    }
    managed2.set(name, { ...managedServer, entry: fillKeys(managedServer.entry, row, routeId, "user", { [route.tokenVar]: found ? found.value : "" }) });
    if (!found) notes.push(`${managedServer.key} for '${name}' (user) is in none of ${files.join(", ")} - written empty: fill ${managedServer.key} in ${files[0]}, then run /alfred-tools:configure and keep ${managedServer.key} as the key's name - it writes the key in`);
  }
  return notes;
}
function cursorOf(file, marked, catalog) {
  const read = readCursor(file);
  const servers = read.state === "ok" ? read.servers : {};
  const entries = {};
  for (const markedServer of marked) {
    const server = servers[markedServer.name];
    if (Object.hasOwn(servers, markedServer.name) && server !== void 0 && !Object.hasOwn(entries, markedServer.name)) entries[markedServer.name] = maskCredentials(server, markedServer.row === null ? void 0 : catalog.byId.get(markedServer.row));
  }
  return { file, state: read.state, names: read.state === "ok" ? Object.keys(read.doc.mcpServers) : [], entries };
}
var otherHeaders = (entry) => Object.keys(entry && entry.headers || {});
function bridgeFormOf(entry, catalog, prior = null) {
  if (!entry || typeof entry.headersHelper !== "string" || typeof entry.url !== "string" || otherHeaders(entry).length) return null;
  const helper2 = helperParts(entry.headersHelper);
  const [keyName, scheme] = helper2 ? helper2.args : [];
  if (!helper2 || keyName === void 0 || scheme === void 0) return null;
  const pathApi = pathApiOf(helper2.path);
  const own = [pathApi.join(pathApi.dirname(helper2.path), FILES.bridge), entry.url, keyName, scheme];
  const globalRoot = helper2.root ? [helper2.root] : [];
  const pairs = helper2.pairs.flatMap((pair) => ["--header", pair]);
  const priorParts = prior ? bridgeParts(prior) : null;
  const priorArgs = prior && Array.isArray(prior.args) ? prior.args : [];
  if (prior && priorParts && priorParts.packageSpec) {
    const at2 = priorArgs.findIndex((argument) => String(argument) === priorParts.path);
    const rest = priorParts.globalRoot !== null ? withoutPairs(priorArgs.slice(at2 + 6)) : [];
    return { ...prior, command: "node", args: [...priorArgs.slice(0, at2), ...own, priorParts.packageSpec, ...globalRoot, ...rest, ...pairs], env: { ...prior.env || {} } };
  }
  const packageSpec = mcpRemotePackage(catalog);
  return { command: "node", args: [...own, `${packageSpec.name}@${packageSpec.version}`, ...globalRoot, ...pairs], env: { npm_config_before: packageSpec.cutoff } };
}

// scripts/inventory/inventory.ts
var { readState: readState2 } = account_exports;
function matchEntry(entry, catalog) {
  const match = catalogMatch(entry, catalog);
  return match ? { rowId: match.rowId, route: match.route } : null;
}
var settingsOf = (scope, project, env) => path15.join(
  scope === "user" ? configDir(env) : path15.join(project, ".claude"),
  scope === "local" ? "settings.local.json" : "settings.json"
);
var realOf = (folderPath) => {
  try {
    return fs11.realpathSync.native(folderPath);
  } catch {
    return path15.resolve(folderPath);
  }
};
function ancestorMcpFiles(project) {
  const out = [];
  for (let dir = realOf(project), up = path15.dirname(dir); up !== dir; dir = up, up = path15.dirname(dir)) {
    const file = path15.join(up, MCP_JSON);
    if (fs11.existsSync(file)) out.push({ dir: up, file });
  }
  return out;
}
function hereSettings(projectDir) {
  const root2 = localRoot(projectDir);
  return [.../* @__PURE__ */ new Set([path15.join(root2, ".claude", "settings.local.json"), path15.join(projectDir, ".claude", "settings.local.json"), path15.join(projectDir, ".claude", "settings.json")])];
}
function approvalContext(projectDir, env, accountRead, platform) {
  const root2 = localRoot(projectDir);
  const entry = projectEntry(accountRead.projects || {}, root2, platform) || {};
  return { user: readState2(settingsOf("user", projectDir, env), isSettingsDoc).doc, folder: hereSettings(projectDir).map((file) => readState2(file, isSettingsDoc).doc), entry, trusted: entry.hasTrustDialogAccepted === true };
}
function names(doc, key, name) {
  const listed = doc ? doc[key] : void 0;
  return Array.isArray(listed) && listed.includes(name);
}
var approves = (doc, name) => doc !== null && (doc.enableAllProjectMcpServers === true || names(doc, "enabledMcpjsonServers", name));
function approvalOf(name, context) {
  if ([context.user, ...context.folder, context.entry].some((doc) => names(doc, "disabledMcpjsonServers", name))) return "rejected";
  if (approves(context.user, name) || context.trusted && [...context.folder, context.entry].some((doc) => approves(doc, name))) return "approved";
  return "pending";
}
function pluginRows(listJson, project, env, catalog) {
  const rows = [];
  const here = [...hereSettings(project), settingsOf("user", project, env)].map((file) => readState2(file, isSettingsDoc).doc);
  const flagIn = (doc, id) => doc && doc.enabledPlugins ? doc.enabledPlugins[id] : void 0;
  for (const listRow of Array.isArray(listJson) ? listJson : []) {
    const [name = "", marketplace = ""] = String(listRow.id).split("@");
    const scoped = listRow.scope === "project" || listRow.scope === "local";
    if (scoped && listRow.projectPath && projectKey(listRow.projectPath) !== projectKey(project)) continue;
    let enabled = listRow.enabled;
    let enabledFrom = "list";
    if (ALL_SCOPES.includes(listRow.scope)) {
      const flag = flagIn(readState2(settingsOf(listRow.scope, project, env), isSettingsDoc).doc, listRow.id);
      if (typeof flag === "boolean") {
        enabled = flag;
        enabledFrom = "settings";
      }
    }
    const flagHere = here.map((doc) => flagIn(doc, listRow.id)).find((value) => typeof value === "boolean");
    const enabledHere = typeof flagHere === "boolean" ? flagHere : enabled;
    const row = catalog.tools.find((tool) => tool.kind === "plugin" && tool.plugin === name && tool.marketplace?.name === marketplace);
    rows.push({
      id: listRow.id,
      plugin: name,
      marketplace,
      scope: listRow.scope,
      version: listRow.version,
      enabled,
      enabledFrom,
      enabledHere,
      errors: listRow.errors || [],
      rowId: row ? row.id : null,
      alfredRetired: catalog.reserved.has(name)
    });
  }
  return rows;
}
function cliList(result, list) {
  let rows = null;
  try {
    rows = result.status === 0 ? JSON.parse(result.stdout || "[]") : null;
  } catch {
  }
  if (Array.isArray(rows)) return { rows, unreadable: null };
  return { rows: [], unreadable: { ...list, state: result.status === 0 ? "malformed" : "unreadable", error: result.status === 0 ? "not JSON" : "the command failed" } };
}
function buildInventory({ project, env = process.env, platform = process.platform, arch = process.arch, catalog = load(), run = runClaude, data = null }) {
  const projectDir = path15.resolve(project);
  const out = {
    version: INVENTORY_VERSION,
    project: projectDir,
    os: platform,
    arch,
    cli: null,
    unreadable: [],
    registrations: [],
    plugins: [],
    pluginServers: [],
    marketplaces: [],
    alfredCodeEnabled: false,
    sources: {}
  };
  const mcpJsonState = readState2(path15.join(projectDir, MCP_JSON), isMcpJsonDoc);
  const accountRead = readAccount(env, projectDir, platform);
  out.sources = { project: { file: mcpJsonState.file, state: mcpJsonState.state }, account: { file: accountRead.file, state: accountRead.state }, local: { file: accountRead.file, state: accountRead.state }, user: { file: accountRead.file, state: accountRead.state } };
  const sources = [["project", mcpJsonState], ["local", accountRead], ["user", accountRead]];
  for (const [scope, source] of sources)
    if (source.state === "malformed" || source.state === "unreadable") out.unreadable.push({ scope, file: source.file, state: source.state, error: source.error });
  const approval = approvalContext(projectDir, env, accountRead, platform);
  const scopes = [["project", mcpJsonState.doc && mcpJsonState.doc.mcpServers || {}], ["local", accountRead.local], ["user", accountRead.user]];
  for (const [scope, servers] of scopes) {
    if (!servers || typeof servers !== "object") continue;
    for (const [name, entry] of Object.entries(servers)) {
      const match = matchEntry(entry, catalog);
      out.registrations.push({
        name,
        scope,
        entry,
        rowId: match ? match.rowId : null,
        route: match ? match.route : null,
        own: !match,
        // alfred-code 2.10.0 or older: the stack's servers sit under reserved names; offer nothing over them
        alfredRetired: catalog.reserved.has(name),
        // this folder's own .mcp.json server waits for approval by a parent's rules (MEASURED, M8)
        ...scope === "project" ? { approval: approvalOf(name, approval) } : {}
      });
    }
  }
  const wins = new Map(Object.keys(accountRead.local || {}).map((name) => [name, { scope: "local", from: null }]));
  for (const name of Object.keys(mcpJsonState.doc && mcpJsonState.doc.mcpServers || {})) if (!wins.has(name)) wins.set(name, { scope: "project", from: projectDir });
  out.sources.inherited = [];
  for (const { dir, file } of ancestorMcpFiles(projectDir)) {
    const inheritedState = readState2(file, isMcpJsonDoc);
    out.sources.inherited.push({ file, state: inheritedState.state });
    if (inheritedState.state === "malformed" || inheritedState.state === "unreadable") {
      out.unreadable.push({ scope: "inherited", file, state: inheritedState.state, error: inheritedState.error });
      continue;
    }
    const servers = inheritedState.doc && inheritedState.doc.mcpServers && typeof inheritedState.doc.mcpServers === "object" ? inheritedState.doc.mcpServers : {};
    for (const [name, entry] of Object.entries(servers)) {
      const match = matchEntry(entry, catalog);
      out.registrations.push({
        name,
        scope: "inherited",
        from: dir,
        file,
        entry,
        rowId: match ? match.rowId : null,
        route: match ? match.route : null,
        own: !match,
        alfredRetired: catalog.reserved.has(name),
        shadowed: wins.get(name) || null,
        approval: approvalOf(name, approval)
      });
    }
    for (const name of Object.keys(servers)) if (!wins.has(name)) wins.set(name, { scope: "inherited", from: dir });
  }
  out.trusted = approval.trusted;
  const rootCtx = { project: projectDir, home: homeDir(env), platform, catalog };
  out.roots = { map: readMap(data) };
  out.roots.project = inUse(out, "project", rootCtx);
  out.roots.global = inUse(out, "global", rootCtx);
  out.lists = { project: listOf(out, "project", rootCtx), global: listOf(out, "global", rootCtx) };
  markRetired(out, catalog);
  out.cursor = cursorFiles(out.lists, { platform, env, project: projectDir }, catalog);
  out.workspace = workspaceOf(projectDir, env);
  const entryFingerprint = (entry) => fingerprintOf(entry, catalog);
  for (const registration of out.registrations) {
    const familyList = registration.scope === "inherited" || !registration.rowId ? null : out.lists[familyOf(registration.scope)];
    registration.choice = choiceIn(familyList, (ownEntry) => ownEntry.name === registration.name && ownEntry.scope === registration.scope, entryFingerprint(registration.entry), ["own", "manage"]);
  }
  const version = available({ env, cwd: projectDir });
  out.cli = version ? { ok: true, version } : { ok: false, version: null };
  if (!version) return out;
  const pluginList = cliList(run(["plugin", "list", "--json"], { cwd: projectDir, env }), PLUGIN_LIST_UNREAD);
  if (pluginList.unreadable) out.unreadable.push(pluginList.unreadable);
  const listJson = pluginList.rows.filter(isPluginListRow);
  out.plugins = pluginRows(listJson, projectDir, env, catalog);
  out.alfredCodeEnabled = out.plugins.some((pluginRow) => pluginRow.plugin === ALFRED_CODE_PLUGIN && pluginRow.enabled);
  const installPath = new Map(listJson.map((listRow) => [`${listRow.id}~${listRow.scope}`, listRow.installPath]));
  for (const pluginRow of out.plugins.filter((candidate) => candidate.enabledHere))
    for (const server of pluginServers(installPath.get(`${pluginRow.id}~${pluginRow.scope}`))) {
      const match = matchEntry(server.entry, catalog);
      const choice = match ? choiceIn(out.lists.project, (ownEntry) => ownEntry.plugin === pluginRow.id && ownEntry.server === server.server, entryFingerprint(server.entry), ["own", "add"]) : null;
      out.pluginServers.push({ plugin: pluginRow.id, server: server.server, entry: server.entry, rowId: match ? match.rowId : null, route: match ? match.route : null, choice });
    }
  const marketplaceList = cliList(run(["plugin", "marketplace", "list", "--json"], { cwd: projectDir, env }), MARKETPLACE_LIST_UNREAD);
  out.marketplaces = marketplaceList.rows.filter(isMarketplaceListRow).map((marketplace) => ({ name: marketplace.name, source: marketplace.repo || marketplace.url || marketplace.path || "", installLocation: marketplace.installLocation || "" }));
  if (marketplaceList.unreadable) out.unreadable.push(marketplaceList.unreadable);
  return out;
}
function listOf(inventory, family, context) {
  for (const file of listFiles(inventory, family, context)) {
    const list = readList(file);
    if (list) return { file, servers: list.servers, own: list.own, ...list.cursorOffer ? { cursorOffer: list.cursorOffer } : {}, ...list.note ? { note: list.note, state: list.state } : {} };
  }
  const pathApi = pathFor(context.platform);
  for (const old of oldRecordFiles(inventory, family, context)) {
    const record = readOldRecord(old);
    if (record) return { file: pathApi.join(pathApi.dirname(old), FILES.list), servers: [], own: record.servers, old, ...record.note ? { note: record.note, state: record.state } : {} };
  }
  return null;
}
function cursorFiles(familyLists, context, catalog) {
  const marked = (list) => list && !list.note ? (list.servers || []).filter((server) => (server.clients || []).includes("cursor")) : [];
  return {
    project: cursorOf(fileFor("project", context), marked(familyLists.project), catalog),
    global: cursorOf(fileFor("global", context), marked(familyLists.global), catalog)
  };
}
function choiceIn(list, match, fingerprint, allowed) {
  const ownEntry = list ? (list.own || []).find(match) : null;
  return ownEntry && ownEntry.fingerprint === fingerprint && ownEntry.choice !== void 0 && allowed.includes(ownEntry.choice) ? ownEntry.choice : null;
}

// scripts/apply/fetch.ts
import fs13 from "node:fs";
import path17 from "node:path";

// scripts/apply/serena-config.ts
import fs12 from "node:fs";
import path16 from "node:path";

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
var KEY = /^base_modes[ \t]*:(.*?)(\r?)$/;
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
  const at2 = lines.findIndex(([body]) => KEY.test(body));
  const keyLine = lines[at2];
  if (!keyLine) return null;
  const [, raw = ""] = KEY.exec(keyLine[0]) ?? [];
  const value = raw.replace(/\s+#.*$/, "").trim();
  const bodyAt = (index) => {
    const line = lines[index];
    return line ? line[0] : "";
  };
  let end = at2 + 1;
  if (value.startsWith("[") && !value.includes("]")) {
    while (end < lines.length && !bodyAt(end).includes("]")) end += 1;
    end = Math.min(end + 1, lines.length);
  } else if (value === "")
    while (end < lines.length && /^[ \t]*-([ \t]|$)/.test(bodyAt(end))) end += 1;
  return { at: at2, end, inline: value };
}
var readText2 = (file) => {
  try {
    return fs12.readFileSync(file, "utf8");
  } catch {
    return null;
  }
};
function emptyBaseModes(file) {
  const text = readText2(file);
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
  replaceFile(file, next, fs12.statSync(file).mode & 511);
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
  const text = readText2(file);
  if (text === null) return "absent";
  const line = linesOf(text).find(([body]) => FOLDER_LINE.test(body));
  if (!line) return "absent";
  const wanted = folderValue(home);
  if ("error" in wanted) return "other";
  return folderOfLine(line[0]) === scalarOf(wanted.value) ? "same" : "other";
}
function setProjectFolder(file, home) {
  const wanted = folderValue(home);
  if ("error" in wanted) return { changed: false, detail: wanted.error };
  const text = readText2(file);
  if (text === null) return { changed: false, detail: `${file} not found` };
  const lines = linesOf(text);
  const at2 = lines.findIndex(([body]) => FOLDER_LINE.test(body));
  const lineEnd = text.includes("\r\n") ? "\r\n" : "\n";
  let next;
  if (at2 < 0) next = `${text}${text === "" || /\n$/.test(text) ? "" : lineEnd}${FOLDER_KEY}: ${wanted.value}${lineEnd}`;
  else {
    if (folderState(file, home) === "same") return { changed: false, detail: `${file}: ${FOLDER_KEY} is set already` };
    next = lines.map(([body, ending], index) => index === at2 ? `${FOLDER_KEY}: ${wanted.value}${ending}` : body + ending).join("");
  }
  replaceInPlace(file, next);
  return { changed: true, detail: `set ${FOLDER_KEY} in ${file}` };
}
function writeMinimalConfig(file, home) {
  const wanted = folderValue(home);
  if ("error" in wanted) return { wrote: false, detail: wanted.error };
  if (fs12.existsSync(file)) return { wrote: false, detail: `${file} is there already` };
  fs12.mkdirSync(path16.dirname(file), { recursive: true });
  fs12.writeFileSync(file, `projects: []
base_modes: []
${FOLDER_KEY}: ${wanted.value}
`, { flag: "wx" });
  return { wrote: true, detail: `wrote ${file} with ${FOLDER_KEY}` };
}

// scripts/apply/constants.ts
var GITIGNORE_ALL = "*\n";

// scripts/apply/fetch.ts
var VERSION = 1;
var fetchJob = (project, fetch, check) => ({ version: VERSION, project, fetch, check: [...new Set(check)] });
function writeJob(file, job, { append = false } = {}) {
  fs13.mkdirSync(path17.dirname(file), { recursive: true });
  const prior = append && fs13.existsSync(file) ? JSON.parse(fs13.readFileSync(file, "utf8")) : null;
  const fetch = job.fetch.map((step) => {
    const keptStep = maskCredentials({ args: step.argv, env: step.env }, null);
    return { ...step, argv: keptStep.args, env: keptStep.env };
  });
  const out = prior ? { ...prior, fetch: [...prior.fetch, ...fetch], check: [.../* @__PURE__ */ new Set([...prior.check, ...job.check])] } : { ...job, fetch };
  fs13.writeFileSync(file, `${JSON.stringify(out, null, 2)}
`);
  return file;
}
var nextLines = (file, job) => [
  `Fetch next, in the background (a first download can take minutes): ${file}`,
  `  fetches ${job.fetch.map((step) => step.what).join(", ")} and starts each once, then reports the status of ${job.check.join(", ")} (claude mcp get)`
];
function serverStatus(names2, { cwd, env, runCli = runClaude, log = console.log }) {
  if (names2.length) log("", "Status, from the CLI:");
  return names2.map((name) => {
    const result = runCli(["mcp", "get", name], { cwd, env });
    const lines = `${result.stdout || ""}${result.stderr || ""}`.trim().split("\n").map((line) => line.trim()).filter(Boolean);
    const out = lines.find((line) => /^Status:/i.test(line)) || lines.slice(-1)[0] || "(no output)";
    log(`  ${name}: ${out}`);
    return { name, out, issue: lines.find((line) => /^Issue:/i.test(line)) || null };
  });
}

// scripts/plan/start-timeout-constants.ts
var SETTINGS_ENV_KEY = "env";

// scripts/plan/render.ts
function reconnectLine({ name, variable, file, filled, anonymous, hint = null }) {
  if (filled) return `${name}: connects with its key at the next session start; in a session already running, /mcp -> ${name} -> Reconnect`;
  return `${name}: fill ${variable} in ${file}${hint ? ` (${hint})` : ""}, then Reconnect it in /mcp - until then ${anonymous ? "it runs without the key, at lower rate limits" : "it connects without the key, and /mcp shows needs authentication"}`;
}

// scripts/mcps-list/mcp-order.ts
import fs14 from "node:fs";
var LEFT = "left as it is - /alfred-tools:fix (mcp-order) orders it";
function sortedNames(servers, catalog, own = /* @__PURE__ */ new Set()) {
  const map = servers || {};
  const names2 = Object.keys(map);
  const rank = new Map(names2.map((name) => {
    const entry = map[name];
    const match = own.has(name) || !isServerEntry(entry) ? null : matchEntry(entry, catalog);
    return [name, match ? catalog.order.indexOf(match.rowId) : -1];
  }));
  const rankOf = (name) => rank.get(name) ?? -1;
  const managed2 = names2.filter((name) => rankOf(name) >= 0).sort((first, second) => rankOf(first) - rankOf(second));
  return [...managed2, ...names2.filter((name) => rankOf(name) < 0)];
}
function canon(value) {
  const sorted = (node) => {
    if (Array.isArray(node)) return node.map(sorted);
    if (isRecord(node)) return Object.fromEntries(Object.keys(node).sort().map((key) => [key, sorted(node[key])]));
    return node;
  };
  return JSON.stringify(sorted(value));
}
function reorderText(text, catalog, own = /* @__PURE__ */ new Set()) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return { error: "is not plain JSON (a BOM, a comment or a trailing comma, say)" };
  }
  if (!isRecord(doc)) return { error: "is not a JSON object" };
  const servers = doc["mcpServers"];
  if (!isRecord(servers)) return { text, changed: false };
  const names2 = Object.keys(servers);
  const order = sortedNames(servers, catalog, own);
  if (order.every((name, i) => name === names2[i])) return { text, changed: false };
  const orderedServers = Object.fromEntries(order.map((name) => [name, servers[name]]));
  const next = Object.fromEntries(Object.entries(doc).map(([key, value]) => [key, key === "mcpServers" ? orderedServers : value]));
  if (Object.keys(orderedServers).some((name, i) => name !== order[i])) return { error: "has a server name JSON cannot place (an integer name)" };
  const indented = /\n([ \t]+)\S/.exec(text);
  const crlf = text.includes("\r\n");
  let out = JSON.stringify(next, null, indented ? indented[1] : 2);
  if (crlf) out = out.replace(/\n/g, "\r\n");
  if (/\n$/.test(text)) out += crlf ? "\r\n" : "\n";
  let back;
  try {
    back = JSON.parse(out);
  } catch {
    return { error: "would not parse once ordered" };
  }
  const backServers = isRecord(back) ? back["mcpServers"] : void 0;
  const sameNames = isRecord(backServers) && Object.keys(backServers).length === names2.length && names2.every((name) => Object.hasOwn(backServers, name));
  if (!sameNames || canon(back) !== canon(doc)) return { error: "would not hold the same servers once ordered" };
  return { text: out, changed: true };
}
function orderFile(file, catalog, own = /* @__PURE__ */ new Set(), { read = fs14.readFileSync, write = fs14.writeFileSync, rename = fs14.renameSync } = {}) {
  const warn = (why) => ({ ok: true, changed: false, detail: `warning: ${file} ${why}; ${LEFT}` });
  let text;
  try {
    text = read(file, "utf8");
  } catch (caught) {
    const code = errorCode(caught);
    return code === "ENOENT" || code === "ENOTDIR" ? { ok: true, changed: false, detail: `${file}: not there - nothing to order` } : warn(`cannot be read (${code || errorMessage(caught)})`);
  }
  const reordered = reorderText(text, catalog, own);
  if (reordered.error !== void 0) return warn(reordered.error);
  if (!reordered.changed) return { ok: true, changed: false, detail: `${file}: the servers are already in order` };
  let target = file;
  try {
    target = fs14.realpathSync(file);
  } catch {
  }
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    let now = null;
    try {
      now = read(file, "utf8");
    } catch {
    }
    if (now !== text) return warn("changed while it was being ordered");
    write(temporary, reordered.text);
    rename(temporary, target);
  } catch (caught) {
    try {
      fs14.rmSync(temporary, { force: true });
    } catch {
    }
    return warn(`could not be written (${errorCode(caught) || errorMessage(caught)})`);
  }
  return { ok: true, changed: true, detail: `ordered ${file}: the catalog servers first, your own after them - no value changed` };
}

// scripts/apply/cli-steps.ts
var quote = (text) => /^[A-Za-z0-9_\-./:=@,+]+$/.test(text) ? text : `'${text.replace(/'/g, "'\\''")}'`;
var restoreLine = (name, scope, entry) => `claude mcp add-json ${quote(name)} ${quote(JSON.stringify(entry))} -s ${scope}`;
function restoreBy(context, step, name, scope, entry) {
  const keptEntry = maskCredentials(entry, rowOf(context, step));
  return `${restoreLine(name, scope, keptEntry)}${holdsKept(keptEntry) ? ` - put the real value back in place of ${MARKER}` : ""}`;
}
var rowOf = (context, step) => step.row ? context.catalog.byId.get(step.row) || null : null;
var readRegistration2 = readRegistration;
function makeRunner({ project, env, runCli }) {
  return (argv) => {
    const result = runCli(argv, { cwd: project, env });
    return { ok: !result.error && result.status === 0, out: `${result.stdout}${result.stderr}`.trim().split("\n").slice(-3).join(" | "), result };
  };
}
function masked(text, entry, row) {
  const values = [];
  const walk = (node, keptNode) => {
    if (typeof node === "string") {
      if (node !== keptNode && node) values.push(node, JSON.stringify(node).slice(1, -1));
      return;
    }
    if (Array.isArray(node) || isRecord(node)) for (const [key, child] of Object.entries(node)) walk(child, valueAt(keptNode, [key]));
  };
  walk(entry, maskCredentials(entry, row));
  return [...new Set(values)].sort((left, right) => right.length - left.length).reduce((maskedText, value) => maskedText.split(value).join(MARKER), text);
}
function addAndVerify(call, context, name, scope, entry, row = null) {
  const result = call(["mcp", "add-json", name, JSON.stringify(entry), "-s", scope]);
  if (!result.ok) return { ok: false, detail: `claude mcp add-json ${name} -s ${scope} failed: ${masked(result.out, entry, row)}` };
  const got = readRegistration2(name, scope, context.project, context.env);
  if (!got || !deepEqual(got, entry)) return { ok: false, detail: `'${name}' at ${scope} scope did not read back as written` };
  return { ok: true, detail: `added '${name}' at ${scope} scope` };
}
function removeAndVerify(call, context, name, scope) {
  const result = call(["mcp", "remove", name, "-s", scope]);
  if (!result.ok) return { ok: false, detail: `claude mcp remove ${name} -s ${scope} failed: ${result.out}` };
  if (readRegistration2(name, scope, context.project, context.env)) return { ok: false, detail: `'${name}' is still at ${scope} scope after the remove` };
  return { ok: true, detail: `removed '${name}' from ${scope} scope` };
}
var isWriteStep = (step) => step.op === "mcp-add" || step.op === "mcp-replace" || step.op === "mcp-move";
function restoreStep(step, context) {
  if (!isWriteStep(step) || !(holdsKept(step.entry) || holdsKept("old" in step ? step.old : void 0))) return { step };
  if (step.op === "mcp-add") return { error: `'${step.name}' holds a kept value and no registration to take it from - run the command again` };
  const from = step.op === "mcp-move" ? step.from : { name: step.name, scope: step.scope };
  const changed = { error: `'${from.name}' changed since it was read - run the command again` };
  const source = readRegistration2(from.name, from.scope, context.project, context.env);
  const row = rowOf(context, step);
  if (!source || step.old && !deepEqual(maskCredentials(source, row), step.old)) return changed;
  const restored = restore(step.entry, source, row);
  if (restored.error !== void 0) return changed;
  return { step: { ...step, entry: restored.entry, old: step.old ? source : step.old } };
}
function fillStep(step, context) {
  if (!isWriteStep(step) || !step.key) return { step, note: null };
  const { key, route: routeId } = step;
  const row = rowOf(context, step);
  const route = row && row.routes && routeId !== null ? row.routes[routeId] : null;
  const tokenVar = route ? route.tokenVar : void 0;
  if (!route || !tokenVar || routeId === null) return { step, note: null };
  const to = step.op === "mcp-move" ? step.to : { name: step.name, scope: step.scope };
  const where = `'${to.name}' (${to.scope})`;
  const { name, files } = key;
  const fill = (value) => ({ ...step, entry: fillKeys(step.entry, row, routeId, to.scope, { [tokenVar]: value }) });
  const found = valueIn(files, name);
  if (found) return { step: fill(found.value), note: `${name} for ${where} from ${found.file}` };
  const old = "old" in step ? step.old : void 0;
  const held = old ? tokenFields(old, route).map((field) => valueAt(old, field.at)).find((candidate) => typeof candidate === "string" && candidate !== "" && !PLACEHOLDER.test(candidate) && !candidate.includes(MARKER)) : void 0;
  if (typeof held === "string") return { step: fill(held), note: `${name} for ${where} is in none of ${files.join(", ")} - the key it holds is kept; fill ${name} in ${files[0]} to replace it` };
  return { step: fill(""), note: `${name} for ${where} is in none of ${files.join(", ")} - written empty: fill ${name} in ${files[0]}, then run /alfred-tools:configure and keep ${name} as the key's name - it writes the key in` };
}

// scripts/apply/file-steps.ts
import fs15 from "node:fs";
import path18 from "node:path";
var import_mcp_headers3 = __toESM(require_mcp_headers(), 1);
var import_mcp_bridge3 = __toESM(require_mcp_bridge(), 1);
var eolOf = (text) => /\r\n/.test(text) ? "\r\n" : "\n";
var appendLines = (text, lines) => {
  const lineEnd = eolOf(text);
  return `${text}${text && !/\r?\n$/.test(text) ? lineEnd : ""}${lines.map((line) => `${line}${lineEnd}`).join("")}`;
};
var PLUGIN_FILES = /* @__PURE__ */ new Set([".gitignore", "package.json", ...Object.values(FILES), [".", "secrets"].join(""), `${FILES.record}.0.4.bak`, `${FILES.list}.bak`]);
function pluginWritten(root2, name) {
  if (PLUGIN_FILES.has(name)) return true;
  try {
    return fs15.readFileSync(path18.join(root2, name, ".gitignore"), "utf8").trim() === "*";
  } catch {
    return false;
  }
}
function rootIgnoreLines(root2) {
  let names2 = [];
  try {
    names2 = fs15.readdirSync(root2);
  } catch {
  }
  const mine = names2.every((name) => pluginWritten(root2, name));
  const want = mine ? GITIGNORE.trim().split("\n") : [FILES.secrets, FILES.record, FILES.list, `${FILES.signIns}/`];
  const file = path18.join(root2, ".gitignore");
  let text = null;
  try {
    text = fs15.readFileSync(file, "utf8");
  } catch {
  }
  const have = new Set((text || "").split(/\r?\n/).map((line) => line.trim()));
  return { file, text, mine, want, lack: want.filter((line) => !have.has(line)) };
}
function writeExcludeFile(root2, tools) {
  const file = path18.join(root2, FILES.macosExclude);
  if (fs15.existsSync(file)) return { ok: true, detail: `${file} is there - kept as it is`, unchanged: true };
  fs15.mkdirSync(root2, { recursive: true });
  replaceFile(file, excludeToml(tools));
  return { ok: true, detail: `wrote ${file} (${tools.join(", ")} off)` };
}
function rootIgnore(root2) {
  if (path18.basename(root2) === ALFRED_DATA) return { ok: true, detail: `${root2} is alfred-code's - its own .gitignore covers it; nothing written` };
  const { file, text, want, lack } = rootIgnoreLines(root2);
  if (text === null) {
    fs15.mkdirSync(root2, { recursive: true });
    fs15.writeFileSync(file, appendLines("", want));
    return { ok: true, detail: `wrote ${file} (${want.join(", ")})` };
  }
  if (!lack.length) return { ok: true, detail: `${file} has every line it needs - left as it is` };
  fs15.writeFileSync(file, appendLines(text, lack));
  return { ok: true, detail: `appended ${lack.join(", ")} to ${file}` };
}
function ensureCommonjs(root2) {
  const file = path18.join(root2, "package.json");
  let text = null;
  try {
    text = fs15.readFileSync(file, "utf8");
  } catch {
  }
  if (text === null) {
    fs15.mkdirSync(root2, { recursive: true });
    fs15.writeFileSync(file, '{"type":"commonjs"}\n');
    return { wrote: true, note: null };
  }
  let type = null;
  try {
    type = JSON.parse(stripBom(text)).type;
  } catch {
  }
  return { wrote: false, note: type === "module" ? `${file} says "type": "module" - mcp-headers.js and mcp-bridge.js cannot load there; set it to "commonjs", or remove it` : null };
}
var SHIPPED = {
  helper: { word: "helper", version: () => import_mcp_headers3.HELPER_VERSION },
  bridge: { word: "bridge", version: () => import_mcp_bridge3.BRIDGE_VERSION },
  // serena's context (D7): YAML, so no package.json beside it
  serenaContext: { word: "context", version: () => SERENA_CONTEXT_VERSION, plain: true }
};
function writeShipped(kind, root2) {
  const file = path18.join(root2, FILES[kind]);
  const { state, number } = shippedState(kind, file);
  const { word, version, plain } = SHIPPED[kind];
  if (plain && !fs15.existsSync(root2)) {
    fs15.mkdirSync(root2, { recursive: true });
    fs15.writeFileSync(path18.join(root2, ".gitignore"), GITIGNORE_ALL);
  }
  const packageJsonResult = plain ? { wrote: false, note: null } : ensureCommonjs(root2);
  const withPkg = (detail) => ({ ok: true, detail: [detail, packageJsonResult.wrote ? `wrote ${path18.join(root2, "package.json")} (type commonjs)` : null, packageJsonResult.note].filter(Boolean).join("; ") });
  if (state === "same") return withPkg(`${file} is up to date - left as it is`);
  if (state === "higher") return withPkg(`${FILES[kind]} in ${root2} is newer than this plugin - update alfred-tools`);
  if (state === "edited") return withPkg(`${file} changed since alfred-tools wrote it - left; /alfred-tools:fix rewrites it`);
  fs15.writeFileSync(file, shippedSource(kind));
  return withPkg(state === "lower" ? `rewrote ${file} (${word} ${number} -> ${version()})` : `wrote ${file} (${word} ${version()})`);
}
function serenaConfigInit(file, home) {
  try {
    if (!fs15.existsSync(home)) {
      fs15.mkdirSync(home, { recursive: true });
      fs15.writeFileSync(path18.join(home, ".gitignore"), GITIGNORE_ALL);
    }
    return { ok: true, detail: writeMinimalConfig(file, home).detail };
  } catch (error) {
    return { ok: true, detail: `${file} not written (${error instanceof Error ? error.message : String(error)}) - the project folder key is set after serena's first start` };
  }
}
var writeHelper = (root2) => writeShipped("helper", root2);
var KEY_HEAD = "# alfred-tools MCP keys - fill in each value; this file is never committed";
function ensureKeyName(file, names2) {
  if (gitIgnores(file) === false) return { ok: false, detail: `git would commit ${file} - not written; /alfred-tools:fix (root-ignore) covers it` };
  let buffer = null;
  try {
    buffer = fs15.readFileSync(file);
  } catch {
  }
  if (buffer && buffer[0] === 255 && buffer[1] === 254) return { ok: true, detail: `${file} is UTF-16 - add ${names2.map((name) => `${name}=`).join(", ")} to it yourself; nothing written` };
  const text = buffer ? buffer.toString("utf8") : null;
  const have = new Set(namesIn(file));
  const lack = [...new Set(names2)].filter((name) => !have.has(name));
  const list = lack.map((name) => `${name}=`).join(", ");
  if (text === null) {
    fs15.mkdirSync(path18.dirname(file), { recursive: true });
    fs15.writeFileSync(file, appendLines("", [KEY_HEAD, ...lack.map((name) => `${name}=`)]), process.platform === "win32" ? {} : { mode: 384 });
    return { ok: true, detail: `created ${file} with ${list || "no name"} - names only, you fill in each value` };
  }
  if (!lack.length) return { ok: true, detail: `${file} has ${names2.join(", ")} - left as it is` };
  fs15.writeFileSync(file, appendLines(text, lack.map((name) => `${name}=`)));
  return { ok: true, detail: `appended ${list} to ${file} - names only, you fill in each value` };
}
function keepAsIs(read) {
  if (!read || read.state !== "newer" && read.state !== "unreadable") return null;
  const what = read.note.replace(/ - read as empty$/, "");
  return { ok: true, detail: `${what} - left as it is; ${read.state === "newer" ? "update alfred-tools" : "check its permissions"}, then run the command again` };
}
function writeJson(file, doc, read) {
  fs15.mkdirSync(path18.dirname(file), { recursive: true });
  let backupPath = null;
  if (read && read.state === "bad" && fs15.existsSync(file)) {
    backupPath = `${file}.bak`;
    fs15.copyFileSync(file, backupPath);
  }
  replaceFile(file, `${JSON.stringify(doc, null, 2)}
`);
  return backupPath;
}
var readNote = (read, backupPath) => read && read.note ? ` - ${read.note}${backupPath ? `; the old file kept as ${backupPath}` : ""}` : "";
function listWrite(step, context, { failure = false } = {}) {
  const read = readList(step.file);
  let base = read;
  if (!read) {
    const old = readOldRecord(path18.join(path18.dirname(step.file), FILES.record));
    base = old && !old.state ? { servers: [], own: ownOnly(old.servers) } : null;
  }
  const applied = context.report && context.report.appliedKeys || /* @__PURE__ */ new Set();
  const cursorDone = context.report && context.report.cursorFiles || /* @__PURE__ */ new Set();
  const upserts = [];
  for (const upsert of step.upserts || []) {
    if (upsert.after && !applied.has(upsert.after)) continue;
    let server = { ...upsert.server };
    if (upsert.after) {
      const got = readRegistration2(server.name, server.scope, context.project, context.env);
      if (!got) continue;
      server = { ...server, ...fromRegistration({ name: server.name, scope: server.scope, route: server.route, entry: got }, rowOf(context, server), server.clients || ["claude"], upsert.keyFiles || []) };
    }
    if (failure && upsert.cursorFile && !cursorDone.has(upsert.cursorFile)) server.clients = (server.clients || []).filter((client) => client !== "cursor");
    const { form } = server;
    delete server.form;
    const forCursor = (server.clients || []).includes("cursor");
    if (form === "two" && forCursor) {
      const listed = (base && base.servers || []).find((listServer) => serverKey(listServer) === serverKey(server));
      const prior = server.cursorEntry || listed && listed.cursorEntry || null;
      const copy = bridgeFormOf(server.entry, context.catalog || load(), prior);
      if (copy) server.cursorEntry = copy;
      else delete server.cursorEntry;
    } else if (form !== void 0 || !forCursor) delete server.cursorEntry;
    const { entry } = server;
    if (entry === null) continue;
    upserts.push({ ...server, entry });
  }
  const drops = (step.drops || []).filter((drop) => !drop.after || applied.has(drop.after)).map((drop) => drop.key);
  const doc = mergeList(base, { upserts, drops, own: step.own ? ownOf(step.own) : void 0, cursorOffer: step.cursorOffer });
  return writeList(step.file, doc, read);
}
function settingsTarget(file) {
  let isLink = false;
  try {
    isLink = fs15.lstatSync(file).isSymbolicLink();
  } catch {
    return { file };
  }
  if (!isLink) return { file };
  try {
    return { file: fs15.realpathSync(file) };
  } catch {
    return { error: `${file} is a link to a file that is not there - left as it is` };
  }
}
function denyRead(file, rules) {
  const target = settingsTarget(file);
  if ("error" in target) return { ok: false, detail: target.error };
  const real = target.file;
  let text = null;
  try {
    text = fs15.readFileSync(real, "utf8");
  } catch (caught) {
    const code = errorCode(caught);
    if (code !== "ENOENT") return { ok: false, detail: `${file} cannot be read (${code}) - left as it is` };
  }
  let doc = {};
  if (text !== null) {
    try {
      doc = JSON.parse(stripBom(text));
    } catch {
      doc = null;
    }
    const isObject = isRecord;
    if (!isObject(doc) || doc.permissions !== void 0 && !isObject(doc.permissions) || doc.permissions && doc.permissions.deny !== void 0 && !Array.isArray(doc.permissions.deny))
      return { ok: false, detail: `${file} is not a settings object alfred-tools can read - left as it is; add ${rules.join(" and ")} to permissions.deny yourself` };
  }
  const deny = doc.permissions && doc.permissions.deny || [];
  const lack = rules.filter((rule) => !deny.includes(rule));
  if (!lack.length) return { ok: true, unchanged: true, detail: `${file} already denies ${rules.join(" and ")} - left as it is` };
  const next = { ...doc, permissions: { ...doc.permissions || {}, deny: [...deny, ...lack] } };
  writeJson(real, next, null);
  return { ok: true, detail: `added ${lack.join(" and ")} to permissions.deny in ${file}` };
}
function settingsEnv(file, env) {
  const target = settingsTarget(file);
  if ("error" in target) return { ok: false, detail: target.error };
  const real = target.file;
  let text = null;
  try {
    text = fs15.readFileSync(real, "utf8");
  } catch (caught) {
    const code = errorCode(caught);
    if (code !== "ENOENT") return { ok: false, detail: `${file} cannot be read (${code}) - left as it is` };
  }
  let doc = {};
  if (text !== null) {
    try {
      doc = JSON.parse(stripBom(text));
    } catch {
      doc = null;
    }
  }
  const held = isRecord(doc) ? doc[SETTINGS_ENV_KEY] : void 0;
  if (!isRecord(doc) || held !== void 0 && !isRecord(held))
    return { ok: false, detail: `${file} is not a settings object alfred-tools can read - left as it is; add ${Object.entries(env).map(([name, value]) => `${name}=${value}`).join(" and ")} to ${SETTINGS_ENV_KEY} yourself` };
  const present = held ?? {};
  const lack = Object.entries(env).filter(([name]) => !Object.hasOwn(present, name));
  if (!lack.length) return { ok: true, unchanged: true, detail: `${file} has ${Object.keys(env).join(" and ")} in ${SETTINGS_ENV_KEY} already - left as it is` };
  writeJson(real, { ...doc, [SETTINGS_ENV_KEY]: { ...present, ...Object.fromEntries(lack) } }, null);
  return { ok: true, detail: `added ${lack.map(([name, value]) => `${name}=${value}`).join(" and ")} to ${SETTINGS_ENV_KEY} in ${file}` };
}
function moveRootFile(from, to) {
  let fromStats;
  try {
    fromStats = fs15.lstatSync(from);
  } catch {
    return { ok: true, detail: `${from}: not there - nothing to move` };
  }
  let there = null;
  try {
    there = fs15.lstatSync(to);
  } catch {
  }
  if (!there) {
    fs15.mkdirSync(path18.dirname(to), { recursive: true });
    try {
      fs15.renameSync(from, to);
    } catch (caught) {
      if (errorCode(caught) !== "EXDEV") throw caught;
      fs15.cpSync(from, to, { recursive: true });
      fs15.rmSync(from, { recursive: true, force: true });
    }
    return { ok: true, detail: `moved ${from} to ${to}` };
  }
  if (fromStats.isFile() && there.isFile() && fs15.readFileSync(from).equals(fs15.readFileSync(to))) {
    fs15.rmSync(from);
    return { ok: true, detail: `${to} holds the same as ${from} - removed ${from}` };
  }
  return { ok: false, detail: `${to} is there already and is not ${from} - nothing moved; move or remove one of them, then run the command again` };
}
function retireRecord(file) {
  if (!fs15.existsSync(file)) return { ok: true, detail: `${file}: not there - nothing to move` };
  let to = `${file}.0.4.bak`;
  for (let suffix = 2; fs15.existsSync(to); suffix++) to = `${file}.0.4.bak.${suffix}`;
  fs15.renameSync(file, to);
  return { ok: true, detail: `moved ${file} to ${to} - its entries are in the list now` };
}
function retireShipped(step) {
  const { state } = shippedState(step.kind, step.file);
  if (state === "absent") return { ok: true, detail: `${step.file} is already gone` };
  if (state === "edited") return { ok: true, detail: `left ${step.file} - edited by hand` };
  if (state !== "same") return { ok: true, detail: `left ${step.file} - not this plugin's current copy` };
  if (step.namedBy.length) return { ok: true, detail: `left ${step.file} - still named by ${step.namedBy.join(", ")}` };
  fs15.rmSync(step.file);
  return { ok: true, detail: `removed ${step.file}` };
}
function failureLists(plan, report, context, log = () => {
}) {
  const out = [];
  for (const step of plan.steps.filter((planStep) => planStep.op === "list-write")) {
    let result;
    try {
      result = listWrite(step, { ...context, report }, { failure: true });
    } catch (caught) {
      result = { ok: false, detail: `${step.file}: ${errorMessage(caught)}` };
    }
    log(`   list: ${result.detail}`);
    out.push(result);
  }
  return out;
}
function recordRoot(step, data) {
  if (!data) return { ok: true, detail: `${step.family} root ${step.root}: no plugin data folder given - the root is found from its files next time` };
  const map = readMap(data);
  const kept = keepAsIs(map);
  if (kept) return kept;
  const file = path18.join(data, FILES.map);
  const next = withRoot(map, step.family, path18.resolve(step.project), step.root);
  if (!map.state && fs15.existsSync(file) && JSON.stringify(next) === JSON.stringify(map)) return { ok: true, detail: `${file} already names the ${step.family} root ${step.root} - left as it is` };
  const backupPath = writeJson(file, next, map);
  return { ok: true, detail: `recorded the ${step.family} root ${step.root} in ${file}${readNote(map, backupPath)}` };
}

// scripts/apply/serena-folder-move.ts
import fs17 from "node:fs";
import { spawnSync as spawnSync4 } from "node:child_process";

// scripts/apply/serena-projects.ts
import fs16 from "node:fs";
var PROJECTS_KEY = /^projects[ \t]*:(.*?)\r?$/;
var BLOCK_ITEM = /^[ \t]*-[ \t]+(.*?)\r?$/;
function projectsOf(file) {
  let text;
  try {
    text = fs16.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const lines = text.split("\n");
  const at2 = lines.findIndex((line) => PROJECTS_KEY.test(line));
  const keyLine = lines[at2];
  if (keyLine === void 0) return [];
  const [, raw = ""] = PROJECTS_KEY.exec(keyLine) ?? [];
  const [, flowItems] = /^\[(.*)\](?:\s+#.*)?$/.exec(raw.trim()) ?? [];
  if (flowItems !== void 0) return flowItems.split(",").map(scalarOf).filter(Boolean);
  const inline = raw.replace(/\s+#.*$/, "").trim();
  if (inline.startsWith("["))
    return inline.replace(/^\[|\]$/g, "").split(",").map(scalarOf).filter(Boolean);
  const out = [];
  for (const line of lines.slice(at2 + 1)) {
    if (/^\s*(#.*)?\r?$/.test(line)) continue;
    const [, itemText] = BLOCK_ITEM.exec(line) ?? [];
    if (itemText === void 0) break;
    const value = scalarOf(itemText);
    if (value) out.push(value);
  }
  return out;
}

// scripts/apply/serena-folder-move.ts
var SERENA_FOLDER = ".serena";
var PROJECTS_FOLDER = "projects";
var isFolder = (folder) => {
  try {
    return fs17.statSync(folder).isDirectory();
  } catch {
    return false;
  }
};
var exists = (target) => {
  try {
    fs17.lstatSync(target);
    return true;
  } catch {
    return false;
  }
};
function destinationOf(project, home) {
  const name = project.replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop() ?? "";
  return pathApiOf(home).join(home, PROJECTS_FOLDER, name);
}
function stayReason(project, from, to) {
  if (!exists(pathApiOf(project).join(project, ".git"))) return "the project has no .git, so serena would lose the project";
  if (exists(to)) return `${to} is there already`;
  const listed = spawnSync4("git", ["-C", project, "ls-files", "--", SERENA_FOLDER], { encoding: "utf8", windowsHide: true });
  if (listed.error || listed.status !== 0) return `git could not list ${from}`;
  return listed.stdout.trim() ? `git tracks files under ${from}` : null;
}
function inTreeFolders(file, home) {
  const taken = /* @__PURE__ */ new Set();
  const out = [];
  for (const project of projectsOf(file)) {
    const from = pathApiOf(project).join(project, SERENA_FOLDER);
    if (!isFolder(from)) continue;
    const to = destinationOf(project, home);
    const reason = stayReason(project, from, to) ?? (taken.has(to) ? `another project moves to ${to}` : null);
    if (reason === null) taken.add(to);
    out.push({ project, from, to, reason });
  }
  return out;
}
function inTreeLines(file, home) {
  return inTreeFolders(file, home).flatMap((folder) => folder.reason === null ? [] : [`serena keeps using ${folder.from} - ${folder.reason}`]);
}
var copyWhole = (from, to) => fs17.cpSync(from, to, { recursive: true, force: false, errorOnExist: true });
var removeWhole = (folder) => fs17.rmSync(folder, { recursive: true, force: true });
function moveFolder(from, to, { rename = fs17.renameSync, copy = copyWhole, remove = removeWhole } = {}) {
  fs17.mkdirSync(pathApiOf(to).dirname(to), { recursive: true });
  try {
    rename(from, to);
    return null;
  } catch (caught) {
    if (errorCode(caught) !== "EXDEV") throw caught;
  }
  const existed = exists(to);
  try {
    copy(from, to);
  } catch (copyFailure) {
    if (!existed) remove(to);
    throw copyFailure;
  }
  try {
    remove(from);
  } catch (removeFailure) {
    return errorCode(removeFailure) ?? errorMessage(removeFailure);
  }
  return null;
}
function serenaFolderMove(step, ops = {}) {
  if (!isFolder(step.from)) return { ok: true, detail: `left ${step.from} - it is not a folder any more` };
  const reason = stayReason(step.project, step.from, step.to);
  if (reason) return { ok: true, detail: `left ${step.from} - ${reason}` };
  let stuck;
  try {
    stuck = moveFolder(step.from, step.to, ops);
  } catch (caught) {
    return { ok: true, detail: `left ${step.from} - ${errorCode(caught) ?? errorMessage(caught)}` };
  }
  if (stuck !== null) return { ok: true, detail: `copied to ${step.to}; ${step.from} could not be removed - ${stuck}: remove it by hand once serena is stopped` };
  return { ok: true, detail: `moved ${step.from} to ${step.to} - restart Claude Code so serena reads the moved folder` };
}

// scripts/apply/retire-helper.ts
import fs18 from "node:fs";
import path20 from "node:path";

// scripts/apply/git-tracked.ts
import { spawnSync as spawnSync5 } from "node:child_process";
import path19 from "node:path";
var NOT_A_REPOSITORY = /not a git repository/i;
var runGit = (args, cwd) => {
  const result = spawnSync5("git", args, { cwd, encoding: "utf8", windowsHide: true, env: { ...process.env, LC_ALL: "C" } });
  return { status: result.status, stderr: result.stderr || "", error: result.error };
};
function trackedState(file, run = runGit) {
  const answer = run(["ls-files", "--error-unmatch", "--", path19.basename(file)], path19.dirname(file));
  if (answer.error) return "unknown";
  if (answer.status === 0) return "tracked";
  if (answer.status === 1) return "untracked";
  return answer.status === 128 && NOT_A_REPOSITORY.test(answer.stderr) ? "untracked" : "unknown";
}

// scripts/apply/retire-helper.ts
function projectKeys(text) {
  try {
    const doc = parseJson(text);
    const projects = isRecord(doc) ? doc["projects"] : void 0;
    return isRecord(projects) ? Object.keys(projects) : [];
  } catch {
    return [];
  }
}
function textOf2(file) {
  try {
    return fs18.readFileSync(file, "utf8");
  } catch (caught) {
    return errorCode(caught) === "ENOENT" ? "" : null;
  }
}
var foldsCase = (platform) => platform === "win32" || platform === "darwin";
function keepReason(file, { project, env, platform = process.platform, run = runGit }) {
  const tracked = trackedState(file, run);
  if (tracked === "tracked") return "tracked by git";
  if (tracked === "unknown") return "git could not say whether it is tracked";
  const fold = foldsCase(platform);
  const name = fold ? path20.basename(file).toLowerCase() : path20.basename(file);
  const accountPath = accountFile(env);
  const accountText = textOf2(accountPath);
  const projects = [.../* @__PURE__ */ new Set([project, ...accountText ? projectKeys(accountText) : []])];
  const place = { platform: process.platform, home: homeDir(env), env };
  const candidates = [
    accountPath,
    fileFor("global", place),
    ...projects.flatMap((each) => [path20.join(each, MCP_JSON), fileFor("project", { ...place, project: each })])
  ];
  for (const candidate of candidates) {
    const text = candidate === accountPath ? accountText : textOf2(candidate);
    if (text === null) return `${candidate} could not be read`;
    if ((fold ? text.toLowerCase() : text).includes(name)) return `${candidate} names it`;
  }
  return null;
}
function retireHelper(step, context, options = {}) {
  if (!fs18.existsSync(step.file)) return { ok: true, detail: `${step.file} is already gone` };
  const kept = keepReason(step.file, { project: context.project, env: context.env, ...options });
  if (kept) return { ok: true, detail: `left ${step.file} - ${kept}` };
  fs18.rmSync(step.file);
  return { ok: true, detail: `removed ${step.file}` };
}

// scripts/apply/run.ts
function runStep(step, context, call) {
  switch (step.op) {
    case "ensure-dir": {
      const existed = fs19.existsSync(step.path);
      fs19.mkdirSync(step.path, { recursive: true });
      if (!existed) fs19.writeFileSync(path21.join(step.path, ".gitignore"), GITIGNORE_ALL);
      return { ok: true, detail: existed ? `${step.path} exists - left as it is` : `created ${step.path} with a .gitignore holding *` };
    }
    case "root-ignore":
      return rootIgnore(step.path);
    case "write-helper":
      return writeHelper(step.path);
    case "write-bridge":
      return writeShipped("bridge", step.path);
    case "write-serena-context":
      return writeShipped("serenaContext", step.path);
    case "write-exclude-file":
      return writeExcludeFile(step.path, step.tools);
    case "move-root-file":
      return moveRootFile(step.from, step.to);
    case "serena-base-modes": {
      const result = emptyBaseModes(step.file);
      return { ok: true, detail: result.detail };
    }
    case "serena-config-init":
      return serenaConfigInit(step.file, step.home);
    case "serena-project-folder": {
      const result = setProjectFolder(step.file, step.home);
      return { ok: true, detail: [result.detail, ...inTreeLines(step.file, step.home)].join("; ") };
    }
    case "ensure-key-name":
      return ensureKeyName(step.file, step.names);
    case "list-write":
      return listWrite(step, context);
    case "retire-record":
      return retireRecord(step.file);
    case "retire-shipped":
      return retireShipped(step);
    case "retire-helper":
      return retireHelper(step, context);
    case "serena-folder-move":
      return serenaFolderMove(step);
    case "cursor-write":
      return cursorWrite(step, context);
    case "deny-read":
      return denyRead(step.file, step.rules || []);
    case "settings-env":
      return settingsEnv(step.file, step.env || {});
    // never fails the apply: a warning, and the file as it was (spec F8)
    case "order-mcp-json":
      return orderFile(step.file, context.catalog, new Set(step.own || []));
    case "record-root":
      return recordRoot(step, context.data);
    case "mcp-add":
      return addAndVerify(call, context, step.name, step.scope, step.entry, rowOf(context, step));
    case "mcp-remove":
      return removeAndVerify(call, context, step.name, step.scope);
    case "mcp-replace": {
      const file = path21.join(context.tmp, "rollback.json");
      fs19.mkdirSync(context.tmp, { recursive: true });
      fs19.writeFileSync(file, JSON.stringify({ name: step.name, scope: step.scope, entry: maskCredentials(step.old, rowOf(context, step)), project: context.project }, null, 2));
      const removeResult = removeAndVerify(call, context, step.name, step.scope);
      if (!removeResult.ok) return { ok: false, detail: `${removeResult.detail} - the old entry is untouched or restored by hand: ${restoreBy(context, step, step.name, step.scope, step.old)}` };
      const add = addAndVerify(call, context, step.name, step.scope, step.entry, rowOf(context, step));
      if (add.ok) return { ok: true, detail: `rewrote '${step.name}' at ${step.scope} scope (old entry saved in ${file})` };
      const back = addAndVerify(call, context, step.name, step.scope, step.old, rowOf(context, step));
      return { ok: false, detail: `${add.detail}; ${back.ok ? "the old entry was re-added" : `RESTORE BY HAND: ${restoreBy(context, step, step.name, step.scope, step.old)}`}` };
    }
    case "mcp-move": {
      const add = addAndVerify(call, context, step.to.name, step.to.scope, step.entry, rowOf(context, step));
      if (!add.ok) return { ok: false, detail: `${add.detail}; the old '${step.from.name}' at ${step.from.scope} scope is untouched` };
      const removeResult = removeAndVerify(call, context, step.from.name, step.from.scope);
      if (!removeResult.ok) return { ok: false, detail: `${removeResult.detail}; the new one is in place, the old one is still there - remove it by hand: claude mcp remove ${step.from.name} -s ${step.from.scope}` };
      return { ok: true, detail: `moved '${step.from.name}' (${step.from.scope}) to '${step.to.name}' (${step.to.scope}): added, read back, old removed` };
    }
    default:
      return { ok: false, detail: `unknown operation ${step.op}` };
  }
}
function apply(plan, { env = process.env, tmp, runCli = runClaude, log = console.log, fetchFile, data = null } = {}) {
  const project = plan.project;
  const report = { applied: [], failed: null, notRun: [], readback: [], keys: [], noop: false, toFetch: [], fetch: null, fetchFile: null, tmp: tmp || null, appliedKeys: /* @__PURE__ */ new Set(), cursorFiles: /* @__PURE__ */ new Set(), lists: [] };
  if (!plan.steps.length) {
    report.noop = true;
    log("Nothing to apply: every answer already matches what is installed. No claude call was made.");
    return report;
  }
  const context = { project, env, tmp: tmp || makeTempDir(), runCli, catalog: load(), alfredEnabled: Boolean(plan.alfredCodeEnabled), data };
  const call = makeRunner(context);
  context.call = call;
  context.report = report;
  report.tmp = context.tmp;
  for (const [i, step] of plan.steps.entries()) {
    if (step.op === "fetch") {
      report.toFetch.push(step);
      log(`${i + 1}. later  ${step.why} (fetch.mjs, after the read-back)`);
      continue;
    }
    const ready = restoreStep(step, context);
    const filled = ready.error === void 0 ? fillStep(ready.step, context) : null;
    let stepResult;
    try {
      stepResult = filled ? runStep(filled.step, context, call) : { ok: false, detail: ready.error ?? "" };
    } catch (caught) {
      stepResult = { ok: false, detail: `${step.op}: ${errorMessage(caught)}` };
    }
    log(`${i + 1}. ${stepResult.ok ? "ok    " : "FAILED"} ${stepResult.detail}`);
    if (filled && filled.note) {
      report.keys.push(filled.note);
      log(`   key: ${filled.note}`);
    }
    if (stepResult.ok) {
      report.applied.push({ i: i + 1, op: step.op, detail: stepResult.detail });
      const key = regKey(step);
      if (key) report.appliedKeys.add(key);
      if (step.op === "cursor-write") report.cursorFiles.add(step.file);
      continue;
    }
    report.failed = { i: i + 1, op: step.op, detail: stepResult.detail };
    report.notRun = plan.steps.slice(i + 1).map((skippedStep, k) => ({ i: i + 2 + k, op: skippedStep.op, why: skippedStep.why }));
    break;
  }
  if (report.failed) {
    log("", `Stopped at step ${report.failed.i}. Already applied and left in place: ${report.applied.length ? report.applied.map((appliedStep) => `${appliedStep.i} (${appliedStep.detail})`).join("; ") : "nothing"}.`);
    if (report.notRun.length) log(`Not run: ${report.notRun.map((notRunStep) => `${notRunStep.i} ${notRunStep.op}`).join(", ")}.`);
    report.lists = failureLists(plan, report, context, log);
  }
  const builtInventory = buildInventory({ project, env });
  for (const expected of plan.expect || []) {
    const got = builtInventory.registrations.find((registration) => registration.name === expected.name && registration.scope === expected.scope);
    report.readback.push({ kind: "mcp", name: expected.name, scope: expected.scope, expectedRoute: expected.route, found: Boolean(got), route: got ? got.route : null, row: got ? got.rowId : null });
  }
  log("", "Read back:");
  for (const readbackEntry of report.readback)
    log(`  ${readbackEntry.found ? "ok " : "MISSING"} ${readbackEntry.name} - ${readbackEntry.scope} scope, ${readbackEntry.route || "?"} route${readbackEntry.row ? ` (${readbackEntry.row})` : ""}`);
  const done = new Set(report.applied.map((appliedStep) => appliedStep.i));
  const written = plan.steps.flatMap((planStep, i) => {
    if (!done.has(i + 1)) return [];
    if (planStep.op === "mcp-move") return [planStep.to];
    return planStep.op === "mcp-add" || planStep.op === "mcp-replace" ? [{ name: planStep.name, scope: planStep.scope }] : [];
  });
  const unfilled = new Set(plan.steps.flatMap((planStep) => "filled" in planStep && planStep.filled === false ? [planStep.op === "mcp-move" ? planStep.to.name : planStep.name] : []));
  const fresh = written.map((endpoint) => endpoint.name).filter((name) => !unfilled.has(name));
  const scopeOf = new Map(written.map((endpoint) => [endpoint.name, endpoint.scope]));
  const reconnect = (plan.reconnect || []).filter((reconnectEntry) => scopeOf.has(reconnectEntry.name));
  const now = new Set(reconnect.map((reconnectEntry) => reconnectEntry.name));
  const toFetch = report.toFetch.filter((fetchStep2) => scopeOf.has(fetchStep2.name)).map((fetchStep2) => ({ ...fetchStep2, scope: scopeOf.get(fetchStep2.name) }));
  report.fetch = fetchJob(project, toFetch, toFetch.length ? fresh.filter((name) => !now.has(name)) : fresh);
  let statuses = [];
  if (!report.fetch.fetch.length) statuses = serverStatus(fresh, { cwd: project, env, runCli, log });
  else {
    if (now.size) statuses = serverStatus([...now], { cwd: project, env, runCli, log });
    if (fetchFile !== false) {
      report.fetchFile = writeJob(fetchFile || path21.join(context.tmp, "fetch.json"), report.fetch);
      log("", ...nextLines(report.fetchFile, report.fetch));
    }
  }
  if (reconnect.length) log("", ...reconnectLines(reconnect, statuses, project));
  if (!report.failed) log("", `Restart Claude Code (or run /reload-plugins for plugins) so the new registrations load${report.fetchFile ? " - after the fetch reports, so a session start does not download the same package beside it" : ""}; a project-scope server also needs the trust prompt on the next session start.`);
  return report;
}
var REFUSED = /Server rejected the Authorization header minted by the configured headersHelper \(HTTP 40[13]\)/;
var refusedLine = ({ name, variable, hint }) => `${name}: the server refused the key in ${variable} - ${hint || "check the value"}`;
function reconnectLines(reconnect, statuses, project) {
  const lines = reconnect.map(reconnectLine);
  for (const reconnectEntry of reconnect.filter((entry) => entry.filled)) {
    const reconnectStatus = statuses.find((statusEntry) => statusEntry.name === reconnectEntry.name);
    if (!reconnectStatus || !REFUSED.test(reconnectStatus.issue || "")) continue;
    lines.push(reconnectEntry.untrusted ? `${reconnectEntry.name}: accept the trust dialog the next time Claude Code starts in ${project} - until then the server connects without its key` : refusedLine(reconnectEntry));
  }
  return lines;
}

// scripts/apply/plan-file.ts
var isPlanFile = (value) => typeof value === "object" && value !== null && "project" in value && typeof value.project === "string" && "steps" in value && Array.isArray(value.steps);

// scripts/apply/command.ts
function runApplyCommand(argv) {
  blockingStdio();
  const file = argv[0];
  if (!file) {
    console.error("usage: apply.mjs <plan.json> [--tmp <dir>] [--data <plugin data dir>]");
    return 2;
  }
  let parsed;
  try {
    parsed = JSON.parse(fs20.readFileSync(file, "utf8"));
  } catch (caught) {
    console.error(`apply: cannot read ${file} (${caught instanceof Error ? caught.message : String(caught)})`);
    return 2;
  }
  if (!isPlanFile(parsed)) {
    console.error(`apply: ${file} is not a plan - nothing applied`);
    return 2;
  }
  const plan = parsed;
  if (plan.errors && plan.errors.length) {
    console.error(`apply: the plan has errors - nothing applied:
${plan.errors.map((error) => `  ! ${error}`).join("\n")}`);
    return 1;
  }
  const flag = (name) => {
    const at2 = argv.indexOf(name);
    return at2 >= 0 ? argv[at2 + 1] : void 0;
  };
  const log = (...lines) => console.log(lines.join("\n"));
  const report = apply(plan, { tmp: flag("--tmp"), data: flag("--data") || null, log });
  if (!report.fetchFile) releaseTempDir(report.tmp, log);
  return report.failed ? 1 : 0;
}

// scripts/apply.ts
process.exit(runApplyCommand(process.argv.slice(2)));
