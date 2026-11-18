// The values core/cmd-line.ts reads: where a command is looked up on Windows and which files are shims.
export const PATH_LIST_SEPARATOR = ';';
export const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';
export const PATH_SEPARATOR_PATTERN = /[\\/]/;
// a file cmd.exe reads a second time through its %*: a .cmd or .bat
export const SHIM_FILE_PATTERN = /\.(?:cmd|bat)$/i;
// the name rule, used only when the name resolves to no file: npm, npx, pnpm and yarn are shims on Windows
export const SHIM_NAME_PATTERN = /^(?:(?:npm|npx|pnpm|yarn)|.*\.(?:cmd|bat))$/i;
