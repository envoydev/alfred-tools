// What one MCP pick's key needs (spec D3-D5): the names written into the chain's first file, a bridge's names, the key
// the apply writes into a stdio registration, the helper's conditions and the reconnect line. The lines name the files,
// never a value; a name found only in a file 0.1.x read names that file.
import { bridgeParts } from '../../entries/entry.ts';
import { pairNames, optionalNameNotes } from '../hosted-settings.ts';
import { PARENT_HELPER_IN_CHILD, CHILD_FOLDER_REMEDY } from '../asks-keys.ts';
import * as keys from '../../keys/keys.ts';
import { templateNames } from '../../copied/mcp-bridge.js';
import { andList } from '../context.ts';
import { required } from '../required.ts';
import type { ServerEntry } from '../../core/types.ts';
import type { Inventory } from '../../inventory/types.ts';
import type { PickAnswers, PickBase, PickKeyUse, Plan, PlanCtx } from '../types.ts';

export function pickKeyUse(base: PickBase, answers: PickAnswers, entry: ServerEntry, inventory: Inventory, context: PlanCtx, out: Plan): PickKeyUse
{
    const { row, current, route, scope, name } = base;
    const { keyState, keyName, liveKey, unfilledStdio } = answers;
    // a hosted route's helper reads the hosted chain each time Claude Code connects, a stdio route's key is written in by
    // the apply from the stdio chain; a route that sends a key has its name
    const keyed = keyState && keyName !== undefined && !(entry.headers && entry.headers.Authorization) ? { state: keyState, name: keyName } : null;
    const chainFile = (files: string[]): string => required(files[0], `${row.id}: its key chain names no file`);
    // a bridge (0.4.0) reads its key and its URL names from the hosted chain each time the server starts, never through
    // Claude Code
    const bridge = bridgeParts(entry);
    let keyFile: string | null = null;
    let keyNames = keyName === undefined ? [] : [keyName];
    if (keyed && !(keyed.state.kind === 'stdio' && scope === 'project'))
    {
        const filled = keys.filledNames(keyed.state.files).some((filledEntry) => filledEntry.names.includes(keyed.name));
        out.keys.push({ row: row.id, name, scope, variable: keyed.name, kind: bridge ? 'bridge' : keyed.state.kind, files: keyed.state.files, filled, old: filled ? null : keys.oldHolding(context.project, context.home, keyed.name) });
        // a name filled nowhere in the chain is written, empty, into the chain's first file (D3)
        if (!filled) keyFile = keyed.state.files[0] ?? null;
        // a helper's `NAME=VAR` pairs (sonarqube's organization): their names are written too, and optional
        const pairs = keyed.state.kind === 'helper' ? pairNames(entry) : [];
        const empty = pairs.filter((pairName) => !keys.filledNames(keyed.state.files).some((filledEntry) => filledEntry.names.includes(pairName)));
        if (pairs.length) keyNames = [keyed.name, ...pairs];
        if (empty.length) { keyFile = chainFile(keyed.state.files); out.notes.push(...optionalNameNotes(row.id, route, empty, keyFile)); }
    }
    let bridgeFilled: boolean | null = null;
    if (bridge && keyed)
    {
        // each name on its own (0.4.0 Ruling 9): one filled anywhere in the chain is not named again, the key's included
        const have = new Set(keys.filledNames(keyed.state.files).flatMap((filledEntry) => filledEntry.names));
        const all = [{ name: required(bridge.keyName, `${row.id}: its bridge launch names no key`), optional: false }, ...(templateNames(bridge.template) || [])];
        const lack = all.filter((nameItem) => !have.has(nameItem.name));
        keyNames = lack.map((nameItem) => nameItem.name);
        keyFile = keyNames.length ? keyed.state.files[0] ?? null : null;
        bridgeFilled = !lack.some((nameItem) => !nameItem.optional);
        const needed = lack.filter((nameItem) => !nameItem.optional).map((nameItem) => nameItem.name);
        const optional = lack.filter((nameItem) => nameItem.optional).map((nameItem) => nameItem.name);
        const after = 'each time the server starts - after a change, restart Claude Code or reconnect it in /mcp';
        out.notes.push(needed.length || optional.length
            ? `${row.id}: fill ${andList(needed.length ? needed : optional)} in ${keyed.state.files[0]}${needed.length && optional.length ? ` (${andList(optional)} ${optional.length > 1 ? 'are' : 'is'} optional)` : !needed.length ? ` (optional)` : ''}; the bridge reads them ${after}`
            : `${row.id}: the bridge reads its key and URL names from .mcps-secrets ${after}`);
    }
    // a stdio key at local or global scope: the apply writes it in from the stdio chain under the key's name (R7); configure
    // rewrites a registration whose key differs from the chosen name's filled value, even when nothing else changed
    const stepKey = keyed && keyed.state.kind === 'stdio' && scope !== 'project' && !unfilledStdio ? { name: keyed.name, files: keyed.state.files } : null;
    const chosen = stepKey && current ? keys.valueIn(stepKey.files, stepKey.name) : null;
    const staleKey = chosen !== null && chosen.value !== liveKey;
    // the helper's own conditions (spec D4): the folder's trust at project and local scope, the declaring folder only at
    // project scope, node on the PATH - each said once
    const once = (text: string) => { if (!out.notes.includes(text)) out.notes.push(text); };
    // a bridge connects in a child folder too (F3) and sends no key through Claude Code: node is its one condition
    if (bridge) once('node must be on the PATH Claude Code starts with - mcp-bridge.js runs under it, as this plugin\'s commands do');
    if (keyed && keyed.state.kind === 'helper' && entry.headersHelper)
    {
        if (scope !== 'user' && inventory.trusted === false) once(`accept the trust dialog the next time Claude Code starts in ${context.project} - until then the server connects without its key`);
        // docs/sources.md M1: a parent folder's helper does not run in a child folder's session, named relative or absolute
        if (scope === 'project' && !PARENT_HELPER_IN_CHILD) out.notes.push(`${row.id}: a session started in a child folder connects without this key - Claude Code does not run a parent folder's helper there; ${CHILD_FOLDER_REMEDY}`);
        once('node must be on the PATH Claude Code starts with - mcp-headers.js runs under it, as this plugin\'s commands do');
    }
    // how a hosted keyed server connects once written (spec F3): its reconnect line, printed by render and repeated by the apply
    const reconnect = keyed && keyed.state.kind === 'helper' && entry.headersHelper
        ? { row: row.id, name, variable: keyed.name, file: chainFile(keyed.state.files), filled: keys.filledNames(keyed.state.files).some((filledEntry) => filledEntry.names.includes(keyed.name)), anonymous: route.authMode === 'optional-token' && !route.keyless, hint: (route.helper && route.helper.hint) || null, untrusted: scope !== 'user' && inventory.trusted === false }
        : null;
    return { bridge: Boolean(bridge), bridgeFilled, keyFile, keyNames, withKey: stepKey ? { key: stepKey } : {}, chosen, staleKey, reconnect };
}
