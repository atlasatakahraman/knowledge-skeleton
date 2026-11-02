# brain: repo

A thin pointer page in `10-Repos/` carrying the completion-gate `status`, or a whole new project.

## new — page for an existing repo

The repo's own `docs/` is its documentation. This page is an **index**, never a copy.

```yaml
---
type: repo
project: <slug>
tags: [...]
aliases: [Other Name]        # if the folder name differs from the project name
created: <today>
updated: <today>
status: in-progress          # completion gate reads this
checkout: <Remote-Name>      # relative to devRoot; brain-verify resolves it per machine
docs: <Remote-Name>/docs     # optional, same rule
---
```

Never an absolute path in `checkout:`/`docs:`: the checkouts folder differs per machine, and
`brain-verify` fails on one.

Sections that earn their place:
- What it is, and **where the code is** (path, remote, branch, license)
- **Its own docs** — a table pointing into the repo, not restating it
- Stack, compared against the other repos where that comparison is informative
- **Known gaps — don't chase these** ← the highest-value section. Stops re-investigation of
  things already decided against.

Then link from `10-Repos/00-MOC-Repos.md`.

## Always — the asset folder

Every repo gets `80-Assets/Repos/<Repo-Name>/`, named exactly as the `10-Repos/` directory:

```bash
mkdir -p "80-Assets/Repos/<Repo-Name>" && touch "80-Assets/Repos/<Repo-Name>/.gitkeep"
```

Masters only — the `.svg` a logo is drawn in, the source of a README banner, the icon set an
app builds `.ico`/`.icns` from. The **exported** artifact still ships inside the repo, because
GitHub renders a README from the repo's own tree; a vault-hosted logo 404s for everyone else.
Rules in `80-Assets/00-MOC-Assets.md`.

## new — scaffolding an actual project

Read `00-Meta/Hard-Rules.md` first, in full. It governs what a new project starts with: package
manager, licence (the `LICENSE` file and every manifest's licence field), components, branching,
and when tests and CI arrive.

- `CLAUDE.md` following the layout `00-Meta/Conventions.md` names.
- Record the project's first decisions as ADRs in `60-Decisions/Repos/<Repo-Name>/`, not in the repo.

## edit

- Flip `status: complete` only the way `00-Meta/Hard-Rules.md` describes, if it describes a
  completion gate. Never ask about completion unprompted.
