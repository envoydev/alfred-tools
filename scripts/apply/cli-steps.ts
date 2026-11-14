// The CLI steps of an apply: quoting, the calls through the claude CLI, and a key taken back for a replace or a move.
import * as account from '../core/account.ts';
import { deepEqual } from '../plan/plan.ts';
import * as kept from '../core/kept.ts';
import * as keys from '../keys/keys.ts';
import type { ServerEntry } from '../core/types.ts';
import type { Catalog, CatalogRow } from '../catalog/types.ts';
import type { PlanStep, McpReplaceStep } from '../plan/types.ts';
import type { ApplyCtx, Call, StepResult } from './types.ts';

const quote = (s: string): string => (/^[A-Za-z0-9_\-./:=@,+]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`);
export const restoreLine = (name: string, scope: string, entry: ServerEntry): string => `claude mcp add-json ${quote(name)} ${quote(JSON.stringify(entry))} -s ${scope}`;
// the line that puts a registration back by hand, its credential values as the marker
export function restoreBy(ctx: { catalog: Catalog }, step: { row?: string | null | undefined }, name: string, scope: string, entry: ServerEntry): string
{
    const k = kept.keep(entry, rowOf(ctx, step));
    return `${restoreLine(name, scope, k)}${kept.holdsKept(k) ? ` - put the real value back in place of ${kept.MARKER}` : ''}`;
}
export const rowOf = (ctx: { catalog: Catalog }, step: { row?: string | null | undefined }): CatalogRow | null => (step.row ? ctx.catalog.byId.get(step.row) || null : null);

export const readRegistration = account.readRegistration;

export function makeRunner({ project, env, runCli }: Pick<ApplyCtx, 'project' | 'env' | 'runCli'>): Call
{
    return (argv: string[]) =>
    {
        const r = runCli(argv, { cwd: project, env });
        return { ok: !r.error && r.status === 0, out: `${r.stdout}${r.stderr}`.trim().split('\n').slice(-3).join(' | '), r };
    };
}

// The CLI's own output can echo the JSON it was given, so a failure's text shows each credential value the entry holds -
// a value put back from the registration, a key written in - as the marker, raw and JSON-escaped alike.
function masked(text: string, entry: ServerEntry, row: CatalogRow | null): string
{
    const values: string[] = [];
    const walk = (node: unknown, k: unknown): void =>
    {
        if (typeof node === 'string') { if (node !== k && node) values.push(node, JSON.stringify(node).slice(1, -1)); return; }
        if (node && typeof node === 'object') for (const key of Object.keys(node)) walk((node as Record<string, unknown>)[key], k == null ? undefined : (k as Record<string, unknown>)[key]);
    };
    walk(entry, kept.keep(entry, row));
    return [...new Set(values)].sort((a, b) => b.length - a.length).reduce((t, v) => t.split(v).join(kept.MARKER), text);
}

export function addAndVerify(call: Call, ctx: Pick<ApplyCtx, 'project' | 'env'>, name: string, scope: string, entry: ServerEntry, row: CatalogRow | null = null): StepResult
{
    const a = call(['mcp', 'add-json', name, JSON.stringify(entry), '-s', scope]);
    if (!a.ok) return { ok: false, detail: `claude mcp add-json ${name} -s ${scope} failed: ${masked(a.out, entry, row)}` };
    const got = readRegistration(name, scope, ctx.project, ctx.env);
    if (!got || !deepEqual(got, entry)) return { ok: false, detail: `'${name}' at ${scope} scope did not read back as written` };
    return { ok: true, detail: `added '${name}' at ${scope} scope` };
}

export function removeAndVerify(call: Call, ctx: Pick<ApplyCtx, 'project' | 'env'>, name: string, scope: string): StepResult
{
    const r = call(['mcp', 'remove', name, '-s', scope]);
    if (!r.ok) return { ok: false, detail: `claude mcp remove ${name} -s ${scope} failed: ${r.out}` };
    if (readRegistration(name, scope, ctx.project, ctx.env)) return { ok: false, detail: `'${name}' is still at ${scope} scope after the remove` };
    return { ok: true, detail: `removed '${name}' from ${scope} scope` };
}

// A replace or a move read from a kept plan gets its real values back from the registration it was read from: the old
// name and scope for a move, its own for a replace. -> { step } | { error }
export function restoreStep(step: PlanStep, ctx: ApplyCtx): { step: PlanStep; error?: undefined } | { error: string; step?: undefined }
{
    if (!['mcp-add', 'mcp-replace', 'mcp-move'].includes(step.op) || !(kept.holdsKept((step as McpReplaceStep).entry) || kept.holdsKept((step as McpReplaceStep).old))) return { step };
    if (step.op === 'mcp-add') return { error: `'${step.name}' holds a kept value and no registration to take it from - run the command again` };
    const from = step.op === 'mcp-move' ? step.from : { name: (step as McpReplaceStep).name, scope: (step as McpReplaceStep).scope };
    const changed = { error: `'${from.name}' changed since it was read - run the command again` };
    const source = readRegistration(from.name, from.scope, ctx.project, ctx.env);
    const row = rowOf(ctx, step as McpReplaceStep);
    if (!source || ((step as McpReplaceStep).old && !deepEqual(kept.keep(source, row), (step as McpReplaceStep).old))) return changed;
    const entry = kept.restore((step as McpReplaceStep).entry, source, row);
    return entry.error ? changed : { step: { ...step, entry: entry.entry, old: (step as McpReplaceStep).old ? source : (step as McpReplaceStep).old } as PlanStep };
}

// A stdio key at apply (R7): the step's `key` ({ name, files }, the stdio chain the plan named) fills the route's token
// fields with the first non-empty value of that name. Not filled there: a replace or a move keeps the key the
// registration holds now (its `old`, restored from the live registration) - a value of nothing but ${VAR} placeholders
// is no key - else the field is written empty, never a ${VAR} (spec D5). A step without `key` is written as planned.
// -> { step, note } - the note names the key and the files, never a value.
export function fillStep(step: PlanStep, ctx: ApplyCtx): { step: PlanStep; note: string | null }
{
    if (!(step as McpReplaceStep).key || !['mcp-add', 'mcp-replace', 'mcp-move'].includes(step.op)) return { step, note: null };
    const row = rowOf(ctx, step as McpReplaceStep);
    const route = row && row.routes ? row.routes[(step as McpReplaceStep).route!] : null;
    if (!route || !route.tokenVar) return { step, note: null };
    const to = step.op === 'mcp-move' ? step.to : { name: (step as McpReplaceStep).name, scope: (step as McpReplaceStep).scope };
    const where = `'${to.name}' (${to.scope})`;
    const { name, files } = (step as McpReplaceStep).key!;
    const fill = (value: string): PlanStep => ({ ...step, entry: keys.fillKeys((step as McpReplaceStep).entry, row, (step as McpReplaceStep).route!, to.scope, { [route.tokenVar!]: value }) } as PlanStep);
    const found = keys.valueIn(files, name);
    if (found) return { step: fill(found.value), note: `${name} for ${where} from ${found.file}` };
    const held = (step as McpReplaceStep).old ? keys.tokenFields((step as McpReplaceStep).old, route).map((f) => f.at.reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), (step as McpReplaceStep).old)).find((v) => typeof v === 'string' && v !== '' && !keys.PLACEHOLDER.test(v) && !v.includes(kept.MARKER)) : undefined;
    if (held !== undefined) return { step: fill(held as string), note: `${name} for ${where} is in none of ${files.join(', ')} - the key it holds is kept; fill ${name} in ${files[0]} to replace it` };
    return { step: fill(''), note: `${name} for ${where} is in none of ${files.join(', ')} - written empty: fill ${name} in ${files[0]}, then run /preferred-tools:configure and keep ${name} as the key's name - it writes the key in` };
}

