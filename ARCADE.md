---
# ARCADE SUBMISSION — fill this file in, commit it to the ROOT of your game repository as ARCADE.md,
# then send John your GitHub URL. Everything between the two --- lines is machine-read.
#
# INSTRUCTIONS FOR THE BUILD AGENT (the coding agent that built this game):
#  1. You were there. Fill every field from your own session, your files and your tool list.
#  2. Do NOT invent. If something was not recorded or you do not know it, write "unknown".
#     A truthful "unknown" is better than a confident guess. Never estimate tokens or cost.
#  3. Ask the human ONLY for the fields marked (HUMAN): name, location, links, consent, first-project.
#  4. Keep strings on one line, quote any value containing a colon. Lists use [a, b, c] or "- item".
#  5. Do not put secrets, API keys, tokens, private URLs or file paths from the human's machine here.
#  6. Run the game once yourself and confirm the Runtime section is correct before you finish.
#  7. Then fill in the three short prose sections below the frontmatter. Plain language, no hype.
arcade_version: 1

game:
  title: "Permit or Pew"
  slug: "permit-or-pew"
  tagline: "Shoot the packets the ACL denies. Let the permitted ones through."
  summary: "You are a firewall in a Galaga-style arcade game. Packets dive toward your network, and you read an access list to decide which to shoot and which to let through, losing health for every wrong call. After each wave, a review shows what you got wrong and which rule decided it."
  topics: [ACL, first match wins, implicit deny, CIDR, firewall]
  category: "security"
  skill_level: "beginner"
  play_minutes: 12          # design target of 10-15 minutes; not yet timed with a first-time player
  levels: 3                 # 3 levels of 2 waves each (6 waves, 48 packets)
  card_image: "assets/images/title.png"
  card_image_alt: "Game screen: the access list on the left with the deciding rule highlighted, a formation of labelled network packets at the top of the playfield, a firewall ship at the bottom, and a Correct message with full health."
  repo: "https://github.com/pyjonathan/permit-or-pew"   # given by the creator (the .git ending removed)
  repo_path: ""
  license: "Apache-2.0"     # chosen by the creator (it matches the workshop repositories this was adapted from); see LICENSE and NOTICE

