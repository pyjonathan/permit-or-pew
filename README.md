# Permit or Pew

**A Galaga-style arcade game where you shoot the packets an access list denies and let the permitted ones through, and learn to read an ACL because you have to read it fast.**

Permit or Pew is a browser game for software developers and IT beginners who are new to networking. You are a firewall defending a protected network. A formation of packets hovers at the top of the screen, each sprite showing its protocol, addresses, and port. An access control list (ACL) stays on screen. Packets peel off one at a time and dive toward your network. Move your ship, fire bullets, and decide for each packet: **if the list denies it, shoot it; if the list permits it, let it through.** Shoot good traffic, or let bad traffic leak, and you lose health; every right decision gives some back. The game never stops for a mistake: a one-line message appears, and after each wave a review explains every mistake in full.

A project from **NAF AC6: Loop Engineering, Spec-Driven Development & the Future of VibeOps**.

| Project | Details |
| --- | --- |
| Status | **Playable, and playtested once by a person** (the default pace, the health system, and a pause-button bug were changed as a result). Automated checks pass. Sources are real and checked; an independent networking review is still open. |
| Networking topic | Reading an ordered, stateless IPv4 ACL: field matching, CIDR ranges, first-match-wins, implicit deny |
| Typical session | Designed for 10–15 minutes (not yet measured with a first-time player) |
| Live demo | Not published yet |
| Built by | Jonathan Buchanan, with Claude Code |

## The challenge

Wave 2.2 shows this list:

```
10 deny tcp any any eq 22
20 permit tcp 10.0.0.0/24 any eq 22
30 permit ip any any
```

A packet `TCP 10.0.0.15 → 172.16.0.1:22` dives toward your network. Entry 20 looks like it permits your own subnet, so you hold your fire and it reaches the network. A message appears at once: *"Mistake: … got through. Entry 10 denies it."* When the wave ends, the review explains it fully: entry 10 matches first (it denies TCP port 22 from any source), the list stops at the first match so entry 20 is never checked, and this packet should have been shot.

Some packets are shielded: a permitted packet sits in front of a denied one in the same column. A bullet always hits the lowest sprite, so you hold your fire until the front packet dives away.

## What you'll learn

| By the end, you can… | You'll practice by… |
| --- | --- |
| Decide whether one ACL entry matches a packet's protocol, addresses, and port, including the edges of a CIDR range | Shooting or passing packets against short lists (Level 1) |
| Apply a list in order and see that the first match wins, even when a later entry also matches | Handling packets that match two entries, with the same entries in a different order (Level 2) |
| Predict the implicit deny when nothing matches, and handle mixed protocols | Shooting packets that match no entry (Level 3) |

**Before playing:** no prior knowledge. The first briefing teaches IPv4 addresses, CIDR, and the fields of an ACL entry.

## Play locally

You need Python 3 (or any static web server) and a current browser. From the project folder:

```powershell
py serve.py
```

On macOS or Linux use `python3` instead of `py`. Open **http://127.0.0.1:8000**. Press Ctrl+C in the terminal to stop the server. If port 8000 is busy, run `py serve.py 8001` and open port 8001.

`serve.py` is Python's built-in static server with one change: it tells the browser never to reuse old copies of the game's files. The plain `py -m http.server` also works, but it sends no caching instructions, so after the game is updated a browser can keep some old files and download some new ones. When they disagree, the game cannot start.

**If the game stays on "Loading…" or says "The game did not start":** press **Ctrl+Shift+R** (Cmd+Shift+R on a Mac) to reload without the cache. Restarting the server does not help, because the old files are kept by the browser, not the server. Using `py serve.py` prevents it.

The game loads JavaScript modules and a JSON file over HTTP, so opening `index.html` straight from disk does not work. If you try, the game shows a message telling you to start a server.

No account, install step, network connection, or API key is needed to play, and the game does not use AI at runtime.

## How to play

