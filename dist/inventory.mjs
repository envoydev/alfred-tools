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
    var fs12 = __require("node:fs");
    var os3 = __require("node:os");
    var path15 = __require("node:path");
    var crypto = __require("node:crypto");
    var HELPER_VERSION2 = 6;
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
        buf = fs12.readFileSync(file);
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
      const dirs = [dir, extraRoot, path15.join(home, ".alfred-tools"), path15.join(home, ".alfred")].filter(Boolean);
      return [...new Set(dirs.map((d) => path15.join(d, SECRETS2)))];
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
      const files = chainOf(__dirname, extraRoot ? path15.resolve(extraRoot) : null, home);
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
    module.exports = { HELPER_VERSION: HELPER_VERSION2, chainOf, digestOf: digestOf2, readDotenv: readDotenv2, valueIn: valueIn2, authValue, parsePairs: parsePairs2 };
  }
});

// scripts/copied/mcp-bridge.js
var require_mcp_bridge = __commonJS({
  "scripts/copied/mcp-bridge.js"(exports, module) {
    "use strict";
    var fs12 = __require("node:fs");
    var os3 = __require("node:os");
    var path15 = __require("node:path");
    var { spawn } = __require("node:child_process");
    var BRIDGE_VERSION2 = 4;
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
      const files = h.chainOf(dir, globalRoot ? path15.resolve(globalRoot) : null, home);
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
      return [...new Set([dir, globalRoot].filter(Boolean).map((d) => path15.join(d, SECRETS2)))];
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
      const base = path15.win32.basename(command).toLowerCase();
      const direct = base === "cmd" || base === "cmd.exe" || /\.(exe|com)$/.test(base);
      const folders = String(env.PATH || env.Path || "").split(";").filter(Boolean);
      if (direct || folders.some((folder) => [".exe", ".com"].some((ext) => exists(path15.win32.join(folder, command + ext))))) return { command, args };
      return { command: env.ComSpec || "cmd.exe", args: ["/d", "/c", command, ...args] };
    }
    function runLaunch(argv, env, { dir, platform, helper: helper2, exists } = {}) {
      const parsed = parseRun(argv);
      if (parsed.error) return parsed;
      const h = helper2 || require_mcp_headers();
      const files = runChain(dir, parsed.globalRoot ? path15.resolve(parsed.globalRoot) : null);
      const found = h.valueIn(parsed.keyName, files);
      if (!found && !parsed.optional) return { error: `no value for ${parsed.keyName} in ${files.join(", ")}`, code: EXIT.failed };
      const start = platform === "win32" ? winLaunch(parsed.command, parsed.args, env, exists || fs12.existsSync) : { command: parsed.command, args: parsed.args };
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
    module.exports = { BRIDGE_VERSION: BRIDGE_VERSION2, NEEDS_HELPER, CREDENTIAL, RUN_FLAG, templateNames: templateNames2, fillTemplate, launch, runChain, parseRun, runLaunch };
  }
});

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

// scripts/core/temp-write.ts
import fs2 from "node:fs";
import path2 from "node:path";

