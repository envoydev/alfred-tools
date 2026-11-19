// The inventory command: reads its flags, builds the inventory and writes or prints it.
//
//   node inventory.ts --project <dir> --json <out> [--data <plugin data dir>]   (--data: the roots map, spec D2)
import { blockingStdio } from '../core/json-file.ts';
import { checkedTarget, writeJsonNoFollow } from '../core/temp-write.ts';
import { CLI_MISSING_EXIT_CODE, JSON_FILE_REFUSAL, LIST_UNREAD_NOTES, REFUSED_EXIT_CODE } from './constants.ts';
import { buildInventory, keptOf } from './inventory.ts';

export function runInventoryCommand(argv: string[]): number
{
    blockingStdio();
    const flagValue = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
    const project = flagValue('--project') || process.cwd();
    const named = flagValue('--json');
    // the pre-approved call writes only in the run's temp folder, as plan.ts does
    const outFile = named === undefined ? undefined : checkedTarget(named);
    if (outFile === null) { console.error(`alfred-tools: ${JSON_FILE_REFUSAL}`); return REFUSED_EXIT_CODE; }
    const inventory = buildInventory({ project, data: flagValue('--data') || null });
    if (!inventory.cli || !inventory.cli.ok)
    {
        console.error('alfred-tools: the claude CLI is not on PATH - install Claude Code, then run this again.');
        return CLI_MISSING_EXIT_CODE;
    }
    if (outFile) writeJsonNoFollow(outFile, keptOf(inventory));
    else console.log(JSON.stringify(keptOf(inventory), null, 2));
    for (const unreadable of inventory.unreadable)
        console.error(`alfred-tools: ${unreadable.file} is ${unreadable.state}${unreadable.error ? ` (${unreadable.error})` : ''} - ${unreadable.scope === 'inherited' ? "Claude Code skips that parent folder's servers too; nothing here writes to it." : LIST_UNREAD_NOTES.get(unreadable.scope) ?? `the ${unreadable.scope} scope is treated as unreadable and nothing will be written there.`}`);
    const own = inventory.registrations.filter((registration) => registration.own).length;
    console.log(`inventory: ${inventory.registrations.length} registrations (${inventory.registrations.length - own} match a catalog row, ${own} are your own), ${inventory.plugins.length} plugins${outFile ? ` -> ${outFile}` : ''}`);
    return 0;
}

