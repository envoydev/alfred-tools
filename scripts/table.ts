#!/usr/bin/env node
// The entry /preferred-tools commands run to print the catalog table; the work is in inventory/.
import { blockingStdio } from './core/json-file.ts';
import { main } from './inventory/table-command.ts';

blockingStdio(); process.exit(main(process.argv.slice(2)));
