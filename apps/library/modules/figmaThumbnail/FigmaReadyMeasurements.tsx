"use client";

import { isNonEmptySpec, type Spec } from "@json-render/core";
import { stageAggregateSessionCommand } from "@zerospin/core/aggregateSession/stageCommand/stageAggregateSessionCommand";
import { useLiveQuery } from "@zerospin/react";
import { makeEffectSchema } from "@zerospin/shapes";
import { Schema } from "effect";
import { useRef } from "react";
import { MeasuredBrickWrapper } from "../../components/brick/MeasuredBrickWrapper";
import type { ILibrarySession } from "../../session/createLibraryStandaloneSession";
import { figmaThumbnailV1 } from "./figmaThumbnailV1";
import { figmaThumbnailView } from "./figmaThumbnailView";

/** Real DOM measurement belongs to the ready render, after provider resolution. */
export function FigmaReadyMeasurements(props: { session: ILibrarySession }) {
  const { session } = props;
  const { data: bricks } = useLiveQuery({
    session,
    query: (db) => db.query.brick.findMany({ where: { moduleId: { eq: "figma-thumbnail" } } }),
  });
  const { data: placements } = useLiveQuery({
    session,
    query: (db) => db.query.placement.findMany(),
  });
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute overflow-hidden"
      style={{ width: 0, height: 0 }}
    >
      {bricks.map((brick) => {
        const state = Schema.decodeUnknownResult(
          Schema.toType(makeEffectSchema(figmaThumbnailV1.stateShape)),
        )(brick.state);
        if (
          state._tag === "Failure" ||
          state.success.resolution.status !== "ready" ||
          state.success.data === null
        )
          return null;
        const rows = placements.filter((placement) => placement.brickId === brick.id);
        if (rows.length !== 4 || rows.every((placement) => placement.measured !== null))
          return null;
        const measuredPlacements: Array<{
          breakpoint: "sm" | "md" | "lg" | "xl";
          specRevision: number;
          spec: Spec;
        }> = [];
        for (const row of rows) {
          if (!isNonEmptySpec(row.spec)) return null;
          measuredPlacements.push({
            breakpoint: row.breakpoint,
            specRevision: row.specRevision,
            spec: row.spec,
          });
        }
        return (
          <FigmaBrickMeasurements
            key={`${brick.id}:${brick.stateRevision}:${rows.map((row) => `${row.breakpoint}:${row.specRevision}`).join(":")}`}
            session={session}
            brickId={brick.id}
            state={state.success}
            stateRevision={brick.stateRevision}
            placements={measuredPlacements}
          />
        );
      })}
    </div>
  );
}

function FigmaBrickMeasurements(props: {
  session: ILibrarySession;
  brickId: `brk_${string}`;
  state: unknown;
  stateRevision: number;
  placements: Array<{ breakpoint: "sm" | "md" | "lg" | "xl"; specRevision: number; spec: Spec }>;
}) {
  const { session, brickId, state, stateRevision, placements } = props;
  const measured = useRef(
    new Map<
      "sm" | "md" | "lg" | "xl",
      { specRevision: number; dimensions: { widthPx: number; heightPx: number } }
    >(),
  );
  const completed = useRef(false);
  const Brick = figmaThumbnailView.component;
  return placements.map((placement) => (
    <MeasuredBrickWrapper
      key={placement.breakpoint}
      onChange={(dimensions) => {
        if (
          completed.current ||
          !Schema.is(
            Schema.Struct({
              widthPx: Schema.Int.check(Schema.isGreaterThan(0)),
              heightPx: Schema.Int.check(Schema.isGreaterThan(0)),
            }),
          )(dimensions)
        )
          return;
        measured.current.set(placement.breakpoint, {
          specRevision: placement.specRevision,
          dimensions,
        });
        const sm = measured.current.get("sm");
        const md = measured.current.get("md");
        const lg = measured.current.get("lg");
        const xl = measured.current.get("xl");
        if (sm === undefined || md === undefined || lg === undefined || xl === undefined) return;
        completed.current = true;
        stageAggregateSessionCommand({
          session,
          contractName: "measureFigmaThumbnail",
          payload: { brickId, stateRevision, measurements: { sm, md, lg, xl } },
        });
      }}
    >
      <Brick breakpoint={placement.breakpoint} state={state} spec={placement.spec} />
    </MeasuredBrickWrapper>
  ));
}
