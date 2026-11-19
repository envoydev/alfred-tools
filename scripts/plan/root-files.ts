// The roots a plan writes into and the file steps they need: each root's .gitignore, the helpers, the key names, the
// lists and the roots map.
import fs from 'node:fs';
import { isInside, pathFor } from '../entries/platform.ts';
import * as keys from '../keys/keys.ts';
import * as roots from '../roots/roots.ts';
import { ALFRED_DATA } from '../core/constants.ts';
import { listSteps } from './lists.ts';
import { rootIgnoreLines } from '../apply/file-steps.ts';
import type { Roots } from '../entries/types.ts';
import type { Inventory } from '../inventory/types.ts';
import type { Family } from '../roots/types.ts';
import type { EnsureKeyNameStep, ExcludeFileStep, ListCtx, PathStep, PlanOut, PlanStep, RecordRootStep, RootUses, RootWrite } from './types.ts';

// The roots a registration step writes into (spec D2-D4): its helper's - the scope's family root, with the bridge beside
// it for a bridge route - its key file's and its data folder's. Only a step that is planned uses a root, so a plan with no
// change writes no file. `keyNames` (a bridge's key and URL names) replaces the one `keyName` when given.
export function useRoots(context: { platform: string; roots?: Roots | null | undefined; uses: ListCtx['uses'] }, scope: string, { helper, bridge, serenaContext, exclude, keyFile, keyName, keyNames, data }: RootUses): void
{
    const pathApi = pathFor(context.platform);
    const rootOf = (family: Family): string | undefined => context.roots?.[family] || undefined;
    // the family whose root holds `filePath`, with that root
    const holder = (filePath: string | null | undefined): { family: Family; root: string } | null =>
    {
        for (const candidateFamily of roots.FAMILIES)
        {
            const root = rootOf(candidateFamily);
            if (root && filePath && isInside(pathApi, root, filePath, { orSame: true })) return { family: candidateFamily, root };
        }
        return null;
    };
    const family = roots.familyOf(scope);
    const root = rootOf(family);
    if (helper && root) context.uses.push({ family, root, helper: true, bridge: Boolean(bridge), committed: scope === 'project' });
    if (serenaContext && root) context.uses.push({ family, root, serenaContext, committed: scope === 'project' });
    if (exclude && root) context.uses.push({ family, root, exclude, committed: scope === 'project' });
    const keyHolder = holder(keyFile);
    // a key file comes with its key name (RootUses): one without it uses no root for a key
    if (keyHolder && keyFile && typeof keyName === 'string') context.uses.push({ ...keyHolder, key: { file: keyFile, name: keyName, names: keyNames || [keyName] } });
    const dataHolder = holder(data);
    if (dataHolder) context.uses.push(dataHolder);
}

