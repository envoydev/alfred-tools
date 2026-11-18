import test from 'node:test';
import assert from 'node:assert';
import { entryStrings, localPathsOutside } from './matrix/local-paths.ts';

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

test('entryStrings holds every string of an entry: command, url, headersHelper, each arg, each env value, each header value', () =>
{
    const strings = entryStrings({ command: 'node', url: 'https://x.example/mcp', headersHelper: 'node /r/h.js', args: ['--cfg=/Users/me/x', 'plain'], env: { A: '/r/a', B: 'b' }, headers: { Authorization: 'Bearer x' }, type: 'stdio' });
    assert.deepStrictEqual(strings.sort(), ['--cfg=/Users/me/x', '/r/a', 'Bearer x', 'b', 'https://x.example/mcp', 'node', 'node /r/h.js', 'plain'].sort());
    assert.deepStrictEqual(entryStrings({}), []);
    assert.deepStrictEqual(entryStrings({ args: [1 as unknown as string], env: { A: undefined as unknown as string } }), [], 'only strings');
});
