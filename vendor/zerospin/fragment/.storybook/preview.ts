import type { Preview } from '@storybook/tanstack-react';

import '../src/styles.css';

const preview: Preview = {
  decorators: [
    Story => {
      document.documentElement.classList.add('fragment-appearance');
      return Story();
    },
  ],
};

export default preview;
