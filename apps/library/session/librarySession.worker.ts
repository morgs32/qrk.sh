import { makeSharedWorker } from "@zerospin/browser/makeSharedWorker";
import { librarySessionDeclaration } from "./librarySessionDeclaration";

makeSharedWorker({
  sqliteWasmUrl: new URL("@zerospin/browser/sqlite.wasm", import.meta.url).href,
  standaloneSessions: { library: { sessionRelease: librarySessionDeclaration } },
});
