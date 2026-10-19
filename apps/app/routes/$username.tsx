import { createFileRoute, Outlet } from "@tanstack/react-router";
import UsernameLayout from "@/app/[username]/layout";

export const Route = createFileRoute("/$username")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <UsernameLayout>
      <Outlet />
    </UsernameLayout>
  );
}
