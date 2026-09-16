"use client";

import type { ReactNode } from "react";

import { followOrderedBodyHash, orderedBodyHeadingId } from "./OrderedBody";
import { useOrderedDocSections, type OrderedDocSection } from "./OrderedDoc";

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

function OutlineSections(props: {
  sections: Array<OrderedDocSection>;
}) {
  return (
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
            {children !== undefined && children.length > 0 ? (
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
            ) : null}
          </ListItem>
        );
      })}
    </ol>
  );
}

export function OrderedOutline(props: {
  sections?: Array<OrderedDocSection>;
}) {
  const registeredSections = useOrderedDocSections();
  const sections = props.sections ?? registeredSections;

  return (
    <nav aria-label="Documentation sections" className="ml-5">
      <OutlineSections sections={sections} />
    </nav>
  );
}
