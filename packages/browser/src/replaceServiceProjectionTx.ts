import { applyOperationTx } from '@zerospin/core/contracts/applyOperationTx';
import type { IContractOutput } from '@zerospin/core/contracts/types';
import type { ITx } from '@zerospin/core/drizzle/types';
import type {
  IAnyModels,
  IEncodedResourceShape,
} from '@zerospin/core/models/types';
import type { INodeCommandInput } from '@zerospin/core/Node/types';
import { makeZerospinError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import { Effect } from 'effect';

/** Replace selected rows, then rebase unresolved commands within the caller's transaction. */
export function replaceServiceProjectionTx(
  tx: ITx,
  props: {
    models: IAnyModels;
    resources: readonly IEncodedResourceShape[];
    pending: readonly INodeCommandInput[];
    predict(command: INodeCommandInput): readonly IContractOutput[];
  },
): void {
  tx.run(sql`PRAGMA defer_foreign_keys = ON`);
  for (const model of Object.values(props.models)) {
    tx.delete(model.drizzleSchema).run();
  }
  for (const resource of props.resources) {
    const model = props.models[resource.modelName];
    if (model === undefined) {
      throw makeZerospinError('node-resource-model-invalid');
    }
    tx.insert(model.drizzleSchema).values(resource).run();
  }
  for (const command of props.pending) {
    try {
      tx.transaction(inner => {
        const operations = props.predict(command);
        for (const [operationIndex, operation] of operations.entries()) {
          if (operation.operationName === 'async') {
            throw makeZerospinError('browser-async-operation-forbidden');
          }
          Effect.runSync(
            applyOperationTx({
              tx: inner,
              operation,
              commandId: command.id,
              operationIndex,
              appliedAt: new Date(command.staging.startedAt),
            }),
          );
        }
      });
    } catch {
      /* A rebased guard failure removes optimism, never the durable submission. */
    }
  }
}
