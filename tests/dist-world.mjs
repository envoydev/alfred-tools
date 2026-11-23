// The throwaway world every bundle run happens in: a temp home, account folder, project and temp folder, a `claude` stub
// that records each call, and a PATH that reaches no real claude. Plain JavaScript on purpose: tests/dist-smoke.mjs imports
// it and runs on Node 20, which cannot load .ts. It repeats the Windows PATH logic and the keychain stub of
// tests/helpers.ts for that reason - keep the two in step.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = path.join(import.meta.dirname, '..');
const CLAUDE_VERSION_LINE = '2.1.330 (Claude Code)';
const CLAIMED_BY_STUB = ['claude'];
// the Node script the Windows claude.cmd shim runs
const WINDOWS_STUB_SCRIPT = 'claude-stub.mjs';
const KEYCHAIN_NOT_FOUND_EXIT = 44;
// The machine table and plan read the inventory as: their text depends on the inventory's os and arch (a table lists
// the rows offered on that OS), so the chain fixes both and one expectation holds on every system.
const FIXED_OS = 'linux';
const FIXED_ARCH = 'x64';
// What macOS `security` answers when a lookup finds nothing: under a throwaway HOME a save would open the system's
// 'Keychain Not Found' dialog (2026-11-19).
const KEYCHAIN_STUB = `#!/bin/sh
case "$1" in find-*) echo 'security: The specified item could not be found in the keychain.' >&2; exit ${KEYCHAIN_NOT_FOUND_EXIT};; esac
exit 1
`;
// the variables a Windows child needs to start a shell and find programs
const WINDOWS_SYSTEM_VARS = ['SystemRoot', 'SYSTEMROOT', 'ComSpec', 'COMSPEC', 'PATHEXT', 'windir'];

/** @typedef {{ status: number | null, stdout: string, stderr: string }} Run */

export const REFUSING = ['plan', 'apply', 'fetch', 'table', 'prereq', 'sign-in', 'update', 'fix'];

// On Windows a spawn looks for `<name>.exe` or `.com` on PATH and never for the `.cmd` shim in `bin`, so the folders
// holding a real claude.exe (the native installer's) are left out: the spawn then fails and claude-cli.ts takes its
// cmd.exe route to the shim.
function inheritedPath()
{
    const parts = (process.env.PATH ?? process.env.Path ?? '').split(path.delimiter).filter(Boolean);
    if (process.platform !== 'win32') return parts.join(path.delimiter);
    return parts
        .filter((folder) => !CLAIMED_BY_STUB.some((name) => ['.exe', '.com'].some((ext) => fs.existsSync(path.join(folder, `${name}${ext}`)))))
        .join(path.delimiter);
}

function writeClaudeStub(bin, marker)
{
    if (process.platform === 'win32')
    {
        // claude-cli.ts caret-escapes each argument twice for a .cmd shim, as npm's claude.cmd needs: a batch test on
        // %1 then reads `^"--version^"` and cmd.exe stops with a syntax error. So the shim hands %* to node, as npm's does.
        const script = path.join(bin, WINDOWS_STUB_SCRIPT);
        fs.writeFileSync(script, [
            "import fs from 'node:fs';",
            `fs.appendFileSync(${JSON.stringify(marker)}, 'called\\n');`,
            `console.log(process.argv[2] === '--version' ? ${JSON.stringify(CLAUDE_VERSION_LINE)} : '[]');`,
            '',
        ].join('\n'));
        fs.writeFileSync(path.join(bin, 'claude.cmd'), `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`);
        return;
    }
    const script = `#!/bin/sh
echo called >> '${marker}'
case "$1" in --version) echo '${CLAUDE_VERSION_LINE}';; *) echo '[]';; esac
`;
    const file = path.join(bin, 'claude');
    fs.writeFileSync(file, script);
    fs.chmodSync(file, 0o755);
}

function writeKeychainStub(bin)
{
    if (process.platform !== 'darwin') return;
    const file = path.join(bin, 'security');
    fs.writeFileSync(file, KEYCHAIN_STUB);
    fs.chmodSync(file, 0o755);
}

/**
 * @returns {{ dir: string, home: string, project: string, bin: string, marker: string, env: Record<string, string>, clean(): void }}
 */
