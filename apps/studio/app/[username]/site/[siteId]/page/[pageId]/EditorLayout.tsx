"use client";

import { useState, type ReactNode } from "react";
import { useSelectedLayoutSegments } from "next/navigation";
import { Drawer } from "@qrk.sh/library/Drawer";

import { useAuth, useUser } from "@clerk/nextjs";
import { WallViewportProvider } from "@qrk.sh/library/WallViewportProvider";
import { ImageUploadEnvironment } from "@qrk.sh/library/ImageUploadEnvironment";
import { ImageUploadRuntimeContext } from "@qrk.sh/library/ImageUploadRuntimeContext";
import { BrickCardStyleContext } from "@qrk.sh/library/BrickCardStyleContext";
import { Effect, Layer, Schema } from "effect";

import { Toolbars } from "../../Toolbars/Toolbars";

import { MainColumns } from "./MainColumns";

import { useValidatedParams } from "@/hooks/useValidatedParams";
import { getClerkToken } from "@/lib/getClerkToken";
import { UserApp } from "@/zerospin/userSession";
import { Button } from "@/components/ui/button";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: Schema.String,
});

export default function EditorLayout(props: { children: ReactNode }) {
  const { children } = props;
  const [cardStyle, setCardStyle] = useState(false);
  const params = useValidatedParams(ParamsSchema);
  const segments = useSelectedLayoutSegments();
  const drawerOpen = segments.includes("(drawer)");
  const { user } = useUser();
  const { getToken } = useAuth();
  const session = UserApp.useInitializedSession();

  if (user === null || user === undefined) {
    return null;
  }

  const documentKey = JSON.stringify(["studio", user.id, params.siteId, params.pageId]);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL is required");
  const imageLayer = Layer.succeed(ImageUploadEnvironment, {
    uploadUrl: `${apiUrl.replace(/\/$/, "")}/upload`,
    siteId: params.siteId,
    authorization: Effect.gen(function* () {
      const token = yield* getClerkToken({ getToken });
      if (token === null) return yield* Effect.fail(new Error("Sign in to upload images"));
      return `Bearer ${token}`;
    }),
  });

  return (
    <BrickCardStyleContext value={cardStyle}>
      <ImageUploadRuntimeContext
        value={{
          runPromise: (program, options) =>
            session.runPromise(program.pipe(Effect.provide(imageLayer)), options),
        }}
      >
        <WallViewportProvider key={documentKey}>
          <div data-editor-split className="relative h-full min-h-0 overflow-hidden">
            <div data-editor-region className="h-full min-h-0 overflow-hidden">
              <MainColumns />
            </div>
            <Drawer
              side="bottom"
              open={drawerOpen}
              animated={
                drawerOpen ||
                (typeof document !== "undefined" &&
                  typeof document.startViewTransition === "function")
              }
              aria-label="Workspace drawer"
            >
              {children}
            </Drawer>
          </div>
          <Toolbars />
          <Button
            type="button"
            variant={cardStyle ? "secondary" : "outline"}
            size="sm"
            className="fixed right-3 top-3 z-80 shadow-sm"
            aria-pressed={cardStyle}
            onClick={() => setCardStyle((current) => !current)}
          >
            Cards
          </Button>
        </WallViewportProvider>
      </ImageUploadRuntimeContext>
    </BrickCardStyleContext>
  );
}
