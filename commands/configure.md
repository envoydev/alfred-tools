---
description: "Change or remove installed tools from alfred-tools - route, scope, name, data folder, key name, settings, apps, or a root folder - one confirmed plan"
argument-hint: "[registration name | tool id]"
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/tmpdir.ts"), Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/inventory.ts" *), Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/table.ts" *), Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/plan.ts" *), Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/prereq.ts" *)
---

Walk the user through changing or removing tools from alfred-tools that are already installed here. The scripts do the
work and print what you paste; you ask the questions. Argument: `$ARGUMENTS`.

Configure starts from what is installed: every question recommends what the tool has now, so keeping an answer changes
nothing, and a change is built from the registration as read, so an updated pin is never downgraded. Adding a tool that
is not installed is `/alfred-tools:install`.

## Rules

- **Nothing is applied before one confirmation** (step 7). Every earlier step reads and asks.
- **A registration that matches no catalog row is the user's.** It is listed, never offered, never touched.
- **A server inherited from a parent folder's `.mcp.json` is that folder's.** It is noted under the table, never
  offered; to change it, run `/alfred-tools:configure` in that folder.

<!-- shared:rules -->

- **The `claude` CLI is the only writer** of `.mcp.json` and the account file; `apply.ts` calls it. Never edit them by
  hand.
- **Scopes are Global, Project and Local.** Global is `user` scope - every project on this machine.
- **Keys live in `.mcps-secrets` in the root folder**, one per root (the project root for Project and Local, the global
  root for Global); the user fills each value and the apply writes names only, as empty `NAME=` lines. Never ask for a
  key, and never read, print or edit a value or a sign-in token in `mcp-remote-v1/`: name the file and the name.
- **Every ask is data or one of the blocks below.** Ask exactly the options printed, in the order printed, adding or
  rewording none. `AskUserQuestion` adds 'Other' itself.
- **A typed value is asked next, in one plain line that ends your turn.** When the option picked says 'asked next', ask
  for that one value - no `AskUserQuestion` - and end the turn; the user's next message (or an Other answer to that
  question) is the value.
- If a script fails with `ERR_UNKNOWN_FILE_EXTENSION` or `Unknown file extension ".ts"`, stop and tell the user:
  alfred-tools needs Node 22.18 or newer - `node --version` shows yours.
- Every file below lives in one temp folder. Make it once with `node "${CLAUDE_PLUGIN_ROOT}/scripts/tmpdir.ts"` and call
  it `<tmp>`.

<!-- /shared:rules -->

<!-- shared:inventory-table -->

## 1. Inventory

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/inventory.ts" --json <tmp>/inventory.json --data "${CLAUDE_PLUGIN_DATA}"
```

It reads the registrations, the plugins and the records of earlier answers, and starts no server. Exit 3 with one line
means the `claude` CLI is missing: say so and stop. An `alfred-tools: <file or list> is malformed` or `... is
unreadable` line says what it means for this run: relay it, and offer nothing that writes to that file. A script that
exits 2 printed one line naming the input it refused, and wrote nothing.

## 2. The table

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/table.ts" <tmp>/inventory.json
```

Paste the output verbatim in a fenced block: the whole catalog for this OS, numbered, with what is installed at each
scope as `name [route, pin]`.

<!-- /shared:inventory-table -->

## 3. What to change

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/plan.ts" --questions <tmp>/inventory.json --data "${CLAUDE_PLUGIN_DATA}"
```

Its `change.keys` maps each option to its key (`mcp:<name>~<scope>`, `plugin-mcp:<plugin>/<server>`, `connector:<Name>`,
`root:project`, `root:global`). When it is empty, say nothing from the catalog is installed here, point to
`/alfred-tools:install`, and stop. If the call exits 1 naming the plugin's old folder, show that line and stop.

The argument, when given:

- a registration name, or a tool id - the keys whose label starts with that name or names that tool. One: the only pick,
  go to step 5. Several: say where each is installed and ask step 4 as printed. None: say it is not installed, point
  to `/alfred-tools:install <id>`, and stop.

Otherwise ask:

```ask menu
What do you want to change?
- 'Change tools (Recommended)' - pick installed tools, servers on their own or a root folder, then what to change
- 'Remove tools' - choose the servers to remove
- 'Done' - nothing changes
```

'Done' ends the command. 'Remove tools' goes to step 9.

## 4. Pick

Ask each `change.calls` call as printed - one `AskUserQuestion` of up to four multi-select questions - and turn each
picked label into its key through `change.keys`. 'None of these', or nothing picked: say so and stop.

## 5. Each pick, one step at a time

Write `{"targets": [<picked keys>], "done": []}` to `<tmp>/picks.json` and run:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/plan.ts" --questions <tmp>/inventory.json <tmp>/picks.json --data "${CLAUDE_PLUGIN_DATA}"
```

