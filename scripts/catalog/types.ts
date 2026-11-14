// The shapes of catalog/tools.json, fixes.json and reserved-names.json, and of the loaded catalog. Every property of
// the files is read by name from a file this repo ships (stored - do not rename).

// How a registration is told to belong to a row: a package in args, a command, a URL host and path, or a bridge URL.
export interface Fingerprint
{
    pkg?: string; // stored - do not rename
    flag?: string; // stored - do not rename
    value?: string; // stored - do not rename
    command?: string; // stored - do not rename
    host?: string; // stored - do not rename
    pathPrefix?: string; // stored - do not rename
    bridge?: string; // stored - do not rename
}

export interface CatalogPackage
{
    registry: string; // stored - do not rename
    name: string; // stored - do not rename
    version: string; // stored - do not rename
    fromSpec?: string; // stored - do not rename
    cutoff: string; // stored - do not rename
}

export interface RouteHelper
{
    var: string; // stored - do not rename
    scheme: string; // stored - do not rename
    hint?: string; // stored - do not rename
}

export interface UrlVar
{
    var: string; // stored - do not rename
    label: string; // stored - do not rename
}

export interface RouteFallback
{
    runtime: string; // stored - do not rename
    command: string; // stored - do not rename
    args: string[]; // stored - do not rename
    when: string; // stored - do not rename
}

// One way to run a row's server: a local runtime, a hosted URL, or the bridge.
export interface CatalogRoute
{
    runtime?: string; // stored - do not rename
    python?: string; // stored - do not rename
    with?: string[]; // stored - do not rename
    package?: CatalogPackage; // stored - do not rename
    run?: string[]; // stored - do not rename
    env?: Record<string, string>; // stored - do not rename
    fingerprints: Fingerprint[]; // stored - do not rename
    prereqs: string[]; // stored - do not rename
    type?: string; // stored - do not rename
    url?: string; // stored - do not rename
    authMode?: string; // stored - do not rename
    helper?: RouteHelper; // stored - do not rename
    tokenVar?: string; // stored - do not rename
    optionalArgs?: { executablePath?: string[]; token?: string[]; [arg: string]: string[] | undefined }; // stored - do not rename
    image?: { name: string; tag: string }; // stored - do not rename
    fallback?: RouteFallback; // stored - do not rename
    keyless?: string; // stored - do not rename
    audit?: boolean; // stored - do not rename
    urlVars?: UrlVar[]; // stored - do not rename
}

// A path the row's data folder sets: an env value or the value after an arg flag, below the data folder.
export interface DerivedLocation
{
    in: 'env' | 'arg'; // stored - do not rename
    key: string; // stored - do not rename
    sub: string; // stored - do not rename
}

export interface RowLocations
{
    defaultSide: string; // stored - do not rename
    relative: boolean; // stored - do not rename
    alfred: string; // stored - do not rename
    windowsAbsolute?: boolean; // stored - do not rename
    derived: DerivedLocation[]; // stored - do not rename
}

export interface RowParam
{
    id: string; // stored - do not rename
    label: string; // stored - do not rename
    default: string; // stored - do not rename
}

export interface DangerousTool
{
    tool: string; // stored - do not rename
    why: string; // stored - do not rename
}

export type RouteName = 'local' | 'remote' | 'bridge';

export interface CatalogRow
{
    id: string; // stored - do not rename
    kind: string; // stored - do not rename
    group: string; // stored - do not rename
    label: string; // stored - do not rename
    summary: string; // stored - do not rename
    name: string; // stored - do not rename
    os: string[]; // stored - do not rename
    recommendedRoute: string; // stored - do not rename
    routes: { local?: CatalogRoute; remote?: CatalogRoute; bridge?: CatalogRoute; [route: string]: CatalogRoute }; // stored - do not rename
    locations?: RowLocations; // stored - do not rename
    dangerous: DangerousTool[]; // stored - do not rename
    params?: RowParam[]; // stored - do not rename
    plugin?: string; // stored - do not rename (a plugin row's, none in 0.5.0)
    marketplace?: { name: string }; // stored - do not rename (a plugin row's, none in 0.5.0)
}

export interface CatalogRules
{
    ageGateDays: number; // stored - do not rename
    cutoff: string; // stored - do not rename
    windowsArmPython: string; // stored - do not rename
    windowsNpxCmd: { documented: boolean; source: string }; // stored - do not rename
    nameRe: string; // stored - do not rename
}

export interface ToolsFile
{
    schema: number; // stored - do not rename
    note: string; // stored - do not rename
    rules: CatalogRules; // stored - do not rename
    groups: { id: string; label: string }[]; // stored - do not rename
    order: string[]; // stored - do not rename
    tools: CatalogRow[]; // stored - do not rename
}

// One recorded fix in catalog/fixes.json.
export interface FixRow
{
    id: string; // stored - do not rename
    tool: string[]; // stored - do not rename
    os: string[]; // stored - do not rename
    kind: string; // stored - do not rename
    symptom: string; // stored - do not rename
    detect: string; // stored - do not rename
    fix: string | null; // stored - do not rename
    verifiedOn: string; // stored - do not rename
    source: string; // stored - do not rename
    hold?: string; // stored - do not rename
    documented?: boolean; // stored - do not rename
    upgrade?: string; // stored - do not rename
    steps?: string; // stored - do not rename
    ids?: string[]; // stored - do not rename
    advice?: boolean; // stored - do not rename
}

export interface FixesFile
{
    schema: number; // stored - do not rename
    note: string; // stored - do not rename
    fixes: FixRow[]; // stored - do not rename
}

export interface ReservedFile
{
    note: string; // stored - do not rename
    names: string[]; // stored - do not rename
}

// The catalog as load() hands it out: tools.json's fields, the reserved names, the rows by id and the fixes.
export interface Catalog extends ToolsFile
{
    reserved: Set<string>;
    byId: Map<string, CatalogRow>;
    fixes: FixRow[];
}

// ---- registry lookups (registry.ts, refresh-pins.ts) ----------------------------------------------------------------

// One release of a package: its version and when it was published, in ms.
export interface Release
{
    version: string;
    time: number;
}
export interface Aged
{
    version: string;
    ageDays: number;
}
// The release to offer (or none) and the newer ones held back by the age gate, newest first.
export interface Choice
{
    offer: Aged | null;
    held: Aged[];
}
export type FetchFn = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
// The two documents the registries answer, the part read here.
export interface NpmDoc
{
    versions?: Record<string, { deprecated?: unknown } | undefined>;
    time?: Record<string, string | undefined>;
}
export interface PypiFile
{
    yanked?: boolean;
    upload_time_iso_8601?: string;
    upload_time: string;
}
export interface PypiDoc
{
    releases?: Record<string, PypiFile[] | null>;
}
// What refresh-pins looks a package up with: the registry, or a stand-in in a test.
export interface RegistryReader
{
    versionsOf(registry: string, name: string): Promise<Release[]>;
}
export interface PinChange
{
    row: string;
    route: string;
    package: string;
    from: string;
    to: string;
    ageDays: number;
}
export interface Refresh
{
    next: ToolsFile;
    changes: PinChange[];
    held: string[];
    errors: string[];
}

// alfred-code's files, the part read here.
export type RetiredRow = { id?: string; name?: string; retiredIn?: string };
export type AlfredFiles = { plugins: RetiredRow[] | Record<string, RetiredRow>; retired: { mcps?: string[] }; mcpServers: Record<string, unknown> };
