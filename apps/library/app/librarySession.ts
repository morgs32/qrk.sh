import { makeStandaloneSession } from "@zerospin/browser";
import { prefixId } from "@zerospin/core/models/prefixId";
import { LibraryFrontend } from "../makeLibraryFrontend/makeLibraryFrontend";

const fixtureDate = new Date("2026-01-01T00:00:00.000Z");

export const librarySession = makeStandaloneSession({
  key: "qrk-library",
  ...LibraryFrontend,
  claims: { aggregateId: "acct_1" },
  resources: {
    wall: [
      {
        createdAt: fixtureDate,
        id: prefixId(LibraryFrontend.models.wall, "library"),
        label: "Library",
        modelName: LibraryFrontend.models.wall.modelName,
        updatedAt: fixtureDate,
        version: LibraryFrontend.models.wall.version,
      },
    ],
  },
});
