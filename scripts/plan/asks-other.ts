'use strict';
// The other questions: a tool's own ask, remove, Cursor, drift, the apps, and the static ones.
const { REC, keyStateOf } = require('./asks-keys.ts');
const { installedItems, packed } = require('./asks-picks.ts');
const { scopeQuestion, nameQuestion, scopeOrder, nameFor } = require('./asks-tool.ts');
const { locationQuestion } = require('./asks-location.ts');

// The questions for one tool. A row with a data folder asks scope and name `first`, in a call of their own, because its
// folder is named after the registration and depends on the scope; then `questions` holds the location (built for
// `scope` and `name`, else the recommended scope and the name it has now or the original) and one tool-specific extra,
// and `answers` maps each location label to its entry; `only` is the location when one place is left and none is
// asked. Any other row has `first` null and asks scope, name and its extra in one call, as before.
function toolAsk(row, inv, { route, scope = null, name = null, current = null, ctx = null, catalog, copyOf = [] } = {})
{
    const routeId = route || (current && current.route) || row.recommendedRoute;
    const scopeQ = scopeQuestion(row, inv, { route: routeId, current, copyOf, ctx });
    const nameQ = nameQuestion(row, inv, { current, copyOf, ctx });
    const located = Boolean(row.locations && ctx);
    const qs = located ? [] : [scopeQ, nameQ].filter(Boolean);
    let answers = {};
    // one place left: no location question, and the walk writes this as the location (a move must not fall back to
    // 'keep' where the folder it uses now cannot stay)
    let only = null;
    // the scope the questions are built for: the one asked first, else the recommended one
    const at = ctx ? scope || scopeOrder(row, inv, { route: routeId, current, copyOf, ctx })[0] || (current && current.scope) : scope;
    if (located)
    {
        const l = locationQuestion(row, inv, { scope: at, name: nameFor(row, name, current, ctx), current, copyOf, ctx });
        if (l.question) qs.push(l.question);
        else only = l.only;
        answers = l.answers;
    }
    // what the registration has now goes first, so a configure walk recommends keeping it
    const first = (opts, keepFirst) => (keepFirst ? [opts[1], opts[0]] : opts).map((o, i) => ({ ...o, label: `${o.label}${i === 0 ? REC : ''}` }));
    const sameRoute = current && current.route === routeId;
    // every extra that applies, in the spec's order: the browser binary, the host, the API key (spec F1)
    if (row.routes[routeId].optionalArgs && row.routes[routeId].optionalArgs.executablePath)
    {
        const has = Boolean(sameRoute && current.executablePath);
        const named = { label: 'A browser binary I name', description: 'sets --executable-path to the binary you name, asked next' };
        const engine = { label: 'Default for this engine', description: has ? 'drops --executable-path' : row.id.endsWith('chrome') || row.id.endsWith('msedge') ? 'the branded browser installed on this machine' : "Playwright's own build" };
        qs.push({
            id: `browser-${row.id}`, header: 'Browser', multiSelect: false, question: `${row.label}: which browser binary?`,
            options: has
                ? first([{ label: `Keep \`${current.executablePath}\``, description: 'the binary it uses now' }, engine])
                : first([engine, named]),
        });
    }
    if (row.params)
    {
        const host = current && current.host && current.host !== row.params[0].default ? current.host : null;
        qs.push({
            id: `host-${row.id}`, header: 'Host', multiSelect: false, question: `${row.label}: which ${row.params[0].label}?`,
            options: host
                ? first([{ label: `Keep ${host}`, description: 'the host it uses now' }, { label: row.params[0].default, description: 'the hosted service' }])
                : first([{ label: row.params[0].default, description: 'the hosted service' }, { label: 'A self-managed host', description: 'your own GitLab host name, asked next' }]),
        });
    }
    // an optional key (spec D5, F2): asked at every scope but for a stdio route at project scope, which runs keyless; the
    // key first at install, what the registration has now first at configure
    if (row.routes[routeId].authMode === 'optional-token' && !(routeId !== 'remote' && at === 'project'))
    {
        const route = row.routes[routeId];
        const ks = keyStateOf(row, routeId, ctx, inv.alfredCodeEnabled, at || 'user');
        const file = ks && ks.files[0];
        const hint = route.helper && route.helper.hint ? `; ${route.helper.hint}` : '';
        const useKey = route.helper
            ? { label: 'Use a key from .mcps-secrets', description: `mcp-headers.js reads it each time Claude Code connects${file ? `, from ${file} first` : ''} - never written into the registration${hint}` }
            : { label: 'Use a key from .mcps-secrets', description: `the apply writes it into the registration from ${file || '.mcps-secrets'}, never printed` };
        const noKey = route.keyless === 'oauth'
            ? { label: 'Sign in with OAuth', description: 'run /mcp once in a session to log in' }
            : { label: 'No key - lower rate limits', description: 'works anonymously' };
        qs.push({
            id: `token-${row.id}`, header: 'API key', multiSelect: false, question: `${row.label}: send an API key?`,
            options: first([noKey, useKey], current ? Boolean(sameRoute && current.token) : true),
        });
    }
    return { first: located ? [scopeQ, nameQ].filter(Boolean) : null, questions: qs, answers, only };
}

