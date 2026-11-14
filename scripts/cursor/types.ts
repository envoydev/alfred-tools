// The shapes cursor/ reads and writes: Cursor's mcp.json as read, the servers the lists set up for it, a write step.
import type { Env, ServerEntry, ServerMap } from '../core/types.ts';
import type { Catalog } from '../catalog/types.ts';
import type { ListServer } from '../mcps-list/types.ts';

// Cursor's <folder>/.cursor/mcp.json: Cursor's own file, its key read by name.
export interface CursorDoc
{
    mcpServers: ServerMap; // Cursor's - do not rename
    [key: string]: unknown;
}
export interface CursorRead
{
    state: 'absent' | 'ok' | 'symlink' | 'bad' | 'shape';
    doc: CursorDoc | null;
    eol: string;
    error?: string | undefined;
    text?: string;
}

// A server a list sets up for Cursor: its entry for Cursor, its scope and list, and the row, route and key it holds.
export interface Managed
{
    entry: ServerEntry;
    scope: string;
    list: string;
    row: string | null;
    route: string | null | undefined;
    key: string | null;
}

// A list Cursor's file is written from: the file, the scopes it gives, and its servers.
export interface ListSource
{
    file: string;
    scopes: string[];
    servers: ListServer[];
}

// The cursor-write step.
export interface CursorWriteStep
{
    file: string;
    family?: string;
    lists?: { file: string; scopes: string[] }[];
    before?: string[];
    skip?: string[];
    replace?: string[];
    only?: string[];
}

// What a Cursor write is given: the catalog, and where Claude Code's registration of a server is read from.
export interface CursorCtx
{
    catalog?: Catalog | undefined;
    env?: Env | undefined;
    project?: string | undefined;
}

// Cursor's file of a family as the inventory gives it.
export interface CursorOf
{
    file: string;
    state: CursorRead['state'];
    names: string[];
    entries: Record<string, ServerEntry>;
}
