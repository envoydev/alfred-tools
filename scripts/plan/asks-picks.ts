// The pick questions: which tools, in calls of at most four, and which apps.
import { installedOf, fromHere, otherWindowsMcp } from '../inventory/inventory.ts';
import * as roots from '../roots/roots.ts';
import { HEADER, capitalized } from './asks-keys.ts';
import * as existingServers from '../inventory/existing.ts';
import { MAX_OPTIONS, MAX_QUESTIONS } from './constants.ts';
import { homeDir } from '../core/account.ts';
import type { Catalog, CatalogRow } from '../catalog/types.ts';
import type { Family, InUse } from '../roots/types.ts';
import type { Installed, Inventory } from '../inventory/types.ts';
import type { AskCtx, PickItem, Question } from './types.ts';

export function chunk<Item>(list: Item[], size: number): Item[][]
{
    const out: Item[][] = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
}

// Multi-select questions over items in catalog-group order ({ group, label, description }): a question per group, at
// most four options, a bigger group split evenly (5 is 3 + 2, never 4 + 1). AskUserQuestion takes 2 to 4 options, so a
// question left with one joins a neighbour that has room, else takes one from it, and a single item in all gets
// `none` beside it. -> calls of at most four questions.
export function packed(items: PickItem[], { id, question, none }: { id: string; question: string; none: string }): Question[][]
{
    const parts: PickItem[][] = [];
    for (const group of [...new Set(items.map((item) => item.group))])
    {
        const mine = items.filter((item) => item.group === group);
        const partCount = Math.ceil(mine.length / MAX_OPTIONS);
        for (let partIndex = 0, at = 0; partIndex < partCount; partIndex++)
        {
            const size = Math.floor(mine.length / partCount) + (partIndex < mine.length % partCount ? 1 : 0);
            parts.push(mine.slice(at, at + size));
            at += size;
        }
    }
    for (let i = 0; i < parts.length; i++)
    {
        if (parts[i]!.length !== 1) continue;
        const previous = parts[i - 1];
        const next = parts[i + 1];
        if (previous && previous.length < MAX_OPTIONS) { previous.push(...parts.splice(i, 1)[0]!); i--; }
        else if (next && next.length < MAX_OPTIONS) { next.unshift(...parts.splice(i, 1)[0]!); i--; }
        else if (previous) parts[i]!.unshift(previous.pop()!);
        else if (next) parts[i]!.push(next.shift()!);
    }
    const out = parts.map((part, partIndex): Question =>
    {
        const one = part.every((item) => item.group === part[0]!.group) ? part[0]!.group : null;
        const options = part.map((item) => ({ label: item.label, description: item.description }));
        if (options.length === 1) options.push({ label: 'None of these', description: none });
        return {
            id: `${id}-${partIndex}`, header: one ? HEADER[one.id]! : 'Tools', multiSelect: true,
            question: one ? `${one.label}: ${question}` : capitalized(question), options,
        };
    });
    return chunk(out, MAX_QUESTIONS);
}

// The install pick: the rows for this OS not installed in this project. A server installed only for every project (user
// scope, though Project is what install recommends) or inherited from a parent folder's .mcp.json
// is offered too: picking it adds this project's own copy beside that one (the user's ruling, docs/build-prompt.md). A
// server installed here is configure's.
const offeredForInstall = (row: CatalogRow, inventory: Inventory) =>
{
    const at = installedOf(inventory, row.id).map((installed) => installed.scope);
    return !at.includes('local') && !at.includes('project');
};

// Who else provides a row here (spec F4): a claude.ai connector this session has loaded, or an enabled plugin's server.
// -> [{ owner, tag }]
export function alsoProvided(inventory: Inventory, rowId: string, connectors: string[] | null | undefined): { owner: string; tag: string }[]
{
    const out: { owner: string; tag: string }[] = [];
    if ((connectors || []).some((connector) => existingServers.matchConnector(connector) === rowId)) out.push({ owner: 'claude.ai', tag: 'also connected through claude.ai' });
    const enabled = new Set((inventory.plugins || []).filter((plugin) => plugin.enabledHere ?? plugin.enabled).map((plugin) => plugin.id));
    const owners = (inventory.pluginServers || []).filter((server) => server.rowId === rowId && enabled.has(server.plugin)).map((server) => server.plugin.split('@')[0]!);
    for (const owner of new Set(owners)) out.push({ owner, tag: `also provided by the ${owner} plugin` });
    return out;
}

