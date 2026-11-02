# Knowledge vault

An Obsidian vault that is Claude Code's long-term memory. It holds who the owner is, their rules,
an index of their repositories, what they have learned, and machine-written records of sessions,
commits and decisions. Hooks from [knowledge-skeleton](https://github.com/atlasatakahraman/knowledge-skeleton)
feed it and read from it, so an agent can answer a question about the owner's work **without
reading files**. Why it is built this way: [Why-This-Exists](00-Meta/Why-This-Exists.md).

Start at [`00-Meta/00-MOC-Root.md`](00-Meta/00-MOC-Root.md). If an answer isn't reachable from
there in two hops, the vault has a gap.

## First steps

1. Fill [`00-Meta/Identity.md`](00-Meta/Identity.md) and [`00-Meta/Hard-Rules.md`](00-Meta/Hard-Rules.md).
   Every `FILL:` comment is a placeholder: `grep -rn "FILL:" 00-Meta` lists what is left. Both load
   whole into every session, so this is the highest-value writing in the vault.
2. Add a page per repository with `/brain new repo`.
3. Replace the questions in [`00-Meta/retrieval-cases.json`](00-Meta/retrieval-cases.json) with
   ones this vault must always answer, each naming the note that answers it. `brain-doctor`'s
   `retrieval` check runs them every day.
4. Choose a licence for the notes, if they will ever be shared, and add it as `LICENSE.md`.

Installing the engine itself (hooks, config, graphify, context-mode) is the knowledge-skeleton's
`INSTALL.md`.

## Layout

| Path | Holds | Written by |
|---|---|---|
| [`00-Meta/`](00-Meta/) | Identity, Hard-Rules, Conventions, Retrieval-Protocol, Hook-Lifecycle, Why-This-Exists, Forward-Links, the root MOC, `retrieval-cases.json` | you; `brain-compile` adds rules |
| [`10-Repos/`](10-Repos/) | **An index only:** one folder note per repository, with a `checkout:` pointer. A repo's own `docs/` is its wiki | you |
| [`20-Knowledge/`](20-Knowledge/) | What you have learned, one concept per note | you; `brain-compile` |
| [`30-Sessions/`](30-Sessions/) | Daily logs, `YYYY/MM/YYYY-MM-DD.md`, split at the configured rollover hour | `brain-flush`; `/brain-log` |
| [`40-Plans/`](40-Plans/) | Every plan, one folder each | you |
| [`50-Ops/`](50-Ops/) | `Commits/`, `Usage/`, `Health/`, `decisions.jsonl` (the decision ledger); `hook-events.jsonl` and `brain-compile-state.json` are gitignored | the hooks |
| [`60-Decisions/`](60-Decisions/) | ADRs: `Repos/<Remote-Name>/` per repo, `Identity/` for the vault, hooks and agent | you; `brain-compile` |
| [`80-Assets/`](80-Assets/) | Attachments: pasted images, diagrams, brand masters | you |
| [`90-Inbox/`](90-Inbox/) | Unsorted capture, kept empty | you |
| `graphify-out/` | The knowledge graph (gitignored) | `brain-reindex` |
| `00-MOC-Sessions`, `00-MOC-Plans`, `00-MOC-Ops` | Generated hubs. Never edit by hand | `brain-hubs` |

Every hook, its event and its cost: [Hook-Lifecycle](00-Meta/Hook-Lifecycle.md).

## Daily use

**What happens by itself:**

- Session start: the vault fast-forwards if it is clean, and any `!!` line is shown.
- Each prompt: the names of matching vault notes are injected.
- Edits: the index and graph rebuild 90 s after the last edit.
- Commits in any repo under `devRoot`: one note each in `50-Ops/Commits/`.
- Every `AskUserQuestion` answer: appended to `50-Ops/decisions.jsonl` at the next flush.
- Writing a vault note: a missing `type`/`created` or a link to nothing is reported at once.
- Compaction, session end, and every 20 minutes of turns: the new part of the session is flushed
  into today's note.
- The first compaction or session end after a day's log is finished: that log is compiled into
  ADRs and knowledge.
- Once a day: the usage digest.

**What is yours:**

- **Commit with a body that says why.** The commit note copies the body verbatim.
- **Push.** The vault and the skeleton pull themselves at session start; neither pushes.
- **Review `90-Inbox/`** and file what's there.
- **Read the `!!` lines** at session start. See Troubleshooting.

## Commands

| Command | Does | Cost |
|---|---|---|
| `/brain new <kind>` · `/brain edit <kind>` | Create or edit a note. Kinds: `structure · repo · docs · command · commit · task · hook · plan · decision` | the session's tokens |
| `/brain new decision --ledger` | Walk the captured `AskUserQuestion` answers and promote each to an ADR or `not-a-decision` | the session's tokens |
| `/brain-log` | Write or append today's session note | the session's tokens |
| `/brain-usage` | This month's token/cost digest into `50-Ops/Usage/` | free |
| `/brain-commits` | Run the commit recorder over the whole month | free |
| `/brain-sync` | Rebuild graphs, re-index, prune phantom rows, verify links | free |
| `bun --bun ~/.claude/hooks/brain-doctor.mjs --pretty` | The health check | free |
| `bun --bun ~/.claude/hooks/brain-doctor.mjs --repair --record --pretty` | The daily sweep: rebuild derived artifacts, check, record a line in `50-Ops/Health/` | free |
| `bun --bun ~/.claude/hooks/brain-graph.mjs` | Rebuild the graph. `--force` if it shrank | free |
| `graphify query "<q>" --budget 1500` | Ask the graph how things connect | free |

`/graphify . --update` is the semantic pass and **costs tokens**. It is a deliberate act, not
maintenance.

## Troubleshooting

| You see | Means | Fix |
|---|---|---|
| `!! BRAIN FLUSH FAILING since …` (or `COMPILE`) | A background `claude -p` failed; the reason is in the line | Auth: run `claude`, then `/login`. The line clears on the next success |
| `!! FLUSH CANARY: …` | Sessions are captured but no daily note for 3+ days | Read the tail of `50-Ops/hook-events.jsonl`, then run `brain-flush` with `--dry-run` |
| `!! VAULT HEALTH FAIL (date): failing: …` | The last daily sweep failed | `brain-doctor --pretty` |
| `!! VAULT PULL skipped: …` | The vault has uncommitted changes, or cannot fast-forward | Commit or stash, then `git pull --ff-only` |
| `!! SKELETON PULL skipped: …` (or `failed`) | The skeleton checkout has uncommitted changes, or cannot fast-forward | Commit or stash there, then `git pull --ff-only` |
| `!! SKELETON x is behind the vault's pin y` | Another machine moved the vault to a newer skeleton; this one has not pulled it | `git -C <skeleton> pull --ff-only` |
| `!! SKELETON x is ahead of the vault's pin y` | The skeleton moved on; the vault is still written for the older one | Read the skeleton's changes since `y` (`git -C <skeleton> log vy..`), adapt the vault, then set `.skeleton.json` to `x` and commit it |
| `brain-doctor` FAIL in `vault-index` | Notes the index hasn't caught up with, or rows for files that are gone, or a CRLF note | `brain-doctor --repair`; `brain-prune.mjs --apply`; convert the note to LF |
| `brain-doctor` FAIL in `retrieval` | A question in `retrieval-cases.json` no longer returns its note | A renamed note, a CRLF note, or a search regression. `failed` lists each query and what it got |
| `brain-doctor` FAIL in `frontmatter` | A note lacks `type:` or `created:` | Add them ([Conventions](00-Meta/Conventions.md)) |
| `brain-doctor` FAIL in `links` | A `[[link]]` resolves to nothing | Fix it, or list it in `00-Meta/Forward-Links.md` |
| `brain-doctor` FAIL in `reach` | A note more than 2 hops from the root MOC (a record, 3) | Link it from its folder's MOC |
| `brain-doctor` FAIL in `commits` | A commit from the last 3 days has no note | `brain-commit.mjs --backfill <date>` |
| `brain-doctor` FAIL in `skeleton-version` | `~/.claude/hooks`, the skill or a command does not point into one knowledge-skeleton checkout, or `.skeleton.json` pins another version | Re-run the skeleton's `install.ts` (or step 4 of its `INSTALL.md`); for the pin, the two `!! SKELETON` rows above |
| The graph shrank | A rename or an ignore rule dropped files | [Conventions](00-Meta/Conventions.md) § Renaming; `brain-graph.mjs --force` |
