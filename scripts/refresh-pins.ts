#!/usr/bin/env node
'use strict';
// The entry for `npm run refresh-pins`; the work is in catalog/refresh-pins.js.
const { blockingStdio } = require('./core/json-file.ts');
const { main } = require('./catalog/refresh-pins.ts');

if (require.main === module) { blockingStdio(); main(process.argv.slice(2)).then((code) => process.exit(code)); }
