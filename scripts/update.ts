#!/usr/bin/env node
'use strict';
// The entry /preferred-tools:update runs; the work is in update/.
const { blockingStdio } = require('./core/json-file.ts');
const { main } = require('./update/command.ts');

if (require.main === module) { blockingStdio(); main(process.argv.slice(2)).then((code) => process.exit(code)); }