// The questions toolAsk gives after `first`: for a row without a data folder, its whole call.
const toolQuestions = (row, inv, opts = {}) => toolAsk(row, inv, opts).questions;

// Remove: one option per registration (a row at two scopes is two options), grouped; the description is the exact
// command, which the walk reads the target from.
function removeQuestions(inv, catalog)
{
    const items = installedItems(inv, catalog, (row, h) => `claude mcp remove ${h.name} -s ${h.scope}`);
    return packed(items, { id: 'remove', question: 'which do you want to remove?', none: 'remove nothing' });
}

// cursor-name-taken (spec D2): Cursor's file already holds a name the plan writes for Cursor, one the list does not mark
// for it - the user's own, or one from before this design. 'Replace' is recommended when the entry there is the same
// row's server (`sameRow`), 'Keep' when it is another server under that name. The id carries the file, since each
// workspace member's file can hold the name. -> { question, answers: { <label>: 'replace' | 'keep' } }
function cursorNameQuestion({ file, name, sameRow })
{
    const replace = { label: "Replace it with the plugin's", description: 'Cursor gets the same entry as Claude Code; the old one is dropped, not saved', value: 'replace' };
    const keep = { label: "Keep Cursor's own", description: `${name} is set up for Claude Code only, and Cursor's entry stays as it is`, value: 'keep' };
    const opts = (sameRow ? [replace, keep] : [keep, replace]).map((o, i) => ({ ...o, label: `${o.label}${i === 0 ? REC : ''}` }));
    return {
        question: { id: `cursor-name-${name}@${file}`, header: 'Cursor', multiSelect: false, question: `Cursor's ${file} already has a server named ${name} that preferred-tools did not write. What should happen?`, options: opts.map(({ label, description }) => ({ label, description })) },
        answers: Object.fromEntries(opts.map((o) => [o.label, o.value])),
    };
}

