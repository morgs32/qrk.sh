import type { ReactNode } from "react";

import outlineCss from "./OrderedOutline.css?inline";

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

function ListItem(props: { children: ReactNode; tone: string }) {
  const { children, tone } = props;
  return <li className={tone === "muted" ? "tone-muted" : "tone-active"}>{children}</li>;
}

export function OrderedOutline() {
  return (
    <nav aria-label="Documentation sections" className="ordered-outline">
      <style>{outlineCss}</style>
      <ol className="list-level-one">
        {sections.map((section) => {
          const years = "years" in section ? section.years : undefined;
          return (
            <ListItem key={section.label} tone={section.tone}>
              {section.label}
              {years !== undefined && (
                <ol className="list-level-two">
                  {years.map((year) => {
                    const months = "months" in year ? year.months : undefined;
                    return (
                      <ListItem key={year.label} tone={year.tone}>
                        {year.label}
                        {months !== undefined && (
                          <ol className="list-level-three">
                            {months.map((month) => (
                              <ListItem key={month.label} tone={month.tone}>
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
