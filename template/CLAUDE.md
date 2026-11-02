# Knowledge vault

This vault is the long-term memory of every Claude Code session on this machine, and an **index** of
the repositories. The checkouts live outside it, under the `devRoot` in the machine's
`config.json`. Read these three before doing anything else:

1. **[[Identity]]**: who the owner is, what they know, how to talk to them
2. **[[Hard-Rules]]**: the owner's non-negotiable rules
3. **[[Retrieval-Protocol]]**: how to find things without reading files

Index of everything: **[[00-MOC-Root]]**

## Retrieval order: do not skip tiers

```
injected note names  ->  00-MOC-Root.md  ->  ctx_search  ->  graphify query  ->  raw Read (last resort)
```

Tier 0 is the note names the `UserPromptSubmit` hook injects. They are vault notes only, and a
snippet is not the note, so follow the name into the file.

`ctx_search` reaches the vault only from a session launched **in** the vault: its `project`
parameter does not redirect it (context-mode 1.0.169). Anywhere else, use tier 0, then read the
named note.

Reading files to answer a question this vault already answers is the failure mode this whole
system exists to prevent. If tier 4 was needed, the vault has a gap: say so, and fix it.

## Layout

| Path | Contents |
|---|---|
| `00-Meta/` | Identity, rules, conventions, retrieval protocol, root MOC |
| `10-Repos/` | **Index only**: one page per repository, with a `checkout:` pointer. A repo's own `docs/` is its wiki |
| `20-Knowledge/` | Reusable knowledge, one concept per note |
| `30-Sessions/` | Daily logs, `YYYY/MM/YYYY-MM-DD.md`. A day starts at the configured rollover hour, not midnight |
| `40-Plans/` | Every plan, one folder each |
| `50-Ops/` | One note per commit (`Commits/`), monthly usage (`Usage/`), daily health (`Health/`), the decision ledger |
| `60-Decisions/` | ADRs: `Repos/<Remote-Name>/` per repo, `Identity/` for the vault. **Never** inside a checkout |
| `80-Assets/` | Attachments: pasted images, diagrams, brand masters |
| `90-Inbox/` | Unsorted capture, kept empty |

What each hook writes, and when: [[Hook-Lifecycle]]. Why it is built this way: [[Why-This-Exists]].
Setup from nothing: the knowledge-skeleton's `INSTALL.md`.

## Writing to the vault

Use `/brain new <kind>` and `/brain edit <kind>` rather than creating files by hand:
`structure · repo · docs · command · commit · task · hook · plan · decision`

Every note needs frontmatter. Schema in [[Conventions]].