// scripts/core/constants.ts
var CMD_PROGRAM_PATTERN = /^cmd(\.exe)?$/i;
var CMD_RUN_FLAG_PATTERN = /^\/c$/i;
var CMD_META_PATTERN = /([()\][%!^"`<>&|;, *?])/g;
var CLI_TIMEOUT_MS = 12e4;
var CLI_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
var NO_FILE_NAMES = /* @__PURE__ */ new Set(["", ".", ".."]);
var FILES = { secrets: ".mcps-secrets", helper: "mcp-headers.js", record: "preferred-tools.json", map: "roots.json", bridge: "mcp-bridge.js", list: "mcps.json", signIns: "mcp-remote-v1", serenaContext: "serena-context.yml", macosExclude: "macos-mcp.toml" };
var ROOT_NAME = ".alfred-tools";
var FORMER_ROOT_NAME = ".preferred-tools";
var ALFRED_DATA = ".alfred";
var MCP_JSON = ".mcp.json";
var ALL_SCOPES = ["local", "project", "user"];
var PLUGIN_MANIFEST = ".claude-plugin/plugin.json";

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

// scripts/core/temp-write.ts
function checkedTarget(file) {
  const name = path2.basename(file);
  const folder = path2.dirname(file);
  if (NO_FILE_NAMES.has(name) || !isOurTempDir(folder)) return null;
  return path2.join(realPathOf(folder), name);
}
function writeJsonNoFollow(file, value) {
  const temporary = `${file}.tmp`;
  fs2.rmSync(temporary, { force: true });
  fs2.writeFileSync(temporary, JSON.stringify(value, null, 2), { flag: "wx" });
  fs2.renameSync(temporary, file);
}

// scripts/inventory/constants.ts
var JSON_FILE_REFUSAL = "--json must name a file in a folder tmpdir.mjs made";
var REFUSED_EXIT_CODE = 2;
var CLI_MISSING_EXIT_CODE = 3;
var INVENTORY_VERSION = 1;
var ALFRED_CODE_PLUGIN = "alfred-code";
var MARKETPLACE_LIST_UNREAD = { scope: "marketplaces", file: "claude plugin marketplace list --json" };
var PLUGIN_LIST_UNREAD = { scope: "plugins", file: "claude plugin list --json" };
var LIST_UNREAD_NOTES = /* @__PURE__ */ new Map([
  [PLUGIN_LIST_UNREAD.scope, "the plugin list could not be read, so this run takes no plugin as installed."],
  [MARKETPLACE_LIST_UNREAD.scope, "the marketplace list could not be read, so update offers no plugin update from it."]
]);

// scripts/inventory/inventory.ts
import fs11 from "node:fs";
import path14 from "node:path";

// scripts/catalog/catalog.ts
import fs4 from "node:fs";
import path4 from "node:path";

// scripts/core/plugin-root.ts
import fs3 from "node:fs";
import path3 from "node:path";
import { fileURLToPath } from "node:url";
function findPluginRoot(start) {
  let dir = start;
  for (; ; ) {
    if (fs3.existsSync(path3.join(dir, PLUGIN_MANIFEST))) return dir;
    const parent = path3.dirname(dir);
    if (parent === dir) throw new Error(`alfred-tools: no ${PLUGIN_MANIFEST} above ${start}`);
    dir = parent;
  }
}
var root;
function pluginRoot() {
  return root ??= findPluginRoot(path3.dirname(fileURLToPath(import.meta.url)));
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
var CATALOG_DIR = path4.join(pluginRoot(), "catalog");
function readChecked(file, isDoc) {
  const value = JSON.parse(fs4.readFileSync(file, "utf8"));
  if (!isDoc(value)) throw new Error(`catalog: ${file} is not in the shape alfred-tools ships - reinstall the plugin`);
  return value;
}
function load(dir = CATALOG_DIR) {
  const tools = readChecked(path4.join(dir, "tools.json"), isToolsFile);
  const reserved = new Set(readChecked(path4.join(dir, "reserved-names.json"), isReservedFile).names);
  const byId = new Map(tools.tools.map((row) => [row.id, row]));
  return { ...tools, reserved, byId, fixes: readChecked(path4.join(dir, "fixes.json"), isFixesFile).fixes };
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
import fs5 from "node:fs";
import os2 from "node:os";
import path5 from "node:path";
import { spawnSync } from "node:child_process";
var homeDir = (env = process.env) => env.HOME || env.USERPROFILE || os2.homedir();
var configDir = (env = process.env) => env.CLAUDE_CONFIG_DIR ? path5.resolve(env.CLAUDE_CONFIG_DIR) : path5.join(homeDir(env), ".claude");
var accountFile = (env = process.env) => env.CLAUDE_CONFIG_DIR ? path5.join(path5.resolve(env.CLAUDE_CONFIG_DIR), ".claude.json") : path5.join(homeDir(env), ".claude.json");
function projectKey(dir) {
  try {
    return fs5.realpathSync.native(dir);
  } catch {
    return path5.resolve(dir);
  }
}
function localRoot(project) {
  if (fs5.existsSync(path5.join(project, ".git")) || !fs5.existsSync(project)) return project;
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: project, encoding: "utf8", windowsHide: true });
  return result.status === 0 && result.stdout.trim() ? path5.resolve(result.stdout.trim()) : project;
}
function readState(file, isDoc) {
  let text;
  try {
    text = fs5.readFileSync(file, "utf8");
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
  if (platform !== "win32") return [projectKey(project), path5.resolve(project)].find((key) => Boolean(projects[key]));
  let real = null;
  try {
    real = fs5.realpathSync.native(project);
  } catch {
  }
  const want = [path5.win32.resolve(project), real].filter((folder) => Boolean(folder)).map((folder) => folder.replace(/\\/g, "/"));
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
    const state = readState(path5.join(project, MCP_JSON), isAccountProject);
    return state.doc && state.doc.mcpServers ? state.doc.mcpServers[name] : void 0;
  }
  const account = readAccount(env, project);
  return (scope === "user" ? account.user : account.local)[name];
}

// scripts/core/claude-cli.ts
import { spawnSync as spawnSync2 } from "node:child_process";

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
  let result = spawnSync2("claude", args, options);
  if (process.platform === "win32" && result.error && ["ENOENT", "EINVAL"].includes(errorCode(result.error) ?? ""))
    result = spawnSync2(["claude", ...args.map(cmdArg)].join(" "), { ...options, shell: true });
  return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "", error: result.error || null, signal: result.signal };
}
var available = (options) => {
  const result = runClaude(["--version"], options);
  return !result.error && result.status === 0 ? result.stdout.trim() : null;
};

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

