import { makeSharedWorker } from '@zerospin/browser/makeSharedWorker';
import sqliteWasmUrl from '@zerospin/browser/sqlite.wasm?url';

makeSharedWorker({ sqliteWasmUrl });
