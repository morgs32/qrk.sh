import { createFileRoute } from "@tanstack/react-router";
import DashboardLayout from "@/app/[username]/(dashboard)/layout";
import SettingsPage from "@/app/[username]/(dashboard)/settings/page";

export const Route = createFileRoute("/$username/settings")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <DashboardLayout>
      <SettingsPage />
    </DashboardLayout>
  );
}