1. Read the briefing for the level, then press **Enter** (or Start).
2. A formation of 8 packets flies in and holds so you can read it, then packets dive toward the network one at a time.
3. **Shoot the packets the ACL denies. Let the permitted ones through.** Use the list on the left to decide. Hold **Left/Right** (or **A/D**) to move your ship, and press **Space** to fire. You can have 2 bullets in the air at once.
4. A mistake costs 1 health and shows a one-line message, but the game keeps running. After each wave a big banner tells you at a glance whether you cleared it (green, ✓) or failed it (red, ✗), and **What went wrong** lists each mistake on one line: the packet, what you did, what you should have done, and the rule that decided it. The wave's **access list** is shown beside it, with the rules that caused mistakes marked; click a line for the full explanation (its rule lights up in the list), or open **Sources** to read further. You start every level with 3 health, and each right decision gives 1 back (never above 3). If health reaches 0 the wave ends. When the wave ends you get an **after-action review** that explains every mistake: which entry decided the packet, why each earlier entry did or did not match, and what you should have done.
5. Pause any time with **P** and press **H** for a hint: first a method, then a worked step for the packet closest to the network, then the full solution. Hints are counted as assistance.
6. Finish three levels (two waves each) to reach the summary.

| Control | Action |
| --- | --- |
| Left / Right arrows, or A / D | Move your ship (hold). At Step speed each press is one hop |
| Space | Fire (one bullet per press, at most 2 in the air) |
| P | Pause and resume |
| H | Next hint (while paused) |
| N | Advance time (at Step speed) |
| Enter | Start a wave, continue past a review, or retry a failed wave |
| M, or the Sound button | Turn all sound on or off |
| Volume slider | Change the volume |
| Speed menu | **Step** (you advance time), **Slow** (half speed), **Normal** (the default) |
| Restart | Asks for confirmation; Cancel changes nothing |

**Health:** you start every level with 3 health, which is also the maximum. A mistake (shooting a permitted packet, or letting a denied one reach the network) costs 1. A correct decision gives 1 back, up to 3. Health carries from the first wave of a level into the second, and goes back to 3 when a new level starts. If a mistake takes it to 0, that wave fails at once and its review is shown. Retrying restarts that wave only, with health back at 3. **Progress:** mistakes from the failed attempt stay counted and each retry is counted, so the summaries never hide a failed attempt. Reloading the page starts a new game; nothing is saved. There is no timer, score, or leaderboard.

## What this game models

A **Cisco IOS-style extended, named, stateless IPv4 ACL applied to inbound traffic**. Entries are checked top to bottom. The first entry whose protocol, source, destination, and optional port all match decides (permit or deny). A packet that matches no entry is denied by the implicit deny. Entries match on a protocol (`tcp`, `udp`, `icmp`, or `ip` for any), a source and destination (`any`, `host A.B.C.D`, or CIDR `A.B.C.D/N`), and optionally one destination port (`eq`).

**Outside the model:** stateful inspection and `established`, wildcard masks (CIDR is used instead), port ranges and other port operators, source ports, IPv6, fragments, logging, object groups, return traffic, and other vendors' syntax.

