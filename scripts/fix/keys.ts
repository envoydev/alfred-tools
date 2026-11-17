// The 0.2.0 key rows (spec D7): a hosted key moved out of a registration into the header helper, the helper on disk kept
// present and current, and a root's .gitignore that keeps its key file out of git. token-sync (stdio keys) is in
// registration.ts.
//
// A key is compared in this process only: a finding names a key and a file, never a value.
import fs from 'node:fs';
import path from 'node:path';
import { pathFor } from '../entries/platform.ts';
import { helperFor, contextArgAt, bridgeParts } from '../entries/entry.ts';
import * as keys from '../keys/keys.ts';
import * as roots from '../roots/roots.ts';
import { HELPER_VERSION } from '../copied/mcp-headers.js';
import { BRIDGE_VERSION } from '../copied/mcp-bridge.js';
import * as C from './common.ts';
import { ensureCommonjs, rootIgnoreLines, rootIgnore } from '../apply/file-steps.ts';
import type { ServerEntry } from '../core/types.ts';
import type { Roots } from '../entries/types.ts';
import type { InvRegistration } from '../inventory/types.ts';
import type { ShippedKind } from '../roots/types.ts';
import type { Finding, FixCtx, MachineFixResult, ShippedFile } from './types.ts';

// What roots.ts needs to place a root, from a fix ctx.
const rootCtx = (context: FixCtx) => ({ project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog });
// The roots a fix writes into (R9): each family's root in use, else D2's recommended one.
const rootsOf = (context: FixCtx) => roots.resolveRoots(context.inventory, null, rootCtx(context)).roots;

// ---- key-to-helper --------------------------------------------------------------------------------------------------
// A managed hosted registration whose Authorization header holds a ${VAR} or a key (0.1.x wrote both). The helper reads
// the key by name from the hosted chain, so the name must be filled there first: a registration is never moved to a
// helper that would send no key.
const ONE_VAR = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

function authOf(entry: ServerEntry | null | undefined): { header: string; value: string } | null
{
    const headers: Record<string, string> = (entry && entry.headers) || {};
    const header = Object.keys(headers).find((headerName) => headerName.toLowerCase() === 'authorization');
    return header && typeof headers[header] === 'string' ? { header, value: headers[header]! } : null;
}

export function keyToHelperDetect(context: FixCtx): Finding[]
{
    const out: Finding[] = [];
    for (const registration of C.registrationsOf(context, 'key-to-helper'))
    {
        const route = C.routeOf(context, registration);
        const auth = authOf(registration.entry);
        if (registration.route !== 'remote' || !route || !route.helper || !auth || registration.entry.headersHelper) continue;
        const resolvedRoots = rootsOf(context);
        const chain = keys.hostedChain({ scope: registration.scope, projectRoot: resolvedRoots.project, globalRoot: resolvedRoots.global, globalNamed: resolvedRoots.globalNamed, home: context.home });
        const extra = { route: registration.route, roots: resolvedRoots };
        // the scheme word goes: the helper sends the route's own
        const token = auth.value.trim().replace(/^[A-Za-z][\w-]*\s+/, '');
        const one = ONE_VAR.exec(token);
        if (one)
        {
            const name = one[1]!;
            const at = keys.valueIn(chain, name);
            if (at) { out.push(C.finding('key-to-helper', registration, `the Authorization header holds \${${name}} - the key moves to mcp-headers.js, which reads ${name} from ${at.file}`, { ...extra, keyName: name })); continue; }
            const old = keys.oldHolding(context.inventory.project, context.home, name);
            out.push(C.finding('key-to-helper', registration, `the Authorization header holds \${${name}}`, { ...extra, blocked: `put ${name}'s value in ${chain[0]}, then run /alfred-tools:fix${old ? `; ${name} is in ${old}, which alfred-tools no longer reads` : ''}` }));
            continue;
        }
        if (token.includes('${')) { out.push(C.finding('key-to-helper', registration, 'the Authorization header mixes ${VAR} and text', { ...extra, blocked: 'make it one ${VAR} or the key by hand, then run /alfred-tools:fix' })); continue; }
        const name = keys.nameOfValue(chain, token);
        out.push(name
            ? C.finding('key-to-helper', registration, `the Authorization header holds a key - it moves to mcp-headers.js, which reads it as ${name}`, { ...extra, keyName: name })
            : C.finding('key-to-helper', registration, 'the Authorization header holds a key', { ...extra, blocked: `the key in this registration matches no name in ${chain.join(', ')}: put the working key there under a name, then run /alfred-tools:fix` }));
    }
    return out;
}

