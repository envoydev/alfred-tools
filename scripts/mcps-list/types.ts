// The shapes of the list, <root>/mcps.json, and of the 0.4.x record it replaced.
import type { ServerEntry } from '../core/types.ts';

// One server the plugin manages in a scope family (stored - do not rename).
export interface ListServer
{
    name: string; // stored - do not rename
    scope: string; // stored - do not rename
    row: string | null; // stored - do not rename
    route: string | null | undefined; // stored - do not rename
    clients: string[]; // stored - do not rename
    entry: ServerEntry; // stored - do not rename
    key: string | null; // stored - do not rename
    cursorEntry?: ServerEntry; // stored - do not rename
}

// A server the user left on their own: a registration, a plugin's server or a connector, as the record kept it
// (stored - do not rename).
export interface OwnEntry
{
    name?: string | undefined; // stored - do not rename
    scope?: string | undefined; // stored - do not rename
    plugin?: string | undefined; // stored - do not rename
    server?: string | undefined; // stored - do not rename
    connector?: string | undefined; // stored - do not rename
    choice?: string | undefined; // stored - do not rename
    fingerprint?: unknown; // stored - do not rename
    [key: string]: unknown;
}

// <root>/mcps.json (stored - do not rename).
export interface McpsList
{
    version: number; // stored - do not rename
    servers: ListServer[]; // stored - do not rename
    own: OwnEntry[]; // stored - do not rename
    cursorOffer?: 'declined'; // stored - do not rename
}
export type ReadState = 'unreadable' | 'bad' | 'newer';
// The list as read: empty with a note and why when the file could not be taken.
export interface ListRead extends McpsList
{
    note?: string;
    state?: ReadState;
}

// <root>/preferred-tools.json, the 0.2.0-0.4.x record (stored - do not rename).
export interface OldRecord
{
    version: number; // stored - do not rename
    servers: OwnEntry[]; // stored - do not rename
    note?: string;
    state?: ReadState;
}

// What is still there: each server's fingerprint (null: present, not compared) and the connectors, when passed.
export interface Live
{
    servers?: Record<string, unknown> | null | undefined;
    connectors?: string[] | null | undefined;
}

// The changes a plan makes to a list.
export interface ListChanges
{
    upserts?: ListServer[] | undefined;
    drops?: string[] | undefined;
    own?: OwnEntry[] | undefined;
    cursorOffer?: string | null | undefined;
}

// A plan step as the list and the order step read it: a move's `to` is its new name and scope (a root file's move
// names a path there).
export interface StepLike
{
    op?: unknown;
    name?: unknown;
    scope?: unknown;
    to?: unknown;
}
export type StepEnd = { name: string; scope: string };

// The step that orders .mcp.json's servers.
export interface OrderStep
{
    op: 'order-mcp-json';
    file: string;
    own: string[];
    why: string;
}

// The file calls orderFile makes, which a test replaces.
export interface FileOps
{
    read?: (file: string, encoding: 'utf8') => string;
    write?: (file: string, text: string) => void;
    rename?: (from: string, to: string) => void;
}

// A list or record file as parsed, before it is checked.
export interface RawDoc
{
    version?: unknown;
    servers?: unknown;
    own?: unknown;
    cursorOffer?: unknown;
}
