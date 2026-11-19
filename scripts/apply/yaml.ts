// The one-line YAML values serena_config.yml holds, read the way both of apply's readers of it need.

// The text of a YAML scalar on a key line or a list item: single- or double-quoted with a comment after it allowed, or
// plain with its trailing comment dropped.
export function scalarOf(raw: string): string
{
    const text = raw.trim();
    const single = /^'((?:[^']|'')*)'(?:\s+#.*)?$/.exec(text);
    if (single) { const [, inner = ''] = single; return inner.replace(/''/g, "'"); }
    const double = /^"((?:[^"\\]|\\.)*)"(?:\s+#.*)?$/.exec(text);
    if (double) { const [, inner = ''] = double; return inner.replace(/\\(.)/g, '$1'); }
    return text.replace(/\s+#.*$/, '');
}
