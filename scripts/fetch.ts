#!/usr/bin/env node
// The entry /alfred-tools commands run to fetch what an apply registered; the work is in apply/.
import { exitWhenSettled } from './core/exit.ts';
import { runFetchCommand } from './apply/fetch-command.ts';

exitWhenSettled(runFetchCommand(process.argv.slice(2)), 'fetch');
