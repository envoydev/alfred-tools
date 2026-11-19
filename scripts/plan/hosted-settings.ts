// A hosted route's tool settings (Part C2): fixed `--header NAME:value` pairs on the helper command. The question that
// offers them, the check of the answer, the defaults a fresh install takes and the pairs a registration has now.
import { helperParts, splitPair } from '../entries/entry.ts';
import type { ServerEntry } from '../core/types.ts';
import type { CatalogRoute, CatalogRow } from '../catalog/types.ts';
import type { Asked, HostedSettingsAnswer } from './types.ts';
import { READ_ONLY_HEADER, SETTINGS_HEADER, TOOLSETS_ASKED, TOOLSETS_HEADER, TOOL_OPTIONS } from './hosted-settings-constants.ts';
import { PREFIX, RECOMMENDED_SUFFIX, TOOLSET_SEPARATOR } from './record-constants.ts';

// The settings a fresh install sends: each setting that has a default.
export function defaultHostedSettings(route: CatalogRoute): Record<string, string>
{
    return Object.fromEntries((route.settings || []).flatMap((setting) => (setting.default === undefined ? [] : [[setting.header, setting.default]])));
}

// The fixed pairs a registration's helper command carries that this route knows as settings.
export function currentHostedSettings(route: CatalogRoute, entry: ServerEntry | null | undefined): Record<string, string>
{
    const known = new Set((route.settings || []).map((setting) => setting.header));
    const pairs = (entry && helperParts(entry.headersHelper)?.pairs) || [];
    const fixed = pairs.map(splitPair).flatMap((pair) => (pair !== null && pair.kind === 'fixed' && known.has(pair.header) ? [[pair.header, pair.rest]] : []));
    return Object.fromEntries(fixed);
}

// The answer checked against the route's settings: names the route has, values from its `values`, toolsets as a
// non-empty list of its keys. -> { settings } with the toolsets trimmed and without repeats | { error }
export function checkHostedSettings(route: CatalogRoute, given: Record<string, string>): { settings: Record<string, string> } | { error: string }
{
    const known = route.settings || [];
    const settings: Record<string, string> = {};
    for (const [header, value] of Object.entries(given))
    {
        const setting = known.find((candidate) => candidate.header === header);
        if (!setting) return { error: `'${header}' is not a setting of its hosted route - ${known.map((candidate) => candidate.header).join(', ')}` };
        const allowed = setting.values || [];
        if (header === TOOLSETS_HEADER)
        {
            const keys = [...new Set(String(value).split(TOOLSET_SEPARATOR).map((key) => key.trim()).filter(Boolean))];
            if (!keys.length) return { error: `${header} needs at least one toolset - ${allowed.join(', ')}` };
            const unknown = keys.find((key) => !allowed.includes(key));
            if (unknown !== undefined) return { error: `'${unknown}' is not a toolset - one of ${allowed.join(', ')}` };
            settings[header] = keys.join(TOOLSET_SEPARATOR);
        }
        else
        {
            if (allowed.length && !allowed.includes(value)) return { error: `${header} takes ${allowed.join(', ')} - leave it out for the server's default` };
            settings[header] = value;
        }
    }
    return { settings };
}

// The read-only setting's default, which a route offering the tools question carries.
function readOnlyDefault(route: CatalogRoute): string
{
    const value = route.settings?.find((setting) => setting.header === READ_ONLY_HEADER)?.default;
    if (value === undefined) throw new Error(`a hosted route asked about its tools has no ${READ_ONLY_HEADER} default`);
    return value;
}

// The tools question of a hosted route with settings. At install, read-only comes first and is recommended; at configure
// the option that matches the registration's own pairs does (`entry`), and a registration that sends toolsets keeps them
// in its answer, so nothing is asked again.
export function hostedSettingsQuestion(row: CatalogRow, route: CatalogRoute, entry: ServerEntry | null = null): Asked<HostedSettingsAnswer>
{
    const now = entry ? currentHostedSettings(route, entry) : null;
    const same = (option: (typeof TOOL_OPTIONS)[number]) => now !== null && (now[READ_ONLY_HEADER] === 'true') === option.readOnly && (now[TOOLSETS_HEADER] !== undefined) === option.chosen;
    const matching = TOOL_OPTIONS.find(same) || TOOL_OPTIONS[0];
    const ordered = [matching, ...TOOL_OPTIONS.filter((option) => option !== matching)];
    const options = ordered.map((option, i) => ({
        label: `${option.label}${i === 0 ? RECOMMENDED_SUFFIX : ''}`,
        description: option === matching && now && now[TOOLSETS_HEADER] !== undefined ? `toolsets: ${now[TOOLSETS_HEADER]}` : option.description,
        answer: ((): HostedSettingsAnswer =>
        {
            const readOnly = option.readOnly ? { [READ_ONLY_HEADER]: readOnlyDefault(route) } : {};
            if (!option.chosen) return readOnly;
            return option === matching && now && now[TOOLSETS_HEADER] !== undefined ? { ...readOnly, [TOOLSETS_HEADER]: now[TOOLSETS_HEADER] } : { ...readOnly, [TOOLSETS_ASKED]: true };
        })(),
    }));
    return {
        question: { id: `${PREFIX.settings}${row.id}`, header: SETTINGS_HEADER, multiSelect: false, question: `${row.label}'s tools`, options: options.map(({ label, description }) => ({ label, description })) },
        answers: Object.fromEntries(options.map((option) => [option.label, option.answer])),
    };
}

// The names a helper command's `NAME=VAR` pairs read from .mcps-secrets.
export function pairNames(entry: ServerEntry | null | undefined): string[]
{
    const pairs = (entry && helperParts(entry.headersHelper)?.pairs) || [];
    return pairs.map(splitPair).flatMap((pair) => (pair !== null && pair.kind === 'name' ? [pair.rest] : []));
}

// One line per pair name that holds no value yet: it is optional - the header is sent once the name is filled.
export function optionalNameNotes(rowId: string, route: CatalogRoute, names: string[], file: string): string[]
{
    return names.map((name) =>
    {
        const label = ((route.helper && route.helper.headers) || []).find((header) => header.var === name)?.label;
        return `${rowId}: ${name}${label ? ` (${label})` : ''} is optional - fill it in ${file} to send that header; with no value the header is left out`;
    });
}
