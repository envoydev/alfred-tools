---
description: "Update what is behind - installed plugins and pinned MCP servers - to releases at least 7 days old, and move servers an older alfred-tools set up to the way it passes data now, after one confirmation"
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/update.ts" --check), Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/update.ts" --check *), Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/update.ts" --questions), Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/update.ts" --questions *)
---

Bring what is installed up to date: every plugin on this machine, the pinned MCP servers, the key helper (`mcp-headers.js`) and URL bridge (`mcp-bridge.js`) in each root folder, and
the way this plugin passes data to the servers an older alfred-tools set up. The script finds what is behind and does
the work; you paste what it prints and ask.

## Rules

- **Nothing changes before one confirmation** (step 3). `--check` and `--questions` read; only `--apply` writes, and Claude
  Code asks permission for that call itself - `--apply` is deliberately not in `allowed-tools`.
- **The `claude` CLI is the only writer** of `.mcp.json` and the account file; the script calls it. Never edit those files.
- **A pin moves only to a release at least 7 days old.** A newer, younger release is listed as held back, never offered.
  The rewrite keeps the registration's name, scope, args and env; only the pin and the cut-off beside it move. A rewrite
  at Project scope keeps `.mcp.json` in order: the catalog servers in the user's order, the user's own after them, no
  value changed.
- **A registration that matches no catalog row is the user's.** The script never looks at it. A server left on its own
  at install is listed as 'on its own - not checked' and never offered.
