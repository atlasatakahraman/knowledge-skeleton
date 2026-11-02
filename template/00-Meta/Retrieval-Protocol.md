---
type: rules
project: knowledge
tags: [retrieval, context, graphify, context-mode]
created: 2026-11-02
updated: 2026-11-02
status: active
---

# Retrieval Protocol

How to find something in this vault **without** reading files. Follow the tiers in order. The point
of the vault is to cut context, and a vault you grep is just a folder.

## The tiers

| # | Tier | Use for | Cost |
|---|---|---|---|
| 0 | The note names `brain-inject` adds to each prompt | Breadcrumbs: follow a name into tier 1 or 4 | free |
| 1 | `00-MOC-Root.md` → the `00-MOC-*.md` it points to → the note | "where is X". Most questions end here | ~free |
| 2 | `ctx_search(queries: [...])` | "what did I write about X" | very low |
| 3 | `graphify query "<q>" --budget 1500` | "how does X connect to Y" | low, bounded |
| 4 | `Read` of **one named file** | Only when 1–3 failed | unbounded |

**Stop-check:** about to `Read`, `ls`, `find` or `grep` a vault path without having run tiers 1–3?
That is the violation. Go back to the MOC. If tier 4 was needed, the vault has a gap: fix it.

### 0. Injected note names

`brain-inject` searches the vault's full-text index on every prompt and adds the names of matching
vault notes, with a snippet. A snippet is not the note.

### 1. The MOCs

[[00-MOC-Root]] links every folder's `00-MOC-*.md`, and every note is at most two hops from it
([[Conventions]] § Reach). Cheap, current, and it says where things live.

### 2. `ctx_search`: full-text search

context-mode's FTS5 index over the vault, plus captured session memory. Batch every question into
one call: `ctx_search(queries: ["q1", "q2"])`. `sort: "timeline"` recalls prior sessions.

**It searches the project the session was launched in.** Its `project` parameter does not redirect
it (measured on context-mode 1.0.169): from a session launched outside the vault it returns that
session's own events, never vault notes. Outside the vault, use tier 0, then read the named note.

### 3. `graphify`: relationships

When the question is how things **connect**, not what they are called. The graph is built from the
AST and the wikilinks, with no model and no tokens.

```bash
graphify query "how does a request reach the cache?" --budget 1500
graphify explain "SomeNode"
graphify path "A" "B"
graphify god-nodes --top 10             # the hubs
```

Output is capped by `--budget` and says so when it truncates: raise the budget or narrow the
question rather than re-running blind.

The same graph is served as an MCP server, registered **per machine at local scope**, never in a
shared `.mcp.json` (the binary and vault paths differ per machine):

```bash
claude mcp add graphify -s local -- graphify-mcp <vault>/graphify-out/merged-graph.json
```

Use absolute paths with forward slashes. Verify by handshake, not by the binary existing:
`graphify-mcp` without its `mcp` Python package exits at once and the client reports only
`CONNECTION_CLOSED` (`uv tool install graphifyy --with mcp` fixes it).

### 4. `Read`

Once a tier has **named** the file, `Read` is right: most notes are a few KB. Never a directory
sweep. Above ~4 KB, when the content will be filtered or counted rather than edited,
`ctx_execute_file` keeps the raw bytes out of context.

## Keeping it honest

The graph is a snapshot. A stale graph is worse than none: it answers confidently with old truth.
`brain-reindex` rebuilds index and graph 90 s after the last edit, and `brain-doctor` checks both.

| Command | Covers | Cost |
|---|---|---|
| `bun --bun ~/.claude/hooks/brain-graph.mjs` | graphify (AST) + the wikilink bridge + the merge | **free** |
| `/graphify . --update` | the semantic pass over docs and images | **tokens**: a deliberate act, never routine |

Use `brain-graph.mjs`, not a bare `graphify update .`: graphify drops cross-folder wikilinks, and
the bridge adds them back. **graphify reads `.gitignore` as well as `.graphifyignore`**: a rule
that hides files from git hides them from the graph too, silently.

## Related

[[Identity]] · [[Hard-Rules]] · [[Conventions]] · [[00-MOC-Root]]
