import { OrderedOutline } from "../../library/OrderedOutline";

export default function OrderedOutlinePage() {
  return (
    <main className="min-h-screen bg-[#f7f7f7] px-7 py-6 font-mono text-base leading-[1.25] tracking-[-0.02em]">
      <OrderedOutline
        sections={[
          { label: "Module", tone: "active" },
          {
            label: "Previews",
            tone: "active",
            children: [
              { label: "sm", tone: "active" },
              { label: "md", tone: "active" },
              { label: "lg", tone: "active" },
              { label: "xl", tone: "active" },
            ],
          },
          { label: "Generate spec", tone: "active" },
          { label: "Configuration", tone: "active" },
          { label: "Options", tone: "active" },
          { label: "Brick Definition", tone: "active" },
        ]}
      />
    </main>
  );
}
