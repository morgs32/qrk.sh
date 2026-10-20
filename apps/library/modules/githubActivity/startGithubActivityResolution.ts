import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { makeEffectSchema, type IInferDecodedRow } from "@zerospin/shapes";
import { Schema } from "effect";
import type { LibraryApi } from "../../worker/LibraryApi.public";
import { githubActivityV1 } from "./githubActivityV1";

/** Session-owned provider work; editor unmount never cancels a submitted intent. */
export function startGithubActivityResolution(props: {
  readBricks: () => Array<{ id: `brk_${string}`; state: unknown; stateRevision: number }>;
  readBrick: (id: `brk_${string}`) => { state: unknown; stateRevision: number } | undefined;
  isCurrent: () => boolean;
  subscribe: (listener: () => void) => () => void;
  complete: (payload: {
    brickId: `brk_${string}`;
    requestId: string;
    baseStateRevision: number;
    state: IInferDecodedRow<typeof githubActivityV1.stateShape>;
  }) => void;
}) {
  const { readBricks, readBrick, isCurrent, subscribe, complete } = props;
  const State = Schema.toType(makeEffectSchema(githubActivityV1.stateShape));
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
        .request(`qrk:github-activity:${key}`, async () => {
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
              const response = await api.getGitHubProfile(state.payload.url);
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
                  response.right.login.toLowerCase() !==
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
                if (
                  outcome.data !== null &&
                  outcome.data.contributions.some(
                    (day) =>
                      !Number.isFinite(Date.parse(day.date)) ||
                      new Date(day.date).toISOString().slice(0, 10) !== day.date,
                  )
                )
                  throw new Error("Invalid contribution date");
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
                  code: "github-activity-resolution-failed",
                  message: "Unable to resolve this github-activity; try again.",
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
