// The other questions: a tool's own ask, remove, Cursor, drift, the apps, and the static ones.
import { RECOMMENDED_SUFFIX, keyStateOf } from './asks-keys.ts';
import { installedItems, packed } from './asks-picks.ts';
import { scopeQuestion, nameQuestion, scopeOrder, nameFor } from './asks-tool.ts';
import { DEFAULT_HOST_DESCRIPTION, REWIND_ANOTHER, REWIND_MAX_OPTIONS } from './asks-other-constants.ts';
import { recordedPicks } from './record.ts';
import { locationQuestion } from './asks-location.ts';
import type { Catalog, CatalogRow } from '../catalog/types.ts';
import type { Inventory } from '../inventory/types.ts';
import type { Asked, DriftAsk, LocationAnswer, Picks, Question, QuestionOption, Taken, ToolAsk, ToolOpts } from './types.ts';

// The questions for one tool. A row with a data folder asks scope and name `first`, in a call of their own, because its
// folder is named after the registration and depends on the scope; then `questions` holds the location (built for
// `scope` and `name`, else the recommended scope and the name it has now or the original) and one tool-specific extra,
// and `answers` maps each location label to its entry; `only` is the location when one place is left and none is
// asked. Any other row has `first` null and asks scope, name and its extra in one call, as before.
export function toolAsk(row: CatalogRow, inventory: Inventory, { route, scope = null, name = null, current = null, context: context = null, catalog: _catalog, copyOf = [] }: ToolOpts = {}): ToolAsk
{
    const routeId = route || (current && current.route) || row.recommendedRoute;
    const scopeQ = scopeQuestion(row, inventory, { route: routeId, current, copyOf, context: context });
    const nameQ = nameQuestion(row, inventory, { current, copyOf, context: context });
    const located = Boolean(row.locations && context);
    const questions = located ? [] : [scopeQ, nameQ].filter(Boolean) as Question[];
    let answers: Record<string, LocationAnswer> = {};
    // one place left: no location question, and the walk writes this as the location (a move must not fall back to
    // 'keep' where the folder it uses now cannot stay)
    let only: LocationAnswer | null = null;
    // the scope the questions are built for: the one asked first, else the recommended one
    const at = context ? scope || scopeOrder(row, inventory, { route: routeId, current, copyOf, context: context })[0] || (current && current.scope) : scope;
    if (located)
    {
        const locationAsk = locationQuestion(row, inventory, { scope: at!, name: nameFor(row, name, current, context), current, copyOf, context: context! });
        if (locationAsk.question) questions.push(locationAsk.question);
        else only = locationAsk.only;
        answers = locationAsk.answers;
    }
    // what the registration has now goes first, so a configure walk recommends keeping it
    const first = (options: QuestionOption[], keepFirst?: boolean) => (keepFirst ? [options[1]!, options[0]!] : options).map((option, i) => ({ ...option, label: `${option.label}${i === 0 ? RECOMMENDED_SUFFIX : ''}` }));
    const sameRoute = current && current.route === routeId;
    // every extra that applies, in the spec's order: the browser binary, the host, the API key (spec F1)
    if (row.routes[routeId]!.optionalArgs && row.routes[routeId]!.optionalArgs!.executablePath)
    {
        const has = Boolean(sameRoute && current!.executablePath);
        const named = { label: 'A browser binary I name', description: 'sets --executable-path to the binary you name, asked next' };
        const engine = { label: 'Default for this engine', description: has ? 'drops --executable-path' : row.id.endsWith('chrome') || row.id.endsWith('msedge') ? 'the branded browser installed on this machine' : "Playwright's own build" };
        questions.push({
            id: `browser-${row.id}`, header: 'Browser', multiSelect: false, question: `${row.label}: which browser binary?`,
            options: has
                ? first([{ label: `Keep \`${current!.executablePath}\``, description: 'the binary it uses now' }, engine])
                : first([engine, named]),
        });
    }
    if (row.params && row.params[0]!.choices)
    {
        // a closed set (SonarQube Cloud's regions): the choices are the options, the one in use or else the default first
        const choices = row.params[0]!.choices;
        const inUse = choices.findIndex((choice) => current && choice.value === current.host);
        const ordered = inUse > 0 ? [choices[inUse]!, ...choices.filter((_choice, i) => i !== inUse)] : choices;
        questions.push({
            id: `host-${row.id}`, header: 'Host', multiSelect: false, question: `${row.label}: which ${row.params[0]!.label}?`,
            options: first(ordered.map((choice) => ({ label: choice.label, description: choice.value }))),
        });
    }
    else if (row.params)
    {
        const host = current && current.host && current.host !== row.params[0]!.default ? current.host : null;
        questions.push({
            id: `host-${row.id}`, header: 'Host', multiSelect: false, question: `${row.label}: which ${row.params[0]!.label}?`,
            options: host
                ? first([{ label: `Keep ${host}`, description: 'the host it uses now' }, { label: row.params[0]!.default, description: DEFAULT_HOST_DESCRIPTION }])
                : first([{ label: row.params[0]!.default, description: DEFAULT_HOST_DESCRIPTION }, { label: 'A self-managed host', description: 'your own GitLab host name, asked next' }]),
        });
    }
    // an optional key (spec D5, F2): asked at every scope but for a stdio route at project scope, which runs keyless; the
    // key first at install, what the registration has now first at configure
    if (row.routes[routeId]!.authMode === 'optional-token' && !(routeId !== 'remote' && at === 'project'))
    {
        const route = row.routes[routeId]!;
        const keyState = keyStateOf(row, routeId, context, inventory.alfredCodeEnabled, at || 'user');
        const file = keyState && keyState.files[0];
        const hint = route.helper && route.helper.hint ? `; ${route.helper.hint}` : '';
        const useKey = route.helper
            ? { label: 'Use a key from .mcps-secrets', description: `mcp-headers.js reads it each time Claude Code connects${file ? `, from ${file} first` : ''} - never written into the registration${hint}` }
            : { label: 'Use a key from .mcps-secrets', description: `the apply writes it into the registration from ${file || '.mcps-secrets'}, never printed` };
        const noKey = route.keyless === 'oauth'
            ? { label: 'Sign in with OAuth', description: 'run /mcp once in a session to log in' }
            : { label: 'No key - lower rate limits', description: 'works anonymously' };
        questions.push({
            id: `token-${row.id}`, header: 'API key', multiSelect: false, question: `${row.label}: send an API key?`,
            options: first([noKey, useKey], current ? Boolean(sameRoute && current.token) : true),
        });
    }
    return { first: located ? [scopeQ, nameQ].filter(Boolean) as Question[] : null, questions: questions, answers, only };
}

