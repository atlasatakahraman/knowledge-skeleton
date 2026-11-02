---
type: moc
project: knowledge
tags: [moc, decisions, adr]
created: 2026-11-02
updated: 2026-11-02
status: active
---

# Decisions

Every architectural decision record, for every repo, in one place. **Decisions live here, not
inside the repos**: in a checkout they would be invisible to the vault's history, index and graph.

**Where a decision goes:** about one repo → `Repos/<Remote-Name>/`, named with the remote's exact
casing. About the vault, its hooks, or how the agent behaves → `Identity/`.

```
60-Decisions/Repos/<Remote-Name>/<NNNN>-<slug>.md
60-Decisions/Identity/<NNNN>-<slug>.md
```

`<NNNN>` is a per-folder sequence from `0001`. Record one with `/brain new decision`; promote the
answers the flush captured with `/brain new decision --ledger`.

## Records

| ADR | Scope | Decision |
|---|---|---|

## Related

[[00-MOC-Root]] · [[Conventions]]
