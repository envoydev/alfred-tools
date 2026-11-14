// The catalog, loaded and indexed. Everything else reads rows through here, so the shape lives in one place.
import fs from 'node:fs';
import path from 'node:path';
import type { Catalog, CatalogRow, Fingerprint, FixesFile, ReservedFile, ToolsFile } from './types.ts';

export const CATALOG_DIR = path.join(import.meta.dirname, '..', '..', 'catalog');
export const readJson = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, name), 'utf8'));

export function load(dir: string = CATALOG_DIR): Catalog
{
    const read = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    const tools = read('tools.json') as ToolsFile;
    const reserved = new Set((read('reserved-names.json') as ReservedFile).names);
    const byId = new Map(tools.tools.map((row) => [row.id, row]));
    return { ...tools, reserved, byId, fixes: (read('fixes.json') as FixesFile).fixes };
}

// One string per fingerprint, equal for two rows exactly when they would match the same registration.
export function fingerprintKey(fingerprint: Fingerprint): string
{
    if (fingerprint.bridge) return `bridge:${fingerprint.bridge}`;
    if (fingerprint.pkg) return `pkg:${fingerprint.pkg}${fingerprint.flag ? `+${fingerprint.flag}=${fingerprint.value}` : ''}`;
    if (fingerprint.command) return `cmd:${fingerprint.command}`;
    return `url:${fingerprint.host || '*'}${fingerprint.pathPrefix || ''}`;
}

export const routesOf = (row: CatalogRow): string[] => (row.kind === 'mcp' ? Object.keys(row.routes) : []);
export const supportedOn = (row: CatalogRow, platform: string): boolean => row.os.includes(platform);

