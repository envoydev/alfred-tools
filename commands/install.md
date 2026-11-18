---
description: "Install preferred MCP servers that are not installed yet, for Claude Code and Cursor: pick, set up, one confirmed plan"
argument-hint: "[tool id]"
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/tmpdir.ts"), Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/inventory.ts" *), Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/table.ts" *), Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/plan.ts" *), Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/prereq.ts" *)
---

Walk the user through installing tools from alfred-tools that are not installed here yet. The scripts do the work and print what
you paste; you ask the questions. Argument: `$ARGUMENTS`.

Install only adds; it never changes, moves or removes a registration. A tool already installed in this project is
changed or removed with `/alfred-tools:configure`; say so whenever the user asks for that here.

## Rules

- **Nothing is applied before one confirmation** (step 6). Every earlier step reads and asks.
- **The `claude` CLI is the only writer** of `.mcp.json` and the account file; `apply.ts` calls it. Never edit those
  files by hand.
- **A registration that matches no catalog row is the user's.** It is listed, never touched.
- **Scopes are Global, Project and Local.** Global is `user` scope - every project on this machine.
- **Keys live in `.mcps-secrets` in the root folder**, one per root (the project root for Project and Local, the global
  root for Global), and the user fills each value by hand. The apply writes names only, as empty `NAME=` lines. A hosted
  route reads its key through `mcp-headers.js` each time Claude Code connects; a local route's key is written into the
  registration at Local and Global scope. Never ask for a key, and never read, print or edit a value: name the file and
  the name.
- **Every ask is data or one of the blocks below.** Ask exactly the options printed, in the order printed; do not add or
  reword one. `AskUserQuestion` adds 'Other' itself.
- **A typed value is asked next, in one plain line that ends your turn.** When the option picked says 'asked next' (a
  folder you name, a name you choose, a setting, a browser binary, a host), ask for that one value in a single line of
  text - no `AskUserQuestion` - and end the turn; the user's next message is the value. A value the user typed as the
  Other answer to that question is taken the same way.
- If a script fails with `ERR_UNKNOWN_FILE_EXTENSION` or `Unknown file extension ".ts"`, stop and tell the user:
  alfred-tools needs Node 22.18 or newer - `node --version` shows yours.
- Every file below lives in one temp folder. Make it once with `node "${CLAUDE_PLUGIN_ROOT}/scripts/tmpdir.ts"` and call
  its path `<tmp>`.

## 1. Inventory

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/inventory.ts" --json <tmp>/inventory.json --data "${CLAUDE_PLUGIN_DATA}"
```

It reads `.mcp.json`, the account file (user servers and this project's local ones), `claude plugin list --json`, the
servers enabled plugins provide, and the records of earlier answers, and starts no server. Exit 3 with one line means
the `claude` CLI is missing: say so and stop. A file named as not valid JSON is unreadable: its scope gets no write, and
you offer nothing that writes there.

## 2. The table

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/table.ts" <tmp>/inventory.json
```

Paste the output verbatim in a fenced block. It is the whole catalog for this OS, numbered, with what is installed at
each scope as `name [route, pin]`.

