process.env.NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY ??= 'pk_test_vitest';

// React concurrent tests (jsdom): supports act(...) from RTL / React hooks.
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
