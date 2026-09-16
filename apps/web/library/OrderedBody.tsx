import type { ReactNode } from "react";

export function OrderedBody(props: {
  children: ReactNode;
  showListDecorator?: boolean;
  showAnchors?: boolean;
}) {
  const { children, showListDecorator = true, showAnchors = false } = props;
  const outerListPadding = showListDecorator ? "pl-[29px] max-[480px]:pl-8" : "pl-0";
  const anchorsClassName = showAnchors
    ? "[&_h2]:after:ml-[9px] [&_h2]:after:content-['#'] [&_h2]:after:text-neutral-400"
    : "";

  return (
    <ol
      className={`list-outside marker:font-mono marker:text-neutral-400 ${outerListPadding} ${
        showListDecorator ? "list-[upper-alpha]" : "list-none"
      } ${anchorsClassName}`}
    >
      {children}
    </ol>
  );
}
