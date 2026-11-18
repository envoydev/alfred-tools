// The values sign-in/ shares: the client's bin and flag, the time it may wait, the scopes and the words it prints.
export const CLIENT_BIN = 'mcp-remote-client';
export const AUTH_TIMEOUT_FLAG = '--auth-timeout';
// the browser sign-in may take five minutes; the run is allowed that and the npx start on top, and ends before the Bash
// tool's own 330000 (the commands) so the failure line is printed, never cut off with the harness's kill
export const AUTH_TIMEOUT_SECONDS = 300;
export const RUN_TIMEOUT_MS = 320000;
export const TIMEOUT_ERROR_CODE = 'ETIMEDOUT';
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
// the lines mcp-remote 0.16.0 writes to stderr (docs/sources.md, mcp-remote-client): the authorize block, whose next line is
// the URL, and the one that follows when no browser could be opened; each is `[<pid>] <text>`
export const AUTHORIZE_MARKER = 'Please authorize this client by visiting:';
export const NO_BROWSER_MARKER = 'Could not open a browser automatically';
export const PID_PREFIX_PATTERN = /^\[\d+\]\s*/;
export const LINK_PROTOCOL = 'https:';
// a stderr line longer than this is no marker and no URL of the client's; it is skipped unread (an authorize URL with its
// state and challenge runs to a few hundred characters, a long scope list to a few thousand)
export const MAX_LINE_LENGTH = 65536;
// how long a stopped client gets to exit on SIGTERM before it is killed
export const KILL_GRACE_MS = 5000;
// after the client exits, a grandchild that kept its stderr pipe open is given this long before the pipe is closed on it
export const STDERR_GRACE_MS = 2000;
// 128 plus the signal number: what a shell reports for a process the signal stopped
export const SIGNAL_EXIT_CODE = { SIGINT: 130, SIGTERM: 143 };
