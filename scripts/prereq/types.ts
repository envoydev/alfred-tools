// The shapes of the prerequisite checks: what a check reads, what it finds, and the report --json prints (stored - do not
// rename: the commands read it).
import type { Env } from '../core/types.ts';
import type { MachineProbe } from '../fix/types.ts';

// What a check reads: the platform, the shell's variables, the home and the machine.
export interface PrereqCtx
{
    platform: string;
    env: Env;
    home: string;
    machine: MachineProbe;
}
// How to get what is missing: a command only where the vendor's docs give one, else its page.
export interface Install
{
    command?: string; // stored - do not rename
    url: string; // stored - do not rename
    note?: string; // stored - do not rename
}
// One check's answer, and the machine facts the plan needs (docker: false picks github's binary fallback).
export interface CheckResult
{
    ok: boolean;
    found?: string;
    install?: Install;
    machine?: { docker?: boolean };
}
export type PrereqCheck = (ctx: PrereqCtx) => CheckResult;

// A tool to check, on its route.
export interface PrereqPick
{
    row: string;
    route: string | null | undefined;
}
export interface AuditCounts
{
    critical: number; // stored - do not rename
    high: number; // stored - do not rename
    moderate: number; // stored - do not rename
    low: number; // stored - do not rename
    total: number; // stored - do not rename
}
export interface AuditResult
{
    ok: boolean; // stored - do not rename
    counts?: AuditCounts; // stored - do not rename
    note?: string; // stored - do not rename
}
export interface Need
{
    id: string; // stored - do not rename
    ok: boolean; // stored - do not rename
    found: string | null; // stored - do not rename
    install: Install | null; // stored - do not rename
}
export interface ToolCheck
{
    row: string; // stored - do not rename
    route: string | null | undefined; // stored - do not rename
    needs: Need[]; // stored - do not rename
    audit?: AuditResult & { package: string }; // stored - do not rename
}
export interface PrereqReport
{
    tools: ToolCheck[]; // stored - do not rename
    missing: number; // stored - do not rename
    machine: { docker?: boolean }; // stored - do not rename
}
