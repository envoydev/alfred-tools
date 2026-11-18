// Which option an answer in step.json stands for, and the typed value it carries. Pure: values in, values out.
import { RECOMMENDED_SUFFIX } from './asks-keys.ts';
import { LABEL, PREFIX, SIDE, TOOLSET_SEPARATOR, VALUE } from './record-constants.ts';
import { TOOLSETS_ASKED } from './hosted-settings-constants.ts';
import type { Question, Refusal, Resolved, Typed, TypedKind } from './types.ts';


const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isTextList = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

export const plainLabel = (label: string): string => (label.endsWith(RECOMMENDED_SUFFIX) ? label.slice(0, -RECOMMENDED_SUFFIX.length) : label);

// Which typed value an option takes, read from the builders: a root or a key name or URL name whose value is `named`, a
// location with no folder of its own, a browser binary, a self-managed host, settings to change, toolsets asked next.
function typedKind(questionId: string, label: string, value: unknown, hasValue: boolean): TypedKind | null
{
    if (questionId.startsWith(PREFIX.root)) return isRecord(value) && value['id'] === VALUE.named ? 'text' : null;
    if (questionId.startsWith(PREFIX.location))
        return (hasValue && isRecord(value) && value['side'] === SIDE.path && value['path'] === undefined) || (!hasValue && label.startsWith(LABEL.folderAnother)) ? 'text' : null;
    if (questionId.startsWith(PREFIX.browser)) return label === LABEL.browserNamed ? 'text' : null;
    if (questionId.startsWith(PREFIX.host)) return label === LABEL.hostSelfManaged ? 'text' : null;
    if (questionId.startsWith(PREFIX.keyName) || questionId.startsWith(PREFIX.urlName)) return value === VALUE.named ? 'text' : null;
    if (questionId.startsWith(PREFIX.settings))
    {
        if (value === VALUE.change) return 'pairs';
        return isRecord(value) && value[TOOLSETS_ASKED] === true ? 'toolsets' : null;
    }
    return null;
}

const lookup = (map: Record<string, unknown>, label: string): { found: boolean; value: unknown } =>
{
    const key = Object.keys(map).find((candidate) => plainLabel(candidate) === label);
    return key === undefined ? { found: false, value: undefined } : { found: true, value: map[key] };
};

// The typed value of the shape its option takes; toolsets given as a list are joined into the one string the plan reads.
function checkTyped(kind: TypedKind, typed: unknown): { typed: Typed } | { shape: string }
{
    if (kind === 'text') return typeof typed === 'string' ? { typed } : { shape: 'one string' };
    if (kind === 'toolsets')
    {
        if (isTextList(typed)) return { typed: typed.join(TOOLSET_SEPARATOR) };
        return typeof typed === 'string' ? { typed } : { shape: 'a comma-separated string or a list of strings' };
    }
    return isRecord(typed) && Object.values(typed).every((item) => typeof item === 'string') ? { typed: typed as Record<string, string> } : { shape: 'an object of NAME: value strings' };
}

const resolved = (label: string, index: number, value: unknown, hasValue: boolean, typed?: Typed, other?: string): Resolved => ({ label, index, value, hasValue, typed, other });

// 'Other' typed on a question: the registration name on `name-*`, else the typed value of the one option that takes one.
function resolveOther(question: Question, map: Record<string, unknown>, other: string): Resolved | Refusal
{
    if (question.id.startsWith(PREFIX.name)) return resolved('', -1, undefined, false, undefined, other);
    const takers = question.options.flatMap((option, index) =>
    {
        const label = plainLabel(option.label);
        const { found, value } = lookup(map, label);
        const kind = typedKind(question.id, label, value, found);
        return kind === null ? [] : [{ label, index, value, found, kind }];
    });
    if (takers.length !== 1) return { refused: `${question.id}: 'Other' is not taken here - ask again with one of the options` };
    const taker = takers[0]!;
    if (taker.kind === 'pairs') return { refused: `${question.id}: 'Other' cannot hold settings - give the label and the typed object` };
    const checked = checkTyped(taker.kind, other);
    if ('shape' in checked) return { refused: `${question.id}: the typed value must be ${checked.shape}` };
    return resolved(taker.label, taker.index, taker.value, taker.found, checked.typed);
}

// One answer of step.json -> the option it stands for, with its map value and typed value; or the refusal.
export function resolveAnswer(question: Question, map: Record<string, unknown>, answer: unknown): Resolved | Refusal
{
    if (Array.isArray(answer)) return { refused: `${question.id}: a list is given where one label is expected` };
    const shape = typeof answer === 'string' ? { label: answer } : answer;
    if (!isRecord(shape)) return { refused: `${question.id}: an answer is a label, a label with typed, or other` };
    if (typeof shape['other'] === 'string') return resolveOther(question, map, shape['other']);
    if (typeof shape['label'] !== 'string') return { refused: `${question.id}: an answer is a label, a label with typed, or other` };
    const label = plainLabel(shape['label']);
    const index = question.options.findIndex((option) => plainLabel(option.label) === label);
    if (index < 0) return { refused: `${question.id}: '${label}' is not one of its options` };
    const { found, value } = lookup(map, label);
    const kind = typedKind(question.id, label, value, found);
    const given = 'typed' in shape && shape['typed'] !== undefined;
    if (kind === null) return given ? { refused: `${question.id}: '${label}' takes no typed value` } : resolved(label, index, value, found);
    if (!given) return { refused: `${question.id}: '${label}' needs its typed value` };
    const checked = checkTyped(kind, shape['typed']);
    if ('shape' in checked) return { refused: `${question.id}: the typed value must be ${checked.shape}` };
    return resolved(label, index, value, found, checked.typed);
}
