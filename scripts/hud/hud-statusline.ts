#!/usr/bin/env node
// hud-statusline.js - what is left of claude-hud's setup once 0.5.0 dropped the claude-hud row (spec D8, D9): the
// recognisers that tell claude-hud's own statusLine from any other, and the removal the `retired-plugin` uninstall runs.
// Ported from alfred-code scripts/hud-statusline.js; MOUNT_RE is copied below.
//
// The shapes below are claude-hud 0.8.0's (commands/setup.md; MIT, Copyright (c) 2026 Jarrod Watts), kept byte for
// byte so a line /claude-hud:setup wrote reads as claude-hud's. claude-hud 0.11 (0.11.2's scripts/setup.mjs
// `buildCommand`) writes a launcher line instead - the runtime and a copy of its statusline.mjs at
// <account>/plugins/claude-hud/ (POSIX), a statusline.cmd shim there (Git Bash), or the same cmd.exe line as 0.8.0
// (PowerShell). Re-read on 0.15.0 (2026-11-10): /hud replaces /claude-hud:setup and writes the same launcher lines.
import fs from 'node:fs';
import path from 'node:path';
import { configDir as accountDir } from '../core/account.ts';
import { parseJson } from '../core/json-file.ts';


const HUD = 'claude-hud';

// The Node shape for a bash-run status line (setup.md:199): the marketplace-aware cache glob, the
// newest version by `sort -V`, COLUMNS exported, `exec` with no second `bash -c` layer.
const SORT_V = 'cols=${COLUMNS:-}; case "$cols" in ""|*[!0-9]*) cols=$(stty size 2>/dev/null </dev/tty | awk \'{print $2}\');; esac; case "$cols" in ""|*[!0-9]*) cols=120;; esac; export COLUMNS=$(( cols > 4 ? cols - 4 : 1 )); plugin_dir=$(ls -1d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/*/claude-hud/*/ 2>/dev/null | sort -V | tail -1); exec "{RUNTIME_PATH}" "${plugin_dir}{SOURCE}"';
// What /claude-hud:setup itself writes on macOS / Linux (setup.md:185 node, :180 bun) - read as
// current there, never written here.
const AWK_NODE = 'bash -c \'cols=${COLUMNS:-}; case "$cols" in ""|*[!0-9]*) cols=$(stty size 2>/dev/null </dev/tty | awk \'"\'"\'{print $2}\'"\'"\');; esac; case "$cols" in ""|*[!0-9]*) cols=120;; esac; export COLUMNS=$(( cols > 4 ? cols - 4 : 1 )); plugin_dir=$(ls -d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/*/claude-hud/*/ 2>/dev/null | awk -F/ \'"\'"\'{ print $(NF-1) "\\t" $(0) }\'"\'"\' | grep -E \'"\'"\'^[0-9]+\\.[0-9]+\\.[0-9]+[[:space:]]\'"\'"\' | sort -t. -k1,1n -k2,2n -k3,3n -k4,4n | tail -1 | cut -f2-); exec "{RUNTIME_PATH}" "${plugin_dir}{SOURCE}"\'';
const AWK_BUN = AWK_NODE.replace('exec "{RUNTIME_PATH}" "', 'exec "{RUNTIME_PATH}" --env-file /dev/null "');
// Windows (setup.md:369, the cmd path per :375-377): the launcher below, through the absolute cmd.exe.
const CMD = '{CMD_PATH} /d /s /c ""{RUNTIME_PATH}" "{WRAPPER_PATH}""';
export const SHAPES = { sortV: SORT_V, awkNode: AWK_NODE, awkBun: AWK_BUN, cmd: CMD };
// claude-hud 0.11's own lines (setup.mjs buildCommand), read as current, never written here: POSIX quotes the runtime and
// the launcher in single quotes (a quote inside as '\''), Bun adding --env-file /dev/null; Git Bash runs the shim.
const LAUNCHER_POSIX_RE = /^'((?:[^']|'\\'')+)'( --env-file \/dev\/null)? '((?:[^']|'\\'')+)'$/;
const LAUNCHER_GITBASH = 'exec "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/claude-hud/statusline.cmd"';
const unquote = (word) => word.split("'\\''").join("'");

export const fill = (template, vars) => template.replace(/\{(RUNTIME_PATH|SOURCE|CMD_PATH|WRAPPER_PATH)\}/g, (m, k) => (k in vars ? vars[k] : m));
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A shape as a matcher: the placeholders become captures, everything else literal.
function shapeRe(template, source)
{
    const holes = { RUNTIME_PATH: '([^"]+)', SOURCE: escapeRe(source || ''), CMD_PATH: '([^"]*cmd\\.exe)', WRAPPER_PATH: '([^"]+)' };
    // Windows paths compare without case; the bash shapes byte for byte.
    return new RegExp(`^${escapeRe(template).replace(/\\\{(RUNTIME_PATH|SOURCE|CMD_PATH|WRAPPER_PATH)\\\}/g, (m, k) => holes[k])}$`, template === CMD ? 'i' : '');
}

