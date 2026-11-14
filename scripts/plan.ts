#!/usr/bin/env node
// The entry /alfred-tools commands run to make a plan or ask its questions; the work is in plan/.
import { runPlanCommand } from './plan/command.ts';

process.exit(runPlanCommand(process.argv.slice(2)));
