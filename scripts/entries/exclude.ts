// macos-mcp's Shell tool off (spec D4): a TOML file in the scope's root lists the tools the server leaves out, and the
// route's flag (`--config`) names it, absolute. The flag is the plugin's only when it names that file in a known root;
// any other value - another name, or the same name outside every root - is the user's: never re-pointed, never removed,
// never given a second flag. Pure: the path form, the roots and the existence probe come in `context`.
import { pathFor } from './platform.ts';
import { familyOf, rootOf } from './locations.ts';
import { MACOS_USER_CONFIG, TRAILING_SEPARATORS } from './constants.ts';
import type { ServerEntry } from '../core/types.ts';
import type { CatalogRoute, ExcludeFile } from '../catalog/types.ts';
import type { Machine, RootsView } from './types.ts';

// the plan's known roots, else this machine's two roots as rootOf gives them
const knownRootsOf = (context: RootsView): string[] => context.knownRoots ?? [rootOf('project', context), rootOf('global', context)];

// A folder as one comparable text: normalized, no trailing separator, and without case on win32 (its paths have none)
const folderKey = (platform: string, folder: string): string =>
{
    const text = pathFor(platform).normalize(folder).replace(TRAILING_SEPARATORS, '');
    return platform === 'win32' ? text.toLowerCase() : text;
};

export const excludePathFor = (excludeFile: ExcludeFile, scope: string, context: Machine): string => pathFor(context.platform).join(rootOf(familyOf(scope), context), excludeFile.file);

// The one test for 'this --config is the plugin's' (plan, configure, root change, fix macos-config): the index of the value
// after the flag when it is `<known root>/<excludeFile.file>`, else -1. Only the two-argument form counts: the plugin
// writes that one, and a `<flag>=<path>` is the user's. pathFor(platform) reads both slash forms on win32.
export function excludeArgAt(entry: ServerEntry | null | undefined, excludeFile: ExcludeFile | undefined, context: RootsView): number
{
    const args = entry && Array.isArray(entry.args) ? entry.args : [];
    if (!excludeFile) return -1;
    const at = args.indexOf(excludeFile.flag);
    const value = at >= 0 ? args[at + 1] : undefined;
    if (value === undefined) return -1;
    const pathApi = pathFor(context.platform);
    const folder = folderKey(context.platform, pathApi.dirname(value));
    return pathApi.basename(value) === excludeFile.file && knownRootsOf(context).some((root) => folderKey(context.platform, root) === folder) ? at + 1 : -1;
}

// the flag is there - alone before its value, or as `<flag>=<path>` - and it is not the plugin's two-argument form
export function hasForeignExclude(entry: ServerEntry | null | undefined, excludeFile: ExcludeFile, context: RootsView): boolean
{
    const args = entry && Array.isArray(entry.args) ? entry.args : [];
    if (args.some((argument) => typeof argument === 'string' && argument.startsWith(`${excludeFile.flag}=`))) return true;
    return args.includes(excludeFile.flag) && excludeArgAt(entry, excludeFile, context) < 0;
}

// on: the pair names the scope's root file (added at the end, or re-pointed in place); off: the pair goes.
export function withExclude(entry: ServerEntry, route: CatalogRoute, on: boolean, scope: string, context: Machine): ServerEntry
{
    const excludeFile = route.excludeFile;
    if (!excludeFile || hasForeignExclude(entry, excludeFile, context)) return entry;
    const at = excludeArgAt(entry, excludeFile, context);
    const args = [...(entry.args || [])];
    if (at >= 0 && on) args[at] = excludePathFor(excludeFile, scope, context);
    else if (at >= 0) args.splice(at - 1, 2);
    else if (on) args.push(excludeFile.flag, excludePathFor(excludeFile, scope, context));
    else return entry;
    return { ...entry, args };
}

export const userConfigPath = (context: Pick<Machine, 'platform' | 'home'>): string => pathFor(context.platform).join(context.home, ...MACOS_USER_CONFIG);
// Off is recommended unless macos-mcp's own config file is there
export const excludeRecommended = (context: Pick<Machine, 'platform' | 'home' | 'exists'>): boolean => !(context.exists ? context.exists(userConfigPath(context)) : false);

// The file's text: `[tools]` with `exclude = ["Shell"]`
export const excludeToml = (tools: string[]): string => `[tools]\nexclude = [${tools.map((tool) => JSON.stringify(tool)).join(', ')}]\n`;
