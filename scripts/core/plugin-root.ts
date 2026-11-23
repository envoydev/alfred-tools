// The plugin's root folder, found by its manifest and not by where a module sits: a script bundled into dist/ is one flat
// file, so a path relative to its own folder would miss the catalog and the copied files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLUGIN_MANIFEST } from './constants.ts';

// The nearest folder at or above `start` that holds the manifest.
export function findPluginRoot(start: string): string
{
    let dir = start;
    for (;;)
    {
        if (fs.existsSync(path.join(dir, PLUGIN_MANIFEST))) return dir;
        const parent = path.dirname(dir);
        if (parent === dir) throw new Error(`alfred-tools: no ${PLUGIN_MANIFEST} above ${start}`);
        dir = parent;
    }
}

let root: string | undefined;

// The root for this module's own place, found once.
export function pluginRoot(): string
{
    return (root ??= findPluginRoot(path.dirname(fileURLToPath(import.meta.url))));
}
