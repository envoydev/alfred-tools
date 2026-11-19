import { formatRoot, validWindowsSerenaHome, recommendedSide, otherPlace, serenaWindowsHome, serenaSpaceFree, alfredRoot, logicalRoot } from '../entries/locations.ts';
import * as roots from '../roots/roots.ts';
import { locationsOf } from '../catalog/rows.ts';
import { RECOMMENDED_SUFFIX } from './asks-keys.ts';
import { PREFIX } from './record-constants.ts';
import { MAX_OPTIONS } from './constants.ts';
import type { CatalogRow } from '../catalog/types.ts';
import type { Root } from '../entries/types.ts';
import type { Inventory } from '../inventory/types.ts';
import type { AskCtx, LocationAnswer, Place, Question, ToolOpts } from './types.ts';

// ---- the location question (spec D2) --------------------------------------------------------------------------------
// A tool's data folder is <root>/<name> in the root of its scope's family, so most picks ask nothing. A question is left
// only where a tool needs one: memory (the global root's one memory, or this project's own), serena on Windows when the
// root's path has a space, a tool with alfred-code 2.x data on disk, and configure ('The folder it uses now' first). A
// label names the place in words, fixed text, so the walk never reads a path out of it; the description gives the exact
// folder on this machine and what follows from it.
const SIDE_LABEL: Record<string, string> = {
    project: "The project root's folder",
    account: "The global root's folder",
    'alfred-data': '.alfred in this project',
    alfred: 'Carry over alfred-code 2.x data',
    keep: 'The folder it uses now',
};
const SIDE_TAIL: Record<string, string> = {
    project: "this project's own",
    account: 'one folder for every project on this machine',
    'alfred-data': 'kept out of git by alfred-code; deleting .alfred erases this data',
    alfred: "carries over the data alfred-code 2.x left there; the folder is alfred-code's, so deleting it erases this tool's data",
};
const MEMORY_TAIL: Record<string, string> = { project: "this project's own memory", account: 'one memory for every project on this machine' };
// serena's home holds its language servers (docs/build-prompt.md, the serena-windows-home row): a home per project
// downloads them once per project
const SERENA_PER_PROJECT = 'its language servers (about 327MB) download once per project';

// The folder a root lands in, as the description says it: absolute at every scope (F7).
function placeText(root: Root, context: AskCtx): string
{
    return formatRoot(root, 'local', context).value;
}

// The location question for a row with a data folder, at a known scope and registration name (the folder is named
// after it). `context.roots` holds the roots answered so far (roots.resolveRoots); none - the recommended ones. -> { question (or
// null when one place is left), answers: { <label as shown>: <location entry> }, only: the one location left when no
// question is asked }.
export function locationQuestion(row: CatalogRow, inventory: Inventory, { scope, name = null, current = null, copyOf: _copyOf = [], context: context }: ToolOpts & { scope: string; context: AskCtx }): { question: Question | null; answers: Record<string, LocationAnswer>; only: LocationAnswer | null }
{
    if (!context.roots) context = { ...context, roots: roots.resolveRoots(inventory, null, context).roots };
    const locations = locationsOf(row);
    const folder = name || (current ? current.name : row.name);
    if (folder === undefined) throw new Error(`${row.id}: a registration to configure is read with its name`);
    const serenaWin = Boolean(locations.windowsAbsolute && context.platform === 'win32');
    const winValid = (root: Root) => !serenaWin || validWindowsSerenaHome(formatRoot(root, 'local', context).value);
    const natural = recommendedSide(row, scope, context);

    const places: Place[] = [];
    const own: Place | null = scope === 'user' ? null : { side: 'project', root: otherPlace(row, folder, 'project', context) };
    const shared: Place = { side: 'account', root: otherPlace(row, folder, 'account', context) };
    // global scope: the global root; memory, or a pick whose recommended place is the global root: both roots
    if (own === null) places.push(shared);
    else
    {
        places.push(own);
        if (locations.defaultSide === 'account' || natural === 'account') places.push(shared);
    }
    // every place but 'Another space-free folder' (side `path`, typed next) names its folder
    const folderOf = (place: Place): Root =>
    {
        if (!place.root) throw new Error(`${row.id}: the place '${place.side}' names no folder`);
        return place.root;
    };
    const usable = places.filter((place) => winValid(folderOf(place)));
    if (serenaWin && usable.length < places.length)
    {
        // a root with a space: the profile's .serena when it is space-free, else a space-free folder, or one typed next
        const profile = serenaWindowsHome(context);
        if (profile.root !== undefined) usable.push({ side: 'default', root: profile.root, label: "Your profile's .serena", description: `${profile.root.path} - the root's path has a space, which serena's home cannot hold; one folder for every project on this machine` });
        else
        {
            const free = serenaSpaceFree(context);
            usable.push({ side: 'default', root: free, label: 'A space-free folder', answer: { side: 'path', path: free.path }, description: `${free.path} - the root's path and your profile path ${context.home} have a space, which serena's home cannot hold; one folder for every project on this machine` });
        }
    }
    const old = !current && !serenaWin ? alfredRoot(row, context) : null;
    if (old) usable.push({ side: 'alfred', root: old });

    // configure: the folder it uses now, when it can stay at this scope; a place that is the same folder is not repeated
    let keep: Place | null = null;
    if (current && current.rootStr)
    {
        keep = { side: 'keep', root: logicalRoot(current.rootStr, context) };
    }
    const at = (place: Place) => formatRoot(folderOf(place), scope, context).value;
    const kept = keep;
    const listed = kept ? [kept, ...usable.filter((place) => at(place) !== at(kept))] : usable;
    if (serenaWin && listed.some((place) => place.side === 'default')) listed.push({ side: 'path', label: 'Another space-free folder', description: 'an absolute folder without spaces, asked next' });

    const recommendedPlace = keep ? 'keep' : natural;
    const first = listed.find((place) => place.side === recommendedPlace) || listed[0];
    const order = [first, ...listed.filter((place) => place !== first)].filter((place): place is Place => place !== undefined).slice(0, MAX_OPTIONS);
    const describe = (place: Place) =>
    {
        if (place.description) return place.description;
        const text = placeText(folderOf(place), context);
        if (place.side === 'keep') return text;
        const base = row.id === 'memory' && MEMORY_TAIL[place.side] ? MEMORY_TAIL[place.side] : SIDE_TAIL[place.side];
        const tail = row.id === 'serena' && place.side === 'project' ? `${base}; ${SERENA_PER_PROJECT}` : base;
        return `${text} - ${tail}`;
    };
    const labelled = order.map((place, i) => ({ place, label: `${place.label || SIDE_LABEL[place.side]}${i === 0 ? RECOMMENDED_SUFFIX : ''}`, description: describe(place) }));
    const options = labelled.map(({ label, description }) => ({ label, description }));
    const answers = Object.fromEntries(labelled.filter(({ place }) => place.side !== 'path').map(({ label, place }) => [label, place.answer || { side: place.side }]));
    // one place left: nothing to ask
    if (order.length < 2 && first && first.side !== 'path') return { question: null, answers: {}, only: first.answer || { side: first.side } };
    if (!order.length) return { question: null, answers: {}, only: null };
    return { question: { id: `${PREFIX.location}${row.id}`, header: 'Location', multiSelect: false, question: `${row.label}: where does its data live?`, options }, answers, only: null };
}

