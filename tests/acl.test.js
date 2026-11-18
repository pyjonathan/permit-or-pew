import { test, assertEqual } from './harness.js';
import { evaluate, judge } from '../engine/acl.js';

// Expected results are typed from the reference table in specs/001-packet-defender/spec.md.
// They are never computed by the evaluator under test.
const e = (seq, action, protocol, src, dst, port) =>
  port === undefined ? { seq, action, protocol, src, dst } : { seq, action, protocol, src, dst, port };

const ACL_1_1 = [
  e(10, 'permit', 'tcp', 'any', 'host 10.0.0.5', 443),
  e(20, 'deny', 'tcp', 'any', 'any', 23),
  e(30, 'permit', 'ip', 'any', 'any'),
];
const ACL_1_2 = [e(10, 'deny', 'ip', '192.0.2.0/24', 'any'), e(20, 'permit', 'ip', 'any', 'any')];
const ACL_2_1 = [
  e(10, 'permit', 'tcp', '10.0.0.0/24', 'any', 22),
  e(20, 'deny', 'tcp', 'any', 'any', 22),
  e(30, 'permit', 'ip', 'any', 'any'),
];
const ACL_2_2 = [
  e(10, 'deny', 'tcp', 'any', 'any', 22),
  e(20, 'permit', 'tcp', '10.0.0.0/24', 'any', 22),
  e(30, 'permit', 'ip', 'any', 'any'),
];
const ACL_3_1 = [e(10, 'permit', 'tcp', '10.0.0.0/24', 'any', 80), e(20, 'permit', 'tcp', '10.0.0.0/24', 'any', 443)];
const ACL_3_2 = [e(10, 'deny', 'icmp', 'any', 'any'), e(20, 'permit', 'ip', '10.0.0.0/8', 'any')];

const pk = (protocol, src, dst, port) => (port === undefined ? { protocol, src, dst } : { protocol, src, dst, port });

// [case id, acl, packet, expected decision, expected matched entry (null = implicit deny)]
const CASES = [
  ['1.1-a', ACL_1_1, pk('tcp', '203.0.113.9', '10.0.0.5', 443), 'permit', 10],
  ['1.1-b', ACL_1_1, pk('tcp', '203.0.113.9', '10.0.0.5', 23), 'deny', 20],
  ['1.1-c', ACL_1_1, pk('udp', '198.51.100.7', '10.0.0.8', 53), 'permit', 30],
  ['1.2-a', ACL_1_2, pk('tcp', '192.0.2.77', '10.0.0.5', 80), 'deny', 10],
  ['1.2-b boundary last address of /24', ACL_1_2, pk('tcp', '192.0.2.255', '10.0.0.5', 80), 'deny', 10],
  ['1.2-c boundary first address past /24', ACL_1_2, pk('tcp', '192.0.3.1', '10.0.0.5', 80), 'permit', 20],
  ['2.1-a first match wins', ACL_2_1, pk('tcp', '10.0.0.15', '172.16.0.1', 22), 'permit', 10],
  ['2.1-b outside the /24', ACL_2_1, pk('tcp', '10.0.1.15', '172.16.0.1', 22), 'deny', 20],
  ['2.1-c other port', ACL_2_1, pk('tcp', '10.0.0.15', '172.16.0.1', 80), 'permit', 30],
  ['2.2-a order swapped', ACL_2_2, pk('tcp', '10.0.0.15', '172.16.0.1', 22), 'deny', 10],
  ['2.2-b other port', ACL_2_2, pk('tcp', '10.0.0.15', '172.16.0.1', 443), 'permit', 30],
  ['2.2-c udp is not tcp', ACL_2_2, pk('udp', '10.0.0.15', '172.16.0.1', 22), 'permit', 30],
  ['3.1-a', ACL_3_1, pk('tcp', '10.0.0.9', '172.16.0.1', 80), 'permit', 10],
  ['3.1-b implicit deny, other port', ACL_3_1, pk('tcp', '10.0.0.9', '172.16.0.1', 8080), 'deny', null],
  ['3.1-c implicit deny, udp', ACL_3_1, pk('udp', '10.0.0.9', '172.16.0.1', 53), 'deny', null],
  ['3.1-d implicit deny, source outside', ACL_3_1, pk('tcp', '10.0.1.9', '172.16.0.1', 443), 'deny', null],
  ['3.2-a', ACL_3_2, pk('icmp', '10.1.1.1', '172.16.0.1'), 'deny', 10],
  ['3.2-b', ACL_3_2, pk('tcp', '10.1.1.1', '172.16.0.1', 80), 'permit', 20],
  ['3.2-c boundary last address of /8', ACL_3_2, pk('tcp', '10.255.255.255', '172.16.0.1', 80), 'permit', 20],
  ['3.2-d boundary first address past /8', ACL_3_2, pk('tcp', '11.0.0.1', '172.16.0.1', 80), 'deny', null],
];

