// The shapes the inventory reads from outside, checked: a settings file, a .mcp.json, and a row of each CLI list.
import { isRecord, isServerMap } from '../core/guards.ts';
import type { MarketplaceListRow, McpJsonDoc, PluginListRow, SettingsDoc } from './types.ts';

const isOptionalString = (value: unknown): boolean => value === undefined || typeof value === 'string';

export const isMcpJsonDoc = (value: Record<string, unknown>): value is Record<string, unknown> & McpJsonDoc => value['mcpServers'] === undefined || isServerMap(value['mcpServers']);
export const isSettingsDoc = (value: Record<string, unknown>): value is Record<string, unknown> & SettingsDoc => value['enabledPlugins'] === undefined || isRecord(value['enabledPlugins']);

export const isPluginListRow = (value: unknown): value is PluginListRow => isRecord(value)
    && typeof value['id'] === 'string' && typeof value['scope'] === 'string' && typeof value['enabled'] === 'boolean'
    && [value['version'], value['projectPath'], value['installPath']].every(isOptionalString)
    && (value['errors'] === undefined || Array.isArray(value['errors']));
export const isMarketplaceListRow = (value: unknown): value is MarketplaceListRow => isRecord(value)
    && typeof value['name'] === 'string' && [value['repo'], value['url'], value['path'], value['installLocation']].every(isOptionalString);
