export const JSON_FILE_REFUSAL = '--json must name a file in a folder tmpdir.ts made';
export const REFUSED_EXIT_CODE = 2;
export const CLI_MISSING_EXIT_CODE = 3;
export const INVENTORY_VERSION = 1;
export const ALFRED_CODE_PLUGIN = 'alfred-code';
// The marketplace alfred-code's windows-mcp plugins are listed in.
export const WINDOWS_MCP_MARKETPLACE = 'envoydev';
// The `unreadable` entry a marketplace list that failed or is not JSON leaves (update names it when it skips a plugin).
export const MARKETPLACE_LIST_UNREAD = { scope: 'marketplaces', file: 'claude plugin marketplace list --json' } as const;
