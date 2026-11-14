#!/usr/bin/env node
// The entry /preferred-tools commands run to check what a pick needs on this machine; the work is in prereq/.
import { blockingStdio } from './core/json-file.ts';
import { main } from './prereq/command.ts';

blockingStdio(); process.exit(main(process.argv.slice(2)));