Its `targets.<key>` holds each pick's `row` and what it has now; a target with an `error` is not changed - say why. Its
`next` is the one step to ask now: `next.id`, `next.call` (the questions, as one `AskUserQuestion`) and, sometimes,
`next.set` (the one folder left at the new scope; the record call writes it). Until `next.id` is `done`:

<!-- shared:walk-steps -->

1. Ask `next.call` as printed. When `next.call` is empty, make no call.
2. When a label is answered by something typed next (listed below), ask it in chat.
3. Write `<tmp>/step.json` - `{"id": <next.id>, "answers": {<question id>: <label>}}`, an answer with a typed value as
   `{"label": ..., "typed": ...}`, an 'Other' answer as `{"other": ...}`, and `{}` for `answers` when no call was made -
   and run:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/plan.ts" --record <tmp>/inventory.json <tmp>/picks.json <tmp>/answers.json <tmp>/step.json --data "${CLAUDE_PLUGIN_DATA}"
   ```

<!-- /shared:walk-steps -->

It records the answers (leaving out each one that keeps what the tool has now) and prints the next step; exit 2 names
what to fix. What each step is:

- **On its own** (a server left on its own, a plugin's server or a connector): 'Let alfred-tools manage it' hands it to
  configure, update and fix from now on; for a plugin's server or a connector, the other option lets install offer
  alfred-tools' own beside it.
- **A root folder**: another root re-adds each registration of that family pointing into the new root; it moves no data
  and no key value, and names both.
- **A registration**: its first question is 'Who looks after <name>?'. 'Leave it on its own' ends this pick: configure,
  update and fix skip it from now on. 'alfred-tools' goes on to its route, scope and name, location and extras, key name
  and settings, then 'Set up <name> for which apps?'. macos-control's extras add 'Turn off the Shell tool' (recommending
  what it has; your own `--config` file is not asked). A change of the apps alone makes no `claude` call: the plan
  writes the list and Cursor's file only.

<!-- shared:typed-values -->

These labels are answered by a value typed next, one plain line each (see the Rules), written as `typed`:

- a root's 'A folder you name', a location's 'Another ...folder' and a browser's 'A browser binary I name': a path;
- a host's 'A self-managed host': the host;
- a key name's or URL name's 'A name you choose': a name matching `^[A-Za-z_][A-Za-z0-9_]*$`;
- settings 'Change or add a setting': `NAME=value` pairs, written as an object `{"<NAME>": "<value>"}`. The plan refuses
  a name that looks like a credential: a key goes in `.mcps-secrets` and is picked as the key's name, never typed here;

<!-- /shared:typed-values -->

- a hosted route's 'Tools' answer that chooses toolsets (sonarqube): which toolsets to send, as one list written
  `<key>,<key>` - `analysis`, `coverage`, `dependency-risks`, `duplications`, `issues`, `measures`, `projects`,
  `quality-gates`, `rules`, `security-hotspots`.

A bridge route (sentry's 'Bridge') adds one 'URL name' question per value its URL takes from `.mcps-secrets`. A change
takes effect when the server starts again: say to restart Claude Code or reconnect in `/mcp`.

A scope change on an MCP server is a move: a copy for every project moved to Local is gone from the other projects. To
keep it there and add this project's own copy, use `/alfred-tools:install`; say so when a Global registration moves.

## 6. Prerequisites

Only when an entry in `answers.json` has a `route` (a route change):

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/prereq.ts" <tmp>/answers.json --audit
node "${CLAUDE_PLUGIN_ROOT}/scripts/prereq.ts" <tmp>/answers.json --json
```

