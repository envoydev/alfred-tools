// The update's asks, as data.
import { RECOMMENDED_SUFFIX } from '../plan/asks-keys.ts';
import { chunk } from '../plan/asks-picks.ts';
import { cursorNameQuestion, STATIC, cursorOfferQuestion } from '../plan/asks-other.ts';
import type { Question } from '../plan/types.ts';
import type { CursorOffer, UpdateCheck } from './types.ts';

// ---- asks ------------------------------------------------------------------------------------------------------------

// The asks as data: the offer (single-select), then the pick lists for 'Pick which' - multi-selects of at most four options,
// one group per kind, at most four questions a call.
export function questions(out: UpdateCheck)
{
    const items = [...out.offers, ...out.unchecked];
    // Cursor's offer, one per root, and the names Cursor already has, asked right after 'Set them up for Cursor too'
    const cursor = { cursorOffers: (out.cursorOffers || []).map(cursorOfferAsk), cursorNameQuestions: (out.cursorOffers || []).flatMap((o) => o.taken.map((t) => cursorNameQuestion(t))) };
    if (!items.length) return { offer: null, pick: [], ...cursor };
    const groups = [['catalog', 'Catalog plugins'], ['other', 'Other plugins'], ['mcp', 'MCP servers'], ['helper', 'Key helpers'], ['upgrade', 'New ways to pass data', 'Data passing']] as [string, string, string?][];
    const qs: Question[] = [];
    for (const [g, title, header] of groups)
    {
        const list = items.filter((o) => o.group === g);
        chunk(list, 4).forEach((part) => qs.push({
            id: `update-${g}`, header: header || title.slice(0, 12), multiSelect: true, question: `${title}: which do you want to update?`,
            // AskUserQuestion takes 2 to 4 options: a group of one gets 'None of these' beside it
            options: [...part.map((o) => ({ label: o.kind === 'upgrade' ? `${o.label}: ${o.fix}` : `${o.label}: ${o.from || '?'} -> ${o.to || 'latest'}`, description: o.id })), ...(part.length === 1 ? [{ label: 'None of these', description: 'none' }] : [])],
        }));
    }
    const offer = { ...STATIC.updateOffer };
    if (!out.offers.length) offer.options = offer.options.filter((o) => o.label !== `All of them${RECOMMENDED_SUFFIX}`).map((o, i) => (i === 0 ? { ...o, label: `${o.label}${RECOMMENDED_SUFFIX}` } : o));
    return { offer, pick: chunk(qs, 4), ...cursor };
}

// The ask cursor-offer (spec D9), asks.js's text; `answers` maps each label to the value passed back.
function cursorOfferAsk(o: CursorOffer)
{
    const q = cursorOfferQuestion(o.root, o.servers.length);
    return { ...q.question, answers: q.answers };
}

