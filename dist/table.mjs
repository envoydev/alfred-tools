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
    var os2 = __require("node:os");
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
      const home = env.HOME || env.USERPROFILE || os2.homedir();
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
    var os2 = __require("node:os");
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
      const home = env.HOME || env.USERPROFILE || os2.homedir();
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

// scripts/inventory/table-command.ts
import fs5 from "node:fs";

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
var ALL_SCOPES = ["local", "project", "user"];
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

// scripts/inventory/inventory.ts
import fs4 from "node:fs";
import path7 from "node:path";

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

// scripts/keys/keys.ts
var import_mcp_headers = __toESM(require_mcp_headers(), 1);
import path5 from "node:path";

// scripts/entries/launcher.ts
import path4 from "node:path";

// scripts/entries/constants.ts
var RUN = { flag: "--run", end: "--", optional: "?" };
var RUN_RESERVED_ENV = /^PT_BRIDGE_/;
var RUN_PAIR = /^([A-Za-z_][A-Za-z0-9_]*)=([A-Za-z_][A-Za-z0-9_]*)(\?)?$/;

// scripts/entries/launcher.ts
var isNode = (command) => path4.basename(command.replace(/\\/g, "/")).replace(/\.exe$/i, "").toLowerCase() === "node";
var isBridgePath = (argument) => argument.replace(/\\/g, "/").split("/").pop() === FILES.bridge;
function launcherParts(entry) {
  if (!entry || typeof entry !== "object" || typeof entry.command !== "string" || !Array.isArray(entry.args) || !isNode(entry.command)) return null;
  const args = entry.args.map(String);
  const at = args.findIndex(isBridgePath);
  const bridgePath = args[at];
  if (at < 0 || bridgePath === void 0 || args[at + 1] !== RUN.flag) return null;
  const pair = RUN_PAIR.exec(args[at + 2] ?? "");
  const [, envVar, keyName, optional] = pair ?? [];
  if (envVar === void 0 || keyName === void 0 || RUN_RESERVED_ENV.test(envVar)) return null;
  const end = args.indexOf(RUN.end, at + 3);
  if (end < 0 || end > at + 4) return null;
  const command = args[end + 1];
  if (!command) return null;
  const globalRoot = end === at + 4 ? args[at + 3] || null : null;
  const inner = { command, args: args.slice(end + 2), ...entry.env ? { env: entry.env } : {} };
  return { path: bridgePath, envVar, keyName, optional: optional === RUN.optional, globalRoot, inner };
}
var launchOf = (entry) => launcherParts(entry)?.inner ?? entry;

// scripts/keys/keys.ts
var KEY_FILES = [path5.join(ROOT_NAME, ".secrets"), path5.join(FORMER_ROOT_NAME, ".secrets")];
var SECRETS = FILES.secrets;

// scripts/entries/entry.ts
var import_mcp_bridge = __toESM(require_mcp_bridge(), 1);
var import_mcp_headers2 = __toESM(require_mcp_headers(), 1);

// scripts/roots/roots.ts
var helper = __toESM(require_mcp_headers(), 1);
var import_mcp_bridge2 = __toESM(require_mcp_bridge(), 1);
var ROOT_FILE_NAMES = [FILES.secrets, FILES.helper, FILES.bridge, FILES.list, FILES.record, FILES.serenaContext, ".secrets"];
var READ_GUARD = { signIns: `Read(//**/${FILES.signIns}/**)`, secrets: `Read(//**/${FILES.secrets})` };

// scripts/inventory/constants.ts
var REFUSED_EXIT_CODE = 2;
var MARKETPLACE_LIST_UNREAD = { scope: "marketplaces", file: "claude plugin marketplace list --json" };
var PLUGIN_LIST_UNREAD = { scope: "plugins", file: "claude plugin list --json" };
var LIST_UNREAD_NOTES = /* @__PURE__ */ new Map([
  [PLUGIN_LIST_UNREAD.scope, "the plugin list could not be read, so this run takes no plugin as installed."],
  [MARKETPLACE_LIST_UNREAD.scope, "the marketplace list could not be read, so update offers no plugin update from it."]
]);

