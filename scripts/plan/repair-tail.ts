// @ts-nocheck - typed in Task 11
// A repair's tail (spec D1, D9): the list and Cursor steps after a fix or an update rewrote registrations.
import fs from 'node:fs';
import { pathFor } from '../entries/platform.ts';
import { signInParts } from '../entries/sign-in.ts';
import * as catalogLib from '../catalog/catalog.ts';
import * as roots from '../roots/roots.ts';
import * as keys from '../keys/keys.ts';
import * as lists from '../mcps-list/mcps-list.ts';
import * as cursorMcp from '../cursor/cursor-mcp.ts';
import { deepEqual } from '../core/json-file.ts';
import { REG_OPS, listSteps } from './lists.ts';
import { cursorSteps, SCOPES, heldCopies, keepOf } from './cursor-steps.ts';

// ---- a repair's tail (spec D1, D9) -------------------------------------------------------------------------------------

// What a fix or an update writes after its registration steps: each list the steps' servers sit in, from the
// registrations as read back, and Cursor's files from those lists - a copy Cursor lacks or one changed by hand left out
// and named. Only lists that exist are written: a family with none waits for list-import. `refresh`: [{ name, scope }]
// whose Cursor copy is refilled from .mcps-secrets at apply with no list change (token-sync). Notes go to ctx.notes.
// -> [step]
export function repairTail(inv, ctx, regSteps, { refresh = [] } = {})
{
    const catalog = ctx.catalog || catalogLib.load();
    const notes = ctx.notes || [];
    const usable = (fam) => { const l = inv.lists && inv.lists[fam]; return l && !l.note && !l.old ? l : null; };
    // a two-form entry keeps two forms: apply builds Cursor's bridge again from the entry as read, its pin kept
    const formFor = new Map();
    for (const s of regSteps.filter((x) => REG_OPS.includes(x.op)))
    {
        const key = lists.regKey(s);
        const l = usable(roots.familyOf(s.op === 'mcp-move' ? s.to.scope : s.scope));
        const prior = l ? (l.servers || []).find((x) => lists.serverKey(x) === key) : null;
        if (prior && prior.cursorEntry) formFor.set(key, 'two');
    }
    const tctx = { platform: ctx.platform, project: ctx.project || inv.project, home: ctx.home, env: ctx.env || {}, catalog, roots: null, uses: [], formFor, exists: ctx.exists };
    const out = { steps: [], notes, errors: [] };
    const listW = listSteps(inv, tctx, out, regSteps);
    // the key's name, from the key files of the roots in use
    const r = { project: inv.roots && inv.roots.project ? inv.roots.project.path : null, global: inv.roots && inv.roots.global ? inv.roots.global.path : null };
    for (const w of listW)
        for (const u of w.upserts || [])
            if (!u.keyFiles)
            {
                const files = keys.stdioChain({ scope: u.server.scope, projectRoot: r.project, globalRoot: r.global });
                if (files.length) u.keyFiles = files;
            }
    out.steps = [...regSteps, ...listW];
    const cursor = cursorSteps(inv, tctx, out, {});
    for (const e of out.errors) notes.push(`${e} - Cursor's file is left; run /preferred-tools:configure`);
    const blocked = new Set(out.errors.length ? cursor.map((x) => x.file) : []);
    const written = cursor.filter((x) => !blocked.has(x.file));
    // a Cursor copy refilled from .mcps-secrets with the list as it is
    for (const fam of [...new Set(refresh.map((x) => roots.familyOf(x.scope)))])
    {
        const l = usable(fam);
        const file = cursorMcp.fileFor(fam, tctx);
        if (!l || written.some((x) => x.file === file)) continue;
        const why = cursorMcp.refusal(cursorMcp.readCursor(file));
        if (why) { notes.push(`Cursor: ${file} ${why} - not written`); continue; }
        const scopes = SCOPES[fam];
        const before = cursorMcp.managedSet([{ file: l.file, scopes, servers: l.servers || [] }]);
        const hold = heldCopies(file, before, before, tctx, out);
        written.push({ op: 'cursor-write', file, family: fam, lists: [{ file: l.file, scopes }], before: [...before.keys()], skip: hold, replace: [], reapprove: refresh.filter((x) => roots.familyOf(x.scope) === fam && !hold.includes(x.name)).map((x) => x.name), why: `${file}: the key refilled from .mcps-secrets` });
    }
    return [...listW, ...written];
}

