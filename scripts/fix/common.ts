// Shared pieces of the fix detectors. A detector is `detect(ctx) -> findings[]`; a registration fix is
// `fix(entry, finding, ctx, input) -> entry` (a pure edit of the entry AS READ, so the user's pin, cut-off and added
// args or env survive); a machine fix is `fix(finding, ctx) -> { ok, detail }` and changes the machine.
//
// ctx = { inv, catalog, platform, arch, env, home, rules, machine } - `machine` is the only way a detector looks at the
// machine, so a test replaces it.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { launchTokens, bareName } from '../inventory/inventory.ts';
import * as E from '../entries/locations.ts';
import * as serenaConfig from '../apply/serena-config.ts';
import { pathFor } from '../entries/platform.ts';
import type { Env, ServerEntry } from '../core/types.ts';
import type { CatalogRoute, CatalogRow, FixRow } from '../catalog/types.ts';
import type { InvRegistration } from '../inventory/types.ts';
import type { Finding, FixCtx, MachineProbe } from './types.ts';

export const fixOf = (context: Pick<FixCtx, 'catalog'>, id: string): FixRow | undefined => context.catalog.fixes.find((fixRow) => fixRow.id === id);
export const rowOf = (context: Pick<FixCtx, 'catalog'>, id: string): CatalogRow | undefined => context.catalog.byId.get(id);

// The registrations a fix row covers: matched to one of its tools by what they launch, not the user's own, not an
// alfred-code leftover, not one left on its own (spec D6), and not inherited from a parent folder (fixed by running fix
// there).
export const registrationsOf = (context: Pick<FixCtx, 'catalog' | 'inventory'>, fixId: string): InvRegistration[] => context.inventory.registrations.filter((registration) => !registration.own && !registration.alfredRetired && registration.choice !== 'own' && registration.scope !== 'inherited' && fixOf(context, fixId)!.tool.includes(registration.rowId!));
export const routeOf = (context: Pick<FixCtx, 'catalog'>, registration: { rowId: string | null; route: string | null }): CatalogRoute | undefined => rowOf(context, registration.rowId!)!.routes[registration.route!];

// The executable a registration launches, looking through a `cmd /c` wrapper.
export const launcher = (entry: ServerEntry): string => path.basename(launchTokens(entry).command).replace(/\.(exe|cmd)$/i, '');
export const launchArgs = (entry: ServerEntry): string[] => launchTokens(entry).args;

// A committed value read against an environment, as Claude Code expands .mcp.json from the one it starts with
// (entries/locations.ts expandVars). -> the expanded text, or null when a ${NAME} with no fallback is unset (`firstUnset` names it).
export const expandVars = (text: unknown, env: Env): string | null => { const expanded = E.expandVars(text, env); return expanded.unset.length ? null : expanded.value; };
export const firstUnset = (text: unknown, env: Env): string | null => E.expandVars(text, env).unset[0] || null;

export const finding = (fixId: string, registration: { rowId: string | null; name: string; scope: string }, what: string, extra: Partial<Finding> = {}): Finding => ({ id: fixId, row: registration.rowId, name: registration.name, scope: registration.scope, found: what, ...extra });
export const clone = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value));

// '0.0.83' vs '0.0.9': numeric, part by part. Anything that is not dotted numbers (a dist-tag) compares as unknown (null).
export function compareVersions(left: string, right: string): number | null
{
    const parts = (version: string) => (/^\d+(\.\d+)*$/.test(version) ? version.split('.').map(Number) : null);
    const [leftParts, rightParts] = [parts(left), parts(right)];
    if (!leftParts || !rightParts) return null;
    for (let i = 0; i < Math.max(leftParts.length, rightParts.length); i++)
    {
        const difference = (leftParts[i] || 0) - (rightParts[i] || 0);
        if (difference) return difference < 0 ? -1 : 1;
    }
    return 0;
}

// The version a launch pins for a package: '@playwright/mcp@0.0.83' -> '0.0.83', '--from serena-agent@2.1.0' -> '2.1.0',
// 'mcp-memory-service[sqlite]==12.1.1' -> '12.1.1'. null when the launch names the package with no version.
export function pinnedVersion(entry: ServerEntry, packageSpec: string): string | null
{
    for (const argument of launchArgs(entry).filter((token) => !token.startsWith('-')))
    {
        if (bareName(argument) !== packageSpec) continue;
        const match = /(?:==|@)([^@=\s]+)$/.exec(argument.slice(packageSpec.length));
        return match ? match[1]! : null;
    }
    return null;
}

// ---- the machine ---------------------------------------------------------------------------------------------------

export function onPath(name: string, env: Env, platform: string): string | null
{
    const key = Object.keys(env).find((variableName) => variableName.toUpperCase() === 'PATH');
    const win = platform === 'win32';
    const names = win ? [name, `${name}.exe`, `${name}.cmd`, `${name}.bat`] : [name];
    for (const dir of String((key && env[key]) || '').split(win ? ';' : ':').filter(Boolean))
        for (const candidate of names)
        {
            const file = (win ? path.win32 : path.posix).join(dir, candidate);
            try { if (fs.statSync(file).isFile()) return file; } catch { /* next */ }
        }
    return null;
}

export function realMachine({ env = process.env, platform = process.platform }: { env?: Env; platform?: string } = {}): MachineProbe
{
    return {
        exists: (file: string) => fs.existsSync(file),
        realpath: (file: string) => { try { return fs.realpathSync(file); } catch { return null; } },
        which: (name: string) => onPath(name, env, platform),
        // npm and npx are .cmd shims on Windows; a shell is what runs them
        // `opts.cwd` and `opts.env` (merged over the machine's) are for the audit, which runs in a temp folder
        run: (cmd: string, args: string[], options: { cwd?: string; env?: Env } = {}) => spawnSync(cmd, args, { encoding: 'utf8', env: { ...env, ...(options.env || {}) }, cwd: options.cwd, shell: platform === 'win32' && /^(npm|npx)$/.test(cmd), windowsHide: true }),
        nodeVersion: process.versions.node,
    };
}


// serena's context file in its home: <SERENA_HOME>/<fileName>, for a home the plugin may keep files in. null for no
// SERENA_HOME or one editableHome refuses (alfred-code's), whose context stays in the root.
export function homeContextOf(entry: ServerEntry, platform: string, fileName: string): string | null
{
    const home = entry.env && entry.env.SERENA_HOME;
    if (!home || !serenaConfig.editableHome(home, { platform }).ok) return null;
    return pathFor(platform).join(home, fileName);
}
