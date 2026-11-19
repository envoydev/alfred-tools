// Registry lookups for pins: which release of a package may be offered. One rule for /alfred-tools:update and for
// `npm run refresh-pins`: the newest STABLE release that is at least `days` old (the age gate) and newer than the pin.
// A newer release that is too young is reported as held back, never offered.
//
// A registry is read with `fetch`. The two base URLs can be overridden for a test or a mirror:
//   ALFRED_TOOLS_NPM_URL   default https://registry.npmjs.org
//   ALFRED_TOOLS_PYPI_URL  default https://pypi.org/pypi
import { compareVersions } from '../core/versions.ts';
import { isRecord } from '../core/shapes.ts';
import type { Env } from '../core/types.ts';
import type { Aged, Choice, FetchFn, Release } from './types.ts';

export const DAY = 86400000;
export const AGE_DAYS = 7;
const STABLE = { npm: /^\d+\.\d+\.\d+$/, pypi: /^\d+(\.\d+)*$/ }; // no -rc / -beta / a1 / b2 / .dev / .post
const isRegistry = (registry: string): registry is keyof typeof STABLE => Object.hasOwn(STABLE, registry);

const npmBase = (env: Env): string => (env.ALFRED_TOOLS_NPM_URL || 'https://registry.npmjs.org').replace(/\/$/, '');
const pypiBase = (env: Env): string => (env.ALFRED_TOOLS_PYPI_URL || 'https://pypi.org/pypi').replace(/\/$/, '');

async function getJson(url: string, fetchFn: FetchFn): Promise<unknown>
{
    const response = await fetchFn(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
    return response.json();
}

// -> [{ version, time (ms) }]; a deprecated (npm) or fully yanked (PyPI) release is left out. The answer is read field by
// field - npm's `versions` and `time`, PyPI's `releases` - and a part that is not the shape the registry documents counts
// as none.
export async function versionsOf(registry: string, name: string, { env = process.env, fetchFn = fetch }: { env?: Env; fetchFn?: FetchFn } = {}): Promise<Release[]>
{
    if (registry === 'npm')
    {
        const doc = await getJson(`${npmBase(env)}/${name.replace('/', '%2F')}`, fetchFn);
        const versions = isRecord(doc) && isRecord(doc['versions']) ? doc['versions'] : {};
        const times = isRecord(doc) && isRecord(doc['time']) ? doc['time'] : {};
        return Object.entries(versions).flatMap(([version, release]) =>
        {
            const published = times[version];
            return (isRecord(release) && release['deprecated']) || typeof published !== 'string' || !published ? [] : [{ version: version, time: Date.parse(published) }];
        });
    }
    if (registry === 'pypi')
    {
        const doc = await getJson(`${pypiBase(env)}/${name}/json`, fetchFn);
        const releases = isRecord(doc) && isRecord(doc['releases']) ? doc['releases'] : {};
        const out: Release[] = [];
        for (const [version, files] of Object.entries(releases))
        {
            const live = (Array.isArray(files) ? files : []).filter(isRecord).filter((file) => !file['yanked']);
            if (!live.length) continue;
            out.push({ version: version, time: Math.min(...live.map((file) => Date.parse(String(file['upload_time_iso_8601'] || file['upload_time'])))) });
        }
        return out;
    }
    throw new Error(`unknown registry '${registry}'`);
}

// -> { offer: { version, ageDays } | null, held: [{ version, ageDays }] (newer than `current`, too young, newest first) }
// `current` null means no pin to compare: every stable release counts as newer.
export function choose(versions: Release[], { registry, now = Date.now(), days = AGE_DAYS, current = null }: { registry: string; now?: number; days?: number; current?: string | null }): Choice
{
    if (!isRegistry(registry)) throw new Error(`unknown registry '${registry}'`);
    const pattern = STABLE[registry];
    const stable = versions.filter((release) => pattern.test(release.version) && Number.isFinite(release.time));
    const newer = stable.filter((release) => current === null || compareVersions(release.version, current) === 1);
    // a stable version is dotted numbers, which always compare; an unknown order would sort as equal
    newer.sort((first, second) => compareVersions(second.version, first.version) ?? 0);
    const age = (release: Release): number => Math.floor((now - release.time) / DAY);
    const ok = newer.find((release) => now - release.time >= days * DAY);
    return {
        offer: ok ? { version: ok.version, ageDays: age(ok) } : null,
        held: newer.filter((release) => now - release.time < days * DAY && (!ok || compareVersions(release.version, ok.version) === 1)).map((release) => ({ version: release.version, ageDays: age(release) })),
    };
}

// The bump day's cut-off, in the catalog's spelling: the end of that UTC day.
export const cutoffOf = (now: number = Date.now()): string => `${new Date(now).toISOString().slice(0, 10)}T23:59:59Z`;

// One line for a package's held-back releases: the newest, and how many more are under the gate.
export function heldLine(pkgName: string, held: Aged[], days: number = AGE_DAYS): string | null
{
    const [newest] = held;
    return newest
        ? `${pkgName} ${newest.version} is ${newest.ageDays} day(s) old - held back until it is ${days}${held.length > 1 ? ` (${held.length - 1} more newer than the pin are younger than ${days} days)` : ''}`
        : null;
}

