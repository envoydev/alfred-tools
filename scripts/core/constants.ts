// The named values core/ reads: how a command is looked up and quoted on Windows, the claude CLI's limits, the names
// a temp-folder write refuses, and the names several features share: a root folder's, the recommended mark, .mcp.json
// and the scope list.

// ---- Windows command lines (cmd-line.ts) ----------------------------------------------------------------------------
export const PATH_LIST_SEPARATOR = ';';
export const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';
export const PATH_SEPARATOR_PATTERN = /[\\/]/;
// a PATH entry written in double quotes, which cmd.exe reads without them
export const QUOTED_PATH_ENTRY_PATTERN = /^"(.*)"$/;
// a file cmd.exe reads a second time through its %*: a .cmd or .bat
export const SHIM_FILE_PATTERN = /\.(?:cmd|bat)$/i;
// the name rule, used only when the name resolves to no file: npm, npx, pnpm and yarn are shims on Windows
export const SHIM_NAME_PATTERN = /^(?:(?:npm|npx|pnpm|yarn)|.*\.(?:cmd|bat))$/i;
// a launch through cmd.exe: the program cmd or cmd.exe, then /c before the program it starts
export const CMD_PROGRAM_PATTERN = /^cmd(\.exe)?$/i;
export const CMD_RUN_FLAG_PATTERN = /^\/c$/i;
// the characters cmd.exe reads as its own, each escaped with a caret (cross-spawn's metaCharsRegExp)
export const CMD_META_PATTERN = /([()\][%!^"`<>&|;, *?])/g;

// ---- the claude CLI (claude-cli.ts) ---------------------------------------------------------------------------------
export const CLI_TIMEOUT_MS = 120000;
export const CLI_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

// ---- a write into a temp folder (temp-write.ts) ---------------------------------------------------------------------
// the last parts of a path that name no file
export const NO_FILE_NAMES = new Set(['', '.', '..']);

// ---- a root folder's names (roots/roots.ts re-exports FILES, ROOT_NAME, FORMER_ROOT_NAME) ---------------------------
// the files a root folder holds, and the roots map's name in the plugin's data folder
export const FILES = { secrets: '.mcps-secrets', helper: 'mcp-headers.js', record: 'preferred-tools.json', map: 'roots.json', bridge: 'mcp-bridge.js', list: 'mcps.json', signIns: 'mcp-remote-v1', serenaContext: 'serena-context.yml', macosExclude: 'macos-mcp.toml' };
// the root folder's name, and the one this plugin gave it under its former name (preferred-tools until 0.4.0, spec D3)
export const ROOT_NAME = '.alfred-tools';
export const FORMER_ROOT_NAME = '.preferred-tools';
// alfred-code's data folder in a project or the home: its workspace record sits in it, and it can serve as a root
export const ALFRED_DATA = '.alfred';

// ---- a question's options (plan/, inventory/ and update/ mark the recommended one) ----------------------------------
// the mark on a recommended option's label: every question builder adds it, and plan/record-resolve.ts takes it off
export const RECOMMENDED_SUFFIX = ' (Recommended)';

// ---- Claude Code's files (core/, fix/, inventory/ and mcps-list/ read or name them) ---------------------------------
// the project's shared file of MCP servers, at a project's root and at a plugin's
export const MCP_JSON = '.mcp.json';

// ---- a registration's scopes (inventory/ and plan/ read them) -------------------------------------------------------
// every scope a registration or a plugin install can have, in the inventory table's column order
export const ALL_SCOPES: readonly string[] = ['local', 'project', 'user'];
