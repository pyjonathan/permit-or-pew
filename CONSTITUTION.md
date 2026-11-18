# Permit or Pew · Project constitution

_Adapted from the NAF AC6 workshop starter kit (Apache-2.0) and changed by Jonathan Buchanan for Permit or Pew. See NOTICE._

**Purpose:** help software developers and IT beginners practice **reading an ordered access control list (ACL) to predict whether a packet is permitted or denied** through **shooting the packets the list denies and letting the permitted ones pass**.

**First release:** one core mechanic, three short levels, a browser, and a 60-minute workshop build. Change this budget only by updating the agreed scope.

## C1 · Technical truth is a release requirement

The game must never reward a technically incorrect answer. Grading must be reproducible from a documented rule and the challenge inputs. Unsupported or ambiguous content is an authoring error: show an explanation that the challenge is unavailable and prevent grading it.

Document the model being taught: **a Cisco IOS-style extended, named, stateless IPv4 ACL applied to inbound traffic. Entries are evaluated top to bottom; the first matching entry decides (permit or deny); a packet matching no entry is denied by the implicit deny at the end. Entries match on protocol (tcp, udp, icmp, or ip for any), source address, destination address, and an optional single destination port (`eq`). Addresses are written as `any`, `host A.B.C.D`, or CIDR (`A.B.C.D/N`).** Excluded: stateful inspection and `established`, wildcard masks (CIDR is used instead), port ranges and other port operators, source ports, IPv6, fragments, logging, object groups, and other vendors' syntax. Simplifications must appear in the briefing and README wherever they affect what the player can conclude. Fictional worlds and animations may illustrate a rule; they must not change it.

**Evidence:** hand-checked correct, incorrect, and boundary cases; a source link and section for each networking rule; review of all shipped briefings and explanations. Expected results are recorded independently of the implementation under test.

## C2 · Every round teaches through a decision

The player's main action must exercise the target skill. Here the decision is **shoot a packet or let it pass**, and it is made against an ACL that stays visible on screen. Introduce a concept before testing it, and show the values needed to reason about the answer. A wrong decision explains the specific mistake and gives the player a useful next step. A correct decision shows why it works.

Real-time action is allowed, with these conditions:

