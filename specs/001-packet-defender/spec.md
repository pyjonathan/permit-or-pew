# Feature Specification: Permit or Pew

**Feature Branch**: `001-packet-defender`

**Created**: 2026-11-17

**Status**: Draft (revised 2026-11-18: renamed Permit or Pew, health system that resets each level and on retry, Normal default, short briefings; constitution v3.1.0)

**Input**: User description: "Please refer to the SPEC.md file and build the specification", revised after playtesting: "make it more akin to Galaga".

## Overview

Permit or Pew is a browser arcade game for software developers and IT beginners with little or no network experience. You are a firewall defending the edge of a network, in the style of Galaga. A formation of packets hovers at the top of the screen, each sprite showing its protocol, addresses, and port. An access control list (ACL) stays on screen. Packets peel off the formation and dive toward your network. You move freely along the bottom and fire bullets up the screen.

**The ACL decides what each packet is.** A packet the list *denies* is hostile: shoot it before it reaches the network. A packet the list *permits* is friendly traffic: let it through, and do not shoot it. Shooting a permitted packet, or letting a denied one through (a leak), costs **health**. The player starts every level with 3 health, loses 1 for each mistake, and gets 1 back for each correct decision (never above 3). At 0 health the wave fails. The action never stops for a mistake. Each mistake shows a one-line message at once, and at the end of the wave an **after-action review** explains every mistake in full. The goal is to learn to read an ordered ACL and predict whether a packet is permitted or denied, quickly enough to act on it.

**Taught model** (constitution C1): an extended, named, stateless IPv4 ACL, applied inbound, in the Cisco IOS style. Entries are checked top to bottom. The first entry whose protocol, source, destination, and optional port all match decides the packet. A packet matching no entry is denied (the implicit deny). Addresses are `any`, `host A.B.C.D`, or CIDR (`A.B.C.D/N`). Excluded: stateful inspection and `established`, wildcard masks, port ranges and other port operators, source ports, IPv6, fragments, logging, object groups, and other vendors' syntax.

## Clarifications

### Session 2026-11-18

