// The shapes hud/ reads: the status line a platform should have, and how an account's statusLine is told.
import type { Env } from '../core/types.ts';

export type Exists = (file: string) => boolean;

// The line this platform should have: the shell it runs in, the command, the launcher it runs (cmd only), and where
// claude-hud 0.11 puts its own launcher.
export interface Expected
{
    shell: 'bash' | 'cmd';
    command: string;
    launcher: { file: string; wrapper: string } | null;
    hudDir: string;
}
export interface ExpectedInput
{
    platform: string;
    configDir: string;
    runtime: string;
    env: Env;
    exists: Exists;
    bash: boolean;
}

export type HudState = 'absent' | 'current' | 'stale' | 'foreign';
export interface Classified
{
    state: HudState;
    label?: string;
}

// The placeholders a shape is filled with.
export type ShapeVars = Partial<Record<'RUNTIME_PATH' | 'SOURCE' | 'CMD_PATH' | 'WRAPPER_PATH', string>>;
