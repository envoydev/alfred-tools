// The named values cursor/ reads: where Cursor keeps its MCP file, and the commands that tell Cursor is installed.
export const CURSOR_FOLDER = '.cursor';
export const CURSOR_FILE = 'mcp.json';
// Cursor's command-line programs; bare `agent` is left out, the name is too common
export const CURSOR_COMMANDS = ['cursor-agent', 'cursor'] as const;
// the file endings a command has on Windows, the bare name last
export const WINDOWS_COMMAND_EXTENSIONS = ['.exe', '.cmd', ''] as const;
