#!/usr/bin/env node
// The entry /alfred-tools commands run to read what is installed; the work is in inventory/.
import { runInventoryCommand } from './inventory/command.ts';

process.exit(runInventoryCommand(process.argv.slice(2)));
