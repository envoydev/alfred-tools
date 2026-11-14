#!/usr/bin/env node
'use strict';
// The entry /preferred-tools commands run to check what a pick needs on this machine; the work is in prereq/.
const { blockingStdio } = require('./core/json-file.ts');
const { main } = require('./prereq/command.ts');

if (require.main === module) { blockingStdio(); process.exit(main(process.argv.slice(2))); }
