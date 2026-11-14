#!/usr/bin/env node
// Prints a fresh temp folder in the form this machine's Node resolves (mktemp -d gives a POSIX path that a native Windows
// Node cannot open). The walk keeps its inventory, answers and plan files in it.
//
// The folder holds what one command hands from script to script, so the last script that runs on it removes it
// (`release`): apply.js, update.js --apply or fix.js --apply when no fetch file goes on, else fetch.js. Only a folder
// this plugin made is removed - directly under the real temp folder and named preferred-tools-*; any other --tmp is
// left and said. A command stopped half-way leaves its folder, so each new one sweeps this plugin's folders older than
// 24 hours.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const PREFIX = 'preferred-tools-';
const MAX_AGE_MS = 24 * 3600 * 1000;
const tempRoot = (): string => fs.realpathSync(os.tmpdir());

// true for a folder this plugin made: its real parent is the real temp folder and its name starts preferred-tools-
export function ours(dir: string): boolean
{
    try
    {
        const real = fs.realpathSync(dir);
        return path.dirname(real) === tempRoot() && path.basename(real).startsWith(PREFIX) && fs.statSync(real).isDirectory();
    }
    catch { return false; }
}

// -> true when removed. A folder that is not ours is left, with a line saying so.
export function release(dir: string | null | undefined, log: (line: string) => void = console.log): boolean
{
    if (!dir) return false;
    if (!ours(dir)) { log(`${dir} left as it is: not a folder preferred-tools made in the temp folder`); return false; }
    fs.rmSync(fs.realpathSync(dir), { recursive: true, force: true });
    return true;
}

// this plugin's folders older than 24 hours; a folder another user owns, or one that is not a folder, is skipped
export function sweep(now: number = Date.now()): void
{
    const root = tempRoot();
    for (const name of fs.readdirSync(root))
    {
        if (!name.startsWith(PREFIX)) continue;
        const p = path.join(root, name);
        try
        {
            const st = fs.lstatSync(p);
            if (st.isDirectory() && now - st.mtimeMs > MAX_AGE_MS) fs.rmSync(p, { recursive: true, force: true });
        }
        catch { /* not ours to remove */ }
    }
}

export function make(): string
{
    try { sweep(); } catch { /* a temp folder that cannot be listed still makes a new one */ }
    return fs.mkdtempSync(path.join(tempRoot(), PREFIX));
}

