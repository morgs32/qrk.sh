const sections = [
  {
    label: "Handbook",
    entries: ["Accounting 101", "Funds Flows"],
  },
  {
    label: "Guides",
    entries: [
      "Quickstart",
      "Embed in CI",
      "Post Ledger Entries",
      "Sync payments",
      "Reconcile payments",
      "Reverse Ledger Entries",
      "Store metadata",
      "Read balances",
      "Query data",
      "Generate reports",
      "Configure consistency",
      "Handle currencies",
      "Group Ledger Entries",
      "Import data",
      "Migrate data",
      "Export to S3",
    ],
  },
  { label: "Reference", entries: [] },
  { label: "Changelog", entries: [] },
];

/** Fixture-backed contents with numbered sections and lettered entries. */
export function OrderedTableOfContents() {
  return (
    <section
      aria-label="Table of contents"
      className="qrk-bricks w-full min-w-0 bg-zinc-100 p-4 font-mono text-sm leading-5 text-zinc-900"
    >
      <ol className="m-0 list-none p-0">
        {sections.map((section, sectionIndex) => (
          <li key={section.label}>
            <div className="flex items-baseline gap-[1ch]">
              <span aria-hidden="true" className="shrink-0 text-zinc-400">
                {sectionIndex + 1}
              </span>
              <span className="min-w-0 break-words">{section.label}</span>
            </div>
            {section.entries.length > 0 && (
              <ol type="A" className="my-5 ml-[2ch] list-none p-0">
                {section.entries.map((entry, entryIndex) => (
                  <li key={entry} className="break-words">
                    <span aria-hidden="true" className="mr-[1ch] text-zinc-400">
                      {String.fromCharCode(65 + entryIndex)}
                    </span>
                    {entry}
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
