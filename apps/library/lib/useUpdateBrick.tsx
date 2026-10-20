"use client";

import { stageAggregateSessionCommand } from "@zerospin/core/aggregateSession/stageCommand/stageAggregateSessionCommand";
import { useLayoutEffect, useRef } from "react";

import { useLibrarySession } from "../session/createLibraryStandaloneSession";

export function useUpdateBrick(props: { brickId: `brk_${string}` }) {
  const { brickId } = props;
  const session = useLibrarySession();
  const mounted = useRef(false);
  const activeBrickId = useRef<`brk_${string}` | null>(null);

  useLayoutEffect(() => {
    mounted.current = true;
    activeBrickId.current = brickId;
    return () => {
      mounted.current = false;
      activeBrickId.current = null;
    };
  }, [brickId]);

  function updateBrick(state: unknown) {
    if (!mounted.current || activeBrickId.current !== brickId)
      throw new Error("Brick editor is closed");
    const initialized = session.store.getState().initialized;
    if (initialized === null) throw new Error("Library session is not ready");
    const brick = initialized.db.query.brick.findFirst({ where: { id: { eq: brickId } } }).sync();
    if (brick === undefined) throw new Error("Brick was deleted before saving");
    return stageAggregateSessionCommand({
      session,
      contractName: "updateBrick",
      payload: { brickId, moduleId: brick.moduleId, state },
    });
  }

  return { updateBrick };
}
