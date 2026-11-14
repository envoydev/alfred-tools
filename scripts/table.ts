#!/usr/bin/env node
'use strict';
// The entry /preferred-tools commands run to print the catalog table; the work is in inventory/.
const { blockingStdio } = require('./core/json-file.ts');
const { main } = require('./inventory/table-command.ts');

if (require.main === module) { blockingStdio(); process.exit(main(process.argv.slice(2))); }
