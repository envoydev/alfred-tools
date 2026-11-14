// @ts-nocheck - typed in Task 11
// The CLI steps of an apply: quoting, the calls through the claude CLI, and a key taken back for a replace or a move.
import * as account from '../core/account.ts';
import { deepEqual } from '../plan/plan.ts';
import * as kept from '../core/kept.ts';
import * as keys from '../keys/keys.ts';

const quote = (s) => (/^[A-Za-z0-9_\-./:=@,+]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`);
export const restoreLine = (name, scope, entry) => `claude mcp add-json ${quote(name)} ${quote(JSON.stringify(entry))} -s ${scope}`;
// the line that puts a registration back by hand, its credential values as the marker
export function restoreBy(ctx, step, name, scope, entry)
{
    const k = kept.keep(entry, rowOf(ctx, step));
    return `${restoreLine(name, scope, k)}${kept.holdsKept(k) ? ` - put the real value back in place of ${kept.MARKER}` : ''}`;
}
export const rowOf = (ctx, step) => (step.row ? ctx.catalog.byId.get(step.row) || null : null);

export const readRegistration = account.readRegistration;

export function makeRunner({ project, env, runCli })
{
    return (argv) =>
    {
        const r = runCli(argv, { cwd: project, env });
        return { ok: !r.error && r.status === 0, out: `${r.stdout}${r.stderr}`.trim().split('\n').slice(-3).join(' | '), r };
    };
}

// The CLI's own output can echo the JSON it was given, so a failure's text shows each credential value the entry holds -
// a value put back from the registration, a key written in - as the marker, raw and JSON-escaped alike.
function masked(text, entry, row)
{
    const values = [];
    const walk = (node, k) =>
    {
        if (typeof node === 'string') { if (node !== k && node) values.push(node, JSON.stringify(node).slice(1, -1)); return; }
        if (node && typeof node === 'object') for (const key of Object.keys(node)) walk(node[key], k == null ? undefined : k[key]);
    };
    walk(entry, kept.keep(entry, row));
    return [...new Set(values)].sort((a, b) => b.length - a.length).reduce((t, v) => t.split(v).join(kept.MARKER), text);
}

export function addAndVerify(call, ctx, name, scope, entry, row = null)
{
    const a = call(['mcp', 'add-json', name, JSON.stringify(entry), '-s', scope]);
    if (!a.ok) return { ok: false, detail: `claude mcp add-json ${name} -s ${scope} failed: ${masked(a.out, entry, row)}` };
    const got = readRegistration(name, scope, ctx.project, ctx.env);
    if (!got || !deepEqual(got, entry)) return { ok: false, detail: `'${name}' at ${scope} scope did not read back as written` };
    return { ok: true, detail: `added '${name}' at ${scope} scope` };
}

export function removeAndVerify(call, ctx, name, scope)
{
    const r = call(['mcp', 'remove', name, '-s', scope]);
    if (!r.ok) return { ok: false, detail: `claude mcp remove ${name} -s ${scope} failed: ${r.out}` };
    if (readRegistration(name, scope, ctx.project, ctx.env)) return { ok: false, detail: `'${name}' is still at ${scope} scope after the remove` };
    return { ok: true, detail: `removed '${name}' from ${scope} scope` };
}

// A replace or a move read from a kept plan gets its real values back from the registration it was read from: the old
// name and scope for a move, its own for a replace. -> { step } | { error }
export function restoreStep(step, ctx)
{
    if (!['mcp-add', 'mcp-replace', 'mcp-move'].includes(step.op) || !(kept.holdsKept(step.entry) || kept.holdsKept(step.old))) return { step };
    if (step.op === 'mcp-add') return { error: `'${step.name}' holds a kept value and no registration to take it from - run the command again` };
    const from = step.op === 'mcp-move' ? step.from : { name: step.name, scope: step.scope };
    const changed = { error: `'${from.name}' changed since it was read - run the command again` };
    const source = readRegistration(from.name, from.scope, ctx.project, ctx.env);
    const row = rowOf(ctx, step);
    if (!source || (step.old && !deepEqual(kept.keep(source, row), step.old))) return changed;
    const entry = kept.restore(step.entry, source, row);
    return entry.error ? changed : { step: { ...step, entry: entry.entry, old: step.old ? source : step.old } };
}

// A stdio key at apply (R7): the step's `key` ({ name, files }, the stdio chain the plan named) fills the route's token
// fields with the first non-empty value of that name. Not filled there: a replace or a move keeps the key the
// registration holds now (its `old`, restored from the live registration) - a value of nothing but ${VAR} placeholders
// is no key - else the field is written empty, never a ${VAR} (spec D5). A step without `key` is written as planned.
// -> { step, note } - the note names the key and the files, never a value.
export function fillStep(step, ctx)
{
    if (!step.key || !['mcp-add', 'mcp-replace', 'mcp-move'].includes(step.op)) return { step, note: null };
    const row = rowOf(ctx, step);
    const route = row && row.routes ? row.routes[step.route] : null;
    if (!route || !route.tokenVar) return { step, note: null };
    const to = step.op === 'mcp-move' ? step.to : { name: step.name, scope: step.scope };
    const where = `'${to.name}' (${to.scope})`;
    const { name, files } = step.key;
    const fill = (value) => ({ ...step, entry: keys.fillKeys(step.entry, row, step.route, to.scope, { [route.tokenVar]: value }) });
    const found = keys.valueIn(files, name);
    if (found) return { step: fill(found.value), note: `${name} for ${where} from ${found.file}` };
    const held = step.old ? keys.tokenFields(step.old, route).map((f) => f.at.reduce((o, k) => (o == null ? undefined : o[k]), step.old)).find((v) => typeof v === 'string' && v !== '' && !keys.PLACEHOLDER.test(v) && !v.includes(kept.MARKER)) : undefined;
    if (held !== undefined) return { step: fill(held), note: `${name} for ${where} is in none of ${files.join(', ')} - the key it holds is kept; fill ${name} in ${files[0]} to replace it` };
    return { step: fill(''), note: `${name} for ${where} is in none of ${files.join(', ')} - written empty: fill ${name} in ${files[0]}, then run /preferred-tools:configure and keep ${name} as the key's name - it writes the key in` };
}

