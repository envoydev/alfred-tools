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
    var fs24 = __require("node:fs");
    var os3 = __require("node:os");
    var path19 = __require("node:path");
    var crypto = __require("node:crypto");
    var HELPER_VERSION3 = 6;
    var SECRETS2 = ".mcps-secrets";
    var NAME_RULE2 = /^[A-Za-z_][A-Za-z0-9_]*$/;
    var SCHEME_RULE = /^[!-~]+$/;
    var HEADER_RULE = /^[A-Za-z0-9_-]+$/;
    var FIXED_VALUE_RULE = /^[A-Za-z0-9_.,-]+$/;
    var USAGE2 = "mcp-headers: usage: node mcp-headers.js <NAME> <SCHEME> [<root>] [--header NAME=VAR | --header NAME:value]...";
    var LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;
    var COMMENT = /^\s*(?:[#;]|$)/;
    var unquote = (raw) => {
      const q = /^\s*(["'])(.*?)\1(?:\s+#.*)?\s*$/.exec(raw);
      return q ? q[2] : raw.replace(/\s+#.*$/, "").trim();
    };
    function readDotenv2(file) {
      let buf;
      try {
        buf = fs24.readFileSync(file);
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
      const dirs = [dir, extraRoot, path19.join(home, ".alfred-tools"), path19.join(home, ".alfred")].filter(Boolean);
      return [...new Set(dirs.map((d) => path19.join(d, SECRETS2)))];
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
      if (text[at2] === "=") return NAME_RULE2.test(rest) ? { header, var: rest } : null;
      return FIXED_VALUE_RULE.test(rest) ? { header, value: rest } : null;
    }
    function parsePairs2(argv) {
      let root2 = null;
      const pairs = [];
      for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--header") {
          const pair = i + 1 < argv.length ? parsePair(argv[i + 1]) : null;
          if (!pair) return { error: USAGE2 };
          pairs.push(pair);
          i++;
        } else if (root2 === null) root2 = argv[i];
        else return { error: USAGE2 };
      }
      return { root: root2, pairs };
    }
    function headers(argv, env) {
      if (!env.CLAUDE_CODE_MCP_SERVER_NAME)
        return { out: {}, note: "mcp-headers: prints a header only when Claude Code runs it as a headersHelper (CLAUDE_CODE_MCP_SERVER_NAME is unset) - no key file read" };
      const [name, scheme] = argv;
      if (!name || !NAME_RULE2.test(name) || !scheme || !SCHEME_RULE.test(scheme)) return { out: {}, note: USAGE2 };
      const parsed = parsePairs2(argv.slice(2));
      if ("error" in parsed) return { out: {}, note: parsed.error };
      const { root: extraRoot, pairs } = parsed;
      const home = env.HOME || env.USERPROFILE || os3.homedir();
      const files = chainOf(__dirname, extraRoot ? path19.resolve(extraRoot) : null, home);
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
    var fs24 = __require("node:fs");
    var os3 = __require("node:os");
    var path19 = __require("node:path");
    var { spawn } = __require("node:child_process");
    var BRIDGE_VERSION3 = 4;
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
    var USAGE2 = "usage: node mcp-bridge.js <url template> <KEY_NAME> <SCHEME> <package@version> [<root>] [--header NAME=VAR | --header NAME:value]...";
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
      const names = [];
      for (const [i, s] of parts.segments.entries()) {
        const m = PLACEHOLDER2.exec(s);
        if (!m) continue;
        if (!NAME_RULE2.test(m[1])) return null;
        if (m[2] && i !== parts.segments.length - 1) return null;
        if (names.some((n) => n.name === m[1])) return null;
        names.push({ name: m[1], optional: Boolean(m[2]) });
      }
      return names;
    }
    function fillTemplate(template, values) {
      const parts = partsOf(template);
      if (!parts || !templateNames3(template)) return { error: USAGE2 };
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
      if (!template || !keyName || !NAME_RULE2.test(keyName) || !scheme || !SCHEME_RULE.test(scheme) || !pkg || !PACKAGE_RULE.test(pkg)) return { error: USAGE2 };
      const parsed = parsePairs2(extra);
      if (!parsed) return { error: USAGE2 };
      const { root: globalRoot, pairs } = parsed;
      const names = templateNames3(template);
      if (!names) return { error: USAGE2 };
      if (!originAllowed(partsOf(template).origin)) return { error: "the URL template is not https - mcp-remote takes http only on 127.0.0.1 or localhost" };
      const keyLike = names.find((n) => n.name === keyName || CREDENTIAL.test(n.name));
      if (keyLike) return { error: `${keyLike.name} in the URL template names a key - a key never goes in a URL` };
      const keyPair = pairs.find((p) => p.var === keyName);
      if (keyPair) return { error: `${keyPair.var} in a --header pair is the key's name - a key never goes in another header` };
      const h = helper2 || require_mcp_headers();
      const home = env.HOME || env.USERPROFILE || os3.homedir();
      const files = h.chainOf(dir, globalRoot ? path19.resolve(globalRoot) : null, home);
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
      if (tail.some((a) => !ARG_RULE.test(a))) return { error: USAGE2 };
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
      return [...new Set([dir, globalRoot].filter(Boolean).map((d) => path19.join(d, SECRETS2)))];
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
      const base = path19.win32.basename(command).toLowerCase();
      const direct = base === "cmd" || base === "cmd.exe" || /\.(exe|com)$/.test(base);
      const folders = String(env.PATH || env.Path || "").split(";").filter(Boolean);
      if (direct || folders.some((folder) => [".exe", ".com"].some((ext) => exists(path19.win32.join(folder, command + ext))))) return { command, args };
      return { command: env.ComSpec || "cmd.exe", args: ["/d", "/c", command, ...args] };
    }
    function runLaunch(argv, env, { dir, platform, helper: helper2, exists } = {}) {
      const parsed = parseRun(argv);
      if (parsed.error) return parsed;
      const h = helper2 || require_mcp_headers();
      const files = runChain(dir, parsed.globalRoot ? path19.resolve(parsed.globalRoot) : null);
      const found = h.valueIn(parsed.keyName, files);
      if (!found && !parsed.optional) return { error: `no value for ${parsed.keyName} in ${files.join(", ")}`, code: EXIT.failed };
      const start = platform === "win32" ? winLaunch(parsed.command, parsed.args, env, exists || fs24.existsSync) : { command: parsed.command, args: parsed.args };
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
    module.exports = { BRIDGE_VERSION: BRIDGE_VERSION3, NEEDS_HELPER, CREDENTIAL, RUN_FLAG, templateNames: templateNames3, fillTemplate, launch, runChain, parseRun, runLaunch };
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
var deepEqual = (left, right) => JSON.stringify(sortKeys(left)) === JSON.stringify(sortKeys(right));

// scripts/core/temp-write.ts
import fs2 from "node:fs";
import path2 from "node:path";

// scripts/core/constants.ts
var CMD_PROGRAM_PATTERN = /^cmd(\.exe)?$/i;
var CMD_RUN_FLAG_PATTERN = /^\/c$/i;
var CLI_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
var NO_FILE_NAMES = /* @__PURE__ */ new Set(["", ".", ".."]);
var BRIDGE_WHY = "fills a hosted URL or starts a stdio server with its key from .mcps-secrets each time the server starts";
var BRIDGE_RENDER = "this plugin's bridge: it fills a hosted URL or starts a stdio server with its key";
var FILES = { secrets: ".mcps-secrets", helper: "mcp-headers.js", record: "preferred-tools.json", map: "roots.json", bridge: "mcp-bridge.js", list: "mcps.json", signIns: "mcp-remote-v1", serenaContext: "serena-context.yml", macosExclude: "macos-mcp.toml" };
var ROOT_NAME = ".alfred-tools";
var FORMER_ROOT_NAME = ".preferred-tools";
var ALFRED_DATA = ".alfred";
var RECOMMENDED_SUFFIX = " (Recommended)";
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

// scripts/inventory/inventory.ts
import fs11 from "node:fs";
import path14 from "node:path";

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

// scripts/core/cmd-line.ts
var throughCmd = (command, args) => CMD_PROGRAM_PATTERN.test(command) && CMD_RUN_FLAG_PATTERN.test(args[0] || "");

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
var valueAt = (node, path19) => path19.reduce(childAt, node);
function credentialPaths(entry, row) {
  const masked = maskCredentials(entry, row);
  const out = [];
  const walk = (node, kept, path19) => {
    if (typeof node === "string") {
      if (node !== kept || node.includes(MARKER)) out.push(path19.join("."));
      return;
    }
    if (node && typeof node === "object") for (const key of Object.keys(node)) walk(childAt(node, key), childAt(kept, key), [...path19, key]);
  };
  walk(entry, masked, []);
  return out;
}
var looksLikeKey = (value) => new RegExp(SHAPE.source).test(String(value)) || new RegExp(PRIVATE_KEY_BLOCK.source).test(String(value));

// scripts/roots/roots.ts
import fs7 from "node:fs";
import path11 from "node:path";
import { spawnSync as spawnSync2 } from "node:child_process";

// scripts/entries/locations.ts
import fs6 from "node:fs";
import path7 from "node:path";

// scripts/entries/platform.ts
import path6 from "node:path";
var pathFor = (platform) => platform === "win32" ? path6.win32 : path6.posix;
var slashes = (pathText) => pathText.replace(/\\/g, "/");
var pathApiOf = (pathText) => /^(?:[A-Za-z]:[\\/]|\\\\)/.test(pathText) ? path6.win32 : path6.posix;
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
  if (path7.win32.isAbsolute(trimmed) || path7.posix.isAbsolute(trimmed)) return { kind: "abs", path: trimmed };
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
  if (profile && !/\s/.test(profile)) return { root: { kind: "abs", path: path7.win32.join(profile, ".serena") } };
  return { needsInput: `the profile path ${profile || "(unknown)"} has a space, and serena's home must be space-free on Windows: type an absolute folder without spaces (for example C:\\serena-home)` };
}
function serenaSpaceFree(context) {
  const drive = context.env && context.env.SystemDrive || "";
  return { kind: "abs", path: `${/^[A-Za-z]:$/.test(drive) ? drive : "C:"}\\serena-home` };
}
function validWindowsSerenaHome(rootStr) {
  return path7.win32.isAbsolute(rootStr) && !/\s/.test(rootStr) && !rootStr.includes("/") && /^[A-Za-z]:\\/.test(rootStr);
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
  const exists = context.exists || ((filePath) => fs6.existsSync(filePath));
  const old = parseRoot(row.locations.alfred, context);
  const absolutePath = old.kind === "abs" ? old.path : old.kind === "home" ? pathFor(context.platform).join(context.home, ...old.rel.split("/")) : pathFor(context.platform).resolve(context.project, ...old.rel.split("/"));
  return exists(absolutePath) ? old : null;
}
var ALFRED_ENTRIES = ["docs", "state", "statistics", "workspace", "flow"];
function alfredData(context, enabled) {
  if (!enabled) return false;
  const exists = context.exists || ((filePath) => fs6.existsSync(filePath));
  return Boolean(exists(pathFor(context.platform).join(context.project, ALFRED_DATA, ".gitignore")));
}
function alfredNameProblem(name, context) {
  if (ALFRED_ENTRIES.includes(String(name).toLowerCase())) return `'${name}' is one of alfred-code's own entries under .alfred (${ALFRED_ENTRIES.join(", ")}) - pick another name or folder`;
  const at2 = pathFor(context.platform).join(context.project, ALFRED_DATA, name);
  const exists = context.exists || ((filePath) => fs6.existsSync(filePath));
  if (!exists(at2)) return null;
  const isDir3 = context.isDir || ((filePath) => {
    try {
      return fs6.statSync(filePath).isDirectory();
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
import path10 from "node:path";

// scripts/keys/keys.ts
var import_mcp_headers = __toESM(require_mcp_headers(), 1);
import path9 from "node:path";

// scripts/entries/launcher.ts
import path8 from "node:path";

// scripts/entries/constants.ts
var EXECUTABLE_PATH_FLAG = "--executable-path";
var API_KEY_FLAG = "--api-key";
var BRIDGE_SLOT = { path: 0, template: 1, keyName: 2, scheme: 3, packageSpec: 4, globalRoot: 5 };
var MACOS_USER_CONFIG = [".macos-mcp", "config.toml"];
var TRAILING_SEPARATORS = /[\\/]+$/;
var RUN = { flag: "--run", end: "--", optional: "?" };
var RUN_RESERVED_ENV = /^PT_BRIDGE_/;
var RUN_PAIR = /^([A-Za-z_][A-Za-z0-9_]*)=([A-Za-z_][A-Za-z0-9_]*)(\?)?$/;

// scripts/entries/launcher.ts
var isNode = (command) => path8.basename(command.replace(/\\/g, "/")).replace(/\.exe$/i, "").toLowerCase() === "node";
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
var unlaunched = (entry) => launchOf(entry);

// scripts/keys/keys.ts
var KEY_FILES = [path9.join(ROOT_NAME, ".secrets"), path9.join(FORMER_ROOT_NAME, ".secrets")];
var alfredStores = (project) => [".secrets", ".sensitive-data"].map((storeName) => path9.join(project, ALFRED_DATA, storeName));
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
    const [where, name] = field.at;
    if (where === "args") continue;
    const holder = out[where];
    if (holder) delete holder[name];
  }
  return out;
}
function moveArgKeyToEnv(entry, route) {
  const names = Object.keys(route.optionalEnv && route.optionalEnv.token || {});
  const field = tokenFields(entry, route).find((candidate) => candidate.at[0] === "args");
  if (!field || field.at[0] !== "args" || !names.length || !entry.args) return entry;
  const at2 = field.at[1];
  const value = entry.args[at2];
  if (value === void 0) return entry;
  const args = [...entry.args];
  args.splice(at2 - 1, 2);
  return { ...entry, args, env: { ...entry.env || {}, ...Object.fromEntries(names.map((name) => [name, value])) } };
}
var SECRETS = FILES.secrets;
var NAME_RULE = /^[A-Za-z_][A-Za-z0-9_]*$/;
var pathApiOn = (platform) => platform ? pathFor(platform) : path9;
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
  for (let dir = path9.resolve(project); ; dir = path9.dirname(dir)) {
    stores.push(...alfredStores(dir));
    if (path9.dirname(dir) === dir) break;
  }
  return uniq([...stores, ...KEY_FILES.map((file) => path9.join(project, file)), ...KEY_FILES.map((file) => path9.join(home, file))]);
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
var APPIUM_SDK_ENV = ["ANDROID_HOME", "JAVA_HOME"];
function settingsOf(row, routeId, entry = null) {
  const route = routeNamed(row, routeId);
  if (route.runtime === "bridge") return [];
  const derived = new Set((row.locations && row.locations.derived || []).filter((derivedLocation) => derivedLocation.in === "env").map((derivedLocation) => derivedLocation.key));
  const env = (entry ? entry.env : route.env) || {};
  return Object.entries(env).filter(([variableName]) => variableName !== route.tokenVar && !derived.has(variableName) && !APPIUM_SDK_ENV.includes(variableName) && variableName !== "npm_config_before" && !credentialName(variableName));
}
function mergeSettings(entry, route, pairs) {
  const out = structuredClone(entry);
  out.env = { ...out.env || {}, ...pairs };
  const args = out.args;
  const image = route.image;
  if (launchOf(out).command === "docker" && Array.isArray(args) && image) {
    const at2 = args.findIndex((argument) => typeof argument === "string" && argument.startsWith(`${image.name}:`));
    const passed = new Set(args.filter((_argument, i) => args[i - 1] === "-e"));
    const add = Object.keys(pairs).filter((variableName) => !passed.has(variableName)).flatMap((variableName) => ["-e", variableName]);
    if (at2 >= 0 && add.length) args.splice(at2, 0, ...add);
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
  if (path10.basename(entry.command.replace(/\\/g, "/")).replace(/\.exe$/i, "").toLowerCase() !== "node") return null;
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
var renameTemplate = (template, names) => template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)(\?)?\}/g, (_match, name, optional) => `{${names[name] || name}${optional || ""}}`);
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
var FAMILIES = ["project", "global"];
var ROOT_FILE_NAMES = [FILES.secrets, FILES.helper, FILES.bridge, FILES.list, FILES.record, FILES.serenaContext, ".secrets"];
function holdsRootFiles(dir) {
  let names;
  try {
    names = fs7.readdirSync(dir);
  } catch {
    return false;
  }
  return names.some((name) => ROOT_FILE_NAMES.includes(name));
}
function pendingMoves(context) {
  const pathApi = pathFor(context.platform);
  const bases = [];
  for (const [base, family] of [[context.project, "project"], [context.home, "global"]]) {
    const same = bases.find((candidate) => pathApi.resolve(candidate.base) === pathApi.resolve(base));
    if (same) same.families.push(family);
    else bases.push({ base, families: [family] });
  }
  const out = [];
  for (const { base, families } of bases) {
    const from = pathApi.join(base, FORMER_ROOT_NAME);
    const to = pathApi.join(base, ROOT_NAME);
    let stat;
    try {
      stat = fs7.lstatSync(from);
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
      beside = fs7.readdirSync(to);
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
var existsOf = (context) => context.exists || ((filePath) => fs7.existsSync(filePath));
var loaded = null;
var catalogOf = (context) => context.catalog || (loaded = loaded || load());
var emptyMap = () => ({ version: MAP_VERSION, global: null, projects: {} });
var newerOrBad = (version, current) => typeof version === "number" && version > current ? "newer" : "bad";
var versionNote = (file, version, current) => newerOrBad(version, current) === "newer" ? `${file} is version ${version}, newer than this plugin's ${current}` : `${file} is version ${JSON.stringify(version)}, not ${current}`;
function readMap(dataDir) {
  if (!dataDir) return emptyMap();
  const file = path11.join(dataDir, FILES.map);
  let text;
  try {
    text = fs7.readFileSync(file, "utf8");
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
  if (path11.win32.isAbsolute(trimmed) && /^([A-Za-z]:|\\\\)/.test(trimmed)) return pathApi.normalize(trimmed);
  if (path11.posix.isAbsolute(trimmed)) return pathApi.normalize(trimmed);
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
function knownRoots(inventory, resolved2, context) {
  const inUseOf = (family) => inventory.roots && Object.hasOwn(inventory.roots, family) ? inventory.roots[family] : inUse(inventory, family, context);
  const found = [...FAMILIES.map((family) => resolved2 && resolved2[family]), ...FAMILIES.map((family) => inUseOf(family)?.path)];
  return [...new Set(found.filter((root2) => typeof root2 === "string" && root2 !== ""))];
}
var NAMED_GLOBAL_TAIL = "a project-scope helper does not read keys here - keep a key a committed server uses in the project's root";
function options(inventory, family, context) {
  const exists = existsOf(context);
  const [alfred, projectAlfredTools] = standard("project", context);
  const [homeAlfredTools, homeAlfred] = standard("global", context);
  const list = family === "global" ? [
    { ...homeAlfredTools, label: "~/.alfred-tools", description: `${homeAlfredTools.root} - one folder for every project on this machine` },
    ...exists(homeAlfred.root) ? [{ ...homeAlfred, label: "~/.alfred", description: `${homeAlfred.root} - alfred-code's folder in your home, shared with it` }] : [],
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
  const where = family === "global" ? "the keys and data for every project" : "this project's keys and data";
  const tail = family === "global" && !standard("global", context).some((standardRoot) => standardRoot.root === used.path) ? ` - ${NAMED_GLOBAL_TAIL}` : "";
  return [{ id: "in-use", root: used.path, label: "The folder in use", description: `${used.path} - where ${where} are now${tail}` }, ...list].slice(0, 4);
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
  if (trimmed.startsWith("~") || path11.posix.isAbsolute(trimmed) || path11.win32.isAbsolute(trimmed))
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
    return fs7.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
};
function gitIgnores(file) {
  let dir = path11.dirname(file);
  while (!isDir(dir)) {
    const up = path11.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
  const result = spawnSync2("git", ["-C", dir, "check-ignore", "-q", "--", path11.relative(dir, file)], { windowsHide: true });
  if (result.error) return null;
  return result.status === 0 ? true : result.status === 1 ? false : null;
}
function ignoreGap(root2, family, { writes = [] } = {}) {
  const secrets = path11.join(root2, FILES.secrets);
  const ignored = gitIgnores(secrets);
  if (ignored === false) return { reason: `git would commit ${secrets}`, secrets: true };
  if (ignored === null) return null;
  const signIns = gitIgnores(path11.join(root2, FILES.signIns, SIGN_IN_PROBE)) === false;
  const file = path11.join(root2, FILES.helper);
  const projectRoot = family === "project" && path11.basename(root2) !== ALFRED_DATA;
  const unignore = projectRoot ? [FILES.bridge, FILES.serenaContext, FILES.macosExclude].filter((fileName) => (writes.includes(fileName) || fs7.existsSync(path11.join(root2, fileName))) && gitIgnores(path11.join(root2, fileName)) === true) : [];
  const extra = { ...signIns ? { signIns: true } : {}, ...unignore.length ? { unignore } : {} };
  if (projectRoot && gitIgnores(file) === true)
    return { reason: `git ignores ${file}, which a project-scope server needs committed`, helper: true, excluded: gitIgnores(root2) === true, ...extra };
  const why = [signIns && `git would commit ${path11.join(root2, FILES.signIns)}/`, unignore.length && `git ignores ${unignore.map((fileName) => path11.join(root2, fileName)).join(" and ")}, which a committed entry names`].filter(Boolean);
  return why.length ? { reason: why.join("; "), ...extra, ...unignore.length ? { excluded: gitIgnores(root2) === true } : {} } : null;
}
var SHIPPED_LINE = { helper: /^\/\/ (alfred|preferred)-tools mcp-headers (\d+)\s*$/, bridge: /^\/\/ (alfred|preferred)-tools mcp-bridge (\d+)\s*$/, serenaContext: /^# (alfred|preferred)-tools serena-context (\d+)\s*$/ };
var shippedVersion = (kind) => kind === "bridge" ? import_mcp_bridge2.BRIDGE_VERSION : kind === "serenaContext" ? SERENA_CONTEXT_VERSION : helper.HELPER_VERSION;
var shippedText = {};
var shippedSource = (kind) => shippedText[kind] = shippedText[kind] || fs7.readFileSync(path11.join(pluginRoot(), "scripts", "copied", FILES[kind]), "utf8");
function shippedState(kind, file, exists = (filePath) => fs7.existsSync(filePath)) {
  if (!exists(file)) return { state: "absent", number: null };
  let text;
  try {
    text = fs7.readFileSync(file, "utf8");
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
var helperState = (file, exists) => shippedState("helper", file, exists);

// scripts/inventory/constants.ts
var WINDOWS_MCP_MARKETPLACE = "envoydev";
var MARKETPLACE_LIST_UNREAD = { scope: "marketplaces", file: "claude plugin marketplace list --json" };
var PLUGIN_LIST_UNREAD = { scope: "plugins", file: "claude plugin list --json" };
var LIST_UNREAD_NOTES = /* @__PURE__ */ new Map([
  [PLUGIN_LIST_UNREAD.scope, "the plugin list could not be read, so this run takes no plugin as installed."],
  [MARKETPLACE_LIST_UNREAD.scope, "the marketplace list could not be read, so update offers no plugin update from it."]
]);

// scripts/inventory/fingerprint.ts
import path12 from "node:path";
function launchTokens(entry) {
  const launch = launchOf(entry);
  const command = String(launch.command || "");
  const args = Array.isArray(launch.args) ? launch.args.map(String) : [];
  if (/^cmd(\.exe)?$/i.test(path12.basename(command))) {
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
  if (fingerprint.command) return path12.basename(command).replace(/\.(exe|cmd)$/i, "") === fingerprint.command;
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

// scripts/mcps-list/mcps-list.ts
import fs8 from "node:fs";

// scripts/mcps-list/guards.ts
var isOptionalString2 = (value) => value === void 0 || isString(value);
var isStringOrNull = (value) => value === null || isString(value);
var isListServer = (value) => isRecord(value) && isString(value["name"]) && isString(value["scope"]) && isStringOrNull(value["row"]) && (value["route"] === void 0 || isStringOrNull(value["route"])) && isTextList(value["clients"]) && isServerEntry(value["entry"]) && isStringOrNull(value["key"]) && (value["cursorEntry"] === void 0 || isServerEntry(value["cursorEntry"]));
var isOwnEntry = (value) => isRecord(value) && ["name", "scope", "plugin", "server", "connector", "choice"].every((field) => isOptionalString2(value[field]));
var isStepEnd = (value) => isRecord(value) && isString(value["name"]) && isString(value["scope"]);

// scripts/mcps-list/mcps-list.ts
var LIST_VERSION = 1;
var newerOrBad2 = (version) => typeof version === "number" && version > LIST_VERSION ? "newer" : "bad";
var empty = (file, note, state) => ({ version: LIST_VERSION, servers: [], own: [], note: `${file} ${note} - read as empty`, state });
function readList(file) {
  let text;
  try {
    text = fs8.readFileSync(file, "utf8");
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
    text = fs8.readFileSync(file, "utf8");
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
var parseConnectors = (arg) => [...new Set(String(arg == null ? "" : arg).split(",").map((part) => part.trim()).filter(Boolean))];
function matchConnector(name) {
  const normalizedName = String(name == null ? "" : name).toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalizedName ? HOSTED_ROWS.find((id) => normalizedName.startsWith(id)) || null : null;
}
function fingerprintOf(entry, catalog) {
  const match = catalogMatch(entry, catalog);
  return match ? fingerprintKey(match.fingerprint) : null;
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
function ownerOf(item) {
  if (item.kind !== "plugin") return "claude.ai";
  const [plugin = ""] = String(item.plugin).split("@");
  return plugin;
}
var scopeWord = (scope) => scope === "user" ? "global" : scope;
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
function offerRule(inventory, catalog, answers = {}) {
  const byKey = /* @__PURE__ */ new Map();
  for (const registration of (inventory.registrations || []).filter(asked)) if (registration.choice) byKey.set(serverKey(registration), registration.choice);
  for (const server of (inventory.pluginServers || []).filter((candidate) => candidate.rowId)) if (server.choice) byKey.set(pluginServerKey(server), server.choice);
  for (const ownEntry of inventory.lists && inventory.lists.global && inventory.lists.global.own || []) if (typeof ownEntry.connector === "string" && ownEntry.choice) byKey.set(`connector:${ownEntry.connector}`, ownEntry.choice);
  for (const [key, choice] of Object.entries(answers || {})) byKey.set(key, choice);
  const own = /* @__PURE__ */ new Set();
  const add = /* @__PURE__ */ new Map();
  for (const [key, choice] of byKey) {
    const item = itemOf(inventory, key, catalog);
    if (!item) continue;
    if (choice === "own") own.add(item.rowId);
    else if (choice === "add" && item.kind !== "mcp") add.set(item.rowId, ownerOf(item));
  }
  return { own, add };
}
function ownItems(inventory, catalog) {
  return [
    ...(inventory.registrations || []).filter((registration) => asked(registration) && registration.choice === "own").map((registration) => regItem(registration, catalog)),
    ...(inventory.pluginServers || []).filter((server) => server.rowId && server.choice === "own").map((server) => pluginItem(server, catalog)),
    ...(inventory.lists && inventory.lists.global && inventory.lists.global.own || []).flatMap((ownEntry) => typeof ownEntry.connector === "string" && ownEntry.choice === "own" ? [connectorItem(ownEntry.connector, inventory, catalog)] : []).filter((item) => item !== null)
  ];
}
function ownQuestion(item) {
  const isRegistration2 = item.kind === "mcp";
  const options2 = isRegistration2 ? [{ label: "Keep it on its own", choice: "own", description: "nothing in this plugin changes it" }, { label: "Let alfred-tools manage it", choice: "manage", description: "configure, update and fix look after it from now on" }] : [{ label: `Keep it with ${ownerOf(item)}`, choice: "own", description: `install does not offer ${item.label} here` }, { label: "Let install offer alfred-tools' own as well", choice: "add", description: `${item.label} is offered again - ${twoServers(item.label, ownerOf(item))}` }];
  const labeled = options2.map((option, i) => ({ ...option, label: `${option.label}${i === 0 ? RECOMMENDED_SUFFIX : ""}` }));
  const what = isRegistration2 ? `${item.name} (${scopeWord(item.scope)}) is on its own` : item.kind === "plugin" ? `${item.label} is left with the ${ownerOf(item)} plugin` : `${item.label} is left with claude.ai (${item.connector})`;
  return {
    question: { id: `own-${item.key}`, header: "On its own", multiSelect: false, question: `${what}. Who looks after it?`, options: labeled.map(({ label, description }) => ({ label, description })) },
    answers: Object.fromEntries(labeled.map((option) => [option.label, { key: item.key, choice: option.choice }]))
  };
}
var twoServers = (label, owner) => `two servers of ${label} then run - ${owner}'s and this one`;

// scripts/roots/workspace.ts
import fs9 from "node:fs";
import path13 from "node:path";
import { spawnSync as spawnSync3 } from "node:child_process";
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
  const result = spawnSync3("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) return null;
  try {
    return fs9.realpathSync(result.stdout.trim());
  } catch {
    return null;
  }
}

// scripts/cursor/cursor-mcp.ts
import fs10 from "node:fs";

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
var serversIn = (doc) => Object.fromEntries(Object.entries(doc.mcpServers).filter((pair) => isServerEntry(pair[1])));
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
  return { state: "ok", doc, servers: serversIn(doc), lineEnd, text };
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
function stdioKeyed(entry, row, routeId) {
  const route = row && row.routes && routeId ? row.routes[routeId] : null;
  return Boolean(route && route.tokenVar && tokenFields(entry, route).length);
}
function matchesRow(entry, row) {
  const fingerprints = Object.values(row && row.routes || {}).flatMap((route) => route.fingerprints || []);
  const bridge = bridgeParts(entry);
  if (!bridge) return fingerprints.some((fingerprint) => matchesFingerprint(entry, fingerprint));
  const asHttp = { type: "http", url: bridge.template };
  return fingerprints.some((fingerprint) => fingerprint.bridge ? matchesFingerprint(entry, fingerprint) : matchesFingerprint(asHttp, fingerprint));
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
var realOf = (folderPath) => {
  try {
    return fs11.realpathSync.native(folderPath);
  } catch {
    return path14.resolve(folderPath);
  }
};
var fromHere = (inventory, dir) => path14.relative(realOf(inventory.project), dir).split(path14.sep).join("/") || ".";
function installedOf(inventory, rowId) {
  return [
    ...inventory.registrations.filter((registration) => registration.rowId === rowId && !registration.alfredRetired).map((registration) => registration.scope === "inherited" ? { kind: "mcp", name: registration.name, scope: registration.scope, from: registration.from, route: registration.route, entry: registration.entry, approval: registration.approval } : { kind: "mcp", name: registration.name, scope: registration.scope, route: registration.route, entry: registration.entry }),
    ...inventory.plugins.filter((pluginRow) => pluginRow.rowId === rowId && !pluginRow.alfredRetired).map((pluginRow) => ({ kind: "plugin", name: pluginRow.id, scope: pluginRow.scope, version: pluginRow.version, enabled: pluginRow.enabled }))
  ];
}
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

// scripts/plan/hosted-settings-constants.ts
var READ_ONLY_HEADER = "SONARQUBE_READ_ONLY";
var TOOLSETS_HEADER = "SONARQUBE_TOOLSETS";
var TOOLSETS_ASKED = "toolsets";
var SETTINGS_HEADER = "Tools";
var TOOL_OPTIONS = [
  { label: "Read-only", readOnly: true, chosen: false, description: "no write tools - they change issue and hotspot status" },
  { label: "Read and write", readOnly: false, chosen: false, description: "the server's default - its write tools change issue and hotspot status" },
  { label: "Read-only, chosen toolsets", readOnly: true, chosen: true, description: "no write tools, and only the toolsets you list - asked next" },
  { label: "Read and write, chosen toolsets", readOnly: false, chosen: true, description: "the write tools, and only the toolsets you list - asked next" }
];

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
var WALK_CHOICES = ["recommended", "each"];
var LABEL = {
  keep: "Keep ",
  useKey: "Use a key",
  browserNamed: "A browser binary I name",
  browserDefault: "Default for this engine",
  hostSelfManaged: "A self-managed host"
};
var VALUE = { named: "named", change: "change", keep: "keep" };
var SIDE = { keep: "keep", path: "path" };
var BACKTICKED_NAME = /`([^`]+)`/;
var TOOLSET_SEPARATOR = ",";
var EXIT_CODE = { ok: 0, stopped: 1, refused: 2 };
var REFUSAL = {
  folder: "files must sit in one folder tmpdir.ts made",
  notJson: "is not a JSON file this run wrote",
  notObject: "is not a JSON object",
  notInventory: "is not an inventory file: no os or registrations",
  notPicks: "is not a picks file: a list or a map of it is not one",
  notAnswers: "is not an answers file: its picks or change are not a map of picks",
  recordFiles: "--record takes an inventory, picks, answers and step file",
  walkFiles: "the walk takes an inventory, picks and answers file",
  skipPick: "--skip takes a pick",
  stepShape: 'step.json must be { "id": <string>, "answers": <object> }',
  walkDone: "the walk is done: there is no step to record",
  outFolder: "--out must name a file in a folder tmpdir.ts made",
  nothingRecorded: "no answer is recorded yet, so none can be changed"
};
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
function readOnlyDefault(route) {
  const value = route.settings?.find((setting) => setting.header === READ_ONLY_HEADER)?.default;
  if (value === void 0) throw new Error(`a hosted route asked about its tools has no ${READ_ONLY_HEADER} default`);
  return value;
}
function hostedSettingsQuestion(row, route, entry = null) {
  const now = entry ? currentHostedSettings(route, entry) : null;
  const same = (option) => now !== null && now[READ_ONLY_HEADER] === "true" === option.readOnly && now[TOOLSETS_HEADER] !== void 0 === option.chosen;
  const matching = TOOL_OPTIONS.find(same) || TOOL_OPTIONS[0];
  const ordered = [matching, ...TOOL_OPTIONS.filter((option) => option !== matching)];
  const options2 = ordered.map((option, i) => ({
    label: `${option.label}${i === 0 ? RECOMMENDED_SUFFIX : ""}`,
    description: option === matching && now && now[TOOLSETS_HEADER] !== void 0 ? `toolsets: ${now[TOOLSETS_HEADER]}` : option.description,
    answer: (() => {
      const readOnly = option.readOnly ? { [READ_ONLY_HEADER]: readOnlyDefault(route) } : {};
      if (!option.chosen) return readOnly;
      return option === matching && now && now[TOOLSETS_HEADER] !== void 0 ? { ...readOnly, [TOOLSETS_HEADER]: now[TOOLSETS_HEADER] } : { ...readOnly, [TOOLSETS_ASKED]: true };
    })()
  }));
  return {
    question: { id: `${PREFIX2.settings}${row.id}`, header: SETTINGS_HEADER, multiSelect: false, question: `${row.label}'s tools`, options: options2.map(({ label, description }) => ({ label, description })) },
    answers: Object.fromEntries(options2.map((option) => [option.label, option.answer]))
  };
}
function pairNames(entry) {
  const pairs = entry && helperParts(entry.headersHelper)?.pairs || [];
  return pairs.map(splitPair).flatMap((pair) => pair !== null && pair.kind === "name" ? [pair.rest] : []);
}
function optionalNameNotes(rowId, route, names, file) {
  return names.map((name) => {
    const label = (route.helper && route.helper.headers || []).find((header) => header.var === name)?.label;
    return `${rowId}: ${name}${label ? ` (${label})` : ""} is optional - fill it in ${file} to send that header; with no value the header is left out`;
  });
}

// scripts/plan/record-resolve.ts
var plainLabel = (label) => label.endsWith(RECOMMENDED_SUFFIX) ? label.slice(0, -RECOMMENDED_SUFFIX.length) : label;
function typedKind(questionId, label, value, hasValue) {
  if (questionId.startsWith(PREFIX2.root)) return isRecord(value) && value["id"] === VALUE.named ? "text" : null;
  if (questionId.startsWith(PREFIX2.location))
    return !hasValue || isRecord(value) && value["side"] === SIDE.path && value["path"] === void 0 ? "text" : null;
  if (questionId.startsWith(PREFIX2.browser)) return label === LABEL.browserNamed ? "text" : null;
  if (questionId.startsWith(PREFIX2.host)) return label === LABEL.hostSelfManaged ? "text" : null;
  if (questionId.startsWith(PREFIX2.keyName) || questionId.startsWith(PREFIX2.urlName)) return value === VALUE.named ? "text" : null;
  if (questionId.startsWith(PREFIX2.settings)) {
    if (value === VALUE.change) return "pairs";
    return isRecord(value) && value[TOOLSETS_ASKED] === true ? "toolsets" : null;
  }
  return null;
}
var lookup = (map, label) => {
  const key = Object.keys(map).find((candidate) => plainLabel(candidate) === label);
  return key === void 0 ? { found: false, value: void 0 } : { found: true, value: map[key] };
};
function checkTyped(kind, typed) {
  if (kind === "text") return typeof typed === "string" ? { typed } : { shape: "one string" };
  if (kind === "toolsets") {
    if (isTextList(typed)) return { typed: typed.join(TOOLSET_SEPARATOR) };
    return typeof typed === "string" ? { typed } : { shape: "a comma-separated string or a list of strings" };
  }
  return isTextMap(typed) ? { typed } : { shape: "an object of NAME: value strings" };
}
var resolved = (label, index, value, hasValue, typed, other) => ({ label, index, value, hasValue, typed, other });
function resolveOther(question, map, other) {
  if (question.id.startsWith(PREFIX2.name)) return resolved("", -1, void 0, false, void 0, other);
  const takers = question.options.flatMap((option, index) => {
    const label = plainLabel(option.label);
    const { found, value } = lookup(map, label);
    const kind = typedKind(question.id, label, value, found);
    return kind === null ? [] : [{ label, index, value, found, kind }];
  });
  const [taker, ...others] = takers;
  if (taker === void 0 || others.length) return { refused: `${question.id}: 'Other' is not taken here - ask again with one of the options` };
  if (taker.kind === "pairs") return { refused: `${question.id}: 'Other' cannot hold settings - give the label and the typed object` };
  const checked = checkTyped(taker.kind, other);
  if ("shape" in checked) return { refused: `${question.id}: the typed value must be ${checked.shape}` };
  return resolved(taker.label, taker.index, taker.value, taker.found, checked.typed);
}
function resolveAnswer(question, map, answer) {
  if (Array.isArray(answer)) return { refused: `${question.id}: a list is given where one label is expected` };
  const shape2 = typeof answer === "string" ? { label: answer } : answer;
  if (!isRecord(shape2)) return { refused: `${question.id}: an answer is a label, a label with typed, or other` };
  if (typeof shape2["other"] === "string") return resolveOther(question, map, shape2["other"]);
  if (typeof shape2["label"] !== "string") return { refused: `${question.id}: an answer is a label, a label with typed, or other` };
  const label = plainLabel(shape2["label"]);
  const index = question.options.findIndex((option) => plainLabel(option.label) === label);
  if (index < 0) return { refused: `${question.id}: '${label}' is not one of its options` };
  const { found, value } = lookup(map, label);
  const kind = typedKind(question.id, label, value, found);
  const given = "typed" in shape2 && shape2["typed"] !== void 0;
  if (kind === null) return given ? { refused: `${question.id}: '${label}' takes no typed value` } : resolved(label, index, value, found);
  if (!given) return { refused: `${question.id}: '${label}' needs its typed value` };
  const checked = checkTyped(kind, shape2["typed"]);
  if ("shape" in checked) return { refused: `${question.id}: the typed value must be ${checked.shape}` };
  return resolved(label, index, value, found, checked.typed);
}

// scripts/plan/asks-keys.ts
var ROUTE_WORD = { remote: "hosted", local: "local", bridge: "bridge" };
var capitalized = (word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
var HEADER = { code: "Code", docs: "Docs, forges", browsers: "Browsers", machine: "Machine", own: "On their own", roots: "Root folders" };
var SCOPE_TEXT = {
  local: "this project, only you (~/.claude.json, under this project)",
  project: "the .mcp.json in this folder - every session started here or below it; it names this machine's paths, so a teammate's clone points at yours, and never holds a key",
  user: "every project on this machine (Claude Code's user scope, in ~/.claude.json)"
};
var SCOPE_LABEL = { user: "Global", project: "Project", local: "Local" };
var scopeOfLabel = (label) => Object.keys(SCOPE_LABEL).find((scope) => SCOPE_LABEL[scope] === plainLabel(String(label))) || null;
var scopeText = (scope) => SCOPE_TEXT[scope];
var SCOPE_ORDER = ["user", "project", "local"];
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
    for (const { file, names: names2 } of filledNames(readHome ? list : list.filter(inProject)))
      for (const name of names2) if (offeredName(name, variable, word) && !out.some((nameAt) => nameAt.name === name)) out.push({ name, file });
    return out;
  };
  const names = offered(files);
  const found = names.find((nameAt) => nameAt.name === variable) || names[0] || null;
  const old = offered(oldFiles(context.project, context.home)).filter((nameAt) => !names.some((filled) => filled.name === nameAt.name));
  return { variable, kind, scope, files, names, found, old };
}
var nameOptions = (order, descriptions) => order.map((name, i) => {
  const description = descriptions.get(name);
  if (description === void 0) throw new Error(`the name ${name} is offered with no description`);
  return { label: `${name}${i === 0 ? RECOMMENDED_SUFFIX : ""}`, description, value: name };
});
function keyNameQuestion(row, routeId, scope, context, { current = null } = {}) {
  const keyState = keyStateOf(row, routeId, context, null, scope);
  if (!keyState || keyState.kind === "stdio" && scope === "project") return null;
  const descriptions = /* @__PURE__ */ new Map();
  for (const nameAt of keyState.names) descriptions.set(nameAt.name, `filled in ${nameAt.file}`);
  for (const nameAt of keyState.old) descriptions.set(nameAt.name, `in ${nameAt.file} - move it to .mcps-secrets under this name`);
  if (!descriptions.has(keyState.variable)) descriptions.set(keyState.variable, `the catalog's name - add it to ${keyState.files[0]}`);
  const recommended = current || (keyState.found ? keyState.found.name : keyState.variable);
  if (!descriptions.has(recommended)) descriptions.set(recommended, "the name it uses now");
  const others = [...keyState.names, ...keyState.old].map((nameAt) => nameAt.name).filter((name) => name !== keyState.variable && name !== recommended).slice(0, 2);
  const order = [recommended, ...[keyState.variable, ...others].filter((name) => name !== recommended)].slice(0, 3);
  const options2 = [...nameOptions(order, descriptions), { label: "A name you choose", description: "a name of yours, asked next - its value goes in .mcps-secrets, never in the chat", value: "named" }];
  return {
    question: { id: `${PREFIX2.keyName}${row.id}`, header: "Key name", multiSelect: false, question: `Which name holds ${row.label}'s key in .mcps-secrets?`, options: options2.map(({ label, description }) => ({ label, description })) },
    answers: Object.fromEntries(options2.map((option) => [option.label, option.value]))
  };
}
function urlNameQuestions(row, routeId, scope, context, { current = null, keyName = null } = {}) {
  const route = row.routes && row.routes[routeId];
  if (!route || route.runtime !== "bridge" || !context) return [];
  const keyState = keyStateOf(row, routeId, context, null, scope);
  const word = rowWord(row);
  const key = keyName || routeField(route.helper, row.id, "helper").var;
  const catalogNames = new Set((route.urlVars || []).map((urlVar) => urlVar.var));
  const found = [];
  for (const { file, names } of filledNames(keyState ? keyState.files : []))
    for (const name of names)
      if (name.includes(word) && !credentialName(name) && name !== key && !catalogNames.has(name) && !found.some((nameAt) => nameAt.name === name)) found.push({ name, file });
  const taken = /* @__PURE__ */ new Set();
  return (route.urlVars || []).map((urlVar) => {
    const descriptions = /* @__PURE__ */ new Map();
    const free = found.filter((nameAt) => !taken.has(nameAt.name));
    for (const nameAt of free) descriptions.set(nameAt.name, `filled in ${nameAt.file}`);
    const filledHere = keyState ? filledNames(keyState.files).find((filledFile) => filledFile.names.includes(urlVar.var)) : null;
    descriptions.set(urlVar.var, filledHere ? `the catalog's name - filled in ${filledHere.file}` : `the catalog's name - add it to ${keyState ? keyState.files[0] : ".mcps-secrets"}`);
    const recommended = current && current[urlVar.var] || urlVar.var;
    if (!descriptions.has(recommended)) descriptions.set(recommended, "the name it uses now");
    taken.add(recommended);
    const other = free.map((nameAt) => nameAt.name).find((name) => name !== recommended && name !== urlVar.var);
    const order = [recommended, ...[urlVar.var, other].filter((name) => Boolean(name) && name !== recommended)].slice(0, 3);
    const options2 = [...nameOptions(order, descriptions), { label: "A name you choose", description: "a name of yours, asked next - its value goes in .mcps-secrets", value: "named" }];
    return {
      var: urlVar.var,
      question: { id: `${PREFIX2.urlName}${row.id}-${urlVar.var}`, header: "URL name", multiSelect: false, question: `Which name holds ${row.label}'s ${urlVar.label} in .mcps-secrets?`, options: options2.map(({ label, description }) => ({ label, description })) },
      answers: Object.fromEntries(options2.map((option) => [option.label, option.value]))
    };
  });
}
function settingsQuestion(row, routeId, { entry = null } = {}) {
  const hosted = row.routes[routeId];
  if (routeId === "remote" && hosted && hosted.settings) return hostedSettingsQuestion(row, hosted, entry);
  if (routeId === "remote" || !row.routes[routeId] || row.routes[routeId].runtime === "bridge") return null;
  const pairs = settingsOf(row, routeId, entry);
  const keep = pairs.length ? { label: `Keep these settings${RECOMMENDED_SUFFIX}`, description: pairs.map(([settingName, value]) => `${settingName}=${value}`).join(", ") } : { label: `No settings${RECOMMENDED_SUFFIX}`, description: "the server's own defaults" };
  const change = { label: "Change or add a setting", description: "NAME=value pairs, asked next - a key goes in .mcps-secrets, never here" };
  return {
    question: { id: `${PREFIX2.settings}${row.id}`, header: "Settings", multiSelect: false, question: `${row.label}'s settings`, options: [keep, change] },
    answers: { [keep.label]: "keep", [change.label]: "change" }
  };
}
function excludeQuestion(row, routeId, { entry = null, context }) {
  const route = row.routes[routeId];
  const excludeFile = route ? route.excludeFile : void 0;
  if (!excludeFile || hasForeignExclude(entry, excludeFile, context)) return null;
  const off = entry ? excludeArgAt(entry, excludeFile, context) >= 0 : excludeRecommended(context);
  const tools = excludeFile.tools.join(", ");
  const offOption = { label: `Turn off the ${tools} tool`, description: `writes ${excludeFile.file} in the root and passes it with ${excludeFile.flag} - ${tools} runs commands with your full rights` };
  const theirs = !entry && !off;
  const keepOption = { label: "Keep every tool", description: theirs ? `${userConfigPath(context)} is there: turning ${tools} off makes macos-mcp read this plugin's file in its place - adding "${tools}" to its [tools] exclude keeps both` : `${tools} stays on` };
  const [first, second] = off ? [offOption, keepOption] : [keepOption, offOption];
  const firstLabel = `${first.label}${RECOMMENDED_SUFFIX}`;
  return {
    question: { id: `${PREFIX2.exclude}${row.id}`, header: "Shell tool", multiSelect: false, question: `${row.label}: turn off its ${tools} tool?`, options: [{ label: firstLabel, description: first.description }, second] },
    answers: { [firstLabel]: first === offOption, [second.label]: second === offOption }
  };
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

// scripts/plan/required.ts
function required(value, missing) {
  if (value === null || value === void 0) throw new Error(missing);
  return value;
}

// scripts/plan/asks-picks.ts
function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
function packed(items, { id, question, none }) {
  const parts = [];
  for (const group of [...new Set(items.map((item) => item.group))]) {
    const mine = items.filter((item) => item.group === group);
    const partCount = Math.ceil(mine.length / MAX_OPTIONS);
    for (let partIndex = 0, at2 = 0; partIndex < partCount; partIndex++) {
      const size = Math.floor(mine.length / partCount) + (partIndex < mine.length % partCount ? 1 : 0);
      parts.push(mine.slice(at2, at2 + size));
      at2 += size;
    }
  }
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part || part.length !== 1) continue;
    const previous = parts[i - 1];
    const next = parts[i + 1];
    if (previous && previous.length < MAX_OPTIONS) {
      previous.push(...part);
      parts.splice(i, 1);
      i--;
    } else if (next && next.length < MAX_OPTIONS) {
      next.unshift(...part);
      parts.splice(i, 1);
      i--;
    } else if (previous) part.unshift(...previous.splice(-1, 1));
    else if (next) part.push(...next.splice(0, 1));
  }
  const out = parts.map((part, partIndex) => {
    const [lead] = part;
    const one = lead && part.every((item) => item.group === lead.group) ? lead.group : null;
    const options2 = part.map((item) => ({ label: item.label, description: item.description }));
    if (options2.length === 1) options2.push({ label: "None of these", description: none });
    return {
      id: `${id}-${partIndex}`,
      header: one ? required(HEADER[one.id], `the group '${one.id}' has no header`) : "Tools",
      multiSelect: true,
      question: one ? `${one.label}: ${question}` : capitalized(question),
      options: options2
    };
  });
  return chunk(out, MAX_QUESTIONS);
}
var offeredForInstall = (row, inventory) => {
  const at2 = installedOf(inventory, row.id).map((installed) => installed.scope);
  return !at2.includes("local") && !at2.includes("project");
};
function alsoProvided(inventory, rowId, connectors) {
  const out = [];
  if ((connectors || []).some((connector) => matchConnector(connector) === rowId)) out.push({ owner: "claude.ai", tag: "also connected through claude.ai" });
  const enabled = new Set((inventory.plugins || []).filter((plugin) => plugin.enabledHere ?? plugin.enabled).map((plugin) => plugin.id));
  const owners = (inventory.pluginServers || []).filter((server) => server.rowId === rowId && enabled.has(server.plugin)).map((server) => server.plugin.split("@", 1).join(""));
  for (const owner of new Set(owners)) out.push({ owner, tag: `also provided by the ${owner} plugin` });
  return out;
}
function pickQuestions(inventory, catalog, existing = {}, connectors = null) {
  const rule = offerRule(inventory, catalog, existing);
  const items = [];
  for (const group of catalog.groups)
    for (const row of catalog.tools.filter((toolRow) => toolRow.group === group.id && toolRow.os.includes(inventory.os) && offeredForInstall(toolRow, inventory) && !rule.own.has(toolRow.id))) {
      const have = installedOf(inventory, row.id);
      const inherited = have.filter((installed) => installed.scope === "inherited");
      const user = have.filter((installed) => installed.scope === "user");
      const fromOf = (installed) => fromHere(inventory, required(installed.from, `${installed.name}: an inherited server is read with its folder`));
      const tags = inherited.map((installed) => `inherited from ${fromOf(installed)} as ${installed.name}, ${installed.approval}`);
      if (user.length) tags.push(row.kind === "mcp" ? `installed for every project as ${user.map((installed) => installed.name).join(", ")}` : "installed for every project");
      if (row.kind === "mcp") tags.push(...alsoProvided(inventory, row.id, connectors).map((provider) => provider.tag));
      const stays = [...user.length ? ["the one for every project"] : [], ...inherited.map((installed) => `the one inherited from ${fromOf(installed)}`)];
      const keep = `${stays.join(" and ")} ${stays.length > 1 ? "stay" : "stays"}${user.length ? "" : stays.length > 1 ? " in their folders" : " in its folder"}`;
      const others = row.id === "windows-control" ? otherWindowsMcp(inventory, row.name) : [];
      const added = rule.add.get(row.id);
      const warn = `${others.length ? `; another windows-mcp already starts here (${others.join(", ")}) - keep one per desktop` : ""}${added !== void 0 ? `; ${twoServers(row.label, added)}` : ""}`;
      items.push({ group, label: `${row.label}${tags.length ? ` (${tags.join("; ")})` : ""}`, description: `${have.length ? `adds this project's own copy; ${keep} - ${row.summary}` : row.summary}${warn}` });
    }
  return packed(items, { id: "pick", question: "which tools do you want to install?", none: "install nothing" });
}
var leftAlone = (inventory, installed) => installed.kind === "mcp" && inventory.registrations.some((registration) => registration.name === installed.name && registration.scope === installed.scope && registration.choice === "own");
function installedItems(inventory, catalog, describe) {
  const items = [];
  for (const group of catalog.groups)
    for (const row of catalog.tools.filter((toolRow) => toolRow.group === group.id))
      for (const installed of installedOf(inventory, row.id).filter((candidate) => candidate.scope !== "inherited" && !leftAlone(inventory, candidate)))
        items.push({ group, row, target: installed, label: `${installed.name} (${row.label}, ${installed.scope})`, description: describe(row, installed) });
  return items;
}
function rootInUse(inventory, family, context = {}) {
  if (inventory.roots && Object.hasOwn(inventory.roots, family)) return inventory.roots[family] || null;
  return inUse(inventory, family, { project: inventory.project, platform: inventory.os, home: context.home || homeDir(process.env), exists: context.exists, catalog: context.catalog });
}
var ROOT_LABEL = { project: "Project root folder", global: "Global root folder" };
var ROOT_MOVES = { project: "this project's keys, key helper and tool data", global: "the keys, key helper and tool data for every project" };

// scripts/plan/asks-tool.ts
import path15 from "node:path";

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
var isInventoryFile = (value) => typeof value === "object" && value !== null && "os" in value && typeof value.os === "string" && "registrations" in value && Array.isArray(value.registrations);

// scripts/plan/asks-tool.ts
function changeQuestions(inventory, catalog, context = {}) {
  const describe = (row, installed) => {
    const route = installed.route ?? null;
    const pin = installed.entry ? pinOf(row, route, installed.entry) : null;
    return `${route !== null && ROUTE_WORD[route] || installed.route} route${pin ? `, pin ${pin}` : ""}`;
  };
  const items = installedItems(inventory, catalog, describe);
  const group = { id: "own", label: "On their own" };
  for (const ownItem of ownItems(inventory, catalog)) {
    const label = ownItem.kind === "mcp" ? `${ownItem.name} (${ownItem.label}, ${ownItem.scope}) - on its own` : ownItem.kind === "plugin" ? `${ownItem.server} (${ownItem.label}, from ${ownerOf(ownItem)}) - on its own` : `${ownItem.connector} (${ownItem.label}, claude.ai) - on its own`;
    const description = ownItem.kind === "mcp" ? "left on its own at install - pick it to keep it so or let alfred-tools manage it" : `left with ${ownerOf(ownItem)} - pick it to keep it so or let install offer alfred-tools' own beside it`;
    items.push({ group, label, description, target: { kind: "own", key: ownItem.key } });
  }
  const rootGroup = { id: "roots", label: "Root folders" };
  for (const family of FAMILIES) {
    const used = rootInUse(inventory, family, { ...context, catalog });
    if (used) items.push({ group: rootGroup, label: ROOT_LABEL[family], description: `${used.path} - pick it to move ${ROOT_MOVES[family]} to another folder`, target: { kind: "root", key: `root:${family}` } });
  }
  return {
    calls: packed(items, { id: "change", question: "which do you want to change?", none: "change nothing" }),
    keys: Object.fromEntries(items.map((item) => {
      const target = required(item.target, `${item.label}: a configure pick is built with its target`);
      return [item.label, target.key !== void 0 ? target.key : keyOf(target.kind, target.name, target.scope)];
    }))
  };
}
function routeQuestion(row, current = null) {
  const ids = Object.keys(row.routes);
  if (ids.length < 2) return null;
  const first = current || row.recommendedRoute;
  const order = [first, ...ids.filter((routeId) => routeId !== first)];
  const text = { remote: "run by the vendor - no local runtime needed", local: "runs on this machine", bridge: "the hosted server at a URL filled from .mcps-secrets each start - a small proxy runs here through npx" };
  return {
    id: `${PREFIX2.route}${row.id}`,
    header: "Route",
    multiSelect: false,
    question: ids.length > 2 ? `${row.label}: which route?` : `${row.label}: hosted or local?`,
    options: order.map((routeId, i) => ({ label: `${capitalized(required(ROUTE_WORD[routeId], `the route '${routeId}' has no word in the asks`))}${i === 0 ? RECOMMENDED_SUFFIX : ""}`, description: required(text[routeId], `the route '${routeId}' has no description in the asks`) }))
  };
}
function scopeOrder(row, _inventory, { route, current = null, copyOf = [], context = null } = {}) {
  const routeId = route || current && current.route || row.recommendedRoute;
  const all = scopesFor(row, routeId, context);
  const stranded = strandedScope(row, routeId, current, context);
  const recommended = current && !stranded ? current.scope : recommendedScope(row, routeId);
  const free = all.filter((scope) => !copyOf.some((copy) => copy.scope === scope));
  const scopes = free.length ? free : all;
  const order = [...recommended === void 0 ? [] : [recommended], ...SCOPE_ORDER.filter((scope) => scope !== recommended)].filter((scope) => scopes.includes(scope));
  return stranded ? [...order, stranded] : order;
}
var strandedScope = (row, routeId, current, context) => current && current.scope && !scopesFor(row, routeId, context).includes(current.scope) ? current.scope : null;
var STRANDED_TEXT = "the scope it has now - it reads its key from the environment Claude Code starts with; a keyed local route is not offered here any more, as the committed .mcp.json carries no key";
var CHILD_NO_KEY = PARENT_HELPER_IN_CHILD ? "" : `; a session started in a child folder connects without the key - Claude Code does not run a parent folder's helper there; ${CHILD_FOLDER_REMEDY}`;
var hostedKeyed = (row, routeId) => Boolean(row.routes && row.routes[routeId] && row.routes[routeId].helper && row.routes[routeId].runtime !== "bridge");
function scopeQuestion(row, inventory, { route, current = null, copyOf = [], context = null } = {}) {
  const routeId = route || current && current.route || row.recommendedRoute;
  const order = scopeOrder(row, inventory, { route: routeId, current, copyOf, context });
  if (order.length < 2) return null;
  return {
    id: `${PREFIX2.scope}${row.id}`,
    header: "Scope",
    multiSelect: false,
    question: current ? `${row.label}: which scope? Another one moves '${current.name || row.label}' there; /alfred-tools:install adds a second copy instead.` : `${row.label}: which scope?`,
    options: order.slice(0, MAX_OPTIONS).map((scope, i) => ({ label: `${SCOPE_LABEL[scope]}${i === 0 ? RECOMMENDED_SUFFIX : ""}`, description: scope === strandedScope(row, routeId, current, context) ? STRANDED_TEXT : `${scopeText(scope)}${scope === "project" && hostedKeyed(row, routeId) ? CHILD_NO_KEY : ""}` }))
  };
}
var perProjectName = (rowName, project) => `${(project ? path15.basename(project).replace(NAME_UNSAFE_RUN, "-").replace(EDGE_DASHES, "") : "") || PROJECT_NAME_FALLBACK}-${rowName}`.slice(0, MAX_NAME_LENGTH);
function nameFor(row, name, current, context) {
  if (!name || name === "keep") return current ? required(current.name, `${row.id}: a registration to configure is read with its name`) : row.name;
  return name === "prefixed" ? perProjectName(row.name, context?.project) : name;
}
function nameQuestion(row, inventory, { current = null, copyOf = [], context = null } = {}) {
  const original = row.name;
  const shadows = copyOf.find((copy) => copy.name === original);
  const options2 = current && current.name !== original ? [{ label: `${LABEL.keep}\`${current.name}\`${RECOMMENDED_SUFFIX}`, description: "the name it has now" }, { label: `Use \`${original}\``, description: "the original name" }] : [{ label: `${LABEL.keep}\`${original}\`${RECOMMENDED_SUFFIX}`, description: shadows ? `the original name; in this project it is used instead of ${shadows.scope === "inherited" ? `the one inherited from ${fromHere(inventory, required(shadows.from, `${shadows.name}: an inherited server is read with its folder`))}` : "the copy for every project"}` : "the original name" }, { label: `Use \`${perProjectName(original, context?.project)}\``, description: "a per-project name" }];
  return { id: `${PREFIX2.name}${row.id}`, header: "Name", multiSelect: false, question: `${row.label}: registration name?`, options: options2 };
}

// scripts/plan/asks-other-constants.ts
var DEFAULT_HOST_DESCRIPTION = "the hosted service";
var REWIND_MAX_OPTIONS = 4;
var REWIND_ANOTHER = "another";

// scripts/plan/files/shapes.ts
var PICKS_LISTS = ["rows", "targets", "done", "clients", "skipped"];
var PICKS_MAPS = ["routes", "scopes", "names", "roots", "existing", "tokens", "recorded"];
var isPicksFile = (value) => isRecord(value) && PICKS_LISTS.every((field) => value[field] === void 0 || isTextList(value[field])) && PICKS_MAPS.every((field) => value[field] === void 0 || isRecord(value[field])) && (value["walk"] === void 0 || typeof value["walk"] === "string");
function isAnswersFile(value) {
  const isPick = (pick) => pick === null || isRecord(pick) && [pick["row"], pick["route"]].every((field) => field === void 0 || typeof field === "string");
  const isPickMap = (map) => map === void 0 || isRecord(map) && Object.values(map).every(isPick);
  return isRecord(value) && isPickMap(value["picks"]) && isPickMap(value["change"]);
}
var isStepFile = (value) => typeof value["id"] === "string" && isRecord(value["answers"]);
var isLocationAnswer = (value) => isRecord(value) && typeof value["side"] === "string" && (value["path"] === void 0 || typeof value["path"] === "string");
var isRegistration = (item) => "entry" in item;

// scripts/plan/record.ts
var KEYED = [PREFIX2.route, PREFIX2.scope, PREFIX2.name, PREFIX2.location, PREFIX2.browser, PREFIX2.host, PREFIX2.token, PREFIX2.keyName, PREFIX2.urlName, PREFIX2.settings, PREFIX2.clients, PREFIX2.exclude];
var refuse = (refused) => ({ refused });
var sameSet = (left, right) => left.length === right.length && left.every((item) => right.includes(item));
function put(root2, path19, value) {
  const last = path19.at(-1);
  if (!isRecord(root2) || last === void 0) return;
  let at2 = root2;
  for (const segment of path19.slice(0, -1)) {
    const next = at2[segment];
    if (isRecord(next)) {
      at2 = next;
      continue;
    }
    const made = {};
    at2[segment] = made;
    at2 = made;
  }
  at2[last] = value;
}
function putPick(run, path19, value) {
  put(run.picks, path19, value);
  run.wrotePicks.push(path19);
}
function putAnswer(run, path19, value) {
  put(run.answers, path19, value);
  run.wroteAnswers.push(path19);
}
function putEntry(run, field, value, changes = true) {
  if (run.skipped || run.key === null) return;
  if (!run.configure) {
    putAnswer(run, ["picks", run.key, ...field], value);
    return;
  }
  if (!changes) return;
  if (run.answers.change?.[run.key] == null) putAnswer(run, ["change", run.key], { row: run.target?.row });
  putAnswer(run, ["change", run.key, ...field], value);
}
function putTop(run, path19, value, changes = true) {
  if (run.configure && !changes) return;
  putAnswer(run, path19, value);
}
function putKeyed(run, path19, value, changes = true) {
  if (run.skipped) return;
  putTop(run, path19, value, changes);
}
var routeOfLabel = (label) => Object.entries(ROUTE_WORD).find(([, word]) => capitalized(word) === label)?.[0];
function mapRoute(run, key, resolved2) {
  const routeId = routeOfLabel(resolved2.label);
  if (routeId === void 0) return refuse(`'${resolved2.label}' is not a route`);
  putPick(run, ["routes", key], routeId);
  putEntry(run, ["route"], routeId, routeId !== run.target?.current?.route);
}
function mapScope(run, key, resolved2) {
  const scope = scopeOfLabel(resolved2.label);
  if (scope === null) return refuse(`'${resolved2.label}' is not a scope`);
  putPick(run, ["scopes", key], scope);
  putEntry(run, ["scope"], scope, scope !== run.target?.current?.scope);
}
function mapName(run, key, resolved2) {
  const name = resolved2.other ?? (resolved2.label.startsWith(LABEL.keep) ? VALUE.keep : BACKTICKED_NAME.exec(resolved2.label)?.[1]);
  if (name === void 0) return refuse(`'${resolved2.label}' names no registration name`);
  putPick(run, ["names", key], name);
  putEntry(run, ["name"], name, name !== VALUE.keep);
}
function mapLocation(run, resolved2) {
  const typed = typeof resolved2.typed === "string" ? resolved2.typed : void 0;
  const value = typed === void 0 ? resolved2.value : { side: SIDE.path, path: typed };
  if (!isLocationAnswer(value)) return refuse(`'${resolved2.label}' has no location entry`);
  putEntry(run, ["location"], structuredClone(value), value.side !== SIDE.keep);
}
function mapBrowser(run, resolved2) {
  if (resolved2.label === LABEL.browserNamed) putEntry(run, ["executablePath"], resolved2.typed);
  else if (resolved2.label === LABEL.browserDefault && run.configure && resolved2.index !== 0) putEntry(run, ["executablePath"], "");
}
function mapHost(run, question, resolved2) {
  if (resolved2.label.startsWith(LABEL.keep)) return;
  const option = question.options[resolved2.index];
  if (!option) return refuse(`'${resolved2.label}' is not one of its options`);
  const described = option.description;
  const host = resolved2.label === LABEL.hostSelfManaged ? resolved2.typed : described === DEFAULT_HOST_DESCRIPTION ? resolved2.label : described;
  putEntry(run, ["params"], { host }, resolved2.index !== 0);
}
function mapToken(run, key, resolved2) {
  const token = resolved2.label.startsWith(LABEL.useKey);
  putPick(run, ["tokens", key], token);
  putEntry(run, ["token"], token, resolved2.index !== 0);
}
function mapKeyName(run, key, resolved2) {
  const name = typeof resolved2.typed === "string" ? resolved2.typed : resolved2.value;
  if (typeof name !== "string") return refuse(`'${resolved2.label}' has no key name`);
  putKeyed(run, ["keyNames", key], name, resolved2.index !== 0);
}
function mapUrlName(run, key, question, resolved2) {
  const name = typeof resolved2.typed === "string" ? resolved2.typed : resolved2.value;
  const urlVar = Object.entries(run.built.urlNames?.[key] ?? {}).find(([, asked2]) => asked2.question.id === question.id)?.[0];
  if (typeof name !== "string" || urlVar === void 0) return refuse(`'${resolved2.label}' has no URL name`);
  putKeyed(run, ["urlNames", key, urlVar], name, resolved2.index !== 0);
}
function mapSettings(run, key, resolved2) {
  const { value } = resolved2;
  if (value === VALUE.keep) return;
  if (value === VALUE.change) {
    putKeyed(run, ["settings", key], resolved2.typed);
    return;
  }
  if (!isRecord(value)) return refuse(`'${resolved2.label}' has no settings entry`);
  const { [TOOLSETS_ASKED]: asked2, ...fixed } = value;
  const settings = asked2 === true ? { ...fixed, [TOOLSETS_HEADER]: resolved2.typed } : fixed;
  putKeyed(run, ["settings", key], settings, resolved2.index !== 0);
}
function mapRoot(run, resolved2) {
  const { value } = resolved2;
  const family = isRecord(value) ? value["family"] : void 0;
  if (!isRecord(value) || family !== "project" && family !== "global" || typeof value["id"] !== "string") return refuse(`'${resolved2.label}' has no root entry`);
  const answer = value["id"] === VALUE.named ? { id: VALUE.named, path: resolved2.typed } : { id: value["id"] };
  const changes = resolved2.index !== 0;
  putPick(run, ["roots", family], answer);
  putTop(run, ["roots", family], answer, changes);
  if (run.configure && changes && !run.answers.rootChange?.includes(family)) {
    run.answers.rootChange = [...run.answers.rootChange ?? [], family];
    run.wroteAnswers.push(["rootChange", family]);
  }
}
function mapOwn(run, resolved2) {
  const { value } = resolved2;
  if (!isRecord(value) || typeof value["key"] !== "string" || typeof value["choice"] !== "string") return refuse(`'${resolved2.label}' has no looked-after entry`);
  putPick(run, ["existing", value["key"]], value["choice"]);
  putTop(run, ["existing", value["key"]], value["choice"]);
}
function mapApps(run, key, resolved2) {
  if (!isTextList(resolved2.value)) return refuse(`'${resolved2.label}' has no list of apps`);
  if (key === null) {
    putPick(run, ["clients"], resolved2.value);
    putTop(run, ["clients"], resolved2.value);
    return;
  }
  putEntry(run, ["clients"], resolved2.value, !sameSet(resolved2.value, run.target?.current?.clients ?? []));
}
function mapExclude(run, resolved2) {
  if (typeof resolved2.value !== "boolean") return refuse(`'${resolved2.label}' has no Shell answer`);
  putEntry(run, ["exclude"], resolved2.value, resolved2.index !== 0);
}
function mapOne(run, question, resolved2) {
  const { id } = question;
  const key = run.key;
  if (id === WALK_QUESTION.settings) {
    if (typeof resolved2.value !== "string") return refuse(`'${resolved2.label}' has no walk entry`);
    putPick(run, ["walk"], resolved2.value);
    return;
  }
  if (id === WALK_QUESTION.clients) return mapApps(run, null, resolved2);
  if (id.startsWith(PREFIX2.root)) return mapRoot(run, resolved2);
  if (id.startsWith(PREFIX2.own)) return mapOwn(run, resolved2);
  if (!KEYED.some((prefix) => id.startsWith(prefix))) return refuse("no mapping for this question");
  if (key === null) return refuse("the step belongs to no tool");
  if (id.startsWith(PREFIX2.route)) return mapRoute(run, key, resolved2);
  if (id.startsWith(PREFIX2.scope)) return mapScope(run, key, resolved2);
  if (id.startsWith(PREFIX2.name)) return mapName(run, key, resolved2);
  if (id.startsWith(PREFIX2.location)) return mapLocation(run, resolved2);
  if (id.startsWith(PREFIX2.browser)) return mapBrowser(run, resolved2);
  if (id.startsWith(PREFIX2.host)) return mapHost(run, question, resolved2);
  if (id.startsWith(PREFIX2.token)) return mapToken(run, key, resolved2);
  if (id.startsWith(PREFIX2.keyName)) return mapKeyName(run, key, resolved2);
  if (id.startsWith(PREFIX2.urlName)) return mapUrlName(run, key, question, resolved2);
  if (id.startsWith(PREFIX2.settings)) return mapSettings(run, key, resolved2);
  if (id.startsWith(PREFIX2.exclude)) return mapExclude(run, resolved2);
  return mapApps(run, key, resolved2);
}
function seedRows(run) {
  const skipped = run.picks.skipped ?? [];
  for (const row of run.picks.rows ?? []) {
    if (skipped.includes(row) || run.answers.picks?.[row] != null) continue;
    run.answers.picks = { ...run.answers.picks, [row]: {} };
  }
}
function recordStep({ step, built, picks, answers, chosen }) {
  if (chosen.id !== step.id) return refuse(`step.json is for '${chosen.id}', the step to answer is '${step.id}'`);
  const call = step.call ?? [];
  const given = chosen.answers;
  const missing = call.find((question) => !Object.hasOwn(given, question.id));
  if (missing) return refuse(`${missing.id}: no answer for this question`);
  const stranger = Object.keys(given).find((id) => !call.some((question) => question.id === id));
  if (stranger !== void 0) return refuse(`${stranger}: not a question of this step`);
  const key = step.tool ?? null;
  const configure = key !== null && (picks.targets ?? []).includes(key);
  const target = configure ? built.targets[key] : void 0;
  if (configure && !target) return refuse(`${key}: no questions are built for this target`);
  const run = { step, built, key, configure, skipped: key !== null && (picks.skipped ?? []).includes(key), target, picks: structuredClone(picks), answers: structuredClone(answers), wrotePicks: [], wroteAnswers: [] };
  for (const question of call) {
    const map = step.answers?.[question.id];
    const resolved2 = resolveAnswer(question, isRecord(map) ? map : {}, given[question.id]);
    if ("refused" in resolved2) return resolved2;
    const refused = mapOne(run, question, resolved2);
    if (refused) return refuse(`${question.id}: ${refused.refused}`);
  }
  if (step.set) putEntry(run, ["location"], structuredClone(step.set.location), step.set.location.side !== SIDE.keep);
  run.picks.done = run.picks.done?.includes(step.id) ? run.picks.done : [...run.picks.done ?? [], step.id];
  run.picks.recorded = { ...run.picks.recorded, [step.id]: { tool: key, picks: run.wrotePicks, answers: run.wroteAnswers } };
  seedRows(run);
  return { picks: run.picks, answers: run.answers };
}
var pickOfStep = (id, step) => step.tool ?? (id === WALK_QUESTION.clients || id === WALK_QUESTION.settings ? id : null);
function recordedPicks(picks) {
  const found = [];
  for (const [id, step] of Object.entries(picks.recorded ?? {})) {
    const pick = pickOfStep(id, step);
    if (pick === null) continue;
    const at2 = found.indexOf(pick);
    if (at2 >= 0) found.splice(at2, 1);
    found.push(pick);
  }
  return found.reverse();
}
function removePath(root2, path19) {
  const walk = (segments) => segments.reduce((at2, segment) => isRecord(at2) ? at2[segment] : void 0, root2);
  const parentPath = path19.slice(0, -1);
  const last = path19.at(-1);
  if (last === void 0) return;
  const parent = walk(parentPath);
  if (isRecord(parent)) {
    delete parent[last];
    return;
  }
  if (!Array.isArray(parent)) return;
  const holder = walk(parentPath.slice(0, -1));
  const holderKey = parentPath.at(-1);
  const kept = parent.filter((item) => item !== last);
  if (kept.length === 0 && isRecord(holder) && holderKey !== void 0) delete holder[holderKey];
  else parent.splice(0, parent.length, ...kept);
}
function rewindPick(picks, answers, pick) {
  const recorded = Object.entries(picks.recorded ?? {});
  const steps = recorded.filter(([id, step]) => pick === WALK_QUESTION.settings || (pick === WALK_QUESTION.clients ? id === pick : step.tool === pick));
  const skippedOnly = steps.length === 0 && picks.skipped?.includes(pick) === true;
  if (steps.length === 0 && !skippedOnly) return refuse(`'${pick}' has no recorded answer to change`);
  const next = { picks: structuredClone(picks), answers: structuredClone(answers) };
  for (const [id, step] of steps) {
    step.picks.forEach((path19) => removePath(next.picks, path19));
    step.answers.forEach((path19) => removePath(next.answers, path19));
    if (next.picks.recorded) delete next.picks.recorded[id];
  }
  const dropped = new Set(steps.map(([id]) => id));
  next.picks.done = (next.picks.done ?? []).filter((id) => !dropped.has(id));
  if (pick === WALK_QUESTION.settings) next.picks.skipped = [];
  else if (next.picks.skipped?.includes(pick)) next.picks.skipped = next.picks.skipped.filter((skipped) => skipped !== pick);
  return next;
}
function resolveSkipTarget(picks, named, rowOf2) {
  if ((picks.rows ?? []).includes(named) || (picks.targets ?? []).includes(named)) return { pick: named };
  const sharing = (picks.targets ?? []).filter((target) => rowOf2(target) === named);
  const [only] = sharing;
  if (sharing.length === 1 && only !== void 0) return { pick: only };
  if (sharing.length > 1) return refuse(`'${named}' names ${sharing.length} targets (${sharing.join(", ")}): skip one by its key`);
  return refuse(`'${named}' is not a pick of this run`);
}
function skipPick(picks, answers, pick) {
  if (!(picks.rows ?? []).includes(pick) && !(picks.targets ?? []).includes(pick)) return refuse(`'${pick}' is not a pick of this run`);
  const next = { picks: structuredClone(picks), answers: structuredClone(answers) };
  if (next.answers.picks) delete next.answers.picks[pick];
  if (next.answers.change) delete next.answers.change[pick];
  if (!next.picks.skipped?.includes(pick)) next.picks.skipped = [...next.picks.skipped ?? [], pick];
  return next;
}

// scripts/plan/asks-location.ts
var SIDE_LABEL = {
  project: "The project root's folder",
  account: "The global root's folder",
  "alfred-data": ".alfred in this project",
  alfred: "Carry over alfred-code 2.x data",
  keep: "The folder it uses now"
};
var SIDE_TAIL = {
  project: "this project's own",
  account: "one folder for every project on this machine",
  "alfred-data": "kept out of git by alfred-code; deleting .alfred erases this data",
  alfred: "carries over the data alfred-code 2.x left there; the folder is alfred-code's, so deleting it erases this tool's data"
};
var MEMORY_TAIL = { project: "this project's own memory", account: "one memory for every project on this machine" };
var SERENA_PER_PROJECT = "its language servers (about 327MB) download once per project";
function placeText(root2, context) {
  return formatRoot(root2, "local", context).value;
}
function locationQuestion(row, inventory, { scope, name = null, current = null, copyOf: _copyOf = [], context }) {
  if (!context.roots) context = { ...context, roots: resolveRoots(inventory, null, context).roots };
  const locations = locationsOf(row);
  const folder = name || (current ? current.name : row.name);
  if (folder === void 0) throw new Error(`${row.id}: a registration to configure is read with its name`);
  const serenaWin = Boolean(locations.windowsAbsolute && context.platform === "win32");
  const winValid = (root2) => !serenaWin || validWindowsSerenaHome(formatRoot(root2, "local", context).value);
  const natural = recommendedSide(row, scope, context);
  const places = [];
  const own = scope === "user" ? null : { side: "project", root: otherPlace(row, folder, "project", context) };
  const shared = { side: "account", root: otherPlace(row, folder, "account", context) };
  if (own === null) places.push(shared);
  else {
    places.push(own);
    if (locations.defaultSide === "account" || natural === "account") places.push(shared);
  }
  const folderOf = (place) => {
    if (!place.root) throw new Error(`${row.id}: the place '${place.side}' names no folder`);
    return place.root;
  };
  const usable = places.filter((place) => winValid(folderOf(place)));
  if (serenaWin && usable.length < places.length) {
    const profile = serenaWindowsHome(context);
    if (profile.root !== void 0) usable.push({ side: "default", root: profile.root, label: "Your profile's .serena", description: `${profile.root.path} - the root's path has a space, which serena's home cannot hold; one folder for every project on this machine` });
    else {
      const free = serenaSpaceFree(context);
      usable.push({ side: "default", root: free, label: "A space-free folder", answer: { side: "path", path: free.path }, description: `${free.path} - the root's path and your profile path ${context.home} have a space, which serena's home cannot hold; one folder for every project on this machine` });
    }
  }
  const old = !current && !serenaWin ? alfredRoot(row, context) : null;
  if (old) usable.push({ side: "alfred", root: old });
  let keep = null;
  if (current && current.rootStr) {
    keep = { side: "keep", root: logicalRoot(current.rootStr, context) };
  }
  const at2 = (place) => formatRoot(folderOf(place), scope, context).value;
  const kept = keep;
  const listed = kept ? [kept, ...usable.filter((place) => at2(place) !== at2(kept))] : usable;
  if (serenaWin && listed.some((place) => place.side === "default")) listed.push({ side: "path", label: "Another space-free folder", description: "an absolute folder without spaces, asked next" });
  const recommendedPlace = keep ? "keep" : natural;
  const first = listed.find((place) => place.side === recommendedPlace) || listed[0];
  const order = [first, ...listed.filter((place) => place !== first)].filter((place) => place !== void 0).slice(0, MAX_OPTIONS);
  const describe = (place) => {
    if (place.description) return place.description;
    const text = placeText(folderOf(place), context);
    if (place.side === "keep") return text;
    const base = row.id === "memory" && MEMORY_TAIL[place.side] ? MEMORY_TAIL[place.side] : SIDE_TAIL[place.side];
    const tail = row.id === "serena" && place.side === "project" ? `${base}; ${SERENA_PER_PROJECT}` : base;
    return `${text} - ${tail}`;
  };
  const labelled = order.map((place, i) => ({ place, label: `${place.label || SIDE_LABEL[place.side]}${i === 0 ? RECOMMENDED_SUFFIX : ""}`, description: describe(place) }));
  const options2 = labelled.map(({ label, description }) => ({ label, description }));
  const answers = Object.fromEntries(labelled.filter(({ place }) => place.side !== "path").map(({ label, place }) => [label, place.answer || { side: place.side }]));
  if (order.length < 2 && first && first.side !== "path") return { question: null, answers: {}, only: first.answer || { side: first.side } };
  if (!order.length) return { question: null, answers: {}, only: null };
  return { question: { id: `${PREFIX2.location}${row.id}`, header: "Location", multiSelect: false, question: `${row.label}: where does its data live?`, options: options2 }, answers, only: null };
}

// scripts/plan/asks-other.ts
function toolAsk(row, inventory, { route, scope = null, name = null, current = null, context = null, catalog: _catalog, copyOf = [] } = {}) {
  const routeId = route || current && current.route || row.recommendedRoute;
  const scopeAsk = scopeQuestion(row, inventory, { route: routeId, current, copyOf, context });
  const nameAsk = nameQuestion(row, inventory, { current, copyOf, context });
  const located = Boolean(row.locations && context);
  const asked2 = [scopeAsk, nameAsk].filter((ask) => ask !== null);
  const questions = located ? [] : [...asked2];
  let answers = {};
  let only = null;
  const at2 = context ? scope || scopeOrder(row, inventory, { route: routeId, current, copyOf, context })[0] || current && current.scope : scope;
  if (located && context) {
    const locationAsk = locationQuestion(row, inventory, { scope: required(at2, `${row.id}: no scope to build its location question for`), name: nameFor(row, name, current, context), current, copyOf, context });
    if (locationAsk.question) questions.push(locationAsk.question);
    else only = locationAsk.only;
    answers = locationAsk.answers;
  }
  const first = (options2) => options2.map((option, i) => ({ ...option, label: `${option.label}${i === 0 ? RECOMMENDED_SUFFIX : ""}` }));
  const sameRoute = current && current.route === routeId;
  const catalogRoute = routeNamed(row, routeId);
  if (catalogRoute.optionalArgs && catalogRoute.optionalArgs.executablePath) {
    const nowPath = sameRoute && current ? current.executablePath : void 0;
    const has = Boolean(nowPath);
    const named = { label: LABEL.browserNamed, description: "sets --executable-path to the binary you name, asked next" };
    const engine = { label: LABEL.browserDefault, description: has ? "drops --executable-path" : row.id.endsWith("chrome") || row.id.endsWith("msedge") ? "the branded browser installed on this machine" : "Playwright's own build" };
    questions.push({
      id: `${PREFIX2.browser}${row.id}`,
      header: "Browser",
      multiSelect: false,
      question: `${row.label}: which browser binary?`,
      options: nowPath ? first([{ label: `${LABEL.keep}\`${nowPath}\``, description: "the binary it uses now" }, engine]) : first([engine, named])
    });
  }
  const [param] = row.params || [];
  if (param && param.choices) {
    const choices = param.choices;
    const inUse2 = choices.findIndex((choice) => current && choice.value === current.host);
    const chosen = choices[inUse2];
    const ordered = inUse2 > 0 && chosen ? [chosen, ...choices.filter((_choice, i) => i !== inUse2)] : choices;
    questions.push({
      id: `${PREFIX2.host}${row.id}`,
      header: "Host",
      multiSelect: false,
      question: `${row.label}: which ${param.label}?`,
      options: first(ordered.map((choice) => ({ label: choice.label, description: choice.value })))
    });
  } else if (param) {
    const host = current && current.host && current.host !== param.default ? current.host : null;
    questions.push({
      id: `${PREFIX2.host}${row.id}`,
      header: "Host",
      multiSelect: false,
      question: `${row.label}: which ${param.label}?`,
      options: host ? first([{ label: `${LABEL.keep}${host}`, description: "the host it uses now" }, { label: param.default, description: DEFAULT_HOST_DESCRIPTION }]) : first([{ label: param.default, description: DEFAULT_HOST_DESCRIPTION }, { label: LABEL.hostSelfManaged, description: "your own GitLab host name, asked next" }])
    });
  }
  if (catalogRoute.authMode === "optional-token" && !(routeId !== "remote" && at2 === "project")) {
    const keyState = keyStateOf(row, routeId, context, inventory.alfredCodeEnabled, at2 || "user");
    const file = keyState && keyState.files[0];
    const hint = catalogRoute.helper && catalogRoute.helper.hint ? `; ${catalogRoute.helper.hint}` : "";
    const useKey = catalogRoute.helper ? { label: `${LABEL.useKey} from .mcps-secrets`, description: `mcp-headers.js reads it each time Claude Code connects${file ? `, from ${file} first` : ""} - never written into the registration${hint}` } : { label: `${LABEL.useKey} from .mcps-secrets`, description: `the apply writes it into the registration from ${file || ".mcps-secrets"}, never printed` };
    const noKey = catalogRoute.keyless === "oauth" ? { label: "Sign in with OAuth", description: "run /mcp once in a session to log in" } : { label: "No key - lower rate limits", description: "works anonymously" };
    questions.push({
      id: `${PREFIX2.token}${row.id}`,
      header: "API key",
      multiSelect: false,
      question: `${row.label}: send an API key?`,
      // install, or a registration that sends its key now: the key first
      options: first(!current || sameRoute && current.token ? [useKey, noKey] : [noKey, useKey])
    });
  }
  return { first: located ? asked2 : null, questions, answers, only };
}
function removeQuestions(inventory, catalog) {
  const items = installedItems(inventory, catalog, (_row, registration) => `claude mcp remove ${registration.name} -s ${registration.scope}`);
  return packed(items, { id: "remove", question: "which do you want to remove?", none: "remove nothing" });
}
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
function targetClientsQuestion(key, name, current) {
  const { options: options2, answers } = clientsOptions((current || []).includes("cursor"));
  return { question: { id: `${PREFIX2.clients}${key}`, header: "Apps", multiSelect: false, question: `Set up ${name} for which apps?`, options: options2 }, answers };
}
function rewindQuestion(picks, labelOf2) {
  const recorded = recordedPicks(picks);
  if (recorded.length === 0) return null;
  const pickSlots = REWIND_MAX_OPTIONS - 1;
  const more = recorded.length > pickSlots;
  const shown = recorded.slice(0, more ? pickSlots - 1 : pickSlots);
  const taken = /* @__PURE__ */ new Set();
  const options2 = shown.map((pick, i) => {
    const base = labelOf2(pick);
    const unique = taken.has(base) ? `${base} (${pick})` : base;
    taken.add(unique);
    return { label: `${unique}${i === 0 ? RECOMMENDED_SUFFIX : ""}`, description: "answer its questions again", value: pick };
  });
  if (more) options2.push({ label: "Another one", description: "named next", value: REWIND_ANOTHER });
  options2.push({ label: "Change nothing", description: "go back to the plan", value: "" });
  return {
    question: { id: "rewind", header: "Change", multiSelect: false, question: "Which answers do you want to change?", options: options2.map(({ label, description }) => ({ label, description })) },
    answers: Object.fromEntries(options2.map((option) => [option.label, option.value]))
  };
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
  prereqMissing: (tool, need) => ({ id: `prereq-${tool}`, header: "Missing", multiSelect: false, question: `${tool} needs ${need}, which is missing. What now?`, options: [
    { label: `Skip this tool${RECOMMENDED_SUFFIX}`, description: "leave it out of the plan" },
    { label: "Install it now", description: "run the install line shown, or install it yourself and re-check" },
    { label: "Register anyway", description: "register it; it will not start until the prerequisite is there" }
  ] }),
  prereqInstalled: (tool, need) => ({ id: `prereq-installed-${tool}`, header: "Installed?", multiSelect: false, question: `Is ${need} installed for ${tool} now?`, options: [
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

// scripts/mcps-list/mcp-order.ts
var ORDER_REASON = ".mcp.json: the catalog servers in your order, your own after them - no value changes";
function ownProjectNames(inventory, existing = {}) {
  const names = (inventory.registrations || []).flatMap((registration) => registration.scope === "project" && registration.choice === "own" && registration.name !== void 0 ? [registration.name] : []);
  for (const [key, choice] of Object.entries(existing || {})) {
    const [, name] = /^mcp:(.+)~project$/.exec(key) ?? [];
    if (name !== void 0 && choice === "own") names.push(name);
  }
  return [...new Set(names)];
}
function withOrderStep(steps, project, own = []) {
  const writes = steps.some((step) => typeof step.op === "string" && ["mcp-add", "mcp-replace"].includes(step.op) && step.scope === "project" || step.op === "mcp-move" && isRecord(step.to) && step.to["scope"] === "project");
  if (!writes) return steps;
  const pathApi = pathApiOf(project);
  const order = { op: "order-mcp-json", file: pathApi.join(project, MCP_JSON), own, why: ORDER_REASON };
  return [...steps, order];
}

// scripts/plan/cursor-steps.ts
import fs12 from "node:fs";

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
var serversOf = (read) => read.state === "ok" ? read.servers : null;
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
    const read = readCursor(file);
    reads.set(file, read);
    return read;
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
var hasGit = (dir, pathApi) => fs12.existsSync(pathApi.join(dir, ".git"));
function outsideItsRepo(project, pathApi) {
  if (!hasGit(project, pathApi))
    for (let dir = pathApi.dirname(project); ; dir = pathApi.dirname(dir)) {
      if (hasGit(dir, pathApi)) return true;
      if (pathApi.dirname(dir) === dir) break;
    }
  try {
    return fs12.readdirSync(project, { withFileTypes: true }).some((dirent) => dirent.isDirectory() && hasGit(pathApi.join(project, dirent.name), pathApi));
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
        rootReal = fs12.realpathSync(workspaceHere.root);
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
var reapproveLine = (names) => `Cursor asks you to approve ${names.join(", ")} again - it re-asks whenever an entry changes`;
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
  const names = [];
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
    if (next && !deepEqual(keepOf(catalog, copy, row), keepOf(catalog, next, row))) names.push(name);
  }
  return names;
}

// scripts/plan/repair-tail.ts
import fs13 from "node:fs";
import path16 from "node:path";

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
var ACCOUNT_FILE = ".claude.json";

// scripts/plan/repair-tail.ts
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
    text = fs13.readFileSync(file, "utf8");
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
    let real = path16.resolve(dir);
    try {
      real = fs13.realpathSync(dir);
    } catch {
    }
    return platform === "win32" ? real.toLowerCase() : real;
  };
  const currentKey = realKey(current);
  const listed = /* @__PURE__ */ new Set();
  let names = [];
  try {
    names = fs13.readdirSync(home);
  } catch {
    return [];
  }
  const found = [];
  for (const name of names.sort()) {
    if (name !== CONFIG_DIR_NAME && !name.startsWith(`${CONFIG_DIR_NAME}-`)) continue;
    const dir = path16.join(home, name);
    const key = realKey(dir);
    if (key === currentKey || listed.has(key)) continue;
    if (wanted(dir)) {
      found.push(dir);
      listed.add(key);
    }
  }
  return found;
}
function configDirsUnderHome(home, current, platform = process.platform) {
  const there = (file) => {
    try {
      return fs13.statSync(file).isFile();
    } catch {
      return false;
    }
  };
  return configDirsWhere(home, current, platform, (dir) => there(path16.join(dir, ACCOUNT_FILE)) || there(path16.join(dir, PLUGINS_DIR, INSTALLED_PLUGINS_FILE)) || path16.basename(dir) === CONFIG_DIR_NAME && there(path16.join(home, ACCOUNT_FILE)));
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
    text = fs13.readFileSync(file, "utf8");
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

// scripts/plan/context.ts
var andList = (items) => items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
function makeCtx(inventory, options2 = {}) {
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
    const resolved2 = formatRoot(root2, "local", context);
    const text = resolved2.value && resolved2.value.replace(/\//g, "\\");
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
  const same = !pick.target && here.find((registration) => registration.name === name && registration.scope === scope);
  for (const registration of here) {
    if (registration === target || registration === same || context.changing.has(keyOf("mcp", registration.name, registration.scope))) continue;
    if (registration.scope !== "inherited") out.notes.push(`${row.id}: also installed as '${registration.name}' at ${registration.scope} scope - left as it is`);
    else if (registration.name !== name) out.notes.push(`${row.id}: also inherited as '${registration.name}' from ${inheritedFrom(inventory, registration)} (${registration.approval}) - change it there`);
  }
  if (same) {
    out.expect.push({ kind: "mcp", row: row.id, name, scope, route: same.route });
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
import fs14 from "node:fs";
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
  const exists = context.exists || ((filePath) => fs14.existsSync(filePath));
  const exclude = !route.excludeFile ? false : pick.exclude !== void 0 ? Boolean(pick.exclude) : sameRoute && current ? excludeArgAt(current.entry, route.excludeFile, context) >= 0 : excludeRecommended({ platform: context.platform, home: context.home, exists });
  return { params, wantToken, keyState, liveKey, keyName, sendNow, urlNames, exclude };
}

// scripts/plan/pick/entry.ts
import fs15 from "node:fs";

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

// scripts/plan/pick/entry.ts
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
    const exists = context.exists || ((filePath) => fs15.existsSync(filePath));
    if (shippedState("bridge", launcher2.path, exists).state === "edited")
      return out.errors.push(`${row.id}: mcp-bridge.js in ${pathFor(context.platform).dirname(launcher2.path)} changed since alfred-tools wrote it - a launcher there would not start; /alfred-tools:fix (helper-stale) rewrites it, or delete it, then run this again`);
  }
  return { entry, fresh, rootStr, ensure, dataAbs, hostedSettings: Boolean(hostedSettings) };
}

// scripts/plan/pick/cursor.ts
import fs16 from "node:fs";
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
    const exists = context.exists || ((filePath) => fs16.existsSync(filePath));
    if (clients.includes("cursor") && root2 && (exists(root2) || pathApi.basename(root2) === ALFRED_DATA) && gitIgnores(pathApi.join(root2, FILES.signIns, SIGN_IN_PROBE)) === false) {
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
var import_mcp_bridge3 = __toESM(require_mcp_bridge(), 1);
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
    const all = [{ name: required(bridge.keyName, `${row.id}: its bridge launch names no key`), optional: false }, ...(0, import_mcp_bridge3.templateNames)(bridge.template) || []];
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

// scripts/apply/serena-config.ts
var CONFIG = "serena_config.yml";
var configOf = (home) => pathApiOf(home).join(home, CONFIG);
var FOLDER_KEY = "project_serena_folder_location";
var FOLDER_LINE = new RegExp(`^${FOLDER_KEY}[ \\t]*:(.*?)(\\r?)$`);
function folderValue(home) {
  if (home.includes("$")) return { error: `${home} holds a $ - serena would read it as a placeholder, so ${FOLDER_KEY} is not set` };
  const base = home.replace(/\\/g, "/").replace(/\/+$/, "");
  return { value: `'${base.replace(/'/g, "''")}/projects/$projectFolderName'` };
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

// scripts/plan/root-files.ts
import fs18 from "node:fs";

// scripts/apply/file-steps.ts
import fs17 from "node:fs";
import path17 from "node:path";
var import_mcp_headers3 = __toESM(require_mcp_headers(), 1);
var import_mcp_bridge4 = __toESM(require_mcp_bridge(), 1);
var PLUGIN_FILES = /* @__PURE__ */ new Set([".gitignore", "package.json", ...Object.values(FILES), [".", "secrets"].join(""), `${FILES.record}.0.4.bak`, `${FILES.list}.bak`]);
function pluginWritten(root2, name) {
  if (PLUGIN_FILES.has(name)) return true;
  try {
    return fs17.readFileSync(path17.join(root2, name, ".gitignore"), "utf8").trim() === "*";
  } catch {
    return false;
  }
}
function rootIgnoreLines(root2) {
  let names = [];
  try {
    names = fs17.readdirSync(root2);
  } catch {
  }
  const mine = names.every((name) => pluginWritten(root2, name));
  const want = mine ? GITIGNORE.trim().split("\n") : [FILES.secrets, FILES.record, FILES.list, `${FILES.signIns}/`];
  const file = path17.join(root2, ".gitignore");
  let text = null;
  try {
    text = fs17.readFileSync(file, "utf8");
  } catch {
  }
  const have = new Set((text || "").split(/\r?\n/).map((line) => line.trim()));
  return { file, text, mine, want, lack: want.filter((line) => !have.has(line)) };
}

// scripts/plan/root-files.ts
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
  const exists = context.exists || ((filePath) => fs18.existsSync(filePath));
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
  const names = [];
  const records = [];
  const map = inventory.roots && inventory.roots.map || null;
  for (const rootWrite of byRoot.values()) {
    const existed = exists(rootWrite.root);
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
      const { state } = helperState(pathApi.join(rootWrite.root, FILES.helper), exists);
      if (state === "absent" || state === "lower")
        helpers.push({ op: "write-helper", path: rootWrite.root, why: `${rootWrite.root}: mcp-headers.js, which reads a hosted key from .mcps-secrets each time Claude Code connects` });
      else if (state === "higher") out.notes.push(`mcp-headers.js in ${rootWrite.root} is newer than this plugin - update alfred-tools`);
      else if (state === "edited") out.notes.push(`mcp-headers.js in ${rootWrite.root} changed since alfred-tools wrote it - left as it is; /alfred-tools:fix (helper-stale) rewrites it`);
    }
    if (rootWrite.bridge) {
      const { state } = shippedState("bridge", pathApi.join(rootWrite.root, FILES.bridge), exists);
      if (state === "absent" || state === "lower")
        helpers.push({ op: "write-bridge", path: rootWrite.root, why: `${rootWrite.root}: mcp-bridge.js, which ${BRIDGE_WHY}` });
      else if (state === "higher") out.notes.push(`mcp-bridge.js in ${rootWrite.root} is newer than this plugin - update alfred-tools`);
      else if (state === "edited") out.notes.push(`mcp-bridge.js in ${rootWrite.root} changed since alfred-tools wrote it - left as it is; /alfred-tools:fix (helper-stale) rewrites it`);
    }
    for (const folder of rootWrite.serenaContext) {
      const { state } = shippedState("serenaContext", pathApi.join(folder, FILES.serenaContext), exists);
      if (state === "absent" || state === "lower")
        helpers.push({ op: "write-serena-context", path: folder, why: `${folder}: serena-context.yml, the context serena runs with - code navigation only, in Claude Code and Cursor` });
      else if (state === "higher") out.notes.push(`serena-context.yml in ${folder} is newer than this plugin - update alfred-tools`);
      else if (state === "edited") out.notes.push(`serena-context.yml in ${folder} changed since alfred-tools wrote it - left as it is; /alfred-tools:fix (helper-stale) rewrites it`);
    }
    const excludeAt = pathApi.join(rootWrite.root, FILES.macosExclude);
    const movedHere = (context.rootMoves || []).some((move) => move.to === excludeAt);
    if (rootWrite.exclude && !exists(excludeAt) && !movedHere)
      helpers.push({ op: "write-exclude-file", path: rootWrite.root, tools: rootWrite.exclude, why: `${rootWrite.root}: ${FILES.macosExclude}, the tools macos-mcp leaves out (${rootWrite.exclude.join(", ")})` });
    if (!gap || !gap.secrets)
      for (const [file, want] of rootWrite.keys) {
        const have = new Set(exists(file) ? namesIn(file) : []);
        const lack = want.filter((name) => !have.has(name));
        if (lack.length) names.push({ op: "ensure-key-name", file, names: lack, why: `${file}: the key's name - names only, you fill in each value` });
      }
    const mapped = !map ? null : rootWrite.family === "global" ? map.global : Object.keys(map.projects || {}).length ? map.projects[mapKey(context.project)] : null;
    if (mapped !== rootWrite.root)
      records.push({ op: "record-root", family: rootWrite.family, project: context.project, root: rootWrite.root, why: `the ${rootWrite.family} root ${rootWrite.root}: written to the roots map, so the commands find it again` });
  }
  return { before: [...ignore, ...helpers, ...names], after: [...lists, ...records] };
}

// scripts/plan/serena-init.ts
import fs19 from "node:fs";
function serenaConfigInitStep(entry, context) {
  const home = entry.env && entry.env.SERENA_HOME;
  if (!home || !editableHome(home, { platform: context.platform }).ok || "error" in folderValue(home)) return null;
  const file = configOf(home);
  const exists = context.exists || ((candidate) => fs19.existsSync(candidate));
  if (exists(file)) return null;
  return { op: "serena-config-init", file, home, why: `serena: ${file} with its project folders under ${home}/projects, before serena first starts` };
}

// scripts/plan/pick/steps.ts
function pickSteps(base, built, cursor, keyUse, entry, keyName, context, out) {
  const { row, route, current, listedClients, routeId, scope, name } = base;
  const { fresh, rootStr, ensure, dataAbs } = built;
  const { form, clients, signInRoot } = cursor;
  const { bridge, launcher: launcher2, bridgeFilled, keyFile, keyNames, withKey, chosen, staleKey, reconnect } = keyUse;
  const fetch = fetchStep(name, entry, row.id, current && current.entry);
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
    if (fetch) out.steps.push(fetch);
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
  if (fetch) out.steps.push(fetch);
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

// scripts/plan/retire-context.ts
var rootContext = (context) => ({ project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog });
var contextFileOf = (entry, context) => {
  const file = entry?.args?.[contextArgAt(entry)];
  return file === void 0 ? null : absOf(file, rootContext(context));
};
var nameScopeKey = (name, scope) => `${name}\0${scope}`;
function namedBy(file, context, except) {
  const names = /* @__PURE__ */ new Set();
  for (const registration of context.inventory.registrations)
    if (!except.has(nameScopeKey(registration.name, registration.scope)) && contextFileOf(registration.entry, context) === file) names.add(registration.name);
  for (const list of Object.values(context.inventory.lists || {}))
    for (const server of list && !list.note ? list.servers : [])
      if (!except.has(nameScopeKey(server.name, server.scope)) && contextFileOf(server.cursorEntry, context) === file) names.add(server.name);
  return [...names];
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

// scripts/plan/change.ts
import fs20 from "node:fs";
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
    const exists = context.exists || ((filePath) => fs20.existsSync(filePath));
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
      if (exists(from)) context.rootMoves.push({ family, name: fileName, from, to: pathApi.join(next, fileName) });
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

// scripts/fix/rename.ts
import fs21 from "node:fs";
var isDir2 = (dir) => {
  try {
    return fs21.lstatSync(dir).isDirectory();
  } catch {
    return false;
  }
};
function movedAt(machine) {
  const pathApi = pathFor(machine.platform);
  const out = [];
  for (const base of [.../* @__PURE__ */ new Set([machine.project, machine.home])]) {
    const from = pathApi.join(base, FORMER_ROOT_NAME);
    const to = pathApi.join(base, ROOT_NAME);
    if (isDir2(to) && (!fs21.existsSync(from) || !holdsRootFiles(from))) out.push({ from, to });
  }
  return out;
}
function tokenStarts(text, end, commandLine) {
  if (!commandLine) {
    const eq = text.lastIndexOf("=", end);
    return eq >= 0 ? [0, eq + 1] : [0];
  }
  let quote = null;
  let wordStart = 0;
  for (let at2 = 0; at2 < end; at2++) {
    const character = text.charAt(at2);
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "\\" && (text[at2 + 1] === "'" || text[at2 + 1] === '"')) {
      at2++;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
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
function repointWaits(registrations, machine) {
  const moved = movedAt(machine);
  return moved.length > 0 && registrations.some((registration) => registration.rowId && !registration.own && registration.choice !== "own" && registration.scope !== "inherited" && !deepEqual(repointEntry(registration.entry, moved, machine), registration.entry));
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
  const context = { ...makeCtx(inventory, { ...options2, machine: options2.machine || answers.machine }), changing: new Set(Object.keys(answers.change || {})), uses: [], rootMoves: [] };
  const out = { version: 1, project: inventory.project, os: inventory.os, alfredCodeEnabled: Boolean(inventory.alfredCodeEnabled), steps: [], notes: [], errors: [], unchanged: [], keys: [], reconnect: [], oauth: [], dangerous: [], expect: [] };
  const waits = waitsFor({ project: inventory.project, home: context.home, platform: context.platform }, inventory.registrations || []);
  if (waits) {
    out.errors.push(waits);
    return out;
  }
  const resolved2 = resolveRoots(inventory, answers.roots, { ...context, catalog });
  out.errors.push(...resolved2.errors);
  context.roots = resolved2.roots;
  context.knownRoots = knownRoots(inventory, resolved2.roots, { ...context, catalog });
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

// scripts/plan/render.ts
var shellQuote = (text) => /^[A-Za-z0-9_\-./:=@,+]+$/.test(text) ? text : `'${text.replace(/'/g, "'\\''")}'`;
function argvOf(step) {
  switch (step.op) {
    case "mcp-add":
      return ["mcp", "add-json", step.name, JSON.stringify(step.entry), "-s", step.scope];
    case "mcp-remove":
      return ["mcp", "remove", step.name, "-s", step.scope];
    default:
      return null;
  }
}
function keyLine(planKey) {
  const reader = planKey.kind === "helper" ? "mcp-headers.js reads it each time Claude Code connects" : planKey.kind === "bridge" ? "mcp-bridge.js reads it each time the server starts" : "the apply writes it into the registration";
  const parts = [`Key: ${planKey.name} (${planKey.scope} scope) - ${planKey.variable}; ${reader}, from ${planKey.files.join(", then ")}. The key is never printed.`];
  if (planKey.filled) parts.push("Filled.");
  else if (planKey.old) parts.push(`${planKey.variable} is in ${planKey.old}, which alfred-tools no longer reads: move it to ${planKey.files[0]}`);
  else parts.push(`Not filled yet: add ${planKey.variable}=<your key> to ${planKey.files[0]}${planKey.kind === "helper" ? " - until then the server connects without its key" : planKey.kind === "bridge" ? planKey.optional ? " - until then the server starts without its key" : " - until then the server does not start" : " before the apply, or after it run /alfred-tools:configure and keep the name - it writes the key in"}.`);
  return parts.join(" ");
}
function reconnectLine({ name, variable, file, filled, anonymous, hint = null }) {
  if (filled) return `${name}: connects with its key at the next session start; in a session already running, /mcp -> ${name} -> Reconnect`;
  return `${name}: fill ${variable} in ${file}${hint ? ` (${hint})` : ""}, then Reconnect it in /mcp - until then ${anonymous ? "it runs without the key, at lower rate limits" : "it connects without the key, and /mcp shows needs authentication"}`;
}
function renderPlan(plan2) {
  const lines = [];
  const pathApi = pathFor(plan2.os);
  if (plan2.outside?.length) lines.push(...plan2.outside, "");
  if (plan2.errors.length) lines.push("Cannot plan:", ...plan2.errors.map((error) => `  ! ${error}`), "");
  if (!plan2.steps.length && !plan2.errors.length) lines.push("Nothing to do: every answer already matches what is installed - no claude call, no file written.");
  if (plan2.apps) {
    lines.push(`Apps: ${plan2.apps.includes("cursor") ? "Claude Code and Cursor" : "Claude Code"}`);
    for (const step of plan2.steps.filter((candidate) => candidate.op === "cursor-write")) lines.push(`  ${step.family === "global" ? "Global scope" : "Project and Local scope"} in Cursor: ${step.file}`);
    lines.push("");
  }
  plan2.steps.forEach((step, i) => {
    lines.push(`${i + 1}. ${step.why || step.op}`);
    const argv = argvOf(step);
    if (argv) lines.push(`   claude ${argv.map(shellQuote).join(" ")}`);
    else if (step.op === "mcp-move") lines.push(`   claude mcp add-json ${shellQuote(step.to.name)} ${shellQuote(JSON.stringify(step.entry))} -s ${step.to.scope}`, "   (read back)", `   claude mcp remove ${shellQuote(step.from.name)} -s ${step.from.scope}`);
    else if (step.op === "mcp-replace") lines.push(`   claude mcp remove ${shellQuote(step.name)} -s ${step.scope}`, `   claude mcp add-json ${shellQuote(step.name)} ${shellQuote(JSON.stringify(step.entry))} -s ${step.scope}`, `   (the old entry is saved to rollback.json and re-added if the add fails)`);
    else if (step.op === "ensure-dir") lines.push(`   writes ${step.path}/.gitignore  (contents: *)`);
    else if (step.op === "root-ignore") lines.push(`   writes ${pathApi.join(step.path, ".gitignore")}  (${GITIGNORE.trim().split("\n").join(", ")} - or the lines it lacks, appended)`);
    else if (step.op === "write-helper") lines.push(`   writes ${pathApi.join(step.path, FILES.helper)}  (this plugin's header helper)`, `   (and package.json, type commonjs, when absent)`);
    else if (step.op === "write-bridge") lines.push(`   writes ${pathApi.join(step.path, FILES.bridge)}  (${BRIDGE_RENDER})`, `   (and package.json, type commonjs, when absent)`);
    else if (step.op === "move-root-file") lines.push(`   moves ${step.from} to ${step.to}  (the root's own file goes with it)`);
    else if (step.op === "write-serena-context") lines.push(`   writes ${pathApi.join(step.path, FILES.serenaContext)}  (serena's context: code navigation only)`);
    else if (step.op === "write-exclude-file") lines.push(`   writes ${pathApi.join(step.path, FILES.macosExclude)}  (the tools macos-mcp leaves out: ${step.tools.join(", ")} - only when it is not there)`);
    else if (step.op === "retire-shipped") lines.push(`   removes ${step.file}  (only when it is this plugin's own, unedited copy and no registration names it)`);
    else if (step.op === "retire-helper") lines.push(`   removes ${step.file}  (only when no registration or Cursor file names it and git does not track it)`);
    else if (step.op === "serena-folder-move") lines.push(`   moves ${step.from} to ${step.to}  (only when the project has a .git, git tracks nothing in it and the destination is free; a running serena may write to the old folder until Claude Code restarts)`);
    else if (step.op === "serena-config-init") lines.push(`   writes ${step.file}  (projects: [], base_modes: [] and project_serena_folder_location - only when it is not there)`);
    else if (step.op === "serena-project-folder") lines.push(`   sets project_serena_folder_location in ${step.file}  (no other line changes; a project's in-tree .serena folder that cannot move is named with its reason)`);
    else if (step.op === "ensure-key-name") lines.push(`   writes ${step.file}  (names only: ${step.names.join(", ")} - you fill in each value)`);
    else if (step.op === "list-write" || step.op === "retire-record" || step.op === "cursor-write" || step.op === "deny-read" || step.op === "settings-env") lines.push(renderLine(step));
    else if (step.op === "order-mcp-json") lines.push(`   reorders ${step.file}  (no value changes)`);
    else if (step.op === "record-root") lines.push(`   writes ${FILES.map} in the plugin's data folder  (the ${step.family} root: ${step.root})`);
    else if (step.op === "fetch") lines.push(`   ${step.argv.map(shellQuote).join(" ")}`, "   (after the apply, in the background: fills the cache only; if it fails the registration stays and the first start tries again)");
  });
  if (plan2.keys.length) lines.push("", ...plan2.keys.map(keyLine));
  if ((plan2.reconnect || []).length) lines.push("", ...plan2.reconnect.map(reconnectLine));
  for (const oauthEntry of plan2.oauth) if (oauthEntry.signin) lines.push("", `OAuth: ${oauthEntry.name}: your browser opens to sign in the first time it starts, in Claude Code or Cursor; the sign-in is kept in ${pathApi.join(oauthEntry.root, FILES.signIns)}/ and serves both.`);
  const viaMcp = plan2.oauth.filter((candidate) => !candidate.signin);
  if (viaMcp.length) lines.push("", `OAuth: run /mcp once in a session to log in to ${viaMcp.map((oauthEntry) => oauthEntry.name).join(", ")}.`);
  if (plan2.dangerous.length) lines.push("", ...plan2.dangerous.map((dangerous) => `Code-running tool on '${dangerous.name}': ${dangerous.tools.map((tool) => `${tool.tool} (${tool.why})`).join("; ")}. This plugin adds no guard.`));
  if (plan2.notes.length) lines.push("", ...plan2.notes.map((note) => `Note: ${note}`));
  if (plan2.unchanged.length) lines.push("", ...plan2.unchanged.map((note) => `Unchanged: ${note}`));
  return globalWords(lines.join("\n"));
}
function globalWords(text) {
  let first = true;
  return text.replace(/\buser scope\b/g, () => {
    if (!first) return "global scope";
    first = false;
    return "global (user scope)";
  });
}

// scripts/plan/record-modes.ts
import fs23 from "node:fs";
import path18 from "node:path";

// scripts/plan/asks-all.ts
import fs22 from "node:fs";

// scripts/plan/asks-roots.ts
var ROOT_HEADER = { project: "Project root", global: "Global root" };
var ROOT_TEXT = {
  project: "Which folder holds this project's keys, key helper and tool data (project and local scope)?",
  global: "Which folder holds the keys, key helper and tool data for every project (global scope)?"
};
function needsRoot(row, routeId) {
  if (row.kind !== "mcp") return false;
  const route = row.routes && row.routes[routeId];
  return Boolean(row.locations) || Boolean(route && (route.tokenVar || route.helper));
}
function rootFamilies(inventory, picks, catalog, context) {
  const out = /* @__PURE__ */ new Set();
  const routes = picks && picks.routes || {};
  const scopes = picks && picks.scopes || {};
  for (const id of picks && picks.rows || []) {
    const row = catalog.byId.get(id);
    if (!row) continue;
    const routeId = routes[id] || row.recommendedRoute;
    if (!needsRoot(row, routeId)) continue;
    const scope = scopes[id] || scopeOrder(row, inventory, { route: routeId, context, copyOf: installedOf(inventory, id) })[0];
    out.add(familyOf(scope));
  }
  return FAMILIES.filter((family) => out.has(family));
}
function rootQuestion(inventory, family, context) {
  const options2 = options(inventory, family, context).map((option, i) => ({ ...option, label: `${option.label}${i === 0 ? RECOMMENDED_SUFFIX : ""}` }));
  const described = options2.map((option) => {
    if (option.description === void 0) throw new Error(`the ${family} root option '${option.label}' has no description`);
    return { label: option.label, description: option.description };
  });
  return {
    question: { id: `${PREFIX2.root}${family}`, header: ROOT_HEADER[family], multiSelect: false, question: ROOT_TEXT[family], options: described },
    answers: Object.fromEntries(options2.map((option) => [option.label, { family, id: option.id, root: option.root }]))
  };
}
function rootsBlock(inventory, picks, catalog, context) {
  const out = { questions: [], answers: {} };
  for (const family of rootFamilies(inventory, picks, catalog, context)) {
    const rootAsk = rootQuestion(inventory, family, { ...context, catalog });
    out.questions.push(rootAsk.question);
    out.answers[rootAsk.question.id] = rootAsk.answers;
  }
  return out;
}

// scripts/plan/asks-all.ts
function allQuestions(inventory, picks, catalog, { env = {}, home = null, connectors = null } = {}) {
  const out = {
    static: { ...STATIC, prereqMissing: STATIC.prereqMissing("<tool>", "<prerequisite>"), prereqInstalled: STATIC.prereqInstalled("<tool>", "<prerequisite>"), settingsOne: STATIC.settingsOne("<tool>"), "cursor-name-taken": STATIC["cursor-name-taken"]("<file>", "<name>") },
    pick: pickQuestions(inventory, catalog, picks && picks.existing, connectors),
    change: null,
    remove: removeQuestions(inventory, catalog),
    tools: {},
    targets: {}
  };
  const context = { project: inventory.project, platform: inventory.os, arch: inventory.arch, home: home || homeDir(process.env), env, keyHome: home, exists: (filePath) => fs22.existsSync(filePath) };
  context.roots = resolveRoots(inventory, picks && picks.roots, { ...context, catalog }).roots;
  context.knownRoots = knownRoots(inventory, context.roots, { ...context, catalog });
  out.change = changeQuestions(inventory, catalog, context);
  out.clients = picks && (picks.rows || []).length ? clientsQuestion(cursorFound(context, inventory)) : null;
  const routes = picks && picks.routes || {};
  const scopes = picks && picks.scopes || {};
  const names = picks && picks.names || {};
  for (const id of picks && picks.rows || []) {
    const row = catalog.byId.get(id);
    if (!row) continue;
    out.tools[id] = { route: row.kind === "mcp" ? routeQuestion(row) : null, ...toolAsk(row, inventory, { route: routes[id], scope: scopes[id], name: names[id], context, catalog, copyOf: installedOf(inventory, id) }) };
  }
  const own = new Map(ownItems(inventory, catalog).map((ownItem) => [ownItem.key, ownItem]));
  for (const key of picks && picks.targets || []) {
    const rootFamily = FAMILIES.find((family) => key === `root:${family}`);
    if (rootFamily) {
      const used = rootInUse(inventory, rootFamily, { ...context, catalog });
      out.targets[key] = used ? { kind: "root", family: rootFamily, current: { path: used.path }, root: rootQuestion(inventory, rootFamily, { ...context, catalog }) } : { error: `no ${rootFamily} root is in use here` };
      continue;
    }
    const ownItem = own.get(key);
    if (ownItem) {
      out.targets[key] = { row: ownItem.rowId, kind: "own", current: { name: ownItem.name || ownItem.server || ownItem.connector, scope: ownItem.scope || null, route: null }, own: ownQuestion(ownItem) };
      continue;
    }
    const target = targetOf(inventory, key);
    const item = target?.item;
    const row = item && item.rowId && !item.alfredRetired ? catalog.byId.get(item.rowId) : null;
    if (!target || !item || !row) {
      out.targets[key] = { error: `'${key}' is not a catalog tool installed here` };
      continue;
    }
    const registration = isRegistration(item) ? item : null;
    const current = registration ? currentOf(row, registration) : { scope: item.scope };
    const listed = registration ? listedOf2(inventory, registration) : null;
    out.targets[key] = {
      row: row.id,
      kind: target.kind,
      current: { name: isRegistration(item) ? item.name : item.id, scope: item.scope, route: current.route || null, ...registration ? { clients: listed ? listed.clients : ["claude"] } : {} },
      route: registration ? routeQuestion(row, current.route) : null,
      ...registration ? { clients: targetClientsQuestion(key, registration.name, listed ? listed.clients : ["claude"]) } : {},
      ...toolAsk(row, inventory, { route: routes[key], scope: scopes[key], name: names[key], current, context, catalog })
    };
  }
  out.roots = rootsBlock(inventory, picks, catalog, context);
  out.keyNames = {};
  out.settings = {};
  out.excludes = {};
  out.urlNames = {};
  const urlBlock = (list) => Object.fromEntries(list.map((urlQuestion) => [urlQuestion.var, { question: urlQuestion.question, answers: urlQuestion.answers }]));
  const live2 = liveReader(inventory.project, env);
  for (const id of picks && picks.rows || []) {
    const row = catalog.byId.get(id);
    if (!row || row.kind !== "mcp") continue;
    const routeId = routes[id] || row.recommendedRoute;
    if (!row.routes[routeId]) continue;
    const scope = scopes[id] || required(scopeOrder(row, inventory, { route: routeId, context, copyOf: installedOf(inventory, id) })[0], `${id}: its ${routeId} route offers no scope`);
    const keyNameAsk = keyNameQuestion(row, routeId, scope, context);
    if (keyNameAsk) out.keyNames[id] = keyNameAsk;
    const urlQuestions = urlNameQuestions(row, routeId, scope, context);
    if (urlQuestions.length) out.urlNames[id] = urlBlock(urlQuestions);
    const settings = settingsQuestion(row, routeId);
    if (settings) out.settings[id] = settings;
    const exclude = excludeQuestion(row, routeId, { context });
    if (exclude) out.excludes[id] = exclude;
  }
  for (const key of picks && picks.targets || []) {
    if (own.has(key)) continue;
    const target = targetOf(inventory, key);
    const registration = target && isRegistration(target.item) ? target.item : null;
    const row = registration && registration.rowId && !registration.alfredRetired ? catalog.byId.get(registration.rowId) : null;
    if (!registration || !row) continue;
    const current = currentOf(row, registration);
    const routeId = routes[key] || current.route;
    const route = routeId ? row.routes[routeId] : void 0;
    if (!routeId || !route) continue;
    const scope = scopes[key] || current.scope;
    const same = routeId === current.route;
    const launch = same ? launcherParts(registration.entry) : null;
    let name = launch ? launch.keyName : same && route.helper ? current.keyName : null;
    if (same && !launch && !route.helper && route.tokenVar) {
      const held = heldKey(live2(registration.name, registration.scope) || {}, route);
      const keyState = keyStateOf(row, routeId, context, null, scope);
      name = held && keyState ? nameOfValue(keyState.files, held) : null;
    }
    const keyNameAsk = keyNameQuestion(row, routeId, scope, context, { current: name });
    if (keyNameAsk) out.keyNames[key] = keyNameAsk;
    const urlQuestions = urlNameQuestions(row, routeId, scope, context, { current: same ? current.urlNames : null, keyName: name });
    if (urlQuestions.length) out.urlNames[key] = urlBlock(urlQuestions);
    const settings = settingsQuestion(row, routeId, { entry: same ? registration.entry : null });
    if (settings) out.settings[key] = settings;
    const exclude = excludeQuestion(row, routeId, { entry: same ? registration.entry : null, context });
    if (exclude) out.excludes[key] = exclude;
  }
  return out;
}
function listedOf2(inventory, item) {
  const familyList = inventory.lists && inventory.lists[familyOf(item.scope)];
  return familyList && !familyList.note ? (familyList.servers || []).find((server) => server.name === item.name && server.scope === item.scope) || null : null;
}

// scripts/plan/walk.ts
function ownStep(item, root2) {
  const pathApi = pathApiOf(String(root2));
  const file = pathApi.join(root2, FILES.list);
  const where = item.scope === "project" ? "; in .mcp.json it sits with your own servers, after the managed ones" : "";
  const options2 = [
    { label: `alfred-tools${RECOMMENDED_SUFFIX}`, description: "configure, update and fix look after it", choice: "manage" },
    { label: "Leave it on its own", description: `nothing in this plugin changes its entry again${where}; saved in ${file}`, choice: "own" }
  ];
  return {
    question: { id: `${PREFIX2.own}${item.key}`, header: "Looked after", multiSelect: false, question: `Who looks after ${item.name}?`, options: options2.map(({ label, description }) => ({ label, description })) },
    answers: Object.fromEntries(options2.map((option) => [option.label, { key: item.key, choice: option.choice }]))
  };
}
function pickOrder(catalog, ids) {
  const rank = /* @__PURE__ */ new Map();
  for (const group of catalog.groups) for (const row of catalog.tools.filter((candidate) => candidate.group === group.id)) rank.set(row.id, rank.size);
  const ranked = ids.flatMap((id) => {
    const at2 = rank.get(id);
    return at2 === void 0 ? [] : [{ id, at: at2 }];
  });
  return ranked.sort((left, right) => left.at - right.at).map(({ id }) => id);
}
function nextQuestion(inventory, picks, catalog, options2 = {}, built = null) {
  picks = picks || {};
  const builtQuestions = built || allQuestions(inventory, picks, catalog, options2);
  const done = new Set(picks.done || []);
  const tokens = picks.tokens || {};
  const steps = [];
  const add = (id, tool, questions, answers = {}, set = null) => {
    const call = questions.filter((question) => Boolean(question));
    const kept = Object.fromEntries(Object.entries(answers).filter(([questionId]) => call.some((question) => question.id === questionId)));
    if (call.length || set) steps.push({ id, tool, call, answers: kept, ...set ? { set } : {} });
  };
  const keyStep = (toolId) => {
    const keyNameAsk = tokens[toolId] === false ? null : builtQuestions.keyNames?.[toolId];
    const settingsAsk = builtQuestions.settings?.[toolId];
    const excludeAsk = builtQuestions.excludes?.[toolId];
    const urlAsks = Object.values((builtQuestions.urlNames || {})[toolId] || {});
    add(`${toolId}:keys`, toolId, [keyNameAsk && keyNameAsk.question, ...urlAsks.map((urlAsk) => urlAsk.question), settingsAsk && settingsAsk.question, excludeAsk && excludeAsk.question], { ...keyNameAsk ? { [keyNameAsk.question.id]: keyNameAsk.answers } : {}, ...Object.fromEntries(urlAsks.map((urlAsk) => [urlAsk.question.id, urlAsk.answers])), ...settingsAsk ? { [settingsAsk.question.id]: settingsAsk.answers } : {}, ...excludeAsk ? { [excludeAsk.question.id]: excludeAsk.answers } : {} });
  };
  const toolSteps = (toolBlock, id, rootStep) => {
    const { first } = toolBlock;
    const located = first !== null && first !== void 0;
    add(`${id}:route`, id, [toolBlock.route]);
    if (located) add(`${id}:first`, id, first);
    else add(`${id}:questions`, id, toolBlock.questions || []);
    if (rootStep) rootStep();
    if (located) {
      const locationAsk = (toolBlock.questions || []).find((question) => question.id.startsWith(PREFIX2.location));
      add(`${id}:questions`, id, toolBlock.questions || [], locationAsk ? { [locationAsk.id]: toolBlock.answers } : {}, toolBlock.only ? { location: toolBlock.only } : null);
    }
    keyStep(id);
  };
  if (picks.rows) {
    const rows = pickOrder(catalog, picks.rows);
    if (rows.length) {
      if (builtQuestions.clients) add(WALK_QUESTION.clients, null, [builtQuestions.clients.question], { [WALK_QUESTION.clients]: builtQuestions.clients.answers });
      const [first] = rows;
      const onlyRow = rows.length === 1 && first !== void 0 ? catalog.byId.get(first) : void 0;
      const one = onlyRow ? STATIC.settingsOne(onlyRow.label) : STATIC.settings;
      const choices = one.options.flatMap((option, i) => {
        const choice = WALK_CHOICES[i];
        return choice === void 0 ? [] : [[option.label, choice]];
      });
      add(WALK_QUESTION.settings, null, [one], { [WALK_QUESTION.settings]: Object.fromEntries(choices) });
      if (picks.walk === WALK_CHOICES[0]) return steps.find((step) => !done.has(step.id)) || { id: "done" };
    }
    const asked2 = new Set(Object.keys(picks.roots || {}));
    for (const id of rows) {
      const row = catalog.byId.get(id);
      const toolBlock = builtQuestions.tools[id];
      if (!row || !toolBlock) continue;
      const routeId = (picks.routes || {})[id] || row.recommendedRoute;
      const rootStep = () => {
        if (!needsRoot(row, routeId)) return;
        const scope = (picks.scopes || {})[id] || scopeOrder(row, inventory, { route: routeId, context: null, copyOf: installedOf(inventory, id) })[0];
        const family = familyOf(scope);
        if (asked2.has(family)) return;
        asked2.add(family);
        const rootAsks = builtQuestions.roots;
        const rootAsk = rootAsks?.questions.find((candidate) => candidate.id === `${PREFIX2.root}${family}`);
        if (rootAsks && rootAsk) add(`root:${family}`, id, [rootAsk], { [rootAsk.id]: rootAsks.answers[rootAsk.id] });
      };
      toolSteps(toolBlock, id, rootStep);
    }
  }
  for (const key of picks.targets || []) {
    const toolBlock = builtQuestions.targets[key];
    if (!toolBlock || toolBlock.error) continue;
    if (toolBlock.kind === "root" || toolBlock.kind === "own") {
      const blockAsk = toolBlock.kind === "root" ? toolBlock.root : toolBlock.own;
      if (!blockAsk) throw new Error(`${key}: a ${toolBlock.kind} target is built with its question`);
      add(toolBlock.kind === "root" ? key : `${key}:own`, key, [blockAsk.question], { [blockAsk.question.id]: blockAsk.answers });
      continue;
    }
    if (toolBlock.kind === "mcp") {
      const current = toolBlock.current;
      if (!current) throw new Error(`${key}: a registration target is built with its current registration`);
      const family = familyOf(current.scope);
      const root2 = rootInUse(inventory, family, { ...options2.home ? { home: options2.home } : {}, catalog });
      const fallback = resolveRoots(inventory, picks.roots, { project: inventory.project, platform: inventory.os, home: options2.home || homeDir(process.env), catalog }).roots[family];
      const folder = root2 ? root2.path : fallback;
      if (folder === null || folder === void 0) throw new Error(`${key}: no ${family} root is in use or resolved for its list`);
      const ownAsk = ownStep({ key, name: current.name, scope: current.scope }, folder);
      add(`${key}:own`, key, [ownAsk.question], { [ownAsk.question.id]: ownAsk.answers });
      if ((picks.existing || {})[key] === "own") continue;
    }
    toolSteps(toolBlock, key, null);
    if (toolBlock.clients) add(`${key}:clients`, key, [toolBlock.clients.question], { [toolBlock.clients.question.id]: toolBlock.clients.answers });
  }
  return steps.find((step) => !done.has(step.id)) || { id: "done" };
}

// scripts/plan/walk-output.ts
function withRootsMap(inventory, data) {
  if (data !== null) inventory.roots = { ...inventory.roots || {}, map: readMap(data) };
}
function walkOutput(inventory, picks, flags) {
  withRootsMap(inventory, flags.data);
  const home = homeDir(process.env);
  const waits = waitsFor({ project: inventory.project, home, platform: inventory.os || process.platform }, inventory.registrations || []);
  if (waits) return { waits };
  const catalog = load();
  const options2 = { env: process.env, home, connectors: flags.connectors !== null ? parseConnectors(flags.connectors) : null };
  const built = allQuestions(inventory, picks, catalog, options2);
  return { ...built, next: nextQuestion(inventory, picks, catalog, options2, built) };
}

// scripts/plan/record-modes.ts
var refuse2 = (line) => {
  console.error(`plan.ts: ${line}`);
  return EXIT_CODE.refused;
};
function sitInOneTempFolder(files) {
  const targets = files.map(checkedTarget);
  const resolved2 = targets.filter((target) => target !== null);
  if (resolved2.length !== targets.length) return null;
  return new Set(resolved2.map((target) => path18.dirname(target))).size === 1 ? resolved2 : null;
}
function readObject(file, optional = false) {
  let text;
  try {
    text = fs23.readFileSync(file, "utf8");
  } catch {
    return optional && !fs23.existsSync(file) ? { value: {} } : { refused: `${file}: ${REFUSAL.notJson}` };
  }
  let value;
  try {
    value = parseJson(text);
  } catch {
    return { refused: `${file}: ${REFUSAL.notJson}` };
  }
  return isRecord(value) ? { value } : { refused: `${file}: ${REFUSAL.notObject}` };
}
function labelOfPick(pick, output) {
  const walkLabel = Object.hasOwn(WALK_PICK_LABEL, pick) ? WALK_PICK_LABEL[pick] : void 0;
  if (walkLabel !== void 0) return walkLabel;
  const row = load().byId.get(pick);
  if (row) return row.label;
  const current = output.targets[pick]?.current;
  if (!current?.name) return pick;
  const scope = current.scope ? SCOPE_LABEL[current.scope] : void 0;
  return scope ? `${current.name} (${scope})` : current.name;
}
function persist(result, args, inventory, files) {
  if ("refused" in result) return refuse2(result.refused);
  writeJsonNoFollow(files.picks, result.picks);
  writeJsonNoFollow(files.answers, result.answers);
  if (args.mode === "skip") {
    console.log(args.pick);
    return EXIT_CODE.ok;
  }
  return printWalk(inventory, result.picks, args);
}
function printWalk(inventory, picks, args) {
  const output = walkOutput(inventory, picks, args);
  if ("waits" in output) {
    console.error(output.waits);
    return EXIT_CODE.stopped;
  }
  console.log(JSON.stringify(output, null, 2));
  return EXIT_CODE.ok;
}
function skipTarget(inventory, picks, answers, args, named, files) {
  let rowOf2 = () => void 0;
  if (!(picks.rows ?? []).includes(named) && !(picks.targets ?? []).includes(named)) {
    const output = walkOutput(inventory, picks, args);
    if ("waits" in output) {
      console.error(output.waits);
      return EXIT_CODE.stopped;
    }
    rowOf2 = (target) => output.targets[target]?.row;
  }
  const resolved2 = resolveSkipTarget(picks, named, rowOf2);
  if ("refused" in resolved2) return refuse2(resolved2.refused);
  return persist(skipPick(picks, answers, resolved2.pick), { ...args, pick: resolved2.pick }, inventory, files);
}
function runRecordMode(args) {
  const sitting = sitInOneTempFolder(args.files);
  if (sitting === null) return refuse2(REFUSAL.folder);
  const [inventoryFile, picksFile, answersFile, stepFile] = sitting;
  if (inventoryFile === void 0 || picksFile === void 0 || answersFile === void 0) return refuse2(REFUSAL.walkFiles);
  const inventoryRead = readObject(inventoryFile);
  if ("refused" in inventoryRead) return refuse2(inventoryRead.refused);
  const picksRead = readObject(picksFile);
  if ("refused" in picksRead) return refuse2(picksRead.refused);
  const answersRead = readObject(answersFile, true);
  if ("refused" in answersRead) return refuse2(answersRead.refused);
  const inventory = inventoryRead.value;
  if (!isInventoryFile(inventory)) return refuse2(`${inventoryFile}: ${REFUSAL.notInventory}`);
  const picks = picksRead.value;
  if (!isPicksFile(picks)) return refuse2(`${picksFile}: ${REFUSAL.notPicks}`);
  const answers = answersRead.value;
  if (!isAnswersFile(answers)) return refuse2(`${answersFile}: ${REFUSAL.notAnswers}`);
  const files = { picks: picksFile, answers: answersFile };
  if (args.mode === "skip") return args.pick === null ? refuse2(REFUSAL.skipPick) : skipTarget(inventory, picks, answers, args, args.pick, files);
  const output = walkOutput(inventory, picks, args);
  if ("waits" in output) {
    console.error(output.waits);
    return EXIT_CODE.stopped;
  }
  if (args.mode === "rewind" && args.pick !== null) return persist(rewindPick(picks, answers, args.pick), args, inventory, files);
  if (args.mode === "rewind") {
    const asked2 = rewindQuestion(picks, (pick) => labelOfPick(pick, output));
    if (asked2 === null) return refuse2(REFUSAL.nothingRecorded);
    console.log(JSON.stringify({ call: [asked2.question], answers: { rewind: asked2.answers } }, null, 2));
    return EXIT_CODE.ok;
  }
  if (stepFile === void 0) return refuse2(REFUSAL.recordFiles);
  const chosen = readObject(stepFile);
  if ("refused" in chosen) return refuse2(chosen.refused);
  if (!isStepFile(chosen.value)) return refuse2(REFUSAL.stepShape);
  if (output.next.id === "done") return refuse2(REFUSAL.walkDone);
  return persist(recordStep({ step: output.next, built: output, picks, answers, chosen: chosen.value }), args, inventory, files);
}

// scripts/plan/command.ts
var MODE_FLAGS = { "--questions": "questions", "--record": "record", "--rewind": "rewind", "--skip": "skip" };
var VALUE_FLAGS = { "--data": "data", "--connectors": "connectors", "--out": "out" };
var WALK_FILES = 3;
var flagIn = (flags, argument) => argument !== void 0 && Object.hasOwn(flags, argument) ? flags[argument] : void 0;
function parseArgs(argv) {
  const mode = flagIn(MODE_FLAGS, argv[0]) ?? "plan";
  const out = { mode, files: [], pick: null, data: null, connectors: null, out: null, error: null };
  const rest = argv.slice(mode === "plan" ? 0 : 1)[Symbol.iterator]();
  for (const argument of rest) {
    const field = flagIn(VALUE_FLAGS, argument);
    if (field !== void 0) {
      const value = rest.next();
      if (value.done) return { ...out, error: `${argument} needs a value` };
      out[field] = value.value;
    } else if (argument.startsWith("--")) return { ...out, error: `unknown flag '${argument}'` };
    else out.files.push(argument);
  }
  if (mode === "rewind" || mode === "skip") {
    out.pick = out.files.splice(WALK_FILES)[0] ?? null;
    if (out.files.length !== WALK_FILES || mode === "skip" && out.pick === null) return { ...out, error: `${argv[0]} takes an inventory, picks and answers file${mode === "skip" ? " and a pick" : " and an optional pick"}` };
  } else if (mode === "record") {
    if (out.files.length !== WALK_FILES + 1) return { ...out, error: REFUSAL.recordFiles };
  } else if (out.files.length > 2) return { ...out, error: `one inventory file and one ${mode === "questions" ? "picks" : "answers"} file, not ${out.files.length} files` };
  return out;
}
var USAGE = [
  "usage: plan.ts <inventory.json> <answers.json> [--out plan.json] [--data <dir>]",
  "       plan.ts --questions <inventory.json> [<picks.json>] [--data <dir>] [--connectors <Name>,<Name>]",
  "       plan.ts --record <inventory.json> <picks.json> <answers.json> <step.json> [--data <dir>] [--connectors <Name>,<Name>]",
  "       plan.ts --rewind <inventory.json> <picks.json> <answers.json> [<pick>] [--data <dir>] [--connectors <Name>,<Name>]",
  "       plan.ts --skip <inventory.json> <picks.json> <answers.json> <pick> [--data <dir>]"
].join("\n");
function runPlanCommand(argv) {
  blockingStdio();
  const args = parseArgs(argv);
  if (args.error) {
    console.error(`plan.ts: ${args.error}
${USAGE}`);
    return EXIT_CODE.refused;
  }
  if (args.mode === "record" || args.mode === "rewind" || args.mode === "skip") return runRecordMode(args);
  const outFile = args.out ? checkedTarget(args.out) : void 0;
  if (outFile === null) {
    console.error(`plan.ts: ${REFUSAL.outFolder}`);
    return EXIT_CODE.refused;
  }
  const [invFile, second] = args.files;
  if (!invFile || args.mode === "plan" && !second) {
    console.error(USAGE);
    return EXIT_CODE.refused;
  }
  const inventoryRead = readObject(invFile);
  if ("refused" in inventoryRead) {
    console.error(`plan.ts: ${inventoryRead.refused}`);
    return EXIT_CODE.refused;
  }
  const secondRead = second ? readObject(second) : { value: null };
  if ("refused" in secondRead) {
    console.error(`plan.ts: ${secondRead.refused}`);
    return EXIT_CODE.refused;
  }
  const inventory = inventoryRead.value;
  if (!isInventoryFile(inventory)) {
    console.error(`plan.ts: ${invFile}: ${REFUSAL.notInventory}`);
    return EXIT_CODE.refused;
  }
  withRootsMap(inventory, args.data);
  if (args.mode === "questions") {
    const picks = secondRead.value;
    if (picks !== null && !isPicksFile(picks)) {
      console.error(`plan.ts: ${second}: ${REFUSAL.notPicks}`);
      return EXIT_CODE.refused;
    }
    const output = walkOutput(inventory, picks, args);
    if ("waits" in output) {
      console.error(output.waits);
      return EXIT_CODE.stopped;
    }
    console.log(JSON.stringify(output, null, 2));
    return EXIT_CODE.ok;
  }
  const answers = secondRead.value;
  if (!isAnswersFile(answers)) {
    console.error(`plan.ts: ${second}: ${REFUSAL.notAnswers}`);
    return EXIT_CODE.refused;
  }
  const madePlan = plan(inventory, answers, { env: process.env, connectors: args.connectors !== null ? parseConnectors(args.connectors) : null });
  if (outFile) writeJsonNoFollow(outFile, madePlan);
  console.log(renderPlan(madePlan));
  return madePlan.errors.length ? EXIT_CODE.stopped : EXIT_CODE.ok;
}

// scripts/plan.ts
process.exit(runPlanCommand(process.argv.slice(2)));
