import { test, assert, assertEqual } from './harness.js';
import { validate } from '../engine/content.js';

// A minimal valid document: 3 levels x 2 waves of 4 packets, built fresh for each test.
function makeDoc() {
  const wave = (id) => ({
    id,
    acl: [
      { seq: 10, action: 'permit', protocol: 'tcp', src: '10.0.0.0/24', dst: 'any', port: 80 },
      { seq: 20, action: 'deny', protocol: 'ip', src: 'any', dst: 'any' },
    ],
    diveTicks: 300,
    packets: [
      { id: 'p1', protocol: 'tcp', src: '10.0.0.9', dst: '172.16.0.1', port: 80, slot: 0, diveAt: 480, path: 'drop' },
      { id: 'p2', protocol: 'udp', src: '10.0.0.9', dst: '172.16.0.1', port: 53, slot: 1, diveAt: 580, path: 'sway' },
      { id: 'p3', protocol: 'icmp', src: '10.0.0.9', dst: '172.16.0.1', slot: 2, diveAt: 680, path: 'swoop-in' },
      { id: 'p4', protocol: 'tcp', src: '10.0.0.9', dst: '172.16.0.1', port: 22, slot: 3, diveAt: 780, path: 'zigzag' },
    ],
    hints: ['Read top to bottom and stop at the first match.'],
  });
  const level = (n) => ({
    id: `L${n}`,
    title: `Level ${n}`,
    outcome: `LO${n}`,
    briefing: 'A briefing.',
    sourceIds: ['s1'],
    waves: [wave(`${n}.1`), wave(`${n}.2`)],
  });
  return {
    schemaVersion: 1,
    maxHealth: 3,
    playfield: { width: 700, height: 560 },
    sources: [{ id: 's1', title: 'T', url: 'https://example.invalid', section: 'S', claim: 'C' }],
    levels: [level(1), level(2), level(3)],
  };
}

const firstWave = (doc) => doc.levels[0].waves[0];

function expectError(mutate, expectedWaveId, label) {
  test(`content/${label}`, () => {
    const doc = makeDoc();
    mutate(doc);
    const result = validate(doc);
    assertEqual(result.ok, false, 'should be rejected');
    assert(result.errors.length > 0, 'should list errors');
    if (expectedWaveId !== undefined) {
      assert(
        result.errors.some((e) => e.waveId === expectedWaveId),
        `an error should name wave ${expectedWaveId}: ${JSON.stringify(result.errors)}`,
      );
      assert(result.errors.every((e) => typeof e.message === 'string' && e.message.length > 0), 'errors need messages');
    }
  });
}

test('content/a valid document passes', () => {
  assertEqual(validate(makeDoc()), { ok: true });
});

