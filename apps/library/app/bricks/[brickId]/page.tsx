"use client";

import { useState } from "react";
import { notFound, useParams } from "next/navigation";
import { makeModelIdSchema } from "@zerospin/core/models/make/makeModelIdSchema";
import { Result, Schema } from "effect";
import { stageCommand, useLiveQuery } from "@zerospin/react";

import { libraryModule } from "../../../libraryModule/libraryModule";
import { Button } from "../../../components/ui/button";
import { modulesHash } from "../../../lib/modulesHash";
import { useWallViewport } from "../../../lib/WallViewportProvider";
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
      <GitHubProfileForm
        state={acceptedState?.state ?? brickRow.state}
        onSave={(state) => {
          const result = stageCommand({
            session,
            contractName: "updateBrickState",
            payload: {
              brickId: brickRow.id,
              moduleId: brickRow.moduleId,
              state,
            },
          });
          if (result._tag === "Failure") {
            throw new Error(
              result.failure.message ?? result.failure.code ?? "Failed to save GitHub Profile",
            );
          }
          setAcceptedState({ state });
        }}
      />
    );
  }

  if (brickRow.moduleId === "github-repo") {
    return (
      <GitHubRepoForm
        state={acceptedState?.state ?? brickRow.state}
        onSave={(state) => {
          const result = stageCommand({
            session,
            contractName: "updateBrickState",
            payload: {
              brickId: brickRow.id,
              moduleId: brickRow.moduleId,
              state,
            },
          });
          if (result._tag === "Failure") {
            throw new Error(
              result.failure.message ?? result.failure.code ?? "Failed to save GitHub Repo",
            );
          }
          setAcceptedState({ state });
        }}
      />
    );
  }
  if (brickRow.moduleId === "github-activity") {
    return (
      <GitHubActivityForm
        state={acceptedState?.state ?? brickRow.state}
        onSave={(state) => {
          const result = stageCommand({
            session,
            contractName: "updateBrickState",
            payload: {
              brickId: brickRow.id,
              moduleId: brickRow.moduleId,
              state,
            },
          });
          if (result._tag === "Failure") {
            throw new Error(
              result.failure.message ?? result.failure.code ?? "Failed to save GitHub Activity",
            );
          }
          setAcceptedState({ state });
        }}
      />
    );
  }

  if (brickRow.moduleId === "figma-thumbnail") {
    return (
      <FigmaThumbnailForm
        state={acceptedState?.state ?? brickRow.state}
        onSave={(state) => {
          const result = stageCommand({
            session,
            contractName: "updateBrickState",
            payload: {
              brickId: brickRow.id,
              moduleId: brickRow.moduleId,
              state,
            },
          });
          if (result._tag === "Failure") {
            throw new Error(
              result.failure.message ?? result.failure.code ?? "Failed to save Figma Thumbnail",
            );
          }
          setAcceptedState({ state });
        }}
      />
    );
  }

  if (brickRow.moduleId === "instagram") {
    return (
      <InstagramForm
        state={acceptedState?.state ?? brickRow.state}
        onSave={(state) => {
          const result = stageCommand({
            session,
            contractName: "updateBrickState",
            payload: {
              brickId: brickRow.id,
              moduleId: brickRow.moduleId,
              state,
            },
          });
          if (result._tag === "Failure") {
            throw new Error(
              result.failure.message ?? result.failure.code ?? "Failed to save Instagram",
            );
          }
          setAcceptedState({ state });
        }}
      />
    );
  }

  const committedState = acceptedState?.state ?? brickRow.state;
  const formState = formDraft?.state ?? committedState;
  const formDirty = JSON.stringify(formState) !== JSON.stringify(committedState);
  const Form = brickModule.Form;
  if (Form === undefined) return null;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!formDirty) return;
        try {
          const result = stageCommand({
            session,
            contractName: "updateBrickState",
            payload: {
              brickId: brickRow.id,
              moduleId: brickRow.moduleId,
              state: formState,
            },
          });
          if (result._tag === "Failure") {
            setFormError(result.failure.message ?? result.failure.code ?? "Failed to save Article");
            return;
          }
          setAcceptedState({ state: formState });
          setFormDraft(null);
          setFormError(null);
        } catch (cause) {
          setFormError(cause instanceof Error ? cause.message : String(cause));
        }
      }}
    >
      <div className="flex flex-col gap-3">
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
        <div className="flex gap-2">
          <Button type="submit" disabled={!formDirty}>
            Save article
          </Button>
          <Button
            type="button"
            variant="outline"
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
  );
}
