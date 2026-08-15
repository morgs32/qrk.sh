import { useState } from 'react';

import { ZerospinError } from '@zerospin/error';
import { Copy, RefreshCw, TriangleAlert } from 'lucide-react';
import { isRouteErrorResponse, useRouteError } from 'react-router';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function ShoppingErrorBoundary() {
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
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4 sm:p-6">
      <Card
        role="alert"
        aria-labelledby="shopping-error-title"
        className="max-h-[calc(100vh-2rem)] w-full max-w-3xl gap-0 overflow-hidden py-0 shadow-xl"
      >
        <CardHeader className="gap-4 border-b px-6 py-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <TriangleAlert className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle id="shopping-error-title" className="text-lg">
                  {errorKind}
                </CardTitle>
                {status === null ? null : (
                  <span className="rounded-md border bg-muted px-2 py-0.5 font-mono text-xs">
                    Status {status}
                  </span>
                )}
              </div>
              {errorCode === null ? null : (
                <code className="block break-all font-mono text-sm font-semibold text-destructive">
                  {errorCode}
                </code>
              )}
            </div>
          </div>
          <CardDescription className="break-words font-mono text-xs leading-relaxed text-foreground">
            {message}
          </CardDescription>
        </CardHeader>

        <CardContent className="min-h-0 overflow-y-auto px-6 py-5">
          <details
            open={detailsOpen}
            onToggle={event => {
              setDetailsOpen(event.currentTarget.open);
            }}
            className="group"
          >
            <summary className="cursor-pointer select-none text-sm font-semibold">
              {detailsOpen
                ? 'Hide diagnostic details'
                : 'Show diagnostic details'}
            </summary>
            <div className="space-y-5 pt-4">
              {structuredDetailsText === null ? null : (
                <section className="space-y-2">
                  <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {structuredDetailsLabel}
                  </h2>
                  <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                    <code>{structuredDetailsText}</code>
                  </pre>
                </section>
              )}

              {cause === null ? null : (
                <section className="space-y-2">
                  <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Cause
                  </h2>
                  <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                    <code>{cause}</code>
                  </pre>
                </section>
              )}

              {stack === null ? null : (
                <section className="space-y-2">
                  <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Stack
                  </h2>
                  <pre className="max-h-80 overflow-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                    <code>{stack}</code>
                  </pre>
                </section>
              )}

              {hasDetailedSections ? null : (
                <section className="space-y-2">
                  <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Diagnostic payload
                  </h2>
                  <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                    <code>{diagnosticText}</code>
                  </pre>
                </section>
              )}
            </div>
          </details>
        </CardContent>

        <CardFooter className="flex flex-col-reverse items-stretch justify-between gap-2 border-t px-6 py-4 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="outline"
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
          </Button>
          <Button
            type="button"
            onClick={() => {
              window.location.reload();
            }}
          >
            <RefreshCw aria-hidden="true" />
            Reload application
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
