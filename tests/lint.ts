#!/usr/bin/env node
// JSON shape checks that need no test runner: every shipped JSON file parses, the manifest has the one version and the
// id that must never change, and no component path in a command or skill points outside ${CLAUDE_PLUGIN_ROOT}.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { parseAskBlocks, problemsOf } from './ask-blocks.ts';
import { sendsToOther, walkTexts } from './ask-texts.ts';

const root = path.resolve(import.meta.dirname, '..');
const problems: string[] = [];
const need = (cond: unknown, msg: string) => { if (!cond) problems.push(msg); };
// The copied files stay CommonJS, so they load through a require; an ES module loads by its file URL.
const requireCopied = createRequire(import.meta.url);

const jsonFiles = ['.claude-plugin/plugin.json', 'catalog/tools.json', 'catalog/fixes.json', 'catalog/reserved-names.json', 'package.json'];
const docs: Record<string, { name?: string; version?: string } | undefined> = {};
for (const rel of jsonFiles)
{
    try { docs[rel] = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); }
    catch (caught) { const err = caught as Error; problems.push(`${rel}: ${err.message}`); }
}

const manifest = docs['.claude-plugin/plugin.json'] || {};
need(manifest.name === 'alfred-tools', 'plugin.json name must stay alfred-tools (renaming it silences every install)');
need(/^\d+\.\d+\.\d+$/.test(manifest.version || ''), 'plugin.json version must be semver');
need(!('dependencies' in manifest), 'plugin.json must not declare dependencies (claude plugin update installs none)');
need(manifest.version === (docs['package.json'] || {}).version, 'package.json version must equal plugin.json version');

// Script paths in commands and skills: only through the plugin root.
const textFiles: string[] = [];
for (const dir of ['commands', 'skills'])
{
    const walk = (d: string) => fs.existsSync(d) && fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p); else if (p.endsWith('.md')) textFiles.push(p);
    });
    walk(path.join(root, dir));
}
for (const file of textFiles)
{
    const text = fs.readFileSync(file, 'utf8');
    text.split('\n').forEach((line, i) => {
        if (/\bnode\s+(?!"\$\{CLAUDE_PLUGIN_ROOT\}\/)["']?(\.\/)?scripts\//.test(line))
            problems.push(`${path.relative(root, file)}:${i + 1}: a script call must be node "\${CLAUDE_PLUGIN_ROOT}/scripts/<file>"`);
        if (/(?<!CLAUDE_PLUGIN_ROOT\}\/)catalog\/[a-z-]+\.json/.test(line) && /node|--catalog/.test(line) && !/\$\{CLAUDE_PLUGIN_ROOT\}\/catalog/.test(line))
            problems.push(`${path.relative(root, file)}:${i + 1}: a catalog path must go through \${CLAUDE_PLUGIN_ROOT}`);
    });
}

// allowed-tools is a pre-approval, so it never covers a call that changes an install: the CLI's own prompt is the guard
// beside the command's written ask. A script that writes is listed only with a read-only flag.
// fetch.ts downloads and runs a package's own install, and sign-in.ts opens a browser and writes tokens, so both count as a write; cursor-mcp.ts writes Cursor's files
const WRITES = /scripts\/(?:apply|fetch|sign-in)\.ts|cursor-mcp\.ts|scripts\/(?:fix|update)\.ts"\s*(?:\*|--apply|\))/;
for (const file of textFiles)
{
    const m = /^allowed-tools:\s*(.+)$/m.exec(fs.readFileSync(file, 'utf8'));
    if (m && WRITES.test(m[1]!)) problems.push(`${path.relative(root, file)}: allowed-tools pre-approves a script that writes (list only --detect, --questions, --check)`);
}

// Ask blocks: 2 to 4 options, one '(Recommended)' and it first, labels equal to asks.STATIC (tests/ask-blocks.ts).
for (const file of textFiles)
    for (const block of parseAskBlocks(fs.readFileSync(file, 'utf8')))
        for (const p of problemsOf(block)) problems.push(`${path.relative(root, file)}: ${p}`);

// Every call of a script that reads the roots map and the records carries the plugin's data folder (spec D2, D6), and a
// read-only flag stays first, so the allowed-tools patterns (`--detect *`, `--questions *`, `--check *`) still match. A
// call is a line of a code block or a backticked one in prose; the allowed-tools line itself is not a call.
const DATA = '--data "${CLAUDE_PLUGIN_DATA}"';
const CALL = /(?:node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/|`)(inventory|plan|apply|fix|update)\.ts"?\s+([^`\n]*)/g;
for (const file of textFiles)
{
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (/^allowed-tools:/.test(line)) return;
        for (const m of line.matchAll(CALL))
        {
            const at = `${path.relative(root, file)}:${i + 1}`;
            if (!m[2]!.includes(DATA)) problems.push(`${at}: ${m[1]}.ts call without ${DATA}`);
            const ro = /--(?:detect|questions|check)\b/.exec(m[2]!);
            if (ro && ro.index !== 0) problems.push(`${at}: ${m[1]}.ts call - ${ro[0]} must be its first argument`);
        }
    });
}

