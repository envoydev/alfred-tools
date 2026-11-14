// The hook replay (tests/probes/alfred-hooks.ts) reads the script calls out of each command; a call it misses is a step
// it never replays.
import test from 'node:test';
import assert from 'node:assert/strict';
import { commandLines } from './probes/alfred-hooks.ts';

test('the hook replay reads every script call of the commands', () =>
{
    for (const name of ['install', 'configure', 'fix', 'update'])
    {
        const { body, lines } = commandLines(name);
        const calls = body.match(/node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/[a-z-]+\.ts"/g) ?? [];
        assert.ok(calls.length > 0, `${name}: the command calls no script`);
        assert.equal(lines.length, calls.length, `${name}: ${lines.length} of ${calls.length} script calls read`);
        assert.ok(lines.every((line) => line.script.endsWith('.ts')), `${name}: ${lines.map((line) => line.script).join(', ')}`);
    }
});