// scripts/inventory/fingerprint.ts
import path6 from "node:path";
function launchTokens(entry) {
  const launch = launchOf(entry);
  const command = String(launch.command || "");
  const args = Array.isArray(launch.args) ? launch.args.map(String) : [];
  if (/^cmd(\.exe)?$/i.test(path6.basename(command))) {
    const at = args.findIndex((argument) => /^\/c$/i.test(argument));
    if (at >= 0) return { command: args[at + 1] || "", args: args.slice(at + 2) };
  }
  return { command, args };
}
function bareName(token) {
  const lead = token.startsWith("@") ? "@" : "";
  const body = lead ? token.slice(1) : token;
  const cut = body.search(/[@=\[<>~!:]/);
  return lead + (cut >= 0 ? body.slice(0, cut) : body);
}
var launchArgs = (entry) => launchTokens(entry).args;
function pinnedVersion(entry, packageSpec) {
  for (const argument of launchArgs(entry).filter((token) => !token.startsWith("-"))) {
    if (bareName(argument) !== packageSpec) continue;
    const [, version] = /(?:==|@)([^@=\s]+)$/.exec(argument.slice(packageSpec.length)) ?? [];
    return version ?? null;
  }
  return null;
}

// scripts/inventory/inventory.ts
var { readState: readState2 } = account_exports;
var realOf = (folderPath) => {
  try {
    return fs4.realpathSync.native(folderPath);
  } catch {
    return path7.resolve(folderPath);
  }
};
var fromHere = (inventory, dir) => path7.relative(realOf(inventory.project), dir).split(path7.sep).join("/") || ".";

// scripts/inventory/table.ts
function pinOf(row, routeId, entry) {
  const routeDefinition = routeId === null ? void 0 : (row.routes || {})[routeId];
  if (!routeDefinition) return null;
  if (routeDefinition.runtime === "docker") {
    const imageName = routeDefinition.image?.name;
    const image = imageName === void 0 ? void 0 : launchArgs(entry).find((argument) => argument.startsWith(imageName));
    return image && image.includes(":") ? image.slice(image.lastIndexOf(":") + 1) : null;
  }
  return routeDefinition.package ? pinnedVersion(entry, routeDefinition.package.name) : null;
}
var cellOf = (items) => items.length ? items.join("; ") : "-";
var isInventoryFile = (value) => typeof value === "object" && value !== null && "os" in value && typeof value.os === "string" && "registrations" in value && Array.isArray(value.registrations);
function renderTable(inventory, catalog = load()) {
  const known = new Set(catalog.groups.map((group) => group.id));
  const ordered = [...catalog.groups.flatMap((group) => catalog.tools.filter((row) => row.group === group.id)), ...catalog.tools.filter((row) => !known.has(row.group))];
  const rows = ordered.filter((row) => row.os.includes(inventory.os));
  const body = rows.map((row, i) => {
    const cells = new Map(ALL_SCOPES.map((scope) => [scope, []]));
    for (const registration of inventory.registrations.filter((candidate) => candidate.rowId === row.id && !candidate.alfredRetired && candidate.scope !== "inherited")) {
      const pin = pinOf(row, registration.route, registration.entry);
      cells.get(registration.scope)?.push(`${registration.name} [${registration.route}${pin ? `, ${pin}` : ""}]`);
    }
    const group = catalog.groups.find((catalogGroup) => catalogGroup.id === row.group);
    if (!group) throw new Error(`catalog row ${row.id}: no group '${row.group}' in the catalog`);
    return [String(i + 1), group.label, row.label, row.kind, Object.keys(row.routes).join("/"), ...ALL_SCOPES.map((scope) => cellOf(cells.get(scope) ?? []))];
  });
  const head = ["#", "group", "tool", "kind", "routes", ...ALL_SCOPES];
  const widths = head.map((heading, column) => Math.max(heading.length, ...body.map((bodyRow) => (bodyRow[column] ?? "").length)));
  const line = (cols) => cols.map((value, column) => value.padEnd(widths[column] ?? 0)).join("  ").trimEnd();
  const out = [line(head), line(widths.map((width) => "-".repeat(width))), ...body.map(line)];
  const notes = [];
  const own = inventory.registrations.filter((registration) => registration.own && !registration.alfredRetired && !registration.retiredRow && registration.scope !== "inherited");
  if (own.length) notes.push(`Your own, not in this catalog and never touched: ${own.map((registration) => `${registration.name} (${registration.scope})`).join(", ")}.`);
  const inherited = inventory.registrations.filter((registration) => registration.scope === "inherited");
  const folderOf = (dir) => dir ? fromHere(inventory, dir) : "a parent folder";
  const usedBy = (shadow) => shadow.scope === "inherited" ? `the one in ${folderOf(shadow.from)} wins` : `the ${shadow.scope} one wins`;
  if (inherited.length) notes.push(`Inherited from a parent folder's .mcp.json - change them there: ${inherited.map((registration) => `${registration.name} (from ${folderOf(registration.from)}, ${registration.approval}${registration.shadowed ? `, not used here: ${usedBy(registration.shadowed)}` : ""})`).join(", ")}.`);
  const retired = inventory.registrations.filter((registration) => registration.alfredRetired && registration.scope !== "inherited");
  if (retired.length) notes.push(`Under names alfred-code once registered, left alone: ${retired.map((registration) => `${registration.name} (${registration.scope})`).join(", ")}.`);
  const dropped = inventory.registrations.filter((registration) => registration.retiredRow && registration.scope !== "inherited");
  const sinceOf = (id) => catalog.retired.find((retiredRow) => retiredRow.id === id)?.since ?? "?";
  if (dropped.length) notes.push(`Retired from the catalog: ${dropped.map((registration) => `${registration.name} (${registration.scope}, retired in ${sinceOf(registration.retiredRow)})`).join(", ")} - /alfred-tools:update and /alfred-tools:fix offer to remove a managed one.`);
  const other = catalog.tools.filter((row) => !row.os.includes(inventory.os));
  if (other.length) notes.push(`Not offered on this OS (${inventory.os}): ${other.map((row) => row.label).join(", ")}.`);
  for (const unreadable of inventory.unreadable || [])
    notes.push(`${unreadable.file} is ${unreadable.state}${unreadable.error ? ` (${unreadable.error})` : ""}: ${unreadable.scope === "inherited" ? "Claude Code skips that parent folder's servers; nothing here writes to it." : LIST_UNREAD_NOTES.get(unreadable.scope) ?? `the ${unreadable.scope} scope is unreadable here, and nothing will be written to it.`}`);
  return [...out, ...notes.length ? ["", ...notes] : []].join("\n");
}

// scripts/inventory/table-command.ts
function runTableCommand(argv, { out = (line) => process.stdout.write(`${line}
`) } = {}) {
  if (!argv[0]) {
    out("usage: table.ts <inventory.json>");
    return REFUSED_EXIT_CODE;
  }
  let parsed;
  try {
    parsed = JSON.parse(fs5.readFileSync(argv[0], "utf8"));
  } catch (caught) {
    out(`table: cannot read ${argv[0]}: ${errorMessage(caught)}`);
    return REFUSED_EXIT_CODE;
  }
  if (!isInventoryFile(parsed)) {
    out(`table: ${argv[0]} is not an inventory`);
    return REFUSED_EXIT_CODE;
  }
  out(renderTable(parsed));
  return 0;
}

// scripts/table.ts
blockingStdio();
process.exit(runTableCommand(process.argv.slice(2)));
