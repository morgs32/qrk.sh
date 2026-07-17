/*
 * System-worker annotation:
 * Tests whether a frontend delta carries any resource work after command filtering.
 * These helpers should stay deterministic and data-shaped so ledger and sync paths can compose them predictably.
 */

export const isDeltaEmpty = (
  delta: Readonly<{
    inserted: readonly unknown[];
    updated: readonly unknown[];
    deleted: readonly unknown[];
  }>,
): boolean =>
  delta.inserted.length === 0 &&
  delta.updated.length === 0 &&
  delta.deleted.length === 0;
