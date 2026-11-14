#!/usr/bin/env node
// @ts-nocheck - typed in Task 12
// The entry /preferred-tools commands run to read what is installed; the work is in inventory/.
import { main } from './inventory/command.ts';

process.exit(main(process.argv.slice(2)));