creator:                     # (HUMAN) ask the human for every field here
  name: "Jonathan Buchanan"  # name to show on the card (given by the creator)
  github: "pyjonathan"       # given by the creator
  location: ""               # "City, Country" or just "Country" — optional, leave "" to hide
  organization: ""           # optional
  links: [https://www.linkedin.com/in/jonathan-buchanan-a58996b/]   # given by the creator
  first_spec_project: true   # (HUMAN) confirmed by the creator: this is their first spec-driven project
  workshop: "NAF AC6"        # where the project began; change if different
  consent_to_publish: true   # (HUMAN) the creator agreed to this card appearing on automateyournetwork.ca/arcade

build:                       # the BUILD environment — what made the game
  started: "2026-11-17"
  finished: "2026-11-18"     # the date this file was written; the game was still being improved
  wall_time: "unknown"       # not recorded
  spec_driven:
    framework: "GitHub Spec Kit"
    framework_version: "1.4.0"
    artifacts: [constitution, spec, clarify, plan, tasks, checklists]   # clarify = the Clarifications section in spec.md; /speckit-analyze was run but its report was not saved as a file
    task_count: 51           # tasks in tasks.md: 48 done, 3 open (review by a networking person, two human checks, this file)
    loops_or_phases: 9       # playtest-driven rounds after the first build, each recorded in tasks.md and the spec
  model: "claude-sonnet-5-5"
  helper_models: []          # no sub-agents or secondary models were used
  harness: "Claude Code"
  harness_version: "2.1.118"
  mcp_servers: ["claude-vscode (IDE integration; connected but not used)"]
  rag_and_sources: ["Cisco IOS XE 17 ACLs Configuration Guide, Access Control Lists", "Cisco IOS XE Catalyst SD-WAN Qualified Command Reference Guide, ACL Commands", "RFC 4632 (CIDR)", "NAF AC6 workshop starter kit (CONSTITUTION, SPEC, PLAN and README templates)"]
  skills_and_plugins: [speckit-constitution, speckit-specify, speckit-clarify, speckit-plan, speckit-tasks, speckit-analyze, speckit-implement]
  other_tools: ["Node.js 24 (a dependency-free test runner)", "headless Chrome 157 driven over the DevTools Protocol (end-to-end checks and screenshots)", "Python 3.14 (serve.py static server)", "WebFetch and WebSearch (reading the cited sources)"]
  human_prompts: 0           # unknown: the number of messages the human sent was not counted
  usage:                     # ONLY if measured by the harness. Otherwise leave "unknown"
    input_tokens: unknown
    output_tokens: unknown
    cost_note: "unknown"
  ai_generated_assets: ["images: none (the card image is a real screenshot of the game)", "audio: synthesized in the browser by code, no audio files", "3D models: none"]

runtime:                     # what someone needs to PLAY the finished game
  kind: "static-web"
  stack: [HTML, CSS, JavaScript ES modules, SVG, Web Audio API]
  start: "py serve.py"
  url_after_start: "http://127.0.0.1:8000"
  hosted_url: ""             # not published
  static_root: "."
  requires_install: false
  requires_network: false
  requires_api_key: false
  uses_ai_at_runtime: false
  browsers: ["Chrome 157.0.8103.51 (full automated checks, headless)", "Edge 157.0.4341.60 (the start screen loads with no errors; nothing else tested)"]
  accessibility: "Tested by script in headless Chrome: all six waves played with real key presses only; every control has an accessible name; feedback is a live region; every fact is also text, including a text list of every packet; sound is an extra layer with a mute key and a volume slider; reduced motion and a 375 px window were emulated. NOT tested: a screen reader, a person using only the keyboard, touch, Firefox, Safari."
  save_state: "none (progress, mute and volume reset when the page reloads)"

verification:
  tests: "node tests/run-node.mjs"
  tests_passing: 208          # from the last run; node tests/browser-check.mjs also passes 99 of 99 checks in Chrome
  facts_sourced_from: ["Cisco IOS XE 17 ACLs Configuration Guide, Access Control Lists (How ACLs work; Create extended named ACLs)", "Cisco IOS XE Catalyst SD-WAN Qualified Command Reference Guide, ACL Commands (permit)", "RFC 4632 section 3.1 (CIDR prefix notation)"]
  known_limits:
    - "Models one simplified ACL: IPv4 only, stateless, one destination port per entry, and CIDR ranges instead of Cisco wildcard masks."
    - "The Cisco pages do not say word for word that a tcp entry fails to match udp traffic; the game treats the protocol as an exact match."
    - "No person with networking knowledge has independently reviewed the 48 reference cases, the briefings or the explanations."
    - "The cited Cisco pages are for IOS XE and may change."
    - "Difficulty and pace were tuned from one person's playtesting."
    - "No touch controls, no score, and mute and volume are not saved across reloads."
---

## In one paragraph

Permit or Pew is a Galaga-style browser game that teaches beginners to read an access control list. You are a firewall: a formation of packets, each showing its protocol, addresses and port, dives toward your network, and the ACL on screen tells you which to shoot and which to let through. Every mistake costs health and is explained in a short review after the wave, with the rule that decided it. It is for software developers and IT beginners who have never read an ACL, and it runs from static files with no account, install or network.

## How it was built

We followed the Spec Kit order: the starter constitution was personalised, then specify, clarify, plan, tasks, an analysis pass that found 13 issues (all fixed), and implement, with tests written before the code. The first build used four lanes and paused the game on every mistake, and playtesting called it gamified flash cards. We replaced it with a free-moving Galaga-style game and amended the constitution openly, which was the biggest change of direction. Later rounds, each driven by playing it, changed the default pace, added a health system that heals on right decisions, fixed a Pause button that kept keyboard focus, shortened the start page, redesigned the results so a pass and a fail look different, put the rules on the results page, and added synthesized sound. One failure came from stale files cached by the browser, which left the page on Loading; we reproduced it, added a no-cache server and a message that says what to do. We checked the game in headless Chrome with real key presses and mouse clicks, looked at the screenshots, and deliberately broke code on a scratch copy to confirm the tests could fail. The sources were opened and read before being cited. A person has not yet reviewed the networking content.

## What we'd tell the next builder

- Look at screenshots and drive the real game, not just test counts; the biggest problems (a game that felt like flash cards, a hidden button, a layout that did not fit the screen) only showed up that way.
- Check what a rule actually costs the player before you write it into the constitution; ours had to change several times once the game was playable.
- Serve with the no-cache server in this repo, because a plain static server let a browser mix old and new files and the game silently failed to start.
