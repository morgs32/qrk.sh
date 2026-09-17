import type { ReactNode } from "react";

export function Link(props: {
  href: string | undefined;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <a
      className={props.className}
      href={props.href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {props.children}
    </a>
  );
}
