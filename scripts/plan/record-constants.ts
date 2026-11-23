// The words record.ts reads from the questions the builders in asks-*.ts make: question id prefixes, the labels that
// take a typed value, and the values the answer maps use.

// The mark on a recommended option's label: its home is core/constants.ts, since inventory/existing.ts marks its options too.
export { RECOMMENDED_SUFFIX } from '../core/constants.ts';

// A question id is `<prefix><row id>` (the walk's `settings` and `clients` have none).
export const PREFIX = {
    route: 'route-',
    scope: 'scope-',
    name: 'name-',
    location: 'location-',
    browser: 'browser-',
    host: 'host-',
    token: 'token-',
    keyName: 'keyname-',
    urlName: 'urlname-',
    settings: 'settings-',
    root: 'root-',
    own: 'own-',
    clients: 'clients-',
    exclude: 'exclude-',
} as const;

export const WALK_QUESTION = { settings: 'settings', clients: 'clients' } as const;
// The settings question's answers, in the order of its two options: the recommended settings for all, then each tool.
export const WALK_CHOICES = ['recommended', 'each'] as const;

export const LABEL = {
    keep: 'Keep ',
    useKey: 'Use a key',
    browserNamed: 'A browser binary I name',
    browserDefault: 'Default for this engine',
    hostSelfManaged: 'A self-managed host',
} as const;

// What an answer map holds for the options that take a typed value (a root's id is `named` too).
export const VALUE = { named: 'named', change: 'change', keep: 'keep' } as const;
export const SIDE = { keep: 'keep', path: 'path' } as const;

export const BACKTICKED_NAME = /`([^`]+)`/;
export const TOOLSET_SEPARATOR = ',';

export const EXIT_CODE = { ok: 0, stopped: 1, refused: 2 } as const;
export const REFUSAL = {
    folder: 'files must sit in one folder tmpdir.mjs made',
    notJson: 'is not a JSON file this run wrote',
    notObject: 'is not a JSON object',
    notInventory: 'is not an inventory file: no os or registrations',
    notPicks: 'is not a picks file: a list or a map of it is not one',
    notAnswers: 'is not an answers file: its picks or change are not a map of picks',
    recordFiles: '--record takes an inventory, picks, answers and step file',
    walkFiles: 'the walk takes an inventory, picks and answers file',
    skipPick: '--skip takes a pick',
    stepShape: 'step.json must be { "id": <string>, "answers": <object> }',
    walkDone: 'the walk is done: there is no step to record',
    outFolder: '--out must name a file in a folder tmpdir.mjs made',
    nothingRecorded: 'no answer is recorded yet, so none can be changed',
} as const;

export const WALK_PICK_LABEL: Record<string, string> = { [WALK_QUESTION.clients]: 'Apps', [WALK_QUESTION.settings]: 'Settings' };
