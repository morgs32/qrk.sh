import { useState } from "react";

import { createFileRoute, notFound } from "@tanstack/react-router";
import { isNonEmptySpec } from "@json-render/core";
import { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { useLiveQuery, useSession } from "@zerospin/react";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";

import { OrderedSection } from "@qrk.sh/web/library/OrderedDoc";

import { LibraryFrontend } from "../../../../aggregates/library/libraryFrontend";
import { membershipModelV1 } from "../../../../aggregates/library/models/membership/membershipModelV1";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { modulesHash } from "../../../../lib/modulesHash";
import { useWallViewport } from "../../../../lib/WallViewportProvider";
import type { LibraryApi } from "../../../../worker/LibraryApi.public";
import type { IScrapeError } from "../../../../worker/types.public";
import { readGridItem } from "../../../readGridItem";

export const Route = createFileRoute("/modules/$moduleId/$brickId")({
  component: BrickDetail,
});

function isMembershipId(value: string): value is `mem_${string}` {
  return value.startsWith(`${membershipModelV1.abbreviation}_`);
}

const stateContractByModuleId = {
  "figma-thumbnail": "updateFigmaThumbnailState",
  "github-activity": "updateGithubActivityState",
  "github-profile": "updateGithubProfileState",
  "github-repo": "updateGithubRepoState",
  image: "updateImageState",
  instagram: "updateInstagramState",
  link: "updateLinkState",
  "map-place": "updateMapPlaceState",
  "swatch-and-icon": "updateSwatchAndIconState",
  text: "updateTextState",
} as const;

const specContractByModuleId = {
  "figma-thumbnail": "updateFigmaThumbnailSpecAtBreakpoint",
  "github-activity": "updateGithubActivitySpecAtBreakpoint",
  "github-profile": "updateGithubProfileSpecAtBreakpoint",
  "github-repo": "updateGithubRepoSpecAtBreakpoint",
  image: "updateImageSpecAtBreakpoint",
  instagram: "updateInstagramSpecAtBreakpoint",
  link: "updateLinkSpecAtBreakpoint",
  "map-place": "updateMapPlaceSpecAtBreakpoint",
  "swatch-and-icon": "updateSwatchAndIconSpecAtBreakpoint",
  text: "updateTextSpecAtBreakpoint",
} as const;

function BrickDetail() {
  const { activeBreakpoint } = useWallViewport();
  const breakpoint = activeBreakpoint ?? "sm";
  const { moduleId, brickId: brickIdParam } = Route.useParams();
  const brickId = isMembershipId(brickIdParam) ? brickIdParam : null;
  const session = useSession(LibraryFrontend);
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [isGeneratingSpec, setIsGeneratingSpec] = useState(false);
  const [generateError, setGenerateError] = useState<IScrapeError>();
  const [generateRequestError, setGenerateRequestError] = useState<string>();
  const [commandError, setCommandError] = useState<string | null>(null);
  const [stateDraft, setStateDraft] = useState<string | null>(null);

  const membershipQuery = useLiveQuery(LibraryFrontend, {
    deps: [brickId],
    query: db =>
      db.query.membership.findFirst({
        where: { id: { eq: brickId ?? "mem_missing" } },
      }),
  });
  const placementQuery = useLiveQuery(LibraryFrontend, {
    deps: [brickId, breakpoint],
    query: db =>
      db.query.placement.findFirst({
        where: {
          membershipId: { eq: brickId ?? "mem_missing" },
          breakpoint: { eq: breakpoint },
        },
      }),
  });
  const placementsQuery = useLiveQuery(LibraryFrontend, {
    deps: [breakpoint],
    query: db =>
      db.query.placement.findMany({
        where: { breakpoint: { eq: breakpoint } },
      }),
  });
  const figmaThumbnailsQuery = useLiveQuery(LibraryFrontend, {
    query: db => db.query.figmaThumbnail.findMany(),
  });
  const githubActivitiesQuery = useLiveQuery(LibraryFrontend, {
    query: db => db.query.githubActivity.findMany(),
  });
  const githubProfilesQuery = useLiveQuery(LibraryFrontend, {
    query: db => db.query.githubProfile.findMany(),
  });
  const githubReposQuery = useLiveQuery(LibraryFrontend, {
    query: db => db.query.githubRepo.findMany(),
  });
  const imagesQuery = useLiveQuery(LibraryFrontend, {
    query: db => db.query.image.findMany(),
  });
  const instagramsQuery = useLiveQuery(LibraryFrontend, {
    query: db => db.query.instagram.findMany(),
  });
  const linksQuery = useLiveQuery(LibraryFrontend, {
    query: db => db.query.link.findMany(),
  });
  const mapPlacesQuery = useLiveQuery(LibraryFrontend, {
    query: db => db.query.mapPlace.findMany(),
  });
  const swatchAndIconsQuery = useLiveQuery(LibraryFrontend, {
    query: db => db.query.swatchAndIcon.findMany(),
  });
  const textsQuery = useLiveQuery(LibraryFrontend, {
    query: db => db.query.text.findMany(),
  });

  const membership = membershipQuery.data;
  if (
    brickId === null ||
    membership === undefined ||
    membership.moduleId !== moduleId
  ) {
    throw notFound();
  }

  const placement = placementQuery.data;
  if (placement === undefined) {
    throw notFound();
  }

  const brickModule = modulesHash[moduleId];
  if (brickModule === undefined) {
    throw notFound();
  }

  const moduleRow =
    membership.moduleId === "figma-thumbnail"
      ? figmaThumbnailsQuery.data?.find(
          row => row.id === membership.moduleResourceId,
        )
      : membership.moduleId === "github-activity"
        ? githubActivitiesQuery.data?.find(
            row => row.id === membership.moduleResourceId,
          )
        : membership.moduleId === "github-profile"
          ? githubProfilesQuery.data?.find(
              row => row.id === membership.moduleResourceId,
            )
          : membership.moduleId === "github-repo"
            ? githubReposQuery.data?.find(
                row => row.id === membership.moduleResourceId,
              )
            : membership.moduleId === "image"
              ? imagesQuery.data?.find(
                  row => row.id === membership.moduleResourceId,
                )
              : membership.moduleId === "instagram"
                ? instagramsQuery.data?.find(
                    row => row.id === membership.moduleResourceId,
                  )
                : membership.moduleId === "link"
                  ? linksQuery.data?.find(
                      row => row.id === membership.moduleResourceId,
                    )
                  : membership.moduleId === "map-place"
                    ? mapPlacesQuery.data?.find(
                        row => row.id === membership.moduleResourceId,
                      )
                    : membership.moduleId === "swatch-and-icon"
                      ? swatchAndIconsQuery.data?.find(
                          row => row.id === membership.moduleResourceId,
                        )
                      : textsQuery.data?.find(
                          row => row.id === membership.moduleResourceId,
                        );

  if (moduleRow === undefined) {
    throw notFound();
  }

  const brickState = moduleRow.state;
  const committedStateJson = JSON.stringify(brickState, null, 2);
  const stateEditorValue = stateDraft ?? committedStateJson;
  const hasJsonRender =
    brickModule.catalog !== undefined && brickModule.registry !== undefined;
  const rawSpec: unknown =
    typeof placement.spec === "string"
      ? JSON.parse(placement.spec)
      : placement.spec;
  if (!isNonEmptySpec(rawSpec)) {
    throw notFound();
  }
  const placementSpec = rawSpec;
  const savedGridItem = readGridItem(placement.gridItem);

  return (
    <>
      {commandError !== null ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4" role="alert">
          {commandError}
        </div>
      ) : null}
      {hasJsonRender ? (
        <OrderedSection data-testid="brick-detail-pane" label="Generate spec">
          <form
            className="flex flex-col items-start gap-2 py-5"
            onSubmit={event => {
              event.preventDefault();
              void (async () => {
                const targetMembershipId = membership.id;
                const targetBreakpoint = breakpoint;
                const targetModuleId = membership.moduleId;
                setIsGeneratingSpec(true);
                setGenerateError(undefined);
                setGenerateRequestError(undefined);
                setCommandError(null);
                try {
                  using api = newSyncRpcSession<LibraryApi>("/rpc");
                  const result = await api.generateSpec(
                    moduleId,
                    generatePrompt,
                    brickState,
                    placementSpec,
                  );
                  if (result._tag === "Left") {
                    setGenerateError(result.left);
                    return;
                  }
                  const specContractName = specContractByModuleId[targetModuleId];
                  const commandResult = session.executeCommand({
                    contractName: specContractName,
                    payload: {
                      membershipId: targetMembershipId,
                      breakpoint: targetBreakpoint,
                      spec: result.right,
                    },
                  });
                  if (commandResult._tag === "Failure") {
                    setCommandError(
                      commandResult.failure.message ??
                        commandResult.failure.code ??
                        "Failed to save generated spec",
                    );
                    return;
                  }
                } catch (cause) {
                  setGenerateRequestError(
                    cause instanceof Error ? cause.message : String(cause),
                  );
                } finally {
                  setIsGeneratingSpec(false);
                }
              })();
            }}
          >
            <label className="block font-medium" htmlFor="generate-spec-prompt">
              Prompt
            </label>
            <Input
              id="generate-spec-prompt"
              name="prompt"
              onChange={event => {
                setGeneratePrompt(event.target.value);
              }}
              type="text"
              value={generatePrompt}
            />
            <Button disabled={isGeneratingSpec} type="submit">
              Generate
            </Button>
          </form>
          {isGeneratingSpec ? <p role="status">Generating spec…</p> : null}
          {generateError !== undefined ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-4" role="alert">
              <p className="m-0 font-mono">{generateError.code}</p>
              <p className="mb-0 mt-2">{generateError.message}</p>
            </div>
          ) : null}
          {generateRequestError !== undefined ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-4" role="alert">
              {generateRequestError}
            </div>
          ) : null}
        </OrderedSection>
      ) : null}
      <OrderedSection className={hasJsonRender ? "mt-10" : undefined} label="Options">
        <div className="flex flex-wrap gap-2 py-4">
          <Button
            type="button"
            aria-pressed={placement.isVisible}
            onClick={() => {
              const otherVisibleLayout = (placementsQuery.data ?? []).flatMap(
                otherPlacement => {
                  if (
                    !otherPlacement.isVisible ||
                    otherPlacement.membershipId === membership.id
                  ) {
                    return [];
                  }
                  return [readGridItem(otherPlacement.gridItem)];
                },
              );
              const result = session.executeCommand({
                contractName: "setBrickVisibilityAtBreakpoint",
                payload: {
                  membershipId: membership.id,
                  breakpoint,
                  isVisible: !placement.isVisible,
                  currentlyVisible: placement.isVisible,
                  savedGridItem,
                  otherVisibleLayout,
                },
              });
              if (result._tag === "Failure") {
                setCommandError(
                  result.failure.message ??
                    result.failure.code ??
                    "Failed to update visibility",
                );
                return;
              }
              setCommandError(null);
            }}
          >
            {placement.isVisible ? "Hide brick" : "Show brick"}
          </Button>
        </div>
      </OrderedSection>
      <OrderedSection className="mt-10" label="Shared state">
        <form
          className="flex flex-col gap-2 py-4"
          onSubmit={event => {
            event.preventDefault();
            let parsed: unknown;
            try {
              parsed = JSON.parse(stateEditorValue);
            } catch (cause) {
              setCommandError(
                cause instanceof Error ? cause.message : "Invalid JSON",
              );
              return;
            }
            const stateContractName = stateContractByModuleId[membership.moduleId];
            const result = session.executeCommand({
              contractName: stateContractName,
              payload: {
                id: membership.moduleResourceId,
                state: parsed,
              },
            });
            if (result._tag === "Failure") {
              setCommandError(
                result.failure.message ??
                  result.failure.code ??
                  "Failed to update state",
              );
              return;
            }
            setCommandError(null);
            setStateDraft(null);
          }}
        >
          <label className="block font-medium" htmlFor="shared-state-editor">
            State JSON
          </label>
          <textarea
            id="shared-state-editor"
            className="min-h-48 w-full rounded border border-border bg-white p-2 font-mono text-sm"
            value={stateEditorValue}
            onChange={event => {
              setStateDraft(event.target.value);
            }}
          />
          <Button type="submit">Save state</Button>
        </form>
      </OrderedSection>
      <OrderedSection className="mt-10" label="Brick Definition">
        <div className="overflow-auto bg-white py-4" data-testid="module-data-result">
          <JsonView
            shouldExpandNode={collapseAllNested}
            data={{
              membership,
              placement,
              state: brickState,
            }}
            style={{ ...defaultStyles, container: "bg-white" }}
          />
        </div>
      </OrderedSection>
    </>
  );
}