// setup.md:478-485 - the label a statusLine that is not claude-hud's is reported under.
export function sourceLabel(command)
{
    if (command.includes('claude-pace')) return 'claude-pace';
    if (command.includes('cc-statusline') || command.includes('ccstatusline')) return 'cc-statusline';
    if (/statusline\.(sh|js|py)/.test(command)) return 'statusline script';
    return 'custom';
}

// The absolute cmd.exe (setup.md:375-376): SystemRoot's System32, else the bare name.
function cmdPath(env, exists)
{
    const root = env.SystemRoot || env.SYSTEMROOT || env.windir || 'C:\\Windows';
    const abs = path.win32.join(root, 'System32', 'cmd.exe');
    return exists(abs) ? abs : 'cmd.exe';
}

// PATH's absolute entries, whatever the key's case (Windows spells it Path).
function pathDirs(env, platform)
{
    const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH');
    const p = platform === 'win32' ? path.win32 : path.posix;
    return String((key && env[key]) || '').split(platform === 'win32' ? ';' : ':').filter((d) => d && p.isAbsolute(d));
}

// Windows: is there a Git Bash for Claude Code to run the status line through? claude-hud decides by
// the session shell (setup.md:98-111): a node child sees MSYSTEM, which Git for Windows exports (bash
// does not export OSTYPE). Else Claude Code's own lookup (code.claude.com troubleshoot-install and env-vars):
// CLAUDE_CODE_GIT_BASH_PATH when it names an existing bash / sh, the two Program Files installs,
// then bin\bash.exe of the git on PATH - skipping, as it does, a git in the launch folder (`cwd`), or
// below it in a path holding node_modules or a virtual-environment folder (.venv, env).
export function gitBash(env, exists, cwd = process.cwd())
{
    if (env.MSYSTEM || /^(msys|cygwin)/.test(env.OSTYPE || '')) return true;
    const pinned = env.CLAUDE_CODE_GIT_BASH_PATH;
    if (pinned && /^(bash|sh)(\.exe)?$/i.test(path.win32.basename(pinned)) && exists(pinned)) return true;
    if (['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe'].some((b) => exists(b))) return true;
    const git = pathDirs(env, 'win32').map((d) => path.win32.join(d, 'git.exe')).find((g) => exists(g) && !projectGit(g, cwd));
    if (!git) return false;
    // cmd\git.exe or bin\git.exe sits one level under the install, mingw64\bin\git.exe two.
    const up = path.win32.dirname(path.win32.dirname(git));
    return [up, path.win32.dirname(up)].some((root) => exists(path.win32.join(root, 'bin', 'bash.exe')));
}

// A project's own git, which Claude Code will not run (troubleshoot-install): its folder IS the launch
// folder, or lies below it with node_modules / .venv / env among the path's folders.
function projectGit(git, cwd)
{
    const norm = (p) => path.win32.normalize(p).replace(/\\+$/, '').toLowerCase();
    const dir = norm(path.win32.dirname(git));
    const launch = norm(cwd);
    if (dir === launch) return true;
    return dir.startsWith(`${launch}\\`) && dir.split('\\').some((seg) => ['node_modules', '.venv', 'env'].includes(seg));
}

// What this platform's line should be: the bash form (POSIX, or Windows with Git Bash - forward slashes,
// which bash does not eat as escapes), else the cmd.exe line with `launcher`, the file it runs.
export function expected({ platform, configDir, runtime, env, exists, bash })
{
    // Where claude-hud 0.11's own setup puts its launcher (and, under Git Bash, its statusline.cmd shim).
    const hudDir = path.join(configDir, 'plugins', HUD);
    if (platform !== 'win32' || bash)
    {
        const node = platform === 'win32' ? runtime.replace(/\\/g, '/') : runtime;
        return { shell: 'bash', command: fill(SORT_V, { RUNTIME_PATH: node, SOURCE: 'dist/index.js' }), launcher: null, hudDir };
    }
    const wrapper = path.win32.join(configDir, 'plugins', HUD, 'statusline.mjs');
    return {
        shell: 'cmd',
        command: fill(CMD, { CMD_PATH: cmdPath(env, exists), RUNTIME_PATH: runtime, WRAPPER_PATH: wrapper }),
        launcher: { file: path.join(configDir, 'plugins', HUD, 'statusline.mjs'), wrapper },
        hudDir,
    };
}

