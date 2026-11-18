import test from 'node:test';
import assert from 'node:assert';
import { localPathsOutside } from './matrix/local-paths.ts';

const ROOTS = ['/Users/me/shop/.alfred-tools', '/private/Users/me/shop/.alfred-tools'];

test('localPathsOutside accepts a path under the data folder, written as the project path or as its real path', () =>
{
    assert.deepStrictEqual(localPathsOutside('node /Users/me/shop/.alfred-tools/mcp-headers.js sentry', ROOTS), []);
    assert.deepStrictEqual(localPathsOutside('/private/Users/me/shop/.alfred-tools/mcp-bridge.js', ROOTS), []);
    assert.deepStrictEqual(localPathsOutside('/Users/me/shop/.alfred-tools', ROOTS), [], 'the folder itself');
});

test('localPathsOutside flags an absolute local path that is not under the data folder, in a command, a URL or a helper line', () =>
{
    assert.deepStrictEqual(localPathsOutside('/Users/me/bin/node', ROOTS), ['/Users/me/bin/node'], 'a command');
    assert.deepStrictEqual(localPathsOutside('node /Users/me/other/mcp-headers.js', ROOTS), ['/Users/me/other/mcp-headers.js'], 'a helper line');
    assert.deepStrictEqual(localPathsOutside('/Users/me/shop/.alfred-tools-evil/x', ROOTS), ['/Users/me/shop/.alfred-tools-evil/x'], 'a sibling folder with the same prefix');
    assert.deepStrictEqual(localPathsOutside('--data=/home/me/x', ROOTS), ['/home/me/x'], 'a path after an equals sign');
    assert.ok(localPathsOutside('file:///home/me/x', ROOTS).length > 0, 'a file URL');
});

test('localPathsOutside lets a URL, a bare command and a one-letter drive-style argument through', () =>
{
    assert.deepStrictEqual(localPathsOutside('https://mcp.example.com/v1/mcp?a=/b', ROOTS), []);
    assert.deepStrictEqual(localPathsOutside('npx', ROOTS), []);
    assert.deepStrictEqual(localPathsOutside('/c', ROOTS), []);
});
