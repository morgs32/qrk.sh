import type { ReactNode } from "react";

export function OrderedBody(props: {
  children: ReactNode;
  showListDecorator?: boolean;
}) {
  const { children, showListDecorator = true } = props;
  const outerListPadding = showListDecorator ? "pl-[29px] max-[480px]:pl-8" : "pl-0";

  return (
    <ol
      className={`list-outside marker:font-mono marker:text-neutral-400 ${outerListPadding} ${
        showListDecorator ? "list-[upper-alpha]" : "list-none"
      }`}
    >
      {children}
    </ol>
  );
}
