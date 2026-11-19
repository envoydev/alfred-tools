// The shape checks every reader of a parsed file starts from: a plain object (not null and not a list), a list of
// strings, and an object of strings.
export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export const isTextList = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');
export const isTextMap = (value: unknown): value is Record<string, string> => isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
