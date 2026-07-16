import { Effect } from 'effect';
import { Schema } from 'effect/Schema';

declare class DomainError extends Error {
  constructor(props: { code: string; message?: string; cause?: unknown });
  static prettyUnknownFailure(cause: unknown): string;
}

declare function makeEffectSchema(shape: unknown): unknown;

declare const deploys: unknown;
declare const deploymentRepoTables: { deploy: { shape: unknown } };

/**
 * Validate rows with the table's Effect schema before Drizzle insert — not unchecked `.values(...)`.
 *
 * @bad Passing a plain object straight into `.insert().values()` with no schema pass.
 */
export const insertDeployRow = async (props: {
  db: { insert(table: unknown): { values(row: unknown): Promise<unknown> } };
  id: string;
  systemId: string;
  deployName: string;
  deployedAt: Date;
  nextVersion: number;
}) => {
  const { db, id, systemId, deployName, deployedAt, nextVersion } = props;

  const deployRowSchema = makeEffectSchema(deploymentRepoTables.deploy.shape);
  const deployRow = {
    id,
    systemId,
    deployName,
    deployedAt,
    version: nextVersion,
  };

  const validated = await Effect.runPromise(
    Schema.validate(deployRowSchema)(deployRow, {
      onExcessProperty: 'ignore',
    }).pipe(
      Effect.mapError(
        cause =>
          new DomainError({
            cause: DomainError.prettyUnknownFailure(cause),
            code: 'failed-to-encode-deploy-row',
            message: 'Deploy row failed validation.',
          }),
      ),
    ),
  );

  await db.insert(deploys).values(validated);
};
