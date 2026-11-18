# Quickstart: validating Permit or Pew

A run-and-check guide for the Galaga-style game. Results from the last run are recorded in the README.

## Prerequisites

- Python 3 (for the static server) and any current browser. Node 22 or newer for the command-line checks. Chrome or Edge for the automated browser check.
- A terminal opened in the repository root.

## Run the game

```powershell
py serve.py
```

Open **http://127.0.0.1:8000**. (On other systems use `python3`.) Press Ctrl+C to stop the server. If port 8000 is busy, run `py serve.py 8001`. `serve.py` is the built-in static server plus a "never cache" header; the plain `py -m http.server` works too but can leave the browser with stale files after an update (the game then shows "The game did not start"; press Ctrl+Shift+R). Opening `index.html` directly from disk is not supported and shows a message.

## Run the tests

- **In the browser:** with the same server running, open **http://127.0.0.1:8000/tests/**. The page shows totals and the IDs of any failing cases. **Zero tests found counts as a failure.**
- **From a terminal:** `node tests/run-node.mjs`
- **End to end in Chrome:** `node tests/browser-check.mjs` starts its own server, plays the real game with real key presses, and saves screenshots to the system temp folder (`pd-shots`). Set `CHROME_PATH` if Chrome or Edge is not in a default location.

## Checks

Record pass, fail, or not run, with date and browser, for each. "Auto" means `tests/browser-check.mjs` covers it; "Person" means a human must do it.