// The questions toolAsk gives after `first`: for a row without a data folder, its whole call.
export const toolQuestions = (row: CatalogRow, inventory: Inventory, options: ToolOpts = {}): Question[] => toolAsk(row, inventory, options).questions;

// Remove: one option per registration (a row at two scopes is two options), grouped; the description is the exact
// command, which the walk reads the target from.
export function removeQuestions(inventory: Inventory, catalog: Catalog): Question[][]
{
    const items = installedItems(inventory, catalog, (_row, registration) => `claude mcp remove ${registration.name} -s ${registration.scope}`);
    return packed(items, { id: 'remove', question: 'which do you want to remove?', none: 'remove nothing' });
}

// cursor-name-taken (spec D2): Cursor's file already holds a name the plan writes for Cursor, one the list does not mark
// for it - the user's own, or one from before this design. 'Replace' is recommended when the entry there is the same
// row's server (`sameRow`), 'Keep' when it is another server under that name. The id carries the file, since each
// workspace member's file can hold the name. -> { question, answers: { <label>: 'replace' | 'keep' } }
export function cursorNameQuestion({ file, name, sameRow }: Taken): Asked<string>
{
    const replace = { label: "Replace it with the plugin's", description: 'Cursor gets the same entry as Claude Code; the old one is dropped, not saved', value: 'replace' };
    const keep = { label: "Keep Cursor's own", description: `${name} is set up for Claude Code only, and Cursor's entry stays as it is`, value: 'keep' };
    const options = (sameRow ? [replace, keep] : [keep, replace]).map((option, i) => ({ ...option, label: `${option.label}${i === 0 ? RECOMMENDED_SUFFIX : ''}` }));
    return {
        question: { id: `cursor-name-${name}@${file}`, header: 'Cursor', multiSelect: false, question: `Cursor's ${file} already has a server named ${name} that alfred-tools did not write. What should happen?`, options: options.map(({ label, description }) => ({ label, description })) },
        answers: Object.fromEntries(options.map((option) => [option.label, option.value])),
    };
}

