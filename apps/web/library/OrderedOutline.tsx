import type { ReactNode } from "react";

const sections = [
  { label: "Module", tone: "active" },
  {
    label: "Previews",
    tone: "active",
    children: [
      { label: "sm", tone: "active" },
      { label: "md", tone: "active" },
      { label: "lg", tone: "active" },
      { label: "xl", tone: "active" },
    ],
  },
  { label: "Generate spec", tone: "active" },
  { label: "Configuration", tone: "active" },
  { label: "Options", tone: "active" },
  { label: "Brick definition", tone: "active" },
];

const listItemBaseClassName =
  "relative whitespace-nowrap [counter-increment:item] before:absolute before:right-[calc(100%+0.65rem)] before:text-neutral-400";

const listItemLevelClassName = {
  1: "before:[content:counter(item,decimal)]",
  2: "before:[content:counter(item,upper-alpha)]",
  3: 'before:[content:counter(item,lower-alpha)_"."]',
};

function ListItem(props: { children: ReactNode; tone: string; level: 1 | 2 | 3 }) {
  const { children, tone, level } = props;
  const toneClassName = tone === "muted" ? "text-neutral-400" : "text-neutral-900";
  return (
    <li className={`${listItemBaseClassName} ${listItemLevelClassName[level]} ${toneClassName}`}>
      {children}
    </li>
  );
}

export function OrderedOutline() {
  return (
    <nav aria-label="Documentation sections" className="ml-5">
      <ol className="m-0 list-none p-0 [counter-reset:item]">
        {sections.map((section) => {
          const children = "children" in section ? section.children : undefined;
          return (
            <ListItem key={section.label} tone={section.tone} level={1}>
              {section.label}
              {children !== undefined && (
                <ol className="mt-5 list-none p-0 pl-5 [counter-reset:item]">
                  {children.map((child) => (
                    <ListItem key={child.label} tone={child.tone} level={2}>
                      {child.label}
                    </ListItem>
                  ))}
                </ol>
              )}
            </ListItem>
          );
        })}
      </ol>
    </nav>
  );
}
