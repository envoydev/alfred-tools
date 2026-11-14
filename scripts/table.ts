#!/usr/bin/env node
// The entry /alfred-tools commands run to print the catalog table; the work is in inventory/.
import { blockingStdio } from './core/json-file.ts';
import { runTableCommand } from './inventory/table-command.ts';

blockingStdio(); process.exit(runTableCommand(process.argv.slice(2)));
