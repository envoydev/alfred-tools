// @ts-nocheck - typed in Task 11
import { formatRoot, validWindowsSerenaHome, recommendedSide, otherPlace, serenaWindowsHome, serenaSpaceFree, alfredRoot, logicalRoot } from '../entries/locations.ts';
import * as roots from '../roots/roots.ts';
import { REC } from './asks-keys.ts';

// ---- the location question (spec D2) --------------------------------------------------------------------------------
// A tool's data folder is <root>/<name> in the root of its scope's family, so most picks ask nothing. A question is left
// only where a tool needs one: memory (the global root's one memory, or this project's own), serena on Windows when the
// root's path has a space, a tool with alfred-code 2.x data on disk, and configure ('The folder it uses now' first). A
// label names the place in words, fixed text, so the walk never reads a path out of it; the description gives the exact
// folder on this machine and what follows from it.
const SIDE_LABEL = {
    project: "The project root's folder",
    account: "The global root's folder",
    'alfred-data': '.alfred in this project',
    alfred: 'Carry over alfred-code 2.x data',
    keep: 'The folder it uses now',
};
const SIDE_TAIL = {
    project: "this project's own",
    account: 'one folder for every project on this machine',
    'alfred-data': 'kept out of git by alfred-code; deleting .alfred erases this data',
    alfred: "carries over the data alfred-code 2.x left there; the folder is alfred-code's, so deleting it erases this tool's data",
};
const MEMORY_TAIL = { project: "this project's own memory", account: 'one memory for every project on this machine' };
// serena's home holds its language servers (docs/build-prompt.md, the serena-windows-home row): a home per project
// downloads them once per project
const SERENA_PER_PROJECT = 'its language servers (about 327MB) download once per project';

// The folder a root lands in, as the description says it: absolute at every scope (F7).
function placeText(root, ctx)
{
    return formatRoot(root, 'local', ctx).value;
}

// The location question for a row with a data folder, at a known scope and registration name (the folder is named
// after it). `ctx.roots` holds the roots answered so far (roots.resolve); none - the recommended ones. -> { question (or
// null when one place is left), answers: { <label as shown>: <location entry> }, only: the one location left when no
// question is asked }.
export function locationQuestion(row, inv, { scope, name = null, current = null, copyOf = [], ctx })
{
    if (!ctx.roots) ctx = { ...ctx, roots: roots.resolve(inv, null, ctx).roots };
    const loc = row.locations;
    const folder = name || (current ? current.name : row.name);
    const serenaWin = Boolean(loc.windowsAbsolute && ctx.platform === 'win32');
    const winValid = (root) => !serenaWin || validWindowsSerenaHome(formatRoot(root, 'local', ctx).value);
    const natural = recommendedSide(row, scope, ctx);

    const places = [];
    const own = scope === 'user' ? null : { side: 'project', root: otherPlace(row, folder, 'project', ctx) };
    const shared = { side: 'account', root: otherPlace(row, folder, 'account', ctx) };
    // global scope: the global root; memory, or a pick whose recommended place is the global root: both roots
    if (scope === 'user') places.push(shared);
    else
    {
        places.push(own);
        if (loc.defaultSide === 'account' || natural === 'account') places.push(shared);
    }
    const usable = places.filter((p) => winValid(p.root));
    if (serenaWin && usable.length < places.length)
    {
        // a root with a space: the profile's .serena when it is space-free, else a space-free folder, or one typed next
        const profile = serenaWindowsHome(ctx);
        if (!profile.needsInput) usable.push({ side: 'default', root: profile.root, label: "Your profile's .serena", description: `${profile.root.path} - the root's path has a space, which serena's home cannot hold; one folder for every project on this machine` });
        else
        {
            const free = serenaSpaceFree(ctx);
            usable.push({ side: 'default', root: free, label: 'A space-free folder', answer: { side: 'path', path: free.path }, description: `${free.path} - the root's path and your profile path ${ctx.home} have a space, which serena's home cannot hold; one folder for every project on this machine` });
        }
    }
    const old = !current && !serenaWin ? alfredRoot(row, ctx) : null;
    if (old) usable.push({ side: 'alfred', root: old });

    // configure: the folder it uses now, when it can stay at this scope; a place that is the same folder is not repeated
    let keep = null;
    if (current && current.rootStr)
    {
        keep = { side: 'keep', root: logicalRoot(current.rootStr, ctx) };
    }
    const at = (p) => formatRoot(p.root, scope, ctx).value;
    const listed = keep ? [keep, ...usable.filter((p) => at(p) !== at(keep))] : usable;
    if (serenaWin && listed.some((p) => p.side === 'default')) listed.push({ side: 'path', label: 'Another space-free folder', description: 'an absolute folder without spaces, asked next' });

    const rec = keep ? 'keep' : natural;
    const first = listed.find((p) => p.side === rec) || listed[0];
    const order = [first, ...listed.filter((p) => p !== first)].filter(Boolean).slice(0, 4);
    const describe = (p) =>
    {
        if (p.description) return p.description;
        const text = placeText(p.root, ctx);
        if (p.side === 'keep') return text;
        const base = row.id === 'memory' && MEMORY_TAIL[p.side] ? MEMORY_TAIL[p.side] : SIDE_TAIL[p.side];
        const tail = row.id === 'serena' && p.side === 'project' ? `${base}; ${SERENA_PER_PROJECT}` : base;
        return `${text} - ${tail}`;
    };
    const options = order.map((p, i) => ({ label: `${p.label || SIDE_LABEL[p.side]}${i === 0 ? REC : ''}`, description: describe(p) }));
    const answers = Object.fromEntries(order.map((p, i) => [options[i].label, p]).filter(([, p]) => p.side !== 'path').map(([l, p]) => [l, p.answer || { side: p.side }]));
    // one place left: nothing to ask
    if (order.length < 2 && first && first.side !== 'path') return { question: null, answers: {}, only: first.answer || { side: first.side } };
    if (!order.length) return { question: null, answers: {}, only: null };
    return { question: { id: `location-${row.id}`, header: 'Location', multiSelect: false, question: `${row.label}: where does its data live?`, options }, answers, only: null };
}