// The file steps of the roots the plan writes into, in D8's order - each root's .gitignore, the helpers, the key names -
// and the lists (plan/lists.ts) and the roots map that go last. A root this apply creates gets its .gitignore (R13), never one named .alfred; a root that
// exists is asked of git, and with a gap gets no key file and a note naming the fix.
export function fileSteps(inventory: Inventory, context: ListCtx, out: Pick<PlanOut, 'notes'>, regSteps: PlanStep[] = []): { before: PlanStep[]; after: PlanStep[] }
{
    const pathApi = pathFor(context.platform);
    const exists = context.exists || ((filePath: string) => fs.existsSync(filePath));
    // first: a list's family root joins the roots this run writes into
    const lists = listSteps(inventory, context, out, regSteps);
    const byRoot = new Map<string, RootWrite>();
    for (const family of roots.FAMILIES)
        for (const rootUse of context.uses.filter((candidate) => candidate.family === family))
        {
            const rootWrite: RootWrite = byRoot.get(rootUse.root) || { family, root: rootUse.root, helper: false, bridge: false, serenaContext: new Set(), exclude: null, keys: new Map() };
            byRoot.set(rootUse.root, rootWrite);
            if (rootUse.helper) rootWrite.helper = true;
            if (rootUse.bridge) rootWrite.bridge = true;
            if (rootUse.serenaContext) rootWrite.serenaContext.add(rootUse.serenaContext);
            if (rootUse.exclude) rootWrite.exclude = rootUse.exclude;
            if (rootUse.committed) rootWrite.committed = true;
            if (rootUse.key) rootWrite.keys.set(rootUse.key.file, [...new Set([...(rootWrite.keys.get(rootUse.key.file) || []), ...(rootUse.key.names || [rootUse.key.name])])]);
        }
    const ignore: PathStep[] = [];
    const helpers: (PathStep | ExcludeFileStep)[] = [];
    const names: EnsureKeyNameStep[] = [];
    const records: RecordRootStep[] = [];
    const map = (inventory.roots && inventory.roots.map) || null;
    for (const rootWrite of byRoot.values())
    {
        const existed = exists(rootWrite.root);
        if (!existed && pathApi.basename(rootWrite.root) !== ALFRED_DATA)
            ignore.push({ op: 'root-ignore', path: rootWrite.root, why: `the new root ${rootWrite.root}: its .gitignore keeps the key file, the record and the data out of git` });
        // a key file git would commit gets no name; an ignored helper matters only to a project-scope server, whose
        // committed .mcp.json names it - the key file beside it is still ignored, so its names are written
        const gap = existed ? roots.ignoreGap(rootWrite.root, rootWrite.family, { writes: [...(rootWrite.bridge ? [roots.FILES.bridge] : []), ...(rootWrite.serenaContext.has(rootWrite.root) ? [roots.FILES.serenaContext] : []), ...(rootWrite.exclude ? [roots.FILES.macosExclude] : [])] }) : null;
        // a root of this plugin's own files whose .gitignore predates a line GITIGNORE has now (0.5.0: the bridge and
        // serena's context): rootIgnore appends only the lines it lacks
        if (existed && pathApi.basename(rootWrite.root) !== ALFRED_DATA)
        {
            const lines = rootIgnoreLines(rootWrite.root);
            if (lines.text !== null && lines.mine && lines.lack.length)
                ignore.push({ op: 'root-ignore', path: rootWrite.root, why: `${rootWrite.root}: its .gitignore gains ${lines.lack.join(', ')}` });
        }
        if (gap && gap.secrets) out.notes.push(`${rootWrite.root}: ${gap.reason} - no key file is written there; /alfred-tools:fix (root-ignore) covers it`);
        if (gap && gap.helper && rootWrite.committed)
            out.notes.push(`${rootWrite.root}: ${gap.reason} - ${gap.excluded ? `a .gitignore above excludes ${rootWrite.root}: remove that line (git check-ignore -v ${rootWrite.root} names it)` : '/alfred-tools:fix (root-ignore) covers it'}`);
        if (rootWrite.helper)
        {
            const { state } = roots.helperState(pathApi.join(rootWrite.root, roots.FILES.helper), exists);
            if (state === 'absent' || state === 'lower')
                helpers.push({ op: 'write-helper', path: rootWrite.root, why: `${rootWrite.root}: mcp-headers.js, which reads a hosted key from .mcps-secrets each time Claude Code connects` });
            else if (state === 'higher') out.notes.push(`mcp-headers.js in ${rootWrite.root} is newer than this plugin - update alfred-tools`);
            else if (state === 'edited') out.notes.push(`mcp-headers.js in ${rootWrite.root} changed since alfred-tools wrote it - left as it is; /alfred-tools:fix (helper-stale) rewrites it`);
        }
        if (rootWrite.bridge)
        {
            const { state } = roots.shippedState('bridge', pathApi.join(rootWrite.root, roots.FILES.bridge), exists);
            if (state === 'absent' || state === 'lower')
                helpers.push({ op: 'write-bridge', path: rootWrite.root, why: `${rootWrite.root}: mcp-bridge.js, which fills a hosted URL from .mcps-secrets each time the server starts` });
            else if (state === 'higher') out.notes.push(`mcp-bridge.js in ${rootWrite.root} is newer than this plugin - update alfred-tools`);
            else if (state === 'edited') out.notes.push(`mcp-bridge.js in ${rootWrite.root} changed since alfred-tools wrote it - left as it is; /alfred-tools:fix (helper-stale) rewrites it`);
        }
        for (const folder of rootWrite.serenaContext)
        {
            const { state } = roots.shippedState('serenaContext', pathApi.join(folder, roots.FILES.serenaContext), exists);
            if (state === 'absent' || state === 'lower')
                helpers.push({ op: 'write-serena-context', path: folder, why: `${folder}: serena-context.yml, the context serena runs with - code navigation only, in Claude Code and Cursor` });
            else if (state === 'higher') out.notes.push(`serena-context.yml in ${folder} is newer than this plugin - update alfred-tools`);
            else if (state === 'edited') out.notes.push(`serena-context.yml in ${folder} changed since alfred-tools wrote it - left as it is; /alfred-tools:fix (helper-stale) rewrites it`);
        }
        // macos-mcp's exclude file (D4): planned only while it is not there - one there is the user's to edit
        const excludeAt = pathApi.join(rootWrite.root, roots.FILES.macosExclude);
        if (rootWrite.exclude && !exists(excludeAt))
            helpers.push({ op: 'write-exclude-file', path: rootWrite.root, tools: rootWrite.exclude, why: `${rootWrite.root}: ${roots.FILES.macosExclude}, the tools macos-mcp leaves out (${rootWrite.exclude.join(', ')})` });
        if (!gap || !gap.secrets)
            for (const [file, want] of rootWrite.keys)
            {
                const have = new Set(exists(file) ? keys.namesIn(file) : []);
                const lack = want.filter((name) => !have.has(name));
                if (lack.length) names.push({ op: 'ensure-key-name', file, names: lack, why: `${file}: the key's name - names only, you fill in each value` });
            }
        const mapped = !map ? null : rootWrite.family === 'global' ? map.global : (Object.keys(map.projects || {}).length ? map.projects[roots.mapKey(context.project)] : null);
        if (mapped !== rootWrite.root)
            records.push({ op: 'record-root', family: rootWrite.family, project: context.project, root: rootWrite.root, why: `the ${rootWrite.family} root ${rootWrite.root}: written to the roots map, so the commands find it again` });
    }
    return { before: [...ignore, ...helpers, ...names], after: [...lists, ...records] };
}

