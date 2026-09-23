import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'ea-adapter', environment: 'happy-dom' },
});