// After a compaction Claude Code re-attaches only the first 5,000 tokens of a command (docs/sources.md), so a longer one
// loses its tail mid-run: 17,500 characters is 5,000 tokens at about 3.5 characters a token.
const COMMAND_MAX_CHARS = 17500;
const commandFiles = fs.readdirSync(path.join(root, 'commands')).filter((name) => name.endsWith('.md')).map((name) => path.join(root, 'commands', name));
for (const file of commandFiles)
{
    const length = fs.readFileSync(file, 'utf8').length;
    if (length > COMMAND_MAX_CHARS) problems.push(`commands/${path.basename(file)}: ${length} characters - over ${COMMAND_MAX_CHARS}, the share of a 5,000-token re-attach (docs/sources.md)`);
}

// The scripts are .ts and run on Node's type stripping (22.18 and newer): each command says what an older Node prints
// and what to tell the user, before its first script call in the body (the frontmatter, allowed-tools included, is
// skipped, as the CALL check skips it). Read with its line breaks folded, since prose wraps.
const OLD_NODE = 'If a script fails with `ERR_UNKNOWN_FILE_EXTENSION` or `Unknown file extension ".ts"`, stop and tell the user: alfred-tools needs Node 22.18 or newer - `node --version` shows yours.';
for (const file of commandFiles)
{
    const body = fs.readFileSync(file, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '').replace(/\s+/g, ' ');
    const call = body.indexOf('node "${CLAUDE_PLUGIN_ROOT}/scripts/');
    const rule = body.indexOf(OLD_NODE);
    if (call >= 0 && (rule < 0 || rule > call)) problems.push(`${path.relative(root, file)}: no old-Node rule ('${OLD_NODE.slice(0, 40)}...') before its first script call`);
}

// install asks only about the tools picked (0.3.0, spec F1, F4): no step about servers already set up, and a missing
// prerequisite is asked one tool per call, as the walk asks one tool at a time
{
    const rel = path.join('commands', 'install.md');
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    if (/^## .*already set up/m.test(text) || text.includes('existing.calls')) problems.push(`${rel}: no step asks about servers already set up (spec F4) - no 'already set up' heading, no existing.calls`);
    const prereq = /^## \d+\. Prerequisites\n([\s\S]*?)(?=^## )/m.exec(text);
    if (!prereq || !/one tool per call/.test(prereq[1]!.replace(/\s+/g, ' '))) problems.push(`${rel}: the Prerequisites step asks a missing prerequisite one tool per call`);
}

// No text sends the user to the Other field (spec D8): every question the walk can put (tests/ask-texts.ts, Task 4's
// four fixtures), and every line of a command or skill, its ask blocks included - the model repeats what a command says.
for (const { where, text } of walkTexts()) if (sendsToOther(text)) problems.push(`asks.all (${where}): sends the user to Other: ${text}`);
for (const file of textFiles)
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (sendsToOther(line)) problems.push(`${path.relative(root, file)}:${i + 1}: sends the user to Other - the walk asks a typed value next in one plain line`);
    });

