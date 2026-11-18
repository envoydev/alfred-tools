// Whether a parsed plan file has the shape apply reads before it starts: an object with the project's folder and a list
// of steps. Anything else - a picks file, an inventory, a list - is refused before a step runs.
import type { Plan } from '../plan/types.ts';

export const isPlanFile = (value: unknown): value is Plan => typeof value === 'object' && value !== null && 'project' in value && typeof value.project === 'string' && 'steps' in value && Array.isArray(value.steps);
