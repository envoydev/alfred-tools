#!/usr/bin/env node
// The entry for `npm run refresh-pins`; the work is in catalog/refresh-pins.js.
import { blockingStdio } from './core/json-file.ts';
import { main } from './catalog/refresh-pins.ts';

blockingStdio(); main(process.argv.slice(2)).then((code) => process.exit(code));
