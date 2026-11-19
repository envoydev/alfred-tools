// Retired MCP rows (spec D3): a registration that launches what a `retired` entry fingerprints is no row's any more. It
// is managed - offered for removal by fix's retired-server - while its family's list holds it, and the user's otherwise.
// `alfredRetired` is alfred-code's reserved-name flag and stays apart.
import { matchesFingerprint } from './fingerprint.ts';
import * as roots from '../roots/roots.ts';
import type { ServerEntry } from '../core/types.ts';
import type { Catalog, RetiredRow } from '../catalog/types.ts';
import type { Inventory } from './types.ts';

export function retiredMatch(entry: ServerEntry | null | undefined, catalog: Pick<Catalog, 'retired'>): RetiredRow | null
{
    if (!entry || typeof entry !== 'object') return null;
    return catalog.retired.find((retired) => retired.fingerprints.some((fingerprint) => matchesFingerprint(entry, fingerprint))) ?? null;
}

// Each registration no row matches and a retired entry does: `retiredRow` set, `own` false while its family's list names
// it as a managed server. An inherited one stays the parent folder's.
export function markRetired(inventory: Inventory, catalog: Pick<Catalog, 'retired'>): void
{
    for (const registration of inventory.registrations)
    {
        if (registration.rowId !== null || registration.scope === 'inherited' || registration.alfredRetired) continue;
        const retired = retiredMatch(registration.entry, catalog);
        if (!retired) continue;
        const list = inventory.lists ? inventory.lists[roots.familyOf(registration.scope)] : null;
        const listed = Boolean(list && !list.note && !list.old && list.servers.some((server) => server.name === registration.name && server.scope === registration.scope));
        registration.retiredRow = retired.id;
        registration.own = !listed;
    }
}
