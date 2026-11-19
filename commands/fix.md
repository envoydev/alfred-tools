---
description: "Detect known problems in the installed tools and apply the recorded fix for each one you pick"
argument-hint: "[tool, registration name or fix id]"
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/fix.ts" --detect), Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/fix.ts" --detect *), Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/fix.ts" --questions), Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/fix.ts" --questions *)
---

Find the known problems in what is installed and apply the recorded fix for each one the user picks. Every fix row is
in `${CLAUDE_PLUGIN_ROOT}/catalog/fixes.json`; the detectors are in `${CLAUDE_PLUGIN_ROOT}/scripts/fix/`. A row whose
detector finds nothing is not shown. The argument, when given, narrows everything below to one fix id, tool or
registration name: `$ARGUMENTS`.

If a script fails with `ERR_UNKNOWN_FILE_EXTENSION` or `Unknown file extension ".ts"`, stop and tell the user:
alfred-tools needs Node 22.18 or newer - `node --version` shows yours.

## 1. Detect

Run, adding `--only "$ARGUMENTS"` when there is an argument:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/fix.ts" --detect --data "${CLAUDE_PLUGIN_DATA}"
```

Paste its output verbatim in a fenced block. It lists each problem found - the fix id, the tool by its registration
name and scope, what was found - and any note. A line ending 'NOT APPLICABLE' has a reason and is never applied. A
server left on its own at install is listed as 'on its own - not checked'; `/alfred-tools:configure` hands it back.
A `note:` line (a Project-scope key helper waiting for the trust prompt, say) is advice, not a fix: relay it. A row
named 'Held' is an open decision, not a problem; mention it in one line and leave it.

Three rows look after what 0.2.0 wrote at Project scope:

- `project-relative-path` - a data folder or the key helper named relative, or through `${HOME}` / `${USERPROFILE}`, in
  this folder's `.mcp.json`. The fix writes those paths absolute, from the entry as read; it moves no data, and names
  any old folder left behind (serena's on Windows, with its one-time download of about 327MB).
- `mcp-order` - the catalog servers in `.mcp.json` out of the user's order. The fix puts them in order, the user's own
  servers after them, and changes no value.
- `helper-child-folder` - advice only: a hosted server inherited from a parent folder's `.mcp.json` connects here
  without its key, since Claude Code does not run a parent folder's key helper in a child folder.

`retired-plugin` offers to uninstall a plugin the catalog no longer lists - typescript-lsp, csharp-lsp or claude-hud,
which work in Claude Code alone - once per plugin and scope (`claude plugin uninstall <id> --scope <scope>`; for the last
claude-hud, its own statusLine goes too, any other line stays). One the user turned down before is listed as 'NOT
APPLICABLE: <id> is kept at <scope>; remove it with ...': advice, never offered again. Where alfred-code is set up, the
line ends '<id> - alfred-code also installs it, and this removes it for both'.

`retired-server` offers to remove a server the plugin manages whose row the catalog retired (`claude mcp remove`, then
its list entry and Cursor's copy). Its line's note names the decline to pass; one declined before is NOT APPLICABLE.
`context7-key-env` and `sentry-auth-env` rewrite a registration - context7's key from `--api-key` into its environment,
sentry's variable to `SENTRY_AUTH_TOKEN` - keeping the value and printing nothing of it. `macos-config` writes a missing
`macos-mcp.toml` again, the file a managed macos-control's `--config` names.

A finding about a parent folder's `.mcp.json` ends 'NOT APPLICABLE: run /alfred-tools:fix in <folder>': that file
is the parent's, and fix run there repairs it. `data-folder-ignore` also finds a 0.2.0 copy a session made in this
folder (`.alfred/playwright-chrome`, say) that no server uses any more: its fix writes the copy's `.gitignore`, and its
data is left, never moved or deleted.

`client-drift` finds a server on the plugin's list whose copy in Claude Code or in Cursor was edited or removed by
hand (compared with each key value masked, so a key filled in Cursor is not drift). It is never in 'Apply all found' or
'Pick which': each is its own question in step 2. `cursor-file` is advice: a Cursor `mcp.json` that is a symbolic
link, holds comments or trailing commas, or has no `mcpServers` - alfred-tools writes no such file; its line says
what to do.

If it says 'No known problem found.', say so in one line - with an argument, for what it names only, since a name that
matches nothing reads the same - relay each `note:` line under it, and stop.

## 2. Ask

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/fix.ts" --questions --data "${CLAUDE_PLUGIN_DATA}"` (with the same `--only`). It prints the asks as data:
`choose` and, for 'Pick which', `pick` - a list of calls, each at most four questions of at most four options.

