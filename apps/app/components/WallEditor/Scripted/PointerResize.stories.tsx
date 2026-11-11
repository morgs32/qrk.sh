import { prefixId } from "@zerospin/sdk/browser";
import type { StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, spyOn, userEvent, waitFor, within } from "storybook/test";

import { userSessionDefinition } from "@/zerospin/userSessionDefinition";
import { BREAKPOINTS } from "../../../lib/breakpoints";
import wallEditorMeta from "../WallEditor.stories";

const { wall } = userSessionDefinition.models;

const meta = {
  ...wallEditorMeta,
  title: "Studio/WallEditor.tsx/Scripted",
  id: "app-studio-wall-editor",
};

export default meta;

/** Synthetic plays stub capture locally; the separate Native story uses genuine browser capture. */
export const PointerResize: StoryObj<typeof meta> = {
  args: { brickGap: 0, cardStyle: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const document = canvasElement.ownerDocument;
    const window = document.defaultView;
    if (window === null) throw new Error("Missing story window");
    await document.fonts.ready;
    await canvas.findByRole("button", { name: "Read resize journal" }, { timeout: 10000 });
    const captures = new WeakMap<HTMLElement, Set<number>>();
    const setCapture = spyOn(HTMLElement.prototype, "setPointerCapture").mockImplementation(
      function (this: HTMLElement, pointerId: number) {
        const pointers = captures.get(this) ?? new Set<number>();
        pointers.add(pointerId);
        captures.set(this, pointers);
      },
    );
    const hasCapture = spyOn(HTMLElement.prototype, "hasPointerCapture").mockImplementation(
      function (this: HTMLElement, pointerId: number) {
        return captures.get(this)?.has(pointerId) ?? false;
      },
    );
    const releaseCapture = spyOn(HTMLElement.prototype, "releasePointerCapture").mockImplementation(
      function (this: HTMLElement, pointerId: number) {
        captures.get(this)?.delete(pointerId);
      },
    );
    let commandCount = 0;
    try {
      for (const entry of BREAKPOINTS) {
        await userEvent.click(
          canvas.getByRole("button", { name: `${entry.id} preview, ${entry.previewWidth}px` }),
        );
        const wallId = prefixId(wall, `story-${entry.id}`);
        const rowId = prefixId({ abbreviation: "row" }, `story-${entry.id}-0`);
        const row = canvasElement.querySelector<HTMLElement>(`[data-wall-row-id="${rowId}"]`);
        const grip = row?.querySelector<HTMLElement>("[data-wall-width-resize-handle]");
        const heightGrip = row?.querySelector<HTMLElement>("[data-wall-height-resize-handle]");
        if (!row || !grip || !heightGrip) throw new Error("Missing resize fixtures");
        const placements = Array.from(
          row.querySelectorAll<HTMLElement>("[data-wall-placement-id]"),
        );
        const surfaces = placements.map((placement) => {
          const surface = placement.querySelector<HTMLElement>(".brick-hover-surface");
          if (surface === null) throw new Error("Missing resize surface");
          return surface;
        });
        expect(surfaces).toHaveLength(entry.id === "sm" ? 2 : 3);
        const widths = surfaces.map((surface) => surface.getBoundingClientRect().width);
        const x = grip.getBoundingClientRect().x;
        const y = grip.getBoundingClientRect().y + 20;
        const delta = Math.max(0, widths[1] - 160);
        expect(canvasElement.querySelector("[data-wall-resize-readout]")).toBeNull();
        fireEvent.pointerDown(grip, {
          pointerId: 7,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          clientX: x,
          clientY: y,
        });
        expect(canvasElement.querySelector("[data-wall-resize-readout]")).toBeNull();
        fireEvent.pointerMove(grip, {
          pointerId: 7,
          pointerType: "mouse",
          isPrimary: true,
          clientX: x + 13.25,
          clientY: y,
        });
        await waitFor(() => {
          const readout = grip.querySelector<HTMLElement>("[data-wall-resize-readout]");
          if (readout === null) throw new Error("Missing active width readout");
          expect(canvasElement.querySelectorAll("[data-wall-resize-readout]")).toHaveLength(1);
          expect(surfaces[0].getBoundingClientRect().width).toBeCloseTo(
            widths[0] + Math.min(13.25, delta),
            1,
          );
          expect(surfaces[1].getBoundingClientRect().width).toBeCloseTo(
            widths[1] - Math.min(13.25, delta),
            1,
          );
          expect(readout.textContent).toBe(
            `${Math.round(surfaces[0].getBoundingClientRect().width)} px | ${Math.round(surfaces[1].getBoundingClientRect().width)} px`,
          );
          expect(window.getComputedStyle(readout).pointerEvents).toBe("none");
          expect(readout.tabIndex).toBe(-1);
        });
        fireEvent.pointerMove(grip, {
          pointerId: 7,
          pointerType: "mouse",
          isPrimary: true,
          clientX: x + 10000,
          clientY: y,
        });
        await waitFor(() => {
          expect(surfaces[0].getBoundingClientRect().width).toBeCloseTo(widths[0] + delta, 1);
          expect(surfaces[1].getBoundingClientRect().width).toBeCloseTo(160, 1);
          for (let index = 2; index < surfaces.length; index += 1)
            expect(surfaces[index].getBoundingClientRect().width).toBeCloseTo(widths[index], 1);
          expect(canvasElement.querySelectorAll("[data-wall-resize-readout]")).toHaveLength(1);
          expect(grip.querySelector("[data-wall-resize-readout]")?.textContent).toBe(
            `${Math.round(surfaces[0].getBoundingClientRect().width)} px | ${Math.round(surfaces[1].getBoundingClientRect().width)} px`,
          );
        });
        fireEvent.click(canvas.getByRole("button", { name: "Read resize journal" }));
        await waitFor(() => {
          expect(JSON.parse(canvas.getByTestId("resize-journal").innerText)).toHaveLength(
            commandCount,
          );
        });
        fireEvent.pointerUp(grip, {
          pointerId: 7,
          pointerType: "mouse",
          isPrimary: true,
          clientX: x + 10000,
          clientY: y,
        });
        if (delta > 0.5) commandCount += 1;
        await waitFor(() => {
          const canonical = JSON.parse(canvas.getByTestId("resize-canonical").innerText);
          if (delta > 0.5) {
            for (let index = 0; index < placements.length; index += 1) {
              expect(canonical.placements).toContainEqual({
                id: placements[index].dataset.wallPlacementId,
                widthWeight: expect.closeTo(
                  widths[index] + (index === 0 ? delta : index === 1 ? -delta : 0),
                  1,
                ),
              });
            }
          }
          for (let index = 2; index < surfaces.length; index += 1)
            expect(surfaces[index].getBoundingClientRect().width).toBeCloseTo(widths[index], 1);
          expect(canvasElement.querySelector("[data-wall-resize-readout]")).toBeNull();
        });
        fireEvent.click(canvas.getByRole("button", { name: "Read resize journal" }));
        await waitFor(() => {
          const journal = JSON.parse(canvas.getByTestId("resize-journal").innerText);
          expect(journal).toHaveLength(commandCount);
          if (delta > 0.5) {
            expect(journal.at(-1)).toEqual({
              commandName: "setRowWidthWeights",
              payload: {
                wallId,
                rowId,
                placements: placements.map((placement, index) => ({
                  placementId: placement.dataset.wallPlacementId,
                  widthWeight: expect.closeTo(
                    widths[index] + (index === 0 ? delta : index === 1 ? -delta : 0),
                    1,
                  ),
                })),
              },
            });
          }
        });

        // A sub-threshold gesture preserves both the saved weights and command journal.
        fireEvent.pointerDown(grip, {
          pointerId: 8,
          pointerType: "pen",
          isPrimary: true,
          button: 0,
          clientX: x,
          clientY: y,
        });
        expect(canvasElement.querySelector("[data-wall-resize-readout]")).toBeNull();
        fireEvent.pointerMove(grip, {
          pointerId: 8,
          pointerType: "pen",
          isPrimary: true,
          clientX: x + 1,
          clientY: y,
        });
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        expect(canvasElement.querySelector("[data-wall-resize-readout]")).toBeNull();
        fireEvent.pointerUp(grip, {
          pointerId: 8,
          pointerType: "pen",
          isPrimary: true,
          clientX: x + 1,
          clientY: y,
        });
        const beforeHeight = surfaces[0].getBoundingClientRect().height;
        const heightY = heightGrip.getBoundingClientRect().y;
        fireEvent.pointerDown(heightGrip, {
          pointerId: 9,
          pointerType: "touch",
          isPrimary: true,
          button: 0,
          clientX: x,
          clientY: heightY,
        });
        expect(canvasElement.querySelector("[data-wall-resize-readout]")).toBeNull();
        fireEvent.pointerMove(heightGrip, {
          pointerId: 9,
          pointerType: "touch",
          isPrimary: true,
          clientX: x,
          clientY: heightY + 35.25,
        });
        await waitFor(() => {
          expect(surfaces[0].getBoundingClientRect().height).toBeCloseTo(beforeHeight + 35.25, 1);
          expect(canvasElement.querySelectorAll("[data-wall-resize-readout]")).toHaveLength(1);
          expect(heightGrip.querySelector("[data-wall-resize-readout]")?.textContent).toBe(
            `${Math.round(surfaces[0].getBoundingClientRect().height)} px`,
          );
        });
        for (const surface of surfaces)
          expect(surface.getBoundingClientRect().height).toBeCloseTo(beforeHeight + 35.25, 1);
        fireEvent.click(canvas.getByRole("button", { name: "Read resize journal" }));
        await waitFor(() =>
          expect(JSON.parse(canvas.getByTestId("resize-journal").innerText)).toHaveLength(
            commandCount,
          ),
        );
        fireEvent.pointerUp(heightGrip, {
          pointerId: 9,
          pointerType: "touch",
          isPrimary: true,
          clientX: x,
          clientY: heightY + 50.5,
        });
        commandCount += 1;
        await waitFor(() => {
          const canonical = JSON.parse(canvas.getByTestId("resize-canonical").innerText);
          expect(canonical.rows[0].minHeight).toBeCloseTo(beforeHeight + 50.5, 1);
          expect(surfaces[0].getBoundingClientRect().height).toBeCloseTo(beforeHeight + 50.5, 1);
          expect(canvasElement.querySelector("[data-wall-resize-readout]")).toBeNull();
        });
        fireEvent.click(canvas.getByRole("button", { name: "Read resize journal" }));
        await waitFor(() => {
          const journal = JSON.parse(canvas.getByTestId("resize-journal").innerText);
          expect(journal).toHaveLength(commandCount);
          expect(journal.at(-1)).toEqual({
            commandName: "setRowMinHeight",
            payload: { wallId, rowId, minHeight: expect.closeTo(beforeHeight + 50.5, 1) },
          });
        });
        fireEvent.doubleClick(heightGrip);
        commandCount += 1;
        await waitFor(() => {
          const canonical = JSON.parse(canvas.getByTestId("resize-canonical").innerText);
          expect(canonical.rows[0].minHeight).toBeNull();
          expect(surfaces[0].getBoundingClientRect().height).toBeCloseTo(beforeHeight, 1);
          expect(canvasElement.querySelector("[data-wall-resize-readout]")).toBeNull();
        });
        fireEvent.doubleClick(heightGrip);
        expect(canvasElement.querySelector("[data-wall-resize-readout]")).toBeNull();
        const contentRowId = prefixId({ abbreviation: "row" }, `story-${entry.id}-2`);
        const contentRow = canvasElement.querySelector<HTMLElement>(
          `[data-wall-row-id="${contentRowId}"]`,
        );
        const contentGrip = contentRow?.querySelector<HTMLElement>(
          "[data-wall-height-resize-handle]",
        );
        const contentSurface = contentRow?.querySelector<HTMLElement>(".brick-hover-surface");
        if (!contentGrip || !contentSurface) throw new Error("Missing content height fixture");
        const naturalHeight = contentSurface.getBoundingClientRect().height;
        const contentY = contentGrip.getBoundingClientRect().y;
        expect(naturalHeight).toBeGreaterThan(360);
        fireEvent.pointerDown(contentGrip, {
          pointerId: 10,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          clientX: x,
          clientY: contentY,
        });
        fireEvent.pointerMove(contentGrip, {
          pointerId: 10,
          pointerType: "mouse",
          isPrimary: true,
          clientX: x,
          clientY: contentY - 10000,
        });
        await waitFor(() => {
          expect(contentSurface.getBoundingClientRect().height).toBeCloseTo(naturalHeight, 1);
          expect(canvasElement.querySelectorAll("[data-wall-resize-readout]")).toHaveLength(1);
          expect(contentGrip.querySelector("[data-wall-resize-readout]")?.textContent).toBe(
            `${Math.round(contentSurface.getBoundingClientRect().height)} px`,
          );
        });
        const articleContent = contentSurface.querySelector<HTMLElement>(
          '[aria-label="Article content"]',
        );
        if (articleContent === null) throw new Error("Missing Article content fixture");
        const extraContent = document.createElement("p");
        extraContent.textContent =
          "Story-only content growth while the captured pointer remains stationary.";
        extraContent.style.minHeight = "137.5px";
        try {
          articleContent.append(extraContent);
          await waitFor(() => {
            expect(contentSurface.getBoundingClientRect().height).toBeGreaterThan(
              naturalHeight + 100,
            );
            expect(canvasElement.querySelectorAll("[data-wall-resize-readout]")).toHaveLength(1);
            expect(contentGrip.querySelector("[data-wall-resize-readout]")?.textContent).toBe(
              `${Math.round(contentSurface.getBoundingClientRect().height)} px`,
            );
          });
          fireEvent.click(canvas.getByRole("button", { name: "Read resize journal" }));
          await waitFor(() =>
            expect(JSON.parse(canvas.getByTestId("resize-journal").innerText)).toHaveLength(
              commandCount,
            ),
          );
        } finally {
          extraContent.remove();
        }
        await waitFor(() => {
          expect(contentSurface.getBoundingClientRect().height).toBeCloseTo(naturalHeight, 1);
          expect(contentGrip.querySelector("[data-wall-resize-readout]")?.textContent).toBe(
            `${Math.round(naturalHeight)} px`,
          );
        });
        fireEvent.pointerUp(contentGrip, {
          pointerId: 10,
          pointerType: "mouse",
          isPrimary: true,
          clientX: x,
          clientY: contentY - 10000,
        });
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        expect(contentSurface.getBoundingClientRect().height).toBeCloseTo(naturalHeight, 1);
        expect(canvasElement.querySelector("[data-wall-resize-readout]")).toBeNull();
        fireEvent.click(canvas.getByRole("button", { name: "Read resize journal" }));
        await waitFor(() => {
          const journal = JSON.parse(canvas.getByTestId("resize-journal").innerText);
          expect(journal).toHaveLength(commandCount);
          expect(journal.at(-1)).toEqual({
            commandName: "setRowMinHeight",
            payload: { wallId, rowId, minHeight: null },
          });
        });

        // Touch reset requires two completed taps; a single tap and an automatic repeat are no-ops.
        const resetRowId = prefixId({ abbreviation: "row" }, `story-${entry.id}-1`);
        const resetRow = canvasElement.querySelector<HTMLElement>(
          `[data-wall-row-id="${resetRowId}"]`,
        );
        const resetGrip = resetRow?.querySelector<HTMLElement>("[data-wall-height-resize-handle]");
        const resetSurface = resetRow?.querySelector<HTMLElement>(".brick-hover-surface");
        if (!resetGrip || !resetSurface) throw new Error("Missing touch reset fixture");
        expect(resetSurface.getBoundingClientRect().height).toBeCloseTo(360, 1);
        const resetY = resetGrip.getBoundingClientRect().y;
        for (const pointerId of [14, 15]) {
          fireEvent.pointerDown(resetGrip, {
            pointerId,
            pointerType: "touch",
            isPrimary: true,
            button: 0,
            clientX: x,
            clientY: resetY,
          });
          expect(canvasElement.querySelector("[data-wall-resize-readout]")).toBeNull();
          fireEvent.pointerUp(resetGrip, {
            pointerId,
            pointerType: "touch",
            isPrimary: true,
            clientX: x,
            clientY: resetY,
          });
          expect(canvasElement.querySelector("[data-wall-resize-readout]")).toBeNull();
          if (pointerId === 14)
            fireEvent.click(canvas.getByRole("button", { name: "Read resize journal" }));
        }
        await waitFor(() =>
          expect(JSON.parse(canvas.getByTestId("resize-journal").innerText)).toHaveLength(
            commandCount,
          ),
        );
        commandCount += 1;
        await waitFor(() => {
          const canonical = JSON.parse(canvas.getByTestId("resize-canonical").innerText);
          expect(canonical.rows[1].minHeight).toBeNull();
          expect(resetSurface.getBoundingClientRect().height).toBeCloseTo(90, 1);
        });
        fireEvent.click(canvas.getByRole("button", { name: "Read resize journal" }));
        await waitFor(() => {
          const journal = JSON.parse(canvas.getByTestId("resize-journal").innerText);
          expect(journal).toHaveLength(commandCount);
          expect(journal.at(-1)).toEqual({
            commandName: "setRowMinHeight",
            payload: { wallId, rowId: resetRowId, minHeight: null },
          });
        });
        for (const pointerId of [16, 17]) {
          fireEvent.pointerDown(resetGrip, {
            pointerId,
            pointerType: "touch",
            isPrimary: true,
            button: 0,
            clientX: x,
            clientY: resetY,
          });
          expect(canvasElement.querySelector("[data-wall-resize-readout]")).toBeNull();
          fireEvent.pointerUp(resetGrip, {
            pointerId,
            pointerType: "touch",
            isPrimary: true,
            clientX: x,
            clientY: resetY,
          });
          expect(canvasElement.querySelector("[data-wall-resize-readout]")).toBeNull();
        }
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        fireEvent.click(canvas.getByRole("button", { name: "Read resize journal" }));
        await waitFor(() =>
          expect(JSON.parse(canvas.getByTestId("resize-journal").innerText)).toHaveLength(
            commandCount,
          ),
        );

        // At the module's 64px minimum, the divider must leave the corner Move control clear.
        const shortY = heightGrip.getBoundingClientRect().y;
        fireEvent.pointerDown(heightGrip, {
          pointerId: 18,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          clientX: x,
          clientY: shortY,
        });
        fireEvent.pointerMove(heightGrip, {
          pointerId: 18,
          pointerType: "mouse",
          isPrimary: true,
          clientX: x,
          clientY: shortY - 10000,
        });
        fireEvent.pointerUp(heightGrip, {
          pointerId: 18,
          pointerType: "mouse",
          isPrimary: true,
          clientX: x,
          clientY: shortY - 10000,
        });
        commandCount += 1;
        await waitFor(() => {
          const canonical = JSON.parse(canvas.getByTestId("resize-canonical").innerText);
          expect(canonical.rows[0].minHeight).toBeCloseTo(64, 1);
          expect(canvasElement.querySelector("[data-wall-resize-readout]")).toBeNull();
          for (const surface of surfaces)
            expect(surface.getBoundingClientRect().height).toBeCloseTo(64, 1);
          const moveButton = placements[0].querySelector<HTMLElement>("[data-wall-drag-handle]");
          if (moveButton === null) throw new Error("Missing short Row Move control");
          expect(grip.getBoundingClientRect().left).toBeGreaterThanOrEqual(
            moveButton.getBoundingClientRect().right,
          );
        });
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        fireEvent.click(canvas.getByRole("button", { name: "Read resize journal" }));
        await waitFor(() => {
          const journal = JSON.parse(canvas.getByTestId("resize-journal").innerText);
          expect(journal).toHaveLength(commandCount);
          expect(journal.at(-1)).toEqual({
            commandName: "setRowMinHeight",
            payload: { wallId, rowId, minHeight: expect.closeTo(64, 1) },
          });
        });
      }
    } finally {
      releaseCapture.mockRestore();
      hasCapture.mockRestore();
      setCapture.mockRestore();
    }
  },
};

