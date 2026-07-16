/**
 * Use descriptive names in callbacks and parameters — not compressed abbreviations.
 *
 * @bad `resources.map(r => …)` or `mutations` abbreviated as `muts`.
 * @bad Single-letter loop variables when a domain word fits (`resource`, `command`, `payload`).
 */
interface IResource {
  resourceId: string;
}

const parseResource = (jsonString: string): IResource =>
  JSON.parse(jsonString) as IResource;

export const toNodes = (resources: readonly IResource[]) =>
  resources.map(resource => ({ resourceId: resource.resourceId }));
