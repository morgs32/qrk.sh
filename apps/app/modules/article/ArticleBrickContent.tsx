"use client";

import { MarkdownView } from "@meowdown/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { makeComponentView } from "../make/makeComponentView";
import { articleBrickComponent } from "@qrk.sh/zerospin/src/modules/article/generator/ArticleBrickComponent";
import { BrickShell } from "../components/brick/BrickShell";
import "./article-font.css";
import "./article-editor.css";

export const articleBrickContentView = makeComponentView(articleBrickComponent, {
  component(props) {
    const { title, subtitle, content } = props;
    const [mounted, setMounted] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const resolveXPost = useCallback(() => undefined, []);
    const resolveYouTubeVideo = useCallback(() => undefined, []);
    const onLinkClick = useCallback((props: { href: string }) => {
      const { href } = props;
      window.open(href, "_blank", "noopener,noreferrer");
    }, []);

    // 1 — MarkdownView requires the DOM; server and initial client markup stay identical.
    useEffect(() => {
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled) return;
        setMounted(true);
      });
      return () => {
        cancelled = true;
      };
    }, []);

    // 2 — Keep saved tasks read-only while rendered links remain active.
    useLayoutEffect(() => {
      for (const checkbox of contentRef.current?.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"]',
      ) ?? []) {
        checkbox.disabled = true;
        checkbox.tabIndex = -1;
      }
    }, [mounted, content]);

    return (
      <BrickShell className="overflow-hidden bg-white">
        <div className="qrk-article-document qrk-article-readonly qrk-responsive-insets">
          <h1 className="qrk-article-title">{title}</h1>
          <p className="qrk-article-subtitle">{subtitle}</p>
          <div ref={contentRef} aria-label="Article content">
            {mounted && (
              <MarkdownView
                markdown={content ?? ""}
                markMode="hide"
                interactive={true}
                className="qrk-article-editor readonly"
                resolveXPost={resolveXPost}
                resolveYouTubeVideo={resolveYouTubeVideo}
                onLinkClick={onLinkClick}
              />
            )}
          </div>
        </div>
      </BrickShell>
    );
  },
});
