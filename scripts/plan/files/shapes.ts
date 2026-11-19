// The shape checks for the files plan.ts reads besides the inventory (inventory/table.ts checks that one): the picks
// file, the answers file and step.json. Each checks the top level the readers use without a fallback of their own.
import { isRecord, isTextList } from '../../core/shapes.ts';
import type { InvRegistration, PluginRow } from '../../inventory/types.ts';
import type { Answers, LocationAnswer, Picks, StepFile } from './types.ts';

const PICKS_LISTS = ['rows', 'targets', 'done', 'clients', 'skipped'];
const PICKS_MAPS = ['routes', 'scopes', 'names', 'roots', 'existing', 'tokens', 'recorded'];

// A picks file: an object whose lists, where present, hold names and whose maps, where present, are objects.
export const isPicksFile = (value: unknown): value is Picks => isRecord(value)
    && PICKS_LISTS.every((field) => value[field] === undefined || isTextList(value[field]))
    && PICKS_MAPS.every((field) => value[field] === undefined || isRecord(value[field]))
    && (value['walk'] === undefined || typeof value['walk'] === 'string');

// An answers file: an object whose `picks` and `change`, where present, map each id to null or an object whose `row` and
// `route`, where present, are strings (prereq.ts reads it the same way).
export function isAnswersFile(value: unknown): value is Answers
{
    const isPick = (pick: unknown): boolean => pick === null || (isRecord(pick) && [pick['row'], pick['route']].every((field) => field === undefined || typeof field === 'string'));
    const isPickMap = (map: unknown): boolean => map === undefined || (isRecord(map) && Object.values(map).every(isPick));
    return isRecord(value) && isPickMap(value['picks']) && isPickMap(value['change']);
}

export const isStepFile = (value: Record<string, unknown>): value is Record<string, unknown> & StepFile => typeof value['id'] === 'string' && isRecord(value['answers']);

// A location answer: a side, and a path where the side is one.
export const isLocationAnswer = (value: unknown): value is LocationAnswer => isRecord(value) && typeof value['side'] === 'string' && (value['path'] === undefined || typeof value['path'] === 'string');

// A configure target's item (inventory.ts targetOf): a registration, which has an entry, or a plugin row.
export const isRegistration = (item: InvRegistration | PluginRow): item is InvRegistration => 'entry' in item;