## 3. Pick

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/plan.ts" --questions <tmp>/inventory.json --data "${CLAUDE_PLUGIN_DATA}" --connectors "<Name>,<Name>"
```

`<Name>,<Name>`: the claude.ai connectors this session has loaded - each `<Name>` in your own tool names
`mcp__claude_ai_<Name>__<tool>`, once each (`mcp__claude_ai_Context7__query-docs` gives `Context7`); `""` when there are
none. The call reads the registrations and starts no server; it asks nothing about servers already set up.
If the questions call exits 1 naming the plugin's old folder, show that line and stop.

Its `pick` holds only the tools not installed here, without a server left on its own. When it is empty, say every
catalog tool for this OS is installed or left on its own, point to `/alfred-tools:configure` to change or remove one,
and stop.

If the argument is a tool id from the table: installed, say where (from the table) and point to
`/alfred-tools:configure <id>`, then stop; not installed, take it as the only pick and go to step 4.

Otherwise ask each `pick` call as printed - one `AskUserQuestion` of up to four multi-select questions of 2 to 4
options, grouped Code, Docs and forges, Browsers, Machine - and collect the labels picked; each label is the tool id,
then what it already has:

- `(installed for every project ...)` - a copy is installed at Global scope. The pick gets this project's own copy
  beside it; the one for every project is never changed or removed. Its questions leave out the scope it already has
  (and the scope question itself when one scope is left). Under the same name, the copy is the one Claude Code uses in
  this project. A tool whose data defaults to the global root (memory) defaults to the project root for a copy, so it
  starts empty and the global data is not seen here; 'Keep' at the location question shares that data instead. Say
  this when such a tool is picked.
- `(also connected through claude.ai)` or `(also provided by the <plugin> plugin)` - the same server reaches this
  session another way. The pick adds this project's own registration beside it, and the plan names the two servers.

'None of these', or nothing picked: say so and stop.

## 4. Settings, one tool at a time

Write `{"rows": [<picked ids>], "done": []}` to `<tmp>/picks.json` and run:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/plan.ts" --questions <tmp>/inventory.json <tmp>/picks.json --data "${CLAUDE_PLUGIN_DATA}"
```

Its `next` is the one step to ask now: `next.id`, the `next.tool` it belongs to, `next.call` (the questions, as one
`AskUserQuestion`) and, sometimes, `next.set` (the one folder left for the tool; the record call writes it). The first
step is the apps question, the second the settings question; every step after them is one tool's, and one tool's steps
come one after another - its route, scope and name, the root folder its scope uses when this run has not asked it yet,
its location and extras, then its key name and settings. Until `next.id` is `done`:

1. Ask `next.call` as printed. When `next.call` is empty, make no call.
2. When a label is answered by something typed next (listed below), ask it in chat.
3. Write `<tmp>/step.json` - `{"id": <next.id>, "answers": {<question id>: <label>}}`, an answer with a typed value as
   `{"label": ..., "typed": ...}`, an 'Other' answer as `{"other": ...}` - and run:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/plan.ts" --record <tmp>/inventory.json <tmp>/picks.json <tmp>/answers.json <tmp>/step.json --data "${CLAUDE_PLUGIN_DATA}"
   ```

   It records the answers, marks the step done and prints the next step; exit 2 names what to fix.

The apps question is asked once a run, for every tool picked; 'Claude Code and Cursor' is recommended when Cursor is
found (`~/.cursor`, `cursor-agent` or `cursor` on `PATH`, or a server already set up for it):

```ask clients
Which apps should these servers be set up for?
- 'Claude Code and Cursor (Recommended)' - each server is written to .mcp.json or your account and to Cursor's mcp.json
- 'Claude Code only' - Cursor is left as it is
```

'Use the recommended settings' ends the walk at once: the recommended route, scope, roots, key names and settings are
used. A tool already installed in this project is never offered, so either answer only adds: nothing installed is
changed.

These labels are answered by a value typed next, one plain line each (see the Rules), written as `typed`:

- a root's 'A folder you name', a location's 'Another ...folder' and a browser's 'A browser binary I name': a path;
- a host's 'A self-managed host': the host;
- a key name's or URL name's 'A name you choose': a name matching `^[A-Za-z_][A-Za-z0-9_]*$`;
- settings 'Change or add a setting': `NAME=value` pairs, written as an object `{"<NAME>": "<value>"}`. The plan refuses
  a name that looks like a credential: a key goes in `.mcps-secrets` and is picked as the key's name, never typed here;
- a hosted route's 'Tools' answer that chooses toolsets (sonarqube): which toolsets to send, as one list written
  `<key>,<key>` - `analysis`, `coverage`, `dependency-risks`, `duplications`, `issues`, `measures`, `projects`,
  `quality-gates`, `rules`, `security-hotspots`; the plan refuses an unknown key and an empty list. The organization
  (`SONARQUBE_ORG`) is read from `.mcps-secrets` and is optional.

The walk leaves the key name out when the API key answer was 'No key - lower rate limits' or 'Sign in with OAuth'.

A bridge route (sentry's 'Bridge') asks one 'URL name' question per value its URL takes from `.mcps-secrets`, beside the
key name: which name holds the organization slug, and the project slug. The catalog's name is recommended, and a filled
name holding the row's word (`SENTRY`) is offered beside it, never above it. A URL value is a plain name the user writes
in `.mcps-secrets`, never a key: the plan refuses a URL name that is the key's name or reads as a credential, and a
name two parts of the URL share.

## 5. Prerequisites

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/prereq.ts" <tmp>/answers.json --audit
node "${CLAUDE_PLUGIN_ROOT}/scripts/prereq.ts" <tmp>/answers.json --json
```

