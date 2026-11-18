// The words record.ts reads from the questions the builders in asks-*.ts make: question id prefixes, the labels that
// take a typed value, and the values the answer maps use.

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
} as const;

export const WALK_QUESTION = { settings: 'settings', clients: 'clients' } as const;

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
    folder: 'files must sit in one folder tmpdir.ts made',
    notJson: 'is not a JSON file this run wrote',
    notObject: 'is not a JSON object',
    stepShape: 'step.json must be { "id": <string>, "answers": <object> }',
    walkDone: 'the walk is done: there is no step to record',
    nothingRecorded: 'no answer is recorded yet, so none can be changed',
} as const;

export const WALK_PICK_LABEL: Record<string, string> = { [WALK_QUESTION.clients]: 'Apps', [WALK_QUESTION.settings]: 'Settings' };
