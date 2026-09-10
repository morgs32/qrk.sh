import { useState } from 'react';

import { ZerospinError } from '@zerospin/error';
import { Copy, RefreshCw } from 'lucide-react';
import { isRouteErrorResponse, useRouteError } from 'react-router';

import './ZerospinRouteErrorBoundary.css';

export function ZerospinRouteErrorBoundary() {
  const error = useRouteError();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );
  const [detailsOpen, setDetailsOpen] = useState(import.meta.env.DEV);

  let errorKind: string;
  let errorCode: string | null = null;
  let message: string;
  let status: number | null = null;
  let structuredDetailsLabel: string | null = null;
  let structuredDetails: unknown = null;
  let cause: string | null = null;
  let stack: string | null = null;
  let diagnostics: unknown;

  if (ZerospinError.isZerospinError(error)) {
    errorKind = error._tag;
    errorCode = error.code;
    message = error.rawMessage;
    status = error.status;
    structuredDetailsLabel = error.extra === null ? null : 'Extra';
    structuredDetails = error.extra;
    cause = error.cause;
    stack = error.stack ?? null;
    diagnostics = {
      tag: error._tag,
      code: error.code,
      message: error.rawMessage,
      status: error.status,
      extra: error.extra,
      cause: error.cause,
      stack: error.stack ?? null,
    };
  } else if (isRouteErrorResponse(error)) {
    errorKind = 'RouteErrorResponse';
    errorCode = `${String(error.status)} ${error.statusText}`.trim();
    message =
      typeof error.data === 'string'
        ? error.data
        : error.data instanceof Error
          ? error.data.message
          : 'React Router returned an error response.';
    status = error.status;
    structuredDetailsLabel = error.data === null ? null : 'Response data';
    structuredDetails = error.data;
    diagnostics = {
      tag: 'RouteErrorResponse',
      status: error.status,
      statusText: error.statusText,
      data: error.data,
    };
  } else if (error instanceof Error) {
    errorKind = error.name.length === 0 ? 'Error' : error.name;
    message = error.message;
    stack = error.stack ?? null;
    diagnostics = {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  } else {
    errorKind = 'Unknown thrown value';
    try {
      message = String(error);
    } catch {
      message = 'The thrown value could not be converted to text.';
    }
    diagnostics = { value: message };
  }

  let diagnosticText: string;
  try {
    diagnosticText = JSON.stringify(diagnostics, null, 2);
  } catch {
    diagnosticText = `${errorKind}: ${message}`;
  }

  let structuredDetailsText: string | null = null;
  if (structuredDetailsLabel !== null) {
    try {
      structuredDetailsText = JSON.stringify(structuredDetails, null, 2);
    } catch {
      try {
        structuredDetailsText = String(structuredDetails);
      } catch {
        structuredDetailsText = 'The diagnostic value could not be displayed.';
      }
    }
  }

  const hasDetailedSections =
    structuredDetailsText !== null || cause !== null || stack !== null;

  return (
    <main className="zerospin-route-error">
      <article
        role="alert"
        aria-labelledby="zerospin-route-error-title"
        className="zerospin-route-error__card"
      >
        <header className="zerospin-route-error__header">
          <div className="zerospin-route-error__heading">
            <div className="zerospin-route-error__identity">
              <div className="zerospin-route-error__title-row">
                <h1 id="zerospin-route-error-title">{errorKind}</h1>
                {status === null ? null : (
                  <span className="zerospin-route-error__status">
                    Status {status}
                  </span>
                )}
              </div>
              {errorCode === null ? null : (
                <code className="zerospin-route-error__code">{errorCode}</code>
              )}
            </div>
          </div>
          <p className="zerospin-route-error__message">{message}</p>
        </header>

        <div className="zerospin-route-error__content">
          <details
            open={detailsOpen}
            onToggle={event => {
              setDetailsOpen(event.currentTarget.open);
            }}
          >
            <summary>
              {detailsOpen
                ? 'Hide diagnostic details'
                : 'Show diagnostic details'}
            </summary>
            <div className="zerospin-route-error__details">
              {structuredDetailsText === null ? null : (
                <section>
                  <h2>{structuredDetailsLabel}</h2>
                  <pre>
                    <code>{structuredDetailsText}</code>
                  </pre>
                </section>
              )}

              {cause === null ? null : (
                <section>
                  <h2>Cause</h2>
                  <pre>
                    <code>{cause}</code>
                  </pre>
                </section>
              )}

              {stack === null ? null : (
                <section>
                  <h2>Stack</h2>
                  <pre className="zerospin-route-error__stack">
                    <code>{stack}</code>
                  </pre>
                </section>
              )}

              {hasDetailedSections ? null : (
                <section>
                  <h2>Diagnostic payload</h2>
                  <pre>
                    <code>{diagnosticText}</code>
                  </pre>
                </section>
              )}
            </div>
          </details>
        </div>

        <footer className="zerospin-route-error__footer">
          <button
            type="button"
            className="zerospin-route-error__button zerospin-route-error__button--outline"
            disabled={
              typeof navigator === 'undefined' ||
              navigator.clipboard === undefined
            }
            onClick={() => {
              if (navigator.clipboard === undefined) {
                setCopyState('failed');
                return;
              }
              void navigator.clipboard.writeText(diagnosticText).then(
                () => setCopyState('copied'),
                () => setCopyState('failed'),
              );
            }}
          >
            <Copy aria-hidden="true" />
            <span aria-live="polite">
              {copyState === 'copied'
                ? 'Copied'
                : copyState === 'failed'
                  ? 'Copy failed'
                  : 'Copy diagnostics'}
            </span>
          </button>
          <button
            type="button"
            className="zerospin-route-error__button"
            onClick={() => {
              window.location.reload();
            }}
          >
            <RefreshCw aria-hidden="true" />
            Reload application
          </button>
        </footer>
      </article>
    </main>
  );
}