expectError((d) => (d.schemaVersion = 2), undefined, 'schemaVersion must be 1');
expectError((d) => (d.maxHealth = 0), undefined, 'maxHealth must be 1 or more');
expectError((d) => (d.maxHealth = 2.5), undefined, 'maxHealth must be an integer');
expectError((d) => delete d.maxHealth, undefined, 'maxHealth is required');
expectError((d) => (d.playfield = { width: 800, height: 560 }), undefined, 'playfield must be 700 x 560');
expectError((d) => d.levels.pop(), undefined, 'exactly 3 levels');
expectError((d) => d.levels[0].waves.pop(), undefined, 'exactly 2 waves per level');
expectError((d) => delete firstWave(d).acl, '1.1', 'missing acl');
expectError((d) => (firstWave(d).acl = []), '1.1', 'empty acl');
expectError((d) => (firstWave(d).acl[1].seq = 10), '1.1', 'duplicate seq');
expectError((d) => (firstWave(d).acl[0].seq = 30), '1.1', 'unsorted seq');
expectError((d) => (firstWave(d).acl[0].action = 'allow'), '1.1', 'bad action');
expectError((d) => (firstWave(d).acl[0].protocol = 'gre'), '1.1', 'unknown acl protocol');
expectError((d) => (firstWave(d).acl[0].src = '10.0.0.0 0.0.0.255'), '1.1', 'wildcard mask rejected');
expectError((d) => (firstWave(d).acl[0].src = '10.0.0.256'), '1.1', 'bad IPv4 octet in acl');
expectError((d) => (firstWave(d).acl[0].src = '10.0.0.0/33'), '1.1', 'CIDR bits above 32');
expectError((d) => (firstWave(d).acl[0].dst = 'host 10.0.0'), '1.1', 'bad host address');
expectError((d) => (firstWave(d).acl[1].port = 80), '1.1', 'port on ip entry');
expectError((d) => (firstWave(d).acl[0].port = '80-90'), '1.1', 'port range rejected');
expectError((d) => (firstWave(d).acl[0].port = 70000), '1.1', 'port out of range');
expectError((d) => (firstWave(d).acl[0].portOp = 'gt'), '1.1', 'port operator other than eq');
expectError((d) => (firstWave(d).packets[0].protocol = 'ip'), '1.1', 'ip is not a packet protocol');
expectError((d) => (firstWave(d).packets[2].port = 7), '1.1', 'port on icmp packet');
expectError((d) => delete firstWave(d).packets[0].port, '1.1', 'tcp packet needs a port');
expectError((d) => (firstWave(d).packets[0].src = '300.1.1.1'), '1.1', 'bad packet IPv4');
expectError((d) => (firstWave(d).packets[1].id = 'p1'), '1.1', 'duplicate packet id');
expectError((d) => (firstWave(d).packets[0].slot = 10), '1.1', 'slot out of range');
expectError((d) => (firstWave(d).packets[1].slot = 0), '1.1', 'two packets in one slot');
expectError((d) => (firstWave(d).packets[0].slot = 1.5), '1.1', 'slot must be an integer');
expectError((d) => (firstWave(d).packets[1].diveAt = 480), '1.1', 'two packets dive on the same tick');
expectError((d) => (firstWave(d).packets[0].diveAt = -5), '1.1', 'negative diveAt');
expectError((d) => (firstWave(d).packets[3].diveAt = 60), '1.1', 'diveAt before the packet has finished entering');
expectError((d) => (firstWave(d).packets[0].path = 'loop-the-loop'), '1.1', 'unknown dive path');
expectError((d) => delete firstWave(d).packets[0].path, '1.1', 'missing dive path');
expectError((d) => (firstWave(d).diveTicks = 20), '1.1', 'diveTicks too small');
expectError((d) => (firstWave(d).diveTicks = 'slow'), '1.1', 'diveTicks must be a number');
expectError((d) => firstWave(d).packets.pop(), undefined, 'fewer than 4 packets');
expectError(
  (d) => {
    for (let i = 4; i < 11; i += 1) {
      firstWave(d).packets.push({ id: `x${i}`, protocol: 'tcp', src: '1.1.1.1', dst: '2.2.2.2', port: 1, slot: i % 10, diveAt: 900 + i * 10, path: 'drop' });
    }
  },
  '1.1',
  'more than 10 packets',
);
expectError((d) => (firstWave(d).hints = []), '1.1', 'needs at least one hint');
expectError((d) => (d.levels[1].waves[0].id = '1.1'), undefined, 'duplicate wave id');
expectError((d) => (d.levels[0].sourceIds = ['nope']), undefined, 'unknown source id');
expectError((d) => delete d.sources[0].section, undefined, 'source needs a section');
expectError((d) => (d.levels[0].briefing = ''), undefined, 'empty briefing');

test('content/errors name the level and wave', () => {
  const doc = makeDoc();
  doc.levels[1].waves[1].acl[0].seq = 20;
  const result = validate(doc);
  assertEqual(result.ok, false);
  const err = result.errors.find((x) => x.waveId === '2.2');
  assert(err && err.levelId === 'L2', 'error should carry levelId L2 and waveId 2.2');
});
