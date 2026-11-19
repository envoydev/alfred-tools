// REFRESH THE CATALOG'S PINS - a repo script (`npm run refresh-pins`), never run by an install or an update.
//
//   node scripts/refresh-pins.ts            print what would move
//   node scripts/refresh-pins.ts --write    move catalog/tools.json
//
// Each package route moves to the newest stable release that is 7 or more days old (scripts/catalog/registry.ts), and its cut-off
// moves to the end of today (UTC). A pin already at or past that release stays, and so does its cut-off. A Docker image
// tag is not looked up. Moving a pin is a release: the output ends with what to do next.
import fs from 'node:fs';
import path from 'node:path';
import * as catalogLib from './catalog.ts';
import * as registryLib from './registry.ts';
import { isToolsFile } from './shapes.ts';
import type { Env } from '../core/types.ts';
import type { Refresh, RegistryLookup, RegistryReader, ToolsFile } from './types.ts';

const FILE = path.join(catalogLib.CATALOG_DIR, 'tools.json');

// -> { next (the catalog object, moved), changes: [{ row, route, package, from, to, ageDays }], held: [], errors: [] }
export async function refresh(tools: ToolsFile, { registry, now = Date.now() }: { registry: RegistryReader; now?: number | undefined }): Promise<Refresh>
{
    const next = structuredClone(tools);
    const out: Refresh = { next, changes: [], held: [], errors: [] };
    const cache = new Map<string, Promise<RegistryLookup>>();
    const versions = (registryName: string, name: string) =>
    {
        const key = `${registryName}:${name}`;
        const known = cache.get(key);
        if (known) return known;
        const lookup: Promise<RegistryLookup> = registry.versionsOf(registryName, name).then((releases) => ({ releases: releases }), (error: Error) => ({ error: error }));
        cache.set(key, lookup);
        return lookup;
    };
    for (const row of next.tools)
        for (const [routeId, route] of Object.entries(row.routes || {}))
        {
            const packageSpec = route.package;
            if (!packageSpec) continue;
            const lookup = await versions(packageSpec.registry, packageSpec.name);
            const at = `${row.id}/${routeId}`;
            if (lookup.error) { out.errors.push(`${at}: ${packageSpec.registry} lookup for ${packageSpec.name} failed - ${lookup.error.message}`); continue; }
            const pick = registryLib.choose(lookup.releases, { registry: packageSpec.registry, now, current: packageSpec.version });
            if (pick.held.length) out.held.push(`${at}: ${registryLib.heldLine(packageSpec.name, pick.held)}`);
            if (!pick.offer) continue;
            out.changes.push({ row: row.id, route: routeId, package: packageSpec.name, from: packageSpec.version, to: pick.offer.version, ageDays: pick.offer.ageDays });
            packageSpec.version = pick.offer.version;
            packageSpec.cutoff = registryLib.cutoffOf(now);
        }
    return out;
}

export const serialize = (tools: ToolsFile): string => `${JSON.stringify(tools, null, 2)}\n`;

function renderPins(out: Refresh, { write }: { write: boolean }): string
{
    const lines: string[] = [];
    if (out.changes.length)
    {
        lines.push(write ? 'Moved:' : 'Would move:');
        const width = Math.max(...out.changes.map((change) => `${change.row}/${change.route}`.length));
        for (const change of out.changes) lines.push(`  ${`${change.row}/${change.route}`.padEnd(width)}  ${change.package} ${change.from} -> ${change.to}  (${change.ageDays} days old)`);
    }
    else lines.push(`refresh-pins: every pin is at the newest release that is at least ${registryLib.AGE_DAYS} days old`);
    for (const [title, list] of [['Held back', out.held], ['Could not check', out.errors]] as const)
        if (list.length) lines.push(`${title}:`, ...list.map((line) => `  ${line}`));
    if (out.changes.length && write)
        lines.push('', 'Next: a moved pin is a release.',
            '  1. Read each package\'s release notes for a changed flag, tool name or default; re-verify the row against the vendor docs and record it in docs/sources.md.',
            '  2. Run npm test and npm run matrix (the matrix needs the network).',
            '  3. Bump the version in .claude-plugin/plugin.json and package.json together - a source change without a bump is not delivered.');
    else if (out.changes.length) lines.push('', 'Run again with --write to move catalog/tools.json.');
    return lines.join('\n');
}

export async function runRefreshPinsCommand(argv: string[], { out = (text: string) => process.stdout.write(`${text}\n`), registry, now, file = FILE, env = process.env }: { out?: (text: string) => void; registry?: RegistryReader; now?: number; file?: string; env?: Env } = {}): Promise<number>
{
    const unknown = argv.filter((argument) => argument !== '--write');
    if (unknown.length) { out(`refresh-pins: unknown argument '${unknown[0]}'\nusage: node scripts/refresh-pins.ts [--write]`); return 2; }
    const write = argv.includes('--write');
    const tools: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!isToolsFile(tools)) { out(`refresh-pins: ${file} is not a tools.json of rows, rules, groups and order - nothing read`); return 2; }
    const result = await refresh(tools, { registry: registry || { versionsOf: (registryName: string, name: string) => registryLib.versionsOf(registryName, name, { env }) }, now });
    if (write && result.changes.length) fs.writeFileSync(file, serialize(result.next));
    out(renderPins(result, { write }));
    return result.errors.length ? 1 : 0;
}

