// The inventory command: reads its flags, builds the inventory and writes or prints it.
import fs from 'node:fs';
import { blockingStdio } from '../core/json-file.ts';
import { buildInventory, keptOf } from './inventory.ts';

export function runInventoryCommand(argv: string[]): number
{
    blockingStdio();
    const flagValue = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
    const project = flagValue('--project') || process.cwd();
    const outFile = flagValue('--json');
    const inventory = buildInventory({ project, data: flagValue('--data') || null });
    if (!inventory.cli!.ok)
    {
        console.error('alfred-tools: the claude CLI is not on PATH - install Claude Code, then run this again.');
        return 3;
    }
    const text = JSON.stringify(keptOf(inventory), null, 2);
    if (outFile) fs.writeFileSync(outFile, text);
    else console.log(text);
    for (const unreadable of inventory.unreadable)
        console.error(`alfred-tools: ${unreadable.file} is ${unreadable.state}${unreadable.error ? ` (${unreadable.error})` : ''} - ${unreadable.scope === 'inherited' ? "Claude Code skips that parent folder's servers too; nothing here writes to it." : `the ${unreadable.scope} scope is treated as unreadable and nothing will be written there.`}`);
    const own = inventory.registrations.filter((registration) => registration.own).length;
    console.log(`inventory: ${inventory.registrations.length} registrations (${inventory.registrations.length - own} match a catalog row, ${own} are your own), ${inventory.plugins.length} plugins${outFile ? ` -> ${outFile}` : ''}`);
    return 0;
}

