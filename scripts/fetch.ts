#!/usr/bin/env node
'use strict';
// The entry /preferred-tools commands run to fetch what an apply registered; the work is in apply/.
const { main } = require('./apply/fetch-command.ts');

if (require.main === module) main(process.argv.slice(2)).then((code) => process.exit(code));
