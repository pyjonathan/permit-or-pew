> **Note:** this root file is adapted from the NAF AC6 workshop starter kit (Apache-2.0) and changed by Jonathan Buchanan; see NOTICE. It is the original starter input and still describes the first, lane-based design (the game was later reworked into a Galaga-style arcade game). The authoritative, current plan is `specs/001-packet-defender/plan.md` with its research, data model, contracts, and tasks. If the two disagree, the feature plan wins.

# Permit or Pew · Implementation plan

## Build target

Implement the clarified specification for Permit or Pew within the workshop build block. First deliver one complete wave with correct grading, a pause-and-explain on mistakes, and wave completion. Then add content, speed controls, and polish through the same implementation.

**Hardest behavior to get right:** the game loop must stay separate from the rules. Packet permit/deny comes only from the ACL evaluator, and the explanation must name the exact entry and fields that decided it. The loop must also resolve every packet exactly once (shot, passed, or leaked) even if a shot and the bottom edge happen on the same tick.

**First evidence we'll check:** spec wave 2.2, packet TCP 10.0.0.15 → 172.16.0.1:22, must be **deny (entry 10)**, and its explanation must say entry 20 is never reached.

## Stack and serving

- Semantic HTML, CSS, and native JavaScript modules. No framework, bundler, backend, or runtime model.
- **Playfield in SVG, controls and text in DOM. No canvas and no rendering library.** Reason: at most four packets are on screen, SVG elements carry real text and focus, and it needs no dependency. Accessible alternative: a DOM list mirroring packets, lanes, and status (also required by C4).
- `data/levels.json` for authored content, loaded over HTTP with a relative URL.
- In-memory session state. Reload starts a fresh session. No persistence in v1.
- Static hosting, including a repository subpath such as GitHub Pages. Use relative asset paths and case-correct filenames.

Preview from the repository root after implementation creates `index.html`:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open **http://127.0.0.1:8000**. On Windows use `py` in place of `python3`. Native modules and JSON fetching need a web server; opening the HTML with `file://` is not the supported run path.

## Proposed files and responsibilities

```text
index.html                   Semantic page shell and module entry point
style.css                    Layout, focus, feedback states, reduced motion
main.js                      Load → validate → start; render loading/errors
engine/
  acl.js                     Pure evaluator: parse entries, match a packet, return the first match
  content.js                 Validate authored data (entries, packets, sources, wave timing)
  loop.js                    Pure step function: tick(state, input) → state; no timers, no DOM
  state.js                   Session: running loss (and loss at wave start), mistakes, assistance, wave/level progress, restart
  feedback.js                Turn evaluator evidence into explanation text
ui/
  render.js                  SVG playfield, ACL panel, text mirror, briefing, summary
  controls.js                Keyboard, buttons, pause, speed, focus handling
  clock.js                   The only module with a timer; calls tick() at the chosen speed
data/
  levels.json                Briefings, ACLs, packets, wave timing, hints, sources
tests/
  index.html                 Browser test runner with visible pass/fail summary
  acl.test.js                Independent expected results from the spec's case table
  loop.test.js               Single resolution, leak, shot, pause on mistake, step mode
  state.test.js              Loss limit (6), wave-only retry restoring loss, hints, restart/cancel
  content.test.js            Invalid/missing/ambiguous authored data
README.md                    Actual run instructions, behavior, and evidence
```

Keep modules small. If separate files add no value, combine them (for example `feedback.js` into `state.js`).

## Data contract

One document with `schemaVersion`, `sources`, and `levels`. Each level has a unique ID, title, learning outcome, briefing, source IDs, and two ordered waves. The document has one game-wide `lossLimit` (6). Each wave has a unique ID, an `acl` array, a `packets` array, and ordered hints.

**Domain fields:**
- ACL entry: `seq` (integer), `action` (`permit` | `deny`), `protocol` (`tcp` | `udp` | `icmp` | `ip`), `src` and `dst` (`"any"`, `"host A.B.C.D"`, or `"A.B.C.D/N"` with N from 0 to 32), optional `port` (integer 1–65535, only with `tcp` or `udp`).
- Packet: `id`, `protocol` (`tcp` | `udp` | `icmp`), `src` and `dst` (dotted-quad IPv4), optional `port` (only with `tcp` or `udp`), `lane` (0–3), `spawnStep` (integer).

**Choice representation:** the player's decision is an event per packet: `shot` or `passed` (a leak is `passed` on a denied packet). The loop emits the events; the evaluator decides if each is correct.

**Validation rules:** reject missing fields, duplicate IDs or sequence numbers, entries out of ascending order, invalid IPv4 or CIDR, a port on `icmp` or `ip`, `ip` used as a packet protocol, lane outside 0–3, two packets in one lane on the same step, unknown source IDs, wildcard masks, port operators other than `eq`, and any use of `any` that the model does not support.

The loader must validate the whole file before starting. Show a content error with the level and wave ID, and do not count it as a mistake. Briefings and hints reference source records with a title, URL, section, and supported claim. Fixed wording lives in data; the explanation text is assembled from the evaluator's evidence.

## Domain evaluation contract

```text
evaluate(acl, packet) → {
  decision: "permit" | "deny",
  matchedSeq: number | null,      // null means the implicit deny
  reasonCode: "explicit-permit" | "explicit-deny" | "implicit-deny",
  evidence: [ { seq, matched: boolean, failedField: "protocol"|"src"|"dst"|"port"|null } ]
}

judge(decision, playerEvent) → "correct" | "wrong-shot" | "leak"
```

