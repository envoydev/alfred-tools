// @ts-nocheck - typed in Task 11
// The context a plan is made in: the machine, the project, the roots and the catalog.
import { alfredData } from '../entries/locations.ts';
import { liveReader } from './asks-keys.ts';
import * as account from '../core/account.ts';

// 'A', 'A and B', 'A, B and C'
export const andList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export const SCOPES = ['local', 'project', 'user'];

export function makeCtx(inv, opts = {})
{
    const ctx = {
        platform: inv.os, arch: inv.arch, project: inv.project, env: opts.env || process.env,
        home: opts.home || account.homeDir(opts.env || process.env), exists: opts.exists, isDir: opts.isDir, machine: opts.machine || {},
    };
    // alfred-code set up in this project (its .alfred/.gitignore): its folder is recommended for the data (D3)
    ctx.alfredHere = alfredData(ctx, inv.alfredCodeEnabled);
    // a live registration, read in this process for a key comparison (R1) - only from an account the caller's env names
    ctx.readLive = opts.readLive || liveReader(inv.project, opts.env);
    return ctx;
}

