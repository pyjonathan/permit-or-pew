// Pure ACL evaluator. No DOM, timers, network, or randomness.
// Model: extended, named, stateless IPv4 ACL, inbound. Entries are checked top to bottom, the first
// entry whose protocol, source, destination, and port all match decides; no match means implicit deny.

const OCTET = '(0|[1-9]\\d{0,2})';
const IPV4 = new RegExp(`^${OCTET}\\.${OCTET}\\.${OCTET}\\.${OCTET}$`);

/** Parse dotted-quad IPv4 text into an unsigned 32-bit integer, or null if invalid. */
export function parseIPv4(text) {
  if (typeof text !== 'string') return null;
  const m = IPV4.exec(text);
  if (!m) return null;
  let n = 0;
  for (let i = 1; i <= 4; i += 1) {
    const octet = Number(m[i]);
    if (octet > 255) return null;
    n = n * 256 + octet;
  }
  return n;
}

/**
 * Parse an address spec: "any", "host A.B.C.D", or "A.B.C.D/N" (N from 0 to 32).
 * Returns { kind, addr?, bits? } or null if the text is not a supported form.
 */
export function parseAddressSpec(spec) {
  if (typeof spec !== 'string') return null;
  if (spec === 'any') return { kind: 'any' };
  if (spec.startsWith('host ')) {
    const addr = parseIPv4(spec.slice(5));
    return addr === null ? null : { kind: 'host', addr };
  }
  const slash = spec.indexOf('/');
  if (slash > 0) {
    const addr = parseIPv4(spec.slice(0, slash));
    const bitsText = spec.slice(slash + 1);
    if (addr === null || !/^(0|[1-9]\d?)$/.test(bitsText)) return null;
    const bits = Number(bitsText);
    if (bits > 32) return null;
    return { kind: 'cidr', addr, bits };
  }
  return null;
}

function addressMatches(spec, packetAddress) {
  const parsed = parseAddressSpec(spec);
  const addr = parseIPv4(packetAddress);
  if (parsed === null || addr === null) return false;
  if (parsed.kind === 'any') return true;
  if (parsed.kind === 'host') return parsed.addr === addr;
  if (parsed.bits === 0) return true;
  const mask = (0xffffffff << (32 - parsed.bits)) >>> 0;
  return ((parsed.addr & mask) >>> 0) === ((addr & mask) >>> 0);
}

function portMatches(entry, packet) {
  if (entry.port === undefined || entry.port === null) return true;
  const hasPort = packet.protocol === 'tcp' || packet.protocol === 'udp';
  return hasPort && packet.port === entry.port;
}

/** Returns the first field that fails to match ("protocol", "src", "dst", "port") or null if all match. */
export function firstFailedField(entry, packet) {
  if (!(entry.protocol === 'ip' || entry.protocol === packet.protocol)) return 'protocol';
  if (!addressMatches(entry.src, packet.src)) return 'src';
  if (!addressMatches(entry.dst, packet.dst)) return 'dst';
  if (!portMatches(entry, packet)) return 'port';
  return null;
}

/**
 * Evaluate a packet against an ordered ACL.
 * Returns { decision, matchedSeq, reasonCode, evidence } where evidence has one item per entry
 * examined, up to and including the matching one.
 */
export function evaluate(acl, packet) {
  const evidence = [];
  for (const entry of acl) {
    const failedField = firstFailedField(entry, packet);
    evidence.push({ seq: entry.seq, matched: failedField === null, failedField });
    if (failedField === null) {
      return {
        decision: entry.action,
        matchedSeq: entry.seq,
        reasonCode: entry.action === 'permit' ? 'explicit-permit' : 'explicit-deny',
        evidence,
      };
    }
  }
  return { decision: 'deny', matchedSeq: null, reasonCode: 'implicit-deny', evidence };
}

/** Judge the player's action ("shot" or "passed") against the evaluator's decision. */
export function judge(decision, action) {
  if (decision === 'permit') return action === 'passed' ? 'correct' : 'wrong-shot';
  return action === 'shot' ? 'correct' : 'leak';
}
