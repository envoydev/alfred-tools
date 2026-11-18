// The one way a pre-approved script writes a file: into a folder tmpdir.ts made, through a temporary file and a rename.
import fs from 'node:fs';
import path from 'node:path';
import { NO_FILE_NAMES } from './constants.ts';
import { isOurTempDir, realPathOf } from './tmpdir.ts';

// The file to write, as a path inside the folder that was checked: that folder's real path joined to the file's own name,
// so a `<link>/..` in the text cannot send the write somewhere the check did not look. null when the folder is not one
// tmpdir.ts made, or when no file is named.
export function checkedTarget(file: string): string | null
{
    const name = path.basename(file);
    const folder = path.dirname(file);
    if (NO_FILE_NAMES.has(name) || !isOurTempDir(folder)) return null;
    return path.join(realPathOf(folder), name);
}

// `file` is a checkedTarget
export function writeJsonNoFollow(file: string, value: unknown): void
{
    const temporary = `${file}.tmp`;
    // a link planted at the temporary name is removed, not followed: 'wx' fails rather than write through one
    fs.rmSync(temporary, { force: true });
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { flag: 'wx' });
    // the rename replaces a link or hard link at the target instead of writing through it
    fs.renameSync(temporary, file);
}