// scripts/roots/roots.ts
import fs6 from "node:fs";
import path10 from "node:path";

// scripts/entries/platform.ts
import path6 from "node:path";
var pathFor = (platform) => platform === "win32" ? path6.win32 : path6.posix;
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
import path9 from "node:path";

// scripts/keys/keys.ts
var import_mcp_headers = __toESM(require_mcp_headers(), 1);
import path8 from "node:path";

// scripts/entries/launcher.ts
import path7 from "node:path";

// scripts/entries/constants.ts
var RUN = { flag: "--run", end: "--", optional: "?" };
var RUN_RESERVED_ENV = /^PT_BRIDGE_/;
var RUN_PAIR = /^([A-Za-z_][A-Za-z0-9_]*)=([A-Za-z_][A-Za-z0-9_]*)(\?)?$/;

// scripts/entries/launcher.ts
var isNode = (command) => path7.basename(command.replace(/\\/g, "/")).replace(/\.exe$/i, "").toLowerCase() === "node";
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
var KEY_FILES = [path8.join(ROOT_NAME, ".secrets"), path8.join(FORMER_ROOT_NAME, ".secrets")];
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
  if (path9.basename(entry.command.replace(/\\/g, "/")).replace(/\.exe$/i, "").toLowerCase() !== "node") return null;
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

// scripts/roots/roots.ts
var helper = __toESM(require_mcp_headers(), 1);
var import_mcp_bridge2 = __toESM(require_mcp_bridge(), 1);
var ROOT_FILE_NAMES = [FILES.secrets, FILES.helper, FILES.bridge, FILES.list, FILES.record, FILES.serenaContext, ".secrets"];
var READ_GUARD = { signIns: `Read(//**/${FILES.signIns}/**)`, secrets: `Read(//**/${FILES.secrets})` };
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
  const file = path10.join(dataDir, FILES.map);
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
  if (path10.win32.isAbsolute(trimmed) && /^([A-Za-z]:|\\\\)/.test(trimmed)) return pathApi.normalize(trimmed);
  if (path10.posix.isAbsolute(trimmed)) return pathApi.normalize(trimmed);
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
  const exists = existsOf(context);
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
    if (parent && (known.includes(parent) || Object.values(FILES).some((fileName) => fileName !== FILES.map && exists(pathApi.join(parent, fileName))))) out.push(parent);
  }
  return [...new Set(out)];
}
function inUse(inventory, family, context) {
  const exists = existsOf(context);
  const map = inventory.roots && inventory.roots.map || emptyMap();
  const mapped = family === "global" ? map.global : Object.keys(map.projects || {}).length ? map.projects[mapKey(context.project)] : null;
  if (mapped && exists(mapped)) return { path: mapped, from: "map" };
  const [registrationRoot] = registrationRoots(inventory, family, context);
  if (registrationRoot) return { path: registrationRoot, from: "registration" };
  const pathApi = pathFor(context.platform);
  const held = standard(family, context).find((standardRoot) => exists(pathApi.join(standardRoot.root, FILES.secrets)));
  return held ? { path: held.root, from: "secrets" } : null;
}

// scripts/inventory/guards.ts
var isOptionalString2 = (value) => value === void 0 || typeof value === "string";
var isMcpJsonDoc = (value) => value["mcpServers"] === void 0 || isServerMap(value["mcpServers"]);
var isSettingsDoc = (value) => value["enabledPlugins"] === void 0 || isRecord(value["enabledPlugins"]);
var isPluginListRow = (value) => isRecord(value) && typeof value["id"] === "string" && typeof value["scope"] === "string" && typeof value["enabled"] === "boolean" && [value["version"], value["projectPath"], value["installPath"]].every(isOptionalString2) && (value["errors"] === void 0 || Array.isArray(value["errors"]));
var isMarketplaceListRow = (value) => isRecord(value) && typeof value["name"] === "string" && [value["repo"], value["url"], value["path"], value["installLocation"]].every(isOptionalString2);

