#!/usr/bin/env node
'use strict';
// The entry /preferred-tools commands run to make a plan or ask its questions; the work is in plan/.
const { main } = require('./plan/command.ts');

if (require.main === module) process.exit(main(process.argv.slice(2)));
