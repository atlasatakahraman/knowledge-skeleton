// brain-session.mjs - SessionStart. Injects the always-true core of the brain.
//
// Why this exists: brain-inject.mjs does per-prompt FTS5 lookup, but keyword search
// structurally cannot answer identity questions - "Who am I" shares no term with
// Identity.md, so it returns nothing. This carries the small always-relevant tier
// regardless of cwd, so sessions started OUTSIDE the vault (where the vault's own
// CLAUDE.md never loads) still know who the user is and where things live.
//
// Runtime is bun (`bun --bun`), per 00-Meta/Hard-Rules.
import { readFileSync, existsSync, readdirSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { join, basename } from "node:path";
import { release } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import {
  VAULT, DEV_ROOT, HOOKS, sessionDbs, failures, HOOK_EVENTS, ledgerRead, logicalDate, FOLDERS, CONFIG,
  PIN_FILE, skeletonPin, compareVersions, withLock, syncRecords, recordFailure, clearFailure,
} from "./brain-lib.mjs";

/**
 * Which OS this session runs on, detected now rather than written into a file. A machine may
 * boot more than one OS over the same vault — a hand-written "you are on Windows" would be right
 * on one boot and wrong on the other. The description around it is the config's `machine` text.
 */
function machine() {
  let current;
  if (process.platform === "win32") {
    current = `Windows (NT ${release()})`;
  } else if (process.platform === "linux") {
    let distro = "Linux";
    try {
      distro = readFileSync("/etc/os-release", "utf8").match(/^PRETTY_NAME="?([^"\n]+)/m)?.[1] ?? distro;
    } catch {}
    const desktop = [process.env.XDG_CURRENT_DESKTOP, process.env.XDG_SESSION_TYPE].filter(Boolean).join(", ");
    current = desktop ? `${distro} (${desktop})` : distro;
  } else {
    current = process.platform;
  }
  return [
    "## Machine",
    "",
    ...(CONFIG.machine ? [CONFIG.machine, ""] : []),
    `**Current OS: ${current}** (records stamped \`${CONFIG.os}\`). Vault ${VAULT}, checkouts ${DEV_ROOT}.`,
  ].join("\n");
}

/**
 * Fast-forward one checkout from its upstream: clean tree only (untracked files never block a
 * fast-forward), pull only - pushing stays the user's call. `{ busy }`, `{ skipped }`, `{ failed }`,
 * or the commit count and the `git` runner for a follow-up question about the pulled range.
 * Fetch, then merge the upstream ref, under a lock: two sessions starting together each ran
 * `git pull`, and the two fetches left FETCH_HEAD with two merge lines (2026-11-02). Busy means
 * the other session is pulling this checkout right now; it reports.
 */
