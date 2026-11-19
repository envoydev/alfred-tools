// The context a plan is made in: the machine, the project, the roots and the catalog.
import { alfredData } from '../entries/locations.ts';
import { liveReader } from './asks-keys.ts';
import * as account from '../core/account.ts';
import type { Inventory } from '../inventory/types.ts';
import type { MadeCtx, PlanOptions } from './types.ts';

// 'A', 'A and B', 'A, B and C'
export const andList = (items: string[]): string => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

export function makeCtx(inventory: Inventory, options: PlanOptions = {}): MadeCtx
{
    const env = options.env || process.env;
    const machine = {
        platform: inventory.os, arch: inventory.arch, project: inventory.project, env,
        home: options.home || account.homeDir(env), exists: options.exists, isDir: options.isDir, machine: options.machine || {},
    };
    return {
        ...machine,
        // alfred-code set up in this project (its .alfred/.gitignore): its folder is recommended for the data (D3)
        alfredHere: alfredData(machine, inventory.alfredCodeEnabled),
        // a live registration, read in this process for a key comparison (R1) - only from an account the caller's env names
        readLive: options.readLive || liveReader(inventory.project, options.env),
    };
}