// drift and drift-missing (spec D9): a list entry whose copy in one app was edited or removed by hand. Keeping the edit
// is recommended - a hand edit is deliberate - unless the copy holds a key-shaped string outside its key field: then
// Restore or Leave. An inherited copy (a workspace member's, D4a) is the folder above's: Restore from it or Leave.
// f: { name, scope, app, change, keyGuard, keyEmpty, rowGone, inherited } -> { question, answers: { <label>: value } }
export function driftQuestion(driftAsk: DriftAsk): Asked<string>
{
    const app = driftAsk.appLabel || (driftAsk.app === 'cursor' ? 'Cursor' : 'Claude Code');
    const restore = { label: 'Restore from the list', description: `${app} gets the list's entry back`, value: 'restore' };
    let text = `${driftAsk.name} in ${app} differs from the plugin's list. Which should stay?`;
    let options: (QuestionOption & { value: string })[];
    if (driftAsk.inherited)
    {
        text = driftAsk.change === 'missing' ? `${driftAsk.name} from ${driftAsk.inherited} is no longer in Cursor's file here. What should happen?` : `${driftAsk.name} in Cursor differs from ${driftAsk.inherited}'s list. Which should stay?`;
        options = [{ label: `Restore from ${driftAsk.inherited}`, description: `Cursor gets ${driftAsk.inherited}'s entry back`, value: 'restore' }, { label: 'Leave it as it is', description: `nothing changes; configure in ${driftAsk.inherited} changes it there`, value: 'leave' }];
    }
    else if (driftAsk.change === 'missing')
    {
        text = `${driftAsk.name} is on the plugin's list for ${app} but ${app} no longer has it. What should happen?`;
        options = [{ label: `Take ${app} off its list entry`, description: 'the server stays in the other app; with no app left, the entry leaves the list', value: 'drop' }, restore];
    }
    else if (driftAsk.keyGuard) options = [restore, { label: `Leave ${app}'s copy as it is`, description: 'the copy holds what looks like a key outside its key field, so it is copied nowhere; fix asks again next run', value: 'leave' }];
    else if (driftAsk.keyEmpty) options = [restore, { label: `Leave ${app}'s copy as it is`, description: 'its key field is empty - keeping it would blank the key in the other app; fix asks again next run', value: 'leave' }];
    else options = [{ label: `Keep the change in ${app}`, description: driftAsk.rowGone ? 'the list lets go of it - it is no longer the plugin\'s server' : 'the list and the other app take the edited entry', value: 'keep' }, restore];
    const marked = options.map((option, i) => ({ ...option, label: `${option.label}${i === 0 ? RECOMMENDED_SUFFIX : ''}` }));
    return {
        question: { id: `drift-${driftAsk.app}-${driftAsk.name}~${driftAsk.scope}`, header: 'Drift', multiSelect: false, question: text, options: marked.map(({ label, description }) => ({ label, description })) },
        answers: Object.fromEntries(marked.map((option) => [option.label, option.value])),
    };
}

// cursor-offer (spec D9): update's offer, once per root, to set up for Cursor the servers its list has for Claude Code
// only. The id names the root, so the answer goes back as --input cursor-offer:<root>=set|declined.
export function cursorOfferQuestion(root: string, serverCount: number | string, signIns: string[] = []): Asked<string>
{
    const options = [
        { label: `Set them up for Cursor too${RECOMMENDED_SUFFIX}`, description: `each server is written to Cursor's mcp.json, as configure's app change would do${signIns.length ? `; ${signIns.join(', ')} move to one browser sign-in shared with Cursor - sign in once before your next session` : ''}`, value: 'set' },
        { label: 'Not now', description: 'nothing changes, and update does not ask again for this root', value: 'declined' },
    ];
    return {
        question: { id: `cursor-offer:${root}`, header: 'Cursor', multiSelect: false, question: `Cursor is on this machine, and the ${serverCount} servers in ${root} are set up for Claude Code only. Set them up for Cursor too?`, options: options.map(({ label, description }) => ({ label, description })) },
        answers: Object.fromEntries(options.map((option) => [option.label, option.value])),
    };
}

