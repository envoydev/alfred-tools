#!/usr/bin/env node
// @ts-nocheck - typed in Task 12
// The entry /preferred-tools commands run to apply a plan; the work is in apply/.
import { main } from './apply/command.ts';

process.exit(main(process.argv.slice(2)));
