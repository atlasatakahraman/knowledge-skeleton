---
type: identity
project: knowledge
tags: [identity, owner]
created: 2026-11-02
updated: 2026-11-02
status: draft
---

# Identity

Who the owner is, what they know, and how they want to be talked to. `~/.claude/CLAUDE.md` imports
this note whole into every session, so keep it to what is always true. Rules of *behaviour* live in
[[Hard-Rules]]; this note is about the person.

Every `FILL:` comment marks a placeholder. `grep -rn "FILL:" 00-Meta` lists what is left.

## Who

<!-- FILL: name, handle, what you do. Solo or team, professional or learning, what you ship. -->

## What I know

**Confident**, don't explain the basics:
<!-- FILL: languages, frameworks, tools -->

**Barely**, explain when it comes up:
<!-- FILL: what you are learning -->

## What I care about

<!-- FILL: performance, security, privacy, latest versions, documentation... and what a good answer looks like to you. -->

## How to talk to me

<!-- FILL: terse or detailed, code first or prose first, language, whether to explain code back. -->

## Machine

<!-- FILL: OS, shell, hardware that changes answers. The SessionStart hook states the current OS
from config.json every session; describe here what differs between your machines. -->

## When I work

<!-- FILL: hours, and why the rollover hour in config.json is what it is. -->

## What I'm building

<!-- FILL: current focus, with links to its 10-Repos pages. -->

## Related

[[Hard-Rules]] · [[Conventions]] · [[Retrieval-Protocol]] · [[00-MOC-Root]]
