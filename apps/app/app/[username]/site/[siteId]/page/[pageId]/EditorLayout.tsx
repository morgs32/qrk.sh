"use client";

import { type ReactNode } from "react";
import { useMatches } from "@tanstack/react-router";
import { Drawer } from "@qrk.sh/library/Drawer";

import { useAuth, useUser } from "@clerk/react";
import { WallViewportProvider } from "@qrk.sh/library/WallViewportProvider";
import { ImageUploadEnvironment } from "@qrk.sh/library/ImageUploadEnvironment";
import { ImageUploadRuntimeContext } from "@qrk.sh/library/ImageUploadRuntimeContext";
import { BrickCardStyleContext } from "@qrk.sh/library/BrickCardStyleContext";
import { makeModelIdSchema } from "@zerospin/core/models/make/makeModelIdSchema";
import { useLiveQuery } from "@zerospin/react";
import { siteV3 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV3";
import { Effect, Layer, Schema } from "effect";

import { Toolbars } from "../../Toolbars/Toolbars";

import { MainColumns } from "./MainColumns";

import { useValidatedParams } from "@/hooks/useValidatedParams";
import { getClerkToken } from "@/lib/getClerkToken";
import { UserApp } from "@/zerospin/userSession";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: makeModelIdSchema(Site),
  pageId: Schema.String,
});

export default function EditorLayout(props: { children: ReactNode }) {
  const { children } = props;
  const params = useValidatedParams(ParamsSchema);
  const drawerOpen = useMatches({
    select: (matches) =>
      matches.some((match) => match.routeId === "/$username/site/$siteId/page/$pageId/_drawer"),
  });
  const { user } = useUser();
  const { getToken } = useAuth();
  const session = UserApp.useInitializedSession();
  const { data: site } = useLiveQuery({
    session,
    key: params.siteId,
    query: (db, siteId) => db.query.site.findFirst({ where: { id: { eq: siteId } } }),
  });

  if (user === null || user === undefined) {
    return null;
  }

  const documentKey = JSON.stringify(["app", user.id, params.siteId, params.pageId]);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL is required");
  const imageLayer = Layer.succeed(ImageUploadEnvironment, {
    upload: Effect.fn("App.Image.upload")(function* (file: File) {
      const token = yield* getClerkToken({ getToken });
      if (token === null) return yield* Effect.fail(new Error("Sign in to upload images"));
      const body = new FormData();
      body.set("file", file);
      body.set("siteId", params.siteId);
      const response = yield* Effect.tryPromise((signal) =>
        fetch(`${apiUrl.replace(/\/$/, "")}/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body,
          signal,
        }),
      );
      const result: unknown = yield* Effect.tryPromise(() => response.json());
      if (!response.ok) {
        const error = yield* Schema.decodeUnknownEffect(
          Schema.Struct({ code: Schema.String, message: Schema.String }),
        )(result);
        return yield* Effect.fail(new Error(error.message));
      }
      const uploaded = yield* Schema.decodeUnknownEffect(
        Schema.Struct({ key: Schema.String, url: Schema.String, contentType: Schema.String }),
      )(result);
      return uploaded.url;
    }),
  });

  return (
    <BrickCardStyleContext value={site?.cardStyle ?? false}>
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
        </WallViewportProvider>
      </ImageUploadRuntimeContext>
    </BrickCardStyleContext>
  );
}
