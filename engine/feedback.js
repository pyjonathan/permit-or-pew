// Builds explanation text from the evaluator's structured result. It never decides correctness:
// it only reports what engine/acl.js found, so feedback cannot disagree with the rule engine.
import { firstFailedField } from './acl.js';

export function describeEntry(e) {
  const parts = [e.seq, e.action, e.protocol, e.src, e.dst];
  if (e.port !== undefined && e.port !== null) parts.push('eq', e.port);
  return parts.join(' ');
}

export function describePacket(p) {
  const port = p.port !== undefined && p.port !== null ? `:${p.port}` : '';
  return `${p.protocol.toUpperCase()} ${p.src} → ${p.dst}${port}`;
}

function mismatchReason(entry, packet, field) {
  switch (field) {
    case 'protocol':
      return `the entry applies to ${entry.protocol}, but the packet is ${packet.protocol}`;
    case 'src':
      return `the packet's source ${packet.src} is not covered by "${entry.src}"`;
    case 'dst':
      return `the packet's destination ${packet.dst} is not covered by "${entry.dst}"`;
    case 'port':
      return packet.port === undefined || packet.port === null
        ? `the entry needs port ${entry.port}, but ${packet.protocol.toUpperCase()} packets have no port`
        : `the entry needs port ${entry.port}, but the packet uses port ${packet.port}`;
    default:
      return 'a field does not match';
  }
}

const verb = (decision) => (decision === 'permit' ? 'permits' : 'denies');

/** One line per examined entry: why it did or did not match. */
export function evidenceLines(acl, result, packet) {
  return result.evidence.map((ev) => {
    const entry = acl.find((e) => e.seq === ev.seq);
    return ev.matched
      ? `Entry ${ev.seq} (${describeEntry(entry)}) matches: every field it states matches the packet.`
      : `Entry ${ev.seq} (${describeEntry(entry)}) does not match: ${mismatchReason(entry, packet, ev.failedField)}.`;
  });
}

/** The line that names the deciding entry, or the implicit deny. */
export function decisionLine(result) {
  return result.matchedSeq === null
    ? 'No entry matches, so the implicit deny at the end of the list denies this packet.'
    : `Entry ${result.matchedSeq} is the first match, so the list ${verb(result.decision)} this packet and stops checking.`;
}

/** Entries after the deciding one that would also have matched (they are never reached). */
function unreachedMatches(acl, result, packet) {
  if (result.matchedSeq === null) return [];
  return acl.filter((e) => e.seq > result.matchedSeq && firstFailedField(e, packet) === null);
}

/** Explanation for a mistake. Returns { headline, lines, advice }. */
export function explain(acl, result, packet, judgement) {
  const headline =
    judgement === 'wrong-shot'
      ? `Mistake: you shot ${describePacket(packet)}, but the list permits it.`
      : `Mistake: ${describePacket(packet)} got through, but the list denies it.`;
  const lines = [...evidenceLines(acl, result, packet), decisionLine(result)];
  const later = unreachedMatches(acl, result, packet);
  if (later.length > 0) {
    lines.push(
      `Entry ${later.map((e) => e.seq).join(', ')} would also match, but the list never gets that far: the first match wins.`,
    );
  }
  const advice =
    judgement === 'wrong-shot'
      ? 'This packet should have been let through. Shooting permitted traffic drops good packets.'
      : 'This packet should have been shot. Letting denied traffic through is a leak.';
  return { headline, lines, advice };
}

const decidedBy = (result) =>
  result.matchedSeq === null
    ? 'No entry matches, so the implicit deny denies it.'
    : `Entry ${result.matchedSeq} ${verb(result.decision)} it.`;

/**
 * The facts the results screen shows for one mistake at a glance: the packet, what the player did,
 * what they should have done instead, and which entry decided it.
 */
export function mistakeSummary(acl, result, packet, judgement) {
  const entry = result.matchedSeq === null ? null : acl.find((e) => e.seq === result.matchedSeq);
  return {
    packetText: describePacket(packet),
    what: judgement === 'wrong-shot' ? 'You shot it' : 'It got through',
    should: judgement === 'wrong-shot' ? 'let it through' : 'shoot it',
    because: decidedBy(result),
    // The exact text of the deciding entry, so the results can show the rule itself, not just its number.
    entryText: entry ? describeEntry(entry) : 'implicit deny (no entry matched)',
  };
}

/** The one-line, non-blocking message shown the moment a mistake happens. */
export function shortMessage(result, packet, judgement) {
  return judgement === 'wrong-shot'
    ? `Mistake: you shot ${describePacket(packet)}. ${decidedBy(result)}`
    : `Mistake: ${describePacket(packet)} got through. ${decidedBy(result)}`;
}

/** Short confirmation for a correct decision. Returns { headline, lines, message }. */
export function confirm(acl, result, packet, action) {
  const headline = `Correct: ${action === 'shot' ? 'you dropped' : 'you let through'} ${describePacket(packet)}.`;
  return { headline, lines: [decisionLine(result)], message: `${headline} ${decidedBy(result)}` };
}

/** Hint 2: the first step of working this packet by hand. */
export function workedStep(acl, result, packet) {
  const first = result.evidence[0];
  const entry = acl.find((e) => e.seq === first.seq);
  const detail = first.matched
    ? 'Every field matches, so this entry decides and you can stop reading.'
    : `It does not match, because ${mismatchReason(entry, packet, first.failedField)}. Move on to the next entry.`;
  return `Packet: ${describePacket(packet)}. Start at the top, with entry ${first.seq} (${describeEntry(entry)}). ${detail}`;
}

/** Hint 3: the full worked solution for the packet. */
export function workedSolution(acl, result, packet) {
  const todo = result.decision === 'deny' ? 'Shoot it' : 'Let it pass';
  return [`Packet: ${describePacket(packet)}.`, ...evidenceLines(acl, result, packet), decisionLine(result), `So: ${todo}.`].join(' ');
}

export function sourceLine(source) {
  return `${source.title}, ${source.section}`;
}
