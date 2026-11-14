#!/usr/bin/env node
// The entry /alfred-tools commands run for a fresh temp folder; the work is in core/tmpdir.ts.
import { makeTempDir } from './core/tmpdir.ts';

process.stdout.write(`${makeTempDir()}\n`);
