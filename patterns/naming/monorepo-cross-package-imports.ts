/**
 * Cross-package imports go through the owning package's public entrypoint.
 *
 * @bad Relative paths into another workspace package: `../../../packages/core/src/types.js`.
 */
import type { IOrderApi } from '@acme/orders';
import type { ResourceWorker } from '@acme/resource-worker/ResourceWorker.js';

export type { IOrderApi };
