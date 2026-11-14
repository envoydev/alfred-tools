#!/usr/bin/env node
// The entry /preferred-tools commands run to make a plan or ask its questions; the work is in plan/.
import { main } from './plan/command.ts';

process.exit(main(process.argv.slice(2)));