- Pure functions: same inputs, same result; no DOM, timer, network, or randomness.
- The evaluator walks entries in order and returns the first whose protocol, source, destination, and port all match. A CIDR match compares the top N bits of the packet address to the entry address. The UI never decides permit or deny by lane, colour, position, or animation.
- `evidence` lists every entry up to and including the match, with the first field that failed for each non-matching entry. The explanation uses this to say *why* each earlier entry was skipped.
- Expected answers in tests come from the spec's case table, not from calling the evaluator under test.

**Feedback example (wave 2.2 leak):** packet TCP 10.0.0.15 → 172.16.0.1:22 passed. `reasonCode: explicit-deny`, matched entry 10. *"Leak. Entry 10 denies TCP to port 22 from any source, and this packet matches it. The list stops at the first match, so entry 20 is never checked. This packet should have been shot."*

## Game loop and session transitions

```text
loading → briefing → playing ⇄ paused (player)
                        ├─ correct decision → confirmation, keep playing
                        ├─ mistake → loss+1 → paused-explaining → Continue → playing
                        │     └─ loss reaches the limit → wave-failed → Retry wave (loss restored to wave start) → playing
                        └─ all packets resolved → wave-summary → next wave / level summary / session summary
loading/content failure → error screen → retry loading
confirmed Restart → fresh first briefing
```

- `tick(state, input)` is pure. Time is an integer step count, not wall-clock. `ui/clock.js` is the only code that uses a timer, and only to call `tick` at the selected speed. In step mode the clock does nothing and `N` calls `tick` once.
- Per step: apply input (move, fire), advance bolts, resolve hits, advance packets, resolve bottom-edge leaks and passes, then emit events. **A packet marked resolved is never resolved again.** If a bolt and the bottom edge coincide, the bolt wins (documented and tested).
- A mistake sets state to `paused-explaining`; `tick` then returns the state unchanged until Continue.
- The state module owns the running loss total, a snapshot of loss taken when each wave starts (restored on wave retry), mistakes, assistance, completed wave IDs, current wave, and current view. Hints and pausing never resolve a packet. Restart requires confirmation; cancel changes nothing.

## Interaction and visual direction

An SVG edge-of-network view: ACL rulebook on the left, four lanes of packet-ships, and a turret at the bottom. Each packet carries its headers as visible text. On a mistake, the game pauses, the deciding entry lights up, and the compared fields are underlined; the explanation appears in a persistent feedback region with `aria-live`.

Use native controls where possible and move focus deliberately: to the briefing heading on a new screen, and to the Continue button when an explanation appears. Respect `prefers-reduced-motion` by removing decorative motion (glow, screen shake, bolt trails) while keeping packet movement controllable through speed and step mode. A learner must not need animation, colour vision, pointer precision, or hover to reason about the answer.

Speed settings: Step, Slow, Normal. Step is the baseline for accessibility testing.

## Implementation order

| Slice | Deliverable | Evidence before the next slice |
| --- | --- | --- |
| 1 · Prove the rule | `acl.js` evaluator and `judge`, with every row of the spec's case table | All 20 cases pass independently of the UI |
| 2 · Pause-and-explain | `loop.js` with one wave in the DOM: packets descend, Fire, Pass/Leak, pause with explanation, Continue | Spec AC2, AC3, AC4 work in the browser at step speed |
| 3 · Add the curriculum | All six waves, content validation, hints, running loss limit and wave retry, summaries | Each shipped wave agrees with its reviewed cases |
| 4 · Make it usable | Keyboard and focus, text mirror, speed settings, reduced motion, narrow layout, error states | Manual checks are recorded |
| 5 · Package the result | README, screenshot if available, optional hosting | Another attendee can run and explain the game |

Generate `tasks.md` from these slices and the actual acceptance criteria. Do not create a large task tree for hypothetical stretch features.

## Verification and reporting

Implement a dependency-free browser test runner at `tests/index.html` that imports the pure modules, runs all assertions, and shows totals plus failed case IDs. It must report zero discovered tests as failure. Open **http://127.0.0.1:8000/tests/** after starting the same server.

| Check | What must be established |
| --- | --- |
| Domain cases | Every row of the spec's case table, including the CIDR boundary rows |
| Loop cases | Single resolution, bolt vs bottom-edge tie, shot that hits nothing, pause on mistake, step mode |
| Input/content failures | Malformed content cannot be graded; unsupported entries show a content error |
| State transitions | Loss limit, wave retry with restored loss, hints, duplicate fire, level completion, final summary, restart/cancel |
| Source review | Each briefing and explanation agrees with the cited technical rule |
| Browser playthrough | Fresh start to summary at the slowest setting, keyboard-only, readable feedback |
| Layout/motion | Typical laptop, narrow viewport, reduced motion |
| Hosting, if used | Assets and data load under the published repository path |

For each acceptance criterion, record **pass / fail / not run**, the date, environment, and evidence in the README or a linked verification note. The test runner checks code behavior; a human still reviews the teaching content and the actual interaction.

## Scope controls

No persistence, multiplayer, runtime AI, procedural wave generator, editor, or audio in v1. If time runs short, drop effects first, then Normal speed, then the narrow-layout polish. Do not drop the evaluator, the pause-and-explain flow, or the text mirror. If still short, reduce to the first four waves and update the spec and tasks. Do not hide skipped checks or silently weaken correctness.
