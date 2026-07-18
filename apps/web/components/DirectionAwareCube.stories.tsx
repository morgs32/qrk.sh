"use client";

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";

/**
 * Demonstrates a CSS-built cube whose entry edge selects the adjacent face.
 * The markup stays explicit so each face and rotation can be inspected independently.
 */
function DirectionAwareCubeStory() {
  const shouldReduceMotion = useReducedMotion();
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-12 text-white">
      <button
        aria-label="Direction-aware cube. Enter from an edge to reveal its matching face."
        className="relative size-48 appearance-none border-0 bg-transparent p-0 focus-visible:outline-4 focus-visible:outline-offset-8 focus-visible:outline-white"
        onFocus={() => {
          // Keyboard focus always presents the neutral front face.
          setRotateX(0);
          setRotateY(0);
        }}
        onPointerEnter={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();

          const distanceFromTop = event.clientY - bounds.top;
          const distanceFromRight = bounds.right - event.clientX;
          const distanceFromBottom = bounds.bottom - event.clientY;
          const distanceFromLeft = event.clientX - bounds.left;

          // Start with the top edge, then explicitly replace it when another edge is nearer.
          let nearestDistance = distanceFromTop;
          let nextRotateX = -90;
          let nextRotateY = 0;

          if (distanceFromRight < nearestDistance) {
            nearestDistance = distanceFromRight;
            nextRotateX = 0;
            nextRotateY = -90;
          }

          if (distanceFromBottom < nearestDistance) {
            nearestDistance = distanceFromBottom;
            nextRotateX = 90;
            nextRotateY = 0;
          }

          if (distanceFromLeft < nearestDistance) {
            nextRotateX = 0;
            nextRotateY = 90;
          }

          setRotateX(nextRotateX);
          setRotateY(nextRotateY);
        }}
        onPointerLeave={() => {
          // Leaving from any edge restores the front face for the next entry.
          setRotateX(0);
          setRotateY(0);
        }}
        style={{ perspective: "800px" }}
        type="button"
      >
        <motion.span
          animate={{ rotateX, rotateY }}
          className="relative block size-full"
          style={{ transformStyle: "preserve-3d" }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : {
                  type: "spring",
                  bounce: 0,
                  duration: 0.42,
                }
          }
        >
          <span
            className="absolute inset-0 flex items-center justify-center border border-white/20 bg-violet-600 text-2xl font-black tracking-[0.2em] [backface-visibility:hidden]"
            style={{ transform: "translateZ(96px)" }}
          >
            FRONT
          </span>

          <span
            className="absolute inset-0 flex items-center justify-center border border-white/20 bg-sky-500 text-2xl font-black tracking-[0.2em] [backface-visibility:hidden]"
            style={{ transform: "rotateX(90deg) translateZ(96px)" }}
          >
            TOP
          </span>

          <span
            className="absolute inset-0 flex items-center justify-center border border-white/20 bg-rose-500 text-2xl font-black tracking-[0.2em] [backface-visibility:hidden]"
            style={{ transform: "rotateY(90deg) translateZ(96px)" }}
          >
            RIGHT
          </span>

          <span
            className="absolute inset-0 flex items-center justify-center border border-white/20 bg-amber-400 text-2xl font-black tracking-[0.2em] text-neutral-950 [backface-visibility:hidden]"
            style={{ transform: "rotateX(-90deg) translateZ(96px)" }}
          >
            BOTTOM
          </span>

          <span
            className="absolute inset-0 flex items-center justify-center border border-white/20 bg-emerald-500 text-2xl font-black tracking-[0.2em] text-neutral-950 [backface-visibility:hidden]"
            style={{ transform: "rotateY(-90deg) translateZ(96px)" }}
          >
            LEFT
          </span>
        </motion.span>
      </button>
    </main>
  );
}

const meta = {
  title: "Experiments/Direction-Aware Cube",
  component: DirectionAwareCubeStory,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof DirectionAwareCubeStory>;

export default meta;

export const Default: StoryObj<typeof meta> = {};
