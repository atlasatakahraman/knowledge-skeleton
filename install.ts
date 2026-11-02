// install.ts - set knowledge-skeleton up on this machine. Runtime: bun (`bun install.ts`).
// Plan: [[2026-11-01-knowledge-skeleton]] Stage 4. INSTALL.md has every step by hand, in this order.
//
//   bun install.ts                       vault ~/knowledge, checkouts ~/dev (or what config.json says)
//   ... --vault <path> --dev <path>      somewhere else
//   ... --machine "<text>"               what the SessionStart banner opens with
//   ... --from-template | --adopt        force one: a new vault from template/, or an existing vault.
//                                        Default: adopt a non-empty path, else the template
//   ... --dry-run                        say what each step would do, change nothing
//
// Safe to run twice: every step checks before it writes, and a second run reports `ok` for each.
// It never deletes: a real ~/.claude/hooks directory, a file where a link belongs, and settings.json
// before a change are kept beside the original as `<name>.pre-skeleton-<stamp>`.
// It installs graphify and context-mode when missing and never updates either: updates are opt-in.
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const ROOT = import.meta.dir;
const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const WIN = process.platform === "win32";
const CLAUDE = join(homedir(), ".claude");
const HOOKS = join(CLAUDE, "hooks");
const STAMP = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);

// ---- arguments -----------------------------------------------------------------------------------

const argv = process.argv.slice(2);
const KNOWN = new Set(["--vault", "--dev", "--machine", "--from-template", "--adopt", "--dry-run", "--help", "-h"]);
const die = (msg: string): never => {
  process.stderr.write(`install: ${msg}\n`);
  process.exit(1);
};
if (argv.includes("--help") || argv.includes("-h")) {
  process.stdout.write(readFileSync(import.meta.path, "utf8").split("\n").slice(3, 10).map((l) => l.slice(3)).join("\n") + "\n");
  process.exit(0);
}
for (let i = 0; i < argv.length; i++) {
  if (!KNOWN.has(argv[i])) die(`unknown argument ${argv[i]} (see --help)`);
  if (["--vault", "--dev", "--machine"].includes(argv[i])) i++;
}
const opt = (name: string) => {
  const i = argv.indexOf(name);
  if (i === -1) return null;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : die(`${name} wants a value`);
};
const dry = argv.includes("--dry-run");
if (argv.includes("--from-template") && argv.includes("--adopt")) die("--from-template and --adopt do not mix");
const expand = (p: string) => resolve(p.replace(/^~(?=[\\/]|$)/, homedir()));
const fwd = (p: string) => p.replace(/\\/g, "/");

// ---- report --------------------------------------------------------------------------------------

let failed = false;
const line = (status: string, step: string, detail = "") => {
  if (status === "FAIL") failed = true;
  console.log(`  ${status.padEnd(6)} ${step.padEnd(16)} ${detail}`);
};
/** `set` when this run changed something, `would` in a dry run. */
const changed = () => (dry ? "would" : "set");

function sh(cmd: string, args: string[], cwd?: string) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", windowsHide: true });
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || r.error?.message || "").trim() };
}
const readJson = (file: string) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};
/** Move a real file or directory out of the way, never delete it. */
const keepAside = (path: string) => {
  const to = `${path}.pre-skeleton-${STAMP}`;
  renameSync(path, to);
  return to;
};

// ---- 1. prerequisites ----------------------------------------------------------------------------

if (process.env.CLAUDE_CONFIG_DIR) die("CLAUDE_CONFIG_DIR is set; the hooks read ~/.claude and would not see that directory. Unset it and rerun.");

const PREREQS: Record<string, { linux: string; windows: string }> = {
  git: { linux: "your package manager (pacman -S git, apt install git)", windows: "winget install Git.Git" },
  uv: { linux: "curl -LsSf https://astral.sh/uv/install.sh | sh", windows: 'powershell -c "irm https://astral.sh/uv/install.ps1 | iex"' },
  claude: { linux: "curl -fsSL https://claude.ai/install.sh | bash", windows: "irm https://claude.ai/install.ps1 | iex" },
};
const bin: Record<string, string> = {};
const missing = Object.keys(PREREQS).filter((name) => !(bin[name] = Bun.which(name) ?? ""));
console.log(`knowledge-skeleton ${PKG.version} install${dry ? " (dry run)" : ""}\n`);
if (missing.length) {
  for (const name of missing) line("FAIL", "prerequisites", `${name} is not on PATH. Install: ${PREREQS[name][WIN ? "windows" : "linux"]}`);
  die("install the missing tools, open a new shell, rerun");
}
line("ok", "prerequisites", `bun ${Bun.version} · ${Object.keys(PREREQS).join(" · ")}`);