// Git Bash spells a Windows path in mount form (`/c/...`, `/cygdrive/c/...`) - the regex is alfred-code's
// stack/hooks/shell-writes.js MOUNT_RE, copied - and `command -v node` drops the .exe.
const MOUNT_RE = /^(?:\/cygdrive)?\/([A-Za-z])(?=\/|$)/;
const winRuntimeExists = (runtime, exists) =>
{
    const native = runtime.replace(MOUNT_RE, (m, d) => `${d.toUpperCase()}:`);
    return exists(native) || exists(`${native}.exe`);
};

// absent | current | stale | foreign. Current = a shape claude-hud 0.8.0 or 0.11 writes on this platform,
// whose runtime (and launcher, where the line runs one) is on disk.
export function classify(statusLine, { platform, want, exists })
{
    if (statusLine !== undefined && (statusLine === null || typeof statusLine !== 'object' || Array.isArray(statusLine)))
        return { state: 'foreign', label: 'custom' };
    const command = statusLine && typeof statusLine.command === 'string' ? statusLine.command : '';
    if (!command.trim()) return { state: 'absent' };
    if (!command.includes(HUD)) return { state: 'foreign', label: sourceLabel(command) };
    const win = platform === 'win32';
    // Windows takes node only (setup.md:128, :153), never the awk form (setup.md:194), and only the
    // form of the shell that will run it: a bash line cannot run without Git Bash, a cmd line under it.
    const shapes = !win ? [[SORT_V, 'dist/index.js'], [AWK_NODE, 'dist/index.js'], [AWK_BUN, 'src/index.ts']]
        : want.shell === 'bash' ? [[SORT_V, 'dist/index.js']] : [[CMD, '']];
    // claude-hud 0.11's launcher lines: this account's own launcher copy, on disk, and (POSIX) a runtime that is.
    const hudDir = want.hudDir || '';
    if (hudDir && !win)
    {
        const m = LAUNCHER_POSIX_RE.exec(command);
        if (m && exists(unquote(m[1])) && unquote(m[3]) === path.join(hudDir, 'statusline.mjs') && exists(unquote(m[3]))) return { state: 'current' };
    }
    if (hudDir && win && want.shell === 'bash' && command === LAUNCHER_GITBASH
        && exists(path.join(hudDir, 'statusline.cmd')) && exists(path.join(hudDir, 'statusline.mjs'))) return { state: 'current' };
    for (const [shape, source] of shapes)
    {
        const m = shapeRe(shape, source).exec(command);
        if (!m) continue;
        if (shape === CMD)
        {
            const [, , runtime, wrapper] = m;
            if (exists(runtime) && wrapper.toLowerCase() === want.launcher.wrapper.toLowerCase() && exists(want.launcher.file)) return { state: 'current' };
        }
        else if (win ? winRuntimeExists(m[1], exists) : exists(m[1])) return { state: 'current' };
    }
    return { state: 'stale' };
}

export function resolveConfigDir({ flag, env = process.env })
{
    return flag ? path.resolve(flag) : accountDir(env);
}

// The account settings.json's statusLine taken out when it is claude-hud's own - a line of a shape claude-hud writes,
// current or stale - and every other key kept; any other line is left and named. Written through a temporary file.
// -> { removed, detail }
export function removeHudStatusLine(configDir, { platform = process.platform, env = process.env, exists = fs.existsSync, cwd = process.cwd() } = {})
{
    const file = path.join(configDir, 'settings.json');
    let text;
    try { text = fs.readFileSync(file, 'utf8'); }
    catch { return { removed: false, detail: `${file} is not there - no statusLine to remove` }; }
    let doc;
    try { doc = parseJson(text); } catch { doc = null; }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { removed: false, detail: `${file} is not a JSON object - its statusLine is left` };
    if (doc.statusLine === undefined) return { removed: false, detail: `${file} has no statusLine` };
    const bash = platform === 'win32' && gitBash(env, exists, cwd);
    const want = expected({ platform, configDir, runtime: platform === 'win32' ? 'node.exe' : 'node', env, exists, bash });
    const { state, label } = classify(doc.statusLine, { platform, want, exists });
    if (state !== 'current' && state !== 'stale') return { removed: false, detail: `the statusLine in ${file} is not claude-hud's (${label || state}) - left as it is` };
    const { statusLine, ...rest } = doc;
    const tmp = `${file}.${process.pid}.tmp`;
    let mode = 0o600;
    try { mode = fs.statSync(file).mode & 0o777; } catch { /* the default */ }
    fs.writeFileSync(tmp, `${JSON.stringify(rest, null, 2)}\n`, { mode });
    fs.renameSync(tmp, file);
    return { removed: true, detail: `removed claude-hud's statusLine from ${file}` };
}

