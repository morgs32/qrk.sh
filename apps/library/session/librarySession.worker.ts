import { makeSharedWorker } from "@zerospin/browser/makeSharedWorker";
import { makeAggregateSessionRelease } from "@zerospin/core/sessionRelease/makeAggregateSessionRelease";

import { librarySessionDeclaration } from "./librarySessionDeclaration";

const sessionRelease = {
  ...makeAggregateSessionRelease({
    ...librarySessionDeclaration,
    kind: "aggregate",
    systemName: "standalone",
  }),
  ...librarySessionDeclaration,
};

makeSharedWorker({
  sqliteWasmUrl: new URL("@zerospin/browser/sqlite.wasm", import.meta.url).href,
  standaloneSessions: { [sessionRelease.sessionName]: sessionRelease },
});
