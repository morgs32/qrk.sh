import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowUpRight, FileText, LockKeyhole, MoveUpRight } from "lucide-react";
import { useEffect, useRef } from "react";

import { BrickWrapper } from "./BrickWrapper";
import "./BrickWrapper.stories.css";

const meta = {
  title: "Library/Brick hover transitions",
  parameters: {
    layout: "fullscreen",
  },
  args: {
    treatment: "all",
    showHovered: false,
  },
  argTypes: {
    treatment: {
      control: "select",
      options: [
        "all",
        "tint",
        "hard-shadow",
        "tight-shadow",
        "bold-shadow",
        "tint-shadow",
        "position-shadow",
      ],
    },
    showHovered: {
      name: "Hold hover state",
      control: "boolean",
    },
  },
  render: function Render(props: {
    treatment:
      | "all"
      | "tint"
      | "hard-shadow"
      | "tight-shadow"
      | "bold-shadow"
      | "tint-shadow"
      | "position-shadow";
    showHovered: boolean;
  }) {
    const { treatment, showHovered } = props;
    const studiesRef = useRef<HTMLElement>(null);

    useEffect(() => {
      const root = studiesRef.current;
      if (root === null) return;
      const viewport = root.ownerDocument.defaultView;
      if (viewport === null) return;

      let animationFrame: number | undefined;
      const cells = root.querySelectorAll<HTMLElement>(
        '[data-treatment="position-shadow"] .brick-hover-study-cell',
      );
      if (cells.length === 0) return;

      const updateShadows = () => {
        animationFrame = undefined;
        const halfWidth = Math.max(1, viewport.innerWidth / 2);
        const halfHeight = Math.max(1, viewport.innerHeight / 2);

        for (const cell of cells) {
          // Measure the stationary cell so the hover lift cannot change its own direction.
          const rect = cell.getBoundingClientRect();
          const horizontalPosition = (rect.left + rect.width / 2 - halfWidth) / halfWidth;
          const verticalPosition = (rect.top + rect.height / 2 - halfHeight) / halfHeight;
          const shadowX = Math.round(Math.max(-1, Math.min(1, horizontalPosition)) * 80) / 10;
          const shadowY = Math.round(Math.max(-1, Math.min(1, verticalPosition)) * 80) / 10;

          cell.style.setProperty("--shadow-x", `${shadowX}px`);
          cell.style.setProperty("--shadow-y", `${shadowY}px`);
          cell.style.setProperty("--lift-x", `${-shadowX / 2}px`);
          cell.style.setProperty("--lift-y", `${-shadowY / 2}px`);
          cell.style.setProperty("--shadow-stack-direction", shadowY < 0 ? "-1" : "1");
        }
      };

      const scheduleUpdate = () => {
        if (animationFrame !== undefined) return;
        animationFrame = viewport.requestAnimationFrame(updateShadows);
      };

      const resizeObserver = new ResizeObserver(scheduleUpdate);
      resizeObserver.observe(root);
      for (const cell of cells) resizeObserver.observe(cell);
      viewport.addEventListener("resize", scheduleUpdate);
      viewport.addEventListener("scroll", scheduleUpdate, true);
      root.addEventListener("pointerover", scheduleUpdate);
      root.addEventListener("focusin", scheduleUpdate);
      updateShadows();

      return () => {
        resizeObserver.disconnect();
        viewport.removeEventListener("resize", scheduleUpdate);
        viewport.removeEventListener("scroll", scheduleUpdate, true);
        root.removeEventListener("pointerover", scheduleUpdate);
        root.removeEventListener("focusin", scheduleUpdate);
        if (animationFrame !== undefined) viewport.cancelAnimationFrame(animationFrame);
      };
    }, [treatment]);

    const treatments = [
      {
        id: "tint",
        number: "01",
        name: "Background tint",
        description: "A warm wash. Quiet, with no movement.",
        detail: "180 ms · color only",
      },
      {
        id: "hard-shadow",
        number: "02",
        name: "Hard shadow",
        description: "The original lift, black edge, and solid shadow.",
        detail: "180 ms · 6 px shadow",
      },
      {
        id: "tight-shadow",
        number: "03",
        name: "Tight shadow",
        description: "A crisp edge with just a little separation.",
        detail: "180 ms · 2 px shadow",
      },
      {
        id: "bold-shadow",
        number: "04",
        name: "Bold shadow",
        description: "Selected for the shared brick UI. More lift and a heavier strip of black.",
        detail: "180 ms · 10 px shadow",
      },
      {
        id: "tint-shadow",
        number: "05",
        name: "Tint + shadow",
        description: "The warm wash and original hard shadow together.",
        detail: "180 ms · tint + 6 px shadow",
      },
      {
        id: "position-shadow",
        number: "06",
        name: "Position-aware shadow",
        description: "Light from the viewport center. Scroll to change the direction.",
        detail: "180 ms · up to 8 px per axis",
      },
    ];

    return (
      <main ref={studiesRef} className="brick-hover-studies" data-hold-hover={showHovered}>
        <header className="brick-hover-studies-header">
          <p className="brick-hover-studies-eyebrow">qrk.sh / hover studies</p>
          <h1>Give each brick a little weight.</h1>
          <p>Hover a brick, or tab to it. Background tint and five ways to cast a hard shadow.</p>
        </header>

        <div className="brick-hover-studies-grid">
          {treatments
            .filter((item) => treatment === "all" || item.id === treatment)
            .map((item) => (
              <section className="brick-hover-study" key={item.id}>
                <header className="brick-hover-study-header">
                  <span className="brick-hover-study-number">{item.number}</span>
                  <div>
                    <h2>{item.name}</h2>
                    <p>{item.description}</p>
                  </div>
                </header>

                <div className="brick-hover-study-browser">
                  <div className="brick-hover-study-chrome" aria-hidden="true">
                    <div className="brick-hover-study-window-dots">
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="brick-hover-study-address">
                      <LockKeyhole size={12} strokeWidth={1.5} />
                      <span>qrk.sh</span>
                    </div>
                  </div>
                  {/* The viewport clips edge effects; stationary cells keep hover targets stable. */}
                  <div className="brick-hover-study-wall" data-treatment={item.id}>
                    <div className="brick-hover-study-cell">
                      <BrickWrapper
                        className="brick-hover-study-surface brick-hover-study-article"
                        role="group"
                        tabIndex={0}
                        aria-label={`Preview article with ${item.name.toLowerCase()}`}
                      >
                        <span className="brick-hover-study-article-heading">
                          <FileText size={16} aria-hidden="true" />
                          <span>Article</span>
                        </span>
                        <span className="brick-hover-study-article-title">
                          Actually good advice
                        </span>
                        <span className="brick-hover-study-article-subtitle">
                          Take it or leave it
                        </span>
                        <span className="brick-hover-study-article-body">
                          For a long time, I’ve been collecting pieces of advice that are:
                        </span>
                        <span className="brick-hover-study-article-list">
                          <span>1. Applicable to anybody</span>
                          <span>2. Likely to help and unlikely to harm</span>
                          <span>3. Things I have actually tried</span>
                        </span>
                        <span className="brick-hover-study-article-body">Here’s what I got.</span>
                      </BrickWrapper>
                    </div>

                    <div className="brick-hover-study-cell">
                      <BrickWrapper
                        className="brick-hover-study-surface brick-hover-study-link"
                        role="group"
                        tabIndex={0}
                        aria-label={`Preview link with ${item.name.toLowerCase()}`}
                      >
                        <span className="brick-hover-study-link-icon">
                          <MoveUpRight size={20} aria-hidden="true" />
                        </span>
                        <span>
                          <span className="brick-hover-study-link-title">Things worth keeping</span>
                          <span className="brick-hover-study-link-domain">A small collection</span>
                        </span>
                        <ArrowUpRight size={18} aria-hidden="true" />
                      </BrickWrapper>
                    </div>
                  </div>
                </div>

                <p className="brick-hover-study-detail">{item.detail}</p>
              </section>
            ))}
        </div>

        <p className="brick-hover-studies-note">
          Position-aware shadows follow the brick’s position in the viewport, with light from its
          center. Reduced motion keeps the tint and shadow emphasis without the lift or animation.
        </p>
      </main>
    );
  },
} satisfies Meta<{
  treatment:
    | "all"
    | "tint"
    | "hard-shadow"
    | "tight-shadow"
    | "bold-shadow"
    | "tint-shadow"
    | "position-shadow";
  showHovered: boolean;
}>;

export default meta;

export const Compare: StoryObj<typeof meta> = {};

export const BackgroundTint: StoryObj<typeof meta> = {
  args: { treatment: "tint" },
};

export const HardShadow: StoryObj<typeof meta> = {
  args: { treatment: "hard-shadow" },
};

export const TightShadow: StoryObj<typeof meta> = {
  args: { treatment: "tight-shadow" },
};

export const BoldShadow: StoryObj<typeof meta> = {
  args: { treatment: "bold-shadow" },
};

export const TintAndShadow: StoryObj<typeof meta> = {
  args: { treatment: "tint-shadow" },
};

export const PositionAwareShadow: StoryObj<typeof meta> = {
  args: { treatment: "position-shadow" },
};
