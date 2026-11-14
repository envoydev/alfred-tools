'use strict';
// catalog/fixes.json names its `detect` and `fix` functions; this is where they are found. A row naming a function that is
// not exported here fails the catalog test, so a typo cannot ship.
module.exports = { ...require('./registration.ts'), ...require('./machine.ts'), ...require('./keys.ts'), ...require('./paths.ts'), ...require('./lists.ts') };
