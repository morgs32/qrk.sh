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
import type { wallV3 } from "@qrk.sh/zerospin/src/aggregates/user/models/wall/WallV3";
import type { placementV2 } from "@qrk.sh/zerospin/src/aggregates/user/models/placement/PlacementV2";
import type { rowIdSchema } from "@qrk.sh/zerospin/src/aggregates/user/layout/wallLayoutSchema";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";
import { modulesHash } from "../modulesHash";
import type { makeWallLayoutView } from "./makeWallLayoutView";

/** Own one pointer gesture; only its completed visible geometry becomes a command. */
export function useWallResize(props: {
  wallId: IInferModelRow<typeof wallV3>["id"];
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
    kind: "width" | "height" | "row-width";
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
    contentWidth: number;
    alignment: ReturnType<
      typeof makeWallLayoutView
    >["sections"][number]["stacks"][number]["rows"][number]["alignment"];
    activated: boolean;
    previewCommitted: boolean;
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
    | { kind: "row-width"; rowId: typeof rowIdSchema.Type; preferredWidth: number }
    | null
  >(null);
  const [measuredReadout, setMeasuredReadout] = useState<
    | {
        kind: "width";
        rowId: typeof rowIdSchema.Type;
        leftPlacementId: IInferModelRow<typeof placementV2>["id"];
        rightPlacementId: IInferModelRow<typeof placementV2>["id"];
        leftWidth: number;
        rightWidth: number;
      }
    | { kind: "height"; rowId: typeof rowIdSchema.Type; height: number }
    | { kind: "row-width"; rowId: typeof rowIdSchema.Type; width: number }
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
      preferredWidth: row.preferredWidth,
      alignment: row.alignment,
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
    setMeasuredReadout(null);
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
    if (current.kind === "row-width") {
      const delta = current.x - current.startX;
      const scale = current.alignment === "center" ? 2 : current.alignment === "right" ? -1 : 1;
      setDraft({
        kind: "row-width",
        rowId: current.rowId,
        preferredWidth: Math.max(1, current.contentWidth + delta * scale),
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

  const updateReadout = (current: NonNullable<typeof gesture.current>) => {
    if (
      gesture.current !== current ||
      !current.activated ||
      !current.previewCommitted ||
      current.finishing
    )
      return;
    if (current.kind === "height") {
      const surface = current.line.querySelector<HTMLElement>(".brick-hover-surface");
      const height =
        surface?.getBoundingClientRect().height ??
        current.line.getBoundingClientRect().height - current.brickGap - 1;
      setMeasuredReadout((previous) => {
        if (gesture.current !== current || !current.activated || current.finishing) return previous;
        if (
          previous?.kind === "height" &&
          previous.rowId === current.rowId &&
          previous.height === height
        )
          return previous;
        return { kind: "height", rowId: current.rowId, height };
      });
      return;
    }
    if (current.kind === "row-width") {
      const group = current.line.querySelector<HTMLElement>("[data-wall-row-group]");
      if (group === null) throw new Error("Missing Row width readout group");
      const width = group.getBoundingClientRect().width - current.brickGap;
      setMeasuredReadout((previous) =>
        previous?.kind === "row-width" &&
        previous.rowId === current.rowId &&
        previous.width === width
          ? previous
          : { kind: "row-width", rowId: current.rowId, width },
      );
      return;
    }
    const { leftPlacementId, rightPlacementId } = current;
    if (leftPlacementId === null || rightPlacementId === null)
      throw new Error("Missing resize readout neighbors");
    const left = current.line.querySelector<HTMLElement>(
      `[data-wall-placement-id="${CSS.escape(leftPlacementId)}"] .brick-hover-surface`,
    );
    const right = current.line.querySelector<HTMLElement>(
      `[data-wall-placement-id="${CSS.escape(rightPlacementId)}"] .brick-hover-surface`,
    );
    if (left === null || right === null) throw new Error("Missing resize readout surfaces");
    const leftWidth = left.getBoundingClientRect().width;
    const rightWidth = right.getBoundingClientRect().width;
    setMeasuredReadout((previous) => {
      if (gesture.current !== current || !current.activated || current.finishing) return previous;
      if (
        previous?.kind === "width" &&
        previous.rowId === current.rowId &&
        previous.leftPlacementId === leftPlacementId &&
        previous.rightPlacementId === rightPlacementId &&
        previous.leftWidth === leftWidth &&
        previous.rightWidth === rightWidth
      )
        return previous;
      return {
        kind: "width",
        rowId: current.rowId,
        leftPlacementId,
        rightPlacementId,
        leftWidth,
        rightWidth,
      };
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
    if (!current.finishing) {
      if (current.activated && draft !== null) {
        current.previewCommitted = true;
        updateReadout(current);
      }
      return;
    }
    if (draft === null) return;

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
    if (current.kind === "row-width") {
      const group = current.line.querySelector<HTMLElement>("[data-wall-row-group]");
      if (group === null) throw new Error("Missing Row width commit group");
      const preferredWidth = group.getBoundingClientRect().width - brickGap;
      clearGesture();
      if (Math.abs(preferredWidth - current.contentWidth) <= 0.5) return;
      stageAggregateSessionCommand({
        session,
        contractName: "setRowPreferredWidth",
        payload: { wallId, rowId: current.rowId, preferredWidth },
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
    kind: "width" | "height" | "row-width";
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
    const group = line.querySelector<HTMLElement>("[data-wall-row-group]");
    if (kind === "row-width" && (group === null || placements.length === 0)) return;
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
      contentWidth:
        group === null ? 0 : group.getBoundingClientRect().width - latest.current.brickGap,
      alignment: row.alignment,
      activated: false,
      previewCommitted: false,
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
        current.kind === "height" ? current.y - current.startY : current.x - current.startX;
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
      if (gesture.current !== current) return;
      if (Math.abs(line.getBoundingClientRect().width - current.availableWidth) > 0.5) {
        clearGesture();
        return;
      }
      updateReadout(current);
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
  const startRowWidthResize = (props: {
    event: PointerEvent<HTMLSpanElement>;
    rowId: typeof rowIdSchema.Type;
  }) => {
    const { event, rowId } = props;
    start({ event, rowId, kind: "row-width", leftPlacementId: null, rightPlacementId: null });
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
  const readout =
    preview !== null && current?.activated && !current.finishing ? measuredReadout : null;
  return {
    preview,
    readout,
    startWidthResize,
    startRowWidthResize,
    startHeightResize,
    resetHeight,
  };
}