// The entry as read, with `headersHelper` and without the header. fix.ts writes the root's file steps before it (R9).
export function keyToHelperFix(entry: ServerEntry, finding: Finding, context: FixCtx): ServerEntry
{
    const out = C.clone(entry);
    const auth = authOf(out);
    if (auth) delete out.headers![auth.header];
    if (out.headers && !Object.keys(out.headers).length) delete out.headers;
    const route = C.rowOf(context, finding.row!)!.routes[finding.route!]!;
    out.headersHelper = helperFor(route, finding.scope!, { project: context.inventory.project, platform: context.platform, home: context.home, roots: finding.roots }, finding.keyName);
    return out;
}

// ---- helper-missing, helper-stale -----------------------------------------------------------------------------------
// The files this plugin copied that the managed registrations name, each once: [{ file, root, kind, reg }]. A
// `headersHelper` names its helper; a bridge registration (0.4.0) its mcp-bridge.js and the mcp-headers.js beside it,
// which the bridge requires. A project-scope path is relative to the project, the folder whose .mcp.json declares it.
const SHIPPED: Record<ShippedKind, { word: string; version: number }> = { helper: { word: 'helper', version: HELPER_VERSION }, bridge: { word: 'bridge', version: BRIDGE_VERSION }, serenaContext: { word: 'context', version: roots.SERENA_CONTEXT_VERSION } };
function shippedFiles(context: FixCtx, fixId: string): ShippedFile[]
{
    const pathApi = pathFor(context.platform);
    const seen = new Map<string, ShippedFile>();
    const add = (file: string, kind: ShippedKind, registration: InvRegistration) => { if (!seen.has(file)) seen.set(file, { file, root: pathApi.dirname(file), kind, registration: registration }); };
    let familyRoots: Roots | null = null;
    for (const registration of C.registrationsOf(context, fixId))
    {
        const named = roots.helperPathOf(registration.entry && registration.entry.headersHelper);
        if (named) add(roots.absOf(named, rootCtx(context)), 'helper', registration);
        // serena's context file (0.5.0, D7): the --context path a managed serena names
        // only the root's own or the home's: a path elsewhere is serena-context's to repoint, and a folder there may not be writable
        const ctxAt = contextArgAt(registration.entry);
        if (ctxAt >= 0)
        {
            const file = roots.absOf(registration.entry.args![ctxAt], rootCtx(context));
            const root = (familyRoots || (familyRoots = rootsOf(context)))[roots.familyOf(registration.scope)];
            if ((root && file === pathApi.join(root, roots.FILES.serenaContext)) || file === C.homeContextOf(registration.entry, context.platform, roots.FILES.serenaContext)) add(file, 'serenaContext', registration);
        }
        const bridge = bridgeParts(registration.entry);
        if (!bridge) continue;
        const file = roots.absOf(bridge.path, rootCtx(context));
        add(file, 'bridge', registration);
        add(pathApi.join(pathApi.dirname(file), roots.FILES.helper), 'helper', registration);
    }
    return [...seen.values()];
}

// `bridged`: found through a bridge registration, which did not start without the file - so its fix needs a new start,
// where a hosted server's helper runs at each connect (review)
const helperFinding = (fixId: string, shippedFile: ShippedFile, what: string, extra: Partial<Finding> = {}): Finding => ({ ...C.finding(fixId, shippedFile.registration, what, extra), name: shippedFile.file, path: shippedFile.file, shipped: shippedFile.kind, bridged: Boolean(bridgeParts(shippedFile.registration.entry)) || shippedFile.kind === 'serenaContext' });
const nameOf = (shippedFile: ShippedFile) => roots.FILES[shippedFile.kind];
// the file this finding writes: 'helper' or 'bridge' (a finding from before 0.4.0 carries none: a helper)
const kindOf = (finding: Finding): ShippedKind => (finding.shipped === 'bridge' || finding.shipped === 'serenaContext' ? finding.shipped : 'helper');
// a fix that writes a file says CommonJS beside it (apply.ts ensureCommonjs, 0.4.0 Ruling 12)
const withCommonjs = (root: string, result: MachineFixResult, kind: ShippedKind): MachineFixResult =>
{
    if (kind === 'serenaContext') return result;
    const packageJson = ensureCommonjs(root);
    return { ...result, detail: [result.detail, packageJson.wrote ? `wrote ${path.join(root, 'package.json')} (type commonjs)` : null, packageJson.note].filter(Boolean).join('; ') };
};

