import { pathApiOf } from '../entries/platform.ts';
import { installedOf } from '../inventory/inventory.ts';
import * as roots from '../roots/roots.ts';
import { RECOMMENDED_SUFFIX } from './asks-keys.ts';
import { PREFIX, WALK_CHOICES, WALK_QUESTION } from './record-constants.ts';
import { rootInUse } from './asks-picks.ts';
import { scopeOrder } from './asks-tool.ts';
import { STATIC } from './asks-other.ts';
import { needsRoot } from './asks-roots.ts';
import { allQuestions } from './asks-all.ts';
import { homeDir } from '../core/account.ts';
import type { Catalog } from '../catalog/types.ts';
import type { Inventory } from '../inventory/types.ts';
import type { AskOptions, Asked, Picks, Question, Questions, ToolBlock, WalkStep, LocationAnswer } from './types.ts';

// ---- the walk (spec F1) ---------------------------------------------------------------------------------------------

// configure's first question for a registration (spec F4): who looks after it. `root`: the folder its family's list
// would sit in. -> { question, answers: { <label as shown>: { key, choice } } }
export function ownStep(item: { key: string; name?: string | undefined; scope?: string | null | undefined }, root: string): Asked<{ key: string; choice: string }>
{
    const pathApi = pathApiOf(String(root));
    const file = pathApi.join(root, roots.FILES.list);
    const where = item.scope === 'project' ? '; in .mcp.json it sits with your own servers, after the managed ones' : '';
    const options = [
        { label: `alfred-tools${RECOMMENDED_SUFFIX}`, description: 'configure, update and fix look after it', choice: 'manage' },
        { label: 'Leave it on its own', description: `nothing in this plugin changes its entry again${where}; saved in ${file}`, choice: 'own' },
    ];
    return {
        question: { id: `${PREFIX.own}${item.key}`, header: 'Looked after', multiSelect: false, question: `Who looks after ${item.name}?`, options: options.map(({ label, description }) => ({ label, description })) },
        answers: Object.fromEntries(options.map((option) => [option.label, { key: item.key, choice: option.choice }])),
    };
}

// The tools in the order the pick lists show them: catalog group order, then catalog order.
function pickOrder(catalog: Catalog, ids: string[]): string[]
{
    const rank = new Map<string, number>();
    for (const group of catalog.groups) for (const row of catalog.tools.filter((candidate) => candidate.group === group.id)) rank.set(row.id, rank.size);
    const ranked = ids.flatMap((id) => { const at = rank.get(id); return at === undefined ? [] : [{ id, at }]; });
    return ranked.sort((left, right) => left.at - right.at).map(({ id }) => id);
}

