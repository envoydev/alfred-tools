#!/usr/bin/env node
// REFRESH THE CATALOG'S PINS - a repo script (`npm run refresh-pins`), never run by an install or an update.
//
//   node scripts/refresh-pins.ts            print what would move
//   node scripts/refresh-pins.ts --write    move catalog/tools.json
//
// Each package route moves to the newest stable release that is 7 or more days old (scripts/registry.js), and its cut-off
// moves to the end of today (UTC). A pin already at or past that release stays, and so does its cut-off. A Docker image
// tag is not looked up. Moving a pin is a release: the output ends with what to do next.
import fs from 'node:fs';
import path from 'node:path';
import * as catalogLib from './catalog.ts';
import * as registryLib from './registry.ts';
import type { Env } from '../core/types.ts';
import type { Refresh, RegistryReader, Release, ToolsFile } from './types.ts';

const FILE = path.join(catalogLib.CATALOG_DIR, 'tools.json');

// -> { next (the catalog object, moved), changes: [{ row, route, package, from, to, ageDays }], held: [], errors: [] }
export async function refresh(tools: ToolsFile, { registry, now = Date.now() }: { registry: RegistryReader; now?: number | undefined }): Promise<Refresh>
{
    const next = JSON.parse(JSON.stringify(tools)) as ToolsFile;
    const out: Refresh = { next, changes: [], held: [], errors: [] };
    const cache = new Map<string, Promise<{ v: Release[]; e?: undefined } | { e: Error; v?: undefined }>>();
    const versions = (reg: string, name: string) =>
    {
        const key = `${reg}:${name}`;
        if (!cache.has(key)) cache.set(key, registry.versionsOf(reg, name).then((v) => ({ v }), (e: Error) => ({ e })));
        return cache.get(key)!;
    };
    for (const row of next.tools)
        for (const [routeId, route] of Object.entries(row.routes || {}))
        {
            const pkg = route.package;
            if (!pkg) continue;
            const got = await versions(pkg.registry, pkg.name);
            const at = `${row.id}/${routeId}`;
            if (got.e) { out.errors.push(`${at}: ${pkg.registry} lookup for ${pkg.name} failed - ${got.e.message}`); continue; }
            const pick = registryLib.choose(got.v!, { registry: pkg.registry, now, current: pkg.version });
            if (pick.held.length) out.held.push(`${at}: ${registryLib.heldLine(pkg.name, pick.held)}`);
            if (!pick.offer) continue;
            out.changes.push({ row: row.id, route: routeId, package: pkg.name, from: pkg.version, to: pick.offer.version, ageDays: pick.offer.ageDays });
            pkg.version = pick.offer.version;
            pkg.cutoff = registryLib.cutoffOf(now);
        }
    return out;
}

export const serialize = (tools: ToolsFile): string => `${JSON.stringify(tools, null, 2)}\n`;

export function render(out: Refresh, { write }: { write: boolean }): string
{
    const lines: string[] = [];
    if (out.changes.length)
    {
        lines.push(write ? 'Moved:' : 'Would move:');
        const w = Math.max(...out.changes.map((c) => `${c.row}/${c.route}`.length));
        for (const c of out.changes) lines.push(`  ${`${c.row}/${c.route}`.padEnd(w)}  ${c.package} ${c.from} -> ${c.to}  (${c.ageDays} days old)`);
    }
    else lines.push('refresh-pins: every pin is at the newest release that is at least 7 days old');
    for (const [title, list] of [['Held back', out.held], ['Could not check', out.errors]] as const)
        if (list.length) lines.push(`${title}:`, ...list.map((l) => `  ${l}`));
    if (out.changes.length && write)
        lines.push('', 'Next: a moved pin is a release.',
            '  1. Read each package\'s release notes for a changed flag, tool name or default; re-verify the row against the vendor docs and record it in docs/sources.md.',
            '  2. Run npm test and npm run matrix (the matrix needs the network).',
            '  3. Bump the version in .claude-plugin/plugin.json and package.json together - a source change without a bump is not delivered.');
    else if (out.changes.length) lines.push('', 'Run again with --write to move catalog/tools.json.');
    return lines.join('\n');
}

export async function main(argv: string[], { out = (s: string) => { process.stdout.write(`${s}\n`); }, registry, now, file = FILE, env = process.env }: { out?: (s: string) => void; registry?: RegistryReader; now?: number; file?: string; env?: Env } = {}): Promise<number>
{
    const unknown = argv.filter((a) => a !== '--write');
    if (unknown.length) { out(`refresh-pins: unknown argument '${unknown[0]}'\nusage: node scripts/refresh-pins.ts [--write]`); return 2; }
    const write = argv.includes('--write');
    const tools = JSON.parse(fs.readFileSync(file, 'utf8')) as ToolsFile;
    const result = await refresh(tools, { registry: registry || { versionsOf: (reg: string, name: string) => registryLib.versionsOf(reg, name, { env }) }, now });
    if (write && result.changes.length) fs.writeFileSync(file, serialize(result.next));
    out(render(result, { write }));
    return result.errors.length ? 1 : 0;
}

