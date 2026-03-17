import '@testing-library/jest-dom';

// React Flow requires ResizeObserver in jsdom
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// React Flow uses crypto.randomUUID internally
Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID: () => 'test-uuid' },
  configurable: true,
});
