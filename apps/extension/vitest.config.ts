import { defineProject } from 'vitest/config';

// Tests target the Chrome-free core in src/ (dependencies injected), so no
// extension runtime or browser API polyfill is required.
export default defineProject({
  test: { name: 'extension', environment: 'happy-dom', include: ['test/**/*.test.{ts,tsx}'] },
});
