#!/usr/bin/env node
// The entry for `npm run refresh-pins`; the work is in catalog/refresh-pins.ts.
import { blockingStdio } from './core/json-file.ts';
import { runRefreshPinsCommand } from './catalog/refresh-pins.ts';

blockingStdio(); runRefreshPinsCommand(process.argv.slice(2)).then((code) => process.exit(code));
