#!/usr/bin/env node
// The entry /preferred-tools commands run to apply a plan; the work is in apply/.
import { main } from './apply/command.ts';

process.exit(main(process.argv.slice(2)));