export const PointerResizeWithGaps: StoryObj<typeof meta> = {
  ...PointerResize,
  args: { brickGap: 12, cardStyle: true },
};

export const PointerResizeCancellation: StoryObj<typeof meta> = {
  args: { brickGap: 12, cardStyle: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const document = canvasElement.ownerDocument;
    const window = document.defaultView;
    if (window === null) throw new Error("Missing story window");
    await document.fonts.ready;
    await canvas.findByRole("button", { name: "Read resize journal" }, { timeout: 10000 });
    await userEvent.click(canvas.getByRole("button", { name: "md preview, 720px" }));
    const captures = new WeakMap<HTMLElement, Set<number>>();
    const setCapture = spyOn(HTMLElement.prototype, "setPointerCapture").mockImplementation(
      function (this: HTMLElement, pointerId: number) {
        const pointers = captures.get(this) ?? new Set<number>();
        pointers.add(pointerId);
        captures.set(this, pointers);
      },
    );
    const hasCapture = spyOn(HTMLElement.prototype, "hasPointerCapture").mockImplementation(
      function (this: HTMLElement, pointerId: number) {
        return captures.get(this)?.has(pointerId) ?? false;
      },
    );
    const releaseCapture = spyOn(HTMLElement.prototype, "releasePointerCapture").mockImplementation(
      function (this: HTMLElement, pointerId: number) {
        captures.get(this)?.delete(pointerId);
      },
    );
    let commandCount = 0;
    let breakpoint = "md";
    try {
      for (const reason of [
        "sibling",
        "Escape",
        "pointercancel",
        "capture",
        "blur",
        "saved sizing",
        "membership",
        "breakpoint",
        "unmount",
      ]) {
        const rowId = prefixId({ abbreviation: "row" }, `story-${breakpoint}-0`);
        const row = canvasElement.querySelector<HTMLElement>(`[data-wall-row-id="${rowId}"]`);
        const grip = row?.querySelector<HTMLElement>("[data-wall-width-resize-handle]");
        const surface = row?.querySelector<HTMLElement>(".brick-hover-surface");
        const rightSurface = row?.querySelectorAll<HTMLElement>(".brick-hover-surface")[1];
        if (!grip || !surface || !rightSurface)
          throw new Error(`Missing cancellation fixture: ${reason}`);
        const x = grip.getBoundingClientRect().x;
        const y = grip.getBoundingClientRect().y + 12;
        const beforeWidth = surface.getBoundingClientRect().width;
        expect(canvasElement.querySelector("[data-wall-resize-readout]")).toBeNull();
        fireEvent.pointerDown(grip, {
          pointerId: 12,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          clientX: x,
          clientY: y,
        });
        expect(canvasElement.querySelector("[data-wall-resize-readout]")).toBeNull();
        fireEvent.pointerMove(grip, {
          pointerId: 12,
          pointerType: "mouse",
          isPrimary: true,
          clientX: x + 30,
          clientY: y,
        });
        // Escape also exercises cancellation before the queued animation frame runs.
        if (reason !== "Escape") {
          await waitFor(() => {
            expect(surface.getBoundingClientRect().width).toBeCloseTo(beforeWidth + 30, 1);
            expect(canvasElement.querySelectorAll("[data-wall-resize-readout]")).toHaveLength(1);
            expect(grip.querySelector("[data-wall-resize-readout]")?.textContent).toBe(
              `${Math.round(surface.getBoundingClientRect().width)} px | ${Math.round(rightSurface.getBoundingClientRect().width)} px`,
            );
          });
        } else {
          expect(canvasElement.querySelector("[data-wall-resize-readout]")).toBeNull();
        }
        switch (reason) {
          case "sibling":
            fireEvent.click(canvas.getByRole("button", { name: "Change sibling Row sizing" }));
            commandCount += 1;
            await waitFor(() => {
              expect(surface.getBoundingClientRect().width).toBeCloseTo(beforeWidth + 30, 1);
              expect(canvasElement.querySelectorAll("[data-wall-resize-readout]")).toHaveLength(1);
              expect(grip.querySelector("[data-wall-resize-readout]")?.textContent).toBe(
                `${Math.round(surface.getBoundingClientRect().width)} px | ${Math.round(rightSurface.getBoundingClientRect().width)} px`,
              );
            });
            break;
          case "Escape":
            fireEvent.keyDown(document, { key: "Escape" });
            break;
          case "pointercancel":
            fireEvent.pointerCancel(grip, { pointerId: 12, pointerType: "mouse", isPrimary: true });
            break;
          case "capture":
            captures.get(grip)?.delete(12);
            fireEvent.lostPointerCapture(grip, {
              pointerId: 12,
              pointerType: "mouse",
              isPrimary: true,
            });
            break;
          case "blur":
            fireEvent.blur(window);
            break;
          case "saved sizing":
            fireEvent.click(canvas.getByRole("button", { name: "Change active Row sizing" }));
            commandCount += 1;
            break;
          case "membership":
            fireEvent.click(canvas.getByRole("button", { name: "Move active Row member" }));
            break;
          case "breakpoint":
            await userEvent.click(canvas.getByRole("button", { name: "xl preview, 1440px" }));
            breakpoint = "xl";
            break;
          case "unmount":
            fireEvent.click(canvas.getByRole("button", { name: "Unmount Wall editor" }));
            break;
        }
        fireEvent.pointerUp(grip, {
          pointerId: 12,
          pointerType: "mouse",
          isPrimary: true,
          clientX: x + 30,
          clientY: y,
        });
        if (reason === "sibling") commandCount += 1;
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        expect(canvasElement.querySelector("[data-wall-resize-readout]")).toBeNull();
        if (["Escape", "pointercancel", "capture", "blur"].includes(reason)) {
          expect(surface.getBoundingClientRect().width).toBeCloseTo(beforeWidth, 1);
        }
        fireEvent.click(canvas.getByRole("button", { name: "Read resize journal" }));
        await waitFor(() =>
          expect(JSON.parse(canvas.getByTestId("resize-journal").innerText)).toHaveLength(
            commandCount,
          ),
        );
        if (reason === "sibling") {
          const journal = JSON.parse(canvas.getByTestId("resize-journal").innerText);
          expect(journal.at(-1).commandName).toBe("setRowWidthWeights");
        }
        if (reason === "unmount") {
          fireEvent.click(canvas.getByRole("button", { name: "Mount Wall editor" }));
          await waitFor(() =>
            expect(canvasElement.querySelector(`[data-wall-row-id="${rowId}"]`)).not.toBeNull(),
          );
          expect(canvasElement.querySelector("[data-wall-resize-readout]")).toBeNull();
        }
      }
    } finally {
      releaseCapture.mockRestore();
      hasCapture.mockRestore();
      setCapture.mockRestore();
    }
  },
};
