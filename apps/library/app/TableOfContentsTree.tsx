const entries = [
  { id: "getting-started", label: "Getting started", branch: "", section: "01" },
  { id: "introduction", label: "Introduction", branch: "├ ", section: "" },
  { id: "quickstart", label: "Quickstart", branch: "└ ", section: "" },
  { id: "installation", label: "Installation", branch: "  ├ ", section: "" },
  { id: "first-page", label: "Your first page", branch: "  └ ", section: "" },
  { id: "building", label: "Building your site", branch: "", section: "02" },
  { id: "pages", label: "Pages", branch: "├ ", section: "" },
  { id: "layouts", label: "Layouts", branch: "│ ├ ", section: "" },
  { id: "navigation", label: "Navigation", branch: "│ └ ", section: "" },
  { id: "bricks", label: "Bricks", branch: "└ ", section: "" },
  { id: "text", label: "Text", branch: "  ├ ", section: "" },
  { id: "images", label: "Images", branch: "  └ ", section: "" },
  { id: "publishing", label: "Publishing", branch: "", section: "03" },
  { id: "domains", label: "Custom domains", branch: "└ ", section: "" },
];

/** Fixture-backed contents styled like a compact, ruled directory tree. */
export function TableOfContentsTree() {
  return (
    <section
      aria-label="Table of contents"
      className="qrk-bricks w-full min-w-0 bg-zinc-50 p-4 font-mono"
    >
      <h2 className="mb-1 font-normal">Contents</h2>
      <ol className="m-0 list-none border-x border-t border-zinc-300 p-0">
        {entries.map((entry) => (
          <li key={entry.id} className="flex min-w-0 border-b border-zinc-300 bg-zinc-100/70 px-1">
            <span aria-hidden="true" className="shrink-0 whitespace-pre">
              {entry.section ? `${entry.section} ` : `   ${entry.branch}`}
            </span>
            <span className="min-w-0 break-words">{entry.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