// ---- 2. config: where things go ------------------------------------------------------------------

// Mirrors CONFIG_PATH in hooks/skeleton-config.mjs, which cannot be imported before the file exists.
const CONFIG_PATH =
  process.env.KNOWLEDGE_CONFIG ||
  (WIN
    ? join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "knowledge", "config.json")
    : join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "knowledge", "config.json"));
const existing = readJson(CONFIG_PATH) ?? {};
const VAULT = expand(opt("--vault") ?? existing.vault ?? "~/knowledge");
const DEV = expand(opt("--dev") ?? existing.devRoot ?? "~/dev");
// Claude Code's @import and brain-doctor's `priming` check both read a path up to the first space.
if (/\s/.test(VAULT)) die(`the vault path has a space in it (${VAULT}); ~/.claude/CLAUDE.md cannot import from it`);

const osTag = () => {
  if (WIN) return "windows";
  if (process.platform !== "linux") return process.platform;
  return /^ID=["']?([\w-]+)/m.exec(existsSync("/etc/os-release") ? readFileSync("/etc/os-release", "utf8") : "")?.[1] ?? "linux";
};

// ---- 3. vault ------------------------------------------------------------------------------------

const nonEmpty = existsSync(VAULT) && readdirSync(VAULT).length > 0;
const mode = argv.includes("--from-template") ? "template" : argv.includes("--adopt") ? "adopt" : nonEmpty ? "adopt" : "template";
if (mode === "template" && nonEmpty) die(`--from-template: ${VAULT} is not empty. Pick an empty path, or --adopt it`);
if (mode === "adopt" && !existsSync(join(VAULT, "00-Meta", "00-MOC-Root.md")))
  die(`${VAULT} has no 00-Meta/00-MOC-Root.md, so it is not a vault this engine knows. Pass --vault <empty path> for a new one`);

const git = (...a: string[]) => sh(bin.git, ["-C", VAULT, ...a]);
if (mode === "template") {
  if (dry) line("would", "vault", `copy template/ to ${VAULT}, git init`);
  else {
    mkdirSync(VAULT, { recursive: true });
    cpSync(join(ROOT, "template"), VAULT, { recursive: true });
    git("init", "-q", "-b", "main");
    // An identity is the user's to set; without one the vault stays uncommitted and says so.
    const who = git("config", "user.email").ok;
    if (who) {
      git("add", "-A");
      git("commit", "-q", "-m", `chore: new vault from knowledge-skeleton ${PKG.version}`, "-m", "Copied from the skeleton's template/ by install.ts. Fill the FILL: placeholders in 00-Meta next.");
    }
    line("set", "vault", `${VAULT} from template/${who ? `, committed ${git("rev-parse", "--short", "HEAD").out}` : " - not committed: set git user.name and user.email, then commit"}`);
  }
} else line("ok", "vault", `${VAULT} (adopted)`);

// Obsidian on Linux rewrites .obsidian/*.json as 755, and a mode-only change blocks SessionStart's pull.
if (existsSync(join(VAULT, ".git")) || (dry && mode === "template")) {
  if (existsSync(join(VAULT, ".git")) && git("config", "core.fileMode").out === "false") line("ok", "core.fileMode", "false");
  else {
    if (!dry) git("config", "core.fileMode", "false");
    line(changed(), "core.fileMode", "false (Obsidian's mode-only rewrites would block the pull)");
  }
} else line("WARN", "core.fileMode", `${VAULT} is not a git repository; sync between machines needs one`);

// ---- 4. config.json ------------------------------------------------------------------------------

const config = {
  ...existing,
  vault: VAULT,
  devRoot: DEV,
  os: existing.os || osTag(),
  machine: opt("--machine") ?? existing.machine ?? "",
  rolloverHour: existing.rolloverHour ?? 5,
};
if (JSON.stringify(config) === JSON.stringify(existing)) line("ok", "config", CONFIG_PATH);
else {
  if (!dry) {
    mkdirSync(dirname(CONFIG_PATH), { recursive: true });
    writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
  }
  line(changed(), "config", `${CONFIG_PATH} (vault ${VAULT}, devRoot ${DEV}, os ${config.os})`);
}
if (!existsSync(DEV)) {
  if (!dry) mkdirSync(DEV, { recursive: true });
  line(changed(), "devRoot", `${DEV} created`);
}

// ---- 5. links into ~/.claude ---------------------------------------------------------------------

const same = (a: string, b: string) => {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
};
function link(target: string, path: string, dir: boolean) {
  const name = fwd(path.slice(CLAUDE.length + 1));
  if (same(path, target)) return line("ok", "link", name);
  let st;
  try {
    st = lstatSync(path);
  } catch {}
  let aside = "";
  if (!dry) {
    if (st?.isSymbolicLink()) rmSync(path); // a link holds no data: repoint it
    else if (st) aside = keepAside(path);
    mkdirSync(dirname(path), { recursive: true });
    try {
      // A junction needs no privilege on Windows; a file symlink needs Developer Mode or an elevated shell.
      symlinkSync(target, path, WIN ? (dir ? "junction" : "file") : undefined);
    } catch (e: any) {
      return line("FAIL", "link", `${name}: ${e.code === "EPERM" && WIN ? "turn on Developer Mode (Settings > For developers) or run elevated" : e.message}`);
    }
  }
  line(changed(), "link", `${name} -> ${fwd(target)}${aside ? ` (old one kept as ${aside})` : ""}`);
}
link(join(ROOT, "hooks"), HOOKS, true);
link(join(ROOT, "skills", "brain"), join(CLAUDE, "skills", "brain"), true);
for (const f of readdirSync(join(ROOT, "commands")).filter((f) => f.endsWith(".md")))
  link(join(ROOT, "commands", f), join(CLAUDE, "commands", f), false);

// ---- 6. hook block in ~/.claude/settings.json ----------------------------------------------------

{
  const file = join(CLAUDE, "settings.json");
  const quote = (t: string) => (/\s/.test(t) ? `"${t}"` : t);
  const fill = (cmd: string) =>
    cmd.split(" ").map((t) => quote(t.replace("{BUN}", fwd(process.execPath)).replace("{HOOKS}", fwd(HOOKS)))).join(" ");
  const block = JSON.parse(readFileSync(join(ROOT, "settings.hooks.json"), "utf8"));
  for (const groups of Object.values<any[]>(block)) for (const g of groups) for (const h of g.hooks) h.command = fill(h.command);

  // Ours are the brain-* commands under ~/.claude/hooks; every other hook (a plugin's, the user's) stays.
  const OURS = /[\\/]\.claude[\\/]hooks[\\/]brain-[\w-]+\.mjs/;
  const sig = (hooks: Record<string, any[]> = {}) =>
    Object.entries(hooks)
      .flatMap(([ev, gs]) => (gs ?? []).flatMap((g) => (g.hooks ?? []).filter((h: any) => OURS.test(h.command ?? ""))
        .map((h: any) => JSON.stringify([ev, g.matcher ?? "", h.type, h.command, h.timeout ?? null, h.async ?? false]))))
      .sort()
      .join("\n");
  const settings = readJson(file) ?? (existsSync(file) ? die(`${file} is not valid JSON; fix it and rerun`) : {});
  if (sig(settings.hooks) === sig(block)) line("ok", "settings.json", "hook block");
  else {
    const strip = (gs: any[] = []) =>
      gs.map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h: any) => !OURS.test(h.command ?? "")) })).filter((g) => g.hooks.length);
    const hooks: Record<string, any[]> = {};
    for (const ev of new Set([...Object.keys(settings.hooks ?? {}), ...Object.keys(block)])) {
      const gs = [...strip(settings.hooks?.[ev]), ...(block[ev] ?? [])];
      if (gs.length) hooks[ev] = gs;
    }
    let aside = "";
    if (!dry) {
      if (existsSync(file)) {
        aside = `${file}.pre-skeleton-${STAMP}`;
        cpSync(file, aside);
      }
      mkdirSync(CLAUDE, { recursive: true });
      writeFileSync(file, `${JSON.stringify({ ...settings, hooks }, null, 2)}\n`);
    }
    line(changed(), "settings.json", `hook block, ${Object.keys(block).length} events${aside ? ` (old file kept as ${aside})` : ""}`);
  }
}

