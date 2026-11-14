#!/usr/bin/env node
'use strict';
// The entry /preferred-tools commands run to read what is installed; the work is in inventory/.
const { main } = require('./inventory/command.ts');

if (require.main === module) process.exit(main(process.argv.slice(2)));