// What changed outside preferred-tools (spec D1): each list entry whose Claude registration differs after kept.keep,
// then each the list names that Claude Code no longer has. Install, configure and update print these first; only fix
// changes either. -> [line]
export function changedOutside(inv, catalog = catalogLib.load())
{
    const changed = [];
    const missing = [];
    for (const family of ['project', 'global'])
    {
        const l = inv.lists && inv.lists[family];
        if (!l || l.note || l.old) continue;
        for (const s of l.servers || [])
        {
            if (!(s.clients || ['claude']).includes('claude')) continue;
            const reg = (inv.registrations || []).find((x) => x.name === s.name && x.scope === s.scope);
            if (!reg) missing.push(`${s.name} is on the list but not in Claude Code - run /preferred-tools:fix`);
            else if (!deepEqual(keepOf(catalog, reg.entry, s.row), s.entry)) changed.push(`${s.name} was changed outside preferred-tools`);
        }
    }
    return [...changed, ...missing];
}

// The read guard (ruling 13): one deny-read for the plan, with the sign-in rule when it writes the shared sign-in form
// and the key-file rule when it writes a key name - each only when Claude Code's settings file lacks it. A settings file
// that is not a JSON object is a note: the rest of the plan is still written. -> [deny-read step]
// The settings file the deny rules go in, and which of `want` it lacks: { file, rules } | { file, bad: true }. Shared by
// install and configure (denyReadSteps) and fix's read-guard row. Claude Code's own settings: CLAUDE_CONFIG_DIR, else
// ~/.claude - from ctx.home, so a test never reads the real one.
export function readGuardOf(ctx, want)
{
    const P = pathFor(ctx.platform);
    const env = ctx.env || {};
    const file = env.CLAUDE_CONFIG_DIR ? P.resolve(env.CLAUDE_CONFIG_DIR, 'settings.json') : P.join(ctx.home, '.claude', 'settings.json');
    let text = null;
    try { text = fs.readFileSync(file, 'utf8'); } catch { /* absent: {} */ }
    let deny = [];
    if (text !== null)
    {
        let doc = null;
        try { doc = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { /* below */ }
        const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
        if (!isObject(doc) || (doc.permissions !== undefined && !isObject(doc.permissions)) || (doc.permissions && doc.permissions.deny !== undefined && !Array.isArray(doc.permissions.deny))) return { file, bad: true };
        deny = (doc.permissions && doc.permissions.deny) || [];
    }
    return { file, rules: want.filter((r) => !deny.includes(r)) };
}

// The deny-read step as one plan line - or none when the file has every rule.
export function denyReadStep(file, rules)
{
    return { op: 'deny-read', file, rules, why: `${file}: keeps an AI session's Read tool out of ${rules.map((r) => (r === roots.READ_GUARD.signIns ? 'the sign-in tokens' : 'the key file')).join(' and ')}` };
}

export function denyReadSteps(steps, ctx, out)
{
    const want = [
        steps.some((x) => ['mcp-add', 'mcp-replace', 'mcp-move'].includes(x.op) && signInParts(x.entry)) && roots.READ_GUARD.signIns,
        steps.some((x) => x.op === 'ensure-key-name') && roots.READ_GUARD.secrets,
    ].filter(Boolean);
    if (!want.length) return [];
    const g = readGuardOf(ctx, want);
    if (g.bad)
    {
        out.notes.push(`${g.file} is not a settings object preferred-tools can read - add ${want.join(' and ')} to permissions.deny yourself`);
        return [];
    }
    return g.rules.length ? [denyReadStep(g.file, g.rules)] : [];
}

// The plan line of a list-write, retire-record, cursor-write or deny-read step.
export function renderLine(s)
{
    if (s.op === 'deny-read') return `   adds ${s.rules.join(' and ')} to permissions.deny in ${s.file}  (keeps AI sessions out of the sign-in tokens and the key file)`;
    if (s.op === 'cursor-write') return [`   writes ${s.file}  (Cursor: the servers set up for it; your own entries kept)`, ...(s.replace || []).map((n) => `   replaces your own ${n} in ${s.file}`)].join('\n');
    if (s.op === 'retire-record') return `   moves ${s.file} aside as ${roots.FILES.record}.0.4.bak  (its entries are in mcps.json now)`;
    return s.empty ? `   removes ${s.file}  (no server is listed)` : `   writes ${s.file}  (the servers preferred-tools manages, and the ones left on their own)`;
}

