// The types of one MCP pick as planMcp (plan/pick.ts) settles it, part by part: the registration, route, scope and name
// (target.ts), the answers that edit an entry (answers.ts), the entry (entry.ts), Cursor's form (cursor.ts) and what its
// key needs (key-use.ts).
import type { ServerEntry } from '../../core/types.ts';
import type { CatalogRoute, CatalogRow } from '../../catalog/types.ts';
import type { Current } from '../../entries/types.ts';
import type { InvRegistration } from '../../inventory/types.ts';
import type { KeyHit } from '../../keys/types.ts';
import type { KeyState } from '../types.ts';
import type { Reconnect } from '../steps/types.ts';

// The pick's registration (configure's target, else none), route, scope, name and apps.
export interface PickBase
{
    row: CatalogRow;
    target: InvRegistration | null;
    current: Current | null;
    listedClients: string[];
    clients: string[];
    routeId: string;
    route: CatalogRoute;
    scope: string;
    name: string;
}

// The host a row with params is given, beside any other param answered.
export type HostParams = { host?: string | undefined } & Record<string, string | undefined>;

// The answers that edit an entry: its params, whether it sends a key and under which name, and a bridge's URL names.
export interface PickAnswers
{
    params: HostParams;
    wantToken: boolean;
    keyState: KeyState | null;
    liveKey: string | null;
    keyName: string | undefined;
    unfilledStdio: boolean;
    sendNow: boolean;
    urlNames: Record<string, string>;
    exclude: boolean;
}

// The entry the pick writes, whether it is built fresh, its data folder and its hosted settings.
export interface PickEntry
{
    entry: ServerEntry;
    fresh: boolean;
    rootStr: string | undefined;
    ensure: string | null;
    dataAbs: string | null;
    hostedSettings: boolean;
}

// Cursor's form of the entry: the entry with it, the form ('signin', 'two' or none), the apps left and the sign-in's root.
export interface PickCursor
{
    entry: ServerEntry;
    form: string | null;
    clients: string[];
    signInRoot: string | null;
}

// What the key needs: the key file and names written, a bridge's state, the key the apply writes in and the reconnect line.
export interface PickKeyUse
{
    bridge: boolean;
    bridgeFilled: boolean | null;
    keyFile: string | null;
    keyNames: string[];
    withKey: { key?: { name: string; files: string[] } };
    chosen: KeyHit | null;
    staleKey: boolean;
    reconnect: Reconnect | null;
}
