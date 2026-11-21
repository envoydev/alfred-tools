// helper-foreign-file (0.8.0): a hand-built key helper - `mcp-headers-<anything>.js|.cjs|.mjs` - left directly in a root
// folder after helper-foreign moved its registration to this plugin's helper, as 0.7.0 did. It is found only when the
// apply would remove it (keepReason, the apply's own checks: git and every text that could start it), so a file the step
// would keep is never offered. The one step is retire-helper. A file's name is read, never its content.
import fs from 'node:fs';
import * as roots from '../roots/roots.ts';
import { pathFor } from '../entries/platform.ts';
import { FOREIGN_HELPER_FILE } from '../entries/constants.ts';
import { keepReason } from '../apply/retire-helper.ts';
import { fieldOf } from './common.ts';
import type { RetireHelperStep } from '../plan/types.ts';
import type { Finding, FixCtx } from './types.ts';

// The helper files directly in a folder, by name; [] for a folder that cannot be read.
function helperFilesIn(folder: string): string[]
{
    try { return fs.readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isFile() && FOREIGN_HELPER_FILE.test(entry.name)).map((entry) => entry.name); }
    catch { return []; }
}

export function helperForeignFileDetect(context: FixCtx): Finding[]
{
    const pathApi = pathFor(context.platform);
    const resolved = roots.resolveRoots(context.inventory, null, { project: context.inventory.project, home: context.home, platform: context.platform, catalog: context.catalog }).roots;
    const seen = new Set<string>();
    const out: Finding[] = [];
    for (const root of [resolved.project, resolved.global])
    {
        if (!root) continue;
        for (const name of helperFilesIn(root))
        {
            const file = pathApi.join(root, name);
            if (seen.has(file) || keepReason(file, { project: context.inventory.project, env: context.env, platform: context.platform })) continue;
            seen.add(file);
            out.push({ id: 'helper-foreign-file', name: file, scope: null, file, found: `${file} is a hand-built key helper that no registration names any more` });
        }
    }
    return out;
}

export const helperForeignFileSteps = (finding: Finding): RetireHelperStep[] =>
{
    const file = fieldOf(finding, 'file');
    return [{ op: 'retire-helper', file, why: `${file}: a hand-built key helper no registration runs - removed when no registration or Cursor file names it and git does not track it` }];
};
