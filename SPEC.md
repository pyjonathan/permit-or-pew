> **Note:** this root file is adapted from the NAF AC6 workshop starter kit (Apache-2.0) and changed by Jonathan Buchanan; see NOTICE. It is the original starter input and still describes the first, lane-based design (the game was later reworked into a Galaga-style arcade game). The authoritative, current specification is `specs/001-packet-defender/spec.md` (its acceptance scenarios are numbered AC1–AC16 and differ from the numbering below). If the two disagree, the feature spec wins.

# Permit or Pew · First playable specification

## The pitch

**A firewall operator shoots the packets an access list denies and lets the permitted ones through, learning to read an ordered ACL, and every mistake costs packet loss and freezes the game with an explanation.**

The player is a firewall operator guarding a network edge. Each wave shows an ACL that stays on screen and a stream of packets with visible headers, descending in lanes. The player moves along the bottom and fires up a lane. A correct decision (shooting a denied packet, or letting a permitted one pass) clears it with a short confirmation. An incorrect decision (shooting a permitted packet, or letting a denied one leak) raises packet loss, pauses the game, and explains which ACL entry decided the packet and why. The session ends when the player finishes all six waves and sees the summary.

## Who this is for

- **Learner:** software developers and IT beginners with little or no network experience.
- **Assumed knowledge:** none. The first briefing teaches IPv4 addresses, CIDR prefixes, and what an ACL entry looks like.
- **What the briefing teaches:** the fields of an entry (action, protocol, source, destination, optional port), CIDR as an address range, and the method: *read the entries top to bottom, stop at the first one that matches*.
- **Why interaction helps:** players often think any matching entry applies, or that a more specific entry beats an earlier one. Shooting at speed makes that order mistake visible immediately.
- **Session target:** 10–15 minutes for a first playthrough at default speed. A slower speed and step mode are available.

## Learning outcomes and evidence

| ID | After playing, the learner can… | The game asks them to… | Evidence of success |
| --- | --- | --- | --- |
| LO1 | Decide whether one ACL entry matches a packet's protocol, addresses, and port, including CIDR range edges. | Shoot or pass packets against a short list (Level 1). | Correct decision on every packet in waves 1.1 and 1.2, including 192.0.2.255 and 192.0.3.1. |
| LO2 | Apply a list in order and recognise that the first match wins, even when a later entry also matches. | Shoot or pass packets where the same packet matches two entries (Level 2). | Correct decisions in waves 2.1 and 2.2, where swapping entry order flips the result for the same packet. |
| LO3 | Predict the implicit deny when no entry matches, and handle mixed protocols. | Shoot packets that match nothing (Level 3). | Correct decisions in waves 3.1 and 3.2, including 11.0.0.1 and UDP on a TCP-only list. |

## The technical model

- **Rule being taught:** entries are evaluated top to bottom; the first entry whose protocol, source, destination, and port all match decides the packet (permit or deny); a packet that matches no entry is denied by the implicit deny.
- **Context:** Cisco IOS-style extended, named, stateless IPv4 ACL, applied inbound on one interface.
- **Match fields:** protocol (`tcp`, `udp`, `icmp`, or `ip` meaning any protocol); source and destination as `any`, `host A.B.C.D`, or CIDR `A.B.C.D/N`; an optional single destination port using `eq` (TCP and UDP only).
- **Assumptions:** the list is already applied; every packet is a single, unfragmented IPv4 packet; sequence numbers (10, 20, 30) only show order.
- **Excluded behavior:** stateful inspection and `established`; wildcard masks (CIDR is used instead); port ranges and other port operators; source ports; IPv6; fragments; logging; object groups; other vendors' syntax; return traffic.
- **Authoritative references:** to be confirmed during clarify and entered in the data file. Candidates are the Cisco IOS Security Configuration Guide (access list section on how ACLs are evaluated and the implicit deny) and RFC 4632 for CIDR. Each briefing and explanation must cite one source and section before release.

Tell the learner about these boundaries in plain language. Where an entry could be written two ways (for example `any` versus `0.0.0.0/0`), the game shows one form only.

## The repeatable game loop

1. **Brief:** before each level, introduce one concept with a worked example different from the challenge.
2. **Inspect:** the ACL is always visible beside the playfield. Each packet shows protocol, source, destination, and port as text.
3. **Decide:** packets descend in four lanes. The player moves between lanes and fires up the current lane. A packet that is shot is *dropped*; a packet that reaches the bottom is *passed*.
4. **Explain:** a correct decision shows a brief confirmation in the feedback area. An incorrect decision raises packet loss, pauses the game, and shows a persistent explanation naming the deciding entry and the headers compared. The player presses Continue to resume.
5. **Advance:** a wave ends when every packet is resolved. A level ends when its second wave ends. If a mistake brings packet loss to the limit of 6, the current wave fails and can be retried alone.
6. **Reflect:** the wave and level summaries show packets handled correctly, mistakes, and assistance used.

**Packet decisions.**

