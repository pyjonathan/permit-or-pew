import { test, assert, assertEqual } from './harness.js';
import { evaluate } from '../engine/acl.js';
import { mistakeSummary } from '../engine/feedback.js';

const ACL = [
  { seq: 10, action: 'permit', protocol: 'tcp', src: 'any', dst: 'host 10.0.0.5', port: 443 },
  { seq: 20, action: 'deny', protocol: 'tcp', src: 'any', dst: 'any', port: 23 },
  { seq: 30, action: 'permit', protocol: 'ip', src: 'any', dst: 'any' },
];
const pk = (protocol, src, dst, port) => (port === undefined ? { protocol, src, dst } : { protocol, src, dst, port });

// The one-line summary used by the results screen: what was it, what did you do, what should you have done,
// why, and the exact text of the entry that decided it (so the player never has to remember a rule).

test('feedback/summary of a wrong shot: the packet, what you did, what to do instead, and the deciding entry', () => {
  const packet = pk('tcp', '203.0.113.50', '10.0.0.8', 443);
  const result = evaluate(ACL, packet); // permitted by entry 30
  assertEqual(mistakeSummary(ACL, result, packet, 'wrong-shot'), {
    packetText: 'TCP 203.0.113.50 → 10.0.0.8:443',
    what: 'You shot it',
    should: 'let it through',
    because: 'Entry 30 permits it.',
    entryText: '30 permit ip any any',
  });
});

test('feedback/summary of a leak: it got through, it should have been shot, and the entry text is the denying rule', () => {
  const packet = pk('tcp', '203.0.113.9', '10.0.0.5', 23);
  const result = evaluate(ACL, packet); // denied by entry 20
  assertEqual(mistakeSummary(ACL, result, packet, 'leak'), {
    packetText: 'TCP 203.0.113.9 → 10.0.0.5:23',
    what: 'It got through',
    should: 'shoot it',
    because: 'Entry 20 denies it.',
    entryText: '20 deny tcp any any eq 23',
  });
});

test('feedback/summary of a leak caused by the implicit deny says no entry matches and names no entry text', () => {
  const acl = [{ seq: 10, action: 'permit', protocol: 'tcp', src: '10.0.0.0/24', dst: 'any', port: 80 }];
  const packet = pk('udp', '10.0.0.9', '172.16.0.1', 53);
  const s = mistakeSummary(acl, evaluate(acl, packet), packet, 'leak');
  assertEqual(s.should, 'shoot it');
  assert(/implicit deny/.test(s.because) && /No entry matches/.test(s.because), s.because);
  assertEqual(s.entryText, 'implicit deny (no entry matched)');
});

test('feedback/an ICMP packet is described without a port', () => {
  const packet = pk('icmp', '10.1.1.1', '172.16.0.1');
  const acl = [{ seq: 10, action: 'deny', protocol: 'icmp', src: 'any', dst: 'any' }];
  assertEqual(mistakeSummary(acl, evaluate(acl, packet), packet, 'leak').packetText, 'ICMP 10.1.1.1 → 172.16.0.1');
});
