export const JSON_FILE_REFUSAL = '--json must name a file in a folder tmpdir.mjs made';
export const REFUSED_EXIT_CODE = 2;
export const CLI_MISSING_EXIT_CODE = 3;
export const INVENTORY_VERSION = 1;
export const ALFRED_CODE_PLUGIN = 'alfred-code';
// The marketplace alfred-code's windows-mcp plugins are listed in.
export const WINDOWS_MCP_MARKETPLACE = 'envoydev';
// The `unreadable` entry a marketplace list that failed or is not JSON leaves (update names it when it skips a plugin).
export const MARKETPLACE_LIST_UNREAD = { scope: 'marketplaces', file: 'claude plugin marketplace list --json' } as const;
// The `unreadable` entry a plugin list that failed or is not JSON leaves.
export const PLUGIN_LIST_UNREAD = { scope: 'plugins', file: 'claude plugin list --json' } as const;
// What an unreadable CLI list means for the run, by its entry's `scope` - a list, never a scope a server is written to.
export const LIST_UNREAD_NOTES: ReadonlyMap<string, string> = new Map([
    [PLUGIN_LIST_UNREAD.scope, 'the plugin list could not be read, so this run takes no plugin as installed.'],
    [MARKETPLACE_LIST_UNREAD.scope, 'the marketplace list could not be read, so update offers no plugin update from it.'],
]);
// The scope a parent folder's list records a server of its .mcp.json at: that folder's own Project scope.
export const INHERITED_OWN_SCOPE = 'project';
