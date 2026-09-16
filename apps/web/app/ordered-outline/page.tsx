import type { ReactNode } from "react";

const sections = [
  { label: "Handbook", tone: "active" },
  { label: "Guides", tone: "active" },
  { label: "Reference", tone: "muted" },
  {
    label: "Changelog",
    tone: "active",
    years: [
      { label: "2026", tone: "muted" },
      {
        label: "2025",
        tone: "active",
        months: [
          { label: "December", tone: "active" },
          { label: "November", tone: "muted" },
          { label: "October", tone: "muted" },
          { label: "September", tone: "muted" },
          { label: "August", tone: "muted" },
          { label: "July", tone: "muted" },
          { label: "June", tone: "muted" },
          { label: "May", tone: "muted" },
          { label: "April", tone: "muted" },
          { label: "March", tone: "muted" },
          { label: "February", tone: "muted" },
          { label: "January", tone: "muted" },
        ],
      },
      { label: "2024", tone: "muted" },
      { label: "2023", tone: "active" },
      { label: "2022", tone: "active" },
    ],
  },
];

const listItemBaseClassName =
  "relative whitespace-nowrap [counter-increment:item] before:absolute before:right-[calc(100%+0.65rem)] before:text-neutral-400";

const listItemLevelClassName = {
  1: "before:[content:counter(item,decimal)]",
  2: "before:[content:counter(item,upper-alpha)]",
  3: 'before:[content:counter(item,lower-alpha)_"."]',
};

function ListItem(props: { children: ReactNode; tone: string; level: 1 | 2 | 3 }) {
  const { children, tone, level } = props;
  const toneClassName = tone === "muted" ? "text-neutral-400" : "text-neutral-900";
  return (
    <li className={`${listItemBaseClassName} ${listItemLevelClassName[level]} ${toneClassName}`}>
      {children}
    </li>
  );
}

function OrderedOutline() {
  return (
    <nav aria-label="Documentation sections" className="ml-5">
      <ol className="m-0 list-none p-0 [counter-reset:item] [&>li:nth-child(4)]:mt-0">
        {sections.map((section) => {
          const years = "years" in section ? section.years : undefined;
          return (
            <ListItem key={section.label} tone={section.tone} level={1}>
              {section.label}
              {years !== undefined && (
                <ol className="mt-5 list-none p-0 pl-5 [counter-reset:item] [&>li:nth-child(2)]:mb-0 [&>li:nth-child(3)]:mt-5">
                  {years.map((year) => {
                    const months = "months" in year ? year.months : undefined;
                    return (
                      <ListItem key={year.label} tone={year.tone} level={2}>
                        {year.label}
                        {months !== undefined && (
                          <ol className="mt-0 list-none p-0 pl-5 [counter-reset:item]">
                            {months.map((month) => (
                              <ListItem key={month.label} tone={month.tone} level={3}>
                                {month.label}
                              </ListItem>
                            ))}
                          </ol>
                        )}
                      </ListItem>
                    );
                  })}
                </ol>
              )}
            </ListItem>
          );
        })}
      </ol>
    </nav>
  );
}

export default function OrderedOutlinePage() {
  return (
    <main className="min-h-screen bg-[#f7f7f7] px-7 py-6 font-mono text-base leading-[1.25] tracking-[-0.02em]">
      <OrderedOutline />
    </main>
  );
}
