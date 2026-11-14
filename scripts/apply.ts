#!/usr/bin/env node
'use strict';
// The entry /preferred-tools commands run to apply a plan; the work is in apply/.
const { main } = require('./apply/command.ts');

if (require.main === module) process.exit(main(process.argv.slice(2)));
