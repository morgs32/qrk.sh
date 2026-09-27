import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';

/**
 * This class can be used for testing purposes. It stores the exported spans
 * in a list in memory that can be retrieved using the `getFinishedSpans()`
 * method.
 */
export class InMemorySpanExporter implements SpanExporter {
  /**
   * Indicates if the exporter has been "shutdown."
   * When false, exported spans will not be stored in-memory.
   */
  protected _stopped = false;
  private _finishedSpans: ReadableSpan[] = [];

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    if (this._stopped) {
      resultCallback({
        code: ExportResultCode.FAILED,
        error: new Error('Exporter has been stopped'),
      });
      return;
    }
    this._finishedSpans.push(...spans);
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  /**
   * Exports any staged spans in the exporter
   */
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  getFinishedSpans(): ReadableSpan[] {
    return this._finishedSpans;
  }

  reset(): void {
    this._finishedSpans = [];
  }

  shutdown(): Promise<void> {
    this._stopped = true;
    return this.forceFlush();
  }
}
