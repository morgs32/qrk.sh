import { Schema } from "effect";
import { makeStandaloneSession } from "@zerospin/browser";
import { prefixId } from "@zerospin/core/models/prefixId";
import { libraryModule } from "../libraryModule/libraryModule";

const fixtureDate = new Date("2026-01-01T00:00:00.000Z");

export const librarySession = makeStandaloneSession({
  key: "qrk-library",
  ...libraryModule,
  kind: "aggregate",
  aggregateName: "library",
  aggregateVersion: "1.0.0",
  actorName: "library",
  actorVersion: "1.0.0",
  sessionName: "library",
  claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
  claims: { aggregateId: "acct_1" },
  resources: {
    wall: [
      {
        createdAt: fixtureDate,
        id: prefixId(libraryModule.models.wall, "library"),
        label: "Library",
        modelName: libraryModule.models.wall.modelName,
        updatedAt: fixtureDate,
        version: libraryModule.models.wall.version,
      },
    ],
  },
});
