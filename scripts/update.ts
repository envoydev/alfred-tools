#!/usr/bin/env node
// The entry /alfred-tools:update runs; the work is in update/.
import { blockingStdio } from './core/json-file.ts';
import { runUpdateCommand } from './update/command.ts';

blockingStdio(); runUpdateCommand(process.argv.slice(2)).then((code) => process.exit(code));
