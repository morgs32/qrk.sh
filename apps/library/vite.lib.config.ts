import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite-plus";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  const packageEnv = loadEnv(mode, packageRoot, "");
  const mapboxToken = packageEnv.PUBLIC_MAPBOX_TOKEN;

  if (mapboxToken === undefined || mapboxToken.length === 0) {
    throw new Error(`PUBLIC_MAPBOX_TOKEN is required in ${packageRoot}/.env.local`);
  }

  return {
    define: {
      "import.meta.env.PUBLIC_MAPBOX_TOKEN": JSON.stringify(mapboxToken),
    },
    plugins: [react()],
    build: {
      lib: {
        entry: {
          index: "lib/index.ts",
          ModuleFilmstrip: "lib/ModuleFilmstrip.tsx",
          Drawer: "lib/Drawer.tsx",
          GridItemPreview: "lib/GridItemPreview.tsx",
          MeasuredBrickWrapper: "components/brick/MeasuredBrickWrapper.tsx",
          WallViewportProvider: "lib/WallViewportProvider.tsx",
          WallBreakpointPane: "lib/WallBreakpointPane.tsx",
          breakpoints: "lib/breakpoints.ts",
          BrickWall: "lib/BrickWall.tsx",
          brickDragStore: "lib/brickDragStore.ts",
          libraryModule: "libraryModule/libraryModule.ts",
          createLibraryStandaloneSession: "session/createLibraryStandaloneSession.ts",
          TiptapDocSchema: "lib/TiptapDocSchema.ts",
        },
        formats: ["es"],
        cssFileName: "text-editor",
        fileName: (_format, entryName) => `${entryName}.js`,
      },
      rollupOptions: {
        external: [
          "@json-render/core",
          "@radix-ui/react-slot",
          "@tiptap/react",
          "@unpic/react",
          "@zerospin/browser",
          /^@zerospin\/core(?:\/|$)/,
          "@zerospin/react",
          "@zerospin/schema",
          "class-variance-authority",
          "cn",
          "effect",
          "framer-motion",
          "es-toolkit/object",
          "lucide-react",
          "mapbox-gl",
          "react",
          "react-activity-calendar",
          "react-dom",
          "react-grid-layout",
          "react/jsx-runtime",
          /^swr(?:\/|$)/,
          /^zustand(?:\/|$)/,
        ],
      },
    },
  };
});
