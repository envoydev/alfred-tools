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
    var fs6 = __require("node:fs");
    var os3 = __require("node:os");
    var path8 = __require("node:path");
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
        buf = fs6.readFileSync(file);
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
      const at = text.search(/[=:]/);
      if (at < 1) return null;
      const header = text.slice(0, at);
      const rest = text.slice(at + 1);
      if (!HEADER_RULE.test(header) || header.toLowerCase() === "authorization") return null;
      if (text[at] === "=") return NAME_RULE.test(rest) ? { header, var: rest } : null;
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
      const files = chainOf(__dirname, extraRoot ? path8.resolve(extraRoot) : null, home);
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
    var fs6 = __require("node:fs");
    var os3 = __require("node:os");
    var path8 = __require("node:path");
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
      const names = templateNames2(template);
      if (!names) return { error: USAGE };
      if (!originAllowed(partsOf(template).origin)) return { error: "the URL template is not https - mcp-remote takes http only on 127.0.0.1 or localhost" };
      const keyLike = names.find((n) => n.name === keyName || CREDENTIAL.test(n.name));
      if (keyLike) return { error: `${keyLike.name} in the URL template names a key - a key never goes in a URL` };
      const keyPair = pairs.find((p) => p.var === keyName);
      if (keyPair) return { error: `${keyPair.var} in a --header pair is the key's name - a key never goes in another header` };
      const h = helper2 || require_mcp_headers();
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
    function runLaunch(argv, env, { dir, platform, helper: helper2, exists } = {}) {
      const parsed = parseRun(argv);
      if (parsed.error) return parsed;
      const h = helper2 || require_mcp_headers();
      const files = runChain(dir, parsed.globalRoot ? path8.resolve(parsed.globalRoot) : null);
      const found = h.valueIn(parsed.keyName, files);
      if (!found && !parsed.optional) return { error: `no value for ${parsed.keyName} in ${files.join(", ")}`, code: EXIT.failed };
      const start = platform === "win32" ? winLaunch(parsed.command, parsed.args, env, exists || fs6.existsSync) : { command: parsed.command, args: parsed.args };
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

// scripts/catalog/catalog.ts
import fs2 from "node:fs";
import path2 from "node:path";

// scripts/core/plugin-root.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// scripts/core/constants.ts
var CLI_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
var FILES = { secrets: ".mcps-secrets", helper: "mcp-headers.js", record: "preferred-tools.json", map: "roots.json", bridge: "mcp-bridge.js", list: "mcps.json", signIns: "mcp-remote-v1", serenaContext: "serena-context.yml", macosExclude: "macos-mcp.toml" };
var ROOT_NAME = ".alfred-tools";
var FORMER_ROOT_NAME = ".preferred-tools";
var MCP_JSON = ".mcp.json";
var PLUGIN_MANIFEST = ".claude-plugin/plugin.json";

// scripts/core/plugin-root.ts
function findPluginRoot(start) {
  let dir = start;
  for (; ; ) {
    if (fs.existsSync(path.join(dir, PLUGIN_MANIFEST))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`alfred-tools: no ${PLUGIN_MANIFEST} above ${start}`);
    dir = parent;
  }
}
var root;
function pluginRoot() {
  return root ??= findPluginRoot(path.dirname(fileURLToPath(import.meta.url)));
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
var CATALOG_DIR = path2.join(pluginRoot(), "catalog");
function readChecked(file, isDoc) {
  const value = JSON.parse(fs2.readFileSync(file, "utf8"));
  if (!isDoc(value)) throw new Error(`catalog: ${file} is not in the shape alfred-tools ships - reinstall the plugin`);
  return value;
}
function load(dir = CATALOG_DIR) {
  const tools = readChecked(path2.join(dir, "tools.json"), isToolsFile);
  const reserved = new Set(readChecked(path2.join(dir, "reserved-names.json"), isReservedFile).names);
  const byId = new Map(tools.tools.map((row) => [row.id, row]));
  return { ...tools, reserved, byId, fixes: readChecked(path2.join(dir, "fixes.json"), isFixesFile).fixes };
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
import fs3 from "node:fs";
import os from "node:os";
import path3 from "node:path";
import { spawnSync } from "node:child_process";
var homeDir = (env = process.env) => env.HOME || env.USERPROFILE || os.homedir();
var configDir = (env = process.env) => env.CLAUDE_CONFIG_DIR ? path3.resolve(env.CLAUDE_CONFIG_DIR) : path3.join(homeDir(env), ".claude");
var accountFile = (env = process.env) => env.CLAUDE_CONFIG_DIR ? path3.join(path3.resolve(env.CLAUDE_CONFIG_DIR), ".claude.json") : path3.join(homeDir(env), ".claude.json");
function projectKey(dir) {
  try {
    return fs3.realpathSync.native(dir);
  } catch {
    return path3.resolve(dir);
  }
}
function localRoot(project) {
  if (fs3.existsSync(path3.join(project, ".git")) || !fs3.existsSync(project)) return project;
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: project, encoding: "utf8", windowsHide: true });
  return result.status === 0 && result.stdout.trim() ? path3.resolve(result.stdout.trim()) : project;
}
function readState(file, isDoc) {
  let text;
  try {
    text = fs3.readFileSync(file, "utf8");
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
  if (platform !== "win32") return [projectKey(project), path3.resolve(project)].find((key) => Boolean(projects[key]));
  let real = null;
  try {
    real = fs3.realpathSync.native(project);
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

// scripts/core/machine.ts
import fs4 from "node:fs";
import path4 from "node:path";
import { spawnSync as spawnSync2 } from "node:child_process";
function onPath(name, env, platform) {
  const key = Object.keys(env).find((variableName) => variableName.toUpperCase() === "PATH");
  const win = platform === "win32";
  const names = win ? [name, `${name}.exe`, `${name}.cmd`, `${name}.bat`] : [name];
  const pathApi = win ? path4.win32 : path4.posix;
  for (const dir of String(key && env[key] || "").split(win ? ";" : ":").filter(Boolean))
    for (const candidate of names) {
      const file = pathApi.join(dir, candidate);
      try {
        if (fs4.statSync(file).isFile()) return file;
      } catch {
      }
    }
  return null;
}
function realMachine({ env = process.env, platform = process.platform } = {}) {
  return {
    exists: (file) => fs4.existsSync(file),
    realpath: (file) => {
      try {
        return fs4.realpathSync(file);
      } catch {
        return null;
      }
    },
    which: (name) => onPath(name, env, platform),
    // npm and npx are .cmd shims on Windows; a shell is what runs them
    // `options.cwd` and `options.env` (merged over the machine's) are for the audit, which runs in a temp folder
    run: (cmd, args, options = {}) => spawnSync2(cmd, args, { encoding: "utf8", env: { ...env, ...options.env || {} }, cwd: options.cwd, shell: platform === "win32" && /^(npm|npx)$/.test(cmd), windowsHide: true }),
    nodeVersion: process.versions.node
  };
}

// scripts/prereq/prereq.ts
import fs5 from "node:fs";
import os2 from "node:os";
import path7 from "node:path";

// scripts/entries/platform.ts
import path5 from "node:path";
var pathFor = (platform) => platform === "win32" ? path5.win32 : path5.posix;

// scripts/keys/keys.ts
var import_mcp_headers = __toESM(require_mcp_headers(), 1);
import path6 from "node:path";
var KEY_FILES = [path6.join(ROOT_NAME, ".secrets"), path6.join(FORMER_ROOT_NAME, ".secrets")];
var SECRETS = FILES.secrets;

// scripts/entries/entry.ts
var import_mcp_bridge = __toESM(require_mcp_bridge(), 1);
var import_mcp_headers2 = __toESM(require_mcp_headers(), 1);

// scripts/roots/roots.ts
var helper = __toESM(require_mcp_headers(), 1);
var import_mcp_bridge2 = __toESM(require_mcp_bridge(), 1);
var ROOT_FILE_NAMES = [FILES.secrets, FILES.helper, FILES.bridge, FILES.list, FILES.record, FILES.serenaContext, ".secrets"];
var READ_GUARD = { signIns: `Read(//**/${FILES.signIns}/**)`, secrets: `Read(//**/${FILES.secrets})` };

// scripts/apply/serena-config.ts
var FOLDER_KEY = "project_serena_folder_location";
var FOLDER_LINE = new RegExp(`^${FOLDER_KEY}[ \\t]*:(.*?)(\\r?)$`);

// scripts/inventory/constants.ts
var MARKETPLACE_LIST_UNREAD = { scope: "marketplaces", file: "claude plugin marketplace list --json" };
var PLUGIN_LIST_UNREAD = { scope: "plugins", file: "claude plugin list --json" };
var LIST_UNREAD_NOTES = /* @__PURE__ */ new Map([
  [PLUGIN_LIST_UNREAD.scope, "the plugin list could not be read, so this run takes no plugin as installed."],
  [MARKETPLACE_LIST_UNREAD.scope, "the marketplace list could not be read, so update offers no plugin update from it."]
]);

// scripts/inventory/inventory.ts
var { readState: readState2 } = account_exports;

// scripts/fix/registration.ts
function androidSdk(context) {
  const { env, machine } = context;
  for (const sdkFolder of [env.ANDROID_HOME, env.ANDROID_SDK_ROOT]) if (sdkFolder && machine.exists(sdkFolder)) return sdkFolder;
  const pathApi = pathFor(context.platform);
  const defaults = context.platform === "darwin" ? [pathApi.join(context.home, "Library", "Android", "sdk")] : context.platform === "win32" ? [pathApi.join(env.LOCALAPPDATA || pathApi.join(context.home, "AppData", "Local"), "Android", "Sdk")] : [pathApi.join(context.home, "Android", "Sdk"), pathApi.join(context.home, "Android", "sdk")];
  return defaults.find((candidate) => machine.exists(candidate)) || null;
}
function javaHome(context) {
  const { env, machine } = context;
  if (env.JAVA_HOME && machine.exists(env.JAVA_HOME)) return env.JAVA_HOME;
  if (context.platform === "darwin") {
    const result = machine.run("/usr/libexec/java_home", []);
    if (result && result.status === 0 && String(result.stdout).trim()) return String(result.stdout).trim();
  }
  const java = machine.which("java");
  const real = java && machine.realpath(java);
  if (!real) return null;
  const pathApi = pathFor(context.platform);
  const home = pathApi.dirname(pathApi.dirname(real));
  return machine.exists(pathApi.join(home, "bin", context.platform === "win32" ? "java.exe" : "java")) ? home : null;
}

// scripts/plan/files/shapes.ts
function isAnswersFile(value) {
  const isPick = (pick) => pick === null || isRecord(pick) && [pick["row"], pick["route"]].every((field) => field === void 0 || typeof field === "string");
  const isPickMap = (map) => map === void 0 || isRecord(map) && Object.values(map).every(isPick);
  return isRecord(value) && isPickMap(value["picks"]) && isPickMap(value["change"]);
}

// scripts/prereq/constants.ts
var EXIT_CODE = { ok: 0, usage: 2 };
var AUDIT_DIR_PREFIX = "pt-audit-";

// scripts/prereq/prereq.ts
var versionOf = (text) => (/(\d+\.\d+(?:\.\d+)?)/.exec(String(text || "")) || [])[1] || null;
var CHECKS = {
  uvx: (context) => {
    const bin = context.machine.which("uvx");
    const version = bin && versionOf((context.machine.run("uvx", ["--version"]) || {}).stdout);
    return bin ? { ok: true, found: `uvx ${version || ""}`.trim() } : { ok: false, install: { url: "https://docs.astral.sh/uv/getting-started/installation/" } };
  },
  npx: (context) => {
    const bin = context.machine.which("npx");
    return bin ? { ok: true, found: `npx at ${bin}` } : { ok: false, install: { url: "https://nodejs.org/en/download" } };
  },
  "browser-chrome": (context) => browser(context, "chrome"),
  "browser-msedge": (context) => browser(context, "msedge"),
  "docker-or-github-binary": (context) => {
    if (context.machine.which("docker")) return { ok: true, found: "docker (the image route)", machine: { docker: true } };
    if (context.machine.which("github-mcp-server")) return { ok: true, found: "github-mcp-server binary (no Docker: the binary route)", machine: { docker: false } };
    return { ok: false, install: { url: "https://docs.docker.com/get-started/get-docker/", note: "or the vendor's github-mcp-server binary: https://github.com/github/github-mcp-server/releases" }, machine: { docker: true } };
  },
  "android-sdk": (context) => {
    const sdkFolder = androidSdk(context);
    return sdkFolder ? { ok: true, found: sdkFolder } : { ok: false, install: { url: "https://developer.android.com/studio", note: "Android Studio's SDK Manager, or the command-line tools" } };
  },
  jdk: (context) => {
    const home = javaHome(context);
    return home ? { ok: true, found: home } : { ok: false, install: { url: "https://adoptium.net/", note: "any JDK, for example Eclipse Temurin" } };
  }
};
function browser(context, which) {
  const { env, machine, platform } = context;
  const pathApi = pathFor(platform);
  const names = which === "chrome" ? { mac: "Google Chrome", bins: ["google-chrome", "google-chrome-stable"], win: { vendor: "Google", product: "Chrome", exe: "chrome.exe" } } : { mac: "Microsoft Edge", bins: ["microsoft-edge", "microsoft-edge-stable"], win: { vendor: "Microsoft", product: "Edge", exe: "msedge.exe" } };
  let found = null;
  if (platform === "darwin") found = [`/Applications/${names.mac}.app`, pathApi.join(context.home, "Applications", `${names.mac}.app`)].find((appFolder) => machine.exists(appFolder));
  else if (platform === "linux") {
    const binary = names.bins.map((binaryName) => machine.which(binaryName)).find(Boolean);
    found = binary || null;
  } else {
    const roots = [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA].filter((programRoot) => Boolean(programRoot));
    found = roots.map((programRoot) => pathApi.join(programRoot, names.win.vendor, names.win.product, "Application", names.win.exe)).find((appFolder) => machine.exists(appFolder));
  }
  const label = which === "chrome" ? "Google Chrome" : "Microsoft Edge";
  return found ? { ok: true, found } : { ok: false, install: { url: which === "chrome" ? "https://www.google.com/chrome/" : "https://www.microsoft.com/edge/download", note: `${label} is not installed; or name a browser binary at the browser ask` } };
}
function auditPrereqs(packageSpec, context) {
  const machine = context.machine;
  const dir = fs5.mkdtempSync(path7.join(os2.tmpdir(), AUDIT_DIR_PREFIX));
  const tail = (result) => String(result && (result.stderr || result.stdout) || "no output").trim().split("\n").slice(-2).join(" | ");
  try {
    fs5.writeFileSync(path7.join(dir, "package.json"), JSON.stringify({ name: "pt-audit", version: "1.0.0", private: true, dependencies: { [packageSpec.name]: packageSpec.version } }));
    const lock = machine.run("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-fund", "--no-audit"], { cwd: dir, env: { npm_config_before: packageSpec.cutoff } });
    if (!lock || lock.status !== 0) return { ok: false, note: `audit not run: npm install --package-lock-only failed: ${tail(lock)}` };
    const auditRun = machine.run("npm", ["audit", "--json"], { cwd: dir });
    const noResult = { ok: false, note: `audit not run: npm audit gave no result: ${tail(auditRun)}` };
    if (!auditRun) return noResult;
    let vulnerabilities;
    try {
      vulnerabilities = JSON.parse(auditRun.stdout).metadata.vulnerabilities;
    } catch {
      return noResult;
    }
    return { ok: true, counts: { critical: vulnerabilities.critical || 0, high: vulnerabilities.high || 0, moderate: vulnerabilities.moderate || 0, low: vulnerabilities.low || 0, total: vulnerabilities.total || 0 } };
  } finally {
    fs5.rmSync(dir, { recursive: true, force: true });
  }
}
function checkPrereqs(picks, context, catalog = load(), { withAudit = false } = {}) {
  const out = { tools: [], missing: 0, machine: {} };
  for (const { row: rowId, route } of picks) {
    const row = catalog.byId.get(rowId);
    if (!row) continue;
    const pickedRoute = route ? row.routes[route] : void 0;
    const ids = row.kind === "plugin" ? "prereqs" in row && isTextList(row.prereqs) ? row.prereqs : [] : pickedRoute && pickedRoute.prereqs || [];
    const needs = ids.map((id) => {
      const prereqCheck = CHECKS[id];
      if (!prereqCheck) throw new Error(`${rowId}: prerequisite '${id}' has no check in prereq.ts`);
      const result = prereqCheck(context);
      if (result.machine) Object.assign(out.machine, result.machine);
      return { id, ok: result.ok, found: result.found || null, install: result.install || null };
    });
    out.missing += needs.filter((need) => !need.ok).length;
    const tool = { row: rowId, route: row.kind === "plugin" ? null : route, needs };
    const routeDefinition = row.kind === "mcp" && pickedRoute || null;
    if (withAudit && routeDefinition && routeDefinition.audit && routeDefinition.package && routeDefinition.package.registry === "npm") tool.audit = { package: `${routeDefinition.package.name}@${routeDefinition.package.version}`, ...auditPrereqs(routeDefinition.package, context) };
    out.tools.push(tool);
  }
  return out;
}
function renderPrereqs(report) {
  const lines = [];
  for (const tool of report.tools) {
    if (tool.audit) lines.push(tool.audit.ok ? `${tool.row}: audit - ${tool.audit.package} has ${tool.audit.counts.total} known vulnerabilities in its dependency tree (${tool.audit.counts.critical} critical, ${tool.audit.counts.high} high, ${tool.audit.counts.moderate} moderate, ${tool.audit.counts.low} low)` : `${tool.row}: audit - ${tool.audit.note}`);
    if (!tool.needs.length) {
      lines.push(`${tool.row}${tool.route ? ` (${tool.route})` : ""}: nothing to check`);
      continue;
    }
    for (const need of tool.needs) {
      lines.push(`${tool.row}${tool.route ? ` (${tool.route})` : ""}: ${need.id} - ${need.ok ? `ok${need.found ? `, ${need.found}` : ""}` : `MISSING${need.found ? ` (${need.found})` : ""}`}`);
      if (!need.ok && need.install) {
        if (need.install.command) lines.push(`    install: ${need.install.command}`);
        if (need.install.url) lines.push(`    see: ${need.install.url}`);
        if (need.install.note) lines.push(`    ${need.install.note}`);
      }
    }
  }
  lines.push("", report.missing ? `prereq: ${report.missing} missing` : "prereq: all present");
  return lines.join("\n");
}
function picksFrom(argv, catalog) {
  const recommended = (id) => {
    const row = catalog.byId.get(id);
    return row ? row.recommendedRoute : void 0;
  };
  const rows = argv.indexOf("--rows");
  if (rows >= 0) return (argv[rows + 1] || "").split(",").filter(Boolean).map((id) => ({ row: id, route: recommended(id) }));
  const file = argv.find((argument) => !argument.startsWith("--"));
  if (!file) return null;
  const answers = parseJson(fs5.readFileSync(file, "utf8"));
  if (!isAnswersFile(answers)) throw new Error(`${file} is not an answers file - nothing checked`);
  const changed = Object.values(answers.change || {}).flatMap((change) => change && change.row && change.route ? [{ row: change.row, route: change.route }] : []);
  return Object.entries(answers.picks || {}).map(([id, pick]) => ({ row: id, route: pick && pick.route || recommended(id) })).concat(changed);
}

// scripts/prereq/command.ts
function runPrereqCommand(argv, { env = process.env, machine, platform = process.platform, out = (line) => process.stdout.write(`${line}
`) } = {}) {
  const catalog = load();
  let picks;
  try {
    picks = picksFrom(argv, catalog);
  } catch (caught) {
    out(`prereq: ${errorMessage(caught)}`);
    return EXIT_CODE.usage;
  }
  if (!picks) {
    out("usage: prereq.mjs <answers.json> | --rows id,id  [--json]");
    return EXIT_CODE.usage;
  }
  const unknown = picks.filter((pick) => !catalog.byId.has(pick.row));
  if (unknown.length) {
    out(`prereq: unknown tool ${unknown.map((unknownPick) => unknownPick.row).join(", ")}`);
    return EXIT_CODE.usage;
  }
  const context = { platform, env, home: homeDir(env), machine: machine || realMachine({ env, platform }) };
  const result = checkPrereqs(picks, context, catalog, { withAudit: argv.includes("--audit") });
  out(argv.includes("--json") ? JSON.stringify(result, null, 2) : renderPrereqs(result));
  return EXIT_CODE.ok;
}

// scripts/prereq.ts
blockingStdio();
process.exit(runPrereqCommand(process.argv.slice(2)));
