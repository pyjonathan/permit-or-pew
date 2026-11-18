<!--
SYNC IMPACT REPORT (temporary; remove before committing)
Version change: 3.1.0 → 3.2.0 (MINOR: guidance added to C4 for sound effects and music; nothing removed or redefined).
Modified principles in 3.2.0: C4 only. Source: the team's 2026-11-18 decision to add sound.
Version change: 3.0.0 → 3.1.0 (MINOR: a refinement of the health rule introduced earlier the same day,
  2026-11-18, before it was relied on. Health now starts at the maximum for every level and on every
  retry, instead of carrying across levels and being restored to its value at the wave start.)
Modified principles in 3.1.0: C3 only.
Version change: 2.0.0 → 3.0.0 (MAJOR: C3 redefined. "Packet loss, one running total that only rises, with a
  limit of 6" is replaced by "health: 3 at the start and at most, -1 for a mistake, +1 for a correct
  decision, wave fails at 0"; backward-incompatible with 2.x.)
Modified principles in 3.0.0: C3 only (health model; healing; retry restores health at the wave start;
  the spec must state starting and maximum health). Source: the team's 2026-11-18 decision.
(2.0.0 history: C2 redefined. "A wrong decision MUST pause play" became "a mistake never freezes the
  action"; backward-incompatible with 1.x.)
Modified principles in 2.0.0: C2 (mistakes show a non-blocking message and are fully explained in an
  after-action review of the wave; player may still pause any time), C3 (each mistake adds to
  the wave review instead of pausing; reaching the limit fails the wave at once), C4 (step mode
  advances time; speed scales all motion), C6 (flight path replaces lane in the list of things that
  must not decide correctness), C7 (build order names the after-action review). Source: the team's
  2026-11-17 decision to make a Galaga-style arcade game; the pause-on-every-mistake loop played
  like flash cards.
(1.1.0 history: C3 changed to one running packet-loss total with wave-only retry.)
Added principles: none
Added sections: none
Removed sections: none
(1.0.0 history: initial ratification from the blank template with C1-C7, "Scope and Technical
  Model", and "Workflow and Amendments".)
Deferred items: none. Source citations for each networking rule are required by C1
  and are tracked in SPEC.md ("to be confirmed during clarify"), not here.
Source: CONSTITUTION.md at the repository root, which is the authored input.
-->
# Permit or Pew Constitution

_Adapted from the NAF AC6 workshop starter kit (Apache-2.0) and changed by Jonathan Buchanan for Permit or Pew. See NOTICE._

## Core Principles

### C1 · Technical Truth Is a Release Requirement
The game MUST never reward a technically incorrect answer. Grading MUST be reproducible from a
documented rule and the challenge inputs. Unsupported or ambiguous content is an authoring error:
the game MUST show an explanation that the challenge is unavailable and MUST prevent grading it.

The taught model is a Cisco IOS-style extended, named, stateless IPv4 ACL applied to inbound
traffic. Entries are evaluated top to bottom; the first matching entry decides (permit or deny); a
packet matching no entry is denied by the implicit deny at the end. Entries match on protocol
(`tcp`, `udp`, `icmp`, or `ip` for any), source address, destination address, and an optional
single destination port (`eq`). Addresses are written as `any`, `host A.B.C.D`, or CIDR
(`A.B.C.D/N`).

Excluded from the model: stateful inspection and `established`, wildcard masks (CIDR is used
instead), port ranges and other port operators, source ports, IPv6, fragments, logging, object
groups, and other vendors' syntax. Simplifications MUST appear in the briefing and README wherever
they affect what the player can conclude. Fictional worlds and animations MAY illustrate a rule;
they MUST NOT change it.

**Evidence:** hand-checked correct, incorrect, and boundary cases; a source link and section for
each networking rule; review of all shipped briefings and explanations. Expected results are
recorded independently of the implementation under test.

### C2 · Every Round Teaches Through a Decision
The player's main action MUST exercise the target skill. The decision is to shoot a packet or let
it pass, made against an ACL that stays visible on screen. A concept MUST be introduced before it
is tested, and the values needed to reason about the answer MUST be shown. A wrong decision MUST
explain the specific mistake and give the player a useful next step. A correct decision MUST show
why it works.

Real-time action is allowed under these conditions:

- A mistake MUST NOT freeze the action. It MUST show a short, non-blocking text message at once
  (what happened and which entry decided the packet). The full explanation (the packet's headers,
  the matching entry, and why the decision was wrong) MUST be recorded and shown in an after-action
  review before the player moves on from the wave. A wave's review MUST list every mistake from
  that attempt, so no explanation is lost, and none may vanish on a timer.
- The player MUST be able to pause at any time to study the list and to request a hint while
  paused.
- Pacing is authored. Waves come from data and are identical on every playthrough; nothing about
  what is correct or when it appears is random.

The learning sequence is: match fields (single rules, CIDR boundaries) → rule order (first match
wins) → implicit deny and mixed protocols. Hints reveal a method first, then a worked step. Worked
solutions MUST be available when a learner is stuck; viewing one MUST be recorded as assistance,
never as independent mastery.

**Evidence:** a teammate can connect each player action to a learning outcome and describe what
they learned from a deliberately wrong choice.

### C3 · Progress Is Honest and Retry Is Safe
A wave completes when every packet in it has been resolved and the player's health has not
reached 0. Each packet MUST be resolved exactly once: by being shot, by passing through, or
by leaking through. A wave's summary MUST show how many packets were handled correctly and how
many were mistakes; finishing a wave with mistakes MUST NOT be presented as a clean result.
Repeated fire at an already-resolved packet MUST NOT award progress or change health twice. Shots that
hit no packet are not decisions and carry no consequence.

Health is how well the player is protecting the network. The player starts every level with 3
health, which is also the maximum. A mistake costs 1 health: shooting a packet the ACL permits, or
letting a packet the ACL denies reach the network. A correct decision gives 1 health back, never
above the maximum: shooting a packet the ACL denies, or letting a permitted packet reach the
network. Each mistake shows the non-blocking message and adds to the wave's review (see C2). Health
carries from the first wave of a level into the second, and MUST go back to the maximum at the start
of every new level. If a mistake brings health to 0, the current wave fails at once, the review of
that attempt is shown, and the player MAY retry that wave. A retry MUST restart only the failed wave
and MUST restore health to the maximum. Mistakes made in a failed attempt stay counted. There is no level countdown, no score, no speed bonus, and no leaderboard. Hints, pausing,
and retries cost nothing. Completed waves, mistakes, and assistance MUST be shown separately;
completion is not proof of independent mastery. The specification MUST state exactly what advances a
wave, finishes a level, fails a wave, and resets a session, and MUST state the starting and maximum
health.

**Evidence:** wrong-shot, wrong-pass, leak, duplicate-fire, hint, healing on correct decisions,
the cap at maximum health, wave-fail-and-retry (including restored health), completion, and reset
checks match the specification.

### C4 · Access Is Part of the Core Game
All core actions (move, fire, pause, hint, continue, restart) MUST be usable by keyboard with
visible focus, readable labels, and an understandable order. The ACL, the current packet headers,
and all feedback MUST be available as real text, not only inside a canvas. Success and failure MUST
be explained with text as well as color and shape. A text equivalent of the playfield MUST be
provided: a readable list of the packets currently on screen and their outcomes.

Pace MUST be adjustable. A speed setting MUST reach a pace slow enough for a beginner to read every
packet, including a step mode in which time advances only on player input. The speed setting MUST
scale all motion together, so a slower pace changes how fast things move but never what is correct. Reduced-motion
preferences MUST be respected; reduced motion MUST NOT remove information or delay the availability
of feedback or controls.

Sound is an extra layer, never the only signal. Every fact the game gives by sound (a hit, a mistake,
a wave cleared or failed) MUST also be given as text. Sound MUST only start after the player has done
something (a key press or a click), MUST be one key and one button away from muted, MUST have a volume
control, and MUST NOT be needed to play or to learn. Sound is synthesized in the browser, so the game
stays self-contained (C5): no audio files and no external sound or music service.

The challenge MUST remain usable on a typical laptop and a narrow browser window. Dense technical
data MAY scroll within its own labeled container, without hiding the controls.

**Evidence:** a keyboard-only playthrough at the slowest setting, a narrow-window check, and a
reduced-motion check. Record what was actually checked; do not claim full accessibility
certification.

### C5 · The First Version Is Deterministic and Self-Contained
The game MUST ship authored content and deterministic domain logic. It MUST require no account,
backend, live device connection, model, or API key. AI MAY help write code and assets during
development; its output receives the same review as any other contribution.

Runtime AI tutoring, generated questions, and free-text AI grading are stretch work. Adding them
requires an explicit change to this constitution, the specification, and the verification approach
before implementation.

**Evidence:** a clean browser session can play using only the project's static files; no external
content service decides an answer.

### C6 · Content and Logic Can Be Reviewed Separately
Level content, ACLs, packets, wave timing, hints, sources, and difficulty MUST be stored in
editable data. Domain rules MUST be kept separate from rendering, game-loop timing, and progress
tracking. Data MUST be validated before a challenge is presented. Whether a packet is permitted or
denied MUST be decided only by the rule evaluator, never by sprite position, color, flight path, or an
authored answer key. Feedback MUST agree with the evaluator's reasoning.

Adding another wave that uses the existing mechanic MUST require a data change and its checks, not
a new scoring path or a new screen implementation.

**Evidence:** inspect one level's data, trace one packet through the evaluator, and add a trial
wave without modifying the rule engine.

### C7 · Done Is Demonstrated
Only the agreed scope ships. Requirements, plan, tasks, and README MUST describe the same game. A
feature is complete when its acceptance criteria pass and its actual status is recorded. A
screenshot, a checked task box, or the agent saying "done" is insufficient by itself.

When time is short, scope MUST be reduced explicitly. Incorrect teaching and broken core
interactions MUST be fixed before visual effects are added. The evaluator and the after-action
review MUST be built and verified before movement, formations, and effects. Failed and untested checks
MUST remain visible.

**Evidence:** reproducible run/test commands, recorded verification results, a fresh-start
playthrough, and a README another attendee can follow.

## Scope and Technical Model

**Purpose:** help software developers and IT beginners practice reading an ordered access control
list (ACL) to predict whether a packet is permitted or denied, through shooting the packets the
list denies and letting the permitted ones pass.

**First release:** one core mechanic, three short levels, a browser, and a 60-minute workshop
build. This budget MAY change only by updating the agreed scope. No user accounts, multiplayer,
backend, live infrastructure access, runtime AI, leaderboard, score, or level editor are in scope.

## Workflow and Amendments

The project follows the Spec Kit sequence: constitution → specify → clarify → plan → tasks →
analyze → implement. Analysis findings that conflict with this constitution are resolved openly;
the build agent MUST NOT weaken a principle merely to make its implementation pass.

**Amendments to the workshop starter text.** The team chose a fast-paced, real-time shooter
instead of a turn-based quiz, which the starter principles did not allow.

| Principle | Change from the starter | Why |
| --- | --- | --- |
| C2 | Real-time play allowed. Mistakes never freeze the action: a short non-blocking message appears at once and every mistake is fully explained in an after-action review of the wave. The player may pause at any time. (v2.0.0, 2026-11-17: replaced the earlier "a wrong decision pauses play".) | Pausing on every mistake made the game play like flash cards; the explanation is kept, but moved to the end of the wave so the action keeps its flow. |
| C3 | Replaced "no lives, countdown, or speed bonus" with a health measure: 3 health at the start of every level and at most; a mistake costs 1, a correct decision gives 1 back; health carries between a level's two waves; at 0 the current wave fails, and a wave-only retry restores health to the maximum. Still no timer, score, speed bonus, or penalty for hints or retries. Replaced the Submit and empty-input rules with once-only packet resolution. (v3.1.0, 2026-11-18: health resets each level and on retry; v3.0.0 replaced the earlier "packet loss, one running total with a limit of 6".) | A shooter needs stakes, and an arcade game needs recovery. Healing on right decisions rewards playing well, and a fresh start on every level and retry keeps one bad stretch from scarring the rest of the game (the team's decisions, 2026-11-18). |
| C4 | Added adjustable speed with a step mode, a text equivalent of the playfield, and real-text ACL and feedback. (v3.2.0, 2026-11-18: added the rules for sound: an extra layer only, text for everything, mute and volume, starts after a user action, synthesized in the browser.) | Real-time play and canvas rendering are the main accessibility risks. |
| C6 | Extended data scope to waves and timing; the evaluator alone decides permit/deny. | Prevents the game loop from deciding correctness. |
| C7 | Added build order: evaluator and after-action review before movement, formations, and effects. | Real-time is the likeliest way to run out of time. |

## Governance

This constitution supersedes other project practices. For any material change, the reason MUST be
recorded, the affected spec and plan updated, and analysis rerun. Amendments follow semantic
versioning: MAJOR for removing or redefining a principle in a backward-incompatible way, MINOR for
adding a principle or section or materially expanding guidance, PATCH for clarifications and
wording fixes. Every plan, task list, and release review MUST be checked for compliance with C1–C7,
and any complexity or deviation MUST be justified in writing. The root `CONSTITUTION.md` is the
authored source for this document; the two MUST be kept in agreement.

**Version**: 3.2.0 | **Ratified**: 2026-11-17 | **Last Amended**: 2026-11-18