- Q: Should the game have sound effects and music, and how? → A: Yes. Sound is synthesized in the browser (no audio files, nothing to download, nothing to license), so the game stays self-contained. Sound effects and a looping tune for each level are on by default after the player's first key press or click, with a mute key (M), a Sound button, and a volume slider. Sound is an extra layer only: everything it tells the player is also shown as text. (Previously audio was out of scope.)
- Q: The results say which rule made the player wrong, but the rules are not on the results page. What should change? → A: The wave's access list is shown on the results page, beside the mistakes: every entry in order plus the implicit deny. Entries that caused mistakes are marked with how many they caused. Each mistake line shows the text of the entry that decided it, and opening a line highlights that entry in the list. So the player never has to remember a rule from the playfield.
- Q: What should the results after a wave look like? → A: They must show at a glance whether the wave was cleared or failed, and what the player did wrong. A large banner says "Wave N cleared" with a check mark in green, or "Wave N failed" with a cross in red (words and icon as well as colour). Each mistake is one line: the packet, what the player did, what they should have done, and which entry decided it. Clicking a line shows the full explanation. The sources are one collapsed section the player can open to read further.
- Q: What should the game be called? → A: **Permit or Pew**. The earlier name, "Packet Defender", was wrong because the player is a firewall deciding which packets get through, not defending the packets.
- Q: How should the starting page read? → A: Short and scannable, not a wall of text. Each level's briefing is a few cards with headings, short bullets, and one example, under about 130 words, with no paragraph longer than 35 words. The Start button is visible without scrolling on a typical laptop, and the sources sit behind a "Sources" control.
- Q: How should the "one bar of health" idea work? → A: The player starts every level with 3 health, which is also the maximum. A mistake costs 1 health. A correct decision gives 1 health back, never above 3. When a mistake brings health to 0 the current wave fails at once. Health carries from the first wave of a level into the second, goes back to 3 at the start of every new level, and goes back to 3 on every retry. Retrying restarts only the failed wave. Mistakes from the failed attempt stay counted. This replaces the earlier "packet loss" running total with a limit of 6. (A first reading had health carrying across levels and a retry restoring the value from the wave's start; the team corrected that on 2026-11-18: "health should start at 3 for each level and on retry".)
- Q: What should the default pace be? → A: Normal. Slow (half speed) and Step stay available.
- Q: What happens to the keyboard after a mouse click on a button such as Pause? → A: Focus goes back to the playfield, so Space always fires. (Before this, a clicked Pause button kept focus and the next Space press paused the game again.)

### Session 2026-11-17 (earlier decisions)

- Q: When the loss limit was reached, did the player restart the level or retry only the failed wave? → A: Retry only the failed wave, restoring the running total to its value at that wave's start. This rule is kept; the measure it applies to is now health (see above).
- Q: Playtest feedback: the lane-and-pause version felt like gamified flash cards. What is the game? → A: A Galaga-style arcade game. Free horizontal movement, bullets that travel and can miss, a formation of packets that dives, many packets in play at once. No lanes.
- Q: What happens when the player makes a mistake? → A: The game keeps running. A short message appears at once, and every mistake is explained in full in an after-action review at the end of the wave (or when the wave fails).
- Q: What happens to the earlier slow, pause-on-every-mistake game? → A: It is replaced. A speed setting and a step mode cover beginners and accessibility.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fight a wave and understand every decision (Priority: P1)

A learner reads a short briefing, then plays a wave: they read the ACL, work out which packets it denies, shoot those, and let the permitted ones through. The action keeps moving. When the wave ends, a review shows what they got right and explains every mistake.

**Why this priority**: This is the core mechanic and the whole learning value. Without correct grading and a full explanation of every mistake, nothing else matters.

**Independent Test**: Play wave 1.1 at Slow speed (or Normal). Shoot a denied packet, let a permitted packet through, deliberately shoot a permitted packet, deliberately let a denied packet through, and fire at empty space. Confirm each outcome below, that the game never paused for a mistake, and that the wave review explains both mistakes.

**Acceptance Scenarios**:

1. **[AC1]** **Given** a fresh session, **When** the player starts, **Then** the first briefing appears before any packets.
2. **[AC2]** **Given** wave 1.1 with entry 20 `deny tcp any any eq 23`, **When** the player shoots the packet TCP 203.0.113.9 → 10.0.0.5 port 23 (p2), **Then** the packet is destroyed, health does not go down, and the feedback message names entry 20 as the deciding entry.
3. **[AC3]** **Given** wave 1.1, **When** the player shoots the packet TCP 203.0.113.9 → 10.0.0.5 port 443 (p1), **Then** health goes down by one, the game does **not** pause, a one-line mistake message names entry 10 as the deciding entry, and the full explanation is listed in the wave review.
4. **[AC4]** **Given** wave 1.1, **When** the packet TCP 203.0.113.9 → 10.0.0.5 port 23 (p2) reaches the network without being shot, **Then** health goes down by one, the game does not pause, a one-line leak message names entry 20, and the full explanation is listed in the wave review.
5. **[AC5]** **Given** wave 1.1, **When** the permitted packet p1 reaches the network without being shot, **Then** it is delivered, health does not go down, and the feedback names entry 10 as the deciding entry.
6. **[AC6]** **Given** a bullet that hits no packet, **When** it leaves the screen, **Then** nothing changes: no health change and no message.
7. **[AC6b]** **Given** the player has lost health, **When** they make a correct decision, **Then** they gain 1 health, and health never goes above 3. **Given** health is at 3, **When** they make a correct decision, **Then** it stays at 3.

---

### User Story 2 - Learn from help and finish the game (Priority: P1)

A learner who is stuck can pause, ask for help, review their mistakes, retry a failed wave, and reach a final summary.

**Why this priority**: Help, fair retry, and an honest review are what make the game safe for beginners and satisfy the constitution's progress rules.

**Independent Test**: Pause during a wave and request three hints; fail a wave by taking health to 0 and retry it; finish all six waves and read the reviews and the final summary; test Restart with Cancel and with Confirm.

**Acceptance Scenarios**:

1. **[AC7]** **Given** the game is paused, **When** the player requests a hint, **Then** the first hint explains the method (read top to bottom, first match wins), a second hint shows a worked step for the packet closest to reaching the network, and a third shows the full worked solution for that packet. Hints are recorded as assistance and never resolve a packet.
2. **[AC8]** **Given** a packet has been resolved, **When** a second bullet hits the same place, or it later crosses the network edge, **Then** nothing changes: no second resolution, no health change, no extra progress.
3. **[AC9]** **Given** a wave, **When** every packet in it has been resolved, **Then** the wave ends with a banner that says the wave was cleared (a check mark, the word "cleared", and a green style), plus the packets handled correctly, mistakes, health, retries, and hints used. A wave with mistakes says "Cleared, but not a clean run" and lists each mistake as one line (the packet, what the player did, what they should have done, and which entry decided it); clicking a line shows its full explanation.
3c. **[AC9c]** **Given** the results of a wave that had mistakes, **When** the player reads them, **Then** the wave's access list is on the same page: every entry in order and the implicit deny; each entry that caused mistakes is marked with a cross and how many mistakes it caused; each mistake line shows the full text of the entry that decided it (or says the implicit deny decided it); and opening a mistake line highlights that entry in the list. The list is shown on both a cleared wave and a failed wave.
3b. **[AC9b]** **Given** the results of a wave, **When** the player wants to read further, **Then** a collapsed "Sources" section opens to show each source's title, section, URL, and the claim it supports.
4. **[AC10]** **Given** a wave in progress, **When** a mistake brings health to 0, **Then** the wave fails at once (even if it was the last packet), a banner says the wave failed (a cross, the word "failed", and a red style, clearly different from the cleared banner), the mistakes of that attempt are listed one line each, and the player can retry that wave without penalty. On retry, health returns to 3. Mistakes made in the failed attempt stay in the session's mistake count, and the retry is counted separately.
5. **[AC11]** **Given** the player finishes the second wave of level 3, **When** it ends, **Then** the session summary appears.
6. **[AC12]** **Given** a session in progress, **When** the player chooses Restart, **Then** a confirmation appears and the game stops advancing; confirming clears the session and returns to the first briefing, and cancelling changes nothing.

---

### User Story 3 - Play with accessible controls at a readable pace (Priority: P1)

A keyboard-only player, or a beginner who needs time to read, can move, fire, pause, get hints, and advance at a pace they control.

**Why this priority**: Accessibility is a core requirement (constitution C4), and real-time arcade play is the main risk to it.

**Independent Test**: Complete a full playthrough using only the keyboard at Slow speed, then a wave in Step mode, and click Pause with the mouse and then press Space; repeat with reduced motion on and in a narrow window.

**Acceptance Scenarios**:

1. **[AC13]** **Given** any screen, **When** the player uses the keyboard, **Then** every core control (move, fire, pause, hint, continue, restart, speed) is reachable with a visible focus state and an accessible name.
2. **[AC14]** **Given** the speed setting, **When** the player chooses Step, **Then** time advances only when the player gives input: a key press advances the action by a fixed short interval, and the arrow keys and fire key act immediately.
3. **[AC15]** **Given** a running wave, **When** the player or an assistive technology user looks for the ACL, packet headers, or feedback, **Then** all of them are available as text, and a readable list shows every packet with its status.
4. **[AC16]** **Given** a message about a decision appears, **When** it is shown, **Then** it is announced to assistive technology and remains visible until the next decision.
5. **[AC17]** **Given** the player prefers reduced motion, **When** the game runs, **Then** decorative effects are removed and no information or control is lost.
6. **[AC18]** **Given** the player clicked Pause (or Move, Hint, or Advance) with the mouse, **When** they then press Space, **Then** the ship fires; Space does not press the button again. After un-pausing with the mouse, Space fires and does not pause the game again.
7. **[AC19]** **Given** the game is running with sound on, **When** the player fires, clears a wave, makes a mistake, or presses M, **Then** the matching sound plays, a mistake sounds different from a correct hit, M mutes and unmutes everything (the output is silent while muted), pausing stops the music, and every fact the sound conveyed is also on screen as text.

---

### Edge Cases

- **Bullet hits nothing**: no health change, no message.
- **Two bullets in flight**: a player can have at most 2 bullets on screen; firing again does nothing until one is gone.
- **Bullet overlaps two packets**: the packet lowest on the screen (closest to the network) at that spot is hit; exactly one packet is resolved by a bullet.
- **Bullet and the network edge on the same tick**: the bullet is processed first, so the shot wins; the packet is resolved once, as shot.
- **Shooting a packet that has not yet entered the screen**: not possible; a packet can be shot from the moment it appears.
- **Mistake during a wave**: the game keeps running; nothing pauses.
- **Limit reached on the last packet**: the wave still fails and must be retried; it is not recorded as completed.
- **Several mistakes in one moment**: each costs 1 and each appears in the review.
- **CIDR boundaries**: 192.0.2.255 is inside 192.0.2.0/24 and 192.0.3.1 is outside; 10.255.255.255 is inside 10.0.0.0/8 and 11.0.0.1 is outside.
- **Same packet, different order**: swapping two entries can flip the result, and the explanation must show why.
- **No entry matches**: the packet is denied by the implicit deny, and the explanation says no entry matched.
- **Mixed protocols**: a TCP-only entry never matches UDP or ICMP traffic.
- **Unsupported or malformed level data** (wildcard mask, port range, unknown protocol, port on ICMP, bad formation data): the player sees a clear content error, no wave starts, and no health change is recorded.
- **Wave failure**: health reaching 0 fails the current wave at once; retry restarts only that wave, with health back to 3.
- **Health at the maximum**: a correct decision at 3 health leaves it at 3; healing never goes above the maximum.
- **New level**: health is 3 at the start of every level, whatever it was at the end of the last one. The two waves of a level share one health bar, so wave 2 can start on less than 3 health.
- **Clicking a game button with the mouse**: focus returns to the playfield, so Space fires. Pausing, resuming, moving, asking for a hint, and advancing all behave this way.
- **Pausing**: allowed at any time during a wave; nothing moves while paused.
- **Browser tab hidden**: the game pauses.
- **Page reload**: starts a fresh session.
- **Narrow window**: the ACL stacks above the playfield and scrolls in its own labeled area without hiding the controls.

## Requirements *(mandatory)*

### Functional Requirements

**Teaching and grading**

- **FR-001**: The game MUST show a briefing before each level that introduces one concept, with a worked example different from the challenge. The briefing MUST be short and easy to scan: a few cards with headings, short bullets, and one example, at most 130 words in total and with no paragraph over 35 words. On a typical laptop screen (1366×768) the whole briefing and its Start button MUST be visible without scrolling.
- **FR-002**: The ACL for the current wave MUST remain visible throughout play, and each packet sprite MUST show its protocol, source, destination, and port (where it has one) as text.
- **FR-003**: The game MUST decide whether each packet is permitted or denied only by applying the documented ACL rule to the packet's values, never by position, colour, flight path, or an authored answer.
- **FR-004**: The game MUST treat the following as correct: shooting a packet the ACL denies (explicitly or by the implicit deny), and letting a packet the ACL permits reach the network.
- **FR-005**: The game MUST treat the following as mistakes: shooting a packet the ACL permits, and letting a packet the ACL denies reach the network.
- **FR-006**: A correct decision MUST show a short confirmation that names the deciding entry (or the implicit deny).
- **FR-007**: A mistake MUST cost 1 health, MUST NOT pause or slow the game, and MUST show a one-line message naming the deciding entry. The full explanation (the packet's values, why each earlier entry did or did not match, the deciding entry, and what the player should have done) MUST be stored and shown in the wave's review.
- **FR-008**: Explanations MUST agree with the evaluation, and for each earlier entry that was skipped MUST say why it did not match.

**Gameplay**

- **FR-009**: The player MUST be able to move a ship freely and continuously along the bottom of the playfield and fire bullets that travel up the screen and can miss. At most 2 bullets MAY be in flight.
- **FR-010**: Each wave MUST present its packets as a formation that enters the screen, holds so the player can read it, and then sends packets one at a time on authored dive paths toward the network. A packet that reaches the network edge is "let through".
- **FR-011**: Each packet MUST be resolved exactly once, whether shot or let through. A bullet that hits no packet MUST have no consequence.
- **FR-012**: A wave MUST end when every packet in it is resolved. The results MUST show at a glance whether the wave was cleared or failed, using a banner with a word, an icon, and a colour (never colour alone), with the button for the next step in the banner so that it is visible without scrolling. The results MUST show packets handled correctly, mistakes, health, retries, and hints used, and MUST NOT present a wave with mistakes as a clean result. The results MUST show the wave's access list (every entry in order, and the implicit deny) on the same page, marking each entry that caused mistakes with how many it caused, so that no rule named in the results has to be remembered. Every mistake MUST appear as one line saying the packet, what the player did, what they should have done, and which entry decided it (including that entry's text); its full explanation (why each earlier entry did or did not match, and the next step) MUST be available by expanding that line.
- **FR-013**: The player MUST start every level with 3 health, which is also the maximum. Health MUST carry from the first wave of a level into the second, and MUST go back to 3 at the start of every new level. A mistake MUST cost 1 health and a correct decision MUST give 1 health back, never above the maximum. A level MUST end when both its waves have ended. When a mistake brings health to 0 during a wave, that wave MUST fail at once and the player MUST be able to retry it. A retry MUST restart only the failed wave and MUST restore health to 3. Mistakes made in a failed attempt MUST stay counted, and retries MUST be counted separately, so that a summary never hides a failed attempt.
- **FR-014**: The game MUST NOT include a level timer, a score, a speed bonus, or a leaderboard. Pausing, hints, and retries MUST carry no penalty.
- **FR-015**: The player MUST be able to pause at any time during a wave. While paused, the game MUST provide a hint: first a method hint, then a worked step for the packet closest to reaching the network, then the full worked solution for it. Using a hint MUST be recorded as assistance and MUST NOT resolve a packet.
- **FR-016**: Restart MUST ask for confirmation and MUST stop the game from advancing while the confirmation is open. Confirming clears the session and returns to the first briefing; cancelling changes nothing.
- **FR-017**: After the final wave, the game MUST show a session summary with completed waves, mistakes, retries, and assistance used, shown separately and with a statement that completion is not proof of independent mastery.

**Content**

- **FR-018**: The game MUST include three levels of two waves each (six waves), with eight packets per wave, and the same formation, timing, and dive paths every playthrough.
- **FR-019**: The six waves MUST produce exactly the permit/deny outcomes listed in the Reference Cases below.
- **FR-020**: Level content (ACLs, packets, formation slots, timing, dive paths, hints, briefings, and sources) MUST be held in editable data and validated before a wave starts.
- **FR-021**: If a wave's data is malformed or uses an unsupported feature, the game MUST show a content error naming the level and wave, MUST NOT start the wave, and MUST NOT count it as a player mistake.
- **FR-022**: Each briefing and explanation MUST cite a source and section for the networking rule it relies on, and the player MUST be able to reach that citation from the briefing screen (a "Sources" control) and see it from every results screen, where the sources MUST be one collapsed section the player can expand to read further.
- **FR-023**: Simplifications MUST be stated in plain language in the briefing and README wherever they affect what the player can conclude.

**Accessibility and pace**

- **FR-024**: Every core action (move, fire, pause, hint, continue, restart, change speed) MUST be usable by keyboard with a visible focus state and an accessible name. After a game control (move, fire, pause, hint, advance) is used with the mouse or the keyboard, keyboard focus MUST return to the playfield so that the fire key fires and never re-presses the control that was just used. A speed change made with the pointer MUST also return focus to the playfield.
- **FR-025**: The game MUST offer an adjustable pace that scales all motion together. Concretely, the simulation runs at 60 steps per second at Normal and 30 steps per second at Slow, and **Normal is the default**. A Step mode MUST advance time only on player input: one key press advances 15 steps (a quarter of a second at Normal), while moving (one hop of 50 units) and firing act immediately.
- **FR-026**: The game MUST provide a text equivalent of the playfield: a readable list of every packet with its status (waiting, entering, in formation, diving, shot, or let through).
- **FR-027**: Feedback MUST use text as well as colour and shape, MUST be announced to assistive technology, and MUST remain visible until the next decision.
- **FR-028**: The game MUST respect a reduced-motion preference by removing decorative effects without removing information or delaying feedback or controls.
- **FR-029**: The game MUST remain usable in a typical laptop window and a narrow window, with dense technical data scrolling in its own labeled area without hiding the controls.

**Self-containment**

- **FR-030**: The game MUST play in a clean browser using only the project's static files, with no account, server logic, live network device, model, or API key.
- **FR-031**: Progress MUST be held for the current page session only; reloading starts a new session.

**Sound**

- **FR-032**: The game MUST have sound effects for: firing, shooting a packet correctly, shooting a packet wrongly, a permitted packet reaching the network, a denied packet leaking through, starting a wave, clearing a wave, failing a wave, pausing, resuming, and asking for a hint. A mistake MUST sound clearly different from a correct decision (a different tone, not only a different pitch).
- **FR-033**: The game MUST play a looping tune while a wave is running, with a different tune for each of the three levels, each faster than the last. The music MUST stop when the game is paused, when it is in Step speed, and on every briefing and results screen.
- **FR-034**: Sound MUST be on by default and MUST start only after the player's first key press or click. The player MUST be able to turn all sound off and on with one key (M) and one button, and MUST be able to change the volume. Using the Sound button or the volume slider with the mouse MUST return focus to the playfield, so the fire key still fires.
- **FR-035**: Sound MUST NOT be the only way the game gives any information: everything a sound says (a hit, a mistake, a wave cleared or failed) MUST also be shown as text, as it already is.
- **FR-036**: Sound MUST be generated in the browser from data in the project (no audio files, no external service), so the game stays self-contained. The sound settings (muted, volume) are not progress and are not saved across reloads.

### Key Entities

- **ACL**: An ordered list of entries applied to one wave. Each entry has a sequence number, an action (permit or deny), a protocol, a source, a destination, and an optional port.
- **Packet**: A single unfragmented IPv4 packet with a protocol, source address, destination address, optional port, a formation slot, a dive time, and a dive path.
- **Decision**: What the player did with one packet (shot, or let it through). Each packet has at most one decision, and it is judged correct or a mistake.
- **Wave**: One ACL, eight packets with their formation and timing, and hints. Six waves in total, two per level.
- **Level**: A briefing, two waves, and a learning outcome.
- **Mistake record**: A packet, the kind of mistake (shot a permitted packet, or leak), and its full explanation, kept for the wave review.
- **Session**: The player's current progress: current health (3 at most), mistakes (cumulative, including failed attempts), retries, assistance used, waves completed, and current position.
- **Source reference**: A title, location, and the specific claim it supports, cited by a briefing or explanation.

### Reference Cases

The expected results below are recorded independently of the implementation. They MUST be reviewed by someone with networking knowledge before release (constitution C1). Packets p1 to p3 (or p4) in each wave are the original 20 reference cases; the rest were added when waves grew to eight packets. Destination 172.16.0.1 is a neutral placeholder where a case does not name one.

**Wave 1.1**: `10 permit tcp any host 10.0.0.5 eq 443`; `20 deny tcp any any eq 23`; `30 permit ip any any`

| Packet | Expected | Why |
| --- | --- | --- |
| p1 TCP 203.0.113.9 → 10.0.0.5:443 | permit (entry 10) | all fields match entry 10 |
| p2 TCP 203.0.113.9 → 10.0.0.5:23 | deny (entry 20) | entry 10 port is 443, not 23 |
| p3 UDP 198.51.100.7 → 10.0.0.8:53 | permit (entry 30) | entries 10 and 20 apply to TCP only |
| p4 TCP 198.51.100.22 → 10.0.0.8:23 | deny (entry 20) | destination is not 10.0.0.5, so entry 10 fails; entry 20 matches |
| p5 TCP 203.0.113.50 → 10.0.0.8:443 | permit (entry 30) | entry 10 needs host 10.0.0.5; port is not 23 |
| p6 UDP 203.0.113.9 → 10.0.0.5:23 | permit (entry 30) | UDP does not match the TCP-only entries |
| p7 TCP 192.0.2.1 → 10.0.0.5:23 | deny (entry 20) | entry 10 port is 443, not 23 |
| p8 ICMP 198.51.100.7 → 10.0.0.5 | permit (entry 30) | entries 10 and 20 apply to TCP only |

**Wave 1.2**: `10 deny ip 192.0.2.0/24 any`; `20 permit ip any any`

| Packet | Expected | Why |
| --- | --- | --- |
| p1 TCP 192.0.2.77 → 10.0.0.5:80 | deny (entry 10) | inside the /24 |
| p2 TCP 192.0.2.255 → 10.0.0.5:80 | deny (entry 10) | last address of the /24 |
| p3 TCP 192.0.3.1 → 10.0.0.5:80 | permit (entry 20) | first address past the /24 |
| p4 UDP 192.0.2.0 → 10.0.0.8:53 | deny (entry 10) | first address of the /24 |
| p5 TCP 192.0.1.255 → 10.0.0.5:80 | permit (entry 20) | just below the /24 |
| p6 ICMP 192.0.2.128 → 10.0.0.5 | deny (entry 10) | inside the /24; `ip` matches ICMP |
| p7 TCP 193.0.2.5 → 10.0.0.5:443 | permit (entry 20) | first number differs |
| p8 UDP 192.0.3.0 → 10.0.0.8:123 | permit (entry 20) | first address past the /24 |

**Wave 2.1**: `10 permit tcp 10.0.0.0/24 any eq 22`; `20 deny tcp any any eq 22`; `30 permit ip any any`

| Packet | Expected | Why |
| --- | --- | --- |
| p1 TCP 10.0.0.15 → 172.16.0.1:22 | permit (entry 10) | first match wins; entry 20 is never reached |
| p2 TCP 10.0.1.15 → 172.16.0.1:22 | deny (entry 20) | source is outside 10.0.0.0/24 |
| p3 TCP 10.0.0.15 → 172.16.0.1:80 | permit (entry 30) | port is not 22 |
| p4 TCP 203.0.113.5 → 172.16.0.1:22 | deny (entry 20) | source is outside the /24 |
| p5 UDP 10.0.0.15 → 172.16.0.1:22 | permit (entry 30) | entries 10 and 20 apply to TCP only |
| p6 TCP 10.0.0.200 → 172.16.0.2:22 | permit (entry 10) | inside the /24 |
| p7 TCP 10.0.2.9 → 172.16.0.1:22 | deny (entry 20) | outside the /24 |
| p8 TCP 198.51.100.4 → 172.16.0.1:443 | permit (entry 30) | port is not 22 |

**Wave 2.2**: `10 deny tcp any any eq 22`; `20 permit tcp 10.0.0.0/24 any eq 22`; `30 permit ip any any`

| Packet | Expected | Why |
| --- | --- | --- |
| p1 TCP 10.0.0.15 → 172.16.0.1:22 | deny (entry 10) | order swapped; entry 20 is unreachable |
| p2 TCP 10.0.0.15 → 172.16.0.1:443 | permit (entry 30) | port is not 22 |
| p3 UDP 10.0.0.15 → 172.16.0.1:22 | permit (entry 30) | entries 10 and 20 apply to TCP only |
| p4 TCP 10.0.0.200 → 172.16.0.1:22 | deny (entry 10) | entry 10 matches first |
| p5 TCP 203.0.113.5 → 172.16.0.1:22 | deny (entry 10) | entry 10 matches first |
| p6 TCP 10.0.0.15 → 172.16.0.1:23 | permit (entry 30) | port is not 22 |
| p7 ICMP 10.0.0.15 → 172.16.0.1 | permit (entry 30) | entries 10 and 20 apply to TCP only |
| p8 TCP 10.0.1.15 → 172.16.0.1:443 | permit (entry 30) | port is not 22 |

**Wave 3.1**: `10 permit tcp 10.0.0.0/24 any eq 80`; `20 permit tcp 10.0.0.0/24 any eq 443`

| Packet | Expected | Why |
| --- | --- | --- |
| p1 TCP 10.0.0.9 → 172.16.0.1:80 | permit (entry 10) | match |
| p2 TCP 10.0.0.9 → 172.16.0.1:8080 | deny (implicit) | no entry matches |
| p3 UDP 10.0.0.9 → 172.16.0.1:53 | deny (implicit) | entries apply to TCP only |
| p4 TCP 10.0.1.9 → 172.16.0.1:443 | deny (implicit) | source is outside the /24 |
| p5 TCP 10.0.0.77 → 172.16.0.1:443 | permit (entry 20) | match |
| p6 TCP 10.0.0.9 → 172.16.0.1:22 | deny (implicit) | no entry matches port 22 |
| p7 ICMP 10.0.0.9 → 172.16.0.1 | deny (implicit) | entries apply to TCP only |
| p8 TCP 10.0.0.254 → 172.16.0.1:80 | permit (entry 10) | inside the /24 |

**Wave 3.2**: `10 deny icmp any any`; `20 permit ip 10.0.0.0/8 any`

| Packet | Expected | Why |
| --- | --- | --- |
| p1 ICMP 10.1.1.1 → 172.16.0.1 | deny (entry 10) | first match |
| p2 TCP 10.1.1.1 → 172.16.0.1:80 | permit (entry 20) | inside 10.0.0.0/8 |
| p3 TCP 10.255.255.255 → 172.16.0.1:80 | permit (entry 20) | last address of the /8 |
| p4 TCP 11.0.0.1 → 172.16.0.1:80 | deny (implicit) | outside 10.0.0.0/8 |
| p5 UDP 10.0.0.1 → 172.16.0.1:53 | permit (entry 20) | inside the /8 |
| p6 ICMP 203.0.113.9 → 172.16.0.1 | deny (entry 10) | entry 10 matches any ICMP |
| p7 TCP 9.255.255.255 → 172.16.0.1:443 | deny (implicit) | just below the /8 |
| p8 UDP 12.0.0.5 → 172.16.0.1:123 | deny (implicit) | outside the /8 |

**Unsupported content**: an entry using a wildcard mask, a port range, or an unknown protocol, or a wave with bad formation data. Expected: visible content error; no wave starts; no health change. This is an authoring error, not a learner failure.

### Formation and timing rules

These fix the shipped data so it is not invented during the build. The playfield is 700 wide by 560 tall (abstract units). The network edge is at y = 540. The ship sits at y = 500 and moves between x = 30 and x = 670.

- **Slots:** packets p1 to p8 take formation slots 0 to 7. Slot `i` has column `i mod 5` and row `i div 5`, at x = 70 + 140 × column and y = 70 + 60 × row. A packet sprite is 118 wide by 46 tall.
- **Entry:** packet `i` (0-based) starts entering at step 10 × i and takes 40 steps to glide into its slot from above the screen.
- **Dive order:** the k-th packet to leave the formation (k from 0) is the packet with 0-based index `[3, 0, 6, 2, 5, 1, 7, 4][k]`. It leaves at step `diveStart + k × diveEvery`, takes `diveTicks` steps to reach the network edge, and follows the path `['drop', 'sway', 'swoop-in', 'zigzag'][k mod 4]`.
- **Timing by level (steps at 60 per second):** level 1: `diveStart` 480, `diveEvery` 100, `diveTicks` 300. Level 2: 420, 90, 260. Level 3: 360, 80, 220.
- **Paths:** `drop` goes straight down. `sway` adds a side-to-side wave of 55 units with 1.5 cycles. `swoop-in` drifts half the distance toward the centre and adds a 40-unit wave. `zigzag` adds a 50-unit wave with 3 cycles. Horizontal position is clamped to keep the sprite on screen.
- **Ship and bullets:** the ship moves 5 units per step. A bullet starts at the ship, moves up 9 units per step, and is destroyed when it hits a packet or leaves the top. At most 2 bullets are in flight.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 48 reference cases (the 20 originals plus 28 added) produce the expected permit/deny result and deciding entry, with zero mismatches.
- **SC-002**: A first-time player can finish all six waves in 10 to 15 minutes at the default pace.
- **SC-003**: In a hand-run check, no mistake ever pauses or slows the game, every mistake shows a one-line message naming the deciding entry, and every mistake from an attempt appears in that wave's results as one line, with its full explanation one click away.
- **SC-004**: A player can complete a full playthrough from first briefing to session summary using only the keyboard at the Slow pace, and can complete a wave in Step mode.
- **SC-005**: In a duplicate-action check, firing repeatedly at one place, and shooting a packet as it reaches the network edge, never changes health or progress more than once for that packet.
- **SC-006**: A fresh browser opening only the project's static files can play the whole game with no account, key, or external service.
- **SC-007**: A teammate can state, after a deliberately wrong choice, which ACL entry decided the packet and why, using only the game's results.
- **SC-008**: Every briefing and explanation shipped for the six waves has been checked against its cited source, and the check is recorded.
- **SC-009**: In a hand-run check at Normal pace, a player can have 3 or more packets in play at once, and a perfect run requires reading the ACL for every one of the 48 packets.

## Assumptions

- Target players are software developers and IT beginners who may know nothing about ACLs; the first briefing teaches IPv4 addresses, CIDR, and ACL entry fields.
- The game is played in a desktop or laptop browser with a keyboard; touch-only play is out of scope for v1.
- A leak and a wrongly shot packet cost the same (one).
- Pace values are fixed in FR-025; the default is Normal.
- Authoritative sources: the Cisco IOS XE ACLs Configuration Guide (first match, order, implicit deny), the Cisco IOS XE ACL command reference (the `ip` keyword, `any`, `host`), and RFC 4632 section 3.1 (CIDR prefix notation), all opened and read on 2026-11-18 (research R9). The Cisco pages may change.
- Out of scope for v1: accounts, multiplayer, backend, live infrastructure, runtime AI, score, leaderboard, level editor, randomised waves, recorded or downloaded audio files, saving across reloads, stateful firewalls, NAT, routing, and touch controls.
- The game follows the project constitution v2.0.0.
