export * from './registration.ts';
export * from './machine.ts';
export * from './keys.ts';
export * from './helper-foreign.ts';
export * from './paths.ts';
export * from './lists.ts';
export * from './rename.ts';
export * from './key-env.ts';
import { appiumSdkEnvDetect, appiumSdkEnvFix, playwrightWebmcpDetect, playwrightWebmcpFix, serenaContextDetect, serenaContextFix, serenaTelemetryDetect, serenaTelemetryFix, serenaWindowsHomeDetect, serenaWindowsHomeFix, tokenSyncDetect, tokenSyncFix, uvxPythonDetect, uvxPythonFix, windowsArmPythonDetect, windowsArmPythonFix, windowsMcpOneDetect, windowsNpxCmdDetect, windowsNpxCmdFix } from './registration.ts';
import { dataFolderIgnoreDetect, dataFolderIgnoreFix, npxCacheEntryDetect, npxCacheEntryFix, retiredPluginDetect, retiredPluginFix } from './machine.ts';
import { helperMissingDetect, helperMissingFix, helperStaleDetect, helperStaleFix, keyToHelperDetect, keyToHelperFix, rootIgnoreDetect, rootIgnoreFix } from './keys.ts';
import { helperForeignDetect, helperForeignFix } from './helper-foreign.ts';
import { helperChildFolderDetect, mcpOrderDetect, mcpOrderFix, projectRelativePathDetect, projectRelativePathFix } from './paths.ts';
import { clientDriftDetect, clientDriftSteps, cursorFileDetect, listImportDetect, listImportSteps, readGuardDetect, readGuardSteps, serenaBaseModesDetect, serenaBaseModesSteps, serenaProjectFolderDetect, serenaProjectFolderSteps } from './lists.ts';
import { rootMoveDetect, rootMoveFix, rootRepointDetect, rootRepointFix } from './rename.ts';
import { context7KeyEnvDetect, context7KeyEnvFix, sentryAuthEnvDetect, sentryAuthEnvFix } from './key-env.ts';
import type { Detector, FileSteps, MachineFix, RegistrationFix } from './types.ts';

// catalog/fixes.json names its `detect`, `fix` and `steps` functions; this is where they are found, each kind in a table of
// its own type. A row naming a function that is not exported here fails the catalog test, so a typo cannot ship.
export const DETECTORS: ReadonlyMap<string, Detector> = new Map<string, Detector>([
    ['rootMoveDetect', rootMoveDetect],
    ['rootRepointDetect', rootRepointDetect],
    ['serenaWindowsHomeDetect', serenaWindowsHomeDetect],
    ['uvxPythonDetect', uvxPythonDetect],
    ['windowsArmPythonDetect', windowsArmPythonDetect],
    ['windowsNpxCmdDetect', windowsNpxCmdDetect],
    ['playwrightWebmcpDetect', playwrightWebmcpDetect],
    ['appiumSdkEnvDetect', appiumSdkEnvDetect],
    ['serenaTelemetryDetect', serenaTelemetryDetect],
    ['tokenSyncDetect', tokenSyncDetect],
    ['context7KeyEnvDetect', context7KeyEnvDetect],
    ['sentryAuthEnvDetect', sentryAuthEnvDetect],
    ['serenaContextDetect', serenaContextDetect],
    ['serenaBaseModesDetect', serenaBaseModesDetect],
    ['serenaProjectFolderDetect', serenaProjectFolderDetect],
    ['listImportDetect', listImportDetect],
    ['retiredPluginDetect', retiredPluginDetect],
    ['readGuardDetect', readGuardDetect],
    ['clientDriftDetect', clientDriftDetect],
    ['cursorFileDetect', cursorFileDetect],
    ['windowsMcpOneDetect', windowsMcpOneDetect],
    ['dataFolderIgnoreDetect', dataFolderIgnoreDetect],
    ['npxCacheEntryDetect', npxCacheEntryDetect],
    ['keyToHelperDetect', keyToHelperDetect],
    ['helperForeignDetect', helperForeignDetect],
    ['helperMissingDetect', helperMissingDetect],
    ['helperStaleDetect', helperStaleDetect],
    ['rootIgnoreDetect', rootIgnoreDetect],
    ['projectRelativePathDetect', projectRelativePathDetect],
    ['mcpOrderDetect', mcpOrderDetect],
    ['helperChildFolderDetect', helperChildFolderDetect],
]);
export const REGISTRATION_FIXES: ReadonlyMap<string, RegistrationFix> = new Map<string, RegistrationFix>([
    ['rootRepointFix', rootRepointFix],
    ['serenaWindowsHomeFix', serenaWindowsHomeFix],
    ['uvxPythonFix', uvxPythonFix],
    ['windowsArmPythonFix', windowsArmPythonFix],
    ['windowsNpxCmdFix', windowsNpxCmdFix],
    ['playwrightWebmcpFix', playwrightWebmcpFix],
    ['appiumSdkEnvFix', appiumSdkEnvFix],
    ['serenaTelemetryFix', serenaTelemetryFix],
    ['tokenSyncFix', tokenSyncFix],
    ['context7KeyEnvFix', context7KeyEnvFix],
    ['sentryAuthEnvFix', sentryAuthEnvFix],
    ['serenaContextFix', serenaContextFix],
    ['keyToHelperFix', keyToHelperFix],
    ['helperForeignFix', helperForeignFix],
    ['projectRelativePathFix', projectRelativePathFix],
]);
export const MACHINE_FIXES: ReadonlyMap<string, MachineFix> = new Map<string, MachineFix>([
    ['rootMoveFix', rootMoveFix],
    ['retiredPluginFix', retiredPluginFix],
    ['dataFolderIgnoreFix', dataFolderIgnoreFix],
    ['npxCacheEntryFix', npxCacheEntryFix],
    ['helperMissingFix', helperMissingFix],
    ['helperStaleFix', helperStaleFix],
    ['rootIgnoreFix', rootIgnoreFix],
    ['mcpOrderFix', mcpOrderFix],
]);
export const FILE_STEPS: ReadonlyMap<string, FileSteps> = new Map<string, FileSteps>([
    ['serenaBaseModesSteps', serenaBaseModesSteps],
    ['serenaProjectFolderSteps', serenaProjectFolderSteps],
    ['listImportSteps', listImportSteps],
    ['readGuardSteps', readGuardSteps],
    ['clientDriftSteps', clientDriftSteps],
]);