When `choose` is null and `drift` is empty, nothing found can be applied: every line is NOT APPLICABLE, and its
reason is the advice. Say that nothing was changed and stop - there is nothing to ask. When `choose` is null and `drift`
is not, ask only the drift questions below and go to step 3 with `none`.

Ask `choose` as one AskUserQuestion, exactly as printed:

- 'Apply all found (Recommended)' - every fix that can be applied. Go to step 3 with `all`. Where alfred-code is set
  up, `all` leaves each `retired-plugin` finding marked for alfred-code: pass each of those as declined (below).
- 'Pick which' - ask each call of `pick` as printed, one AskUserQuestion per call, and collect the labels picked
  (a label is a fix id). Go to step 3 with those ids. When `retired-plugin` was shown and not picked, each of its
  plugins and scopes is declined (below); so is each `retired-server` shown and not picked. Nothing picked: go to step 3 with `none` when there is a decline to pass,
  else it means 'Skip'.
- 'Skip' - say nothing was changed and stop. Nothing is declined, so the uninstall offer comes back next time.

A decline is passed as `--input retired-declined=<id>~<scope>,<id>~<scope>` - the plugin id and scope from each
`retired-plugin` line, and for a `retired-server` the `retired-declined=` its note prints - and recorded in the plugin's
data folder. A `retired-server` decline is kept per project at project and local scope, and for every project at user
scope.

Then ask the questions in `drift` as printed, one AskUserQuestion per call (at most four questions) - whatever the
answer to `choose`, except 'Skip'. Each is one server whose copy in one app changed by hand:

```ask drift
<name> in <app> differs from the plugin's list. Which should stay?
- 'Keep the change in <app> (Recommended)' - the list and the other app take the edited entry
- 'Restore from the list' - <app> gets the list's entry back
```

```ask drift-missing
<name> is on the plugin's list for <app> but <app> no longer has it. What should happen?
- 'Take <app> off its list entry (Recommended)' - the server stays in the other app; with no app left, the entry leaves the list
- 'Restore from the list' - <app> gets the list's entry back
```

