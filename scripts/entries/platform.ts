// The platform a registration is built for: the path flavour of its OS and the Python request on Windows ARM64.
import path from 'node:path';
import type { Env } from '../core/types.ts';
import type { CatalogRoute, CatalogRules } from '../catalog/types.ts';

export const pathFor = (platform: string): path.PlatformPath => (platform === 'win32' ? path.win32 : path.posix);
export const slashes = (p: string): string => p.replace(/\\/g, '/');

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
export function pythonRequest(route: CatalogRoute, ctx: { platform: string; arch?: string | undefined; env?: Env | undefined }, rules: CatalogRules): string
{
    if (!isWindowsArm(ctx)) return route.python!;
    return rules.windowsArmPython.replace('{minor}', route.python!);
}