for (const [id, acl, packet, decision, matchedSeq] of CASES) {
  test(`acl/reference ${id}`, () => {
    const result = evaluate(acl, packet);
    assertEqual(result.decision, decision, 'decision');
    assertEqual(result.matchedSeq, matchedSeq, 'matched entry');
  });
}

test('acl/reference table has exactly 20 cases', () => {
  assertEqual(CASES.length, 20);
});

test('acl/reasonCode values', () => {
  assertEqual(evaluate(ACL_1_1, pk('tcp', '1.1.1.1', '10.0.0.5', 443)).reasonCode, 'explicit-permit');
  assertEqual(evaluate(ACL_1_1, pk('tcp', '1.1.1.1', '10.0.0.5', 23)).reasonCode, 'explicit-deny');
  assertEqual(evaluate(ACL_3_1, pk('tcp', '1.1.1.1', '10.0.0.5', 23)).reasonCode, 'implicit-deny');
});

test('acl/evidence lists every entry up to and including the match, with the first failed field', () => {
  const r = evaluate(ACL_1_1, pk('tcp', '203.0.113.9', '10.0.0.5', 23));
  assertEqual(r.evidence, [
    { seq: 10, matched: false, failedField: 'port' },
    { seq: 20, matched: true, failedField: null },
  ]);
  const udp = evaluate(ACL_2_2, pk('udp', '10.0.0.15', '172.16.0.1', 22));
  assertEqual(udp.evidence, [
    { seq: 10, matched: false, failedField: 'protocol' },
    { seq: 20, matched: false, failedField: 'protocol' },
    { seq: 30, matched: true, failedField: null },
  ]);
  const implicit = evaluate(ACL_3_1, pk('tcp', '10.0.1.9', '172.16.0.1', 443));
  assertEqual(implicit.evidence, [
    { seq: 10, matched: false, failedField: 'src' },
    { seq: 20, matched: false, failedField: 'src' },
  ]);
});

test('acl/an entry with a port never matches an icmp packet', () => {
  const acl = [e(10, 'permit', 'tcp', 'any', 'any', 80)];
  assertEqual(evaluate(acl, pk('icmp', '1.1.1.1', '2.2.2.2')).matchedSeq, null);
});

test('acl/host and /0 and /32 address forms', () => {
  const host = [e(10, 'deny', 'ip', 'host 10.0.0.5', 'any')];
  assertEqual(evaluate(host, pk('tcp', '10.0.0.5', '1.1.1.1', 1)).matchedSeq, 10);
  assertEqual(evaluate(host, pk('tcp', '10.0.0.6', '1.1.1.1', 1)).matchedSeq, null);
  const all = [e(10, 'deny', 'ip', '0.0.0.0/0', 'any')];
  assertEqual(evaluate(all, pk('tcp', '203.0.113.200', '1.1.1.1', 1)).matchedSeq, 10);
  const one = [e(10, 'deny', 'ip', '10.0.0.5/32', 'any')];
  assertEqual(evaluate(one, pk('tcp', '10.0.0.5', '1.1.1.1', 1)).matchedSeq, 10);
  assertEqual(evaluate(one, pk('tcp', '10.0.0.4', '1.1.1.1', 1)).matchedSeq, null);
});

test('acl/destination is matched too', () => {
  const acl = [e(10, 'deny', 'ip', 'any', '192.168.0.0/16')];
  assertEqual(evaluate(acl, pk('tcp', '1.1.1.1', '192.168.255.255', 1)).matchedSeq, 10);
  assertEqual(evaluate(acl, pk('tcp', '1.1.1.1', '192.169.0.0', 1)).matchedSeq, null);
});

test('acl/judge', () => {
  assertEqual(judge('permit', 'passed'), 'correct');
  assertEqual(judge('permit', 'shot'), 'wrong-shot');
  assertEqual(judge('deny', 'shot'), 'correct');
  assertEqual(judge('deny', 'passed'), 'leak');
});

test('acl/same inputs give the same result', () => {
  const p = pk('tcp', '10.0.0.15', '172.16.0.1', 22);
  assertEqual(evaluate(ACL_2_1, p), evaluate(ACL_2_1, p));
});
