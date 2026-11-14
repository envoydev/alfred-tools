#!/usr/bin/env node
// The entry /preferred-tools:update runs; the work is in update/.
import { blockingStdio } from './core/json-file.ts';
import { main } from './update/command.ts';

blockingStdio(); main(process.argv.slice(2)).then((code) => process.exit(code));
