// Narrowing for a value read from outside - a parsed JSON file, a CLI's output, a caught throw - so that no reader
// casts it: each guard checks what its type claims.
// The plain-object, string-list and string-map checks are core/shapes.ts's, re-exported here.
import { isRecord, isTextList, isTextMap } from './shapes.ts';
import type { AccountProject, Json, JsonObject, ServerEntry, ServerMap } from './types.ts';

export { isRecord, isTextList, isTextMap };
export const isString = (value: unknown): value is string => typeof value === 'string';
const isOptionalString = (value: unknown): value is string | undefined => value === undefined || isString(value);

// A value JSON.parse could have returned: what a parsed document holds all the way down.
export function isJson(value: unknown): value is Json
{
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return true;
    if (Array.isArray(value)) return value.every(isJson);
    return isRecord(value) && Object.values(value).every(isJson);
}
export const isJsonObject = (value: unknown): value is JsonObject => isRecord(value) && isJson(value);

// One server as Claude Code writes it: its string fields strings, `args` a list of strings, `env` and `headers` maps of
// strings, anything else JSON.
export const isServerEntry = (value: unknown): value is ServerEntry => isJsonObject(value)
    && [value['type'], value['command'], value['url'], value['headersHelper']].every(isOptionalString)
    && (value['args'] === undefined || isTextList(value['args']))
    && (value['env'] === undefined || isTextMap(value['env']))
    && (value['headers'] === undefined || isTextMap(value['headers']));
export const isServerMap = (value: unknown): value is ServerMap => isRecord(value) && Object.values(value).every(isServerEntry);

// A .mcp.json, or one project's entry in the account file: its servers, and the trust flag the account entry carries.
export const isAccountProject = (value: unknown): value is AccountProject => isRecord(value)
    && (value['mcpServers'] === undefined || isServerMap(value['mcpServers']))
    && (value['hasTrustDialogAccepted'] === undefined || typeof value['hasTrustDialogAccepted'] === 'boolean');

// The `code` a failed fs or child_process call carries (ENOENT, EACCES ...); undefined for any other throw.
export const errorCode = (caught: unknown): string | undefined => (caught instanceof Error && 'code' in caught && typeof caught.code === 'string' ? caught.code : undefined);
// What a caught throw says: an Error's message, else the value thrown, as text.
export const errorMessage = (caught: unknown): string => (caught instanceof Error ? caught.message : String(caught));
