const customerLogos = [
  ['Bill', 'Bill_logo.png', 'customers'],
  ['Ramp', 'Ramp_logo.svg', 'customers/ramp'],
  ['Pleo', 'Pleo_logo.png', 'customers'],
  ['AtoB', 'AtoB_Logo.png', 'customers/atob'],
  ['Nala', 'Nala_logo.png', 'customers'],
  ['Basic Capital', 'BasicCapital_Logo.png', 'customers/basic-capital'],
] as const;

export function CustomerStrip() {
  return (
    <section
      className="customer-strip page-width"
      aria-label="Fragment customers"
    >
      {customerLogos.map(([name, image, path]) => (
        <a
          className="customer-logo"
          href={`https://fragment.dev/${path}`}
          key={name}
          aria-label={name}
        >
          <img src={`/assets/${image}`} alt={name} />
        </a>
      ))}
      <a
        className="customer-logo whop-logo"
        href="https://fragment.dev/customers/whop"
        aria-label="Whop"
      >
        <span className="whop-mark">◢◢</span> Whop
      </a>
    </section>
  );
}
