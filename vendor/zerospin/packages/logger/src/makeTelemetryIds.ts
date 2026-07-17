import type { ILogId, ISpanId, ISpanLinkId, ITraceId } from './types.ts';

const hex = (byteLength: number): string => {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
};

/*
 * Synchronous on purpose: the Effect tracer allocates span ids inside
 * Tracer.span(), a sync call, so Effect-based id factories are unusable here.
 */
export const makeTraceId = (): ITraceId => `trc_${hex(16)}`;

export const makeSpanId = (): ISpanId => `spn_${hex(8)}`;

export const makeLogId = (): ILogId => `lgr_${hex(8)}`;

export const makeSpanLinkId = (): ISpanLinkId => `lnk_${hex(8)}`;
