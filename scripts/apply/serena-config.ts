// SERENA'S BASE MODES (spec D7, F9). <SERENA_HOME>/serena_config.yml lists `base_modes`, and with its default the manual
// Serena hands the model describes edit tools the plugin's context leaves out. This sets `base_modes: []`.
//
// The file holds Serena's generated auth_secret. So this reads only the base_modes key and its items, changes no other
// byte, writes through a temporary file with the file's own mode, and never prints, returns or logs the file's text.
import fs from 'node:fs';
import path from 'node:path';
import type { ServerEntry } from '../core/types.ts';

export const CONFIG = 'serena_config.yml';
const KEY = /^base_modes[ \t]*:(.*?)(\r?)$/;

export const configOf = (home: string): string => (/^[A-Za-z]:[\\/]|\\\\/.test(home) ? path.win32 : path.posix).join(home, CONFIG);

// The lines of a text with their endings: [[body, eol]].
function linesOf(text: string): [string, string][]
{
    const out: [string, string][] = [];
    const linePattern = /([^\n]*?)(\r?\n|$)/g;
    let match: RegExpExecArray | null;
    while ((match = linePattern.exec(text)) !== null)
    {
        if (match[0] === '') break;
        out.push([match[1]!, match[2]!]);
    }
    return out;
}

// Where base_modes sits: { at, end, inline } over the lines - `end` past its items - or null when the file has no key.
function locate(lines: [string, string][]): { at: number; end: number; inline: string } | null
{
    const at = lines.findIndex(([body]) => KEY.test(body));
    if (at < 0) return null;
    const value = KEY.exec(lines[at]![0])![1]!.replace(/\s+#.*$/, '').trim();
    let end = at + 1;
    if (value.startsWith('[') && !value.includes(']'))
    {
        // a flow list over several lines: up to the line that closes it
        while (end < lines.length && !lines[end]![0].includes(']')) end += 1;
        end = Math.min(end + 1, lines.length);
    }
    else if (value === '')
        while (end < lines.length && /^[ \t]*-([ \t]|$)/.test(lines[end]![0])) end += 1;
    return { at, end, inline: value };
}

const readText = (file: string): string | null => { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } };

// -> 'absent' (no file, or no base_modes key) | 'empty' (base_modes: []) | 'set'
export function baseModesState(file: string): 'absent' | 'empty' | 'set'
{
    const text = readText(file);
    if (text === null) return 'absent';
    const lines = linesOf(text);
    const location = locate(lines);
    if (!location) return 'absent';
    if (location.inline === '[]') return 'empty';
    if (location.inline === '' && location.end === location.at + 1) return 'empty';
    return 'set';
}

// base_modes: [] in place of the key and its items (or appended when the file has no key). -> { changed, detail }
export function emptyBaseModes(file: string): { changed: boolean; detail: string }
{
    const text = readText(file);
    if (text === null) return { changed: false, detail: `${file} is not there yet - serena writes it at its first start` };
    const lines = linesOf(text);
    const location = locate(lines);
    const lineEnd = text.includes('\r\n') ? '\r\n' : '\n';
    let next: string;
    if (!location) next = `${text}${text === '' || /\n$/.test(text) ? '' : lineEnd}base_modes: []${lineEnd}`;
    else
    {
        if (location.inline === '[]') return { changed: false, detail: `${file}: base_modes is [] already` };
        const keyEol = lines[location.end - 1]![1] || lines[location.at]![1] || '';
        const head = lines.slice(0, location.at).map(([body, ending]) => body + ending).join('');
        const tail = lines.slice(location.end).map(([body, ending]) => body + ending).join('');
        next = `${head}base_modes: []${keyEol}${tail}`;
    }
    if (next === text) return { changed: false, detail: `${file}: base_modes is [] already` };
    replaceInPlace(file, next);
    return { changed: true, detail: `set base_modes: [] in ${file}` };
}

// The file's new text through a temporary file, with the file's own mode.
function replaceInPlace(file: string, next: string): void
{
    const tmp = `${file}.${process.pid}.tmp`;
    const mode = fs.statSync(file).mode & 0o777;
    fs.writeFileSync(tmp, next, { mode });
    fs.chmodSync(tmp, mode);
    fs.renameSync(tmp, file);
}

export const FOLDER_KEY = 'project_serena_folder_location';
const FOLDER_LINE = new RegExp(`^${FOLDER_KEY}[ \\t]*:(.*?)(\\r?)$`);

// serena 2.1.0 puts each project's .serena folder under <home>/projects/<project folder name>. The value is single-quoted
// YAML with / separators; a $ in the home would read as a placeholder, so it is refused.
export function folderValue(home: string): { value: string } | { error: string }
{
    if (home.includes('$')) return { error: `${home} holds a $ - serena would read it as a placeholder, so ${FOLDER_KEY} is not set` };
    const base = home.replace(/\\/g, '/').replace(/\/+$/, '');
    return { value: `'${base.replace(/'/g, "''")}/projects/$projectFolderName'` };
}

