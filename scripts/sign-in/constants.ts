// The values sign-in/ shares: the client's bin and flag, the time it may wait, the scopes and the words it prints.
export const CLIENT_BIN = 'mcp-remote-client';
export const AUTH_TIMEOUT_FLAG = '--auth-timeout';
// the browser sign-in may take five minutes; the run is allowed that and the npx start on top (Bash timeout 330000 in the commands)
export const AUTH_TIMEOUT_SECONDS = 300;
export const RUN_TIMEOUT_MS = 330000;
// mcp-remote 0.16.0 keeps a sign-in as <config dir>/mcp-remote-v1/<md5 of the server URL>_tokens.json (docs/sources.md)
export const TOKENS_SUFFIX = '_tokens.json';
export const SCOPES = ['project', 'local', 'user'];
export const USAGE = 'usage: sign-in.ts <name> <project|local|user>';
export const EXIT_CODE = { ok: 0, failed: 1, usage: 2 };
export const LINE = {
    signedIn: 'signed in',
    notSharedForm: 'not the shared sign-in form (mcp-remote with its sign-in folder) - nothing to sign in',
    noTokens: 'the client finished but no sign-in was stored',
};
