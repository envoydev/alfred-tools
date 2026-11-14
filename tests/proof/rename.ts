// The rename driver: renames bindings with TypeScript's own rename service over the tree's tsconfig.json, so every use
// in every file moves with the declaration and a local used as a shorthand key keeps its key (`{ n }` -> `{ n: count }`).
//   node tests/proof/rename.ts <renames.json>
// Each item is { file, line, column, name, to }: `file` relative to the current folder (the tree's root), `line` and
// `column` 1-based, pointing at the binding's declaration - two bindings of one name on a line are told apart by column.
// It refuses - exit 1, nothing written - a position that does not hold `name`, a rename the service will not do, a
// rename that would touch a property marked `// stored - do not rename` (on its line or its interface's), and an old
// name catalog/fixes.json names as a `detect`, `fix` or `steps` function. Items apply in order; each position is read
// against the original text.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const STORED = 'stored - do not rename';

interface RenameItem
{
    file: string;
    line: number;
    column: number;
    name: string;
    to: string;
}
// One applied location: where it started and how long it was in the text it was applied to, and its new length.
interface Edit
{
    start: number;
    oldLength: number;
    newLength: number;
}

class Refused extends Error {}

// The names catalog/fixes.json calls by string: renaming one breaks the lookup at run time.
function fixNames(root: string): Set<string>
{
    const file = path.join(root, 'catalog', 'fixes.json');
    if (!fs.existsSync(file)) return new Set();
    const rows = (JSON.parse(fs.readFileSync(file, 'utf8')) as { fixes: Record<string, unknown>[] }).fixes;
    return new Set(rows.flatMap((row) => [row['detect'], row['fix'], row['steps']]).filter((name): name is string => typeof name === 'string'));
}

// A language service over the tree's tsconfig.json whose files are read from `texts` once changed.
function service(root: string, texts: Map<string, string>, versions: Map<string, number>): ts.LanguageService
{
    const configFile = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
    if (!configFile) throw new Refused(`no tsconfig.json at ${root}`);
    const config = ts.getParsedCommandLineOfConfigFile(configFile, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => { throw new Refused(ts.flattenDiagnosticMessageText(d.messageText, '\n')); } });
    if (!config) throw new Refused(`tsconfig.json at ${root} could not be read`);
    const host: ts.LanguageServiceHost = {
        getScriptFileNames: () => config.fileNames,
        getScriptVersion: (file) => String(versions.get(file) ?? 0),
        getScriptSnapshot: (file) =>
        {
            const text = texts.get(file) ?? (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined);
            return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
        },
        getCurrentDirectory: () => root,
        getCompilationSettings: () => config.options,
        getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
        fileExists: (file) => texts.has(file) || ts.sys.fileExists(file),
        readFile: (file) => texts.get(file) ?? ts.sys.readFile(file),
        readDirectory: ts.sys.readDirectory,
        directoryExists: ts.sys.directoryExists,
        getDirectories: ts.sys.getDirectories,
    };
    return ts.createLanguageService(host, ts.createDocumentRegistry());
}

// The original position moved through every edit applied to its file since: an edit before it shifts it by the change in
// length; an edit over it leaves it at the edit's start, where the name check then refuses it.
function moved(position: number, batches: Edit[][]): number
{
    let at = position;
    for (const batch of batches)
    {
        let shift = 0;
        for (const edit of batch)
        {
            if (edit.start + edit.oldLength <= at) shift += edit.newLength - edit.oldLength;
            else if (edit.start <= at) return edit.start + shift;
        }
        at += shift;
    }
    return at;
}

// Whether the rename location sits on a line, or in an interface, marked stored.
function storedAt(program: ts.Program, file: string, start: number): boolean
{
    const source = program.getSourceFile(file);
    if (!source) return false;
    const { line } = source.getLineAndCharacterOfPosition(start);
    const lineEnd = source.getLineEndOfPosition(start);
    if (source.text.slice(source.getPositionOfLineAndCharacter(line, 0), lineEnd).includes(STORED)) return true;
    let node: ts.Node | undefined = findNode(source, start);
    while (node && !ts.isInterfaceDeclaration(node) && !ts.isTypeAliasDeclaration(node)) node = node.parent;
    return !!node && source.text.slice(node.getFullStart(), node.getStart(source)).includes(STORED);
}
// Where a location sees another binding already named `to` - the rename service does not check, and the renamed
// binding would shadow it or be shadowed by it: '<file>:<line>:<column>', or null.
function clashAt(program: ts.Program, root: string, locations: readonly ts.RenameLocation[], file: string, position: number, to: string): string | null
{
    const checker = program.getTypeChecker();
    const at = program.getSourceFile(file);
    const renamed = at && findNode(at, position);
    const symbol = renamed && checker.getSymbolAtLocation(renamed);
    for (const location of locations)
    {
        const source = program.getSourceFile(location.fileName);
        const node = source && findNode(source, location.textSpan.start);
        if (!source || !node) continue;
        const seen = checker.getSymbolsInScope(node, ts.SymbolFlags.Value | ts.SymbolFlags.Alias).find((s) => s.name === to && s !== symbol);
        if (seen)
        {
            const { line, character } = source.getLineAndCharacterOfPosition(location.textSpan.start);
            return `${path.relative(root, location.fileName)}:${line + 1}:${character + 1}`;
        }
    }
    return null;
}
function findNode(node: ts.Node, position: number): ts.Node | undefined
{
    if (position < node.getStart() || position >= node.getEnd()) return undefined;
    for (const child of node.getChildren())
    {
        const found = findNode(child, position);
        if (found) return found;
    }
    return node;
}

