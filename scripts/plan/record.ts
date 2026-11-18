// --record's mapping (spec D1): one walk step's answers -> the new picks.json and answers.json, as install.md's step 4
// and configure.md's step 5 mapped them by hand at commit 5320179. Pure: the inputs are cloned, never changed.
import { ROUTE_WORD, scopeOfLabel } from './asks-keys.ts';
import { TOOLSETS_ASKED, TOOLSETS_HEADER } from './hosted-settings-constants.ts';
import { DEFAULT_HOST_DESCRIPTION } from './asks-other-constants.ts';
import { BACKTICKED_NAME, LABEL, PREFIX, SIDE, VALUE, WALK_QUESTION } from './record-constants.ts';
import { isRecord, isTextList, resolveAnswer } from './record-resolve.ts';
import type { Family } from '../roots/types.ts';
import type { Answers, LocationAnswer, Picks, RecordedStep, RecordInput, RecordResult, Refusal, Resolved, Run, Question, Typed } from './types.ts';

const KEYED = [PREFIX.route, PREFIX.scope, PREFIX.name, PREFIX.location, PREFIX.browser, PREFIX.host, PREFIX.token, PREFIX.keyName, PREFIX.urlName, PREFIX.settings, PREFIX.clients];

const refuse = (refused: string): Refusal => ({ refused });
const capitalized = (word: string) => `${word[0]!.toUpperCase()}${word.slice(1)}`;
const sameSet = (left: string[], right: string[]) => left.length === right.length && left.every((item) => right.includes(item));

function put(root: object, path: string[], value: unknown): void
{
    let at = root as Record<string, unknown>;
    for (const segment of path.slice(0, -1))
    {
        if (!isRecord(at[segment])) at[segment] = {};
        at = at[segment] as Record<string, unknown>;
    }
    at[path.at(-1)!] = value;
}

function putPick(run: Run, path: string[], value: unknown): void
{
    put(run.picks, path, value);
    run.wrotePicks.push(path);
}

function putAnswer(run: Run, path: string[], value: unknown): void
{
    put(run.answers, path, value);
    run.wroteAnswers.push(path);
}

// One tool's answer: install's `picks.<key>.<field>` always; configure's `change.<key>.<field>` only when `changes`,
// the entry made with its row on the first write. Nothing for a tool left out with --skip.
function putEntry(run: Run, field: string[], value: unknown, changes = true): void
{
    if (run.skipped || run.key === null) return;
    if (!run.configure) { putAnswer(run, ['picks', run.key, ...field], value); return; }
    if (!changes) return;
    if (run.answers.change?.[run.key] == null) putAnswer(run, ['change', run.key], { row: run.target?.row });
    putAnswer(run, ['change', run.key, ...field], value);
}

// A top-level answer (keyNames, settings, roots ...): written always at install, at configure only when `changes`.
function putTop(run: Run, path: string[], value: unknown, changes = true): void
{
    if (run.configure && !changes) return;
    putAnswer(run, path, value);
}

// A top-level answer keyed by the step's tool (keyNames, urlNames, settings): nothing for a tool left out with --skip.
function putKeyed(run: Run, path: string[], value: unknown, changes = true): void
{
    if (run.skipped) return;
    putTop(run, path, value, changes);
}

const routeOfLabel = (label: string) => Object.keys(ROUTE_WORD).find((routeId) => capitalized(ROUTE_WORD[routeId]!) === label);

function mapRoute(run: Run, key: string, resolved: Resolved): Refusal | void
{
    const routeId = routeOfLabel(resolved.label);
    if (routeId === undefined) return refuse(`'${resolved.label}' is not a route`);
    putPick(run, ['routes', key], routeId);
    putEntry(run, ['route'], routeId, routeId !== run.target?.current?.route);
}

function mapScope(run: Run, key: string, resolved: Resolved): Refusal | void
{
    const scope = scopeOfLabel(resolved.label);
    if (scope === null) return refuse(`'${resolved.label}' is not a scope`);
    putPick(run, ['scopes', key], scope);
    putEntry(run, ['scope'], scope, scope !== run.target?.current?.scope);
}

function mapName(run: Run, key: string, resolved: Resolved): Refusal | void
{
    const name = resolved.other ?? (resolved.label.startsWith(LABEL.keep) ? VALUE.keep : BACKTICKED_NAME.exec(resolved.label)?.[1]);
    if (name === undefined) return refuse(`'${resolved.label}' names no registration name`);
    putPick(run, ['names', key], name);
    putEntry(run, ['name'], name, name !== VALUE.keep);
}

