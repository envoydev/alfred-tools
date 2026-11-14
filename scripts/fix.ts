#!/usr/bin/env node
// The entry /alfred-tools:fix runs; the work is in fix/.
import { blockingStdio } from './core/json-file.ts';
import { runFixCommand } from './fix/command.ts';

blockingStdio(); process.exit(runFixCommand(process.argv.slice(2)));
