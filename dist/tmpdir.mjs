#!/usr/bin/env node
// Built from the TypeScript in scripts/ by npm run build - do not edit.
import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);

// scripts/core/tmpdir.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
var PREFIX = "alfred-tools-";
var MAX_AGE_MS = 24 * 3600 * 1e3;
var realPathOf = (target) => fs.realpathSync.native(target);
var tempRoot = () => realPathOf(os.tmpdir());
function sweepTempDirs(now = Date.now()) {
  const root = tempRoot();
  for (const name of fs.readdirSync(root)) {
    if (!name.startsWith(PREFIX)) continue;
    const folder = path.join(root, name);
    try {
      const stats = fs.lstatSync(folder);
      if (stats.isDirectory() && now - stats.mtimeMs > MAX_AGE_MS) fs.rmSync(folder, { recursive: true, force: true });
    } catch {
    }
  }
}
function makeTempDir() {
  try {
    sweepTempDirs();
  } catch {
  }
  return fs.mkdtempSync(path.join(tempRoot(), PREFIX));
}

// scripts/tmpdir.ts
process.stdout.write(`${makeTempDir()}
`);
