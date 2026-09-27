/**
 * Name domain type aliases and interfaces with an `I` prefix.
 * A leading `I` counts only when the next character is uppercase.
 * Leave `Infer*` extractors, generic helpers (`Prettify`, `Merge`), type-level predicates (`Valid*`, `Assert*`, `Is*`), classes, and generated `worker-configuration.d.ts` unchanged.
 *
 * @bad `type AggregateSessionModel = IAggregateSessionLock['models'][string]`
 * @bad `type AggregateSessionContract = IAggregateSessionLock['contracts'][string]`
 * @bad `type AggregateSessionSpecModel = IAggregateSessionSpec['models'][string]`
 * @bad `type AggregateSessionSpecContract = IAggregateSessionSpec['contracts'][string]`
 */
type IAggregateSessionLock = {
  readonly models: Readonly<Record<string, { readonly version: string }>>;
  readonly contracts: Readonly<Record<string, { readonly version: string }>>;
};

type IAggregateSessionSpec = {
  readonly models: Readonly<Record<string, { readonly version: string }>>;
  readonly contracts: Readonly<Record<string, { readonly version: string }>>;
};

type IAggregateSessionModel = IAggregateSessionLock['models'][string];
type IAggregateSessionContract = IAggregateSessionLock['contracts'][string];
type IAggregateSessionSpecModel = IAggregateSessionSpec['models'][string];
type IAggregateSessionSpecContract = IAggregateSessionSpec['contracts'][string];
