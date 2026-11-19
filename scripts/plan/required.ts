// A value the plan's own builders always set, checked where a reader needs it: absent, the plan stops with an Error that
// says which, where a `!` would have stopped it with a TypeError naming none.
export function required<Value>(value: Value | null | undefined, missing: string): Value
{
    if (value === null || value === undefined) throw new Error(missing);
    return value;
}
