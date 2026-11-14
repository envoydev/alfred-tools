#!/usr/bin/env node
// The entry that rebuilds catalog/reserved-names.json; the work is in catalog/refresh-reserved.js.
import { runRefreshReservedCommand } from './catalog/refresh-reserved.ts';

process.exit(runRefreshReservedCommand(process.argv.slice(2)));
