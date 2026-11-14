#!/usr/bin/env node
// The entry /preferred-tools commands run to fetch what an apply registered; the work is in apply/.
import { main } from './apply/fetch-command.ts';

main(process.argv.slice(2)).then((code) => process.exit(code));
