// The one way plan.ts writes a file under its pre-approval: a temporary file beside it, then a rename over the target.
import fs from 'node:fs';

export function writeJsonNoFollow(file: string, value: unknown): void
{
    const temporary = `${file}.tmp`;
    // a link planted at the temporary name is removed, not followed: 'wx' fails rather than write through one
    fs.rmSync(temporary, { force: true });
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { flag: 'wx' });
    // the rename replaces a link or hard link at the target instead of writing through it
    fs.renameSync(temporary, file);
}
