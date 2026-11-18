# Data Model: Permit or Pew

Authored content lives in `data/levels.json` and is read-only at runtime. Session state is in memory only. Field names here are the contract used by the engine and the tests.

## Authored data

### Document
| Field | Type | Rules |
| --- | --- | --- |
| `schemaVersion` | integer | Must be 1. |
| `maxHealth` | integer | 1 or more. Value 3 for v1. It is both the starting health and the maximum. |
| `playfield` | object | `{ width: 700, height: 560 }`. Fixed for v1. |
| `sources` | Source[] | Unique `id`. |
| `levels` | Level[] | Exactly 3 for v1. |

### Source
`id` (unique string), `title`, `url`, `section`, `claim` (the specific rule it supports). All required, non-empty.

### Level
`id` (unique), `title`, `outcome` (LO1 to LO3), `briefing` (a short text in the briefing markup, see `contracts/levels-data.md`: at most 130 words, at least 3 headings, a worked example different from the challenge, no paragraph over 35 words), `sourceIds` (each must exist), `waves` (exactly 2, in order).

### Wave
| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | Unique across the document, such as `1.1`. |
| `acl` | AclEntry[] | 1 or more, in evaluation order. |
| `diveTicks` | integer | 60 to 600: ticks a diving packet takes to reach the network edge. |
| `packets` | Packet[] | 4 to 10 (the shipped data has exactly 8). |
| `hints` | string[] | 1 or more method hints. The worked step and the full worked solution are generated from the evaluator, not stored. |

### AclEntry
| Field | Type | Rules |
| --- | --- | --- |
| `seq` | integer | Unique and ascending within the wave. |
| `action` | `"permit"` or `"deny"` | |
| `protocol` | `"tcp"`, `"udp"`, `"icmp"`, `"ip"` | |
| `src`, `dst` | string | `"any"`, `"host A.B.C.D"`, or `"A.B.C.D/N"` with N from 0 to 32. Every octet 0–255. |
| `port` | integer, optional | 1–65535. Only allowed when `protocol` is `tcp` or `udp`. |

### Packet
| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | Unique within the wave. |
| `protocol` | `"tcp"`, `"udp"`, `"icmp"` | `ip` is not a packet protocol. |
| `src`, `dst` | string | Dotted-quad IPv4. |
| `port` | integer, optional | Required for `tcp` and `udp`. Not allowed for `icmp`. |
| `slot` | integer | 0 to 9, unique within the wave. Formation position: column `slot mod 5` at x = 70 + 140 × column, row `slot div 5` at y = 70 + 60 × row. |
| `diveAt` | integer | The tick the packet leaves the formation. At least `10 × index + 40` (index = position in the list) so it has finished entering, and unique within the wave. |
| `path` | `"drop"`, `"sway"`, `"swoop-in"`, `"zigzag"` | The dive path. |

**Rejected as content errors:** missing or duplicate fields or IDs, unsorted or duplicate `seq`, bad IPv4 or CIDR, a port on `icmp` or `ip`, wildcard masks, port operators other than `eq`, an unknown source ID, a slot out of range or shared, `diveAt` too early or shared, an unknown `path`, `diveTicks` out of range, and level or wave counts that do not match v1. The error names the level and wave ID.

## Derived result (not stored)

### EvaluationResult
`decision` (`"permit"` or `"deny"`), `matchedSeq` (integer or `null` for the implicit deny), `reasonCode` (`explicit-permit`, `explicit-deny`, `implicit-deny`), `evidence` (one item per entry examined, up to and including the match: `{ seq, matched, failedField }` where `failedField` is `protocol`, `src`, `dst`, `port`, or `null`).

### Judgement
One of `correct`, `wrong-shot`, `leak`, computed from the decision and what happened to the packet (`shot` or `passed`).

## Runtime state

### WaveState (the loop)
`tick`, `ship { x }`, `bullets [{ id, x, y }]`, `effects [{ x, y, ttl, packetId }]` (decoration only), `frozen`, `complete`, `diveTicks`, and `packets`. Each packet carries its authored fields plus `index`, `status`, `x`, `y`, `resolution`, `judgement`.

Packet `status`: `pending` (not yet on screen) → `entering` → `formation` → `diving` → `resolved`. A resolved packet records `resolution` (`shot` or `passed`) and later `judgement`. **A resolved packet never changes again.**

**Playfield:** 700 by 560 units. The network edge is at y = 540. The ship is at y = 500, between x = 30 and x = 670. Sprites are 118 by 46. A bullet starts at y = 480.

### Session
| Field | Meaning |
| --- | --- |
| `view` | `briefing`, `playing`, `paused`, `wave-summary`, `wave-failed`, `level-summary`, `session-summary`. |
| `levelIndex`, `waveIndex` | Current position. |
| `maxHealth` | The maximum health, copied from the content (3). |
| `health` | Current health, 0 to `maxHealth`. Equal to `maxHealth` at the start of every level and after every retry; carries from a level's first wave into its second. A mistake costs 1; a correct decision gives 1 back, capped at `maxHealth`. |
| `mistakes` | Count by type (`wrong-shot`, `leak`). Cumulative: mistakes from a failed attempt stay counted. |
| `retries` | Wave retries this session, counted separately from mistakes. |
| `assistance` | Hints used, with wave IDs and hint level. |
| `completedWaves` | `{ levelId, waveId, correct, mistakes, retries, hints }` for each finished wave. |
| `waveStats` | The same counts for the wave in progress. |
| `waveMistakes` | Full mistake records for the current attempt. |
| `lastReview` | The mistake records of the wave that just finished, shown in its review. |
| `feedback` | The latest decision: `{ kind: 'correct' \| 'mistake', message, matchedSeq }`. |
| `speed` | `step`, `slow`, `normal`. Default `slow`. |
| `confirmingRestart` | True while the restart confirmation is open (the game does not advance). |

### Mistake record

The results screen shows these at a glance: `packetText` (for example "TCP 203.0.113.50 → 10.0.0.8:443"), `what` ("You shot it" or "It got through"), `should` ("let it through" or "shoot it"), `because` ("Entry 30 permits it." or "No entry matches, so the implicit deny denies it."), and `entryText` (the text of the deciding entry, such as "30 permit ip any any", or "implicit deny (no entry matched)"). The fields below are the rest of the record.
`packetId`, `kind` (`wrong-shot` or `leak`), `decision`, `matchedSeq`, `sourceIds` (from the level), and the explanation `{ headline, lines, advice }` assembled from the evaluator's evidence.

## State transitions

```text
briefing → playing ⇄ paused (player)
playing → playing                        (a mistake: health - 1, one-line message, record saved; NO pause. A correct decision: health + 1, capped.)
playing → wave-summary                   (every packet resolved, health above 0)
playing → wave-failed                    (a mistake brings health to 0, even on the last packet)
wave-failed → playing                    (Retry: health = maxHealth, wave rebuilt, retries + 1; mistakes are not reduced)
wave-summary → playing (wave 2, same health) | level-summary → briefing (next level, health = maxHealth) | session-summary
any → briefing 1                         (confirmed Restart; cancel changes nothing)
content invalid → error screen           (nothing starts)
```

Hints and pausing never change a packet's status. While `confirmingRestart` is true or the view is not `playing`, the loop does not advance.
