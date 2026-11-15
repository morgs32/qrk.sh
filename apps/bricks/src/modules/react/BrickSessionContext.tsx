"use client";

import type { IAggregateCommandSession, IInferResource } from "@zerospin/sdk/browser";
import { createContext } from "react";
import type { brickContracts } from "../../zerospin/brickContracts";
import type { brickV1 } from "../../zerospin/models/brick/BrickV1";
import type { placementV1 } from "../../zerospin/models/placement/PlacementV1";

/** The current Brick's real App session and editing lifecycle; null renders for a visitor. */
export const BrickSessionContext = createContext<{
  session: IAggregateCommandSession<typeof brickContracts>;
  brickId: IInferResource<typeof brickV1>["id"];
  placementId: IInferResource<typeof placementV1>["id"];
  registerFlush: (flush: (onRecover?: () => void) => boolean) => () => void;
} | null>(null);