function run(listFile: string): void
{
    const root = process.cwd();
    const items = JSON.parse(fs.readFileSync(listFile, 'utf8')) as RenameItem[];
    const named = fixNames(root);
    const texts = new Map<string, string>();
    const versions = new Map<string, number>();
    const batches = new Map<string, Edit[][]>();
    const ls = service(root, texts, versions);
    let places = 0;
    for (const item of items)
    {
        const where = `${item.file}:${item.line}:${item.column} ${item.name} -> ${item.to}`;
        const file = path.resolve(root, item.file);
        try
        {
            if (named.has(item.name)) throw new Refused('catalog/fixes.json names it');
            const program = ls.getProgram();
            const source = program?.getSourceFile(file);
            if (!program || !source) throw new Refused('the file is not in the tsconfig.json program');
            const original = fs.readFileSync(file, 'utf8');
            const lines = original.split('\n');
            if (item.line < 1 || item.line > lines.length) throw new Refused('no such line');
            const lineStart = lines.slice(0, item.line - 1).reduce((sum, text) => sum + text.length + 1, 0);
            const position = moved(lineStart + item.column - 1, batches.get(file) ?? []);
            const after = source.text.charAt(position + item.name.length);
            if (source.text.slice(position, position + item.name.length) !== item.name || /[\w$]/.test(after))
                throw new Refused(`the position holds '${source.text.slice(position, position + item.name.length)}'`);
            const info = ls.getRenameInfo(file, position, { providePrefixAndSuffixTextForRename: true });
            if (!info.canRename) throw new Refused(info.localizedErrorMessage);
            const locations = ls.findRenameLocations(file, position, false, false, { providePrefixAndSuffixTextForRename: true });
            if (!locations) throw new Refused('the rename service found no locations');
            const stored = locations.find((l) => storedAt(program, l.fileName, l.textSpan.start));
            if (stored) throw new Refused(`it reaches ${path.relative(root, stored.fileName)}, marked ${STORED}`);
            const clash = clashAt(program, root, locations, file, position, item.to);
            if (clash) throw new Refused(`'${item.to}' is already in scope at ${clash}`);
            const byFile = new Map<string, ts.RenameLocation[]>();
            for (const location of locations) byFile.set(location.fileName, [...(byFile.get(location.fileName) ?? []), location]);
            for (const [target, list] of byFile)
            {
                let text = texts.get(target) ?? fs.readFileSync(target, 'utf8');
                const edits: Edit[] = list.map((l) => ({ start: l.textSpan.start, oldLength: l.textSpan.length, newLength: 0, text: `${l.prefixText ?? ''}${item.to}${l.suffixText ?? ''}` }))
                    .sort((a, b) => b.start - a.start)
                    .map((e) =>
                    {
                        text = text.slice(0, e.start) + e.text + text.slice(e.start + e.oldLength);
                        return { start: e.start, oldLength: e.oldLength, newLength: e.text.length };
                    });
                texts.set(target, text);
                versions.set(target, (versions.get(target) ?? 0) + 1);
                batches.set(target, [...(batches.get(target) ?? []), edits.sort((a, b) => a.start - b.start)]);
            }
            places += locations.length;
        }
        catch (caught)
        {
            if (!(caught instanceof Refused)) throw caught;
            console.error(`rename: refused ${where}: ${caught.message} - nothing written`);
            process.exit(1);
        }
    }
    for (const [file, text] of texts) fs.writeFileSync(file, text);
    console.log(`rename: renamed ${items.length} binding${items.length === 1 ? '' : 's'} at ${places} place${places === 1 ? '' : 's'} in ${texts.size} file${texts.size === 1 ? '' : 's'}`);
}

const listFile = process.argv[2];
if (!listFile)
{
    console.error('usage: rename.ts <renames.json>');
    process.exit(2);
}
run(path.resolve(listFile));
