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
