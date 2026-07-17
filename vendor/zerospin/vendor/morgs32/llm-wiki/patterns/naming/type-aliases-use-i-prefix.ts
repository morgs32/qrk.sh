/**
 * Type aliases and indexed access types are type names — prefix with `I`.
 *
 * @bad `export type OrderRunStatus = (typeof runStatuses)[number]` — PascalCase without `I`.
 */
export type IOrderStatus = (typeof orderStatuses)[number];

const orderStatuses = ['pending', 'shipped', 'delivered'] as const;
