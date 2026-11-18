// What --questions prints, and what --record and --rewind rebuild the step from: one function, so the three agree.
import * as catalogLib from '../catalog/catalog.ts';
import * as account from '../core/account.ts';
import * as roots from '../roots/roots.ts';
import * as existing from '../inventory/existing.ts';
import { allQuestions } from './asks-all.ts';
import { waitsFor } from './plan.ts';
import { nextQuestion } from './walk.ts';
import type { Inventory } from '../inventory/types.ts';
import type { Picks, WalkFlags, WalkOutput, WalkStopped } from './types.ts';

// -> the questions and the walk's next step for these picks, or the line that stops the walk (a folder under the former
// name waits to move: nothing is asked before update moves it, spec D3). The roots map is read fresh from the plugin's
// data folder when one is given (`inventory` is changed to carry it).
export function walkOutput(inventory: Inventory, picks: Picks | null, flags: WalkFlags): WalkOutput | WalkStopped
{
    if (flags.data !== null) inventory.roots = { ...(inventory.roots || {}), map: roots.readMap(flags.data) };
    const home = account.homeDir(process.env);
    const waits = waitsFor({ project: inventory.project, home, platform: inventory.os || process.platform }, inventory.registrations || []);
    if (waits) return { waits };
    const catalog = catalogLib.load();
    // --connectors: the claude.ai connectors this session has loaded, named in the pick list (spec F4)
    const options = { env: process.env, home, connectors: flags.connectors !== null ? existing.parseConnectors(flags.connectors) : null };
    const built = allQuestions(inventory, picks, catalog, options);
    return { ...built, next: nextQuestion(inventory, picks, catalog, options, built) };
}