// drift and drift-missing (spec D9): a list entry whose copy in one app was edited or removed by hand. Keeping the edit
// is recommended - a hand edit is deliberate - unless the copy holds a key-shaped string outside its key field: then
// Restore or Leave. An inherited copy (a workspace member's, D4a) is the folder above's: Restore from it or Leave.
// f: { name, scope, app, change, keyGuard, keyEmpty, rowGone, inherited } -> { question, answers: { <label>: value } }
function driftQuestion(f)
{
    const app = f.appLabel || (f.app === 'cursor' ? 'Cursor' : 'Claude Code');
    const restore = { label: 'Restore from the list', description: `${app} gets the list's entry back`, value: 'restore' };
    let text = `${f.name} in ${app} differs from the plugin's list. Which should stay?`;
    let opts;
    if (f.inherited)
    {
        text = f.change === 'missing' ? `${f.name} from ${f.inherited} is no longer in Cursor's file here. What should happen?` : `${f.name} in Cursor differs from ${f.inherited}'s list. Which should stay?`;
        opts = [{ label: `Restore from ${f.inherited}`, description: `Cursor gets ${f.inherited}'s entry back`, value: 'restore' }, { label: 'Leave it as it is', description: `nothing changes; configure in ${f.inherited} changes it there`, value: 'leave' }];
    }
    else if (f.change === 'missing')
    {
        text = `${f.name} is on the plugin's list for ${app} but ${app} no longer has it. What should happen?`;
        opts = [{ label: `Take ${app} off its list entry`, description: 'the server stays in the other app; with no app left, the entry leaves the list', value: 'drop' }, restore];
    }
    else if (f.keyGuard) opts = [restore, { label: `Leave ${app}'s copy as it is`, description: 'the copy holds what looks like a key outside its key field, so it is copied nowhere; fix asks again next run', value: 'leave' }];
    else if (f.keyEmpty) opts = [restore, { label: `Leave ${app}'s copy as it is`, description: 'its key field is empty - keeping it would blank the key in the other app; fix asks again next run', value: 'leave' }];
    else opts = [{ label: `Keep the change in ${app}`, description: f.rowGone ? 'the list lets go of it - it is no longer the plugin\'s server' : 'the list and the other app take the edited entry', value: 'keep' }, restore];
    const marked = opts.map((o, i) => ({ ...o, label: `${o.label}${i === 0 ? REC : ''}` }));
    return {
        question: { id: `drift-${f.app}-${f.name}~${f.scope}`, header: 'Drift', multiSelect: false, question: text, options: marked.map(({ label, description }) => ({ label, description })) },
        answers: Object.fromEntries(marked.map((o) => [o.label, o.value])),
    };
}

// cursor-offer (spec D9): update's offer, once per root, to set up for Cursor the servers its list has for Claude Code
// only. The id names the root, so the answer goes back as --input cursor-offer:<root>=set|declined.
function cursorOfferQuestion(root, n)
{
    const opts = [
        { label: `Set them up for Cursor too${REC}`, description: "each server is written to Cursor's mcp.json, as configure's app change would do", value: 'set' },
        { label: 'Not now', description: 'nothing changes, and update does not ask again for this root', value: 'declined' },
    ];
    return {
        question: { id: `cursor-offer:${root}`, header: 'Cursor', multiSelect: false, question: `Cursor is on this machine, and the ${n} servers in ${root} are set up for Claude Code only. Set them up for Cursor too?`, options: opts.map(({ label, description }) => ({ label, description })) },
        answers: Object.fromEntries(opts.map((o) => [o.label, o.value])),
    };
}

// The apps a server is set up for (spec D3). Install asks once a run, 'Claude Code and Cursor' recommended when Cursor is
// found; configure asks per server, what the list entry has now first. -> { question, answers: { <label>: clients } }
const CLIENTS = [
    { label: 'Claude Code and Cursor', description: "each server is written to .mcp.json or your account and to Cursor's mcp.json", value: ['claude', 'cursor'] },
    { label: 'Claude Code only', description: 'Cursor is left as it is', value: ['claude'] },
];
function clientsOptions(firstIsCursor)
{
    const opts = (firstIsCursor ? CLIENTS : [...CLIENTS].reverse()).map((o, i) => ({ ...o, label: `${o.label}${i === 0 ? REC : ''}` }));
    return { options: opts.map(({ label, description }) => ({ label, description })), answers: Object.fromEntries(opts.map((o) => [o.label, o.value])) };
}
function clientsQuestion(found)
{
    const { options, answers } = clientsOptions(found);
    return { question: { id: 'clients', header: 'Apps', multiSelect: false, question: 'Which apps should these servers be set up for?', options }, answers };
}
// configure: `current` is the list entry's clients (none listed yet: Claude Code only)
function targetClientsQuestion(key, name, current)
{
    const { options, answers } = clientsOptions((current || []).includes('cursor'));
    return { question: { id: `clients-${key}`, header: 'Apps', multiSelect: false, question: `Set up ${name} for which apps?`, options }, answers };
}

