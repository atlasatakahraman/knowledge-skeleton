---
type: doc
project: knowledge
tags: [vault, rationale, hooks, retrieval]
created: 2026-11-02
updated: 2026-11-02
status: active
---

# Why this exists

The reasons behind this vault and its hooks. What each hook does is in [[Hook-Lifecycle]]; how to
use it is in [[README]].

## The problem

Without the vault, every session starts from nothing. The agent re-derives context by reading
files, which is slow, costs context, and yields the same answer each time. Where it does not read,
it falls back on its defaults, and those are often not the owner's: another package manager,
another branching model, a dependency added without a licence check. [[Hard-Rules]] is where each
of those gets written down once.

## The bet

1. **Prime the small, always-true core.** Who the owner is and the rules, imported whole by
   `~/.claude/CLAUDE.md`, plus what changes per session, injected by `brain-session`.
2. **Retrieve the long tail.** Everything else is found on demand, cheapest tier first
   ([[Retrieval-Protocol]]): the MOC, then full-text search, then the graph, a file read last.
3. **Capture records automatically.** Sessions, commits and decisions are written by hooks, so
   they exist even when nobody remembers to write them.

## Why hooks, not memory files

Claude Code's own memory is sharded by working directory: what a session learns lands wherever its
terminal happened to be open. A memory the agent must remember to consult, in a place that depends
on the cwd, fails quietly. **A hook runs whether or not the agent remembers to.**

## The failure mode it is designed against: silence

A pipeline like this rarely errors. It goes quiet: a flush that judges everything "nothing worth
keeping", an index that stops matching the vault, a recorder that misses commits, an expired login
behind a background `claude -p`. Each is invisible until someone needs the record. So every part
has a watcher:

| Watch | Catches | Where |
|---|---|---|
| Flush canary | Sessions captured, but no daily note for 3 days | `!! FLUSH CANARY` at session start |
| Failure record | A background `claude -p` that failed, with its reason | `!! BRAIN <TAG> FAILING` at session start |
| `brain-doctor` | Index, retrieval, sessions, auth, frontmatter, links, reach, ignores, commits, priming, graph, engine links; hygiene as a warning | `bun --bun ~/.claude/hooks/brain-doctor.mjs --pretty` |
| Event log | Every capture and what it spawned | `50-Ops/hook-events.jsonl` (gitignored) |
| Daily sweep | `brain-doctor --repair --record`, once a day, from a scheduled task | `50-Ops/Health/health-YYYY-MM.md` |
| Health alarm | The sweep's FAIL, or the sweep itself going quiet for 2+ days | `!! VAULT HEALTH` at session start |

## How to know it is working

1. `bun --bun ~/.claude/hooks/brain-doctor.mjs --pretty` prints **PASS**.
2. The tail of `50-Ops/Health/health-YYYY-MM.md` shows a PASS line for each recent day.
3. The session start shows **no `!!` lines**. Silence means healthy.

## Related

[[Hook-Lifecycle]] · [[README]] · [[Retrieval-Protocol]] · [[Hard-Rules]] · [[00-MOC-Root]]