Paste the first output verbatim; its audit lines go into step 7's confirmation as they are, and an 'audit not run' line
is not a pass. From the second (JSON) output, copy `machine` into `<tmp>/answers.json` under `"machine"`. For each
change with a missing prerequisite, ask once (up to four per call):

<!-- shared:prereq -->

```ask prereqMissing
<tool> needs <prerequisite>, which is missing. What now?
- 'Skip this tool (Recommended)' - leave it out of the plan
- 'Install it now' - run the install line shown, or install it yourself and re-check
- 'Register anyway' - register it; it will not start until the prerequisite is there
```

'Install it now': when the output gave an `install:` command, run it; when it gave only a page, give the user that page
and ask:

```ask prereqInstalled
Is <prerequisite> installed for <tool> now?
- 'Check again (Recommended)' - run the prerequisite check again
- 'Skip this tool' - leave it out of the plan
```

'Check again' runs `prereq.ts` again; 'Skip this tool' runs the `--skip` call below, as 'Skip' does. 'Register anyway':
keep it, and say in the confirmation that it will not start yet.

<!-- /shared:prereq -->

'Skip' runs:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/plan.ts" --skip <tmp>/inventory.json <tmp>/picks.json <tmp>/answers.json <key or row> --data "${CLAUDE_PLUGIN_DATA}"
```

## 7. Plan, then one confirmation

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/plan.ts" <tmp>/inventory.json <tmp>/answers.json --out <tmp>/plan.json --data "${CLAUDE_PLUGIN_DATA}"
```

Paste the output verbatim in a fenced block. An entry that holds a credential outside its key helper is a plan error,
never written. A root change notes that the user copies the old `.mcps-secrets` values to the new one - say it again
after the apply. Exit 1 means plan errors: show them and rewind the pick each names (below), never go around them.

<!-- shared:cursor-name -->

A `cursor: <file> already has <name> - answer cursor-name-<name>@<file>` error is not a wrong answer: ask the questions
in `<tmp>/plan.json` `cursorNames` (id `cursor-name-<name>@<file>`), four per call, as written - the recommended option
follows whether the entry there is the same server:

```ask cursor-name-taken
Cursor's <file> already has a server named <name> that alfred-tools did not write. What should happen?
- 'Replace it with the plugin's (Recommended)' - Cursor gets the same entry as Claude Code; the old one is dropped, not saved
- 'Keep Cursor's own' - <name> is set up for Claude Code only, and Cursor's entry stays as it is
```

Record each answer's value (`replace` or `keep`) in `<tmp>/answers.json` under `"cursorNames"`, keyed `<name>@<file>`
(the question id after `cursor-name-`), then run the plan again. Never edit Cursor's file by hand to get past it.

<!-- /shared:cursor-name -->

<!-- shared:apply-ask -->

Once the plan has no errors:

```ask apply
Apply this plan?
- 'Apply (Recommended)' - runs the calls above in order, stops at the first failure
- 'Change something' - go back to the answers
- 'Cancel' - nothing is applied
```

<!-- /shared:apply-ask -->

'Change something', or a plan error, runs this, where `<pick>` is a target key - for a plan error, the target whose
`targets.<key>.row` the error names:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/plan.ts" --rewind <tmp>/inventory.json <tmp>/picks.json <tmp>/answers.json <pick> --data "${CLAUDE_PLUGIN_DATA}"
```

Run it without `<pick>` for 'Change something', when `--rewind <pick>` exits 2, or when the error names no pick: it
prints one question to ask as printed, and `answers.rewind` maps each label to its pick. `''` is 'Change nothing' - put
the apply ask again with the plan as it was. `'another'` - ask for the pick in one plain line and take the target key
from what is typed through `change.keys`. With the pick chosen it drops that pick's recorded steps and prints the walk's
next step. Run step 5's loop again to `done` from that `next`, then steps 6 and 7's plan again, then the apply ask.

A plan that says 'Nothing to do': show it and stop, no ask.

## 8. Apply

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/apply.ts" <tmp>/plan.json --tmp <tmp> --data "${CLAUDE_PLUGIN_DATA}"
```

