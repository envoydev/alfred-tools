// hud-statusline.js after 0.5.0 (spec D8, D9): the recognisers that tell claude-hud's own statusLine from any other, and
// the removal the retired-plugin uninstall runs. Every case runs against a throwaway account dir.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as hud from '../scripts/hud/hud-statusline.ts';

const { classify, expected, gitBash, resolveConfigDir, removeHudStatusLine } = hud;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-statusline-'));
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));
let seq = 0;
const account = (settings?: unknown) =>
{
    const dir = path.join(TMP, `acct-${seq++}`);
    fs.mkdirSync(dir, { recursive: true });
    if (settings !== undefined) fs.writeFileSync(path.join(dir, 'settings.json'), typeof settings === 'string' ? settings : JSON.stringify(settings, null, 2));
    return dir;
};
const read = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
const NODE = process.execPath;

const WIN_NODE = 'C:\\Program Files\\nodejs\\node.exe';
const CMD_EXE = 'C:\\Windows\\System32\\cmd.exe';
const WIN_ENV = { SystemRoot: 'C:\\Windows' };
// A mocked Windows disk: the paths named (compared with backslashes) - never the machine's own.
const winDisk = (...present: string[]) => (p: string) => present.includes(String(p).replace(/\//g, '\\'));
const cmdLine = (node: string, wrapper: string) => `${CMD_EXE} /d /s /c ""${node}" "${wrapper}""`;

// The exact 0.8.0 text (commands/setup.md:199), pinned here independently of the script's own copy.
const SORT_V_FOR = (rt: string) => 'cols=${COLUMNS:-}; case "$cols" in ""|*[!0-9]*) cols=$(stty size 2>/dev/null </dev/tty | awk \'{print $2}\');; esac; '
    + 'case "$cols" in ""|*[!0-9]*) cols=120;; esac; export COLUMNS=$(( cols > 4 ? cols - 4 : 1 )); '
    + 'plugin_dir=$(ls -1d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/*/claude-hud/*/ 2>/dev/null | sort -V | tail -1); '
    + `exec "${rt}" "\${plugin_dir}dist/index.js"`;

const winLine = (env: Record<string, string>, present: string[], cwd = 'D:\\proj') =>
{
    const exists = winDisk(WIN_NODE, CMD_EXE, ...present);
    return expected({ platform: 'win32', configDir: 'C:\\Users\\me\\.claude', runtime: WIN_NODE, env: { ...WIN_ENV, ...env }, exists, bash: gitBash({ ...WIN_ENV, ...env }, exists, cwd) });
};
const CMD_FORM = /^C:\\Windows\\System32\\cmd\.exe \/d \/s \/c ""/;

test('the account dir: --config-dir, else CLAUDE_CONFIG_DIR, else ~/.claude - the installer\'s rule', () =>
{
    const home = path.join(TMP, 'home');
    assert.strictEqual(resolveConfigDir({ flag: '/x/acct', env: { CLAUDE_CONFIG_DIR: '/y', HOME: home } }), path.resolve('/x/acct'));
    assert.strictEqual(resolveConfigDir({ env: { CLAUDE_CONFIG_DIR: '/y', HOME: home } }), path.resolve('/y'));
    assert.strictEqual(resolveConfigDir({ env: { HOME: home } }), path.join(home, '.claude'));
});

test('Windows: Git Bash is found as Claude Code finds it - OSTYPE, CLAUDE_CODE_GIT_BASH_PATH (bash / sh names only), Program Files, the git on PATH', () =>
{
    const bash = SORT_V_FOR('C:/Program Files/nodejs/node.exe');
    const none = winLine({}, []);
    assert.match(none.command, CMD_FORM, 'no Git Bash: the cmd.exe line');
    assert.ok(none.launcher, 'and its launcher');
    assert.strictEqual(winLine({ OSTYPE: 'msys' }, []).command, bash);
    assert.strictEqual(winLine({ CLAUDE_CODE_GIT_BASH_PATH: 'D:\\tools\\Git\\bin\\bash.exe' }, ['D:\\tools\\Git\\bin\\bash.exe']).command, bash);
    assert.match(winLine({ CLAUDE_CODE_GIT_BASH_PATH: 'D:\\tools\\Git\\git-bash.exe' }, ['D:\\tools\\Git\\git-bash.exe']).command, CMD_FORM, 'a wrong-named file is ignored');
    assert.strictEqual(winLine({}, ['C:\\Program Files\\Git\\bin\\bash.exe']).command, bash);
    assert.strictEqual(winLine({ Path: 'C:\\Windows;E:\\Git\\cmd' }, ['E:\\Git\\cmd\\git.exe', 'E:\\Git\\bin\\bash.exe']).command, bash, 'bin\\bash.exe of the git on PATH');
    assert.match(winLine({ PATH: 'D:\\proj' }, ['D:\\proj\\git.exe', 'D:\\bin\\bash.exe']).command, CMD_FORM, 'a git in the launch folder is skipped');
    assert.match(winLine({ PATH: 'D:\\proj\\node_modules\\git\\cmd' }, ['D:\\proj\\node_modules\\git\\cmd\\git.exe', 'D:\\proj\\node_modules\\git\\bin\\bash.exe']).command, CMD_FORM, 'and one below it in node_modules');
});

test('classify: absent, foreign with its label, current for a live runtime, stale for a gone one', () =>
{
    const want = expected({ platform: 'darwin', configDir: '/acct', runtime: NODE, env: {}, exists: fs.existsSync, bash: false });
    const c = (statusLine: unknown) => classify(statusLine, { platform: 'darwin', want, exists: fs.existsSync });
    assert.deepStrictEqual(c(undefined), { state: 'absent' });
    assert.deepStrictEqual(c({ type: 'command', command: 'bash ~/statusline.sh' }), { state: 'foreign', label: 'statusline script' });
    assert.deepStrictEqual(c({ type: 'command', command: SORT_V_FOR(NODE) }), { state: 'current' });
    assert.deepStrictEqual(c({ type: 'command', command: SORT_V_FOR('/gone/node') }), { state: 'stale' });
    assert.deepStrictEqual(c('a string'), { state: 'foreign', label: 'custom' });
});

test('Windows cmd line: current only with a live node AND this account\'s own launcher', () =>
{
    const configDir = 'C:\\Users\\me\\.claude';
    const wrapper = path.win32.join(configDir, 'plugins', 'claude-hud', 'statusline.mjs');
    const exists = winDisk(WIN_NODE, CMD_EXE, wrapper);
    const want = expected({ platform: 'win32', configDir, runtime: WIN_NODE, env: WIN_ENV, exists, bash: false });
    want.launcher!.file = wrapper;
    const state = (command: string) => classify({ type: 'command', command }, { platform: 'win32', want, exists }).state;
    assert.strictEqual(state(cmdLine(WIN_NODE, wrapper)), 'current');
    assert.strictEqual(state(cmdLine('C:\\gone\\node.exe', wrapper)), 'stale', 'a node that is gone');
    assert.strictEqual(state(cmdLine(WIN_NODE, 'C:\\Users\\other\\.claude\\plugins\\claude-hud\\statusline.mjs')), 'stale', 'another account\'s launcher');
});

test('the claude-hud statusLine is removed only when it is the plugin\'s own', () =>
{
    // claude-hud's own, current: removed, every other key kept
    const own = account({ model: 'opus', statusLine: { type: 'command', command: SORT_V_FOR(NODE), refreshInterval: 5 }, permissions: { deny: ['Read(//**/.mcps-secrets)'] } });
    const r = removeHudStatusLine(own, { platform: 'darwin' });
    assert.deepStrictEqual([r.removed, r.detail], [true, `removed claude-hud's statusLine from ${path.join(own, 'settings.json')}`]);
    assert.deepStrictEqual(read(own), { model: 'opus', permissions: { deny: ['Read(//**/.mcps-secrets)'] } });
    // claude-hud's, stale (a runtime that is gone): removed too
    const stale = account({ statusLine: { type: 'command', command: SORT_V_FOR('/gone/node') } });
    assert.strictEqual(removeHudStatusLine(stale, { platform: 'darwin' }).removed, true);
    assert.deepStrictEqual(read(stale), {});
    // another line: left and named
    const mine = { statusLine: { type: 'command', command: 'bash ~/my-own-line.sh' } };
    const foreign = account(mine);
    const before = fs.readFileSync(path.join(foreign, 'settings.json'), 'utf8');
    const f = removeHudStatusLine(foreign, { platform: 'darwin' });
    assert.strictEqual(f.removed, false);
    assert.match(f.detail, /is not claude-hud's \(custom\) - left as it is$/);
    assert.strictEqual(fs.readFileSync(path.join(foreign, 'settings.json'), 'utf8'), before);
    // no statusLine, no file, not JSON: nothing written
    assert.match(removeHudStatusLine(account({ model: 'x' }), { platform: 'darwin' }).detail, /has no statusLine$/);
    assert.match(removeHudStatusLine(account(), { platform: 'darwin' }).detail, /is not there/);
    const bad = account('{ nope');
    assert.match(removeHudStatusLine(bad, { platform: 'darwin' }).detail, /is not a JSON object/);
    assert.strictEqual(fs.readFileSync(path.join(bad, 'settings.json'), 'utf8'), '{ nope');
});
