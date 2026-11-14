#!/usr/bin/env node
// The entry that rebuilds catalog/reserved-names.json; the work is in catalog/refresh-reserved.js.
import { main } from './catalog/refresh-reserved.ts';

process.exit(main(process.argv.slice(2)));
