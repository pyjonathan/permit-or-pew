// Command-line runner for the same tests: node tests/run-node.mjs
// The browser runner (tests/index.html) is the supported path; this is a convenience for quick checks.
import { runAll } from './harness.js';

await import('./acl.test.js');
await import('./content.test.js');
await import('./briefing.test.js');
await import('./feedback.test.js');
await import('./results.test.js');
await import('./sounds.test.js');
await import('./loop.test.js');
await import('./state.test.js');
await import('./waves.test.js');

const result = await runAll();
if (result.total === 0) {
  console.log('FAIL: no tests were discovered.');
  process.exit(1);
}
for (const f of result.failed) console.log(`FAIL ${f.id}: ${f.error}`);
console.log(`${result.failed.length ? 'FAIL' : 'PASS'}: ${result.passed} of ${result.total} tests passed.`);
process.exit(result.failed.length ? 1 : 0);
