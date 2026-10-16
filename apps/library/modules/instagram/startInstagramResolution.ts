import { stageAggregateSessionCommand } from "@zerospin/core/aggregateSession/stageCommand/stageAggregateSessionCommand";
import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { makeEffectSchema } from "@zerospin/shapes";
import { Schema } from "effect";
import type { ILibrarySession } from "../../session/createLibraryStandaloneSession";
import type { LibraryApi } from "../../worker/LibraryApi.public";
import { instagramV1 } from "./instagramV1";

/** Session-owned provider work; editor unmount never cancels a submitted intent. */
export function startInstagramResolution(session: ILibrarySession) {
  const initialized = session.store.getState().initialized;
  if (initialized === null) return () => {};
  const { db } = initialized;
  const State = Schema.toType(makeEffectSchema(instagramV1.stateShape));
  const attempted = new Set<string>();
  const closeRequests = new Set<() => void>();
  let disposed = false;
  let scheduled = false;

  function scan() {
    scheduled = false;
    if (disposed || session.store.getState().initialized?.db !== db) return;
    const rows = db.query.brick.findMany({ where: { moduleId: { eq: "instagram" } } }).sync();
    for (const row of rows) {
      const decoded = Schema.decodeUnknownResult(State)(row.state);
      if (decoded._tag === "Failure" || decoded.success.resolution.status !== "resolving") continue;
      const state = decoded.success;
      const requestId = state.resolution.requestId;
      const key = `${row.id}:${requestId}:${row.stateRevision}`;
      if (attempted.has(key)) continue;
      attempted.add(key);
      void navigator.locks
        .request(`qrk:instagram:${key}`, async () => {
          if (disposed || session.store.getState().initialized?.db !== db) return;
          const current = db.query.brick.findFirst({ where: { id: { eq: row.id } } }).sync();
          if (current?.stateRevision !== row.stateRevision) return;
          const currentState = Schema.decodeUnknownResult(State)(current.state);
          if (
            currentState._tag === "Failure" ||
            currentState.success.resolution.status !== "resolving" ||
            currentState.success.resolution.requestId !== requestId
          )
            return;
          let outcome: typeof State.Type;
          try {
            using api = newSyncRpcSession<LibraryApi>("/rpc");
            const close = () => api[Symbol.dispose]();
            closeRequests.add(close);
            try {
              const response = await api.getInstagramProfile(state.payload.url);
              if (response._tag === "Left") {
                outcome = {
                  payload: state.payload,
                  data: null,
                  resolution: {
                    requestId,
                    status: "failed",
                    error: {
                      code: response.left.code,
                      message: response.left.message,
                      retryable: response.left.retryable ?? false,
                    },
                  },
                };
              } else {
                if (
                  response.right.username.toLowerCase() !==
                  new URL(state.payload.url).pathname.slice(1).toLowerCase()
                )
                  throw new Error("Profile identity mismatch");
                outcome = Schema.decodeUnknownSync(State)(
                  {
                    payload: state.payload,
                    data: response.right,
                    resolution: { requestId, status: "ready", error: null },
                  },
                  { onExcessProperty: "ignore" },
                );
              }
            } finally {
              closeRequests.delete(close);
            }
          } catch {
            outcome = {
              payload: state.payload,
              data: null,
              resolution: {
                requestId,
                status: "failed",
                error: {
                  code: "instagram-resolution-failed",
                  message: "Unable to resolve this instagram; try again.",
                  retryable: true,
                },
              },
            };
          }
          if (disposed || session.store.getState().initialized?.db !== db) return;
          stageAggregateSessionCommand({
            session,
            contractName: "completeInstagram",
            payload: {
              brickId: row.id,
              requestId,
              baseStateRevision: row.stateRevision,
              state: outcome,
            },
          });
        })
        .catch(() => {
          if (disposed || session.store.getState().initialized?.db !== db) return;
          stageAggregateSessionCommand({
            session,
            contractName: "completeInstagram",
            payload: {
              brickId: row.id,
              requestId,
              baseStateRevision: row.stateRevision,
              state: {
                payload: state.payload,
                data: null,
                resolution: {
                  requestId,
                  status: "failed",
                  error: {
                    code: "local-resolution-failed",
                    message: "Unable to run this request; try again.",
                    retryable: true,
                  },
                },
              },
            },
          });
        });
    }
  }
  function schedule() {
    if (scheduled || disposed) return;
    scheduled = true;
    queueMicrotask(scan);
  }
  const unsubscribe = db.$client.subscribeToTableChanges(schedule);
  schedule();
  return () => {
    disposed = true;
    unsubscribe();
    for (const close of closeRequests) close();
    closeRequests.clear();
  };
}