// ---- 7. Identity and Hard-Rules imported by ~/.claude/CLAUDE.md ----------------------------------

{
  const file = join(CLAUDE, "CLAUDE.md");
  const want = ["Identity.md", "Hard-Rules.md"].map((f) => fwd(join(VAULT, "00-Meta", f)));
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  // The same reading as brain-doctor's `priming` check: one `@path` per line, `~` expanded.
  const have = [...text.matchAll(/^@(\S+)\s*$/gm)].map((m) => fwd(m[1].replace(/^~(?=[\\/])/, homedir())).toLowerCase());
  if (want.every((w) => have.includes(w.toLowerCase()))) line("ok", "CLAUDE.md", "imports Identity and Hard-Rules");
  else {
    const BEGIN = "<!-- knowledge-skeleton: imports, written by install.ts -->";
    const END = "<!-- /knowledge-skeleton -->";
    const section = [
      BEGIN,
      `# Knowledge vault - ${fwd(VAULT)}`,
      "",
      "Identity and Hard-Rules load whole, every session: never move either behind a link or into a hook.",
      "The SessionStart hook gives the retrieval order.",
      "",
      ...want.map((w) => `@${w}`),
      END,
    ].join("\n");
    const at = text.indexOf(BEGIN);
    const end = text.indexOf(END);
    const next = at !== -1 && end > at
      ? text.slice(0, at) + section + text.slice(end + END.length)
      : `${text ? `${text.trimEnd()}\n\n` : ""}${section}\n`;
    if (!dry) {
      mkdirSync(CLAUDE, { recursive: true });
      writeFileSync(file, next);
    }
    line(changed(), "CLAUDE.md", `imports ${want.join(", ")}`);
  }
}

