# Installing knowledge-skeleton

One command does all of it; every step it takes is also written out below, so a person or an agent
can do it by hand and get the same machine. The installer is safe to run again at any time: each
step checks first, and a step that is already done reports `ok`.

```bash
git clone https://github.com/atlasatakahraman/knowledge-skeleton ~/dev/knowledge-skeleton
bun ~/dev/knowledge-skeleton/install.ts --dry-run    # what it would do
bun ~/dev/knowledge-skeleton/install.ts              # do it
```

```powershell
git clone https://github.com/atlasatakahraman/knowledge-skeleton C:\dev\knowledge-skeleton
bun C:\dev\knowledge-skeleton\install.ts --vault C:\obsidian\root --dev C:\dev
```

| Flag | Default | |
|---|---|---|
| `--vault <path>` | `config.json`'s, else `~/knowledge` | The vault. No spaces: `CLAUDE.md` imports cannot hold one |
| `--dev <path>` | `config.json`'s, else `~/dev` | Where checkouts live, one folder per GitHub remote |
| `--machine "<text>"` | empty | Free text the SessionStart banner opens with: hardware, dual-boot, dotfiles |
| `--from-template` / `--adopt` | adopt a non-empty path, else template | A new vault from `template/`, or an existing one (it must have `00-Meta/00-MOC-Root.md`) |
| `--dry-run` | | Print each step, change nothing |

It exits 0 only when every step and `brain-doctor` pass. On a FAIL it says what to fix; fix it and
run it again.

## For an agent

- Run `--dry-run` first and show the output to the person before the real run.
- Never edit a hook in `~/.claude/settings.json` that is not a `brain-*` command, and never commit
  the vault for them. The first commit of a template vault is the installer's, and only when git
  has an identity.
- A FAIL line is the answer to report: quote it, do not work around it.
- If `claude`, `uv` or `git` is missing, the installer stops with the command that installs it.
  Installing one is the person's call: ask first.

## What it does, by hand

Paths below are Linux; the Windows form follows each block where it differs. `<skeleton>` is the
checkout, `<vault>` the vault, `<dev>` the checkouts folder.

### 1. Prerequisites

`bun`, `git`, `uv` (for graphify) and `claude` (Claude Code), all on `PATH`.

| Tool | Linux | Windows |
|---|---|---|
| bun | `curl -fsSL https://bun.sh/install \| bash` | `powershell -c "irm bun.sh/install.ps1 \| iex"` |
| git | your package manager (`pacman -S git`, `apt install git`) | `winget install Git.Git` |
| uv | `curl -LsSf https://astral.sh/uv/install.sh \| sh` | `powershell -c "irm https://astral.sh/uv/install.ps1 \| iex"` |
| claude | `curl -fsSL https://claude.ai/install.sh \| bash` | `irm https://claude.ai/install.ps1 \| iex` |

`CLAUDE_CONFIG_DIR` must be unset: the hooks read `~/.claude`.

### 2. The vault

A new one from the template, or an existing clone (then skip to `core.fileMode`):

```bash
cp -r <skeleton>/template <vault>
echo "{\"version\":\"$(jq -r .version <skeleton>/package.json)\"}" > <vault>/.skeleton.json
git -C <vault> init -b main && git -C <vault> add -A && git -C <vault> commit -m "chore: new vault from knowledge-skeleton"
git -C <vault> config core.fileMode false
```

`.skeleton.json` pins the skeleton version the vault is written for; each session start compares it
with the checkout. An adopted vault without one is not checked: commit the same file there once.

`core.fileMode false`: Obsidian on Linux rewrites `.obsidian/*.json` with mode 755, and a mode-only
change blocks the SessionStart pull. The vault tracks no executables.

### 3. config.json

`~/.config/knowledge/config.json` (`$XDG_CONFIG_HOME/knowledge/` when set);
`%APPDATA%\knowledge\config.json` on Windows; `$KNOWLEDGE_CONFIG` overrides both.

```json
{ "vault": "/home/me/knowledge", "devRoot": "/home/me/dev", "os": "arch",
  "machine": "Free text the SessionStart banner opens with.", "rolloverHour": 5 }
```

`os` is what logs and commit notes are stamped with. `rolloverHour` is when a daily note starts,
local time. Create `devRoot` if it does not exist. Check what the hooks see:
`bun --bun <skeleton>/hooks/skeleton-config.mjs`.

### 4. Links into `~/.claude`

```bash
ln -s <skeleton>/hooks ~/.claude/hooks
mkdir -p ~/.claude/skills ~/.claude/commands
ln -s <skeleton>/skills/brain ~/.claude/skills/brain
ln -s <skeleton>/commands/brain-*.md ~/.claude/commands/
```

```powershell
New-Item -ItemType Junction -Path $HOME\.claude\hooks -Target C:\dev\knowledge-skeleton\hooks
New-Item -ItemType Junction -Path $HOME\.claude\skills\brain -Target C:\dev\knowledge-skeleton\skills\brain
Get-ChildItem C:\dev\knowledge-skeleton\commands\brain-*.md | ForEach-Object {
  New-Item -ItemType SymbolicLink -Path "$HOME\.claude\commands\$($_.Name)" -Target $_.FullName }
```

A file symlink on Windows needs Developer Mode (Settings > For developers) or an elevated shell; a
junction needs neither. Move an existing `~/.claude/hooks` folder aside first rather than deleting it.

### 5. The hook block in `~/.claude/settings.json`

