export class ProfilerError extends Error {
  public override readonly cause?: unknown;
  public readonly code: string;

  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.code = code;
    this.cause = cause;
    this.name = 'ProfilerError';
  }
}
