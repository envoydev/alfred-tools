// The named values fix/ reads.

// A token field that is one ${VAR} and nothing else; its one group is the variable's name.
export const ONE_VAR = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

// The fix rows of the 2026-11-19 follow-up, by their catalog/fixes.json id.
export const FIX_ID = { context7KeyEnv: 'context7-key-env', sentryAuthEnv: 'sentry-auth-env', retiredServer: 'retired-server', macosConfig: 'macos-config' } as const;

// A retired server's decline id (spec D3): `mcp:<name>`, and at local and project scope `:<project>` - the first hex
// characters of the SHA-256 of the project's absolute path - so a decline in one project never silences another's.
export const DECLINE = { prefix: 'mcp:', hash: 'sha256', hexLength: 12, userScope: 'user' } as const;
