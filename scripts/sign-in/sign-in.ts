// What a sign-in on the shared mcp-remote sign-in (spec D, ruling 12) is made of: the client line for a registration, the
// file its sign-in is stored in, and the words for a run that failed. effects.ts runs it.
import crypto from 'node:crypto';
import path from 'node:path';
import { FILES } from '../core/constants.ts';
import { errorCode } from '../core/guards.ts';
import { signInParts } from '../entries/sign-in.ts';
import { AUTH_TIMEOUT_FLAG, AUTH_TIMEOUT_SECONDS, CLIENT_BIN, TIMEOUT_ERROR_CODE, TOKENS_SUFFIX } from './constants.ts';
import type { ServerEntry } from '../core/types.ts';
import type { RunResult, SignInCommand } from './types.ts';

// The client line for a registration in the shared sign-in form: the same pin, the same URL and the same env (the sign-in
// folder, the cut-off). Windows runs npx through cmd /c, as the registration does. -> null when it is not that form
export function signInCommand(entry: ServerEntry, platform: string): SignInCommand | null
{
    const parts = signInParts(entry);
    if (!parts) return null;
    const args = ['-y', '-p', parts.pin, CLIENT_BIN, parts.url, AUTH_TIMEOUT_FLAG, String(AUTH_TIMEOUT_SECONDS)];
    const launch = platform === 'win32' ? { command: 'cmd', args: ['/c', 'npx', ...args] } : { command: 'npx', args };
    const env: Record<string, string> = {};
    for (const [variableName, value] of Object.entries(entry.env || {})) if (typeof value === 'string') env[variableName] = value;
    return { ...launch, env };
}

// The file the client stores the sign-in in, by name only: <dir>/mcp-remote-v1/<md5 of the URL>_tokens.json
export const tokensFileOf = (dir: string, url: string): string => path.join(dir, FILES.signIns, `${crypto.createHash('md5').update(url).digest('hex')}${TOKENS_SUFFIX}`);

// Why a run that did not exit 0 failed, in words that hold nothing the client printed but the sign-in link it named,
// which a run that gave up reports only as a past link: the client and its callback are gone, a new run prints a new one.
export function failureOf(result: RunResult, link: string | null): string
{
    // the run's own timeout sets this code and a signal: say what it means, not 'ETIMEDOUT'
    if (result.error && errorCode(result.error) === TIMEOUT_ERROR_CODE)
    {
        return `sign-in failed: gave up after ${AUTH_TIMEOUT_SECONDS} s waiting for the browser sign-in${link ? ` - the link was ${link}; run it again and open the link it prints` : ''}`;
    }
    if (result.error) return `sign-in failed: ${result.error.message}`;
    if (result.signal) return `sign-in failed: the client was stopped by ${result.signal} (it waits ${AUTH_TIMEOUT_SECONDS} s for the browser)`;
    return `sign-in failed: exit ${result.status}`;
}