Paste the first output verbatim. It checks `uvx`, `npx`, Docker or the github binary, Google Chrome or Microsoft Edge
for the Playwright rows that drive them, the Android SDK and a JDK, only for the picks that need them,
and runs `npm audit` on appium's package. The audit lines go into step 6's confirmation as they are; an 'audit not run'
line is not a pass.

From the second (JSON) output, copy `machine` into `<tmp>/answers.json` under `"machine"`; it is how the plan knows
whether Docker is there. For each tool with a missing prerequisite, ask once, one tool per call, as the walk asks:

```ask prereqMissing
<tool> needs <prerequisite>, which is missing. What now?
- 'Skip this tool (Recommended)' - leave it out of the plan
- 'Install it now' - run the install line shown, or install it yourself and re-check
- 'Register anyway' - register it; it will not start until the prerequisite is there
```

'Skip': run this, which leaves the tool out and keeps it out:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/plan.ts" --skip <tmp>/inventory.json <tmp>/picks.json <tmp>/answers.json <tool> --data "${CLAUDE_PLUGIN_DATA}"
```

'Install it now': when the output gave an `install:` command, run it; when it gave only a page, give the user that
page and ask:

```ask prereqInstalled
Is <prerequisite> installed for <tool> now?
- 'Check again (Recommended)' - run the prerequisite check again
- 'Skip this tool' - leave it out of the plan
```

'Check again' runs `prereq.ts` again; 'Skip this tool' runs `--skip`, as 'Skip' does. 'Register anyway': keep it, and say
in the confirmation that it will not start yet.

## 6. Plan, then one confirmation

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/plan.ts" <tmp>/inventory.json <tmp>/answers.json --out <tmp>/plan.json --data "${CLAUDE_PLUGIN_DATA}" --connectors "<Name>,<Name>"
```

