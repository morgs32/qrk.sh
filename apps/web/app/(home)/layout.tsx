import { Suspense } from "react";
import { Header } from "./Header";

export default function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="h-screen overflow-hidden">
      <Header />

      <Suspense fallback={null}>{children}</Suspense>
    </div>
  );
}
