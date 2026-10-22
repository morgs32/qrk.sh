import { createFileRoute, Outlet } from "@tanstack/react-router";
import UserLayout from "@/app/[username]/layout";

export const Route = createFileRoute("/$username")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <UserLayout>
      <Outlet />
    </UserLayout>
  );
}
