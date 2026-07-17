/**
 * Single RPC module when the dispatch URL is not secret.
 *
 * @bad Adding `SECRET_*` and a server-only duplicate without an explicit requirement.
 */
declare function makeRpc(url: string | undefined): unknown;

export const orderRpc = makeRpc(process.env.NEXT_PUBLIC_ORDER_API_URL);
