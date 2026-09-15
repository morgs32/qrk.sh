import { Outlet } from "react-router";
import { ZerospinUserProvider } from "@/components/ZerospinUser";

export default function UsernameLayout() {
  return (
    <ZerospinUserProvider>
      <Outlet />
    </ZerospinUserProvider>
  );
}