| Reference | What it supports |
| --- | --- |
| [Cisco IOS XE 17 ACLs Configuration Guide: Access Control Lists](https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/security/acls/acls-configuration-guide/access-control-lists.html), section "How ACLs work" | The device tests a packet against the conditions one by one and the first match decides; the order of the conditions is critical. |
| The same guide, "How to configure IPv4 access control lists", "Create extended named ACLs" | The end of an extended named ACL contains an implicit deny for everything. |
| [Cisco IOS XE Catalyst SD-WAN Qualified Command Reference Guide: ACL Commands](https://www.cisco.com/c/en/us/td/docs/routers/sdwan/command/iosxe/qualified-cli-command-reference-guide/m-acl-commands.html), `permit` | An entry names the protocol to match; the keyword `ip` matches any Internet protocol, including ICMP, TCP, and UDP; `any` and `host` stand for any address and one host. |
| [RFC 4632: Classless Inter-domain Routing (CIDR)](https://www.rfc-editor.org/rfc/rfc4632), section 3.1 "Basic Concept and Prefix Notation" | A prefix is an address followed by a slash and a number from 0 to 32 that describes the number of significant bits. |

**What the sources do not say word for word:** that a `tcp` entry does not match `udp` traffic (the Cisco pages list tcp and udp as separate protocols, and the game treats the protocol field as an exact match, but neither page states the rule in so many words), and that the game's CIDR ranges replace Cisco's wildcard masks (a deliberate simplification the briefing states). All four pages were opened and read on 2026-11-18; the Cisco pages are for IOS XE and may change.

## How it was built

The project followed the workshop's Spec Kit workflow: **constitution → specify → clarify → plan → tasks → analyze → implement**.

- **Stack:** plain HTML, CSS, and JavaScript modules. SVG for the playfield, real DOM text for everything the player reads, and the Web Audio API for sound (synthesized, no audio files). No framework, bundler, backend, or runtime dependency.
- **Build tools:** Claude Code with GitHub Spec Kit 1.4.0. The tests are dependency-free. A Node script drives headless Chrome for the end-to-end checks.
- **Runtime:** static files in a browser. No model or API key.
- **Working artifacts:** `.specify/memory/constitution.md` (also `CONSTITUTION.md`), `specs/001-packet-defender/spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `tasks.md`. The root `SPEC.md` and `PLAN.md` are the original starter inputs and still describe the first, lane-based design; the files under `specs/` are authoritative.
- **Name:** the game was first called "Packet Defender". It was renamed Permit or Pew because the player is a firewall deciding which packets pass, not defending them. The internal folder `specs/001-packet-defender` keeps the old slug.
- **Layout:** `engine/` is pure logic with no DOM or clock (the ACL evaluator, content validator, game loop, session state, explanation text). `ui/` renders it, and `ui/clock.js` is the only clock. `data/levels.json` holds every briefing, ACL, packet, formation slot, dive time, and hint. Whether a packet is permitted is decided only by `engine/acl.js`, never by position, colour, flight path, or an answer key in the data.
- **Two design decisions worth knowing.** (1) The starter constitution forbade lives and timers, which a shooter needs. We amended it openly (now v3.1.0) to allow real-time play, with a health measure that heals on right decisions and a wave-only retry. (2) The first build paused the game on every mistake with four lanes and instant hits, and playtesting said it felt like gamified flash cards. We replaced it with a Galaga-style game: free movement, bullets that can miss, a formation that dives, and mistakes explained in an after-action review. That needed a second constitution amendment (C2: a mistake never freezes the action).

## Verification

**Last checked:** 2026-11-18, Windows 11, Chrome 157.0.8103.51 (headless), Node 24. No git repository, so there is no commit id.

Run the unit tests in a browser at **http://127.0.0.1:8000/tests/** (with the server running). It shows totals and failing case IDs and treats zero tests as a failure. The same tests run from a terminal: `node tests/run-node.mjs`. The browser script `node tests/browser-check.mjs` starts its own server, plays the real game in headless Chrome with real key presses, and saves screenshots to the system temp folder.

| Check | Result | Evidence / notes |
| --- | --- | --- |
| Correct, incorrect, and boundary cases | **Pass** | 208 of 208 tests pass in Node and in Chrome. This covers all 48 shipped packets against hand-typed expected results (including the CIDR edges 192.0.2.255, 192.0.3.1, 10.255.255.255, 11.0.0.1) and the formation and timing rules. Mutation checks on a scratch copy (a mistake that pauses, a bullet that hits the farthest sprite, a bullet cap of 3, a retry that forgets health, a last-packet mistake that is ignored, a CIDR off by one bit) each made the suite fail. One mutant first survived and exposed a missing overlap test, which was then added. |
| Briefings and explanations checked against sources | **Partly done** | The sources were found, opened, and read (2026-11-18), and the quoted claims were checked against the pages: first match and order, the implicit deny on extended named ACLs, the `ip` keyword, `any`/`host`, and CIDR prefix notation. The sources are real links in the game. **Still open:** a person with networking knowledge has not reviewed the 48 reference cases, the briefings, or the explanations. I worked the cases by hand; that is not an independent review. |
| Mistakes, review, hint, retry, duplicate fire, completion, restart | **Pass (automated)** | 99 of 99 checks in headless Chrome (including that each briefing is a few headed cards under about 140 words that the Start button is visible without scrolling at 1366×768, that a cleared wave and a failed wave differ in words, icon, and colour, and that a mistake line and the sources expand when clicked with a real mouse): a shot at a denied packet, a shot at a permitted packet that does not pause the game, a right decision healing 1 health (and the three hearts refilling), leaks, a bullet that hits nothing, a 2-bullet cap, nothing moving while paused, three hints, a review that explains every mistake, a real wave failure when three wrong shots take health from 3 to 0, with a retry that restores health and keeps mistakes, a perfect six-wave game (planned on the engine and replayed with real key presses, where the browser matched the engine on every wave), Restart with Escape and Confirm. |
| Real-time play | **Pass (automated), human feel not judged** | The default is Normal (about 60 ticks per second) and Slow runs at about 30, by themselves; holding Right moves the ship continuously and releasing stops it, Space fires, P pauses, Step speed does nothing until you advance. **A regression check uses real mouse clicks: after clicking Pause (or Move, or Hint) with the mouse, Space fires and does not press that button again.** One person has played it once; difficulty tuning beyond that is unchecked. The starting page was shortened after that playtest, and the game was renamed. |
| Keyboard-only core playthrough | **Pass (automated), human run not done** | A script sent real key events through all six waves. A person has not yet done a keyboard-only run, and no screen reader has been tried. |
| Narrow layout and reduced motion | **Pass (emulated)** | A 375 px emulated window: no horizontal scroll, the ACL stacks above the playfield in its own scroll box, the playfield scales. `prefers-reduced-motion: reduce` removes the hit rings. Not checked on a real phone or in other browsers. |
| Fresh checkout run instructions | **Pass** | `py serve.py` serves the game, the data, the modules, and the test page, and sends `Cache-Control: no-store`. A clean browser profile plays it using only static files. |
| Time to complete, packets in play, and a teammate's explanation check | **Not run** | The 10–15 minute target, "3 or more packets in play at once", and "a teammate can say why after a wrong choice" have not been tried with a real player. |
| Stale cached files | **Fixed, and reproduced first** | A browser that had loaded an older version kept an old `feedback.js` while re-downloading a newer `state.js`, and the game stayed on "Loading…" with a console error ("does not provide an export"). I reproduced exactly that with the plain `py -m http.server`; the same scenario loads correctly with `py serve.py`, and with the plain server the page now shows "The game did not start" and says to hard-refresh. A browser check keeps that message working. |
| Sound | **Pass (automated); the music has been listened to** | Effects and a tune for each level are synthesized in the browser (no audio files). In headless Chrome the output level is measured after the master volume: no audio before the first key press; the music is audible; firing plays the fire sound; M mutes and the output measures as silent; unmuting restores it; pausing stops the music; the volume at 0 is silent; the Sound button works with a real mouse click and Space still fires. A deliberate mutation (mute and volume do nothing) made exactly those checks fail. **One person listened to the music and said it is good (2026-11-18).** The sound effects were not reviewed separately, and nobody else has listened. |
| Published demo | **Not applicable** | Not published. |

## Known limitations and next steps

- **Known limitation:** the sources are real and checked, but the networking content has not had an independent review by a person with networking knowledge. Treat the explanations as unreviewed until it has. Two things are not stated word for word in the cited pages (see "What this game models").
- **Known limitation:** nobody has played this yet. The pace, the difficulty, and the dive timing are my best guesses. Playtest it before you trust them.
- **Known limitation:** only Chrome was tested, and only in an automated way. Firefox and Safari are untested. No screen reader testing has been done.
- **Known limitation:** the packet text is small when the playfield is scaled down on a narrow window; the text version of the playfield carries the same information.
- **Known limitation:** no touch controls and no score. These are deliberate v1 choices. (An earlier version of this line said the constitution forbids sound; it never did, and sound has since been added.)
- **Known limitation:** one person has listened to the music and liked it; the sound effects have not been reviewed separately. Every pitch, volume, and tune is plain data in `ui/sounds.js`, so changes are easy. Mute and volume are not saved when the page reloads.
- **Next improvement:** verify and enter the sources, have a networking reviewer go through the 48 cases and every explanation, and watch one first-time player. Those three things would most improve trust in the game.

Found an incorrect answer or unclear explanation? Open an issue with the level and wave, the packet values, your choice, the expected result, the actual result, and a reference if you have one.

## Credits

Created by Jonathan Buchanan with Claude Code. Workshop by John Capobianco, Joksan Flores, and Elliot Conner. Adapted from the [NAF AC6 workshop materials](https://github.com/automateyournetwork/NAF_AC6) and [Networking Video Game Starter Kit](https://github.com/automateyournetwork/NetworkingVideoGameStarterKit) (both are Apache-2.0; the files adapted from them were changed here, see [NOTICE](NOTICE)), using [GitHub Spec Kit](https://github.com/github/spec-kit) (MIT).

**Assets and dependencies:** the game uses only original code and no third-party assets or libraries.

**License:** Apache-2.0, see [LICENSE](LICENSE) and [NOTICE](NOTICE). Copyright 2026 Jonathan Buchanan. It matches the license of the workshop repositories this was adapted from.
