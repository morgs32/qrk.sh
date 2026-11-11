import type { ReactNode } from "react";
import { Header } from "../Header";

export default function DashboardLayout(props: { children: ReactNode }) {
  const { children } = props;
  return (
    <div className="min-h-screen">
      <Header />
      {children}
    </div>
  );
}
