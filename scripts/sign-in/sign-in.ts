// Signs in to a server on the shared mcp-remote sign-in (spec D, ruling 12) outside Claude Code's 30-second start
// limit: mcp-remote's own client does the OAuth sign-in into the root's store and exits. The client's stderr is read line by line in
// memory for its sign-in link, and nothing it prints is kept, and the sign-in files are only checked for by name, never opened.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as account from '../core/account.ts';
import * as roots from '../roots/roots.ts';
import { signInParts } from '../entries/sign-in.ts';
import { watchAuthorize } from './authorize-link.ts';
import { AUTH_TIMEOUT_FLAG, AUTH_TIMEOUT_SECONDS, CLIENT_BIN, LINE, RUN_TIMEOUT_MS, TIMEOUT_ERROR_CODE, TOKENS_SUFFIX } from './constants.ts';
import type { ServerEntry } from '../core/types.ts';
import type { RunResult, SignInCommand, SignInOptions, SignInResult } from './types.ts';

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
const tokensFileOf = (dir: string, url: string): string => path.join(dir, roots.FILES.signIns, `${crypto.createHash('md5').update(url).digest('hex')}${TOKENS_SUFFIX}`);

// Why a run that did not exit 0 failed, in words that hold nothing the client printed but the sign-in link it named,
// which a run that gave up reports only as a past link: the client and its callback are gone, a new run prints a new one.
function failureOf(result: RunResult, link: string | null): string
{
    // the run's own timeout sets this code and a signal: say what it means, not 'ETIMEDOUT'
    if (result.error && (result.error as NodeJS.ErrnoException).code === TIMEOUT_ERROR_CODE)
    {
        return `sign-in failed: gave up after ${AUTH_TIMEOUT_SECONDS} s waiting for the browser sign-in${link ? ` - the link was ${link}; run it again and open the link it prints` : ''}`;
    }
    if (result.error) return `sign-in failed: ${result.error.message}`;
    if (result.signal) return `sign-in failed: the client was stopped by ${result.signal} (it waits ${AUTH_TIMEOUT_SECONDS} s for the browser)`;
    return `sign-in failed: exit ${result.status}`;
}

// -> Promise<{ ok, line }>: 'signed in', or why not. Exit 0 and a sign-in stored for the entry's URL are both needed.
export async function signIn(name: string, scope: string, { env, run, project = process.cwd(), print = () => {} }: SignInOptions): Promise<SignInResult>
{
    const entry = account.readRegistration(name, scope, project, env);
    if (!entry) return { ok: false, line: `no server '${name}' at ${scope} scope` };
    const launch = signInCommand(entry, process.platform);
    const parts = signInParts(entry);
    if (!launch || !parts) return { ok: false, line: LINE.notSharedForm };
    const watch = watchAuthorize();
    const onStderrLine = (line: string) =>
    {
        const link = watch.feed(line);
        if (link) print(`${name}: no browser opened - open this link to sign in: ${link}`);
    };
    const result = await run(launch.command, launch.args, { cwd: project, env: { ...env, ...launch.env }, timeoutMs: RUN_TIMEOUT_MS }, onStderrLine);
    if (result.error || result.signal || result.status !== 0) return { ok: false, line: failureOf(result, watch.link()) };
    if (!fs.existsSync(tokensFileOf(parts.dir, parts.url))) return { ok: false, line: LINE.noTokens };
    return { ok: true, line: LINE.signedIn };
}
