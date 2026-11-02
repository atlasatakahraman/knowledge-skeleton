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
```

## Starting a vault from the template

```bash
cp -r ~/dev/knowledge-skeleton/template ~/knowledge && git -C ~/knowledge init
```

Then fill `00-Meta/Identity.md` and `00-Meta/Hard-Rules.md` (`grep -rn "FILL:" ~/knowledge/00-Meta`
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
time. Check what the hooks see with `bun --bun hooks/skeleton-config.mjs`.

## Linking into Claude Code

```bash
ln -s ~/dev/knowledge-skeleton/hooks ~/.claude/hooks
ln -s ~/dev/knowledge-skeleton/skills/brain ~/.claude/skills/brain
mkdir -p ~/.claude/commands && ln -s ~/dev/knowledge-skeleton/commands/brain-*.md ~/.claude/commands/
```

```powershell
New-Item -ItemType SymbolicLink -Path $HOME\.claude\hooks -Target C:\dev\knowledge-skeleton\hooks
New-Item -ItemType SymbolicLink -Path $HOME\.claude\skills\brain -Target C:\dev\knowledge-skeleton\skills\brain
Get-ChildItem C:\dev\knowledge-skeleton\commands\brain-*.md | ForEach-Object {
  New-Item -ItemType SymbolicLink -Path "$HOME\.claude\commands\$($_.Name)" -Target $_.FullName }
```

Then register the hooks in `~/.claude/settings.json`. An installer that does all of this is on the
way; until then `bun --bun hooks/brain-doctor.mjs --pretty` says what is missing.

## Third-party tools

Installed from their own upstreams, never vendored here:

- [graphify](https://github.com/safishamsi/graphify) (`graphifyy` on PyPI) - MIT. Builds the link graph.
- [context-mode](https://github.com/mksglu/context-mode) - Elastic License 2.0. Full-text index and
  sandboxed tools. The hooks degrade without it; the doctor's index and retrieval checks need it.

## License

GPL-3.0-only. See `LICENSE`.