| Packet is… | Player… | Result |
| --- | --- | --- |
| Permitted by ACL | lets it pass | Correct |
| Permitted by ACL | shoots it | Mistake: dropped good traffic (+1 packet loss, pause) |
| Denied by ACL (explicit or implicit) | shoots it | Correct |
| Denied by ACL (explicit or implicit) | lets it reach the bottom | Mistake: leak (+1 packet loss, pause) |

**Controls.** Left/Right (or A/D) move between lanes. Space fires. P pauses and resumes. H opens the next hint while paused. Enter continues after an explanation. Step mode uses N to advance packets one row. All controls are also on-screen buttons.

**Worked interaction (wave 2.2).** The ACL is `10 deny tcp any any eq 22`, `20 permit tcp 10.0.0.0/24 any eq 22`, `30 permit ip any any`. A packet arrives: TCP 10.0.0.15 → 172.16.0.1 port 22. The player sees entry 20 permits their own subnet and lets it pass. The packet reaches the bottom and packet loss rises to 1. The game pauses and shows: *"Leak. Entry 10 matches first: it denies TCP to port 22 from any source, and 10.0.0.15 is 'any'. The list stops at the first match, so entry 20 is never checked. This packet should have been shot."* The player presses Continue, and the next packet comes down.

## Required stories and acceptance criteria

### US1 · Make and understand a decision — P1

As a learner, I want to apply the ACL to visible packets and understand the result.

- **AC1:** Given a fresh session, when I start, then I see the first briefing before any packets appear.
- **AC2:** Given wave 1.1, when I shoot the packet TCP 203.0.113.9 → 10.0.0.5:23, then it is dropped, no packet loss is added, and the feedback names entry 20.
- **AC3:** Given wave 1.1, when I shoot the packet TCP 203.0.113.9 → 10.0.0.5:443, then packet loss increases by one, the game pauses, and the explanation says entry 10 permits it.
- **AC4:** Given a shot that hits no packet, when it is fired, then nothing changes: no loss and no pause.

### US2 · Learn from help and finish the game — P1

As a learner, I want help when stuck and a clear view of my progress.

- **AC5:** While paused, a hint first explains the method (read top to bottom, first match wins). A further hint can show a worked step for the current packet. Hints are recorded as assistance and never resolve a packet.
- **AC6:** Each packet is resolved once. Firing at a packet already resolved, or a packet crossing the bottom after being shot, changes nothing.
- **AC7:** A wave ends when all its packets are resolved. A level ends when both waves end. Packet loss is one running total across the whole game. If a mistake brings it to the limit of 6 during a wave, that wave fails; Retry restarts only that wave and restores packet loss to its value at the start of that wave. After wave 3.2, the session summary opens.
- **AC8:** Restart asks for confirmation, then clears the session and returns to the first briefing. Cancel preserves the session.

### US3 · Play with accessible controls — P1

As a keyboard user, I want to move, fire, pause, get help, and advance without a mouse, at a pace I can read.

- **AC9:** Every control has a visible focus state and an accessible name. The speed setting includes a step mode where packets advance only on input.
- **AC10:** The ACL, packet headers, and all feedback are real text. A text list mirrors the playfield (packet, lane, status). Feedback is announced to assistive technology and stays visible until dismissed. Reduced motion removes decoration without removing information.

## Version-one content

**Three levels, two waves per level, six waves total.** Each wave has three or four packets and one ACL. Packet loss is one running total with a limit of 6 for the whole game.

| Level | New concept | Prerequisite | Misconception to expose |
| --- | --- | --- | --- |
| 1 | Reading entry fields and CIDR ranges (LO1) | None | "192.0.2.255 and 192.0.3.1 are both close enough to match"; matching only some fields |
| 2 | First match wins (LO2) | Level 1 | "Any matching entry applies"; "the more specific entry wins" |
| 3 | Implicit deny, mixed protocols (LO3) | Level 2 | "No matching entry means permit" |

**Progression:** sequential on first playthrough; retry without penalty. Hints remain available. No score, timer, leaderboard, or streak.

**Session behavior:** progress is held for the current page session; reload starts again.

## Cases the implementation must satisfy

All cases use the Cisco-style first-match model above. Expected results are recorded here independently of the evaluator and must be reviewed by someone with networking knowledge before release.

