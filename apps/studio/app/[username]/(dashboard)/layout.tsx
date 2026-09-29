import type { ReactNode } from "react";
import { Header } from "../Header";
import UserLayout from "../UserLayout";

export default function DashboardLayout(props: { children: ReactNode }) {
  const { children } = props;
  return (
    <div className="min-h-screen pt-16">
      <Header />
      <UserLayout>{children}</UserLayout>
    </div>
  );
}