A copy holding what looks like a key outside its key field (a token pasted into Cursor's `headers`, say) is asked with
'Restore from the list (Recommended)' and 'Leave <app>'s copy as it is' - it is copied nowhere. So is a copy whose key
field is empty where the list holds the key: keeping it would blank the other app's key. A copy a workspace
member got from a folder above is asked with 'Restore from <folder> (Recommended)' and 'Leave it as it is'; Leave is not
recorded, so the next run asks again. A question carrying `askAfter` is put only when the question it names was
answered with one of its `answers` (Cursor's, after a Restore or Leave in Claude Code - a Keep there carries the kept
entry into Cursor). Pass each answer as `--input drift:<app>:<name>~<scope>=<value>`: the question's id is
`drift-<app>-<name>~<scope>`, and the value is its `answers` entry for the label picked (`keep`, `restore`, `leave` or
`drop`). A drift question left unanswered is skipped and named in the report.

A finding that needs a folder from the user (the detect output says 'needs a folder from you') gets one more
AskUserQuestion before it is applied: the suggested folder as '(Recommended)' listed first, and 'Skip this fix'. A
folder the user typed as the Other answer is taken the same way. Pass the answer as `--input serenaHome=<folder>`. Never
guess a folder.

## 3. Apply

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/fix.ts" --apply <id,id | all | none> --data "${CLAUDE_PLUGIN_DATA}" [--only "$ARGUMENTS"] [--input key=value] [--input drift:<app>:<name>~<scope>=<value>]
```

A drift answer runs after the registration and file rows: 'Keep' writes the edited entry into the list and the other
app (Cursor's file, or Claude Code through the `claude` CLI); 'Restore' writes the list's entry back into that app;
'Take <app> off' changes the list only. Every registration a fix rewrites is carried into the list and Cursor in the
same run, and a Cursor copy changed by hand is left for its own question.

Claude Code asks permission for this call itself - `--apply` is deliberately not in `allowed-tools`. It rewrites each registration through the `claude` CLI (remove, then add with the same name and scope) from the entry as
it is now, so the user's pin, cut-off and added args stay. Several fixes on one registration are one rewrite. A key moved out of
a registration (`key-to-helper`) first writes the root's files - its `.gitignore`, `mcp-headers.js` - then rewrites the
registration to read its key through the helper. After a rewrite of a hosted server that takes a key, the script prints
how it connects - with its key at the next session start, or 'fill <NAME> in <file>' first - relay it. A machine fix (a plugin uninstalled, a data folder's or a root's
`.gitignore`, the key helper written or brought current, or a broken npx cache folder removed - also for a server a
parent folder's `.mcp.json` gives this folder, since that cache is the machine's) runs after. Each fix is read back by running its detector again.

Run it with the Bash tool's `timeout: 600000` (10 minutes, the most it allows by default).
Paste the output verbatim. Report each fix as 'fixed' or 'STILL FOUND', each skipped one with its reason, and a failure
with the line it printed - a failed rewrite prints a `RESTORE BY HAND` line, give it to the user as written. A `FAILED`
line ends the run there: what ran before it stays in place, nothing after it ran and nothing was read back - say so, and
that `/alfred-tools:fix` again finds what is left.
A key in it shows as `${ALFRED_TOOLS_KEPT}`, never its value: the user puts their key back there.
If the output has a `RECHECK` line, go back to step 1 in this same command (once): the rest was not offered before the move.

A fix that changes what a server launches (a python request, a cut-off), or removes a broken npx cache folder
(`npx-cache-entry`), prints `Fetch next, in the background (...): <file>`. Run, with the Bash tool's
`run_in_background`:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/fetch.ts" "<file>"
```

<!-- shared:fetch -->

One server at a time, it downloads what the server launches into the runtime's cache and starts it once with no
30-second limit, then prints each server's status. Tell the user to restart only once it reports, and paste its output
verbatim when it finishes; say that a `warn` line changes nothing. When background runs are turned off, run it in the
foreground with `timeout: 600000`, and again if the limit stops it.

<!-- /shared:fetch -->

The next session's start then answers inside Claude Code's 30 seconds.

End with the restart line when the script prints one: the repaired registrations load on the next session start. A run
whose only fixes wrote a `.gitignore` or a hosted server's key helper prints none, since that helper runs at each
connect; one that wrote a bridge (`mcp-bridge.js`) or the helper beside it prints it, since that server did not start.

## Rules

- Nothing is applied before step 2's answer. A fix that was not picked is never run.
- A registration that matches no catalog row is the user's and is never touched.
- Keys live in `.mcps-secrets` in the root folder, filled by the user. A key is written into a registration only by
  `token-sync`, for a local route; `key-to-helper` moves a hosted key out of a registration once its name is filled
  there. This command never asks for, prints or edits a key, a value or a sign-in token in `mcp-remote-v1/`; a finding
  names the key and the file.
- Do not repeat a fix 'STILL FOUND' in a loop. Show it and stop; the finding's note says what is left to do.
