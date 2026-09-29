import { makeSharedWorker } from "@zerospin/browser/makeSharedWorker";
const sqliteWasmUrl = new URL("@zerospin/browser/sqlite.wasm", import.meta.url).href;

makeSharedWorker({ sqliteWasmUrl });
