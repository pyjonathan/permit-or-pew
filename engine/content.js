// Validates the whole authored content document before the game starts.
// Returns { ok: true } or { ok: false, errors: [{ levelId, waveId, message }] }.
import { parseAddressSpec, parseIPv4 } from './acl.js';

const ACL_PROTOCOLS = ['tcp', 'udp', 'icmp', 'ip'];
const PACKET_PROTOCOLS = ['tcp', 'udp', 'icmp'];
const DIVE_PATHS = ['drop', 'sway', 'swoop-in', 'zigzag'];
const MIN_PACKETS = 4;
const MAX_PACKETS = 10; // formation slots 0 to 9 (5 columns x 2 rows)
const enterDone = (index) => 10 * index + 40; // a packet must finish entering before it may dive
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const isInt = (v) => Number.isInteger(v);

export function validate(doc) {
  const errors = [];
  const add = (levelId, waveId, message) => errors.push({ levelId, waveId, message });

  if (!doc || typeof doc !== 'object') {
    add(null, null, 'The content file is missing or is not an object.');
    return { ok: false, errors };
  }

  if (doc.schemaVersion !== 1) add(null, null, 'schemaVersion must be 1.');
  if (!isInt(doc.maxHealth) || doc.maxHealth < 1) add(null, null, 'maxHealth must be an integer, 1 or more.');
  if (!doc.playfield || doc.playfield.width !== 700 || doc.playfield.height !== 560) {
    add(null, null, 'playfield must be { width: 700, height: 560 }.');
  }

  const sourceIds = new Set();
  if (!Array.isArray(doc.sources)) {
    add(null, null, 'sources must be a list.');
  } else {
    for (const [i, s] of doc.sources.entries()) {
      for (const field of ['id', 'title', 'url', 'section', 'claim']) {
        if (!isNonEmptyString(s?.[field])) add(null, null, `source #${i + 1} is missing a non-empty "${field}".`);
      }
      if (isNonEmptyString(s?.id)) {
        if (sourceIds.has(s.id)) add(null, null, `duplicate source id "${s.id}".`);
        sourceIds.add(s.id);
      }
    }
  }

  if (!Array.isArray(doc.levels) || doc.levels.length !== 3) {
    add(null, null, 'There must be exactly 3 levels.');
    return { ok: false, errors };
  }

  const levelIds = new Set();
  const waveIds = new Set();
  for (const level of doc.levels) {
    const levelId = isNonEmptyString(level?.id) ? level.id : '(missing id)';
    if (levelIds.has(levelId)) add(levelId, null, `duplicate level id "${levelId}".`);
    levelIds.add(levelId);
    for (const field of ['title', 'outcome', 'briefing']) {
      if (!isNonEmptyString(level?.[field])) add(levelId, null, `level ${levelId} is missing a non-empty "${field}".`);
    }
    if (!Array.isArray(level?.sourceIds) || level.sourceIds.length === 0) {
      add(levelId, null, `level ${levelId} needs at least one source id.`);
    } else {
      for (const sid of level.sourceIds) {
        if (!sourceIds.has(sid)) add(levelId, null, `level ${levelId} cites unknown source "${sid}".`);
      }
    }
    if (!Array.isArray(level?.waves) || level.waves.length !== 2) {
      add(levelId, null, `level ${levelId} must have exactly 2 waves.`);
      continue;
    }
    for (const wave of level.waves) validateWave(levelId, wave, waveIds, add);
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function validateWave(levelId, wave, waveIds, add) {
  const waveId = isNonEmptyString(wave?.id) ? wave.id : '(missing id)';
  const err = (message) => add(levelId, waveId, `Wave ${waveId}: ${message}`);

  if (waveIds.has(waveId)) err('duplicate wave id.');
  waveIds.add(waveId);

  // ACL
  if (!Array.isArray(wave?.acl) || wave.acl.length < 1) {
    err('the ACL must have 1 or more entries.');
  } else {
    let previousSeq = -Infinity;
    for (const entry of wave.acl) {
      const where = `entry ${entry?.seq}`;
      if (!isInt(entry?.seq)) {
        err(`${where}: seq must be an integer.`);
      } else {
        if (entry.seq <= previousSeq) err(`${where}: seq must be unique and ascending.`);
        previousSeq = entry.seq;
      }
      if (entry?.action !== 'permit' && entry?.action !== 'deny') err(`${where}: action must be permit or deny.`);
      if (!ACL_PROTOCOLS.includes(entry?.protocol)) err(`${where}: protocol must be tcp, udp, icmp, or ip.`);
      for (const side of ['src', 'dst']) {
        if (parseAddressSpec(entry?.[side]) === null) {
          err(`${where}: ${side} must be "any", "host A.B.C.D", or CIDR "A.B.C.D/N" (wildcard masks are not supported).`);
        }
      }
      if (entry?.portOp !== undefined && entry.portOp !== 'eq') err(`${where}: only the "eq" port operator is supported.`);
      if (entry?.port !== undefined) {
        if (!isInt(entry.port) || entry.port < 1 || entry.port > 65535) {
          err(`${where}: port must be an integer from 1 to 65535 (ranges are not supported).`);
        }
        if (entry.protocol !== 'tcp' && entry.protocol !== 'udp') err(`${where}: a port is only allowed with tcp or udp.`);
      }
    }
  }

  // Dive timing for the whole wave
  if (!isInt(wave?.diveTicks) || wave.diveTicks < 60 || wave.diveTicks > 600) {
    err('diveTicks must be an integer from 60 to 600.');
  }

  // Packets
  if (!Array.isArray(wave?.packets) || wave.packets.length < MIN_PACKETS || wave.packets.length > MAX_PACKETS) {
    err(`a wave must have ${MIN_PACKETS} to ${MAX_PACKETS} packets.`);
  } else {
    const ids = new Set();
    const slots = new Set();
    const dives = new Set();
    for (const [index, p] of wave.packets.entries()) {
      const where = `packet ${p?.id}`;
      if (!isNonEmptyString(p?.id)) err('a packet is missing its id.');
      else if (ids.has(p.id)) err(`${where}: duplicate packet id.`);
      else ids.add(p.id);
      if (!PACKET_PROTOCOLS.includes(p?.protocol)) err(`${where}: protocol must be tcp, udp, or icmp.`);
      for (const side of ['src', 'dst']) {
        if (parseIPv4(p?.[side]) === null) err(`${where}: ${side} must be a dotted-quad IPv4 address.`);
      }
      if (p?.protocol === 'icmp') {
        if (p.port !== undefined) err(`${where}: an icmp packet cannot have a port.`);
      } else if (PACKET_PROTOCOLS.includes(p?.protocol)) {
        if (!isInt(p?.port) || p.port < 1 || p.port > 65535) err(`${where}: a ${p.protocol} packet needs a port from 1 to 65535.`);
      }
      if (!isInt(p?.slot) || p.slot < 0 || p.slot >= MAX_PACKETS) {
        err(`${where}: slot must be an integer from 0 to ${MAX_PACKETS - 1}.`);
      } else if (slots.has(p.slot)) {
        err(`${where}: another packet already uses formation slot ${p.slot}.`);
      } else {
        slots.add(p.slot);
      }
      if (!DIVE_PATHS.includes(p?.path)) err(`${where}: path must be one of ${DIVE_PATHS.join(', ')}.`);
      if (!isInt(p?.diveAt) || p.diveAt < 0) {
        err(`${where}: diveAt must be an integer, 0 or more.`);
      } else {
        if (p.diveAt < enterDone(index)) err(`${where}: diveAt must be ${enterDone(index)} or more so the packet finishes entering first.`);
        if (dives.has(p.diveAt)) err(`${where}: another packet already dives at tick ${p.diveAt}.`);
        dives.add(p.diveAt);
      }
    }
  }

  // Hints
  if (!Array.isArray(wave?.hints) || wave.hints.length < 1 || !wave.hints.every(isNonEmptyString)) {
    err('a wave needs 1 or more non-empty method hints.');
  }
}
