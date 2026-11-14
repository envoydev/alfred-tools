// The table command: reads the inventory file and prints the table.
import fs from 'node:fs';
import { renderTable } from './table.ts';
import type { Inventory } from './types.ts';

export function runTableCommand(argv: string[], { out = (line: string) => process.stdout.write(`${line}\n`) }: { out?: (line: string) => void } = {}): number
{
    if (!argv[0]) { out('usage: table.ts <inventory.json>'); return 2; }
    let inventory: Inventory;
    try { inventory = JSON.parse(fs.readFileSync(argv[0], 'utf8')) as Inventory; }
    catch (caught) { const error = caught as Error; out(`table: cannot read ${argv[0]}: ${error.message}`); return 2; }
    out(renderTable(inventory));
    return 0;
}

