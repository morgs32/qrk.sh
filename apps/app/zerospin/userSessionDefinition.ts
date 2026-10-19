import { makeAggregateSessionDefinition } from "@zerospin/browser";
import { userSessionDefinitionProps } from "@qrk.sh/zerospin/src/aggregates/user/userSessionDefinitionProps";

export const userSessionDefinition = makeAggregateSessionDefinition({
  ...userSessionDefinitionProps,
  systemName: "qrk-sh",
});
