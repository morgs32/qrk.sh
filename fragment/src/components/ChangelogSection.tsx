import './ChangelogSection.css';

const changes = [
  ['Aug', 'Mini Batch', 'august-2026'],
  ['Jul', 'FRAGMENT MCP Server', 'july-2026'],
  ['Jun', 'Roles & Permissions', 'june-2026'],
  ['May', 'Small Improvements', 'may-2026'],
  ['Apr', 'Strongly Consistent Parent Balances', 'april-2026'],
  ['Mar', 'Line Tags', 'march-2026'],
] as const;

export function ChangelogSection() {
  return (
    <section
      className="editorial changelog page-width"
      aria-labelledby="changelog-title"
    >
      <div className="section-heading">
        <h2 id="changelog-title" className="section-title">
          Changelog
        </h2>
        <a href="https://fragment.dev/changelog">Changelog →</a>
      </div>
      <div className="change-row horizontal-track">
        {changes.map(([month, title, hash]) => (
          <a
            className="change-card"
            href={`https://fragment.dev/changelog/2026#${hash}`}
            key={month}
          >
            <span className="month-tile">{month}</span>
            <span className="change-title">{title}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
