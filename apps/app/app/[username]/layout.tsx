import type { ReactNode } from "react";
import { ZerospinUserProvider } from "@/components/ZerospinUser";

export default function UsernameLayout(props: { children: ReactNode }) {
  const { children } = props;
  return <ZerospinUserProvider>{children}</ZerospinUserProvider>;
}