[`settings.hooks.json`](settings.hooks.json) is the block. Merge each event's entries into the
`hooks` key, with `{BUN}` replaced by bun's absolute path (`command -v bun`,
`(Get-Command bun).Source`) and `{HOOKS}` by `~/.claude/hooks` written out absolute. Use forward
slashes on Windows too. Keep every other hook; plugins add their own. On Linux, once:

```bash
cd <skeleton> && sed "s#{BUN}#$(command -v bun)#g; s#{HOOKS}#$HOME/.claude/hooks#g" settings.hooks.json > /tmp/hooks.json
jq --slurpfile b /tmp/hooks.json '.hooks = reduce ($b[0] | to_entries[]) as $e (.hooks // {}; .[$e.key] = ((.[$e.key] // []) + $e.value))' \
  ~/.claude/settings.json > /tmp/settings.json && mv /tmp/settings.json ~/.claude/settings.json
```

Run that once only: it appends. Claude Code reads hooks at session start, so open a new session after.

### 6. Identity and Hard-Rules in `~/.claude/CLAUDE.md`

Both load whole into every session. Add, one import per line:

```markdown
@/home/me/knowledge/00-Meta/Identity.md
@/home/me/knowledge/00-Meta/Hard-Rules.md
```

Never move either behind a link or into a hook: a hook's context is cut to a 2,000-char preview past
10,000 chars. `brain-doctor`'s `priming` check guards it.

### 7. Compile state

`brain-compile` turns each finished daily log into notes once, remembered by hash in
`<vault>/50-Ops/brain-compile-state.json` (untracked, per machine). An adopted vault has no state on
a new machine, so the first session would recompile every log it ever had. Mark them done:

```bash
cd <skeleton>/hooks && bun --bun -e '
import { createHash } from "node:crypto"; import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path"; import { CONFIG, FOLDERS } from "./skeleton-config.mjs";
const file = join(CONFIG.vault, FOLDERS.ops, "brain-compile-state.json");
const state = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
for (const log of new Bun.Glob("*/*/*.md").scanSync({ cwd: join(CONFIG.vault, FOLDERS.sessions), absolute: true }))
  state[log] ??= createHash("sha256").update(readFileSync(log, "utf8")).digest("hex");
writeFileSync(file, JSON.stringify(state, null, 1));'
```

This marks today's log too; delete its line if today's session should still be compiled.

### 8. graphify (MIT)

```bash
uv tool install "graphifyy[mcp]"
```

The `[mcp]` extra is required: without it `graphify-mcp` dies on import and Claude Code lists the
server as failed, while every doctor check still passes.

### 9. context-mode (Elastic License 2.0)

Installed from its upstream marketplace, never copied into this repo:

```bash
claude plugin marketplace add mksglu/context-mode
claude plugin install context-mode@context-mode
```

### 10. First index and graph

```bash
bun --bun ~/.claude/hooks/brain-doctor.mjs --repair --pretty
```

It records commits made outside Claude, regenerates the hub MOCs, indexes the vault into
context-mode and builds the graph (`graphify-out/merged-graph.json`). All of it is derived; run it
whenever a check fails.

### 11. graphify MCP, local scope

From inside the vault, so only sessions launched there see it:

```bash
cd <vault> && claude mcp add --scope local graphify -- "$(command -v graphify-mcp)" <vault>/graphify-out/merged-graph.json
claude mcp list    # graphify: ... ✔ Connected
```

### 12. Check

```bash
bun --bun ~/.claude/hooks/brain-doctor.mjs --pretty
```

Every check PASS (`hygiene` may WARN). Then, for a new vault, fill the `<!-- FILL: … -->` placeholders
in `00-Meta/Identity.md` and `00-Meta/Hard-Rules.md` and replace the questions in
`00-Meta/retrieval-cases.json` with ones the vault must always answer.

## Updating

The skeleton fast-forwards itself at each session start when its tree is clean; when its
`settings.hooks.json` changed, that session says to rerun `install.ts`. When its version moves past
the vault's `.skeleton.json`, adapt the vault and bump the pin. The tools never update themselves:

```bash
uv tool upgrade graphifyy
claude plugin update context-mode@context-mode
```

## Removing

Delete the links from step 4, the `brain-*` entries from `settings.json`, the two imports from
`CLAUDE.md`, `config.json`, and the graphify MCP (`claude mcp remove --scope local graphify`, from
the vault). The vault stays a folder of Markdown notes.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `graphify: ✘ Failed to connect` in `claude mcp list` | graphify without the `[mcp]` extra: `uv tool install --reinstall "graphifyy[mcp]"` |
| `link FAIL ... Developer Mode` on Windows | A file symlink needs Developer Mode or an elevated shell |
| `ignores` FAIL on a fresh clone | `.graphifyignore` names a folder git did not bring: an empty folder needs a `.gitkeep` |
| `links` FAIL on a fresh clone, pointing at a date | A record links a daily log that was never committed: commit it, or let the flush write it |
| `!! SKELETON x is behind the vault's pin y` at session start | The other machine moved the vault to a newer skeleton: `git -C <skeleton> pull --ff-only` |
| `!! SKELETON x is ahead of the vault's pin y` | The skeleton moved on: read its changes since `y`, adapt the vault, set `.skeleton.json` to `x`, commit |
| `pin FAIL` from the installer | The adopted vault pins another version: check out that one, or adapt the vault and bump the pin |
| Every hook errors with `no knowledge config` | Step 3 is missing, or `$KNOWLEDGE_CONFIG` points somewhere empty |
