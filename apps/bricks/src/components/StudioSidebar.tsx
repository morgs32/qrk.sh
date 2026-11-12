import { type ReactNode, useId } from "react";

export function StudioSidebar(
  props: { label: string } & (
    | {
        sections: readonly { title: string; content: ReactNode }[];
        embedded?: boolean;
        header?: never;
        children?: never;
      }
    | { sections?: never; embedded?: never; header: ReactNode; children: ReactNode }
  ),
) {
  const { label, sections, embedded = false, header, children } = props;
  const id = useId();

  if (sections === undefined) {
    return (
      <aside
        aria-label={label}
        className="flex h-full min-h-0 w-[320px] max-w-[50%] min-w-0 shrink-0 flex-col border-l border-sidebar-border bg-white text-sidebar-foreground"
      >
        <header className="shrink-0 overflow-x-auto border-b border-sidebar-border px-3">
          {header}
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
      </aside>
    );
  }

  const Panel = embedded ? "section" : "aside";

  return (
    <Panel
      className={
        embedded
          ? "flex min-w-0 flex-col"
          : "flex w-[300px] max-w-full flex-col border-l border-sidebar-border bg-white"
      }
      aria-label={label}
    >
      {sections.map(({ title, content }, index) => (
        <section
          key={title}
          aria-labelledby={`${id}-${index}`}
          className="flex flex-col gap-2 border-b border-sidebar-border py-3"
        >
          <h2 id={`${id}-${index}`} className="flex h-7 items-center px-3 text-xs font-medium">
            {title}
          </h2>
          <div className="grid gap-3 px-3">{content}</div>
        </section>
      ))}
    </Panel>
  );
}
