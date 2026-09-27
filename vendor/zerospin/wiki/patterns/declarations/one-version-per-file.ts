/**
 * Put each concrete versioned declaration in its own file, named for that version.
 * Apply this to model, contract, aggregate, aggregate actor, service actor, and
 * service versions, and to system versions when maintaining multiple authored
 * system versions. Split different declarations even when their versions match.
 *
 * Import the preceding version when upgrading. Keep supporting schemas, guards,
 * and adapters with their owner unless shared; put shared checks in separate
 * modules. Registry modules may import versions to assemble bindings.
 * A domain factory may construct its final model, contract, and automation
 * declarations together when customization binds those declarations to one another.
 * Return the plain bundle; do not introduce a separate runtime module owner.
 * Keep makeActorDbVersion inside its actor's file when local to that actor;
 * it does not declare an independent version number.
 *
 * @bad Multiple concrete versions or declarations in one models.ts or contracts.ts file.
 * @bad An inline service actor version inside a service version declaration.
 * @bad Hide unrelated authored versions in a factory just to avoid separate files.
 */
// createPurchaseV2.ts
import { createPurchaseV1 } from './createPurchaseV1';

export const createPurchaseV2 = upgradeContractVersion(createPurchaseV1, {
  version: '2.0.0',
  // Declare this version's payload, failures, guards, and adapters here.
});
