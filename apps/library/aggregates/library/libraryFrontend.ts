import { PublishableKey } from "@zerospin/core/services/PublishableKey";
import { ZerospinApiUrl } from "@zerospin/core/services/ZerospinApiUrl";
import { makeZerospinApp } from "@zerospin/react";
import { Layer, Redacted, Schema } from "effect";

import { libraryAggregate } from "./libraryAggregate";
import type { librarySystem } from "./librarySystem";

export const sessionRuntimeLayer = Layer.mergeAll(
  Layer.succeed(PublishableKey, Redacted.make("pk_library_sandbox")),
  Layer.succeed(ZerospinApiUrl, "https://api.library.sandbox.test"),
);

const LibraryZerospinApp = makeZerospinApp<typeof librarySystem>({
  systemName: "library",
  layer: sessionRuntimeLayer,
});

export const LibraryFrontend = LibraryZerospinApp.makeAggregateFrontend({
  authenticationSchema: Schema.Struct({
    aggregateId: Schema.String,
  }),
  aggregateVersion: "1.0.0",
  contracts: libraryAggregate.contracts,
  aggregateName: "library",
  name: "library",
  models: libraryAggregate.models,
});
