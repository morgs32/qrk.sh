import type { ReactNode } from "react";

export function Link(props: {
  href: string | undefined;
  children?: ReactNode;
  className?: string;
}) {
  const { className, href, children } = props;
  return (
    <a className={className} href={href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  );
}
