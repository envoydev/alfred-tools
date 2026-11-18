// A file written whole: through a temporary file beside it and a rename, so a stop midway never leaves half a file.
import fs from 'node:fs';

// `text` as the whole of `file`, through `<file>.<pid>.tmp` and a rename. `mode`: the permission bits the file gets (the
// old file's own, say), set again after the write since the write's mode passes through the umask; absent, the default.
// A step that throws removes the temporary file before the error goes on, so no second copy of the text is left.
export function replaceFile(file: string, text: string, mode?: number): void
{
    const temporary = `${file}.${process.pid}.tmp`;
    try
    {
        fs.writeFileSync(temporary, text, mode === undefined ? undefined : { mode });
        if (mode !== undefined) fs.chmodSync(temporary, mode);
        fs.renameSync(temporary, file);
    }
    catch (error)
    {
        fs.rmSync(temporary, { force: true });
        throw error;
    }
}
