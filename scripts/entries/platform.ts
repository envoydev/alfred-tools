// The platform a registration is built for: the path flavour of its OS and the Python request on Windows ARM64.
import path from 'node:path';
import type { Env, PathApi } from '../core/types.ts';
import type { CatalogRoute, CatalogRules } from '../catalog/types.ts';

export const pathFor = (platform: string): PathApi => (platform === 'win32' ? path.win32 : path.posix);
export const slashes = (pathText: string): string => pathText.replace(/\\/g, '/');
// The path flavour a path is written in: one that starts with a drive (C:\ or C:/) or a UNC prefix is Windows', any other
// POSIX's.
export const pathApiOf = (pathText: string): PathApi => (/^(?:[A-Za-z]:[\\/]|\\\\)/.test(pathText) ? path.win32 : path.posix);

// Whether `file` lies inside `folder`, by the path text (no file is read). The folder itself counts only with `orSame`:
// a root's own files count it (root-files.ts, change.ts), a project file or a path made relative to it does not.
export function isInside(pathApi: PathApi, folder: string, file: string, { orSame }: { orSame: boolean }): boolean
{
    const relativePath = pathApi.relative(folder, file);
    if (relativePath === '') return orSame;
    return !relativePath.startsWith('..') && !pathApi.isAbsolute(relativePath);
}

// An x64 node emulated on ARM reports arch x64 and PROCESSOR_ARCHITECTURE AMD64, so the machine-wide
// PROCESSOR_IDENTIFIER ('ARMv8 (64-bit) Family 8 ...') is what still tells the truth there (alfred-code uv-python.js).
export function isWindowsArm({ platform, arch, env = {} }: { platform: string; arch?: string | undefined; env?: Env | undefined }): boolean
{
    if (platform !== 'win32') return false;
    if (arch === 'arm64') return true;
    if (/^arm64$/i.test(env.PROCESSOR_ARCHITECTURE || '') || /^arm64$/i.test(env.PROCESSOR_ARCHITEW6432 || '')) return true;
    return /^arm/i.test(env.PROCESSOR_IDENTIFIER || '');
}

// The `--python` request: the row's minor, or on Windows ARM64 the x64 build of that minor (every wheel exists there).
export function pythonRequest(route: CatalogRoute, context: { platform: string; arch?: string | undefined; env?: Env | undefined }, rules: CatalogRules): string
{
    const python = route.python;
    if (python === undefined) throw new Error('a uvx route names the python minor it runs');
    if (!isWindowsArm(context)) return python;
    return rules.windowsArmPython.replace('{minor}', python);
}