// scripts/inventory/fingerprint.ts
import path11 from "node:path";
function launchTokens(entry) {
  const launch = launchOf(entry);
  const command = String(launch.command || "");
  const args = Array.isArray(launch.args) ? launch.args.map(String) : [];
  if (/^cmd(\.exe)?$/i.test(path11.basename(command))) {
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
  if (fingerprint.command) return path11.basename(command).replace(/\.(exe|cmd)$/i, "") === fingerprint.command;
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

// scripts/mcps-list/guards.ts
var isOptionalString3 = (value) => value === void 0 || isString(value);
var isStringOrNull = (value) => value === null || isString(value);
var isListServer = (value) => isRecord(value) && isString(value["name"]) && isString(value["scope"]) && isStringOrNull(value["row"]) && (value["route"] === void 0 || isStringOrNull(value["route"])) && isTextList(value["clients"]) && isServerEntry(value["entry"]) && isStringOrNull(value["key"]) && (value["cursorEntry"] === void 0 || isServerEntry(value["cursorEntry"]));
var isOwnEntry = (value) => isRecord(value) && ["name", "scope", "plugin", "server", "connector", "choice"].every((field) => isOptionalString3(value[field]));

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

// scripts/inventory/inventory.ts
var { readState: readState2 } = account_exports;
function matchEntry(entry, catalog) {
  const match = catalogMatch(entry, catalog);
  return match ? { rowId: match.rowId, route: match.route } : null;
}
var settingsOf = (scope, project, env) => path14.join(
  scope === "user" ? configDir(env) : path14.join(project, ".claude"),
  scope === "local" ? "settings.local.json" : "settings.json"
);
var realOf = (folderPath) => {
  try {
    return fs11.realpathSync.native(folderPath);
  } catch {
    return path14.resolve(folderPath);
  }
};
function ancestorMcpFiles(project) {
  const out = [];
  for (let dir = realOf(project), up = path14.dirname(dir); up !== dir; dir = up, up = path14.dirname(dir)) {
    const file = path14.join(up, MCP_JSON);
    if (fs11.existsSync(file)) out.push({ dir: up, file });
  }
  return out;
}
function hereSettings(projectDir) {
  const root2 = localRoot(projectDir);
  return [.../* @__PURE__ */ new Set([path14.join(root2, ".claude", "settings.local.json"), path14.join(projectDir, ".claude", "settings.local.json"), path14.join(projectDir, ".claude", "settings.json")])];
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
  const projectDir = path14.resolve(project);
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
  const mcpJsonState = readState2(path14.join(projectDir, MCP_JSON), isMcpJsonDoc);
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
function keptOf(inventory, catalog = load()) {
  const keep = (item) => ({ ...item, entry: maskCredentials(item.entry, item.rowId ? catalog.byId.get(item.rowId) : null) });
  return { ...inventory, registrations: inventory.registrations.map(keep), ...inventory.pluginServers ? { pluginServers: inventory.pluginServers.map(keep) } : {} };
}

// scripts/inventory/command.ts
function runInventoryCommand(argv) {
  blockingStdio();
  const flagValue2 = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : void 0;
  };
  const project = flagValue2("--project") || process.cwd();
  const named = flagValue2("--json");
  const outFile = named === void 0 ? void 0 : checkedTarget(named);
  if (outFile === null) {
    console.error(`alfred-tools: ${JSON_FILE_REFUSAL}`);
    return REFUSED_EXIT_CODE;
  }
  const inventory = buildInventory({ project, data: flagValue2("--data") || null });
  if (!inventory.cli || !inventory.cli.ok) {
    console.error("alfred-tools: the claude CLI is not on PATH - install Claude Code, then run this again.");
    return CLI_MISSING_EXIT_CODE;
  }
  if (outFile) writeJsonNoFollow(outFile, keptOf(inventory));
  else console.log(JSON.stringify(keptOf(inventory), null, 2));
  for (const unreadable of inventory.unreadable)
    console.error(`alfred-tools: ${unreadable.file} is ${unreadable.state}${unreadable.error ? ` (${unreadable.error})` : ""} - ${unreadable.scope === "inherited" ? "Claude Code skips that parent folder's servers too; nothing here writes to it." : LIST_UNREAD_NOTES.get(unreadable.scope) ?? `the ${unreadable.scope} scope is treated as unreadable and nothing will be written there.`}`);
  const own = inventory.registrations.filter((registration) => registration.own).length;
  console.log(`inventory: ${inventory.registrations.length} registrations (${inventory.registrations.length - own} match a catalog row, ${own} are your own), ${inventory.plugins.length} plugins${outFile ? ` -> ${outFile}` : ""}`);
  return 0;
}

// scripts/inventory.ts
process.exit(runInventoryCommand(process.argv.slice(2)));
