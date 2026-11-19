// The machine as the commands look at it - files, PATH, a command run - behind the MachineProbe a test replaces.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Env, MachineProbe } from './types.ts';

function onPath(name: string, env: Env, platform: string): string | null
{
    const key = Object.keys(env).find((variableName) => variableName.toUpperCase() === 'PATH');
    const win = platform === 'win32';
    const names = win ? [name, `${name}.exe`, `${name}.cmd`, `${name}.bat`] : [name];
    const pathApi = win ? path.win32 : path.posix;
    for (const dir of String((key && env[key]) || '').split(win ? ';' : ':').filter(Boolean))
        for (const candidate of names)
        {
            const file = pathApi.join(dir, candidate);
            try { if (fs.statSync(file).isFile()) return file; } catch { /* next */ }
        }
    return null;
}

export function realMachine({ env = process.env, platform = process.platform }: { env?: Env; platform?: string } = {}): MachineProbe
{
    return {
        exists: (file: string) => fs.existsSync(file),
        realpath: (file: string) => { try { return fs.realpathSync(file); } catch { return null; } },
        which: (name: string) => onPath(name, env, platform),
        // npm and npx are .cmd shims on Windows; a shell is what runs them
        // `options.cwd` and `options.env` (merged over the machine's) are for the audit, which runs in a temp folder
        run: (cmd: string, args: string[], options: { cwd?: string; env?: Env } = {}) => spawnSync(cmd, args, { encoding: 'utf8', env: { ...env, ...(options.env || {}) }, cwd: options.cwd, shell: platform === 'win32' && /^(npm|npx)$/.test(cmd), windowsHide: true }),
        nodeVersion: process.versions.node,
    };
}
