import { useEffect, useState } from 'react';

import { createFileRoute } from '@tanstack/react-router';

import { CommandChain } from '../components/CommandChain';
import { initialCommandRows } from '../components/commandChainRows';
import { CompactTable } from '../components/CompactTable';
import { HeaderNavigation } from '../components/HeaderNavigation';
import { Link } from '../components/Link';
import { HeroHeadline } from '../components/string-replace/HeroHeadline';

export const Route = createFileRoute('/')({ component: Home });
type Theme = 'light' | 'dark' | 'system';

function Home() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    const saved = localStorage.getItem('fragment-theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      setTheme(saved);
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  function chooseTheme(next: Theme) {
    setTheme(next);
    localStorage.setItem('fragment-theme', next);
  }

  return (
    <>
      <header className="site-header">
        <div className="page-width header-inner">
          <a className="wordmark" href="/" aria-label="ZEROSPIN homepage">
            ZEROSPIN
          </a>
          <HeaderNavigation />
        </div>
      </header>

      <main>
        <section className="hero page-width">
          <h1>
            <HeroHeadline />
          </h1>
        </section>

        <section
          className="features page-width"
          aria-labelledby="features-title"
        >
          <div className="features-heading">
            <h2 id="features-title" className="section-title">
              Parallel models from your command chain
            </h2>
            <Link
              className="stage-link"
              underlined={false}
              withIcon
              href="https://martinfowler.com/eaaDev/ParallelModel.html"
            >
              More about parallel models
            </Link>
          </div>
          <div className="feature-grid">
            <div
              className="feature-row"
              role="group"
              aria-label="Feature cards, first row"
            >
              <FeatureCard
                title="Projection v1"
                description='V1 did not have an "assignee" relationship. That got added in v2! This projection doesn&apos;t care and lives forever!'
                kind="schema"
              />
              <FeatureCard
                title="Projection v2"
                description="V2 didn't have comments. We put them on V3 and blue-green the frontend implementation while production frontend is happily on V2."
                kind="mcp"
              />
              <FeatureCard
                title="Projection v3"
                description="V3 has it all."
                kind="projection-v3"
              />
            </div>
            <div>
              <div className="features-heading">
                <h2 className="section-title">
                  The command chain is the event source
                </h2>
                <Link
                  className="stage-link"
                  underlined={false}
                  withIcon
                  href="https://martinfowler.com/eaaDev/EventSourcing.html"
                >
                  More about event sourcing
                </Link>
              </div>
              <div
                className="feature-row"
                role="group"
                aria-label="Feature cards, second row"
              >
                <FeatureCard
                  title="Parallel chain v1"
                  description="Authorize transactions directly from the ledger."
                  kind="command-chain"
                />
                <FeatureCard
                  title="Parallel chain V2"
                  description="Generate an SDK from your schema, so config and code never drift."
                  kind="command-chain"
                />
                <FeatureCard
                  title="Parallel chain V3"
                  description="Every transfer balanced. Every balance correct."
                  kind="command-chain"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="editorial page-width">
          <div className="quote-row horizontal-track">
            <a
              className="quote-card"
              href="https://fragment.dev/customers/whop"
            >
              <div>
                <h3>Synchronous WASM SQLite</h3>
                <p>
                  That's right. no more stale data with <code>useSWR</code> or{' '}
                  <code>useQuery</code>. The data is already on the client.
                  Local first baby!
                </p>
              </div>
              <span className="card-arrow">→</span>
            </a>
            <a
              className="quote-card"
              href="https://fragment.dev/customers/ramp"
            >
              <div>
                <h3>The durable objects are cheap</h3>
                <p>
                  Fight inflation with Cloudflare. ZEROSPIN manages a projection
                  of your chain per user, per version.
                </p>
              </div>
              <span className="card-arrow">→</span>
            </a>
            <a
              className="quote-card"
              href="https://fragment.dev/customers/basic-capital"
            >
              <div>
                <h3>It works offline.</h3>
                <p>Should have led with that?</p>
              </div>
              <span className="card-arrow">→</span>
            </a>
          </div>
        </section>

        <section
          className="features page-width"
          aria-labelledby="more-features-title"
        >
          <div className="features-heading">
            <h2 id="more-features-title" className="section-title">
              Give your team a ubiquitous language
            </h2>
            <Link
              className="stage-link"
              underlined={false}
              withIcon
              href="https://www.youtube.com/watch?v=pMuiVlnGqjk"
            >
              Learn more about domain-driven design
            </Link>
          </div>
          <div
            className="feature-row"
            role="group"
            aria-label="Feature cards, third row"
          >
            <FeatureCard
              title="Contracts"
              description="EffectTS for peace of mind"
              kind="conditions"
            />
            <FeatureCard
              title="Models"
              description="Generate an SDK from your schema, so config and code never drift."
              kind="sdk"
            />
            <FeatureCard
              title="Aggregates"
              description="Every transfer balanced. Every balance correct."
              kind="entry"
            />
            <FeatureCard
              title="Aggregates"
              description="Every transfer balanced. Every balance correct."
              kind="entry"
            />
          </div>
        </section>

        <section className="intro page-width">
          <div className="intro-copy">
            <h2>The full stack state management library</h2>
            <p className="intro-subtitle">
              Zerospin unifies your entire web development workflow into a
              single, powerful, versioned system. Think of it like a full-stack
              state management framework.
            </p>
          </div>
        </section>

        <section className="final-cta page-width">
          <div>
            <h2>Heaven for developers. Happiness for users.</h2>
            <a
              className="button button-dark"
              href="https://fragment.dev/get-access"
            >
              Try it for yourself
            </a>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="page-width footer-layout">
          <div className="footer-copyright">© Zerospin 2026</div>
          <div className="footer-column">
            <h3>Documentation</h3>
            <a href="/handbook/accounting-101">1 Handbook</a>
            <a href="/guides/quickstart">2 Guides</a>
          </div>
          <div className="footer-column">
            <h3>Links</h3>
            <a href="https://www.github.com/morgs32/zerospin">GitHub ↗</a>
          </div>
          <div className="theme-switch" aria-label="Color theme">
            {(['light', 'dark', 'system'] as const).map(option => (
              <button
                key={option}
                type="button"
                onClick={() => chooseTheme(option)}
                aria-pressed={theme === option}
              >
                <span aria-hidden="true">{theme === option ? '●' : '○'}</span>{' '}
                {option[0].toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </footer>
    </>
  );
}

function FeatureCard({
  title,
  description,
  kind,
}: {
  title: string;
  description: string;
  kind: string;
}) {
  return (
    <article className="feature-card">
      <div className="feature-visual">
        <h3>{title}</h3>
        <FeatureArt kind={kind} />
      </div>
      <p>{description}</p>
    </article>
  );
}

function FeatureArt({ kind }: { kind: string }) {
  if (kind === 'command-chain') {
    return (
      <div className="parallel-chain-art">
        <CommandChain initialRows={initialCommandRows} />
      </div>
    );
  }

  if (kind === 'schema' || kind === 'mcp' || kind === 'projection-v3') {
    return (
      <div className="projection-art">
        <CompactTable
          caption={kind === 'schema' ? 'List v1' : 'List v2'}
          rows={[
            { id: 'invoice', label: '◉ Send Invoice', assignee: 'Jordan' },
            {
              id: 'compliance',
              label: 'Get SOC compliant',
              assignee: 'Leslie',
              icon: '✓',
            },
            {
              id: 'documentation',
              label: 'Finish documentation',
              assignee: 'Jordan',
              icon: '✓',
            },
            {
              id: 'hackathon',
              label: 'Host hackathon',
              assignee: 'Leslie',
              icon: '✓',
            },
            {
              id: 'publicist',
              label: 'Hire publicist',
              assignee: 'Jordan',
              icon: '✓',
            },
          ].map(row => ({
            ...row,
            assignee: kind === 'schema' ? undefined : row.assignee,
          }))}
        />
        {kind === 'projection-v3' && (
          <table className="compact-table">
            <caption>Comments v1</caption>
            <thead>
              <tr>
                <th scope="col">Task</th>
                <th scope="col">Comment</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Send Invoice</th>
                <td>Ready to send?</td>
              </tr>
              <tr>
                <th scope="row">Send Invoice</th>
                <td>Looks good!</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    );
  }
  if (kind === 'conditions') {
    return (
      <div className="condition-art">
        <span>＋200</span>
        <span>assets/cash $</span>
        <strong>2,500</strong>
      </div>
    );
  }
  if (kind === 'sdk') {
    return (
      <div className="sdk-art">
        fragment.<span>PostCardTopUp</span>(<br />
        &nbsp;&nbsp;amount: <em>2500</em>, card_id: ...
        <br />)
      </div>
    );
  }
  return (
    <div className="entry-art">
      <span className="muted">Entry</span>
      <div>◉ Card Auth</div>
      <div>
        🟢 assets/cash <span>$80</span>
      </div>
      <div>
        🔴 liabilities/payable <span>$30</span>
      </div>
      <div>
        🔹 income/sales <span>$60</span>
      </div>
      <div>
        🟡 expense/fees <span>$10</span>
      </div>
    </div>
  );
}
