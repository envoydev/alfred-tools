// One pick's registration name and data folder: the name its `names` answer stands for, and the folder its location
// answer places the data in.
import { pathFor } from '../../entries/platform.ts';
import { recommendedSide, alfredNameProblem, logicalRoot, otherPlace, parseRoot, alfredRoot, defaultRoot, serenaSpaceFree, formatRoot, validWindowsSerenaHome } from '../../entries/locations.ts';
import { locationsOf } from '../../catalog/rows.ts';
import { ALFRED_DATA } from '../../core/constants.ts';
import { perProjectName } from '../asks-tool.ts';
import type { CatalogRow } from '../../catalog/types.ts';
import type { Current, Root } from '../../entries/types.ts';
import type { PickAnswer, PlanCtx } from '../types.ts';

export function resolveName(pick: PickAnswer, row: CatalogRow, current: Current | null, context: { project: string }): string
{
    const nameAnswer = pick.name === undefined ? 'keep' : pick.name;
    if (nameAnswer === 'keep') return current ? current.name : row.name;
    if (nameAnswer === 'prefixed') return perProjectName(row.name, context.project);
    return nameAnswer;
}

// A data folder is `<root>/<name>` in the root of the scope's family (spec D2): side 'project' - the project root,
// 'account' - the global root; 'default' is the recommended side (serena on Windows: its profile's .serena, or a
// space-free folder).
export function wantedRoot(row: CatalogRow, pick: PickAnswer, current: Current | null, name: string, scope: string, context: PlanCtx): { error: string; root?: undefined; existing?: undefined } | { root: Root; existing: boolean; error?: undefined }
{
    const locations = locationsOf(row);
    const serenaWin = locations.windowsAbsolute && context.platform === 'win32';
    let locationAnswer = pick.location || { side: current ? 'keep' : recommendedSide(row, scope, context) };
    if (locationAnswer.side === 'default' && !serenaWin) locationAnswer = { side: recommendedSide(row, scope, context) };
    // an .alfred project root holds alfred-code's own entries: a registration of this family is never given a name
    // that is one (a registration already under that name keeps it)
    const pathApi = pathFor(context.platform);
    if (scope !== 'user' && !(current && current.name === name) && context.roots && context.roots.project === pathApi.join(context.project, ALFRED_DATA))
    {
        const problem = alfredNameProblem(name, context);
        if (problem) return { error: problem };
    }
    let root: Root;
    let existing = false;
    if (locationAnswer.side === 'keep' && current && current.rootStr) root = logicalRoot(current.rootStr, context);
    else if (locationAnswer.side === 'project') root = otherPlace(row, name, 'project', context);
    else if (locationAnswer.side === 'account') root = otherPlace(row, name, 'account', context);
    else if (locationAnswer.side === 'path')
    {
        // a hand-written answer with no folder is refused, never read as a folder named 'undefined'
        if (locationAnswer.path === undefined) return { error: "a 'path' location names its folder: { \"side\": \"path\", \"path\": <folder> }" };
        root = parseRoot(locationAnswer.path, context);
    }
    else if (locationAnswer.side === 'alfred-data')
    {
        if (!context.alfredHere) return { error: 'alfred-code is not set up here (no .alfred/.gitignore) - pick another folder' };
        const problem = alfredNameProblem(name, context);
        if (problem) return { error: problem };
        root = { kind: 'project', rel: `${ALFRED_DATA}/${name}` };
    }
    else if (locationAnswer.side === 'alfred')
    {
        // only on the user's pick: the folder is alfred-code's, so deleting it erases this tool's data
        const old = alfredRoot(row, context);
        if (!old) return { error: "no alfred-code data folder for it on disk" };
        root = old;
        existing = true;
    }
    else
    {
        // the recommended place; defaultRoot names no folder already on disk, so it is ensured (tests/logic-findings.test.ts)
        const defaultPlace = defaultRoot(row, name, context);
        if (defaultPlace.root !== undefined) root = defaultPlace.root;
        // serena on Windows with a spaced profile: the space-free folder the question recommends in its place
        else if (!serenaWin) return { error: defaultPlace.needsInput };
        else root = serenaSpaceFree(context);
    }
    if (serenaWin)
    {
        const resolved = formatRoot(root, 'local', context);
        const text = resolved.value && resolved.value.replace(/\//g, '\\');
        if (!text || !validWindowsSerenaHome(text))
            return { error: `serena's home on Windows must be absolute, in backslashes and space-free (fix row serena-windows-home); '${text || locationAnswer.path}' is not` };
        return { root: { kind: 'abs', path: text }, existing };
    }
    return { root, existing };
}
