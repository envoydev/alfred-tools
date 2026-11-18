// serena's settings file before its first start (Part B): a registration added with a home the plugin may edit and no
// serena_config.yml there yet gets a minimal one first, so serena's first start already reads where its project folders go.
import fs from 'node:fs';
import * as serenaConfig from '../apply/serena-config.ts';
import type { ServerEntry } from '../core/types.ts';
import type { SerenaConfigInitStep } from './types.ts';

// -> the step, or null when the home is not the plugin's to edit, holds a $, or already has the file
export function serenaConfigInitStep(entry: ServerEntry, context: { platform: string; exists?: ((file: string) => boolean) | undefined }): SerenaConfigInitStep | null
{
    const home = entry.env && entry.env.SERENA_HOME;
    if (!home || !serenaConfig.editableHome(home, { platform: context.platform }).ok || 'error' in serenaConfig.folderValue(home)) return null;
    const file = serenaConfig.configOf(home);
    const exists = context.exists || ((candidate: string) => fs.existsSync(candidate));
    if (exists(file)) return null;
    return { op: 'serena-config-init', file, home, why: `serena: ${file} with its project folders under ${home}/projects, before serena first starts` };
}
