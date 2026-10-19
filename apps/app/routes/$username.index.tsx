import { createFileRoute } from "@tanstack/react-router";
import DashboardLayout from "@/app/[username]/(dashboard)/layout";
import UsernameDashboardPage from "@/app/[username]/(dashboard)/page";

export const Route = createFileRoute("/$username/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <DashboardLayout>
      <UsernameDashboardPage />
    </DashboardLayout>
  );
}
