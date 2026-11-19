// The values entries/ names: the flags a catalog route's optionalArgs adds, and the places of a bridge launch's arguments.

// Read back from an installed entry (currentOf), and edited by a change of the answer (plan/pick/entry.ts).
export const EXECUTABLE_PATH_FLAG = '--executable-path';
export const API_KEY_FLAG = '--api-key';

// A bridge launch, `node <path>/mcp-bridge.js <template> <KEY> <SCHEME> <pkg> [<root>] [--header <pair>]...`: each
// argument's place counted from the bridge's own path.
export const BRIDGE_SLOT = { path: 0, template: 1, keyName: 2, scheme: 3, packageSpec: 4, globalRoot: 5 } as const;

// macos-mcp's own config file under the home: when it is there, turning a tool off makes the server read the root's file in
// its place (spec D4)
export const MACOS_USER_CONFIG = ['.macos-mcp', 'config.toml'] as const;

// The separators that end a folder path: a root written with one still names the same folder
export const TRAILING_SEPARATORS = /[\\/]+$/;

// A stdio key launcher, `node <path>/mcp-bridge.js --run <ENV>=<KEY_NAME>[?] [<global root>] -- <command> <args>...`: the
// bridge's own flag, the end of its own arguments and the mark of an optional key. RUN_PAIR is the bridge's pattern for
// the `<ENV>=<KEY_NAME>[?]` argument.
export const RUN = { flag: '--run', end: '--', optional: '?' } as const;
// the ENV names the bridge keeps for itself (its RESERVED_ENV): a launcher naming one is not a launcher.
export const RUN_RESERVED_ENV = /^PT_BRIDGE_/;
export const RUN_PAIR = /^([A-Za-z_][A-Za-z0-9_]*)=([A-Za-z_][A-Za-z0-9_]*)(\?)?$/;
