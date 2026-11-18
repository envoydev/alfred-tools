// --record, --rewind and --skip (spec D1, D1b, D1c): the file reads and writes around the mappings of record.ts. Every
// file must sit in one folder tmpdir.ts made, which keeps the pre-approved call from writing anywhere else; a refusal
// exits 2 with one line and writes nothing.
import fs from 'node:fs';
import path from 'node:path';
import * as catalogLib from '../catalog/catalog.ts';
import { isOurTempDir } from '../core/tmpdir.ts';
import { parseJson } from '../core/json-file.ts';
import { rewindQuestion } from './asks-other.ts';
import { recordStep, rewindPick, skipPick } from './record.ts';
import { EXIT_CODE, REFUSAL } from './record-constants.ts';
import { isRecord } from './record-resolve.ts';
import { walkOutput } from './walk-output.ts';
import type { Inventory } from '../inventory/types.ts';
import type { Answers, FileRead, Picks, PlanArgs, RecordResult, StepFile, WalkOutput } from './types.ts';

const refuse = (line: string): number => { console.error(`plan.ts: ${line}`); return EXIT_CODE.refused; };

function sitInOneTempFolder(files: string[]): boolean
{
    const folders = files.map((file) => path.dirname(file));
    return folders.every(isOurTempDir) && new Set(folders.map((folder) => fs.realpathSync(folder))).size === 1;
}

// A file that holds one JSON object. A missing file is `{}` when `optional`, else a refusal.
function readObject(file: string, optional = false): FileRead
{
    let text: string;
    try { text = fs.readFileSync(file, 'utf8'); }
    catch { return optional && !fs.existsSync(file) ? { value: {} } : { refused: `${file}: ${REFUSAL.notJson}` }; }
    let value: unknown;
    try { value = parseJson(text); }
    catch { return { refused: `${file}: ${REFUSAL.notJson}` }; }
    return isRecord(value) ? { value } : { refused: `${file}: ${REFUSAL.notObject}` };
}

const isStepFile = (value: Record<string, unknown>): value is Record<string, unknown> & StepFile => typeof value['id'] === 'string' && isRecord(value['answers']);

function writeJson(file: string, value: unknown): void
{
    const temporary = `${file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
    fs.renameSync(temporary, file);
}

// the label of a pick in the which-pick ask: a tool's catalog label, a configure target's name, the walk's own two
function labelOfPick(pick: string, output: WalkOutput): string
{
    const row = catalogLib.load().byId.get(pick);
    return row?.label ?? output.targets[pick]?.current?.name ?? pick;
}

// Writes the result's two files, then prints what the mode prints: the skipped pick, else the questions for the new picks.
function persist(result: RecordResult, args: PlanArgs, inventory: Inventory, files: { picks: string; answers: string }): number
{
    if ('refused' in result) return refuse(result.refused);
    writeJson(files.picks, result.picks);
    writeJson(files.answers, result.answers);
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

export function runRecordMode(args: PlanArgs): number
{
    const [inventoryFile, picksFile, answersFile, stepFile] = args.files as [string, string, string, string?];
    if (!sitInOneTempFolder(args.files)) return refuse(REFUSAL.folder);
    const inventoryRead = readObject(inventoryFile);
    if ('refused' in inventoryRead) return refuse(inventoryRead.refused);
    const picksRead = readObject(picksFile);
    if ('refused' in picksRead) return refuse(picksRead.refused);
    const answersRead = readObject(answersFile, true);
    if ('refused' in answersRead) return refuse(answersRead.refused);
    const inventory = inventoryRead.value as unknown as Inventory;
    const picks = picksRead.value as Picks;
    const answers = answersRead.value as Answers;
    const files = { picks: picksFile, answers: answersFile };

    if (args.mode === 'skip') return persist(skipPick(picks, answers, args.pick!), args, inventory, files);
    if (args.mode === 'rewind' && args.pick !== null) return persist(rewindPick(picks, answers, args.pick), args, inventory, files);

    const output = walkOutput(inventory, picks, args);
    if ('waits' in output) { console.error(output.waits); return EXIT_CODE.stopped; }
    if (args.mode === 'rewind')
    {
        const asked = rewindQuestion(picks, (pick) => labelOfPick(pick, output));
        if (asked === null) return refuse(REFUSAL.nothingRecorded);
        console.log(JSON.stringify({ call: [asked.question], answers: { rewind: asked.answers } }, null, 2));
        return EXIT_CODE.ok;
    }

    const chosen = readObject(stepFile!);
    if ('refused' in chosen) return refuse(chosen.refused);
    if (!isStepFile(chosen.value)) return refuse(REFUSAL.stepShape);
    if (output.next.id === 'done') return refuse(REFUSAL.walkDone);
    return persist(recordStep({ step: output.next, built: output, picks, answers, chosen: chosen.value }), args, inventory, files);
}
