"use client";

import { createContext, useContext, type MouseEvent, type ReactNode } from "react";

const OrderedBodyAnchorsContext = createContext(false);

export function OrderedBody(props: {
  children: ReactNode;
  showListDecorator?: boolean;
  showAnchors?: boolean;
}) {
  const { children, showListDecorator = true, showAnchors = false } = props;
  const outerListPadding = showListDecorator ? "pl-[29px] max-[480px]:pl-8" : "pl-0";

  return (
    <OrderedBodyAnchorsContext value={showAnchors}>
      <ol
        className={`list-outside marker:font-mono marker:text-neutral-400 ${outerListPadding} ${
          showListDecorator ? "list-[upper-alpha]" : "list-none"
        }`}
      >
        {children}
      </ol>
    </OrderedBodyAnchorsContext>
  );
}

export function orderedBodyHeadingId(label: string) {
  return label.toLowerCase().replaceAll(" ", "-");
}

export function followOrderedBodyHash(event: MouseEvent<HTMLAnchorElement>) {
  const href = event.currentTarget.getAttribute("href");
  if (href === null || !href.startsWith("#") || href.length < 2) return;
  event.preventDefault();
  event.stopPropagation();
  const id = decodeURIComponent(href.slice(1));
  document.getElementById(id)?.scrollIntoView();
  window.history.replaceState(null, "", href);
}

export function OrderedBodyHeading(props: { children: string; className?: string }) {
  const showAnchors = useContext(OrderedBodyAnchorsContext);
  const id = orderedBodyHeadingId(props.children);

  return (
    <h2
      className={`m-0 flex scroll-mt-4 items-baseline gap-[9px] font-normal ${props.className ?? ""}`}
      id={id}
    >
      <span>{props.children}</span>
      {showAnchors ? (
        <a
          aria-label={`${props.children} permalink`}
          className="-ml-0.5 text-neutral-400 no-underline"
          href={`#${id}`}
          onClick={followOrderedBodyHash}
        >
          #
        </a>
      ) : null}
    </h2>
  );
}
