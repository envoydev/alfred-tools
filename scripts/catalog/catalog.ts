// The catalog, loaded and indexed. Everything else reads rows through here, so the shape lives in one place.
import fs from 'node:fs';
import path from 'node:path';
import { pluginRoot } from '../core/plugin-root.ts';
import { isFixesFile, isReservedFile, isToolsFile } from './shapes.ts';
import type { Catalog, Fingerprint } from './types.ts';

export const CATALOG_DIR = path.join(pluginRoot(), 'catalog');

// One of the catalog's files, checked by its shape: a file of another shape stops the load with the file named.
function readChecked<Doc>(file: string, isDoc: (value: unknown) => value is Doc): Doc
{
    const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!isDoc(value)) throw new Error(`catalog: ${file} is not in the shape alfred-tools ships - reinstall the plugin`);
    return value;
}

export function load(dir: string = CATALOG_DIR): Catalog
{
    const tools = readChecked(path.join(dir, 'tools.json'), isToolsFile);
    const reserved = new Set(readChecked(path.join(dir, 'reserved-names.json'), isReservedFile).names);
    const byId = new Map(tools.tools.map((row) => [row.id, row]));
    return { ...tools, reserved, byId, fixes: readChecked(path.join(dir, 'fixes.json'), isFixesFile).fixes };
}

// One string per fingerprint, equal for two rows exactly when they would match the same registration.
export function fingerprintKey(fingerprint: Fingerprint): string
{
    if (fingerprint.bridge) return `bridge:${fingerprint.bridge}`;
    if (fingerprint.pkg) return `pkg:${fingerprint.pkg}${fingerprint.flag ? `+${fingerprint.flag}=${fingerprint.value}` : ''}`;
    if (fingerprint.command) return `cmd:${fingerprint.command}`;
    return `url:${fingerprint.host || '*'}${fingerprint.pathPrefix || ''}`;
}

