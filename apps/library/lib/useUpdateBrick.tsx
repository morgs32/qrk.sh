"use client";

import { stageAggregateSessionCommand } from "@zerospin/core/aggregateSession/stageCommand/stageAggregateSessionCommand";

import type { Spec } from "@json-render/core";
import { isNonEmptySpec } from "@json-render/core";
import type { IInferCommandPayload } from "@zerospin/core/models/types";

import { makeEffectSchema } from "@zerospin/shapes";
import { Schema } from "effect";
import { Component, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { MeasuredBrickWrapper } from "../components/brick/MeasuredBrickWrapper";
import { libraryModule } from "../libraryModule/libraryModule";
import { useLibrarySession } from "../session/createLibraryStandaloneSession";
import { BREAKPOINTS } from "./breakpoints";
import { modulesHash } from "./modulesHash";

class MeasurementBoundary extends Component<
  { children: ReactNode; onError: (cause: unknown) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    const { onError } = this.props;
    onError(error);
  }

  render() {
    const { children } = this.props;
    return this.state.failed ? null : children;
  }
}

export function useUpdateBrick(props: { brickId: `brk_${string}` }) {
  const { brickId } = props;
  const session = useLibrarySession();
  const mounted = useRef(false);
  const activeBrickId = useRef<`brk_${string}` | null>(null);
  const cancelMeasurement = useRef<(() => void) | null>(null);
  const requestId = useRef(0);
  const saveGeneration = useRef(0);
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

  function updateBrick(state: unknown) {
    if (!mounted.current || activeBrickId.current !== brickId)
      throw new Error("Brick editor is closed");
    const initialized = session.store.getState().initialized;
    if (initialized === null) throw new Error("Library session is not ready");
    const brick = initialized.db.query.brick.findFirst({ where: { id: { eq: brickId } } }).sync();
    if (brick === undefined) throw new Error("Brick was deleted before saving");
    return stageAggregateSessionCommand({
      session,
      contractName: "updateBrick",
      payload: { brickId, moduleId: brick.moduleId, state, measurements: null },
    });
  }

  async function measureAndUpdateBrick(arg: unknown) {
    const generation = saveGeneration.current;
    if (!mounted.current || activeBrickId.current !== brickId) {
      throw new Error("Brick editor is closed");
    }
    if (cancelMeasurement.current !== null) throw new Error("A brick save is already pending");

    // 1. Snapshot the actual placements before rendering the proposed state.
    const sessionState = session.store.getState();
    if (sessionState.initialized === null) throw new Error("Library session is not ready");
    const brick = sessionState.initialized.db.query.brick
      .findFirst({ where: { id: { eq: brickId } } })
      .sync();
    if (brick === undefined) throw new Error("Brick was deleted before saving");
    const placements = sessionState.initialized.db.query.placement
      .findMany({ where: { brickId: { eq: brickId } } })
      .sync();
    if (placements.length !== BREAKPOINTS.length) {
      throw new Error("Brick is missing breakpoint placements");
    }
    const brickModule = modulesHash[brick.moduleId];
    let state = arg;
    let measurements: IInferCommandPayload<
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
            IInferCommandPayload<typeof libraryModule.contracts.updateBrick.payload>["measurements"]
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
          cancelMeasurement.current = () => onError(new Error("Brick editor closed before saving"));
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
    if (generation !== saveGeneration.current) throw new Error("Brick save was cancelled");
    if (!mounted.current || activeBrickId.current !== brickId) {
      throw new Error("Brick editor closed before saving");
    }
    const currentSessionState = session.store.getState();
    if (currentSessionState.initialized === null) throw new Error("Library session is not ready");
    const currentBrick = currentSessionState.initialized.db.query.brick
      .findFirst({ where: { id: { eq: brickId } } })
      .sync();
    if (
      currentBrick === undefined ||
      currentBrick.moduleId !== brick.moduleId ||
      currentBrick.stateRevision !== brick.stateRevision ||
      JSON.stringify(currentBrick.state) !== JSON.stringify(brick.state)
    ) {
      throw new Error("Brick changed before saving");
    }
    const currentPlacements = currentSessionState.initialized.db.query.placement
      .findMany({ where: { brickId: { eq: brickId } } })
      .sync();
    if (
      currentPlacements.length !== placements.length ||
      placements.some((placement) => {
        const current = currentPlacements.find((row) => row.id === placement.id);
        return (
          current === undefined ||
          current.breakpoint !== placement.breakpoint ||
          current.specRevision !== placement.specRevision ||
          JSON.stringify(current.spec) !== JSON.stringify(placement.spec)
        );
      })
    ) {
      throw new Error("Placement specs changed during Save; save again");
    }
    return stageAggregateSessionCommand({
      session,
      contractName: "updateBrick",
      payload: { brickId, moduleId: brick.moduleId, state, measurements },
    });
  }

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
    updateBrick,
    measureAndUpdateBrick,
    measurementHost,
    isMeasuring: request !== null,
    cancelSave: () => {
      saveGeneration.current += 1;
      cancelMeasurement.current?.();
    },
  };
}
