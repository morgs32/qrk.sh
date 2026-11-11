import { type ReactNode, useId } from "react";

export function StudioSidebar(props: {
  label: string;
  sections: readonly { title: string; content: ReactNode }[];
}) {
  const { label, sections } = props;
  const id = useId();

  return (
    <aside
      className="flex w-[260px] max-w-full flex-col border-l border-sidebar-border bg-white"
      aria-label={label}
    >
      {sections.map(({ title, content }, index) => (
        <div key={title}>
          {index > 0 && <hr className="border-sidebar-border" />}
          <section aria-labelledby={`${id}-${index}`} className="flex flex-col gap-2 py-3">
            <h2 id={`${id}-${index}`} className="flex h-7 items-center px-3 text-xs font-medium">
              {title}
            </h2>
            <div className="grid gap-3 px-3">{content}</div>
          </section>
        </div>
      ))}
    </aside>
  );
}