function ffPull(cwd) {
  const git = (...a) =>
    spawnSync("git", a, {
      cwd, encoding: "utf8", windowsHide: true, timeout: 8_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
  const why = (r) => (r.stderr || r.error?.message || "timeout").trim().split("\n")[0];
  return withLock(`pull-${basename(cwd)}`, () => {
    if (git("status", "--porcelain", "--untracked-files=no").stdout?.trim()) return { skipped: true };
    const before = git("rev-parse", "HEAD").stdout?.trim();
    const f = git("fetch", "--quiet");
    if (f.status !== 0) return { failed: why(f) };
    const m = git("merge", "--ff-only", "--quiet", "@{u}");
    if (m.status !== 0) return { failed: why(m) };
    return { n: Number(git("rev-list", "--count", `${before}..HEAD`).stdout?.trim() || 0), before, git };
  }, 60_000) ?? { busy: true };
}

/**
 * Commit and push records an earlier session left behind: its SessionEnd sync never ran, or the
 * machine went down first (a reboot into the other OS). Before the vault pull, so the tree it
 * pulls into is clean. Silent when there was nothing to do.
 */
function recordsSync() {
  if (process.env.CLAUDE_INVOKED_BY || process.argv.includes("--dry")) return null;
  const r = syncRecords();
  if (r.failed) {
    recordFailure("records", new Error(r.failed));
    return null; // the `!! BRAIN RECORDS FAILING` line carries it
  }
  if (!r.busy) clearFailure("records");
  if (r.held) return `!! RECORDS committed but not pushed: ${VAULT} has your own unpushed commits, and a push sends both. Push when they are ready.`;
  if (r.skipped === "other changes are staged") return "!! RECORDS not committed: other changes are staged in the vault.";
  if (r.skipped === "gitleaks not installed") return "!! RECORDS not committed: gitleaks is not on PATH, and records are never pushed unscanned. Install it (see INSTALL.md § Prerequisites), restart Claude Code.";
  if (r.pushed) return `Records from an earlier session committed and pushed (${r.committed} file${r.committed === 1 ? "" : "s"}).`;
  return null;
}

/**
 * Fast-forward the vault from origin before the session reads it ([[0045-cross-os-vault-sync-and-os-stamps]]).
 * The two boots never edit at once, so every conflict so far was a forgotten pull.
 * Silent when already current; one line when it pulled or could not.
 */
function vaultPull() {
  if (process.env.CLAUDE_INVOKED_BY || process.argv.includes("--dry")) return null;
  const r = ffPull(VAULT);
  if (r.busy) return null;
  if (r.skipped) return "!! VAULT PULL skipped: uncommitted changes. Commit or stash, then `git pull --ff-only`.";
  if (r.failed) return `!! VAULT PULL failed: ${r.failed}. Pull by hand before editing.`;
  if (!r.n) return null;
  spawn(process.execPath, ["--bun", join(HOOKS, "brain-reindex.mjs"), "--vault"], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  return `Vault pulled ${r.n} commit${r.n === 1 ? "" : "s"} from origin (the other OS may have written since). Reindex scheduled.`;
}

/**
 * Fast-forward the engine the hooks run from, so both machines run the skeleton the vault pins.
 * This hook is already loaded; the next hook to start runs the pulled code. A detached HEAD is a
 * checkout pinned on purpose (a tag), left alone and silent. The hook block in settings.json is
 * a copy of settings.hooks.json, so a pull that changes that file asks for the installer.
 */
function skeletonPull() {
  if (process.env.CLAUDE_INVOKED_BY || process.argv.includes("--dry")) return null;
  const root = skeletonPin().root;
  if (spawnSync("git", ["symbolic-ref", "-q", "HEAD"], { cwd: root, windowsHide: true }).status !== 0) return null;
  const r = ffPull(root);
  if (r.busy) return null;
  if (r.skipped) return `!! SKELETON PULL skipped: uncommitted changes in ${root}.`;
  if (r.failed) return `!! SKELETON PULL failed: ${r.failed}. Pull ${root} by hand.`;
  if (!r.n) return null;
  const hooks = r.git("diff", "--name-only", `${r.before}..HEAD`, "--", "settings.hooks.json").stdout?.trim();
  return (
    `Skeleton pulled ${r.n} commit${r.n === 1 ? "" : "s"} into ${root}; hooks started from now on run the new code.` +
    (hooks ? " settings.hooks.json changed: rerun its install.ts so settings.json carries the new hook block." : "")
  );
}

/** One line when the running skeleton is not the version the vault pins, naming which side moves. Silent on a match or with no pin. */
function pinCheck() {
  const { root, version, pin } = skeletonPin();
  if (!pin || !version || compareVersions(version, pin) === 0) return null;
  return compareVersions(version, pin) < 0
    ? `!! SKELETON ${version} is behind the vault's pin ${pin}: \`git -C ${root} pull --ff-only\`.`
    : `!! SKELETON ${version} is ahead of the vault's pin ${pin}: read its changes since ${pin} (\`git -C ${root} log v${pin}..\`), adapt the vault, then set ${PIN_FILE} to ${version} and commit it.`;
}

const STALE_DAYS = 3; // slack for a weekend off, tight enough to catch a real break early

/**
 * The flush canary. Sessions are being captured (a session DB was written) but no daily note has
 * appeared for days => the flush pipeline is dropping everything on the floor.
 *
 * This is the only monitoring the memory loop has. Hooks fail silent by design
 * ([[0002-hooks-fail-silent-always-query]]), so a broken flush reports nothing - it ran for ten
 * days in 2026-08/09 writing FLUSH_OK every time and nothing anywhere said so. The statusline
 * that would have carried this was removed ([[0008-statusline-removed]]), and SessionStart is
 * the one surface left that the user reads every single session.
 *
 * Deliberately mtime-only: no sqlite open, no query, just a stat per DB file. "Days since the
 * last note" alone cannot tell a broken pipeline from a few days off - the comparison against
 * capture activity is what makes the signal mean something.
 */
/** The last flush outcome from the hook event log - names the layer, not just the symptom. */
function lastFlush() {
  try {
    const lines = readFileSync(HOOK_EVENTS, "utf8").trimEnd().split("\n");
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 500); i--) {
      const e = JSON.parse(lines[i]);
      if (e.hook === "flush") return `last flush: ${e.outcome} at ${String(e.ts).slice(0, 16)}Z`;
    }
  } catch {}
  return `no flush in ${FOLDERS.ops}/hook-events.jsonl yet`;
}

function flushCanary() {
  const days = (ms) => Math.floor((Date.now() - ms) / 86_400_000);

  let newestNote = 0;
  const dir = join(VAULT, FOLDERS.sessions);
  const walk = (p) => {
    for (const e of readdirSync(p, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(p, e.name));
      else if (/^\d{4}-\d{2}-\d{2}\.md$/.test(e.name)) {
        const t = Date.parse(`${e.name.slice(0, 10)}T12:00:00`);
        if (t > newestNote) newestNote = t;
      }
    }
  };
  walk(dir);

  let newestCapture = 0;
  for (const f of sessionDbs()) {
    const t = statSync(f).mtimeMs;
    if (t > newestCapture) newestCapture = t;
  }
  if (!newestCapture) return null;

  const quiet = days(newestNote);
  if (quiet < STALE_DAYS || newestCapture <= newestNote) return null;

  return (
    `!! FLUSH CANARY: sessions captured ${days(newestCapture)}d ago, but the newest note in ` +
    `${FOLDERS.sessions}/ is ${quiet}d old. The memory loop is capturing and not writing (${lastFlush()}). ` +
    `Diagnose with: bun --bun ~/.claude/hooks/brain-flush.mjs <session-id> "<cwd>" --dry-run, ` +
    `and read the tail of ${HOOK_EVENTS}.`
  );
}

/**
 * The daily sweep's verdict, surfaced only when something is wrong. Silence means healthy - a
 * green line printed every session is wallpaper within a week. Also catches the Routine itself
 * stopping: it is a claude session and dies with auth, and this hook does not depend on it (V7).
 */
function healthAlarm() {
  const dir = join(VAULT, FOLDERS.ops, "Health");
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => /^health-\d{4}-\d{2}\.md$/.test(f)).sort();
  } catch {}
  if (!files.length) return null; // before the Routine's first run: nothing to say yet
  // Sorted by "YYYY-MM-DD HH:MM", not file order: each boot appends its own lines and a pull merges
  // them, so the file's last line is not always the newest record (11-06 landed after 11-10).
  const lines = readFileSync(join(dir, files.at(-1)), "utf8")
    .split("\n")
    .filter((l) => /^- \d{4}-\d{2}-\d{2} /.test(l))
    .sort((a, b) => a.slice(2, 18).localeCompare(b.slice(2, 18)));
  const last = lines.at(-1);
  if (!last) return null;
  const day = last.slice(2, 12);
  // Stale means "the vault was used on a whole day with no sweep", not "N days passed": the Routine
  // only runs while its boot is up, so days spent on the other boot or powered off are not misses.
  // A day counts as used when it has a session note; today is excluded because its sweep may not
  // have run yet. Days are logical (05:00 rollover), matching the session notes.
  const now = new Date(Date.now() - 5 * 3_600_000);
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const missed = [];
  const walk = (p) => {
    for (const e of readdirSync(p, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(p, e.name));
      else if (/^\d{4}-\d{2}-\d{2}\.md$/.test(e.name)) {
        const d = e.name.slice(0, 10);
        if (d > day && d < today) missed.push(d);
      }
    }
  };
  try {
    walk(join(VAULT, FOLDERS.sessions));
  } catch {}
  if (missed.length)
    return `!! VAULT HEALTH: no sweep recorded since ${day}, though the vault was used on ${missed.sort().join(", ")}. Was the Claude Desktop app's vault-health Routine able to run on that boot? Run it by hand: bun --bun ~/.claude/hooks/brain-doctor.mjs --repair --record --pretty`;
  if (last.includes("**FAIL**"))
    return `!! VAULT HEALTH FAIL (${day}): ${last.split("·")[1]?.trim()}. Details: bun --bun ~/.claude/hooks/brain-doctor.mjs --pretty — and any explanation the Routine wrote under that line in ${FOLDERS.ops}/Health/${files.at(-1)}.`;
  return null;
}

