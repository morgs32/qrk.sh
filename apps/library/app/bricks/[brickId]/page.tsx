"use client";

import { useState } from "react";
import { notFound, useParams } from "next/navigation";
import { makeModelIdSchema } from "@zerospin/core/models/make/makeModelIdSchema";
import { Result, Schema } from "effect";
import { useLiveQuery } from "@zerospin/react";

import { libraryModule } from "../../../libraryModule/libraryModule";
import { Button } from "../../../components/ui/button";
import { modulesHash } from "../../../lib/modulesHash";
import { useWallViewport } from "../../../lib/WallViewportProvider";
import { useUpdateBrick } from "../../../lib/useUpdateBrick";
import { useLibrarySession } from "../../../session/createLibraryStandaloneSession";
import { GitHubProfileForm } from "../../../modules/githubProfile/GitHubProfileForm";
import { GitHubRepoForm } from "../../../modules/githubRepo/GitHubRepoForm";
import { GitHubActivityForm } from "../../../modules/githubActivity/GitHubActivityForm";
import { FigmaThumbnailForm } from "../../../modules/figmaThumbnail/FigmaThumbnailForm";
import { InstagramForm } from "../../../modules/instagram/InstagramForm";

export default function BrickDetail() {
  const params = useParams();
  const decoded = Schema.decodeUnknownResult(
    Schema.Struct({ brickId: makeModelIdSchema(libraryModule.models.brick) }),
  )(params);
  if (Result.isFailure(decoded)) notFound();
  return <BrickDetailContent key={decoded.success.brickId} brickId={decoded.success.brickId} />;
}

function BrickDetailContent(props: { brickId: `brk_${string}` }) {
  const { brickId } = props;
  const { activeBreakpoint } = useWallViewport();
  const breakpoint = activeBreakpoint ?? "sm";
  const session = useLibrarySession();
  const { updateBrick, measurementHost, isMutating } = useUpdateBrick({ brickId });
  const [formDraft, setFormDraft] = useState<{ state: unknown } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [acceptedState, setAcceptedState] = useState<{ state: unknown } | null>(null);
  const [editorEpoch, setEditorEpoch] = useState(0);

  const brickQuery = useLiveQuery({
    session,
    key: brickId,
    query: (db, queriedBrickId) =>
      db.query.brick.findFirst({
        where: { id: { eq: queriedBrickId } },
      }),
  });
  const placementQuery = useLiveQuery({
    session,
    key: { brickId, breakpoint },
    query: (db, { brickId: queriedBrickId, breakpoint: queriedBreakpoint }) =>
      db.query.placement.findFirst({
        where: {
          brickId: { eq: queriedBrickId ?? "brk_missing" },
          breakpoint: { eq: queriedBreakpoint },
        },
      }),
  });
  const brickRow = brickQuery.data;
  if (
    acceptedState !== null &&
    brickRow !== undefined &&
    JSON.stringify(brickRow.state) === JSON.stringify(acceptedState.state)
  ) {
    setAcceptedState(null);
  }

  if (brickRow === undefined) {
    notFound();
  }

  const placement = placementQuery.data;
  if (placement === undefined) {
    notFound();
  }

  const brickModule = modulesHash[brickRow.moduleId];
  if (brickRow.moduleId === "github-profile") {
    return (
      <>
        {measurementHost}
        <GitHubProfileForm
          state={acceptedState?.state ?? brickRow.state}
          onSave={async (state) => {
            await updateBrick(state);
            setAcceptedState({ state });
          }}
        />
      </>
    );
  }

  if (brickRow.moduleId === "github-repo") {
    return (
      <>
        {measurementHost}
        <GitHubRepoForm
          state={acceptedState?.state ?? brickRow.state}
          onSave={async (state) => {
            await updateBrick(state);
            setAcceptedState({ state });
          }}
        />
      </>
    );
  }
  if (brickRow.moduleId === "github-activity") {
    return (
      <>
        {measurementHost}
        <GitHubActivityForm
          state={acceptedState?.state ?? brickRow.state}
          onSave={async (state) => {
            await updateBrick(state);
            setAcceptedState({ state });
          }}
        />
      </>
    );
  }

  if (brickRow.moduleId === "figma-thumbnail") {
    return (
      <>
        {measurementHost}
        <FigmaThumbnailForm
          state={acceptedState?.state ?? brickRow.state}
          onSave={async (state) => {
            await updateBrick(state);
            setAcceptedState({ state });
          }}
        />
      </>
    );
  }

  if (brickRow.moduleId === "instagram") {
    return (
      <>
        {measurementHost}
        <InstagramForm
          state={acceptedState?.state ?? brickRow.state}
          onSave={async (state) => {
            await updateBrick(state);
            setAcceptedState({ state });
          }}
        />
      </>
    );
  }

  const committedState = acceptedState?.state ?? brickRow.state;
  const formState = formDraft?.state ?? committedState ?? brickModule.defaultState;
  const formDirty = JSON.stringify(formState) !== JSON.stringify(committedState);
  const Form = brickModule.Form;
  if (Form === undefined) return null;

  return (
    <>
      {measurementHost}
      <form
        className="mx-auto w-full max-w-3xl px-6"
        aria-busy={isMutating}
        onSubmit={async (event) => {
          event.preventDefault();
          if (!formDirty || isMutating) return;
          try {
            await updateBrick(formState);
            setAcceptedState({ state: formState });
            setFormDraft(null);
            setFormError(null);
          } catch (cause) {
            setFormError(cause instanceof Error ? cause.message : String(cause));
          }
        }}
      >
        <div className="flex flex-col gap-6" inert={isMutating}>
          <Form
            key={editorEpoch}
            state={formState}
            onChange={(state) => {
              setFormDraft({ state });
              setFormError(null);
            }}
          />
          {formError !== null ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3" role="alert">
              {formError}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!formDirty || isMutating}>
              {isMutating ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isMutating}
              onClick={() => {
                setFormDraft(null);
                setFormError(null);
                setEditorEpoch((epoch) => epoch + 1);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
