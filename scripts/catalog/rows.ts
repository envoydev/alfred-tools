// A catalog row's parts a builder reads: a route by its id, the data folder's locations, and a field its route's kind
// always carries (tests/catalog.test.ts pins each for the shipped catalog). One that is missing is a broken catalog,
// never a user's answer, so each throws, naming the row.
import type { CatalogRoute, CatalogRow, RowLocations } from './types.ts';

export function routeNamed(row: CatalogRow, routeId: string): CatalogRoute
{
    const route = row.routes[routeId];
    if (!route) throw new Error(`${row.id}: the catalog has no ${routeId} route`);
    return route;
}

export function locationsOf(row: CatalogRow): RowLocations
{
    if (!row.locations) throw new Error(`${row.id}: the catalog gives it no data folder`);
    return row.locations;
}

export function routeField<Value>(value: Value | undefined, rowId: string, field: string): Value
{
    if (value === undefined) throw new Error(`${rowId}: its catalog route has no ${field}`);
    return value;
}