function mapLocation(run: Run, resolved: Resolved): Refusal | void
{
    const typed = typeof resolved.typed === 'string' ? resolved.typed : undefined;
    const value = typed === undefined ? resolved.value : { side: SIDE.path, path: typed };
    if (!isRecord(value) || typeof value['side'] !== 'string') return refuse(`'${resolved.label}' has no location entry`);
    putEntry(run, ['location'], structuredClone(value) as unknown as LocationAnswer, value['side'] !== SIDE.keep);
}

function mapBrowser(run: Run, resolved: Resolved): void
{
    if (resolved.label === LABEL.browserNamed) putEntry(run, ['executablePath'], resolved.typed);
    else if (resolved.label === LABEL.browserDefault && run.configure && resolved.index !== 0) putEntry(run, ['executablePath'], '');
}

function mapHost(run: Run, question: Question, resolved: Resolved): void
{
    if (resolved.label.startsWith(LABEL.keep)) return;
    const described = question.options[resolved.index]!.description;
    const host = resolved.label === LABEL.hostSelfManaged ? resolved.typed : described === DEFAULT_HOST_DESCRIPTION ? resolved.label : described;
    putEntry(run, ['params'], { host }, resolved.index !== 0);
}

function mapToken(run: Run, key: string, resolved: Resolved): void
{
    const token = resolved.label.startsWith(LABEL.useKey);
    putPick(run, ['tokens', key], token);
    putEntry(run, ['token'], token, resolved.index !== 0);
}

function mapKeyName(run: Run, key: string, resolved: Resolved): Refusal | void
{
    const name = typeof resolved.typed === 'string' ? resolved.typed : resolved.value;
    if (typeof name !== 'string') return refuse(`'${resolved.label}' has no key name`);
    putKeyed(run, ['keyNames', key], name, resolved.index !== 0);
}

function mapUrlName(run: Run, key: string, question: Question, resolved: Resolved): Refusal | void
{
    const name = typeof resolved.typed === 'string' ? resolved.typed : resolved.value;
    const urlVar = Object.entries(run.built.urlNames?.[key] ?? {}).find(([, asked]) => asked.question.id === question.id)?.[0];
    if (typeof name !== 'string' || urlVar === undefined) return refuse(`'${resolved.label}' has no URL name`);
    putKeyed(run, ['urlNames', key, urlVar], name, resolved.index !== 0);
}

// Settings: 'keep' writes nothing and 'change' the typed pairs; a hosted route's Tools answer is its object, without
// `toolsets: true`, plus the toolsets typed in.
function mapSettings(run: Run, key: string, resolved: Resolved): Refusal | void
{
    const { value } = resolved;
    if (value === VALUE.keep) return;
    if (value === VALUE.change) { putKeyed(run, ['settings', key], resolved.typed as Typed); return; }
    if (!isRecord(value)) return refuse(`'${resolved.label}' has no settings entry`);
    const { [TOOLSETS_ASKED]: asked, ...fixed } = value;
    const settings: Record<string, unknown> = asked === true ? { ...fixed, [TOOLSETS_HEADER]: resolved.typed } : fixed;
    putKeyed(run, ['settings', key], settings, resolved.index !== 0);
}

function mapRoot(run: Run, resolved: Resolved): Refusal | void
{
    const { value } = resolved;
    const family = isRecord(value) ? (value['family'] as Family) : undefined;
    if (!isRecord(value) || (family !== 'project' && family !== 'global') || typeof value['id'] !== 'string') return refuse(`'${resolved.label}' has no root entry`);
    const answer = value['id'] === VALUE.named ? { id: VALUE.named, path: resolved.typed as string } : { id: value['id'] };
    const changes = resolved.index !== 0;
    putPick(run, ['roots', family], answer);
    putTop(run, ['roots', family], answer, changes);
    if (run.configure && changes && !run.answers.rootChange?.includes(family))
    {
        run.answers.rootChange = [...(run.answers.rootChange ?? []), family];
        run.wroteAnswers.push(['rootChange', family]);
    }
}

function mapOwn(run: Run, resolved: Resolved): Refusal | void
{
    const { value } = resolved;
    if (!isRecord(value) || typeof value['key'] !== 'string' || typeof value['choice'] !== 'string') return refuse(`'${resolved.label}' has no looked-after entry`);
    putPick(run, ['existing', value['key']], value['choice']);
    putTop(run, ['existing', value['key']], value['choice']);
}