- **A mistake never freezes the action.** It shows a short, non-blocking text message at once (what happened and which entry decided the packet). The full explanation (the packet's headers, the matching entry, and why the decision was wrong) is recorded and shown in an after-action review before the player moves on from the wave. A wave's review lists every mistake from that attempt, so no explanation is lost, and none may vanish on a timer.
- **The player can pause at any time** to study the list, and can request a hint while paused.
- **Pacing is authored.** Waves come from data and are the same every playthrough; there is no randomness in what is correct or when it appears.

Use this learning sequence: **match fields (single rules, CIDR boundaries) → rule order (first match wins) → implicit deny and mixed protocols**. Hints reveal a method first, then a worked step. Worked solutions are available when a learner is stuck; viewing one is recorded as assistance, never as independent mastery.

**Evidence:** a teammate can connect each player action to a learning outcome and describe what they learned from a deliberately wrong choice.

## C3 · Progress is honest and retry is safe

A wave completes when every packet in it has been resolved and the player's health has not reached 0. **Each packet is resolved exactly once**: by being shot, by passing through, or by leaking through. A wave's summary always shows how many packets were handled correctly and how many were mistakes; finishing a wave with mistakes is never presented as a clean result. Repeated fire at an already-resolved packet cannot award progress or change health twice. Shots that hit no packet are not decisions and carry no consequence.

**Health is how well the player is protecting the network.** The player starts every level with 3 health, which is also the maximum. A mistake costs 1 health: shooting a packet the ACL permits, or letting a packet the ACL denies reach the network. A correct decision gives 1 health back, never above the maximum: shooting a packet the ACL denies, or letting a permitted packet reach the network. Each mistake shows the non-blocking message and adds to the wave's review (see C2). Health carries from the first wave of a level into the second, and goes back to the maximum at the start of every new level. If a mistake brings health to 0, the current wave fails at once, the review of that attempt is shown, and the player may retry that wave. A retry restarts only the failed wave and restores health to the maximum. Mistakes made in a failed attempt stay counted. There is no level countdown, no score, no speed bonus, and no leaderboard. Hints, pausing, and retries cost nothing. Show completed waves, mistakes, and assistance separately; completion is not proof of independent mastery. The specification must say exactly what advances a wave, finishes a level, fails a wave, and resets a session, and must state the starting and maximum health.

**Evidence:** wrong-shot, wrong-pass, leak, duplicate-fire, hint, healing on correct decisions, the cap at maximum health, wave-fail-and-retry (including restored health), completion, and reset checks match the specification.

## C4 · Access is part of the core game

All core actions (move, fire, pause, hint, continue, restart) must be usable by keyboard with visible focus, readable labels, and an understandable order. The ACL, the current packet headers, and all feedback must be available as real text, not only inside a canvas. Explain success and failure with text as well as color and shape. Provide a text equivalent for the playfield: a readable list of the packets currently on screen and their outcomes.

**Pace must be adjustable.** A speed setting must reach a pace slow enough for a beginner to read every packet, including a step mode in which time advances only on player input. The speed setting scales all motion together, so a slower pace changes how fast things move but never what is correct. Respect reduced-motion preferences; reduced motion must never remove information or delay the availability of feedback or controls.

**Sound is an extra layer, never the only signal.** Every fact the game gives by sound (a hit, a mistake, a wave cleared or failed) must also be given as text. Sound must only start after the player has done something (a key press or a click), must be one key and one button away from muted, must have a volume control, and must never be needed to play or to learn. Sound is synthesized in the browser, so the game stays self-contained (C5): no audio files, no external sound or music service.

Keep the challenge usable on a typical laptop and a narrow browser window. Dense technical data may scroll within its own labeled container, without hiding the controls.

**Evidence:** a keyboard-only playthrough at the slowest setting, a narrow-window check, and a reduced-motion check. Record what was actually checked; do not claim full accessibility certification.

## C5 · The first version is deterministic and self-contained

Ship authored content and deterministic domain logic. The game requires no account, backend, live device connection, model, or API key. AI may help write code and assets during development; its output receives the same review as any other contribution.

Runtime AI tutoring, generated questions, and free-text AI grading are stretch work. Adding them requires an explicit change to the constitution, specification, and verification approach before implementation.

**Evidence:** a clean browser session can play using only the project's static files; no external content service decides an answer.

## C6 · Content and logic can be reviewed separately

Store level content, ACLs, packets, wave timing, hints, sources, and difficulty in editable data. Keep domain rules separate from rendering, game-loop timing, and progress tracking. Validate data before presenting a challenge. **Whether a packet is permitted or denied is decided only by the rule evaluator, never by sprite position, color, flight path, or an authored answer key.** Feedback must agree with the evaluator's reasoning.

Adding another wave that uses the existing mechanic should require a data change and its checks, not a new scoring path or a new screen implementation.

**Evidence:** inspect one level's data, trace one packet through the evaluator, and add a trial wave without modifying the rule engine.

## C7 · Done is demonstrated

Ship only the agreed scope. Requirements, plan, tasks, and README must describe the same game. A feature is complete when its acceptance criteria pass and its actual status is recorded. A screenshot, a checked task box, or the agent saying "done" is insufficient by itself.

When time is short, reduce scope explicitly. Fix incorrect teaching and broken core interactions before adding visual effects. Build and verify the evaluator and the after-action review before movement, formations, and effects. Keep failed and untested checks visible.

**Evidence:** reproducible run/test commands, recorded verification results, a fresh-start playthrough, and a README another attendee can follow.

## How we change these rules

For any material change, record the reason, update the affected spec and plan, and rerun analysis. A conflict with this constitution is resolved openly; the build agent must not weaken a principle merely to make its implementation pass.

### Amendments to the workshop starter text

Reason for all of the following: the team chose a fast-paced, real-time shooter instead of a turn-based quiz, which the starter principles did not allow.

| Principle | Change from the starter | Why |
| --- | --- | --- |
| C2 | Real-time play allowed. Mistakes never freeze the action: a short non-blocking message appears at once and every mistake is fully explained in an after-action review of the wave. The player may pause at any time. (v2.0.0, 2026-11-17: replaced the earlier "a wrong decision pauses play".) | Pausing on every mistake made the game play like flash cards; the explanation is kept, but moved to the end of the wave so the action keeps its flow. |
| C3 | Replaced "no lives, countdown, or speed bonus" with a health measure: 3 health at the start of every level and at most; a mistake costs 1, a correct decision gives 1 back; health carries between a level's two waves; at 0 the current wave fails, and a wave-only retry restores health to the maximum. Still no timer, score, speed bonus, or penalty for hints or retries. Replaced the Submit and empty-input rules with once-only packet resolution. (v3.1.0, 2026-11-18: health resets each level and on retry; v3.0.0 replaced the earlier "packet loss, one running total with a limit of 6".) | A shooter needs stakes, and an arcade game needs recovery. Healing on right decisions rewards playing well, and a fresh start on every level and retry keeps one bad stretch from scarring the rest of the game (the team's decisions, 2026-11-18). |
| C4 | Added adjustable speed with a step mode, a text equivalent of the playfield, and real-text ACL/feedback. (v3.2.0, 2026-11-18: added the rules for sound: an extra layer only, text for everything, mute and volume, starts after a user action, synthesized in the browser.) | Real-time and canvas rendering are the main accessibility risks. |
| C6 | Extended data scope to waves and timing; evaluator alone decides permit/deny. | Prevents the game loop from deciding correctness. |
| C7 | Added build order: evaluator and after-action review before movement, formations, and effects. | Real-time is the likeliest way to run out of time. |
