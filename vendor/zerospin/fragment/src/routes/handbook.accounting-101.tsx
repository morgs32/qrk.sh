import { createFileRoute } from '@tanstack/react-router';

import { DocumentationPage } from '../components/DocumentationPage';
import accountingHtml from '../content/accounting-101.html?raw';
import '../content/accounting-101.css';

export const Route = createFileRoute('/handbook/accounting-101')({
  head: () => ({ meta: [{ title: 'Accounting 101 | Fragment Docs' }] }),
  component: () => <DocumentationPage page="accounting" html={accountingHtml} />,
});
