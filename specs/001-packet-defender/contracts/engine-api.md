# Contract: Engine modules

The engine has no DOM, clock, network, or randomness. It is the part the tests exercise. See [data-model.md](../data-model.md) for the shapes.

## `engine/acl.js`

```text
evaluate(acl, packet) → EvaluationResult
judge(decision, action) → "correct" | "wrong-shot" | "leak"
parseIPv4(text), parseAddressSpec(spec), firstFailedField(entry, packet)
```

- `evaluate` walks `acl` in order and returns the first entry whose protocol, source, destination, and port all match. If none match it returns `decision: "deny"`, `matchedSeq: null`, `reasonCode: "implicit-deny"`.
- **Protocol match:** an entry with `ip` matches any packet protocol; otherwise protocols must be equal.
- **Address match:** `any` always matches. `host A.B.C.D` matches only that address. `A.B.C.D/N` matches when the top N bits of the packet address equal the top N bits of the entry address (N = 0 matches everything).
- **Port match:** an entry with no `port` matches any packet (and ICMP). An entry with a `port` matches only a TCP or UDP packet with that exact port.
- `judge(permit, "passed")` and `judge(deny, "shot")` are `correct`. `judge(permit, "shot")` is `wrong-shot`. `judge(deny, "passed")` is `leak`.
- Same inputs always give the same result.

## `engine/content.js`

```text
validate(document) → { ok: true } | { ok: false, errors: [{ levelId, waveId, message }] }
```

Applies every rule in the data model's "Rejected as content errors" list. Validates the whole document before the game starts.

## `engine/loop.js`

```text
FIELD                                  // playfield constants
slotPosition(i) → { x, y }
packetPosition(packet, tick, diveTicks) → { status, x, y }
createWave(wave) → WaveState
tick(waveState, input) → { state, events }
```

- `input` is one of `{ type: "advance", ticks?, move? }` (move is -1, 0, or 1; this is the only input that moves time forward), `{ type: "fire" }` (instant), `{ type: "hop", dir }` (instant, 50 units), or `null`.
- One tick: advance the tick number, move the ship (5 units × `move`), recompute every unresolved packet's position and status from the tick, move each bullet up 9 units and resolve hits, then resolve packets whose dive has finished as `passed`. Hits are resolved before passes.
- **A bullet hits the lowest sprite (largest y) among those it overlaps.** At most 2 bullets are in flight; firing with 2 in the air does nothing.
- Events: `{ type: "resolved", packetId, action: "shot" | "passed" }` and `{ type: "wave-complete" }`.
- A resolved packet is never resolved again. A frozen or complete wave ignores every input.
- Deterministic: the same wave and the same input sequence give the same events and state. Advancing N ticks at once equals advancing one tick N times.
- Never mutates its argument.

## `engine/state.js`

```text
createSession(document, speed?) → Session
act(session, input) → Session            // advance | fire | hop while playing; judges each resolved packet with engine/acl.js
proceed(session) → Session               // Enter: start wave, next wave/level, Retry, or resume
togglePause(session), requestHint(session), retryWave(session), setSpeed(session, speed)
requestRestart(session), cancelRestart(session), confirmRestart(session)
```

- On a correct decision: confirmation message with the deciding entry; counts updated.
- **On a mistake: `health` - 1, cumulative `mistakes` + 1, a one-line message, and a full record saved in `waveMistakes`. The game does not pause.** If `health` reaches 0 the wave fails at once (view `wave-failed`), even if the mistake was on the wave's last packet.
- **On a correct decision: `health` + 1, never above `maxHealth`.** Health starts at `maxHealth` (3) for every level, carries from a level's first wave into its second, and goes back to `maxHealth` when a new level begins.
- The default speed of a new session is `normal`.
- When every packet is resolved and the wave has not failed, the view becomes `wave-summary` and `lastReview` holds the wave's mistake records.
- `retryWave` restores `health` to `maxHealth`, adds 1 to `retries`, leaves `mistakes` unchanged, and rebuilds the wave.
- Hints work only while paused. Hint 1 is the wave's method hint; hints 2 and 3 are generated for the packet closest to reaching the network (or the next packet to dive). Each is recorded as assistance and none resolves a packet.
- While the restart confirmation is open, `act` does nothing.
- Every function returns a new session and never mutates its argument.

## `engine/feedback.js`

```text
explain(acl, evaluationResult, packet, judgement) → { headline, lines, advice }
shortMessage(evaluationResult, packet, judgement) → string       // the one-line mistake message
confirm(acl, evaluationResult, packet, action) → { headline, lines, message }
workedStep(acl, result, packet) → string                          // hint 2
workedSolution(acl, result, packet) → string                      // hint 3
```

Builds text from `evidence`: why each earlier entry did not match (naming the failed field), the deciding entry or the implicit deny, which later entries would also have matched but are never reached, and what the player should have done.
