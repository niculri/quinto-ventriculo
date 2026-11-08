import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// With the machine busy (several suites at once, or other work), a lazy page can take seconds to appear: what these
// tests look at is what it shows, not how fast. `findBy*` and `waitFor` wait this long, and still answer at once when
// it is there.
configure({ asyncUtilTimeout: 10_000 });

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// jsdom does not ship these browser APIs.
if (!window.matchMedia) {
  window.matchMedia = (q: string) =>
    ({
      matches: false,
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
window.scrollTo = () => {};
Element.prototype.scrollIntoView = () => {};