// `existing`: answers about servers already set up (spec D6). A row whose server was left on its own - answered or
// recorded - is not offered; one answered 'add' is, with the two servers named. `connectors`: the claude.ai connectors
// this session has loaded; a row one of them, or an enabled plugin, provides says so in its label (spec F4).
export function pickQuestions(inventory: Inventory, catalog: Catalog, existing: Record<string, string> | null | undefined = {}, connectors: string[] | null = null): Question[][]
{
    const rule = existingServers.offerRule(inventory, catalog, existing);
    const items: PickItem[] = [];
    for (const group of catalog.groups)
        for (const row of catalog.tools.filter((toolRow) => toolRow.group === group.id && toolRow.os.includes(inventory.os) && offeredForInstall(toolRow, inventory) && !rule.own.has(toolRow.id)))
        {
            const have = installedOf(inventory, row.id);
            const inherited = have.filter((installed) => installed.scope === 'inherited');
            const user = have.filter((installed) => installed.scope === 'user');
            const tags = inherited.map((installed) => `inherited from ${fromHere(inventory, installed.from!)} as ${installed.name}, ${installed.approval}`);
            if (user.length) tags.push(row.kind === 'mcp' ? `installed for every project as ${user.map((installed) => installed.name).join(', ')}` : 'installed for every project');
            if (row.kind === 'mcp') tags.push(...alsoProvided(inventory, row.id, connectors).map((provider) => provider.tag));
            const stays = [...(user.length ? ['the one for every project'] : []), ...inherited.map((installed) => `the one inherited from ${fromHere(inventory, installed.from!)}`)];
            const keep = `${stays.join(' and ')} ${stays.length > 1 ? 'stay' : 'stays'}${user.length ? '' : stays.length > 1 ? ' in their folders' : ' in its folder'}`;
            // windows-mcp 0.8.8 keeps one per desktop healthy; a copy under the row's own name replaces that one here
            const others = row.id === 'windows-control' ? otherWindowsMcp(inventory, row.name) : [];
            const warn = `${others.length ? `; another windows-mcp already starts here (${others.join(', ')}) - keep one per desktop` : ''}${rule.add.has(row.id) ? `; ${existingServers.twoServers(row.label, rule.add.get(row.id)!)}` : ''}`;
            items.push({ group: group, label: `${row.label}${tags.length ? ` (${tags.join('; ')})` : ''}`, description: `${have.length ? `adds this project's own copy; ${keep} - ${row.summary}` : row.summary}${warn}` });
        }
    return packed(items, { id: 'pick', question: 'which tools do you want to install?', none: 'install nothing' });
}

const leftAlone = (inventory: Inventory, installed: Installed) => installed.kind === 'mcp' && inventory.registrations.some((registration) => registration.name === installed.name && registration.scope === installed.scope && registration.choice === 'own');

// Every catalog registration installed here, one item each (a row at two scopes is two), grouped. An
// inherited server is not here: it is changed by running the command in its own folder, and one left on its own is in
// its own group (changeQuestions).
export function installedItems(inventory: Inventory, catalog: Catalog, describe: (row: CatalogRow, installed: Installed) => string): PickItem[]
{
    const items: PickItem[] = [];
    for (const group of catalog.groups)
        for (const row of catalog.tools.filter((toolRow) => toolRow.group === group.id))
            for (const installed of installedOf(inventory, row.id).filter((candidate) => candidate.scope !== 'inherited' && !leftAlone(inventory, candidate)))
                items.push({ group: group, row, target: installed, label: `${installed.name} (${row.label}, ${installed.scope})`, description: describe(row, installed) });
    return items;
}

// The root each family uses now (spec D2): the inventory's, else found from the registrations and the standard folders.
export function rootInUse(inventory: Inventory, family: Family, context: Partial<AskCtx> = {}): InUse | null
{
    if (inventory.roots && Object.hasOwn(inventory.roots, family)) return inventory.roots[family] || null;
    return roots.inUse(inventory, family, { project: inventory.project, platform: inventory.os, home: context.home || homeDir(process.env), exists: context.exists, catalog: context.catalog });
}

export const ROOT_LABEL: Record<string, string> = { project: 'Project root folder', global: 'Global root folder' };
export const ROOT_MOVES: Record<string, string> = { project: "this project's keys, key helper and tool data", global: 'the keys, key helper and tool data for every project' };

