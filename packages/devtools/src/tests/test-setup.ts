import '@testing-library/jest-dom/vitest';

class ResizeObserverMock {
  observe() {
    /* mock */
  }
  unobserve() {
    /* mock */
  }
  disconnect() {
    /* mock */
  }
}

globalThis.ResizeObserver = ResizeObserverMock;
