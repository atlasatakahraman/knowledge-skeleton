---
type: doc
project: knowledge
tags: [hooks, lifecycle, brain, context-mode, operations]
created: 2026-11-02
updated: 2026-11-02
status: active
---

# Hook lifecycle

Every hook that touches this vault: its event, what it does, what it writes, what it costs, and
what notices when it breaks. The rationale is in [[Why-This-Exists]].

The hooks live in the knowledge-skeleton checkout's `hooks/`; `~/.claude/hooks` is a link to it,
and `brain-doctor`'s `skeleton-version` check fails when it is not. Every hook runs as
`bun --bun ~/.claude/hooks/<hook>` and reads its paths from the machine's `config.json`.
`.skeleton.json` at the vault root pins the skeleton version the vault is written for:
`brain-session` says so at session start when the checkout is another version, and
`skeleton-version` fails.

Every brain hook **fails silent at runtime**: it exits 0 and never blocks the session. The last
column says what notices a failure.

## Registered hooks

| Event | Matcher | Hook | What it does | Writes | Cost | When it fails |
|---|---|---|---|---|---|---|
| `SessionStart` | — | `brain-session.mjs` | Fast-forwards the vault and the skeleton checkout, each only when clean (a checkout on a detached HEAD is pinned on purpose and left alone), and says in one line when the skeleton is not the version `.skeleton.json` pins. Then injects what changes per session: the current OS, the retrieval order, the flush canary, any recorded `claude -p` failure, the health alarm, and how many captured decisions wait for promotion. Identity and Hard-Rules are **not** injected here: `~/.claude/CLAUDE.md` imports both whole, because a hook's context past 10,000 chars is cut to a preview. Re-runs a flush that was killed when the app closed | — | ~2,000 chars, once per session; must stay ≤ 10,000 | `brain-doctor` § priming, § skeleton-version |
| `UserPromptSubmit` | — | `brain-inject.mjs` | Names of vault notes matching the prompt, from the vault index only | — | ≤ 1,200 chars on a hit, 0 otherwise | `brain-doctor` § retrieval, which runs the same search |
| `PreCompact`, `SessionEnd` | — | `brain-capture.mjs` | Logs the event, then detaches compile, usage and flush (below). Timeout 10 s | `50-Ops/hook-events.jsonl` | free itself | the flush canary |
| `Stop`, `SubagentStop` | — | `brain-capture.mjs` | The same, **async**, at most once per 20 min per session, flush only | same | same | same |
| ↳ detached | | `brain-flush.mjs` | Takes the session's lock, appends every `AskUserQuestion` answer to the decision ledger, then sends what is new since the last flush to `claude -p --model haiku` and appends what is worth keeping to the daily note | `30-Sessions/YYYY/MM/YYYY-MM-DD.md`, `50-Ops/decisions.jsonl` | **one haiku call** per capture with new content | `!! BRAIN FLUSH FAILING` at the next session start; the flush canary after 3 days |
| ↳ detached | | `brain-compile.mjs` | Promotes a **finished** daily log into ADRs, knowledge and rules, links each new note from its MOC, and commits only its own changes. Does nothing while `~/.claude/hooks/.state/compile.disabled` exists | `60-Decisions/`, `20-Knowledge/`, `00-Meta/`, `50-Ops/brain-compile-state.json` | **one sonnet call**, once per finished day | `!! BRAIN COMPILE FAILING` at the next session start |
| ↳ detached | | `brain-usage.mjs` | The month's token/cost digest, once a day | `50-Ops/Usage/usage-YYYY-MM.md` | free | nothing: the file's date goes stale |
| `PostToolUse` | `Edit\|Write` | `brain-reindex.mjs` | On a vault note, at once: the write-time check (frontmatter, links), reported back, never blocking. Then, 90 s after the last edit: repo docs and the vault into the context-mode index, then the graph (graphify, the wikilink bridge, the merge) | `graphify-out/`, the index | free | `brain-doctor` § vault-index, § graph-links |
| `PostToolUse`, `PostToolUseFailure` | `Bash` (and `PowerShell` on Windows) | `brain-commit.mjs` | **Async**, on any command naming `git` or `commit`. Writes one note per commit of the last 3 days that has none, in the vault and every repo under `devRoot`, then schedules a reindex | `50-Ops/Commits/YYYY-MM/…`, `commits-YYYY-MM.md` | free | `brain-doctor` § commits; `--repair` backfills |

A background hook whose `claude -p` fails records the reason in the temp directory and clears it
on its next success; `brain-session` turns each record into a `!! BRAIN <TAG> FAILING` line.
`brain-capture` and `brain-compile` exit when `CLAUDE_INVOKED_BY` is set, so a flush's own
`claude -p` cannot re-fire capture.

## CLI-only tools

Not registered on any event. Run them by hand, or from `/brain-sync`. All run as
`bun --bun ~/.claude/hooks/<tool>`.

| Tool | Flags | Does |
|---|---|---|
| `brain-doctor.mjs` | none → JSON · `--pretty` · `--repair` · `--record` · `--only <ids>` | Zero-token health check, thirteen checks. **Fail:** `vault-index`, `retrieval` (the questions in `00-Meta/retrieval-cases.json` return their notes), `sessions`, `auth`, `frontmatter`, `links`, `reach`, `ignores`, `commits`, `priming`, `graph-links`, `skeleton-version`. **Warn:** `hygiene`. `--repair` rebuilds derived artifacts only and never edits a note; `--record` writes today's line in `50-Ops/Health/`. Always exits 0 |
| `brain-graph.mjs` | `--force` | Rebuild the graph by hand: graphify, the wikilink bridge, the merge |
| `brain-hubs.mjs` | none | Regenerate the generated hubs from the folders. Never edit a hub by hand |
| `brain-verify.mjs` | none | Every `[[wikilink]]` and every `checkout:` pointer resolves. Exits 1 on a break |
| `brain-prune.mjs` | none → report · `--apply` | Drop index entries whose source file is gone, after a backup |
| `brain-commit.mjs` | `--backfill YYYY-MM-DD` · `--dry-run` | The commit recorder, from a date, idempotent |
| `brain-flush.mjs` | `<session-id> <cwd> [--date YYYY-MM-DD] [--dry-run]` | A flush by hand; `--date` backfills a missed note |
| `brain-compile.mjs` | `--force` · `--dry-run` | `--force` compiles today's still-open log |
| `brain-usage.mjs` | `--days N` · `--month YYYY-MM` · `--projects` · `--blocks` | Token/model/cost digest from the transcripts |
| `brain-ledger.mjs` | `list` · `add` · `promote` | The decision ledger; the `/brain` skill drives it |
| `skeleton-config.mjs` | none · `<key>` | Print the config the hooks resolved |

## context-mode's own hooks

context-mode registers its own hooks through its plugin (`PreToolUse` routing nudges, `PostToolUse`
event capture, `PreCompact`, `UserPromptSubmit`, `SessionStart`, `Stop`), and may deploy
`context-mode-cache-heal.mjs` into `~/.claude/hooks`. They are not part of this engine; their
session databases are what `brain-flush` reads.

## Change log

- 2026-11-02: the vault starts from the knowledge-skeleton template.

## Related

[[Why-This-Exists]] · [[README]] · [[Retrieval-Protocol]] · [[Hard-Rules]] · [[00-MOC-Root]]
