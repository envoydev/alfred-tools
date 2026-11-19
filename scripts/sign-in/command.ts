// The sign-in command: reads <name> <scope>, signs in and prints one line (and the sign-in link when no browser opened).
// Never a token or the client's output.
import { commandIo, signIn } from './effects.ts';
import { EXIT_CODE, SCOPES, USAGE } from './constants.ts';
import type { CommandOptions } from './types.ts';

export async function runSignInCommand(argv: string[], options: CommandOptions = {}): Promise<number>
{
    const { env, run, project, log, warn } = commandIo(options);
    const [name, scope] = argv;
    if (!name || !scope || !SCOPES.includes(scope)) { warn(USAGE); return EXIT_CODE.usage; }
    const result = await signIn(name, scope, { env, run, project, print: (line) => log(line) });
    log(`${name}: ${result.line}`);
    return result.ok ? EXIT_CODE.ok : EXIT_CODE.failed;
}
