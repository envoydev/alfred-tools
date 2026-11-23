#!/usr/bin/env node
// Built from the TypeScript in scripts/ by npm run build - do not edit.
import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);

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

// scripts/sign-in/effects.ts
import { spawn, spawnSync as spawnSync2 } from "node:child_process";
import fs2 from "node:fs";
import readline from "node:readline";

// scripts/core/account.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

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
var CLI_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
var FILES = { secrets: ".mcps-secrets", helper: "mcp-headers.js", record: "preferred-tools.json", map: "roots.json", bridge: "mcp-bridge.js", list: "mcps.json", signIns: "mcp-remote-v1", serenaContext: "serena-context.yml", macosExclude: "macos-mcp.toml" };
var MCP_JSON = ".mcp.json";

// scripts/core/account.ts
var homeDir = (env = process.env) => env.HOME || env.USERPROFILE || os.homedir();
var accountFile = (env = process.env) => env.CLAUDE_CONFIG_DIR ? path.join(path.resolve(env.CLAUDE_CONFIG_DIR), ".claude.json") : path.join(homeDir(env), ".claude.json");
function projectKey(dir) {
  try {
    return fs.realpathSync.native(dir);
  } catch {
    return path.resolve(dir);
  }
}
function localRoot(project) {
  if (fs.existsSync(path.join(project, ".git")) || !fs.existsSync(project)) return project;
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: project, encoding: "utf8", windowsHide: true });
  return result.status === 0 && result.stdout.trim() ? path.resolve(result.stdout.trim()) : project;
}
function readState(file, isDoc) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
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
  if (platform !== "win32") return [projectKey(project), path.resolve(project)].find((key) => Boolean(projects[key]));
  let real = null;
  try {
    real = fs.realpathSync.native(project);
  } catch {
  }
  const want = [path.win32.resolve(project), real].filter((folder) => Boolean(folder)).map((folder) => folder.replace(/\\/g, "/"));
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
    const state = readState(path.join(project, MCP_JSON), isAccountProject);
    return state.doc && state.doc.mcpServers ? state.doc.mcpServers[name] : void 0;
  }
  const account = readAccount(env, project);
  return (scope === "user" ? account.user : account.local)[name];
}

