import '@zerospin/server-only';

/**
 * Split public vs secret RPC clients into separate modules — no runtime `typeof window` branching.
 *
 * @bad One module picking `NEXT_PUBLIC_*` vs `SECRET_*` with `typeof window === 'undefined'`.
 * @bad Speculative `SECRET_*` env and a second server module when one public URL is enough.
 */
declare function makeRpc(url: string | undefined): unknown;

export const serverRpc = makeRpc(process.env.SECRET_ORDER_API_URL);
