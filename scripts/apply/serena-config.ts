// SERENA'S BASE MODES (spec D7, F9). <SERENA_HOME>/serena_config.yml lists `base_modes`, and with its default the manual
// Serena hands the model describes edit tools the plugin's context leaves out. This sets `base_modes: []`.
//
// The file holds Serena's generated auth_secret. So this reads only the base_modes key and its items, changes no other
// byte, writes through a temporary file with the file's own mode, and never prints, returns or logs the file's text.
import fs from 'node:fs';
import path from 'node:path';

export const CONFIG = 'serena_config.yml';
const KEY = /^base_modes[ \t]*:(.*?)(\r?)$/;

export const configOf = (home) => (/^[A-Za-z]:[\\/]|\\\\/.test(home) ? path.win32 : path.posix).join(home, CONFIG);

// The lines of a text with their endings: [[body, eol]].
function linesOf(text)
{
    const out = [];
    const re = /([^\n]*?)(\r?\n|$)/g;
    let m;
    while ((m = re.exec(text)) !== null)
    {
        if (m[0] === '') break;
        out.push([m[1], m[2]]);
    }
    return out;
}

// Where base_modes sits: { at, end, inline } over the lines - `end` past its items - or null when the file has no key.
function locate(lines)
{
    const at = lines.findIndex(([body]) => KEY.test(body));
    if (at < 0) return null;
    const value = KEY.exec(lines[at][0])[1].replace(/\s+#.*$/, '').trim();
    let end = at + 1;
    if (value.startsWith('[') && !value.includes(']'))
    {
        // a flow list over several lines: up to the line that closes it
        while (end < lines.length && !lines[end][0].includes(']')) end += 1;
        end = Math.min(end + 1, lines.length);
    }
    else if (value === '')
        while (end < lines.length && /^[ \t]*-([ \t]|$)/.test(lines[end][0])) end += 1;
    return { at, end, inline: value };
}

const readText = (file) => { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } };

// -> 'absent' (no file, or no base_modes key) | 'empty' (base_modes: []) | 'set'
export function baseModesState(file)
{
    const text = readText(file);
    if (text === null) return 'absent';
    const lines = linesOf(text);
    const loc = locate(lines);
    if (!loc) return 'absent';
    if (loc.inline === '[]') return 'empty';
    if (loc.inline === '' && loc.end === loc.at + 1) return 'empty';
    return 'set';
}

// base_modes: [] in place of the key and its items (or appended when the file has no key). -> { changed, detail }
export function emptyBaseModes(file)
{
    const text = readText(file);
    if (text === null) return { changed: false, detail: `${file} is not there yet - serena writes it at its first start` };
    const lines = linesOf(text);
    const loc = locate(lines);
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    let next;
    if (!loc) next = `${text}${text === '' || /\n$/.test(text) ? '' : eol}base_modes: []${eol}`;
    else
    {
        if (loc.inline === '[]') return { changed: false, detail: `${file}: base_modes is [] already` };
        const keyEol = lines[loc.end - 1][1] || lines[loc.at][1] || '';
        const head = lines.slice(0, loc.at).map(([b, e]) => b + e).join('');
        const tail = lines.slice(loc.end).map(([b, e]) => b + e).join('');
        next = `${head}base_modes: []${keyEol}${tail}`;
    }
    if (next === text) return { changed: false, detail: `${file}: base_modes is [] already` };
    const tmp = `${file}.${process.pid}.tmp`;
    const mode = fs.statSync(file).mode & 0o777;
    fs.writeFileSync(tmp, next, { mode });
    fs.chmodSync(tmp, mode);
    fs.renameSync(tmp, file);
    return { changed: true, detail: `set base_modes: [] in ${file}` };
}

// Which homes the edit may touch (D7): never an alfred-code 2.x home (.alfred/serena/home), shared with its old setup;
// on Windows the home is Serena's own default (<profile>\.serena) or a typed space-free folder, which every other Serena
// on the machine reads too. -> { ok, shared?, reason? }
export function editableHome(home, ctx = {})
{
    const p = String(home || '').replace(/\\/g, '/').replace(/\/+$/, '');
    if (/(^|\/)\.alfred\/serena\/home$/.test(p))
        return { ok: false, reason: `serena's settings at ${configOf(home)} are alfred-code's - base_modes is left; its manual still names edit tools serena does not have` };
    return { ok: true, shared: ctx.platform === 'win32' };
}

// The plan line for a serena add, replace or move: what the edit will do to its home, before the user confirms.
// -> string | null
export function planNote(entry, ctx = {})
{
    const home = entry && entry.env && entry.env.SERENA_HOME;
    if (!home) return null;
    const file = configOf(home);
    const e = editableHome(home, ctx);
    if (!e.ok) return e.reason;
    if (e.shared) return `serena's settings at ${file} are shared with any other Serena on this machine; base_modes: [] applies to all of them`;
    return `serena's settings at ${file}: base_modes: [] after its first start, so its manual names only the tools it has`;
}