/**
 * Re-flush sessions whose last flush never finished. Closing the app ends every session at once and
 * kills each detached flush mid-`claude -p`: the watermark never advances, and an ended session never
 * captures again - two sessions' tails were lost that way on 2026-09-22. Such a session's last
 * capture/flush event is its capture, flush's `ledger` step, `busy` or `failed`, never a finished
 * outcome. The lock and the watermark make a duplicate re-flush harmless.
 */
function reflushOrphans() {
  if (process.env.CLAUDE_INVOKED_BY) return 0; // flush's own `claude -p` starts a session too
  const last = new Map();
  const tps = new Map();
  for (const l of readFileSync(HOOK_EVENTS, "utf8").trimEnd().split("\n")) {
    let e;
    try { e = JSON.parse(l); } catch { continue; }
    if (!e.sid || (e.hook !== "flush" && e.hook !== "capture")) continue;
    if (e.hook === "capture" && e.transcript) tps.set(e.sid, e.transcript);
    last.set(e.sid, e);
  }
  const day = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = day(logicalDate(new Date()));
  let n = 0;
  for (const [sid, e] of last) {
    const age = Date.now() - Date.parse(e.ts);
    if (n >= 5 || age < 180_000 || age > 3 * 86_400_000) continue; // 180 s: flush's lock expiry
    if (e.hook === "flush" && !["ledger", "busy", "failed"].includes(e.outcome)) continue;
    const tp = tps.get(sid);
    if (!tp || !existsSync(tp)) continue;
    const argv = [join(HOOKS, "brain-flush.mjs"), sid, cwdOf(tp), "--transcript", tp];
    const d = day(logicalDate(new Date(e.ts)));
    if (d !== today) argv.push("--date", d);
    spawn(process.execPath, ["--bun", ...argv], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: { ...process.env, CLAUDE_INVOKED_BY: "brain_flush" },
    }).unref();
    n++;
  }
  return n;
}

