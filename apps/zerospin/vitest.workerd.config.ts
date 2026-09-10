import path from "node:path";
import { fileURLToPath } from "node:url";

import { makeWorkerdVitestConfig } from "@zerospin/dev-worker/vitest/makeWorkerdVitestConfig";

import config from "./zerospin.config";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

export default makeWorkerdVitestConfig({
  packageRoot,
  config,
  passWithNoTests: false,
  workerBindings: {
    ZEROSPIN_PUBLISHABLE_KEY: "pk_test_qrk_workerd",
    CLERK_AUTHORIZED_PARTY: "http://localhost:4000",
    CLERK_SECRET_KEY: "sk_test_qrk_workerd",
    ZEROSPIN_SECRET_KEY: "sk_test_qrk_system_runtime",
  },
});
