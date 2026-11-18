---

description: "Task list and status for Permit or Pew (Galaga-style revision)"
---

# Tasks: Permit or Pew

**Input**: Design documents from `/specs/001-packet-defender/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md, constitution v2.0.0

**Revision note (2026-11-17):** the first build (four lanes, instant hits, a pause on every mistake) was playtested and felt like gamified flash cards. Following the team's decision, the game was reworked into a Galaga-style arcade game and the constitution was amended to v2.0.0. This file lists the tasks for the reworked game. Tasks that were carried over from the first build unchanged (the ACL evaluator, the test harness) keep their status; everything else was redone.

**Second revision (2026-11-18):** after a playtest, three things changed: Normal became the default pace, "packet loss" became a health system (3 at most, -1 per mistake, +1 per correct decision, wave fails at 0), and a focus bug was fixed (T040–T051 below). Task lines above that say "packet loss" or "limit 6" describe the build as it was then; read them as "health" now.

**Tests**: Included. The constitution (C1, C7) requires independently checked expected results. Expected values come from the spec's reference tables and are written as literals, never computed by the code under test. Each test file was written before the code it covers and confirmed to fail first (the loop, state, and content tests), then mutation-checked on a scratch copy.

**Organization**: Grouped by user story. All three stories are P1; build them in order, because US2 and US3 extend what US1 creates.

## Format: `[ID] [P?] [Story] Description`

- Paths are relative to the repository root. Serve with `py serve.py`.

---

## Phase 1: Setup

- [X] T001 Create the folders `engine/`, `ui/`, `data/`, and `tests/` at the repository root
- [X] T002 [P] Create `index.html`: semantic page shell with a labelled ACL region, the SVG playfield (700×560), a feedback live region, a packet-loss readout, a controls area, and a restart dialog
- [X] T003 [P] Create `style.css`: two-column layout (ACL and feedback left, playfield right, whole playfield visible above the control bar), visible `:focus-visible` on every control, reduced motion, narrow-window layout
- [X] T004 [P] Create `tests/harness.js`: dependency-free `test(id, fn)` and `assertEqual`
- [X] T005 Create `tests/index.html` (browser runner; zero tests = failure) and `tests/run-node.mjs` (the same tests from a terminal)

---

## Phase 2: Foundational (blocking)

**Purpose**: The pure rule evaluator, the content validator, and the authored waves. No story can start until the evaluator passes every reference case.

- [X] T006 [P] Write `tests/acl.test.js` with the original 20 reference cases as literal expected values plus `judge`, evidence, and edge cases (CIDR boundaries, host, /0, /32, destination matching, ICMP with a port entry)
- [X] T007 Implement `engine/acl.js`: `evaluate`, `judge`, and the address and port matching rules (`contracts/engine-api.md`)
- [X] T008 [P] Write `tests/content.test.js` for every rejected case in `data-model.md`, including the new formation and timing rules (slot range and uniqueness, `diveAt` before entry finishes, shared dive time, unknown path, `diveTicks` range)
- [X] T009 Implement `engine/content.js` `validate(document)` enforcing the constraints in `data-model.md`
- [X] T010 Generate `data/levels.json` with all six waves of eight packets (48 in total), formation slots, dive times and paths per the spec's "Formation and timing rules", real briefings with worked examples different from the challenge, and one method hint per wave. Sources are `TODO(sources)` placeholders
- [X] T011 Write `tests/waves.test.js`: all 48 shipped packets against typed expected results; formation and timing rules typed independently of how the data was made; a good mix of denied and permitted packets in every wave; no answer keys in the data
- [X] T012 **Checkpoint**: every reference case and every shipped packet matches its typed expected result

---

## Phase 3: User Story 1: Fight a wave and understand every decision (P1) 🎯 MVP

**Goal**: The player fights a wave: reads the ACL, shoots the denied packets, lets the permitted ones through. The action never stops for a mistake, and every mistake is explained in the wave review.

**Independent Test**: Quickstart checks 1–7 and 9.

### Tests for User Story 1 (written first)

- [X] T013 [P] [US1] Write `tests/loop.test.js`: formation slots; entry and hold; dive timing and paths; ship movement and limits; hop; fire and the 2-bullet cap; bullets rising and leaving; a hit resolves a packet as shot; **the lowest of two overlapping sprites is hit** (a scenario built so the first touch is a real overlap); no packet resolved twice; completion exactly once; frozen waves ignore input; determinism; multi-tick equals single-tick
- [X] T014 [P] [US1] Write the US1 part of `tests/state.test.js`: a correct decision leaves loss unchanged; a mistake adds exactly 1, **does not pause**, keeps the clock running, and stores a full review record; a leak and a delivered packet; a perfect wave; doing nothing leaks every denied packet; a bullet that hits nothing has no consequence

### Implementation for User Story 1

- [X] T015 [US1] Implement `engine/loop.js`: pure fixed-step simulation (`createWave`, `tick`, `packetPosition`, `slotPosition`, `FIELD`) per `contracts/engine-api.md`
- [X] T016 [P] [US1] Implement `engine/feedback.js`: `explain`, `shortMessage`, `confirm`, `workedStep`, `workedSolution`, built from the evaluator's evidence only
- [X] T017 [US1] Implement `engine/state.js`: `createSession`, `act`, and judging every resolved packet with `engine/acl.js`; mistakes add to loss and to the wave's review records and never pause
- [X] T018 [US1] Implement `main.js`: load `data/levels.json`, validate, show a content error naming the level and wave and start nothing if invalid, otherwise start the session
- [X] T019 [US1] Implement `ui/render.js`: briefing with sources; ACL panel with the deciding entry marked; SVG playfield (formation, ship, bullets, network edge, hit rings); text mirror of every packet; feedback region; packet-loss meter and counts. Colour is always paired with text
- [X] T020 [P] [US1] Implement `ui/clock.js`: the only clock; a `requestAnimationFrame` fixed-timestep loop at 60 or 30 ticks per second, none in Step mode
- [X] T021 [US1] Implement `ui/controls.js`: held arrows or A/D to move, Space to fire (one shot per press), N to advance in Step mode, hops in Step mode, and a labelled on-screen button for each
- [X] T022 [US1] Run quickstart checks 1–7 and 9 with `tests/browser-check.mjs` and look at the screenshots. Fixed: the playfield was taller than the window; the entry animation made sprites cross each other

**Checkpoint**: User Story 1 is playable and testable on its own.

---

## Phase 4: User Story 2: Learn from help and finish the game (P1)

**Goal**: Hints, the after-action review, the packet-loss limit with wave-only retry, summaries, restart, and all six waves.

**Independent Test**: Quickstart checks 8–12.

### Tests for User Story 2 (written first)

- [X] T023 [P] [US2] Extend `tests/state.test.js`: pause and resume; hints only while paused, three levels, recorded, never resolving a packet, generated for the packet closest to the network; the limit fails the wave at once (even on the last packet); retry restores loss, keeps mistakes, counts the retry; finishing a retried wave; level and session summaries; restart and cancel; the game does not advance while the restart dialog is open; session functions do not mutate their input
- [X] T024 [P] [US2] Mutation checks on a scratch copy: a mistake that pauses, a bullet that hits the farthest sprite, a bullet cap of 3, a retry that forgets loss, and a last-packet mistake that is ignored must each make the suite fail. (The farthest-sprite mutant first survived; T013's overlap test was added to kill it.)

### Implementation for User Story 2

- [X] T025 [US2] Extend `engine/state.js`: `lossAtWaveStart`, failing the wave at the limit, `retry`, hints, `completedWaves`, `lastReview`, summaries, restart and cancel
- [X] T026 [US2] Extend `ui/render.js`: the after-action review (every mistake with its full explanation and source), the wave-failed screen, the wave, level, and session summaries (correct, mistakes, retries, hints, never a clean result when mistakes exist, with the not-proof-of-mastery statement), hint display, the restart dialog
- [X] T027 [US2] Extend `ui/controls.js`: P to pause, H for hints while paused, Enter to continue or retry, Restart with confirmation (Escape cancels and returns focus)
- [X] T028 [US2] Run quickstart checks 8–12 with `tests/browser-check.mjs`: including a real wave failure at loss 6, a retry, and a perfect six-wave game planned on the engine and replayed with real key presses

**Checkpoint**: Stories 1 and 2 work together as the full six-wave game.

---

## Phase 5: User Story 3: Play with accessible controls at a readable pace (P1)

**Goal**: Keyboard-only play at a pace the player controls, text equivalents, reduced motion, and a narrow layout.

**Independent Test**: Quickstart checks 13–16 and 22.

- [X] T029 [P] [US3] Text mirror of every packet with its status (waiting, flying in, in formation, diving with percent, shot or let through, correct or mistake)
- [X] T030 [P] [US3] Live-region announcements of the latest decision; focus moves to the heading of each new screen and to the playfield when play begins
- [X] T031 [P] [US3] Speed control: Step (15 ticks per N press, arrows hop), Slow (30 ticks per second, the default), Normal (60); pause stops everything; the tab pauses automatically when hidden
- [X] T032 [P] [US3] Reduced motion removes decorative effects; the narrow layout stacks the ACL above the playfield in its own scroll box; the playfield scales to fit
- [X] T033 [US3] Accessibility audit: every control has an accessible name; the meter and picture are labelled; the page language is set; state is shown as text, not colour alone
- [X] T034 [US3] Run quickstart checks 13–16 with `tests/browser-check.mjs` (keyboard only at Step, real-time at Slow with held keys, 375 px emulated window, reduced motion). **Done by script. A person has not yet done a keyboard-only run, and no screen reader has been tried (check 22).**

**Checkpoint**: All three stories are verifiable by script.

---

## Phase 6: Polish and release

- [X] T035 Replace every `TODO(sources)` in `data/levels.json` with a verified citation. Done 2026-11-18: four sources, each opened and read before writing (Cisco IOS XE 17 ACLs Configuration Guide "How ACLs work" for first match and order; the same guide "Create extended named ACLs" for the implicit deny; the Cisco IOS XE ACL command reference `permit` for the `ip` keyword and `any`/`host`; RFC 4632 section 3.1 for CIDR prefix notation). Claims stay within what each page says; two things are not stated word for word (a tcp entry not matching udp, and the CIDR-for-wildcard-mask simplification) and the README says so. 6 tests (no placeholder, https hosts we checked, no unused sources, each level cites its rule's source, the claims say what they must) and 2 link tests (opens in a new tab with noopener; a non-https address is never a link). The sources are real links in the briefing and the results. A person with networking knowledge should still review the content against them (T036)
- [ ] T036 Have someone with networking knowledge review all 48 reference cases, all briefings, and all explanations against the cited sources, and record the reviewer's notes (spec SC-001, SC-008)
- [X] T037 [P] Write `README.md` with the real run and test commands, how to play, the technical model and exclusions, how it was built, and a verification table with honest pass, fail, or not run entries
- [ ] T038 Run the remaining quickstart checks that need people: **20** (a first-time player's time and number of packets in play), **21** (a teammate's explanation), **22** (human keyboard-only run and a screen reader), and **18** in the browser. Checks 1–17 and 19 passed by script on 2026-11-17 (see the README)
- [X] T039 [P] (Workshop submission, not a feature requirement.) ARCADE.md is complete: every field the build record can fill is filled, and the creator supplied a name, GitHub username, repo URL, LinkedIn link, consent to publish, first-project, and the license (Apache-2.0; LICENSE is the official text and NOTICE credits the adapted sources). Location and organization are optional and left blank. The card image is a real gameplay screenshot. The remote repository already has the earlier version of the file; the latest change (username and repo URL) still needs to be committed and pushed

---

## Phase 7: Second revision (2026-11-18), after a playtest

- [X] T040 Make **Normal** the default speed: `createSession` default, the speed menu's selected option, and the spec, research, contracts, README, and checks (a test asserts the default; the browser check measures about 60 ticks per second by default and about 30 at Slow)
- [X] T041 Replace packet loss with **health** (constitution v3.0.0; spec FR-013 and AC6b). Tests first: health starts at 3 and caps at 3; a mistake costs 1; a correct decision gives 1 back and never goes above the maximum; at 0 the wave fails at once, even on the last packet; right decisions between wrong ones keep you alive; retry restores health to its value at the wave start; mistakes stay counted. 18 tests failed first, then passed after the engine change
- [X] T042 Implement health in `engine/state.js`, `engine/content.js` (`maxHealth` replaces `lossLimit`), `data/levels.json`, and the UI: three hearts plus "Health 2 of 3" in the header; the review, failed-wave, and summary screens say health; the Level 1 briefing teaches the rule
- [X] T043 Fix the focus bug (spec AC18, FR-024). The regression check came first and reproduced the bug with real mouse clicks: after clicking Pause, Space paused again instead of firing; the same happened after clicking Move. Fix: after a game control (move, fire, pause, hint, advance) is used, `ui/controls.js` returns focus to the playfield, and a speed change made with the pointer does the same (a change made with the arrow keys keeps focus on the menu)
- [X] T044 Sync the documents: constitution C3 (both copies, v3.0.0), spec, data model, research R4 and R5, plan, contracts, quickstart (new checks 23 and 24), and README. Verified: 144 of 144 tests and 66 of 66 browser checks

- [X] T045 Correct the health rule (the team: "health should start at 3 for each level and on retry"): health is 3 at the start of every level and after every retry, and carries between a level's two waves. Two tests failed first (retry to full health; a new level resets health), then passed after the change; `healthAtWaveStart` was removed. Constitution v3.1.0, spec FR-013, data model, research R5, contracts, quickstart check 25, README, and the Level 1 briefing were updated

- [X] T046 Shorten the starting page (the team: "the last thing I want is a wall of text"). Briefings became short cards: headings, bullets, and one example, 117, 81, and 81 words (the Level 1 briefing was about 270). `ui/briefing.js` turns a small markup into cards, escaping everything; tests cover the parser, HTML safety, and a guard that keeps briefings short (130 words, 3 headings, an example, no paragraph over 35 words; a mutation that restored a long paragraph made it fail). The briefing screen shows the cards side by side with the Start button visible without scrolling at 1366×768, the sources behind a "Sources" control, and a compact key legend instead of a paragraph. Spec FR-001 and FR-022 updated
- [X] T047 Rename the game from "Packet Defender" to **Permit or Pew** (the player is a firewall deciding which packets get through, not defending packets). 21 mentions in 15 files, the page title, and the memory note. The internal folder `specs/001-packet-defender` keeps its old slug on purpose: it is only an id, and renaming it would break Spec Kit's pointers

- [X] T048 Redesign the results screens (the team: pass and fail looked the same; results should be easy to read; mistakes at a glance; sources expandable). New `ui/results.js` (plain HTML builders, tested in Node): a big banner (green, ✓, "Wave 1.1 cleared" or red, ✗, "Wave 1.1 failed") holding the next-step button; stat tiles; "What went wrong" with one line per mistake (packet, what you did, what to do instead, the deciding entry) and the full explanation inside each line, collapsed; one collapsed "Sources: read more" section. `engine/feedback.js` gained `mistakeSummary`, and each mistake record gained `packetText`, `what`, `should`, `because`. 17 new tests (4 for the summary, 13 for the results). Browser checks use real mouse clicks to expand a line and the sources, check that pass and fail differ in words, icon, and background colour, and that the next-step button is visible without scrolling with 3 mistakes listed. Spec FR-012, FR-022, AC9, AC9b, AC10 updated. Looking at the screenshots led to one polish fix: no focus ring around the banner title, which is not a control

- [X] T049 Fix "the game won't load into the start screen". Reproduced first: a browser that had loaded an older version kept an old `engine/feedback.js` (long heuristic cache lifetime) while re-downloading a newer `engine/state.js`, so state.js asked for an export the old file lacked and the page stayed on "Loading…" with a console error. Restarting the server cannot fix that, because the stale copies are in the browser. Fixes: (1) `serve.py`, the built-in static server plus `Cache-Control: no-store`, is now the documented way to run the game; (2) a plain script in `index.html` runs even when the game's modules fail, and after 4 seconds on "Loading…" it shows "The game did not start" with the cause and the fix (hard refresh, or `py serve.py`). Verified in the same scenario: the plain server reproduced the failure and now shows the message; `serve.py` loads correctly. A browser check keeps the message working. Docs updated (README with a troubleshooting note, quickstart check 31, research R8)

- [X] T050 Show the rules on the results page (the team: the results name the rule that made the player wrong, but the rules are not on the page). The wave's access list is now on both the cleared and failed results screens, beside "What went wrong": every entry in order plus the implicit deny; entries that caused mistakes are marked "✗ caused N mistakes"; each mistake line shows the text of its deciding entry (`entryText`, new on the mistake record; `mistakeSummary` now takes the list); opening a line highlights its entry ("◀ this rule"). Tests first: 4 feedback tests were rewritten for the new signature (they failed first), and 8 new results tests (6 failed first). Browser checks use real clicks for the highlight, and check the list sits beside the mistakes and is visible without scrolling. One of my own browser expectations was wrong (all three wrong shots in the failed wave were decided by the same catch-all entry, so it correctly said "caused 3 mistakes"); I fixed the check, not the game. Spec FR-012 and AC9c, the contracts, and quickstart check 32 updated

- [X] T051 Add sound effects and music (the team: "how do we add sound effects and music?"; chosen: generated in the browser, effects and music on by default, with a mute key). Tests first: the loop reports a "fired" event (not when the 2-bullet cap blocks it); the session reports sound moments (`session.sounds`) for fire, correct and wrong hits, delivered, leak, wave start, cleared, failed, pause, resume, and hint, with a call that changes nothing returning the same session (so a sound plays once); `ui/sounds.js` data tests (equal-temperament frequencies, every effect audible and not too loud, a mistake clearly unlike a hit, cleared rises and failed falls, one tune per level, each 8 bars with a bass root, each level faster); 27 new tests. Then `ui/sounds.js`, `ui/audio.js` (Web Audio, look-ahead music scheduler, master volume, an analyser after the master volume), the Sound button, the M key, and a volume slider (focus returns to the playfield, as with the other buttons). Browser checks measure the real audio output level: no audio before the first key press, music audible, firing plays the fire sound, M silences the output, unmuting restores it, pause stops the music, the volume at 0 is silent. A deliberate mutation (mute and volume do nothing) failed exactly the two checks that matter, with non-zero measured levels, so the measurement is meaningful. Constitution C4 gained the rules for sound (v3.2.0), the spec FR-032 to FR-036 and AC19. **One person has since listened to the music and said it is good (2026-11-18); the sound effects have not been reviewed separately (quickstart check 35).**

---

## Dependencies and Execution Order

- **Setup → Foundational → US1 → US2 → US3 → Polish.** US2 and US3 extend the files US1 creates.
- T036 needs a person and can run alongside any phase. (T035, the sources, is done.)
- Within a story: tests first, then engine, then UI.

## Implementation Strategy

1. Prove the rule (T006–T012), then the motion (T013, T015), then the review (T014, T016, T017, T023–T025), then content, then the screen. This follows the constitution's C7 build order.
2. If time runs short, cut effects first, then Normal speed, then narrow-layout polish. Never cut the evaluator, the review, or the text mirror; if still short, reduce to four waves and update the spec and tasks.

## Notes

- Expected results in tests are typed from the spec's reference tables. They are never computed by the evaluator under test.
- Briefings and explanations must cite a source. The sources are done (T035); T036, an independent networking review, is still open.
- Update a checkbox only when the check actually passed.
