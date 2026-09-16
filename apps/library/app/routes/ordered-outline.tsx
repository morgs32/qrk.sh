import { createFileRoute } from "@tanstack/react-router";

import { OrderedOutline } from "../../components/OrderedOutline";

export const Route = createFileRoute("/ordered-outline")({
  component: OrderedOutlinePage,
});

export default function OrderedOutlinePage() {
  return (
    <main className="ordered-outline-page">
      <OrderedOutline />
    </main>
  );
}