| Wave | ACL (in order) | Packet | Expected | Why |
| --- | --- | --- | --- | --- |
| 1.1 | `10 permit tcp any host 10.0.0.5 eq 443`; `20 deny tcp any any eq 23`; `30 permit ip any any` | TCP 203.0.113.9 → 10.0.0.5:443 | permit (entry 10) | all fields match entry 10 |
| 1.1 | (same) | TCP 203.0.113.9 → 10.0.0.5:23 | deny (entry 20) | entry 10 port ≠ 23; entry 20 matches |
| 1.1 | (same) | UDP 198.51.100.7 → 10.0.0.8:53 | permit (entry 30) | entries 10 and 20 are TCP-only |
| 1.2 | `10 deny ip 192.0.2.0/24 any`; `20 permit ip any any` | src 192.0.2.77 | deny (entry 10) | inside /24 |
| 1.2 | (same) | src 192.0.2.255 | deny (entry 10) | last address in /24 (boundary) |
| 1.2 | (same) | src 192.0.3.1 | permit (entry 20) | just outside /24 (boundary) |
| 2.1 | `10 permit tcp 10.0.0.0/24 any eq 22`; `20 deny tcp any any eq 22`; `30 permit ip any any` | TCP 10.0.0.15 → 172.16.0.1:22 | permit (entry 10) | first match wins; entry 20 never reached |
| 2.1 | (same) | TCP 10.0.1.15 → 172.16.0.1:22 | deny (entry 20) | not in 10.0.0.0/24 |
| 2.1 | (same) | TCP 10.0.0.15 → 172.16.0.1:80 | permit (entry 30) | port ≠ 22 |
| 2.2 | `10 deny tcp any any eq 22`; `20 permit tcp 10.0.0.0/24 any eq 22`; `30 permit ip any any` | TCP 10.0.0.15 → 172.16.0.1:22 | deny (entry 10) | order swapped; entry 20 unreachable |
| 2.2 | (same) | TCP 10.0.0.15 → 172.16.0.1:443 | permit (entry 30) | port ≠ 22 |
| 2.2 | (same) | UDP 10.0.0.15 → 172.16.0.1:22 | permit (entry 30) | entries 10 and 20 are TCP-only |
| 3.1 | `10 permit tcp 10.0.0.0/24 any eq 80`; `20 permit tcp 10.0.0.0/24 any eq 443` | TCP 10.0.0.9 → 172.16.0.1:80 | permit (entry 10) | match |
| 3.1 | (same) | TCP 10.0.0.9 → 172.16.0.1:8080 | deny (implicit) | no entry matches |
| 3.1 | (same) | UDP 10.0.0.9 → 172.16.0.1:53 | deny (implicit) | entries are TCP-only |
| 3.1 | (same) | TCP 10.0.1.9 → 172.16.0.1:443 | deny (implicit) | source outside /24 |
| 3.2 | `10 deny icmp any any`; `20 permit ip 10.0.0.0/8 any` | ICMP 10.1.1.1 → 172.16.0.1 | deny (entry 10) | first match |
| 3.2 | (same) | TCP 10.1.1.1 → 172.16.0.1:80 | permit (entry 20) | in 10/8 |
| 3.2 | (same) | TCP 10.255.255.255 → 172.16.0.1:80 | permit (entry 20) | last address in /8 (boundary) |
| 3.2 | (same) | TCP 11.0.0.1 → 172.16.0.1:80 | deny (implicit) | outside 10/8 (boundary) |
| Unsupported content | an entry using a wildcard mask, a port range, or an unknown protocol | Open the wave | Visible content error; no packets spawn; no loss | Authoring error, not learner failure |

The destination 172.16.0.1 is a placeholder where the earlier draft did not name one; it must not match any entry that tests another field. Check this during clarify.

## Experience direction

- **Visual metaphor:** a network edge seen from above. The ACL is the rulebook on the left, packets are small labelled ships descending in lanes, and the operator's turret moves along the bottom.
- **One memorable moment:** when the game pauses on a mistake, the deciding ACL entry lights up and the matching header fields on the packet are underlined, so cause and effect are visible at once.
- **Always visible:** the full ACL; each packet's protocol, source, destination, and port; packet loss; and the current wave.
- **Feedback voice:** patient and specific; explain the observed choice before offering the next step.
- **Layout:** ACL and playfield side by side, feedback below. On a narrow window the ACL stacks above the playfield and scrolls in its own labeled container. No technical value appears only on hover.

## Non-goals

No user accounts, multiplayer, backend, live infrastructure access, runtime AI, leaderboard, score, or level editor. No simulation of stateful firewalls, NAT, routing, or any traffic beyond the single inbound ACL. No audio and no randomised waves in v1. Visual polish must fit the existing mechanic.

## Open decisions for clarify

- ~~What is the loss limit, and does a failure restart the level or only the current wave?~~ Resolved 2026-11-17: one running total, limit 6; the failed wave alone restarts with packet loss restored to its value at that wave's start.
- Which Cisco or standards documents will be cited for first-match evaluation, the implicit deny, and CIDR, and do the briefings agree with them?
- Should a leak and a wrongly-dropped packet cost the same amount of packet loss?
- What default speed should packets move at, and what are the slowest and step-mode settings?
- Is the destination 172.16.0.1 placeholder safe for every case above?

Delete this section when resolved, or record the answer beside each question.

## Release evidence

All required acceptance criteria must have a recorded result. All six waves and their explanations must be checked against the references. A teammate must complete the core flow using only the keyboard at the slowest setting. The README must describe implemented behavior, exact run/test commands, and any remaining limits.
