// @ts-nocheck - typed in Task 10
// The platform a registration is built for: the path flavour of its OS and the Python request on Windows ARM64.
import path from 'node:path';

export const pathFor = (platform) => (platform === 'win32' ? path.win32 : path.posix);
export const slashes = (p) => p.replace(/\\/g, '/');

// An x64 node emulated on ARM reports arch x64 and PROCESSOR_ARCHITECTURE AMD64, so the machine-wide
// PROCESSOR_IDENTIFIER ('ARMv8 (64-bit) Family 8 ...') is what still tells the truth there (alfred-code uv-python.js).
export function isWindowsArm({ platform, arch, env = {} })
{
    if (platform !== 'win32') return false;
    if (arch === 'arm64') return true;
    if (/^arm64$/i.test(env.PROCESSOR_ARCHITECTURE || '') || /^arm64$/i.test(env.PROCESSOR_ARCHITEW6432 || '')) return true;
    return /^arm/i.test(env.PROCESSOR_IDENTIFIER || '');
}

// The `--python` request: the row's minor, or on Windows ARM64 the x64 build of that minor (every wheel exists there).
export function pythonRequest(route, ctx, rules)
{
    if (!isWindowsArm(ctx)) return route.python;
    return rules.windowsArmPython.replace('{minor}', route.python);
}

