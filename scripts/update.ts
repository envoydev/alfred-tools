#!/usr/bin/env node
// The entry /alfred-tools:update runs; the work is in update/.
import { blockingStdio } from './core/json-file.ts';
import { exitWhenSettled } from './core/exit.ts';
import { runUpdateCommand } from './update/command.ts';

blockingStdio(); exitWhenSettled(runUpdateCommand(process.argv.slice(2)), 'update');
