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
    var fs43 = __require("node:fs");
    var os3 = __require("node:os");
    var path40 = __require("node:path");
    var crypto3 = __require("node:crypto");
    var HELPER_VERSION5 = 6;
    var SECRETS2 = ".mcps-secrets";
    var NAME_RULE2 = /^[A-Za-z_][A-Za-z0-9_]*$/;
    var SCHEME_RULE = /^[!-~]+$/;
    var HEADER_RULE = /^[A-Za-z0-9_-]+$/;
    var FIXED_VALUE_RULE = /^[A-Za-z0-9_.,-]+$/;
    var USAGE = "mcp-headers: usage: node mcp-headers.js <NAME> <SCHEME> [<root>] [--header NAME=VAR | --header NAME:value]...";
    var LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;
    var COMMENT = /^\s*(?:[#;]|$)/;
    var unquote2 = (raw) => {
      const q = /^\s*(["'])(.*?)\1(?:\s+#.*)?\s*$/.exec(raw);
      return q ? q[2] : raw.replace(/\s+#.*$/, "").trim();
    };
    function readDotenv2(file) {
      let buf;
      try {
        buf = fs43.readFileSync(file);
      } catch {
        return null;
      }
      const text = buf[0] === 255 && buf[1] === 254 ? buf.subarray(2).toString("utf16le") : buf.toString("utf8").replace(/^﻿/, "");
      const values = {};
      for (const line of text.split(/\r?\n/)) {
        if (COMMENT.test(line)) continue;
        const m = LINE.exec(line);
        if (m) values[m[1]] = unquote2(m[2]);
      }
      return values;
    }
    function chainOf2(dir, extraRoot, home) {
      const dirs = [dir, extraRoot, path40.join(home, ".alfred-tools"), path40.join(home, ".alfred")].filter(Boolean);
      return [...new Set(dirs.map((d) => path40.join(d, SECRETS2)))];
    }
    var digestOf2 = (text) => crypto3.createHash("sha256").update(String(text).replace(/\r\n/g, "\n")).digest("hex");
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
      if (text[at2] === "=") return NAME_RULE2.test(rest) ? { header, var: rest } : null;
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
      if (!name || !NAME_RULE2.test(name) || !scheme || !SCHEME_RULE.test(scheme)) return { out: {}, note: USAGE };
      const parsed = parsePairs2(argv.slice(2));
      if ("error" in parsed) return { out: {}, note: parsed.error };
      const { root: extraRoot, pairs } = parsed;
      const home = env.HOME || env.USERPROFILE || os3.homedir();
      const files = chainOf2(__dirname, extraRoot ? path40.resolve(extraRoot) : null, home);
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
    module.exports = { HELPER_VERSION: HELPER_VERSION5, chainOf: chainOf2, digestOf: digestOf2, readDotenv: readDotenv2, valueIn: valueIn2, authValue, parsePairs: parsePairs2 };
  }
});

// scripts/copied/mcp-bridge.js
var require_mcp_bridge = __commonJS({
  "scripts/copied/mcp-bridge.js"(exports, module) {
    "use strict";
    var fs43 = __require("node:fs");
    var os3 = __require("node:os");
    var path40 = __require("node:path");
    var { spawn } = __require("node:child_process");
    var BRIDGE_VERSION5 = 4;
    var NEEDS_HELPER = 4;
    var CREDENTIAL = /TOKEN|SECRET|PASSWORD|KEY|AUTH/i;
    var NAME_RULE2 = /^[A-Za-z_][A-Za-z0-9_]*$/;
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
    function templateNames3(template) {
      const parts = partsOf(template);
      if (!parts) return null;
      const names2 = [];
      for (const [i, s] of parts.segments.entries()) {
        const m = PLACEHOLDER2.exec(s);
        if (!m) continue;
        if (!NAME_RULE2.test(m[1])) return null;
        if (m[2] && i !== parts.segments.length - 1) return null;
        if (names2.some((n) => n.name === m[1])) return null;
        names2.push({ name: m[1], optional: Boolean(m[2]) });
      }
      return names2;
    }
    function fillTemplate(template, values) {
      const parts = partsOf(template);
      if (!parts || !templateNames3(template)) return { error: USAGE };
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
      if (text[at2] === "=") return NAME_RULE2.test(rest) ? { header, var: rest } : null;
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
      if (!template || !keyName || !NAME_RULE2.test(keyName) || !scheme || !SCHEME_RULE.test(scheme) || !pkg || !PACKAGE_RULE.test(pkg)) return { error: USAGE };
      const parsed = parsePairs2(extra);
      if (!parsed) return { error: USAGE };
      const { root: globalRoot, pairs } = parsed;
      const names2 = templateNames3(template);
      if (!names2) return { error: USAGE };
      if (!originAllowed(partsOf(template).origin)) return { error: "the URL template is not https - mcp-remote takes http only on 127.0.0.1 or localhost" };
      const keyLike = names2.find((n) => n.name === keyName || CREDENTIAL.test(n.name));
      if (keyLike) return { error: `${keyLike.name} in the URL template names a key - a key never goes in a URL` };
      const keyPair = pairs.find((p) => p.var === keyName);
      if (keyPair) return { error: `${keyPair.var} in a --header pair is the key's name - a key never goes in another header` };
      const h = helper2 || require_mcp_headers();
      const home = env.HOME || env.USERPROFILE || os3.homedir();
      const files = h.chainOf(dir, globalRoot ? path40.resolve(globalRoot) : null, home);
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
      return [...new Set([dir, globalRoot].filter(Boolean).map((d) => path40.join(d, SECRETS2)))];
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
      const base = path40.win32.basename(command).toLowerCase();
      const direct = base === "cmd" || base === "cmd.exe" || /\.(exe|com)$/.test(base);
      const folders = String(env.PATH || env.Path || "").split(";").filter(Boolean);
      if (direct || folders.some((folder) => [".exe", ".com"].some((ext) => exists2(path40.win32.join(folder, command + ext))))) return { command, args };
      return { command: env.ComSpec || "cmd.exe", args: ["/d", "/c", command, ...args] };
    }
    function runLaunch(argv, env, { dir, platform, helper: helper2, exists: exists2 } = {}) {
      const parsed = parseRun(argv);
      if (parsed.error) return parsed;
      const h = helper2 || require_mcp_headers();
      const files = runChain(dir, parsed.globalRoot ? path40.resolve(parsed.globalRoot) : null);
      const found = h.valueIn(parsed.keyName, files);
      if (!found && !parsed.optional) return { error: `no value for ${parsed.keyName} in ${files.join(", ")}`, code: EXIT.failed };
      const start = platform === "win32" ? winLaunch(parsed.command, parsed.args, env, exists2 || fs43.existsSync) : { command: parsed.command, args: parsed.args };
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
        const options2 = { dir: __dirname, platform: process.platform, helper: helper2 };
        r = run ? runLaunch(argv.slice(1), process.env, options2) : launch(argv, process.env, options2);
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
    module.exports = { BRIDGE_VERSION: BRIDGE_VERSION5, NEEDS_HELPER, CREDENTIAL, RUN_FLAG, templateNames: templateNames3, fillTemplate, launch, runChain, parseRun, runLaunch };
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
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  return value;
}
var clone = (value) => JSON.parse(JSON.stringify(value));
var deepEqual = (left, right) => JSON.stringify(sortKeys(left)) === JSON.stringify(sortKeys(right));

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

// scripts/update/command.ts
import path39 from "node:path";

// scripts/inventory/inventory.ts
import fs11 from "node:fs";
import path15 from "node:path";

// scripts/catalog/catalog.ts
import fs2 from "node:fs";
import path2 from "node:path";

// scripts/core/plugin-root.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// scripts/core/constants.ts
var CMD_PROGRAM_PATTERN = /^cmd(\.exe)?$/i;
var CMD_RUN_FLAG_PATTERN = /^\/c$/i;
var CMD_META_PATTERN = /([()\][%!^"`<>&|;, *?])/g;
var CLI_TIMEOUT_MS = 12e4;
var CLI_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
var BRIDGE_WHY = "fills a hosted URL or starts a stdio server with its key from .mcps-secrets each time the server starts";
var FILES = { secrets: ".mcps-secrets", helper: "mcp-headers.js", record: "preferred-tools.json", map: "roots.json", bridge: "mcp-bridge.js", list: "mcps.json", signIns: "mcp-remote-v1", serenaContext: "serena-context.yml", macosExclude: "macos-mcp.toml" };
var ROOT_NAME = ".alfred-tools";
var FORMER_ROOT_NAME = ".preferred-tools";
var ALFRED_DATA = ".alfred";
var RECOMMENDED_SUFFIX = " (Recommended)";
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
  const options2 = { encoding: "utf8", cwd, env: env || process.env, input, timeout, windowsHide: true, maxBuffer: CLI_MAX_BUFFER_BYTES };
  let result = spawnSync2("claude", args, options2);
  if (process.platform === "win32" && result.error && ["ENOENT", "EINVAL"].includes(errorCode(result.error) ?? ""))
    result = spawnSync2(["claude", ...args.map(cmdArg)].join(" "), { ...options2, shell: true });
  return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "", error: result.error || null, signal: result.signal };
}
var available = (options2) => {
  const result = runClaude(["--version"], options2);
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
var childAt = (node, segment) => Array.isArray(node) ? node[Number(segment)] : isRecord(node) ? node[String(segment)] : void 0;
var valueAt = (node, path40) => path40.reduce(childAt, node);
function restore(entry, source, row) {
  const kept = maskCredentials(source || {}, row);
  const sourceArgs = source && Array.isArray(source.args) ? source.args : [];
  const used = /* @__PURE__ */ new Set();
  let error = null;
  const fill2 = (node, path40) => {
    if (typeof node === "string") {
      if (!node.includes(MARKER)) return node;
      if (path40.length === 2 && path40[0] === "args") {
        const j = (kept.args || []).findIndex((keptArg, i) => !used.has(i) && keptArg === node);
        if (j < 0) {
          error = error || `args[${path40[1]}] holds a kept value the registration no longer has`;
          return node;
        }
        used.add(j);
        return sourceArgs[j];
      }
      if (valueAt(kept, path40) !== node) {
        error = error || `${path40.join(".")} holds a kept value the registration no longer has`;
        return node;
      }
      return valueAt(source, path40);
    }
    fillChildren(node, path40);
    return node;
  };
  const fillChildren = (node, path40) => {
    if (Array.isArray(node)) node.forEach((item, i) => {
      node[i] = fill2(item, [...path40, i]);
    });
    else if (isRecord(node)) for (const [key, value] of Object.entries(node)) node[key] = fill2(value, [...path40, key]);
  };
  const out = structuredClone(entry);
  fillChildren(out, []);
  return error ? { error } : { entry: out };
}
var holdsKept = (node) => JSON.stringify(node === void 0 ? null : node).includes(MARKER);
function credentialPaths(entry, row) {
  const masked2 = maskCredentials(entry, row);
  const out = [];
  const walk = (node, kept, path40) => {
    if (typeof node === "string") {
      if (node !== kept || node.includes(MARKER)) out.push(path40.join("."));
      return;
    }
    if (node && typeof node === "object") for (const key of Object.keys(node)) walk(childAt(node, key), childAt(kept, key), [...path40, key]);
  };
  walk(entry, masked2, []);
  return out;
}
var looksLikeKey = (value) => new RegExp(SHAPE.source).test(String(value)) || new RegExp(PRIVATE_KEY_BLOCK.source).test(String(value));

// scripts/roots/roots.ts
import fs6 from "node:fs";
import path9 from "node:path";
import { spawnSync as spawnSync3 } from "node:child_process";

// scripts/core/replace-file.ts
import fs4 from "node:fs";
function replaceFile(file, text, mode) {
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs4.writeFileSync(temporary, text, mode === void 0 ? void 0 : { mode });
    if (mode !== void 0) fs4.chmodSync(temporary, mode);
    fs4.renameSync(temporary, file);
  } catch (error) {
    fs4.rmSync(temporary, { force: true });
    throw error;
  }
}

// scripts/entries/locations.ts
import fs5 from "node:fs";
import path5 from "node:path";

// scripts/entries/platform.ts
import path4 from "node:path";
var pathFor = (platform) => platform === "win32" ? path4.win32 : path4.posix;
var slashes = (pathText) => pathText.replace(/\\/g, "/");
var pathApiOf = (pathText) => /^(?:[A-Za-z]:[\\/]|\\\\)/.test(pathText) ? path4.win32 : path4.posix;
function isInside(pathApi, folder, file, { orSame }) {
  const relativePath = pathApi.relative(folder, file);
  if (relativePath === "") return orSame;
  return !relativePath.startsWith("..") && !pathApi.isAbsolute(relativePath);
}
function isWindowsArm({ platform, arch, env = {} }) {
  if (platform !== "win32") return false;
  if (arch === "arm64") return true;
  if (/^arm64$/i.test(env.PROCESSOR_ARCHITECTURE || "") || /^arm64$/i.test(env.PROCESSOR_ARCHITEW6432 || "")) return true;
  return /^arm/i.test(env.PROCESSOR_IDENTIFIER || "");
}
function pythonRequest(route, context, rules) {
  const python = route.python;
  if (python === void 0) throw new Error("a uvx route names the python minor it runs");
  if (!isWindowsArm(context)) return python;
  return rules.windowsArmPython.replace("{minor}", python);
}

// scripts/catalog/rows.ts
function routeNamed(row, routeId) {
  const route = row.routes[routeId];
  if (!route) throw new Error(`${row.id}: the catalog has no ${routeId} route`);
  return route;
}
function locationsOf(row) {
  if (!row.locations) throw new Error(`${row.id}: the catalog gives it no data folder`);
  return row.locations;
}
function routeField(value, rowId, field) {
  if (value === void 0) throw new Error(`${rowId}: its catalog route has no ${field}`);
  return value;
}

// scripts/entries/locations.ts
function parseRoot(text, _context) {
  const trimmed = String(text).trim();
  if (trimmed === "~" || /^~[\\/]/.test(trimmed)) return { kind: "home", rel: slashes(trimmed.slice(2)) };
  if (/^\$\{(HOME|USERPROFILE)\}[\\/]/.test(trimmed)) return { kind: "home", rel: slashes(trimmed.replace(/^\$\{[A-Z]+\}[\\/]/, "")) };
  if (path5.win32.isAbsolute(trimmed) || path5.posix.isAbsolute(trimmed)) return { kind: "abs", path: trimmed };
  return { kind: "project", rel: slashes(trimmed.replace(/^\.[\\/]/, "")) };
}
function logicalRoot(text, context) {
  const root2 = parseRoot(text, context);
  if (root2.kind !== "abs") return root2;
  const pathApi = pathFor(context.platform);
  if (isInside(pathApi, context.project, root2.path, { orSame: false })) return { kind: "project", rel: slashes(pathApi.relative(context.project, root2.path)) };
  if (isInside(pathApi, context.home, root2.path, { orSame: false })) return { kind: "home", rel: slashes(pathApi.relative(context.home, root2.path)) };
  return root2;
}
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
function formatRoot(root2, _scope, context) {
  const pathApi = pathFor(context.platform);
  if (root2.kind === "abs") return { value: pathApi.normalize(root2.path) };
  if (root2.kind === "home") return { value: pathApi.join(context.home, ...root2.rel.split("/")) };
  return { value: pathApi.resolve(context.project, ...root2.rel.split("/")) };
}
function withSub(rootStr, sub, _scope, context) {
  if (!sub) return rootStr;
  return pathFor(context.platform).join(rootStr, sub);
}
function serenaWindowsHome(context) {
  const profile = context.home || "";
  if (profile && !/\s/.test(profile)) return { root: { kind: "abs", path: path5.win32.join(profile, ".serena") } };
  return { needsInput: `the profile path ${profile || "(unknown)"} has a space, and serena's home must be space-free on Windows: type an absolute folder without spaces (for example C:\\serena-home)` };
}
function serenaSpaceFree(context) {
  const drive = context.env && context.env.SystemDrive || "";
  return { kind: "abs", path: `${/^[A-Za-z]:$/.test(drive) ? drive : "C:"}\\serena-home` };
}
function validWindowsSerenaHome(rootStr) {
  return path5.win32.isAbsolute(rootStr) && !/\s/.test(rootStr) && !rootStr.includes("/") && /^[A-Za-z]:\\/.test(rootStr);
}
function alfredSerenaHome(home) {
  return /(^|\/)\.alfred\/serena\/home$/.test(String(home || "").replace(/\\/g, "/").replace(/\/+$/, ""));
}
function defaultRoot(row, name, context) {
  const locations = locationsOf(row);
  if (locations.windowsAbsolute && context.platform === "win32") return serenaWindowsHome(context);
  const out = { root: otherPlace(row, name, locations.defaultSide, context) };
  const old = alfredRoot(row, context);
  if (old) out.alfred = old;
  return out;
}
function alfredRoot(row, context) {
  if (!row.locations || !row.locations.alfred) return null;
  const exists2 = context.exists || ((filePath) => fs5.existsSync(filePath));
  const old = parseRoot(row.locations.alfred, context);
  const absolutePath = old.kind === "abs" ? old.path : old.kind === "home" ? pathFor(context.platform).join(context.home, ...old.rel.split("/")) : pathFor(context.platform).resolve(context.project, ...old.rel.split("/"));
  return exists2(absolutePath) ? old : null;
}
var ALFRED_ENTRIES = ["docs", "state", "statistics", "workspace", "flow"];
function alfredData(context, enabled) {
  if (!enabled) return false;
  const exists2 = context.exists || ((filePath) => fs5.existsSync(filePath));
  return Boolean(exists2(pathFor(context.platform).join(context.project, ALFRED_DATA, ".gitignore")));
}
function alfredNameProblem(name, context) {
  if (ALFRED_ENTRIES.includes(String(name).toLowerCase())) return `'${name}' is one of alfred-code's own entries under .alfred (${ALFRED_ENTRIES.join(", ")}) - pick another name or folder`;
  const at2 = pathFor(context.platform).join(context.project, ALFRED_DATA, name);
  const exists2 = context.exists || ((filePath) => fs5.existsSync(filePath));
  if (!exists2(at2)) return null;
  const isDir3 = context.isDir || ((filePath) => {
    try {
      return fs5.statSync(filePath).isDirectory();
    } catch {
      return true;
    }
  });
  return isDir3(at2) ? null : `.alfred/${name} exists and is not a folder - pick another name or folder`;
}
function rootOf(family, context) {
  const pathApi = pathFor(context.platform);
  const roots = context.roots;
  const set = !roots ? void 0 : family === "global" ? roots.global : family === "project" ? roots.project : void 0;
  if (set) return set;
  return family === "global" ? pathApi.join(context.home, ROOT_NAME) : pathApi.join(context.project, ROOT_NAME);
}
var familyOf = (scope) => scope === "user" ? "global" : "project";
function recommendedSide(row, scope, context) {
  const side = scope === "user" ? "account" : "project";
  if (locationsOf(row).windowsAbsolute && context.platform === "win32") return validWindowsSerenaHome(rootOf(side === "account" ? "global" : "project", context)) ? side : "default";
  return side;
}
function otherPlace(_row, name, side, context = null) {
  if (context && context.platform && (context.roots || context.project)) return logicalRoot(pathFor(context.platform).join(rootOf(side === "account" ? "global" : "project", context), name), context);
  return side === "account" ? { kind: "home", rel: `${ROOT_NAME}/${name}` } : { kind: "project", rel: `${ROOT_NAME}/${name}` };
}
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
function applyRoot(entry, row, rootStr, scope, context) {
  const env = { ...entry.env || {} };
  const args = entry.args ? [...entry.args] : void 0;
  for (const derivedLocation of locationsOf(row).derived) {
    const value = withSub(rootStr, derivedLocation.sub, scope, context);
    if (derivedLocation.in === "env") env[derivedLocation.key] = value;
    else {
      if (!args) throw new Error(`${row.id}: ${derivedLocation.key} is an argument, and the entry has none`);
      const i = args.indexOf(derivedLocation.key);
      if (i >= 0) args[i + 1] = value;
      else args.push(derivedLocation.key, value);
    }
  }
  const out = { ...entry, env };
  if (args) out.args = args;
  if (!Object.keys(env).length) delete out.env;
  return out;
}

// scripts/entries/entry.ts
import path8 from "node:path";

// scripts/keys/keys.ts
var import_mcp_headers = __toESM(require_mcp_headers(), 1);
import path7 from "node:path";

// scripts/core/versions.ts
function compareVersions(left, right) {
  const parts = (version) => /^\d+(\.\d+)*$/.test(version) ? version.split(".").map(Number) : null;
  const [leftParts, rightParts] = [parts(left), parts(right)];
  if (!leftParts || !rightParts) return null;
  for (let i = 0; i < Math.max(leftParts.length, rightParts.length); i++) {
    const difference = (leftParts[i] || 0) - (rightParts[i] || 0);
    if (difference) return difference < 0 ? -1 : 1;
  }
  return 0;
}

// scripts/entries/launcher.ts
import path6 from "node:path";

// scripts/entries/constants.ts
var EXECUTABLE_PATH_FLAG = "--executable-path";
var API_KEY_FLAG = "--api-key";
var BRIDGE_SLOT = { path: 0, template: 1, keyName: 2, scheme: 3, packageSpec: 4, globalRoot: 5 };
var MACOS_USER_CONFIG = [".macos-mcp", "config.toml"];
var TRAILING_SEPARATORS = /[\\/]+$/;
var RUN = { flag: "--run", end: "--", optional: "?" };
var RUN_RESERVED_ENV = /^PT_BRIDGE_/;
var RUN_PAIR = /^([A-Za-z_][A-Za-z0-9_]*)=([A-Za-z_][A-Za-z0-9_]*)(\?)?$/;
var SCRIPT_FILE = /\.[cm]?js$/i;
var FOREIGN_HELPER_FILE = /^mcp-headers-.+\.[cm]?js$/i;

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
function relaunchedArgs(args, parts) {
  const at2 = args.findIndex(isBridgePath);
  if (at2 < 0) return [...args];
  const end = args.indexOf(RUN.end, at2 + 1);
  return [
    ...args.slice(0, at2),
    parts.path,
    RUN.flag,
    `${parts.envVar}=${parts.keyName}${parts.optional ? RUN.optional : ""}`,
    ...parts.globalRoot ? [parts.globalRoot] : [],
    RUN.end,
    ...args.slice(end + 1)
  ];
}
function withLaunch(entry, inner) {
  if (!launcherParts(entry)) return { ...entry, command: inner.command, args: inner.args };
  const args = entry.args ?? [];
  return { ...entry, args: [...args.slice(0, args.indexOf(RUN.end, args.findIndex(isBridgePath)) + 1), String(inner.command), ...inner.args ?? []] };
}
var unlaunched = (entry) => launchOf(entry);

// scripts/keys/keys.ts
var KEY_FILES = [path7.join(ROOT_NAME, ".secrets"), path7.join(FORMER_ROOT_NAME, ".secrets")];
var alfredStores = (project) => [".secrets", ".sensitive-data"].map((storeName) => path7.join(project, ALFRED_DATA, storeName));
var KEY_SHAPED = /(?:TOKEN|KEY|PAT)$/;
var nearMiss = (candidate, name, word) => candidate !== name && typeof word === "string" && word !== "" && candidate.toUpperCase().includes(word) && KEY_SHAPED.test(candidate.toUpperCase());
var offeredName = (candidate, name, word) => candidate === name || nearMiss(candidate, name, word);
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
  const add2 = (field) => {
    const key = field.at.join("\0");
    if (!seen.has(key)) {
      seen.add(key);
      out.push(field);
    }
  };
  const current = { ...route.env ? { env: route.env } : {}, ...route.optionalEnv ? { optionalEnv: route.optionalEnv } : {}, ...route.optionalArgs && route.optionalArgs.token ? { optionalArgs: { token: route.optionalArgs.token } } : {} };
  formFields(entry, current, ref).forEach(add2);
  const routeHeaders = "headers" in route && isRecord(route.headers) ? route.headers : void 0;
  for (const [fieldName, template] of Object.entries(routeHeaders || {}))
    if (typeof template === "string" && template.includes(ref) && entry.headers && Object.hasOwn(entry.headers, fieldName)) add2({ at: ["headers", fieldName], template });
  for (const form of route.formerly || []) formFields(entry, form, ref).forEach(add2);
  return out;
}
function withoutTokenFields(entry, route) {
  const fields = tokenFields(entry, route);
  if (!fields.length) return entry;
  const out = { ...entry };
  if (entry.args) out.args = [...entry.args];
  if (entry.env) out.env = { ...entry.env };
  if (entry.headers) out.headers = { ...entry.headers };
  const argsAt = fields.flatMap((field) => field.at[0] === "args" ? [field.at[1]] : []).sort((left, right) => right - left);
  for (const at2 of argsAt) if (out.args) out.args.splice(at2 - 1, 2);
  for (const field of fields) {
    const [where2, name] = field.at;
    if (where2 === "args") continue;
    const holder = out[where2];
    if (holder) delete holder[name];
  }
  return out;
}
function moveArgKeyToEnv(entry, route) {
  const names2 = Object.keys(route.optionalEnv && route.optionalEnv.token || {});
  const field = tokenFields(entry, route).find((candidate) => candidate.at[0] === "args");
  if (!field || field.at[0] !== "args" || !names2.length || !entry.args) return entry;
  const at2 = field.at[1];
  const value = entry.args[at2];
  if (value === void 0) return entry;
  const args = [...entry.args];
  args.splice(at2 - 1, 2);
  return { ...entry, args, env: { ...entry.env || {}, ...Object.fromEntries(names2.map((name) => [name, value])) } };
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
    const [where2, at2] = field.at;
    if (where2 === "args" && out.args) out.args[at2] = text;
    else if (where2 !== "args" && out[where2]) out[where2][at2] = text;
  }
  return out;
}
var SECRETS = FILES.secrets;
var NAME_RULE = /^[A-Za-z_][A-Za-z0-9_]*$/;
var pathApiOn = (platform) => platform ? pathFor(platform) : path7;
var secretsIn = (dir, platform) => pathApiOn(platform).join(dir, SECRETS);
var uniq = (list) => [...new Set(list)];
function hostedChain({ scope, projectRoot, globalRoot, globalNamed = false, home, platform }) {
  const pathApi = pathApiOn(platform);
  const beside = scope === "user" ? globalRoot : projectRoot;
  const named = scope === "local" && globalNamed ? globalRoot : null;
  return uniq([beside, named, pathApi.join(home, ROOT_NAME), pathApi.join(home, ALFRED_DATA)].filter((dir) => Boolean(dir)).map((dir) => secretsIn(dir, platform)));
}
function stdioChain({ scope, projectRoot, globalRoot, platform }) {
  if (scope === "local") return uniq([projectRoot, globalRoot].filter((dir) => Boolean(dir)).map((dir) => secretsIn(dir, platform)));
  if (scope === "user") return globalRoot ? [secretsIn(globalRoot, platform)] : [];
  return [];
}
function valueIn(files, name) {
  return (0, import_mcp_headers.valueIn)(name, files);
}
var namesIn = (file) => Object.keys((0, import_mcp_headers.readDotenv)(file) || {});
var filledNames = (files) => files.map((file) => ({ file, names: Object.entries((0, import_mcp_headers.readDotenv)(file) || {}).filter(([, value]) => value !== "").map(([name]) => name) }));
function oldFiles(project, home) {
  const stores = [];
  for (let dir = path7.resolve(project); ; dir = path7.dirname(dir)) {
    stores.push(...alfredStores(dir));
    if (path7.dirname(dir) === dir) break;
  }
  return uniq([...stores, ...KEY_FILES.map((file) => path7.join(project, file)), ...KEY_FILES.map((file) => path7.join(home, file))]);
}
function oldHolding(project, home, name) {
  return oldFiles(project, home).find((file) => Boolean(((0, import_mcp_headers.readDotenv)(file) || {})[name])) || null;
}
function nameOfValue(files, value) {
  if (typeof value !== "string" || value === "") return null;
  for (const file of files) {
    const hit = Object.entries((0, import_mcp_headers.readDotenv)(file) || {}).find(([, heldValue]) => heldValue === value);
    if (hit) return hit[0];
  }
  return null;
}
var credentialName = (name) => /TOKEN|SECRET|PASSWORD|KEY|AUTH/i.test(String(name));
function renameLauncherEnv(entry, parts, route, to) {
  for (const [name, since] of Object.entries(route.envSince ?? {})) {
    const order = compareVersions(to, since);
    const template = route.env ? route.env[name] : void 0;
    if (order === null || order < 0 || template === void 0 || parts.envVar === name) continue;
    const isFormer = (route.formerly || []).some((form) => Object.entries(form.env || {}).some(([formerName, formerTemplate]) => formerTemplate === template && formerName === parts.envVar));
    if (isFormer) return { ...entry, args: relaunchedArgs(entry.args ?? [], { ...parts, envVar: name }) };
  }
  return entry;
}
function renameSinceEnv(entry, route, to) {
  if (!route || !route.envSince || to === null) return entry;
  const parts = launcherParts(entry);
  if (parts) return renameLauncherEnv(entry, parts, route, to);
  if (!entry.env) return entry;
  let env = entry.env;
  for (const [name, since] of Object.entries(route.envSince)) {
    const order = compareVersions(to, since);
    const template = route.env ? route.env[name] : void 0;
    if (order === null || order < 0 || template === void 0 || Object.hasOwn(env, name)) continue;
    const held = env;
    const former = (route.formerly || []).flatMap((form) => Object.entries(form.env || {})).find(([formerName2, formerTemplate]) => formerTemplate === template && Object.hasOwn(held, formerName2));
    if (!former) continue;
    const [formerName] = former;
    env = Object.fromEntries(Object.entries(held).map(([key, value]) => key === formerName ? [name, value] : [key, value]));
  }
  return env === entry.env ? entry : { ...entry, env };
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
function signInFormOf(url, root2, catalog, context) {
  const packageSpec = mcpRemotePackage(catalog);
  const args = ["-y", `${packageSpec.name}@${packageSpec.version}`, url];
  const launch = context && context.platform === "win32" ? { command: "cmd", args: ["/c", "npx", ...args] } : { command: "npx", args };
  return { type: "stdio", ...launch, env: { npm_config_before: packageSpec.cutoff, MCP_REMOTE_CONFIG_DIR: root2 } };
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
var knownRootsOf = (context) => context.knownRoots ?? [rootOf("project", context), rootOf("global", context)];
var folderKey = (platform, folder) => {
  const text = pathFor(platform).normalize(folder).replace(TRAILING_SEPARATORS, "");
  return platform === "win32" ? text.toLowerCase() : text;
};
var excludePathFor = (excludeFile, scope, context) => pathFor(context.platform).join(rootOf(familyOf(scope), context), excludeFile.file);
function excludeArgAt(entry, excludeFile, context) {
  const args = entry && Array.isArray(entry.args) ? entry.args : [];
  if (!excludeFile) return -1;
  const at2 = args.indexOf(excludeFile.flag);
  const value = at2 >= 0 ? args[at2 + 1] : void 0;
  if (value === void 0) return -1;
  const pathApi = pathFor(context.platform);
  const folder = folderKey(context.platform, pathApi.dirname(value));
  return pathApi.basename(value) === excludeFile.file && knownRootsOf(context).some((root2) => folderKey(context.platform, root2) === folder) ? at2 + 1 : -1;
}
function hasForeignExclude(entry, excludeFile, context) {
  const args = entry && Array.isArray(entry.args) ? entry.args : [];
  if (args.some((argument) => typeof argument === "string" && argument.startsWith(`${excludeFile.flag}=`))) return true;
  return args.includes(excludeFile.flag) && excludeArgAt(entry, excludeFile, context) < 0;
}
function withExclude(entry, route, on, scope, context) {
  const excludeFile = route.excludeFile;
  if (!excludeFile || hasForeignExclude(entry, excludeFile, context)) return entry;
  const at2 = excludeArgAt(entry, excludeFile, context);
  const args = [...entry.args || []];
  if (at2 >= 0 && on) args[at2] = excludePathFor(excludeFile, scope, context);
  else if (at2 >= 0) args.splice(at2 - 1, 2);
  else if (on) args.push(excludeFile.flag, excludePathFor(excludeFile, scope, context));
  else return entry;
  return { ...entry, args };
}
var userConfigPath = (context) => pathFor(context.platform).join(context.home, ...MACOS_USER_CONFIG);
var excludeRecommended = (context) => !(context.exists ? context.exists(userConfigPath(context)) : false);
var excludeToml = (tools) => `[tools]
exclude = [${tools.map((tool) => JSON.stringify(tool)).join(", ")}]
`;

// scripts/entries/entry.ts
function currentOf(row, registration) {
  const entry = registration.entry;
  const args = entry.args || [];
  const flag = (flagName2) => {
    const i = args.indexOf(flagName2);
    return i >= 0 ? args[i + 1] : void 0;
  };
  const bridge = bridgeParts(entry);
  if (bridge) {
    const route2 = Object.values(row.routes).find((candidate) => candidate.runtime === "bridge");
    const held = (0, import_mcp_bridge.templateNames)(bridge.template) || [];
    const urlNames = Object.fromEntries((route2 && route2.urlVars || []).map((urlVar, i) => [urlVar.var, held[i]?.name ?? urlVar.var]));
    return { name: registration.name, scope: registration.scope, route: registration.route, entry, rootStr: null, executablePath: void 0, token: true, keyName: bridge.keyName, urlNames, host: null };
  }
  const launcher2 = launcherParts(entry);
  const route = registration.route ? row.routes[registration.route] : void 0;
  const signIn = entry.url ? null : signInParts(entry);
  return {
    name: registration.name,
    scope: registration.scope,
    route: registration.route,
    entry,
    rootStr: row.locations ? rootOfEntry(row, entry) : null,
    executablePath: flag(EXECUTABLE_PATH_FLAG),
    token: Boolean(launcher2 || entry.headersHelper || entry.headers && entry.headers["Authorization"] || args.includes(API_KEY_FLAG) || route?.authMode === "optional-token" && tokenFields(entry, route).length > 0),
    keyName: launcher2 ? launcher2.keyName : helperNameOf(entry.headersHelper),
    host: entry.url ? new URL(entry.url).hostname : signIn ? new URL(signIn.url).hostname : null
  };
}
function subst(text, values) {
  return String(text).replace(/\{(\w+)\}/g, (match, placeholder) => placeholder in values ? String(values[placeholder]) : match);
}
function mergeSettings(entry, route, pairs) {
  const out = structuredClone(entry);
  out.env = { ...out.env || {}, ...pairs };
  const args = out.args;
  const image = route.image;
  if (launchOf(out).command === "docker" && Array.isArray(args) && image) {
    const at2 = args.findIndex((argument) => typeof argument === "string" && argument.startsWith(`${image.name}:`));
    const passed = new Set(args.filter((_argument, i) => args[i - 1] === "-e"));
    const add2 = Object.keys(pairs).filter((variableName) => !passed.has(variableName)).flatMap((variableName) => ["-e", variableName]);
    if (at2 >= 0 && add2.length) args.splice(at2, 0, ...add2);
  }
  return out;
}
var PLAIN_ARG = /^[A-Za-z0-9_./:@+,=-]+$/;
function shellArg(text, style) {
  const normalized = style === "win32" ? text.replace(/\\/g, "/") : text;
  if (PLAIN_ARG.test(normalized)) return normalized;
  return style === "posix" ? `'${normalized.replace(/'/g, "'\\''")}'` : `"${normalized}"`;
}
function helperCommand({ helperPath, name, scheme, globalRoot = null, style = "portable", pairs = [] }) {
  return ["node", shellArg(helperPath, style), name, scheme, ...globalRoot ? [shellArg(globalRoot, style)] : [], ...pairs.flatMap((pair) => ["--header", shellArg(pair, style)])].join(" ");
}
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
function foreignScript(command) {
  const argv = helperArgv(command);
  const at2 = argv.findIndex((argument) => SCRIPT_FILE.test(argument));
  const file = argv[at2];
  return file === void 0 ? null : { file, first: argv[at2 + 1] };
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
  const read2 = "error" in parsed ? { root: args[2] !== void 0 && args[2] !== "--header" ? args[2] : null, pairs: [] } : { root: parsed.root, pairs: parsed.pairs.map(pairText) };
  return { path: helperPath, args, ...read2 };
}
function helperPathFor(scope, context) {
  return pathFor(context.platform).join(rootOf(familyOf(scope), context), FILES.helper);
}
var helperGlobalRoot = (scope, context) => scope === "local" && context.roots && context.roots.globalNamed ? context.roots.global : null;
function helperNameOf(command) {
  const [name, scheme] = helperParts(command)?.args ?? [];
  return name !== void 0 && scheme !== void 0 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && /^[A-Za-z][\w-]*$/.test(scheme) ? name : null;
}
function splitPair(text) {
  const at2 = text.search(/[=:]/);
  return at2 < 1 ? null : { header: text.slice(0, at2), kind: text[at2] === "=" ? "name" : "fixed", rest: text.slice(at2 + 1) };
}
function helperPairs(route, settings = {}, asRead = null) {
  const order = (route.settings || []).map((setting) => setting.header);
  const rank = (header) => {
    const i = order.indexOf(header);
    return i < 0 ? order.length : i;
  };
  const fixed = Object.entries(settings).sort(([first], [second]) => rank(first) - rank(second)).map(([header, value]) => `${header}:${value}`);
  if (asRead === null) return [...(route.helper && route.helper.headers || []).map((header) => `${header.header}=${header.var}`), ...fixed];
  const kept = asRead.flatMap((pair) => {
    const parts = splitPair(pair);
    return parts !== null && (parts.kind === "name" || !order.includes(parts.header)) ? [{ pair, kind: parts.kind }] : [];
  });
  return [...kept.filter((held) => held.kind === "name").map((held) => held.pair), ...kept.filter((held) => held.kind === "fixed").map((held) => held.pair), ...fixed];
}
function helperFor(route, scope, context, keyName = null, settings = {}, asRead = null) {
  const helper2 = route.helper;
  if (!helper2) throw new Error("a route with no helper block gets no helper command");
  return helperCommand({ helperPath: helperPathFor(scope, context), name: keyName || helper2.var, scheme: helper2.scheme, globalRoot: helperGlobalRoot(scope, context), style: context.platform === "win32" ? "win32" : "posix", pairs: helperPairs(route, settings, asRead) });
}
function bridgePathFor(scope, context) {
  return pathFor(context.platform).join(rootOf(familyOf(scope), context), FILES.bridge);
}
function launcherPlace(scope, context) {
  return { bridgePath: bridgePathFor(scope, context), globalRoot: scope === "local" ? context.roots?.global ?? null : null };
}
var bridgeFileOf = (entry) => bridgeParts(entry)?.path ?? launcherParts(entry)?.path ?? null;
function contextPathFor(scope, context, entry = null) {
  const pathApi = pathFor(context.platform);
  const home = entry && entry.env && entry.env.SERENA_HOME;
  if (home && !alfredSerenaHome(home)) return pathApi.join(home, FILES.serenaContext);
  return pathApi.join(rootOf(familyOf(scope), context), FILES.serenaContext);
}
function contextArgAt(entry) {
  const args = entry && Array.isArray(entry.args) ? entry.args : [];
  const i = args.indexOf("--context");
  return i >= 0 && i + 1 < args.length && /(^|[\\/])serena-context\.yml$/.test(String(args[i + 1])) ? i + 1 : -1;
}
function applyContext(entry, scope, context) {
  const at2 = contextArgAt(entry);
  if (at2 < 0 || !entry.args) return entry;
  const args = [...entry.args];
  args[at2] = contextPathFor(scope, context, entry);
  return { ...entry, args };
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
  const read2 = "error" in parsed ? { root: after[0] !== void 0 && after[0] !== "--header" ? after[0] : null, pairs: [] } : { root: parsed.root, pairs: parsed.pairs.map(pairText) };
  return { path: bridgePath, template, keyName, scheme, packageSpec, globalRoot: read2.root, pairs: read2.pairs };
}
function rebridgedArgs(args, at2, parts) {
  return [
    ...args.slice(0, at2),
    parts.path,
    parts.template,
    parts.keyName,
    ...args.slice(at2 + BRIDGE_SLOT.scheme, at2 + BRIDGE_SLOT.globalRoot),
    ...parts.globalRoot ? [parts.globalRoot] : [],
    ...args.slice(at2 + BRIDGE_SLOT.globalRoot + 1)
  ];
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
var renameTemplate = (template, names2) => template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)(\?)?\}/g, (_match, name, optional) => `{${names2[name] || name}${optional || ""}}`);
function buildEntry(row, routeId, answers, context, rules) {
  const route = routeNamed(row, routeId);
  if (routeId === "remote") {
    const entry2 = { type: route.type, url: subst(route.url, answers.params || {}) };
    const useKey = route.helper && (route.authMode === "token" || route.authMode === "optional-token" && answers.token);
    if (useKey) entry2.headersHelper = helperFor(route, answers.scope, context, answers.keyName, answers.settings);
    return entry2;
  }
  if (route.runtime === "bridge") {
    const packageSpec = routeField(route.package, row.id, "package");
    const helper2 = routeField(route.helper, row.id, "helper");
    const globalRoot = helperGlobalRoot(answers.scope, context);
    return {
      command: "node",
      args: [bridgePathFor(answers.scope, context), renameTemplate(routeField(route.url, row.id, "url"), answers.urlNames || {}), answers.keyName || helper2.var, helper2.scheme, `${packageSpec.name}@${packageSpec.version}`, ...globalRoot ? [globalRoot] : []],
      env: { npm_config_before: packageSpec.cutoff }
    };
  }
  let entry;
  const extra = [];
  const executablePath = answers.executablePath;
  for (const [key, spec] of Object.entries(route.optionalArgs || {})) {
    if (!spec) continue;
    if (key === "executablePath" && executablePath) extra.push(...spec.map((argTemplate) => subst(argTemplate, { value: executablePath })));
  }
  if (route.runtime === "uvx") {
    const packageSpec = routeField(route.package, row.id, "package");
    const args = ["--python", pythonRequest(route, context, rules), "--exclude-newer", packageSpec.cutoff];
    for (const withPackage of route.with || []) args.push("--with", withPackage);
    const runArgs = routeField(route.run, row.id, "run");
    const hasContext = runArgs.some((runArgument) => runArgument.includes("{contextFile}"));
    const run = hasContext ? runArgs.map((runArgument) => subst(runArgument, { contextFile: contextPathFor(answers.scope, context) })) : runArgs;
    args.push("--from", subst(packageSpec.fromSpec, { version: packageSpec.version }), ...run, ...extra);
    entry = { command: "uvx", args };
    if (Object.keys(route.env || {}).length) entry.env = { ...route.env };
  } else if (route.runtime === "npx") {
    const packageSpec = routeField(route.package, row.id, "package");
    const args = ["-y", `${packageSpec.name}@${packageSpec.version}`, ...routeField(route.run, row.id, "run"), ...extra];
    entry = context.platform === "win32" && rules.windowsNpxCmd ? { command: "cmd", args: ["/c", "npx", ...args] } : { command: "npx", args };
    entry.env = { ...route.env || {}, npm_config_before: packageSpec.cutoff };
  } else if (route.runtime === "docker") {
    const binary = context.machine && context.machine.docker === false ? route.fallback : void 0;
    if (binary) entry = { command: binary.command, args: [...binary.args] };
    else {
      const passEnv = Object.keys(route.env || {}).flatMap((variableName) => ["-e", variableName]);
      const image = routeField(route.image, row.id, "image");
      entry = { command: "docker", args: ["run", "-i", "--rm", ...passEnv, `${image.name}:${image.tag}`, ...routeField(route.run, row.id, "run")] };
    }
    if (Object.keys(route.env || {}).length) entry.env = { ...route.env };
  }
  if (!entry) throw new Error(`${row.id}: no registration form for the '${String(route.runtime)}' runtime`);
  if (answers.token && route.optionalEnv && route.optionalEnv.token) entry.env = { ...entry.env || {}, ...route.optionalEnv.token };
  if (answers.exclude) entry = withExclude(entry, route, true, answers.scope, context);
  if (row.locations && answers.rootStr !== void 0) entry = applyRoot(entry, row, answers.rootStr, answers.scope, context);
  return applyContext(entry, answers.scope, context);
}

// scripts/roots/roots.ts
var helper = __toESM(require_mcp_headers(), 1);
var import_mcp_bridge2 = __toESM(require_mcp_bridge(), 1);
var SIGN_IN_PROBE = "tokens";
var FORMER_DATA_PREFIX = "preferred-tools-";
var FAMILIES = ["project", "global"];
var ROOT_FILE_NAMES = [FILES.secrets, FILES.helper, FILES.bridge, FILES.list, FILES.record, FILES.serenaContext, ".secrets"];
function holdsRootFiles(dir) {
  let names2;
  try {
    names2 = fs6.readdirSync(dir);
  } catch {
    return false;
  }
  return names2.some((name) => ROOT_FILE_NAMES.includes(name));
}
function pendingMoves(context) {
  const pathApi = pathFor(context.platform);
  const bases = [];
  for (const [base, family] of [[context.project, "project"], [context.home, "global"]]) {
    const same2 = bases.find((candidate) => pathApi.resolve(candidate.base) === pathApi.resolve(base));
    if (same2) same2.families.push(family);
    else bases.push({ base, families: [family] });
  }
  const out = [];
  for (const { base, families } of bases) {
    const from = pathApi.join(base, FORMER_ROOT_NAME);
    const to = pathApi.join(base, ROOT_NAME);
    let stat;
    try {
      stat = fs6.lstatSync(from);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) {
      out.push({ families, from, to, state: "link" });
      continue;
    }
    if (!stat.isDirectory()) continue;
    let beside;
    try {
      beside = fs6.readdirSync(to);
    } catch {
      beside = null;
    }
    const state = !beside || !beside.length ? "move" : holdsRootFiles(from) ? "both" : "came-back";
    out.push({ families, from, to, state });
  }
  return out;
}
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
function writeMap(dataDir, map) {
  fs6.mkdirSync(dataDir, { recursive: true });
  replaceFile(path9.join(dataDir, FILES.map), `${JSON.stringify({ version: MAP_VERSION, global: map.global, projects: map.projects }, null, 2)}
`);
}
function dataSibling(dataDir) {
  if (!dataDir) return null;
  const base = path9.basename(dataDir);
  return /^alfred-tools-/.test(base) ? path9.join(path9.dirname(dataDir), base.replace(/^alfred-tools-/, FORMER_DATA_PREFIX)) : null;
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
function knownRoots(inventory, resolved, context) {
  const inUseOf = (family) => inventory.roots && Object.hasOwn(inventory.roots, family) ? inventory.roots[family] : inUse(inventory, family, context);
  const found = [...FAMILIES.map((family) => resolved && resolved[family]), ...FAMILIES.map((family) => inUseOf(family)?.path)];
  return [...new Set(found.filter((root2) => typeof root2 === "string" && root2 !== ""))];
}
var NAMED_GLOBAL_TAIL = "a project-scope helper does not read keys here - keep a key a committed server uses in the project's root";
function options(inventory, family, context) {
  const exists2 = existsOf(context);
  const [alfred, projectAlfredTools] = standard("project", context);
  const [homeAlfredTools, homeAlfred] = standard("global", context);
  const list = family === "global" ? [
    { ...homeAlfredTools, label: "~/.alfred-tools", description: `${homeAlfredTools.root} - one folder for every project on this machine` },
    ...exists2(homeAlfred.root) ? [{ ...homeAlfred, label: "~/.alfred", description: `${homeAlfred.root} - alfred-code's folder in your home, shared with it` }] : [],
    { id: "named", root: null, label: "A folder you name", description: `a folder of yours, asked next - ${NAMED_GLOBAL_TAIL}` }
  ] : [
    ...alfredData(context, inventory.alfredCodeEnabled) ? [{ ...alfred, label: ".alfred in this project", description: `${alfred.root} - kept out of git by alfred-code` }] : [],
    { ...projectAlfredTools, label: ".alfred-tools in this project", description: `${projectAlfredTools.root} - its own .gitignore keeps the keys, the record and the data out of git` },
    { id: "named", root: null, label: "A folder you name", description: "a folder of yours inside this project, asked next" }
  ];
  const used = inUse(inventory, family, context);
  if (!used) return list;
  const usedOption = list.find((option) => option.root === used.path);
  if (usedOption) return [usedOption, ...list.filter((option) => option !== usedOption)];
  const where2 = family === "global" ? "the keys and data for every project" : "this project's keys and data";
  const tail = family === "global" && !standard("global", context).some((standardRoot) => standardRoot.root === used.path) ? ` - ${NAMED_GLOBAL_TAIL}` : "";
  return [{ id: "in-use", root: used.path, label: "The folder in use", description: `${used.path} - where ${where2} are now${tail}` }, ...list].slice(0, 4);
}
function resolveNamed(family, text, context) {
  const pathApi = pathFor(context.platform);
  const trimmed = String(text == null ? "" : text).trim();
  if (!trimmed) return { error: `the ${family} root needs a folder name` };
  if (family === "global") {
    if (trimmed === "~" || /^~[\\/]/.test(trimmed)) return { root: pathApi.join(context.home, trimmed.slice(1)).replace(/[\\/]+$/, "") || pathApi.sep };
    if (pathApi.isAbsolute(trimmed)) return { root: pathApi.normalize(trimmed).replace(/(.)[\\/]+$/, "$1") };
    return { error: `the global root '${trimmed}' must be an absolute folder or one under ~` };
  }
  if (trimmed.startsWith("~") || path9.posix.isAbsolute(trimmed) || path9.win32.isAbsolute(trimmed))
    return { error: `the project root '${trimmed}' must lie inside the project - name a folder relative to it, not an absolute path` };
  const parts = trimmed.split(/[\\/]+/).filter((part) => part && part !== ".");
  if (parts.includes("..")) return { error: `the project root '${trimmed}' must lie inside the project - no '..'` };
  if (!parts.length) return { error: `the project root '${trimmed}' must lie inside the project, not be the project itself` };
  const [first = ""] = parts;
  if ([".git", ".claude"].includes(first.toLowerCase())) return { error: `the project root '${trimmed}' cannot be under ${first} - .git and .claude are not roots` };
  return { root: pathApi.join(context.project, ...parts) };
}
function resolveRoots(inventory, answers, context) {
  const out = {};
  const errors = [];
  for (const family of FAMILIES) {
    const answer = answers && answers[family] || null;
    const rootOptions = options(inventory, family, context);
    const [recommended] = rootOptions;
    if (!answer || !answer.id) {
      out[family] = recommended ? recommended.root : null;
      continue;
    }
    if (answer.id === "named") {
      const named = resolveNamed(family, answer.path, context);
      if (named.error) errors.push(`roots: ${named.error}`);
      out[family] = named.root || null;
      continue;
    }
    const option = rootOptions.find((candidate) => candidate.id === answer.id && candidate.root);
    if (!option) {
      errors.push(`roots: '${answer.id}' is not a ${family} root offered here (${rootOptions.filter((candidate) => candidate.root).map((candidate) => candidate.id).join(", ")}, or named with a path)`);
      out[family] = null;
      continue;
    }
    out[family] = option.root;
  }
  out.globalNamed = Boolean(out.global) && !standard("global", context).some((standardRoot) => standardRoot.root === out.global);
  return { roots: out, errors };
}
function recordKey(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (typeof entry.name === "string" && typeof entry.scope === "string") return `mcp:${entry.name}~${entry.scope}`;
  if (typeof entry.plugin === "string" && typeof entry.server === "string") return `plugin-mcp:${entry.plugin}/${entry.server}`;
  if (typeof entry.connector === "string") return `connector:${entry.connector}`;
  return null;
}
var recordFamily = (entry) => typeof entry.connector === "string" || entry.scope === "user" ? "global" : "project";
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
function ignoreGap(root2, family, { writes = [] } = {}) {
  const secrets = path9.join(root2, FILES.secrets);
  const ignored = gitIgnores(secrets);
  if (ignored === false) return { reason: `git would commit ${secrets}`, secrets: true };
  if (ignored === null) return null;
  const signIns = gitIgnores(path9.join(root2, FILES.signIns, SIGN_IN_PROBE)) === false;
  const file = path9.join(root2, FILES.helper);
  const projectRoot = family === "project" && path9.basename(root2) !== ALFRED_DATA;
  const unignore = projectRoot ? [FILES.bridge, FILES.serenaContext, FILES.macosExclude].filter((fileName) => (writes.includes(fileName) || fs6.existsSync(path9.join(root2, fileName))) && gitIgnores(path9.join(root2, fileName)) === true) : [];
  const extra = { ...signIns ? { signIns: true } : {}, ...unignore.length ? { unignore } : {} };
  if (projectRoot && gitIgnores(file) === true)
    return { reason: `git ignores ${file}, which a project-scope server needs committed`, helper: true, excluded: gitIgnores(root2) === true, ...extra };
  const why = [signIns && `git would commit ${path9.join(root2, FILES.signIns)}/`, unignore.length && `git ignores ${unignore.map((fileName) => path9.join(root2, fileName)).join(" and ")}, which a committed entry names`].filter(Boolean);
  return why.length ? { reason: why.join("; "), ...extra, ...unignore.length ? { excluded: gitIgnores(root2) === true } : {} } : null;
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
var helperState = (file, exists2) => shippedState("helper", file, exists2);

// scripts/inventory/constants.ts
var INVENTORY_VERSION = 1;
var ALFRED_CODE_PLUGIN = "alfred-code";
var WINDOWS_MCP_MARKETPLACE = "envoydev";
var MARKETPLACE_LIST_UNREAD = { scope: "marketplaces", file: "claude plugin marketplace list --json" };
var PLUGIN_LIST_UNREAD = { scope: "plugins", file: "claude plugin list --json" };
var LIST_UNREAD_NOTES = /* @__PURE__ */ new Map([
  [PLUGIN_LIST_UNREAD.scope, "the plugin list could not be read, so this run takes no plugin as installed."],
  [MARKETPLACE_LIST_UNREAD.scope, "the marketplace list could not be read, so update offers no plugin update from it."]
]);
var INHERITED_OWN_SCOPE = "project";

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
var launcher = (entry) => path10.basename(launchTokens(entry).command).replace(/\.(exe|cmd)$/i, "");
var launchArgs = (entry) => launchTokens(entry).args;
function pinnedVersion(entry, packageSpec) {
  for (const argument of launchArgs(entry).filter((token) => !token.startsWith("-"))) {
    if (bareName(argument) !== packageSpec) continue;
    const [, version] = /(?:==|@)([^@=\s]+)$/.exec(argument.slice(packageSpec.length)) ?? [];
    return version ?? null;
  }
  return null;
}
var isManaged = (registration) => !registration.own && !registration.alfredRetired && registration.choice !== "own";

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
function writeList(file, doc, read2) {
  if (read2 && (read2.state === "newer" || read2.state === "unreadable"))
    return { ok: true, detail: `${read2.note.replace(/ - read as empty$/, "")} - left as it is; ${read2.state === "newer" ? "update alfred-tools" : "check its permissions"}, then run the command again` };
  const servers = doc.servers || [];
  const own = doc.own || [];
  if (!servers.length && !own.length) {
    if (!read2) return { ok: true, detail: `${file}: no server is listed - nothing to write` };
    if (read2.state) return { ok: true, detail: `${read2.note.replace(/ - read as empty$/, "")} - not this plugin's list, left as it is` };
    fs7.rmSync(file, { force: true });
    return { ok: true, detail: `removed ${file} - no server is listed` };
  }
  const out = { version: LIST_VERSION, servers, own };
  if (doc.cursorOffer === "declined") out.cursorOffer = "declined";
  if (read2 && !read2.state && deepEqual(out, { version: read2.version, servers: read2.servers, own: read2.own, ...read2.cursorOffer ? { cursorOffer: read2.cursorOffer } : {} }))
    return { ok: true, detail: `${file} already holds these servers - left as it is` };
  fs7.mkdirSync(path11.dirname(file), { recursive: true });
  let backup = null;
  if (read2 && read2.state === "bad" && fs7.existsSync(file)) {
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
var HOSTED_ROWS = ["context7", "github", "gitlab", "atlassian", "sentry"];
var CHOICES = { mcp: ["own", "manage"], plugin: ["own", "add"], connector: ["own", "add"] };
function matchConnector(name) {
  const normalizedName = String(name == null ? "" : name).toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalizedName ? HOSTED_ROWS.find((id) => normalizedName.startsWith(id)) || null : null;
}
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
function inheritedLeftOwn(inventory, registration, machine) {
  if (!registration.from) return false;
  const fingerprint = fingerprintOf(registration.entry, machine.catalog);
  for (const file of listFiles({ roots: inventory.roots, registrations: [] }, "project", { ...machine, project: registration.from })) {
    const list = readList(file);
    if (list) return list.own.some((ownEntry) => ownEntry.name === registration.name && ownEntry.scope === INHERITED_OWN_SCOPE && ownEntry.choice === "own" && ownEntry.fingerprint === fingerprint);
  }
  return false;
}
var labelOf = (catalog, rowId) => {
  const row = rowId === null ? void 0 : catalog.byId.get(rowId);
  return row ? row.label : rowId;
};
var pluginServerKey = (server) => `plugin-mcp:${server.plugin}/${server.server}`;
var regItem = (registration, catalog) => ({
  key: serverKey(registration),
  kind: "mcp",
  rowId: registration.rowId,
  label: labelOf(catalog, registration.rowId),
  family: familyOf(registration.scope),
  fingerprint: fingerprintOf(registration.entry, catalog),
  choice: registration.choice || null,
  name: registration.name,
  scope: registration.scope
});
var pluginItem = (server, catalog) => ({
  key: pluginServerKey(server),
  kind: "plugin",
  rowId: server.rowId,
  label: labelOf(catalog, server.rowId),
  family: "project",
  fingerprint: fingerprintOf(server.entry, catalog),
  choice: server.choice || null,
  plugin: server.plugin,
  server: server.server
});
function connectorItem(name, inventory, catalog) {
  const rowId = matchConnector(name);
  if (!rowId) return null;
  const recorded = (inventory.lists && inventory.lists.global && inventory.lists.global.own || []).find((ownEntry) => ownEntry.connector === name);
  return { key: `connector:${name}`, kind: "connector", rowId, label: labelOf(catalog, rowId), family: "global", fingerprint: null, choice: recorded && recorded.choice || null, connector: name };
}
var asked = (registration) => registration.rowId && !registration.alfredRetired && ALL_SCOPES.includes(registration.scope);
function itemOf(inventory, key, catalog) {
  const registrationKey = /^mcp:(.+)~(project|local|user)$/.exec(key);
  if (registrationKey) {
    const [, name, scope] = registrationKey;
    const registration = (inventory.registrations || []).find((candidate) => candidate.name === name && candidate.scope === scope && asked(candidate));
    return registration ? regItem(registration, catalog) : null;
  }
  const pluginKey = /^plugin-mcp:([^/]+)\/(.+)$/.exec(key);
  if (pluginKey) {
    const [, plugin, serverName] = pluginKey;
    const server = (inventory.pluginServers || []).find((candidate) => candidate.plugin === plugin && candidate.server === serverName && candidate.rowId);
    return server ? pluginItem(server, catalog) : null;
  }
  const connectorName = /^connector:(.+)$/.exec(key)?.[1];
  return connectorName === void 0 ? null : connectorItem(connectorName, inventory, catalog);
}
function recordEntry(item, choice) {
  if (item.kind === "mcp") return { name: item.name, scope: item.scope, fingerprint: item.fingerprint, choice };
  if (item.kind === "plugin") return { plugin: item.plugin, server: item.server, fingerprint: item.fingerprint, choice };
  return { connector: item.connector, choice };
}
function liveOf(inventory, catalog, connectors = null) {
  const servers = {};
  for (const registration of (inventory.registrations || []).filter(asked)) servers[serverKey(registration)] = fingerprintOf(registration.entry, catalog);
  for (const server of (inventory.pluginServers || []).filter((candidate) => candidate.rowId)) servers[pluginServerKey(server)] = fingerprintOf(server.entry, catalog);
  return { servers, connectors: Array.isArray(connectors) ? connectors : null };
}
var twoServers = (label, owner) => `two servers of ${label} then run - ${owner}'s and this one`;

// scripts/roots/workspace.ts
import fs9 from "node:fs";
import path13 from "node:path";
import { spawnSync as spawnSync4 } from "node:child_process";
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
function membersBelow(workspace, folder) {
  const base = path13.resolve(folder);
  return workspace.members.filter((member) => inside(member, base)).map((member) => {
    const above = [];
    for (let dir = path13.dirname(member); ; dir = path13.dirname(dir)) {
      if (dir === workspace.root || workspace.members.includes(dir)) above.push(dir);
      if (dir === workspace.root || path13.dirname(dir) === dir) break;
    }
    return { folder: member, ancestors: above };
  });
}
function gitTop(dir) {
  const result = spawnSync4("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) return null;
  try {
    return fs9.realpathSync(result.stdout.trim());
  } catch {
    return null;
  }
}

// scripts/cursor/cursor-mcp.ts
import fs10 from "node:fs";
import path14 from "node:path";

// scripts/cursor/constants.ts
var CURSOR_FOLDER = ".cursor";
var CURSOR_FILE = "mcp.json";
var CURSOR_COMMANDS = ["cursor-agent", "cursor"];
var WINDOWS_COMMAND_EXTENSIONS = [".exe", ".cmd", ""];

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
function refusal(read2) {
  if (read2.state === "symlink") return "is a symbolic link - alfred-tools writes no file through a link; replace it with the file itself";
  if (read2.state === "bad") return read2.error ? `cannot be read (${read2.error})` : "is not JSON (Cursor reads comments and trailing commas, alfred-tools does not) - remove them, then run the command again";
  if (read2.state === "shape") return "has no mcpServers object - not a file alfred-tools recognises";
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
  const read2 = readCursor(step.file);
  const why = refusal(read2);
  if (why) return { ok: false, detail: `${step.file} ${why} - left as it is` };
  const sources = (step.lists || []).map((list) => ({ file: list.file, scopes: list.scopes, servers: (list.file && readList(list.file) || { servers: [] }).servers }));
  const managed2 = managedSet(sources);
  const servers = read2.doc ? read2.doc.mcpServers : {};
  const misshapen = [...managed2.keys()].filter((name) => Object.hasOwn(servers, name) && !isServerEntry(servers[name]));
  if (misshapen.length) return { ok: false, detail: `${step.file}: ${misshapen.join(", ")} ${misshapen.length > 1 ? "are" : "is"} not in the shape Cursor reads (a string command or url, args a list of strings, env and headers maps of strings) - correct or remove ${misshapen.length > 1 ? "them" : "it"} there; left as it is` };
  const notes = fillStdioKeys(managed2, context);
  const before = step.before || [];
  const theirs = [...managed2.keys()].filter((name) => Object.hasOwn(servers, name) && !before.includes(name) && !(step.replace || []).includes(name));
  const only = step.only;
  const others = only ? [...managed2.keys()].filter((name) => !only.includes(name)) : [];
  const skip = [.../* @__PURE__ */ new Set([...step.skip || [], ...theirs, ...others])];
  const order = context && context.catalog && context.catalog.order || [];
  const doc = compose(read2.doc, managed2, { before, skip, order });
  const text = textOf(doc, read2.lineEnd);
  const said = notes.length ? `; ${notes.join("; ")}` : "";
  if (read2.state === "ok" && read2.text === text) return { ok: true, detail: `${step.file} already holds these servers - left as it is${said}` };
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
function matchesRow(entry, row) {
  const fingerprints = Object.values(row && row.routes || {}).flatMap((route) => route.fingerprints || []);
  const bridge = bridgeParts(entry);
  if (!bridge) return fingerprints.some((fingerprint) => matchesFingerprint(entry, fingerprint));
  const asHttp = { type: "http", url: bridge.template };
  return fingerprints.some((fingerprint) => fingerprint.bridge ? matchesFingerprint(entry, fingerprint) : matchesFingerprint(asHttp, fingerprint));
}
function cursorOf(file, marked, catalog) {
  const read2 = readCursor(file);
  const servers = read2.state === "ok" ? read2.servers : {};
  const entries = {};
  for (const markedServer of marked) {
    const server = servers[markedServer.name];
    if (Object.hasOwn(servers, markedServer.name) && server !== void 0 && !Object.hasOwn(entries, markedServer.name)) entries[markedServer.name] = maskCredentials(server, markedServer.row === null ? void 0 : catalog.byId.get(markedServer.row));
  }
  return { file, state: read2.state, names: read2.state === "ok" ? Object.keys(read2.doc.mcpServers) : [], entries };
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
function cursorFound(context, inventory) {
  const pathApi = pathFor(context.platform);
  const env = context.env || {};
  const home = context.home || homeDir(env);
  if (home && fs10.existsSync(pathApi.join(home, CURSOR_FOLDER))) return true;
  const exts = context.platform === "win32" ? WINDOWS_COMMAND_EXTENSIONS : [""];
  const dirs = String(env.PATH || env.Path || "").split(pathApi.delimiter).filter(Boolean);
  for (const dir of dirs) for (const name of CURSOR_COMMANDS) for (const extension of exts) if (fs10.existsSync(pathApi.join(dir, `${name}${extension}`))) return true;
  return FAMILIES.some((family) => {
    const list = inventory && inventory.lists && inventory.lists[family];
    return Boolean(list) && (list && list.servers || []).some((server) => (server.clients || []).includes("cursor"));
  });
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
  const rootCtx2 = { project: projectDir, home: homeDir(env), platform, catalog };
  out.roots = { map: readMap(data) };
  out.roots.project = inUse(out, "project", rootCtx2);
  out.roots.global = inUse(out, "global", rootCtx2);
  out.lists = { project: listOf(out, "project", rootCtx2), global: listOf(out, "global", rootCtx2) };
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
var fromHere = (inventory, dir) => path15.relative(realOf(inventory.project), dir).split(path15.sep).join("/") || ".";
var WINDOWS_MCP_PLUGINS = ["windows-control", "windows-desktop"];
var NEAREST = /* @__PURE__ */ new Map([["local", 0], ["project", 1], ["inherited", 2], ["user", 3]]);
var nearness = (scope) => NEAREST.get(scope) ?? NEAREST.size;
function windowsMcpServers(inventory) {
  const starts = inventory.registrations.filter((registration) => registration.scope === "inherited" ? registration.approval === "approved" && !registration.shadowed : registration.scope !== "project" || !registration.approval || registration.approval === "approved");
  const wins = /* @__PURE__ */ new Map();
  for (const registration of starts.slice().sort((left, right) => nearness(left.scope) - nearness(right.scope))) if (!wins.has(registration.name)) wins.set(registration.name, registration);
  const loads = (inventory.plugins || []).filter((pluginRow) => (pluginRow.enabledHere ?? pluginRow.enabled) && !(pluginRow.errors || []).length && pluginRow.marketplace === WINDOWS_MCP_MARKETPLACE && WINDOWS_MCP_PLUGINS.includes(pluginRow.plugin));
  const nearest = /* @__PURE__ */ new Map();
  for (const pluginRow of loads.slice().sort((left, right) => nearness(left.scope) - nearness(right.scope))) if (!nearest.has(pluginRow.id)) nearest.set(pluginRow.id, pluginRow);
  return [
    ...[...wins.values()].filter((registration) => registration.rowId === "windows-control" || registration.alfredRetired && registration.name === "windows-control").map((registration) => ({ name: registration.name, scope: registration.scope, kind: "mcp", owner: registration.alfredRetired ? "alfred-code" : "catalog", from: registration.from || null })),
    ...loads.filter((pluginRow) => nearest.get(pluginRow.id) === pluginRow).map((pluginRow) => ({ name: pluginRow.id, scope: pluginRow.scope, kind: "plugin", owner: "alfred-code", from: null }))
  ];
}
var otherWindowsMcp = (inventory, name) => windowsMcpServers(inventory).filter((server) => server.kind === "plugin" || server.name !== name).map((server) => `${server.name} (${server.scope})`);
var keyOf = (kind, name, scope) => `${kind}:${name}~${scope}`;
function targetOf(inventory, key) {
  const match = /^(mcp|plugin):(.+)~(local|project|user)$/.exec(key || "");
  if (!match) return null;
  const [, kind = "", name, scope] = match;
  const item = kind === "mcp" ? inventory.registrations.find((registration) => registration.name === name && registration.scope === scope) : inventory.plugins.find((pluginRow) => pluginRow.id === name && pluginRow.scope === scope);
  return item ? { kind, item } : null;
}

// scripts/core/tmpdir.ts
import fs12 from "node:fs";
import os2 from "node:os";
import path16 from "node:path";
var PREFIX = "alfred-tools-";
var MAX_AGE_MS = 24 * 3600 * 1e3;
var realPathOf = (target) => fs12.realpathSync.native(target);
var tempRoot = () => realPathOf(os2.tmpdir());
function isOurTempDir(dir) {
  try {
    const real = realPathOf(dir);
    return path16.dirname(real) === tempRoot() && path16.basename(real).startsWith(PREFIX) && fs12.statSync(real).isDirectory();
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
  fs12.rmSync(realPathOf(dir), { recursive: true, force: true });
  return true;
}
function sweepTempDirs(now = Date.now()) {
  const root2 = tempRoot();
  for (const name of fs12.readdirSync(root2)) {
    if (!name.startsWith(PREFIX)) continue;
    const folder = path16.join(root2, name);
    try {
      const stats = fs12.lstatSync(folder);
      if (stats.isDirectory() && now - stats.mtimeMs > MAX_AGE_MS) fs12.rmSync(folder, { recursive: true, force: true });
    } catch {
    }
  }
}
function makeTempDir() {
  try {
    sweepTempDirs();
  } catch {
  }
  return fs12.mkdtempSync(path16.join(tempRoot(), PREFIX));
}

// scripts/update/check.ts
import path37 from "node:path";

// scripts/catalog/registry.ts
var DAY = 864e5;
var AGE_DAYS = 7;
var STABLE = { npm: /^\d+\.\d+\.\d+$/, pypi: /^\d+(\.\d+)*$/ };
var isRegistry = (registry) => Object.hasOwn(STABLE, registry);
var npmBase = (env) => (env.ALFRED_TOOLS_NPM_URL || "https://registry.npmjs.org").replace(/\/$/, "");
var pypiBase = (env) => (env.ALFRED_TOOLS_PYPI_URL || "https://pypi.org/pypi").replace(/\/$/, "");
async function getJson(url, fetchFn) {
  const response = await fetchFn(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(3e4) });
  if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
  return response.json();
}
async function versionsOf(registry, name, { env = process.env, fetchFn = fetch } = {}) {
  if (registry === "npm") {
    const doc = await getJson(`${npmBase(env)}/${name.replace("/", "%2F")}`, fetchFn);
    const versions = isRecord(doc) && isRecord(doc["versions"]) ? doc["versions"] : {};
    const times = isRecord(doc) && isRecord(doc["time"]) ? doc["time"] : {};
    return Object.entries(versions).flatMap(([version, release]) => {
      const published = times[version];
      return isRecord(release) && release["deprecated"] || typeof published !== "string" || !published ? [] : [{ version, time: Date.parse(published) }];
    });
  }
  if (registry === "pypi") {
    const doc = await getJson(`${pypiBase(env)}/${name}/json`, fetchFn);
    const releases = isRecord(doc) && isRecord(doc["releases"]) ? doc["releases"] : {};
    const out = [];
    for (const [version, files] of Object.entries(releases)) {
      const live2 = (Array.isArray(files) ? files : []).filter(isRecord).filter((file) => !file["yanked"]);
      if (!live2.length) continue;
      out.push({ version, time: Math.min(...live2.map((file) => Date.parse(String(file["upload_time_iso_8601"] || file["upload_time"])))) });
    }
    return out;
  }
  throw new Error(`unknown registry '${registry}'`);
}
function choose(versions, { registry, now = Date.now(), days = AGE_DAYS, current = null }) {
  if (!isRegistry(registry)) throw new Error(`unknown registry '${registry}'`);
  const pattern = STABLE[registry];
  const stable = versions.filter((release) => pattern.test(release.version) && Number.isFinite(release.time));
  const newer = stable.filter((release) => current === null || compareVersions(release.version, current) === 1);
  newer.sort((first, second) => compareVersions(second.version, first.version) ?? 0);
  const age = (release) => Math.floor((now - release.time) / DAY);
  const ok = newer.find((release) => now - release.time >= days * DAY);
  return {
    offer: ok ? { version: ok.version, ageDays: age(ok) } : null,
    held: newer.filter((release) => now - release.time < days * DAY && (!ok || compareVersions(release.version, ok.version) === 1)).map((release) => ({ version: release.version, ageDays: age(release) }))
  };
}
var cutoffOf = (now = Date.now()) => `${new Date(now).toISOString().slice(0, 10)}T23:59:59Z`;
function heldLine(pkgName, held, days = AGE_DAYS) {
  const [newest] = held;
  return newest ? `${pkgName} ${newest.version} is ${newest.ageDays} day(s) old - held back until it is ${days}${held.length > 1 ? ` (${held.length - 1} more newer than the pin are younger than ${days} days)` : ""}` : null;
}

// scripts/core/machine.ts
import fs13 from "node:fs";
import path17 from "node:path";
import { spawnSync as spawnSync5 } from "node:child_process";
function onPath(name, env, platform) {
  const key = Object.keys(env).find((variableName) => variableName.toUpperCase() === "PATH");
  const win = platform === "win32";
  const names2 = win ? [name, `${name}.exe`, `${name}.cmd`, `${name}.bat`] : [name];
  const pathApi = win ? path17.win32 : path17.posix;
  for (const dir of String(key && env[key] || "").split(win ? ";" : ":").filter(Boolean))
    for (const candidate of names2) {
      const file = pathApi.join(dir, candidate);
      try {
        if (fs13.statSync(file).isFile()) return file;
      } catch {
      }
    }
  return null;
}
function realMachine({ env = process.env, platform = process.platform } = {}) {
  return {
    exists: (file) => fs13.existsSync(file),
    realpath: (file) => {
      try {
        return fs13.realpathSync(file);
      } catch {
        return null;
      }
    },
    which: (name) => onPath(name, env, platform),
    // npm and npx are .cmd shims on Windows; a shell is what runs them
    // `options.cwd` and `options.env` (merged over the machine's) are for the audit, which runs in a temp folder
    run: (cmd, args, options2 = {}) => spawnSync5(cmd, args, { encoding: "utf8", env: { ...env, ...options2.env || {} }, cwd: options2.cwd, shell: platform === "win32" && /^(npm|npx)$/.test(cmd), windowsHide: true }),
    nodeVersion: process.versions.node
  };
}

// scripts/plan/cursor-steps.ts
import fs14 from "node:fs";

// scripts/plan/required.ts
function required(value, missing) {
  if (value === null || value === void 0) throw new Error(missing);
  return value;
}

// scripts/plan/lists.ts
var REG_OPS = ["mcp-add", "mcp-replace", "mcp-move", "mcp-remove"];
function foundList(inventory, file, pathApi) {
  for (const family of FAMILIES) {
    const familyList = inventory.lists && inventory.lists[family];
    if (familyList && familyList.file === file) return familyList.note ? { servers: [], own: [], state: "noted" } : { servers: familyList.servers || [], own: familyList.own || [] };
  }
  const list = readList(file);
  if (list) return list.state ? { servers: [], own: [], state: list.state } : { servers: list.servers, own: list.own };
  const old = readOldRecord(pathApi.join(pathApi.dirname(file), FILES.record));
  if (old) return old.state ? { servers: [], own: [], state: old.state } : { servers: [], own: old.servers };
  return null;
}
function adoptedClients(inventory, family) {
  const familyList = inventory.lists && inventory.lists[family];
  const listedServers = familyList && !familyList.old && !familyList.note ? familyList.servers || [] : [];
  const forCursor2 = listedServers.filter((server) => (server.clients || []).includes("cursor")).length;
  const all = listedServers.length > 0 && forCursor2 === listedServers.length;
  return { clients: all ? ["claude", "cursor"] : ["claude"], mixed: forCursor2 > 0 && !all };
}
function importUnlisted(inventory, family, catalog, { answers = {}, roots: rootFolders = {}, platform } = {}) {
  const familyList = inventory.lists && inventory.lists[family];
  const listed = new Set(familyList && !familyList.old && !familyList.note ? (familyList.servers || []).map(serverKey) : []);
  const { clients } = adoptedClients(inventory, family);
  return (inventory.registrations || []).filter((registration) => registration.rowId && !registration.own && !registration.alfredRetired && registration.scope !== "inherited" && familyOf(registration.scope) === family).filter((registration) => {
    const key = serverKey(registration);
    const answer = answers[key];
    return !listed.has(key) && (answer ? answer !== "own" : registration.choice !== "own");
  }).map((registration) => fromRegistration(registration, registration.rowId === null ? void 0 : catalog.byId.get(registration.rowId), clients, stdioChain({ scope: registration.scope, projectRoot: rootFolders.project, globalRoot: rootFolders.global, platform })));
}
function withoutEntry(server) {
  if (!server) return {};
  const { entry: _entry, ...rest } = server;
  return rest;
}
var ownChanged = (foundEntry, next) => !foundEntry || foundEntry.state ? next.length > 0 : JSON.stringify(next) !== JSON.stringify(foundEntry.own);
function listSteps(inventory, context, out, regSteps = []) {
  const pathApi = pathFor(context.platform);
  const fileIn = (dir) => pathApi.join(dir, FILES.list);
  const map = inventory.roots && inventory.roots.map || null;
  const mapped = map && map.projects ? map.projects[mapKey(context.project)] : null;
  const inUse2 = inventory.roots && inventory.roots.project ? inventory.roots.project.path : null;
  const mine = new Set([mapped, inUse2, context.roots && context.roots.project, ...standard("project", context).map((standardRoot) => standardRoot.root)].filter((root2) => Boolean(root2)).map(fileIn));
  const targets = { project: null, global: null };
  for (const family of FAMILIES) {
    const root2 = context.roots && context.roots[family];
    if (root2) targets[family] = fileIn(root2);
  }
  const current = (family) => inventory.lists && inventory.lists[family] && !inventory.lists[family].note ? inventory.lists[family] : null;
  const found = /* @__PURE__ */ new Map();
  const seen = (file, family) => {
    if (file && !found.has(file)) found.set(file, { list: foundList(inventory, file, pathApi), family });
  };
  for (const family of FAMILIES) seen(targets[family], family);
  if (context.recordLive)
    for (const family of FAMILIES) {
      seen(inventory.lists && inventory.lists[family] && inventory.lists[family].file, family);
      for (const file of listFiles(inventory, family, context)) seen(file, family);
    }
  const plans = /* @__PURE__ */ new Map();
  const at2 = (file, family) => {
    const known = plans.get(file);
    if (known) return known;
    const made = { family, upserts: [], drops: [], own: null };
    plans.set(file, made);
    return made;
  };
  for (const step of regSteps.filter((candidate) => REG_OPS.includes(candidate.op))) {
    const after = regKey(step);
    if (!after) continue;
    if (step.op === "mcp-remove") {
      const removedFamily = familyOf(step.scope);
      const removedList = current(removedFamily);
      if (removedList && removedList.servers.some((candidate) => serverKey(candidate) === after)) at2(removedList.file, removedFamily).drops.push({ key: after, after });
      continue;
    }
    const to = step.op === "mcp-move" ? step.to : { name: step.name, scope: step.scope };
    const from = step.op === "mcp-move" ? step.from : to;
    const family = familyOf(to.scope);
    const fromFam = familyOf(from.scope);
    const fromKey = serverKey(from);
    const currentList = current(fromFam);
    const prior = currentList ? currentList.servers.find((candidate) => serverKey(candidate) === fromKey) : null;
    if (currentList && prior && (currentList.file !== (targets[family] || currentList.file) || fromKey !== after)) at2(currentList.file, fromFam).drops.push({ key: fromKey, after });
    const file = targets[family] || current(family)?.file;
    if (!file) continue;
    const was = withoutEntry(prior);
    const clients = context.clientsFor && context.clientsFor.get(after) || was.clients || ["claude"];
    const form = context.formFor ? context.formFor.get(after) : void 0;
    const server = { ...was, name: to.name, scope: to.scope, row: step.row || was.row || null, route: step.route || was.route || null, clients, entry: null, key: was.key === void 0 ? null : was.key, ...form !== void 0 ? { form } : {} };
    const keyFiles = stdioChain({ scope: to.scope, projectRoot: context.roots && context.roots.project, globalRoot: context.roots && context.roots.global, platform: context.platform });
    at2(file, family).upserts.push({ server, after, cursorFile: null, ...keyFiles.length ? { keyFiles } : {} });
    if (!found.has(file)) found.set(file, { list: foundList(inventory, file, pathApi), family });
  }
  for (const { key, clients, form } of context.clientsOnly || []) {
    const cut = key.lastIndexOf("~");
    if (!key.startsWith("mcp:") || cut < 0) continue;
    const name = key.slice(4, cut);
    const scope = key.slice(cut + 1);
    const family = familyOf(scope);
    const currentList = current(family);
    const prior = currentList ? currentList.servers.find((candidate) => serverKey(candidate) === key) : null;
    const file = prior && currentList ? currentList.file : targets[family] || currentList && currentList.file;
    if (!file) continue;
    let server = prior ? { ...prior, clients } : null;
    if (!server) {
      const registration = (inventory.registrations || []).find((candidate) => candidate.name === name && candidate.scope === scope && candidate.rowId && !candidate.own);
      const catalog = context.catalog || load();
      if (!registration || !registration.rowId) continue;
      server = fromRegistration(registration, catalog.byId.get(registration.rowId), clients, stdioChain({ scope, projectRoot: context.roots && context.roots.project, globalRoot: context.roots && context.roots.global, platform: context.platform }));
    }
    if (form !== void 0) server.form = form;
    at2(file, family).upserts.push({ server, after: null, cursorFile: null });
    if (!found.has(file)) found.set(file, { list: foundList(inventory, file, pathApi), family });
  }
  if (context.recordLive) {
    const entries = /* @__PURE__ */ new Map();
    const keep = /* @__PURE__ */ new Map();
    for (const [file, { list: foundEntry }] of found) {
      if (!foundEntry || foundEntry.state) continue;
      for (const ownEntry of ownOnly(foundEntry.own)) {
        const key = recordKey(ownEntry);
        if (!key) continue;
        if (recordFamily(ownEntry) === "project" && !mine.has(file)) {
          keep.set(file, [...keep.get(file) || [], ownEntry]);
          out.notes.push(`${file} holds ${ownEntry.name || `${ownEntry.plugin}/${ownEntry.server}`} (${ownEntry.scope || "a plugin"}), left on its own in another project - it stays there; remove it there to hand it back`);
          continue;
        }
        entries.set(key, { ownEntry, from: file });
      }
    }
    for (const family of FAMILIES)
      for (const ownEntry of context.recordEntries && context.recordEntries[family] || []) {
        const key = recordKey(ownEntry);
        if (ownEntry.choice === "own") entries.set(key, { ownEntry, from: null });
        else entries.delete(key);
      }
    const planned = new Map([...found.keys()].map((file) => [file, { entries: [], keep: keep.get(file) || [] }]));
    for (const { ownEntry, from } of entries.values()) {
      const file = targets[recordFamily(ownEntry)] || from;
      if (file) required(planned.get(file), `${file}: an own entry's list is not among the lists read`).entries.push(ownEntry);
    }
    for (const [file, want] of planned) {
      const own = { entries: want.entries, keep: want.keep, live: context.recordLive };
      const next = ownOf(own);
      const { list: foundEntry, family } = required(found.get(file), `${file}: not among the lists read`);
      if (ownChanged(foundEntry, next)) at2(file, family).own = own;
      const listPlan = plans.get(file);
      if (listPlan) listPlan.next = next;
    }
  }
  const retire = [];
  const answers = {};
  for (const family of FAMILIES)
    for (const ownEntry of context.recordEntries && context.recordEntries[family] || []) {
      const key = recordKey(ownEntry);
      if (key !== null) answers[key] = ownEntry.choice;
    }
  const taken = new Set([...regSteps.filter((step) => REG_OPS.includes(step.op)).flatMap((step) => [regKey(step), step.op === "mcp-move" && step.from ? serverKey(step.from) : null]), ...(context.clientsOnly || []).map((clientsChange) => clientsChange.key)].filter(Boolean));
  for (const family of FAMILIES) {
    const familyList = inventory.lists && inventory.lists[family];
    const target = targets[family];
    const listPlan = target ? plans.get(target) : void 0;
    if (!target || !listPlan || familyList && (!familyList.old || familyList.note)) continue;
    for (const server of importUnlisted(inventory, family, context.catalog || load(), { answers, roots: context.roots || {}, platform: context.platform }))
      if (!taken.has(serverKey(server))) listPlan.upserts.push({ server, after: null, cursorFile: null });
    if (familyList && familyList.old) retire.push({ op: "retire-record", file: familyList.old, why: `${familyList.old}: the 0.4.x record - its entries are in ${targets[family]} now, so it is moved aside as ${FILES.record}.0.4.bak` });
  }
  const steps = [];
  for (const [file, listPlan] of plans) {
    const { list: foundEntry } = found.get(file) || { list: null };
    const target = targets[listPlan.family] === file;
    const dropped = new Set(listPlan.drops.map((drop) => drop.key));
    const left = (foundEntry && foundEntry.servers || []).filter((server) => !dropped.has(serverKey(server)));
    const own = listPlan.next || foundEntry && foundEntry.own || [];
    const empty2 = !listPlan.upserts.length && !left.length && !own.length;
    const root2 = context.roots && context.roots[listPlan.family];
    if (target && !empty2 && root2) context.uses.push({ family: listPlan.family, root: root2 });
    steps.push({ op: "list-write", file, family: listPlan.family, upserts: listPlan.upserts, drops: listPlan.drops, own: listPlan.own, ...empty2 ? { empty: true } : {}, why: `${file}: the servers alfred-tools manages, and the ones you left on their own - configure, update and fix skip those. Remove an entry from its own list, or the file, to hand them back.` });
  }
  return [...steps, ...retire];
}

// scripts/plan/cursor-steps.ts
var forCursor = (server) => (server.clients || []).includes("cursor");
var SCOPES = { project: ["local", "project"], global: ["user"] };
var serversOf = (read2) => read2.state === "ok" ? read2.servers : null;
function afterWrite(servers, step) {
  if (!step) return servers;
  const drops = new Set((step.drops || []).map((drop) => drop.key));
  const up = new Map((step.upserts || []).map((upsert) => [serverKey(upsert.server), { ...upsert.server, entry: upsert.server.entry ?? {} }]));
  return [...servers.filter((server) => !drops.has(serverKey(server)) && !up.has(serverKey(server))), ...up.values()];
}
function takenNames(inventory, context, upserts) {
  const catalog = context.catalog || load();
  const reads = /* @__PURE__ */ new Map();
  const readOf = (file) => {
    const known = reads.get(file);
    if (known) return known;
    const read2 = readCursor(file);
    reads.set(file, read2);
    return read2;
  };
  const out = [];
  for (const upsert of upserts || []) {
    if (!forCursor(upsert.server)) continue;
    const family = familyOf(upsert.server.scope);
    const file = upsert.cursorFile || fileFor(family, context);
    const have = serversOf(readOf(file));
    const there = have ? have[upsert.server.name] : void 0;
    if (!have || !Object.hasOwn(have, upsert.server.name) || there === void 0) continue;
    const familyList = inventory.lists && inventory.lists[family];
    if (familyList && !familyList.note && (familyList.servers || []).some((server) => server.name === upsert.server.name && forCursor(server))) continue;
    if (out.some((taken) => taken.file === file && taken.name === upsert.server.name)) continue;
    out.push({ file, name: upsert.server.name, sameRow: matchesRow(there, upsert.server.row === null ? void 0 : catalog.byId.get(upsert.server.row)) });
  }
  return out;
}
var hasGit = (dir, pathApi) => fs14.existsSync(pathApi.join(dir, ".git"));
function outsideItsRepo(project, pathApi) {
  if (!hasGit(project, pathApi))
    for (let dir = pathApi.dirname(project); ; dir = pathApi.dirname(dir)) {
      if (hasGit(dir, pathApi)) return true;
      if (pathApi.dirname(dir) === dir) break;
    }
  try {
    return fs14.readdirSync(project, { withFileTypes: true }).some((dirent) => dirent.isDirectory() && hasGit(pathApi.join(project, dirent.name), pathApi));
  } catch {
    return false;
  }
}
function folderList(inventory, folder, context) {
  const folderContext = { project: folder, home: context.home, platform: context.platform };
  for (const file of listFiles({ roots: inventory.roots, registrations: [] }, "project", folderContext)) {
    const list = readList(file);
    if (list && !list.state) return { file, servers: list.servers };
  }
  return null;
}
function sourcesOf(inventory, context, folder, ancestors, { own, listed } = {}) {
  const sources = [];
  const mine = own !== void 0 ? own : folderList(inventory, folder, context);
  if (mine && mine.file) sources.push({ file: mine.file, scopes: SCOPES.project, servers: mine.servers || [] });
  for (const up of ancestors) {
    const ancestorList = listed && listed.has(up) ? listed.get(up) : folderList(inventory, up, context);
    if (ancestorList && ancestorList.file) sources.push({ file: ancestorList.file, scopes: ["project"], servers: ancestorList.servers || [] });
  }
  return { sources, lists: sources.map((source) => ({ file: source.file, scopes: source.scopes })) };
}
var sameKeys = (before, after) => before.size === after.size && [...before.keys()].every((key) => after.has(key));
function cursorSteps(inventory, context, out, answers = {}) {
  const pathApi = pathFor(context.platform);
  const named = answers.cursorNames || {};
  const steps = [];
  const workspaceRecord = inventory.workspace !== void 0 ? inventory.workspace : context.project ? workspaceOf(context.project, context.env || {}) : null;
  const workspaceHere = workspaceRecord && workspaceRecord.root ? { record: workspaceRecord, root: workspaceRecord.root } : null;
  const strip = (upsert) => {
    upsert.server = { ...upsert.server, clients: (upsert.server.clients || []).filter((client) => client !== "cursor") };
  };
  const settle = (taken, replace, onKeep) => {
    for (const takenEntry of taken) {
      const answer = named[`${takenEntry.name}@${takenEntry.file}`];
      if (answer === "keep") onKeep(takenEntry);
      else if (answer === "replace") replace.push(takenEntry.name);
      else {
        out.errors.push(`cursor: ${takenEntry.file} already has ${takenEntry.name} - answer cursor-name-${takenEntry.name}@${takenEntry.file}`);
        out.taken = [...out.taken || [], takenEntry];
      }
    }
  };
  for (const family of FAMILIES) {
    const writes = out.steps.filter((step) => step.op === "list-write" && step.family === family);
    if (!writes.length) continue;
    const current = inventory.lists && inventory.lists[family] && !inventory.lists[family].note && !inventory.lists[family].old ? inventory.lists[family] : null;
    const target = context.roots && context.roots[family] ? pathApi.join(context.roots[family], FILES.list) : current ? current.file : null;
    if (!target) continue;
    const scopes = SCOPES[family];
    const beforeServers = current ? current.servers || [] : [];
    const above = family === "project" && workspaceHere ? workspaceHere.record.ancestors : [];
    const base = current && current.file === target ? beforeServers : foundList(inventory, target, pathApi)?.servers || [];
    const beforeSrc = sourcesOf(inventory, context, context.project, above, { own: { file: current && current.file, servers: beforeServers } });
    const before = managedSet(family === "project" ? beforeSrc.sources : [{ file: current ? current.file : target, scopes, servers: beforeServers }]);
    const wasForCursor = new Set(beforeServers.filter(forCursor).map(serverKey));
    const upserts = writes.flatMap((write) => write.upserts || []);
    const file = fileFor(family, context);
    const why = refusal(readCursor(file));
    if (why) {
      if (upserts.some((upsert) => forCursor(upsert.server))) out.notes.push(`Cursor: ${file} ${why} - not written; Claude Code is`);
      for (const upsert of upserts) if (forCursor(upsert.server) && !wasForCursor.has(serverKey(upsert.server))) strip(upsert);
      continue;
    }
    const replace = [];
    const fresh = upserts.filter((upsert) => forCursor(upsert.server) && !before.has(upsert.server.name)).map((upsert) => ({ ...upsert, cursorFile: file }));
    settle(takenNames(inventory, context, fresh), replace, (takenEntry) => {
      for (const upsert of upserts) if (upsert.server.name === takenEntry.name && forCursor(upsert.server)) strip(upsert);
    });
    for (const upsert of upserts) if (forCursor(upsert.server)) upsert.cursorFile = file;
    const afterServers = afterWrite(base, writes.find((write) => write.file === target));
    const afterSrc = sourcesOf(inventory, context, context.project, above, { own: { file: target, servers: afterServers } });
    const after = managedSet(family === "project" ? afterSrc.sources : [{ file: target, scopes, servers: afterServers }]);
    const touched = upserts.some((upsert) => forCursor(upsert.server));
    if (sameKeys(before, after) && !touched) continue;
    const listsOf = family === "project" ? afterSrc.lists : [{ file: target, scopes }];
    const hold = heldCopies(file, before, after, context, out);
    const reapprove = changedCopies(file, before, after, hold, upserts, context, out);
    steps.push({ op: "cursor-write", file, family, lists: listsOf, before: [...before.keys()], skip: hold, replace, reapprove, why: `${file}: Cursor's servers from ${target}, the user's own kept as they are` });
    if (family === "project" && workspaceRecord && workspaceRecord.notes) {
      for (const note of workspaceRecord.notes) if (!out.notes.includes(note)) out.notes.push(note);
    }
    if (family !== "project") continue;
    const projectOnly = (servers) => managedSet([{ file: target, scopes: ["project"], servers }]);
    const projectTouched = upserts.some((upsert) => forCursor(upsert.server) && upsert.server.scope === "project");
    if (workspaceHere && (projectTouched || !sameKeys(projectOnly(beforeServers), projectOnly(afterServers))))
      for (const member of membersBelow(workspaceHere.record, context.project)) {
        const memberFile = fileFor("project", { ...context, project: member.folder });
        const memberRefusal = refusal(readCursor(memberFile));
        if (memberRefusal) {
          out.notes.push(`Cursor: ${memberFile} ${memberRefusal} - not written; ${context.project}'s servers do not reach it`);
          continue;
        }
        const listedByFolder = /* @__PURE__ */ new Map([[context.project, { file: current && current.file, servers: beforeServers }]]);
        const memberBefore = managedSet(sourcesOf(inventory, context, member.folder, member.ancestors, { listed: listedByFolder }).sources);
        const memberSources = sourcesOf(inventory, context, member.folder, member.ancestors, { listed: /* @__PURE__ */ new Map([[context.project, { file: target, servers: afterServers }]]) });
        const memberReplace = [];
        const memberSkip = [];
        const memberFresh = upserts.filter((upsert) => forCursor(upsert.server) && upsert.server.scope === "project" && !memberBefore.has(upsert.server.name)).map((upsert) => ({ ...upsert, cursorFile: memberFile }));
        settle(takenNames(inventory, context, memberFresh), memberReplace, (takenEntry) => memberSkip.push(takenEntry.name));
        const memberAfter = managedSet(memberSources.sources);
        const memberHold = heldCopies(memberFile, memberBefore, memberAfter, context, out);
        const memberReapprove = changedCopies(memberFile, memberBefore, memberAfter, memberHold, upserts, context, out);
        steps.push({ op: "cursor-write", file: memberFile, family, lists: memberSources.lists, before: [...memberBefore.keys()], skip: [.../* @__PURE__ */ new Set([...memberSkip, ...memberHold])], replace: memberReplace, reapprove: memberReapprove, why: `${memberFile}: the workspace member's servers, with ${context.project}'s project servers` });
      }
    if (!after.size) continue;
    if ([...after.values()].some((managed2) => managed2.scope === "local") && gitIgnores(file) === false)
      out.notes.push(".cursor/mcp.json now holds this machine's local servers; add it to .gitignore to keep them private");
    if (workspaceHere) {
      const own = managedSet([{ file: target, scopes, servers: afterServers }]);
      const top = context.project !== workspaceHere.root && own.size ? gitTop(context.project) : null;
      let rootReal = null;
      try {
        rootReal = fs14.realpathSync(workspaceHere.root);
      } catch {
      }
      if (top && top === rootReal)
        out.notes.push(`${context.project} is a folder of ${workspaceHere.root}'s git repo; Cursor's CLI reads ${pathApi.join(workspaceHere.root, ".cursor", "mcp.json")} there, so these servers reach the editor opened at ${context.project} only. Install them at the root or at Global scope for the CLI`);
    } else if (outsideItsRepo(context.project, pathApi))
      out.notes.push(`Cursor reads .cursor/mcp.json only from the folder it opens (its git root for the CLI), never a parent's: open Cursor at ${context.project}, or install at Global scope for servers every folder needs`);
  }
  const again = [...new Set(steps.flatMap((step) => step.reapprove || []))];
  if (again.length) out.notes.push(reapproveLine(again));
  return steps;
}
var reapproveLine = (names2) => `Cursor asks you to approve ${names2.join(", ")} again - it re-asks whenever an entry changes`;
var keepOf = (catalog, value, row) => maskCredentials(value, row === null ? void 0 : catalog.byId.get(row));
function heldCopies(file, before, after, context, out) {
  const catalog = context.catalog || load();
  const have = serversOf(readCursor(file));
  if (!have) return [];
  const hold = [];
  const normalize = context.normalizeCopy || ((entry) => entry);
  for (const [name, managed2] of before) {
    if (!after.has(name)) continue;
    const copy = Object.hasOwn(have, name) ? have[name] : void 0;
    if (copy === void 0) {
      hold.push(name);
      out.notes.push(`${name} is on the list for Cursor but not in ${file} - left; run /alfred-tools:fix`);
    } else if (!deepEqual(keepOf(catalog, normalize(copy), managed2.row), keepOf(catalog, normalize(managed2.entry), managed2.row))) {
      hold.push(name);
      out.notes.push(`${name}: Cursor's copy was changed by hand - left; run /alfred-tools:fix`);
    }
  }
  return hold;
}
function changedCopies(file, before, after, hold, upserts, context, out) {
  const catalog = context.catalog || load();
  const have = serversOf(readCursor(file));
  if (!have) return [];
  const regOf = new Map((out.steps || []).filter((step) => REG_OPS.includes(step.op)).map((step) => [regKey(step), step.op === "mcp-remove" ? void 0 : step.entry]));
  const names2 = [];
  for (const name of after.keys()) {
    const copy = Object.hasOwn(have, name) ? have[name] : void 0;
    if (!before.has(name) || hold.includes(name) || copy === void 0) continue;
    const upsert = upserts.find((candidate) => candidate.server.name === name && forCursor(candidate.server));
    if (!upsert) continue;
    const row = upsert.server.row;
    let next = upsert.server.entry ? upsert.server.cursorEntry || upsert.server.entry : null;
    if (!next && upsert.after && regOf.has(upsert.after)) {
      const entry = regOf.get(upsert.after);
      const two = upsert.server.form === "two" || upsert.server.form === void 0 && upsert.server.cursorEntry;
      next = two ? bridgeFormOf(entry, catalog, upsert.server.cursorEntry || null) || entry : entry;
    }
    if (next && !deepEqual(keepOf(catalog, copy, row), keepOf(catalog, next, row))) names2.push(name);
  }
  return names2;
}

// scripts/plan/repair-tail.ts
import fs15 from "node:fs";
import path18 from "node:path";

// scripts/entries/names.ts
function nameProblem(name, { catalog, taken = [], self = null }) {
  if (!new RegExp(catalog.rules.nameRe).test(name)) return `'${name}' must match ${catalog.rules.nameRe}`;
  if (catalog.reserved.has(name)) return `'${name}' is a name alfred-code once registered and may retire`;
  const other = taken.find((registration) => registration.name === name && !(self && registration.name === self.name && registration.scope === self.scope));
  if (other) return `'${name}' already belongs to another registration at ${other.scope} scope`;
  return null;
}
function fetchStep(name, entry, rowId, old) {
  const step = fetchOf(name, entry, rowId);
  const was = old ? fetchOf(name, old, rowId) : null;
  if (step && was && JSON.stringify([step.argv, step.env]) === JSON.stringify([was.argv, was.env])) return null;
  return step;
}
var npmFetchArgv = (packageSpec) => ["npm", "exec", "--yes", "--package", packageSpec, "--", "node", "-e", "0"];
var UVX_VALUE = /* @__PURE__ */ new Set(["--python", "-p", "--exclude-newer", "--from", "--with", "--with-requirements", "--with-editable", "--index", "--index-url", "--extra-index-url"]);
function fetchOf(name, entry, rowId) {
  if (!entry || !entry.command) return null;
  const launch = launchOf(entry);
  const bridge = bridgeParts(launch);
  if (bridge) {
    if (!bridge.packageSpec) return null;
    const npmArgv = npmFetchArgv(bridge.packageSpec);
    const argv2 = /^[A-Za-z]:/.test(bridge.path) ? ["cmd", "/c", ...npmArgv] : npmArgv;
    return { op: "fetch", name, row: rowId, what: bridge.packageSpec, argv: argv2, env: entry.env || {}, why: `${rowId || name}: fetch ${bridge.packageSpec} so the first start answers in time` };
  }
  if (!launch.command) return null;
  let cmd = launch.command;
  let args = (launch.args || []).slice();
  const viaCmd = throughCmd(cmd, args);
  if (viaCmd) {
    cmd = args[1];
    args = args.slice(2);
  }
  let argv;
  let what;
  if (/^npx(\.cmd)?$/i.test(cmd || "")) {
    what = args.find((argument) => !argument.startsWith("-"));
    if (!what) return null;
    argv = npmFetchArgv(what);
  } else if (/^uvx(\.exe)?$/i.test(cmd || "")) {
    const out = [];
    for (let i = 0; i < args.length; i++) {
      const argument = args[i];
      if (argument === void 0) break;
      if (!argument.startsWith("-")) {
        out.push(argument, "--help");
        break;
      }
      out.push(argument);
      if (!UVX_VALUE.has(argument)) continue;
      const value = args[++i];
      if (value !== void 0) out.push(value);
    }
    what = out[out.indexOf("--from") + 1] || out[out.length - 2];
    if (what === void 0) return null;
    argv = ["uvx", ...out];
  } else if (/^docker(\.exe)?$/i.test(cmd || "")) {
    what = args.find((argument) => /^[a-z0-9.-]+(\/[a-z0-9._-]+)+:[\w.-]+$/.test(argument));
    if (!what) return null;
    argv = ["docker", "pull", what];
  } else return null;
  if (viaCmd) argv = [launch.command, "/c", ...argv];
  return { op: "fetch", name, row: rowId, what, argv, env: entry.env || {}, why: `${rowId || name}: fetch ${what} so the first start answers in time` };
}

// scripts/plan/start-timeout-constants.ts
var START_TIMEOUT = { name: "MCP_TIMEOUT", value: "90000" };
var SETTINGS_ENV_KEY = "env";

// scripts/plan/read-guard-constants.ts
var CONFIG_DIR_NAME = ".claude";
var SETTINGS_FILE = "settings.json";
var INSTALLED_PLUGINS_FILE = "installed_plugins.json";
var PLUGINS_DIR = "plugins";
var PLUGIN_KEY_PREFIXES = ["alfred-tools@", "preferred-tools@"];
var ACCOUNT_FILE = ".claude.json";

// scripts/plan/repair-tail.ts
function repairTail(inventory, context, regSteps, { refresh = [], repoint = [], normalize, clientsFor, bridgeFor } = {}) {
  const catalog = context.catalog || load();
  const notes = context.notes || [];
  const usable = (family) => {
    const familyList = inventory.lists && inventory.lists[family];
    return familyList && !familyList.note && !familyList.old ? familyList : null;
  };
  const formFor = /* @__PURE__ */ new Map();
  for (const step of regSteps.filter((candidate) => REG_OPS.includes(candidate.op))) {
    const key = regKey(step);
    const familyList = usable(familyOf(step.op === "mcp-move" ? step.to.scope : step.scope));
    const prior = familyList ? (familyList.servers || []).find((server) => serverKey(server) === key) : null;
    if (key !== null && (prior && prior.cursorEntry || bridgeFor && bridgeFor.has(key))) formFor.set(key, "two");
  }
  const listContext = { platform: context.platform, project: context.project || inventory.project, home: context.home, env: context.env || {}, catalog, roots: null, uses: [], formFor, clientsFor, exists: context.exists, normalizeCopy: normalize };
  const out = { steps: [], notes, errors: [] };
  const listWrites = listSteps(inventory, listContext, out, regSteps);
  const rootPaths = { project: inventory.roots && inventory.roots.project ? inventory.roots.project.path : null, global: inventory.roots && inventory.roots.global ? inventory.roots.global.path : null };
  for (const listStep of listWrites)
    for (const upsert of listStep.op === "list-write" && listStep.upserts || [])
      if (!upsert.keyFiles) {
        const files = stdioChain({ scope: upsert.server.scope, projectRoot: rootPaths.project, globalRoot: rootPaths.global, platform: context.platform });
        if (files.length) upsert.keyFiles = files;
      }
  for (const item of repoint) {
    const family = familyOf(item.scope);
    const familyList = usable(family);
    const prior = familyList ? (familyList.servers || []).find((server) => server.name === item.name && server.scope === item.scope) : null;
    if (!familyList || !prior) continue;
    let write = listWrites.find((step) => step.op === "list-write" && step.file === familyList.file);
    if (!write) {
      write = { op: "list-write", file: familyList.file, family, upserts: [], drops: [], own: null, why: `${familyList.file}: the paths into the moved root re-pointed` };
      listWrites.push(write);
    }
    if (write.upserts.some((upsert) => upsert.server.name === item.name && upsert.server.scope === item.scope)) continue;
    const again = (entry) => normalize ? normalize(entry) : entry;
    write.upserts.push({ server: { ...prior, entry: again(prior.entry), ...prior.cursorEntry ? { cursorEntry: again(prior.cursorEntry) } : {} }, after: null, cursorFile: null });
  }
  out.steps = [...regSteps, ...listWrites];
  const cursor = cursorSteps(inventory, listContext, out, {});
  for (const error of out.errors) notes.push(`${error} - Cursor's file is left; run /alfred-tools:configure`);
  const blocked = new Set(out.errors.length ? cursor.map((cursorStep) => cursorStep.file) : []);
  const written = cursor.filter((cursorStep) => !blocked.has(cursorStep.file));
  for (const family of [...new Set(refresh.map((item) => familyOf(item.scope)))]) {
    const familyList = usable(family);
    const file = fileFor(family, listContext);
    if (!familyList || written.some((cursorStep) => cursorStep.file === file)) continue;
    const why = refusal(readCursor(file));
    if (why) {
      notes.push(`Cursor: ${file} ${why} - not written`);
      continue;
    }
    const scopes = SCOPES[family];
    const before = managedSet([{ file: familyList.file, scopes, servers: familyList.servers || [] }]);
    const hold = heldCopies(file, before, before, listContext, out);
    written.push({ op: "cursor-write", file, family, lists: [{ file: familyList.file, scopes }], before: [...before.keys()], skip: hold, replace: [], reapprove: refresh.filter((item) => familyOf(item.scope) === family && !hold.includes(item.name)).map((item) => item.name), why: `${file}: the key refilled from .mcps-secrets` });
  }
  return [...listWrites, ...written];
}
function changedOutside(inventory, catalog = load()) {
  const changed = [];
  const missing = [];
  for (const family of FAMILIES) {
    const familyList = inventory.lists && inventory.lists[family];
    if (!familyList || familyList.note || familyList.old) continue;
    for (const server of familyList.servers || []) {
      if (!(server.clients || ["claude"]).includes("claude")) continue;
      const registration = (inventory.registrations || []).find((candidate) => candidate.name === server.name && candidate.scope === server.scope);
      if (!registration) missing.push(`${server.name} is on the list but not in Claude Code - run /alfred-tools:fix`);
      else if (!deepEqual(keepOf(catalog, registration.entry, server.row), server.entry)) changed.push(`${server.name} was changed outside alfred-tools`);
    }
  }
  return [...changed, ...missing];
}
function settingsFileOf(context, dir) {
  const pathApi = pathFor(context.platform);
  const env = context.env || {};
  return dir ? pathApi.join(dir, SETTINGS_FILE) : env.CLAUDE_CONFIG_DIR ? pathApi.resolve(env.CLAUDE_CONFIG_DIR, SETTINGS_FILE) : pathApi.join(context.home, CONFIG_DIR_NAME, SETTINGS_FILE);
}
function readGuardOf(context, want, dir) {
  const file = settingsFileOf(context, dir);
  let text = null;
  try {
    text = fs15.readFileSync(file, "utf8");
  } catch {
  }
  let deny = [];
  if (text !== null) {
    let doc = null;
    try {
      doc = JSON.parse(stripBom(text));
    } catch {
    }
    const permissions = isRecord(doc) ? doc["permissions"] : void 0;
    const listed = isRecord(permissions) ? permissions["deny"] : void 0;
    if (!isRecord(doc) || permissions !== void 0 && !isRecord(permissions) || listed !== void 0 && !Array.isArray(listed)) return { file, bad: true };
    deny = Array.isArray(listed) ? listed.filter((rule) => typeof rule === "string") : [];
  }
  return { file, rules: want.filter((rule) => !deny.includes(rule)) };
}
function configDirsWhere(home, current, platform, wanted) {
  const realKey = (dir) => {
    let real = path18.resolve(dir);
    try {
      real = fs15.realpathSync(dir);
    } catch {
    }
    return platform === "win32" ? real.toLowerCase() : real;
  };
  const currentKey = realKey(current);
  const listed = /* @__PURE__ */ new Set();
  let names2 = [];
  try {
    names2 = fs15.readdirSync(home);
  } catch {
    return [];
  }
  const found = [];
  for (const name of names2.sort()) {
    if (name !== CONFIG_DIR_NAME && !name.startsWith(`${CONFIG_DIR_NAME}-`)) continue;
    const dir = path18.join(home, name);
    const key = realKey(dir);
    if (key === currentKey || listed.has(key)) continue;
    if (wanted(dir)) {
      found.push(dir);
      listed.add(key);
    }
  }
  return found;
}
function configDirsWithPlugin(home, current, platform = process.platform) {
  return configDirsWhere(home, current, platform, (dir) => {
    try {
      const doc = JSON.parse(stripBom(fs15.readFileSync(path18.join(dir, PLUGINS_DIR, INSTALLED_PLUGINS_FILE), "utf8")));
      const plugins = isRecord(doc) ? doc["plugins"] : null;
      return isRecord(plugins) && Object.keys(plugins).some((pluginKey) => PLUGIN_KEY_PREFIXES.some((prefix) => pluginKey.startsWith(prefix)));
    } catch {
      return false;
    }
  });
}
function configDirsUnderHome(home, current, platform = process.platform) {
  const there = (file) => {
    try {
      return fs15.statSync(file).isFile();
    } catch {
      return false;
    }
  };
  return configDirsWhere(home, current, platform, (dir) => there(path18.join(dir, ACCOUNT_FILE)) || there(path18.join(dir, PLUGINS_DIR, INSTALLED_PLUGINS_FILE)) || path18.basename(dir) === CONFIG_DIR_NAME && there(path18.join(home, ACCOUNT_FILE)));
}
function denyReadStep(file, rules) {
  return { op: "deny-read", file, rules, why: `${file}: keeps an AI session's Read tool out of ${rules.map((rule) => rule === READ_GUARD.signIns ? "the sign-in tokens" : "the key file").join(" and ")}` };
}
function denyReadSteps(steps, context, out) {
  const writesSignIn = steps.some((step) => (step.op === "mcp-add" || step.op === "mcp-replace" || step.op === "mcp-move") && signInParts(step.entry));
  const writesKeyName = steps.some((step) => step.op === "ensure-key-name");
  const want = [...writesSignIn ? [READ_GUARD.signIns] : [], ...writesKeyName ? [READ_GUARD.secrets] : []];
  if (!want.length) return [];
  const readGuard = readGuardOf(context, want);
  if (readGuard.bad) {
    out.notes.push(`${readGuard.file} is not a settings object alfred-tools can read - add ${want.join(" and ")} to permissions.deny yourself`);
    return [];
  }
  return readGuard.rules.length ? [denyReadStep(readGuard.file, readGuard.rules)] : [];
}
function startTimeoutOf(context, dir) {
  const file = settingsFileOf(context, dir);
  if (!dir && (context.env || {})[START_TIMEOUT.name]) return { file, missing: false };
  let text = null;
  try {
    text = fs15.readFileSync(file, "utf8");
  } catch (caught) {
    if (errorCode(caught) !== "ENOENT") return { file, bad: true };
  }
  if (text === null) return { file, missing: true };
  let doc = null;
  try {
    doc = JSON.parse(stripBom(text));
  } catch {
  }
  const held = isRecord(doc) ? doc[SETTINGS_ENV_KEY] : void 0;
  if (!isRecord(doc) || held !== void 0 && !isRecord(held)) return { file, bad: true };
  return { file, missing: !Object.hasOwn(held ?? {}, START_TIMEOUT.name) };
}
function settingsEnvStep(file) {
  return { op: "settings-env", file, env: { [START_TIMEOUT.name]: START_TIMEOUT.value }, why: `${file}: gives a server 90 s to start, where npx asks the npm registry first` };
}
var launchesPackage = (name, entry) => fetchStep(name, entry) !== null;
function startTimeoutSteps(steps, context, out) {
  const launching = steps.filter((step) => (step.op === "mcp-add" || step.op === "mcp-replace" || step.op === "mcp-move") && launchesPackage(step.op === "mcp-move" ? step.to.name : step.name, step.entry));
  if (!launching.length) return [];
  const badNote = (file) => out.notes.push(`${file} is not a settings object alfred-tools can read - add ${START_TIMEOUT.name}=${START_TIMEOUT.value} to ${SETTINGS_ENV_KEY} yourself`);
  const result = [];
  const current = startTimeoutOf(context);
  if (current.bad) badNote(current.file);
  else if (current.missing) result.push(settingsEnvStep(current.file));
  if (!launching.some((step) => (step.op === "mcp-move" ? step.to.scope : step.scope) === "project")) return result;
  for (const dir of configDirsUnderHome(context.home, pathFor(context.platform).dirname(current.file), context.platform)) {
    const other = startTimeoutOf(context, dir);
    if (other.bad) badNote(other.file);
    else if (other.missing) result.push(settingsEnvStep(other.file));
  }
  return result;
}
function renderLine(step) {
  if (step.op === "settings-env") return `   adds ${Object.entries(step.env).map(([name, value]) => `${name}=${value}`).join(" and ")} to ${SETTINGS_ENV_KEY} in ${step.file}  (gives a server 90 s to start - npx asks the npm registry first)`;
  if (step.op === "deny-read") return `   adds ${step.rules.join(" and ")} to permissions.deny in ${step.file}  (keeps AI sessions out of the sign-in tokens and the key file)`;
  if (step.op === "cursor-write") return [`   writes ${step.file}  (Cursor: the servers set up for it; your own entries kept)`, ...(step.replace || []).map((name) => `   replaces your own ${name} in ${step.file}`)].join("\n");
  if (step.op === "retire-record") return `   moves ${step.file} aside as ${FILES.record}.0.4.bak  (its entries are in mcps.json now)`;
  return step.empty ? `   removes ${step.file}  (no server is listed)` : `   writes ${step.file}  (the servers alfred-tools manages, and the ones left on their own)`;
}

// scripts/update/offers-plugins.ts
import fs16 from "node:fs";
import path19 from "node:path";
function bumpEntry(entry, packageName, to, cutoff) {
  const from = pinnedVersion(entry, packageName);
  if (!from) return null;
  const bumped = clone(entry);
  let done = false;
  bumped.args = (bumped.args || []).map((argument) => {
    if (!done && !argument.startsWith("-") && bareName(argument) === packageName && argument.endsWith(from)) {
      done = true;
      return argument.slice(0, argument.length - from.length) + to;
    }
    return argument;
  });
  const at2 = bumped.args.indexOf("--exclude-newer");
  if (at2 >= 0 && bumped.args[at2 + 1] !== void 0) bumped.args[at2 + 1] = cutoff;
  if (bumped.env && typeof bumped.env.npm_config_before === "string") bumped.env.npm_config_before = cutoff;
  return pinnedVersion(bumped, packageName) === to ? bumped : null;
}
function listedVersion(installLocation, pluginName) {
  if (!installLocation) return null;
  let file = installLocation;
  try {
    if (!fs16.statSync(file).isFile()) file = path19.join(installLocation, ".claude-plugin", "marketplace.json");
  } catch {
    return null;
  }
  let doc;
  try {
    doc = JSON.parse(fs16.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  const entry = (doc.plugins || []).find((plugin) => plugin.name === pluginName);
  if (!entry) return null;
  const root2 = path19.dirname(path19.dirname(file));
  if (typeof entry.source === "string") {
    const dir = path19.resolve(root2, doc.metadata && doc.metadata.pluginRoot || "", entry.source);
    try {
      const version = JSON.parse(fs16.readFileSync(path19.join(dir, ".claude-plugin", "plugin.json"), "utf8")).version;
      if (version) return String(version);
    } catch {
    }
  }
  return entry.version ? String(entry.version) : null;
}
function pluginOffers(context, out) {
  const refreshed = /* @__PURE__ */ new Map();
  const listUnread = (context.inventory.unreadable || []).some((unreadable) => unreadable.scope === MARKETPLACE_LIST_UNREAD.scope);
  for (const plugin of context.inventory.plugins) {
    if (!refreshed.has(plugin.marketplace)) {
      if (!context.refresh) refreshed.set(plugin.marketplace, null);
      else {
        const result = context.runCli(["plugin", "marketplace", "update", plugin.marketplace], { cwd: context.project, env: context.env });
        refreshed.set(plugin.marketplace, !result.error && result.status === 0 ? null : `marketplace ${plugin.marketplace} did not refresh (${`${result.stderr}${result.stdout}`.trim().split("\n").slice(-1)[0] || "no output"}) - compared against its last clone`);
      }
      const note = refreshed.get(plugin.marketplace);
      if (note) out.notes.push(note);
    }
    const market = context.inventory.marketplaces.find((marketplace) => marketplace.name === plugin.marketplace);
    const to = listedVersion(market && market.installLocation, plugin.plugin);
    const base = { kind: "plugin", id: `plugin:${plugin.id}~${plugin.scope}`, plugin: plugin.id, scope: plugin.scope, from: plugin.version || null, group: plugin.rowId ? "catalog" : "other", label: `${plugin.id} (${plugin.scope})` };
    if (!market) {
      out.skipped.push(`${plugin.id} (${plugin.scope}): ${listUnread ? `the marketplace list could not be read (${MARKETPLACE_LIST_UNREAD.file})` : `its marketplace '${plugin.marketplace}' is not registered`}, so nothing to compare against`);
      continue;
    }
    if (to === null) {
      out.unchecked.push({ ...base, to: null });
      continue;
    }
    const comparison = compareVersions(plugin.version || "", to);
    const behind2 = comparison === null ? plugin.version !== to : comparison === -1;
    if (behind2) out.offers.push({ ...base, to });
  }
}

// scripts/update/offers-pins.ts
async function mcpOffers(context, out) {
  const cache = /* @__PURE__ */ new Map();
  const latest = (registry, name) => {
    const key = `${registry}:${name}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const looked = context.registry.versionsOf(registry, name);
    cache.set(key, looked);
    return looked;
  };
  for (const registration of context.inventory.registrations) {
    if (registration.own || registration.alfredRetired) continue;
    if (registration.choice === "own") {
      out.skipped.push(`${registration.name} (${registration.scope}): on its own - not checked`);
      continue;
    }
    if (registration.scope === "inherited") {
      out.skipped.push(`${registration.name} (inherited): inherited from ${registration.from ? fromHere(context.inventory, registration.from) : "a parent folder"} - update it there`);
      continue;
    }
    const row = registration.rowId ? context.catalog.byId.get(registration.rowId) : void 0;
    const routeDefinition = row && registration.route ? row.routes[registration.route] : void 0;
    if (!routeDefinition) continue;
    const at2 = `${registration.name} (${registration.scope})`;
    const signIn = registration.route === "remote" && signInParts(registration.entry);
    if (registration.route === "remote" && !signIn) {
      out.skipped.push(`${at2}: a hosted URL has no pin`);
      continue;
    }
    if (routeDefinition.runtime === "docker") {
      out.skipped.push(`${at2}: the Docker image tag is not checked - change it with /alfred-tools:configure`);
      continue;
    }
    const packageSpec = signIn ? mcpRemotePackage(context.catalog) : routeDefinition.package;
    if (!packageSpec) continue;
    const from = pinnedVersion(registration.entry, packageSpec.name);
    if (!from) {
      out.skipped.push(`${at2}: ${packageSpec.name} is launched with no version, so it follows the registry already`);
      continue;
    }
    let versions;
    try {
      versions = await latest(packageSpec.registry, packageSpec.name);
    } catch (caught) {
      out.errors.push(`${at2}: ${packageSpec.registry} lookup for ${packageSpec.name} failed - ${errorMessage(caught)}`);
      continue;
    }
    const pick = choose(versions, { registry: packageSpec.registry, now: context.now, current: from });
    if (pick.held.length) out.held.push(`${at2}: ${heldLine(packageSpec.name, pick.held)}`);
    if (!pick.offer) continue;
    const bumped = bumpEntry(registration.entry, packageSpec.name, pick.offer.version, cutoffOf(context.now));
    const entry = bumped ? renameSinceEnv(bumped, routeDefinition, pick.offer.version) : null;
    if (!entry) {
      out.errors.push(`${at2}: could not move the pin of ${packageSpec.name} in the registration as it is written - change it with /alfred-tools:configure`);
      continue;
    }
    out.offers.push({ kind: "mcp", id: `mcp:${registration.name}~${registration.scope}`, name: registration.name, scope: registration.scope, row: registration.rowId, route: registration.route, package: packageSpec.name, from, to: pick.offer.version, ageDays: pick.offer.ageDays, cutoff: cutoffOf(context.now), old: registration.entry, entry, group: "mcp", label: `${registration.name} (${registration.scope})` });
  }
}
async function cursorPinOffers(context, out) {
  const packageSpec = mcpRemotePackage(context.catalog);
  let versions = null;
  for (const family of FAMILIES) {
    const list = context.inventory.lists && context.inventory.lists[family];
    if (!list || list.note || list.old) continue;
    const seen = context.inventory.cursor ? context.inventory.cursor[family] : void 0;
    for (const server of list.servers || []) {
      if (!server.cursorEntry || !(server.clients || []).includes("cursor")) continue;
      const at2 = `${server.name} (${server.scope})`;
      const copy = seen ? seen.entries[server.name] : void 0;
      if (!seen || !copy) {
        out.skipped.push(`${at2}: Cursor's copy is not in ${seen ? seen.file : `Cursor's ${family} file`} - not checked; /alfred-tools:fix settles it`);
        continue;
      }
      const row = server.row ? context.catalog.byId.get(server.row) : void 0;
      if (JSON.stringify(copy) !== JSON.stringify(maskCredentials(server.cursorEntry, row))) {
        out.skipped.push(`${at2}: Cursor's copy in ${seen.file} differs from the list - not checked; /alfred-tools:fix settles it`);
        continue;
      }
      const from = pinnedVersion(server.cursorEntry, packageSpec.name);
      if (!from) continue;
      if (!versions) {
        try {
          versions = await context.registry.versionsOf(packageSpec.registry, packageSpec.name);
        } catch (caught) {
          out.errors.push(`${at2} in Cursor: ${packageSpec.registry} lookup for ${packageSpec.name} failed - ${errorMessage(caught)}`);
          return;
        }
      }
      const pick = choose(versions, { registry: packageSpec.registry, now: context.now, current: from });
      if (pick.held.length) out.held.push(`${at2} in Cursor: ${heldLine(packageSpec.name, pick.held)}`);
      if (!pick.offer) continue;
      const entry = bumpEntry(server.cursorEntry, packageSpec.name, pick.offer.version, cutoffOf(context.now));
      if (!entry) continue;
      out.offers.push({ kind: "cursor-pin", id: `cursor-pin:${server.name}~${server.scope}`, name: server.name, scope: server.scope, row: server.row, family, list: list.file, file: seen.file, server, package: packageSpec.name, from, to: pick.offer.version, ageDays: pick.offer.ageDays, cutoff: cutoffOf(context.now), old: server.cursorEntry, entry, group: "mcp", label: `${server.name} (${server.scope}, Cursor)` });
    }
  }
}

// scripts/update/offers-files.ts
var import_mcp_headers5 = __toESM(require_mcp_headers(), 1);
var import_mcp_bridge5 = __toESM(require_mcp_bridge(), 1);

// scripts/fix/fix.ts
import fs36 from "node:fs";
import path36 from "node:path";

// scripts/apply/run.ts
import fs24 from "node:fs";
import path25 from "node:path";

// scripts/apply/fetch.ts
import fs18 from "node:fs";
import path21 from "node:path";

// scripts/apply/serena-config.ts
import fs17 from "node:fs";
import path20 from "node:path";

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
    return fs17.readFileSync(file, "utf8");
  } catch {
    return null;
  }
};
function baseModesState(file) {
  const text = readText2(file);
  if (text === null) return "absent";
  const lines = linesOf(text);
  const location = locate(lines);
  if (!location) return "absent";
  if (location.inline === "[]") return "empty";
  if (location.inline === "" && location.end === location.at + 1) return "empty";
  return "set";
}
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
  replaceFile(file, next, fs17.statSync(file).mode & 511);
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
  if (fs17.existsSync(file)) return { wrote: false, detail: `${file} is there already` };
  fs17.mkdirSync(path20.dirname(file), { recursive: true });
  fs17.writeFileSync(file, `projects: []
base_modes: []
${FOLDER_KEY}: ${wanted.value}
`, { flag: "wx" });
  return { wrote: true, detail: `wrote ${file} with ${FOLDER_KEY}` };
}
function editableHome(home, context = {}) {
  if (alfredSerenaHome(home))
    return { ok: false, reason: `serena's settings at ${configOf(home)} are alfred-code's - base_modes is left; its manual still names edit tools serena does not have` };
  return { ok: true, shared: context.platform === "win32" };
}
function planNote(entry, context = {}) {
  const home = entry && entry.env && entry.env.SERENA_HOME;
  if (!home) return null;
  const file = configOf(home);
  const editable = editableHome(home, context);
  if (!editable.ok) return editable.reason;
  const folder = folderValue(home);
  if ("error" in folder) return `serena's settings at ${file}: ${folder.error}; its folders stay in each project`;
  if (editable.shared) return `serena's settings at ${file} are shared with any other Serena on this machine; base_modes: [] and ${FOLDER_KEY} (each project's .serena folder under ${home}/projects) apply to all of them`;
  return `serena's settings at ${file}: base_modes: [] after its first start, so its manual names only the tools it has; ${FOLDER_KEY} puts each project's .serena folder under ${home}/projects`;
}

// scripts/apply/constants.ts
var GITIGNORE_ALL = "*\n";

// scripts/apply/fetch.ts
var VERSION = 1;
var fetchJob = (project, fetch2, check) => ({ version: VERSION, project, fetch: fetch2, check: [...new Set(check)] });
function writeJob(file, job, { append = false } = {}) {
  fs18.mkdirSync(path21.dirname(file), { recursive: true });
  const prior = append && fs18.existsSync(file) ? JSON.parse(fs18.readFileSync(file, "utf8")) : null;
  const fetch2 = job.fetch.map((step) => {
    const keptStep = maskCredentials({ args: step.argv, env: step.env }, null);
    return { ...step, argv: keptStep.args, env: keptStep.env };
  });
  const out = prior ? { ...prior, fetch: [...prior.fetch, ...fetch2], check: [.../* @__PURE__ */ new Set([...prior.check, ...job.check])] } : { ...job, fetch: fetch2 };
  fs18.writeFileSync(file, `${JSON.stringify(out, null, 2)}
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

// scripts/plan/render.ts
function reconnectLine({ name, variable, file, filled, anonymous, hint = null }) {
  if (filled) return `${name}: connects with its key at the next session start; in a session already running, /mcp -> ${name} -> Reconnect`;
  return `${name}: fill ${variable} in ${file}${hint ? ` (${hint})` : ""}, then Reconnect it in /mcp - until then ${anonymous ? "it runs without the key, at lower rate limits" : "it connects without the key, and /mcp shows needs authentication"}`;
}

// scripts/mcps-list/mcp-order.ts
import fs19 from "node:fs";
var LEFT = "left as it is - /alfred-tools:fix (mcp-order) orders it";
var ORDER_REASON = ".mcp.json: the catalog servers in your order, your own after them - no value changes";
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
function orderFile(file, catalog, own = /* @__PURE__ */ new Set(), { read: read2 = fs19.readFileSync, write = fs19.writeFileSync, rename = fs19.renameSync } = {}) {
  const warn = (why) => ({ ok: true, changed: false, detail: `warning: ${file} ${why}; ${LEFT}` });
  let text;
  try {
    text = read2(file, "utf8");
  } catch (caught) {
    const code = errorCode(caught);
    return code === "ENOENT" || code === "ENOTDIR" ? { ok: true, changed: false, detail: `${file}: not there - nothing to order` } : warn(`cannot be read (${code || errorMessage(caught)})`);
  }
  const reordered = reorderText(text, catalog, own);
  if (reordered.error !== void 0) return warn(reordered.error);
  if (!reordered.changed) return { ok: true, changed: false, detail: `${file}: the servers are already in order` };
  let target = file;
  try {
    target = fs19.realpathSync(file);
  } catch {
  }
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    let now = null;
    try {
      now = read2(file, "utf8");
    } catch {
    }
    if (now !== text) return warn("changed while it was being ordered");
    write(temporary, reordered.text);
    rename(temporary, target);
  } catch (caught) {
    try {
      fs19.rmSync(temporary, { force: true });
    } catch {
    }
    return warn(`could not be written (${errorCode(caught) || errorMessage(caught)})`);
  }
  return { ok: true, changed: true, detail: `ordered ${file}: the catalog servers first, your own after them - no value changed` };
}
function ownProjectNames(inventory, existing = {}) {
  const names2 = (inventory.registrations || []).flatMap((registration) => registration.scope === "project" && registration.choice === "own" && registration.name !== void 0 ? [registration.name] : []);
  for (const [key, choice] of Object.entries(existing || {})) {
    const [, name] = /^mcp:(.+)~project$/.exec(key) ?? [];
    if (name !== void 0 && choice === "own") names2.push(name);
  }
  return [...new Set(names2)];
}
function withOrderStep(steps, project, own = []) {
  const writes = steps.some((step) => typeof step.op === "string" && ["mcp-add", "mcp-replace"].includes(step.op) && step.scope === "project" || step.op === "mcp-move" && isRecord(step.to) && step.to["scope"] === "project");
  if (!writes) return steps;
  const pathApi = pathApiOf(project);
  const order = { op: "order-mcp-json", file: pathApi.join(project, MCP_JSON), own, why: ORDER_REASON };
  return [...steps, order];
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
  const where2 = `'${to.name}' (${to.scope})`;
  const { name, files } = key;
  const fill2 = (value) => ({ ...step, entry: fillKeys(step.entry, row, routeId, to.scope, { [tokenVar]: value }) });
  const found = valueIn(files, name);
  if (found) return { step: fill2(found.value), note: `${name} for ${where2} from ${found.file}` };
  const old = "old" in step ? step.old : void 0;
  const held = old ? tokenFields(old, route).map((field) => valueAt(old, field.at)).find((candidate) => typeof candidate === "string" && candidate !== "" && !PLACEHOLDER.test(candidate) && !candidate.includes(MARKER)) : void 0;
  if (typeof held === "string") return { step: fill2(held), note: `${name} for ${where2} is in none of ${files.join(", ")} - the key it holds is kept; fill ${name} in ${files[0]} to replace it` };
  return { step: fill2(""), note: `${name} for ${where2} is in none of ${files.join(", ")} - written empty: fill ${name} in ${files[0]}, then run /alfred-tools:configure and keep ${name} as the key's name - it writes the key in` };
}

// scripts/apply/file-steps.ts
import fs20 from "node:fs";
import path22 from "node:path";
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
    return fs20.readFileSync(path22.join(root2, name, ".gitignore"), "utf8").trim() === "*";
  } catch {
    return false;
  }
}
function rootIgnoreLines(root2) {
  let names2 = [];
  try {
    names2 = fs20.readdirSync(root2);
  } catch {
  }
  const mine = names2.every((name) => pluginWritten(root2, name));
  const want = mine ? GITIGNORE.trim().split("\n") : [FILES.secrets, FILES.record, FILES.list, `${FILES.signIns}/`];
  const file = path22.join(root2, ".gitignore");
  let text = null;
  try {
    text = fs20.readFileSync(file, "utf8");
  } catch {
  }
  const have = new Set((text || "").split(/\r?\n/).map((line) => line.trim()));
  return { file, text, mine, want, lack: want.filter((line) => !have.has(line)) };
}
function writeExcludeFile(root2, tools) {
  const file = path22.join(root2, FILES.macosExclude);
  if (fs20.existsSync(file)) return { ok: true, detail: `${file} is there - kept as it is`, unchanged: true };
  fs20.mkdirSync(root2, { recursive: true });
  replaceFile(file, excludeToml(tools));
  return { ok: true, detail: `wrote ${file} (${tools.join(", ")} off)` };
}
function rootIgnore(root2) {
  if (path22.basename(root2) === ALFRED_DATA) return { ok: true, detail: `${root2} is alfred-code's - its own .gitignore covers it; nothing written` };
  const { file, text, want, lack } = rootIgnoreLines(root2);
  if (text === null) {
    fs20.mkdirSync(root2, { recursive: true });
    fs20.writeFileSync(file, appendLines("", want));
    return { ok: true, detail: `wrote ${file} (${want.join(", ")})` };
  }
  if (!lack.length) return { ok: true, detail: `${file} has every line it needs - left as it is` };
  fs20.writeFileSync(file, appendLines(text, lack));
  return { ok: true, detail: `appended ${lack.join(", ")} to ${file}` };
}
function ensureCommonjs(root2) {
  const file = path22.join(root2, "package.json");
  let text = null;
  try {
    text = fs20.readFileSync(file, "utf8");
  } catch {
  }
  if (text === null) {
    fs20.mkdirSync(root2, { recursive: true });
    fs20.writeFileSync(file, '{"type":"commonjs"}\n');
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
  const file = path22.join(root2, FILES[kind]);
  const { state, number } = shippedState(kind, file);
  const { word, version, plain } = SHIPPED[kind];
  if (plain && !fs20.existsSync(root2)) {
    fs20.mkdirSync(root2, { recursive: true });
    fs20.writeFileSync(path22.join(root2, ".gitignore"), GITIGNORE_ALL);
  }
  const packageJsonResult = plain ? { wrote: false, note: null } : ensureCommonjs(root2);
  const withPkg = (detail) => ({ ok: true, detail: [detail, packageJsonResult.wrote ? `wrote ${path22.join(root2, "package.json")} (type commonjs)` : null, packageJsonResult.note].filter(Boolean).join("; ") });
  if (state === "same") return withPkg(`${file} is up to date - left as it is`);
  if (state === "higher") return withPkg(`${FILES[kind]} in ${root2} is newer than this plugin - update alfred-tools`);
  if (state === "edited") return withPkg(`${file} changed since alfred-tools wrote it - left; /alfred-tools:fix rewrites it`);
  fs20.writeFileSync(file, shippedSource(kind));
  return withPkg(state === "lower" ? `rewrote ${file} (${word} ${number} -> ${version()})` : `wrote ${file} (${word} ${version()})`);
}
function serenaConfigInit(file, home) {
  try {
    if (!fs20.existsSync(home)) {
      fs20.mkdirSync(home, { recursive: true });
      fs20.writeFileSync(path22.join(home, ".gitignore"), GITIGNORE_ALL);
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
    buffer = fs20.readFileSync(file);
  } catch {
  }
  if (buffer && buffer[0] === 255 && buffer[1] === 254) return { ok: true, detail: `${file} is UTF-16 - add ${names2.map((name) => `${name}=`).join(", ")} to it yourself; nothing written` };
  const text = buffer ? buffer.toString("utf8") : null;
  const have = new Set(namesIn(file));
  const lack = [...new Set(names2)].filter((name) => !have.has(name));
  const list = lack.map((name) => `${name}=`).join(", ");
  if (text === null) {
    fs20.mkdirSync(path22.dirname(file), { recursive: true });
    fs20.writeFileSync(file, appendLines("", [KEY_HEAD, ...lack.map((name) => `${name}=`)]), process.platform === "win32" ? {} : { mode: 384 });
    return { ok: true, detail: `created ${file} with ${list || "no name"} - names only, you fill in each value` };
  }
  if (!lack.length) return { ok: true, detail: `${file} has ${names2.join(", ")} - left as it is` };
  fs20.writeFileSync(file, appendLines(text, lack.map((name) => `${name}=`)));
  return { ok: true, detail: `appended ${list} to ${file} - names only, you fill in each value` };
}
function keepAsIs(read2) {
  if (!read2 || read2.state !== "newer" && read2.state !== "unreadable") return null;
  const what = read2.note.replace(/ - read as empty$/, "");
  return { ok: true, detail: `${what} - left as it is; ${read2.state === "newer" ? "update alfred-tools" : "check its permissions"}, then run the command again` };
}
function writeJson(file, doc, read2) {
  fs20.mkdirSync(path22.dirname(file), { recursive: true });
  let backupPath = null;
  if (read2 && read2.state === "bad" && fs20.existsSync(file)) {
    backupPath = `${file}.bak`;
    fs20.copyFileSync(file, backupPath);
  }
  replaceFile(file, `${JSON.stringify(doc, null, 2)}
`);
  return backupPath;
}
var readNote = (read2, backupPath) => read2 && read2.note ? ` - ${read2.note}${backupPath ? `; the old file kept as ${backupPath}` : ""}` : "";
function listWrite(step, context, { failure = false } = {}) {
  const read2 = readList(step.file);
  let base = read2;
  if (!read2) {
    const old = readOldRecord(path22.join(path22.dirname(step.file), FILES.record));
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
    const forCursor2 = (server.clients || []).includes("cursor");
    if (form === "two" && forCursor2) {
      const listed = (base && base.servers || []).find((listServer) => serverKey(listServer) === serverKey(server));
      const prior = server.cursorEntry || listed && listed.cursorEntry || null;
      const copy = bridgeFormOf(server.entry, context.catalog || load(), prior);
      if (copy) server.cursorEntry = copy;
      else delete server.cursorEntry;
    } else if (form !== void 0 || !forCursor2) delete server.cursorEntry;
    const { entry } = server;
    if (entry === null) continue;
    upserts.push({ ...server, entry });
  }
  const drops = (step.drops || []).filter((drop) => !drop.after || applied.has(drop.after)).map((drop) => drop.key);
  const doc = mergeList(base, { upserts, drops, own: step.own ? ownOf(step.own) : void 0, cursorOffer: step.cursorOffer });
  return writeList(step.file, doc, read2);
}
function settingsTarget(file) {
  let isLink = false;
  try {
    isLink = fs20.lstatSync(file).isSymbolicLink();
  } catch {
    return { file };
  }
  if (!isLink) return { file };
  try {
    return { file: fs20.realpathSync(file) };
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
    text = fs20.readFileSync(real, "utf8");
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
    text = fs20.readFileSync(real, "utf8");
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
    fromStats = fs20.lstatSync(from);
  } catch {
    return { ok: true, detail: `${from}: not there - nothing to move` };
  }
  let there = null;
  try {
    there = fs20.lstatSync(to);
  } catch {
  }
  if (!there) {
    fs20.mkdirSync(path22.dirname(to), { recursive: true });
    try {
      fs20.renameSync(from, to);
    } catch (caught) {
      if (errorCode(caught) !== "EXDEV") throw caught;
      fs20.cpSync(from, to, { recursive: true });
      fs20.rmSync(from, { recursive: true, force: true });
    }
    return { ok: true, detail: `moved ${from} to ${to}` };
  }
  if (fromStats.isFile() && there.isFile() && fs20.readFileSync(from).equals(fs20.readFileSync(to))) {
    fs20.rmSync(from);
    return { ok: true, detail: `${to} holds the same as ${from} - removed ${from}` };
  }
  return { ok: false, detail: `${to} is there already and is not ${from} - nothing moved; move or remove one of them, then run the command again` };
}
function retireRecord(file) {
  if (!fs20.existsSync(file)) return { ok: true, detail: `${file}: not there - nothing to move` };
  let to = `${file}.0.4.bak`;
  for (let suffix = 2; fs20.existsSync(to); suffix++) to = `${file}.0.4.bak.${suffix}`;
  fs20.renameSync(file, to);
  return { ok: true, detail: `moved ${file} to ${to} - its entries are in the list now` };
}
function retireShipped(step) {
  const { state } = shippedState(step.kind, step.file);
  if (state === "absent") return { ok: true, detail: `${step.file} is already gone` };
  if (state === "edited") return { ok: true, detail: `left ${step.file} - edited by hand` };
  if (state !== "same") return { ok: true, detail: `left ${step.file} - not this plugin's current copy` };
  if (step.namedBy.length) return { ok: true, detail: `left ${step.file} - still named by ${step.namedBy.join(", ")}` };
  fs20.rmSync(step.file);
  return { ok: true, detail: `removed ${step.file}` };
}
function failureLists(plan2, report, context, log = () => {
}) {
  const out = [];
  for (const step of plan2.steps.filter((planStep) => planStep.op === "list-write")) {
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
  const file = path22.join(data, FILES.map);
  const next = withRoot(map, step.family, path22.resolve(step.project), step.root);
  if (!map.state && fs20.existsSync(file) && JSON.stringify(next) === JSON.stringify(map)) return { ok: true, detail: `${file} already names the ${step.family} root ${step.root} - left as it is` };
  const backupPath = writeJson(file, next, map);
  return { ok: true, detail: `recorded the ${step.family} root ${step.root} in ${file}${readNote(map, backupPath)}` };
}

// scripts/apply/serena-folder-move.ts
import fs22 from "node:fs";
import { spawnSync as spawnSync6 } from "node:child_process";

// scripts/apply/serena-projects.ts
import fs21 from "node:fs";
var PROJECTS_KEY = /^projects[ \t]*:(.*?)\r?$/;
var BLOCK_ITEM = /^[ \t]*-[ \t]+(.*?)\r?$/;
function projectsOf(file) {
  let text;
  try {
    text = fs21.readFileSync(file, "utf8");
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
    return fs22.statSync(folder).isDirectory();
  } catch {
    return false;
  }
};
var exists = (target) => {
  try {
    fs22.lstatSync(target);
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
  const listed = spawnSync6("git", ["-C", project, "ls-files", "--", SERENA_FOLDER], { encoding: "utf8", windowsHide: true });
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
var copyWhole = (from, to) => fs22.cpSync(from, to, { recursive: true, force: false, errorOnExist: true });
var removeWhole = (folder) => fs22.rmSync(folder, { recursive: true, force: true });
function moveFolder(from, to, { rename = fs22.renameSync, copy = copyWhole, remove = removeWhole } = {}) {
  fs22.mkdirSync(pathApiOf(to).dirname(to), { recursive: true });
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
import fs23 from "node:fs";
import path24 from "node:path";

// scripts/apply/git-tracked.ts
import { spawnSync as spawnSync7 } from "node:child_process";
import path23 from "node:path";
var NOT_A_REPOSITORY = /not a git repository/i;
var runGit = (args, cwd) => {
  const result = spawnSync7("git", args, { cwd, encoding: "utf8", windowsHide: true, env: { ...process.env, LC_ALL: "C" } });
  return { status: result.status, stderr: result.stderr || "", error: result.error };
};
function trackedState(file, run = runGit) {
  const answer = run(["ls-files", "--error-unmatch", "--", path23.basename(file)], path23.dirname(file));
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
    return fs23.readFileSync(file, "utf8");
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
  const name = fold ? path24.basename(file).toLowerCase() : path24.basename(file);
  const accountPath = accountFile(env);
  const accountText = textOf2(accountPath);
  const projects = [.../* @__PURE__ */ new Set([project, ...accountText ? projectKeys(accountText) : []])];
  const place = { platform: process.platform, home: homeDir(env), env };
  const candidates = [
    accountPath,
    fileFor("global", place),
    ...projects.flatMap((each) => [path24.join(each, MCP_JSON), fileFor("project", { ...place, project: each })])
  ];
  for (const candidate of candidates) {
    const text = candidate === accountPath ? accountText : textOf2(candidate);
    if (text === null) return `${candidate} could not be read`;
    if ((fold ? text.toLowerCase() : text).includes(name)) return `${candidate} names it`;
  }
  return null;
}
function retireHelper(step, context, options2 = {}) {
  if (!fs23.existsSync(step.file)) return { ok: true, detail: `${step.file} is already gone` };
  const kept = keepReason(step.file, { project: context.project, env: context.env, ...options2 });
  if (kept) return { ok: true, detail: `left ${step.file} - ${kept}` };
  fs23.rmSync(step.file);
  return { ok: true, detail: `removed ${step.file}` };
}

// scripts/apply/run.ts
function runStep(step, context, call) {
  switch (step.op) {
    case "ensure-dir": {
      const existed = fs24.existsSync(step.path);
      fs24.mkdirSync(step.path, { recursive: true });
      if (!existed) fs24.writeFileSync(path25.join(step.path, ".gitignore"), GITIGNORE_ALL);
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
      const file = path25.join(context.tmp, "rollback.json");
      fs24.mkdirSync(context.tmp, { recursive: true });
      fs24.writeFileSync(file, JSON.stringify({ name: step.name, scope: step.scope, entry: maskCredentials(step.old, rowOf(context, step)), project: context.project }, null, 2));
      const removeResult = removeAndVerify(call, context, step.name, step.scope);
      if (!removeResult.ok) return { ok: false, detail: `${removeResult.detail} - the old entry is untouched or restored by hand: ${restoreBy(context, step, step.name, step.scope, step.old)}` };
      const add2 = addAndVerify(call, context, step.name, step.scope, step.entry, rowOf(context, step));
      if (add2.ok) return { ok: true, detail: `rewrote '${step.name}' at ${step.scope} scope (old entry saved in ${file})` };
      const back = addAndVerify(call, context, step.name, step.scope, step.old, rowOf(context, step));
      return { ok: false, detail: `${add2.detail}; ${back.ok ? "the old entry was re-added" : `RESTORE BY HAND: ${restoreBy(context, step, step.name, step.scope, step.old)}`}` };
    }
    case "mcp-move": {
      const add2 = addAndVerify(call, context, step.to.name, step.to.scope, step.entry, rowOf(context, step));
      if (!add2.ok) return { ok: false, detail: `${add2.detail}; the old '${step.from.name}' at ${step.from.scope} scope is untouched` };
      const removeResult = removeAndVerify(call, context, step.from.name, step.from.scope);
      if (!removeResult.ok) return { ok: false, detail: `${removeResult.detail}; the new one is in place, the old one is still there - remove it by hand: claude mcp remove ${step.from.name} -s ${step.from.scope}` };
      return { ok: true, detail: `moved '${step.from.name}' (${step.from.scope}) to '${step.to.name}' (${step.to.scope}): added, read back, old removed` };
    }
    default:
      return { ok: false, detail: `unknown operation ${step.op}` };
  }
}
function apply(plan2, { env = process.env, tmp, runCli = runClaude, log = console.log, fetchFile, data = null } = {}) {
  const project = plan2.project;
  const report = { applied: [], failed: null, notRun: [], readback: [], keys: [], noop: false, toFetch: [], fetch: null, fetchFile: null, tmp: tmp || null, appliedKeys: /* @__PURE__ */ new Set(), cursorFiles: /* @__PURE__ */ new Set(), lists: [] };
  if (!plan2.steps.length) {
    report.noop = true;
    log("Nothing to apply: every answer already matches what is installed. No claude call was made.");
    return report;
  }
  const context = { project, env, tmp: tmp || makeTempDir(), runCli, catalog: load(), alfredEnabled: Boolean(plan2.alfredCodeEnabled), data };
  const call = makeRunner(context);
  context.call = call;
  context.report = report;
  report.tmp = context.tmp;
  for (const [i, step] of plan2.steps.entries()) {
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
    report.notRun = plan2.steps.slice(i + 1).map((skippedStep, k) => ({ i: i + 2 + k, op: skippedStep.op, why: skippedStep.why }));
    break;
  }
  if (report.failed) {
    log("", `Stopped at step ${report.failed.i}. Already applied and left in place: ${report.applied.length ? report.applied.map((appliedStep) => `${appliedStep.i} (${appliedStep.detail})`).join("; ") : "nothing"}.`);
    if (report.notRun.length) log(`Not run: ${report.notRun.map((notRunStep) => `${notRunStep.i} ${notRunStep.op}`).join(", ")}.`);
    report.lists = failureLists(plan2, report, context, log);
  }
  const builtInventory = buildInventory({ project, env });
  for (const expected2 of plan2.expect || []) {
    const got = builtInventory.registrations.find((registration) => registration.name === expected2.name && registration.scope === expected2.scope);
    report.readback.push({ kind: "mcp", name: expected2.name, scope: expected2.scope, expectedRoute: expected2.route, found: Boolean(got), route: got ? got.route : null, row: got ? got.rowId : null });
  }
  log("", "Read back:");
  for (const readbackEntry of report.readback)
    log(`  ${readbackEntry.found ? "ok " : "MISSING"} ${readbackEntry.name} - ${readbackEntry.scope} scope, ${readbackEntry.route || "?"} route${readbackEntry.row ? ` (${readbackEntry.row})` : ""}`);
  const done = new Set(report.applied.map((appliedStep) => appliedStep.i));
  const written = plan2.steps.flatMap((planStep, i) => {
    if (!done.has(i + 1)) return [];
    if (planStep.op === "mcp-move") return [planStep.to];
    return planStep.op === "mcp-add" || planStep.op === "mcp-replace" ? [{ name: planStep.name, scope: planStep.scope }] : [];
  });
  const unfilled = new Set(plan2.steps.flatMap((planStep) => "filled" in planStep && planStep.filled === false ? [planStep.op === "mcp-move" ? planStep.to.name : planStep.name] : []));
  const fresh = written.map((endpoint) => endpoint.name).filter((name) => !unfilled.has(name));
  const scopeOf = new Map(written.map((endpoint) => [endpoint.name, endpoint.scope]));
  const reconnect = (plan2.reconnect || []).filter((reconnectEntry) => scopeOf.has(reconnectEntry.name));
  const now = new Set(reconnect.map((reconnectEntry) => reconnectEntry.name));
  const toFetch = report.toFetch.filter((fetchStep2) => scopeOf.has(fetchStep2.name)).map((fetchStep2) => ({ ...fetchStep2, scope: scopeOf.get(fetchStep2.name) }));
  report.fetch = fetchJob(project, toFetch, toFetch.length ? fresh.filter((name) => !now.has(name)) : fresh);
  let statuses = [];
  if (!report.fetch.fetch.length) statuses = serverStatus(fresh, { cwd: project, env, runCli, log });
  else {
    if (now.size) statuses = serverStatus([...now], { cwd: project, env, runCli, log });
    if (fetchFile !== false) {
      report.fetchFile = writeJob(fetchFile || path25.join(context.tmp, "fetch.json"), report.fetch);
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

// scripts/fix/registration.ts
import fs25 from "node:fs";
import path26 from "node:path";

// scripts/fix/common.ts
var fixOf = (context, id) => context.catalog.fixes.find((fixRow) => fixRow.id === id);
var rowOf2 = (context, id) => context.catalog.byId.get(id);
function registrationsOf(context, fixId) {
  const fixRow = fixRowOf(context, fixId);
  return context.inventory.registrations.filter((registration) => isManaged(registration) && registration.scope !== "inherited" && registration.rowId !== null && fixRow.tool.includes(registration.rowId));
}
function routeOf(context, registration) {
  const row = registration.rowId ? rowOf2(context, registration.rowId) : void 0;
  return row && registration.route ? row.routes[registration.route] : void 0;
}
var expandVars2 = (text, env) => {
  const expanded = expandVars(text, env);
  return expanded.unset.length ? null : expanded.value;
};
var firstUnset = (text, env) => expandVars(text, env).unset[0] || null;
var fieldOf = (finding2, key) => need(finding2, key, `${finding2.id} on ${finding2.name}: the finding`);
var proposalOf = (finding2, key) => need(fieldOf(finding2, "proposal"), key, `${finding2.id} on ${finding2.name}: the proposal`);
function findingRoute(context, finding2) {
  const row = rowOf2(context, fieldOf(finding2, "row"));
  const route = row ? row.routes[fieldOf(finding2, "route")] : void 0;
  if (!route) throw new Error(`${finding2.id} on ${finding2.name}: no route ${finding2.route} in catalog row ${finding2.row}`);
  return route;
}
function fixRowOf(context, id) {
  const fixRow = fixOf(context, id);
  if (!fixRow) throw new Error(`no fix row ${id} in catalog/fixes.json`);
  return fixRow;
}
function need(holder, key, what) {
  const value = holder[key];
  if (value === void 0 || value === null) throw new Error(`${what} has no ${String(key)}`);
  return value;
}
var blockedAtPlan = (redetected, picked) => redetected.filter((candidate) => candidate.blocked && picked.some((pickedFinding) => pickedFinding.id === candidate.id && pickedFinding.name === candidate.name && pickedFinding.scope === candidate.scope && pickedFinding.app === candidate.app));
var finding = (fixId, registration, what, extra = {}) => ({ id: fixId, row: registration.rowId, name: registration.name, scope: registration.scope, found: what, ...extra });
function homeContextOf(entry, platform, fileName) {
  const home = entry.env && entry.env.SERENA_HOME;
  if (!home || !editableHome(home, { platform }).ok) return null;
  return pathFor(platform).join(home, fileName);
}

// scripts/fix/constants.ts
var ONE_VAR = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;
var FIX_ID = { context7KeyEnv: "context7-key-env", sentryAuthEnv: "sentry-auth-env", keyToLauncher: "key-to-launcher", retiredServer: "retired-server", macosConfig: "macos-config", startTimeout: "start-timeout" };
var LAUNCHER_SCOPES = ["local", "user"];
var DECLINE = { prefix: "mcp:", hash: "sha256", hexLength: 12, userScope: "user" };
var READ_GUARD_RESIDUAL = {
  sandboxed: " - a recursive grep or a script that opens the file still reads it unless Claude Code's sandbox is on (/sandbox)",
  win32: " - a recursive grep or a script that opens the file still reads it: native Windows has no sandbox (WSL2 has)"
};

// scripts/fix/registration.ts
var eachReg = (context, id, toFinding) => registrationsOf(context, id).flatMap((registration) => {
  const route = routeOf(context, registration);
  const found = route ? toFinding(registration, route) : null;
  return found ? [found] : [];
});
function windowsHomeOf(value, context) {
  const expanded = value.replace(/\$\{(?:HOME|USERPROFILE)\}/g, context.home);
  return path26.win32.resolve(context.inventory.project, expanded).replace(/\\+$/, "");
}
function serenaWindowsHomeDetect(context) {
  if (context.platform !== "win32") return [];
  return eachReg(context, "serena-windows-home", (registration) => {
    const value = (registration.entry.env || {}).SERENA_HOME;
    if (value === void 0) return unsetSerenaHome(registration, context);
    if (typeof value !== "string" || validWindowsSerenaHome(value)) return null;
    if (registration.scope === "project" && value.includes("${")) return null;
    const faults = [!path26.win32.isAbsolute(value) && "not absolute", value.includes("/") && "forward slashes", /\s/.test(value) && "a space"].filter(Boolean);
    const what = `SERENA_HOME is '${value}' (${faults.join(", ")})`;
    const same2 = windowsHomeOf(value, context);
    if (validWindowsSerenaHome(same2)) return finding("serena-windows-home", registration, what, { proposal: { SERENA_HOME: same2 }, note: `same folder, written absolute with backslashes: ${same2}` });
    const fresh = serenaWindowsHome({ home: context.home });
    if (fresh.root) return finding("serena-windows-home", registration, what, { proposal: { SERENA_HOME: fresh.root.path }, note: `a new home, ${fresh.root.path} - serena's data in '${value}' is not moved and its language servers download again (~327MB)` });
    if (registration.scope === "project") return finding("serena-windows-home", registration, what, { blocked: SPACED_PROJECT });
    return finding("serena-windows-home", registration, what, { input: { id: "serenaHome", prompt: fresh.needsInput } });
  });
}
var SPACED_PROJECT = "serena's home on Windows must be space-free - pick a space-free folder with /alfred-tools:configure, Location";
function unsetSerenaHome(registration, context) {
  const profile = context.home || "";
  if (!/\s/.test(profile)) return null;
  const what = `no SERENA_HOME: serena's default home, ${path26.win32.join(profile, ".serena")}, has a space`;
  if (registration.scope === "project") return finding("serena-windows-home", registration, what, { blocked: SPACED_PROJECT });
  const free = serenaSpaceFree(context).path;
  return finding("serena-windows-home", registration, what, { proposal: { SERENA_HOME: free }, note: `a new home, ${free} - serena's data in ${path26.win32.join(profile, ".serena")} is not moved and its language servers download again (~327MB)` });
}
function serenaWindowsHomeFix(entry, finding2, _context, input = {}) {
  const home = finding2.proposal && finding2.proposal.SERENA_HOME || input.serenaHome;
  if (!home || !validWindowsSerenaHome(home)) throw new Error(`serena's home must be an absolute Windows folder in backslashes with no space; '${home || ""}' is not (pass --input serenaHome=<folder>)`);
  return { ...entry, env: { ...entry.env || {}, SERENA_HOME: home } };
}
var pythonAt = (args) => args.findIndex((argument) => argument === "--python" || argument === "-p" || argument.startsWith("--python="));
function uvxPythonDetect(context) {
  return eachReg(context, "uvx-python", (registration, route) => {
    if (launcher(registration.entry) !== "uvx" || pythonAt(launchArgs(registration.entry)) >= 0) return null;
    const want = pythonRequest(route, context, context.rules);
    return finding("uvx-python", registration, `no --python: uvx picks the newest CPython, which has no wheel for some dependencies`, { proposal: { python: want } });
  });
}
function uvxPythonFix(entry, finding2, _context) {
  return { ...entry, args: ["--python", proposalOf(finding2, "python"), ...entry.args || []] };
}
function windowsArmPythonDetect(context) {
  if (!isWindowsArm(context)) return [];
  return eachReg(context, "windows-arm-python", (registration) => {
    if (launcher(registration.entry) !== "uvx") return null;
    const args = launchArgs(registration.entry);
    const at2 = args.indexOf("--python");
    const minor = at2 >= 0 ? args[at2 + 1] : null;
    if (!minor || !/^\d+\.\d+$/.test(minor)) return null;
    return finding("windows-arm-python", registration, `--python ${minor} on Windows ARM64: several dependencies ship no ARM64 wheel`, { proposal: { python: context.rules.windowsArmPython.replace("{minor}", minor), from: minor } });
  });
}
function windowsArmPythonFix(entry, finding2) {
  const args = [...entry.args || []];
  args[args.indexOf("--python") + 1] = proposalOf(finding2, "python");
  return { ...entry, args };
}
function windowsNpxCmdDetect(context) {
  if (context.platform !== "win32") return [];
  return eachReg(context, "windows-npx-cmd", (registration) => {
    if (path26.basename(String(launchOf(registration.entry).command || "")).replace(/\.(exe|cmd)$/i, "") !== "npx") return null;
    return finding("windows-npx-cmd", registration, "npx is launched directly on native Windows", { note: "a precaution: Claude Code no longer documents the cmd /c wrapper and this build has not proved it on a Windows machine" });
  });
}
function windowsNpxCmdFix(entry) {
  const launch = launchOf(entry);
  return withLaunch(entry, { ...launch, command: "cmd", args: ["/c", "npx", ...launch.args || []] });
}
var NO_WEBMCP_SINCE = "0.0.83";
function playwrightWebmcpDetect(context) {
  return eachReg(context, "playwright-webmcp", (registration) => {
    if (launchArgs(registration.entry).includes("--no-webmcp")) return null;
    const pin = pinnedVersion(registration.entry, "@playwright/mcp");
    const documented = NO_WEBMCP_SINCE;
    const older = pin && compareVersions(pin, documented) === -1;
    return finding(
      "playwright-webmcp",
      registration,
      "page-registered WebMCP tools are not switched off (no --no-webmcp)",
      older ? { blocked: `pinned @${pin} is older than ${documented}, the version whose README documents --no-webmcp - update it first (/alfred-tools:update), then fix` } : {}
    );
  });
}
function playwrightWebmcpFix(entry) {
  const args = [...entry.args || []];
  const at2 = args.indexOf("--browser");
  args.splice(at2 >= 0 ? at2 + 2 : args.length, 0, "--no-webmcp");
  return { ...entry, args };
}
var SDK_ENV = ["ANDROID_HOME", "JAVA_HOME"];
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
function appiumSdkEnvDetect(context) {
  return eachReg(context, "appium-sdk-env", (registration) => {
    const env = registration.entry.env || {};
    const missing = SDK_ENV.filter((variableName) => !env[variableName]);
    if (!missing.length) return null;
    const what = `${missing.join(" and ")} not set in the registration`;
    const lookup = { ANDROID_HOME: missing.includes("ANDROID_HOME") ? androidSdk(context) : null, JAVA_HOME: missing.includes("JAVA_HOME") ? javaHome(context) : null };
    const proposal = Object.fromEntries(Object.entries(lookup).filter(([, value]) => value));
    const notFound = missing.filter((variableName) => !proposal[variableName]);
    if (!Object.keys(proposal).length) return finding("appium-sdk-env", registration, what, { blocked: `${notFound.join(" and ")} not found on this machine - install the Android SDK / a JDK first` });
    return finding("appium-sdk-env", registration, what, { proposal, note: notFound.length ? `${notFound.join(" and ")} not found on this machine and left unset` : void 0 });
  });
}
function appiumSdkEnvFix(entry, finding2) {
  const pairs = Object.entries(finding2.proposal || {}).filter((pair) => typeof pair[1] === "string");
  return { ...entry, env: { ...entry.env || {}, ...Object.fromEntries(pairs) } };
}
function serenaTelemetryDetect(context) {
  return eachReg(context, "serena-telemetry", (registration) => (registration.entry.env || {}).SERENA_USAGE_REPORTING === void 0 ? finding("serena-telemetry", registration, "SERENA_USAGE_REPORTING is not set - serena sends a usage ping at every start") : null);
}
function serenaTelemetryFix(entry) {
  return { ...entry, env: { ...entry.env || {}, SERENA_USAGE_REPORTING: "false" } };
}
function serenaContextDetect(context) {
  const resolvedRoots = resolveRoots(context.inventory, null, { project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog }).roots;
  return eachReg(context, "serena-context", (registration) => {
    const root2 = resolvedRoots[familyOf(registration.scope)];
    if (!root2) return null;
    const want = homeContextOf(registration.entry, context.platform, FILES.serenaContext) || pathFor(context.platform).join(root2, FILES.serenaContext);
    const args = registration.entry.args || [];
    const i = args.indexOf("--context");
    const now = i >= 0 ? args[i + 1] : null;
    if (now === want && fs25.existsSync(want)) return null;
    const what = now === want ? `serena names the context ${want}, which is not there` : `serena runs with ${now ? `the context ${now}` : "no --context"} - this plugin's ${want} gives it code navigation only, for Claude Code and Cursor`;
    return finding("serena-context", registration, what, { want, roots: resolvedRoots });
  });
}
function serenaContextFix(entry, finding2) {
  const args = [...entry.args || []];
  const i = args.indexOf("--context");
  if (i >= 0 && i + 1 < args.length) args[i + 1] = fieldOf(finding2, "want");
  else args.push("--context", fieldOf(finding2, "want"));
  return { ...entry, args };
}
var PICK_NAME = "pick the key's name with /alfred-tools:configure";
function keyIn(value, template, tokenVar) {
  const [prefix = "", post = ""] = template.split(`\${${tokenVar}}`);
  const text = String(value);
  return text.length >= prefix.length + post.length && text.startsWith(prefix) && text.endsWith(post) ? text.slice(prefix.length, text.length - post.length) : text;
}
function stdioChainOf(context, scope) {
  const resolvedRoots = resolveRoots(context.inventory, null, { project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog }).roots;
  return stdioChain({ scope, projectRoot: resolvedRoots.project, globalRoot: resolvedRoots.global, platform: context.platform });
}
function tokenSyncDetect(context) {
  return eachReg(context, "token-sync", (registration, route) => {
    if (registration.route === "remote" || !["local", "user"].includes(registration.scope)) return null;
    const [field] = tokenFields(registration.entry, route);
    const tokenVar = route.tokenVar;
    if (!field || !tokenVar) return null;
    const key = keyIn(valueAt(registration.entry, field.at), field.template, tokenVar);
    const chain = stdioChainOf(context, registration.scope);
    const extra = { route: registration.route, chain };
    if (key === "") return finding("token-sync", registration, `the registration's ${tokenVar} is empty`, { ...extra, blocked: PICK_NAME });
    const [, variable] = ONE_VAR.exec(key) ?? [];
    if (variable !== void 0) {
      const at2 = valueIn(chain, variable);
      return at2 ? finding("token-sync", registration, `the registration holds \${${variable}} while ${at2.file} has the key`, { ...extra, keyName: variable }) : null;
    }
    if (nameOfValue(chain, key)) return cursorBehind(context, registration, route, chain, extra);
    const what = `the key in the registration matches no name in ${chain.join(", ")}`;
    return finding("token-sync", registration, what, valueIn(chain, tokenVar) ? { ...extra, keyName: tokenVar } : { ...extra, blocked: PICK_NAME });
  });
}
function cursorBehind(context, registration, route, chain, extra) {
  if (registration.scope !== "user") return null;
  const list = context.inventory.lists && context.inventory.lists.global;
  const server = list && !list.note && !list.old ? (list.servers || []).find((candidate) => candidate.name === registration.name && candidate.scope === "user" && (candidate.clients || []).includes("cursor")) : null;
  if (!server || !server.key) return null;
  const file = fileFor("global", context);
  const read2 = readCursor(file);
  const copy = read2.state === "ok" ? read2.servers[registration.name] : null;
  const [field] = copy ? tokenFields(copy, route) : [];
  const at2 = valueIn(chain, server.key);
  if (!field || !at2 || !route.tokenVar) return null;
  const held = keyIn(valueAt(copy, field.at), field.template, route.tokenVar);
  if (held === at2.value) return null;
  return finding("token-sync", registration, `Cursor's copy in ${file} holds a key other than ${server.key} in ${at2.file}`, { ...extra, keyName: server.key, cursorOnly: true });
}
function tokenSyncFix(entry, finding2, context) {
  if (finding2.cursorOnly) return entry;
  const at2 = valueIn(fieldOf(finding2, "chain"), fieldOf(finding2, "keyName"));
  if (!at2) throw new Error(`${finding2.keyName} is filled in none of ${fieldOf(finding2, "chain").join(", ")} any more - nothing written`);
  const row = rowOf2(context, fieldOf(finding2, "row"));
  const { tokenVar } = findingRoute(context, finding2);
  if (!row || !tokenVar) throw new Error(`${finding2.name}: catalog row ${finding2.row} names no key for route ${finding2.route} - nothing written`);
  return fillKeys(entry, row, fieldOf(finding2, "route"), fieldOf(finding2, "scope"), { [tokenVar]: at2.value });
}
function windowsMcpDrop(server, context) {
  if (server.kind === "plugin") return `claude plugin disable ${server.name} --scope ${server.scope}`;
  const how = server.owner === "catalog" ? "/alfred-tools:configure (Remove)" : `claude mcp remove ${server.name} -s ${server.scope === "inherited" ? "project" : server.scope}`;
  return server.scope === "inherited" ? `${how}, run in ${server.from ? fromHere(context.inventory, server.from) : "the parent folder"}` : how;
}
function windowsMcpOneDetect(context) {
  const servers = windowsMcpServers(context.inventory);
  if (servers.length < 2) return [];
  const at2 = servers.find((server) => server.owner === "catalog") || servers[0];
  if (!at2) return [];
  const list = servers.map((server) => `${server.name} (${server.scope})`).join(", ");
  const drop = servers.map((server) => `${server.name} (${server.scope}): ${windowsMcpDrop(server, context)}`).join("; ");
  return [finding(
    "windows-mcp-one-per-desktop",
    { rowId: "windows-control", name: at2.name, scope: at2.scope },
    `${servers.length} windows-mcp servers start in this project: ${list}`,
    { blocked: `keep one per Windows desktop - ${drop}; a stuck one recovers only in a new Claude Code session` }
  )];
}

// scripts/fix/machine.ts
import crypto from "node:crypto";
import fs29 from "node:fs";
import path30 from "node:path";

// scripts/fix/rename.ts
import fs26 from "node:fs";
import path27 from "node:path";
var OLD_PLUGIN_ID = "preferred-tools@envoydev";
var gates = (finding2) => !finding2.blocked && (finding2.id === "root-move" && finding2.name !== "data" || finding2.id === "root-repoint");
var passesGate = (finding2) => finding2.id === "root-move" || finding2.id === "root-repoint" || finding2.id === "retired-plugin" && finding2.name === OLD_PLUGIN_ID;
var machineOf = (context) => ({ platform: context.platform, project: context.inventory.project, home: context.home });
var isDir2 = (dir) => {
  try {
    return fs26.lstatSync(dir).isDirectory();
  } catch {
    return false;
  }
};
var movedRoots = (context) => movedAt(machineOf(context));
function movedAt(machine) {
  const pathApi = pathFor(machine.platform);
  const out = [];
  for (const base of [.../* @__PURE__ */ new Set([machine.project, machine.home])]) {
    const from = pathApi.join(base, FORMER_ROOT_NAME);
    const to = pathApi.join(base, ROOT_NAME);
    if (isDir2(to) && (!fs26.existsSync(from) || !holdsRootFiles(from))) out.push({ from, to });
  }
  return out;
}
function tokenStarts(text, end, commandLine) {
  if (!commandLine) {
    const eq = text.lastIndexOf("=", end);
    return eq >= 0 ? [0, eq + 1] : [0];
  }
  let quote2 = null;
  let wordStart = 0;
  for (let at2 = 0; at2 < end; at2++) {
    const character = text.charAt(at2);
    if (quote2) {
      if (character === quote2) quote2 = null;
      continue;
    }
    if (character === "\\" && (text[at2 + 1] === "'" || text[at2 + 1] === '"')) {
      at2++;
      continue;
    }
    if (character === "'" || character === '"') {
      quote2 = character;
      continue;
    }
    if (/\s/.test(character)) wordStart = at2 + 1;
  }
  return [wordStart];
}
function repointText(text, moved, machine, commandLine) {
  const win = machine.platform === "win32";
  const pathApi = pathFor(machine.platform);
  const norm = (file) => {
    const normal = pathApi.normalize(file).replace(/[\\/]+$/, "");
    return win ? normal.toLowerCase() : normal;
  };
  const froms = new Set(moved.map((root2) => norm(root2.from)));
  const segment = new RegExp(`${FORMER_ROOT_NAME.replace(".", "\\.")}(?=[\\\\/'"\\s]|$)`, win ? "gi" : "g");
  let out = "";
  let last = 0;
  for (const match of text.matchAll(segment)) {
    const end = match.index + match[0].length;
    const quoted = (start) => commandLine ? helperArgv(text.slice(start, end))[0] || "" : text.slice(start, end).replace(/^['"]/, "");
    if (!tokenStarts(text, match.index, commandLine).some((start) => froms.has(norm(absOf(quoted(start), machine))))) continue;
    out += text.slice(last, match.index) + ROOT_NAME;
    last = end;
  }
  return last ? out + text.slice(last) : text;
}
function repointEntry(entry, moved, machine) {
  if (!moved.length) return entry;
  const one = (value, commandLine = false) => repointText(value, moved, machine, commandLine);
  const out = { ...entry };
  if (typeof entry.command === "string") out.command = one(entry.command);
  if (Array.isArray(entry.args)) out.args = entry.args.map((argument) => typeof argument === "string" ? one(argument) : argument);
  if (entry.env) out.env = Object.fromEntries(Object.entries(entry.env).map(([key, value]) => [key, typeof value === "string" ? one(value) : value]));
  if (typeof entry.headersHelper === "string") out.headersHelper = one(entry.headersHelper, true);
  return out;
}
function rootRepointDetect(context) {
  const moved = movedRoots(context);
  if (!moved.length) return [];
  const machine = machineOf(context);
  const stale = (entry) => entry !== null && entry !== void 0 && !deepEqual(repointEntry(entry, moved, machine), entry);
  const managed2 = registrationsOf(context, "root-repoint");
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const family of FAMILIES) {
    const list = context.inventory.lists && context.inventory.lists[family];
    const servers = list && !list.note && !list.old ? list.servers || [] : [];
    const cursorFile = fileFor(family, { platform: context.platform, project: context.inventory.project, home: context.home, env: context.env || {} });
    const read2 = readCursor(cursorFile);
    const copies = read2.state === "ok" ? read2.servers : {};
    const names2 = [...managed2.filter((registration) => familyOf(registration.scope) === family), ...servers];
    for (const { name, scope } of names2) {
      const key = `${name}~${scope}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const registration = managed2.find((candidate) => candidate.name === name && candidate.scope === scope);
      const owned = context.inventory.registrations.find((candidate) => candidate.name === name && candidate.scope === scope && (candidate.own || candidate.choice === "own"));
      if (owned) continue;
      const server = servers.find((candidate) => candidate.name === name && candidate.scope === scope);
      const copy = server && (server.clients || []).includes("cursor") ? copies[name] : void 0;
      const row = server && server.row ? context.catalog.byId.get(server.row) : void 0;
      const masked2 = (entry) => maskCredentials(repointEntry(entry, moved, machine), row);
      const handEdited = Boolean(copy && stale(copy) && server && !deepEqual(masked2(copy), masked2(server.cursorEntry || server.entry)));
      const where2 = [registration && stale(registration.entry) && "Claude Code's entry", server && list && (stale(server.entry) || stale(server.cursorEntry)) && `the list ${list.file}`, stale(copy) && !handEdited && "Cursor's copy"].filter((part) => typeof part === "string");
      if (!where2.length && handEdited && copy) {
        const from = moved.find((candidate) => !deepEqual(repointEntry(copy, [candidate], machine), copy));
        if (!from) continue;
        out.push({ ...finding("root-repoint", registration || { rowId: server ? server.row : null, name, scope }, `Cursor's copy of ${name} names ${from.from} - the folder moved to ${from.to}`, { tailOnly: true }), blocked: `Cursor's copy of ${name} in ${cursorFile} was changed by hand and names ${from.from} - change it to ${from.to} there, or run /alfred-tools:fix to settle the copy` });
        continue;
      }
      if (!where2.length) continue;
      const root2 = moved.find((candidate) => [registration?.entry, server?.entry, server?.cursorEntry, copy].some((entry) => entry && stale(entry) && !deepEqual(repointEntry(entry, [candidate], machine), entry)));
      if (!root2) continue;
      out.push(finding("root-repoint", registration || { rowId: server ? server.row : null, name, scope }, `${where2.join(", ")} name${where2.length > 1 ? "" : "s"} ${root2.from} - the folder moved to ${root2.to}`, registration && stale(registration.entry) ? {} : { tailOnly: true }));
    }
  }
  return out;
}
function rootRepointFix(entry, _finding, context) {
  return repointEntry(entry, movedRoots(context), machineOf(context));
}
var OPEN_CODES = ["EPERM", "EBUSY", "EACCES"];
function notMoved(from, caught, holders, platform) {
  const code = errorCode(caught);
  if (platform !== "win32" || !OPEN_CODES.includes(code || "")) return `${from} not moved: ${errorMessage(caught)}`;
  const stop = holders.length ? `in /mcp disable ${holders.join(", ")} (${holders.length > 1 ? "servers that keep" : "a server that keeps"} files in it), ` : "";
  return `${from} not moved: a file in it is open (${code}) - ${stop}close Claude Code and Cursor, start Claude Code again, run /alfred-tools:update${holders.length ? ", then enable them in /mcp" : ""}`;
}
function rootMoveDetect(context) {
  const machine = machineOf(context);
  const out = [];
  for (const move of pendingMoves({ project: context.inventory.project, home: context.home, platform: context.platform })) {
    const one = [{ from: move.from, to: move.to }];
    const names2 = (entry) => entry !== null && entry !== void 0 && !deepEqual(repointEntry(entry, one, machine), entry);
    const regs = (context.inventory.registrations || []).filter((registration) => registration.scope !== "inherited" && names2(registration.entry));
    const managed2 = registrationsOf(context, "root-move");
    const mine = regs.filter((registration) => managed2.includes(registration));
    const unmanaged = regs.filter((registration) => !managed2.includes(registration)).map((registration) => `${registration.name} (${registration.scope}) names ${firstPath(registration.entry, move.from, machine)} - not re-pointed, yours to change`);
    const holders = [...new Set(regs.filter((registration) => typeof registration.entry.command === "string").map((registration) => registration.name))];
    const base = { id: "root-move", row: null, name: move.families.join("+"), scope: null, moveFrom: move.from, moveTo: move.to, ...holders.length ? { holders } : {}, ...unmanaged.length ? { unmanaged, note: unmanaged.join("; ") } : {} };
    const dir = pathFor(context.platform).dirname(move.from);
    if (move.state === "link") {
      out.push({ ...base, found: `${move.from} is a link`, blocked: "a link - move its target by hand" });
      continue;
    }
    if (move.state === "both") {
      out.push({ ...base, found: `${move.from} and ${move.to} both hold this plugin's files`, blocked: `both .preferred-tools and .alfred-tools are in ${dir}: move what you keep from .preferred-tools into .alfred-tools, delete .preferred-tools, then run /alfred-tools:fix` });
      continue;
    }
    if (move.state === "came-back") {
      let held = [];
      try {
        held = fs26.readdirSync(move.from);
      } catch {
        held = [];
      }
      out.push({ ...base, found: `${move.from} came back after the move`, blocked: `${move.from} came back after the move and holds ${held.join(", ") || "nothing"} - a server started before the move wrote there; close the Claude Code and Cursor windows using it, move what you keep into .alfred-tools, then delete it` });
      continue;
    }
    const global = move.families.includes("global") ? "; another project whose registrations name ~/.preferred-tools, or whose helper reads keys from it, works again when /alfred-tools:update runs in it" : "";
    out.push({ ...base, found: `renames ${move.from} to ${move.to} (keys, list, helpers, sign-ins and data move unread) and points ${mine.length} registration(s) at it; close other Claude Code and Cursor windows first${global}` });
  }
  const carry = mapToCarry(context.data);
  const found = `copies the roots map ${carry?.from} to ${carry?.to}, its moved folders re-pointed; the old one is left as it was`;
  if (carry) out.push({ id: "root-move", row: null, name: "data", scope: null, moveFrom: carry.from, moveTo: carry.to, found, ...carry.note ? { blocked: `${carry.note} - not copied; each root is found again from its files` } : {} });
  return out;
}
var runsAsFormer = (data) => typeof data === "string" && data !== "" && path27.basename(data).startsWith(FORMER_DATA_PREFIX);
function mapToCarry(data) {
  const sibling = dataSibling(data);
  if (!sibling || !data) return null;
  const from = path27.join(sibling, FILES.map);
  const to = path27.join(data, FILES.map);
  if (!fs26.existsSync(from) || fs26.existsSync(to)) return null;
  const map = readMap(sibling);
  return map.state ? { from, to, note: map.note } : { from, to };
}
function repointWaits(registrations, machine) {
  const moved = movedAt(machine);
  return moved.length > 0 && registrations.some((registration) => registration.rowId && !registration.own && registration.choice !== "own" && registration.scope !== "inherited" && !deepEqual(repointEntry(registration.entry, moved, machine), registration.entry));
}
function repointMap(map, moved, machine) {
  const one = (root2) => root2 ? repointText(root2, moved, machine, false) : root2;
  return { version: map.version, global: map.global === null ? null : one(map.global), projects: Object.fromEntries(Object.entries(map.projects).map(([key, root2]) => [key, one(root2)])) };
}
function repointDataMap(data, moved, machine) {
  if (!data || !moved.length) return null;
  const map = readMap(data);
  if (map.state) return null;
  const next = repointMap(map, moved, machine);
  if (deepEqual(next, { version: map.version, global: map.global, projects: map.projects })) return null;
  writeMap(data, next);
  return { ok: true, detail: `re-pointed ${path27.join(data, FILES.map)} at the moved folders` };
}
function firstPath(entry, root2, machine) {
  const one = [{ from: root2, to: root2 }];
  const values = [entry.command, ...entry.args || [], ...Object.values(entry.env || {})].filter((value) => typeof value === "string");
  const found = values.find((value) => repointText(value, one, machine, false) !== value);
  if (found) return found;
  const helperLine = typeof entry.headersHelper === "string" && repointText(entry.headersHelper, one, machine, true) !== entry.headersHelper;
  return helperLine ? `${entry.headersHelper} (headersHelper)` : root2;
}
function rootMoveFix(finding2, context) {
  if (finding2.name === "data") {
    const map = readMap(path27.dirname(fieldOf(finding2, "moveFrom")));
    if (map.state) return { ok: false, detail: `${map.note} - not copied; delete it or fix it, then run /alfred-tools:fix` };
    writeMap(path27.dirname(fieldOf(finding2, "moveTo")), repointMap(map, movedRoots(context), machineOf(context)));
    return { ok: true, detail: `copied the roots map ${finding2.moveFrom} to ${finding2.moveTo}` };
  }
  const from = fieldOf(finding2, "moveFrom");
  const to = fieldOf(finding2, "moveTo");
  if (!fs26.existsSync(from) && isDir2(to)) return { ok: true, detail: `${from} already moved to ${to}` };
  try {
    let beside = null;
    try {
      beside = fs26.readdirSync(to);
    } catch {
      beside = null;
    }
    if (beside && !beside.length) fs26.rmdirSync(to);
    fs26.renameSync(from, to);
  } catch (caught) {
    return { ok: false, detail: notMoved(from, caught, finding2.holders || [], context.platform) };
  }
  const done = !fs26.existsSync(from) && fs26.existsSync(to);
  return { ok: done, detail: done ? `renamed ${from} to ${to}` : `${from} is still there after the rename` };
}

// scripts/core/declines.ts
import fs27 from "node:fs";
import path28 from "node:path";
var FILE = "retired-declined.json";
var fileOf = (dataDir) => path28.join(dataDir, FILE);
var same = (first, second) => first.id === second.id && first.scope === second.scope;
var isDeclined = (entry) => isRecord(entry) && typeof entry["id"] === "string" && typeof entry["scope"] === "string";
function load2(dataDir) {
  let text;
  try {
    text = fs27.readFileSync(fileOf(dataDir), "utf8");
  } catch (caught) {
    return errorCode(caught) === "ENOENT" ? null : { bad: true };
  }
  try {
    const doc = parseJson(text);
    const declined = isRecord(doc) ? doc["declined"] : void 0;
    if (!Array.isArray(declined)) return { bad: true };
    return { declined: declined.filter(isDeclined).map(({ id, scope }) => ({ id, scope })) };
  } catch {
    return { bad: true };
  }
}
function read(dataDir) {
  if (!dataDir) return [];
  const doc = load2(dataDir);
  return doc && doc.declined ? doc.declined : [];
}
function add(dataDir, items) {
  if (!dataDir) return { ok: false, detail: "no plugin data folder given - the decline is not recorded, so the offer comes back next time" };
  const doc = load2(dataDir);
  if (doc && doc.bad) return { ok: false, detail: `${fileOf(dataDir)} cannot be read or is not JSON - nothing recorded; fix or delete it` };
  const declined = doc ? doc.declined : [];
  for (const it of items) if (!declined.some((entry) => same(entry, it))) declined.push({ id: it.id, scope: it.scope });
  fs27.mkdirSync(dataDir, { recursive: true });
  const file = fileOf(dataDir);
  replaceFile(file, `${JSON.stringify({ version: 1, declined }, null, 2)}
`);
  return { ok: true, detail: `recorded in ${file}: ${items.map((item) => `${item.id} (${item.scope})`).join(", ")} - not offered again` };
}
function parse(value) {
  return String(value || "").split(",").filter(Boolean).map((item) => {
    const at2 = item.lastIndexOf("~");
    if (at2 < 1 || at2 === item.length - 1) throw new Error(`retired-declined needs <id>~<scope> items, not '${item}'`);
    return { id: item.slice(0, at2), scope: item.slice(at2 + 1) };
  });
}

// scripts/hud/hud-statusline.ts
import fs28 from "node:fs";
import path29 from "node:path";

// scripts/hud/constants.ts
var HUD_NAME = "claude-hud";
var LAUNCHER_FILE = "statusline.mjs";
var GIT_BASH_SHIM = "statusline.cmd";
var NODE_SOURCE = "dist/index.js";
var BUN_SOURCE = "src/index.ts";
var DEFAULT_WINDOWS_ROOT = "C:\\Windows";
var PROGRAM_FILES_BASH = ["C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files (x86)\\Git\\bin\\bash.exe"];
var SKIPPED_GIT_FOLDERS = ["node_modules", ".venv", "env"];

// scripts/hud/hud-statusline.ts
var SORT_V = 'cols=${COLUMNS:-}; case "$cols" in ""|*[!0-9]*) cols=$(stty size 2>/dev/null </dev/tty | awk \'{print $2}\');; esac; case "$cols" in ""|*[!0-9]*) cols=120;; esac; export COLUMNS=$(( cols > 4 ? cols - 4 : 1 )); plugin_dir=$(ls -1d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/*/claude-hud/*/ 2>/dev/null | sort -V | tail -1); exec "{RUNTIME_PATH}" "${plugin_dir}{SOURCE}"';
var AWK_NODE = `bash -c 'cols=\${COLUMNS:-}; case "$cols" in ""|*[!0-9]*) cols=$(stty size 2>/dev/null </dev/tty | awk '"'"'{print $2}'"'"');; esac; case "$cols" in ""|*[!0-9]*) cols=120;; esac; export COLUMNS=$(( cols > 4 ? cols - 4 : 1 )); plugin_dir=$(ls -d "\${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/*/claude-hud/*/ 2>/dev/null | awk -F/ '"'"'{ print $(NF-1) "\\t" $(0) }'"'"' | grep -E '"'"'^[0-9]+\\.[0-9]+\\.[0-9]+[[:space:]]'"'"' | sort -t. -k1,1n -k2,2n -k3,3n -k4,4n | tail -1 | cut -f2-); exec "{RUNTIME_PATH}" "\${plugin_dir}{SOURCE}"'`;
var AWK_BUN = AWK_NODE.replace('exec "{RUNTIME_PATH}" "', 'exec "{RUNTIME_PATH}" --env-file /dev/null "');
var CMD_SHAPE = '{CMD_PATH} /d /s /c ""{RUNTIME_PATH}" "{WRAPPER_PATH}""';
var LAUNCHER_POSIX_RE = /^'((?:[^']|'\\'')+)'( --env-file \/dev\/null)? '((?:[^']|'\\'')+)'$/;
var LAUNCHER_GITBASH = 'exec "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/claude-hud/statusline.cmd"';
var unquote = (word) => word.split("'\\''").join("'");
function fill(template, vars) {
  const values = new Map(Object.entries(vars));
  return template.replace(/\{(RUNTIME_PATH|SOURCE|CMD_PATH|WRAPPER_PATH)\}/g, (match, placeholder) => values.get(placeholder) ?? match);
}
var escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function shapeRe(template, source) {
  const holes = /* @__PURE__ */ new Map([["RUNTIME_PATH", '([^"]+)'], ["SOURCE", escapeRe(source || "")], ["CMD_PATH", '([^"]*cmd\\.exe)'], ["WRAPPER_PATH", '([^"]+)']]);
  return new RegExp(`^${escapeRe(template).replace(/\\\{(RUNTIME_PATH|SOURCE|CMD_PATH|WRAPPER_PATH)\\\}/g, (match, placeholder) => holes.get(placeholder) ?? match)}$`, template === CMD_SHAPE ? "i" : "");
}
function sourceLabel(command) {
  if (command.includes("claude-pace")) return "claude-pace";
  if (command.includes("cc-statusline") || command.includes("ccstatusline")) return "cc-statusline";
  if (/statusline\.(sh|js|py)/.test(command)) return "statusline script";
  return "custom";
}
function cmdPath(env, exists2) {
  const root2 = env.SystemRoot || env.SYSTEMROOT || env.windir || DEFAULT_WINDOWS_ROOT;
  const absolutePath = path29.win32.join(root2, "System32", "cmd.exe");
  return exists2(absolutePath) ? absolutePath : "cmd.exe";
}
function pathDirs(env, platform) {
  const key = Object.keys(env).find((variableName) => variableName.toUpperCase() === "PATH");
  const pathApi = pathFor(platform);
  return String(key && env[key] || "").split(platform === "win32" ? ";" : ":").filter((directory) => directory && pathApi.isAbsolute(directory));
}
function gitBash(env, exists2, cwd = process.cwd()) {
  if (env.MSYSTEM || /^(msys|cygwin)/.test(env.OSTYPE || "")) return true;
  const pinned = env.CLAUDE_CODE_GIT_BASH_PATH;
  if (pinned && /^(bash|sh)(\.exe)?$/i.test(path29.win32.basename(pinned)) && exists2(pinned)) return true;
  if (PROGRAM_FILES_BASH.some((bashPath) => exists2(bashPath))) return true;
  const gitPath = pathDirs(env, "win32").map((directory) => path29.win32.join(directory, "git.exe")).find((candidate) => exists2(candidate) && !projectGit(candidate, cwd));
  if (!gitPath) return false;
  const up = path29.win32.dirname(path29.win32.dirname(gitPath));
  return [up, path29.win32.dirname(up)].some((root2) => exists2(path29.win32.join(root2, "bin", "bash.exe")));
}
function projectGit(gitPath, cwd) {
  const norm = (windowsPath) => path29.win32.normalize(windowsPath).replace(/\\+$/, "").toLowerCase();
  const dir = norm(path29.win32.dirname(gitPath));
  const launch = norm(cwd);
  if (dir === launch) return true;
  return dir.startsWith(`${launch}\\`) && dir.split("\\").some((segment) => SKIPPED_GIT_FOLDERS.includes(segment));
}
function expected({ platform, configDir: configDir2, runtime, env, exists: exists2, bash }) {
  const hudDir = path29.join(configDir2, "plugins", HUD_NAME);
  if (platform !== "win32" || bash) {
    const node = platform === "win32" ? runtime.replace(/\\/g, "/") : runtime;
    return { shell: "bash", command: fill(SORT_V, { RUNTIME_PATH: node, SOURCE: NODE_SOURCE }), launcher: null, hudDir };
  }
  const wrapper = path29.win32.join(configDir2, "plugins", HUD_NAME, LAUNCHER_FILE);
  return {
    shell: "cmd",
    command: fill(CMD_SHAPE, { CMD_PATH: cmdPath(env, exists2), RUNTIME_PATH: runtime, WRAPPER_PATH: wrapper }),
    launcher: { file: path29.join(configDir2, "plugins", HUD_NAME, LAUNCHER_FILE), wrapper },
    hudDir
  };
}
var MOUNT_RE = /^(?:\/cygdrive)?\/([A-Za-z])(?=\/|$)/;
var winRuntimeExists = (runtime, exists2) => {
  const native = runtime.replace(MOUNT_RE, (_match, drive) => `${drive.toUpperCase()}:`);
  return exists2(native) || exists2(`${native}.exe`);
};
function classify(statusLine, { platform, want, exists: exists2 }) {
  if (statusLine !== void 0 && (statusLine === null || typeof statusLine !== "object" || Array.isArray(statusLine)))
    return { state: "foreign", label: "custom" };
  const command = isRecord(statusLine) && typeof statusLine["command"] === "string" ? statusLine["command"] : "";
  if (!command.trim()) return { state: "absent" };
  if (!command.includes(HUD_NAME)) return { state: "foreign", label: sourceLabel(command) };
  const win = platform === "win32";
  const shapes = !win ? [[SORT_V, NODE_SOURCE], [AWK_NODE, NODE_SOURCE], [AWK_BUN, BUN_SOURCE]] : want.shell === "bash" ? [[SORT_V, NODE_SOURCE]] : [[CMD_SHAPE, ""]];
  const hudDir = want.hudDir || "";
  if (hudDir && !win) {
    const [, runtimeWord = "", , launcherWord = ""] = LAUNCHER_POSIX_RE.exec(command) ?? [];
    if (runtimeWord && exists2(unquote(runtimeWord)) && unquote(launcherWord) === path29.join(hudDir, LAUNCHER_FILE) && exists2(unquote(launcherWord))) return { state: "current" };
  }
  if (hudDir && win && want.shell === "bash" && command === LAUNCHER_GITBASH && exists2(path29.join(hudDir, GIT_BASH_SHIM)) && exists2(path29.join(hudDir, LAUNCHER_FILE))) return { state: "current" };
  for (const [shape2, source] of shapes) {
    const match = shapeRe(shape2, source).exec(command);
    if (!match) continue;
    if (shape2 === CMD_SHAPE) {
      const [, , runtime = "", wrapper = ""] = match;
      const { launcher: launcher2 } = want;
      if (launcher2 && exists2(runtime) && wrapper.toLowerCase() === launcher2.wrapper.toLowerCase() && exists2(launcher2.file)) return { state: "current" };
    } else {
      const [, runtime = ""] = match;
      if (win ? winRuntimeExists(runtime, exists2) : exists2(runtime)) return { state: "current" };
    }
  }
  return { state: "stale" };
}
function resolveConfigDir({ flag, env = process.env }) {
  return flag ? path29.resolve(flag) : configDir(env);
}
function removeHudStatusLine(configDir2, { platform = process.platform, env = process.env, exists: exists2 = fs28.existsSync, cwd = process.cwd() } = {}) {
  const file = path29.join(configDir2, "settings.json");
  let text;
  try {
    text = fs28.readFileSync(file, "utf8");
  } catch {
    return { removed: false, detail: `${file} is not there - no statusLine to remove` };
  }
  let doc;
  try {
    doc = parseJson(text);
  } catch {
    doc = null;
  }
  if (!isRecord(doc)) return { removed: false, detail: `${file} is not a JSON object - its statusLine is left` };
  if (doc["statusLine"] === void 0) return { removed: false, detail: `${file} has no statusLine` };
  const bash = platform === "win32" && gitBash(env, exists2, cwd);
  const want = expected({ platform, configDir: configDir2, runtime: platform === "win32" ? "node.exe" : "node", env, exists: exists2, bash });
  const { state, label } = classify(doc["statusLine"], { platform, want, exists: exists2 });
  if (state !== "current" && state !== "stale") return { removed: false, detail: `the statusLine in ${file} is not claude-hud's (${label || state}) - left as it is` };
  const { statusLine, ...rest } = doc;
  let mode = 384;
  try {
    mode = fs28.statSync(file).mode & 511;
  } catch {
  }
  replaceFile(file, `${JSON.stringify(rest, null, 2)}
`, mode);
  return { removed: true, detail: `removed claude-hud's statusLine from ${file}` };
}

// scripts/fix/machine.ts
function retiredPluginDetect(context) {
  const ids = fixRowOf(context, "retired-plugin").ids || [];
  const declined = read(context.data);
  const alfred = Boolean(context.inventory.alfredCodeEnabled);
  const self = runsAsFormer(context.data);
  const carry = mapToCarry(context.data);
  return (context.inventory.plugins || []).filter((plugin) => ids.includes(plugin.id) && !(self && plugin.id === OLD_PLUGIN_ID)).map((plugin) => {
    const proposal = { command: `claude plugin uninstall ${plugin.id} --scope ${plugin.scope}` };
    if (plugin.id === OLD_PLUGIN_ID) {
      const old = { id: "retired-plugin", name: plugin.id, scope: plugin.scope, alfred: false, found: `${plugin.id} is this plugin under its former name, installed at ${plugin.scope} scope - alfred-tools replaces it`, proposal };
      if (declined.some((declinedPlugin) => same(declinedPlugin, plugin))) return { ...old, declined: true, blocked: `${plugin.id} is kept at ${plugin.scope}; remove it with ${proposal.command}` };
      return carry && !carry.note ? { ...old, blocked: `the roots map in ${path30.dirname(carry.from)} comes over first; then run /alfred-tools:fix` } : old;
    }
    const base = {
      id: "retired-plugin",
      name: plugin.id,
      scope: plugin.scope,
      alfred,
      found: `${plugin.id} is installed at ${plugin.scope} scope; alfred-tools no longer lists it - it works in Claude Code alone${alfred ? `; ${plugin.id} - alfred-code also installs it, and this removes it for both` : ""}`,
      proposal
    };
    if (!declined.some((declinedPlugin) => same(declinedPlugin, plugin))) return base;
    return { ...base, declined: true, blocked: `${plugin.id} is kept at ${plugin.scope}; remove it with claude plugin uninstall ${plugin.id} --scope ${plugin.scope}` };
  });
}
function retiredPluginFix(finding2, context) {
  const command = `claude plugin uninstall ${finding2.name} --scope ${finding2.scope}`;
  const result = runClaude(["plugin", "uninstall", finding2.name, "--scope", fieldOf(finding2, "scope")], { cwd: context.inventory.project, env: context.env });
  if (result.error || result.status !== 0) return { ok: false, detail: `${command} failed - ${String(`${result.stderr || ""}${result.stdout || ""}` || result.error && result.error.message || "no output").trim().split("\n").slice(-1)[0]}` };
  const left = buildInventory({ project: context.inventory.project, env: context.env, data: context.data }).plugins;
  if (left.some((plugin) => plugin.id === finding2.name && plugin.scope === finding2.scope)) return { ok: false, detail: `${finding2.name} is still listed at ${finding2.scope} after ${command}` };
  let detail = `uninstalled ${finding2.name} (${finding2.scope})`;
  if (finding2.name.startsWith("claude-hud@")) {
    if (left.some((plugin) => plugin.id === finding2.name)) detail += `; claude-hud's statusLine is kept - claude-hud is still installed at ${left.filter((plugin) => plugin.id === finding2.name).map((plugin) => plugin.scope).join(", ")}`;
    else detail += `; ${removeHudStatusLine(resolveConfigDir({ env: context.env }), { platform: context.platform, env: context.env }).detail}`;
  }
  return { ok: true, detail };
}
var PROBE = "alfred-tools-probe";
function ignoredByGit(context, rel) {
  const result = context.machine.run("git", ["check-ignore", "-q", `${rel}/${PROBE}`], { cwd: context.inventory.project });
  return result && (result.status === 0 || result.status === 1) ? result.status === 0 : null;
}
function dataFolderIgnoreDetect(context) {
  const pathApi = pathFor(context.platform);
  const tools = fixRowOf(context, "data-folder-ignore").tool;
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const registration of context.inventory.registrations) {
    if (!isManaged(registration) || registration.rowId === null || !tools.includes(registration.rowId)) continue;
    if (registration.scope === "inherited" ? registration.approval === "rejected" || registration.shadowed : registration.scope !== "project" || registration.approval === "rejected") continue;
    const row = rowOf2(context, registration.rowId);
    if (!row) continue;
    const root2 = row.locations ? rootOfEntry(row, registration.entry) : null;
    if (!root2 || root2.includes("${") || root2.startsWith("~")) continue;
    if (path30.posix.isAbsolute(root2) || path30.win32.isAbsolute(root2)) {
      const copy = leftoverCopy(context, registration, root2, pathApi);
      if (copy && !seen.has(copy.folder)) {
        seen.add(copy.folder);
        out.push(copy.finding);
      }
      continue;
    }
    const rel = root2.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
    const folder = pathApi.resolve(context.inventory.project, ...rel.split("/"));
    if (seen.has(folder)) continue;
    seen.add(folder);
    const own = pathApi.join(folder, ".gitignore");
    const gitIgnores2 = ignoredByGit(context, rel);
    if (gitIgnores2 === true) continue;
    if (gitIgnores2 === null && context.machine.exists(own)) continue;
    if (gitIgnores2 === null && rel.startsWith(`${ALFRED_DATA}/`) && context.machine.exists(pathApi.join(context.inventory.project, ALFRED_DATA, ".gitignore"))) continue;
    if (gitIgnores2 === false && context.machine.exists(own)) {
      out.push({
        id: "data-folder-ignore",
        row: registration.rowId,
        name: registration.name,
        scope: registration.scope,
        found: `${rel} - its data folder when Claude starts here - is not git-ignored`,
        blocked: `${rel}/.gitignore is there but does not ignore the folder's data - add * to it, or ignore ${rel}/ in the project's .gitignore`
      });
      continue;
    }
    out.push({
      id: "data-folder-ignore",
      row: registration.rowId,
      name: registration.name,
      scope: registration.scope,
      found: `${rel} - its data folder when Claude starts here - is not git-ignored: ${folder} gets no .gitignore of its own${rel.startsWith(`${ALFRED_DATA}/`) ? " and no .alfred/.gitignore covers it" : ""}`,
      proposal: { path: folder }
    });
  }
  return out;
}
function leftoverCopy(context, registration, root2, pathApi) {
  const declared = registration.scope === "inherited" ? registration.from : context.inventory.project;
  if (!declared || pathApi.resolve(declared) === pathApi.resolve(context.inventory.project)) return null;
  const rel = pathApi.relative(declared, root2);
  if (!rel || rel.startsWith("..") || pathApi.isAbsolute(rel)) return null;
  const folder = pathApi.join(context.inventory.project, rel);
  if (!context.machine.exists(folder)) return null;
  const slashed = rel.split(pathApi.sep).join("/");
  const gitIgnores2 = ignoredByGit(context, slashed);
  if (gitIgnores2 === true) return null;
  if (gitIgnores2 === null && (context.machine.exists(pathApi.join(folder, ".gitignore")) || slashed.startsWith(`${ALFRED_DATA}/`) && context.machine.exists(pathApi.join(context.inventory.project, ALFRED_DATA, ".gitignore")))) return null;
  return {
    folder,
    finding: {
      id: "data-folder-ignore",
      row: registration.rowId,
      name: registration.name,
      scope: registration.scope,
      found: `${slashed} - a 0.2.0 copy no server uses any more - its data is left, never moved or deleted; it is not git-ignored`,
      proposal: { path: folder }
    }
  };
}
function dataFolderIgnoreFix(finding2, _context) {
  const file = path30.join(proposalOf(finding2, "path"), ".gitignore");
  try {
    if (fs29.existsSync(file)) return { ok: true, restart: false, detail: `${file} exists - left as it is` };
    fs29.mkdirSync(proposalOf(finding2, "path"), { recursive: true });
    fs29.writeFileSync(file, GITIGNORE_ALL);
    return { ok: true, restart: false, detail: `wrote ${file} holding *` };
  } catch (caught) {
    return { ok: false, detail: `could not write ${file}: ${errorMessage(caught)}` };
  }
}
var NPX_FOLDER = /^[0-9a-f]{16}$/;
function cacheInForce(result) {
  if (!result || result.status !== 0) return null;
  const line = String(result.stdout || "").split("\n").map((rawLine) => rawLine.trim()).find((trimmedLine) => trimmedLine.startsWith("cache = "));
  let value = null;
  try {
    value = line ? JSON.parse(line.slice("cache = ".length)) : null;
  } catch {
  }
  return typeof value === "string" && value && !value.includes("***") ? value : null;
}
var cacheVar = (env) => Object.entries(env || {}).find(([variableName, value]) => variableName.toLowerCase() === "npm_config_cache" && value !== "");
function npmCacheOf(context, registration, memo) {
  const own = cacheVar(registration.entry.env);
  if (own) return expandVars2(own[1], context.env);
  const inEnv = cacheVar(context.env);
  if (inEnv) return inEnv[1];
  const asked2 = memo.get("cache");
  if (asked2 !== void 0) return asked2;
  const cache = cacheInForce(context.machine.run("npm", ["config", "ls", "-l"], { cwd: context.inventory.project }));
  memo.set("cache", cache);
  return cache;
}
var startsHere = (context, registration) => isManaged(registration) && registration.approval !== "rejected" && !(registration.scope === "inherited" && registration.shadowed) && registration.rowId !== null && fixRowOf(context, "npx-cache-entry").tool.includes(registration.rowId);
function npxCacheEntryDetect(context) {
  const pathApi = pathFor(context.platform);
  const memo = /* @__PURE__ */ new Map();
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const registration of context.inventory.registrations) {
    if (!startsHere(context, registration) || launcher(registration.entry) !== "npx" && !bridgeParts(registration.entry)) continue;
    const step = fetchStep(registration.name, registration.entry, registration.rowId);
    if (!step) continue;
    const cache = npmCacheOf(context, registration, memo);
    if (!cache) continue;
    const folder = pathApi.join(cache, "_npx", crypto.createHash("sha512").update(step.what).digest("hex").slice(0, 16));
    if (seen.has(folder) || !context.machine.exists(folder) || context.machine.exists(pathApi.join(folder, "package.json"))) continue;
    seen.add(folder);
    out.push(finding("npx-cache-entry", registration, `npx's cache folder for ${step.what}, ${folder}, has no package.json - every start fails with ENOENT until it is removed`, { proposal: { path: folder, what: step.what } }));
  }
  return out;
}
function npxCacheEntryFix(finding2, context) {
  const pathApi = pathFor(context.platform);
  const folder = proposalOf(finding2, "path");
  if (!NPX_FOLDER.test(pathApi.basename(folder)) || pathApi.basename(pathApi.dirname(folder)) !== "_npx") return { ok: false, detail: `${folder} is not an npx cache folder - left as it is` };
  try {
    fs29.rmSync(folder, { recursive: true, force: true });
  } catch (caught) {
    return { ok: false, detail: `could not remove ${folder}: ${errorMessage(caught)}` };
  }
  const registration = context.inventory.registrations.find((candidate) => candidate.name === finding2.name && candidate.scope === finding2.scope && !candidate.shadowed);
  const step = registration ? fetchStep(registration.name, registration.entry, registration.rowId) : null;
  const where2 = registration && registration.scope === "inherited" ? { scope: "project", from: registration.from } : { scope: registration && registration.scope };
  return { ok: true, detail: `removed ${folder} - npx installs ${fieldOf(finding2, "proposal").what} into it again`, fetch: step ? { ...step, ...where2 } : null };
}

// scripts/fix/keys.ts
import fs30 from "node:fs";
import path31 from "node:path";
var import_mcp_headers4 = __toESM(require_mcp_headers(), 1);
var import_mcp_bridge4 = __toESM(require_mcp_bridge(), 1);
var rootCtx = (context) => ({ project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog });
var rootsOf = (context) => resolveRoots(context.inventory, null, rootCtx(context)).roots;
function authOf(entry) {
  const headers = entry && entry.headers || {};
  const header = Object.keys(headers).find((headerName) => headerName.toLowerCase() === "authorization");
  const value = header === void 0 ? void 0 : headers[header];
  return header !== void 0 && typeof value === "string" ? { header, value } : null;
}
function keyToHelperDetect(context) {
  const out = [];
  for (const registration of registrationsOf(context, "key-to-helper")) {
    const route = routeOf(context, registration);
    const auth = authOf(registration.entry);
    if (registration.route !== "remote" || !route || !route.helper || !auth || registration.entry.headersHelper) continue;
    const resolvedRoots = rootsOf(context);
    const chain = hostedChain({ scope: registration.scope, projectRoot: resolvedRoots.project, globalRoot: resolvedRoots.global, globalNamed: resolvedRoots.globalNamed, home: context.home, platform: context.platform });
    const extra = { route: registration.route, roots: resolvedRoots };
    const token = auth.value.trim().replace(/^[A-Za-z][\w-]*\s+/, "");
    const [, variable] = ONE_VAR.exec(token) ?? [];
    if (variable !== void 0) {
      const at2 = valueIn(chain, variable);
      if (at2) {
        out.push(finding("key-to-helper", registration, `the Authorization header holds \${${variable}} - the key moves to mcp-headers.js, which reads ${variable} from ${at2.file}`, { ...extra, keyName: variable }));
        continue;
      }
      const old = oldHolding(context.inventory.project, context.home, variable);
      out.push(finding("key-to-helper", registration, `the Authorization header holds \${${variable}}`, { ...extra, blocked: `put ${variable}'s value in ${chain[0]}, then run /alfred-tools:fix${old ? `; ${variable} is in ${old}, which alfred-tools no longer reads` : ""}` }));
      continue;
    }
    if (token.includes("${")) {
      out.push(finding("key-to-helper", registration, "the Authorization header mixes ${VAR} and text", { ...extra, blocked: "make it one ${VAR} or the key by hand, then run /alfred-tools:fix" }));
      continue;
    }
    const name = nameOfValue(chain, token);
    out.push(name ? finding("key-to-helper", registration, `the Authorization header holds a key - it moves to mcp-headers.js, which reads it as ${name}`, { ...extra, keyName: name }) : finding("key-to-helper", registration, "the Authorization header holds a key", { ...extra, blocked: `the key in this registration matches no name in ${chain.join(", ")}: put the working key there under a name, then run /alfred-tools:fix` }));
  }
  return out;
}
function keyToHelperFix(entry, finding2, context) {
  const out = clone(entry);
  const auth = authOf(out);
  if (auth && out.headers) delete out.headers[auth.header];
  if (out.headers && !Object.keys(out.headers).length) delete out.headers;
  const route = findingRoute(context, finding2);
  out.headersHelper = helperFor(route, fieldOf(finding2, "scope"), { project: context.inventory.project, platform: context.platform, home: context.home, roots: finding2.roots }, finding2.keyName);
  return out;
}
var SHIPPED2 = { helper: { word: "helper", version: import_mcp_headers4.HELPER_VERSION }, bridge: { word: "bridge", version: import_mcp_bridge4.BRIDGE_VERSION }, serenaContext: { word: "context", version: SERENA_CONTEXT_VERSION } };
function shippedFiles(context, fixId) {
  const pathApi = pathFor(context.platform);
  const seen = /* @__PURE__ */ new Map();
  const add2 = (file, kind, registration) => {
    if (!seen.has(file)) seen.set(file, { file, root: pathApi.dirname(file), kind, registration });
  };
  let familyRoots = null;
  for (const registration of registrationsOf(context, fixId)) {
    const named = helperPathOf(registration.entry && registration.entry.headersHelper);
    if (named) add2(absOf(named, rootCtx(context)), "helper", registration);
    const contextArg = (registration.entry.args || [])[contextArgAt(registration.entry)];
    if (contextArg !== void 0) {
      const file2 = absOf(contextArg, rootCtx(context));
      const root2 = (familyRoots || (familyRoots = rootsOf(context)))[familyOf(registration.scope)];
      if (root2 && file2 === pathApi.join(root2, FILES.serenaContext) || file2 === homeContextOf(registration.entry, context.platform, FILES.serenaContext)) add2(file2, "serenaContext", registration);
    }
    const bridgeFile = bridgeFileOf(registration.entry);
    if (!bridgeFile) continue;
    const file = absOf(bridgeFile, rootCtx(context));
    add2(file, "bridge", registration);
    add2(pathApi.join(pathApi.dirname(file), FILES.helper), "helper", registration);
  }
  return [...seen.values()];
}
var helperFinding = (fixId, shippedFile, what, extra = {}) => ({ ...finding(fixId, shippedFile.registration, what, extra), name: shippedFile.file, path: shippedFile.file, shipped: shippedFile.kind, bridged: bridgeFileOf(shippedFile.registration.entry) !== null || shippedFile.kind === "serenaContext" });
var nameOf = (shippedFile) => FILES[shippedFile.kind];
var kindOf = (finding2) => finding2.shipped === "bridge" || finding2.shipped === "serenaContext" ? finding2.shipped : "helper";
var withCommonjs = (root2, result, kind) => {
  if (kind === "serenaContext") return result;
  const packageJson = ensureCommonjs(root2);
  return { ...result, detail: [result.detail, packageJson.wrote ? `wrote ${path31.join(root2, "package.json")} (type commonjs)` : null, packageJson.note].filter(Boolean).join("; ") };
};
function helperMissingDetect(context) {
  return shippedFiles(context, "helper-missing").filter((shippedFile) => !fs30.existsSync(shippedFile.file)).map((shippedFile) => helperFinding("helper-missing", shippedFile, `${nameOf(shippedFile)} is missing - ${shippedFile.registration.name} (${shippedFile.registration.scope}) ${bridgeFileOf(shippedFile.registration.entry) !== null || shippedFile.kind === "serenaContext" ? "does not start" : "connects without its key"}`));
}
function helperMissingFix(finding2) {
  const kind = kindOf(finding2);
  fs30.mkdirSync(path31.dirname(fieldOf(finding2, "path")), { recursive: true });
  fs30.writeFileSync(fieldOf(finding2, "path"), shippedSource(kind));
  return withCommonjs(path31.dirname(fieldOf(finding2, "path")), { ok: shippedState(kind, fieldOf(finding2, "path")).state === "same", detail: `wrote ${fieldOf(finding2, "path")} (${SHIPPED2[kind].word} ${SHIPPED2[kind].version})`, restart: Boolean(finding2.bridged) }, kind);
}
function helperStaleDetect(context) {
  const out = [];
  for (const shippedFile of shippedFiles(context, "helper-stale").filter((candidate) => fs30.existsSync(candidate.file))) {
    const { state, number } = shippedState(shippedFile.kind, shippedFile.file);
    const name = nameOf(shippedFile);
    const { word, version } = SHIPPED2[shippedFile.kind];
    if (state === "lower") out.push(helperFinding("helper-stale", shippedFile, `${name} is ${word} ${number} - this plugin's is ${version}`, { from: number }));
    else if (state === "edited" && number === null) out.push(helperFinding("helper-stale", shippedFile, `${name} has no alfred-tools number line`, { blocked: `${shippedFile.file} has no alfred-tools number line - it is not this plugin's ${word}, and fix never overwrites it: rename yours, or delete it and run /alfred-tools:fix` }));
    else if (state === "edited") out.push(helperFinding("helper-stale", shippedFile, `${name} changed since alfred-tools wrote it - the fix puts this plugin's copy back`));
    else if (state === "higher") out.push(helperFinding("helper-stale", shippedFile, `${name} is ${word} ${number} - newer than this plugin's ${version}`, { blocked: `${name} in ${shippedFile.root} is newer than this plugin - update alfred-tools` }));
  }
  return out;
}
function helperStaleFix(finding2) {
  const kind = kindOf(finding2);
  const { word, version } = SHIPPED2[kind];
  if (shippedState(kind, fieldOf(finding2, "path")).state === "higher") return { ok: false, detail: `${fieldOf(finding2, "path")} is newer than this plugin - left; update alfred-tools`, restart: false };
  fs30.writeFileSync(fieldOf(finding2, "path"), shippedSource(kind));
  return withCommonjs(path31.dirname(fieldOf(finding2, "path")), { ok: shippedState(kind, fieldOf(finding2, "path")).state === "same", detail: `rewrote ${fieldOf(finding2, "path")} (${word} ${finding2.from === void 0 ? "edited" : finding2.from} -> ${version})`, restart: Boolean(finding2.bridged) }, kind);
}
function rootIgnoreDetect(context) {
  const out = [];
  for (const family of FAMILIES) {
    const used = context.inventory.roots && context.inventory.roots[family];
    const root2 = used && used.path;
    if (!root2 || out.some((finding2) => finding2.name === root2) || !fs30.existsSync(root2)) continue;
    const gap = ignoreGap(root2, family);
    if (!gap) continue;
    const secrets = path31.join(root2, FILES.secrets);
    const helper2 = path31.join(root2, FILES.helper);
    const secretsGap = gitIgnores(secrets) === false;
    const helperGap = family === "project" && path31.basename(root2) !== ALFRED_DATA && gitIgnores(helper2) === true;
    const signIns = path31.join(root2, FILES.signIns);
    const signInsGap = gitIgnores(path31.join(signIns, SIGN_IN_PROBE)) === false;
    const unignore = gap.unignore || [];
    const found = [secretsGap && `git would commit ${secrets}`, signInsGap && `git would commit ${signIns}/`, helperGap && `git ignores ${helper2}, which a project-scope server needs committed`, unignore.length && `git ignores ${unignore.map((file) => path31.join(root2, file)).join(" and ")}, which a committed entry names`].filter(Boolean).join("; ");
    const base = { id: "root-ignore", row: null, name: root2, scope: family, found, path: root2, family };
    if (path31.basename(root2) === ALFRED_DATA) {
      out.push({ ...base, blocked: `${root2} is alfred-code's - add ${[secretsGap && FILES.secrets, signInsGap && `${FILES.signIns}/`].filter(Boolean).join(" and ")} to its .gitignore yourself` });
      continue;
    }
    if (gap.excluded) {
      out.push({ ...base, blocked: `a .gitignore above excludes ${root2} - remove that line (git check-ignore -v ${root2} names it): git never re-includes a file inside an excluded folder` });
      continue;
    }
    const lines = rootIgnoreLines(root2);
    const fixes = { secrets: secretsGap && lines.lack.includes(lines.mine ? "*" : FILES.secrets), helper: helperGap && lines.mine && lines.lack.includes(`!${FILES.helper}`), signIns: signInsGap && lines.lack.includes(lines.mine ? "*" : `${FILES.signIns}/`), unignore: lines.mine ? unignore.filter((file) => lines.lack.includes(`!${file}`)) : [] };
    const left = [
      secretsGap && !fixes.secrets && `every line alfred-tools writes is in ${lines.file}, yet git would still commit ${secrets}: a later line re-includes ${FILES.secrets}, or git tracks it already (git rm --cached -- ${secrets})`,
      signInsGap && !fixes.signIns && `every line alfred-tools writes is in ${lines.file}, yet git would still commit ${signIns}/: a later line re-includes it, or git tracks it already (git rm -r --cached -- ${signIns})`,
      helperGap && !fixes.helper && `git ignores ${helper2} through lines of your own - add !${FILES.helper} at the end of ${lines.file}`,
      ...unignore.filter((file) => !fixes.unignore.includes(file)).map((file) => `git ignores ${path31.join(root2, file)} through lines of your own - add !${file} at the end of ${lines.file}`)
    ].filter(Boolean).join("; ");
    if (!fixes.secrets && !fixes.helper && !fixes.signIns && !fixes.unignore.length) out.push({ ...base, blocked: left });
    else out.push({ ...base, fixes, ...left ? { note: left } : {} });
  }
  return out;
}
function rootIgnoreFix(finding2) {
  const result = rootIgnore(fieldOf(finding2, "path"));
  const still = [
    fieldOf(finding2, "fixes").secrets && gitIgnores(path31.join(fieldOf(finding2, "path"), FILES.secrets)) === false && `git would still commit ${path31.join(fieldOf(finding2, "path"), FILES.secrets)}`,
    fieldOf(finding2, "fixes").helper && gitIgnores(path31.join(fieldOf(finding2, "path"), FILES.helper)) === true && `git still ignores ${path31.join(fieldOf(finding2, "path"), FILES.helper)}`,
    fieldOf(finding2, "fixes").signIns && gitIgnores(path31.join(fieldOf(finding2, "path"), FILES.signIns, SIGN_IN_PROBE)) === false && `git would still commit ${path31.join(fieldOf(finding2, "path"), FILES.signIns)}/`,
    ...(fieldOf(finding2, "fixes").unignore || []).filter((file) => gitIgnores(path31.join(fieldOf(finding2, "path"), file)) === true).map((file) => `git still ignores ${path31.join(fieldOf(finding2, "path"), file)}`)
  ].filter(Boolean);
  return { ok: !still.length, detail: still.length ? `${result.detail}; ${still.join("; ")}` : result.detail, restart: false };
}

// scripts/fix/helper-foreign.ts
import path32 from "node:path";

// scripts/plan/retire-context.ts
var rootContext = (context) => ({ project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog });
var contextFileOf = (entry, context) => {
  const file = entry?.args?.[contextArgAt(entry)];
  return file === void 0 ? null : absOf(file, rootContext(context));
};
var nameScopeKey = (name, scope) => `${name}\0${scope}`;
function namedBy(file, context, except) {
  const names2 = /* @__PURE__ */ new Set();
  for (const registration of context.inventory.registrations)
    if (!except.has(nameScopeKey(registration.name, registration.scope)) && contextFileOf(registration.entry, context) === file) names2.add(registration.name);
  for (const list of Object.values(context.inventory.lists || {}))
    for (const server of list && !list.note ? list.servers : [])
      if (!except.has(nameScopeKey(server.name, server.scope)) && contextFileOf(server.cursorEntry, context) === file) names2.add(server.name);
  return [...names2];
}
function rewritesOf(steps) {
  return steps.flatMap((step) => {
    if (step.op === "mcp-replace") return [{ name: step.name, scope: step.scope, old: step.old, entry: step.entry }];
    if (step.op === "mcp-move") return [{ name: step.from.name, scope: step.from.scope, old: step.old, entry: step.entry }];
    return [];
  });
}
function retireContextSteps(context, rewrites) {
  const pathApi = pathFor(context.platform);
  const familyRoots = resolveRoots(context.inventory, null, rootContext(context)).roots;
  const except = new Set(rewrites.map((rewrite) => nameScopeKey(rewrite.name, rewrite.scope)));
  const out = /* @__PURE__ */ new Map();
  for (const rewrite of rewrites) {
    const file = contextFileOf(rewrite.old, context);
    const root2 = familyRoots[familyOf(rewrite.scope)];
    if (!file || !root2 || file !== pathApi.join(root2, FILES.serenaContext) || file === contextFileOf(rewrite.entry, context)) continue;
    out.set(file, { op: "retire-shipped", kind: "serenaContext", file, namedBy: namedBy(file, context, except), why: `${file}: the old copy of serena's context file, now in each serena's home - removed when it is unedited and no registration names it` });
  }
  return [...out.values()];
}
function retirableHelper(command, context) {
  if (typeof command !== "string" || helperParts(command)) return null;
  const script = foreignScript(command);
  if (!script) return null;
  const pathApi = pathFor(context.platform);
  const file = absOf(script.file, rootContext(context));
  if (!FOREIGN_HELPER_FILE.test(pathApi.basename(file))) return { file, left: "its name is not mcp-headers-<name>.js" };
  const familyRoots = Object.values(resolveRoots(context.inventory, null, rootContext(context)).roots);
  const direct = familyRoots.some((root2) => typeof root2 === "string" && pathApi.relative(root2, pathApi.dirname(file)) === "");
  return { file, left: direct ? null : "it is not directly in a root folder" };
}
function retireHelperSteps(context, rewrites) {
  const out = /* @__PURE__ */ new Map();
  for (const rewrite of rewrites) {
    const found = retirableHelper(rewrite.old.headersHelper, context);
    if (!found || found.left !== null || !helperParts(rewrite.entry.headersHelper)) continue;
    const { file } = found;
    out.set(file, { op: "retire-helper", file, why: `${file}: the old key helper of ${rewrite.name}, now on this plugin's helper - removed when no registration or Cursor file names it and git does not track it` });
  }
  return [...out.values()];
}

// scripts/fix/lists.ts
import fs32 from "node:fs";

// scripts/entries/launcher-form.ts
var launcherRoute = (route, routeId, scope) => routeId !== "remote" && route.runtime !== "bridge" && !route.helper && Boolean(route.tokenVar) && scope !== "project";
function launcherForm(route, keyName, place, inner) {
  const moved = moveArgKeyToEnv(inner, route);
  const fields = tokenFields(moved, route);
  const first = fields.find((field) => field.at[0] === "env");
  if (!first || fields.some((field) => field.at[0] === "args")) return null;
  const pair = `${first.at[1]}=${keyName}${route.authMode === "optional-token" ? RUN.optional : ""}`;
  return {
    command: "node",
    args: [place.bridgePath, RUN.flag, pair, ...place.globalRoot ? [place.globalRoot] : [], RUN.end, moved.command ?? "", ...moved.args ?? []],
    env: withoutTokenFields(moved, route).env ?? {}
  };
}

// scripts/plan/root-files.ts
import fs31 from "node:fs";
function useRoots(context, scope, { helper: helper2, bridge, serenaContext, exclude, keyFile, keyName, keyNames, data }) {
  const pathApi = pathFor(context.platform);
  const rootOf2 = (family2) => context.roots?.[family2] || void 0;
  const holder = (filePath) => {
    for (const candidateFamily of FAMILIES) {
      const root3 = rootOf2(candidateFamily);
      if (root3 && filePath && isInside(pathApi, root3, filePath, { orSame: true })) return { family: candidateFamily, root: root3 };
    }
    return null;
  };
  const family = familyOf(scope);
  const root2 = rootOf2(family);
  if (helper2 && root2) context.uses.push({ family, root: root2, helper: true, bridge: Boolean(bridge), committed: scope === "project" });
  if (serenaContext && root2) context.uses.push({ family, root: root2, serenaContext, committed: scope === "project" });
  if (exclude && root2) context.uses.push({ family, root: root2, exclude, committed: scope === "project" });
  const keyHolder = holder(keyFile);
  if (keyHolder && keyFile && typeof keyName === "string") context.uses.push({ ...keyHolder, key: { file: keyFile, name: keyName, names: keyNames || [keyName] } });
  const dataHolder = holder(data);
  if (dataHolder) context.uses.push(dataHolder);
}
function fileSteps(inventory, context, out, regSteps = []) {
  const pathApi = pathFor(context.platform);
  const exists2 = context.exists || ((filePath) => fs31.existsSync(filePath));
  const lists = listSteps(inventory, context, out, regSteps);
  const byRoot = /* @__PURE__ */ new Map();
  for (const family of FAMILIES)
    for (const rootUse of context.uses.filter((candidate) => candidate.family === family)) {
      const rootWrite = byRoot.get(rootUse.root) || { family, root: rootUse.root, helper: false, bridge: false, serenaContext: /* @__PURE__ */ new Set(), exclude: null, keys: /* @__PURE__ */ new Map() };
      byRoot.set(rootUse.root, rootWrite);
      if (rootUse.helper) rootWrite.helper = true;
      if (rootUse.bridge) rootWrite.bridge = true;
      if (rootUse.serenaContext) rootWrite.serenaContext.add(rootUse.serenaContext);
      if (rootUse.exclude) rootWrite.exclude = rootUse.exclude;
      if (rootUse.committed) rootWrite.committed = true;
      if (rootUse.key) rootWrite.keys.set(rootUse.key.file, [.../* @__PURE__ */ new Set([...rootWrite.keys.get(rootUse.key.file) || [], ...rootUse.key.names || [rootUse.key.name]])]);
    }
  const ignore = [];
  const helpers = [];
  const names2 = [];
  const records = [];
  const map = inventory.roots && inventory.roots.map || null;
  for (const rootWrite of byRoot.values()) {
    const existed = exists2(rootWrite.root);
    if (!existed && pathApi.basename(rootWrite.root) !== ALFRED_DATA)
      ignore.push({ op: "root-ignore", path: rootWrite.root, why: `the new root ${rootWrite.root}: its .gitignore keeps the key file, the record and the data out of git` });
    const gap = existed ? ignoreGap(rootWrite.root, rootWrite.family, { writes: [...rootWrite.bridge ? [FILES.bridge] : [], ...rootWrite.serenaContext.has(rootWrite.root) ? [FILES.serenaContext] : [], ...rootWrite.exclude ? [FILES.macosExclude] : []] }) : null;
    if (existed && pathApi.basename(rootWrite.root) !== ALFRED_DATA) {
      const lines = rootIgnoreLines(rootWrite.root);
      if (lines.text !== null && lines.mine && lines.lack.length)
        ignore.push({ op: "root-ignore", path: rootWrite.root, why: `${rootWrite.root}: its .gitignore gains ${lines.lack.join(", ")}` });
    }
    if (gap && gap.secrets) out.notes.push(`${rootWrite.root}: ${gap.reason} - no key file is written there; /alfred-tools:fix (root-ignore) covers it`);
    if (gap && gap.helper && rootWrite.committed)
      out.notes.push(`${rootWrite.root}: ${gap.reason} - ${gap.excluded ? `a .gitignore above excludes ${rootWrite.root}: remove that line (git check-ignore -v ${rootWrite.root} names it)` : "/alfred-tools:fix (root-ignore) covers it"}`);
    if (rootWrite.helper) {
      const { state } = helperState(pathApi.join(rootWrite.root, FILES.helper), exists2);
      if (state === "absent" || state === "lower")
        helpers.push({ op: "write-helper", path: rootWrite.root, why: `${rootWrite.root}: mcp-headers.js, which reads a hosted key from .mcps-secrets each time Claude Code connects` });
      else if (state === "higher") out.notes.push(`mcp-headers.js in ${rootWrite.root} is newer than this plugin - update alfred-tools`);
      else if (state === "edited") out.notes.push(`mcp-headers.js in ${rootWrite.root} changed since alfred-tools wrote it - left as it is; /alfred-tools:fix (helper-stale) rewrites it`);
    }
    if (rootWrite.bridge) {
      const { state } = shippedState("bridge", pathApi.join(rootWrite.root, FILES.bridge), exists2);
      if (state === "absent" || state === "lower")
        helpers.push({ op: "write-bridge", path: rootWrite.root, why: `${rootWrite.root}: mcp-bridge.js, which ${BRIDGE_WHY}` });
      else if (state === "higher") out.notes.push(`mcp-bridge.js in ${rootWrite.root} is newer than this plugin - update alfred-tools`);
      else if (state === "edited") out.notes.push(`mcp-bridge.js in ${rootWrite.root} changed since alfred-tools wrote it - left as it is; /alfred-tools:fix (helper-stale) rewrites it`);
    }
    for (const folder of rootWrite.serenaContext) {
      const { state } = shippedState("serenaContext", pathApi.join(folder, FILES.serenaContext), exists2);
      if (state === "absent" || state === "lower")
        helpers.push({ op: "write-serena-context", path: folder, why: `${folder}: serena-context.yml, the context serena runs with - code navigation only, in Claude Code and Cursor` });
      else if (state === "higher") out.notes.push(`serena-context.yml in ${folder} is newer than this plugin - update alfred-tools`);
      else if (state === "edited") out.notes.push(`serena-context.yml in ${folder} changed since alfred-tools wrote it - left as it is; /alfred-tools:fix (helper-stale) rewrites it`);
    }
    const excludeAt = pathApi.join(rootWrite.root, FILES.macosExclude);
    const movedHere = (context.rootMoves || []).some((move) => move.to === excludeAt);
    if (rootWrite.exclude && !exists2(excludeAt) && !movedHere)
      helpers.push({ op: "write-exclude-file", path: rootWrite.root, tools: rootWrite.exclude, why: `${rootWrite.root}: ${FILES.macosExclude}, the tools macos-mcp leaves out (${rootWrite.exclude.join(", ")})` });
    if (!gap || !gap.secrets)
      for (const [file, want] of rootWrite.keys) {
        const have = new Set(exists2(file) ? namesIn(file) : []);
        const lack = want.filter((name) => !have.has(name));
        if (lack.length) names2.push({ op: "ensure-key-name", file, names: lack, why: `${file}: the key's name - names only, you fill in each value` });
      }
    const mapped = !map ? null : rootWrite.family === "global" ? map.global : Object.keys(map.projects || {}).length ? map.projects[mapKey(context.project)] : null;
    if (mapped !== rootWrite.root)
      records.push({ op: "record-root", family: rootWrite.family, project: context.project, root: rootWrite.root, why: `the ${rootWrite.family} root ${rootWrite.root}: written to the roots map, so the commands find it again` });
  }
  return { before: [...ignore, ...helpers, ...names2], after: [...lists, ...records] };
}

// scripts/fix/key-to-launcher.ts
var rootsOf2 = (context) => resolveRoots(context.inventory, null, { project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog }).roots;
var chainOf = (context, scope, resolved) => stdioChain({ scope, projectRoot: resolved.project, globalRoot: resolved.global, platform: context.platform });
var isLauncherScope = (scope) => LAUNCHER_SCOPES.includes(scope);
var placeOf = (context, scope, resolved) => launcherPlace(scope, { project: context.inventory.project, platform: context.platform, home: context.home, roots: resolved });
function listServerOf(context, registration) {
  const lists = Object.values(context.inventory.lists ?? {}).flatMap((list) => list && !list.note && !list.old ? list.servers : []);
  return lists.find((server) => server.name === registration.name && server.scope === registration.scope);
}
function heldKeyOf(entry, route) {
  const field = tokenFields(entry, route).find((candidate) => candidate.at[0] === "env");
  return field && route.tokenVar ? keyIn(valueAt(entry, field.at), field.template, route.tokenVar) : null;
}
var isOnlyCopy = (held, fileValue) => held !== "" && !ONE_VAR.test(held) && !held.includes(MARKER) && held !== fileValue;
var editedBridgeRoot = (context, resolved, scope) => {
  const root2 = resolved[familyOf(scope)];
  return root2 && shippedState("bridge", pathFor(context.platform).join(root2, FILES.bridge)).state === "edited" ? root2 : null;
};
var editedBridgeText = (root2) => `mcp-bridge.js in ${root2} changed since alfred-tools wrote it - /alfred-tools:fix (helper-stale) rewrites it, or delete it, then run fix again`;
var cursorReadOf = (context) => {
  const file = fileFor("global", { platform: context.platform, project: context.inventory.project, home: context.home, env: context.env ?? {} });
  return { file, read: readCursor(file) };
};
function heldInCursor(cursor, name, route) {
  const copy = cursor.read.state === "ok" ? cursor.read.servers[name] : void 0;
  return copy ? heldKeyOf(moveArgKeyToEnv(copy, route), route) : null;
}
function cursorUnwritable(cursor, name) {
  const why = refusal(cursor.read);
  if (why) return `${cursor.file} ${why}`;
  const copy = cursor.read.state === "ok" && Object.hasOwn(cursor.read.doc.mcpServers, name) ? cursor.read.doc.mcpServers[name] : void 0;
  return copy !== void 0 && !isServerEntry(copy) ? `its copy in ${cursor.file} is not in the shape Cursor reads (a string command or url, args a list of strings, env and headers maps of strings) - correct or remove it there` : null;
}
function cursorCopyWithOtherKey(context, target, route, fileValue, listed, cursor = cursorReadOf(context)) {
  if (target.scope !== "user" || !(listed?.clients ?? []).includes("cursor")) return null;
  const held = heldInCursor(cursor, target.name, route);
  return held !== null && isOnlyCopy(held, fileValue) ? cursor.file : null;
}
function keyToLauncherDetect(context) {
  return [...registrationFindings(context), ...cursorOnlyFindings(context)];
}
function registrationFindings(context) {
  const resolved = rootsOf2(context);
  return registrationsOf(context, FIX_ID.keyToLauncher).flatMap((registration) => {
    const route = routeOf(context, registration);
    if (!route || !registration.route || !route.tokenVar || !isLauncherScope(registration.scope) || !launcherRoute(route, registration.route, registration.scope) || launcherParts(registration.entry)) return [];
    const held = heldKeyOf(moveArgKeyToEnv(registration.entry, route), route);
    if (held === null) return [];
    const chain = chainOf(context, registration.scope, resolved);
    const listed = listServerOf(context, registration);
    const listKey = listed?.key ?? null;
    const [, placeholder] = ONE_VAR.exec(held) ?? [];
    const name = [placeholder, nameOfValue(chain, held), listKey, route.tokenVar].find((candidate) => candidate && valueIn(chain, candidate));
    const hit = name ? valueIn(chain, name) : null;
    const extra = { route: registration.route, roots: resolved, chain, ...name ? { keyName: name } : {} };
    if (!name || !hit) {
      const where2 = `put it in ${chain[0] ?? ".mcps-secrets"} as ${listKey || route.tokenVar}, then run fix again`;
      return [held === "" ? finding(FIX_ID.keyToLauncher, registration, "the registration has no key to move", { ...extra, blocked: `${registration.name} has no key - ${where2}` }) : finding(FIX_ID.keyToLauncher, registration, "the registration holds its key, which no .mcps-secrets holds", { ...extra, blocked: `${registration.name} holds a key no .mcps-secrets holds - ${where2}` })];
    }
    if (isOnlyCopy(held, hit.value))
      return [finding(FIX_ID.keyToLauncher, registration, `the registration holds a key that differs from the one in ${hit.file}`, { ...extra, blocked: `${registration.name} holds a key that differs from the one in ${hit.file} - put the key that works in ${hit.file} as ${name} (or run fix, whose token-sync takes the file's), then run fix again` })];
    const cursorFile = cursorCopyWithOtherKey(context, registration, route, hit.value, listed);
    if (cursorFile !== null)
      return [finding(FIX_ID.keyToLauncher, registration, `Cursor's copy holds a key that differs from the one in ${hit.file}`, { ...extra, blocked: `${registration.name}: Cursor's copy in ${cursorFile} holds a key that differs from the one in ${hit.file} - put the key that works in ${hit.file} as ${name} (or run fix, whose token-sync takes the file's), then run fix again` })];
    const editedIn = editedBridgeRoot(context, resolved, registration.scope);
    if (editedIn !== null)
      return [finding(FIX_ID.keyToLauncher, registration, "the root's mcp-bridge.js is not the one alfred-tools wrote", { ...extra, blocked: editedBridgeText(editedIn) })];
    return [finding(FIX_ID.keyToLauncher, registration, `the registration holds its key - it moves to the launcher, which reads ${name} from ${hit.file} each time the server starts`, extra)];
  });
}
function cursorOnlyFindings(context) {
  const resolved = rootsOf2(context);
  const fixRow = fixRowOf(context, FIX_ID.keyToLauncher);
  const claudeNames = new Set(context.inventory.registrations.filter((registration) => registration.scope === "user").map((registration) => registration.name));
  const usable = Object.values(context.inventory.lists ?? {}).flatMap((list) => list && !list.note && !list.old ? [list] : []);
  return usable.flatMap((list) => list.servers.flatMap((server) => {
    const clients = server.clients ?? [];
    const row = server.row ? rowOf2(context, server.row) : void 0;
    const route = row && server.route ? row.routes[server.route] : void 0;
    if (server.scope !== "user" || !clients.includes("cursor") || clients.includes("claude") || claudeNames.has(server.name)) return [];
    if (!row || !server.route || !route?.tokenVar || !fixRow.tool.includes(row.id) || !launcherRoute(route, server.route, server.scope)) return [];
    if (launcherParts(server.entry) || !stdioKeyed(server.entry, row, server.route)) return [];
    const chain = chainOf(context, server.scope, resolved);
    const name = server.key || route.tokenVar;
    const hit = valueIn(chain, name);
    const target = { rowId: row.id, name: server.name, scope: server.scope };
    const extra = { route: server.route, roots: resolved, chain, listOnly: true, list: list.file, family: familyOf(server.scope), keyName: name };
    const blocked = (found, text) => [finding(FIX_ID.keyToLauncher, target, found, { ...extra, blocked: text })];
    const cursor = cursorReadOf(context);
    const unwritable = cursorUnwritable(cursor, server.name);
    if (unwritable !== null) return blocked("Cursor's file cannot be written", `${server.name}: ${unwritable} - then run fix again`);
    if (!hit) {
      const held = heldInCursor(cursor, server.name, route);
      const where2 = `put it in ${chain[0] ?? ".mcps-secrets"} as ${name}, then run fix again`;
      return held !== null && isOnlyCopy(held, "") ? blocked("Cursor's copy holds its key, which no .mcps-secrets holds", `${server.name} holds a key no .mcps-secrets holds - ${where2}`) : blocked("the server has no key to move", `${server.name} has no key - ${where2}`);
    }
    const cursorFile = cursorCopyWithOtherKey(context, target, route, hit.value, server, cursor);
    if (cursorFile !== null)
      return blocked(`Cursor's copy holds a key that differs from the one in ${hit.file}`, `${server.name}: Cursor's copy in ${cursorFile} holds a key that differs from the one in ${hit.file} - put the key that works in ${hit.file} as ${name}, then run fix again`);
    const editedIn = editedBridgeRoot(context, resolved, server.scope);
    if (editedIn !== null) return blocked("the root's mcp-bridge.js is not the one alfred-tools wrote", editedBridgeText(editedIn));
    return [finding(FIX_ID.keyToLauncher, target, `kept for Cursor alone, its key is in Cursor's file - it moves to the launcher, which reads ${name} from ${hit.file} each time the server starts`, extra)];
  }));
}
function keyToLauncherFix(entry, finding2, context) {
  const keyName = fieldOf(finding2, "keyName");
  const chain = fieldOf(finding2, "chain");
  if (!valueIn(chain, keyName)) throw new Error(`${keyName} is filled in none of ${chain.join(", ")} any more - nothing written`);
  const route = findingRoute(context, finding2);
  const launched = launcherForm(route, keyName, placeOf(context, fieldOf(finding2, "scope"), finding2.roots), moveArgKeyToEnv(entry, route));
  if (!launched) throw new Error(`${finding2.name}: no key in its env to move - nothing written`);
  return launched;
}
function keyToLauncherCursorSteps(finding2, context, _input = {}, notes = []) {
  const [list, keyName, chain] = [fieldOf(finding2, "list"), fieldOf(finding2, "keyName"), fieldOf(finding2, "chain")];
  if (!valueIn(chain, keyName)) throw new Error(`${keyName} is filled in none of ${chain.join(", ")} any more - nothing written`);
  const read2 = readList(list);
  const server = read2 && !read2.state ? read2.servers.find((candidate) => candidate.name === finding2.name && candidate.scope === finding2.scope) : void 0;
  if (!server) throw new Error(`${finding2.name}: not in ${list} any more - nothing written`);
  const resolved = rootsOf2(context);
  const launched = launcherForm(findingRoute(context, finding2), keyName, placeOf(context, server.scope, resolved), server.entry);
  if (!launched) throw new Error(`${finding2.name}: no key in its entry to move - nothing written`);
  const editedIn = editedBridgeRoot(context, resolved, server.scope);
  if (editedIn !== null) throw new RestoreBlocked(`${finding2.name} (${server.scope}): ${editedBridgeText(editedIn)}`);
  const unwritable = cursorUnwritable(cursorReadOf(context), finding2.name);
  if (unwritable !== null) throw new RestoreBlocked(`${finding2.name} (${server.scope}): ${unwritable} - then run fix again`);
  const fileContext = { platform: context.platform, project: context.inventory.project, home: context.home, roots: resolved, uses: [] };
  useRoots(fileContext, server.scope, { helper: true, bridge: true, keyFile: null, keyName: null, data: null });
  const files = fileSteps(context.inventory, fileContext, { notes });
  const why = `${finding2.name} (${server.scope}): the key moves out of Cursor's copy to the launcher`;
  const family = fieldOf(finding2, "family");
  const moved = { ...server, entry: launched };
  delete moved.cursorEntry;
  const write = { op: "list-write", file: list, family, upserts: [{ server: moved, after: null, cursorFile: null }], drops: [], own: null, why: `${list}: ${why}` };
  const cursorFile = fileFor(family, { platform: context.platform, project: context.inventory.project, home: context.home, env: context.env ?? {} });
  const cursorWrite2 = { op: "cursor-write", file: cursorFile, family, lists: [{ file: list, scopes: SCOPES.global }], before: [finding2.name], only: [finding2.name], skip: [], replace: [], why: `${cursorFile}: ${why}` };
  return [...files.before, write, cursorWrite2, ...files.after];
}
function restoredLauncher(entry, listKey, row, routeId, scope, context) {
  const route = row.routes[routeId];
  if (!route || !route.tokenVar || !isLauncherScope(scope) || !launcherRoute(route, routeId, scope) || launcherParts(entry)) return null;
  const resolved = rootsOf2(context);
  const name = listKey || route.tokenVar;
  const hit = valueIn(chainOf(context, scope, resolved), name);
  if (!hit) return null;
  const held = heldKeyOf(moveArgKeyToEnv(entry, route), route);
  return held !== null && isOnlyCopy(held, hit.value) ? null : launcherForm(route, name, placeOf(context, scope, resolved), entry);
}
var RestoreBlocked = class extends Error {
};
function restoreLauncherSteps(step, context, notes = []) {
  const resolved = rootsOf2(context);
  const editedIn = editedBridgeRoot(context, resolved, step.scope);
  if (editedIn !== null) throw new RestoreBlocked(`${step.name} (${step.scope}): ${editedBridgeText(editedIn)}`);
  const fileContext = { platform: context.platform, project: context.inventory.project, home: context.home, roots: resolved, uses: [] };
  useRoots(fileContext, step.scope, { helper: true, bridge: true, keyFile: null, keyName: null, data: null });
  const files = fileSteps(context.inventory, fileContext, { notes });
  const tail = repairTail(context.inventory, { platform: context.platform, project: context.inventory.project, home: context.home, env: context.env, catalog: context.catalog, notes }, [step]);
  return [...files.before, step, ...tail, ...files.after];
}
var openDriftsOf = (finding2, found) => finding2.id === FIX_ID.keyToLauncher ? found.filter((candidate) => candidate.id === "client-drift" && (candidate.app === "claude" || finding2.listOnly === true) && candidate.name === finding2.name && candidate.scope === finding2.scope) : [];
var waitsForDrift = (finding2, found) => openDriftsOf(finding2, found).length > 0;
var SETTLING = ["restore", "keep", "drop"];
function driftAnswersOf(finding2, found) {
  const settling = (drift) => drift.inherited || drift.keyGuard || drift.keyEmpty ? ["restore"] : drift.change === "missing" ? ["drop", "restore"] : ["keep", "restore"];
  const answers = new Set(openDriftsOf(finding2, found).flatMap(settling));
  const named = SETTLING.filter((answer) => answers.has(answer));
  const list = named.length > 2 ? `${named.slice(0, -1).join(", ")} or ${named.at(-1)}` : named.join(" or ");
  return `${list}; 'leave' does not settle it`;
}

// scripts/fix/lists.ts
var pathOf = (context) => pathFor(context.platform);
var plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
var rootsOf3 = (context) => resolveRoots(context.inventory, null, { project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog }).roots;
var mixedNote = (names2) => `${names2.join(", ")}: set up for Claude Code only - the list's servers are not all on Cursor; /alfred-tools:configure (Apps) adds Cursor`;
function listImportDetect(context) {
  const pathApi = pathOf(context);
  const resolvedRoots = rootsOf3(context);
  const out = [];
  for (const family of FAMILIES) {
    const list = context.inventory.lists && context.inventory.lists[family];
    if (list && list.note) continue;
    const servers = importUnlisted(context.inventory, family, context.catalog, { roots: resolvedRoots, platform: context.platform });
    const familyRoot = resolvedRoots[family];
    const file = list ? list.file : familyRoot ? pathApi.join(familyRoot, FILES.list) : null;
    if (!file) continue;
    const beside = pathApi.join(pathApi.dirname(file), FILES.record);
    const record = list && list.old ? list.old : fs32.existsSync(beside) ? beside : null;
    if (!servers.length && !record) continue;
    const what = [servers.length ? `${plural(servers.length, "managed server")} not in it (${servers.map((server) => server.name).join(", ")})` : null, record ? `${record} still holds the servers left on their own` : null].filter(Boolean);
    const afterNote = servers.length && adoptedClients(context.inventory, family).mixed ? mixedNote(servers.map((server) => server.name)) : void 0;
    out.push({ id: "list-import", name: file, scope: null, family, servers, record, found: `${file}: ${what.join("; ")}`, ...afterNote ? { afterNote } : {} });
  }
  return out;
}
function listImportSteps(finding2, context) {
  const pathApi = pathOf(context);
  const root2 = pathApi.dirname(finding2.name);
  const existed = fs32.existsSync(root2);
  const steps = [];
  if (!existed && pathApi.basename(root2) !== ALFRED_DATA)
    steps.push({ op: "root-ignore", path: root2, why: `the new root ${root2}: its .gitignore keeps the key file, the list and the data out of git` });
  const read2 = readList(finding2.name);
  const own = read2 && !read2.state ? read2.own : [];
  const record = finding2.record ? readOldRecord(finding2.record) : null;
  const old = finding2.record ? ownOnly(record ? record.servers : void 0) : [];
  const have = new Set(own.map(recordKey));
  const keep = [...own, ...old.filter((entry) => !have.has(recordKey(entry)))];
  const twoForms = fieldOf(finding2, "servers").filter((server) => (server.clients || []).includes("cursor") && helperParts(server.entry.headersHelper));
  const bridge = pathApi.join(root2, FILES.bridge);
  if (twoForms.length && ["absent", "lower"].includes(shippedState("bridge", bridge).state))
    steps.push({ op: "write-bridge", path: root2, why: `${root2}: mcp-bridge.js, which ${BRIDGE_WHY}` });
  const write = {
    op: "list-write",
    file: finding2.name,
    family: fieldOf(finding2, "family"),
    upserts: fieldOf(finding2, "servers").map((server) => ({ server: twoForms.includes(server) ? { ...server, form: "two" } : server, after: null, cursorFile: null })),
    drops: [],
    own: finding2.record ? { entries: [], keep, live: null } : null,
    why: `${finding2.name}: the servers alfred-tools manages, as read, and the ones left on their own`
  };
  steps.push(write);
  if (finding2.record) steps.push({ op: "retire-record", file: finding2.record, why: `${finding2.record}: the 0.4.x record - its entries are in ${finding2.name} now` });
  const map = context.inventory.roots && context.inventory.roots.map || null;
  const mapped = !map ? null : finding2.family === "global" ? map.global : (map.projects || {})[mapKey(context.inventory.project)];
  if (mapped !== root2) steps.push({ op: "record-root", family: fieldOf(finding2, "family"), project: context.inventory.project, root: root2, why: `the ${finding2.family} root ${root2}: written to the roots map, so the commands find it again` });
  return [...steps, ...cursorStepsOf(write, context)];
}
function cursorStepsOf(write, context) {
  if (!write.upserts.some((upsert) => (upsert.server.clients || []).includes("cursor"))) return [];
  const tctx = { platform: context.platform, project: context.inventory.project, home: context.home, env: context.env, catalog: context.catalog, roots: rootsOf3(context), uses: [] };
  const out = { steps: [write], notes: [], errors: [] };
  const planned = cursorSteps(context.inventory, tctx, out, {});
  return out.errors.length ? [] : planned;
}
function readGuardDetect(context) {
  const pathApi = pathOf(context);
  const resolvedRoots = rootsOf3(context);
  const seen = [...new Set([resolvedRoots.project, resolvedRoots.global].filter((root2) => Boolean(root2)))];
  const why = [];
  const want = [];
  const has = (name) => seen.find((root2) => fs32.existsSync(pathApi.join(root2, name)));
  const secrets = has(FILES.secrets);
  if (secrets) {
    want.push(READ_GUARD.secrets);
    why.push(`${pathApi.join(secrets, FILES.secrets)}`);
  }
  const signIns = has(FILES.signIns);
  if (signIns) {
    want.push(READ_GUARD.signIns);
    why.push(`${pathApi.join(signIns, FILES.signIns)}/`);
  }
  if (!want.length) return [];
  const bad = (file) => ({ id: "read-guard", name: file, scope: null, rules: want, found: `${file}: not a settings object alfred-tools can read`, blocked: `add ${want.join(" and ")} to permissions.deny yourself` });
  const out = [];
  const residual = context.platform === "win32" ? READ_GUARD_RESIDUAL.win32 : READ_GUARD_RESIDUAL.sandboxed;
  const current = readGuardOf(context, want);
  if (current.bad) out.push(bad(current.file));
  else if (current.rules.length) out.push({ id: "read-guard", name: current.file, scope: null, rules: current.rules, found: `${current.file} does not deny ${current.rules.join(" or ")} - an AI session's Read tool can open ${why.join(" and ")}${residual}` });
  for (const dir of configDirsWithPlugin(context.home, pathApi.dirname(current.file), context.platform)) {
    const guard = readGuardOf(context, want, dir);
    if (guard.bad) out.push(bad(guard.file));
    else if (guard.rules.length) out.push({ id: "read-guard", name: guard.file, scope: null, rules: guard.rules, found: `${dir} has alfred-tools installed and does not deny ${guard.rules.join(" or ")} - an AI session's Read tool can open ${why.join(" and ")}${residual}`, afterNote: `${dir}: read guard added - it keeps its own plugin data, so an update there may offer a declined uninstall again` });
  }
  return out;
}
var readGuardSteps = (finding2) => [denyReadStep(finding2.name, fieldOf(finding2, "rules"))];
function serenaBaseModesDetect(context) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const registration of (context.inventory.registrations || []).filter((candidate) => candidate.rowId === "serena" && isManaged(candidate) && candidate.scope !== "inherited")) {
    const home = registration.entry && registration.entry.env && registration.entry.env.SERENA_HOME;
    if (!home) continue;
    const editable = editableHome(home, { platform: context.platform });
    const file = configOf(home);
    if (!editable.ok || seen.has(file)) continue;
    seen.add(file);
    if (baseModesState(file) !== "set") continue;
    out.push({ id: "serena-base-modes", name: file, scope: null, file, shared: Boolean(editable.shared), found: `${file} lists base modes - serena's manual names edit tools its context leaves out`, ...editable.shared ? { note: planNote(registration.entry, { platform: context.platform }) } : {} });
  }
  return out;
}
var serenaBaseModesSteps = (finding2) => [{ op: "serena-base-modes", file: fieldOf(finding2, "file"), shared: finding2.shared, why: `${finding2.file}: base_modes: [], so serena's manual names only the tools it has` }];
function serenaProjectFolderDetect(context) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const registration of (context.inventory.registrations || []).filter((candidate) => candidate.rowId === "serena" && isManaged(candidate) && candidate.scope !== "inherited")) {
    const home = registration.entry && registration.entry.env && registration.entry.env.SERENA_HOME;
    if (!home) continue;
    const editable = editableHome(home, { platform: context.platform });
    const file = configOf(home);
    if (!editable.ok || "error" in folderValue(home) || seen.has(file)) continue;
    seen.add(file);
    const same2 = folderState(file, home) === "same";
    const inTree = inTreeFolders(file, home);
    const movable = inTree.filter((folder) => folder.reason === null);
    if (same2 && !movable.length) continue;
    const stays = inTree.flatMap((folder) => folder.reason === null ? [] : [`${folder.from} stays - ${folder.reason}`]);
    const found = same2 ? `${file} sets ${FOLDER_KEY}, and ${movable.length} listed project${movable.length === 1 ? " still keeps" : "s still keep"} a .serena folder inside the project - it moves to ${home}/projects${stays.length ? `; ${stays.join("; ")}` : ""}` : `${file} does not set ${FOLDER_KEY} - serena keeps each project's .serena folder inside the project`;
    out.push({ id: "serena-project-folder", name: file, scope: null, file, path: home, shared: Boolean(editable.shared), found, ...editable.shared ? { note: planNote(registration.entry, { platform: context.platform }) } : {} });
  }
  return out;
}
var serenaProjectFolderSteps = (finding2) => {
  const file = fieldOf(finding2, "file");
  const home = fieldOf(finding2, "path");
  const state = folderState(file, home);
  const init = state === "absent" && !fs32.existsSync(file) ? [{ op: "serena-config-init", file, home, why: `${file}: written with its project folders under ${home}/projects` }] : [];
  const setKey = state === "same" ? [] : [{ op: "serena-project-folder", file, home, why: `${file}: ${FOLDER_KEY} under ${home}/projects, so serena keeps each project's .serena folder there` }];
  const moves = inTreeFolders(file, home).filter((folder) => folder.reason === null).map((folder) => ({ op: "serena-folder-move", project: folder.project, from: folder.from, to: folder.to, why: `${folder.from}: moved to ${folder.to}, where serena keeps this project's folder now - a running serena may write to the old folder until Claude Code restarts` }));
  return [...init, ...setKey, ...moves];
};
var APP_LABELS = { claude: "Claude Code", cursor: "Cursor" };
var cursorCtx = (context) => ({ platform: context.platform, project: context.inventory.project, home: context.home, env: context.env || {} });
var usableList = (context, family) => {
  const list = context.inventory.lists && context.inventory.lists[family];
  return list && !list.note && !list.old ? list : null;
};
function keyGuardOf(copy, row, routeId) {
  const route = row && row.routes && routeId ? row.routes[routeId] : null;
  const field = new Set(tokenFields(copy, route).map((tokenField) => tokenField.at.join(".")));
  let hit = false;
  const walk = (node, at2) => {
    if (hit) return;
    if (typeof node === "string") {
      if (!field.has(at2.join(".")) && looksLikeKey(node)) hit = true;
      return;
    }
    if (node && typeof node === "object") for (const [key, child] of Object.entries(node)) walk(child, [...at2, key]);
  };
  walk(copy, []);
  return hit;
}
function driftOf(server, app, change, { list, family, file = null, inherited = null, keyGuard = false, keyEmpty = false, rowGone = false }) {
  const found = inherited ? change === "missing" ? `${server.name} from ${inherited} is no longer in Cursor's ${file}` : `Cursor's copy in ${file} differs from ${inherited}'s list` : change === "missing" ? `on ${list} for ${APP_LABELS[app]}, which no longer has it` : `${APP_LABELS[app]}'s copy differs from ${list}`;
  return { id: "client-drift", name: server.name, scope: server.scope, row: server.row, route: server.route, app, change, inherited, keyGuard, keyEmpty, rowGone, family, list, file, driftKey: `drift:${app}:${server.name}~${server.scope}`, found };
}
function keyEmptyOf(copy, want, row, routeId) {
  const route = row && row.routes && routeId ? row.routes[routeId] : null;
  const fields = tokenFields(copy, route);
  return fields.length > 0 && fields.every((tokenField) => {
    const copyValue = valueAt(copy, tokenField.at);
    const wantedValue = valueAt(want, tokenField.at);
    return typeof copyValue === "string" && !copyValue.trim() && typeof wantedValue === "string" && wantedValue.includes(MARKER);
  });
}
function clientDriftDetect(context) {
  const catalog = context.catalog;
  const cctx = cursorCtx(context);
  const out = [];
  const regs = (context.inventory.registrations || []).filter((registration) => registration.scope !== "inherited");
  const same2 = (left, right) => deepEqual(left, right);
  const compare = (copy, want, server, app, where2) => {
    const row = server.row ? catalog.byId.get(server.row) : void 0;
    if (copy === void 0) return out.push(driftOf(server, app, "missing", where2));
    if (same2(maskCredentials(copy, row), maskCredentials(want, row))) return void 0;
    return out.push(driftOf(server, app, "differs", { ...where2, keyGuard: keyGuardOf(copy, row, server.route), keyEmpty: keyEmptyOf(copy, want, row, server.route), rowGone: !matchesRow(copy, row) }));
  };
  for (const family of FAMILIES) {
    const list = usableList(context, family);
    if (!list) continue;
    const servers = list.servers || [];
    const where2 = { list: list.file, family };
    for (const server of servers.filter((candidate) => (candidate.clients || ["claude"]).includes("claude"))) {
      const registration = regs.find((candidate) => candidate.name === server.name && candidate.scope === server.scope);
      compare(registration ? registration.entry : void 0, server.entry, server, "claude", where2);
    }
    const file = fileFor(family, cctx);
    const read2 = readCursor(file);
    if (read2.state !== "ok" && read2.state !== "absent") continue;
    const have = read2.servers;
    for (const [name, managed2] of managedSet([{ file: list.file, scopes: SCOPES[family], servers }])) {
      const server = servers.find((candidate) => candidate.name === name && candidate.scope === managed2.scope);
      if (!server) continue;
      compare(Object.hasOwn(have, name) ? have[name] : void 0, managed2.entry, server, "cursor", { ...where2, file });
    }
  }
  const workspaceRecord = context.inventory.workspace !== void 0 ? context.inventory.workspace : workspaceOf(context.inventory.project, context.env || {});
  if (workspaceRecord && workspaceRecord.root && (workspaceRecord.ancestors || []).length) {
    const file = fileFor("project", cctx);
    const read2 = readCursor(file);
    if (read2.state === "ok" || read2.state === "absent") {
      const own = usableList(context, "project");
      const seen = new Set(own ? managedSet([{ file: own.file, scopes: SCOPES.project, servers: own.servers || [] }]).keys() : []);
      for (const up of workspaceRecord.ancestors) {
        const ancestorList = folderList(context.inventory, up, cctx);
        if (!ancestorList) continue;
        for (const [name, managed2] of managedSet([{ file: ancestorList.file, scopes: ["project"], servers: ancestorList.servers }])) {
          if (seen.has(name)) continue;
          seen.add(name);
          const server = ancestorList.servers.find((candidate) => candidate.name === name && candidate.scope === managed2.scope);
          if (!server) continue;
          const before = out.length;
          compare(Object.hasOwn(read2.servers, name) ? read2.servers[name] : void 0, managed2.entry, server, "cursor", { list: ancestorList.file, family: "project", file, inherited: up });
          for (const finding2 of out.slice(before)) {
            finding2.keyGuard = false;
            finding2.rowGone = false;
          }
        }
      }
    }
  }
  const order = [...new Set(out.map((finding2) => `${finding2.name}~${finding2.scope}`))];
  return out.sort((left, right) => order.indexOf(`${left.name}~${left.scope}`) - order.indexOf(`${right.name}~${right.scope}`) || (left.app === "claude" ? -1 : 1) - (right.app === "claude" ? -1 : 1));
}
function clientDriftSteps(finding2, context, input = {}, notes = []) {
  const answer = input[fieldOf(finding2, "driftKey")];
  const catalog = context.catalog;
  const row = catalog.byId.get(fieldOf(finding2, "row"));
  const read2 = readList(fieldOf(finding2, "list"));
  const listServer = read2 && !read2.state ? read2.servers.find((candidate) => candidate.name === finding2.name && candidate.scope === finding2.scope) : null;
  if (!listServer || answer === "leave") return [];
  const key = `mcp:${finding2.name}~${finding2.scope}`;
  const why = `${finding2.name} (${finding2.scope}): ${answer === "keep" ? `the change in ${APP_LABELS[fieldOf(finding2, "app")]} kept` : answer === "drop" ? `${APP_LABELS[fieldOf(finding2, "app")]} taken off its list entry` : `${APP_LABELS[fieldOf(finding2, "app")]}'s copy restored from the list`}`;
  const listStep = (server) => ({ op: "list-write", file: fieldOf(finding2, "list"), family: fieldOf(finding2, "family"), upserts: server ? [{ server, after: null, cursorFile: null }] : [], drops: server ? [] : [{ key, after: null }], own: null, why: `${finding2.list}: ${why}` });
  const cursorStep = () => ({ op: "cursor-write", file: finding2.file || fileFor(fieldOf(finding2, "family"), cursorCtx(context)), family: fieldOf(finding2, "family"), lists: [{ file: fieldOf(finding2, "list"), scopes: finding2.inherited ? ["project"] : fieldOf(finding2, "family") === "global" ? SCOPES.global : SCOPES.project }], before: [finding2.name], only: [finding2.name], skip: [], replace: [], why: `${finding2.file || "Cursor"}: ${why}` });
  const registration = (context.inventory.registrations || []).find((candidate) => candidate.name === finding2.name && candidate.scope === finding2.scope && candidate.scope !== "inherited");
  const claudeStep = (entry) => registration ? { op: "mcp-replace", name: finding2.name, scope: fieldOf(finding2, "scope"), old: registration.entry, entry, row: fieldOf(finding2, "row"), route: fieldOf(finding2, "route"), why } : { op: "mcp-add", name: finding2.name, scope: fieldOf(finding2, "scope"), entry, row: fieldOf(finding2, "row"), route: fieldOf(finding2, "route"), why };
  const cursorCopy = () => {
    const cursorRead = readCursor(fieldOf(finding2, "file"));
    return cursorRead.state === "ok" ? cursorRead.servers[finding2.name] : void 0;
  };
  if (finding2.inherited) return answer === "restore" ? [cursorStep()] : [];
  if (answer === "restore") {
    if (finding2.app === "cursor") return [cursorStep()];
    let entry = listServer.entry;
    if (holdsKept(entry) && registration) {
      const restored = restore(entry, registration.entry, row);
      if (restored.error === void 0) entry = restored.entry;
    }
    const routeId = listServer.route;
    const route = row && routeId ? row.routes[routeId] : void 0;
    const tokenVar = route && route.tokenVar;
    const launched = row && routeId ? restoredLauncher(entry, listServer.key, row, routeId, fieldOf(finding2, "scope"), context) : null;
    if (launched) entry = launched;
    if (holdsKept(entry) && listServer.key && row && routeId && tokenVar) {
      const resolvedRoots = resolveRoots(context.inventory, null, { project: context.inventory.project, home: context.home, platform: context.platform, catalog }).roots;
      const at2 = valueIn(stdioChain({ scope: fieldOf(finding2, "scope"), projectRoot: resolvedRoots.project, globalRoot: resolvedRoots.global, platform: context.platform }), listServer.key);
      if (at2) entry = fillKeys(entry, row, routeId, fieldOf(finding2, "scope"), { [tokenVar]: at2.value });
    }
    if (holdsKept(entry)) throw new Error(`${finding2.name} (${finding2.scope}): the list's entry holds a key ${listServer.key ? `named ${listServer.key} ` : ""}that is filled nowhere - fill it, then run fix again`);
    return launched ? restoreLauncherSteps(claudeStep(entry), context, notes) : [claudeStep(entry)];
  }
  if (answer === "drop") {
    const clients = (listServer.clients || ["claude"]).filter((client) => client !== finding2.app);
    return [listStep(clients.length ? { ...listServer, clients } : null)];
  }
  if (finding2.rowGone) return [listStep(null)];
  if (finding2.app === "claude") {
    if (!registration) throw new Error(`${finding2.name} (${finding2.scope}): no registration to keep - run fix again`);
    const server = { ...listServer, entry: maskCredentials(registration.entry, row) };
    if (listServer.cursorEntry) server.cursorEntry = bridgeFormOf(registration.entry, catalog, listServer.cursorEntry) || listServer.cursorEntry;
    return [listStep(server), ...(listServer.clients || []).includes("cursor") ? [cursorStep()] : []];
  }
  const copy = cursorCopy();
  if (listServer.cursorEntry) {
    const server = { ...listServer };
    if (copy) server.cursorEntry = maskCredentials(copy, row);
    else delete server.cursorEntry;
    return [listStep(server)];
  }
  if (!copy) throw new Error(`${finding2.name} (${finding2.scope}): Cursor's copy is not in ${finding2.file} any more - run fix again`);
  const back = registration ? restore(maskCredentials(copy, row), registration.entry, row) : { error: "none" };
  return [claudeStep(back.error === void 0 ? back.entry : copy), listStep({ ...listServer, entry: maskCredentials(copy, row) })];
}
function cursorFileDetect(context) {
  const cctx = cursorCtx(context);
  const out = [];
  for (const family of FAMILIES) {
    const file = fileFor(family, cctx);
    const why = refusal(readCursor(file));
    if (why) out.push({ id: "cursor-file", name: file, scope: null, found: `${file} ${why}` });
  }
  return out;
}

// scripts/fix/helper-foreign.ts
function keyNameOf(first, chain, rowName) {
  if (!first || !NAME_RULE.test(first) || looksLikeKey(first)) return rowName;
  return chain.some((file) => namesIn(file).includes(first)) ? first : rowName;
}
function appsOf(context, registration) {
  const family = familyOf(registration.scope);
  const familyList = context.inventory.lists && context.inventory.lists[family];
  if (!familyList || familyList.note || familyList.old) return { cursor: false };
  const listed = (familyList.servers || []).find((server) => serverKey(server) === serverKey(registration));
  if (listed) return { cursor: (listed.clients || []).includes("cursor") };
  const adopted = adoptedClients(context.inventory, family);
  return { cursor: adopted.clients.includes("cursor"), clients: adopted.clients, mixed: adopted.mixed };
}
function helperForeignDetect(context) {
  const out = [];
  const resolvedRoots = resolveRoots(context.inventory, null, { project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog }).roots;
  for (const registration of registrationsOf(context, "helper-foreign")) {
    const route = routeOf(context, registration);
    const command = registration.entry.headersHelper;
    if (registration.route !== "remote" || !route || !route.helper || typeof command !== "string" || helperParts(command)) continue;
    const script = foreignScript(command);
    if (!script) continue;
    const chain = hostedChain({ scope: registration.scope, projectRoot: resolvedRoots.project, globalRoot: resolvedRoots.global, globalNamed: resolvedRoots.globalNamed, home: context.home, platform: context.platform });
    const keyName = keyNameOf(script.first, chain, route.helper.var);
    const apps = appsOf(context, registration);
    const what = `headersHelper runs ${path32.basename(script.file)}, not mcp-headers.js - it moves to the plugin's helper, which reads ${keyName} from the key files`;
    const left = retirableHelper(command, context)?.left;
    const fate = left === null ? "it is removed when no registration or Cursor file names it and git does not track it" : `the old file is left where it is - ${left ?? "it is not a script file"}`;
    const afterNote = [`${path32.basename(script.file)} is no longer used - ${registration.name} runs mcp-headers.js now; ${fate}`, ...apps.mixed ? [mixedNote([registration.name])] : []].join("\n");
    const extra = { route: registration.route, roots: resolvedRoots, keyName, cursor: apps.cursor, afterNote, ...apps.clients ? { clients: apps.clients } : {} };
    out.push(valueIn(chain, keyName) ? finding("helper-foreign", registration, what, extra) : finding("helper-foreign", registration, what, { ...extra, blocked: `fill ${keyName} in ${chain[0]}, then run /alfred-tools:fix` }));
  }
  return out;
}
function helperForeignFix(entry, finding2, context) {
  const route = findingRoute(context, finding2);
  return { ...clone(entry), headersHelper: helperFor(route, fieldOf(finding2, "scope"), { project: context.inventory.project, platform: context.platform, home: context.home, roots: finding2.roots }, finding2.keyName) };
}

// scripts/fix/helper-foreign-file.ts
import fs33 from "node:fs";
function helperFilesIn(folder) {
  try {
    return fs33.readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isFile() && FOREIGN_HELPER_FILE.test(entry.name)).map((entry) => entry.name);
  } catch {
    return [];
  }
}
function helperForeignFileDetect(context) {
  const pathApi = pathFor(context.platform);
  const resolved = resolveRoots(context.inventory, null, { project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog }).roots;
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const root2 of [resolved.project, resolved.global]) {
    if (!root2) continue;
    for (const name of helperFilesIn(root2)) {
      const file = pathApi.join(root2, name);
      if (seen.has(file) || keepReason(file, { project: context.inventory.project, env: context.env, platform: context.platform })) continue;
      seen.add(file);
      out.push({ id: "helper-foreign-file", name: file, scope: null, file, found: `${file} is a hand-built key helper that no registration names any more` });
    }
  }
  return out;
}
var helperForeignFileSteps = (finding2) => {
  const file = fieldOf(finding2, "file");
  return [{ op: "retire-helper", file, why: `${file}: a hand-built key helper no registration runs - removed when no registration or Cursor file names it and git does not track it` }];
};

// scripts/fix/paths.ts
import fs34 from "node:fs";
import path33 from "node:path";
var pathOf2 = (context) => pathFor(context.platform);
var styleOf = (context) => context.platform === "win32" ? "win32" : "posix";
var runThere = (context, dir) => `run /alfred-tools:fix in ${fromHere(context.inventory, dir)}`;
var HOME_FORM = /^\$\{(HOME|USERPROFILE)\}(?=[\\/]|$)/;
var isAbsolute = (filePath) => path33.posix.isAbsolute(filePath) || pathApiOf(filePath) === path33.win32;
function absoluteOf(value, context) {
  if (typeof value !== "string" || !value) return null;
  const pathApi = pathOf2(context);
  if (HOME_FORM.test(value)) {
    const to = expandVars2(value, context.env);
    return to === null ? { unset: firstUnset(value, context.env) } : { to: pathApi.normalize(to) };
  }
  if (value.includes("${") || value.startsWith("~") || isAbsolute(value)) return null;
  return { to: pathApi.resolve(context.inventory.project, value) };
}
function serenaHome(to, context) {
  const root2 = resolveRoots(context.inventory, null, { project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog }).roots.project;
  const home = root2 ? path33.win32.join(root2, "serena") : null;
  return home && validWindowsSerenaHome(home) ? home : to;
}
function changesOf(entry, rowId, context) {
  const row = rowId ? rowOf2(context, rowId) : void 0;
  const paths = [];
  const unset = [];
  if (!row) return { paths, unset };
  for (const derived of row.locations && row.locations.derived || []) {
    let from;
    if (derived.in === "env") from = entry.env ? entry.env[derived.key] : void 0;
    else {
      const args = entry.args || [];
      const i = args.indexOf(derived.key);
      from = i >= 0 ? args[i + 1] : void 0;
    }
    const serena = rowId === "serena" && context.platform === "win32";
    if (serena && typeof from === "string" && !HOME_FORM.test(from)) continue;
    const absolute = absoluteOf(from, context);
    if (!absolute || from === void 0) continue;
    if (absolute.to === void 0) {
      if (absolute.unset) unset.push(absolute.unset);
      continue;
    }
    paths.push({ in: derived.in, key: derived.key, from, to: serena ? serenaHome(absolute.to, context) : absolute.to, was: absolute.to });
  }
  const parts = helperParts(entry.headersHelper);
  if (parts) {
    const absolute = absoluteOf(parts.path, context);
    if (absolute && absolute.unset) unset.push(absolute.unset);
    else if (absolute && absolute.to !== void 0) paths.push({ in: "helper", key: "headersHelper", from: parts.path, to: absolute.to, was: absolute.to });
  }
  return { paths, unset: [...new Set(unset)] };
}
function relativeText(paths, rowId) {
  const each = paths.map((change) => `${change.key} '${change.from}' -> ${change.to}${change.to === change.was ? "" : ` - the old data stays at ${change.was} - moving the path moves no data${rowId === "serena" ? ", and serena downloads its language servers there once (about 327MB)" : ""}`}`);
  return `named relative or through \${HOME}/\${USERPROFILE}, so a session started in a child folder uses its own copy: ${each.join("; ")}; a copy in a child folder is kept out of git by /alfred-tools:fix run there`;
}
function projectRelativePathDetect(context) {
  const out = [];
  for (const registration of registrationsOf(context, "project-relative-path").filter((candidate) => candidate.scope === "project")) {
    const { paths, unset } = changesOf(registration.entry, registration.rowId, context);
    if (unset.length) out.push(finding("project-relative-path", registration, `a path names \${${unset[0]}}`, { blocked: `${unset[0]} is not set here - there is no value to write the path as; set it, or pick the folder again with /alfred-tools:configure, Location` }));
    else if (paths.length) out.push(finding("project-relative-path", registration, relativeText(paths, registration.rowId), { proposal: { paths: paths.map(({ key, from, to }) => ({ key, from, to })) } }));
  }
  const tools = fixRowOf(context, "project-relative-path").tool;
  const parents = /* @__PURE__ */ new Map();
  for (const registration of inheritedOf(context, tools)) {
    if (!changesOf(registration.entry, registration.rowId, { ...context, inventory: { ...context.inventory, project: registration.from } }).paths.length) continue;
    parents.set(registration.from, [...parents.get(registration.from) || [], registration]);
  }
  for (const [dir, [first, ...rest]] of parents)
    if (first) out.push(finding("project-relative-path", { ...first, name: [first, ...rest].map((registration) => registration.name).join(", ") }, `${fromHere(context.inventory, dir)}/.mcp.json names a data folder or key helper relative or through \${HOME}/\${USERPROFILE}, so a session started here uses its own copy`, { blocked: runThere(context, dir) }));
  return out;
}
function projectRelativePathFix(entry, finding2, context) {
  const registration = context.inventory.registrations.find((candidate) => candidate.name === finding2.name && candidate.scope === finding2.scope);
  const { paths } = changesOf(entry, registration && registration.rowId || finding2.row, context);
  const out = { ...entry, ...entry.env ? { env: { ...entry.env } } : {}, ...entry.args ? { args: [...entry.args] } : {} };
  for (const change of paths) {
    if (change.in === "env") {
      if (out.env) out.env[change.key] = change.to;
    } else if (change.in === "arg") {
      if (out.args) out.args[out.args.indexOf(change.key) + 1] = change.to;
    } else {
      const argv = helperArgv(entry.headersHelper);
      const at2 = argv.findIndex((argument) => argument.endsWith(FILES.helper));
      const style = styleOf(context);
      out.headersHelper = [...argv.slice(0, at2), shellArg(change.to, style), ...argv.slice(at2 + 1).map((argument) => shellArg(argument, style))].join(" ");
    }
  }
  return out;
}
function parentOwn(context, dir) {
  const names2 = /* @__PURE__ */ new Set();
  for (const standardRoot of standard("project", { project: dir, home: context.home, platform: context.platform })) {
    const pathApi = pathOf2(context);
    const list = readList(pathApi.join(standardRoot.root, FILES.list));
    const record = list ? null : readOldRecord(pathApi.join(standardRoot.root, FILES.record));
    const own = list ? list.own : record && record.servers || [];
    for (const ownEntry of own) if (ownEntry.scope === "project" && ownEntry.choice === "own" && typeof ownEntry.name === "string") names2.add(ownEntry.name);
  }
  return names2;
}
function inheritedOf(context, tools) {
  const own = /* @__PURE__ */ new Map();
  const ownIn = (dir) => {
    const read2 = own.get(dir) || parentOwn(context, dir);
    own.set(dir, read2);
    return read2;
  };
  return context.inventory.registrations.filter((registration) => registration.scope === "inherited" && typeof registration.from === "string" && registration.from !== "" && !registration.own && !registration.alfredRetired && registration.rowId !== null && tools.includes(registration.rowId) && !ownIn(registration.from).has(registration.name));
}
function outOfOrder(file, context, own) {
  let text;
  try {
    text = fs34.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const reordered = reorderText(text, context.catalog, own);
  if (reordered.error || !reordered.changed) return null;
  const doc = JSON.parse(text);
  const held = isRecord(doc) ? doc["mcpServers"] : void 0;
  const servers = isRecord(held) ? held : {};
  const names2 = Object.keys(servers);
  const order = sortedNames(servers, context.catalog, own);
  const first = order.find((name, i) => name !== names2[i]);
  const entry = first === void 0 ? void 0 : servers[first];
  const match = isServerEntry(entry) ? matchEntry(entry, context.catalog) : null;
  return { names: names2, order, row: match ? match.rowId : null };
}
var orderText = (ordering) => `the catalog servers are not in your order: ${ordering.names.join(", ")} - in order: ${ordering.order.join(", ")}`;
function mcpOrderDetect(context) {
  const pathApi = pathOf2(context);
  const out = [];
  const own = ownProjectNames(context.inventory);
  const file = pathApi.join(context.inventory.project, MCP_JSON);
  const here = outOfOrder(file, context, new Set(own));
  if (here) out.push({ id: "mcp-order", row: here.row, name: MCP_JSON, scope: "project", found: orderText(here), proposal: { file, own } });
  const parents = new Map(context.inventory.registrations.flatMap((registration) => registration.scope === "inherited" && registration.from && registration.file ? [[registration.from, registration.file]] : []));
  for (const [dir, parentFile] of parents) {
    const parentOrder = outOfOrder(parentFile, context, parentOwn(context, dir));
    if (parentOrder) out.push({ id: "mcp-order", row: parentOrder.row, name: `${fromHere(context.inventory, dir)}/.mcp.json`, scope: "inherited", found: orderText(parentOrder), blocked: runThere(context, dir) });
  }
  return out;
}
function mcpOrderFix(finding2, context) {
  const result = orderFile(proposalOf(finding2, "file"), context.catalog, new Set(fieldOf(finding2, "proposal").own || []));
  return { ok: !/^warning: /.test(result.detail), restart: false, detail: result.detail };
}
function helperChildFolderDetect(context) {
  const tools = fixRowOf(context, "helper-child-folder").tool;
  return inheritedOf(context, tools).filter((registration) => registration.entry && typeof registration.entry.headersHelper === "string" && registration.approval !== "rejected" && !registration.shadowed).map((registration) => {
    const there = fromHere(context.inventory, registration.from);
    return finding(
      "helper-child-folder",
      registration,
      `${registration.name} comes from ${there}/.mcp.json, and Claude Code does not run a parent folder's key helper in a child folder - it connects here without its key`,
      { blocked: `move it to Global with /alfred-tools:configure in ${there}, or start Claude in ${there}` }
    );
  });
}

// scripts/fix/key-env.ts
function context7KeyEnvDetect(context) {
  return registrationsOf(context, FIX_ID.context7KeyEnv).flatMap((registration) => {
    const route = routeOf(context, registration);
    if (!route || registration.route === "remote" || moveArgKeyToEnv(registration.entry, route) === registration.entry) return [];
    return [finding(FIX_ID.context7KeyEnv, registration, "its key is passed as --api-key on the command line, where every process listing shows it", { route: registration.route })];
  });
}
function context7KeyEnvFix(entry, finding2, context) {
  return moveArgKeyToEnv(entry, findingRoute(context, finding2));
}
var pinOf = (entry, packageName) => packageName ? pinnedVersion(entry, packageName) : null;
function sentryAuthEnvDetect(context) {
  return registrationsOf(context, FIX_ID.sentryAuthEnv).flatMap((registration) => {
    const route = routeOf(context, registration);
    if (!route || registration.route === "remote") return [];
    const pin = pinOf(registration.entry, route.package?.name);
    if (renameSinceEnv(registration.entry, route, pin) === registration.entry) return [];
    return [finding(FIX_ID.sentryAuthEnv, registration, `${route.package?.name} ${pin} reads its key as ${Object.keys(route.envSince || {}).join(", ")} - the registration still passes the name older releases read`, { route: registration.route })];
  });
}
function sentryAuthEnvFix(entry, finding2, context) {
  const route = findingRoute(context, finding2);
  return renameSinceEnv(entry, route, pinOf(entry, route.package?.name));
}

// scripts/fix/retired-server.ts
import crypto2 from "node:crypto";
import path34 from "node:path";
var projectKey2 = (project, platform) => platform === "win32" ? path34.win32.resolve(project).toLowerCase() : path34.posix.normalize(project);
function declineIdOf(name, scope, project, platform) {
  if (scope === DECLINE.userScope) return `${DECLINE.prefix}${name}`;
  return `${DECLINE.prefix}${name}:${crypto2.createHash(DECLINE.hash).update(projectKey2(project, platform)).digest("hex").slice(0, DECLINE.hexLength)}`;
}
function retiredServerDetect(context) {
  const declined = read(context.data);
  return context.inventory.registrations.filter((registration) => registration.retiredRow && isManaged(registration) && registration.scope !== "inherited").flatMap((registration) => {
    const retired = context.catalog.retired.find((retiredRow) => retiredRow.id === registration.retiredRow);
    if (!retired) return [];
    const declineId = declineIdOf(registration.name, registration.scope, context.inventory.project, context.platform);
    const base = {
      id: FIX_ID.retiredServer,
      row: null,
      name: registration.name,
      scope: registration.scope,
      declineId,
      found: `${registration.name} runs ${retired.id}, which alfred-tools retired in ${retired.since}: ${retired.reason}`,
      note: `to keep it, pass --input retired-declined=${declineId}~${registration.scope}`
    };
    if (!declined.some((entry) => same(entry, { id: declineId, scope: registration.scope }))) return [base];
    return [{ ...base, declined: true, blocked: `${registration.name} is kept at ${registration.scope}; remove it with claude mcp remove ${registration.name} -s ${registration.scope}` }];
  });
}
function retiredServerSteps(context, findings) {
  return findings.filter((finding2) => finding2.id === FIX_ID.retiredServer && !finding2.blocked).flatMap((finding2) => {
    const registration = context.inventory.registrations.find((candidate) => candidate.name === finding2.name && candidate.scope === finding2.scope);
    if (!registration) return [];
    return [{ op: "mcp-remove", name: registration.name, scope: registration.scope, old: registration.entry, row: null, why: `retired-server: remove '${registration.name}' (${registration.retiredRow}) at ${registration.scope} scope` }];
  });
}

// scripts/fix/macos-config.ts
function macosConfigDetect(context) {
  const machine = { project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog };
  const resolved = resolveRoots(context.inventory, null, machine).roots;
  const rootsView = { ...machine, knownRoots: knownRoots(context.inventory, resolved, machine) };
  return registrationsOf(context, FIX_ID.macosConfig).flatMap((registration) => {
    const route = routeOf(context, registration);
    const file = (registration.entry.args || [])[excludeArgAt(registration.entry, route?.excludeFile, rootsView)];
    if (file === void 0 || context.machine.exists(file)) return [];
    return [finding(FIX_ID.macosConfig, registration, `${file} is not there - macos-mcp does not start without the file its --config names`, { path: file, route: registration.route })];
  });
}
function macosConfigSteps(finding2, context) {
  const route = findingRoute(context, finding2);
  const file = fieldOf(finding2, "path");
  return [{ op: "write-exclude-file", path: pathFor(context.platform).dirname(file), tools: route.excludeFile ? route.excludeFile.tools : [], why: `${file}: written again - the tools macos-mcp leaves out` }];
}

// scripts/fix/start-timeout.ts
var lacking = (file, where2 = "") => `${where2}${file} has no ${START_TIMEOUT.name} - Claude Code gives a server 30 s to start, and npx asks the npm registry first, so a slow first network of the day fails it until /mcp Reconnect`;
function startTimeoutDetect(context) {
  const counts = (registration) => isManaged(registration) && launchesPackage(registration.name, registration.entry) && (registration.scope !== "inherited" || !registration.shadowed && !inheritedLeftOwn(context.inventory, registration, context));
  const launching = context.inventory.registrations.filter(counts);
  if (!launching.length) return [];
  const otherDirs = launching.some((registration) => registration.scope === "project" || registration.scope === "inherited") ? configDirsUnderHome : configDirsWithPlugin;
  const bad = (file) => ({ id: FIX_ID.startTimeout, name: file, scope: null, found: `${file}: not a settings object alfred-tools can read`, blocked: `add ${START_TIMEOUT.name}=${START_TIMEOUT.value} to env yourself` });
  const finding2 = (file) => ({ id: FIX_ID.startTimeout, name: file, scope: null, found: lacking(file) });
  const out = [];
  const current = startTimeoutOf(context);
  if (current.bad) out.push(bad(current.file));
  else if (current.missing) out.push(finding2(current.file));
  for (const dir of otherDirs(context.home, pathFor(context.platform).dirname(current.file), context.platform)) {
    const other = startTimeoutOf(context, dir);
    if (other.bad) out.push(bad(other.file));
    else if (other.missing) out.push(finding2(other.file));
  }
  return out;
}
var startTimeoutSteps2 = (finding2) => [settingsEnvStep(finding2.name)];

// scripts/fix/fix-functions.ts
var DETECTORS = /* @__PURE__ */ new Map([
  ["rootMoveDetect", rootMoveDetect],
  ["rootRepointDetect", rootRepointDetect],
  ["serenaWindowsHomeDetect", serenaWindowsHomeDetect],
  ["uvxPythonDetect", uvxPythonDetect],
  ["windowsArmPythonDetect", windowsArmPythonDetect],
  ["windowsNpxCmdDetect", windowsNpxCmdDetect],
  ["playwrightWebmcpDetect", playwrightWebmcpDetect],
  ["appiumSdkEnvDetect", appiumSdkEnvDetect],
  ["serenaTelemetryDetect", serenaTelemetryDetect],
  ["tokenSyncDetect", tokenSyncDetect],
  ["context7KeyEnvDetect", context7KeyEnvDetect],
  ["sentryAuthEnvDetect", sentryAuthEnvDetect],
  ["keyToLauncherDetect", keyToLauncherDetect],
  ["serenaContextDetect", serenaContextDetect],
  ["serenaBaseModesDetect", serenaBaseModesDetect],
  ["serenaProjectFolderDetect", serenaProjectFolderDetect],
  ["helperForeignFileDetect", helperForeignFileDetect],
  ["listImportDetect", listImportDetect],
  ["retiredPluginDetect", retiredPluginDetect],
  ["retiredServerDetect", retiredServerDetect],
  ["readGuardDetect", readGuardDetect],
  ["startTimeoutDetect", startTimeoutDetect],
  ["clientDriftDetect", clientDriftDetect],
  ["cursorFileDetect", cursorFileDetect],
  ["windowsMcpOneDetect", windowsMcpOneDetect],
  ["dataFolderIgnoreDetect", dataFolderIgnoreDetect],
  ["npxCacheEntryDetect", npxCacheEntryDetect],
  ["keyToHelperDetect", keyToHelperDetect],
  ["helperForeignDetect", helperForeignDetect],
  ["helperMissingDetect", helperMissingDetect],
  ["helperStaleDetect", helperStaleDetect],
  ["rootIgnoreDetect", rootIgnoreDetect],
  ["projectRelativePathDetect", projectRelativePathDetect],
  ["mcpOrderDetect", mcpOrderDetect],
  ["helperChildFolderDetect", helperChildFolderDetect],
  ["macosConfigDetect", macosConfigDetect]
]);
var REGISTRATION_FIXES = /* @__PURE__ */ new Map([
  ["rootRepointFix", rootRepointFix],
  ["serenaWindowsHomeFix", serenaWindowsHomeFix],
  ["uvxPythonFix", uvxPythonFix],
  ["windowsArmPythonFix", windowsArmPythonFix],
  ["windowsNpxCmdFix", windowsNpxCmdFix],
  ["playwrightWebmcpFix", playwrightWebmcpFix],
  ["appiumSdkEnvFix", appiumSdkEnvFix],
  ["serenaTelemetryFix", serenaTelemetryFix],
  ["tokenSyncFix", tokenSyncFix],
  ["context7KeyEnvFix", context7KeyEnvFix],
  ["sentryAuthEnvFix", sentryAuthEnvFix],
  ["keyToLauncherFix", keyToLauncherFix],
  ["serenaContextFix", serenaContextFix],
  ["keyToHelperFix", keyToHelperFix],
  ["helperForeignFix", helperForeignFix],
  ["projectRelativePathFix", projectRelativePathFix]
]);
var MACHINE_FIXES = /* @__PURE__ */ new Map([
  ["rootMoveFix", rootMoveFix],
  ["retiredPluginFix", retiredPluginFix],
  ["dataFolderIgnoreFix", dataFolderIgnoreFix],
  ["npxCacheEntryFix", npxCacheEntryFix],
  ["helperMissingFix", helperMissingFix],
  ["helperStaleFix", helperStaleFix],
  ["rootIgnoreFix", rootIgnoreFix],
  ["mcpOrderFix", mcpOrderFix]
]);
var FILE_STEPS = /* @__PURE__ */ new Map([
  ["serenaBaseModesSteps", serenaBaseModesSteps],
  ["serenaProjectFolderSteps", serenaProjectFolderSteps],
  ["helperForeignFileSteps", helperForeignFileSteps],
  ["listImportSteps", listImportSteps],
  ["readGuardSteps", readGuardSteps],
  ["startTimeoutSteps", startTimeoutSteps2],
  ["clientDriftSteps", clientDriftSteps],
  ["keyToLauncherCursorSteps", keyToLauncherCursorSteps],
  ["macosConfigSteps", macosConfigSteps]
]);

// scripts/fix/context-move.ts
import fs35 from "node:fs";
function writeMissingContext(finding2) {
  if (!finding2.want || fs35.existsSync(finding2.want)) return null;
  const written = helperMissingFix({ id: "helper-missing", name: finding2.want, scope: null, found: "", path: finding2.want, shipped: "serenaContext" });
  return `${written.ok ? "ok    " : "FAILED"} serena-context: ${written.detail}`;
}

// scripts/plan/hosted-settings-constants.ts
var TOOLSETS_HEADER = "SONARQUBE_TOOLSETS";

// scripts/plan/record-constants.ts
var PREFIX2 = {
  route: "route-",
  scope: "scope-",
  name: "name-",
  location: "location-",
  browser: "browser-",
  host: "host-",
  token: "token-",
  keyName: "keyname-",
  urlName: "urlname-",
  settings: "settings-",
  root: "root-",
  own: "own-",
  clients: "clients-",
  exclude: "exclude-"
};
var WALK_QUESTION = { settings: "settings", clients: "clients" };
var TOOLSET_SEPARATOR = ",";
var WALK_PICK_LABEL = { [WALK_QUESTION.clients]: "Apps", [WALK_QUESTION.settings]: "Settings" };

// scripts/plan/hosted-settings.ts
function defaultHostedSettings(route) {
  return Object.fromEntries((route.settings || []).flatMap((setting) => setting.default === void 0 ? [] : [[setting.header, setting.default]]));
}
function currentHostedSettings(route, entry) {
  const known = new Set((route.settings || []).map((setting) => setting.header));
  const pairs = entry && helperParts(entry.headersHelper)?.pairs || [];
  const fixed = pairs.map(splitPair).flatMap((pair) => pair !== null && pair.kind === "fixed" && known.has(pair.header) ? [[pair.header, pair.rest]] : []);
  return Object.fromEntries(fixed);
}
function checkHostedSettings(route, given) {
  const known = route.settings || [];
  const settings = {};
  for (const [header, value] of Object.entries(given)) {
    const setting = known.find((candidate) => candidate.header === header);
    if (!setting) return { error: `'${header}' is not a setting of its hosted route - ${known.map((candidate) => candidate.header).join(", ")}` };
    const allowed = setting.values || [];
    if (header === TOOLSETS_HEADER) {
      const keys = [...new Set(String(value).split(TOOLSET_SEPARATOR).map((key) => key.trim()).filter(Boolean))];
      if (!keys.length) return { error: `${header} needs at least one toolset - ${allowed.join(", ")}` };
      const unknown = keys.find((key) => !allowed.includes(key));
      if (unknown !== void 0) return { error: `'${unknown}' is not a toolset - one of ${allowed.join(", ")}` };
      settings[header] = keys.join(TOOLSET_SEPARATOR);
    } else {
      if (allowed.length && !allowed.includes(value)) return { error: `${header} takes ${allowed.join(", ")} - leave it out for the server's default` };
      settings[header] = value;
    }
  }
  return { settings };
}
function pairNames(entry) {
  const pairs = entry && helperParts(entry.headersHelper)?.pairs || [];
  return pairs.map(splitPair).flatMap((pair) => pair !== null && pair.kind === "name" ? [pair.rest] : []);
}
function optionalNameNotes(rowId, route, names2, file) {
  return names2.map((name) => {
    const label = (route.helper && route.helper.headers || []).find((header) => header.var === name)?.label;
    return `${rowId}: ${name}${label ? ` (${label})` : ""} is optional - fill it in ${file} to send that header; with no value the header is left out`;
  });
}

// scripts/plan/asks-keys.ts
var PARENT_HELPER_IN_CHILD = false;
var CHILD_FOLDER_REMEDY = "start a session in the folder that holds `.mcp.json`, or move the server to Global with configure";
var rowWord = (row) => row.id.toUpperCase().replace(/-/g, "_");
function keyStateOf(row, routeId, context, _alfredEnabled, scope = "user") {
  const route = row.routes && row.routes[routeId];
  if (!route || !context) return null;
  const variable = route.helper ? route.helper.var : route.tokenVar;
  if (!variable) return null;
  const kind = route.helper ? "helper" : "stdio";
  const projectRoot = rootOf("project", context);
  const globalRoot = rootOf("global", context);
  const files = kind === "helper" ? hostedChain({ scope, projectRoot, globalRoot, globalNamed: Boolean(context.roots && context.roots.globalNamed), home: context.home, platform: context.platform }) : stdioChain({ scope, projectRoot, globalRoot, platform: context.platform });
  const readHome = Object.hasOwn(context, "keyHome") ? Boolean(context.keyHome) : true;
  const pathApi = pathFor(context.platform);
  const inProject = (filePath) => isInside(pathApi, context.project, filePath, { orSame: false });
  const word = rowWord(row);
  const offered = (list) => {
    const out = [];
    for (const { file, names: names3 } of filledNames(readHome ? list : list.filter(inProject)))
      for (const name of names3) if (offeredName(name, variable, word) && !out.some((nameAt) => nameAt.name === name)) out.push({ name, file });
    return out;
  };
  const names2 = offered(files);
  const found = names2.find((nameAt) => nameAt.name === variable) || names2[0] || null;
  const old = offered(oldFiles(context.project, context.home)).filter((nameAt) => !names2.some((filled) => filled.name === nameAt.name));
  return { variable, kind, scope, files, names: names2, found, old };
}
var liveReader = (project, env) => env && (env.CLAUDE_CONFIG_DIR || env.HOME || env.USERPROFILE) ? (name, scope) => readRegistration(name, scope, project, env) : () => void 0;
function heldKey(entry, route) {
  const field = tokenFields(entry, route)[0];
  const value = field ? valueAt(entry, field.at) : void 0;
  return typeof value === "string" && value !== "" && !PLACEHOLDER.test(value) ? value : null;
}
function scopesFor(row, routeId, _context = null) {
  const route = row.routes && row.routes[routeId];
  const stdioKey = routeId !== "remote" && route && route.runtime !== "bridge" && route.authMode === "token";
  return ALL_SCOPES.filter((scope) => scope !== "project" || !stdioKey);
}
function recommendedScope(row, routeId) {
  return scopesFor(row, routeId).includes("project") ? "project" : "local";
}

// scripts/plan/constants.ts
var MAX_OPTIONS = 4;
var MAX_QUESTIONS = 4;
var MAX_NAME_LENGTH = 64;
var NAME_UNSAFE_RUN = /[^A-Za-z0-9_-]+/g;
var EDGE_DASHES = /^-+|-+$/g;
var PROJECT_NAME_FALLBACK = "project";

// scripts/plan/asks-picks.ts
function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
function alsoProvided(inventory, rowId, connectors) {
  const out = [];
  if ((connectors || []).some((connector) => matchConnector(connector) === rowId)) out.push({ owner: "claude.ai", tag: "also connected through claude.ai" });
  const enabled = new Set((inventory.plugins || []).filter((plugin) => plugin.enabledHere ?? plugin.enabled).map((plugin) => plugin.id));
  const owners = (inventory.pluginServers || []).filter((server) => server.rowId === rowId && enabled.has(server.plugin)).map((server) => server.plugin.split("@", 1).join(""));
  for (const owner of new Set(owners)) out.push({ owner, tag: `also provided by the ${owner} plugin` });
  return out;
}

// scripts/plan/asks-tool.ts
import path35 from "node:path";
var CHILD_NO_KEY = PARENT_HELPER_IN_CHILD ? "" : `; a session started in a child folder connects without the key - Claude Code does not run a parent folder's helper there; ${CHILD_FOLDER_REMEDY}`;
var perProjectName = (rowName, project) => `${(project ? path35.basename(project).replace(NAME_UNSAFE_RUN, "-").replace(EDGE_DASHES, "") : "") || PROJECT_NAME_FALLBACK}-${rowName}`.slice(0, MAX_NAME_LENGTH);

// scripts/plan/files/shapes.ts
var isRegistration = (item) => "entry" in item;

// scripts/plan/record.ts
var KEYED = [PREFIX2.route, PREFIX2.scope, PREFIX2.name, PREFIX2.location, PREFIX2.browser, PREFIX2.host, PREFIX2.token, PREFIX2.keyName, PREFIX2.urlName, PREFIX2.settings, PREFIX2.clients, PREFIX2.exclude];

// scripts/plan/asks-other.ts
function cursorNameQuestion({ file, name, sameRow }) {
  const replace = { label: "Replace it with the plugin's", description: "Cursor gets the same entry as Claude Code; the old one is dropped, not saved", value: "replace" };
  const keep = { label: "Keep Cursor's own", description: `${name} is set up for Claude Code only, and Cursor's entry stays as it is`, value: "keep" };
  const options2 = (sameRow ? [replace, keep] : [keep, replace]).map((option, i) => ({ ...option, label: `${option.label}${i === 0 ? RECOMMENDED_SUFFIX : ""}` }));
  return {
    question: { id: `cursor-name-${name}@${file}`, header: "Cursor", multiSelect: false, question: `Cursor's ${file} already has a server named ${name} that alfred-tools did not write. What should happen?`, options: options2.map(({ label, description }) => ({ label, description })) },
    answers: Object.fromEntries(options2.map((option) => [option.label, option.value]))
  };
}
function driftQuestion(driftAsk) {
  const app = driftAsk.appLabel || (driftAsk.app === "cursor" ? "Cursor" : "Claude Code");
  const restore2 = { label: "Restore from the list", description: `${app} gets the list's entry back`, value: "restore" };
  let text = `${driftAsk.name} in ${app} differs from the plugin's list. Which should stay?`;
  let options2;
  if (driftAsk.inherited) {
    text = driftAsk.change === "missing" ? `${driftAsk.name} from ${driftAsk.inherited} is no longer in Cursor's file here. What should happen?` : `${driftAsk.name} in Cursor differs from ${driftAsk.inherited}'s list. Which should stay?`;
    options2 = [{ label: `Restore from ${driftAsk.inherited}`, description: `Cursor gets ${driftAsk.inherited}'s entry back`, value: "restore" }, { label: "Leave it as it is", description: `nothing changes; configure in ${driftAsk.inherited} changes it there`, value: "leave" }];
  } else if (driftAsk.change === "missing") {
    text = `${driftAsk.name} is on the plugin's list for ${app} but ${app} no longer has it. What should happen?`;
    options2 = [{ label: `Take ${app} off its list entry`, description: "the server stays in the other app; with no app left, the entry leaves the list", value: "drop" }, restore2];
  } else if (driftAsk.keyGuard) options2 = [restore2, { label: `Leave ${app}'s copy as it is`, description: "the copy holds what looks like a key outside its key field, so it is copied nowhere; fix asks again next run", value: "leave" }];
  else if (driftAsk.keyEmpty) options2 = [restore2, { label: `Leave ${app}'s copy as it is`, description: "its key field is empty - keeping it would blank the key in the other app; fix asks again next run", value: "leave" }];
  else options2 = [{ label: `Keep the change in ${app}`, description: driftAsk.rowGone ? "the list lets go of it - it is no longer the plugin's server" : "the list and the other app take the edited entry", value: "keep" }, restore2];
  const marked = options2.map((option, i) => ({ ...option, label: `${option.label}${i === 0 ? RECOMMENDED_SUFFIX : ""}` }));
  return {
    question: { id: `drift-${driftAsk.app}-${driftAsk.name}~${driftAsk.scope}`, header: "Drift", multiSelect: false, question: text, options: marked.map(({ label, description }) => ({ label, description })) },
    answers: Object.fromEntries(marked.map((option) => [option.label, option.value]))
  };
}
function cursorOfferQuestion(root2, serverCount, signIns = []) {
  const options2 = [
    { label: `Set them up for Cursor too${RECOMMENDED_SUFFIX}`, description: `each server is written to Cursor's mcp.json, as configure's app change would do${signIns.length ? `; ${signIns.join(", ")} move to one browser sign-in shared with Cursor - sign in once before your next session` : ""}`, value: "set" },
    { label: "Not now", description: "nothing changes, and update does not ask again for this root", value: "declined" }
  ];
  return {
    question: { id: `cursor-offer:${root2}`, header: "Cursor", multiSelect: false, question: `Cursor is on this machine, and the ${serverCount} servers in ${root2} are set up for Claude Code only. Set them up for Cursor too?`, options: options2.map(({ label, description }) => ({ label, description })) },
    answers: Object.fromEntries(options2.map((option) => [option.label, option.value]))
  };
}
var CLIENTS = [
  { label: "Claude Code and Cursor", description: "each server is written to .mcp.json or your account and to Cursor's mcp.json", value: ["claude", "cursor"] },
  { label: "Claude Code only", description: "Cursor is left as it is", value: ["claude"] }
];
function clientsOptions(firstIsCursor) {
  const options2 = (firstIsCursor ? CLIENTS : [...CLIENTS].reverse()).map((option, i) => ({ ...option, label: `${option.label}${i === 0 ? RECOMMENDED_SUFFIX : ""}` }));
  return { options: options2.map(({ label, description }) => ({ label, description })), answers: Object.fromEntries(options2.map((option) => [option.label, option.value])) };
}
function clientsQuestion(found) {
  const { options: options2, answers } = clientsOptions(found);
  return { question: { id: WALK_QUESTION.clients, header: "Apps", multiSelect: false, question: "Which apps should these servers be set up for?", options: options2 }, answers };
}
var STATIC = {
  menu: { id: "menu", header: "Action", multiSelect: false, question: "What do you want to change?", options: [
    { label: `Change tools${RECOMMENDED_SUFFIX}`, description: "pick installed tools, servers on their own or a root folder, then what to change" },
    { label: "Remove tools", description: "choose the servers to remove" },
    { label: "Done", description: "nothing changes" }
  ] },
  settings: { id: WALK_QUESTION.settings, header: "Settings", multiSelect: false, question: "How do you want to set the tools up?", options: [
    { label: `Use the recommended settings for all${RECOMMENDED_SUFFIX}`, description: "route, scope, name and location as recommended" },
    { label: "Set each tool", description: "ask route, scope, name and location per tool" }
  ] },
  // one pick (spec F1): the same choice, about that tool alone
  settingsOne: (tool) => ({ id: WALK_QUESTION.settings, header: "Settings", multiSelect: false, question: `How do you want to set ${tool} up?`, options: [
    { label: `Use the recommended settings for ${tool}${RECOMMENDED_SUFFIX}`, description: "route, scope, name and location as recommended" },
    { label: `Set ${tool} up`, description: "ask its route, scope, name and location" }
  ] }),
  apply: { id: "apply", header: "Apply", multiSelect: false, question: "Apply this plan?", options: [
    { label: `Apply${RECOMMENDED_SUFFIX}`, description: "runs the calls above in order, stops at the first failure" },
    { label: "Change something", description: "go back to the answers" },
    { label: "Cancel", description: "nothing is applied" }
  ] },
  removeFirst: { id: "remove-first", header: "Remove", multiSelect: false, question: "Remove what?", options: [
    { label: `Pick which${RECOMMENDED_SUFFIX}`, description: "choose the servers to remove" },
    { label: "Cancel", description: "nothing is removed" }
  ] },
  signInNow: { id: "sign-in-now", header: "Sign in", multiSelect: false, question: "Sign in to the new server now?", options: [
    { label: `Sign in now${RECOMMENDED_SUFFIX}`, description: "opens your browser and waits up to five minutes; the sign-in is kept in the root and serves Claude Code and Cursor" },
    { label: "At the next session start", description: "its first start then opens the browser inside Claude Code's 30-second limit, and /mcp reconnects it after" }
  ] },
  fixOffer: { id: "fix-offer", header: "Fix", multiSelect: false, question: "Apply the fixes found?", options: [
    { label: `Apply all found${RECOMMENDED_SUFFIX}`, description: "apply every fix listed that can be applied" },
    { label: "Pick which", description: "choose among them" },
    { label: "Skip", description: "nothing changes" }
  ] },
  updateOffer: { id: "update-offer", header: "Update", multiSelect: false, question: "Update what is behind?", options: [
    { label: `All of them${RECOMMENDED_SUFFIX}`, description: "update everything offered" },
    { label: "Pick which", description: "choose among them" },
    { label: "Skip", description: "nothing changes" }
  ] },
  prereqMissing: (tool, need2) => ({ id: `prereq-${tool}`, header: "Missing", multiSelect: false, question: `${tool} needs ${need2}, which is missing. What now?`, options: [
    { label: `Skip this tool${RECOMMENDED_SUFFIX}`, description: "leave it out of the plan" },
    { label: "Install it now", description: "run the install line shown, or install it yourself and re-check" },
    { label: "Register anyway", description: "register it; it will not start until the prerequisite is there" }
  ] }),
  prereqInstalled: (tool, need2) => ({ id: `prereq-installed-${tool}`, header: "Installed?", multiSelect: false, question: `Is ${need2} installed for ${tool} now?`, options: [
    { label: `Check again${RECOMMENDED_SUFFIX}`, description: "run the prerequisite check again" },
    { label: "Skip this tool", description: "leave it out of the plan" }
  ] }),
  clients: clientsQuestion(true).question,
  // a STATIC function whose labels hold placeholders names them, so tests/ask-blocks.ts fills the block's own
  "cursor-name-taken": Object.assign((file, name) => cursorNameQuestion({ file, name, sameRow: true }).question, { placeholders: ["<file>", "<name>"] }),
  "cursor-offer": Object.assign((serverCount, root2) => cursorOfferQuestion(root2, serverCount).question, { placeholders: ["<n>", "<root>"] }),
  drift: Object.assign((name, app) => driftQuestion({ name, scope: "local", app: "claude", appLabel: app, change: "differs" }).question, { placeholders: ["<name>", "<app>"] }),
  "drift-missing": Object.assign((name, app) => driftQuestion({ name, scope: "local", app: "claude", appLabel: app, change: "missing" }).question, { placeholders: ["<name>", "<app>"] })
};

// scripts/fix/fix.ts
function makeCtx({ inventory: projectInventory, catalog = load(), env = process.env, machine, platform, arch, data = null }) {
  const resolvedPlatform = platform || projectInventory.os;
  return { inventory: projectInventory, catalog, platform: resolvedPlatform, arch: arch || projectInventory.arch, env, home: homeDir(env), rules: catalog.rules, machine: machine || realMachine({ env, platform: resolvedPlatform }), data };
}
var fixNameOf = (context, id) => {
  const fixRow = context.catalog.fixes.find((candidate) => candidate.id === id);
  return fixRow && fixRow.fix || null;
};
var matches = (finding2, only) => !only || [finding2.id, finding2.row, finding2.name].includes(only);
function reconnectOf(context, steps) {
  const resolvedRoots = resolveRoots(context.inventory, null, { project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog }).roots;
  return steps.flatMap((step) => {
    const variable = step.entry && helperNameOf(step.entry.headersHelper);
    if (!variable) return [];
    const row = step.row ? context.catalog.byId.get(step.row) : void 0;
    const route = row && step.route ? row.routes[step.route] : void 0;
    const [file = "", ...rest] = hostedChain({ scope: step.scope, projectRoot: resolvedRoots.project, globalRoot: resolvedRoots.global, globalNamed: resolvedRoots.globalNamed, home: context.home, platform: context.platform });
    return [{ name: step.name, variable, file, filled: filledNames([file, ...rest]).some((filledFile) => filledFile.names.includes(variable)), anonymous: Boolean(route) && route?.authMode === "optional-token" && !route.keyless }];
  });
}
function trustNotes(context, only) {
  if (context.inventory.trusted !== false) return [];
  return (context.inventory.registrations || []).filter((registration) => registration.rowId && isManaged(registration) && ["project", "local"].includes(registration.scope) && registration.entry && registration.entry.headersHelper).filter((registration) => !only || [registration.name, registration.rowId].includes(only)).map((registration) => `${registration.name} (${registration.scope}): accept the trust dialog the next time Claude Code starts in ${context.inventory.project} - until then the server connects without its key`);
}
function detectAll(context, { only } = {}) {
  const own = (context.inventory.registrations || []).filter((registration) => registration.choice === "own" && (!only || [registration.name, registration.rowId].includes(only)));
  const gate = [];
  const out = { found: [], held: [], own: own.map((registration) => ({ name: registration.name, scope: registration.scope })), notes: trustNotes(context, only) };
  for (const fix of context.catalog.fixes) {
    if (fix.hold) {
      out.held.push({ id: fix.id, why: fix.hold });
      continue;
    }
    if (!fix.os.includes(context.platform)) continue;
    const detect = DETECTORS.get(fix.detect);
    if (!detect) throw new Error(`fix row ${fix.id}: no function ${fix.detect} in scripts/fix/`);
    if ((fix.kind === "file" ? !fix.advice : fix.steps !== void 0) && !(fix.steps && FILE_STEPS.has(fix.steps))) throw new Error(`fix row ${fix.id}: no steps function ${fix.steps} in scripts/fix/`);
    const advice = (finding2) => fix.advice && !finding2.blocked ? { blocked: "advice only - nothing here is applied" } : {};
    for (const finding2 of detect(context)) {
      const decorated = { ...finding2, ...advice(finding2), kind: fix.kind, symptom: fix.symptom, documented: fix.documented !== false };
      if (matches(finding2, only)) out.found.push(decorated);
      else if (passesGate(decorated) && fix.id !== "retired-plugin") gate.push(decorated);
    }
  }
  const gating = [...out.found, ...gate].filter(gates);
  if (gating.length) {
    out.afterMove = out.found.filter((finding2) => !passesGate(finding2));
    out.found = [...out.found.filter(passesGate), ...gate];
  }
  return out;
}
var where = (finding2) => finding2.kind === "registration" || finding2.id === "client-drift" ? `${finding2.name} (${finding2.scope})` : finding2.name;
function driftSkip(finding2, picked, input) {
  const answer = finding2.driftKey === void 0 ? void 0 : input[finding2.driftKey];
  if (answer === void 0) return `needs --input ${finding2.driftKey}=<answer>`;
  const allowed = finding2.inherited ? ["restore", "leave"] : finding2.change === "missing" ? ["drop", "restore"] : finding2.keyGuard || finding2.keyEmpty ? ["restore", "leave"] : ["keep", "restore", "leave"];
  if (answer === "keep" && finding2.keyGuard) return "the copy holds what looks like a key outside its key field, so Keep is not offered - answer restore or leave";
  if (answer === "keep" && finding2.keyEmpty) return "its key field is empty, so Keep is not offered - answer restore or leave";
  if (!allowed.includes(answer)) return `'${answer}' is not an answer here - ${allowed.join(", ")}`;
  if (answer === "leave") return "left";
  const claude = finding2.app === "cursor" && picked.find((candidate) => candidate.id === "client-drift" && candidate.app === "claude" && candidate.name === finding2.name && candidate.scope === finding2.scope);
  if (claude && claude.driftKey !== void 0 && input[claude.driftKey] === "keep") return "Cursor's answer is not used - Claude Code's copy was kept, and Cursor takes it";
  return null;
}
function applyFixes(context, ids, { only, name, scope, input = {}, tmp, log = console.log, runCli = runClaude, fetchFile, quietRecheck = false } = {}) {
  const result = { applied: [], skipped: [], failed: null, remaining: [], steps: 0, fetchFile: null, fetch: null, gone: false, tmp: tmp || null };
  const known = new Set(context.catalog.fixes.map((fixRow) => fixRow.id));
  const unknown = ids.filter((id) => id !== "all" && id !== "none" && !known.has(id));
  if (unknown.length) {
    result.failed = `unknown fix id${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`;
    log(result.failed);
    return result;
  }
  let turnedDown = [];
  try {
    turnedDown = parse(input["retired-declined"]);
  } catch (caught) {
    result.failed = errorMessage(caught);
    log(result.failed);
    return result;
  }
  const detected = detectAll(context, { only });
  let picked = ids.includes("none") ? [] : detected.found.filter((finding2) => (ids.includes("all") || ids.includes(finding2.id)) && (!name || finding2.name === name) && (!scope || finding2.scope === scope));
  const answered = detected.found.filter((finding2) => finding2.id === "client-drift" && finding2.driftKey !== void 0 && input[finding2.driftKey] !== void 0 && !picked.includes(finding2));
  picked = [...picked, ...answered];
  if (ids.includes("all") && !ids.includes("retired-plugin")) {
    const kept = picked.filter((finding2) => finding2.id === "retired-plugin" && finding2.alfred && !finding2.blocked);
    for (const finding2 of kept) log(`${finding2.name} kept - alfred-code installs it; fix lists it`);
    picked = picked.filter((finding2) => !kept.includes(finding2));
  }
  if (turnedDown.length) log(add(context.data, turnedDown).detail);
  if (ids.includes("none") && !answered.length) {
    log("Nothing picked to apply.");
    return result;
  }
  if (!picked.length) {
    result.gone = true;
    log("Nothing to apply: no picked problem is found any more.");
    return result;
  }
  for (const finding2 of picked.filter((candidate) => candidate.blocked || candidate.input && !input[candidate.input.id])) {
    result.skipped.push(finding2);
    log(`skipped ${finding2.id} on ${where(finding2)}: ${finding2.blocked || finding2.input && `needs --input ${finding2.input.id}=<value> (${finding2.input.prompt})`}`);
  }
  for (const finding2 of picked.filter((candidate) => candidate.id === "client-drift" && !candidate.blocked)) {
    const why = driftSkip(finding2, picked, input);
    if (!why) continue;
    if (why === "left") {
      result.skipped.push(finding2);
      log(`left    client-drift on ${where(finding2)}: ${finding2.app === "cursor" ? "Cursor" : "Claude Code"}'s copy as it is`);
      continue;
    }
    result.skipped.push(finding2);
    log(`skipped client-drift on ${where(finding2)}: ${why}`);
  }
  const openDrift = picked.some((candidate) => candidate.id === FIX_ID.keyToLauncher) ? clientDriftDetect(context) : [];
  for (const finding2 of picked.filter((candidate) => !result.skipped.includes(candidate) && waitsForDrift(candidate, openDrift))) {
    result.skipped.push(finding2);
    log(`skipped ${finding2.id} on ${where(finding2)}: client-drift is open on it - answer that first (${driftAnswersOf(finding2, openDrift)}), then run fix again`);
  }
  let todo = picked.filter((candidate) => !result.skipped.includes(candidate));
  const allMoves = todo.filter((finding2) => finding2.id === "root-move" && finding2.moveFrom);
  const moves = allMoves.filter((finding2) => finding2.name !== "data");
  const dataMove = allMoves.find((finding2) => finding2.name === "data");
  if (allMoves.length) {
    for (const finding2 of moves) {
      const moveResult = rootMoveFix(finding2, context);
      log(`${moveResult.ok ? "ok    " : "FAILED"} root-move: ${moveResult.detail}`);
      if (!moveResult.ok) {
        result.failed = moveResult.detail;
        return result;
      }
    }
    context = { ...context, inventory: buildInventory({ project: context.inventory.project, env: context.env, data: context.data }) };
    for (const { moveTo } of moves)
      for (const kind of ["helper", "bridge", "serenaContext"]) {
        if (moveTo === void 0) continue;
        const file = path36.join(moveTo, FILES[kind]);
        const state = shippedState(kind, file);
        if (state.state !== "lower") continue;
        const written = helperStaleFix({ id: "helper-stale", name: file, scope: null, found: "", path: file, shipped: kind, from: state.number });
        log(`${written.ok ? "ok    " : "FAILED"} root-move: ${written.detail}`);
        if (!written.ok) {
          result.failed = written.detail;
          return result;
        }
      }
    if (dataMove) {
      const carried = rootMoveFix(dataMove, context);
      log(`${carried.ok ? "ok    " : "left  "} root-move: ${carried.detail}`);
      if (!carried.ok) allMoves.splice(allMoves.indexOf(dataMove), 1);
    }
    const repointed = repointDataMap(context.data, moves.flatMap(({ moveFrom, moveTo }) => moveFrom !== void 0 && moveTo !== void 0 ? [{ from: moveFrom, to: moveTo }] : []), machineOf(context));
    if (repointed) log(`ok     root-move: ${repointed.detail}`);
    const now = detectAll(context).found;
    const same2 = (left, right) => left.id === right.id && left.name === right.name && left.scope === right.scope && left.app === right.app;
    const rest = todo.filter((finding2) => finding2.id !== "root-move").map((finding2) => now.find((candidate) => same2(candidate, finding2))).filter((finding2) => finding2 !== void 0 && !finding2.blocked);
    todo = [...rest, ...now.filter((finding2) => finding2.id === "root-repoint" && !finding2.blocked && !rest.some((candidate) => same2(candidate, finding2)))];
    for (const finding2 of allMoves) {
      result.applied.push(finding2);
      log(`fixed       root-move on ${where(finding2)}`);
    }
  }
  const steps = [];
  const order = context.catalog.fixes.map((fixRow) => fixRow.id);
  const groups = /* @__PURE__ */ new Map();
  const fileCtx = { platform: context.platform, project: context.inventory.project, home: context.home, roots: null, uses: [] };
  for (const finding2 of todo.filter((candidate) => candidate.kind === "registration" && !candidate.tailOnly && !candidate.listOnly && candidate.id !== FIX_ID.retiredServer)) groups.set(`${finding2.scope}\0${finding2.name}`, [...groups.get(`${finding2.scope}\0${finding2.name}`) || [], finding2]);
  for (const list of groups.values()) {
    const found = list.find((candidate) => candidate.roots);
    if (found && found.roots) fileCtx.roots = fileCtx.roots || found.roots;
    const [first] = list;
    const registration = first && context.inventory.registrations.find((candidate) => candidate.name === first.name && candidate.scope === first.scope);
    if (!first || !registration) throw new Error(`fix: no registration for ${first ? where(first) : "an empty group"}`);
    let entry = clone(registration.entry);
    try {
      for (const finding2 of list.sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id))) {
        const fixName = fixNameOf(context, finding2.id);
        const registrationFix = fixName ? REGISTRATION_FIXES.get(fixName) : void 0;
        if (!registrationFix) throw new Error(`fix row ${finding2.id}: no registration fix in scripts/fix/`);
        entry = registrationFix(entry, finding2, context, input);
      }
    } catch (caught) {
      result.failed = `${first.name}: ${errorMessage(caught)}`;
      log(`FAILED ${result.failed}`);
      return result;
    }
    if (deepEqual(entry, registration.entry)) {
      for (const finding2 of list.filter((candidate) => candidate.id === "serena-context")) {
        const line = writeMissingContext(finding2);
        if (line) log(line);
      }
      continue;
    }
    steps.push({ op: "mcp-replace", name: registration.name, scope: registration.scope, entry, old: registration.entry, row: registration.rowId, route: registration.route, why: `${list.map((finding2) => finding2.id).join(" + ")}: rewrite '${registration.name}' from the registration as read` });
    if (entry.headersHelper && !helperParts(registration.entry.headersHelper) && fileCtx.roots) useRoots(fileCtx, registration.scope, { helper: true, bridge: list.some((finding2) => finding2.cursor), keyFile: null, keyName: null, data: null });
    else if (launcherParts(entry) && !launcherParts(registration.entry) && fileCtx.roots) useRoots(fileCtx, registration.scope, { helper: true, bridge: true, keyFile: null, keyName: null, data: null });
    const contextAt = contextArgAt(entry);
    const contextArg = (entry.args || [])[contextAt];
    if (contextArg !== void 0 && fileCtx.roots) useRoots(fileCtx, registration.scope, { serenaContext: pathFor(context.platform).dirname(contextArg) });
  }
  const removals = retiredServerSteps(context, todo);
  result.steps = steps.length + removals.length;
  const refresh = todo.flatMap(({ id, cursorOnly, name: name2, scope: scope2 }) => id === "token-sync" && cursorOnly && scope2 !== null ? [{ name: name2, scope: scope2 }] : []);
  const repoint = todo.flatMap(({ id, name: name2, scope: scope2 }) => id === "root-repoint" && scope2 !== null ? [{ name: name2, scope: scope2 }] : []);
  const movedNow = repoint.length ? movedRoots(context) : [];
  const normalize = movedNow.length ? (entry) => repointEntry(entry, movedNow, machineOf(context)) : void 0;
  const tailNotes = [];
  const clientsFor = new Map(todo.flatMap(({ id, name: name2, scope: scope2, clients }) => id === "helper-foreign" && clients ? [[`mcp:${name2}~${scope2}`, clients]] : []));
  const bridgeFor = new Set(todo.filter((finding2) => finding2.id === "helper-foreign" && finding2.cursor).map((finding2) => `mcp:${finding2.name}~${finding2.scope}`));
  const tail = steps.length || removals.length || refresh.length || repoint.length ? repairTail(context.inventory, { platform: context.platform, project: context.inventory.project, home: context.home, env: context.env, catalog: context.catalog, notes: tailNotes }, [...steps, ...removals], { refresh, repoint, normalize, clientsFor, bridgeFor }) : [];
  if (steps.length || removals.length || tail.length) {
    const withFetch = steps.flatMap((step) => {
      const fetchJobStep = fetchStep(step.name, step.entry, step.row, step.old);
      return fetchJobStep ? [step, fetchJobStep] : [step];
    });
    const fileNotes = [];
    const usedRoots = fileCtx.roots;
    const files = fileCtx.uses.length && usedRoots ? fileSteps(context.inventory, { ...fileCtx, roots: usedRoots }, { notes: fileNotes }) : { before: [] };
    for (const rootUse of [...new Map(fileCtx.uses.map((usage) => [usage.root, usage])).values()]) log(`the key helper goes in the ${rootUse.family} root ${rootUse.root}`);
    for (const note of [...fileNotes, ...tailNotes]) log(`note: ${note}`);
    const plan2 = { version: 1, project: context.inventory.project, os: context.platform, alfredCodeEnabled: Boolean(context.inventory.alfredCodeEnabled), steps: withOrderStep([...files.before, ...withFetch, ...removals, ...tail, ...retireContextSteps(context, rewritesOf(steps)), ...retireHelperSteps(context, rewritesOf(steps))], context.inventory.project, ownProjectNames(context.inventory)), notes: [], errors: [], expect: steps.map((step) => ({ kind: "mcp", name: step.name, scope: step.scope, route: step.route })) };
    result.tmp = tmp || makeTempDir();
    const report = apply(plan2, { env: context.env, tmp: result.tmp, runCli, log, fetchFile });
    result.fetchFile = report.fetchFile;
    result.fetch = report.fetch;
    if (report.failed) {
      result.failed = report.failed.detail;
      return result;
    }
    const lines = reconnectOf({ ...context, inventory: buildInventory({ project: context.inventory.project, env: context.env, data: context.data }) }, steps).map(reconnectLine);
    if (lines.length) log("", ...lines);
  }
  const plannedAsFile = (finding2) => finding2.kind === "file" || finding2.listOnly === true;
  const filePicked = todo.filter(plannedAsFile);
  if (filePicked.length) {
    const fctx = steps.length ? { ...context, inventory: buildInventory({ project: context.inventory.project, env: context.env, data: context.data }) } : context;
    const redetected = detectAll(fctx, { only }).found;
    for (const finding2 of blockedAtPlan(redetected.filter(plannedAsFile), filePicked)) {
      result.skipped.push(finding2);
      todo = todo.filter((candidate) => !(candidate.id === finding2.id && candidate.name === finding2.name && candidate.scope === finding2.scope && candidate.app === finding2.app));
      log(`skipped ${finding2.id} on ${where(finding2)}: ${finding2.blocked}`);
    }
    const now = redetected.filter((finding2) => plannedAsFile(finding2) && !finding2.blocked && filePicked.some((pickedFinding) => pickedFinding.id === finding2.id && pickedFinding.name === finding2.name && pickedFinding.scope === finding2.scope && pickedFinding.app === finding2.app));
    const planned = [];
    const planNotes = [];
    for (const row of context.catalog.fixes.filter((candidate) => candidate.kind === "file" || candidate.steps !== void 0))
      for (const finding2 of now.filter((candidate) => candidate.id === row.id)) {
        try {
          const stepsOf = row.steps ? FILE_STEPS.get(row.steps) : void 0;
          if (!stepsOf) throw new Error(`fix row ${row.id}: no steps function ${row.steps} in scripts/fix/`);
          planned.push(...stepsOf(finding2, fctx, input, planNotes));
        } catch (caught) {
          if (caught instanceof RestoreBlocked) {
            result.skipped.push(finding2);
            todo = todo.filter((candidate) => !(candidate.id === finding2.id && candidate.name === finding2.name && candidate.scope === finding2.scope && candidate.app === finding2.app));
            log(`skipped ${finding2.id} on ${where(finding2)}: ${caught.message}`);
            continue;
          }
          result.failed = errorMessage(caught);
          log(`FAILED ${finding2.id} on ${where(finding2)}: ${result.failed}`);
          return result;
        }
      }
    for (const note of planNotes) log(`note: ${note}`);
    if (planned.length) {
      const plan2 = { version: 1, project: context.inventory.project, os: context.platform, alfredCodeEnabled: Boolean(context.inventory.alfredCodeEnabled), steps: planned, notes: [], errors: [], expect: [] };
      result.tmp = result.tmp || tmp || makeTempDir();
      const report = apply(plan2, { env: context.env, tmp: result.tmp, runCli, log, fetchFile: false, data: context.data });
      if (report.failed) {
        result.failed = report.failed.detail;
        return result;
      }
    }
  }
  const noRestart = /* @__PURE__ */ new Set();
  const refetch = [];
  for (const finding2 of todo.filter((candidate) => candidate.kind === "machine")) {
    let machineResult;
    try {
      const fixName = fixNameOf(context, finding2.id);
      const machineFix = fixName ? MACHINE_FIXES.get(fixName) : void 0;
      if (!machineFix) throw new Error(`fix row ${finding2.id}: no machine fix in scripts/fix/`);
      machineResult = machineFix(finding2, context);
    } catch (caught) {
      result.failed = `${finding2.id}: ${errorMessage(caught)}`;
      log(`FAILED ${result.failed}`);
      return result;
    }
    log(`${machineResult.ok ? "ok    " : "FAILED"} ${finding2.id}: ${machineResult.detail}`);
    if (!machineResult.ok) {
      result.failed = machineResult.detail;
      return result;
    }
    if (machineResult.restart === false) noRestart.add(finding2);
    if (machineResult.fetch) refetch.push(machineResult.fetch);
  }
  if (refetch.length) {
    result.tmp = result.tmp || tmp || makeTempDir();
    result.fetchFile = writeJob(result.fetchFile || path36.join(result.tmp, "fetch.json"), fetchJob(context.inventory.project, refetch, refetch.map((jobStep) => jobStep.name)), { append: true });
    log("", ...nextLines(result.fetchFile, JSON.parse(fs36.readFileSync(result.fetchFile, "utf8"))));
  }
  const after = detectAll({ ...context, inventory: buildInventory({ project: context.inventory.project, env: context.env, data: context.data }) }, { only });
  const told = /* @__PURE__ */ new Set();
  for (const finding2 of todo) {
    const left = after.found.some((candidate) => candidate.id === finding2.id && candidate.name === finding2.name && candidate.scope === finding2.scope && candidate.app === finding2.app);
    (left ? result.remaining : result.applied).push(finding2);
    log(`${left ? "STILL FOUND" : "fixed      "} ${finding2.id} on ${where(finding2)}`);
    if (!left && finding2.afterNote) {
      for (const line of finding2.afterNote.split("\n")) if (!told.has(line)) {
        told.add(line);
        log(`note: ${line}`);
      }
    }
  }
  if (!quietRecheck && (moves.length || result.applied.some((finding2) => finding2.id === "root-repoint"))) log("", "RECHECK - the folders moved; checking again");
  if (result.applied.some((finding2) => !noRestart.has(finding2))) log("", `Restart Claude Code so the repaired registrations and the language server start fresh${result.fetchFile ? " - after the fetch reports, so a session start does not download the same package beside it" : ""}.`);
  return result;
}

// scripts/update/offers-files.ts
function helperOffers(context, out) {
  const pathApi = pathFor(context.inventory.os);
  const rootContext2 = { project: context.project, home: homeDir(context.env), platform: context.inventory.os, catalog: context.catalog };
  const familyRoots = context.inventory.roots;
  const dirs = new Set(FAMILIES.flatMap((family) => {
    const root2 = familyRoots && familyRoots[family];
    return root2 && root2.path ? [root2.path] : [];
  }));
  const bridgeDirs = /* @__PURE__ */ new Set();
  const contextDirs = /* @__PURE__ */ new Set();
  for (const registration of context.inventory.registrations || []) {
    if (!registration.rowId || !isManaged(registration) || registration.scope === "inherited") continue;
    const contextArg = (registration.entry.args || [])[contextArgAt(registration.entry)];
    if (contextArg !== void 0) contextDirs.add(pathApi.dirname(absOf(contextArg, rootContext2)));
    const named = helperPathOf(registration.entry && registration.entry.headersHelper);
    if (named) dirs.add(pathApi.dirname(absOf(named, rootContext2)));
    const bridgeFile = bridgeFileOf(registration.entry);
    if (bridgeFile) bridgeDirs.add(pathApi.dirname(absOf(bridgeFile, rootContext2)));
  }
  for (const root2 of bridgeDirs) dirs.add(root2);
  const offer = (kind, root2, version) => {
    const name = FILES[kind];
    const file = pathApi.join(root2, name);
    const { state, number } = shippedState(kind, file);
    const idKind = kind === "serenaContext" ? "context" : kind;
    if (state === "lower") out.offers.push({ kind: idKind, id: `${idKind}:${file}`, file, root: root2, from: String(number), to: String(version), group: "helper", label: `${name} in ${root2}` });
    else if (state === "higher") out.notes.push(`${name} in ${root2} is newer than this plugin - update alfred-tools`);
    else if (state === "edited") out.notes.push(`${name} in ${root2} changed since alfred-tools wrote it - left; /alfred-tools:fix (helper-stale) rewrites it`);
  };
  for (const root2 of dirs) offer("helper", root2, import_mcp_headers5.HELPER_VERSION);
  for (const root2 of bridgeDirs) offer("bridge", root2, import_mcp_bridge5.BRIDGE_VERSION);
  for (const root2 of contextDirs) offer("serenaContext", root2, SERENA_CONTEXT_VERSION);
}
var upgradeCatalog = (catalog) => ({ ...catalog, fixes: catalog.fixes.filter((fixRow) => fixRow.upgrade) });
var upgradeLabel = (finding2) => finding2.kind === "registration" ? `${finding2.name} (${finding2.scope})` : finding2.name;
function upgradeOffers(context, out) {
  const catalog = upgradeCatalog(context.catalog);
  if (!catalog.fixes.length) return;
  const fixContext = makeCtx({ inventory: context.inventory, catalog, env: context.env, machine: context.machine, data: context.data });
  const openDrift = clientDriftDetect(fixContext);
  for (const finding2 of detectAll(fixContext).found) {
    if (finding2.declined) continue;
    if (finding2.id === "retired-plugin" && !finding2.blocked) {
      out.offers.push({ kind: "upgrade", id: `upgrade:retired-plugin:${finding2.name}~${finding2.scope}`, fix: finding2.id, fixKind: finding2.kind, name: finding2.name, scope: finding2.scope, found: finding2.found, group: "upgrade", label: finding2.alfred ? `${finding2.name} - alfred-code also installs it, and this removes it for both` : `${finding2.name} (${finding2.scope})`, alfred: finding2.alfred });
      continue;
    }
    const label = upgradeLabel(finding2);
    const driftWait = waitsForDrift(finding2, openDrift) ? `client-drift is open on it, so the move waits for that answer - run /alfred-tools:fix (${driftAnswersOf(finding2, openDrift)}), then update again` : null;
    const why = finding2.blocked || finding2.input && `needs a folder from you (${finding2.input.prompt})` || driftWait;
    if (why) {
      out.notes.push(`${label}: ${finding2.found} - not applied here: ${why}${/\/alfred-tools:fix/.test(why) ? "" : "; then run /alfred-tools:fix"}`);
      out.waiting += 1;
      continue;
    }
    const machine = finding2.kind !== "registration";
    const imports = finding2.id === "list-import" ? { family: finding2.family, listFile: finding2.name, servers: finding2.servers } : {};
    out.offers.push({ kind: "upgrade", id: `upgrade:${finding2.id}:${machine ? finding2.name : `${finding2.name}~${finding2.scope}`}`, fix: finding2.id, fixKind: finding2.kind, name: finding2.name, scope: machine ? null : finding2.scope, found: finding2.found, group: "upgrade", label, ...imports, ...finding2.declineId ? { declineId: finding2.declineId, notes: [`not picked, it is kept: pass --input retired-declined=${finding2.declineId}~${finding2.scope}`] } : {}, ...finding2.unmanaged ? { notes: finding2.unmanaged } : {} });
  }
}

// scripts/update/sign-in-moves.ts
function signInNames(servers, catalog) {
  const moving = servers.filter((server) => {
    const row = server.row ? catalog.byId.get(server.row) : void 0;
    const route = row && server.route ? row.routes[server.route] : void 0;
    return route !== void 0 && server.route === "remote" && route.keyless === "oauth" && !server.key && !signInParts(server.entry);
  });
  return [...new Set(moving.map((server) => server.name))];
}
function signInMoves(oauth, names2, os3) {
  const pathApi = pathFor(os3);
  return oauth.flatMap((line) => line.signin && line.root && names2.includes(line.name) ? [{ name: line.name, scope: line.scope, folder: pathApi.join(line.root, FILES.signIns), signedIn: false }] : []);
}
var signInLine = (move) => `${move.name}: now the shared sign-in in ${move.folder}/ (Cursor added) - sign-in ${move.signedIn ? "done" : "not done yet"}`;

// scripts/update/check.ts
function makeCtx2({ inventory, project, catalog = load(), env = process.env, machine, runCli = runClaude, registry, now = Date.now(), refresh = true, data = null }) {
  return {
    inventory,
    project,
    catalog,
    env,
    runCli,
    now,
    refresh,
    data,
    machine: machine || realMachine({ env, platform: inventory.os }),
    registry: registry || { versionsOf: (registryKind, name) => versionsOf(registryKind, name, { env }) }
  };
}
async function checkUpdates(context) {
  const out = { offers: [], unchecked: [], skipped: [], held: [], errors: [], notes: [], waiting: 0, outside: changedOutside(context.inventory, context.catalog), cursorOffers: [] };
  pluginOffers(context, out);
  await mcpOffers(context, out);
  await cursorPinOffers(context, out);
  helperOffers(context, out);
  upgradeOffers(context, out);
  const leaving = new Set(out.offers.filter((offer) => offer.fix === "retired-plugin").map((offer) => `${offer.name}~${offer.scope}`));
  const stays = (offer) => !(offer.kind === "plugin" && leaving.has(`${offer.plugin}~${offer.scope}`));
  out.offers = out.offers.filter(stays);
  out.unchecked = out.unchecked.filter(stays);
  const asFinding = (offer) => ({ id: offer.fix, name: offer.name, scope: null, found: "" });
  if (out.offers.some((offer) => offer.kind === "upgrade" && gates(asFinding(offer)))) {
    out.offers = out.offers.filter((offer) => offer.kind === "upgrade" && passesGate(asFinding(offer)));
    out.unchecked = [];
    out.notes.push("the rest is checked again after the folders move");
    return out;
  }
  cursorOffers(context, out);
  return out;
}
function cursorOffers(context, out) {
  const home = homeDir(context.env);
  const cursorContext = { platform: context.inventory.os, env: context.env, home, project: context.project };
  if (!cursorFound(cursorContext, context.inventory)) return;
  for (const family of FAMILIES) {
    const list = context.inventory.lists && context.inventory.lists[family];
    if (list && (list.note || list.cursorOffer === "declined")) continue;
    const listed = list && !list.old ? list.servers || [] : [];
    if (listed.some((server) => (server.clients || []).includes("cursor"))) continue;
    const pending = out.offers.find((offer) => offer.fix === "list-import" && offer.family === family);
    const brought = (pending && pending.servers || []).filter((server) => !listed.some((listedServer) => listedServer.name === server.name && listedServer.scope === server.scope));
    const servers = [...listed, ...brought].filter((server) => (server.clients || ["claude"]).includes("claude"));
    const file = list && !list.old ? list.file : pending ? pending.listFile : null;
    if (!servers.length || !file) continue;
    const root2 = path37.dirname(file);
    const upserts = servers.map((server) => ({ server: { ...server, clients: ["claude", "cursor"] }, cursorFile: null }));
    const taken = takenNames(context.inventory, { ...cursorContext, catalog: context.catalog }, upserts);
    out.cursorOffers.push({ id: `cursor-offer:${root2}`, family, root: root2, list: file, servers: servers.map((server) => ({ name: server.name, scope: server.scope })), taken, needs: pending && brought.length ? pending.id : null, signIns: signInNames(servers, context.catalog) });
  }
}
function ordered(picked, catalog) {
  const order = catalog.fixes.map((fixRow) => fixRow.id);
  const rank = (choice) => typeof choice === "string" || choice.kind !== "upgrade" ? 3 : choice.fix === "list-import" ? 0 : choice.fixKind === "registration" ? 1 : 2;
  const at2 = (choice) => typeof choice === "string" || choice.kind !== "upgrade" ? 0 : order.indexOf(choice.fix);
  return picked.map((choice, i) => ({ choice, i })).sort((left, right) => rank(left.choice) - rank(right.choice) || at2(left.choice) - at2(right.choice) || left.i - right.i).map((entry) => entry.choice);
}
var behind = (out) => out.offers.length + out.unchecked.length > 0;
function renderUpdates(out) {
  const lines = [...out.outside || []];
  if (lines.length) lines.push("");
  const table = (title, items) => {
    if (!items.length) return;
    lines.push(title);
    const labelWidth = Math.max(...items.map((item) => item.label.length));
    for (const item of items) lines.push(`  ${item.label.padEnd(labelWidth)}  ${item.from || "?"} -> ${item.to || "(not listed)"}${item.ageDays !== void 0 ? `  (${item.ageDays} days old)` : ""}`);
  };
  table("Catalog plugins:", out.offers.filter((offer) => offer.kind === "plugin" && offer.group === "catalog"));
  table("Other plugins:", out.offers.filter((offer) => offer.kind === "plugin" && offer.group === "other"));
  table("MCP servers (pin -> newest release at least 7 days old):", out.offers.filter((offer) => offer.kind === "mcp" || offer.kind === "cursor-pin"));
  table("Key helpers:", out.offers.filter((offer) => offer.kind === "helper" || offer.kind === "bridge" || offer.kind === "context"));
  const upgrades = out.offers.filter((offer) => offer.kind === "upgrade");
  if (upgrades.length) {
    lines.push("New ways to pass data:");
    const labelWidth = Math.max(...upgrades.map((upgrade) => upgrade.label.length));
    for (const upgrade of upgrades) {
      lines.push(`  ${upgrade.label.padEnd(labelWidth)}  ${upgrade.fix}: ${upgrade.found}`);
      for (const note of upgrade.notes || []) lines.push(`    ${note}`);
    }
  }
  if (out.unchecked.length) {
    lines.push("Plugins whose marketplace lists no version (`claude plugin update` is the check; each is offered on its own):");
    for (const offer of out.unchecked) lines.push(`  ${offer.label}  ${offer.from || "?"}`);
  }
  const sections = [["Held back", out.held], ["Skipped", out.skipped], ["Could not check", out.errors], ["Notes", out.notes]];
  for (const [title, list] of sections)
    if (list.length) lines.push(`${title}:`, ...list.map((line) => `  ${line}`));
  const offered = out.cursorOffers || [];
  if (offered.length) lines.push("Cursor (asked with the updates):", ...offered.map((cursorOffer) => `  ${cursorOffer.servers.length} servers in ${cursorOffer.root} are set up for Claude Code only`));
  if (!behind(out) && out.waiting) lines.push("", `alfred-tools: nothing to update - ${out.waiting} wait${out.waiting === 1 ? "s" : ""} on you first (the notes above)`);
  else if (!behind(out) && offered.length) lines.push("", "alfred-tools: nothing to update - Cursor can be set up (asked next)");
  else if (!behind(out) && !out.errors.length) lines.push("", "alfred-tools: everything current");
  else if (!behind(out)) lines.push("", "alfred-tools: nothing behind among what could be checked");
  return lines.join("\n").replace(/^\n/, "");
}

// scripts/update/constants.ts
var EXIT_CODE = { ok: 0, failed: 1, usage: 2, noCli: 3 };
var MAX_HEADER_LENGTH = 12;

// scripts/update/asks.ts
function questions(out) {
  const items = [...out.offers, ...out.unchecked];
  const cursor = { cursorOffers: (out.cursorOffers || []).map(cursorOfferAsk), cursorNameQuestions: (out.cursorOffers || []).flatMap((cursorOffer) => cursorOffer.taken.map((takenEntry) => cursorNameQuestion(takenEntry))) };
  if (!items.length) return { offer: null, pick: [], ...cursor };
  const groups = [["catalog", "Catalog plugins"], ["other", "Other plugins"], ["mcp", "MCP servers"], ["helper", "Key helpers"], ["upgrade", "New ways to pass data", "Data passing"]];
  const pickQuestions = [];
  for (const [groupKey, title, header] of groups) {
    const list = items.filter((item) => item.group === groupKey);
    const parts = chunk(list, MAX_OPTIONS);
    parts.forEach((part, partIndex) => pickQuestions.push({
      id: partIndex ? `update-${groupKey}-${partIndex + 1}` : `update-${groupKey}`,
      header: header || title.slice(0, MAX_HEADER_LENGTH),
      multiSelect: true,
      question: `${title}${parts.length > 1 ? ` (${partIndex + 1} of ${parts.length})` : ""}: which do you want to update?`,
      // AskUserQuestion takes 2 to 4 options: a group of one gets 'None of these' beside it
      options: [...part.map((item) => ({ label: item.kind === "upgrade" ? `${item.label}: ${item.fix}` : `${item.label}: ${item.from || "?"} -> ${item.to || "latest"}`, description: item.id })), ...part.length === 1 ? [{ label: "None of these", description: "none" }] : []]
    }));
  }
  const offer = { ...STATIC.updateOffer };
  if (out.offers.length && out.unchecked.length) {
    const note = leftOutNote(out.unchecked.map((item) => item.label));
    offer.options = offer.options.map((option, i) => i === 0 ? { ...option, description: `${option.description}; ${note}` } : option);
  }
  if (!out.offers.length) offer.options = offer.options.filter((option) => option.label !== `All of them${RECOMMENDED_SUFFIX}`).map((option, i) => i === 0 ? { ...option, label: `${option.label}${RECOMMENDED_SUFFIX}` } : option);
  return { offer, pick: chunk(pickQuestions, MAX_QUESTIONS), ...cursor };
}
function leftOutNote(names2) {
  const one = names2.length === 1;
  const last = names2.at(-1) ?? "";
  const joined = one ? last : `${names2.slice(0, -1).join(", ")} and ${last}`;
  return `${joined} ${one ? "lists" : "list"} no version - pick ${one ? "it" : "them"} under Pick which`;
}
function cursorOfferAsk(cursorOffer) {
  const offerQuestion = cursorOfferQuestion(cursorOffer.root, cursorOffer.servers.length, cursorOffer.signIns);
  return { ...offerQuestion.question, answers: offerQuestion.answers, needs: cursorOffer.needs };
}

// scripts/update/apply.ts
import fs42 from "node:fs";
import path38 from "node:path";

// scripts/plan/context.ts
var andList = (items) => items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
function makeCtx3(inventory, options2 = {}) {
  const env = options2.env || process.env;
  const machine = {
    platform: inventory.os,
    arch: inventory.arch,
    project: inventory.project,
    env,
    home: options2.home || homeDir(env),
    exists: options2.exists,
    isDir: options2.isDir,
    machine: options2.machine || {}
  };
  return {
    ...machine,
    // alfred-code set up in this project (its .alfred/.gitignore): its folder is recommended for the data (D3)
    alfredHere: alfredData(machine, inventory.alfredCodeEnabled),
    // a live registration, read in this process for a key comparison (R1) - only from an account the caller's env names
    readLive: options2.readLive || liveReader(inventory.project, options2.env)
  };
}

// scripts/plan/pick/root.ts
function resolveName(pick, row, current, context) {
  const nameAnswer = pick.name === void 0 ? "keep" : pick.name;
  if (nameAnswer === "keep") return current ? current.name : row.name;
  if (nameAnswer === "prefixed") return perProjectName(row.name, context.project);
  return nameAnswer;
}
function wantedRoot(row, pick, current, name, scope, context) {
  const locations = locationsOf(row);
  const serenaWin = locations.windowsAbsolute && context.platform === "win32";
  let locationAnswer = pick.location || { side: current ? "keep" : recommendedSide(row, scope, context) };
  if (locationAnswer.side === "default" && !serenaWin) locationAnswer = { side: recommendedSide(row, scope, context) };
  const pathApi = pathFor(context.platform);
  if (scope !== "user" && !(current && current.name === name) && context.roots && context.roots.project === pathApi.join(context.project, ALFRED_DATA)) {
    const problem = alfredNameProblem(name, context);
    if (problem) return { error: problem };
  }
  let root2;
  let existing = false;
  if (locationAnswer.side === "keep" && current && current.rootStr) root2 = logicalRoot(current.rootStr, context);
  else if (locationAnswer.side === "project") root2 = otherPlace(row, name, "project", context);
  else if (locationAnswer.side === "account") root2 = otherPlace(row, name, "account", context);
  else if (locationAnswer.side === "path") {
    if (locationAnswer.path === void 0) return { error: `a 'path' location names its folder: { "side": "path", "path": <folder> }` };
    root2 = parseRoot(locationAnswer.path, context);
  } else if (locationAnswer.side === "alfred-data") {
    if (!context.alfredHere) return { error: "alfred-code is not set up here (no .alfred/.gitignore) - pick another folder" };
    const problem = alfredNameProblem(name, context);
    if (problem) return { error: problem };
    root2 = { kind: "project", rel: `${ALFRED_DATA}/${name}` };
  } else if (locationAnswer.side === "alfred") {
    const old = alfredRoot(row, context);
    if (!old) return { error: "no alfred-code data folder for it on disk" };
    root2 = old;
    existing = true;
  } else {
    const defaultPlace = defaultRoot(row, name, context);
    if (defaultPlace.root !== void 0) root2 = defaultPlace.root;
    else if (!serenaWin) return { error: defaultPlace.needsInput };
    else root2 = serenaSpaceFree(context);
  }
  if (serenaWin) {
    const resolved = formatRoot(root2, "local", context);
    const text = resolved.value && resolved.value.replace(/\//g, "\\");
    if (!text || !validWindowsSerenaHome(text))
      return { error: `serena's home on Windows must be absolute, in backslashes and space-free (fix row serena-windows-home); '${text || locationAnswer.path}' is not` };
    return { root: { kind: "abs", path: text }, existing };
  }
  return { root: root2, existing };
}

// scripts/plan/pick/target.ts
function listedOf(inventory, registration) {
  const familyList = inventory.lists && inventory.lists[familyOf(registration.scope)];
  return familyList && !familyList.note && !familyList.old ? (familyList.servers || []).find((server) => server.name === registration.name && server.scope === registration.scope) || null : null;
}
var inheritedFrom = (inventory, registration) => fromHere(inventory, required(registration.from, `'${registration.name}': an inherited server is read with its folder`));
function pickTarget(row, pick, inventory, context, catalog, out) {
  if (!row.os.includes(context.platform)) return out.errors.push(`${row.id}: not offered on ${context.platform}`);
  const here = inventory.registrations.filter((registration) => registration.rowId === row.id && !registration.alfredRetired);
  const wanted = pick.target;
  const target = wanted ? here.find((registration) => registration.name === wanted.name && registration.scope === wanted.scope) ?? null : null;
  const current = target ? currentOf(row, target) : null;
  const listedEntry = target ? listedOf(inventory, target) : null;
  const listedClients = listedEntry ? listedEntry.clients || ["claude"] : ["claude"];
  const clients = pick.clients || listedClients;
  const routeId = pick.route || (current ? current.route : row.recommendedRoute);
  const route = routeId ? row.routes[routeId] : void 0;
  if (!routeId || !route) return out.errors.push(`${row.id}: no ${routeId} route (routes: ${Object.keys(row.routes).join(", ")})`);
  const scope = pick.scope || (current ? current.scope : recommendedScope(row, routeId));
  if (!ALL_SCOPES.includes(scope)) return out.errors.push(`${row.id}: unknown scope '${scope}'`);
  if (scope === "project" && routeId !== "remote" && route.runtime !== "bridge" && route.authMode === "token" && !(current && current.scope === "project"))
    return out.errors.push(`${row.id}: its local route needs a key written into the registration, so it is not offered at project scope - the committed .mcp.json carries no key; pick local or global scope, or the hosted route`);
  const bad = inventory.unreadable.find((unreadable) => unreadable.scope === scope || scope !== "project" && ["local", "user"].includes(unreadable.scope) && ["local", "user"].includes(scope));
  if (bad) return out.errors.push(`${row.id}: the ${scope} scope is unreadable (${bad.file} is ${bad.state}); nothing is written there`);
  const name = resolveName(pick, row, current, context);
  const same2 = !pick.target && here.find((registration) => registration.name === name && registration.scope === scope);
  for (const registration of here) {
    if (registration === target || registration === same2 || context.changing.has(keyOf("mcp", registration.name, registration.scope))) continue;
    if (registration.scope !== "inherited") out.notes.push(`${row.id}: also installed as '${registration.name}' at ${registration.scope} scope - left as it is`);
    else if (registration.name !== name) out.notes.push(`${row.id}: also inherited as '${registration.name}' from ${inheritedFrom(inventory, registration)} (${registration.approval}) - change it there`);
  }
  if (same2) {
    out.expect.push({ kind: "mcp", row: row.id, name, scope, route: same2.route });
    return out.unchanged.push(`${row.id}: '${name}' is already installed at ${scope} scope - a change to it is /alfred-tools:configure`);
  }
  const taken = inventory.registrations.filter((registration) => registration.scope === scope);
  const problem = nameProblem(name, { catalog, taken, self: current ? { name: current.name, scope: current.scope } : null });
  if (problem) return out.errors.push(`${row.id}: ${problem}`);
  if (row.id === "windows-control" && !target) {
    const others = otherWindowsMcp(inventory, name);
    out.notes.push(`windows-control: keep one windows-mcp per Windows desktop - another Claude Code session with it open${others.length ? `, or ${others.join(", ")},` : ""} can leave its tools unavailable until a new session starts it again`);
  }
  for (const registration of inventory.registrations) {
    if (registration.name !== name || registration.scope === scope) continue;
    if (registration.scope === "inherited") {
      if (registration.shadowed && registration.shadowed.scope === "inherited") continue;
      const from = inheritedFrom(inventory, registration);
      out.notes.push(`${row.id}: '${name}' is also inherited from ${from} (${registration.approval}); Claude Code uses ${scope === "user" ? `the inherited one from ${from} in this project - a .mcp.json server ranks above user scope` : `this project's ${scope} copy`}`);
    } else out.notes.push(`${row.id}: '${name}' also exists at ${registration.scope} scope; Claude Code reads local, then project, then user, so the nearer one wins`);
  }
  return { row, target, current, listedClients, clients, routeId, route, scope, name };
}

// scripts/plan/pick/answers.ts
import fs37 from "node:fs";
function pickAnswers(base, pick, inventory, context, out) {
  const { row, current, routeId, route, scope } = base;
  const host = row.params ? pick.params && pick.params.host || current && current.host || required(row.params[0], `${row.id}: its params name no host`).default : void 0;
  const params = { host, ...pick.params || {} };
  const hostChoices = row.params && row.params.find((param) => param.id === "host")?.choices;
  if (hostChoices && !hostChoices.some((choice) => choice.value === params.host)) return out.errors.push(`${row.id}: '${params.host}' is not one of its hosts - ${hostChoices.map((choice) => choice.value).join(", ")}`);
  const keylessAtProject = scope === "project" && routeId !== "remote" && route.authMode === "optional-token";
  if (keylessAtProject && pick.token) return out.errors.push(`${row.id}: its local route runs keyless at project scope - the committed .mcp.json carries no key; pick local or global scope for a key, or the hosted route`);
  let wantToken = pick.token === void 0 ? current ? Boolean(current.token) : route.authMode === "optional-token" && !keylessAtProject : Boolean(pick.token);
  if (keylessAtProject && wantToken) {
    out.notes.push(`${row.id}: ${route.tokenVar ?? "its key"} is left out - its local route runs keyless at project scope`);
    wantToken = false;
  }
  const keyVar = route.helper ? route.helper.var : route.tokenVar;
  if (pick.keyName !== void 0 && !NAME_RULE.test(String(pick.keyName))) return out.errors.push(`${row.id}: '${pick.keyName}' is not a key name - a name matches ${NAME_RULE.source}`);
  const usesKey = Boolean(keyVar) && (route.authMode === "token" || route.authMode === "optional-token" && wantToken);
  const keyState = usesKey ? keyStateOf(row, routeId, context, inventory.alfredCodeEnabled, scope) : null;
  const sameRoute = current !== null && current.route === routeId;
  const liveKey = sameRoute && current && keyState && keyState.kind === "stdio" ? heldKey(context.readLive(current.name, current.scope) || {}, route) : null;
  const keyName = pick.keyName || ((route.helper || current && launcherParts(current.entry)) && current && current.keyName ? current.keyName : null) || (liveKey && keyState ? nameOfValue(keyState.files, liveKey) : null) || keyVar;
  const sendNow = wantToken;
  const urlNames = {};
  if (route.runtime === "bridge") {
    const held = current && current.route === routeId && current.urlNames || {};
    const urlVars = route.urlVars || [];
    for (const urlVar of urlVars) {
      const urlName = pick.urlNames && pick.urlNames[urlVar.var] || held[urlVar.var] || urlVar.var;
      if (!NAME_RULE.test(String(urlName))) return out.errors.push(`${row.id}: '${urlName}' is not a name - a name matches ${NAME_RULE.source}`);
      if (urlName === keyName || credentialName(urlName)) return out.errors.push(`${row.id}: ${urlName} holds a key - a key never goes in a URL; pick another name for the ${urlVar.label}`);
      const twin = urlVars.find((otherVar) => urlNames[otherVar.var] === urlName);
      if (twin) return out.errors.push(`${row.id}: ${urlName} already names the ${twin.label} - each part of the URL needs its own name; pick another name for the ${urlVar.label}`);
      urlNames[urlVar.var] = urlName;
    }
  }
  const exists2 = context.exists || ((filePath) => fs37.existsSync(filePath));
  const exclude = !route.excludeFile ? false : pick.exclude !== void 0 ? Boolean(pick.exclude) : sameRoute && current ? excludeArgAt(current.entry, route.excludeFile, context) >= 0 : excludeRecommended({ platform: context.platform, home: context.home, exists: exists2 });
  return { params, wantToken, keyState, liveKey, keyName, sendNow, urlNames, exclude };
}

// scripts/plan/pick/entry.ts
import fs38 from "node:fs";
function editedEntry(base, answers, current, edit, context, out) {
  const { row, routeId, route, scope } = base;
  const { params, wantToken, sendNow, keyName, urlNames } = answers;
  let entry = JSON.parse(JSON.stringify(current.entry));
  const launcher2 = launcherParts(entry);
  if (row.locations && edit.rootStr !== current.rootStr && edit.rootStr !== void 0) entry = applyRoot(entry, row, edit.rootStr, scope, context);
  if (route.run && route.run.includes("{contextFile}")) entry = applyContext(entry, scope, context);
  if (route.excludeFile) entry = withExclude(entry, route, answers.exclude, scope, context);
  if (route.optionalArgs && route.optionalArgs.executablePath && edit.wantExec !== current.executablePath) {
    const args = (entry.args || []).slice();
    const i = args.indexOf(EXECUTABLE_PATH_FLAG);
    if (i >= 0) args.splice(i, 2);
    if (edit.wantExec) args.push(EXECUTABLE_PATH_FLAG, edit.wantExec);
    entry.args = args;
  }
  if (route.runtime === "bridge") {
    const parts = required(bridgeParts(entry), `${row.id}: '${current.name}' is on the bridge route but runs no bridge`);
    const args = entry.args || [];
    const at2 = args.findIndex((argument) => String(argument) === parts.path);
    const held = current.urlNames || {};
    const rename = Object.fromEntries((route.urlVars || []).flatMap((urlVar) => {
      const next = urlNames[urlVar.var];
      return next === void 0 ? [] : [[held[urlVar.var] || urlVar.var, next]];
    }));
    entry.args = rebridgedArgs(args, at2, { path: bridgePathFor(scope, context), template: renameTemplate(parts.template, rename), keyName: required(keyName, `${row.id}: its bridge route names no key`), globalRoot: helperGlobalRoot(scope, context) });
  } else if (routeId === "remote" && route.helper) {
    const headers = entry.headers;
    const header = Boolean(headers && headers.Authorization);
    if (!wantToken) {
      delete entry.headersHelper;
      if (header && headers) {
        delete headers.Authorization;
        if (!Object.keys(headers).length) delete entry.headers;
      }
    } else if (header) out.notes.push(`${row.id}: '${current.name}' sends its key from an Authorization header - /alfred-tools:fix moves it into .mcps-secrets, read by mcp-headers.js (key-to-helper)`);
    else entry.headersHelper = helperFor(route, scope, context, keyName, edit.toolSettings, (helperParts(current.entry.headersHelper) || { pairs: null }).pairs);
  } else if (launcher2 && launcherRoute(route, routeId, current.scope)) {
    if (scope === "project" || !sendNow) entry = unlaunched(entry);
    else {
      const place = launcherPlace(scope, context);
      entry.args = relaunchedArgs(entry.args || [], { ...launcher2, path: place.bridgePath, globalRoot: place.globalRoot, keyName: keyName ?? launcher2.keyName });
    }
  } else if (route.authMode === "optional-token" && sendNow !== current.token) {
    entry = withoutTokenFields(entry, route);
    if (sendNow) entry.env = { ...entry.env || {}, ...routeField(route.optionalEnv?.token, row.id, "optionalEnv.token") };
  }
  if (row.params && current.host && params.host !== current.host) entry.url = subst(route.url, params);
  return entry;
}
function pickEntry(base, answers, pick, context, catalog, out) {
  const { row, current, routeId, route, scope, name } = base;
  const hostedSettings = routeId === "remote" && route.settings;
  let chosenSettings;
  if (pick.settings && hostedSettings) {
    const checked = checkHostedSettings(route, pick.settings);
    if ("error" in checked) return out.errors.push(`${row.id}: ${checked.error}`);
    chosenSettings = checked.settings;
  } else if (pick.settings) {
    if (routeId === "remote") return out.errors.push(`${row.id}: a hosted route takes no settings - its options are its route and host`);
    for (const [settingName, value] of Object.entries(pick.settings)) {
      if (!NAME_RULE.test(settingName)) return out.errors.push(`${row.id}: '${settingName}' is not a setting name - a name matches ${NAME_RULE.source}`);
      if (credentialName(settingName)) return out.errors.push(`${row.id}: ${settingName} looks like a key - keep a key in .mcps-secrets and pick it as the key's name`);
      if (looksLikeKey(value)) return out.errors.push(`${row.id}: ${settingName}'s value looks like a key - keep a key in .mcps-secrets and pick its name as the key's name`);
    }
  }
  const toolSettings = !hostedSettings ? void 0 : chosenSettings || (current && current.route === routeId ? currentHostedSettings(route, current.entry) : defaultHostedSettings(route));
  const wantExec = pick.executablePath === void 0 ? current ? current.executablePath : void 0 : pick.executablePath || void 0;
  let rootStr;
  let ensure = null;
  let dataAbs = null;
  if (row.locations) {
    const wanted = wantedRoot(row, pick, current, name, scope, context);
    if (wanted.error !== void 0) return out.errors.push(`${row.id}: ${wanted.error}`);
    rootStr = formatRoot(wanted.root, scope, context).value;
    dataAbs = rootStr;
    if (!wanted.existing) ensure = dataAbs;
    if (scope === "project" && row.id.startsWith("playwright-"))
      out.notes.push(`${row.id}: one browser profile for every session under this folder - two sessions at once cannot both open it`);
  }
  const { params, sendNow, keyName, urlNames } = answers;
  const fresh = !current || current.route !== routeId;
  let entry = !current || current.route !== routeId ? buildEntry(row, routeId, { rootStr, scope, executablePath: wantExec, token: sendNow, keyName, params, urlNames, settings: toolSettings, exclude: answers.exclude }, context, catalog.rules) : editedEntry(base, answers, current, { rootStr, wantExec, toolSettings }, context, out);
  if (launcherRoute(route, routeId, scope) && (route.authMode === "token" || sendNow) && launcherParts(entry) === null && (fresh || tokenFields(current?.entry, route).length === 0)) {
    const wrapped = launcherForm(route, required(keyName, `${row.id}: its stdio route names no key`), launcherPlace(scope, context), entry);
    if (!wrapped) return out.errors.push(`${name}: its entry holds no key field - remove it with /alfred-tools:configure, then add it again with /alfred-tools:install`);
    entry = wrapped;
  }
  const launcher2 = launcherParts(entry);
  if (launcher2) {
    const exists2 = context.exists || ((filePath) => fs38.existsSync(filePath));
    if (shippedState("bridge", launcher2.path, exists2).state === "edited")
      return out.errors.push(`${row.id}: mcp-bridge.js in ${pathFor(context.platform).dirname(launcher2.path)} changed since alfred-tools wrote it - a launcher there would not start; /alfred-tools:fix (helper-stale) rewrites it, or delete it, then run this again`);
  }
  return { entry, fresh, rootStr, ensure, dataAbs, hostedSettings: Boolean(hostedSettings) };
}

// scripts/plan/pick/cursor.ts
import fs39 from "node:fs";
function pickCursor(base, answers, built, context, catalog, out) {
  const { row, current, routeId, route, scope, name } = base;
  const { params, wantToken } = answers;
  let entry = built;
  let clients = base.clients;
  let form = null;
  let signInRoot = null;
  if (routeId === "remote" && route.keyless === "oauth" && !wantToken) {
    const family = familyOf(scope);
    const root2 = context.roots && context.roots[family];
    const pathApi = pathFor(context.platform);
    const was = signInParts(entry);
    const httpUrl = row.params && params.host ? subst(route.url, params) : was ? was.url : entry.url;
    const exists2 = context.exists || ((filePath) => fs39.existsSync(filePath));
    if (clients.includes("cursor") && root2 && (exists2(root2) || pathApi.basename(root2) === ALFRED_DATA) && gitIgnores(pathApi.join(root2, FILES.signIns, SIGN_IN_PROBE)) === false) {
      out.notes.push(`${root2}: git would commit ${FILES.signIns}/ - ${name} is set up for Claude Code only; /alfred-tools:fix (root-ignore) covers it, then configure adds Cursor`);
      clients = clients.filter((client) => client !== "cursor");
    }
    if (clients.includes("cursor") && root2) {
      const url = required(httpUrl, `${row.id}: its hosted route has no URL`);
      entry = was ? { ...entry, args: (entry.args || []).map((argument) => argument === was.url ? url : argument), env: { ...entry.env || {}, MCP_REMOTE_CONFIG_DIR: root2 } } : signInFormOf(url, root2, catalog, context);
      delete entry.url;
      form = "signin";
      signInRoot = root2;
      if (current && !signInParts(current.entry)) out.notes.push(`${name}: sign in once more - the sign-in now lives in ${pathApi.join(root2, FILES.signIns)}/ and serves both apps`);
    } else {
      if (was) entry = { type: "http", url: httpUrl };
      if (current && signInParts(current.entry)) out.notes.push(`${name}: Claude Code signs in on its own again (/mcp)`);
    }
  } else if (routeId === "remote" && entry.headersHelper && clients.includes("cursor")) {
    const other = otherHeaders(entry);
    if (other.length) {
      out.notes.push(`${name}: set up for Claude Code only - its ${other.join(", ")} header${other.length > 1 ? "s have" : " has"} no bridge equivalent`);
      clients = clients.filter((client) => client !== "cursor");
    } else form = "two";
  }
  if (scope === "local" && clients.includes("cursor") && (stdioKeyed(entry, row, routeId) || launcherParts(entry) !== null)) {
    out.notes.push("Cursor: not written - Cursor has no private per-project file, and .cursor/mcp.json may be committed; install at user scope for Cursor");
    clients = clients.filter((client) => client !== "cursor");
  }
  return { entry, form, clients, signInRoot };
}

// scripts/plan/pick/key-use.ts
var import_mcp_bridge6 = __toESM(require_mcp_bridge(), 1);
function pickKeyUse(base, answers, entry, inventory, context, out) {
  const { row, current, route, scope, name } = base;
  const { keyState, keyName, liveKey } = answers;
  const keyed = keyState && keyName !== void 0 && !(entry.headers && entry.headers.Authorization) ? { state: keyState, name: keyName } : null;
  const chainFile = (files) => required(files[0], `${row.id}: its key chain names no file`);
  const bridge = bridgeParts(entry);
  const launcher2 = launcherParts(entry);
  let launcherFilled = null;
  let keyFile = null;
  let keyNames = keyName === void 0 ? [] : [keyName];
  if (keyed && !(keyed.state.kind === "stdio" && scope === "project")) {
    const filled = filledNames(keyed.state.files).some((filledEntry) => filledEntry.names.includes(keyed.name));
    out.keys.push({ row: row.id, name, scope, variable: keyed.name, kind: bridge || launcher2 ? "bridge" : keyed.state.kind, files: keyed.state.files, filled, old: filled ? null : oldHolding(context.project, context.home, keyed.name), ...launcher2?.optional ? { optional: true } : {} });
    if (launcher2) launcherFilled = filled;
    if (!filled) keyFile = keyed.state.files[0] ?? null;
    const pairs = keyed.state.kind === "helper" ? pairNames(entry) : [];
    const empty2 = pairs.filter((pairName) => !filledNames(keyed.state.files).some((filledEntry) => filledEntry.names.includes(pairName)));
    if (pairs.length) keyNames = [keyed.name, ...pairs];
    if (empty2.length) {
      keyFile = chainFile(keyed.state.files);
      out.notes.push(...optionalNameNotes(row.id, route, empty2, keyFile));
    }
  }
  let bridgeFilled = null;
  if (bridge && keyed) {
    const have = new Set(filledNames(keyed.state.files).flatMap((filledEntry) => filledEntry.names));
    const all = [{ name: required(bridge.keyName, `${row.id}: its bridge launch names no key`), optional: false }, ...(0, import_mcp_bridge6.templateNames)(bridge.template) || []];
    const lack = all.filter((nameItem) => !have.has(nameItem.name));
    keyNames = lack.map((nameItem) => nameItem.name);
    keyFile = keyNames.length ? keyed.state.files[0] ?? null : null;
    bridgeFilled = !lack.some((nameItem) => !nameItem.optional);
    const needed = lack.filter((nameItem) => !nameItem.optional).map((nameItem) => nameItem.name);
    const optional = lack.filter((nameItem) => nameItem.optional).map((nameItem) => nameItem.name);
    const after = "each time the server starts - after a change, restart Claude Code or reconnect it in /mcp";
    out.notes.push(needed.length || optional.length ? `${row.id}: fill ${andList(needed.length ? needed : optional)} in ${keyed.state.files[0]}${needed.length && optional.length ? ` (${andList(optional)} ${optional.length > 1 ? "are" : "is"} optional)` : !needed.length ? ` (optional)` : ""}; the bridge reads them ${after}` : `${row.id}: the bridge reads its key and URL names from .mcps-secrets ${after}`);
  }
  if (launcher2 && keyed) {
    const eachStart = "each time the server starts";
    bridgeFilled = launcher2.optional || Boolean(launcherFilled);
    out.notes.push(launcherFilled ? `${row.id}: the launcher reads its key from .mcps-secrets ${eachStart}` : `${row.id}: fill ${keyed.name} in ${chainFile(keyed.state.files)}${launcher2.optional ? " (optional)" : ""}; the launcher reads it ${eachStart} - after a change, restart Claude Code or reconnect it in /mcp`);
  }
  const stepKey = !launcher2 && keyed && keyed.state.kind === "stdio" && scope !== "project" ? { name: keyed.name, files: keyed.state.files } : null;
  const chosen = stepKey && current ? valueIn(stepKey.files, stepKey.name) : null;
  const staleKey = chosen !== null && chosen.value !== liveKey;
  const once = (text) => {
    if (!out.notes.includes(text)) out.notes.push(text);
  };
  if (bridge || launcher2) once("node must be on the PATH Claude Code starts with - mcp-bridge.js runs under it, as this plugin's commands do");
  if (keyed && keyed.state.kind === "helper" && entry.headersHelper) {
    if (scope !== "user" && inventory.trusted === false) once(`accept the trust dialog the next time Claude Code starts in ${context.project} - until then the server connects without its key`);
    if (scope === "project" && !PARENT_HELPER_IN_CHILD) out.notes.push(`${row.id}: a session started in a child folder connects without this key - Claude Code does not run a parent folder's helper there; ${CHILD_FOLDER_REMEDY}`);
    once("node must be on the PATH Claude Code starts with - mcp-headers.js runs under it, as this plugin's commands do");
  }
  const reconnect = keyed && keyed.state.kind === "helper" && entry.headersHelper ? { row: row.id, name, variable: keyed.name, file: chainFile(keyed.state.files), filled: filledNames(keyed.state.files).some((filledEntry) => filledEntry.names.includes(keyed.name)), anonymous: route.authMode === "optional-token" && !route.keyless, hint: route.helper && route.helper.hint || null, untrusted: scope !== "user" && inventory.trusted === false } : null;
  return { bridge: Boolean(bridge), launcher: launcher2 !== null, bridgeFilled, keyFile, keyNames, withKey: stepKey ? { key: stepKey } : {}, chosen, staleKey, reconnect };
}

// scripts/plan/serena-init.ts
import fs40 from "node:fs";
function serenaConfigInitStep(entry, context) {
  const home = entry.env && entry.env.SERENA_HOME;
  if (!home || !editableHome(home, { platform: context.platform }).ok || "error" in folderValue(home)) return null;
  const file = configOf(home);
  const exists2 = context.exists || ((candidate) => fs40.existsSync(candidate));
  if (exists2(file)) return null;
  return { op: "serena-config-init", file, home, why: `serena: ${file} with its project folders under ${home}/projects, before serena first starts` };
}

// scripts/plan/pick/steps.ts
function pickSteps(base, built, cursor, keyUse, entry, keyName, context, out) {
  const { row, route, current, listedClients, routeId, scope, name } = base;
  const { fresh, rootStr, ensure, dataAbs } = built;
  const { form, clients, signInRoot } = cursor;
  const { bridge, launcher: launcher2, bridgeFilled, keyFile, keyNames, withKey, chosen, staleKey, reconnect } = keyUse;
  const fetch2 = fetchStep(name, entry, row.id, current && current.entry);
  const contextFile = entry.args?.[contextArgAt(entry)];
  const uses = { helper: Boolean(entry.headersHelper) || bridge || launcher2, bridge: bridge || launcher2 || form === "two", serenaContext: contextFile === void 0 ? void 0 : pathFor(context.platform).dirname(contextFile), exclude: route.excludeFile && excludeArgAt(entry, route.excludeFile, context) >= 0 ? route.excludeFile.tools : void 0, keyFile, keyName, keyNames, data: dataAbs };
  const signInUse = () => {
    if (signInRoot !== null) context.uses.push({ family: familyOf(scope), root: signInRoot });
  };
  const record = () => {
    const registrationKey = keyOf("mcp", name, scope);
    if (context.clientsFor) context.clientsFor.set(registrationKey, clients);
    if (context.formFor) context.formFor.set(registrationKey, form);
  };
  const withFilled = bridge || launcher2 ? { filled: Boolean(bridgeFilled) } : {};
  const serenaLine = () => {
    const noteLine = row.id === "serena" ? planNote(entry, context) : null;
    if (noteLine && !out.notes.includes(noteLine)) out.notes.push(noteLine);
  };
  if (!current) {
    serenaLine();
    if (reconnect) out.reconnect.push(reconnect);
    useRoots(context, scope, uses);
    signInUse();
    record();
    const configInit2 = row.id === "serena" ? serenaConfigInitStep(entry, context) : null;
    if (configInit2) out.steps.push(configInit2);
    if (ensure) out.steps.push({ op: "ensure-dir", path: ensure, why: `${row.id}: data folder, with a .gitignore holding * so the project's own .gitignore is never edited` });
    out.steps.push({ op: "mcp-add", name, scope, entry, row: row.id, route: routeId, ...withKey, ...withFilled, why: `${row.id}: add (${routeId}) at ${scope} scope` });
    if (fetch2) out.steps.push(fetch2);
    return void 0;
  }
  const moved = current.name !== name || current.scope !== scope;
  const edited = !deepEqual(entry, current.entry);
  if (!moved && !edited && !fresh && !staleKey) {
    const sameApps = [...clients].sort().join() === [...listedClients].sort().join();
    if (sameApps || !context.clientsOnly) return out.unchanged.push(`${row.id}: '${name}' at ${scope} scope already as answered`);
    context.clientsOnly.push({ key: keyOf("mcp", name, scope), clients, form });
    if (form === "two") useRoots(context, scope, { helper: true, bridge: true });
    return void 0;
  }
  serenaLine();
  if (reconnect) out.reconnect.push(reconnect);
  useRoots(context, scope, uses);
  signInUse();
  record();
  if (row.locations && current.rootStr && rootStr !== current.rootStr && formatRoot(logicalRoot(current.rootStr, context), "local", context).value !== ensure)
    out.notes.push(`${row.id}: the old data stays at ${current.rootStr}; moving a location moves no data`);
  const configInit = row.id === "serena" ? serenaConfigInitStep(entry, context) : null;
  if (configInit) out.steps.push(configInit);
  if (ensure && (!current.rootStr || rootStr !== current.rootStr)) out.steps.push({ op: "ensure-dir", path: ensure, why: `${row.id}: new data folder` });
  if (moved)
    out.steps.push({ op: "mcp-move", from: { name: current.name, scope: current.scope }, to: { name, scope }, entry, old: current.entry, row: row.id, route: routeId, ...withKey, ...withFilled, why: `${row.id}: ${current.name !== name ? `rename '${current.name}' to '${name}'` : ""}${current.name !== name && current.scope !== scope ? " and " : ""}${current.scope !== scope ? `move from ${current.scope} to ${scope} scope` : ""} - add first, read back, then remove the old one` });
  else
    out.steps.push({ op: "mcp-replace", name, scope, entry, old: current.entry, row: row.id, route: routeId, ...withKey, ...withFilled, why: `${row.id}: rewrite '${name}' from the registration as read${staleKey && !edited && !fresh && chosen ? ` - writes in the key ${keyName} holds in ${chosen.file}` : ""}` });
  if (fetch2) out.steps.push(fetch2);
  return void 0;
}

// scripts/plan/pick.ts
function planMcp(row, pick, inventory, context, catalog, out) {
  const base = pickTarget(row, pick, inventory, context, catalog, out);
  if (typeof base === "number") return base;
  const answers = pickAnswers(base, pick, inventory, context, out);
  if (typeof answers === "number") return answers;
  const built = pickEntry(base, answers, pick, context, catalog, out);
  if (typeof built === "number") return built;
  const cursor = pickCursor(base, answers, built.entry, context, catalog, out);
  const { current, route, scope, name } = base;
  const entry = pick.settings && !built.hostedSettings ? mergeSettings(cursor.entry, route, pick.settings) : cursor.entry;
  if (scope === "project" && current && current.scope !== "project") {
    const own = new Set(tokenFields(entry, route).map((field) => field.at.join(".")));
    const held = credentialPaths(entry, row).filter((credentialPath) => !own.has(credentialPath));
    const viaFix = route.helper && held.every((credentialPath) => /^headers\.authorization$/i.test(credentialPath));
    if (held.length) return out.errors.push(`${row.id}: '${current.name}' holds a credential in ${held.join(", ")}, which the committed .mcp.json must not carry - keep it at ${current.scope} scope, or ${viaFix ? "run /alfred-tools:fix first: key-to-helper moves the key into mcp-headers.js" : `take it out of ${held.join(", ")} first`}`);
  }
  const keyUse = pickKeyUse(base, answers, entry, inventory, context, out);
  if (route.authMode === "oauth" || route.keyless === "oauth" && !answers.wantToken)
    out.oauth.push(cursor.signInRoot === null ? { row: row.id, name, scope } : { row: row.id, name, scope, signin: true, root: cursor.signInRoot });
  if (row.dangerous && row.dangerous.length) out.dangerous.push({ row: row.id, name, tools: row.dangerous });
  out.expect.push({ kind: "mcp", row: row.id, name, scope, route: base.routeId });
  return pickSteps(base, built, cursor, keyUse, entry, answers.keyName, context, out);
}

// scripts/plan/change.ts
import fs41 from "node:fs";
function planChange(key, pick, inventory, context, catalog, out) {
  const target = targetOf(inventory, key);
  if (!target) return out.errors.push(`change: nothing is installed as '${key}' (a key is mcp:<name>~<scope>)`);
  if (target.kind !== "mcp" || !isRegistration(target.item)) return out.errors.push(`change: '${key}' is a plugin - the catalog lists none since 0.5.0, so it is not changed here`);
  const registration = target.item;
  if (registration.retiredRow && !registration.own) return out.errors.push(`change: '${registration.name}' runs ${registration.retiredRow}, which the catalog retired - /alfred-tools:fix removes it; it is not changed here`);
  if (!registration.rowId) return out.errors.push(`change: '${registration.name}' is your own (it matches no catalog row) - left alone`);
  if (registration.alfredRetired) return out.errors.push(`change: '${registration.name}' is alfred-code's (retired) - left alone`);
  const row = required(catalog.byId.get(registration.rowId), `change: '${registration.name}' names the catalog row '${registration.rowId}', which the catalog lacks`);
  const { row: _row, ...answers } = pick;
  return planMcp(row, { ...answers, target: { name: registration.name, scope: registration.scope } }, inventory, context, catalog, out);
}
function planRootChange(answers, inventory, context, catalog, out) {
  const pathApi = pathFor(context.platform);
  for (const answered of answers.rootChange || []) {
    const family = FAMILIES.find((candidate) => candidate === answered);
    if (!family) {
      out.errors.push(`rootChange: '${answered}' is not a root family - project or global`);
      continue;
    }
    const next = context.roots && context.roots[family];
    if (!next) continue;
    const used = inventory.roots && Object.hasOwn(inventory.roots, family) ? inventory.roots[family] : inUse(inventory, family, { ...context, catalog });
    if (!used) {
      out.unchanged.push(`rootChange: no ${family} root is in use here - nothing to move`);
      continue;
    }
    if (used.path === next) {
      out.unchanged.push(`rootChange: the ${family} root is already ${next}`);
      continue;
    }
    const inOld = (filePath) => isInside(pathApi, used.path, filePath, { orSame: true });
    const exists2 = context.exists || ((filePath) => fs41.existsSync(filePath));
    const list = inventory.lists && inventory.lists[family];
    const scopes = family === "global" ? SCOPES.global : SCOPES.project;
    const keepsRootContext = inventory.registrations.some((registration) => registration.rowId && isManaged(registration) && scopes.includes(registration.scope) && contextArgAt(registration.entry) >= 0 && !(registration.entry.env && registration.entry.env.SERENA_HOME && editableHome(registration.entry.env.SERENA_HOME, { platform: context.platform }).ok));
    const excludeOld = pathApi.join(used.path, FILES.macosExclude);
    const namesExclude = inventory.registrations.some((registration) => registration.rowId && isManaged(registration) && scopes.includes(registration.scope) && (registration.entry.args || [])[excludeArgAt(registration.entry, catalog.byId.get(registration.rowId)?.routes[registration.route || ""]?.excludeFile, context)] === excludeOld);
    for (const fileName of [FILES.list, FILES.serenaContext, FILES.signIns, FILES.macosExclude]) {
      const from = pathApi.join(used.path, fileName);
      if (fileName === FILES.list && (!list || list.note || list.old || list.file !== from)) continue;
      if (fileName === FILES.serenaContext && !keepsRootContext) continue;
      if (fileName === FILES.macosExclude && !namesExclude) continue;
      if (exists2(from)) context.rootMoves.push({ family, name: fileName, from, to: pathApi.join(next, fileName) });
    }
    const secretsOld = pathApi.join(used.path, FILES.secrets);
    const secretsNew = pathApi.join(next, FILES.secrets);
    let keyed = false;
    context.uses.push({ family, root: next });
    for (const registration of inventory.registrations.filter((candidate) => candidate.rowId && isManaged(candidate) && scopes.includes(candidate.scope))) {
      const row = registration.rowId ? catalog.byId.get(registration.rowId) : void 0;
      if (!row || row.kind !== "mcp" || context.changing.has(keyOf("mcp", registration.name, registration.scope))) continue;
      const current = currentOf(row, registration);
      const dataAbs = row.locations && current.rootStr ? formatRoot(logicalRoot(current.rootStr, context), "local", context).value : null;
      const moves = dataAbs ? inOld(dataAbs) : false;
      planMcp(row, { target: { name: registration.name, scope: registration.scope }, ...moves ? { location: { side: family === "global" ? "account" : "project" } } : {} }, inventory, context, catalog, out);
      const route = current.route ? row.routes[current.route] : void 0;
      const launch = launcherParts(registration.entry);
      let name = launch ? launch.keyName : route && route.helper ? current.keyName : null;
      if (!launch && route && !route.helper && route.tokenVar && tokenFields(registration.entry, route).length) {
        const held = heldKey(context.readLive(registration.name, registration.scope) || registration.entry, route);
        name = held ? nameOfValue([secretsOld], held) || route.tokenVar : null;
      }
      if (!name) continue;
      context.uses.push({ family, root: next, key: { file: secretsNew, name } });
      keyed = true;
    }
    if (keyed) out.notes.push(`copy the values from ${secretsOld} to ${secretsNew} yourself - until then those servers connect without their keys`);
    if (family === "global") {
      const standardOld = standard("global", context).some((standardRoot) => standardRoot.root === used.path);
      for (const registration of inventory.registrations.filter((candidate) => candidate.rowId && isManaged(candidate) && candidate.scope === "local")) {
        const launch = launcherParts(registration.entry);
        const helperRoot = standardOld ? null : helperParts(registration.entry && registration.entry.headersHelper)?.root;
        const named = launch ? launch.globalRoot : helperRoot;
        const row = registration.rowId ? catalog.byId.get(registration.rowId) : void 0;
        if (!row || !named || context.changing.has(keyOf("mcp", registration.name, registration.scope))) continue;
        if (pathApi.resolve(absOf(named, context)) !== pathApi.resolve(used.path)) continue;
        planMcp(row, { target: { name: registration.name, scope: registration.scope } }, inventory, context, catalog, out);
      }
      out.notes.push(`a local server in another project whose ${standardOld ? "launcher" : "helper or launcher"} names ${used.path} keeps reading its .mcps-secrets until /alfred-tools:configure runs there`);
    }
  }
}
function movedLists(inventory, moves) {
  const listMoves = (moves || []).filter((move) => move.name === FILES.list);
  const lists = inventory.lists;
  if (!listMoves.length || !lists) return inventory;
  const moved = { ...lists };
  for (const move of listMoves) {
    const list = lists[move.family];
    if (list) moved[move.family] = { ...list, file: move.to };
  }
  return { ...inventory, lists: moved };
}
function planExisting(answers, inventory, context, catalog, out, connectors) {
  const recordEntries = { project: [], global: [] };
  context.recordEntries = recordEntries;
  for (const [key, choice] of Object.entries(answers.existing || {})) {
    const item = itemOf(inventory, key, catalog);
    if (!item) {
      out.errors.push(`existing: '${key}' is not a server found here`);
      continue;
    }
    const allowed = CHOICES[item.kind];
    if (!allowed.includes(choice)) {
      out.errors.push(`existing: '${choice}' is not an answer for ${key} - ${allowed.join(" or ")}`);
      continue;
    }
    required(recordEntries[item.family], `existing: '${key}' is in no root family`).push(recordEntry(item, choice));
  }
  context.recordLive = liveOf(inventory, catalog, connectors);
}
function planRemove(removeAnswer, inventory, _catalog, out) {
  if (removeAnswer.kind === "plugin") return out.errors.push(`remove: ${removeAnswer.id} is a plugin - the catalog lists none since 0.5.0; claude plugin uninstall ${removeAnswer.id} --scope ${removeAnswer.scope} removes it`);
  const registration = inventory.registrations.find((candidate) => candidate.name === removeAnswer.name && candidate.scope === removeAnswer.scope);
  if (!registration) return out.errors.push(`remove: no registration '${removeAnswer.name}' at ${removeAnswer.scope} scope`);
  if (registration.own) return out.errors.push(`remove: '${removeAnswer.name}' is your own server (it matches no catalog row) - left alone`);
  if (registration.alfredRetired) return out.errors.push(`remove: '${removeAnswer.name}' is alfred-code's (retired) - left alone`);
  out.steps.push({ op: "mcp-remove", name: registration.name, scope: removeAnswer.scope, old: registration.entry, row: registration.rowId, why: `remove '${removeAnswer.name}' (${registration.rowId ?? registration.retiredRow}) at ${removeAnswer.scope} scope` });
  return void 0;
}

// scripts/plan/plan.ts
var MOVE_FIRST = ".preferred-tools is this plugin's old folder - run /alfred-tools:update first, which moves it";
var moveWaits = (context) => pendingMoves(context).some((move) => move.state === "move");
var REPOINT_FIRST = "a server still names .preferred-tools, this plugin's old folder - run /alfred-tools:update first, which points it at .alfred-tools";
function waitsFor(context, registrations) {
  if (moveWaits(context)) return MOVE_FIRST;
  return repointWaits(registrations, context) ? REPOINT_FIRST : null;
}
function plan(inventory, answers, options2 = {}) {
  const catalog = options2.catalog || load();
  const context = { ...makeCtx3(inventory, { ...options2, machine: options2.machine || answers.machine }), changing: new Set(Object.keys(answers.change || {})), uses: [], rootMoves: [] };
  const out = { version: 1, project: inventory.project, os: inventory.os, alfredCodeEnabled: Boolean(inventory.alfredCodeEnabled), steps: [], notes: [], errors: [], unchanged: [], keys: [], reconnect: [], oauth: [], dangerous: [], expect: [] };
  const waits = waitsFor({ project: inventory.project, home: context.home, platform: context.platform }, inventory.registrations || []);
  if (waits) {
    out.errors.push(waits);
    return out;
  }
  const resolved = resolveRoots(inventory, answers.roots, { ...context, catalog });
  out.errors.push(...resolved.errors);
  context.roots = resolved.roots;
  context.knownRoots = knownRoots(inventory, resolved.roots, { ...context, catalog });
  out.roots = context.roots;
  out.outside = changedOutside(inventory, catalog);
  const keyNames = answers.keyNames || {};
  const settings = answers.settings || {};
  const urlNamesOf = answers.urlNames || {};
  const connectors = options2.connectors === void 0 ? null : options2.connectors;
  context.clientsFor = /* @__PURE__ */ new Map();
  context.formFor = /* @__PURE__ */ new Map();
  context.clientsOnly = [];
  if (answers.clients && Object.keys(answers.picks || {}).length) out.apps = answers.clients;
  for (const [rowId, pick] of Object.entries(answers.picks || {})) {
    const row = catalog.byId.get(rowId);
    if (!row) {
      out.errors.push(`unknown tool '${rowId}'`);
      continue;
    }
    planMcp(row, { ...pick || {}, clients: answers.clients, keyName: keyNames[rowId], settings: settings[rowId], urlNames: urlNamesOf[rowId] || (pick || {}).urlNames }, inventory, context, catalog, out);
    for (const provider of alsoProvided(inventory, rowId, connectors)) out.notes.push(twoServers(row.label, provider.owner));
  }
  const leftNow = new Set(Object.entries(answers.existing || {}).filter(([, choice]) => choice === "own").map(([key]) => key));
  for (const [key, pick] of Object.entries(answers.change || {})) {
    if (leftNow.has(key)) {
      out.unchanged.push(`${key}: left on its own`);
      continue;
    }
    planChange(key, { ...pick || {}, keyName: keyNames[key], settings: settings[key], urlNames: urlNamesOf[key] || (pick || {}).urlNames }, inventory, context, catalog, out);
  }
  for (const removeAnswer of answers.remove || []) planRemove(removeAnswer, inventory, catalog, out);
  planExisting(answers, inventory, context, catalog, out, connectors);
  planRootChange(answers, inventory, context, catalog, out);
  const listInv = movedLists(inventory, context.rootMoves);
  const files = fileSteps(listInv, context, out, out.steps);
  const moves = context.rootMoves.map((move) => ({ op: "move-root-file", from: move.from, to: move.to, why: `the ${move.family} root moves: ${move.name} goes with it` }));
  const ignores = files.before.filter((step) => step.op === "root-ignore");
  const retire = retireContextSteps({ inventory, platform: context.platform, home: context.home, catalog }, rewritesOf(out.steps));
  out.steps = [...ignores, ...moves, ...files.before.filter((step) => step.op !== "root-ignore"), ...out.steps, ...retire, ...files.after];
  const cursor = cursorSteps(listInv, { ...context, catalog }, out, answers);
  const guards = [...startTimeoutSteps(out.steps, context, out), ...denyReadSteps(out.steps, context, out)];
  if (guards.length) {
    const at2 = out.steps.findIndex((step) => step.op === "list-write");
    out.steps.splice(at2 < 0 ? out.steps.length : at2, 0, ...guards);
  }
  if (out.taken) {
    out.cursorNames = out.taken.map((taken) => cursorNameQuestion(taken));
    delete out.taken;
  }
  out.steps = withOrderStep([...out.steps, ...cursor], inventory.project, ownProjectNames(inventory, answers.existing));
  out.noop = out.steps.length === 0 && out.errors.length === 0;
  return out;
}

// scripts/update/apply.ts
function updatePlugin(context, offer, log) {
  const result = context.runCli(["plugin", "update", offer.plugin, "--scope", offer.scope], { cwd: context.project, env: context.env });
  if (result.error || result.status !== 0) {
    log(`FAILED ${offer.label}: claude plugin update failed - ${`${result.stderr}${result.stdout}`.trim().split("\n").slice(-1)[0]}`);
    return false;
  }
  const after = buildInventory({ project: context.project, env: context.env, run: context.runCli }).plugins.find((plugin) => plugin.id === offer.plugin && plugin.scope === offer.scope);
  const installedVersion = after ? after.version : null;
  if (offer.to === null) log(`ok     ${offer.label}: ${offer.from || "?"} -> ${installedVersion || "?"}${installedVersion === offer.from ? " (already the latest)" : ""}`);
  else log(`${installedVersion === offer.to ? "ok    " : "CHECK "} ${offer.label}: ${offer.from || "?"} -> ${installedVersion || "?"} (read back from the plugin list)`);
  return offer.to === null || installedVersion === offer.to;
}
function updateMcp(context, offer, tmp, log) {
  if (context.touched.has(`${offer.name}~${offer.scope}`)) {
    const now2 = buildInventory({ project: context.project, env: context.env, run: context.runCli, data: context.data, catalog: context.catalog }).registrations.find((registration) => registration.name === offer.name && registration.scope === offer.scope);
    const route = offer.row && offer.route ? context.catalog.byId.get(offer.row)?.routes[offer.route] : void 0;
    const bumped = now2 ? bumpEntry(now2.entry, offer.package, offer.to, offer.cutoff) : null;
    const entry = bumped ? renameSinceEnv(bumped, route, offer.to) : null;
    if (!now2 || !entry) {
      log(`CHECK  ${offer.label}: rewritten earlier in this run and no longer pins ${offer.package} - left`);
      return false;
    }
    offer = { ...offer, old: now2.entry, entry };
  }
  const fetch2 = fetchStep(offer.name, offer.entry, offer.row, offer.old);
  const replace = { op: "mcp-replace", name: offer.name, scope: offer.scope, old: offer.old, entry: offer.entry, row: offer.row, route: offer.route, why: `${offer.package} ${offer.from} -> ${offer.to}` };
  const notes = [];
  const now = buildInventory({ project: context.project, env: context.env, run: context.runCli, data: context.data, catalog: context.catalog });
  const tail = repairTail(now, { platform: now.os, project: context.project, home: homeDir(context.env), env: context.env, catalog: context.catalog, notes }, [replace]);
  for (const note of notes) log(`note   ${note}`);
  const plan2 = { project: context.project, alfredCodeEnabled: Boolean(context.inventory && context.inventory.alfredCodeEnabled), steps: withOrderStep([replace, ...fetch2 ? [fetch2] : [], ...tail], context.project, ownProjectNames(context.inventory || {})), expect: [{ kind: "mcp", name: offer.name, scope: offer.scope, route: offer.route }] };
  const report = apply(plan2, { env: context.env, tmp, runCli: context.runCli, fetchFile: false, log: (...parts) => log(parts.join(" ")) });
  if (report.fetch && report.fetch.fetch.length) context.fetches.push(report.fetch);
  if (report.failed) return false;
  const again = tail.flatMap((step) => "reapprove" in step && step.reapprove || []);
  if (again.length) context.reapprove.push(...again);
  const got = buildInventory({ project: context.project, env: context.env, run: context.runCli }).registrations.find((registration) => registration.name === offer.name && registration.scope === offer.scope);
  const pin = got ? pinnedVersion(got.entry, offer.package) : null;
  log(`${pin === offer.to ? "ok    " : "CHECK "} ${offer.label}: ${offer.package} ${offer.from} -> ${pin || "?"} (read back from the file the CLI wrote), cut-off ${offer.cutoff}`);
  return pin === offer.to;
}
function updateCursorPin(context, offer, tmp, log) {
  const scopes = offer.family === "global" ? ["user"] : ["local", "project"];
  const familyList = context.inventory.lists ? context.inventory.lists[offer.family] : null;
  const before = (familyList && familyList.servers || []).filter((server) => (server.clients || []).includes("cursor")).map((server) => server.name);
  const steps = [
    { op: "list-write", file: offer.list, family: offer.family, upserts: [{ server: { ...offer.server, cursorEntry: offer.entry }, after: null, cursorFile: offer.file }], drops: [], own: null, why: `${offer.list}: Cursor's copy of ${offer.name} at ${offer.package} ${offer.to}` },
    { op: "cursor-write", file: offer.file, family: offer.family, lists: [{ file: offer.list, scopes }], before, skip: [], replace: [], why: `${offer.file}: ${offer.name} at ${offer.package} ${offer.to}` }
  ];
  const report = apply({ project: context.project, steps }, { env: context.env, tmp, runCli: context.runCli, fetchFile: false, log: (...parts) => log(parts.join(" ")) });
  if (report.failed) return false;
  const got = readCursor(offer.file);
  const pin = got.state === "ok" ? pinnedVersion(got.servers[offer.name] || {}, offer.package) : null;
  log(`${pin === offer.to ? "ok    " : "CHECK "} ${offer.label}: ${offer.package} ${offer.from} -> ${pin || "?"} (read back from ${offer.file}), cut-off ${offer.cutoff}`);
  return pin === offer.to;
}
function updateHelper(offer, log) {
  const kind = offer.kind === "bridge" ? "bridge" : offer.kind === "context" ? "serenaContext" : "helper";
  const before = shippedState(kind, offer.file);
  if (before.state !== "lower") {
    log(`CHECK  ${offer.label}: now ${before.state} - left as it is`);
    return false;
  }
  try {
    fs42.writeFileSync(offer.file, shippedSource(kind));
  } catch (caught) {
    log(`FAILED ${offer.label}: ${caught instanceof Error ? caught.message : String(caught)}`);
    return false;
  }
  const note = kind === "serenaContext" ? null : ensureCommonjs(path38.dirname(offer.file)).note;
  if (note) log(`note   ${note}`);
  const ok = shippedState(kind, offer.file).state === "same";
  log(`${ok ? "ok    " : "CHECK "} ${offer.label}: ${kind} ${offer.from} -> ${offer.to} (read back)`);
  return ok;
}
function updateUpgrade(context, offer, dir, log) {
  const projectInventory = buildInventory({ project: context.project, env: context.env, run: context.runCli, data: context.data, catalog: context.catalog });
  const fixContext = makeCtx({ inventory: projectInventory, catalog: upgradeCatalog(context.catalog), env: context.env, machine: context.machine, data: context.data });
  const result = applyFixes(fixContext, [offer.fix], { only: offer.name, name: offer.name, scope: offer.scope || void 0, tmp: dir, log, runCli: context.runCli, fetchFile: false, quietRecheck: true });
  if (result.fetch && result.fetch.fetch.length) context.fetches.push(result.fetch);
  for (const finding2 of result.applied.filter((candidate) => candidate.kind === "registration")) {
    context.restart = true;
    context.touched.add(`${finding2.name}~${finding2.scope}`);
  }
  if (result.applied.some((finding2) => finding2.id === "retired-plugin")) context.restart = true;
  const ok = !result.failed && !result.remaining.length && (result.applied.length > 0 || result.gone);
  log(`${ok ? "ok    " : "CHECK "} ${offer.label}: ${offer.fix} (${result.gone ? "already done by an earlier step in this run" : "read back by its detector"})`);
  return ok;
}
function applyCursorOffer(context, cursorOffer, answer, input, dir, log) {
  const say = (...parts) => log(parts.join(" "));
  if (answer === "declined") {
    const step = { op: "list-write", file: cursorOffer.list, family: cursorOffer.family, upserts: [], drops: [], own: null, cursorOffer: "declined", why: `${cursorOffer.list}: Cursor is not offered again for ${cursorOffer.root}` };
    const declinedResult = apply({ project: context.project, steps: [step] }, { env: context.env, tmp: dir, runCli: context.runCli, fetchFile: false, log: say });
    log(`${declinedResult.failed ? "FAILED" : "ok    "} ${cursorOffer.id}: not now - kept in ${cursorOffer.list}`);
    return !declinedResult.failed;
  }
  const projectInventory = buildInventory({ project: context.project, env: context.env, run: context.runCli, data: context.data, catalog: context.catalog });
  const change = Object.fromEntries(cursorOffer.servers.map((server) => [`mcp:${server.name}~${server.scope}`, { clients: ["claude", "cursor"] }]));
  const cursorNames = {};
  for (const takenEntry of cursorOffer.taken) {
    const given = input[`cursor-name:${takenEntry.name}@${takenEntry.file}`];
    cursorNames[`${takenEntry.name}@${takenEntry.file}`] = given === "replace" ? "replace" : "keep";
    if (given !== "replace" && given !== "keep") log(`${takenEntry.name}: Cursor's ${takenEntry.file} already has its own ${takenEntry.name} - left; run /alfred-tools:configure to choose`);
  }
  const builtPlan = plan(projectInventory, { change, cursorNames }, { home: homeDir(context.env), env: context.env, catalog: context.catalog });
  if (builtPlan.errors.length) {
    log(`FAILED ${cursorOffer.id}: ${builtPlan.errors.join("; ")}`);
    return false;
  }
  for (const step of builtPlan.steps) if (step.op === "settings-env" || step.op === "deny-read") log(renderLine(step).trim());
  const result = apply(builtPlan, { env: context.env, tmp: dir, runCli: context.runCli, fetchFile: false, log: say });
  for (const note of builtPlan.notes) log(`note   ${note}`);
  if (result.fetch && result.fetch.fetch.length) context.fetches.push(result.fetch);
  log(`${result.failed ? "FAILED" : "ok    "} ${cursorOffer.id}: set up for Cursor too`);
  if (!result.failed) for (const move of signInMoves(builtPlan.oauth, cursorOffer.signIns, builtPlan.os)) log(signInLine(move));
  return !result.failed;
}
function applyOffer(context, offer, dir, log) {
  switch (offer.kind) {
    case "plugin":
      return updatePlugin(context, offer, log);
    case "helper":
    case "bridge":
    case "context":
      return updateHelper(offer, log);
    case "upgrade":
      return updateUpgrade(context, offer, dir, log);
    case "cursor-pin":
      return updateCursorPin(context, offer, dir, log);
    case "mcp":
      return updateMcp(context, offer, dir, log);
  }
}
function applyUpdates(context, ids, out, { tmp, log = console.log, input = {} } = {}) {
  const result = { applied: [], failed: [], unknown: [], fetchFile: null, dir: null };
  let turnedDown;
  try {
    turnedDown = parse(input["retired-declined"]);
  } catch (caught) {
    log(`FAILED ${errorMessage(caught)}`);
    result.failed.push("retired-declined");
    return result;
  }
  const known = [...out.offers, ...out.unchecked];
  const named = ids.filter((pickedId) => pickedId !== "all" && pickedId !== "none");
  let everything = [];
  if (ids.includes("all")) {
    const kept = out.offers.filter((offer) => offer.alfred && !named.includes(offer.id));
    for (const offer of kept) log(`${offer.name} kept - alfred-code installs it; fix lists it`);
    everything = out.offers.filter((offer) => !kept.includes(offer));
  }
  if (turnedDown.length) log(add(context.data, turnedDown).detail);
  const picked = ids.includes("all") ? [...everything, ...named.map((pickedId) => known.find((offer) => offer.id === pickedId)).filter((offer) => offer !== void 0 && !everything.includes(offer))] : named.map((pickedId) => known.find((offer) => offer.id === pickedId) || pickedId);
  const chosen = ordered(picked, context.catalog);
  const dir = tmp || makeTempDir();
  result.dir = dir;
  const applying = { ...context, fetches: [], restart: false, touched: /* @__PURE__ */ new Set(), reapprove: [] };
  for (const choice of chosen) {
    if (typeof choice === "string") {
      result.unknown.push(choice);
      log(`NOT OFFERED ${choice}: nothing is behind under that id`);
      continue;
    }
    const ok = applyOffer(applying, choice, dir, log);
    (ok ? result.applied : result.failed).push(choice.id);
  }
  for (const cursorOffer of out.cursorOffers || []) {
    const answer = input[cursorOffer.id];
    if (answer === void 0) continue;
    if (cursorOffer.needs && !result.applied.includes(cursorOffer.needs)) {
      log(`NOT OFFERED ${cursorOffer.id}: its servers join the list through ${cursorOffer.needs}, which was not picked - run /alfred-tools:update again`);
      continue;
    }
    const ok = answer === "set" || answer === "declined" ? applyCursorOffer(applying, cursorOffer, answer, input, dir, log) : (log(`FAILED ${cursorOffer.id}: '${answer}' is not set or declined`), false);
    (ok ? result.applied : result.failed).push(cursorOffer.id);
  }
  if (chosen.some((choice) => typeof choice !== "string" && choice.kind === "upgrade" && ["root-move", "root-repoint"].includes(choice.fix) && result.applied.includes(choice.id))) log("", "RECHECK - the folders moved; checking again");
  if (applying.reapprove.length) log("", reapproveLine([...new Set(applying.reapprove)]));
  const last = /* @__PURE__ */ new Map();
  for (const jobStep of applying.fetches.flatMap((fetchJob2) => fetchJob2.fetch)) {
    last.delete(`${jobStep.name}~${jobStep.scope}`);
    last.set(`${jobStep.name}~${jobStep.scope}`, jobStep);
  }
  const job = fetchJob(context.project, [...last.values()], [...new Set(applying.fetches.flatMap((fetchJob2) => fetchJob2.check))]);
  if (job.fetch.length) {
    result.fetchFile = writeJob(path38.join(dir, "fetch.json"), job);
    log("", ...nextLines(result.fetchFile, job));
  }
  if (result.applied.some((id) => !id.startsWith("helper:") && !id.startsWith("upgrade:")) || applying.restart) log("", `Restart Claude Code (or run /reload-plugins for plugins) so the updated servers and plugins load${result.fetchFile ? " - after the fetch reports" : ""}.`);
  if (result.applied.some((id) => PLUGIN_KEY_PREFIXES.some((prefix) => id.startsWith(`plugin:${prefix}`)))) log("", "The new alfred-tools version may bring its own New ways to pass data, and they run only from the new code - run /alfred-tools:update again after the restart.");
  return result;
}

// scripts/update/command.ts
function parseArgs(argv) {
  const args = { input: {} };
  const words = argv[Symbol.iterator]();
  for (const argument of words) {
    if (["--check", "--questions", "--json", "--no-refresh"].includes(argument)) {
      args[argument.slice(2)] = true;
      continue;
    }
    if (!["--apply", "--project", "--tmp", "--data", "--input"].includes(argument)) throw new Error(`unknown argument '${argument}'`);
    const flagValue2 = words.next().value;
    if (flagValue2 === void 0 || flagValue2.startsWith("--")) throw new Error(`${argument} needs a value`);
    if (argument === "--input") {
      const separatorIndex = flagValue2.indexOf("=");
      if (separatorIndex < 1) throw new Error("--input needs key=value");
      args.input[flagValue2.slice(0, separatorIndex)] = flagValue2.slice(separatorIndex + 1);
      continue;
    }
    if (Object.hasOwn(args, argument.slice(2))) throw new Error(`${argument} is given twice`);
    args[argument.slice(2)] = flagValue2;
  }
  if (["check", "questions", "apply"].filter((mode) => args[mode]).length !== 1) throw new Error("give exactly one of --check, --questions or --apply");
  return args;
}
async function runUpdateCommand(argv, { env = process.env, out = (line) => process.stdout.write(`${line}
`), machine, registry, now, runCli } = {}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (caught) {
    out(`update: ${errorMessage(caught)}
usage: node dist/update.mjs --check | --questions | --apply <id,id|all|none> [--input key=value] [--no-refresh] [--project <dir>] [--tmp <dir>] [--data <dir>]`);
    return EXIT_CODE.usage;
  }
  const project = path39.resolve(args.project || process.cwd());
  const projectInventory = buildInventory({ project, env, run: runCli || runClaude, data: args.data || null });
  if (!projectInventory.cli || !projectInventory.cli.ok) {
    out("alfred-tools: the claude CLI is not on PATH - install Claude Code, then run this again.");
    return EXIT_CODE.noCli;
  }
  const context = makeCtx2({ inventory: projectInventory, project, env, machine, registry, now, runCli: runCli || runClaude, refresh: !args["no-refresh"], data: args.data || null });
  const found = await checkUpdates(context);
  if (args.apply) {
    const log = (...lines) => out(lines.join("\n"));
    const result = applyUpdates(context, args.apply.split(",").filter(Boolean), found, { tmp: args.tmp, log, input: args.input });
    if (!result.fetchFile) releaseTempDir(result.dir, log);
    return result.failed.length || result.unknown.length ? EXIT_CODE.failed : EXIT_CODE.ok;
  }
  if (args.questions) out(JSON.stringify(questions(found), null, 2));
  else if (args.json) out(JSON.stringify(found, null, 2));
  else out(renderUpdates(found));
  return EXIT_CODE.ok;
}

// scripts/update.ts
blockingStdio();
exitWhenSettled(runUpdateCommand(process.argv.slice(2)), "update");
