// The plan's named values that no one question builder or reader owns.

// AskUserQuestion's limits: the options one question holds, and the questions one call carries.
export const MAX_OPTIONS = 4;
export const MAX_QUESTIONS = 4;
// A per-project registration name is cut to this many characters.
export const MAX_NAME_LENGTH = 64;
// A per-project registration name: each run of characters a name may not hold becomes one dash, and dashes at its ends go.
export const NAME_UNSAFE_RUN = /[^A-Za-z0-9_-]+/g;
export const EDGE_DASHES = /^-+|-+$/g;
// The folder part of a per-project name when the project folder's name leaves nothing.
export const PROJECT_NAME_FALLBACK = 'project';

