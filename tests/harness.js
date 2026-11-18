// Dependency-free test helpers. Works in the browser (tests/index.html) and in Node (tests/run-node.mjs).
const registered = [];

export function test(id, fn) {
  registered.push({ id, fn });
}

export function assert(condition, message = 'assertion failed') {
  if (!condition) throw new Error(message);
}

export function assertEqual(actual, expected, message = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message} expected ${e} but got ${a}`.trim());
}

export async function runAll() {
  const failed = [];
  let passed = 0;
  for (const { id, fn } of registered) {
    try {
      await fn();
      passed += 1;
    } catch (error) {
      failed.push({ id, error: error.message });
    }
  }
  return { total: registered.length, passed, failed };
}
