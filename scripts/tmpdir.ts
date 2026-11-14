#!/usr/bin/env node
// @ts-nocheck - typed in Task 12
// The entry /preferred-tools commands run for a fresh temp folder; the work is in core/tmpdir.js.
import { make } from './core/tmpdir.ts';

process.stdout.write(`${make()}\n`);