/** The session's cwd, from the first transcript record that carries one - only the note's label uses it. */
function cwdOf(tp) {
  let fd;
  try {
    fd = openSync(tp, "r");
    const buf = Buffer.alloc(65_536);
    const m = buf.toString("utf8", 0, readSync(fd, buf, 0, buf.length, 0)).match(/"cwd":"((?:[^"\\]|\\.)*)"/);
    return m ? JSON.parse(`"${m[1]}"`) : "";
  } catch {
    return "";
  } finally {
    try { if (fd !== undefined) closeSync(fd); } catch {}
  }
}

// Priming (Identity, Hard-Rules) is NOT injected here: ~/.claude/CLAUDE.md imports both, and
// Claude Code loads imports in full. A hook's additionalContext over 10,000 chars is replaced by a
// file path and a 2,000-char preview, and the old CAP that kept it under dropped the rules kernel
// (2026-10-09). This hook carries only what changes per session; brain-doctor's `priming` check
// keeps its output under the limit and the imports resolving.

try {
  // The OS line matters even when the vault is missing — more so, since that is how a fresh
  // boot into the other OS usually looks.
  if (!existsSync(VAULT)) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: `${machine()}\n\nThe vault is not at ${VAULT} on this OS.`,
        },
      }),
    );
    process.exit(0);
  }

  // First, so everything below reads the pulled vault and the pulled skeleton's version. Leftover
  // records go out before the pull, so the pull meets a clean tree.
  let records = null;
  try {
    records = recordsSync();
  } catch {}
  let pulled = null;
  try {
    pulled = vaultPull();
  } catch {}
  let skeleton = null;
  try {
    skeleton = skeletonPull();
  } catch {}
  let pinned = null;
  try {
    pinned = pinCheck();
  } catch {}
  // Never let the canary break the injection it rides on.
  let canary = null;
  try {
    canary = flushCanary();
  } catch {}
  let health = null;
  try {
    health = healthAlarm();
  } catch {}
  // --dry: brain-doctor runs this hook to measure its output; that run must not spawn flushes.
  if (!process.argv.includes("--dry"))
    try {
      reflushOrphans();
    } catch {}
  let decisions = null;
  try {
    const n = ledgerRead().filter((e) => e.promoted === null).length;
    if (n) decisions = `${n} captured decision${n === 1 ? "" : "s"} not yet in ${FOLDERS.decisions}/ — promote with /brain new decision --ledger`;
  } catch {}

  // The cause, when a hook recorded one — no waiting STALE_DAYS for the symptom.
  const failing = Object.entries(failures()).map(
    ([tag, f]) =>
      `!! BRAIN ${tag.toUpperCase()} FAILING since ${new Date(f.at).toISOString().slice(0, 16)}Z: ${f.reason}. ` +
      "Tell the user in the first reply; a `claude -p` auth failure needs them to run `claude` and /login.",
  );

  const ctx = [
    ...failing.flatMap((l) => [l, ""]),
    ...(records ? [records, ""] : []),
    ...(pulled ? [pulled, ""] : []),
    ...(skeleton ? [skeleton, ""] : []),
    ...(pinned ? [pinned, ""] : []),
    ...(canary ? [canary, ""] : []),
    ...(health ? [health, ""] : []),
    ...(decisions ? [decisions, ""] : []),
    machine(),
    "",
    `The user's second brain is at ${VAULT}. Its Identity.md and Hard-Rules.md are loaded in full`,
    "through ~/.claude/CLAUDE.md imports and are authoritative about who the user is and the rules.",
    "",
    "Retrieval order for anything else - do not skip tiers:",
    "  0. Note names injected on each prompt by brain-inject - vault notes only. Follow one into the file.",
    "  1. 00-MOC-Root -> the 00-MOC-* it points to -> the note",
    "  2. ctx_search - see the warning below",
    '  3. graphify query "<q>" --budget 1500 - how things connect',
    "  4. Read one named file",
    "",
    "ctx_search reaches the vault ONLY in a session launched in the vault. Its `project` parameter",
    "does not redirect it (measured 2026-09-21, context-mode v1.0.169): from anywhere else it returns",
    "this session's own events, never vault notes - even though the index is complete. Outside the",
    `vault, tier 0 then tier 4 is the working path. Details: ${FOLDERS.meta}/Hard-Rules.md § Tooling.`,
    "Check retrieval any time, zero tokens: bun --bun ~/.claude/hooks/brain-doctor.mjs --pretty",
    "",
    `The vault is notes only - the checkouts moved to ${join(DEV_ROOT, "<remote-name>")} on 2026-09-06.`,
    `Do NOT sweep ${DEV_ROOT} blind: that is where node_modules and target/ live. Repo docs are indexed`,
    "per repo (searchable via ctx_search in a session launched in that repo) and reachable through",
    "the merged graph, so a blind sweep is the wrong tool there too.",
  ].join("\n");

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: ctx },
    }),
  );
} catch {
  /* a context hook must never break a session */
}
process.exit(0);
