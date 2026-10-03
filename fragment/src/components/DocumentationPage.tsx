import { useState } from 'react';

import '../docs.css';

const topics = [
  {
    id: 'accounting', group: '1 Handbook', title: 'A Accounting 101',
    href: '/handbook/accounting-101', anchor: 'accounting-101',
    sections: [
      ['ledger-accounts', 'a. Ledger Accounts'],
      ['ledger-entries', 'b. Ledger Entries'],
      ['entry-design', 'c. Entry design'],
      ['entry-conditions', 'd. Entry conditions'],
      ['account-settings', 'e. Account settings'],
      ['transfers', 'f. Transfers'],
      ['funds-in-transit', 'g. Funds in transit'],
      ['clearing-accounts', 'h. Clearing Accounts'],
      ['next-steps', 'i. Next steps'],
    ],
  },
  {
    id: 'quickstart', group: '2 Guides', title: 'A Quickstart',
    href: '/guides/quickstart', anchor: 'quickstart',
    sections: [
      ['overview', 'a. Overview'],
      ['use-the-mcp', 'b. Use the MCP'],
      ['follow-the-guide', 'c. Follow the guide'],
    ],
  },
] as const;

export function DocumentationPage({ page, html }: { page: 'accounting' | 'quickstart'; html: string }) {
  const [copyStatus, setCopyStatus] = useState('');

  return (
    <>
      <header className="site-header">
        <div className="page-width header-inner">
          <a className="wordmark" href="/">ZEROSPIN</a>
          <nav className="header-nav" aria-label="Primary navigation">
            <a href="/guides/quickstart">Documentation</a>
          </nav>
        </div>
      </header>
      <div className="page-width docs-layout">
        <nav className="docs-nav" aria-label="Documentation">
          {topics.map(topic => (
            <div key={topic.id}>
              <a href={topic.href} aria-current={page === topic.id ? 'page' : undefined}>{topic.group}</a>
              {page === topic.id && (
                <div className="docs-nav-topic">
                  <a href={`#${topic.anchor}`}>{topic.title}</a>
                  <div className="docs-nav-sections">
                    {topic.sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
                  </div>
                </div>
              )}
            </div>
          ))}
        </nav>
        <main className={`docs-content${page === 'accounting' ? ' accounting-content' : ''}`}>
          <div
            onClick={async event => {
              const target = event.target;
              if (!(target instanceof Element)) return;
              const button = target.closest('button[data-copy-code]');
              const code = button?.parentElement?.querySelector('pre');
              if (!code) return;
              try {
                await navigator.clipboard.writeText(code.textContent ?? '');
                setCopyStatus('Copied to clipboard.');
              } catch {
                setCopyStatus('Could not copy. Select the code and copy it manually.');
              }
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
          <p className="docs-copy-status" role="status">{copyStatus}</p>
        </main>
      </div>
    </>
  );
}
