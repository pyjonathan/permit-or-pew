# Phase 0 Research: Permit or Pew

Decisions come from the spec, the constitution (v2.0.0), and playtesting feedback. No external research was needed. Items marked TODO need a person or a source check before release; they are not hidden unknowns in the design.

> **Revision 2026-11-17.** The first build used four lanes, instant hits, and a pause on every mistake. Playtesting showed it played like gamified flash cards. R2, R3, and R4 below replace the earlier versions; R10 records what was dropped.

## R1 · Playfield technology

- **Decision:** SVG for the playfield, DOM for controls, the ACL panel, feedback, and the text mirror. No canvas, no rendering library.
- **Rationale:** At most 8 packets and 2 bullets are on screen. SVG elements carry real text, which the packet sprites need, and the DOM text mirror gives assistive technology the same information. It needs no dependency. Re-rendering a few dozen elements each tick is cheap.
- **Alternatives considered:** Canvas (faster for thousands of sprites, but invisible to assistive technology and the packet text is the whole point). A game library (a dependency and an accessibility burden for no teaching gain).

## R2 · Time model (revised)

- **Decision:** Time is an integer **tick** count. `tick(state, input)` is pure and every position is a pure function of the tick number. Only `ui/clock.js` uses a clock: a `requestAnimationFrame` fixed-timestep loop at 60 ticks per second (Normal) or 30 (Slow). Step mode has no clock: `N` advances 15 ticks.
- **Rationale:** Deterministic waves (C2, C5); the game is testable without a browser clock; Slow and Step scale time without changing what happens in a tick (C4).
- **Alternatives considered:** Variable delta time (not reproducible). A timer inside the engine (breaks purity).

## R3 · Shooting model (revised)

- **Decision:** The ship moves freely along the bottom (5 units per tick, or one 50-unit hop in Step mode). A bullet starts at the ship, rises 9 units per tick, and is destroyed when it hits a packet or leaves the top. At most 2 bullets are in flight. A bullet hits the lowest sprite (largest y, nearest the ship) among those it overlaps. A bullet's tick order is: move ship, update packets, move bullets and resolve hits, resolve packets that finished their dive.
- **Rationale:** Real bullets that travel and can miss give skill (aiming, leading a swaying packet, holding fire on a permitted packet). The 2-bullet cap is Galaga's and stops spamming. Choosing the lowest sprite makes a hit deterministic when sprites overlap; a test builds exactly that overlap.
- **Alternatives considered:** Instant hits (removed: no skill, quiz-like). Unlimited bullets (lets a player spray the formation without reading the ACL).

## R4 · Pace values (revised)

- **Decision:** Normal runs 60 ticks per second (the default since 2026-11-18), Slow 30, and Step advances 15 ticks per key press. The speed setting scales all motion together, including the ship and bullets.
- **Rationale:** At Normal the first packet dives after 8 seconds and each wave takes about 25 seconds. Slow doubles those times and leaves a beginner more time to read the ACL and the headers. The default was changed from Slow to Normal after playtesting: the team found Normal the right difficulty. Step gives full control and covers accessibility.
- **Alternatives considered:** A continuous speed slider (more controls to make accessible and test, no learning gain).

## R5 · Health, mistakes, and wave retry (revised 2026-11-18, twice)

- **Decision:** Session holds `maxHealth` (3), `health`, cumulative `mistakes` by type, and `retries`. `health` starts at `maxHealth`, goes back to `maxHealth` when a new level begins and on every retry, and carries from a level's first wave into its second. A mistake subtracts 1; a correct decision adds 1, capped at `maxHealth`. When `health` reaches 0 the wave fails at once, even if it was the last packet. Retry restores `health = maxHealth`, adds 1 to `retries`, and does not reduce `mistakes`.
- **Rationale:** The earlier "packet loss" total (limit 6) could only get worse, so a bad wave scarred the rest of the game. Healing on correct decisions rewards playing well and lets a run recover. A first version of the health rule carried health across levels and restored it to the wave-start value on retry; the team corrected that ("health should start at 3 for each level and on retry") because a retry that began nearly dead, or a level that began hurt, punished the player twice for the same mistakes. Two waves share one bar within a level so a mistake in wave 1 still matters in wave 2.
- **Alternatives considered:** Carry health across levels (rejected by the team). Restore the wave-start value on retry (rejected by the team). A separate bar per wave (removes the pressure of the second wave).

## R6 · Explanation content and the review (revised)

