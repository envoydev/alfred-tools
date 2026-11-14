// @ts-nocheck - typed in Task 10
// The catalog, loaded and indexed. Everything else reads rows through here, so the shape lives in one place.
import fs from 'node:fs';
import path from 'node:path';

export const CATALOG_DIR = path.join(import.meta.dirname, '..', '..', 'catalog');
export const readJson = (name) => JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, name), 'utf8'));

export function load(dir = CATALOG_DIR)
{
    const read = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    const tools = read('tools.json');
    const reserved = new Set(read('reserved-names.json').names);
    const byId = new Map(tools.tools.map((row) => [row.id, row]));
    return { ...tools, reserved, byId, fixes: read('fixes.json').fixes };
}

// One string per fingerprint, equal for two rows exactly when they would match the same registration.
export function fingerprintKey(f)
{
    if (f.bridge) return `bridge:${f.bridge}`;
    if (f.pkg) return `pkg:${f.pkg}${f.flag ? `+${f.flag}=${f.value}` : ''}`;
    if (f.command) return `cmd:${f.command}`;
    return `url:${f.host || '*'}${f.pathPrefix || ''}`;
}

export const routesOf = (row) => (row.kind === 'mcp' ? Object.keys(row.routes) : []);
export const supportedOn = (row, platform) => row.os.includes(platform);

