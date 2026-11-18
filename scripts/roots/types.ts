// The shapes roots/ reads and hands out: the roots map, a root option, the root in use, a git gap and a copied file's
// state, and the part of the inventory a root is told from.
import type { ServerEntry } from '../core/types.ts';
import type { Machine, Roots } from '../entries/types.ts';

export type Family = 'project' | 'global';

// ${CLAUDE_PLUGIN_DATA}/roots.json (stored - do not rename).
export interface RootsMap
{
    version: number; // stored - do not rename
    global: string | null; // stored - do not rename
    projects: Record<string, string>; // stored - do not rename
}
// The map as read: empty with a note and why when the file could not be taken.
export interface MapRead extends RootsMap
{
    note?: string;
    state?: 'unreadable' | 'bad' | 'newer';
}

// A root question's option: an id, the folder (none for 'A folder you name'), and its words.
export interface RootOption
{
    id: string;
    root: string | null;
    label?: string;
    description?: string;
}

export interface InUse
{
    path: string;
    from: 'map' | 'registration' | 'secrets';
}

// A registration as roots/ reads it from the inventory.
export interface RootReg
{
    name?: string | undefined;
    scope: string;
    rowId?: string | null | undefined;
    alfredRetired?: boolean | undefined;
    choice?: string | null | undefined;
    entry?: ServerEntry | undefined;
}

// The part of the inventory a root is told from.
export interface InventoryView
{
    registrations?: RootReg[] | undefined;
    roots?: { map?: RootsMap | undefined } | null | undefined;
    alfredCodeEnabled?: boolean | undefined;
}

export type RootsCtx = Machine;

// An answer to a root question: an option id, and the folder typed for 'named'.
export interface RootAnswer
{
    id?: string | undefined;
    path?: string | undefined;
}
export interface Resolved
{
    roots: Roots;
    errors: string[];
}

// What git would do wrong with a root: commit its keys or sign-ins, or ignore a file a committed entry names.
export interface IgnoreGap
{
    reason: string;
    secrets?: boolean;
    helper?: boolean;
    excluded?: boolean;
    signIns?: boolean;
    unignore?: string[];
}

// A default root under the plugin's former name and what is beside it (spec D3): 'move' - the new name is absent or an
// empty folder; 'both' - both hold root files; 'came-back' - the former one holds none; 'link' - a symbolic link.
export interface PendingMove
{
    families: Family[];
    from: string;
    to: string;
    state: 'move' | 'both' | 'came-back' | 'link';
}
// The files this plugin copies into a root, and one's state against this plugin's copy.
export type ShippedKind = 'helper' | 'bridge' | 'serenaContext';
export interface ShippedState
{
    state: 'absent' | 'lower' | 'same' | 'edited' | 'higher';
    number: number | null;
}

// An entry a record keeps: a registration, a plugin's server or a connector.
export interface RecordEntry
{
    name?: unknown;
    scope?: unknown;
    plugin?: unknown;
    server?: unknown;
    connector?: unknown;
    choice?: unknown;
}

// ---- a workspace, as alfred-code records it (workspace.ts) ----------------------------------------------------------

export type Role = 'root' | 'standalone';
// alfred-code's record, `<folder>/.alfred/workspace.json`, read-only (alfred-code's file - do not rename).
export interface WorkspaceRecord
{
    parent?: string; // alfred-code's - do not rename
    role?: Role; // alfred-code's - do not rename
    children: string[]; // alfred-code's - do not rename
    ignoredChildren: string[]; // alfred-code's - do not rename
}
// A record as read: the record, or why it could not be read.
export interface RecordRead
{
    parent?: string;
    role?: Role;
    children?: string[];
    ignoredChildren?: string[];
    error?: string;
    file?: string;
}
// The workspace a project is in: its root, its members, the folders above the project (nearest first, root last).
export interface Workspace
{
    root: string | null;
    members: string[];
    ancestors: string[];
    notes: string[];
}

// The record while it is read: every field present.
export type RawRecord = { parent: string | null; role: Role | null; children: string[]; ignoredChildren: string[] };
export type LineEntry = { kind: 'skip' } | { kind: 'parent-none' } | { kind: 'parent' | 'child'; value: string } | { kind: 'role'; value: Role };
export type WorkspaceJson = { parent?: unknown; role?: unknown; children?: unknown; ignoredChildren?: unknown };
