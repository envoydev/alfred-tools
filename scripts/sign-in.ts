#!/usr/bin/env node
// The entry /alfred-tools commands run to sign in to a server on the shared mcp-remote sign-in; the work is in sign-in/.
import { blockingStdio } from './core/json-file.ts';
import { runSignInCommand } from './sign-in/command.ts';
import { stopClientOnSignal } from './sign-in/effects.ts';

blockingStdio();
stopClientOnSignal();
runSignInCommand(process.argv.slice(2)).then((code) => process.exit(code));
