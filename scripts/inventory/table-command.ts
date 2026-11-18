// The table command: reads the inventory file and prints the table.
import fs from 'node:fs';
import { isInventoryFile, renderTable } from './table.ts';
import { REFUSED_EXIT_CODE } from './constants.ts';

export function runTableCommand(argv: string[], { out = (line: string) => process.stdout.write(`${line}\n`) }: { out?: (line: string) => void } = {}): number
{
    if (!argv[0]) { out('usage: table.ts <inventory.json>'); return REFUSED_EXIT_CODE; }
    let parsed: unknown;
    try { parsed = JSON.parse(fs.readFileSync(argv[0], 'utf8')); }
    catch (caught) { const error = caught as Error; out(`table: cannot read ${argv[0]}: ${error.message}`); return REFUSED_EXIT_CODE; }
    if (!isInventoryFile(parsed)) { out(`table: ${argv[0]} is not an inventory`); return REFUSED_EXIT_CODE; }
    out(renderTable(parsed));
    return 0;
}

