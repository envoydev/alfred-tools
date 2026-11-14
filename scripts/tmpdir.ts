#!/usr/bin/env node
'use strict';
// The entry /preferred-tools commands run for a fresh temp folder; the work is in core/tmpdir.js.
const { make } = require('./core/tmpdir.ts');

if (require.main === module) process.stdout.write(`${make()}\n`);
