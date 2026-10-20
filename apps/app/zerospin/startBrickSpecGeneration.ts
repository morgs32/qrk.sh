import { stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { isNonEmptySpec } from "@json-render/core";

import type { LibraryApi } from "../../library/worker/LibraryApi.public";
import type { UserApp } from "./userSession";

/** Provider work belongs to the session lifetime; the saved form only stages intent. */
export function startBrickSpecGeneration(
  session: ReturnType<typeof UserApp.useInitializedSession>,
) {
  const initialized = session.store.getState().initialized;
  if (initialized === null) return () => {};
  const { db } = initialized;
  const attempted = new Set<string>();
  const closeRequests = new Set<() => void>();
  let disposed = false;
  let scheduled = false;

  function scan() {
    scheduled = false;
    if (disposed || session.store.getState().initialized?.db !== db) return;
    const placements = db.query.placement.findMany().sync();
    for (const placement of placements) {
      const row = db.query.row.findFirst({ where: { id: { eq: placement.rowId } } }).sync();
      const stack =
        row === undefined
          ? undefined
          : db.query.stack.findFirst({ where: { id: { eq: row.stackId } } }).sync();
      const section =
        stack === undefined
          ? undefined
          : db.query.section.findFirst({ where: { id: { eq: stack.sectionId } } }).sync();
      const wall =
        section === undefined
          ? undefined
          : db.query.wall.findFirst({ where: { id: { eq: section.wallId } } }).sync();
      if (wall === undefined) continue;
      const generation = placement.generation;
      if (generation?.status !== "generating" || placement.brickId === null) continue;
      const brick = db.query.brick.findFirst({ where: { id: { eq: placement.brickId } } }).sync();
      if (
        brick === undefined ||
        brick.stateRevision !== generation.baseStateRevision ||
        placement.specRevision !== generation.baseSpecRevision
      )
        continue;
      const key = `${placement.id}:${generation.requestId}`;
      if (attempted.has(key)) continue;
      attempted.add(key);
      const state = structuredClone(brick.state);
      const currentSpec = isNonEmptySpec(placement.spec) ? structuredClone(placement.spec) : null;
      void navigator.locks
        .request(`qrk:spec-generation:${key}`, async () => {
          if (disposed || session.store.getState().initialized?.db !== db) return;
          const current = db.query.placement
            .findFirst({ where: { id: { eq: placement.id } } })
            .sync();
          const currentBrick = db.query.brick.findFirst({ where: { id: { eq: brick.id } } }).sync();
          if (
            current?.generation?.status !== "generating" ||
            current.generation.requestId !== generation.requestId ||
            current.specRevision !== generation.baseSpecRevision ||
            currentBrick?.stateRevision !== generation.baseStateRevision ||
            currentBrick.moduleId !== brick.moduleId
          )
            return;
          let outcome:
            | { status: "ready"; spec: unknown }
            | { status: "failed"; error: { code: string; message: string; retryable: boolean } };
          try {
            using api = newSyncRpcSession<LibraryApi>("/rpc");
            const close = () => api[Symbol.dispose]();
            closeRequests.add(close);
            try {
              const response = await api.generateSpec(
                brick.moduleId,
                generation.prompt,
                state,
                currentSpec,
              );
              outcome =
                response._tag === "Left"
                  ? {
                      status: "failed",
                      error: {
                        code: response.left.code,
                        message: response.left.message,
                        retryable: response.left.retryable ?? false,
                      },
                    }
                  : { status: "ready", spec: response.right };
            } finally {
              closeRequests.delete(close);
            }
          } catch {
            outcome = {
              status: "failed",
              error: {
                code: "spec-generation-unavailable",
                message: "Spec generation is unavailable. Try again.",
                retryable: true,
              },
            };
          }
          if (disposed || session.store.getState().initialized?.db !== db) return;
          stageAggregateSessionCommand({
            session,
            contractName: "completeBrickSpecGeneration",
            payload: {
              brickId: brick.id,
              breakpoint: wall.breakpoint,
              moduleId: brick.moduleId,
              requestId: generation.requestId,
              baseStateRevision: generation.baseStateRevision,
              baseSpecRevision: generation.baseSpecRevision,
              outcome,
            },
          });
        })
        .catch((error: unknown) => {
          if (!disposed) session.reportFailure({ origin: "session", error });
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