`--connectors` names the same connectors as step 3, so a recorded connector that is gone is dropped and a server also
connected through claude.ai is named beside this project's own. Paste the output verbatim in a fenced block: every CLI
call, every file it writes (the root's `.gitignore`, `mcp-headers.js`, the key names in `.mcps-secrets`), the `Key:`
line of each route that uses a key (the name, the files it is read from, filled or not - never a value) and the line
under it that says how the server connects once the key is there, the sign-in a remote route will ask for, and the tools
that can run code. Three kinds of step may read new:

- `writes` or `removes <root>/mcps.json` - the list: each server alfred-tools manages, as written and read back, and
  the servers left on their own; the file is removed once it lists none.
- `reorders <project>/.mcp.json (no value changes)` - after a change at Project scope, the catalog servers in the user's
  order, the user's own servers after them; no entry is changed.
- `Apps:` and `writes <project>/.cursor/mcp.json` or `~/.cursor/mcp.json` - the apps answered, and Cursor's file for
  each scope written; the user's own entries in it are kept as they are.

Exit 1 means the plan has errors; show them and rewind the pick each names (below), never go around them. Add the
audit and 'register anyway' lines from step 5.

A `cursor: <file> already has <name> - answer cursor-name-<name>@<file>` error is not a wrong answer: Cursor's file
already holds a server under a name this plan writes for Cursor, one alfred-tools did not write. `<tmp>/plan.json`
`cursorNames` holds one question per such name, id `cursor-name-<name>@<file>`; ask them, four per call, as written -
the recommended option follows whether the entry there is the same server:

```ask cursor-name-taken
Cursor's <file> already has a server named <name> that alfred-tools did not write. What should happen?
- 'Replace it with the plugin's (Recommended)' - Cursor gets the same entry as Claude Code; the old one is dropped, not saved
- 'Keep Cursor's own' - <name> is set up for Claude Code only, and Cursor's entry stays as it is
```

Record each answer's value (`replace` or `keep`) in `<tmp>/answers.json` under `"cursorNames"`, keyed `<name>@<file>`
(the question id after `cursor-name-`), then run the plan again. Never edit Cursor's file by hand to get past it.

Once the plan has no errors:

```ask apply
Apply this plan?
- 'Apply (Recommended)' - runs the calls above in order, stops at the first failure
- 'Change something' - go back to the answers
- 'Cancel' - nothing is applied
```

'Change something', or a plan error, runs this, where `<pick>` is a tool id, `clients` or `settings` - for a plan error,
the one it names:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/plan.ts" --rewind <tmp>/inventory.json <tmp>/picks.json <tmp>/answers.json <pick> --data "${CLAUDE_PLUGIN_DATA}"
```

For 'Change something', run it first without `<pick>`: it prints one question to ask as printed, and `answers.rewind`
maps each label to its pick. `''` is 'Change nothing' - put the apply ask again with the plan as it was. `'another'` -
ask for the pick in one plain line. Then run it with the pick chosen: it drops that pick's recorded steps and prints the
walk's next step. Run step 4's loop again to `done` from that `next`, then steps 5 and 6's plan again, before the apply
ask is put again.

An empty plan says 'Nothing to apply'; show that and stop without asking.

## 7. Apply

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/apply.ts" <tmp>/plan.json --tmp <tmp> --data "${CLAUDE_PLUGIN_DATA}"
```

Run it with the Bash tool's `timeout: 600000` (10 minutes, the most it allows by default). It writes the root's files
first, then makes the CLI calls and their read-back - seconds a tool - then the records,
and leaves every download to step 8, so it ends well inside the limit and its report comes back in this turn. Claude
Code asks permission for this call itself - `apply.ts` is deliberately not in `allowed-tools` - so a skipped ask still
cannot change anything. It runs the steps in order, reads each back, and stops at the first failure, leaving what was
applied in place and naming it; a re-run reuses the files already written. Paste the output verbatim. A failure prints
the line that puts a registration back (`RESTORE BY HAND`): give it to the user as written. A key in it shows as
`${ALFRED_TOOLS_KEPT}`, never its value: the user puts their key back there.

Then report each picked tool as the read-back printed it (name, scope, route). Start step 8. Keys: relay each `key:` line as printed (the name and its file, never a
value). After the read-back the apply prints one line per hosted server that takes a key - relay each as printed:

- `<name>: connects with its key at the next session start; in a session already running, /mcp -> <name> -> Reconnect`
  - the key is filled;
- `<name>: fill <NAME> in <file>, then Reconnect it in /mcp - ...` - it is not, and the line says how the server runs
  until then;
- `<name>: the server refused the key in <NAME> - <hint>` - the server answered 401 or 403 to the key it was sent: the
  value is wrong for that server, and the hint says what it takes (gitlab a fine-grained token, atlassian
  `email:api_token`). The user fixes the value in the file and reconnects; nothing here reads it.

A Project- or Local-scope server with a key helper connects with its key only once the trust prompt is accepted - say
so. A bridge reads its key and URL names each time the server starts: repeat the plan's 'fill ... in ...' note, and say
that after a change to them the user restarts Claude Code or reconnects the server in `/mcp`. Close with one line: a later rename, move, route, location, key name, settings or root folder change, or a remove,
is `/alfred-tools:configure`.

## 8. Fetch

With no `Fetch next` line there is nothing to download (hosted routes only): the apply printed each server's
status itself, so end with the restart line below. When the apply output has `Fetch next, in the background (...):
<file>`, run, with the Bash tool's `run_in_background`:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/fetch.ts" "<file>"
```

One server at a time, it downloads what the server launches into its runtime's cache (npm, uv or Docker), then starts
the server once exactly as registered and stops it when it answers, then prints each server's status as `claude mcp get`
reports it. Claude Code gives a server 30 seconds to answer, and a first start can take minutes: memory's package came
down in seconds, but its first start then downloaded its embedding model for about 2 minutes, while later starts took 2
seconds. A server whose `${VAR}` is not set is fetched but not started (a `skip` line). A foreground call past its time
limit (2 minutes by default, 10 at most) is moved to the background, or stopped where background runs are turned off,
so this one starts in the background. Claude Code asks permission for it - it downloads and runs a package's install and
starts the server - so it is not in `allowed-tools`.

Tell the user it is running, and to restart Claude Code only once it reports: a session started now begins the same
download beside it, and two at once is the one case measured to break a start - an npx server then fails at every start
with `ENOENT` until `/alfred-tools:fix` (`npx-cache-entry`) repairs it. When it finishes, paste its output
verbatim and end with the restart line: the new registrations load on the next session start, and a project-scope
server also needs the trust prompt then. A `warn` line changes nothing: the registration stays, and its first session
start does the download or first-run work and may time out once - say so. When background runs are turned off, run it
in the foreground with `timeout: 600000`; one stopped by the limit is run again, and the cache keeps what it finished.

**Sign-in.** For each server the plan named in an `OAuth:` line that says its browser opens to sign in the first time it
starts (the shared sign-in), ask once the fetch has reported (sign-in.ts and the fetch both start npx, and two at once is
the one case measured to break a start); the scope is the one the user picked for that server, and fetch's `skip` line
names it too:

```ask signInNow
Sign in to <name> now?
- 'Sign in now (Recommended)' - opens your browser and waits up to five minutes; the sign-in is kept in the root and serves Claude Code and Cursor
- 'At the next session start' - its first start then opens the browser inside Claude Code's 30-second limit, and /mcp reconnects it after
```

Then, for 'Sign in now', run:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/sign-in.ts" "<name>" "<scope>"
```

Run it with the Monitor tool - `command: node "${CLAUDE_PLUGIN_ROOT}/scripts/sign-in.ts" "<name>" "<scope>"`, a
`description` naming the server, and `timeout_ms: 330000` (its `--auth-timeout 300` plus the npx start) - and tell the
user the browser opens and the sign-in has five minutes. Each stdout line it prints is an event, and it prints at most
two: `<name>: no browser opened - open this link to sign in: <link>` when the client could not open a browser (relay the
link to the user at once and send a PushNotification where the session has one; the client keeps waiting), and the
result, `<name>: signed in`, or `<name>: sign-in failed: <why>` with exit 1. It never prints a token or the tool list.
A foreground Bash call shows its output only when it ends, after the client and its callback are gone, so the link
would arrive too late; where Monitor is not available, run it with the Bash tool's `run_in_background: true` and
`timeout: 330000`, and Read its output file for the link line. The sign-in returns to `http://localhost:<port>/oauth/callback`
on the machine running the client: on a remote machine (SSH), forward that port first with
`ssh -L <port>:localhost:<port> <host>`, taking the port from the link's `redirect_uri` parameter, or open the link in a
browser on that machine. It is not in `allowed-tools` - it opens a browser and writes tokens - so Claude Code asks permission for it.
On a failure say why, that the user can run it again, and that otherwise the first session start opens the browser
inside its 30-second limit. 'At the next session start': say exactly that, and that `/mcp` reconnects the server
after the browser sign-in.
