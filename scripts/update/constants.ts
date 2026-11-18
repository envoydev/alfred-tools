// The update command's named values.

// What the command exits with: done, an offer that failed or was not offered, a bad argument, no claude CLI.
export const EXIT_CODE = { ok: 0, failed: 1, usage: 2, noCli: 3 } as const;
// AskUserQuestion's limit on a question's header, in characters.
export const MAX_HEADER_LENGTH = 12;
