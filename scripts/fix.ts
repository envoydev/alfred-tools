#!/usr/bin/env node
// @ts-nocheck - typed in Task 12
// The entry /preferred-tools:fix runs; the work is in fix/.
import { blockingStdio } from './core/json-file.ts';
import { main } from './fix/command.ts';

blockingStdio(); process.exit(main(process.argv.slice(2)));
