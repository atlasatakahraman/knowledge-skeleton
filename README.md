# knowledge-skeleton

The engine behind a Claude Code knowledge vault: an Obsidian vault of plain Markdown notes that
every session reads before it answers and writes back to as it works. Hooks log sessions, record
commits, inject relevant note names into each prompt, promote decisions, and keep a search index
and a link graph current. The vault itself holds notes only and stays private.

```
hooks/          brain-*.mjs   Claude Code hooks and their tools, run with `bun --bun`
skills/brain/                 /brain new|edit <kind> - writes notes in the vault's conventions
commands/       brain-*.md    /brain-commits /brain-log /brain-sync /brain-usage
template/                     the empty vault: folders, MOCs, conventions, system docs, Identity and
                              Hard-Rules stubs (`FILL:` marks each placeholder)
install.ts                    sets a machine up: prerequisites, graphify, context-mode, vault, config,
                              links, hook block, CLAUDE.md imports, first index and graph
INSTALL.md                    the same steps by hand, for a person or an agent
settings.hooks.json           the hook block install.ts merges into ~/.claude/settings.json
```

## Install

```bash
git clone https://github.com/atlasatakahraman/knowledge-skeleton ~/dev/knowledge-skeleton
bun ~/dev/knowledge-skeleton/install.ts --dry-run && bun ~/dev/knowledge-skeleton/install.ts
```

A new vault comes from `template/` at `~/knowledge`; an existing one is adopted. Safe to run again:
a step that is done reports `ok`. Flags, Windows, and every step by hand: [INSTALL.md](INSTALL.md).

## After a new vault

Fill `00-Meta/Identity.md` and `00-Meta/Hard-Rules.md` (`grep -rn "FILL:" ~/knowledge/00-Meta`
lists what is left) and replace the questions in `00-Meta/retrieval-cases.json` with ones the vault
must always answer: `brain-doctor`'s `retrieval` check runs them. The template's own `README.md`
has the rest.

## Requirements

`bun`, `git`, Claude Code (`claude`), and `uv` for graphify.

## Per-machine config

The hooks read their paths from one untracked file, written once per machine:

- Linux / macOS: `~/.config/knowledge/config.json` (or `$XDG_CONFIG_HOME/knowledge/config.json`)
- Windows: `%APPDATA%\knowledge\config.json`
- Any OS: `$KNOWLEDGE_CONFIG` overrides both

```json
{ "vault": "/home/me/knowledge", "devRoot": "/home/me/dev", "os": "linux",
  "machine": "Free text the SessionStart banner opens with.", "rolloverHour": 5 }
```

`vault` and `devRoot` are required. `rolloverHour` (default 5) is when a daily note starts, local
time. `install.ts` writes it. Check what the hooks see with `bun --bun hooks/skeleton-config.mjs`.

## Sync

Each session start fast-forwards the vault and this checkout, each only when its tree is clean,
and never pushes. A checkout on a detached HEAD (a tag) is pinned on purpose and left alone.

The vault's `.skeleton.json` (`{"version":"0.2.0"}`) pins the skeleton version its notes are
written for; `install.ts` writes it into a new vault. When the running checkout is another
version, the session opens with one line saying which side moves, and `brain-doctor`'s
`skeleton-version` fails. A vault without the file is not checked.

Every version bump in `package.json` is tagged `v<version>` on the commit that makes it, so
`git log v<pin>..` lists what changed since the vault's pin.

## Third-party tools

Installed from their own upstreams, never vendored here:

- [graphify](https://github.com/safishamsi/graphify) (`graphifyy[mcp]` on PyPI) - MIT. Builds the link graph
  and serves it over MCP.
- [context-mode](https://github.com/mksglu/context-mode) - Elastic License 2.0. Full-text index and
  sandboxed tools. The hooks degrade without it; the doctor's index and retrieval checks need it.

## License

GPL-3.0-only. See `LICENSE`.
