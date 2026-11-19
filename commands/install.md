---
description: "Install preferred MCP servers that are not installed yet, for Claude Code and Cursor: pick, set up, one confirmed plan"
argument-hint: "[tool id]"
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/tmpdir.ts"), Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/inventory.ts" *), Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/table.ts" *), Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/plan.ts" *), Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/prereq.ts" *)
---

Walk the user through installing tools from alfred-tools that are not installed here yet. The scripts do the work and
print what you paste; you ask the questions. Argument: `$ARGUMENTS`.

Install only adds; it never changes, moves or removes a registration. A tool already installed in this project is
changed or removed with `/alfred-tools:configure`; say so whenever the user asks for that here.

## Rules

- **Nothing is applied before one confirmation** (step 6). Every earlier step reads and asks.
- **A registration that matches no catalog row is the user's.** It is listed, never touched.

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

## 3. Pick

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/plan.ts" --questions <tmp>/inventory.json --data "${CLAUDE_PLUGIN_DATA}" --connectors "<Name>,<Name>"
```

`<Name>,<Name>`: the claude.ai connectors this session has loaded - each `<Name>` in your own tool names
`mcp__claude_ai_<Name>__<tool>`, once each (`mcp__claude_ai_Context7__query-docs` gives `Context7`); `""` when there are
none. If the call exits 1 naming the plugin's old folder, show that line and stop.

Its `pick` holds only the tools not installed here, without a server left on its own. When it is empty, say every
catalog tool for this OS is installed or left on its own, point to `/alfred-tools:configure`, and stop.

If the argument is a tool id from the table: when `pick` offers it - a copy beside one for every project included -
take it as the only pick and go to step 4; otherwise say where it is installed or left on its own (from the table),
point to `/alfred-tools:configure <id>`, and stop. Any other argument: say it is no tool id from the table, then ask
the pick below.

Otherwise ask each `pick` call as printed - one `AskUserQuestion` of up to four multi-select questions - and collect the
labels picked; each label is the tool id, then what it already has:

- `(installed for every project ...)` - a copy is installed at Global scope. The pick gets this project's own copy
  beside it; the one for every project is never changed or removed. memory's copy keeps its data in the project root,
  so it starts empty and does not see the memory for every project - say so when it is picked.
- `(also connected through claude.ai)` or `(also provided by the <plugin> plugin)` - the same server reaches this
  session another way. The pick adds this project's own registration beside it.

'None of these', or nothing picked: say so and stop.

## 4. Settings, one tool at a time

Write `{"rows": [<picked ids>], "done": []}` to `<tmp>/picks.json` and run:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/plan.ts" --questions <tmp>/inventory.json <tmp>/picks.json --data "${CLAUDE_PLUGIN_DATA}"
```

Its `next` is the one step to ask now: `next.id`, `next.call` (the questions, as one `AskUserQuestion`) and, sometimes,
`next.set` (the one folder left for the tool; the record call writes it). The first step is the apps question, the
second the settings question, then one tool's steps at a time. Until `next.id` is `done`:

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

It records the answers and prints the next step; exit 2 names what to fix.

The apps question is asked once a run, for every tool picked ('Claude Code and Cursor' is recommended when Cursor is
found):

```ask clients
Which apps should these servers be set up for?
- 'Claude Code and Cursor (Recommended)' - each server is written to .mcp.json or your account and to Cursor's mcp.json
- 'Claude Code only' - Cursor is left as it is
```

'Use the recommended settings' ends the walk at once, with every recommended answer.

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