// The text of a YAML scalar on a key line, quotes and a trailing comment dropped.
function scalarOf(raw: string): string
{
    const text = raw.trim();
    const single = /^'((?:[^']|'')*)'(?:\s+#.*)?$/.exec(text);
    if (single) return single[1]!.replace(/''/g, "'");
    const double = /^"((?:[^"\\]|\\.)*)"(?:\s+#.*)?$/.exec(text);
    if (double) return double[1]!.replace(/\\(.)/g, '$1');
    return text.replace(/\s+#.*$/, '');
}

// -> 'absent' (no file, or no key) | 'same' (the value folderValue(home) writes) | 'other'
export function folderState(file: string, home: string): 'absent' | 'same' | 'other'
{
    const text = readText(file);
    if (text === null) return 'absent';
    const line = linesOf(text).find(([body]) => FOLDER_LINE.test(body));
    if (!line) return 'absent';
    const wanted = folderValue(home);
    if ('error' in wanted) return 'other';
    return scalarOf(FOLDER_LINE.exec(line[0])![1]!) === scalarOf(wanted.value) ? 'same' : 'other';
}

// The value the file holds for the folder key now, quotes dropped (a path, as folderValue writes one) - null when the file
// or the key is absent. Only this one key's line is read; nothing else of the config is returned.
export function folderCurrent(file: string): string | null
{
    const text = readText(file);
    const line = text === null ? undefined : linesOf(text).find(([body]) => FOLDER_LINE.test(body));
    return line ? scalarOf(FOLDER_LINE.exec(line[0])![1]!) : null;
}

// The key's value in place of the first one (or appended when the file has none); a missing file is not created. -> { changed, detail }
export function setProjectFolder(file: string, home: string): { changed: boolean; detail: string }
{
    const wanted = folderValue(home);
    if ('error' in wanted) return { changed: false, detail: wanted.error };
    const text = readText(file);
    if (text === null) return { changed: false, detail: `${file} not found` };
    const lines = linesOf(text);
    const at = lines.findIndex(([body]) => FOLDER_LINE.test(body));
    const lineEnd = text.includes('\r\n') ? '\r\n' : '\n';
    let next: string;
    if (at < 0) next = `${text}${text === '' || /\n$/.test(text) ? '' : lineEnd}${FOLDER_KEY}: ${wanted.value}${lineEnd}`;
    else
    {
        if (folderState(file, home) === 'same') return { changed: false, detail: `${file}: ${FOLDER_KEY} is set already` };
        next = lines.map(([body, ending], index) => (index === at ? `${FOLDER_KEY}: ${wanted.value}${ending}` : body + ending)).join('');
    }
    replaceInPlace(file, next);
    return { changed: true, detail: `set ${FOLDER_KEY} in ${file}` };
}

// A file for a home serena has not started in yet: the three keys, only when there is none. -> { wrote, detail }
export function writeMinimalConfig(file: string, home: string): { wrote: boolean; detail: string }
{
    const wanted = folderValue(home);
    if ('error' in wanted) return { wrote: false, detail: wanted.error };
    if (fs.existsSync(file)) return { wrote: false, detail: `${file} is there already` };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `projects: []\nbase_modes: []\n${FOLDER_KEY}: ${wanted.value}\n`, { flag: 'wx' });
    return { wrote: true, detail: `wrote ${file} with ${FOLDER_KEY}` };
}

// Which homes the edit may touch (D7): never an alfred-code 2.x home (.alfred/serena/home), shared with its old setup;
// on Windows the home is Serena's own default (<profile>\.serena) or a typed space-free folder, which every other Serena
// on the machine reads too. -> { ok, shared?, reason? }
export function editableHome(home: string, context: { platform?: string; home?: string } = {}): { ok: false; reason: string; shared?: undefined } | { ok: true; shared: boolean; reason?: undefined }
{
    const posixHome = String(home || '').replace(/\\/g, '/').replace(/\/+$/, '');
    if (/(^|\/)\.alfred\/serena\/home$/.test(posixHome))
        return { ok: false, reason: `serena's settings at ${configOf(home)} are alfred-code's - base_modes is left; its manual still names edit tools serena does not have` };
    return { ok: true, shared: context.platform === 'win32' };
}

// The plan line for a serena add, replace or move: what the edit will do to its home, before the user confirms.
// -> string | null
export function planNote(entry: ServerEntry | null | undefined, context: { platform?: string; home?: string } = {}): string | null
{
    const home = entry && entry.env && entry.env.SERENA_HOME;
    if (!home) return null;
    const file = configOf(home);
    const editable = editableHome(home, context);
    if (!editable.ok) return editable.reason;
    const folder = folderValue(home);
    if ('error' in folder) return `serena's settings at ${file}: ${folder.error}; its folders stay in each project`;
    if (editable.shared) return `serena's settings at ${file} are shared with any other Serena on this machine; base_modes: [] and ${FOLDER_KEY} (each project's .serena folder under ${home}/projects) apply to all of them`;
    return `serena's settings at ${file}: base_modes: [] after its first start, so its manual names only the tools it has; ${FOLDER_KEY} puts each project's .serena folder under ${home}/projects`;
}

