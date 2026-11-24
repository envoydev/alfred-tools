// core/exit.ts: the end of an async entry - its command's exit code, or one line and exit 1 when the command rejects.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const SCRIPTS = path.join(import.meta.dirname, '..', 'scripts');

test('a command that rejects ends on one line naming the script and exit 1, not an unhandled-rejection trace', () =>
{
    const exit = pathToFileURL(path.join(SCRIPTS, 'core', 'exit.ts')).href;
    const run = (body: string) => spawnSync(process.execPath, ['--input-type=module', '-e', `import { exitWhenSettled } from ${JSON.stringify(exit)}; ${body}`], { encoding: 'utf8' });
    const rejected = run("exitWhenSettled(Promise.reject(new Error('the registry did not answer')), 'update');");
    assert.deepStrictEqual([rejected.status, rejected.stderr], [1, 'update: the registry did not answer\n']);
    const settled = run("exitWhenSettled(Promise.resolve(3), 'update');");
    assert.deepStrictEqual([settled.status, settled.stderr], [3, '']);
});

test('each async entry ends through exitWhenSettled, named for its script', () =>
{
    for (const [entry, command] of [['fetch', 'runFetchCommand'], ['refresh-pins', 'runRefreshPinsCommand'], ['sign-in', 'runSignInCommand'], ['update', 'runUpdateCommand']])
        assert.ok(fs.readFileSync(path.join(SCRIPTS, `${entry}.ts`), 'utf8').includes(`exitWhenSettled(${command}(process.argv.slice(2)), '${entry}');`), String(entry));
});
