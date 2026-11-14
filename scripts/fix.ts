#!/usr/bin/env node
'use strict';
// The entry /preferred-tools:fix runs; the work is in fix/.
const { blockingStdio } = require('./core/json-file.ts');
const { main } = require('./fix/command.ts');

if (require.main === module) { blockingStdio(); process.exit(main(process.argv.slice(2))); }