function mapApps(run: Run, key: string | null, resolved: Resolved): Refusal | void
{
    if (!isTextList(resolved.value)) return refuse(`'${resolved.label}' has no list of apps`);
    if (key === null)
    {
        putPick(run, ['clients'], resolved.value);
        putTop(run, ['clients'], resolved.value);
        return;
    }
    putEntry(run, ['clients'], resolved.value, !sameSet(resolved.value, run.target?.current?.clients ?? []));
}

function mapOne(run: Run, question: Question, resolved: Resolved): Refusal | void
{
    const { id } = question;
    const key = run.key;
    if (id === WALK_QUESTION.settings)
    {
        if (typeof resolved.value !== 'string') return refuse(`'${resolved.label}' has no walk entry`);
        putPick(run, ['walk'], resolved.value);
        return;
    }
    if (id === WALK_QUESTION.clients) return mapApps(run, null, resolved);
    if (id.startsWith(PREFIX.root)) return mapRoot(run, resolved);
    if (id.startsWith(PREFIX.own)) return mapOwn(run, resolved);
    if (!KEYED.some((prefix) => id.startsWith(prefix))) return refuse('no mapping for this question');
    if (key === null) return refuse('the step belongs to no tool');
    if (id.startsWith(PREFIX.route)) return mapRoute(run, key, resolved);
    if (id.startsWith(PREFIX.scope)) return mapScope(run, key, resolved);
    if (id.startsWith(PREFIX.name)) return mapName(run, key, resolved);
    if (id.startsWith(PREFIX.location)) return mapLocation(run, resolved);
    if (id.startsWith(PREFIX.browser)) return mapBrowser(run, resolved);
    if (id.startsWith(PREFIX.host)) return mapHost(run, question, resolved);
    if (id.startsWith(PREFIX.token)) return mapToken(run, key, resolved);
    if (id.startsWith(PREFIX.keyName)) return mapKeyName(run, key, resolved);
    if (id.startsWith(PREFIX.urlName)) return mapUrlName(run, key, question, resolved);
    if (id.startsWith(PREFIX.settings)) return mapSettings(run, key, resolved);
    return mapApps(run, key, resolved);
}

// Every row of the install picks gets an entry, so a tool whose answers all stay at their defaults is still planned; a
// tool left out with --skip does not come back.
function seedRows(run: Run): void
{
    const skipped = run.picks.skipped ?? [];
    for (const row of run.picks.rows ?? [])
    {
        if (skipped.includes(row) || run.answers.picks?.[row] != null) continue;
        run.answers.picks = { ...run.answers.picks, [row]: {} };
    }
}

// One step of the walk answered: step.json's `chosen` -> the next picks and answers, or the refusal naming the cause.
export function recordStep({ step, built, picks, answers, chosen }: RecordInput): RecordResult
{
    if (chosen.id !== step.id) return refuse(`step.json is for '${chosen.id}', the step to answer is '${step.id}'`);
    const call = step.call ?? [];
    const given = chosen.answers;
    const missing = call.find((question) => !Object.hasOwn(given, question.id));
    if (missing) return refuse(`${missing.id}: no answer for this question`);
    const stranger = Object.keys(given).find((id) => !call.some((question) => question.id === id));
    if (stranger !== undefined) return refuse(`${stranger}: not a question of this step`);

    const key = step.tool ?? null;
    const configure = key !== null && (picks.targets ?? []).includes(key);
    const target = configure ? built.targets[key] : undefined;
    if (configure && !target) return refuse(`${key}: no questions are built for this target`);
    const run: Run = { step, built, key, configure, skipped: key !== null && (picks.skipped ?? []).includes(key), target, picks: structuredClone(picks), answers: structuredClone(answers), wrotePicks: [], wroteAnswers: [] };

    for (const question of call)
    {
        const resolved = resolveAnswer(question, (step.answers?.[question.id] ?? {}) as Record<string, unknown>, given[question.id]);
        if ('refused' in resolved) return resolved;
        const refused = mapOne(run, question, resolved);
        if (refused) return refuse(`${question.id}: ${refused.refused}`);
    }
    if (step.set) putEntry(run, ['location'], structuredClone(step.set.location), step.set.location.side !== SIDE.keep);
    run.picks.done = run.picks.done?.includes(step.id) ? run.picks.done : [...(run.picks.done ?? []), step.id];
    run.picks.recorded = { ...run.picks.recorded, [step.id]: { tool: key, picks: run.wrotePicks, answers: run.wroteAnswers } };
    seedRows(run);
    return { picks: run.picks, answers: run.answers };
}