// ---- 8. compile state: finished logs count as compiled -------------------------------------------

// brain-compile turns each finished daily log into notes, once, remembered by hash in a per-machine,
// untracked state file. A vault cloned onto a new machine has no state, so the first session would
// recompile every log it ever had (2026-11-01, Arch). Seeding marks today's backlog as done.
if (dry) line("would", "compile state", "mark every finished daily log as compiled");
else {
  const { FOLDERS, CONFIG } = await import("./hooks/skeleton-config.mjs");
  const file = join(VAULT, FOLDERS.ops, "brain-compile-state.json");
  const state = readJson(file) ?? {};
  const d = new Date(Date.now() - CONFIG.rolloverHour * 3600_000); // brain-lib's logicalDate
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.md`;
  const sessions = join(VAULT, FOLDERS.sessions);
  let added = 0;
  for (const y of existsSync(sessions) ? readdirSync(sessions) : [])
    for (const m of existsSync(join(sessions, y)) && lstatSync(join(sessions, y)).isDirectory() ? readdirSync(join(sessions, y)) : [])
      for (const f of lstatSync(join(sessions, y, m)).isDirectory() ? readdirSync(join(sessions, y, m)) : []) {
        const log = join(sessions, y, m, f); // the key brain-compile uses: the absolute path
        if (!/^\d{4}-\d{2}-\d{2}\.md$/.test(f) || f === today || state[log]) continue;
        state[log] = createHash("sha256").update(readFileSync(log, "utf8")).digest("hex");
        added++;
      }
  if (!added) line("ok", "compile state", "nothing to seed");
  else {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(state, null, 1));
    line("set", "compile state", `${added} finished log(s) marked compiled`);
  }
}

// ---- 9. graphify (MIT) ---------------------------------------------------------------------------

// graphify-mcp imports the `mcp` package, which only the [mcp] extra brings: without it the server
// dies on import and Claude Code lists it as failed, while every doctor check passes (Stage 4 check).
const GRAPHIFY = "graphifyy[mcp]";
const graphifyVersion = () => sh(Bun.which("graphify")!, ["--version"]).out.split("\n")[0];
if (Bun.which("graphify") && Bun.which("graphify-mcp")) line("ok", "graphify", graphifyVersion());
else if (dry) line("would", "graphify", `uv tool install "${GRAPHIFY}"`);
else {
  const r = sh(bin.uv, ["tool", "install", GRAPHIFY]);
  if (!r.ok) line("FAIL", "graphify", `uv tool install "${GRAPHIFY}": ${r.err.split("\n").at(-1)}`);
  else if (!Bun.which("graphify")) die("graphify installed but is not on PATH: run `uv tool update-shell`, open a new shell, rerun");
  else line("set", "graphify", `installed ${graphifyVersion()}`);
}

// ---- 10. context-mode (Elastic-2.0): installed from upstream, never vendored ---------------------

{
  const plugins = join(CLAUDE, "plugins");
  const installed = readJson(join(plugins, "installed_plugins.json"))?.plugins?.["context-mode@context-mode"]?.[0];
  if (installed) line("ok", "context-mode", `${installed.version}`);
  else if (dry) line("would", "context-mode", "claude plugin marketplace add mksglu/context-mode; claude plugin install context-mode@context-mode");
  else {
    const known = readJson(join(plugins, "known_marketplaces.json"))?.["context-mode"];
    const add = known ? { ok: true, err: "" } : sh(bin.claude, ["plugin", "marketplace", "add", "mksglu/context-mode"]);
    const inst = add.ok ? sh(bin.claude, ["plugin", "install", "context-mode@context-mode"]) : add;
    const version = readJson(join(plugins, "installed_plugins.json"))?.plugins?.["context-mode@context-mode"]?.[0]?.version;
    if (inst.ok && version) line("set", "context-mode", `installed ${version}`);
    else line("FAIL", "context-mode", (inst.err || "installed_plugins.json does not list it").split("\n").at(-1));
  }
}

// ---- 11. first index and graph: brain-doctor, then --repair if it fails --------------------------

// The repair records commits made outside Claude (the template's first commit), regenerates the hubs,
// indexes the vault into context-mode and builds the graph. All derived; safe to run again.
let report: any = null;
const doctor = (...a: string[]) => {
  const r = sh(process.execPath, ["--bun", join(HOOKS, "brain-doctor.mjs"), ...a], VAULT);
  try {
    return JSON.parse(r.out);
  } catch {
    line("FAIL", "first index", `brain-doctor gave no report: ${(r.err || r.out).split("\n").at(-1)}`);
    return null;
  }
};
if (dry) line("would", "first index", "brain-doctor --repair: commit notes, hubs, context-mode index, graph");
else if (failed) line("skip", "first index", "a step above failed");
else if ((report = doctor())?.ok) line("ok", "first index", "index and graph are current");
else if (report && (report = doctor("--repair"))) {
  const bad = report.repairs.filter((s: any) => !s.ok);
  line(bad.length ? "FAIL" : "set", "first index", bad.length ? bad.map((s: any) => `${s.step}: ${s.error}`).join("; ") : report.repairs.map((s: any) => s.step).join(", "));
}

// ---- 12. graphify MCP, local scope: only sessions in the vault see it ----------------------------

{
  const which = Bun.which("graphify-mcp");
  const mcp = which && resolve(which);
  const graph = join(VAULT, "graphify-out", "merged-graph.json");
  const projects = readJson(join(homedir(), ".claude.json"))?.projects ?? {};
  const current = (projects[VAULT] ?? projects[fwd(VAULT)])?.mcpServers?.graphify;
  let ok = false;
  if (current && mcp && same(current.command, mcp) && resolve(current.args?.[0] ?? "") === graph) {
    line("ok", "graphify MCP", `local scope, ${fwd(graph)}`);
    ok = true;
  } else if (dry) line("would", "graphify MCP", `claude mcp add --scope local graphify -- graphify-mcp ${fwd(graph)}`);
  else if (!mcp) line("FAIL", "graphify MCP", "graphify-mcp is not on PATH");
  else {
    if (current) sh(bin.claude, ["mcp", "remove", "--scope", "local", "graphify"], VAULT);
    const r = sh(bin.claude, ["mcp", "add", "--scope", "local", "graphify", "--", mcp, graph], VAULT);
    line(r.ok ? "set" : "FAIL", "graphify MCP", r.ok ? `local scope, ${fwd(graph)}` : r.err.split("\n").at(-1));
    ok = r.ok;
  }
  // A registered server that cannot start is invisible to brain-doctor: ask it to initialize.
  if (ok && existsSync(graph)) {
    const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "install.ts", version: PKG.version } } };
    const r = spawnSync(mcp!, [graph], { input: `${JSON.stringify(init)}\n`, encoding: "utf8", timeout: 60_000, windowsHide: true });
    if (/"serverInfo"/.test(r.stdout || "")) line("ok", "graphify MCP", "answers initialize");
    else line("FAIL", "graphify MCP", `does not start (${(r.stderr || r.error?.message || "no answer").trim().split("\n").at(-1)}). Fix: uv tool install --reinstall "${GRAPHIFY}"`);
  }
}

// ---- 13. verdict ---------------------------------------------------------------------------------

if (report) {
  console.log(`\nbrain-doctor  ${report.ok ? "PASS" : "FAIL"}`);
  for (const c of report.checks) {
    console.log(`  ${(c.ok ? "PASS" : c.level === "warn" ? "WARN" : "FAIL").padEnd(6)} ${c.id}`);
    if (!c.ok) console.log(`         ${JSON.stringify(c.detail)}`);
  }
  if (!report.ok) failed = true;
}
console.log(
  failed
    ? "\nNot done: fix what FAILed above and rerun - every step that passed is skipped next time."
    : dry
      ? "\nDry run: nothing changed."
      : mode === "template"
        ? `\nDone. Next: fill the FILL: placeholders in ${fwd(join(VAULT, "00-Meta"))}, then start Claude Code in ${fwd(VAULT)}.`
        : "\nDone.",
);
process.exit(failed ? 1 : 0);
