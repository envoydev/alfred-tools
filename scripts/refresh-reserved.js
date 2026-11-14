#!/usr/bin/env node
'use strict';
// The entry that rebuilds catalog/reserved-names.json; the work is in catalog/refresh-reserved.js.
const { main } = require('./catalog/refresh-reserved.js');

if (require.main === module) process.exit(main(process.argv.slice(2)));
