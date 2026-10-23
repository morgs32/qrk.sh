import { MeowdownEditor, type EditorHandle } from "@meowdown/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { renderHtml } from "@tanstack/markdown/html";
import { useCallback, useRef, useState } from "react";
import { articleBrickContentView } from "./ArticleBrickContent";
import { articleRendererComparisonMarkdown } from "./articleRendererComparisonMarkdown";
import "./article-font.css";
import "./article-editor.css";

const meta: Meta = {
  title: "Modules/Article/Renderer comparison",
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const SideBySide: StoryObj<typeof meta> = {
  render: function Render() {
    const [markdown, setMarkdown] = useState(articleRendererComparisonMarkdown);
    const editorRef = useRef<EditorHandle>(null);
    const handleDocChange = useCallback(() => {
      if (editorRef.current !== null) setMarkdown(editorRef.current.getMarkdown());
    }, []);
    const resolveXPost = useCallback(() => undefined, []);
    const resolveYouTubeVideo = useCallback(() => undefined, []);
    const html = renderHtml(markdown, {
      allowHtml: false,
      frontmatter: false,
      headingIds: false,
      headingAnchors: false,
    });
    const title = "A Markdown article";
    const subtitle = "The same saved Markdown in two renderers.";

    return (
      <main className="qrk-renderer-comparison min-h-screen bg-zinc-50 p-4 sm:p-8">
        <style>{`
          .qrk-renderer-comparison > header > h1 { font-size: 18px; }
          .qrk-renderer-comparison > header > p,
          .qrk-renderer-comparison > details > p,
          .qrk-renderer-comparison details > pre { font-size: 14px; }
          .qrk-renderer-comparison section > header > p { font-size: 12px; color: #52525b; }
          .qrk-renderer-comparison > header > p + p,
          .qrk-renderer-comparison > details > p { color: #52525b; }
          .qrk-renderer-comparison .qrk-tanstack-html > :is(p, ul, ol, blockquote, pre, table) { margin-top: .85em; }
          .qrk-renderer-comparison .qrk-tanstack-html > :first-child { margin-top: 0; }
          .qrk-renderer-comparison .qrk-tanstack-html ul,
          .qrk-renderer-comparison .qrk-tanstack-html ol { padding-inline-start: 1.5em; }
          .qrk-renderer-comparison .qrk-tanstack-html ul { list-style: disc; }
          .qrk-renderer-comparison .qrk-tanstack-html ol { list-style: decimal; }
          .qrk-renderer-comparison .qrk-tanstack-html li + li { margin-top: .25em; }
          .qrk-renderer-comparison .qrk-tanstack-html li:has(> input[type="checkbox"]) { list-style: none; }
          .qrk-renderer-comparison .qrk-tanstack-html input { margin-inline-end: .5em; }
          .qrk-renderer-comparison .qrk-tanstack-html blockquote {
            border-inline-start: 3px solid #d4d4d8; padding-inline-start: 1em; color: #71717a;
          }
          .qrk-renderer-comparison .qrk-tanstack-html code {
            font-family: "Fragment Mono", monospace; font-size: .8em;
          }
          .qrk-renderer-comparison .qrk-tanstack-html :not(pre) > code {
            padding: .1em .3em; border-radius: 4px; background: #f4f4f5;
          }
          .qrk-renderer-comparison .qrk-tanstack-html pre {
            max-width: 100%; overflow-x: auto; padding: 16px; border: 1px solid #e4e4e7;
            border-radius: 8px; background: #fafafa; line-height: 1.5;
          }
          .qrk-renderer-comparison .qrk-tanstack-html table {
            display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse;
          }
          .qrk-renderer-comparison .qrk-tanstack-html th,
          .qrk-renderer-comparison .qrk-tanstack-html td {
            border: 1px solid #e4e4e7; padding: .4em .6em; text-align: start;
          }
          .qrk-renderer-comparison .qrk-tanstack-html th { font-weight: 600; background: #fafafa; }
          .qrk-renderer-comparison .qrk-tanstack-html img { display: block; max-width: 100%; height: auto; }
        `}</style>

        <header className="mb-6">
          <h1 className="font-semibold">Article renderer comparison</h1>
          <p className="mt-2 max-w-4xl leading-6">
            Compare the current Meowdown article view with TanStack Markdown’s generated HTML.
            Server-side HTML generation is required for the upcoming article path. This Storybook
            preview runs in the browser; TanStack’s HTML API can also run without a DOM.
          </p>
          <p className="mt-2 max-w-4xl leading-6">
            Inspect lists, code, line breaks, links, saved image sizes, extra syntax, and literal
            HTML. Open the Meowdown editor below to update both panels from the same Markdown.
          </p>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <section
            aria-labelledby="meowdown-renderer-heading"
            className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white"
          >
            <header className="border-b border-zinc-200 px-5 py-3">
              <h2 id="meowdown-renderer-heading" className="font-semibold">
                Meowdown · current article renderer
              </h2>
              <p className="mt-1 leading-5">
                Article body mounts in the browser. Saved tasks stay read-only.
              </p>
            </header>
            <articleBrickContentView.Component
              title={title}
              subtitle={subtitle}
              content={markdown}
            />
          </section>

          <section
            aria-labelledby="tanstack-renderer-heading"
            className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white"
          >
            <header className="border-b border-zinc-200 px-5 py-3">
              <h2 id="tanstack-renderer-heading" className="font-semibold">
                TanStack Markdown · HTML renderer
              </h2>
              <p className="mt-1 leading-5">
                Synchronous HTML output. Plain code; no additional highlighter.
              </p>
            </header>
            <article className="qrk-article-document qrk-article-readonly qrk-responsive-insets">
              <h1 className="qrk-article-title">{title}</h1>
              <p className="qrk-article-subtitle">{subtitle}</p>
              <div
                aria-label="TanStack article content"
                className="qrk-article-editor qrk-tanstack-html"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </article>
          </section>
        </div>

        <details
          className="mt-6 min-w-0 rounded-lg border border-zinc-200 bg-white"
          onDragStartCapture={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onDragOverCapture={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "none";
          }}
          onDropCapture={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <summary className="cursor-pointer px-5 py-3 font-semibold">Edit with Meowdown</summary>
          <p className="border-t border-zinc-200 px-5 py-3 leading-6">
            Editing keeps Meowdown’s Markdown serialization. Both read-only panels use that output.
          </p>
          <MeowdownEditor
            initialMarkdown={articleRendererComparisonMarkdown}
            blockHandle={false}
            mode="focus"
            handleRef={editorRef}
            onDocChange={handleDocChange}
            editorClassName="qrk-article-editor"
            embedPaste={false}
            resolveXPost={resolveXPost}
            resolveYouTubeVideo={resolveYouTubeVideo}
          />
        </details>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
          <details className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <summary className="cursor-pointer px-5 py-3 font-semibold">
              Shared Markdown source
            </summary>
            <pre
              aria-label="Shared Markdown source"
              className="overflow-x-auto border-t border-zinc-200 p-5 leading-6"
            >
              {markdown}
            </pre>
          </details>
          <details className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <summary className="cursor-pointer px-5 py-3 font-semibold">
              TanStack generated HTML
            </summary>
            <pre
              aria-label="TanStack generated HTML"
              className="overflow-x-auto border-t border-zinc-200 p-5 leading-6"
            >
              {html}
            </pre>
          </details>
        </div>
      </main>
    );
  },
};