| # | Check | Expected | By |
| --- | --- | --- | --- |
| 1 | Fresh start | The first briefing appears before any packets (AC1). | Auto |
| 2 | Wave 1.1: shoot the denied packet p4 (TCP 198.51.100.22 → 10.0.0.8:23) | It is destroyed; health stays at 3; a message names entry 20 (AC2). | Auto |
| 3 | Wave 1.1: shoot the permitted packet p5 (TCP 203.0.113.50 → 10.0.0.8:443) | Health 3 → 2 (two hearts); the game does not pause; a one-line message names entry 30; the full explanation is not shown during play (AC3). | Auto |
| 4 | Wave 1.1: let denied packets reach the network | Health -1 each, no pause; leaks listed in the review (AC4). | Auto |
| 5 | Let a permitted packet reach the network | Delivered; health does not go down (AC5). | Auto (every perfect wave) |
| 6 | Fire at a gap between packets | Nothing changes (AC6). | Auto |
| 7 | Fire 3 times quickly | At most 2 bullets in the air. | Auto |
| 8 | Pause, press H three times | Method hint, worked step, full solution; assistance recorded; nothing moves while paused (AC7). | Auto |
| 9 | End of a wave with mistakes | A review lists every mistake with its full explanation and source; the summary says it was not a clean run (AC9). | Auto |
| 10 | Take health to 0 mid-wave (three wrong shots in a row) | The wave fails at once; the review of that attempt is shown; Retry restores health to 3; mistakes stay counted; the retry is counted (AC10). | Auto |
| 11 | Play all six waves perfectly, keyboard only | Reaches the session summary with 0 mistakes, retries, and hints; says it is not proof of mastery (AC11). | Auto |
| 12 | Restart, then Escape; Restart, then Confirm | Escape changes nothing and returns focus; Confirm returns to the first briefing; time does not advance while the dialog is open (AC12). | Auto |
| 13 | Step speed | Time advances only on N; arrows hop; fire is instant (AC14). | Auto |
| 14 | Real-time pace | The default is Normal (about 60 ticks per second); Slow runs at about 30; holding Right moves the ship; releasing stops it; Space fires; P pauses. | Auto |
| 15 | Narrow window (375 px) and reduced motion | No horizontal scroll; ACL stacks and scrolls in its own box; the playfield scales; hit rings are removed (AC17). | Auto (emulated) |
| 16 | Accessibility basics | Every control has an accessible name; the meter and picture are labelled; feedback is a live region; every packet's status is text (AC13, AC15, AC16). | Auto |
| 17 | Break a wave's data (for example a port on an ICMP packet) | A content error names the level and wave; nothing starts (FR-021). | Auto |
| 18 | Last packet of a wave is a mistake that takes health to 0 | The wave fails and is not recorded as completed. | Unit test only; not played in the browser |
| 19 | Reload mid-game; open only the static files in a clean browser | A fresh session; plays with no account, key, or service (FR-029, FR-031). | Auto (fresh profile) |
| 20 | A first-time player plays all six waves at the default pace | About 10–15 minutes (SC-002); can have 3 or more packets in play (SC-009). | Person |
| 21 | A teammate makes a deliberate mistake | They can say which entry decided the packet and why, using only the review (SC-007). | Person |
| 23 | A correct decision after a mistake | Health goes up by 1 and the hearts refill; at full health it stays at 3 (AC6b). | Auto |
| 24 | Click Pause with the mouse, then Resume, then press Space | The ship fires; the game does not pause again. The same after clicking Move or Hint, and after changing speed with the pointer (AC18). | Auto (real mouse events) |
| 25 | Finish a level with low health, then start the next level | Health is 3 again at the start of the new level; between a level's two waves it carries over. | Unit test only |
| 26 | Read the first screen | The briefing is a few short cards with headings (Your job, Read one entry, Addresses, Controls), about 120 words; the Start button is visible without scrolling at 1366×768; sources are behind a "Sources" control (FR-001, FR-022). | Auto |
| 27 | Ask a first-time player whether the first screen was easy to read | They say it was quick to read and they knew what to do. | Person |
| 28 | Finish a wave with mistakes, then fail a wave | The cleared wave shows a green banner with a check mark and "cleared"; the failed wave shows a red banner with a cross and "failed"; they differ in words, icon, and colour; the next-step button is visible without scrolling (AC9, AC10). | Auto |
| 29 | Read "What went wrong" | One line per mistake: the packet, what you did, what you should have done, and the deciding entry. Clicking a line shows the full explanation. The "Sources" section is collapsed and opens on click (AC9b). | Auto (real mouse clicks) |
| 30 | Ask a player whether they could tell at a glance if they passed and what they got wrong | They can, without reading any long text. | Person |
| 31 | Start the game after an update, or break a module so it cannot load | With `py serve.py` the game loads. If a module fails to load, the page says "The game did not start" and tells the player to press Ctrl+Shift+R or use `py serve.py`, instead of staying on "Loading…". | Auto (a deliberately broken module) |
| 32 | Read the results of a wave with mistakes | The wave's access list is on the page beside the mistakes; entries that caused mistakes are marked with a count; each mistake line shows its deciding rule's text; opening a line highlights that rule in the list (AC9c). | Auto (real clicks) |
| 33 | Press Enter, play, press M | Sound starts after the first key press (not before); music plays for the level; firing, hitting, mistakes, and wave results each make their own sound; M mutes and the real output goes silent; M again restores it; pausing stops the music; Step speed has no music (AC19). | Auto (measured on the real audio output) |
| 34 | Click the Sound button, then press Space | The game is muted and Space still fires. The volume slider at 0 is silent. | Auto (real mouse clicks) |
| 35 | Listen to the effects and the three tunes | They sound good: effects are clear and not harsh, a mistake is obviously different from a hit, the music suits the game and does not tire. | Person. **Music: listened to on 2026-11-18, "good".** Effects: not reviewed separately yet. |
| 22 | A person plays with only the keyboard at Slow speed (the default is Normal), and tries a screen reader | Playable and understandable (SC-004). | Person |

## Review before release

- Someone with networking knowledge reviews all 48 reference cases (spec SC-001).
- Each briefing and explanation is checked against its cited source (SC-008). The four sources were found and read on 2026-11-18 (see research R9); a person with networking knowledge still checks the explanations against them.
- A person looks at the screenshots and plays at least one wave in real time at each speed. Automated checks cannot judge how the game feels.
