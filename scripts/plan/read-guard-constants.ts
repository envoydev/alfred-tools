// Where the read guard looks (Part E): Claude Code's config dirs under the home, and the plugin ids that mark one.
export const CONFIG_DIR_NAME = '.claude';
export const SETTINGS_FILE = 'settings.json';
export const INSTALLED_PLUGINS_FILE = 'installed_plugins.json';
// the folder of a config dir that holds INSTALLED_PLUGINS_FILE
export const PLUGINS_DIR = 'plugins';
// the plugin's id before and since the rename, each followed by the marketplace
export const PLUGIN_KEY_PREFIXES = ['alfred-tools@', 'preferred-tools@'];
// the account file a config dir holds: with PLUGINS_DIR's record, what marks a folder as a profile Claude Code has used
export const ACCOUNT_FILE = '.claude.json';
