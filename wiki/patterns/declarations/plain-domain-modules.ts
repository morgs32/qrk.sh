/** Return final ordinary declarations from a domain factory. Aggregates and browser sessions (including makeStandaloneSession)
 * compose named modules with local declarations and reject duplicate keys across models,
 * fail typechecking; dynamic maps receive the same checks at runtime.
 *
 * Inject canonical host models into contract scopes, but return only module-owned models.
 * all contract upgrades are complete. Declare aggregate-level local contracts literally.
 * Instantiate each shared service bundle once. Reuse its exact model, contract, and
 * See examples/shopping/src/zerospin/services/fulfillment/fulfillmentModule.ts.
 *
 * @bad Call the same service factory separately for its server and session contracts.
 * @bad Premerge module collections or spread an actor's contracts into an aggregate.
 */
export function makeDomainModule<MODELS, CONTRACTS>(options: {
  models: MODELS;
  contracts: CONTRACTS;
}) {
  return {
    models: options.models,
    contracts: options.contracts,
  };
}
