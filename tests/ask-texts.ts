// Every question the walk can put, for the 'no text sends the user to Other' rule (spec D8): tests/lint.ts checks the
// texts, tests/plan.test.ts and tests/roots.test.ts use the same pattern. One home for the pattern and the fixtures.
import * as catalogLib from '../scripts/catalog/catalog.ts';
import { all } from '../scripts/plan/asks-all.ts';
import { ownStep } from '../scripts/plan/walk.ts';
import * as existing from '../scripts/inventory/existing.ts';
import { plan } from '../scripts/plan/plan.ts';
import type { CatalogRow } from '../scripts/catalog/types.ts';
import type { Inventory, InvRegistration, PluginServer } from '../scripts/inventory/types.ts';
import type { Question } from '../scripts/plan/types.ts';

// alfred-code 3.9.2 stack/hooks/guard-stop-contract.js: an ask that sends the user to the Other field. 'under Other',
// which today's three typed values used, is not matched by it and is checked beside it.
export const OTHER_RE = /\b(?:in|into|via|through|using) (?:the )?['‘’]?Other\b|\btype (?:it|them|\w+) (?:in|into)\b[^.]{0,20}\bOther\b/;
export const sendsToOther = (text: unknown) => OTHER_RE.test(String(text)) || /under Other/.test(String(text));

const MAC = { os: 'darwin', arch: 'arm64', project: '/work/shop' };
const WIN = { os: 'win32', arch: 'x64', project: 'C:\\my work\\shop' };
// Task 4's four fixtures: macOS and a spaced Windows project and profile, each without and with alfred-code
const FIXTURES = [[MAC, '/Users/me', false], [MAC, '/Users/me', true], [WIN, 'C:\\Users\\Jo Doe', false], [WIN, 'C:\\Users\\Jo Doe', true]] as [{ os: string; arch: string; project: string }, string, boolean][];
const CONNECTORS = ['Context7', 'GitHub', 'Sentry', 'Atlassian_Rovo', 'GitLab'];

const inv = (base: { os: string; arch: string; project: string }, extra: Partial<Inventory> = {}): Inventory => ({ version: 1, ...base, cli: { ok: true }, unreadable: [], registrations: [], plugins: [], marketplaces: [], alfredCodeEnabled: false, sources: {}, ...extra } as Inventory);
const callsOf = (x: Question[][] | { calls: Question[][] } | null) => (Array.isArray(x) ? x : (x && x.calls) || []).flat();
const qOf = (x: { question?: Question } | null | undefined): Question[] => (x && x.question ? [x.question] : []);

// -> [{ where, question }] over the four fixtures: the static asks, the picks, configure's groups and removes, every tool's
// and every target's questions, the roots, the key names, the settings, a bridge's URL names, the servers already set up
// and those on their own.
export function walkQuestions(): { where: string; question: Question }[]
{
    const catalog = catalogLib.load();
    const out: { where: string; question: Question }[] = [];
    for (const [base, home, alfred] of FIXTURES)
    {
        const where = `${base.os}${alfred ? ' with alfred-code' : ''}`;
        const rows = catalog.tools.filter((r: CatalogRow & { platforms?: string[] }) => r.kind === 'mcp' && !(r.platforms && !r.platforms.includes(base.os)));
        // every MCP row installed once, so each gets a configure target
        const regs = rows.map((r) =>
        {
            const p = plan(inv(base), { picks: { [r.id]: {} } }, { home, env: {}, exists: () => false, machine: { docker: true } });
            const s = p.steps.find((x) => x.op === 'mcp-add');
            return s && { name: s.name, scope: s.scope, entry: s.entry, rowId: r.id, route: s.route, own: false, alfredRetired: false };
        }).filter(Boolean) as InvRegistration[];
        const pluginServers = [{ plugin: 'other-plugin@market', server: 'context7', rowId: 'context7', entry: { type: 'http', url: 'https://mcp.context7.com/mcp' } }] as PluginServer[];
        const i = inv(base, { alfredCodeEnabled: alfred, registrations: regs, pluginServers });
        const q = all(i, { rows: catalog.tools.map((r) => r.id), targets: regs.map((r) => `mcp:${r.name}~${r.scope}`) }, catalog, { env: {}, home });
        const items = existing.items(i, CONNECTORS, catalog, { home, exists: () => false });
        // every bridge route (0.4.0): its tool questions and its URL-name questions
        const bridged = rows.filter((r) => Object.values(r.routes).some((x) => x.runtime === 'bridge'));
        const qb = all(i, { rows: bridged.map((r) => r.id), routes: Object.fromEntries(bridged.map((r) => [r.id, Object.keys(r.routes).find((k) => r.routes[k]!.runtime === 'bridge')])) as Record<string, string> }, catalog, { env: {}, home });
        const list = [
            ...(Object.values(q.static) as Question[]).filter((x) => x.options), ...callsOf(q.pick), ...callsOf(q.change), ...callsOf(q.remove), ...q.roots!.questions,
            ...Object.values(q.tools).flatMap((t) => [...(t.first || []), ...(t.questions || []), ...(t.route ? [t.route] : [])]),
            ...Object.values(q.targets).flatMap((t) => [...(t.first || []), ...(t.questions || []), ...(t.route ? [t.route] : [])]),
            ...Object.values(q.keyNames!).flatMap(qOf), ...Object.values(q.settings!).flatMap(qOf),
            ...Object.values(qb.tools).flatMap((t) => [...(t.first || []), ...(t.questions || [])]), ...Object.values(qb.keyNames!).flatMap(qOf),
            ...Object.values(qb.urlNames!).flatMap((m) => Object.values(m).flatMap(qOf)),
            ...items.flatMap((it) => qOf(existing.ownQuestion(it))),
            // the walk's own question for each registration target (spec F4)
            ...regs.map((r) => ownStep({ key: `mcp:${r.name}~${r.scope}`, name: r.name, scope: r.scope }, `${base.project}${base.os === 'win32' ? '\\' : '/'}.preferred-tools`).question),
        ];
        for (const question of list) out.push({ where, question });
    }
    return out;
}

// -> [{ where, text }]: each question's text, header, and each option's label and description
export const walkTexts = () => walkQuestions().flatMap(({ where, question: x }) =>
    [x.question, x.header, ...x.options.flatMap((o) => [o.label, o.description])].filter(Boolean).map((text) => ({ where, text })));

