// @ts-nocheck - typed in Task 12
export * from './registration.ts';
export * from './machine.ts';
export * from './keys.ts';
export * from './paths.ts';
export * from './lists.ts';
// catalog/fixes.json names its `detect` and `fix` functions; this is where they are found. A row naming a function that is
// not exported here fails the catalog test, so a typo cannot ship.
