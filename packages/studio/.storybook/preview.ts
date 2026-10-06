import type { Preview } from '@storybook/react-vite';
import { mswLoader } from 'msw-storybook-addon/csf3';
import { setupWorker } from 'msw/browser';
import { HttpNetworkFrame } from 'msw/experimental';

import '../src/styles.css';

const preview: Preview = {
  loaders: [
    mswLoader(async () => {
      const worker = setupWorker();
      await worker.start({
        quiet: true,
        onUnhandledFrame({ frame }) {
          if (frame instanceof HttpNetworkFrame) {
            const pathname = new URL(frame.data.request.url).pathname;
            if (pathname === '/api' || pathname.startsWith('/api/')) {
              throw new Error(
                `Unexpected application API request: ${frame.data.request.method} ${pathname}`,
              );
            }
          }
        },
      });
      return worker;
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    viewport: {
      options: {
        desktop: {
          name: 'Desktop (1280px)',
          styles: { width: '1280px', height: '900px' },
          type: 'desktop',
        },
        mobile: {
          name: 'Mobile (390px)',
          styles: { width: '390px', height: '844px' },
          type: 'mobile',
        },
        narrow: {
          name: 'Narrow (280px)',
          styles: { width: '280px', height: '844px' },
          type: 'mobile',
        },
      },
    },
  },
};

export default preview;
