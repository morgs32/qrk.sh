import { makeAggregateSessionDefinition } from "@zerospin/browser";
import { userSessionDefinitionProps } from "@qrk.sh/zerospin/src/aggregates/user/userSessionDefinitionProps";
import { userSessionDefinitionPropsV3 } from "@qrk.sh/zerospin/src/aggregates/user/userSessionDefinitionPropsV3";

export const userSessionDefinitionV3 = makeAggregateSessionDefinition({
  ...userSessionDefinitionPropsV3,
  systemName: "qrk-sh",
});

export const userSessionDefinition = makeAggregateSessionDefinition({
  ...userSessionDefinitionProps,
  systemName: "qrk-sh",
});
