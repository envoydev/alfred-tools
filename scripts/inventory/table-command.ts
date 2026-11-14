// The table command: reads the inventory file and prints the table.
import fs from 'node:fs';
import { render } from './table.ts';
import type { Inventory } from './types.ts';

export function main(argv: string[], { out = (s: string) => process.stdout.write(`${s}\n`) }: { out?: (line: string) => void } = {}): number
{
    if (!argv[0]) { out('usage: table.ts <inventory.json>'); return 2; }
    let inv: Inventory;
    try { inv = JSON.parse(fs.readFileSync(argv[0], 'utf8')) as Inventory; }
    catch (caught) { const e = caught as Error; out(`table: cannot read ${argv[0]}: ${e.message}`); return 2; }
    out(render(inv));
    return 0;
}

