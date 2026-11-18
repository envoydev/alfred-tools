// The sign-in command: reads <name> <scope>, signs in and prints one line. Never a token or the client's output.
import { realRun } from './effects.ts';
import { signIn } from './sign-in.ts';
import { EXIT_CODE, SCOPES, USAGE } from './constants.ts';
import type { CommandOptions } from './types.ts';

export function runSignInCommand(argv: string[], { env = process.env, run = realRun, project = process.cwd(), log = (...lines: string[]) => console.log(lines.join('\n')) }: CommandOptions = {}): number
{
    const [name, scope] = argv;
    if (!name || !scope || !SCOPES.includes(scope)) { console.error(USAGE); return EXIT_CODE.usage; }
    const result = signIn(name, scope, { env, run, project });
    log(`${name}: ${result.line}`);
    return result.ok ? EXIT_CODE.ok : EXIT_CODE.failed;
}
