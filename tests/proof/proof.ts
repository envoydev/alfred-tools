#!/usr/bin/env node
// @ts-nocheck - typed in Task 12
// The proof that nothing changed (docs/superpowers/specs, Proof 1-4): record a tree's base, then compare a later tree
// against it.
//   node tests/proof/proof.ts --record <dir>         the golden, test names, copied hashes, lint and validate results
//   node tests/proof/proof.ts --compare <dir>        the suite, test names, lint, validate, typecheck (once a
//                                                    tsconfig.json exists), the golden and its start times, the hashes
//   node tests/proof/proof.ts --compare <dir> --matrix-only   the matrix's written files against <dir>/matrix
// Exit 0 only when every part equals the base (tests/proof/allowed.json's lines aside).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as golden from './golden.ts';
import * as testNames from './test-names.ts';
import { copiedHashes } from './copied-hash.ts';

const TREE = golden.TREE;
const ALLOWED = path.join(import.meta.dirname, 'allowed.json');
const USAGE = 'usage: proof.js --record <dir> | --compare <dir> [--matrix-only]';

const testsFile = (name) => [`${name}.ts`, `${name}.js`].map((f) => path.join(TREE, 'tests', f)).find((f) => fs.existsSync(f));
const node = (file, args = [], opts = {}) => spawnSync(process.execPath, [file, ...args], { cwd: TREE, encoding: 'utf8', ...opts });
const writeJson = (file, v) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(v, null, 2)}\n`); };
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const normOut = (r) => golden.normalise(`${r.stdout || ''}${r.stderr || ''}`, { tree: TREE })
    .replace(/[^\s]*preferred-tools-validate-XXXXXX/g, '<VALIDATE>');

// A check's result as the record keeps it: its exit code and normalised output.
const check = (r) => ({ code: r.status, out: normOut(r) });
const lint = () => check(node(testsFile('lint')));
const validate = () => check(node(testsFile('validate-plugin')));

// lint and validate pass when they exit 0, or fail exactly as the base did (validate fails on an untracked file the
// owner keeps beside the tree, which this run must not touch).
export const sameCheck = (base, now) => now.code === 0 || (base && now.code === base.code && now.out === base.out);

async function record(dir)
{
    fs.mkdirSync(dir, { recursive: true });
    const suite = await testNames.run(TREE);
    fs.writeFileSync(path.join(dir, 'test-names.txt'), `${suite.names.join('\n')}\n`);
    writeJson(path.join(dir, 'copied.json'), copiedHashes(TREE));
    writeJson(path.join(dir, 'checks.json'), { tests: suite.code, lint: lint(), validate: validate() });
    writeJson(path.join(dir, 'golden.json'), await golden.record(TREE));
    console.log(`recorded ${dir}: ${suite.names.length} test names, suite exit ${suite.code}`);
    return 0;
}

async function compare(dir)
{
    const parts = [];
    let ok = true;
    const say = (good, text) => { parts.push(text); if (!good) ok = false; };
    const checks = fs.existsSync(path.join(dir, 'checks.json')) ? readJson(path.join(dir, 'checks.json')) : {};

    const suite = await testNames.run(TREE);
    say(suite.code === 0, suite.code === 0 ? 'tests ok' : `tests FAIL (exit ${suite.code}, log ${path.join(suite.dir, 'spec.log')})`);
    const baseNames = fs.readFileSync(path.join(dir, 'test-names.txt'), 'utf8').split('\n').filter(Boolean);
    const now = new Set(suite.names);
    const missing = baseNames.filter((n) => !now.has(n));
    const added = suite.names.length - (baseNames.length - missing.length);
    say(!missing.length, missing.length ? `test names MISSING ${missing.length}: ${missing.slice(0, 5).join(' | ')}` : `test names ok (+${added} added)`);

    const l = lint();
    say(sameCheck(checks.lint, l), sameCheck(checks.lint, l) ? (l.code === 0 ? 'lint ok' : 'lint as base') : `lint FAIL: ${l.out.trim().split('\n').slice(-3).join(' | ')}`);
    const v = validate();
    say(sameCheck(checks.validate, v), sameCheck(checks.validate, v) ? (v.code === 0 ? 'validate ok' : 'validate as base') : `validate FAIL: ${v.out.trim().split('\n').slice(-3).join(' | ')}`);

    if (fs.existsSync(path.join(TREE, 'tsconfig.json')))
    {
        const tsc = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsc', '-p', '.'], { cwd: TREE, encoding: 'utf8', shell: process.platform === 'win32' });
        say(tsc.status === 0, tsc.status === 0 ? 'typecheck ok' : `typecheck FAIL: ${(tsc.stdout || '').trim().split('\n').slice(0, 3).join(' | ')}`);
    }
    else parts.push('typecheck absent');

    const base = readJson(path.join(dir, 'golden.json'));
    const allowed = fs.existsSync(ALLOWED) ? readJson(ALLOWED) : [];
    const rec = await golden.record(TREE);
    const diffs = golden.compare(base, rec, allowed);
    say(!diffs.length, diffs.length ? `golden FAIL ${diffs.length}: ${diffs.slice(0, 8).join(' | ')}` : 'golden ok');
    if (diffs.length) { writeJson(path.join(os.tmpdir(), 'pt-golden-now.json'), rec); parts.push(`(record kept at ${path.join(os.tmpdir(), 'pt-golden-now.json')})`); }

    const baseHash = readJson(path.join(dir, 'copied.json'));
    const hash = copiedHashes(TREE);
    const changed = Object.keys(baseHash).filter((k) => baseHash[k] !== hash[k]);
    say(!changed.length, changed.length ? `copied CHANGED: ${changed.join(', ')}` : 'copied ok');

    const slow = golden.slower(base, rec);
    say(!slow.length, `slower: ${slow.length ? slow.map((e) => `${e} ${base.ms[e]} -> ${rec.ms[e]} ms`).join(', ') : 'none'}`);
    console.log(`proof: ${parts.join(' | ')}`);
    return ok ? 0 : 1;
}

// Every file below a folder, keyed by its relative path in '/'.
function filesBelow(dir)
{
    const out = {};
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else out[path.relative(dir, f).split(path.sep).join('/')] = fs.readFileSync(f, 'utf8'); } };
    if (fs.existsSync(dir)) walk(dir);
    return out;
}

// The alfred-code checkout the matrix's workspace cases read: beside this tree, or - from a scratch worktree - beside
// the main tree.
function alfredEnv()
{
    if (process.env.PREFERRED_TOOLS_ALFRED || fs.existsSync(path.join(TREE, '..', 'alfred-code'))) return {};
    const common = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: TREE, encoding: 'utf8' });
    const main = common.status === 0 ? path.dirname(common.stdout.trim()) : null;
    const alfred = main ? path.join(main, '..', 'alfred-code') : null;
    return alfred && fs.existsSync(alfred) ? { PREFERRED_TOOLS_ALFRED: alfred } : {};
}

function matrixOnly(dir)
{
    const keep = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-matrix-proof-'));
    const files = fs.readdirSync(path.join(TREE, 'tests', 'matrix')).filter((f) => /\.test\.(?:js|ts)$/.test(f)).sort().map((f) => path.join('tests', 'matrix', f));
    const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { cwd: TREE, encoding: 'utf8', env: { ...process.env, ...alfredEnv(), PT_PROOF_DIR: keep }, maxBuffer: 1 << 28 });
    const base = filesBelow(path.join(dir, 'matrix'));
    const now = filesBelow(path.join(keep, 'matrix'));
    const diffs = [];
    for (const f of new Set([...Object.keys(base), ...Object.keys(now)]))
    {
        if (!(f in now)) diffs.push(`${f} gone`);
        else if (!(f in base)) diffs.push(`${f} new`);
        else if (base[f] !== now[f]) diffs.push(`${f} differs`);
    }
    const tail = `${r.stdout || ''}`.split('\n').filter((x) => /^ℹ (tests|pass|fail|skipped)/.test(x)).join(' ');
    const ok = r.status === 0 && !diffs.length;
    console.log(`proof: matrix ${r.status === 0 ? 'tests ok' : `tests FAIL (exit ${r.status})`} ${tail} | ${diffs.length ? `matrix FAIL ${diffs.length}: ${diffs.slice(0, 8).join(' | ')} (kept at ${keep})` : 'matrix ok'}`);
    if (ok) fs.rmSync(keep, { recursive: true, force: true });
    return ok ? 0 : 1;
}

export async function main(argv)
{
    const at = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
    const known = new Set(['--record', '--compare', '--matrix-only']);
    const unknown = argv.filter((a) => a.startsWith('--') && !known.has(a));
    if (unknown.length) { console.error(`proof.js: unknown flag ${unknown[0]}\n${USAGE}`); return 2; }
    if (at('--record')) return record(path.resolve(at('--record')));
    if (at('--compare') && argv.includes('--matrix-only')) return matrixOnly(path.resolve(at('--compare')));
    if (at('--compare')) return compare(path.resolve(at('--compare')));
    console.error(USAGE);
    return 2;
}

if (import.meta.main) main(process.argv.slice(2)).then((code) => process.exit(code));
