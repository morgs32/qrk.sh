"use client";

import type { Spec } from "@json-render/core";
import { isNonEmptySpec } from "@json-render/core";
import type { InferCommandPayload } from "@zerospin/core/models/types";
import { stageCommand } from "@zerospin/react";
import { makeEffectSchema } from "@zerospin/shapes";
import { Schema } from "effect";
import { catchError, type ErrorInfo } from "next/error";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import useSWRMutation from "swr/mutation";

import { MeasuredBrickWrapper } from "../components/brick/MeasuredBrickWrapper";
import { libraryModule } from "../libraryModule/libraryModule";
import { useLibrarySession } from "../session/createLibraryStandaloneSession";
import { BREAKPOINTS } from "./breakpoints";
import { modulesHash } from "./modulesHash";

const MeasurementBoundary = catchError(function MeasurementFailure(
  props: { onError: (cause: unknown) => void },
  errorInfo: ErrorInfo,
) {
  const { onError } = props;
  const { error } = errorInfo;
  useEffect(() => onError(error), [error, onError]);
  return null;
});

export function useUpdateBrick(props: { brickId: `brk_${string}` }) {
  const { brickId } = props;
  const session = useLibrarySession();
  const mounted = useRef(false);
  const activeBrickId = useRef<`brk_${string}` | null>(null);
  const cancelMeasurement = useRef<(() => void) | null>(null);
  const requestId = useRef(0);
  const [request, setRequest] = useState<{
    id: number;
    moduleId: keyof typeof modulesHash;
    state: unknown;
    placements: Array<{ breakpoint: (typeof BREAKPOINTS)[number]["id"]; spec: Spec }>;
    onChange: (
      breakpoint: (typeof BREAKPOINTS)[number]["id"],
      dimensions: { widthPx: number; heightPx: number },
    ) => void;
    onError: (cause: unknown) => void;
    onMounted: () => void;
  } | null>(null);

  useLayoutEffect(() => {
    mounted.current = true;
    activeBrickId.current = brickId;
    return () => {
      mounted.current = false;
      activeBrickId.current = null;
      cancelMeasurement.current?.();
      cancelMeasurement.current = null;
    };
  }, [brickId]);

  const { trigger, isMutating } = useSWRMutation(
    ["updateBrick", brickId],
    async (_key, options: { arg: unknown }) => {
      const { arg } = options;
      if (!mounted.current || activeBrickId.current !== brickId) {
        throw new Error("Brick editor is closed");
      }
      if (cancelMeasurement.current !== null) throw new Error("A brick save is already pending");

      // 1. Snapshot the actual placements before rendering the proposed state.
      const sessionState = session.store.getState();
      if (!sessionState.isInitialized) throw new Error("Library session is not ready");
      const brick = sessionState.db.query.brick
        .findFirst({ where: { id: { eq: brickId } } })
        .sync();
      if (brick === undefined) throw new Error("Brick was deleted before saving");
      const placements = sessionState.db.query.placement
        .findMany({ where: { brickId: { eq: brickId } } })
        .sync();
      if (placements.length !== BREAKPOINTS.length) {
        throw new Error("Brick is missing breakpoint placements");
      }
      const brickModule = modulesHash[brick.moduleId];
      let state = arg;
      let measurements: InferCommandPayload<
        typeof libraryModule.contracts.updateBrick.payload
      >["measurements"] = null;

      if (brickModule.measureOnSave) {
        const StateSchema = Schema.toType(makeEffectSchema(brickModule.stateShape));
        state = Schema.decodeUnknownSync(
          brickModule.hasPlaceholder ? Schema.NullOr(StateSchema) : StateSchema,
        )(arg, { onExcessProperty: "ignore" });
        const measurementPlacements = BREAKPOINTS.map((entry) => {
          const placement = placements.find((row) => row.breakpoint === entry.id);
          if (placement === undefined) throw new Error(`Missing ${entry.id} placement`);
          const rawSpec = placement.spec;
          const spec =
            isNonEmptySpec(rawSpec) ||
            (state === null &&
              brickModule.placeholder !== undefined &&
              Schema.is(
                Schema.Struct({
                  root: Schema.String,
                  elements: Schema.Record(Schema.String, Schema.Never),
                  state: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
                }),
              )(rawSpec))
              ? rawSpec
              : undefined;
          if (spec === undefined) throw new Error(`Invalid ${entry.id} placement spec`);
          return { breakpoint: entry.id, spec: structuredClone(spec) };
        });

        // 2. Wait for the existing wrapper's rounded, unconstrained measurements.
        try {
          measurements = await new Promise<
            NonNullable<
              InferCommandPayload<
                typeof libraryModule.contracts.updateBrick.payload
              >["measurements"]
            >
          >((resolve, reject) => {
            const measured = new Map<
              (typeof BREAKPOINTS)[number]["id"],
              { widthPx: number; heightPx: number }
            >();
            let settled = false;
            const onError = (cause: unknown) => {
              if (settled) return;
              settled = true;
              reject(
                cause instanceof Error ? cause : new Error("Failed to render brick measurement"),
              );
            };
            cancelMeasurement.current = () =>
              onError(new Error("Brick editor closed before saving"));
            setRequest({
              id: ++requestId.current,
              moduleId: brick.moduleId,
              state,
              placements: measurementPlacements,
              onError,
              onMounted: () => {
                if (!settled) onError(new Error("Failed to measure every breakpoint placement"));
              },
              onChange: (breakpoint, dimensions) => {
                if (settled) return;
                if (
                  !Schema.is(libraryModule.models.placement.attributes.measured.schema)(dimensions)
                ) {
                  onError(new Error(`Invalid ${breakpoint} brick dimensions`));
                  return;
                }
                measured.set(breakpoint, dimensions);
                const sm = measured.get("sm");
                const md = measured.get("md");
                const lg = measured.get("lg");
                const xl = measured.get("xl");
                if (sm && md && lg && xl) {
                  settled = true;
                  resolve({ sm, md, lg, xl });
                }
              },
            });
          });
        } finally {
          cancelMeasurement.current = null;
          if (mounted.current) setRequest(null);
        }
      }

      // 3. Recheck the snapshot and stage without an intervening await.
      if (!mounted.current || activeBrickId.current !== brickId) {
        throw new Error("Brick editor closed before saving");
      }
      const currentSessionState = session.store.getState();
      if (!currentSessionState.isInitialized) throw new Error("Library session is not ready");
      const currentBrick = currentSessionState.db.query.brick
        .findFirst({ where: { id: { eq: brickId } } })
        .sync();
      if (currentBrick === undefined || currentBrick.moduleId !== brick.moduleId) {
        throw new Error("Brick changed before saving");
      }
      const currentPlacements = currentSessionState.db.query.placement
        .findMany({ where: { brickId: { eq: brickId } } })
        .sync();
      if (
        currentPlacements.length !== placements.length ||
        placements.some((placement) => {
          const current = currentPlacements.find((row) => row.id === placement.id);
          return (
            current === undefined ||
            current.breakpoint !== placement.breakpoint ||
            JSON.stringify(current.spec) !== JSON.stringify(placement.spec)
          );
        })
      ) {
        throw new Error("Placement specs changed during Save; save again");
      }
      const result = stageCommand({
        session,
        contractName: "updateBrick",
        payload: { brickId, moduleId: brick.moduleId, state, measurements },
      });
      if (result._tag === "Failure") {
        throw new Error(result.failure.message ?? result.failure.code ?? "Failed to save brick");
      }
    },
    { revalidate: false },
  );

  const BrickComponent = request === null ? null : modulesHash[request.moduleId].component;
  const measurementHost =
    request === null || BrickComponent === null ? null : (
      <div
        aria-hidden
        className="pointer-events-none absolute overflow-hidden"
        style={{ width: 0, height: 0 }}
        ref={(element) => {
          if (element !== null) request.onMounted();
        }}
      >
        <MeasurementBoundary key={request.id} onError={request.onError}>
          {request.placements.map((placement) => (
            <MeasuredBrickWrapper
              key={placement.breakpoint}
              onChange={(dimensions) => request.onChange(placement.breakpoint, dimensions)}
            >
              <BrickComponent
                breakpoint={placement.breakpoint}
                state={request.state}
                spec={placement.spec}
              />
            </MeasuredBrickWrapper>
          ))}
        </MeasurementBoundary>
      </div>
    );

  return {
    updateBrick: async (state: unknown): Promise<void> => {
      if (!mounted.current || activeBrickId.current !== brickId) {
        throw new Error("Brick editor is closed");
      }
      await trigger(state);
    },
    measurementHost,
    isMutating,
  };
}
