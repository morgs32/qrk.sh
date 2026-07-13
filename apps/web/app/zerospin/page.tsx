"use client";

import { makeReactSession } from "@zerospin/react/makeReactSession";
import { Effect } from "effect";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ownerFrontend } from "@qrk.sh/zerospin/src/ownerFrontend";

const ReactSession = makeReactSession({
  frontend: ownerFrontend,
});

const zerospinApiUrl = process.env.NEXT_PUBLIC_ZEROSPIN_API_URL ?? "https://api.zerospin.dev";
const zerospinPublishableKey = process.env.NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY;
const rawZerospinUserId = process.env.NEXT_PUBLIC_ZEROSPIN_USER_ID;
const zerospinUserId =
  rawZerospinUserId?.startsWith("usr_") === true
    ? (rawZerospinUserId as `usr_${string}`)
    : undefined;

export default function ZerospinPage() {
  const isMissingPublishableKey = !zerospinPublishableKey;
  const isMissingUserId = !zerospinUserId;

  if (isMissingPublishableKey || isMissingUserId) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-6">
        <section className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">Zerospin</h1>
          <p className="text-sm text-muted-foreground">makeReactSession smoke page</p>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Missing environment</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {isMissingPublishableKey ? (
              <p>
                Set <code>NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY</code> in <code>apps/web/.env</code>.
              </p>
            ) : null}
            {isMissingUserId ? (
              <p>
                Set <code>NEXT_PUBLIC_ZEROSPIN_USER_ID</code> to a <code>usr_</code> id in{" "}
                <code>apps/web/.env</code>.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-6">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Zerospin</h1>
        <p className="text-sm text-muted-foreground">makeReactSession smoke page</p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Config</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <div className="text-muted-foreground">API URL</div>
            <div className="break-all font-mono">{zerospinApiUrl}</div>
          </div>
          <div>
            <div className="text-muted-foreground">User ID</div>
            <div className="break-all font-mono">{zerospinUserId}</div>
          </div>
        </CardContent>
      </Card>

      <ReactSession.Provider generateSignature={() => Effect.succeed({ userId: zerospinUserId })}>
        <ZerospinSessionState />
      </ReactSession.Provider>
    </main>
  );
}

function ZerospinSessionState() {
  const initializedState = ReactSession.useInitializedStateOrThrow();

  const userState = ReactSession.useLiveQuery({
    deps: [zerospinUserId],
    query: (db) =>
      db.query.user.findMany({
        where: {
          id: {
            eq: zerospinUserId,
          },
        },
        with: {
          sites: {
            with: {
              pages: {
                with: {
                  grids: {
                    with: {
                      items: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
  });

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Session ID</dt>
              <dd className="break-all font-mono">{initializedState.sessionId}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Account ID</dt>
              <dd className="break-all font-mono">{initializedState.accountId}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Actor ID</dt>
              <dd className="break-all font-mono">{initializedState.actorId}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Deploy</dt>
              <dd className="break-all font-mono">{initializedState.deployName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cursor</dt>
              <dd className="break-all font-mono">{initializedState.currentBatchCursor}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User State</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {userState.error ? (
            <pre className="overflow-auto rounded-md bg-muted p-4 text-sm text-destructive">
              {userState.error.message}
            </pre>
          ) : (
            <pre className="max-h-[600px] overflow-auto rounded-md bg-muted p-4 text-xs">
              {JSON.stringify(userState.data ?? null, null, 2)}
            </pre>
          )}
          <div className="text-xs text-muted-foreground">
            Updated: {userState.updatedAt ? userState.updatedAt.toISOString() : "never"}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
