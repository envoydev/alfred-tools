// The projects serena_config.yml lists, and which of them still keep a .serena folder inside their own tree. Reads the
// `projects:` list only (a YAML list of scalars, block or flow); the file's other lines, auth_secret included, are never read.
import fs from 'node:fs';
import path from 'node:path';
import { scalarOf } from './yaml.ts';

const PROJECTS_KEY = /^projects[ \t]*:(.*?)\r?$/;
const BLOCK_ITEM = /^[ \t]*-[ \t]+(.*?)\r?$/;

// -> the paths in the file's projects list, [] when the file or the key is not there
export function projectsOf(file: string): string[]
{
    let text: string;
    try { text = fs.readFileSync(file, 'utf8'); } catch { return []; }
    const lines = text.split('\n');
    const at = lines.findIndex((line) => PROJECTS_KEY.test(line));
    const keyLine = lines[at];
    if (keyLine === undefined) return [];
    const [, raw = ''] = PROJECTS_KEY.exec(keyLine) ?? [];
    // a flow list closed on its line: its items, a comment after it dropped, so a quoted # stays in its item
    const [, flowItems] = /^\[(.*)\](?:\s+#.*)?$/.exec(raw.trim()) ?? [];
    if (flowItems !== undefined) return flowItems.split(',').map(scalarOf).filter(Boolean);
    const inline = raw.replace(/\s+#.*$/, '').trim();
    if (inline.startsWith('['))
        return inline.replace(/^\[|\]$/g, '').split(',').map(scalarOf).filter(Boolean);
    const out: string[] = [];
    for (const line of lines.slice(at + 1))
    {
        if (/^\s*(#.*)?\r?$/.test(line)) continue;
        const [, itemText] = BLOCK_ITEM.exec(line) ?? [];
        if (itemText === undefined) break;
        const value = scalarOf(itemText);
        if (value) out.push(value);
    }
    return out;
}

// -> one line for each listed project that still has a <project>/.serena folder: names only, nothing is moved or deleted
export function inTreeLines(file: string, home: string): string[]
{
    const base = home.replace(/\\/g, '/').replace(/\/+$/, '');
    return projectsOf(file)
        .filter((project) => { try { return fs.statSync(path.join(project, '.serena')).isDirectory(); } catch { return false; } })
        .map((project) => `serena keeps using ${project}/.serena until it is moved to ${base}/projects/${project.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop()}`);
}
