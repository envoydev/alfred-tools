# AGENTS.md - alfred-tools

## What this repo is

The tools its owner has tested and likes to use, MCP servers that work in Claude Code and Cursor, packaged as ONE Claude
Code plugin, `alfred-tools`. The plugin carries each tool's install, update, rename, relocation and fix procedure. It
is listed in the `envoydev` marketplace, which lives in its own repo since 2026-11-14
(`https://github.com/envoydev/plugins-marketplaces`, `.claude-plugin/marketplace.json`); users install it as
`alfred-tools@envoydev`. The entry is a GitHub source on this repo's `main` with no `sha` (the user's ruling,
2026-11-04): a fresh install fetches `main`'s tip, and a version bump merged to `main` is the release with no
marketplace change. So `main` stays release-only.

- `/alfred-tools:install` - manual (`disable-model-invocation: true`); adds only tools not installed in this project
  and asks nothing about a server already set up (one it recognises is managed; a claude.ai connector or another
  plugin's server is a label in the pick list): pick tools, then which apps (Claude Code and Cursor, or Claude Code
  only; since 0.5.0), then one tool at a time its route, scope and name, root, location, key and key name, and
  settings. A tool installed for every project is offered as this project's own copy beside it; install never
  changes, moves or removes a registration.
- `/alfred-tools:configure` - manual; changes or removes what is installed, one registration at a time (keyed
  `mcp:<name>~<scope>`; plugins left configure with the catalog's plugin rows in 0.5.0), a server left on its own, or a
  root folder (`root:<family>`), every question recommending what it has now; its first question about a server is
  who looks after it. The user's ruling (2026-10-27): install is install, configure is configure.
- `/alfred-tools:fix` - manual; detects known problems and applies the recorded fix.
- `/alfred-tools:update` - manual; updates installed plugins, pinned catalog servers and the copied files
  (`mcp-headers.js`, `mcp-bridge.js`, `serena-context.yml`) that are behind, to releases at least 7 days old, and
  moves what an older alfred-tools wrote to the way it passes data now, through fix's rows marked `upgrade` (the
  user's ruling, 2026-11-12). It was the model-invocable `update-tools` skill until the user's ruling (2026-10-27) made
  it a command; manual like the other three, so the plugin puts no description in every session.
  Since 0.5.0 it also offers Cursor once per root when Cursor is found, and once to uninstall the retired plugins.
  The copied files live in `scripts/copied/`, which stays CommonJS: a root runs them outside the plugin, byte for byte.
- **The catalog keeps only tools that work in Claude Code and Cursor** (the user's rulings 3, 5 and 6, 2026-11-12/13):
  claude-hud, typescript-lsp and csharp-lsp left it in 0.5.0, and a plugin row comes back only when it works in both.

The build brief, with every design decision, its reason and the user's rulings, is `docs/build-prompt.md`. Read it
before changing the design.

**This file is not loaded by installs.** The repo root is the plugin root, so this file ships in every install's cache
but Claude Code never loads a plugin's instruction file. It is for working IN this repo only. It is `AGENTS.md` at the
root (the user's ruling, 2026-11-15): `claude plugin validate --strict` passes with it there and fails on a root
`CLAUDE.md` (measured on 2.1.325). **Never add a `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md`:** Claude Code
reads `AGENTS.md` only while none of the three exists and says nothing when one switches it off
(https://code.claude.com/docs/en/memory.md); `npm run kit:check` fails when one appears. Anything the plugin needs at
runtime goes in a command or a script.

**Public repo.** Everything here ships to every machine that installs the plugin (the cache is the whole repo). No
private project names, no absolute local paths, no tokens, nothing from a user's machine.

## Commands

```bash
npm install          # first in a fresh clone: typecheck, lint and test import the pinned typescript
npm run typecheck    # tsc -p .
npm run lint         # tests/lint.ts - the repo's own rules (allowed-tools, names, types)
npm run validate     # claude plugin validate --profile directory --strict on a copy of the files git ships
npm test             # node --test tests/*.test.ts - the whole suite, minutes; run it in the background
npm run kit:check    # the files claude-kit manages are unedited, and no CLAUDE.md hides this file
npm run matrix       # real-CLI cases - by hand only, on a throwaway project and account, never in CI
```

The first five plus `kit:check` are what CI runs, in that order.

## Layout

- `commands/` - the four commands: `install`, `configure`, `fix`, `update`.
- `catalog/` - `tools.json` (the tools and their routes), `fixes.json` (the problems fix knows), `reserved-names.json`.
- `scripts/` - the entry scripts a command calls (`plan.ts`, `apply.ts`, `fix.ts`, `update.ts`, `inventory.ts`,
  `fetch.ts`, `prereq.ts`), each with a folder of its parts; `core/` holds what they share (`claude-cli.ts` is the one
  way the `claude` CLI is started); `copied/` is the CommonJS a root runs outside the plugin.
- `tests/` - `*.test.ts` beside their fakes (`fake-claude.ts`, `fake-mcp-server.ts`), `lint.ts`,
  `validate-plugin.ts`, `matrix/` (the by-hand real-CLI cases) and `proof/`.
- `docs/` - `build-prompt.md` (the design and the rulings), `sources.md` (outside facts with URL and date),
  `plugin-cli-evidence.md` (measured CLI behaviour).

## Invariants

- **Standalone plugin** (the user's ruling, 2026-10-27). It shares the `envoydev` marketplace with alfred-code like
  any two plugins in a store: neither depends on, requires, installs or removes the other, and it works the same with
  alfred-code absent. Reading what alfred-code left (its reserved names, its data folders, its workspace record
  `.alfred/workspace.json`, which says which folders form a workspace - ruling 10, 2026-11-13) is fine; needing it is
  not: no record, no workspace.
- **The `claude` CLI is the only writer** of `.mcp.json` and the account `.claude.json`: `claude mcp add-json`,
  `remove` and `get`, and `claude plugin install`, `update`, `uninstall` and `list --json`. Scripts read those files,
  never write them - with one exception (the user's ruling, 2026-11-11, 'Reorder-only write'): after its CLI calls,
  `scripts/mcps-list/mcp-order.ts` rewrites `.mcp.json` with the same servers and values in `catalog.order`, the user's own after
  them, checks that nothing but the order changed, and writes through a temporary file.
- **Cursor's two files are written by `scripts/cursor/cursor-mcp.ts`** (0.5.0, the user's ruling 2, 2026-11-12), a second
  exception: Cursor has no CLI that adds a server (`docs/sources.md`, F11), so the `cursor-write` step writes
  `<project>/.cursor/mcp.json` and `~/.cursor/mcp.json` from the list, through a temporary file, keeping every entry the
  user added and asking before it replaces a name the list does not mark for Cursor.
- **Plain registrations, no launcher** (the user's ruling, 2026-10-27, made twice). Per-machine values are resolved
  at install time, and `/alfred-tools:fix` repairs a changed machine. The one exception is the URL bridge (the
  user's ruling, 2026-11-11): a route whose URL holds a value from `.mcps-secrets` runs `node <root>/mcp-bridge.js`,
  which fills the URL at each start and runs a pinned mcp-remote; it is copied into the root like the helper, never run
  from the plugin cache. Since 0.5.0 the bridge also serves Cursor's copy of every keyed hosted route, since Cursor
  ignores `headersHelper`; Claude Code's copy keeps the helper form.
- **Identity is the launch, not the name.** A registration is matched to a catalog row by its fingerprint (the package
  in `args`, or the URL host plus path). That is how a custom per-project name works with no ledger. A registration
  that matches no row is the user's and is never touched. The exceptions to 'no ledger': the list `<root>/mcps.json`
  (0.5.0, the user's ruling 2, 2026-11-12) - every server the plugin manages in that scope family, with its apps
  (`clients`), its Claude Code entry and Cursor's copy where it differs, never a key value, read and written only by
  `scripts/mcps-list/mcps-list.ts`; its `own` array holds the servers left on their own (the user's ruling, 2026-11-11, 'Managed
  by default'), which install, configure, update and fix skip, and replaces the 0.4.x record (0.2.0-0.4.x),
  which update moves in and renames with `.0.4.bak` added - and the roots map
  `${CLAUDE_PLUGIN_DATA}/roots.json` (2026-11-10), which finds a named root again. A left entry whose fingerprint
  changed is dropped.
- **A change starts from what is installed.** Only a fresh add builds from `catalog/tools.json`. A rename, a move, a
  fix or a re-run starts from the registration as read (its pin, its cut-off, the args or env the user added), so an
  updated pin is never downgraded.
- **A key lives in `.mcps-secrets` in a root folder** (the user's rulings, 2026-11-10: 'we need to have .mcps-secrets
  that will be in root of .alfred-tools or .alfred', replacing the key-file rule of 2026-10-29). The user writes
  every value; the plugin writes names only (`ensure-key-name`). A hosted keyed route reads its key through the header
  helper `mcp-headers.js` each time Claude Code connects, and its registration holds neither the key nor a `${VAR}` for
  it. A stdio keyed route is written in by `apply.ts` at local and global scope, and is not offered at project scope.
  The 0.1.x key files (alfred-code's store, `.alfred-tools/.secrets`) are read for names only. `scripts/keys/keys.ts` holds
  the chains. No key in a file a command line names (`scripts/core/kept.ts`), none printed, none asked for. A key is the
  recommended way into every hosted route (2026-11-11); with no key, a route that has OAuth uses it. Every route
  Project scope is offered for recommends Project, a stdio route whose key is required (not offered Project) Local
  (the user's consolidation request, 2026-11-18: 'install scope is not consolidated' - one project's servers in one
  scope and one root, not spread over Global and Local). This reverses 2026-11-11's 'recommended at Global' for a hosted
  keyed route, at a known cost: Claude Code runs no parent folder's helper in a child folder, so a session started in a
  child folder connects such a server without its key - start a session in the folder that holds `.mcp.json`, or move
  the server to Global with configure; the scope question and the plan say so. The bridge (0.4.0) reads the key and
  the URL's names through the helper's reader, and passes the key to mcp-remote in its environment only.
- **A sign-in is mcp-remote's, kept in the root** (0.5.0, the user's rulings 12 and 13, 2026-11-13). A keyless OAuth
  route set up for both apps runs mcp-remote with `MCP_REMOTE_CONFIG_DIR` set to the root, so one sign-in in
  `<root>/mcp-remote-v1/` serves Claude Code and Cursor. The plugin never reads, prints or copies those files; the
  root's `.gitignore` covers the folder, and where git would commit it the server is set up for Claude Code only.
  Two `permissions.deny` rules in the user's Claude Code settings keep sessions out: `Read(//**/mcp-remote-v1/**)` and
  `Read(//**/.mcps-secrets)`.
- **Paths absolute at every scope** (the user's ruling, 2026-11-11, 'Absolute, always'), `project` included, with `~`
  expanded by the script: one data folder whatever folder Claude starts in, at the cost that the committed `.mcp.json`
  names this machine's path. Never a key in `.mcp.json`. Every file the plugin writes for a scope family sits in that
  family's root folder (project root: project and local scope; global root: global scope), memory's data included.
- **`allowed-tools` pre-approves read-only calls only.** `apply.ts`, `fetch.ts`, `fix.ts --apply`, `update.ts --apply` and the
  `hud-statusline.ts` writes are never listed, so Claude Code's own prompt guards a change beside the command's written ask. `tests/lint.ts`
  enforces it.
- **Script paths go through the plugin root.** A command's shell runs in the user's project, so every call is
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/<file>"`.
- **Asks stay within the AskUserQuestion limits** (1-4 questions per call, 2-4 options each). Exactly one option is
  marked `(Recommended)`, listed first, and nothing is applied before the plan is confirmed.
- **Zero runtime dependencies.** Node 22.18 built-ins only. A plugin's Node dependencies install only with a lockfile and
  `--ignore-scripts`, and `claude plugin update` installs none of the new `dependencies` a release adds. So the
  manifest never declares `dependencies`.

## Plugin facts this repo relies on

From `.claude/skills/plugin-packaging/` (each of its references carries the date and Claude Code version it was
checked on) and `docs/plugin-cli-evidence.md` (measured). Re-verify a fact against the docs when Claude Code has moved
far past those dates.

- **One version, in `.claude-plugin/plugin.json`.** It silently overrides a version in the marketplace entry. A source
  change without a version bump is not delivered, so bump on every user-visible change.
- **Updates are pulled.** Auto-update is off for third-party marketplaces, so a release reaches users on their own
  `claude plugin marketplace update` / `claude plugin update`.
- **Never rename or drop the id `alfred-tools`.** It was renamed once (the user's ruling, 2026-11-14) - never again:
  every install goes silent and does not self-heal.
- **`install` is not a no-op over an installed plugin.** It adds a second row, or flips a disabled one on, and always
  prints `Successfully installed`. `enable` over enabled and `disable` over disabled exit 1.
- **`plugin list --json` `enabled` is not proof** that a plugin runs. Read the settings file at its scope; its
  `errors` field is the only place a broken plugin says so.
- **Component paths start with `./`** and never reach above the root. A path field replaces its default folder,
  except `skills`, which adds to it.
- **`${CLAUDE_PLUGIN_ROOT}` changes on every update** (the cache is versioned), so nothing durable lives under it and
  no registration points into it. `${CLAUDE_PLUGIN_DATA}` is the plugin's persistent dir.
- **`allowed-tools` in a command is a per-turn pre-approval**, not a restriction, and it lasts only the turn the
  command runs in.

## Working in this repo

- **`npm install` first in a fresh clone.** `npm run lint`, `npm test` and `npm run typecheck` import `typescript`
  (the lint's name and type checks, the rename driver `tests/proof/rename.ts`), pinned exactly in `devDependencies`
  with no lockfile. The plugin itself runs on Node alone: nothing it ships imports them.
- **Every change is proven on a throwaway project, never the real account.** Run the matrix under an isolated
  `CLAUDE_CONFIG_DIR` and `HOME` in the session scratchpad. Two real side effects happened before this rule existed:
  matrix installs left records for deleted scratch projects in the real `~/.claude/plugins/installed_plugins.json`,
  and nested `claude -p` sessions on the real config ended logged out. Ask before any run against the real account,
  and say it may cost a `/login`.
- **Read the result, not the exit code.** Open the written `.mcp.json`, account file and settings after each case.
  A case not run is reported as NOT RUN, never implied as passing. Windows-only behaviour is proved on the user's
  Windows VM or reported NOT RUN.
- **CI runs the same checks, and they run here first** (`.github/workflows/ci.yml`: typecheck, lint, validate, test,
  kit:check on Linux, macOS and Windows, against the Claude Code build pinned there). Before a push, run those five
  here in that order and push only when each passes; then watch the remote run to its end - it is what proves Linux and
  Windows (the user's ruling, 2026-11-15). The matrix is not in CI: it stays a by-hand run on a throwaway project.
- **What only the runner showed** (first CI runs, 2026-11-14): a test that read the real home folder (each test makes
  its own temp home), a CRLF checkout failing the lint on Windows (`.gitattributes` holds every file to LF), and the
  Windows runner's 8.3 short temp path (`TEMP` and `TMP` are set to `runner.temp` for the test step).
- **Check order before a publish:** `npm run validate` (`claude plugin validate --profile directory --strict` on a
  scratch copy of the files git would ship, so a Finder `.DS_Store` never fails it), a `claude --plugin-dir .` session
  in a scratch project, then `claude plugin details`. The skill has the full list.
- **Outside facts are verified, not recalled.** A package, version, endpoint, CLI flag or marketplace shape is checked
  against the vendor's own docs and recorded with its URL and date in `docs/sources.md`.
- **Branches.** `main` is the default branch and release-only; work lands on `develop`. Commit or push only on the
  user's word.
- **Commits carry no trace of the agent** - no co-author trailer, session link or 'Generated with' line. The rule is
  `.claude/rules/commits.md`, shared by every repo claude-kit serves.
- **Voice.** Direct and lean, single dashes, single quotes in prose; recommend one option with a reason.

## Related repos

- plugins-marketplaces (`../plugins-marketplaces`) is the `envoydev` catalog; a catalog change (a description, a
  category) is a commit there.
- alfred-code (`../alfred-code` when checked out beside this one) is the sibling plugin of the catalog. It holds the record of the
  servers it shipped until 2.10.1: `stack/mcp/original-mcps.json`, `stack/mcp/shipped-mcps.json` and
  `stack/mcp/README.md`. Its claude-hud settings step is `scripts/plugin-settings.js`, `scripts/hud-statusline.js` and
  `meta/plugin-settings.json`. A change there follows its own `AGENTS.md`, never an edit from this repo.
- claude-kit (`../claude-kit`) holds the shared `.claude` rules, skills and settings synced into this repo
  (`.claude/kit/lock.json` lists them): change one there and sync, never here.
- claude-hud, typescript-lsp and csharp-lsp are installed by both plugins, each on its own; there is no hand-over
  (`docs/build-prompt.md`, Risks and Hand-off).
