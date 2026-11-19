// One MCP pick: its route, scope, name, root, location, key and settings, as plan steps. Each part has its own file in
// pick/ - the checks (target.ts), the answers that edit an entry (answers.ts), the entry (entry.ts), Cursor's form
// (cursor.ts), what the key needs (key-use.ts) and the steps (steps.ts) - and planMcp runs them in that order, so its
// notes and errors keep their order.
import { mergeSettings } from '../entries/entry.ts';
import * as keys from '../keys/keys.ts';
import * as kept from '../core/kept.ts';
import { pickTarget } from './pick/target.ts';
import { pickAnswers } from './pick/answers.ts';
import { pickEntry } from './pick/entry.ts';
import { pickCursor } from './pick/cursor.ts';
import { pickKeyUse } from './pick/key-use.ts';
import { pickSteps } from './pick/steps.ts';
import type { Catalog, CatalogRow } from '../catalog/types.ts';
import type { Inventory } from '../inventory/types.ts';
import type { PickAnswer, Plan, PlanCtx } from './types.ts';

// ---- one MCP pick ---------------------------------------------------------------------------------------------------

// -> undefined when steps are planned, else the length of the list the refusal or the unchanged line went to
export function planMcp(row: CatalogRow, pick: PickAnswer, inventory: Inventory, context: PlanCtx, catalog: Catalog, out: Plan): number | undefined
{
    const base = pickTarget(row, pick, inventory, context, catalog, out);
    if (typeof base === 'number') return base;
    const answers = pickAnswers(base, pick, inventory, context, out);
    if (typeof answers === 'number') return answers;
    const built = pickEntry(base, answers, pick, context, catalog, out);
    if (typeof built === 'number') return built;
    const cursor = pickCursor(base, answers, built.entry, context, catalog, out);
    const { current, route, scope, name } = base;
    const entry = pick.settings && !built.hostedSettings ? mergeSettings(cursor.entry, route, pick.settings) : cursor.entry;

    // .mcp.json is committed: a move into it never carries a credential the route's own token field does not take - a
    // header of the user's own, a userinfo URL, a 0.1.x Authorization header (D7). A key never becomes a ${VAR} there: a
    // hosted key goes through the helper (key-to-helper moves a 0.1.x header first), and a stdio key never moves in (D5).
    if (scope === 'project' && current && current.scope !== 'project')
    {
        const own = new Set(keys.tokenFields(entry, route).map((field) => field.at.join('.')));
        const held = kept.credentialPaths(entry, row).filter((credentialPath) => !own.has(credentialPath));
        const viaFix = route.helper && held.every((credentialPath) => /^headers\.authorization$/i.test(credentialPath));
        if (held.length) return out.errors.push(`${row.id}: '${current.name}' holds a credential in ${held.join(', ')}, which the committed .mcp.json must not carry - keep it at ${current.scope} scope, or ${viaFix ? 'run /alfred-tools:fix first: key-to-helper moves the key into mcp-headers.js' : `take it out of ${held.join(', ')} first`}`);
    }

    const keyUse = pickKeyUse(base, answers, entry, inventory, context, out);
    if (route.authMode === 'oauth' || (route.keyless === 'oauth' && !answers.wantToken))
        out.oauth.push(cursor.signInRoot === null ? { row: row.id, name, scope } : { row: row.id, name, scope, signin: true, root: cursor.signInRoot });
    if (row.dangerous && row.dangerous.length) out.dangerous.push({ row: row.id, name, tools: row.dangerous });
    out.expect.push({ kind: 'mcp', row: row.id, name, scope, route: base.routeId });
    return pickSteps(base, built, cursor, keyUse, entry, answers.keyName, context, out);
}