// The header helper is copied into the user's root and compared by digest (write-helper, helper-stale): its bytes are pinned
// per version, its first line carries that version, and it needs nothing but Node.
const HELPER_SHA256: Record<number, string> = {
    1: '958abe0bf59ab7ef2551573e3105ab7766036c31fc21d19bb0fcf58675e87719', // 0.2.0
    2: '184d9162cd9d506266eb989704a743fd3608728b0601e8f21a398bbc8b8566de', // prints only when Claude Code runs it
    3: '388dc7ad5ad0093e2340ccadde11ca8b92929f6c3598a306dbebda5b60b798ac', // Basic: email:api_token sent base64-encoded
    4: '6376dc81ff5b192a8e75de1f350e75a766dc9ad01cd950d58fd6733700469017', // exports its reader for mcp-bridge.js
    5: '5631cbd6b2f168595a16ea40e2adee470994d33eebb9f4bf66a5e014443cda26', // the plugin is alfred-tools: ~/.alfred-tools in the chain
    6: 'bab4e23ff4d221384ce27a529f649e929875132ebe00ef6f3206f28256c35281', // header pairs: --header NAME=VAR or NAME:value
};
{
    const rel = path.join('scripts', 'copied', 'mcp-headers.js');
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    const helper = requireCopied(path.join(root, rel));
    const first = /^\/\/ alfred-tools mcp-headers (\d+)\r?$/m.exec(text.split('\n')[0]!);
    need(first, `${rel}: the first line must be '// alfred-tools mcp-headers <version>'`);
    if (first)
    {
        const version = Number(first[1]);
        need(version === helper.HELPER_VERSION, `${rel}: the first line says version ${version}, HELPER_VERSION is ${helper.HELPER_VERSION}`);
        const digest = helper.digestOf(text);
        need(digest === HELPER_SHA256[version], `${rel}: SHA-256 ${digest} is not HELPER_SHA256[${version}] in tests/lint.ts - a changed helper bumps its version`);
    }
    for (const m of text.matchAll(/\brequire\(\s*(['"])([^'"]+)\1\s*\)/g))
        need(m[2]!.startsWith('node:'), `${rel}: require('${m[2]}') - the helper runs outside the plugin, so node: modules only`);
}

// mcp-bridge.js is copied into a root folder the same way (0.4.0): the same first-line and digest rule, node: modules and
// ./mcp-headers.js only, and its CREDENTIAL is keys.ts credentialName's test.
const BRIDGE_SHA256: Record<number, string> = {
    1: '8aff5de859ba6b69c3f40d20d35c2d36738d6c35c791a821614f53a48bc29635', // 0.4.0
    2: 'f4a2b606ee8ab71c0df750b09c47ea80d3474e887a85de81bc1f3dd1904a293c', // the plugin is alfred-tools
    3: '965f7464ba807f096826df78545f55357a573a203f5fe733ae7ba3fb51b41750', // header pairs: --header NAME=VAR or NAME:value
    4: '2c1b879f0d1c71b6e0dff7c9f530a160aef5f5c9d6f8341ee9bab4ac84a247db', // the run mode: --run ENV=KEY -- <launch>
};
{
    const rel = path.join('scripts', 'copied', 'mcp-bridge.js');
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    const bridge = requireCopied(path.join(root, rel));
    const first = /^\/\/ alfred-tools mcp-bridge (\d+)\r?$/m.exec(text.split('\n')[0]!);
    need(first, `${rel}: the first line must be '// alfred-tools mcp-bridge <version>'`);
    if (first)
    {
        const version = Number(first[1]);
        need(version === bridge.BRIDGE_VERSION, `${rel}: the first line says version ${version}, BRIDGE_VERSION is ${bridge.BRIDGE_VERSION}`);
        const digest = requireCopied(path.join(root, 'scripts', 'copied', 'mcp-headers.js')).digestOf(text);
        need(digest === BRIDGE_SHA256[version], `${rel}: SHA-256 ${digest} is not BRIDGE_SHA256[${version}] in tests/lint.ts - a changed bridge bumps its version`);
    }
    for (const m of text.matchAll(/\brequire\(\s*(['"])([^'"]+)\1\s*\)/g))
        need(m[2]!.startsWith('node:') || m[2] === './mcp-headers.js', `${rel}: require('${m[2]}') - the bridge runs outside the plugin, so node: modules and ./mcp-headers.js only`);
    // the pair grammar is the helper's, copied: the bridge parses its own so it runs beside an older helper
    const helperText = fs.readFileSync(path.join(root, 'scripts', 'copied', 'mcp-headers.js'), 'utf8');
    for (const rule of ['NAME_RULE', 'HEADER_RULE', 'FIXED_VALUE_RULE'])
    {
        const line = new RegExp(`^const ${rule} = (/.+/);$`, 'm');
        const inBridge = line.exec(text)?.[1];
        need(inBridge && inBridge === line.exec(helperText)?.[1], `${rel}: ${rule} is not the helper's ${rule} - the two pair grammars must match`);
    }
    const keysSrc = fs.readFileSync(path.join(root, 'scripts', 'keys', 'keys.ts'), 'utf8');
    const pattern = /const credentialName = \(name(?::\s*\w+)?\)(?::\s*\w+)? => (\/[^/]+\/[a-z]*)\.test/.exec(keysSrc);
    need(pattern && String(bridge.CREDENTIAL) === pattern[1], `${rel}: CREDENTIAL is not keys.js credentialName's pattern`);
}

// serena's context file (0.5.0, D7): its number on the first line, and each number's bytes pinned like the helper's
const SERENA_CONTEXT_SHA256: Record<number, string> = {
    1: '5bd9211269e4440ac32b1240b5aa66a277ba16cd84f754adedd58f278ccf5321', // never released
    2: 'fd9132d02abb3ea9d185b43d6ae718af15c8c9a2ff0857353df7e23434dad38e', // 0.5.0, the plugin is alfred-tools
};
{
    const rel = path.join('scripts', 'copied', 'serena-context.yml');
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    const first = /^# alfred-tools serena-context (\d+)\r?$/.exec(text.split('\n')[0]!);
    need(first, `${rel}: the first line must be '# alfred-tools serena-context <version>'`);
    if (first)
    {
        const version = Number(first[1]);
        const want = (await import(pathToFileURL(path.join(root, 'scripts', 'roots', 'roots.ts')).href)).SERENA_CONTEXT_VERSION;
        need(version === want, `${rel}: the first line says version ${version}, SERENA_CONTEXT_VERSION is ${want}`);
        const digest = requireCopied(path.join(root, 'scripts', 'copied', 'mcp-headers.js')).digestOf(text);
        need(digest === SERENA_CONTEXT_SHA256[version], `${rel}: SHA-256 ${digest} is not SERENA_CONTEXT_SHA256[${version}] in tests/lint.ts - a changed context bumps its version`);
    }
}

// Public repo: no absolute local path and no home directory in anything shipped.
const scan = (rel: string): void => {
    const p = path.join(root, rel);
    for (const e of fs.readdirSync(p, { withFileTypes: true }))
    {
        if (['.git', 'node_modules', '.alfred'].includes(e.name) || e.name === '.DS_Store') continue;
        const q = path.join(rel, e.name);
        if (e.isDirectory()) { scan(q); continue; }
        if (!/\.(md|json|js|ts)$/.test(e.name)) continue;
        if (q === path.join('tests', 'lint.ts')) continue;
        const body = fs.readFileSync(path.join(root, q), 'utf8');
        const m = body.match(/\/Users\/[a-z]+\/|C:\\Users\\[A-Za-z]+\\(?!<)/);
        if (m && !q.startsWith('tests' + path.sep) && !q.startsWith('docs' + path.sep) && !q.startsWith('.claude' + path.sep)) problems.push(`${q}: absolute local path ${m[0]}`);
    }
};
scan('.');

// Names that say what they hold (spec, Names): no one-letter binding or property in scripts/ but i, j, k and
// _, and none of the abbreviations the plan names.
const ONE_LETTER_OK = new Set(['i', 'j', 'k', '_']);
const ABBREVIATIONS = new Set(['inv', 'res', 'ret', 'opts', 'cfg', 'fn', 'cb', 'obj', 'arr', 'str', 'val', 'acc', 'cur', 'idx', 'el', 'tmpl', 'rctx', 'ws', 'ctx']);
// i, j and k name a numeric index only: a for loop's counter, the result of an index lookup, the index parameter of an
// array callback, a parameter typed number, or the index of `for (const [i, item] of list.entries())` (never a key of
// `Object.entries(object)`).
const INDEX_LOOKUPS = new Set(['indexOf', 'lastIndexOf', 'findIndex', 'findLastIndex']);
const INDEX_CALLBACKS: Record<string, number> = { map: 1, flatMap: 1, filter: 1, forEach: 1, find: 1, findIndex: 1, findLast: 1, findLastIndex: 1, some: 1, every: 1, reduce: 2 };
const calledName = (call: ts.Node): string | null => ts.isCallExpression(call) && ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : null;
const holdsLookup = (node: ts.Node): boolean => (calledName(node) !== null && INDEX_LOOKUPS.has(calledName(node)!)) || (ts.forEachChild(node, (child) => holdsLookup(child) || undefined) ?? false);
function isIndex(node: ts.Node): boolean
{
    if (ts.isVariableDeclaration(node))
        return (ts.isVariableDeclarationList(node.parent) && ts.isForStatement(node.parent.parent)) || (node.initializer !== undefined && holdsLookup(node.initializer));
    if (ts.isParameter(node))
    {
        if (node.type && node.type.kind === ts.SyntaxKind.NumberKeyword) return true;
        const callback = node.parent;
        const call = callback.parent;
        const at = INDEX_CALLBACKS[calledName(call) ?? ''];
        return (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) && at !== undefined && callback.parameters.indexOf(node) === at;
    }
    if (ts.isBindingElement(node))
    {
        const pattern = node.parent;
        const loop = pattern.parent && pattern.parent.parent && pattern.parent.parent.parent;
        return ts.isArrayBindingPattern(pattern) && pattern.elements.indexOf(node) === 0 && loop !== undefined && ts.isForOfStatement(loop) && calledName(loop.expression) === 'entries' && (loop.expression as ts.CallExpression).arguments.length === 0;
    }
    return false;
}
const scriptFiles = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory() ? scriptFiles(path.join(dir, entry.name)) : entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') ? [path.join(dir, entry.name)] : []);
for (const file of scriptFiles(path.join(root, 'scripts')))
{
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void =>
    {
        // the spec's Types rule: a logic file holds functions and their constants, its folder's types.ts every shape
        if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && path.basename(file) !== 'types.ts')
        {
            const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
            problems.push(`${path.relative(root, file)}:${line + 1}: type '${node.name.text}' belongs in its folder's types.ts`);
        }
        const binding = ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node) || ts.isFunctionDeclaration(node)
            || ts.isPropertySignature(node) || ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node) || ts.isPropertyDeclaration(node) ? node.name : undefined;
        const bare = binding && ts.isIdentifier(binding) ? binding.text.replace(/^_/, '') : '';
        if (binding && ((bare.length === 1 && !ONE_LETTER_OK.has(bare)) || ABBREVIATIONS.has(bare)))
        {
            const { line } = source.getLineAndCharacterOfPosition(binding.getStart(source));
            problems.push(`${path.relative(root, file)}:${line + 1}: '${bare}' is ${bare.length === 1 ? 'a one-letter name' : 'an abbreviation'} - name what it holds`);
        }
        else if (binding && /^[ijk]$/.test(bare) && (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) && !isIndex(node))
        {
            const { line } = source.getLineAndCharacterOfPosition(binding.getStart(source));
            problems.push(`${path.relative(root, file)}:${line + 1}: '${bare}' holds no index - name what it holds`);
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
}

if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`lint: ${jsonFiles.length} JSON files parse; ${textFiles.length} command/skill files checked`);
