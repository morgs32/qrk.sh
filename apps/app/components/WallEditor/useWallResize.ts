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
import { toast } from "sonner";
import { allocateStackWidths } from "@qrk.sh/zerospin/src/aggregates/user/layout/wallSizing";
import type { IInferModelRow } from "@zerospin/core/models/types";
import type { wallV3 } from "@qrk.sh/zerospin/src/aggregates/user/models/wall/WallV3";
import type { placementV2 } from "@qrk.sh/zerospin/src/aggregates/user/models/placement/PlacementV2";
import type {
  rowIdSchema,
  sectionIdSchema,
  stackIdSchema,
} from "@qrk.sh/zerospin/src/aggregates/user/layout/wallLayoutSchema";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";
import { modulesHash } from "../../modules/modulesHash";
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
  const stackGesture = useRef<{
    wallId: typeof wallId;
    sectionId: typeof sectionIdSchema.Type;
    weights: number[];
    widths: number[];
    minimums: number[];
    anchorWidth: number;
    anchorWeight: number;
    signature: string;
    brickGap: number;
    section: HTMLElement;
    sectionWidth: number;
    target: HTMLSpanElement;
    pointerId: number;
    startX: number;
    activated: boolean;
    cleanup: () => void;
  } | null>(null);
  const [stackPreview, setStackPreview] = useState<{
    sectionId: typeof sectionIdSchema.Type;
    leftStackId: typeof stackIdSchema.Type;
    rightStackId: typeof stackIdSchema.Type;
    widths: number[];
  } | null>(null);
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
      alignment: row.alignment,
      placements: row.placements.map((placement) => ({
        id: placement.id,
        moduleId: placement.brick.moduleId,
        variantId: placement.variantId,
        widthWeight: placement.widthWeight,
      })),
    });
  const sectionSizingSignature = (section: (typeof sections)[number]) =>
    JSON.stringify(
      section.stacks.map((stack) => ({
        id: stack.id,
        widthWeight: stack.widthWeight,
        rows: stack.rows.map((row) => ({
          id: row.id,
          placements: row.placements.map((placement) => ({
            id: placement.id,
            moduleId: placement.brick.moduleId,
            variantId: placement.variantId,
          })),
        })),
      })),
    );

  const clearGesture = useCallback(() => {
    const current = gesture.current;
    const currentStack = stackGesture.current;
    gesture.current = null;
    stackGesture.current = null;
    lastHeightTap.current = null;
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    current?.cleanup();
    currentStack?.cleanup();
    if (current?.target.hasPointerCapture(current.pointerId))
      current.target.releasePointerCapture(current.pointerId);
    if (currentStack?.target.hasPointerCapture(currentStack.pointerId))
      currentStack.target.releasePointerCapture(currentStack.pointerId);
    setDraft(null);
    setMeasuredReadout(null);
    setStackPreview(null);
  }, []);

  const updatePreview = (current: NonNullable<typeof gesture.current>) => {
    if (current.kind === "height") {
      setDraft({
        kind: "height",
        rowId: current.rowId,
        minHeight: Math.max(current.minimumHeight, current.height + (current.y - current.startY)),
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
        surface === null
          ? current.line.getBoundingClientRect().height - current.brickGap - 1
          : surface.getBoundingClientRect().height;
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
    const currentStack = stackGesture.current;
    if (currentStack !== null) {
      const section = sections.find((entry) => entry.id === currentStack.sectionId);
      if (
        disabled ||
        wallId !== currentStack.wallId ||
        brickGap !== currentStack.brickGap ||
        section === undefined ||
        sectionSizingSignature(section) !== currentStack.signature ||
        !currentStack.target.isConnected ||
        Math.abs(currentStack.section.getBoundingClientRect().width - currentStack.sectionWidth) >
          0.5
      )
        clearGesture();
      return;
    }
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
        surface === null
          ? current.line.getBoundingClientRect().height - brickGap - 1
          : surface.getBoundingClientRect().height;
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
      stackGesture.current !== null ||
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
        surface === null
          ? line.getBoundingClientRect().height - latest.current.brickGap - 1
          : surface.getBoundingClientRect().height,
      minimumHeight: Math.max(
        45,
        ...row.placements.map(
          (placement) =>
            modulesHash[placement.brick.moduleId].variants[placement.variantId].minHeight ?? 45,
        ),
      ),
      availableWidth: line.getBoundingClientRect().width,
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
      if (gesture.current !== current) return;
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
  const startStackWidthResize = (props: {
    event: PointerEvent<HTMLSpanElement>;
    sectionId: typeof sectionIdSchema.Type;
    leftStackId: typeof stackIdSchema.Type;
    rightStackId: typeof stackIdSchema.Type;
    widths: number[];
    minimums: number[];
  }) => {
    const { event, sectionId, leftStackId, rightStackId, widths, minimums } = props;
    if (
      latest.current.disabled ||
      gesture.current !== null ||
      stackGesture.current !== null ||
      event.button !== 0 ||
      !event.isPrimary
    )
      return;
    const section = latest.current.sections.find((entry) => entry.id === sectionId);
    const target = event.currentTarget;
    const sectionElement = target.closest<HTMLElement>("[data-wall-section-id]");
    const leftIndex = section?.stacks.findIndex((entry) => entry.id === leftStackId) ?? -1;
    if (
      section === undefined ||
      sectionElement === null ||
      wallRef.current === null ||
      !wallRef.current.contains(target) ||
      leftIndex < 0 ||
      section.stacks[leftIndex + 1]?.id !== rightStackId ||
      widths.length !== section.stacks.length ||
      minimums.length !== widths.length
    )
      return;
    const weights = section.stacks.map((stack) => stack.widthWeight);
    const freeIndex = widths.findIndex((width, index) => width > minimums[index] + 0.001);
    if (freeIndex < 0) return;
    const current: NonNullable<(typeof stackGesture)["current"]> = {
      wallId: latest.current.wallId,
      sectionId,
      weights,
      widths: [...widths],
      minimums: [...minimums],
      anchorWidth: widths[freeIndex],
      anchorWeight: weights[freeIndex],
      signature: sectionSizingSignature(section),
      brickGap: latest.current.brickGap,
      section: sectionElement,
      sectionWidth: sectionElement.getBoundingClientRect().width,
      target,
      pointerId: event.pointerId,
      startX: event.clientX,
      activated: false,
      cleanup: () => {},
    };
    let latestX = current.startX;
    const move = (pointer: globalThis.PointerEvent) => {
      if (stackGesture.current !== current || pointer.pointerId !== current.pointerId) return;
      latestX = pointer.clientX;
      const movement = latestX - current.startX;
      if (!current.activated && Math.abs(movement) < 3) return;
      current.activated = true;
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        if (stackGesture.current !== current) return;
        const delta = Math.max(
          current.minimums[leftIndex] - current.widths[leftIndex],
          Math.min(
            current.widths[leftIndex + 1] - current.minimums[leftIndex + 1],
            latestX - current.startX,
          ),
        );
        const nextWidths = [...current.widths];
        nextWidths[leftIndex] += delta;
        nextWidths[leftIndex + 1] -= delta;
        setStackPreview({ sectionId, leftStackId, rightStackId, widths: nextWidths });
      });
    };
    const finish = (pointer: globalThis.PointerEvent) => {
      if (stackGesture.current !== current || pointer.pointerId !== current.pointerId) return;
      const movement = pointer.clientX - current.startX;
      const delta = Math.max(
        current.minimums[leftIndex] - current.widths[leftIndex],
        Math.min(current.widths[leftIndex + 1] - current.minimums[leftIndex + 1], movement),
      );
      if ((!current.activated && Math.abs(movement) < 3) || Math.abs(delta) <= 0.5) {
        clearGesture();
        return;
      }
      const leftWidth = current.widths[leftIndex] + delta;
      const rightWidth = current.widths[leftIndex + 1] - delta;
      const targetLeftWeight = current.anchorWeight * (leftWidth / current.anchorWidth);
      const targetRightWeight = current.anchorWeight * (rightWidth / current.anchorWidth);
      const leftWeight =
        leftWidth <= current.minimums[leftIndex] + 0.001 &&
        current.weights[leftIndex] <= targetLeftWeight
          ? current.weights[leftIndex]
          : targetLeftWeight;
      const rightWeight =
        rightWidth <= current.minimums[leftIndex + 1] + 0.001 &&
        current.weights[leftIndex + 1] <= targetRightWeight
          ? current.weights[leftIndex + 1]
          : targetRightWeight;
      const nextWeights = [...current.weights];
      nextWeights[leftIndex] = leftWeight;
      nextWeights[leftIndex + 1] = rightWeight;
      const totalWeight = nextWeights.reduce((sum, weight) => sum + weight, 0);
      const validWeights = nextWeights.every((weight) => Number.isFinite(weight) && weight > 0);
      if (!validWeights || !Number.isFinite(totalWeight)) {
        clearGesture();
        toast.error("Stack width could not be saved.");
        return;
      }
      const availableWidth = Math.max(
        current.widths.reduce((sum, width) => sum + width, 0),
        current.minimums.reduce((sum, width) => sum + width, 0),
      );
      const committedWidths = allocateStackWidths({
        minimumWidths: current.minimums,
        availableWidth,
        weights: nextWeights,
      });
      const targetWidths = [...current.widths];
      targetWidths[leftIndex] = leftWidth;
      targetWidths[leftIndex + 1] = rightWidth;
      if (committedWidths.some((width, index) => Math.abs(width - targetWidths[index]) > 0.5)) {
        clearGesture();
        toast.error("Stack width could not be saved.");
        return;
      }
      clearGesture();
      const result = stageAggregateSessionCommand({
        session,
        contractName: "setStackWidthWeights",
        payload: {
          wallId: current.wallId,
          sectionId,
          leftStackId,
          rightStackId,
          leftWeight,
          rightWeight,
        },
      });
      if (result._tag === "Failure") toast.error("Stack width could not be saved.");
    };
    const canceled = (pointer: globalThis.PointerEvent) => {
      if (stackGesture.current === current && pointer.pointerId === current.pointerId)
        clearGesture();
    };
    const keydown = (keyboard: KeyboardEvent) => {
      if (keyboard.key !== "Escape" || stackGesture.current !== current) return;
      keyboard.preventDefault();
      keyboard.stopPropagation();
      clearGesture();
    };
    const resized = new ResizeObserver(() => {
      if (
        stackGesture.current === current &&
        Math.abs(sectionElement.getBoundingClientRect().width - current.sectionWidth) > 0.5
      )
        clearGesture();
    });
    current.cleanup = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", finish);
      target.removeEventListener("pointercancel", canceled);
      target.removeEventListener("lostpointercapture", canceled);
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("blur", clearGesture);
      resized.disconnect();
    };
    stackGesture.current = current;
    event.preventDefault();
    event.stopPropagation();
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", finish);
    target.addEventListener("pointercancel", canceled);
    target.addEventListener("lostpointercapture", canceled);
    window.addEventListener("keydown", keydown, true);
    window.addEventListener("blur", clearGesture);
    resized.observe(sectionElement);
    try {
      target.setPointerCapture(event.pointerId);
    } catch (error) {
      clearGesture();
      throw error;
    }
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
    stackPreview,
    startStackWidthResize,
    startWidthResize,
    startHeightResize,
    resetHeight,
  };
}
