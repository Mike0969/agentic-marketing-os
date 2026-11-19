// Preloaded for every test file: tests must never reach the network. A test that needs
// HTTP passes its own fake fetch (tests/helpers/harness.ts withEnv).
globalThis.fetch = async (u) => {
  throw new Error(`unexpected network call in test: ${String(u instanceof Request ? u.url : u)}`);
};