// The pick a recorded step belongs to: its tool, or `clients` and `settings` for the walk's own two questions.
const pickOfStep = (id: string, step: RecordedStep): string | null =>
    step.tool ?? (id === WALK_QUESTION.clients || id === WALK_QUESTION.settings ? id : null);

// Every pick with a recorded step, the one recorded last first.
export function recordedPicks(picks: Picks): string[]
{
    const found: string[] = [];
    for (const [id, step] of Object.entries(picks.recorded ?? {}))
    {
        const pick = pickOfStep(id, step);
        if (pick === null) continue;
        const at = found.indexOf(pick);
        if (at >= 0) found.splice(at, 1);
        found.push(pick);
    }
    return found.reverse();
}

// Deletes one recorded path, whatever of it is already gone. A path ending in an array names an element, which leaves
// no hole, and an array left empty goes with its key.
function removePath(root: object, path: string[]): void
{
    const walk = (segments: string[]): unknown => segments.reduce<unknown>((at, segment) => (isRecord(at) ? at[segment] : undefined), root);
    const parentPath = path.slice(0, -1);
    const last = path.at(-1)!;
    const parent = walk(parentPath);
    if (isRecord(parent)) { delete parent[last]; return; }
    if (!Array.isArray(parent)) return;
    const holder = walk(parentPath.slice(0, -1));
    const kept = parent.filter((item) => item !== last);
    if (kept.length === 0 && isRecord(holder)) delete holder[parentPath.at(-1)!];
    else parent.splice(0, parent.length, ...kept);
}

// Back to one pick (spec D1b): its recorded steps leave `done` and `recorded`, and each path they wrote is deleted from both
// files. `settings` is every step, and brings back every tool left out with --skip, as rewinding that tool does.
export function rewindPick(picks: Picks, answers: Answers, pick: string): RecordResult
{
    const recorded = Object.entries(picks.recorded ?? {});
    const steps = recorded.filter(([id, step]) => pick === WALK_QUESTION.settings || (pick === WALK_QUESTION.clients ? id === pick : step.tool === pick));
    if (steps.length === 0) return refuse(`'${pick}' has no recorded answer to change`);
    const next = { picks: structuredClone(picks), answers: structuredClone(answers) };
    for (const [id, step] of steps)
    {
        step.picks.forEach((path) => removePath(next.picks, path));
        step.answers.forEach((path) => removePath(next.answers, path));
        delete next.picks.recorded![id];
    }
    const dropped = new Set(steps.map(([id]) => id));
    next.picks.done = (next.picks.done ?? []).filter((id) => !dropped.has(id));
    // `settings` restarts the walk, so the tools skipped at the prerequisite step are asked and checked again
    if (pick === WALK_QUESTION.settings) next.picks.skipped = [];
    else if (next.picks.skipped?.includes(pick)) next.picks.skipped = next.picks.skipped.filter((skipped) => skipped !== pick);
    return next;
}

// The pick --skip names (spec D1c): a pick of the run as it is, else the row id of exactly one configure target (the
// prerequisite step names the row, a target's pick is its key). Several targets of one row are refused, never guessed.
export function resolveSkipTarget(picks: Picks, named: string, rowOf: (target: string) => string | null | undefined): { pick: string } | Refusal
{
    if ((picks.rows ?? []).includes(named) || (picks.targets ?? []).includes(named)) return { pick: named };
    const sharing = (picks.targets ?? []).filter((target) => rowOf(target) === named);
    if (sharing.length === 1) return { pick: sharing[0]! };
    if (sharing.length > 1) return refuse(`'${named}' names ${sharing.length} targets (${sharing.join(', ')}): skip one by its key`);
    return refuse(`'${named}' is not a pick of this run`);
}

// Leave one pick out (spec D1c): its entries come out of answers.json and it is listed once under `skipped`, which every
// later record honours.
export function skipPick(picks: Picks, answers: Answers, pick: string): RecordResult
{
    if (!(picks.rows ?? []).includes(pick) && !(picks.targets ?? []).includes(pick)) return refuse(`'${pick}' is not a pick of this run`);
    const next = { picks: structuredClone(picks), answers: structuredClone(answers) };
    if (next.answers.picks) delete next.answers.picks[pick];
    if (next.answers.change) delete next.answers.change[pick];
    if (!next.picks.skipped?.includes(pick)) next.picks.skipped = [...(next.picks.skipped ?? []), pick];
    return next;
}
