// @ts-nocheck - typed in Task 11
// The pick questions: which tools, in calls of at most four, and which apps.
import { installedOf, fromHere, otherWindowsMcp } from '../inventory/inventory.ts';
import * as roots from '../roots/roots.ts';
import { HEADER } from './asks-keys.ts';
import * as X from '../inventory/existing.ts';
import { homeDir } from '../core/account.ts';

export function chunk(list, n)
{
    const out = [];
    for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
    return out;
}

// Multi-select questions over items in catalog-group order ({ group, label, description }): a question per group, at
// most four options, a bigger group split evenly (5 is 3 + 2, never 4 + 1). AskUserQuestion takes 2 to 4 options, so a
// question left with one joins a neighbour that has room, else takes one from it, and a single item in all gets
// `none` beside it. -> calls of at most four questions.
export function packed(items, { id, question, none })
{
    const qs = [];
    for (const g of [...new Set(items.map((i) => i.group))])
    {
        const mine = items.filter((i) => i.group === g);
        const k = Math.ceil(mine.length / 4);
        for (let n = 0, at = 0; n < k; n++)
        {
            const size = Math.floor(mine.length / k) + (n < mine.length % k ? 1 : 0);
            qs.push(mine.slice(at, at + size));
            at += size;
        }
    }
    for (let i = 0; i < qs.length; i++)
    {
        if (qs[i].length !== 1) continue;
        const prev = qs[i - 1];
        const next = qs[i + 1];
        if (prev && prev.length < 4) { prev.push(...qs.splice(i, 1)[0]); i--; }
        else if (next && next.length < 4) { next.unshift(...qs.splice(i, 1)[0]); i--; }
        else if (prev) qs[i].unshift(prev.pop());
        else if (next) qs[i].push(next.shift());
    }
    const out = qs.map((part, n) =>
    {
        const one = part.every((p) => p.group === part[0].group) ? part[0].group : null;
        const options = part.map((p) => ({ label: p.label, description: p.description }));
        if (options.length === 1) options.push({ label: 'None of these', description: none });
        return {
            id: `${id}-${n}`, header: one ? HEADER[one.id] : 'Tools', multiSelect: true,
            question: one ? `${one.label}: ${question}` : `${question[0].toUpperCase()}${question.slice(1)}`, options,
        };
    });
    return chunk(out, 4);
}

// The install pick: the rows for this OS not installed in this project. A server installed only for every project (user
// scope, even where Global is its recommended scope - a hosted keyed route) or inherited from a parent folder's .mcp.json
// is offered too: picking it adds this project's own copy beside that one (the user's ruling, docs/build-prompt.md). A
// server installed here is configure's.
const offeredForInstall = (row, inv) =>
{
    const at = installedOf(inv, row.id).map((h) => h.scope);
    return !at.includes('local') && !at.includes('project');
};

// Who else provides a row here (spec F4): a claude.ai connector this session has loaded, or an enabled plugin's server.
// -> [{ owner, tag }]
export function alsoProvided(inv, rowId, connectors)
{
    const out = [];
    if ((connectors || []).some((n) => X.matchConnector(n) === rowId)) out.push({ owner: 'claude.ai', tag: 'also connected through claude.ai' });
    const enabled = new Set((inv.plugins || []).filter((p) => p.enabledHere ?? p.enabled).map((p) => p.id));
    const owners = (inv.pluginServers || []).filter((s) => s.rowId === rowId && enabled.has(s.plugin)).map((s) => s.plugin.split('@')[0]);
    for (const owner of new Set(owners)) out.push({ owner, tag: `also provided by the ${owner} plugin` });
    return out;
}

// `existing`: answers about servers already set up (spec D6). A row whose server was left on its own - answered or
// recorded - is not offered; one answered 'add' is, with the two servers named. `connectors`: the claude.ai connectors
// this session has loaded; a row one of them, or an enabled plugin, provides says so in its label (spec F4).
export function pickQuestions(inv, catalog, existing = {}, connectors = null)
{
    const rule = X.offerRule(inv, catalog, existing);
    const items = [];
    for (const g of catalog.groups)
        for (const row of catalog.tools.filter((r) => r.group === g.id && r.os.includes(inv.os) && offeredForInstall(r, inv) && !rule.own.has(r.id)))
        {
            const have = installedOf(inv, row.id);
            const inherited = have.filter((h) => h.scope === 'inherited');
            const user = have.filter((h) => h.scope === 'user');
            const tags = inherited.map((h) => `inherited from ${fromHere(inv, h.from)} as ${h.name}, ${h.approval}`);
            if (user.length) tags.push(row.kind === 'mcp' ? `installed for every project as ${user.map((h) => h.name).join(', ')}` : 'installed for every project');
            if (row.kind === 'mcp') tags.push(...alsoProvided(inv, row.id, connectors).map((a) => a.tag));
            const stays = [...(user.length ? ['the one for every project'] : []), ...inherited.map((h) => `the one inherited from ${fromHere(inv, h.from)}`)];
            const keep = `${stays.join(' and ')} ${stays.length > 1 ? 'stay' : 'stays'}${user.length ? '' : stays.length > 1 ? ' in their folders' : ' in its folder'}`;
            // windows-mcp 0.8.8 keeps one per desktop healthy; a copy under the row's own name replaces that one here
            const others = row.id === 'windows-control' ? otherWindowsMcp(inv, row.name) : [];
            const warn = `${others.length ? `; another windows-mcp already starts here (${others.join(', ')}) - keep one per desktop` : ''}${rule.add.has(row.id) ? `; ${X.twoServers(row.label, rule.add.get(row.id))}` : ''}`;
            items.push({ group: g, label: `${row.label}${tags.length ? ` (${tags.join('; ')})` : ''}`, description: `${have.length ? `adds this project's own copy; ${keep} - ${row.summary}` : row.summary}${warn}` });
        }
    return packed(items, { id: 'pick', question: 'which tools do you want to install?', none: 'install nothing' });
}

const leftAlone = (inv, h) => h.kind === 'mcp' && inv.registrations.some((r) => r.name === h.name && r.scope === h.scope && r.choice === 'own');

// Every catalog registration installed here, one item each (a row at two scopes is two), grouped. An
// inherited server is not here: it is changed by running the command in its own folder, and one left on its own is in
// its own group (changeQuestions).
export function installedItems(inv, catalog, describe)
{
    const items = [];
    for (const g of catalog.groups)
        for (const row of catalog.tools.filter((r) => r.group === g.id))
            for (const h of installedOf(inv, row.id).filter((x) => x.scope !== 'inherited' && !leftAlone(inv, x)))
                items.push({ group: g, row, h, label: `${h.name} (${row.label}, ${h.scope})`, description: describe(row, h) });
    return items;
}

// The root each family uses now (spec D2): the inventory's, else found from the registrations and the standard folders.
export function rootInUse(inv, family, ctx = {})
{
    if (inv.roots && Object.hasOwn(inv.roots, family)) return inv.roots[family] || null;
    return roots.inUse(inv, family, { project: inv.project, platform: inv.os, home: ctx.home || homeDir(process.env), exists: ctx.exists, catalog: ctx.catalog });
}

export const ROOT_LABEL = { project: 'Project root folder', global: 'Global root folder' };
export const ROOT_MOVES = { project: "this project's keys, key helper and tool data", global: 'the keys, key helper and tool data for every project' };

