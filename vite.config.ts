import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './', // relative assets — works at any path/domain (GitHub Pages, custom domain)
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        lesson: resolve(__dirname, 'lesson.html'),
      },
    },
  },
});
