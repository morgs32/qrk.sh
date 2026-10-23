import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import * as sdk from "@zerospin/sdk";
import { createJiti } from "jiti";

export default defineConfig(async () => {
  const { system } = await createJiti(import.meta.url).import<
    typeof import("@qrk.sh/zerospin/system")
  >("@qrk.sh/zerospin/system");
  const systemSpec = sdk.makeSystemSpec({ system });

  return {
    plugins: [react()],
    define: {
      __QRK_SYSTEM_SPEC__: JSON.stringify(systemSpec),
    },
    server: {
      host: "127.0.0.1",
      port: Number(process.env.PORT ?? 10002),
      strictPort: true,
      allowedHosts: ["admin.qrk.localhost"],
    },
    preview: {
      host: "127.0.0.1",
      port: Number(process.env.PORT ?? 10012),
      strictPort: true,
      allowedHosts: ["admin.qrk.localhost"],
    },
  };
});
