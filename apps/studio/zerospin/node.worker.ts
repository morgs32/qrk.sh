import { makeSharedWorker } from "@zerospin/browser/makeSharedWorker";
import { userSessionDeclaration } from "./userSessionDeclaration";

makeSharedWorker({
  sqliteWasmUrl: new URL("@zerospin/browser/sqlite.wasm", import.meta.url).href,
  aggregateSessions: [{ declaration: userSessionDeclaration }],
});
