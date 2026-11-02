import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from "react";
import { useSession } from "@zerospin/react";
import { stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import type { IInferModelRow } from "@zerospin/core/models/types";
import type { wallV2 } from "@qrk.sh/zerospin/src/aggregates/user/models/wall/WallV2";
import type { placementV2 } from "@qrk.sh/zerospin/src/aggregates/user/models/placement/PlacementV2";
import type { rowIdSchema } from "@qrk.sh/zerospin/src/aggregates/user/layout/wallLayoutSchema";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";
import { modulesHash } from "../modulesHash";
import type { makeWallLayoutView } from "./makeWallLayoutView";

/** Own one pointer gesture; only its completed visible geometry becomes a command. */
export function useWallResize(props: {
  wallId: IInferModelRow<typeof wallV2>["id"];
  sections: ReturnType<typeof makeWallLayoutView>["sections"];
  brickGap: number;
  wallRef: RefObject<HTMLDivElement | null>;
  disabled: boolean;
}) {
  const { wallId, sections, brickGap, wallRef, disabled } = props;
  const session = useSession(userSessionDefinition);
  const latest = useRef({ wallId, sections, brickGap, disabled });
  const frame = useRef<number | null>(null);
  const lastHeightTap = useRef<{
    rowId: typeof rowIdSchema.Type;
    wallId: typeof wallId;
    pointerType: string;
    time: number;
    x: number;
    y: number;
  } | null>(null);
  const touchReset = useRef<{ rowId: typeof rowIdSchema.Type; until: number } | null>(null);
  const gesture = useRef<{
    kind: "width" | "height";
    wallId: typeof wallId;
    rowId: typeof rowIdSchema.Type;
    brickGap: number;
    signature: string;
    target: HTMLSpanElement;
    line: HTMLElement;
    pointerId: number;
    pointerType: string;
    startX: number;
    startY: number;
    x: number;
    y: number;
    maxDistance: number;
    height: number;
    minimumHeight: number;
    availableWidth: number;
    activated: boolean;
    finishing: boolean;
    leftPlacementId: IInferModelRow<typeof placementV2>["id"] | null;
    rightPlacementId: IInferModelRow<typeof placementV2>["id"] | null;
    placements: {
      placementId: IInferModelRow<typeof placementV2>["id"];
      width: number;
      minWidth: number;
    }[];
    cleanup: () => void;
  } | null>(null);
  const [draft, setDraft] = useState<
    | {
        kind: "width";
        rowId: typeof rowIdSchema.Type;
        placements: {
          placementId: IInferModelRow<typeof placementV2>["id"];
          widthWeight: number;
        }[];
      }
    | { kind: "height"; rowId: typeof rowIdSchema.Type; minHeight: number }
    | null
  >(null);

  const findRow = (rowId: typeof rowIdSchema.Type) =>
    latest.current.sections
      .flatMap((section) => section.stacks)
      .flatMap((stack) => stack.rows)
      .find((row) => row.id === rowId);
  const sizingSignature = (row: NonNullable<ReturnType<typeof findRow>>) =>
    JSON.stringify({
      minHeight: row.minHeight,
      placements: row.placements.map((placement) => ({
        id: placement.id,
        moduleId: placement.brick.moduleId,
        variantId: placement.variantId,
        widthWeight: placement.widthWeight,
      })),
    });

  const clearGesture = useCallback(() => {
    const current = gesture.current;
    gesture.current = null;
    lastHeightTap.current = null;
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    current?.cleanup();
    if (current?.target.hasPointerCapture(current.pointerId))
      current.target.releasePointerCapture(current.pointerId);
    setDraft(null);
  }, []);

  const updatePreview = (current: NonNullable<typeof gesture.current>) => {
    if (current.kind === "height") {
      setDraft({
        kind: "height",
        rowId: current.rowId,
        minHeight: Math.max(current.minimumHeight, current.height + current.y - current.startY),
      });
      return;
    }
    const left = current.placements.find((entry) => entry.placementId === current.leftPlacementId);
    const right = current.placements.find(
      (entry) => entry.placementId === current.rightPlacementId,
    );
    if (!left || !right) throw new Error("Missing captured resize neighbors");
    const delta = Math.max(
      left.minWidth - left.width,
      Math.min(right.width - right.minWidth, current.x - current.startX),
    );
    setDraft({
      kind: "width",
      rowId: current.rowId,
      placements: current.placements.map((entry) => ({
        placementId: entry.placementId,
        widthWeight: entry.width + (entry === left ? delta : entry === right ? -delta : 0),
      })),
    });
  };

  useLayoutEffect(() => {
    latest.current = { wallId, sections, brickGap, disabled };
    const current = gesture.current;
    if (current === null) return;
    const row = findRow(current.rowId);
    if (
      disabled ||
      wallId !== current.wallId ||
      brickGap !== current.brickGap ||
      row === undefined ||
      sizingSignature(row) !== current.signature ||
      !current.target.isConnected ||
      Math.abs(current.line.getBoundingClientRect().width - current.availableWidth) > 0.5
    ) {
      clearGesture();
      return;
    }
    if (!current.finishing || draft === null) return;

    // The final preview has rendered. Measure its visible result before handing back to the live query.
    if (current.kind === "height") {
      const surface = current.line.querySelector<HTMLElement>(".brick-hover-surface");
      const height =
        surface?.getBoundingClientRect().height ??
        current.line.getBoundingClientRect().height - brickGap - 1;
      clearGesture();
      if (Math.abs(height - current.height) <= 0.5) return;
      stageAggregateSessionCommand({
        session,
        contractName: "setRowMinHeight",
        payload: { wallId, rowId: current.rowId, minHeight: height },
      });
      return;
    }
    if (draft.kind !== "width") throw new Error("Missing final width preview");
    const changed = draft.placements.some(
      (entry, index) => Math.abs(entry.widthWeight - current.placements[index].width) > 0.5,
    );
    clearGesture();
    if (changed)
      stageAggregateSessionCommand({
        session,
        contractName: "setRowWidthWeights",
        payload: { wallId, rowId: current.rowId, placements: draft.placements },
      });
  });

  useEffect(() => clearGesture, [clearGesture]);

  const resetHeight = (props: { rowId: typeof rowIdSchema.Type }) => {
    const { rowId } = props;
    if (touchReset.current?.rowId === rowId && performance.now() < touchReset.current.until) return;
    if (latest.current.disabled) return;
    const row = findRow(rowId);
    clearGesture();
    if (row === undefined || row.minHeight === null) return;
    stageAggregateSessionCommand({
      session,
      contractName: "setRowMinHeight",
      payload: { wallId: latest.current.wallId, rowId, minHeight: null },
    });
  };

  const start = (props: {
    event: PointerEvent<HTMLSpanElement>;
    rowId: typeof rowIdSchema.Type;
    kind: "width" | "height";
    leftPlacementId: IInferModelRow<typeof placementV2>["id"] | null;
    rightPlacementId: IInferModelRow<typeof placementV2>["id"] | null;
  }) => {
    const { event, rowId, kind, leftPlacementId, rightPlacementId } = props;
    if (
      latest.current.disabled ||
      gesture.current !== null ||
      event.button !== 0 ||
      !event.isPrimary
    )
      return;
    const root = wallRef.current;
    const row = findRow(rowId);
    const target = event.currentTarget;
    if (root === null || row === undefined || !target.isConnected || !root.contains(target)) return;
    const rowElement = root.querySelector<HTMLElement>(`[data-wall-row-id="${CSS.escape(rowId)}"]`);
    const line = rowElement?.querySelector<HTMLElement>("[data-wall-row-content]");
    if (!line) throw new Error("Missing resize Row geometry");
    if (kind === "width") {
      const index = row.placements.findIndex((entry) => entry.id === leftPlacementId);
      if (index < 0 || row.placements[index + 1]?.id !== rightPlacementId) return;
    }
    const placements = row.placements.map((placement) => {
      const surface = line.querySelector<HTMLElement>(
        `[data-wall-placement-id="${CSS.escape(placement.id)}"] .brick-hover-surface`,
      );
      if (surface === null) throw new Error("Missing resize Placement surface");
      return {
        placementId: placement.id,
        width: surface.getBoundingClientRect().width,
        minWidth: modulesHash[placement.brick.moduleId].variants[placement.variantId].minWidth,
      };
    });
    const surface = line.querySelector<HTMLElement>(".brick-hover-surface");
    const current: NonNullable<(typeof gesture)["current"]> = {
      kind,
      wallId: latest.current.wallId,
      rowId,
      brickGap: latest.current.brickGap,
      signature: sizingSignature(row),
      target,
      line,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      maxDistance: 0,
      height:
        surface?.getBoundingClientRect().height ??
        line.getBoundingClientRect().height - latest.current.brickGap - 1,
      minimumHeight: Math.max(
        45,
        ...row.placements.map(
          (placement) =>
            modulesHash[placement.brick.moduleId].variants[placement.variantId].minHeight ?? 45,
        ),
      ),
      availableWidth: line.getBoundingClientRect().width,
      activated: false,
      finishing: false,
      leftPlacementId,
      rightPlacementId,
      placements,
      cleanup: () => {},
    };
    const move = (event: globalThis.PointerEvent) => {
      if (gesture.current !== current || event.pointerId !== current.pointerId || current.finishing)
        return;
      current.x = event.clientX;
      current.y = event.clientY;
      current.maxDistance = Math.max(
        current.maxDistance,
        Math.hypot(current.x - current.startX, current.y - current.startY),
      );
      const distance =
        current.kind === "width" ? current.x - current.startX : current.y - current.startY;
      if (!current.activated && Math.abs(distance) < 3) return;
      current.activated = true;
      lastHeightTap.current = null;
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        if (gesture.current === current && !current.finishing) updatePreview(current);
      });
    };
    const finish = (event: globalThis.PointerEvent) => {
      if (gesture.current !== current || event.pointerId !== current.pointerId || current.finishing)
        return;
      move(event);
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
      if (!current.activated) {
        const previous = lastHeightTap.current;
        clearGesture();
        if (
          kind !== "height" ||
          current.maxDistance >= 3 ||
          (current.pointerType !== "touch" && current.pointerType !== "pen")
        )
          return;
        const time = performance.now();
        if (
          previous !== null &&
          previous.rowId === rowId &&
          previous.wallId === current.wallId &&
          previous.pointerType === current.pointerType &&
          time - previous.time <= 350 &&
          Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= 24
        ) {
          touchReset.current = { rowId, until: time + 800 };
          const latestRow = findRow(rowId);
          if (latestRow !== undefined && latestRow.minHeight !== null)
            stageAggregateSessionCommand({
              session,
              contractName: "setRowMinHeight",
              payload: { wallId: current.wallId, rowId, minHeight: null },
            });
        } else
          lastHeightTap.current = {
            rowId,
            wallId: current.wallId,
            pointerType: current.pointerType,
            time,
            x: event.clientX,
            y: event.clientY,
          };
        return;
      }
      current.finishing = true;
      updatePreview(current);
    };
    const canceled = (event: globalThis.PointerEvent) => {
      if (
        gesture.current === current &&
        event.pointerId === current.pointerId &&
        !current.finishing
      )
        clearGesture();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || gesture.current !== current) return;
      event.preventDefault();
      event.stopPropagation();
      clearGesture();
    };
    const blur = () => clearGesture();
    const resized = new ResizeObserver(() => {
      if (
        gesture.current === current &&
        Math.abs(line.getBoundingClientRect().width - current.availableWidth) > 0.5
      )
        clearGesture();
    });
    current.cleanup = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", finish);
      target.removeEventListener("pointercancel", canceled);
      target.removeEventListener("lostpointercapture", canceled);
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("blur", blur);
      resized.disconnect();
    };
    gesture.current = current;
    event.preventDefault();
    event.stopPropagation();
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", finish);
    target.addEventListener("pointercancel", canceled);
    target.addEventListener("lostpointercapture", canceled);
    window.addEventListener("keydown", keydown, true);
    window.addEventListener("blur", blur);
    resized.observe(line);
    try {
      target.setPointerCapture(event.pointerId);
    } catch (error) {
      clearGesture();
      throw error;
    }
  };

  const startWidthResize = (props: {
    event: PointerEvent<HTMLSpanElement>;
    rowId: typeof rowIdSchema.Type;
    leftPlacementId: IInferModelRow<typeof placementV2>["id"];
    rightPlacementId: IInferModelRow<typeof placementV2>["id"];
  }) => {
    const { event, rowId, leftPlacementId, rightPlacementId } = props;
    start({ event, rowId, kind: "width", leftPlacementId, rightPlacementId });
  };
  const startHeightResize = (props: {
    event: PointerEvent<HTMLSpanElement>;
    rowId: typeof rowIdSchema.Type;
  }) => {
    const { event, rowId } = props;
    start({ event, rowId, kind: "height", leftPlacementId: null, rightPlacementId: null });
  };

  // Invalidate before rendering an overlay against a new Row membership; effects perform cleanup.
  const current = gesture.current;
  const renderedRow =
    draft === null
      ? undefined
      : sections
          .flatMap((section) => section.stacks)
          .flatMap((stack) => stack.rows)
          .find((row) => row.id === draft.rowId);
  const preview =
    draft !== null &&
    current !== null &&
    !disabled &&
    wallId === current.wallId &&
    brickGap === current.brickGap &&
    renderedRow !== undefined &&
    sizingSignature(renderedRow) === current.signature
      ? draft
      : null;
  return { preview, startWidthResize, startHeightResize, resetHeight };
}
