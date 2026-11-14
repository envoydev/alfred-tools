'use strict';
// The matrix's written files, kept for the proof: with PT_PROOF_DIR set, a matrix file's test.after calls
// keepWritten before it removes its root, and every file the golden keeps is copied, normalised, to
// <PT_PROOF_DIR>/matrix/<label>/<relative path>. Without PT_PROOF_DIR it does nothing.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const golden = require('./golden.ts');

// What changes from run to run beyond the golden's masks: a key a test generates (a hex run), the temp folder spelled
// case-folded in a deny rule ([pP][rR]...), the update- folders update makes, and uv's cache, which is not ours.
const TMP = [...new Set([os.tmpdir(), fs.realpathSync(os.tmpdir())])].map((p) => p.split(path.sep).join('/'));
const unfold = (t) => t.replace(/\[([a-z])([A-Z])\]/g, (m, lower, upper) => (lower.toUpperCase() === upper ? lower : m));
function steady(text)
{
    let t = unfold(text);
    for (const tmp of TMP) t = t.split(tmp).join('<TMP>').split(tmp.toLowerCase()).join('<TMP>');
    return t.replace(/<TMP>\/[^/"\s)]+/g, '<TMP>/<TEMP>').replace(/update-[A-Za-z0-9]{6}/g, 'update-XXXXXX').replace(/[0-9a-f]{16,}/g, '<HEX>');
}

function keepWritten(root, label, env = process.env)
{
    const dir = env.PT_PROOF_DIR;
    if (!dir || !fs.existsSync(root)) return;
    const norm = (t) => golden.normalise(t, { root, tree: golden.TREE });
    const files = golden.collect(root, norm);
    for (const [rel, text] of Object.entries(files))
    {
        if (rel.split('/').includes('.cache')) continue;
        const to = path.join(dir, 'matrix', label, ...steady(rel).split('/'));
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.writeFileSync(to, steady(text));
    }
}

module.exports = { keepWritten, steady };
