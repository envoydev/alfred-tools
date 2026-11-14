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
    const cursor = { cursorOffers: (out.cursorOffers || []).map(cursorOfferAsk), cursorNameQuestions: (out.cursorOffers || []).flatMap((cursorOffer) => cursorOffer.taken.map((takenEntry) => cursorNameQuestion(takenEntry))) };
    if (!items.length) return { offer: null, pick: [], ...cursor };
    const groups = [['catalog', 'Catalog plugins'], ['other', 'Other plugins'], ['mcp', 'MCP servers'], ['helper', 'Key helpers'], ['upgrade', 'New ways to pass data', 'Data passing']] as [string, string, string?][];
    const pickQuestions: Question[] = [];
    for (const [groupKey, title, header] of groups)
    {
        const list = items.filter((item) => item.group === groupKey);
        chunk(list, 4).forEach((part) => pickQuestions.push({
            id: `update-${groupKey}`, header: header || title.slice(0, 12), multiSelect: true, question: `${title}: which do you want to update?`,
            // AskUserQuestion takes 2 to 4 options: a group of one gets 'None of these' beside it
            options: [...part.map((item) => ({ label: item.kind === 'upgrade' ? `${item.label}: ${item.fix}` : `${item.label}: ${item.from || '?'} -> ${item.to || 'latest'}`, description: item.id })), ...(part.length === 1 ? [{ label: 'None of these', description: 'none' }] : [])],
        }));
    }
    const offer = { ...STATIC.updateOffer };
    if (!out.offers.length) offer.options = offer.options.filter((option) => option.label !== `All of them${RECOMMENDED_SUFFIX}`).map((option, i) => (i === 0 ? { ...option, label: `${option.label}${RECOMMENDED_SUFFIX}` } : option));
    return { offer, pick: chunk(pickQuestions, 4), ...cursor };
}

// The ask cursor-offer (spec D9), asks.js's text; `answers` maps each label to the value passed back.
function cursorOfferAsk(cursorOffer: CursorOffer)
{
    const offerQuestion = cursorOfferQuestion(cursorOffer.root, cursorOffer.servers.length);
    return { ...offerQuestion.question, answers: offerQuestion.answers };
}

