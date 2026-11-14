// @ts-nocheck - typed in Task 12
// The SHA-256 of the three files the plugin copies into a root, wherever the tree keeps them: scripts/copied/ once
// they move there, else scripts/. They must not change a byte (docs/superpowers/specs, Decision 2).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const COPIED = ['mcp-headers.js', 'mcp-bridge.js', 'serena-context.yml'];

export function copiedHashes(tree)
{
    const out = {};
    for (const name of COPIED)
    {
        const file = [path.join(tree, 'scripts', 'copied', name), path.join(tree, 'scripts', name)].find((f) => fs.existsSync(f));
        out[name] = file ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
    }
    return out;
}