export function helperMissingDetect(context: FixCtx): Finding[]
{
    return shippedFiles(context, 'helper-missing').filter((shippedFile) => !fs.existsSync(shippedFile.file))
        .map((shippedFile) => helperFinding('helper-missing', shippedFile, `${nameOf(shippedFile)} is missing - ${shippedFile.registration.name} (${shippedFile.registration.scope}) ${bridgeParts(shippedFile.registration.entry) || shippedFile.kind === 'serenaContext' ? 'does not start' : 'connects without its key'}`));
}

export function helperMissingFix(finding: Finding): MachineFixResult
{
    const kind = kindOf(finding);
    fs.mkdirSync(path.dirname(finding.path!), { recursive: true });
    fs.writeFileSync(finding.path!, roots.shippedSource(kind));
    return withCommonjs(path.dirname(finding.path!), { ok: roots.shippedState(kind, finding.path!).state === 'same', detail: `wrote ${finding.path!} (${SHIPPED[kind].word} ${SHIPPED[kind].version})`, restart: Boolean(finding.bridged) }, kind);
}

export function helperStaleDetect(context: FixCtx): Finding[]
{
    const out: Finding[] = [];
    for (const shippedFile of shippedFiles(context, 'helper-stale').filter((candidate) => fs.existsSync(candidate.file)))
    {
        const { state, number } = roots.shippedState(shippedFile.kind, shippedFile.file);
        const name = nameOf(shippedFile);
        const { word, version } = SHIPPED[shippedFile.kind];
        if (state === 'lower') out.push(helperFinding('helper-stale', shippedFile, `${name} is ${word} ${number} - this plugin's is ${version}`, { from: number }));
        else if (state === 'edited' && number === null) out.push(helperFinding('helper-stale', shippedFile, `${name} has no alfred-tools number line`, { blocked: `${shippedFile.file} has no alfred-tools number line - it is not this plugin's ${word}, and fix never overwrites it: rename yours, or delete it and run /alfred-tools:fix` }));
        else if (state === 'edited') out.push(helperFinding('helper-stale', shippedFile, `${name} changed since alfred-tools wrote it - the fix puts this plugin's copy back`));
        else if (state === 'higher') out.push(helperFinding('helper-stale', shippedFile, `${name} is ${word} ${number} - newer than this plugin's ${version}`, { blocked: `${name} in ${shippedFile.root} is newer than this plugin - update alfred-tools` }));
    }
    return out;
}

export function helperStaleFix(finding: Finding): MachineFixResult
{
    const kind = kindOf(finding);
    const { word, version } = SHIPPED[kind];
    if (roots.shippedState(kind, finding.path!).state === 'higher') return { ok: false, detail: `${finding.path!} is newer than this plugin - left; update alfred-tools`, restart: false };
    fs.writeFileSync(finding.path!, roots.shippedSource(kind));
    return withCommonjs(path.dirname(finding.path!), { ok: roots.shippedState(kind, finding.path!).state === 'same', detail: `rewrote ${finding.path!} (${word} ${finding.from === undefined ? 'edited' : finding.from} -> ${version})`, restart: Boolean(finding.bridged) }, kind);
}

