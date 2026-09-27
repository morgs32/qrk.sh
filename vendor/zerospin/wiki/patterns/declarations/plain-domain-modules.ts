/** Return final ordinary declarations from a domain factory. Aggregates and browser sessions
 * compose named modules with local declarations and reject duplicate keys across models,
 * contracts, and automations, even if both values are the same object. Static collisions
 * fail typechecking; dynamic maps receive the same checks at runtime.
 *
 * Inject canonical host models into contract scopes, but return only module-owned models.
 * Reuse the exact frontend declarations in the server module. Construct automations after
 * all contract upgrades are complete. Declare aggregate-level local contracts literally.
 * Service versions attach complete bundles. Browser bundles contain no automations.
 *
 * @bad Register a separate runtime module owner or state-machine activation table.
 * @bad Replace a contract after an automation has captured the old object.
 * @bad Premerge module collections or spread an actor's contracts into an aggregate.
 */
export function makeDomainModule<MODELS, CONTRACTS, AUTOMATIONS>(options: {
  models: MODELS;
  contracts: CONTRACTS;
  automations: AUTOMATIONS;
}) {
  return {
    models: options.models,
    contracts: options.contracts,
    automations: options.automations,
  };
}
