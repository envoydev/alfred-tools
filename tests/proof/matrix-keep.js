'use strict';
// The matrix's written files, kept for the proof: with PT_PROOF_DIR set, a matrix file's test.after calls
// keepWritten before it removes its root, and every file the golden keeps is copied, normalised, to
// <PT_PROOF_DIR>/matrix/<label>/<relative path>. Without PT_PROOF_DIR it does nothing.
const fs = require('node:fs');
const path = require('node:path');
const golden = require('./golden.js');

function keepWritten(root, label, env = process.env)
{
    const dir = env.PT_PROOF_DIR;
    if (!dir || !fs.existsSync(root)) return;
    const norm = (t) => golden.normalise(t, { root, tree: golden.TREE });
    const files = golden.collect(root, norm);
    for (const [rel, text] of Object.entries(files))
    {
        const to = path.join(dir, 'matrix', label, ...rel.split('/'));
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.writeFileSync(to, text);
    }
}

module.exports = { keepWritten };
