// The named values fix/ reads.

// A token field that is one ${VAR} and nothing else; its one group is the variable's name.
export const ONE_VAR = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

// The fix rows of the 2026-11-19 follow-up, by their catalog/fixes.json id.
export const FIX_ID = { context7KeyEnv: 'context7-key-env', sentryAuthEnv: 'sentry-auth-env', keyToLauncher: 'key-to-launcher', retiredServer: 'retired-server', macosConfig: 'macos-config', startTimeout: 'start-timeout' } as const;

// The scopes whose stdio key a launcher carries: a committed Project file takes none.
export const LAUNCHER_SCOPES = ['local', 'user'] as const;

// A retired server's decline id (spec D3): `mcp:<name>`, and at local and project scope `:<project>` - the first hex
// characters of the SHA-256 of the project's absolute path - so a decline in one project never silences another's.
export const DECLINE = { prefix: 'mcp:', hash: 'sha256', hexLength: 12, userScope: 'user' } as const;

// What the read guard's two rules leave open, residual by the user's ruling (2026-11-19, 'Record as residual'): named at
// the end of every read-guard finding. The sandbox runs on macOS, Linux and WSL2, never on native Windows.
export const READ_GUARD_RESIDUAL = {
    sandboxed: ' - a recursive grep or a script that opens the file still reads it unless Claude Code\'s sandbox is on (/sandbox)',
    win32: ' - a recursive grep or a script that opens the file still reads it: native Windows has no sandbox (WSL2 has)',
} as const;
