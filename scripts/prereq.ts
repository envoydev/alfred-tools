#!/usr/bin/env node
// The entry /preferred-tools commands run to check what a pick needs on this machine; the work is in prereq/.
import { blockingStdio } from './core/json-file.ts';
import { runPrereqCommand } from './prereq/command.ts';

blockingStdio(); process.exit(runPrereqCommand(process.argv.slice(2)));
