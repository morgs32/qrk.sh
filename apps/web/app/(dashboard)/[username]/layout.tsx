import { ZerospinOwnerProvider } from "@/components/ZerospinOwner";
import { Header } from "./Header";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ZerospinOwnerProvider>
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="mt-16 flex-1 p-6">{children}</main>
      </div>
    </ZerospinOwnerProvider>
  );
}
