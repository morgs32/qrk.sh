"use client";

import { RoutePattern } from "@remix-run/route-pattern";
import { makeReactApp } from "@zerospin/react";
import { librarySessionRelease } from "../session/createLibraryStandaloneSession";
import { prefixId } from "@zerospin/core/models/prefixId";
import { libraryModule } from "../libraryModule/libraryModule";

const fixtureDate = new Date("2026-01-01T00:00:00.000Z");

export const LibraryApp = makeReactApp(librarySessionRelease);

export const librarySessionInputs = {
  backupPath: RoutePattern.parse("/qrk-library"),
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
};
