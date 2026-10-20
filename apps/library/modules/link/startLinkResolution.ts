import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { makeEffectSchema, type IInferDecodedRow } from "@zerospin/shapes";
import { Schema } from "effect";
import type { LibraryApi } from "../../worker/LibraryApi.public";
import { linkV1 } from "./linkV1";

/** Session-owned provider work; editor unmount never cancels a submitted intent. */
export function startLinkResolution(props: {
  readBricks: () => Array<{ id: `brk_${string}`; state: unknown; stateRevision: number }>;
  readBrick: (id: `brk_${string}`) => { state: unknown; stateRevision: number } | undefined;
  isCurrent: () => boolean;
  subscribe: (listener: () => void) => () => void;
  complete: (payload: {
    brickId: `brk_${string}`;
    requestId: string;
    baseStateRevision: number;
    state: IInferDecodedRow<typeof linkV1.stateShape>;
  }) => void;
}) {
  const { readBricks, readBrick, isCurrent, subscribe, complete } = props;
  const State = Schema.toType(makeEffectSchema(linkV1.stateShape));
  const attempted = new Set<string>();
  const closeRequests = new Set<() => void>();
  let disposed = false;
  let scheduled = false;

  function scan() {
    scheduled = false;
    if (disposed || !isCurrent()) return;
    const rows = readBricks();
    for (const row of rows) {
      const decoded = Schema.decodeUnknownResult(State)(row.state);
      if (decoded._tag === "Failure" || decoded.success.resolution.status !== "resolving") continue;
      const state = decoded.success;
      const requestId = state.resolution.requestId;
      const key = `${row.id}:${requestId}:${row.stateRevision}`;
      if (attempted.has(key)) continue;
      attempted.add(key);
      void navigator.locks
        .request(`qrk:link:${key}`, async () => {
          if (disposed || !isCurrent()) return;
          const current = readBrick(row.id);
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
              const response = await api.linkBackend().getPreview(state.payload.url);
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
                  code: "link-resolution-failed",
                  message: "Unable to resolve this link; try again.",
                  retryable: true,
                },
              },
            };
          }
          if (disposed || !isCurrent()) return;
          complete({
            brickId: row.id,
            requestId,
            baseStateRevision: row.stateRevision,
            state: outcome,
          });
        })
        .catch(() => {
          if (disposed || !isCurrent()) return;
          complete({
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
          });
        });
    }
  }
  function schedule() {
    if (scheduled || disposed) return;
    scheduled = true;
    queueMicrotask(scan);
  }
  const unsubscribe = subscribe(schedule);
  schedule();
  return () => {
    disposed = true;
    unsubscribe();
    for (const close of closeRequests) close();
    closeRequests.clear();
  };
}
