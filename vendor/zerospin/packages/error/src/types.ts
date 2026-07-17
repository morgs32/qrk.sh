import type { ZerospinError } from './ZerospinError.js';

export type IZerospinError<T extends string = string> = {
  code: T;
  status: null | number;
  cause: null | string;
  extra: Record<string, unknown> | null;
  message?: string;
};

export type IZerospinErrorJson<T extends string = string> = {
  cause: null | string;
  code: T;
  status: null | number;
  message: string;
  extra: Record<string, unknown> | null;
};

export type IAnyError = ZerospinError<string>;

export type IAnyErrorJson = IZerospinErrorJson<string>;
