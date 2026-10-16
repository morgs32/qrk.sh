"use client";

import { useMemo, useState } from "react";
import { Check, Clipboard, Sparkles } from "lucide-react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";

const accentCells = [2, 5, 9, 14, 18, 21, 26, 30, 33, 38, 42, 47, 51];
const motifSize = 8;
const repeatBlocks = 4;

function seededVariant(blockColumn: number, blockRow: number) {
  return (blockColumn * 17 + blockRow * 31 + blockColumn * blockRow * 7) % 4;
}

function transformedCells(blockColumn: number, blockRow: number) {
  const variant = seededVariant(blockColumn, blockRow);
  return accentCells.map((cell, index): [number, number, number] => {
    const column = cell % motifSize;
    const row = Math.floor(cell / motifSize);
    const position: [number, number] =
      variant === 1
        ? [motifSize - 1 - column, row]
        : variant === 2
          ? [column, motifSize - 1 - row]
          : variant === 3
            ? [motifSize - 1 - row, motifSize - 1 - column]
            : [column, row];
    return [position[0], position[1], index % 3];
  });
}

function isHex(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value);
}

export function CSSGridBackgroundGenerator() {
  const [hex, setHex] = useState("#F24B1A");
  const [squareSize, setSquareSize] = useState(72);
  const [copied, setCopied] = useState(false);
  const validHex = isHex(hex);
  const safeColor = validHex ? hex : "#F24B1A";

  const motifCells = useMemo(
    () =>
      Array.from({ length: repeatBlocks * repeatBlocks }, (_, block) =>
        transformedCells(block % repeatBlocks, Math.floor(block / repeatBlocks)),
      ).flatMap((cells, block) =>
        cells.map(([column, row, shade]): [number, number, number] => [
          (block % repeatBlocks) * motifSize + column,
          Math.floor(block / repeatBlocks) * motifSize + row,
          shade,
        ]),
      ),
    [],
  );

  const motifSvg = useMemo(() => {
    const shadeOpacities = [0.92, 0.68, 0.44];
    const motifPixels = motifSize * repeatBlocks * squareSize;
    const cells = (rotation = 0, opacity = 1) =>
      `<g transform='rotate(${rotation} ${motifPixels / 2} ${motifPixels / 2})' opacity='${opacity}'>${motifCells
        .map(
          ([column, row, shade]) =>
            `<rect x='${column * squareSize}' y='${row * squareSize}' width='${squareSize}' height='${squareSize}' fill='${safeColor}' opacity='${shadeOpacities[shade]}'/>`,
        )
        .join("")}</g>`;
    return `<svg xmlns='http://www.w3.org/2000/svg' width='${motifPixels}' height='${motifPixels}'>${cells()}${cells(90, 0.26)}</svg>`;
  }, [motifCells, safeColor, squareSize]);

  const cssOutput = useMemo(
    () =>
      `background-color: color-mix(in srgb, ${safeColor} 76%, white);\nbackground-image: url("data:image/svg+xml,${encodeURIComponent(motifSvg)}");\nbackground-size: ${motifSize * repeatBlocks * squareSize}px ${motifSize * repeatBlocks * squareSize}px;`,
    [motifSvg, safeColor, squareSize],
  );

  async function copyCss() {
    await navigator.clipboard.writeText(cssOutput);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <main
      className="min-h-screen bg-[#f7f5f0] text-[#24221f]"
      style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
    >
      <section className="mx-auto grid max-w-6xl gap-10 px-6 pb-16 pt-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:px-10 lg:pt-16">
        <div className="max-w-md">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#ece8e1] px-3 py-1.5 text-xs font-medium text-[#6b655e]">
            <Sparkles size={13} aria-hidden="true" /> Make a tile pattern
          </div>
          <h1 className="text-5xl font-semibold leading-[0.98] tracking-[-0.06em] sm:text-6xl">
            A little color goes a long way.
          </h1>
          <p className="mt-6 max-w-sm text-base leading-7 text-[#77716a]">
            Choose a color and a square size. Get a lightweight CSS background you can paste
            anywhere.
          </p>

          <div className="mt-10 space-y-7">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[#77716a]">
                Hex color
              </span>
              <div className="flex items-center gap-3 rounded-xl border border-[#d9d4cc] bg-white p-2 shadow-sm focus-within:border-[#24221f]">
                <input
                  aria-label="Pick a background color"
                  type="color"
                  value={safeColor}
                  onChange={(event) => setHex(event.target.value.toUpperCase())}
                  className="h-10 w-10 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                />
                <Input
                  aria-label="Hex color value"
                  value={hex}
                  onChange={(event) => setHex(event.target.value.toUpperCase())}
                  className="h-10 w-full rounded-none border-0 bg-transparent p-0 font-mono text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
                  spellCheck={false}
                />
                <span
                  className={`shrink-0 pr-2 text-xs ${validHex ? "text-[#aaa39a]" : "text-red-600"}`}
                >
                  {validHex ? "valid" : "use #RRGGBB"}
                </span>
              </div>
            </label>

            <label className="block">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#77716a]">
                  Square width
                </span>
                <span className="font-mono text-sm font-medium">{squareSize}px</span>
              </div>
              <input
                aria-label="Square width in pixels"
                type="range"
                min="24"
                max="160"
                step="1"
                value={squareSize}
                onChange={(event) => setSquareSize(Number(event.target.value))}
                className="w-full accent-[#24221f]"
              />
              <div className="mt-2 flex justify-between text-[11px] text-[#aaa39a]">
                <span>24px</span>
                <span>160px</span>
              </div>
            </label>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#d9d4cc] bg-white p-3 shadow-[0_18px_60px_rgba(65,55,45,0.10)] sm:p-4">
          <div
            className="relative aspect-square overflow-hidden rounded-xl"
            style={{ backgroundColor: `color-mix(in srgb, ${safeColor} 76%, white)` }}
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(motifSvg)}"), linear-gradient(to right, color-mix(in srgb, ${safeColor} 18%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, ${safeColor} 18%, transparent) 1px, transparent 1px)`,
                backgroundSize: `${motifSize * repeatBlocks * squareSize}px ${motifSize * repeatBlocks * squareSize}px, ${squareSize}px ${squareSize}px, ${squareSize}px ${squareSize}px`,
              }}
            />
            <div className="absolute bottom-4 left-4 rounded-lg bg-white/85 px-3 py-2 font-mono text-[11px] text-[#5e5953] backdrop-blur-sm">
              live preview
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 px-1 pb-1 pt-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#77716a]">
                Your CSS
              </p>
              <p className="mt-1 text-xs text-[#aaa39a]">Ready to paste</p>
            </div>
            <Button
              onClick={copyCss}
              className="h-auto rounded-lg bg-[#24221f] px-3.5 py-2.5 text-xs font-medium text-white shadow-none hover:bg-[#45413c] has-[>svg]:px-3.5"
              type="button"
            >
              {copied ? (
                <Check className="size-3.5" aria-hidden="true" />
              ) : (
                <Clipboard className="size-3.5" aria-hidden="true" />
              )}
              {copied ? "Copied" : "Copy CSS"}
            </Button>
          </div>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-[#24221f] p-4 font-mono text-xs leading-6 text-[#e8e1d8]">
            <code>{cssOutput}</code>
          </pre>
        </div>
      </section>
    </main>
  );
}
