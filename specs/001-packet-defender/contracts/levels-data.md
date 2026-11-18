# Contract: `data/levels.json`

The authored content file. Its shape is defined in [data-model.md](../data-model.md) ("Authored data"). This page gives a small, abridged example and the loading behaviour.

## Abridged example

```json
{
  "schemaVersion": 1,
  "maxHealth": 3,
  "playfield": { "width": 700, "height": 560 },
  "sources": [
    { "id": "src-acl-eval", "title": "Cisco IOS XE 17 ACLs Configuration Guide: Access Control Lists", "url": "https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/security/acls/acls-configuration-guide/access-control-lists.html", "section": "How ACLs work", "claim": "The device tests a packet against the conditions one by one and the first match decides; the order of the conditions is critical." }
  ],
  "levels": [
    {
      "id": "L1",
      "title": "Level 1: Read the entries",
      "outcome": "LO1",
      "briefing": "…",
      "sourceIds": ["src-acl-eval"],
      "waves": [
        {
          "id": "1.1",
          "acl": [
            { "seq": 10, "action": "permit", "protocol": "tcp", "src": "any", "dst": "host 10.0.0.5", "port": 443 },
            { "seq": 20, "action": "deny",   "protocol": "tcp", "src": "any", "dst": "any", "port": 23 },
            { "seq": 30, "action": "permit", "protocol": "ip",  "src": "any", "dst": "any" }
          ],
          "diveTicks": 300,
          "packets": [
            { "id": "p1", "protocol": "tcp", "src": "203.0.113.9", "dst": "10.0.0.5", "port": 443, "slot": 0, "diveAt": 580, "path": "sway" },
            { "id": "p2", "protocol": "tcp", "src": "203.0.113.9", "dst": "10.0.0.5", "port": 23,  "slot": 1, "diveAt": 980, "path": "sway" }
          ],
          "hints": ["Read the entries from the top. …"]
        }
      ]
    }
  ]
}
```

(Abridged: a shipped wave has 8 packets. The formation and timing rules are in the spec.)

The permit/deny outcome of each packet is **not** in the data. Only the evaluator decides it (constitution C6).

## Briefing markup

A level's `briefing` is a small text format that the game turns into short cards. Blocks are separated by blank lines.

| Write | You get |
| --- | --- |
| `## Your job` | A new card with a heading |
| `- item` lines | A bullet list |
| `> text` lines | A monospace example box, one line per row |
| `**bold**` | Bold text |
| anything else | A paragraph |

Everything is escaped before it is shown, so briefing text cannot inject HTML. Rules, checked by tests: at most 130 words per briefing, at least 3 headings, at least one example box, no paragraph over 35 words, and Level 1 states what is simplified (IPv4 only, one packet at a time, no wildcard masks). The Level 1 worked example must not use an entry from the challenge waves.

## Loading behaviour

- Fetched with a relative URL over HTTP. The whole document is validated before the game starts.
- Source records need a title, URL, section, and claim. In the game, an https URL becomes a link that opens in a new tab (with `noopener`); any other address is shown as plain text, never as a link. On any validation error the game shows a content error naming the level and wave ID, starts nothing, and counts no mistake.
- Adding a wave that uses the existing mechanic is a data change plus its checks, with no change to the engine.
