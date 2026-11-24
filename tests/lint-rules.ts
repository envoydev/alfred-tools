// The command rules tests/lint.ts applies to commands/, skills/ and README.md, apart from the lint so a test can feed each
// one a bad line. A command runs the bundles in dist/ (built from scripts/ by npm run build).

// a script call must go through the plugin root: `node` then a plugin folder reached any other way
export const PLUGIN_ROOT_CALL = /\bnode\s+(?!"\$\{CLAUDE_PLUGIN_ROOT\}\/)["']?(\.\/)?(?:scripts|dist)\//;

// allowed-tools is a pre-approval, so it never covers a call that changes an install: the CLI's own prompt is the guard
// beside the command's written ask. A script that writes is listed only with a read-only flag.
// fetch downloads and runs a package's own install, and sign-in opens a browser and writes tokens, so both count as a write; cursor-mcp.ts writes Cursor's files
export const WRITES = /(?:scripts|dist)\/(?:apply|fetch|sign-in)\.(?:ts|mjs)|cursor-mcp\.ts|(?:scripts|dist)\/(?:fix|update)\.(?:ts|mjs)"\s*(?:\*|--apply|\))/;

// A call of an entry that reads the roots map and the records: a line of a code block or a backticked one in prose.
export const CALL = /(?:node "\$\{CLAUDE_PLUGIN_ROOT\}\/dist\/|`)(inventory|plan|apply|fix|update)\.mjs"?\s+([^`\n]*)/g;

// The bundles run on Node 26.13 and newer: each command says what an older Node prints and what to tell the user, before
// its first script call in the body. Read with its line breaks folded, since prose wraps.
export const OLD_NODE = 'If a script fails to start with a `SyntaxError`, a `TypeError` that names a missing function, or an error naming a `node:` module, stop and tell the user: alfred-tools needs Node 26.13 or newer - `node --version` shows yours.';

export const FIRST_CALL = 'node "${CLAUDE_PLUGIN_ROOT}/dist/';

// a call left on a source entry, which a user's Node may not run
export const OLD_ENTRY_CALL = /\bnode\s+["']?[^\s"']*scripts\/[a-z-]+\.ts/;
