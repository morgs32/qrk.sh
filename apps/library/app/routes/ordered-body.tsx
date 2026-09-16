import { createFileRoute } from "@tanstack/react-router";

import { OrderedBody } from "../../components/OrderedBody";

export const Route = createFileRoute("/ordered-body")({
  ssr: false,
  component: OrderedBodyPage,
});

export default function OrderedBodyPage() {
  return <OrderedBody />;
}
