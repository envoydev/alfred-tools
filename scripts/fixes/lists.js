'use strict';
// The fixes for the list, <root>/mcps.json (spec D1, D9). A row of kind `file` names no `fix` function: its `steps`
// function plans list-write and the rest, which fix.js's file pass runs through apply.js as one plan.
//
// list-import: a managed registration with no entry in its family's list, or a 0.4.x preferred-tools.json, moves onto
// the list - each registration as read with clients claude, the record's own entries as they are, and the record moved
// aside as preferred-tools.json.0.4.bak. Install and configure do the same the first time they write a family
// (plan-lists.js), with the same importUnlisted.
const fs = require('node:fs');
const path = require('node:path');
const roots = require('../roots.js');
const lists = require('../mcps-list.js');
const planLists = require('../plan-lists.js');

const pathOf = (ctx) => (ctx.platform === 'win32' ? path.win32 : path.posix);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The family's roots as install would take them: the root in use, else the recommended one.
const rootsOf = (ctx) => roots.resolve(ctx.inv, null, { project: ctx.inv.project, home: ctx.home, platform: ctx.platform, catalog: ctx.catalog }).roots;

// -> [{ id, name: <list file>, scope: null, family, servers, record: <preferred-tools.json> | null, found }]
function listImportDetect(ctx)
{
    const P = pathOf(ctx);
    const r = rootsOf(ctx);
    const out = [];
    for (const family of ['project', 'global'])
    {
        const l = ctx.inv.lists && ctx.inv.lists[family];
        // a list or record this plugin cannot read, or one a newer plugin wrote, is left as it is
        if (l && l.note) continue;
        const servers = planLists.importUnlisted(ctx.inv, family, ctx.catalog, { roots: r });
        const file = l ? l.file : r[family] ? P.join(r[family], roots.FILES.list) : null;
        if (!file) continue;
        const beside = P.join(P.dirname(file), roots.FILES.record);
        const record = l && l.old ? l.old : fs.existsSync(beside) ? beside : null;
        if (!servers.length && !record) continue;
        const what = [servers.length ? `${plural(servers.length, 'managed server')} not in it (${servers.map((s) => s.name).join(', ')})` : null, record ? `${record} still holds the servers left on their own` : null].filter(Boolean);
        out.push({ id: 'list-import', name: file, scope: null, family, servers, record, found: `${file}: ${what.join('; ')}` });
    }
    return out;
}

// The plan for one family: its root's .gitignore when the root is new, the list-write (the servers as read, `after:
// null`, and the own entries the list and the record hold, as they are), the record moved aside, the roots map.
function listImportSteps(f, ctx)
{
    const P = pathOf(ctx);
    const root = P.dirname(f.name);
    const existed = fs.existsSync(root);
    const steps = [];
    if (!existed && P.basename(root) !== '.alfred')
        steps.push({ op: 'root-ignore', path: root, why: `the new root ${root}: its .gitignore keeps the key file, the list and the data out of git` });
    const read = lists.readList(f.name);
    const own = read && !read.state ? read.own : [];
    const old = f.record ? roots.ownOnly((lists.readOldRecord(f.record) || {}).servers) : [];
    const have = new Set(own.map(roots.recordKey));
    const keep = [...own, ...old.filter((e) => !have.has(roots.recordKey(e)))];
    steps.push({
        op: 'list-write', file: f.name, family: f.family,
        upserts: f.servers.map((server) => ({ server, after: null, cursorFile: null })), drops: [],
        own: f.record ? { entries: [], keep, live: null } : null,
        why: `${f.name}: the servers preferred-tools manages, as read, and the ones left on their own`,
    });
    if (f.record) steps.push({ op: 'retire-record', file: f.record, why: `${f.record}: the 0.4.x record - its entries are in ${f.name} now` });
    const map = (ctx.inv.roots && ctx.inv.roots.map) || null;
    const mapped = !map ? null : f.family === 'global' ? map.global : (map.projects || {})[roots.mapKey(ctx.inv.project)];
    if (mapped !== root) steps.push({ op: 'record-root', family: f.family, project: ctx.inv.project, root, why: `the ${f.family} root ${root}: written to the roots map, so the commands find it again` });
    return steps;
}

// read-guard (0.5.0): a root that holds the key file or mcp-remote's sign-in folder, and Claude Code's settings that do
// not deny an AI session's Read tool there (rulings 12 and 13). Both are checked by name only - fs.existsSync, never
// opened. One finding per settings file, naming every rule it lacks; its plan is one deny-read.
function readGuardDetect(ctx)
{
    const P = pathOf(ctx);
    const r = rootsOf(ctx);
    const seen = [...new Set([r.project, r.global].filter(Boolean))];
    const why = [];
    const want = [];
    const has = (name) => seen.find((root) => fs.existsSync(P.join(root, name)));
    const secrets = has(roots.FILES.secrets);
    if (secrets) { want.push(roots.READ_GUARD.secrets); why.push(`${P.join(secrets, roots.FILES.secrets)}`); }
    const signIns = has(roots.FILES.signIns);
    if (signIns) { want.push(roots.READ_GUARD.signIns); why.push(`${P.join(signIns, roots.FILES.signIns)}/`); }
    if (!want.length) return [];
    const g = planLists.readGuardOf(ctx, want);
    if (g.bad) return [{ id: 'read-guard', name: g.file, scope: null, rules: want, found: `${g.file}: not a settings object preferred-tools can read`, blocked: `add ${want.join(' and ')} to permissions.deny yourself` }];
    if (!g.rules.length) return [];
    return [{ id: 'read-guard', name: g.file, scope: null, rules: g.rules, found: `${g.file} does not deny ${g.rules.join(' or ')} - an AI session's Read tool can open ${why.join(' and ')}` }];
}

const readGuardSteps = (f) => [planLists.denyReadStep(f.name, f.rules)];

module.exports = { listImportDetect, listImportSteps, readGuardDetect, readGuardSteps };
