#!/usr/bin/env node
// The entry /preferred-tools commands run to apply a plan; the work is in apply/.
import { runApplyCommand } from './apply/command.ts';

process.exit(runApplyCommand(process.argv.slice(2)));
