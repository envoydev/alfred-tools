// --record, --rewind and --skip (spec D1, D1b, D1c): the file reads and writes around the mappings of record.ts. Every
// file must sit in one folder tmpdir.ts made, which keeps the pre-approved call from writing anywhere else; a refusal
// exits 2 with one line and writes nothing.
import fs from 'node:fs';
import path from 'node:path';
import * as catalogLib from '../catalog/catalog.ts';
import { checkedTarget, writeJsonNoFollow } from '../core/temp-write.ts';
import { parseJson } from '../core/json-file.ts';
import { rewindQuestion } from './asks-other.ts';
import { SCOPE_LABEL } from './asks-keys.ts';
import { recordStep, resolveSkipTarget, rewindPick, skipPick } from './record.ts';
import { EXIT_CODE, REFUSAL, WALK_PICK_LABEL } from './record-constants.ts';
import { isRecord } from '../core/shapes.ts';
import { isInventoryFile } from '../inventory/table.ts';
import { isAnswersFile, isPicksFile, isStepFile } from './files/shapes.ts';
import { walkOutput } from './walk-output.ts';
import type { Inventory } from '../inventory/types.ts';
import type { Answers, FileRead, Picks, PlanArgs, RecordResult, WalkOutput } from './types.ts';

const refuse = (line: string): number => { console.error(`plan.mjs: ${line}`); return EXIT_CODE.refused; };

// Each file as a path inside its checked folder, all in the one folder; null when any is not
function sitInOneTempFolder(files: string[]): string[] | null
{
    const targets = files.map(checkedTarget);
    const resolved = targets.filter((target) => target !== null);
    if (resolved.length !== targets.length) return null;
    return new Set(resolved.map((target) => path.dirname(target))).size === 1 ? resolved : null;
}

// A file that holds one JSON object. A missing file is `{}` when `optional`, else a refusal.
export function readObject(file: string, optional = false): FileRead
{
    let text: string;
    try { text = fs.readFileSync(file, 'utf8'); }
    catch { return optional && !fs.existsSync(file) ? { value: {} } : { refused: `${file}: ${REFUSAL.notJson}` }; }
    let value: unknown;
    try { value = parseJson(text); }
    catch { return { refused: `${file}: ${REFUSAL.notJson}` }; }
    return isRecord(value) ? { value } : { refused: `${file}: ${REFUSAL.notObject}` };
}

// the label of a pick in the which-pick ask: the walk's own two (as their questions' headers), a tool's catalog label, a
// configure target's name and scope (two copies of one name differ by scope)
function labelOfPick(pick: string, output: WalkOutput): string
{
    const walkLabel = Object.hasOwn(WALK_PICK_LABEL, pick) ? WALK_PICK_LABEL[pick] : undefined;
    if (walkLabel !== undefined) return walkLabel;
    const row = catalogLib.load().byId.get(pick);
    if (row) return row.label;
    const current = output.targets[pick]?.current;
    if (!current?.name) return pick;
    const scope = current.scope ? SCOPE_LABEL[current.scope] : undefined;
    return scope ? `${current.name} (${scope})` : current.name;
}

// Writes the result's two files, then prints what the mode prints: the skipped pick, else the questions for the new picks.
function persist(result: RecordResult, args: PlanArgs, inventory: Inventory, files: { picks: string; answers: string }): number
{
    if ('refused' in result) return refuse(result.refused);
    writeJsonNoFollow(files.picks, result.picks);
    writeJsonNoFollow(files.answers, result.answers);
    if (args.mode === 'skip') { console.log(args.pick); return EXIT_CODE.ok; }
    return printWalk(inventory, result.picks, args);
}

function printWalk(inventory: Inventory, picks: Picks, args: PlanArgs): number
{
    const output = walkOutput(inventory, picks, args);
    if ('waits' in output) { console.error(output.waits); return EXIT_CODE.stopped; }
    console.log(JSON.stringify(output, null, 2));
    return EXIT_CODE.ok;
}

// --skip: the pick as named, or the one configure target of a row id (the walk output has each target's row)
function skipTarget(inventory: Inventory, picks: Picks, answers: Answers, args: PlanArgs, named: string, files: { picks: string; answers: string }): number
{
    let rowOf: (target: string) => string | null | undefined = () => undefined;
    if (!(picks.rows ?? []).includes(named) && !(picks.targets ?? []).includes(named))
    {
        const output = walkOutput(inventory, picks, args);
        if ('waits' in output) { console.error(output.waits); return EXIT_CODE.stopped; }
        rowOf = (target) => output.targets[target]?.row;
    }
    const resolved = resolveSkipTarget(picks, named, rowOf);
    if ('refused' in resolved) return refuse(resolved.refused);
    return persist(skipPick(picks, answers, resolved.pick), { ...args, pick: resolved.pick }, inventory, files);
}

export function runRecordMode(args: PlanArgs): number
{
    const sitting = sitInOneTempFolder(args.files);
    if (sitting === null) return refuse(REFUSAL.folder);
    const [inventoryFile, picksFile, answersFile, stepFile] = sitting;
    if (inventoryFile === undefined || picksFile === undefined || answersFile === undefined) return refuse(REFUSAL.walkFiles);
    const inventoryRead = readObject(inventoryFile);
    if ('refused' in inventoryRead) return refuse(inventoryRead.refused);
    const picksRead = readObject(picksFile);
    if ('refused' in picksRead) return refuse(picksRead.refused);
    const answersRead = readObject(answersFile, true);
    if ('refused' in answersRead) return refuse(answersRead.refused);
    const inventory = inventoryRead.value;
    if (!isInventoryFile(inventory)) return refuse(`${inventoryFile}: ${REFUSAL.notInventory}`);
    const picks = picksRead.value;
    if (!isPicksFile(picks)) return refuse(`${picksFile}: ${REFUSAL.notPicks}`);
    const answers = answersRead.value;
    if (!isAnswersFile(answers)) return refuse(`${answersFile}: ${REFUSAL.notAnswers}`);
    const files = { picks: picksFile, answers: answersFile };

    if (args.mode === 'skip') return args.pick === null ? refuse(REFUSAL.skipPick) : skipTarget(inventory, picks, answers, args, args.pick, files);

    // before anything is written: a folder under the former name waits to move, as for --questions
    const output = walkOutput(inventory, picks, args);
    if ('waits' in output) { console.error(output.waits); return EXIT_CODE.stopped; }
    if (args.mode === 'rewind' && args.pick !== null) return persist(rewindPick(picks, answers, args.pick), args, inventory, files);
    if (args.mode === 'rewind')
    {
        const asked = rewindQuestion(picks, (pick) => labelOfPick(pick, output));
        if (asked === null) return refuse(REFUSAL.nothingRecorded);
        console.log(JSON.stringify({ call: [asked.question], answers: { rewind: asked.answers } }, null, 2));
        return EXIT_CODE.ok;
    }

    if (stepFile === undefined) return refuse(REFUSAL.recordFiles);
    const chosen = readObject(stepFile);
    if ('refused' in chosen) return refuse(chosen.refused);
    if (!isStepFile(chosen.value)) return refuse(REFUSAL.stepShape);
    if (output.next.id === 'done') return refuse(REFUSAL.walkDone);
    return persist(recordStep({ step: output.next, built: output, picks, answers, chosen: chosen.value }), args, inventory, files);
}
