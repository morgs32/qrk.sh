import path from "node:path";
import { fileURLToPath } from "node:url";

import { makeWorkerdVitestConfig } from "@zerospin/dev-worker/vitest/makeWorkerdVitestConfig";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

export default makeWorkerdVitestConfig({
  packageRoot,
  systemModulePath: path.join(packageRoot, "src/system.ts"),
  wranglerConfigPath: path.join(packageRoot, "wrangler.vitest.jsonc"),
  workerMainPath: path.join(packageRoot, "src/Worker.ts"),
});
