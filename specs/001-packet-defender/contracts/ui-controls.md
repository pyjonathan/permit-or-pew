# Contract: Player-facing controls and accessibility

This is the interface the player and assistive technology see. It must match the spec's FR-024 to FR-029.

## Keyboard

| Key | Action | Notes |
| --- | --- | --- |
| Left / A | Move the ship left | Hold to move at Slow and Normal. At Step speed each press is one 50-unit hop. |
| Right / D | Move the ship right | Same. |
| Space | Fire | One bullet per press; at most 2 in the air. |
| P | Pause or resume | Allowed any time during a wave. |
| H | Next hint | Only while paused. Records assistance. |
| M | Sound on or off | Mutes or unmutes all sound (effects and music). The Sound button does the same. |
| N | Advance time | Only at Step speed: advances 15 ticks. |
| Enter | Continue | Starts a wave from the briefing, moves past a review or summary, retries a failed wave. |
| Tab / Shift+Tab | Move focus through every control | Same actions as the buttons. |

Every key action also has a labelled on-screen button (the move buttons hop once). Space and Enter are left to a focused button so one key press never triggers two actions. Keys are ignored while the speed menu or the restart dialog has focus.

## Screens and focus

- **Briefing:** short cards with headings (for example "Your job", "Read one entry", "Addresses", "Controls") laid out side by side, a Start button directly under them ("or press Enter"), and the sources behind a collapsed "Sources" control. The Start button is visible without scrolling at 1366×768.
- **Keys:** a compact one-line legend under the controls (arrows or A/D, Space, P, H, N, Enter) instead of a paragraph.

- **Focus returns to the playfield after a game control is used.** After Move, Fire, Pause/Resume, Hint, or Advance is activated (by mouse or keyboard), focus moves to the playfield heading. Otherwise a clicked Pause button would keep focus and the next Space press would press Pause again instead of firing. The same applies to a speed change made with the pointer; a speed change made with the arrow keys keeps focus on the menu so the player can keep choosing. Escape, Tab, and the other keys behave as normal.
- Each screen change (briefing, review, summaries, error) moves focus to its heading.
- When play begins, focus moves to the playfield heading so Space fires immediately.
- The restart confirmation is a labelled modal dialog with Restart and Cancel; Escape cancels and focus returns to the control that opened it. The game does not advance while it is open.

## Text equivalents and live regions

- **ACL panel:** the full list as real text, always visible, in its own scrollable labelled region on narrow windows. The entry that decided the latest decision is marked "decided".
- **Packet sprites:** each shows protocol and port, source, and destination as text, and the same values appear in the text mirror.
- **Text mirror:** a list of all 8 packets with their status (waiting, flying in, in formation with its dive time, diving with percent of the way, dropped by your shot or let through, and whether that was correct or a mistake).
- **Feedback region:** a polite live region announces the latest decision in one line. Colour is always paired with text and a label ("✓ Correct:", "✗ Mistake:"). Mistakes say the full explanation is waiting in the review.
- **Results screens (wave cleared, wave failed, level cleared, all waves cleared):** a large banner at the top with a word, an icon, and a colour: green with a check mark and "Wave 1.1 cleared", or red with a cross and "Wave 1.1 failed". The banner holds the next-step button (Next wave, Retry this wave, Next level, Play again), so it is always visible. A cleared wave with mistakes says "Cleared, but not a clean run". Below the banner: stat tiles (right, mistakes, health with hearts, retries, hints), then **What went wrong**.
- **What went wrong:** one line per mistake with the packet, what the player did ("You shot it" or "It got through"), what they should have done ("Should have: let it through" or "shoot it"), and the deciding entry ("Entry 30 permits it."). Each line is a collapsed control; opening it shows the full explanation (why each earlier entry did or did not match, and the next step). When there are no mistakes it says nothing went wrong.
- **The access list on the results page:** the wave's list is shown beside "What went wrong" (above it on a narrow window): every entry in order, then the implicit deny. An entry that caused mistakes has a red mark and "✗ caused N mistake(s)". Each mistake line shows the text of its deciding entry, and opening a line highlights that entry in the list with "◀ this rule". Both the cleared-wave and failed-wave screens show it.
- **Sources:** one collapsed "Sources: read more" section at the bottom of the results, listing each source's title, section, URL, and the claim it supports.
- **Health:** shown as text ("Health 2 of 3") and as hearts (♥♥♡). A counts line shows packets handled correctly and mistakes in this attempt.

## Pace and motion

- **Speed control:** Step (you advance time), Slow (30 ticks per second), Normal (60 ticks per second, the default). It scales everything together and can be changed at any time.
- **Pause:** stops all motion. The game also pauses automatically when the browser tab is hidden.
- **Reduced motion:** decorative effects (hit rings, stars) are removed. The simulation is still controlled by the speed setting and Step mode, so no information or control is lost.

## Sound

- **Sound effects** for: fire, correct hit, wrong hit, delivered, leak, wave start, wave cleared, wave failed, pause, resume, and hint. A wrong hit and a leak are low, harsh tones; a correct hit and a delivery are bright; wave cleared rises and wave failed falls.
- **Music:** one looping tune for each level (C major, A minor, E minor), each faster than the last, played only while a wave is running at Slow or Normal speed. Slow plays the tune at 75% tempo. It stops on pause, in Step speed, while the restart dialog is open, and on every briefing and results screen.
- **Controls:** a **Sound: on / Sound: off** button, the **M** key, and a **Volume** slider (default 60%). Using the button or the slider with the mouse hands focus back to the playfield; using the slider with the arrow keys keeps focus on it.
- **Starts after a user action:** the browser only allows sound after a key press or click, so the audio is created on the first one. Before that there is no sound.
- **Never the only signal:** every fact a sound carries is also shown as text (the feedback message, the results). The game is fully playable muted.
- **Settings are not saved:** muted and volume reset when the page reloads.
- **Where to tune it:** all pitches, volumes, lengths, and the tunes themselves are plain data in `ui/sounds.js`.

## Layout

- Typical laptop (1366×768): ACL and feedback in the left column, the playfield on the right with its whole height visible above the control bar.
- Narrow window: the ACL stacks above the playfield and scrolls inside its own labelled container; the playfield scales to fit; the controls stay available.