// The apps a server is set up for (spec D3). Install asks once a run, 'Claude Code and Cursor' recommended when Cursor is
// found; configure asks per server, what the list entry has now first. -> { question, answers: { <label>: clients } }
const CLIENTS = [
    { label: 'Claude Code and Cursor', description: "each server is written to .mcp.json or your account and to Cursor's mcp.json", value: ['claude', 'cursor'] },
    { label: 'Claude Code only', description: 'Cursor is left as it is', value: ['claude'] },
];
function clientsOptions(firstIsCursor: boolean): { options: QuestionOption[]; answers: Record<string, string[]> }
{
    const options = (firstIsCursor ? CLIENTS : [...CLIENTS].reverse()).map((option, i) => ({ ...option, label: `${option.label}${i === 0 ? RECOMMENDED_SUFFIX : ''}` }));
    return { options: options.map(({ label, description }) => ({ label, description })), answers: Object.fromEntries(options.map((option) => [option.label, option.value])) };
}
export function clientsQuestion(found: boolean): Asked<string[]>
{
    const { options, answers } = clientsOptions(found);
    return { question: { id: 'clients', header: 'Apps', multiSelect: false, question: 'Which apps should these servers be set up for?', options }, answers };
}
// configure: `current` is the list entry's clients (none listed yet: Claude Code only)
export function targetClientsQuestion(key: string, name: string, current: string[] | null | undefined): Asked<string[]>
{
    const { options, answers } = clientsOptions((current || []).includes('cursor'));
    return { question: { id: `clients-${key}`, header: 'Apps', multiSelect: false, question: `Set up ${name} for which apps?`, options }, answers };
}

// rewind (spec D1b): which recorded pick to answer again, the one recorded last first. A fifth pick or more shows the three
// last and 'Another one', whose pick is asked next in plain chat; a lone pick gets 'Change nothing' to keep two options.
export function rewindQuestion(picks: Picks, labelOf: (pick: string) => string): Asked<string> | null
{
    const recorded = recordedPicks(picks);
    if (recorded.length === 0) return null;
    const more = recorded.length > REWIND_MAX_OPTIONS;
    const shown = recorded.slice(0, more ? REWIND_MAX_OPTIONS - 1 : REWIND_MAX_OPTIONS);
    const taken = new Set<string>();
    const options = shown.map((pick, i) =>
    {
        const base = labelOf(pick);
        const unique = taken.has(base) ? `${base} (${pick})` : base;
        taken.add(unique);
        return { label: `${unique}${i === 0 ? RECOMMENDED_SUFFIX : ''}`, description: 'answer its questions again', value: pick };
    });
    if (more) options.push({ label: 'Another one', description: 'named next', value: REWIND_ANOTHER });
    if (recorded.length === 1) options.push({ label: 'Change nothing', description: 'go back to the plan', value: '' });
    return {
        question: { id: 'rewind', header: 'Change', multiSelect: false, question: 'Which answers do you want to change?', options: options.map(({ label, description }) => ({ label, description })) },
        answers: Object.fromEntries(options.map((option) => [option.label, option.value])),
    };
}

