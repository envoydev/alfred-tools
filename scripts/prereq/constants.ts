// The prereq command's named values.

// What the command exits with: the report printed, or an argument or a file it could not take.
export const EXIT_CODE = { ok: 0, usage: 2 } as const;
// The temp folder `--audit` makes for one package and removes after: its name starts with this (AGENTS.md names it).
export const AUDIT_DIR_PREFIX = 'pt-audit-';
