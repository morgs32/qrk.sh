import { Context } from 'effect';

/** Base URL for Zerospin HTTP RPC (no trailing slash required by callers). */
export class ZerospinApiUrl extends Context.Tag('ZerospinApiUrl')<
  ZerospinApiUrl,
  string
>() {}
