/**
 * Keep code minimal — do not add unprompted JSDoc rationale in source.
 *
 * @bad `/** Note: kept separate so callers do not depend on the full module graph. *\/` on a one-liner export.
 */
export function parsePayload(raw: string) {
  return JSON.parse(raw) as { kind: string; data: unknown };
}
