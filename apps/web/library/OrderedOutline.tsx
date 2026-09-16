import type { ReactNode } from "react";

import { followOrderedBodyHash, orderedBodyHeadingId } from "./OrderedBody";

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

export function OrderedOutline(props: {
  sections: Array<{
    label: string;
    tone: string;
    children?: Array<{ label: string; tone: string }>;
  }>;
}) {
  return (
    <nav aria-label="Documentation sections" className="ml-5">
      <ol className="m-0 list-none p-0 [counter-reset:item]">
        {props.sections.map((section) => {
          const children = section.children;
          return (
            <ListItem key={section.label} tone={section.tone} level={1}>
              <a
                className="text-inherit no-underline"
                href={`#${orderedBodyHeadingId(section.label)}`}
                onClick={followOrderedBodyHash}
              >
                {section.label}
              </a>
              {children !== undefined && (
                <ol className="list-none p-0 pl-5 [counter-reset:item]">
                  {children.map((child) => (
                    <ListItem key={child.label} tone={child.tone} level={2}>
                      <a
                        className="text-inherit no-underline"
                        href={`#${orderedBodyHeadingId(child.label)}`}
                        onClick={followOrderedBodyHash}
                      >
                        {child.label}
                      </a>
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
