---
paths:
  - ".claude-plugin/**"
  - "commands/**"
  - "scripts/**"
  - "catalog/**"
  - "package.json"
---

# Plugin handling

Adding, changing, renaming or removing anything the plugin ships. `AGENTS.md` holds the why; this is the order of work.

## One home per item

- A command is `commands/<name>.md`, manual (`disable-model-invocation: true`); its work is a script in `scripts/`, called as `node "${CLAUDE_PLUGIN_ROOT}/scripts/<file>"`. `allowed-tools` lists read-only calls only.
- A tool is one row in `catalog/tools.json`, a known problem one row in `catalog/fixes.json` with its code under `scripts/fix/`. Every outside fact a row rests on goes into `docs/sources.md` with its URL and date.
- The repo root is the plugin root, and Claude Code scans its default folders whatever the manifest says: never add `skills/`, `agents/`, `hooks/`, `bin/`, `.mcp.json` or another default component path unless the plugin ships it.

## One version

- The version lives in `.claude-plugin/plugin.json` and is mirrored in `package.json`; `npm run lint` fails on drift. Bump both on every user-visible change: a change without a bump is not delivered.
- Never rename or drop the id `alfred-tools`: every install goes silent.
- The `envoydev` marketplace (`envoydev/plugins-marketplaces`, `.claude-plugin/marketplace.json`, since 2026-11-14) lists the plugin as a GitHub source on this repo's `main` with no `sha` - `{ "source": "github", "repo": "envoydev/alfred-tools", "ref": "main" }` (the user's ruling, 2026-11-04). So a merge to `main` with a new version is the release, with no marketplace change. A change to that entry is a commit in plugins-marketplaces, on the user's word.

## Release

- `main` is the default branch and stays release-only: with no pinned commit, a fresh install fetches whatever is on `main`, so work lands on a branch and reaches `main` only when it is ready to ship. Commit, push or merge only on the user's word, after the proof below, and report what was not run.

## Proof

- Per batch: the tests that cover the change and `npm run lint`. Once after the change: the full `npm test`, then `npm run validate`; `npm run matrix` (minutes, isolated home and account) after any change to install, configure, update or fix.
- Read the written `.mcp.json`, account file and settings, not the exit code. A case not run is NOT RUN.
- The repo is public: no private project names or absolute local paths in a tracked file (`npm run lint` checks the paths).
