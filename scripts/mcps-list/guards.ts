// The checks that make a list or record file's servers the shapes mcps-list/types.ts names: a server or own entry that
// fails one is not read, as one with no name never was.
import { isRecord, isServerEntry, isString, isTextList } from '../core/guards.ts';
import type { ListServer, OwnEntry, StepEnd } from './types.ts';

const isOptionalString = (value: unknown): boolean => value === undefined || isString(value);
const isStringOrNull = (value: unknown): boolean => value === null || isString(value);

// A list server as this plugin writes it (mcps-list.ts fromRegistration).
export const isListServer = (value: unknown): value is ListServer => isRecord(value)
    && isString(value['name']) && isString(value['scope']) && isStringOrNull(value['row'])
    && (value['route'] === undefined || isStringOrNull(value['route'])) && isTextList(value['clients'])
    && isServerEntry(value['entry']) && isStringOrNull(value['key'])
    && (value['cursorEntry'] === undefined || isServerEntry(value['cursorEntry']));

// An own entry: an object whose named fields, where present, are strings.
export const isOwnEntry = (value: unknown): value is OwnEntry => isRecord(value)
    && ['name', 'scope', 'plugin', 'server', 'connector', 'choice'].every((field) => isOptionalString(value[field]));

// A move's destination: a name and a scope.
export const isStepEnd = (value: unknown): value is StepEnd => isRecord(value) && isString(value['name']) && isString(value['scope']);
