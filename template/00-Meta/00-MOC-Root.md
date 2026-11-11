---
type: moc
project: knowledge
tags: [moc, index]
created: 2026-11-02
updated: 2026-11-11
status: active
---

# Root MOC

**Start here.** Tier 1 of the [[Retrieval-Protocol]]. If the answer isn't reachable from this page
in two hops, the vault has a gap: fix the gap, don't grep around it.

## The vault itself

| Note | What it answers |
|---|---|
| [[Identity]] | Who the owner is, what they know, how to talk to them |
| [[Hard-Rules]] | The owner's non-negotiable rules |
| [[Conventions]] | Frontmatter schema, naming, where things live |
| [[Retrieval-Protocol]] | How to find things without reading files |
| [[Hook-Lifecycle]] | Every hook: its event, what it writes, what it costs, what notices when it fails |
| [[Why-This-Exists]] | Why the vault and its hooks are built this way, and how to know it is working |
| [[Forward-Links]] | Links to notes not written yet, on purpose |
| [[README]] | What the vault is, daily use, commands, troubleshooting |

## Folders

- `10-Repos/`: [[00-MOC-Repos]] · one page per repository, each with a `checkout:` pointer
- `20-Knowledge/`: [[00-MOC-Knowledge]] · reusable knowledge, one concept per note
- `20-Knowledge/People/`: [[00-MOC-People]] · people the owner knows, one folder each; check it before doing something for someone
- `30-Sessions/`: [[00-MOC-Sessions]] · daily logs (generated hub)
- `40-Plans/`: [[00-MOC-Plans]] · every plan, one folder each, with its status (generated hub)
- `50-Ops/`: [[00-MOC-Ops]] · commit notes, usage, health (generated hub)
- `60-Decisions/`: [[00-MOC-Decisions]] · ADRs, `Repos/<Remote-Name>/` and `Identity/`
- `80-Assets/`: [[00-MOC-Assets]] · attachments only
- `90-Inbox/`: unsorted capture, kept empty

## Commands

| Command | Does |
|---|---|
| `/brain new <kind>` · `/brain edit <kind>` | structure · repo · docs · command · commit · task · hook · plan · decision |
| `/brain-log` | Write today's session note |
| `/brain-usage` | Token/model/cost digest into `50-Ops/Usage/` |
| `/brain-commits` | Record every commit this month into `50-Ops/Commits/` |
| `/brain-sync` | Rebuild graphs, re-index, prune phantom rows, verify links |
| `bun --bun ~/.claude/hooks/brain-doctor.mjs --pretty` | Zero-token health check |