// The fixed asks of the commands, here so a test holds them to the limits.
const STATIC = {
    menu: { id: 'menu', header: 'Action', multiSelect: false, question: 'What do you want to change?', options: [
        { label: `Change tools${REC}`, description: 'pick installed tools, servers on their own or a root folder, then what to change' },
        { label: 'Remove tools', description: 'choose the servers to remove' },
        { label: 'Done', description: 'nothing changes' } ] },
    settings: { id: 'settings', header: 'Settings', multiSelect: false, question: 'How do you want to set the tools up?', options: [
        { label: `Use the recommended settings for all${REC}`, description: 'route, scope, name and location as recommended' },
        { label: 'Set each tool', description: 'ask route, scope, name and location per tool' } ] },
    // one pick (spec F1): the same choice, about that tool alone
    settingsOne: (tool) => ({ id: 'settings', header: 'Settings', multiSelect: false, question: `How do you want to set ${tool} up?`, options: [
        { label: `Use the recommended settings for ${tool}${REC}`, description: 'route, scope, name and location as recommended' },
        { label: `Set ${tool} up`, description: 'ask its route, scope, name and location' } ] }),
    apply: { id: 'apply', header: 'Apply', multiSelect: false, question: 'Apply this plan?', options: [
        { label: `Apply${REC}`, description: 'runs the calls above in order, stops at the first failure' },
        { label: 'Change something', description: 'go back to the answers' },
        { label: 'Cancel', description: 'nothing is applied' } ] },
    removeFirst: { id: 'remove-first', header: 'Remove', multiSelect: false, question: 'Remove what?', options: [
        { label: `Pick which${REC}`, description: 'choose the servers to remove' },
        { label: 'Cancel', description: 'nothing is removed' } ] },
    fixOffer: { id: 'fix-offer', header: 'Fix', multiSelect: false, question: 'Apply the fixes found?', options: [
        { label: `Apply all found${REC}`, description: 'apply every fix listed that can be applied' },
        { label: 'Pick which', description: 'choose among them' },
        { label: 'Skip', description: 'nothing changes' } ] },
    updateOffer: { id: 'update-offer', header: 'Update', multiSelect: false, question: 'Update what is behind?', options: [
        { label: `All of them${REC}`, description: 'update everything offered' },
        { label: 'Pick which', description: 'choose among them' },
        { label: 'Skip', description: 'nothing changes' } ] },
    prereqMissing: (tool, need) => ({ id: `prereq-${tool}`, header: 'Missing', multiSelect: false, question: `${tool} needs ${need}, which is missing. What now?`, options: [
        { label: `Skip this tool${REC}`, description: 'leave it out of the plan' },
        { label: 'Install it now', description: 'run the install line shown, or install it yourself and re-check' },
        { label: 'Register anyway', description: 'register it; it will not start until the prerequisite is there' } ] }),
    clients: clientsQuestion(true).question,
    // a STATIC function whose labels hold placeholders names them, so tests/ask-blocks.ts fills the block's own
    'cursor-name-taken': Object.assign((file, name) => cursorNameQuestion({ file, name, sameRow: true }).question, { placeholders: ['<file>', '<name>'] }),
    'cursor-offer': Object.assign((n, root) => cursorOfferQuestion(root, n).question, { placeholders: ['<n>', '<root>'] }),
    drift: Object.assign((name, app) => driftQuestion({ name, scope: 'local', app: 'claude', appLabel: app, change: 'differs' }).question, { placeholders: ['<name>', '<app>'] }),
    'drift-missing': Object.assign((name, app) => driftQuestion({ name, scope: 'local', app: 'claude', appLabel: app, change: 'missing' }).question, { placeholders: ['<name>', '<app>'] }),
};

module.exports = { cursorNameQuestion, cursorOfferQuestion, driftQuestion, clientsQuestion, targetClientsQuestion, toolQuestions, toolAsk, removeQuestions, STATIC };
