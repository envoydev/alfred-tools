// The start limit guard: Claude Code gives a server 30 s to start, and npx asks the npm registry first (measured;
// a uvx start took 54.6 s on Windows; docker unmeasured), so the settings' env gets MCP_TIMEOUT (milliseconds) - the variable Claude Code reads for the limit.
export const START_TIMEOUT = { name: 'MCP_TIMEOUT', value: '90000' } as const;
// the settings key that holds the env pairs
export const SETTINGS_ENV_KEY = 'env';
