// The shape checks for the catalog's three JSON files - tools.json, reserved-names.json and fixes.json. Each checks the
// top level its readers use, as plan/files/shapes.ts does for the walk's files: every row an object with a string id.
// The rows' own fields are pinned by tests/catalog.test.ts.
import { isRecord, isTextList } from '../core/shapes.ts';
import type { FixesFile, ReservedFile, ToolsFile } from './types.ts';

const isRowList = (value: unknown): boolean => Array.isArray(value) && value.every((row) => isRecord(row) && typeof row['id'] === 'string');

// tools.json: its rows, the rules, the groups and the order the questions follow.
export const isToolsFile = (value: unknown): value is ToolsFile => isRecord(value) && isRowList(value['tools']) && isRecord(value['rules'])
    && isRowList(value['groups']) && isTextList(value['order']);
// reserved-names.json: the names alfred-code once registered.
export const isReservedFile = (value: unknown): value is ReservedFile => isRecord(value) && isTextList(value['names']);
// fixes.json: the recorded fixes.
export const isFixesFile = (value: unknown): value is FixesFile => isRecord(value) && isRowList(value['fixes']);
