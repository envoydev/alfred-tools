# preferred-tools

The MCP servers I have tested and like to use, packaged as one Claude Code plugin that sets each of them up for Claude
Code and for Cursor from one list. It carries each tool's install, update, rename, move and fix steps, so setting up a
new machine or a new project is a short walk through a few questions instead of a hunt through old notes.

It installs nothing on its own. You drive it with four commands, run from the project you want the tools in.

## Contents

- [Install the plugin](#install-the-plugin)
- [Quick start](#quick-start)
- [The tools](#the-tools)
- [The four commands](#the-four-commands)
- [Which settings to pick](#which-settings-to-pick)
- [Keys: `.mcps-secrets`](#keys-mcps-secrets)
- [Sentry for one organization and project](#sentry-for-one-organization-and-project)
- [Cursor](#cursor)
- [One sign-in for both apps](#one-sign-in-for-both-apps)
- [Where the files go](#where-the-files-go)
- [Updating](#updating)
- [Going back to 0.4.x](#going-back-to-04x)
- [When something is wrong](#when-something-is-wrong)
- [How it works](#how-it-works)
- [Development](#development)

## Install the plugin

```bash
claude plugin marketplace add envoydev/alfred-code
claude plugin install preferred-tools@envoydev
```

It needs Node 22 or newer and the `claude` CLI on your `PATH`. The plugin is listed in the `envoydev` marketplace (the
alfred-code repo); it works the same with or without alfred-code installed.

## Quick start

1. Open Claude Code in your project (not in this repo) and run `/preferred-tools:install`.
2. It prints the catalog for your OS with what is already installed. Pick the tools you want.
3. Say which apps the servers are for: 'Claude Code and Cursor' is recommended when Cursor is on this machine.
4. Answer 'Use the recommended settings', or set each tool up one at a time (see
   [Which settings to pick](#which-settings-to-pick)).
5. Read the plan it shows - every `claude` call, every file it writes - and answer 'Apply'.
6. For a tool that uses a key, open the `.mcps-secrets` file the plan names and fill the value after `NAME=`. The
   plugin never asks for, reads out or prints a key.
7. Restart Claude Code (or `/mcp` -> the server -> Reconnect), and Cursor if it got the servers. The plan's last lines
   say what each server needs.

## The tools

| Tool | What it gives Claude | How it runs | Key |
|---|---|---|---|
| serena | code navigation through language servers: symbols, declarations, implementations, references | local (`uvx`) | - |
| memory | a memory that lasts across sessions (mcp-memory-service) | local (`uvx`) | - |
| context7 | current docs for libraries and frameworks | hosted, or local (`npx`) | optional, `CONTEXT7_API_KEY` |
| github | GitHub issues, pull requests and code | hosted, or local (Docker) | required, `GITHUB_PERSONAL_ACCESS_TOKEN` |
| gitlab | GitLab issues, merge requests and code (gitlab.com or your own host) | hosted | recommended, `GITLAB_TOKEN`; OAuth without one |
| atlassian | Jira and Confluence | hosted | recommended, `ATLASSIAN_API_TOKEN`; OAuth without one |
| sentry | Sentry issues and events | hosted, local (`npx`), or bridge (`npx`, see [below](#sentry-for-one-organization-and-project)) | recommended, `SENTRY_ACCESS_TOKEN`; OAuth without one |
| playwright-chrome, -msedge, -firefox, -webkit | a browser Claude can drive, one per engine, each with its own profile | local (`npx`) | - |
| appium | Android and iOS app automation | local (`npx`) | - |
| macos-control | macOS desktop control (macOS only) | local (`uvx`) | - |
| windows-control | Windows desktop control (Windows only) | local (`uvx`) | - |

Every package is pinned to a release at least 7 days old; `/preferred-tools:update` moves the pins. What each tool
needs on your machine (`uvx`, `npx`, Docker, a browser, the Android SDK) is checked before the plan, and install offers
to skip a tool whose prerequisite is missing.

Every tool works in Claude Code and in Cursor; a tool that works in one app only is not in the catalog. 0.5.0 removed
claude-hud, typescript-lsp and csharp-lsp for that reason (serena covers the code navigation). An install of them keeps
working: `/preferred-tools:update` offers once to uninstall each, and remembers a 'No'. claude-hud's status line goes
with it only when it is claude-hud's own.

serena runs with a context file of the plugin's, `<root>/serena-context.yml`, that gives it six navigation tools only;
reading, editing and searching stay with the app's own tools.

## The four commands

- **`/preferred-tools:install`** adds tools that are not installed in this project. It never changes, moves or removes
  what is there. A tool already reaching you another way - installed for every project, through claude.ai, or from
  another plugin - is labelled in the list and can get this project's own copy beside it.
- **`/preferred-tools:configure`** changes or removes what is installed, one tool at a time: its route, scope, name,
  data folder, key name or settings, which apps it is set up for, or a root folder. Every question
  recommends what the tool has now. Its first question about a server is who looks after it: this plugin, or 'Leave it
  on its own', which configure, update and fix then skip.
- **`/preferred-tools:fix`** looks for known problems in what is installed and applies the recorded fix after you
  confirm. Run it after moving a project, or when a server will not start; after a plugin upgrade,
  `/preferred-tools:update` runs the checks that move what an older version wrote.
- **`/preferred-tools:update`** brings installed plugins, pinned servers, the key helper, the URL bridge and serena's
  context file up to date when they are behind, offering only releases at least 7 days old. It also moves the servers an
  older version of this plugin set up to the way it passes data now: a key read from `.mcps-secrets` instead of the
  registration, absolute paths, the root's `.gitignore` and the `.mcp.json` order. When Cursor is on this machine and a
  root's servers are set up for Claude Code only, it offers once to add Cursor.

Each one shows a plan and changes nothing before you confirm it. Pass a tool id to go straight to it, for example
`/preferred-tools:configure sentry`.

## Which settings to pick

'Use the recommended settings' is a good answer for most tools. When you set a tool up yourself, these are the
questions and what to choose.

**Scope** - where the registration lives:

- **Global** (Claude Code's user scope; `~/.cursor/mcp.json` in Cursor): every project on this machine. Recommended for
  a hosted server with a key (github, gitlab, atlassian, sentry, context7 with a key).
- **Project**: this project's `.mcp.json` (and `.cursor/mcp.json`), which you commit. Teammates get the server too,
  but the paths in it are this machine's, so a clone on another machine points at yours - run `/preferred-tools:fix`
  there.
- **Local**: this project, only you. Recommended for the local tools (serena, memory, the browsers, appium, desktop
  control): their paths and runtime are this machine's. Cursor has no private file per project, so a Local server set
  up for Cursor goes in `.cursor/mcp.json`, which a project usually commits; the plan says so when git would commit
  it - add `.cursor/mcp.json` to `.gitignore` to keep it yours.

A hosted server with a key at Project scope connects without its key in a session started in a subfolder: Claude Code
does not run a parent folder's key helper there. Pick Global for those, or start Claude in the project folder.

**Route** - for context7, github and sentry: 'Hosted' (the vendor's server, nothing to run) is recommended; 'Local'
runs the server on your machine. sentry also has 'Bridge', for one organization and project (see
[Sentry for one organization and project](#sentry-for-one-organization-and-project)).

**Apps** - 'Claude Code and Cursor' (recommended when Cursor is found: `~/.cursor`, or `cursor-agent` or `cursor` on
`PATH`) or 'Claude Code only'. Install asks once a run; configure asks per server.

**API key** - 'Use a key from .mcps-secrets' is recommended for every hosted server. Without one, context7 works at
lower rate limits, and gitlab, atlassian and sentry sign in with OAuth in the browser (see
[One sign-in for both apps](#one-sign-in-for-both-apps)).

**Key name** - the name the key has in `.mcps-secrets`. Keep the default unless you already keep the key under another
name; install offers the names it finds there.

**Name** - the registration's name in `/mcp`. Keep the default; a second copy of a tool (two browsers, two GitLab hosts)
needs its own.

**Location** - the tool's data folder (a browser profile, serena's home, memory's database). The default is
`<root>/<name>` in the root folder of its scope (see [Where the files go](#where-the-files-go)). memory follows its
scope: installed Global it is shared by every project, installed Local or Project it is this project's own.

**Per tool:**

| Tool | The key | The value to write |
|---|---|---|
| github | a GitHub personal access token ([github-mcp-server](https://github.com/github/github-mcp-server)) | the token |
| gitlab | a fine-grained personal access token with the MCP tool resource and the Execute permission - a legacy, project or group token is refused ([GitLab docs][gitlab-mcp]) | the token; a self-managed GitLab asks for its host at install |
| atlassian | an Atlassian API token; an org admin must turn API-token sign-in on ([Atlassian docs][atlassian-token]) | `email:api_token` - your account email, a colon, the token |
| sentry | a Sentry user auth token ([sentry-mcp](https://github.com/getsentry/sentry-mcp)) | the token |
| context7 | a Context7 API key ([Context7 docs](https://context7.com/docs/resources/all-clients)) | the key |

[gitlab-mcp]: https://docs.gitlab.com/user/model_context_protocol/mcp_server/
[atlassian-token]: https://support.atlassian.com/atlassian-rovo-mcp-server/docs/configuring-authentication-via-api-token

Atlassian with a token misses some tools that OAuth has; leave the key out to sign in with OAuth instead.

## Keys: `.mcps-secrets`

Each root folder has one `.mcps-secrets`, a plain `NAME=value` file. Install writes the names
(`GITHUB_PERSONAL_ACCESS_TOKEN=`); you write the values:

```text
# keys for the hosted servers - never commit this file
GITHUB_PERSONAL_ACCESS_TOKEN=github_pat_...
ATLASSIAN_API_TOKEN=me@example.com:ATATT3x...
CONTEXT7_API_KEY=ctx7sk-...   # a note after whitespace and # is not part of the value
```

- A hosted server reads its key through `mcp-headers.js`, the small helper beside the file, each time Claude Code
  connects. The registration holds neither the key nor a `${VAR}` for it, so changing a key is: edit the file, then
  `/mcp` -> the server -> Reconnect.
- The helper looks in the `.mcps-secrets` beside it, then the global root's, then `~/.preferred-tools` and `~/.alfred`:
  the first value found wins, so one key in the global root serves every project.
- A local server (github in Docker, sentry with `npx`) gets its key written into its registration at Local or Global
  scope; `/preferred-tools:fix` writes it again after you change it. Those routes are not offered at Project scope.
- The helper prints a key only when Claude Code runs it; run by hand it prints `{}`. The file itself is plain text: a
  command that reads it shows its keys, so keep it out of anything you share.
- After an install, the plan says for each keyed server whether its key is filled, and how it connects once it is. A
  key the server refused is named with what to check.

## Sentry for one organization and project

Sentry's hosted server is scoped to an organization and a project only by its URL
(`https://mcp.sentry.dev/mcp/<organization>/<project>`), and a URL in a registration cannot read `.mcps-secrets`. The
'Bridge' route fills that URL from `.mcps-secrets` each time the server starts, so switching projects is: change a line,
then restart.

1. Run `/preferred-tools:install sentry`, choose 'Set sentry up' and pick the route 'Bridge'. Project scope is
   recommended: the registration holds names only, and a session started in a subfolder uses it too.
2. Keep the names it offers, or pick yours: the key (`SENTRY_ACCESS_TOKEN`), the organization slug (`SENTRY_ORG`) and
   the project slug (`SENTRY_PROJECT`) - sentry-cli's own names, recommended. A name you already keep holding `SENTRY`
   is offered beside them.
3. Fill the project root's `.mcps-secrets` (the plan names the file):

   ```text
   SENTRY_ACCESS_TOKEN=sntryu_...
   SENTRY_ORG=my-org
   SENTRY_PROJECT=my-project   # optional - leave it empty for the whole organization
   ```

4. Restart Claude Code, or `/mcp` -> sentry -> Reconnect. Do the same after each change to these lines.

How it runs: the registration is `node <root>/mcp-bridge.js` with the URL template and the names, never a value. At each
start that small file, copied into the root beside `mcp-headers.js`, reads the names, fills the URL and runs the pinned
`mcp-remote` through `npx`, handing it the key in its environment, never on a command line. A slug must be a plain name
(letters, digits, `_`, `.` and `-`). With the key or the organization not filled, the server does not start; Sentry
accepts any token when it connects, so a wrong token shows at the first tool call, as Sentry's own error. Node and
`npx` must be on the `PATH` Claude Code starts with. `/preferred-tools:configure sentry` changes the names later and
keeps the pin.

## Cursor

Cursor reads `.cursor/mcp.json` in the folder it opens and `~/.cursor/mcp.json`, never `.mcp.json` or
`~/.claude.json`. So each root folder keeps one list, `<root>/mcps.json`: every server the plugin manages there, which
apps it is for, and the entry each app gets, never a key. Install, configure, update and fix write Claude Code (through
the `claude` CLI) and Cursor's file from it in the same run.

- **Your own entries stay.** A server you added to Cursor's file yourself is kept as it is, in its place. A name you
  already have there is replaced only after a question.
- **Keyed hosted servers.** Cursor does not run Claude Code's key helper, so its copy starts the URL bridge
  (`mcp-bridge.js`), which reads the same `.mcps-secrets`. A server whose key is written into its registration (github
  in Docker, sentry with `npx`) reaches Cursor at Global scope only, so the key never lands in a project file.
- **Approve again after a change.** Cursor asks you to approve a server again whenever its entry changes, so after an
  update that moves pins the plan names each one to approve.
- **Edited by hand.** When one app's copy differs from the list, `/preferred-tools:fix` asks which copy stays. A key
  pasted into Cursor's copy is never copied anywhere.
- **A workspace** (a root folder with projects below it, each opened on its own): Claude Code finds a parent folder's
  `.mcp.json`, Cursor does not. With alfred-code's workspace record (`.alfred/workspace.json`), each member's
  `.cursor/mcp.json` also gets the root's project servers. Without one, the plan notes when Cursor will not see them:
  open Cursor at the project, or install at Global scope.

## One sign-in for both apps

gitlab, atlassian and sentry's hosted route sign in with OAuth when you give them no key. Set up for both apps, each
runs [mcp-remote](https://www.npmjs.com/package/mcp-remote) in Claude Code and in Cursor with its sign-in folder set to
the root, so you sign in once in the browser and both apps use it, under any Claude account of this machine user.

- **Where the sign-in lives.** `<root>/mcp-remote-v1/`, one set of `<hash>_*` files per server. They are tokens: the
  plugin never reads, prints or copies them, and the root's `.gitignore` keeps them out of git. Where git would commit
  that folder, the server is set up for Claude Code only until `/preferred-tools:fix` adds the line.
- **Kept out of AI sessions.** Two deny rules in your Claude Code settings (`~/.claude/settings.json`, or
  `CLAUDE_CONFIG_DIR`'s) stop a session from opening the tokens or the keys: `Read(//**/mcp-remote-v1/**)` and
  `Read(//**/.mcps-secrets)`. The plugin adds them when it first writes a sign-in entry or a key name; a rule you
  remove by hand comes back on the next plan that needs it.
- **Signing out.** Delete that server's `<hash>_*` files in `<root>/mcp-remote-v1/`, or the folder for every server.
  The next start opens the browser again.
- **When the sign-in fails in both apps.** A vendor can turn off the self-registration mcp-remote relies on (a GitLab
  admin can). Use a key instead: `/preferred-tools:configure <tool>` -> 'Use a key from .mcps-secrets'.
- Set up for Claude Code only, the server stays a plain `http` entry and Claude Code signs in on its own (`/mcp`).

## Where the files go

Two root folders hold everything the plugin writes:

- **The project root**, for Project and Local scope: `.alfred` when alfred-code is set up in the project, else
  `.preferred-tools`, or a folder you name inside the project.
- **The global root**, for Global scope: `~/.preferred-tools`, `~/.alfred` when it exists, or a folder you name.

Each holds the tools' data folders (`<root>/<name>`), `.mcps-secrets`, `mcp-headers.js` (with `mcp-bridge.js` beside it
for a bridge route, and a `package.json` saying CommonJS, so both load in a project whose own `package.json` says
`"type": "module"`), serena's `serena-context.yml`, a `.gitignore` that keeps everything but itself and the helper out
of git, `mcps.json` - the list of the servers the plugin manages and the ones you left on their own - and, after a
sign-in, `mcp-remote-v1/`. Install asks for each root
once; `/preferred-tools:configure` moves one (the data stays where it is, and the plan says so).

Every path the plugin writes is absolute, at Project scope too, so a session started in a subfolder uses the same
profile, index and database.

## Updating

The plugin: updates are pulled, never pushed.

```bash
claude plugin marketplace update envoydev
claude plugin update preferred-tools@envoydev
```

The tools: run `/preferred-tools:update` in each project after updating the plugin. It lists what is behind and moves
only what you pick, in one confirmation:

- **Versions** - plugins and pinned MCP servers, to releases at least 7 days old; the newer key helper
  (`mcp-headers.js`), URL bridge and serena context file for each root under 'Key helpers'.
- **New ways to pass data** - what an older version of this plugin wrote, moved to the way 0.4.0 does it: a server
  that still carries its key in an Authorization header reads it through the key helper instead, once you have put the
  key in `.mcps-secrets`; a relative or `${HOME}` path at Project scope becomes absolute (on Windows, serena's home
  moves under the root folder); the root folder's `.gitignore` gains the lines it lacks; and `.mcp.json` is put in
  order. 0.5.0 adds its own: every server the plugin manages goes into the root's `mcps.json` (an old
  `preferred-tools.json` is moved in and renamed `preferred-tools.json.0.4.bak`), serena gets the navigation context
  and `base_modes: []` in its `serena_config.yml`, the two deny rules are added, and each retired plugin is offered for
  uninstall. These run before the version moves, so both changes stay.
- **Cursor** - asked after the updates, once per root, when Cursor is on this machine and the root's servers are set
  up for Claude Code only. 'Not now' is remembered in the list.

Something it cannot do alone - a key whose value is not in `.mcps-secrets` yet - is listed as a note, and the last line
says how many wait on you: put the key in, then run `/preferred-tools:fix`. A copy a 0.2.0 session left in a subfolder
is kept out of git by `/preferred-tools:fix` run in that subfolder.

## Going back to 0.4.x

0.4.x reads no `mcps.json` and sees the registrations as they are; every Claude Code entry 0.5.0 writes still works
under it. What to know:

- **Servers left on their own.** Rename `<root>/preferred-tools.json.0.4.bak` back to `preferred-tools.json`.
- **serena's manual.** 0.5.0 set `base_modes: []` in serena's `serena_config.yml` (in its data folder, `<root>/serena`
  by default); 0.4.x keeps every tool, but its
  manual then lacks the editing guidance. Put back Serena's default with the line `base_modes: [interactive, editing]`.
- **The shared sign-in.** 0.4.x reads an mcp-remote entry with a sign-in folder as a server of your own: it keeps
  working; configure's remove and a fresh install bring back the `http` form.
- **The deny rules** stay in your Claude Code settings; they block sessions, not the plugin's own scripts.
- Cursor's files stay as written; no version edits them again. A removed plugin comes back with
  `claude plugin install`.

## When something is wrong

Run `/preferred-tools:fix` first; it knows these:

- a bridge server does not start: `mcp-bridge.js`, or the helper beside it, is missing or out of date;
- a server connects without its key: the folder's trust prompt was not accepted (a Project or Local server's helper
  runs only after it), the helper is missing (a fresh clone), or the server comes from a parent folder's `.mcp.json`
  and the session started in a subfolder. A key not filled yet is named by the install plan's `Key:` line;
- an `npx` or bridge server fails at every start with `ENOENT` (a session started during the first download);
- a `uvx` server dies at start on Python 3.14, or fails to build on Windows ARM64;
- an `npx` server never connects on native Windows;
- serena's TypeScript server fails on Windows;
- appium cannot find the Android SDK or a JDK;
- a data folder git would commit, or a key file or sign-in folder git would commit;
- one app's copy of a server was changed by hand, or a Cursor `mcp.json` is not JSON;
- a deny rule for the sign-ins or the keys is missing.

A first start can take a while: install downloads each new package right after the plan and starts it once in the
background, so the first session answers inside Claude Code's 30-second limit (memory's first start downloads an
embedding model for about 2 minutes). Restart Claude Code once it reports.

## How it works

- Every MCP server is a plain registration written by the `claude` CLI (`claude mcp add-json`, `remove`, `get`); no
  launcher sits between Claude Code and the server, except the URL bridge above, which the root holds, not the plugin.
  The one write of its own: after a change at Project scope it puts `.mcp.json`'s catalog servers in a fixed order,
  your own servers after them, and changes no value.
- Cursor has no command that adds a server, so the plugin writes Cursor's two files itself, from the root's
  `mcps.json`, keeping every entry you added.
- A registration is recognised by what it launches (its package, or its URL host and path), not by its name, so a tool
  under a custom name is still found, and a server of your own is never touched.
- The design record is `docs/build-prompt.md`; every outside fact (package, version, endpoint, flag) is in
  `docs/sources.md` with its URL and date.

## Development

```bash
npm test          # node:test, one file per script
npm run lint      # catalog and manifest shape checks
npm run validate  # claude plugin validate --profile directory --strict, on a copy of the files git would ship
npm run matrix    # real-CLI cases in a throwaway home and account (minutes; plugin cases need the network)
npm run refresh-pins              # which catalog pins have a newer release at least 7 days old
npm run refresh-pins -- --write   # move catalog/tools.json; a moved pin is a release
```

This repo's own rules are in `.claude/CLAUDE.md` (not loaded by installs).

## Credits

The plugin icon (`.claude-plugin/icon.png`) is Google's Material Symbols 'home_repair_service' glyph (rounded, filled)
on a teal ground, used under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) from
[google/material-design-icons](https://github.com/google/material-design-icons).

## License

MIT - see [LICENSE](LICENSE).