- **Decision:** Every mistake produces a stored record (kind, packet, deciding entry, full explanation text assembled from the evaluator's `evidence`). During play the player sees only a one-line message. The full records appear in the after-action review when the wave ends or fails.
- **Rationale:** Constitution C2 v2.0.0: no mistake freezes the action, and no explanation is lost. Building text from `evidence` keeps feedback in agreement with the evaluator (C6).
- **Alternatives considered:** Pause on every mistake (the original design; it made the game feel like flash cards). Show the full explanation in a corner during play (unreadable at speed).

## R7 · Testing approach

- **Decision:** A dependency-free test runner that works in the browser and in Node, with expected results typed as literals from the spec's tables. A separate Chrome-driven script plays the real game with real key presses. Its "perfect play" bot plans a flawless wave on the pure engine and replays the same key presses in the browser; if the browser also ends perfect, they agree. Mutation checks (deliberately breaking a rule on a scratch copy) confirm the tests can fail.
- **Rationale:** C1 and C7 require independent, recorded checks. The engine is pure, so most behaviour is testable without a browser.
- **Alternatives considered:** A test framework (an extra install for attendees).

## R8 · Static serving and loading

- **Decision:** Native ES modules and one `data/levels.json` loaded with a relative URL, served by `py serve.py` (Python's static server plus `Cache-Control: no-store`). `file://` is not supported and shows a clear message.
- **Rationale:** Modules and JSON fetching need HTTP. Relative paths keep it hostable from a repository subpath.

## R9 · Reference sources (done 2026-11-18)

- **Decision:** Four source records in `data/levels.json`, each opened and read before being written down:
  1. **Cisco IOS XE 17 ACLs Configuration Guide, Access Control Lists, "How ACLs work"** (https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/security/acls/acls-configuration-guide/access-control-lists.html): the device tests packets against the conditions one by one; "The first match decides whether the switch accepts or rejects the packets"; "Because the switch stops testing after the first match, the order of conditions in the list is critical." (Levels 1, 2, 3)
  2. **The same guide, "How to configure IPv4 access control lists", "Create extended named ACLs":** "the end of the ACL contains an implicit deny statement for everything." (Level 3)
  3. **Cisco IOS XE Catalyst SD-WAN Qualified Command Reference Guide, ACL Commands, `permit`** (https://www.cisco.com/c/en/us/td/docs/routers/sdwan/command/iosxe/qualified-cli-command-reference-guide/m-acl-commands.html): "To match any Internet protocol (including Internet Control Message Protocol (ICMP), TCP, and User Datagram Protocol (UDP), use the keyword ip"; the keywords `any` and `host`. (Levels 1, 3)
  4. **RFC 4632, section 3.1 "Basic Concept and Prefix Notation"** (https://www.rfc-editor.org/rfc/rfc4632), August 2006: a prefix length is "a decimal value between 0 and 32 that describes the number of significant bits." (Levels 1, 3)
- **Rationale:** Constitution C1 and spec FR-022 require a source and section for each rule the game teaches. Each claim in the data stays within what the page says. The `eq` port operator appears in the Cisco ACLs Configuration Guide ("Create a numbered extended ACL" lists eq among the possible operators) but no source record claims it, so it is not cited.
- **Not stated word for word, so not claimed as sourced:** (a) that a `tcp` entry does not match `udp` traffic (the pages list tcp and udp as separate protocols; the game treats the protocol field as an exact match); (b) that the game's CIDR ranges replace Cisco's wildcard masks (a documented simplification, shown in the Level 1 briefing); (c) "stateless" and "inbound" are model choices described in the briefing and README, not quoted from these pages.
- **Checks:** tests require that no placeholder remains, every source is an https link to cisco.com or rfc-editor.org with a title, section, and claim, every source is cited by a level, and each level cites the source for the rule it teaches. The sources are real links in the game that open in a new tab (https only, `noopener`).
- **Risk:** the Cisco pages are for IOS XE and can change or move; revisit them before a later release.

## R10 · Dropped from the first version

- Four lanes, `spawnStep`, hitscan fire, and pause-on-mistake were removed. The ACL evaluator, content validator, explanation text, and most of the session logic carried over unchanged.

## R11 · Formation and determinism

- **Decision:** Eight packets per wave fill formation slots 0 to 7 (5 columns by 2 rows). Packet `i` enters from above into its own column at tick `10 i` and holds. Packets then dive in a fixed order on one of four paths (`drop`, `sway`, `swoop-in`, `zigzag`), each a closed-form function of the tick. Dive times and durations are data, set per level. Sway paths use `Math.sin` and are rounded to two decimals; no test depends on exact positions near a boundary.
- **Rationale:** Galaga's formation and dives, with authored timing so a wave replays identically. Packets in the same column shield each other until the front one leaves, which makes the player read the list and wait.
- **Alternatives considered:** Random dive order (breaks C2/C5). A physics engine (a dependency and non-determinism).

## R12 · Wave length and difficulty

- **Decision:** Level 1 first dives at tick 480 (every 100 ticks, 300 to cross); level 2 at 420 (every 90, 260); level 3 at 360 (every 80, 220). At Normal that is 8, 7, and 6 seconds of reading time before the first dive (double at Slow).
- **Rationale:** The formation holds long enough to read all eight headers against the ACL; later levels leave less time and dive faster.
- **Open:** these numbers are untested with a first-time player (spec SC-002, SC-009).

## R14 · Sound (added 2026-11-18)

- **Decision:** Sound effects and music are synthesized in the browser with the Web Audio API from data in `ui/sounds.js`. Effects are short oscillator tones (square, triangle, sawtooth, sine) with a pitch glide and a quick volume envelope. Music is one 8-bar loop per level built from chords (a bass root plus an arpeggiated lead), scheduled a fraction of a second ahead on the audio clock so it does not stutter. The engine only reports sound moments (`session.sounds`: fire, hit-correct, hit-wrong, delivered, leak, wave-start, wave-cleared, wave-failed, pause, resume, hint); `ui/audio.js` plays them. Sound is on by default after the first key press or click, with a mute key and button and a volume slider.
- **Rationale:** No audio files means nothing to find, license, credit, or ship, and the game still works offline from static files (constitution C5). Synthesized square-wave tones suit an arcade game. Keeping the engine free of audio code keeps it pure and testable: the data is checked in Node (ranges, loudness, tune structure), and the real output level is measured in Chrome (a muted game must measure as silent).
- **Alternatives considered:** Recorded sound packs (richer, but licensing, credit, files to ship). AI-generated music (unclear licensing). Effects only (loses the atmosphere).
- **Limits:** the sound was written without being heard. Afterwards one person listened to the music and said it is good; the effects have not been reviewed separately. Whether it sounds good is a human judgement; everything about its tuning lives in one data file so it is easy to change. Mute and volume are not saved across reloads (spec FR-036).

## R13 · Open spec items carried forward

- A leak and a wrong shot both cost 1 (spec assumption).
- The 48 reference cases still need a review by someone with networking knowledge (spec SC-001).
