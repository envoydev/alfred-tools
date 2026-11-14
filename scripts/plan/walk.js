'use strict';
const path = require('node:path');
const { installedOf } = require('../inventory/inventory.js');
const roots = require('../roots/roots.js');
const { REC } = require('./asks-keys.js');
const { rootInUse } = require('./asks-picks.js');
const { scopeOrder } = require('./asks-tool.js');
const { STATIC } = require('./asks-other.js');
const { needsRoot } = require('./asks-roots.js');
const { all } = require('./asks-all.js');

// ---- the walk (spec F1) ---------------------------------------------------------------------------------------------

// configure's first question for a registration (spec F4): who looks after it. `root`: the folder its family's list
// would sit in. -> { question, answers: { <label as shown>: { key, choice } } }
function ownStep(item, root)
{
    const P = /^(?:[A-Za-z]:[\\/]|\\\\)/.test(String(root)) ? path.win32 : path.posix;
    const file = P.join(root, roots.FILES.list);
    const where = item.scope === 'project' ? '; in .mcp.json it sits with your own servers, after the managed ones' : '';
    const opts = [
        { label: `preferred-tools${REC}`, description: 'configure, update and fix look after it', choice: 'manage' },
        { label: 'Leave it on its own', description: `nothing in this plugin changes its entry again${where}; saved in ${file}`, choice: 'own' },
    ];
    return {
        question: { id: `own-${item.key}`, header: 'Looked after', multiSelect: false, question: `Who looks after ${item.name}?`, options: opts.map(({ label, description }) => ({ label, description })) },
        answers: Object.fromEntries(opts.map((o) => [o.label, { key: item.key, choice: o.choice }])),
    };
}

// The tools in the order the pick lists show them: catalog group order, then catalog order.
function pickOrder(catalog, ids)
{
    const rank = new Map();
    for (const g of catalog.groups) for (const r of catalog.tools.filter((x) => x.group === g.id)) rank.set(r.id, rank.size);
    return ids.filter((id) => rank.has(id)).sort((a, b) => rank.get(a) - rank.get(b));
}

// One step of the walk: the questions about one tool to ask now, or { id: 'done' } (spec F1). Install: `settings`, then
// per tool its route, `first` (scope and name, for a tool with a data folder), its whole call (a tool without one), the
// root of its family when this run has not answered it, its location and extras, its key name and settings. Configure:
// per target, who looks after it, then the same - a root target is its root question, a server left on its own its own
// question. A step with nothing to ask is passed over, but for one with a location to `set`. `picks`:
// install.md's and configure.md's picks.json - `done` the step ids answered, `walk` the settings answer, `tokens` the
// API key answers. `built`: the all() output, when the caller has it.
// -> { id, tool, call, answers, set? } | { id: 'done' }
function next(inv, picks, catalog, opts = {}, built = null)
{
    picks = picks || {};
    const b = built || all(inv, picks, catalog, opts);
    const done = new Set(picks.done || []);
    const tokens = picks.tokens || {};
    const steps = [];
    const add = (id, tool, questions, answers = {}, set = null) =>
    {
        const call = questions.filter(Boolean);
        const kept = Object.fromEntries(Object.entries(answers).filter(([qid]) => call.some((q) => q.id === qid)));
        if (call.length || set) steps.push({ id, tool, call, answers: kept, ...(set ? { set } : {}) });
    };
    const keyStep = (t) =>
    {
        const k = tokens[t] === false ? null : b.keyNames[t];
        const st = b.settings[t];
        const us = Object.values((b.urlNames || {})[t] || {});
        add(`${t}:keys`, t, [k && k.question, ...us.map((u) => u.question), st && st.question], { ...(k ? { [k.question.id]: k.answers } : {}), ...Object.fromEntries(us.map((u) => [u.question.id, u.answers])), ...(st ? { [st.question.id]: st.answers } : {}) });
    };
    const located = (t) => (t.first !== null && t.first !== undefined);
    const toolSteps = (t, id, rootStep) =>
    {
        add(`${id}:route`, id, [t.route]);
        if (located(t)) add(`${id}:first`, id, t.first);
        else add(`${id}:questions`, id, t.questions || []);
        if (rootStep) rootStep();
        if (located(t))
        {
            const loc = (t.questions || []).find((q) => q.id.startsWith('location-'));
            add(`${id}:questions`, id, t.questions || [], loc ? { [loc.id]: t.answers } : {}, t.only ? { location: t.only } : null);
        }
        keyStep(id);
    };

    if (picks.rows)
    {
        const rows = pickOrder(catalog, picks.rows);
        if (rows.length)
        {
            // which apps, first after the picks (spec D3)
            if (b.clients) add('clients', null, [b.clients.question], { clients: b.clients.answers });
            const one = rows.length === 1 ? STATIC.settingsOne(catalog.byId.get(rows[0]).label) : STATIC.settings;
            add('settings', null, [one], { settings: { [one.options[0].label]: 'recommended', [one.options[1].label]: 'each' } });
            if (picks.walk === 'recommended') return steps.find((s) => !done.has(s.id)) || { id: 'done' };
        }
        const asked = new Set(Object.keys(picks.roots || {}));
        for (const id of rows)
        {
            const row = catalog.byId.get(id);
            const t = b.tools[id];
            if (!t) continue;
            const routeId = (picks.routes || {})[id] || row.recommendedRoute;
            const rootStep = () =>
            {
                if (!needsRoot(row, routeId)) return;
                const scope = (picks.scopes || {})[id] || scopeOrder(row, inv, { route: routeId, ctx: null, copyOf: installedOf(inv, id) })[0];
                const family = roots.familyOf(scope);
                if (asked.has(family)) return;
                asked.add(family);
                const q = b.roots.questions.find((x) => x.id === `root-${family}`);
                if (q) add(`root:${family}`, id, [q], { [q.id]: b.roots.answers[q.id] });
            };
            toolSteps(t, id, rootStep);
        }
    }
    for (const key of picks.targets || [])
    {
        const t = b.targets[key];
        if (!t || t.error) continue;
        if (t.kind === 'root') { add(key, key, [t.root.question], { [t.root.question.id]: t.root.answers }); continue; }
        if (t.kind === 'own') { add(`${key}:own`, key, [t.own.question], { [t.own.question.id]: t.own.answers }); continue; }
        if (t.kind === 'mcp')
        {
            const family = roots.familyOf(t.current.scope);
            const root = rootInUse(inv, family, { home: opts.home, catalog });
            const fallback = roots.resolve(inv, picks.roots, { project: inv.project, platform: inv.os, home: opts.home || require('../core/account.js').homeDir(process.env), catalog }).roots[family];
            const o = ownStep({ key, name: t.current.name, scope: t.current.scope }, root ? root.path : fallback);
            add(`${key}:own`, key, [o.question], { [o.question.id]: o.answers });
            if ((picks.existing || {})[key] === 'own') continue;
        }
        toolSteps(t, key, null);
        if (t.clients) add(`${key}:clients`, key, [t.clients.question], { [t.clients.question.id]: t.clients.answers });
    }
    return steps.find((s) => !done.has(s.id)) || { id: 'done' };
}

module.exports = { ownStep, next };
