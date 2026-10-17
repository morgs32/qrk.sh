import { makeAggregateSessionRelease } from "@zerospin/browser";
import { userSessionDefinition } from "@qrk.sh/zerospin/src/aggregates/user/userSessionDefinition";

export const userSessionDeclaration = makeAggregateSessionRelease({
  ...userSessionDefinition,
  systemName: "qrk-sh",
});
