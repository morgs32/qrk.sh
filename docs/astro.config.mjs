import mdx from '@astrojs/mdx';
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

export default defineConfig({
  integrations: [
    starlight({
      title: 'Zerospin Docs',
      sidebar: [
        {
          label: 'Zerospin',
          items: [{ label: 'Make a system', slug: 'zerospin/make-system' }],
        },
      ],
    }),
    mdx(),
  ],
});
