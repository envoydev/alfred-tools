// serena-context's extra beside the registration rewrite: a context file missing at the path a registration already names is
// written in place. (The root's old copy is retired by plan/retire-context.ts, which a plan shares.)
import fs from 'node:fs';
import { helperMissingFix } from './keys.ts';
import type { Finding } from './types.ts';

// A serena-context finding whose registration already names the right path with no file there: nothing to rewrite, so the
// file is written where it is named. Never over a file that is there. -> the apply's line, or null
export function writeMissingContext(finding: Finding): string | null
{
    if (!finding.want || fs.existsSync(finding.want)) return null;
    const written = helperMissingFix({ id: 'helper-missing', name: finding.want, scope: null, found: '', path: finding.want, shipped: 'serenaContext' });
    return `${written.ok ? 'ok    ' : 'FAILED'} serena-context: ${written.detail}`;
}
