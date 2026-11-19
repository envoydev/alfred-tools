// retired-server (spec D3): a registration alfred-tools manages - its family's mcps.json lists it - that launches what a
// catalog `retired` entry fingerprints is offered for removal: `claude mcp remove`, then its list entry and Cursor's copy
// (repairTail turns the remove into a list drop and Cursor's file follows the list). A decline is kept in
// retired-declined.json, as retired-plugin's is; a declined one is advice from then on.
import crypto from 'node:crypto';
import path from 'node:path';
import * as declines from '../core/declines.ts';
import { isManaged } from './common.ts';
import { DECLINE, FIX_ID } from './constants.ts';
import type { McpRemoveStep } from '../plan/types.ts';
import type { Finding, FixCtx } from './types.ts';

// The project's own text hashed, normalized so one folder gives one id: Windows paths are case-blind (C: and c: are one
// drive), so they are resolved and lowercased; a POSIX path is normalized and keeps its case.
const projectKey = (project: string, platform: string): string => (platform === 'win32' ? path.win32.resolve(project).toLowerCase() : path.posix.normalize(project));

export function declineIdOf(name: string, scope: string, project: string, platform: string): string
{
    if (scope === DECLINE.userScope) return `${DECLINE.prefix}${name}`;
    return `${DECLINE.prefix}${name}:${crypto.createHash(DECLINE.hash).update(projectKey(project, platform)).digest('hex').slice(0, DECLINE.hexLength)}`;
}

export function retiredServerDetect(context: FixCtx): Finding[]
{
    const declined = declines.read(context.data);
    return context.inventory.registrations.filter((registration) => registration.retiredRow && isManaged(registration) && registration.scope !== 'inherited').flatMap((registration) =>
    {
        const retired = context.catalog.retired.find((retiredRow) => retiredRow.id === registration.retiredRow);
        if (!retired) return [];
        const declineId = declineIdOf(registration.name, registration.scope, context.inventory.project, context.platform);
        const base: Finding = {
            id: FIX_ID.retiredServer, row: null, name: registration.name, scope: registration.scope, declineId,
            found: `${registration.name} runs ${retired.id}, which alfred-tools retired in ${retired.since}: ${retired.reason}`,
            note: `to keep it, pass --input retired-declined=${declineId}~${registration.scope}`,
        };
        if (!declined.some((entry) => declines.same(entry, { id: declineId, scope: registration.scope }))) return [base];
        return [{ ...base, declined: true, blocked: `${registration.name} is kept at ${registration.scope}; remove it with claude mcp remove ${registration.name} -s ${registration.scope}` }];
    });
}

// The removal each picked retired-server finding asks for, from the registration as read. A registration fix row whose
// `fix` names this: applyFixes keeps these findings out of its one-replace-per-registration groups.
export function retiredServerSteps(context: FixCtx, findings: Finding[]): McpRemoveStep[]
{
    return findings.filter((finding) => finding.id === FIX_ID.retiredServer && !finding.blocked).flatMap((finding) =>
    {
        const registration = context.inventory.registrations.find((candidate) => candidate.name === finding.name && candidate.scope === finding.scope);
        if (!registration) return [];
        return [{ op: 'mcp-remove', name: registration.name, scope: registration.scope, old: registration.entry, row: null, why: `retired-server: remove '${registration.name}' (${registration.retiredRow}) at ${registration.scope} scope` }];
    });
}