// ---- root-ignore ----------------------------------------------------------------------------------------------------
// A root in use inside a git work tree where git would commit its key file, or - a project root other than .alfred -
// would ignore the helper a project-scope server needs committed (R13), or would commit mcp-remote's sign-in folder (0.5.0). The fix appends what rootIgnore writes; a gap no
// appended line can close is blocked and named.
export function rootIgnoreDetect(context: FixCtx): Finding[]
{
    const out: Finding[] = [];
    for (const family of ['project', 'global'] as const)
    {
        const used = context.inventory.roots && context.inventory.roots[family];
        const root = used && used.path;
        if (!root || out.some((finding) => finding.name === root) || !fs.existsSync(root)) continue;
        const gap = roots.ignoreGap(root, family);
        if (!gap) continue;
        const secrets = path.join(root, roots.FILES.secrets);
        const helper = path.join(root, roots.FILES.helper);
        const secretsGap = roots.gitIgnores(secrets) === false;
        const helperGap = family === 'project' && path.basename(root) !== '.alfred' && roots.gitIgnores(helper) === true;
        const signIns = path.join(root, roots.FILES.signIns);
        const signInsGap = roots.gitIgnores(path.join(signIns, 'tokens')) === false;
        const unignore = gap.unignore || [];
        const found = [secretsGap && `git would commit ${secrets}`, signInsGap && `git would commit ${signIns}/`, helperGap && `git ignores ${helper}, which a project-scope server needs committed`, unignore.length && `git ignores ${unignore.map((file) => path.join(root, file)).join(' and ')}, which a committed entry names`].filter(Boolean).join('; ');
        const base = { id: 'root-ignore', row: null, name: root, scope: family, found, path: root, family };
        if (path.basename(root) === '.alfred') { out.push({ ...base, blocked: `${root} is alfred-code's - add ${[secretsGap && roots.FILES.secrets, signInsGap && `${roots.FILES.signIns}/`].filter(Boolean).join(' and ')} to its .gitignore yourself` }); continue; }
        if (gap.excluded) { out.push({ ...base, blocked: `a .gitignore above excludes ${root} - remove that line (git check-ignore -v ${root} names it): git never re-includes a file inside an excluded folder` }); continue; }
        const lines = rootIgnoreLines(root);
        const fixes = { secrets: secretsGap && lines.lack.includes(lines.mine ? '*' : roots.FILES.secrets), helper: helperGap && lines.mine && lines.lack.includes(`!${roots.FILES.helper}`), signIns: signInsGap && lines.lack.includes(lines.mine ? '*' : `${roots.FILES.signIns}/`), unignore: lines.mine ? unignore.filter((file) => lines.lack.includes(`!${file}`)) : [] };
        const left = [
            secretsGap && !fixes.secrets && `every line alfred-tools writes is in ${lines.file}, yet git would still commit ${secrets}: a later line re-includes ${roots.FILES.secrets}, or git tracks it already (git rm --cached -- ${secrets})`,
            signInsGap && !fixes.signIns && `every line alfred-tools writes is in ${lines.file}, yet git would still commit ${signIns}/: a later line re-includes it, or git tracks it already (git rm -r --cached -- ${signIns})`,
            helperGap && !fixes.helper && `git ignores ${helper} through lines of your own - add !${roots.FILES.helper} at the end of ${lines.file}`,
            ...unignore.filter((file) => !fixes.unignore.includes(file)).map((file) => `git ignores ${path.join(root, file)} through lines of your own - add !${file} at the end of ${lines.file}`),
        ].filter(Boolean).join('; ');
        if (!fixes.secrets && !fixes.helper && !fixes.signIns && !fixes.unignore.length) out.push({ ...base, blocked: left });
        else out.push({ ...base, fixes, ...(left ? { note: left } : {}) });
    }
    return out;
}

export function rootIgnoreFix(finding: Finding): MachineFixResult
{
    const result = rootIgnore(finding.path!);
    const still = [
        finding.fixes!.secrets && roots.gitIgnores(path.join(finding.path!, roots.FILES.secrets)) === false && `git would still commit ${path.join(finding.path!, roots.FILES.secrets)}`,
        finding.fixes!.helper && roots.gitIgnores(path.join(finding.path!, roots.FILES.helper)) === true && `git still ignores ${path.join(finding.path!, roots.FILES.helper)}`,
        finding.fixes!.signIns && roots.gitIgnores(path.join(finding.path!, roots.FILES.signIns, 'tokens')) === false && `git would still commit ${path.join(finding.path!, roots.FILES.signIns)}/`,
        ...(finding.fixes!.unignore || []).filter((file) => roots.gitIgnores(path.join(finding.path!, file)) === true).map((file) => `git still ignores ${path.join(finding.path!, file)}`),
    ].filter(Boolean);
    return { ok: !still.length, detail: still.length ? `${result.detail}; ${still.join('; ')}` : result.detail, restart: false };
}

