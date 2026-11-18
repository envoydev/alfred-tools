// The end of an entry whose command is async: exit with the command's code, or - when the command rejects - print one
// line naming the script and the error and exit 1, never Node's unhandled-rejection trace.
export function exitWhenSettled(result: Promise<number>, script: string): void
{
    // process.exit ends the run on either path, so nothing waits on the promise this returns
    void result.then(
        (code) => process.exit(code),
        (error: unknown) =>
        {
            console.error(`${script}: ${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
        },
    );
}