export function distWorld()
{
    // realpath: macOS reports the temp folder as /var/... and a child sees /private/var/...
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dw-')));
    const home = path.join(dir, 'home');
    const account = path.join(dir, 'account');
    const project = path.join(dir, 'project');
    const temp = path.join(dir, 'tmp');
    const bin = path.join(dir, 'bin');
    for (const folder of [home, account, project, temp, bin]) fs.mkdirSync(folder, { recursive: true });
    const marker = path.join(dir, 'claude-called');
    writeClaudeStub(bin, marker);
    writeKeychainStub(bin);
    // built from nothing: no variable of the shell that runs the test reaches a child
    const env = {
        HOME: home,
        USERPROFILE: home,
        CLAUDE_CONFIG_DIR: account,
        TMPDIR: temp,
        TEMP: temp,
        TMP: temp,
        PATH: `${bin}${path.delimiter}${inheritedPath()}`,
    };
    if (process.platform === 'win32')
        for (const name of WINDOWS_SYSTEM_VARS)
            if (process.env[name] !== undefined) env[name] = process.env[name];
    return { dir, home, project, bin, marker, env, clean: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/**
 * Runs one entry of the plugin - `scripts/<entry>.ts` or `dist/<entry>.mjs`, named from the repo root - with the
 * world's node, folder and environment only.
 * @param {{ project: string, env: Record<string, string> }} world
 * @param {string} file
 * @param {string[]} args
 * @returns {Run}
 */
export function runEntry(world, file, args)
{
    const result = spawnSync(process.execPath, [path.join(REPO_ROOT, file), ...args], {
        cwd: world.project,
        env: world.env,
        encoding: 'utf8',
        windowsHide: true,
    });
    return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

// every spelling a path takes in output: raw, with forward slashes, and escaped inside JSON
function spellings(folder)
{
    return [...new Set([JSON.stringify(folder).slice(1, -1), folder, folder.replace(/\\/g, '/')])];
}

function replaceFolder(folder, label, text)
{
    return spellings(folder).reduce((out, form) => out.split(form).join(label), text);
}

/**
 * Replaces what differs from one machine or run to the next with a fixed marker.
 * @param {{ dir: string }} world
 * @param {string} text
 * @returns {string}
 */
export function mask(world, text)
{
    return replaceFolder(world.dir, '<WORLD>', text)
        .replaceAll(`"os": "${process.platform}"`, '"os": "<OS>"')
        .replaceAll(`"os":"${process.platform}"`, '"os":"<OS>"')
        .replaceAll(`"arch": "${process.arch}"`, '"arch": "<ARCH>"')
        .replaceAll(`"arch":"${process.arch}"`, '"arch":"<ARCH>"');
}

const maskRun = (world, run, ...folders) =>
{
    const apply = (text) => folders.reduce((out, [folder, label]) => replaceFolder(folder, label, out), text);
    return { status: run.status, stdout: mask(world, apply(run.stdout)), stderr: mask(world, apply(run.stderr)) };
};

/**
 * The parity chain: tmpdir makes a folder, inventory writes a file into it, table and plan --questions read it.
 * @param {{ dir: string, project: string, env: Record<string, string> }} world
 * @param {'ts' | 'mjs'} ext
 * @returns {{ tmpdir: Run, inventory: Run & { file: string | null }, table: Run, plan: Run }}
 */
export function chain(world, ext)
{
    const entry = (name) => (ext === 'ts' ? `scripts/${name}.ts` : `dist/${name}.mjs`);
    const made = runEntry(world, entry('tmpdir'), []);
    const tmpFolder = made.stdout.trim();
    const tmp = [tmpFolder, '<TMP>'];
    const inventoryFile = path.join(tmpFolder, 'inv.json');
    const inventory = runEntry(world, entry('inventory'), ['--project', world.project, '--json', inventoryFile]);
    const file = fs.existsSync(inventoryFile) ? fs.readFileSync(inventoryFile, 'utf8') : null;
    if (file !== null) fs.writeFileSync(inventoryFile, JSON.stringify({ ...JSON.parse(file), os: FIXED_OS, arch: FIXED_ARCH }));
    const table = runEntry(world, entry('table'), [inventoryFile]);
    const plan = runEntry(world, entry('plan'), ['--questions', inventoryFile]);
    return {
        tmpdir: maskRun(world, made, tmp),
        inventory: { ...maskRun(world, inventory, tmp), file: file === null ? null : mask(world, replaceFolder(tmpFolder, '<TMP>', file)) },
        table: maskRun(world, table, tmp),
        plan: maskRun(world, plan, tmp),
    };
}

export const sha256Of = (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`;

/**
 * The shape tests/dist-smoke.mjs keeps its expectation in: the short outputs whole, the long ones (the inventory file,
 * the table, the plan's questions) as a digest, so the file stays readable and a drift still shows.
 * @param {ReturnType<typeof chain>} result
 */
export function condense(result)
{
    const { tmpdir, inventory, table, plan } = result;
    return {
        tmpdir,
        inventory: { status: inventory.status, stdout: inventory.stdout, stderr: inventory.stderr, file: sha256Of(inventory.file ?? '') },
        table: { status: table.status, stdout: sha256Of(table.stdout), stderr: table.stderr },
        plan: { status: plan.status, stdout: sha256Of(plan.stdout), stderr: plan.stderr },
    };
}
