import { introspectWorkflow } from 'cloudflare:test';
/**
 * Workers Vitest: import bindings from `cloudflare:workers`; test helpers from `cloudflare:test`.
 *
 * @bad `import { env } from 'cloudflare:test'` — deprecated for bindings in current worker Vitest docs.
 */
import { env } from 'cloudflare:workers';

export const getOrderQueue = () => env.ORDER_QUEUE;

export const inspectWorkflow = introspectWorkflow;
