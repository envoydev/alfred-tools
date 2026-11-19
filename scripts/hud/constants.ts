// The names hud/ reads claude-hud's setup by: its plugin folder, the launcher files 0.11 copies there, the entry each
// runtime starts, and the Windows places Claude Code looks for Git Bash.
export const HUD_NAME = 'claude-hud';
// claude-hud 0.11's launcher copy and its Git Bash shim, in <account>/plugins/claude-hud/
export const LAUNCHER_FILE = 'statusline.mjs';
export const GIT_BASH_SHIM = 'statusline.cmd';
// the entry a shape starts: node runs the built file, bun the source
export const NODE_SOURCE = 'dist/index.js';
export const BUN_SOURCE = 'src/index.ts';
// Windows' folder when no variable names it
export const DEFAULT_WINDOWS_ROOT = 'C:\\Windows';
// Git for Windows' two Program Files installs, which Claude Code looks in for bash
export const PROGRAM_FILES_BASH = ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe'];
// the folders below the launch folder whose git Claude Code will not run
export const SKIPPED_GIT_FOLDERS = ['node_modules', '.venv', 'env'];
