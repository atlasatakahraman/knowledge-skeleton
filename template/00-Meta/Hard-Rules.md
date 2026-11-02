---
type: rules
project: knowledge
tags: [rules, hard-rules]
created: 2026-11-02
updated: 2026-11-02
status: draft
---

# Hard Rules

Non-negotiable. These apply in every session without being restated: `~/.claude/CLAUDE.md`
imports this note whole. Who the owner is: [[Identity]].

**Never move a part of this note behind a link.** A rule behind a link is missed whenever the link
is not followed. Grow the note; do not split it. Every `FILL:` comment marks a placeholder.

## Vault

- **Write notes through `/brain new <kind>` and `/brain edit <kind>`.** They know the schema in
  [[Conventions]] and keep every note reachable from [[00-MOC-Root]].
- **Retrieval runs in tiers, in order** ([[Retrieval-Protocol]]). Never sweep the vault with `ls`,
  `find` or `grep`: the MOC answers "where is X" in one hop.
- **Every commit has a body that says why.** `brain-commit` copies the body into the commit's note;
  a subject-only commit leaves a note with no reason in it.
- **All file writes are native `Write` / `Edit`.** context-mode's `ctx_execute` runs in a sandbox
  and discards its filesystem.

## Tooling

<!-- FILL: package manager, runtimes, which tool to prefer over which. -->

## Dependencies and licensing

<!-- FILL: when a dependency may be added, which licences are allowed and rejected. -->

## Code changes

<!-- FILL: refactor scope, tests, review, how changes are verified before "done". -->

## Branching and publishing

<!-- FILL: which branches, what needs an explicit yes (pushes, deploys, publishing). -->

## Working preferences

<!-- FILL: one bullet per standing preference, each with the date and the reason it exists. -->

## Related

[[Identity]] · [[Conventions]] · [[Retrieval-Protocol]] · [[00-MOC-Root]]
