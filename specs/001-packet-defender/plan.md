# Implementation Plan: Permit or Pew

**Branch**: `001-packet-defender` | **Date**: 2026-11-17 (revised for the Galaga-style game) | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-packet-defender/spec.md`

## Summary

A browser arcade game in the style of Galaga. The player is a firewall: a formation of packets hovers at the top, each sprite showing its protocol, addresses, and port, and the packets dive toward a protected network one at a time. The player moves a ship freely along the bottom and fires bullets. A packet the ACL denies must be shot; a packet it permits must be let through. A pure rule evaluator decides which is which, a pure fixed-step game loop owns the motion, and a small session layer owns health, mistakes, and the after-action review. Mistakes never pause the game: they show a one-line message and are explained in full in the review at the end of the wave. The stack is static HTML, CSS, and native JavaScript modules, with the playfield in SVG and everything the player must read in real DOM text. Authored levels live in one JSON file.

## Technical Context

**Language/Version**: JavaScript (ES modules, current evergreen browsers), HTML5, CSS3

**Primary Dependencies**: None. No framework, bundler, backend, or rendering library.

**Storage**: N/A. Session state is in memory; reload starts fresh (spec FR-031).

**Testing**: A dependency-free test runner that works in the browser (`tests/index.html`) and in Node (`node tests/run-node.mjs`), plus a Chrome-driven end-to-end check (`node tests/browser-check.mjs`). Expected results are literal values taken from the spec's reference tables.

**Target Platform**: Desktop and laptop browsers with a keyboard, served as static files (including a repository subpath).

**Project Type**: Static web application (single project).

**Performance Goals**: Up to 8 packets, 2 bullets, and a few effects on screen, re-rendered every simulation tick (60 per second at Normal). Smoothness matters; the loop must not allocate heavily.

**Constraints**: No account, backend, device connection, model, or API key (constitution C5). Playable by keyboard at a pace the player controls, including a step mode (C4). Deterministic waves: all motion is a pure function of the tick number (C2). One workshop hour of build time (C7).

**Scale/Scope**: Three levels, six waves, 48 reference packets, one mechanic.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.* Constitution v2.0.0.

| Principle | Gate | Status |
| --- | --- | --- |
| C1 Technical truth | Documented model; evaluator reproducible; 48 hand-checked cases; source per rule | **Pass**, with one open item: the sources are real and verified (research R9) but an independent networking review is still pending. Release is blocked on this, not planning. |
| C2 Teaches through a decision | Shoot/pass against a visible ACL; mistakes never freeze the action; one-line message plus full after-action review; pause any time; authored waves | **Pass.** The review is built and verified before the formation motion (build order). |
| C3 Honest progress, safe retry | Each packet resolved once; health 3 at the start of every level and at most, -1 per mistake, +1 per correct decision; wave fails at once at 0; wave-only retry restoring full health; mistakes stay counted; no timer, score, or bonus | **Pass.** `health`, cumulative `mistakes`, and `retries` (research R5). |
| C4 Access | Keyboard, text ACL and feedback, playfield text mirror, adjustable pace that scales all motion including a step mode, reduced motion, narrow layout | **Pass.** SVG plus DOM chosen for this reason (R1); see the UI contract. |
| C5 Deterministic, self-contained | Static files only; no randomness; no runtime AI | **Pass.** |
| C6 Content and logic separate | Data-driven waves and formations; evaluator alone decides permit/deny; loop separate from rules | **Pass.** Enforced by module boundaries and the engine contract. |
| C7 Done is demonstrated | Evaluator and review built before motion; recorded verification | **Pass.** Build order below. |

**Post-design re-check (after Phase 1):** no new violations. The data model, engine contract, and UI contract each map to a principle above. No complexity needs justification.

## Project Structure

### Documentation (this feature)

```text
specs/001-packet-defender/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── engine-api.md
│   ├── ui-controls.md
│   └── levels-data.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Task list and status
```

### Source Code (repository root)

```text
index.html                   Semantic page shell and module entry point
style.css                    Layout, focus, feedback states, reduced motion
main.js                      Load → validate → start; wires input, clock, and renderer
engine/
  acl.js                     Pure evaluator and judge
  content.js                 Validate authored data (entries, packets, formation, timing, sources)
  loop.js                    Pure fixed-step simulation: tick(state, input); no timers, no DOM
  state.js                   Session: health, mistakes, retries, assistance, review, progress, restart
  feedback.js                Turn evaluator evidence into messages, explanations, and hints
ui/
  render.js                  SVG playfield, ACL panel, text mirror, briefing, review, summaries
  controls.js                Keyboard (held movement, fire, pause, hint, step) and buttons
  clock.js                   The only clock: a requestAnimationFrame fixed-timestep driver
  sounds.js                  Sound data: note frequencies, effect recipes, the tune for each level (pure)
  audio.js                   Plays that data with the Web Audio API (effects, music, mute, volume)
data/
  levels.json                Briefings, ACLs, packets, formation slots, dive timing, hints, sources
tests/
  harness.js                 Tiny dependency-free test helpers
  index.html                 Browser test runner with visible totals; zero tests = failure
  run-node.mjs               The same tests from a terminal
  acl.test.js                Evaluator against typed expected results
  content.test.js            Invalid and ambiguous authored data
  waves.test.js              All 48 shipped packets, formation and timing rules
  loop.test.js               Motion, bullets, hits, single resolution, determinism
  state.test.js              Mistakes without pausing, healing and the health cap, review, wave failure at 0, retry, hints, restart
  browser-check.mjs          Real Chrome, real key presses, screenshots
README.md                    Actual run instructions, behaviour, and evidence
```

**Structure Decision**: A single static project at the repository root with `engine/` (pure, tested), `ui/` (DOM and SVG), `data/`, and `tests/`.

## Build order (carries the constitution's C7)

| Slice | Deliverable | Evidence before the next slice |
| --- | --- | --- |
| 1 · Prove the rule | `engine/acl.js` evaluator and `judge`, tested against all reference cases | All pass, independent of any UI |
| 2 · Prove the motion | `engine/loop.js`: formation, dives, ship, bullets, hit rules, determinism | Loop tests pass, including overlap and single-resolution cases |
| 3 · Prove the review | `engine/state.js` and `feedback.js`: non-blocking mistakes, health and healing, review, wave failure, wave retry, hints | State tests pass; mutation checks (a mistake that pauses, a retry that forgets health) fail the suite |
| 4 · Content | `data/levels.json` (48 packets), validator, briefings | Every shipped packet matches its typed expected result |
| 5 · The screen | Renderer, clock, controls, accessibility, narrow layout, reduced motion | `tests/browser-check.mjs` passes; screenshots reviewed by a person |
| 6 · Package | README with real run commands and evidence | Another attendee can run and explain the game |

If time runs short, cut effects first, then Normal speed, then narrow-layout polish. Do not cut the evaluator, the review, or the text mirror; if still short, reduce to four waves and update the spec and tasks.

## Open items

- Sources: done (2026-11-18, research R9). An independent networking review of the reference cases, briefings, and explanations is still open.
- Reference cases (48) reviewed by someone with networking knowledge (spec SC-001).
- Playtest with a first-time player: pace, difficulty, and the 10–15 minute target (SC-002, SC-009).

## Complexity Tracking

No constitution violations. Nothing to justify.
