// refresh-reserved.ts: the reserved names read from an alfred-code checkout, and a checkout or a flag it cannot use.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { reservedFrom, runRefreshReservedCommand } from '../scripts/catalog/refresh-reserved.ts';

// A checkout holding the three files the command reads; `manifest` replaces meta/stack-manifest.json's content.
function checkout(dir: string, manifest: unknown = { retired: { mcps: ['browser', 'old-tool'] } }): string
{
    const write = (rel: string, value: unknown) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), JSON.stringify(value)); };
    write('meta/retired-plugins.json', { plugins: { 'alfred-navigation': { retiredIn: '2.10.1' }, 'old-tool': { retiredIn: '2.0.0' }, serena: { retiredIn: '2.10.1' } } });
    write('meta/stack-manifest.json', manifest);
    write('stack/mcp/original-mcps.json', { mcpServers: { serena: {} } });
    return dir;
}

// Runs the command with console.error captured: its exit code and the lines it printed there.
function run(argv: string[]): { code: number; errors: string[] }
{
    const errors: string[] = [];
    const original = console.error;
    console.error = (line: string) => { errors.push(line); };
    try { return { code: runRefreshReservedCommand(argv), errors }; }
    finally { console.error = original; }
}

test('reservedFrom reads a checkout: the 2.10.1 retires and the retired names with no row, less the original names', () =>
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-reserved-'));
    try { assert.deepStrictEqual(reservedFrom(checkout(dir)), ['alfred-navigation', 'browser']); }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a checkout whose stack-manifest.json has no retired object is refused with one line and exit 2', () =>
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-reserved-'));
    try
    {
        const result = run(['--alfred', checkout(dir, { version: '3.9.2' }), '--check']);
        assert.deepStrictEqual(result, { code: 2, errors: ['refresh-reserved: meta/stack-manifest.json has no retired object with an mcps list of names'] });
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('--alfred with no folder after it is refused with one line and exit 2', () =>
{
    assert.deepStrictEqual(run(['--alfred']), { code: 2, errors: ['refresh-reserved: --alfred needs the folder of an alfred-code checkout'] });
});
