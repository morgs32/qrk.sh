import { Schema } from "effect";

import { libraryModule } from "../libraryModule/libraryModule";

export const librarySessionDeclaration = {
  aggregateName: "library",
  aggregateVersion: "1.0.0",
  actorName: "library",
  actorVersion: "1.0.0",
  sessionName: "library",
  claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
  models: libraryModule.models,
  contracts: libraryModule.contracts,
};
