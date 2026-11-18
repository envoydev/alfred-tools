// The names and words of a hosted route's tool settings (sonarqube's read-only switch and its toolsets).

export const READ_ONLY_HEADER = 'SONARQUBE_READ_ONLY';
export const TOOLSETS_HEADER = 'SONARQUBE_TOOLSETS';
// the key an answer carries to say the toolsets are asked next, typed as one list
export const TOOLSETS_ASKED = 'toolsets';

export const SETTINGS_HEADER = 'Tools';

// The four answers, the recommended one first: read-only or read and write, each with every toolset or a chosen list.
export const TOOL_OPTIONS = [
    { label: 'Read-only', readOnly: true, chosen: false, description: 'no write tools - they change issue and hotspot status' },
    { label: 'Read and write', readOnly: false, chosen: false, description: "the server's default - its write tools change issue and hotspot status" },
    { label: 'Read-only, chosen toolsets', readOnly: true, chosen: true, description: 'no write tools, and only the toolsets you list - asked next' },
    { label: 'Read and write, chosen toolsets', readOnly: false, chosen: true, description: 'the write tools, and only the toolsets you list - asked next' },
] as const;