- **Every ask is data.** Ask exactly the options printed, in the order printed; `AskUserQuestion` adds 'Other' itself.
- This command never changes `catalog/tools.json`. Its pins move only through the repo script `npm run refresh-pins`.
- A rename, a move or a route change is not an update; that is `/alfred-tools:configure`. A change in how this plugin
  passes data to a server it set up is one (the user's ruling, 2026-11-12): the check runs `/alfred-tools:fix`'s rows
  marked `upgrade` in `catalog/fixes.json` - `key-to-helper` (a key in an Authorization header, read through
  `mcp-headers.js` once the user has put it in `.mcps-secrets`), `root-ignore`, `project-relative-path` (absolute
  project paths; on Windows serena's home under the root) and `mcp-order` - offers what they find, and applies it with
  fix's own code. A finding that needs the user - a key not filled yet, a folder to name - is a note naming
  `/alfred-tools:fix`, never an offer.

If a script fails with `ERR_UNKNOWN_FILE_EXTENSION` or `Unknown file extension ".ts"`, stop and tell the user:
alfred-tools needs Node 22.18 or newer - `node --version` shows yours.

## 1. What is behind

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/update.ts" --check --data "${CLAUDE_PLUGIN_DATA}"
```

Paste the output verbatim in a fenced block. It refreshes each marketplace the installed plugins come from
(`claude plugin marketplace update <name>`), then lists, in tables: plugins, MCP servers as
`current -> offered` with the release's age, key helpers (`mcp-headers.js` and `mcp-bridge.js` copies
older than this plugin's, as `helper N -> M` and `bridge N -> M`), and 'New ways to pass data', one line per server or
folder as `<fix id>: <what it found>`. Below them: plugins whose marketplace lists no version
(`claude plugin update` is the check for those, so each is offered on its own), releases held back, what was skipped (a hosted URL has no
pin; a Docker image tag is not checked; a server on its own), and what could not be checked. Among the new ways to pass data,
`retired-plugin` offers to uninstall a plugin the catalog no longer lists (typescript-lsp, csharp-lsp, claude-hud - they
work in Claude Code alone), one offer per plugin and scope; one the user turned down before is not offered.

Above the tables, a line per server changed since alfred-tools last wrote it: '<name> was changed outside
alfred-tools' (an update starts from the registration as it is, and carries it into the list and Cursor), or
'<name> is on the list but not in Claude Code - run /alfred-tools:fix' (update never adds it back). Last, under
'Cursor (asked after the updates)', each root whose servers are set up for Claude Code only while Cursor is on this
machine.

Exit 3 with one line means the `claude` CLI is missing: say so and stop. When the last line is
`alfred-tools: everything current`, say that and stop. When it is `alfred-tools: nothing to update - Cursor can be
set up (asked next)`, go to step 2 and ask only the Cursor offer. When it is `alfred-tools: nothing to update - N wait(s) on
you first`, nothing can be offered yet: tell the user each note (a key to fill, a key file git would commit) and stop.
A line under 'Could not check' is a registry that did not answer; it is never read as current - say so.

## 2. Which

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/update.ts" --questions --no-refresh --data "${CLAUDE_PLUGIN_DATA}"
```

It prints `{ "offer": <ask>, "pick": [<calls>] }`. Ask the `offer` as printed:

```ask updateOffer
Update what is behind?
- 'All of them (Recommended)' - update everything offered
- 'Pick which' - choose among them
- 'Skip' - nothing changes
```

When only unchecked plugins remain, the printed `offer` leaves 'All of them' out and recommends 'Pick which'; ask what is
printed. 'Skip' ends the command. 'Pick which': ask each call in `pick` as printed (up to four multi-select questions of at
most four options) and collect the options picked. Each option's description is the offer id to pass on; a group of one
offer carries 'None of these' (description `none`), which passes nothing.

An uninstall offer (`upgrade:retired-plugin:<id>~<scope>`) shown under 'Pick which' and left unpicked is a decline, and
so is one 'All of them' leaves out because alfred-code is set up (its label ends 'alfred-code also installs it, and this
removes it for both'): pass each as `--input retired-declined=<id>~<scope>,...` in step 3, and it is not offered again.
When nothing else was picked, step 3 runs with `none`. 'Skip' declines nothing.

Then, unless the user picked 'Skip', ask each question in `cursorOffers` as printed, one per root, after the updates:

```ask cursor-offer
Cursor is on this machine, and the <n> servers in <root> are set up for Claude Code only. Set them up for Cursor too?
- 'Set them up for Cursor too (Recommended)' - each server is written to Cursor's mcp.json, as configure's app change would do
- 'Not now' - nothing changes, and update does not ask again for this root
```

Pass the answer as `--input <the question's id>=<value>`: the id is `cursor-offer:<root>`, the value is the question's
`answers` entry for the label picked (`set` or `declined`). 'Not now' is kept in that root's list and the offer is not
put again; configure's per-server question still adds Cursor at any time. Right after 'Set them up for Cursor too', ask
the questions in `cursorNameQuestions` whose id names a file of that root's servers, four per call - each is a name
Cursor's file already holds as the user's own - and pass each answer as `--input cursor-name:<name>@<file>=<value>`,
the id's part after `cursor-name-` and the value from its `answers`. A name with no answer stays Claude Code only and
the report names it.

## 3. Apply

State what will change - each `current -> offered`, and each new way to pass data as its line says - and, for an MCP
server, that its registration is removed and added again, so the server is briefly unregistered. Then run, with the
ids picked (comma-separated), or `all` for 'All of them':

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/update.ts" --apply <id,id | all | none> --data "${CLAUDE_PLUGIN_DATA}" [--input retired-declined=<id>~<scope>,...] [--input cursor-offer:<root>=set|declined] [--input cursor-name:<name>@<file>=replace|keep]
```

Each pin moved, and each new way to pass data, is written to every app its list entry names in the same run: the
list takes the registration as read back, and Cursor's `mcp.json` takes the list. A copy Cursor lacks, or one edited
there by hand, is left as it is and named ('<name>: Cursor's copy was changed by hand - left; run /alfred-tools:fix').
When Cursor's copy of a server changes, the report ends with 'Cursor asks you to approve <names> again - it re-asks
whenever an entry changes': tell the user Cursor will ask.

Run it with the Bash tool's `timeout: 600000` (10 minutes, the most it allows by default): a plugin update clones its marketplace, and the new MCP pins are downloaded after it, not inside it. `all` is every
offer with a known newer version; an unchecked plugin runs only when its own id is given. Each update is read back: a
plugin from the plugin list, an MCP pin from the file the CLI wrote, a key helper
from its first line and digest, a new way to pass data by its detector run again. The new ways run first - a
registration's, then a file's - and a pin moved after them starts from what they wrote, so both changes stay and the
health check never starts a pin not fetched yet; their lines are fix's own, and one an earlier step already did reads
`already done by an earlier step in this run`. A failed MCP
rewrite puts the old registration back and prints the line that does it by hand if that fails too (`RESTORE BY HAND`):
give it to the user as written.
A key in it shows as `${ALFRED_TOOLS_KEPT}`, never its value: the user puts their key back there. Paste the output verbatim, then report each result as read back.
If the output has a `RECHECK` line, go back to step 1 in this same command (once): the rest was not offered before the move.

A new pin is not in the runtime's cache yet, so an MCP update prints `Fetch next, in the background (...): <file>`. Run,
with the Bash tool's `run_in_background`:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/fetch.ts" "<file>"
```

One server at a time, it downloads each new pin and starts the server once with no 30-second limit, then prints each
server's status (`claude mcp get`): without it the first session start does that download, and any first-run work of
the new version, inside Claude Code's 30-second limit, and a first download can take minutes. Claude Code asks
permission for it - it downloads and runs a package's install and starts the server. Tell the user to restart only once
it reports, so a session start does not download the same package beside it (an npx server then fails at every start
with `ENOENT` until `/alfred-tools:fix` repairs it); paste its output when it finishes. A
`warn` line changes nothing: the registration is updated, and its first start downloads the pin and may time out once. When background runs
are turned off, run it in the foreground with `timeout: 600000`, and again if the limit stops it. End with the restart line when the script prints one (new
servers load on the next session start; `/reload-plugins` for plugins): a key helper runs at each connect, so a run
that only rewrote helpers needs no restart.

A key helper that was edited by hand, or is newer than this plugin, is never rewritten here: the check names it, and
`/alfred-tools:fix` (`helper-stale`) handles it.

## Windows and serena

A serena bump on Windows needs nothing extra here: this plugin does not patch serena's TypeScript launcher (the user's
ruling, recorded in `docs/sources.md`). If symbol tools fail afterwards, `/alfred-tools:fix` lists what it can detect.