Run it with the Bash tool's `timeout: 600000`. Claude Code asks permission for this call itself. It stops at the first
failure, leaving what was applied in place and naming it. Paste the output verbatim. A failure prints the line that puts
a registration back (`RESTORE BY HAND`): give it to the user as written. A key in it shows as `${ALFRED_TOOLS_KEPT}`,
never its value: the user puts their key back there.

Then report each changed tool as the read-back printed it (name, scope, route). A moved data folder or root moves no
data: the plan named the old folder, so name it again.

<!-- shared:key-lines -->

Keys: relay each `key:` line as printed (the name and its file, never a value), then the line the apply prints after the
read-back for each hosted server that takes a key - the user fixes a missing or refused value in the file and
reconnects.

<!-- /shared:key-lines -->

**Fetch.** A change that launches a different package prints `Fetch next, in the background (...): <file>`. Run, with
the Bash tool's `run_in_background`:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/fetch.ts" "<file>"
```

<!-- shared:fetch -->

One server at a time, it downloads what the server launches into the runtime's cache and starts it once with no
30-second limit, then prints each server's status. Tell the user to restart only once it reports, and paste its output
verbatim when it finishes; say that a `warn` line changes nothing. When background runs are turned off, run it in the
foreground with `timeout: 600000`, and again if the limit stops it.

<!-- /shared:fetch -->

An npx server that fails at every start with `ENOENT` afterwards was started beside the download: `/alfred-tools:fix`
repairs it. End with the restart line: a changed
registration loads on the next session start, and a project-scope server also needs the trust prompt then.

**Sign-in.** For each server the plan named in an `OAuth:` line that says its browser opens to sign in the first time it
starts (the shared sign-in), ask once the fetch has reported (sign-in.ts and the fetch both start npx, and two at once
breaks a start); the scope is the one the registration has now:

<!-- shared:sign-in -->

```ask signInNow
Sign in to <name> now?
- 'Sign in now (Recommended)' - opens your browser and waits up to five minutes; the sign-in is kept in the root and serves Claude Code and Cursor
- 'At the next session start' - its first start then opens the browser inside Claude Code's 30-second limit, and /mcp reconnects it after
```

Then, for 'Sign in now', run `node "${CLAUDE_PLUGIN_ROOT}/scripts/sign-in.ts" "<name>" "<scope>"` with the Monitor tool
(that line as `command`, a `description` naming the server, `timeout_ms: 330000`) - and tell the user the browser opens
and the sign-in has five minutes. Each stdout line it prints is an event, at most two:
`<name>: no browser opened - open this link to sign in: <link>` (relay the link at once and send a PushNotification
where the session has one; the client keeps waiting), then `<name>: signed in`, or `<name>: sign-in failed: <why>` (exit
1). Where Monitor is not available, run it with the Bash tool's `run_in_background: true` and `timeout: 330000` and Read
its output file for the link line. The sign-in returns to `http://localhost:<port>/oauth/callback` on the machine
running the client: over SSH, forward that port first with `ssh -L <port>:localhost:<port> <host>` (the port is in the
link's `redirect_uri`), or open the link in a browser on that machine. On a failure say why, that the user can run it
again, and that otherwise the first session start opens the browser inside its 30-second limit. 'At the next session
start': say exactly that, and that `/mcp` reconnects the server after the browser sign-in.

<!-- /shared:sign-in -->

## 9. Remove

```ask removeFirst
Remove what?
- 'Pick which (Recommended)' - choose the servers to remove
- 'Cancel' - nothing is removed
```

'Pick which': ask the `remove` calls from step 3's output as printed. Each option's description is the exact command,
from which you read the target: `claude mcp remove <name> -s <scope>` is `{"kind": "mcp", "name": ..., "scope": ...}`.
'None of these', or nothing picked: say so and stop. Put them in `answers.json` under `"remove"` and go to step 7. Data
folders and key files stay where they are; the plan names them.