// One step of the walk: the questions about one tool to ask now, or { id: 'done' } (spec F1). Install: `settings`, then
// per tool its route, `first` (scope and name, for a tool with a data folder), its whole call (a tool without one), the
// root of its family when this run has not answered it, its location and extras, its key name and settings. Configure:
// per target, who looks after it, then the same - a root target is its root question, a server left on its own its own
// question. A step with nothing to ask is passed over, but for one with a location to `set`. `picks`:
// install.md's and configure.md's picks.json - `done` the step ids answered, `walk` the settings answer, `tokens` the
// API key answers. `built`: allQuestions' output, when the caller has it.
// -> { id, tool, call, answers, set? } | { id: 'done' }
export function nextQuestion(inventory: Inventory, picks: Picks | null | undefined, catalog: Catalog, options: AskOptions = {}, built: Questions | null = null): WalkStep
{
    picks = picks || {};
    const builtQuestions = built || allQuestions(inventory, picks, catalog, options);
    const done = new Set(picks.done || []);
    const tokens = picks.tokens || {};
    const steps: WalkStep[] = [];
    const add = (id: string, tool: string | null, questions: (Question | null | undefined | false)[], answers: Record<string, unknown> = {}, set: { location: LocationAnswer } | null = null) =>
    {
        const call = questions.filter((question): question is Question => Boolean(question));
        const kept = Object.fromEntries(Object.entries(answers).filter(([questionId]) => call.some((question) => question.id === questionId)));
        if (call.length || set) steps.push({ id, tool, call, answers: kept, ...(set ? { set } : {}) });
    };
    const keyStep = (toolId: string) =>
    {
        // allQuestions always gives both maps; a tool with no entry in one has nothing to ask there
        const keyNameAsk = tokens[toolId] === false ? null : builtQuestions.keyNames?.[toolId];
        const settingsAsk = builtQuestions.settings?.[toolId];
        const excludeAsk = builtQuestions.excludes?.[toolId];
        const urlAsks = Object.values((builtQuestions.urlNames || {})[toolId] || {});
        add(`${toolId}:keys`, toolId, [keyNameAsk && keyNameAsk.question, ...urlAsks.map((urlAsk) => urlAsk.question), settingsAsk && settingsAsk.question, excludeAsk && excludeAsk.question], { ...(keyNameAsk ? { [keyNameAsk.question.id]: keyNameAsk.answers } : {}), ...Object.fromEntries(urlAsks.map((urlAsk) => [urlAsk.question.id, urlAsk.answers])), ...(settingsAsk ? { [settingsAsk.question.id]: settingsAsk.answers } : {}), ...(excludeAsk ? { [excludeAsk.question.id]: excludeAsk.answers } : {}) });
    };
    const toolSteps = (toolBlock: ToolBlock, id: string, rootStep: (() => void) | null) =>
    {
        const { first } = toolBlock;
        const located = first !== null && first !== undefined;
        add(`${id}:route`, id, [toolBlock.route]);
        if (located) add(`${id}:first`, id, first);
        else add(`${id}:questions`, id, toolBlock.questions || []);
        if (rootStep) rootStep();
        if (located)
        {
            const locationAsk = (toolBlock.questions || []).find((question) => question.id.startsWith(PREFIX.location));
            add(`${id}:questions`, id, toolBlock.questions || [], locationAsk ? { [locationAsk.id]: toolBlock.answers } : {}, toolBlock.only ? { location: toolBlock.only } : null);
        }
        keyStep(id);
    };

    if (picks.rows)
    {
        const rows = pickOrder(catalog, picks.rows);
        if (rows.length)
        {
            // which apps, first after the picks (spec D3)
            if (builtQuestions.clients) add(WALK_QUESTION.clients, null, [builtQuestions.clients.question], { [WALK_QUESTION.clients]: builtQuestions.clients.answers });
            const [first] = rows;
            const onlyRow = rows.length === 1 && first !== undefined ? catalog.byId.get(first) : undefined;
            const one = onlyRow ? STATIC.settingsOne(onlyRow.label) : STATIC.settings;
            // each option's answer, in WALK_CHOICES' order
            const choices = one.options.flatMap((option, i) => { const choice = WALK_CHOICES[i]; return choice === undefined ? [] : [[option.label, choice]]; });
            add(WALK_QUESTION.settings, null, [one], { [WALK_QUESTION.settings]: Object.fromEntries(choices) });
            if (picks.walk === WALK_CHOICES[0]) return steps.find((step) => !done.has(step.id)) || { id: 'done' };
        }
        const asked = new Set(Object.keys(picks.roots || {}));
        for (const id of rows)
        {
            const row = catalog.byId.get(id);
            const toolBlock = builtQuestions.tools[id];
            if (!row || !toolBlock) continue;
            const routeId = (picks.routes || {})[id] || row.recommendedRoute;
            const rootStep = () =>
            {
                if (!needsRoot(row, routeId)) return;
                const scope = (picks.scopes || {})[id] || scopeOrder(row, inventory, { route: routeId, context: null, copyOf: installedOf(inventory, id) })[0];
                const family = roots.familyOf(scope);
                if (asked.has(family)) return;
                asked.add(family);
                const rootAsks = builtQuestions.roots;
                const rootAsk = rootAsks?.questions.find((candidate) => candidate.id === `${PREFIX.root}${family}`);
                if (rootAsks && rootAsk) add(`root:${family}`, id, [rootAsk], { [rootAsk.id]: rootAsks.answers[rootAsk.id] });
            };
            toolSteps(toolBlock, id, rootStep);
        }
    }
    for (const key of picks.targets || [])
    {
        const toolBlock = builtQuestions.targets[key];
        if (!toolBlock || toolBlock.error) continue;
        if (toolBlock.kind === 'root' || toolBlock.kind === 'own')
        {
            const blockAsk = toolBlock.kind === 'root' ? toolBlock.root : toolBlock.own;
            if (!blockAsk) throw new Error(`${key}: a ${toolBlock.kind} target is built with its question`);
            add(toolBlock.kind === 'root' ? key : `${key}:own`, key, [blockAsk.question], { [blockAsk.question.id]: blockAsk.answers });
            continue;
        }
        if (toolBlock.kind === 'mcp')
        {
            const current = toolBlock.current;
            if (!current) throw new Error(`${key}: a registration target is built with its current registration`);
            const family = roots.familyOf(current.scope);
            const root = rootInUse(inventory, family, { ...(options.home ? { home: options.home } : {}), catalog });
            const fallback = roots.resolveRoots(inventory, picks.roots, { project: inventory.project, platform: inventory.os, home: options.home || homeDir(process.env), catalog }).roots[family];
            const folder = root ? root.path : fallback;
            if (folder === null || folder === undefined) throw new Error(`${key}: no ${family} root is in use or resolved for its list`);
            const ownAsk = ownStep({ key, name: current.name, scope: current.scope }, folder);
            add(`${key}:own`, key, [ownAsk.question], { [ownAsk.question.id]: ownAsk.answers });
            if ((picks.existing || {})[key] === 'own') continue;
        }
        toolSteps(toolBlock, key, null);
        if (toolBlock.clients) add(`${key}:clients`, key, [toolBlock.clients.question], { [toolBlock.clients.question.id]: toolBlock.clients.answers });
    }
    return steps.find((step) => !done.has(step.id)) || { id: 'done' };
}

