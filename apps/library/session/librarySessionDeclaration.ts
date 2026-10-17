import { makeAggregateSessionRelease } from "@zerospin/browser";
import { Schema } from "effect";

import { libraryModule } from "../libraryModule/libraryModule";

const claimsSchema = Schema.Struct({ aggregateId: Schema.String });

export const librarySessionDeclaration = makeAggregateSessionRelease({
  kind: "aggregate",
  systemName: "standalone",
  aggregateName: "library",
  aggregateVersion: "1.0.0",
  actorName: "library",
  actorVersion: "1.0.0",
  sessionName: "library",
  claimsSchema,
  models: libraryModule.models,
  contracts: libraryModule.contracts,
});