A bridge route (sentry's 'Bridge') asks one 'URL name' question per value its URL takes from `.mcps-secrets`, beside the
key name. A URL value is a plain name the user writes in `.mcps-secrets`, never a key.

macos-control also asks, in its keys step, 'Turn off the Shell tool' or 'Keep every tool', answered as printed (no typed
value). The recommendation is Off, unless `~/.macos-mcp/config.toml` exists.

## 5. Prerequisites

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/prereq.ts" <tmp>/answers.json --audit
node "${CLAUDE_PLUGIN_ROOT}/scripts/prereq.ts" <tmp>/answers.json --json
```

Paste the first output verbatim. It checks what the picks need and runs `npm audit` on appium's package. The audit lines
go into step 6's confirmation as they are; an 'audit not run' line is not a pass.

From the second (JSON) output, copy `machine` into `<tmp>/answers.json` under `"machine"`. For each tool with a missing
prerequisite, ask once, one tool per call, as the walk asks:

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
node "${CLAUDE_PLUGIN_ROOT}/scripts/plan.ts" --skip <tmp>/inventory.json <tmp>/picks.json <tmp>/answers.json <tool> --data "${CLAUDE_PLUGIN_DATA}"
```

## 6. Plan, then one confirmation

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/plan.ts" <tmp>/inventory.json <tmp>/answers.json --out <tmp>/plan.json --data "${CLAUDE_PLUGIN_DATA}" --connectors "<Name>,<Name>"
```

`--connectors` is step 3's list. Paste the output verbatim in a fenced block. Its `mcps.json` lines are the list of the
servers alfred-tools manages, `reorders` puts the catalog servers in the user's order, `Apps:` names the apps answered,
and each `.cursor` write is Cursor's file, whose user entries are kept.

Exit 1 means the plan has errors; show them and rewind the pick each names (below), never go around them. Add the audit
and 'register anyway' lines from step 5.

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

'Change something', or a plan error, runs this, where `<pick>` is a tool id, `clients` or `settings` - for a plan error,
the one it names:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/plan.ts" --rewind <tmp>/inventory.json <tmp>/picks.json <tmp>/answers.json <pick> --data "${CLAUDE_PLUGIN_DATA}"
```

Run it without `<pick>` for 'Change something', when `--rewind <pick>` exits 2, or when the error names no pick: it
prints one question to ask as printed, and `answers.rewind` maps each label to its pick. `''` is 'Change nothing' - put
the apply ask again with the plan as it was. `'another'` - ask for the pick in one plain line and take the tool id from
what is typed. With the pick chosen it drops that pick's recorded steps and prints the walk's next step. Run step 4's
loop again to `done` from that `next`, then steps 5 and 6's plan again, then the apply ask.

A plan that says 'Nothing to do': show that and stop without asking.

## 7. Apply

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/apply.ts" <tmp>/plan.json --tmp <tmp> --data "${CLAUDE_PLUGIN_DATA}"
```

Run it with the Bash tool's `timeout: 600000`. Claude Code asks permission for this call itself. It stops at the first
failure, leaving what was applied in place and naming it; a re-run reuses the files already written. Paste the output
verbatim. A failure prints the line that puts a registration back (`RESTORE BY HAND`): give it to the user as written. A
key in it shows as `${ALFRED_TOOLS_KEPT}`, never its value: the user puts their key back there.

Then report each picked tool as the read-back printed it (name, scope, route). Start step 8.

<!-- shared:key-lines -->

Keys: relay each `key:` line as printed (the name and its file, never a value), then the line the apply prints after the
read-back for each hosted server that takes a key - the user fixes a missing or refused value in the file and
reconnects.

<!-- /shared:key-lines -->

A Project- or Local-scope server with a key helper connects with its key only once the trust prompt is accepted - say
so. A bridge reads its key and URL names each time the server starts: repeat the plan's 'fill ... in ...' note, and say
that after a change to them the user restarts Claude Code or reconnects the server in `/mcp`. Close with one line: a
later change or remove is `/alfred-tools:configure`.

## 8. Fetch

With no `Fetch next` line there is nothing to download (hosted routes only): end with the restart line below. When the
apply output has `Fetch next, in the background (...): <file>`, run, with the Bash tool's `run_in_background`, and tell
the user it is running:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/fetch.ts" "<file>"
```

<!-- shared:fetch -->

One server at a time, it downloads what the server launches into the runtime's cache and starts it once with no
30-second limit, then prints each server's status. Tell the user to restart only once it reports, and paste its output
verbatim when it finishes; say that a `warn` line changes nothing. When background runs are turned off, run it in the
foreground with `timeout: 600000`, and again if the limit stops it.

<!-- /shared:fetch -->

A session started before it reports begins the same download beside it, and two at once breaks a start: an npx server
then fails at every start with `ENOENT` until `/alfred-tools:fix` repairs it. After a `warn` line the registration
stays, and its first session start does the download or first-run work and may time out once - say so. End with the
restart line: the new registrations load on the next session start, and a project-scope server also needs the trust
prompt then.

**Sign-in.** For each server the plan named in an `OAuth:` line that says its browser opens to sign in the first time it
starts (the shared sign-in), ask once the fetch has reported (sign-in.ts and the fetch both start npx, and two at once
breaks a start); the scope is the one the user picked for that server:

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
