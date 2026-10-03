import { createFileRoute } from '@tanstack/react-router';

import { DocumentationPage } from '../components/DocumentationPage';
import quickstartHtml from '../content/quickstart.html?raw';

export const Route = createFileRoute('/guides/quickstart')({
  head: () => ({ meta: [{ title: 'Quickstart | Fragment Docs' }] }),
  component: () => <DocumentationPage page="quickstart" html={quickstartHtml} />,
});
