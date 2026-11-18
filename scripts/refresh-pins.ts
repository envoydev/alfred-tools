#!/usr/bin/env node
// The entry for `npm run refresh-pins`; the work is in catalog/refresh-pins.ts.
import { blockingStdio } from './core/json-file.ts';
import { exitWhenSettled } from './core/exit.ts';
import { runRefreshPinsCommand } from './catalog/refresh-pins.ts';

blockingStdio(); exitWhenSettled(runRefreshPinsCommand(process.argv.slice(2)), 'refresh-pins');