// scripts/core/cmd-line.ts
import path2 from "node:path";
function argvQuote(arg) {
  let out = '"';
  let slashes = 0;
  for (const character of String(arg)) {
    if (character === "\\") {
      slashes++;
      continue;
    }
    out += character === '"' ? `${"\\".repeat(slashes * 2 + 1)}"` : `${"\\".repeat(slashes)}${character}`;
    slashes = 0;
  }
  return `${out}${"\\".repeat(slashes * 2)}"`;
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

// scripts/sign-in/constants.ts
var CLIENT_BIN = "mcp-remote-client";
var AUTH_TIMEOUT_FLAG = "--auth-timeout";
var AUTH_TIMEOUT_SECONDS = 300;
var RUN_TIMEOUT_MS = 32e4;
var TIMEOUT_ERROR_CODE = "ETIMEDOUT";
var TOKENS_SUFFIX = "_tokens.json";
var SCOPES = ["project", "local", "user"];
var USAGE = "usage: sign-in.ts <name> <project|local|user>";
var EXIT_CODE = { ok: 0, failed: 1, usage: 2 };
var LINE = {
  signedIn: "signed in",
  notSharedForm: "not the shared sign-in form (mcp-remote with its sign-in folder) - nothing to sign in",
  noTokens: "the client finished but no sign-in was stored"
};
var AUTHORIZE_MARKER = "Please authorize this client by visiting:";
var NO_BROWSER_MARKER = "Could not open a browser automatically";
var PID_PREFIX_PATTERN = /^\[\d+\]\s*/;
var LINK_PROTOCOL = "https:";
var UNSAFE_LINK_CHARACTER = /[\s\u0000-\u001f\u007f-\u009f]/;
var MAX_LINE_LENGTH = 65536;
var KILL_GRACE_MS = 5e3;
var STDERR_GRACE_MS = 2e3;
var SIGNAL_EXIT_CODE = /* @__PURE__ */ new Map([["SIGINT", 130], ["SIGTERM", 143]]);

// scripts/sign-in/authorize-link.ts
function httpsLinkOf(text) {
  if (UNSAFE_LINK_CHARACTER.test(text)) return null;
  try {
    return new URL(text).protocol === LINK_PROTOCOL ? text : null;
  } catch {
    return null;
  }
}
function watchAuthorize() {
  let link = null;
  let afterMarker = false;
  let announced = false;
  return {
    link: () => link,
    feed(rawLine) {
      if (rawLine.length > MAX_LINE_LENGTH) {
        afterMarker = false;
        return null;
      }
      const text = rawLine.replace(PID_PREFIX_PATTERN, "").trim();
      const wasAfterMarker = afterMarker;
      afterMarker = text.startsWith(AUTHORIZE_MARKER);
      if (wasAfterMarker && link === null) link = httpsLinkOf(text);
      if (!text.startsWith(NO_BROWSER_MARKER) || announced || link === null) return null;
      announced = true;
      return link;
    }
  };
}

// scripts/sign-in/sign-in.ts
import crypto from "node:crypto";
import path3 from "node:path";
function signInCommand(entry, platform) {
  const parts = signInParts(entry);
  if (!parts) return null;
  const args = ["-y", "-p", parts.pin, CLIENT_BIN, parts.url, AUTH_TIMEOUT_FLAG, String(AUTH_TIMEOUT_SECONDS)];
  const launch = platform === "win32" ? { command: "cmd", args: ["/c", "npx", ...args] } : { command: "npx", args };
  const env = {};
  for (const [variableName, value] of Object.entries(entry.env || {})) if (typeof value === "string") env[variableName] = value;
  return { ...launch, env };
}
var tokensFileOf = (dir, url) => path3.join(dir, FILES.signIns, `${crypto.createHash("md5").update(url).digest("hex")}${TOKENS_SUFFIX}`);
function failureOf(result, link) {
  if (result.error && errorCode(result.error) === TIMEOUT_ERROR_CODE) {
    return `sign-in failed: gave up after ${AUTH_TIMEOUT_SECONDS} s waiting for the browser sign-in${link ? ` - the link was ${link}; run it again and open the link it prints` : ""}`;
  }
  if (result.error) return `sign-in failed: ${result.error.message}`;
  if (result.signal) return `sign-in failed: the client was stopped by ${result.signal} (it waits ${AUTH_TIMEOUT_SECONDS} s for the browser)`;
  return `sign-in failed: exit ${result.status}`;
}

// scripts/sign-in/effects.ts
var signInSpawnArgs = spawnArgs;
var running = /* @__PURE__ */ new Set();
function stopTree(child) {
  if (process.platform === "win32") {
    if (child.exitCode === null && child.signalCode === null) spawnSync2("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
    return;
  }
  const pid = child.pid;
  if (pid === void 0) return;
  const kill = (signal) => {
    try {
      process.kill(-pid, signal);
    } catch {
    }
  };
  kill("SIGTERM");
  setTimeout(() => kill("SIGKILL"), KILL_GRACE_MS).unref();
}
var stopRunningClients = () => {
  for (const child of running) stopTree(child);
};
function stopClientOnSignal(target = process, exit = process.exit, stop = stopRunningClients) {
  for (const [signal, code] of SIGNAL_EXIT_CODE) {
    target.once(signal, () => {
      stop();
      exit(code);
    });
  }
}
var realRun = (command, args, { cwd, env, timeoutMs }, onStderrLine) => new Promise((resolve) => {
  const shim = process.platform === "win32" ? shimOfLaunch(command, args, env, fs2.existsSync, cwd) : void 0;
  const launch = signInSpawnArgs(command, args, process.platform, shim);
  let child;
  try {
    child = spawn(launch.file, launch.args, { cwd, env, windowsHide: true, stdio: ["ignore", "ignore", "pipe"], shell: launch.shell, detached: process.platform !== "win32" });
  } catch (caught) {
    resolve({ status: null, signal: null, error: caught instanceof Error ? caught : new Error(String(caught)) });
    return;
  }
  running.add(child);
  let timedOut = false;
  let settled = false;
  let drainTimer;
  const finish = (result) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    clearTimeout(drainTimer);
    running.delete(child);
    resolve(result);
  };
  const timer = setTimeout(() => {
    timedOut = child.exitCode === null && child.signalCode === null;
    stopTree(child);
  }, timeoutMs);
  if (child.stderr) readline.createInterface({ input: child.stderr, crlfDelay: Infinity }).on("line", onStderrLine);
  child.on("error", (error) => finish({ status: null, signal: null, error }));
  child.on("exit", () => {
    drainTimer = setTimeout(() => child.stderr?.destroy(), STDERR_GRACE_MS);
  });
  child.on("close", (status, signal) => {
    const error = timedOut ? Object.assign(new Error("the sign-in run timed out"), { code: TIMEOUT_ERROR_CODE }) : null;
    finish({ status, signal: timedOut ? signal || "SIGTERM" : signal, error });
  });
});
async function signIn(name, scope, { env, run, project = process.cwd(), print = () => {
} }) {
  const entry = readRegistration(name, scope, project, env);
  if (!entry) return { ok: false, line: `no server '${name}' at ${scope} scope` };
  const launch = signInCommand(entry, process.platform);
  const parts = signInParts(entry);
  if (!launch || !parts) return { ok: false, line: LINE.notSharedForm };
  const watch = watchAuthorize();
  const onStderrLine = (line) => {
    const link = watch.feed(line);
    if (link) print(`${name}: no browser opened - open this link to sign in: ${link}`);
  };
  const result = await run(launch.command, launch.args, { cwd: project, env: { ...env, ...launch.env }, timeoutMs: RUN_TIMEOUT_MS }, onStderrLine);
  if (result.error || result.signal || result.status !== 0) return { ok: false, line: failureOf(result, watch.link()) };
  if (!fs2.existsSync(tokensFileOf(parts.dir, parts.url))) return { ok: false, line: LINE.noTokens };
  return { ok: true, line: LINE.signedIn };
}
var commandIo = (options) => ({
  env: options.env ?? process.env,
  run: options.run ?? realRun,
  project: options.project ?? process.cwd(),
  log: options.log ?? ((...lines) => console.log(lines.join("\n"))),
  warn: (line) => console.error(line)
});

// scripts/sign-in/command.ts
async function runSignInCommand(argv, options = {}) {
  const { env, run, project, log, warn } = commandIo(options);
  const [name, scope] = argv;
  if (!name || !scope || !SCOPES.includes(scope)) {
    warn(USAGE);
    return EXIT_CODE.usage;
  }
  const result = await signIn(name, scope, { env, run, project, print: (line) => log(line) });
  log(`${name}: ${result.line}`);
  return result.ok ? EXIT_CODE.ok : EXIT_CODE.failed;
}

// scripts/sign-in.ts
blockingStdio();
stopClientOnSignal();
exitWhenSettled(runSignInCommand(process.argv.slice(2)), "sign-in");
