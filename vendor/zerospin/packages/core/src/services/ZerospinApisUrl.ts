import { Context } from 'effect';

/** Base URL for Zerospin HTTP RPC (no trailing slash required by callers). */
export class ZerospinApisUrl extends Context.Tag('ZerospinApisUrl')<
  ZerospinApisUrl,
  string
>() {}
