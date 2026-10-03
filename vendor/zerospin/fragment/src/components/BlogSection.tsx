import './BlogSection.css';

const posts = [
  ['Payment Accounts', 'payment-accounts', 'payment'],
  ['The FRAGMENT MCP', 'fragment-mcp', 'accounts'],
  [
    'Building Balances II: High-throughput writes',
    'building-balances-high-throughput-writes',
    'balances',
  ],
  ['Money is Multiplayer', 'money-is-multiplayer', 'money'],
] as const;

export function BlogSection() {
  return (
    <section className="editorial page-width" aria-labelledby="blog-title">
      <div className="section-heading">
        <h2 id="blog-title" className="section-title">
          Blog
        </h2>
        <a href="https://fragment.dev/blog">Blog →</a>
      </div>
      <div className="post-row horizontal-track">
        {posts.map(([title, slug, art]) => (
          <a
            href={`https://fragment.dev/blog/${slug}`}
            className="post-card"
            key={title}
          >
            <div className={`post-art post-art-${art}`} aria-hidden="true">
              <BlogArt kind={art} />
            </div>
            <span>{title}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

function BlogArt({ kind }: { kind: string }) {
  if (kind === 'payment') return <span className="pay-pill">Pay $100</span>;
  if (kind === 'accounts') {
    return (
      <div className="account-tree">
        Accounts
        <br />🟢 assets
        <br />
        &nbsp; ├ cash
        <br />
        &nbsp; └ receivables
        <br />
        &nbsp;&nbsp;&nbsp; └ user
        <br />🔴 liabilities
        <br />
        &nbsp; └ payables
      </div>
    );
  }
  if (kind === 'balances') {
    return (
      <span className="balance-glyphs">
        24$ 2ɟ 2ɟ
        <br />
        18¥ 15฿ Ⅴ9$
      </span>
    );
  }
  return <span className="money-glyph">$</span>;
}