// The fixed asks of the commands, here so a test holds them to the limits.
export const STATIC = {
    menu: { id: 'menu', header: 'Action', multiSelect: false, question: 'What do you want to change?', options: [
        { label: `Change tools${RECOMMENDED_SUFFIX}`, description: 'pick installed tools, servers on their own or a root folder, then what to change' },
        { label: 'Remove tools', description: 'choose the servers to remove' },
        { label: 'Done', description: 'nothing changes' } ] },
    settings: { id: 'settings', header: 'Settings', multiSelect: false, question: 'How do you want to set the tools up?', options: [
        { label: `Use the recommended settings for all${RECOMMENDED_SUFFIX}`, description: 'route, scope, name and location as recommended' },
        { label: 'Set each tool', description: 'ask route, scope, name and location per tool' } ] },
    // one pick (spec F1): the same choice, about that tool alone
    settingsOne: (tool: string): Question => ({ id: 'settings', header: 'Settings', multiSelect: false, question: `How do you want to set ${tool} up?`, options: [
        { label: `Use the recommended settings for ${tool}${RECOMMENDED_SUFFIX}`, description: 'route, scope, name and location as recommended' },
        { label: `Set ${tool} up`, description: 'ask its route, scope, name and location' } ] }),
    apply: { id: 'apply', header: 'Apply', multiSelect: false, question: 'Apply this plan?', options: [
        { label: `Apply${RECOMMENDED_SUFFIX}`, description: 'runs the calls above in order, stops at the first failure' },
        { label: 'Change something', description: 'go back to the answers' },
        { label: 'Cancel', description: 'nothing is applied' } ] },
    removeFirst: { id: 'remove-first', header: 'Remove', multiSelect: false, question: 'Remove what?', options: [
        { label: `Pick which${RECOMMENDED_SUFFIX}`, description: 'choose the servers to remove' },
        { label: 'Cancel', description: 'nothing is removed' } ] },
    signInNow: { id: 'sign-in-now', header: 'Sign in', multiSelect: false, question: 'Sign in to the new server now?', options: [
        { label: `Sign in now${RECOMMENDED_SUFFIX}`, description: 'opens your browser and waits up to five minutes; the sign-in is kept in the root and serves Claude Code and Cursor' },
        { label: 'At the next session start', description: 'its first start then opens the browser inside Claude Code\'s 30-second limit, and /mcp reconnects it after' } ] },
    fixOffer: { id: 'fix-offer', header: 'Fix', multiSelect: false, question: 'Apply the fixes found?', options: [
        { label: `Apply all found${RECOMMENDED_SUFFIX}`, description: 'apply every fix listed that can be applied' },
        { label: 'Pick which', description: 'choose among them' },
        { label: 'Skip', description: 'nothing changes' } ] },
    updateOffer: { id: 'update-offer', header: 'Update', multiSelect: false, question: 'Update what is behind?', options: [
        { label: `All of them${RECOMMENDED_SUFFIX}`, description: 'update everything offered' },
        { label: 'Pick which', description: 'choose among them' },
        { label: 'Skip', description: 'nothing changes' } ] },
    prereqMissing: (tool: string, need: string): Question => ({ id: `prereq-${tool}`, header: 'Missing', multiSelect: false, question: `${tool} needs ${need}, which is missing. What now?`, options: [
        { label: `Skip this tool${RECOMMENDED_SUFFIX}`, description: 'leave it out of the plan' },
        { label: 'Install it now', description: 'run the install line shown, or install it yourself and re-check' },
        { label: 'Register anyway', description: 'register it; it will not start until the prerequisite is there' } ] }),
    prereqInstalled: (tool: string, need: string): Question => ({ id: `prereq-installed-${tool}`, header: 'Installed?', multiSelect: false, question: `Is ${need} installed for ${tool} now?`, options: [
        { label: `Check again${RECOMMENDED_SUFFIX}`, description: 'run the prerequisite check again' },
        { label: 'Skip this tool', description: 'leave it out of the plan' } ] }),
    clients: clientsQuestion(true).question,
    // a STATIC function whose labels hold placeholders names them, so tests/ask-blocks.ts fills the block's own
    'cursor-name-taken': Object.assign((file: string, name: string) => cursorNameQuestion({ file, name, sameRow: true }).question, { placeholders: ['<file>', '<name>'] }),
    'cursor-offer': Object.assign((serverCount: number | string, root: string) => cursorOfferQuestion(root, serverCount).question, { placeholders: ['<n>', '<root>'] }),
    drift: Object.assign((name: string, app: string) => driftQuestion({ name, scope: 'local', app: 'claude', appLabel: app, change: 'differs' }).question, { placeholders: ['<name>', '<app>'] }),
    'drift-missing': Object.assign((name: string, app: string) => driftQuestion({ name, scope: 'local', app: 'claude', appLabel: app, change: 'missing' }).question, { placeholders: ['<name>', '<app>'] }),
};

