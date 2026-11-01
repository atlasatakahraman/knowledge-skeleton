// brain-usage.mjs - token/model/cost digest from Claude Code transcripts. Runtime: bun --bun.
// Reads ~/.claude/projects/**/*.jsonl and aggregates message.usage by logical date and model.
// A port of the vault's old .brain/usage.py, so the engine needs no Python.
//
//   bun --bun brain-usage.mjs                    last 30 days, to stdout
//   bun --bun brain-usage.mjs --days 7
//   bun --bun brain-usage.mjs --month 2026-08    writes 50-Ops/Usage/usage-2026-08.md
//   bun --bun brain-usage.mjs --blocks           rolling 5h windows (the Pro limit's shape)
//   bun --bun brain-usage.mjs --projects         break down by project
// brain-capture runs --month once per logical day.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { homedir } from "node:os";
import { VAULT, FOLDERS, ROLLOVER_HOUR } from "./brain-lib.mjs";

// USD per million tokens. VERIFY against current Anthropic pricing before trusting the cost
// column - token counts are exact, these rates are not authoritative.
// cache_read is billed at 0.1x input, cache_creation at 1.25x input.
const PRICING = {
  opus: { in: 15.0, out: 75.0 },
  sonnet: { in: 3.0, out: 15.0 },
  haiku: { in: 1.0, out: 5.0 },
  fable: { in: 3.0, out: 15.0 },
};

const rate = (model) => {
  const m = model.toLowerCase();
  for (const [key, val] of Object.entries(PRICING)) if (m.includes(key)) return val;
  return null;
};

function costUsd(model, inp, out, cread, ccreate) {
  const r = rate(model);
  if (!r) return null;
  return (inp * r.in + ccreate * r.in * 1.25 + cread * r.in * 0.1 + out * r.out) / 1_000_000;
}

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ym = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
/** Local date, shifted by the rollover hour: a message at 02:00 counts for the previous day. */
const bucketDate = (d) => ymd(new Date(d.getTime() - ROLLOVER_HOUR * 3_600_000));

/** Every assistant message with usage: { dt, project, model, usage }. */
function readEvents(root) {
  const events = [];
  for (const rel of readdirSync(root, { recursive: true })) {
    if (!String(rel).endsWith(".jsonl")) continue;
    const path = join(root, String(rel));
    const project = basename(dirname(path));
    let text;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      if (!line.includes('"usage"')) continue;
      let rec;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }
      const msg = rec.message || {};
      const usage = msg.usage;
      if (!usage || typeof usage !== "object" || !rec.timestamp) continue;
      const dt = new Date(rec.timestamp);
      if (Number.isNaN(dt.getTime())) continue;
      events.push({ dt, project, model: msg.model || "unknown", usage });
    }
  }
  return events;
}

/** [input, output, cache read, cache write, thinking] */
const tally = (u) => [
  u.input_tokens || 0,
  u.output_tokens || 0,
  u.cache_read_input_tokens || 0,
  u.cache_creation_input_tokens || 0,
  u.output_tokens_details?.thinking_tokens || 0,
];

function human(n) {
  for (const [unit, div] of [["B", 1e9], ["M", 1e6], ["k", 1e3]]) if (n >= div) return `${(n / div).toFixed(1)}${unit}`;
  return String(n);
}
const usd = (c) => `$${c.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const add = (into, vals) => vals.forEach((v, i) => (into[i] += v));

const argv = process.argv.slice(2);
const opt = (k) => {
  const i = argv.indexOf(k);
  return i !== -1 ? argv[i + 1] : null;
};
const month = opt("--month");
const days = Number(opt("--days") || 30);

const root = join(homedir(), ".claude", "projects");
if (!existsSync(root)) {
  console.log(`no transcripts at ${root}`);
  process.exit(1);
}
let events = readEvents(root);
if (!events.length) {
  console.log("no usage records found");
  process.exit(1);
}
if (month) events = events.filter((e) => ym(e.dt) === month);
else {
  const cutoff = Date.now() - days * 86_400_000;
  events = events.filter((e) => e.dt.getTime() >= cutoff);
}
if (!events.length) {
  console.log("no usage records in range");
  process.exit(1);
}

const byDay = new Map(); // day -> model -> totals
const byProject = new Map();
for (const { dt, project, model, usage } of events) {
  const vals = tally(usage);
  if (!vals.some(Boolean)) continue; // <synthetic> placeholder rows carry no tokens
  const day = bucketDate(dt);
  if (!byDay.has(day)) byDay.set(day, new Map());
  const models = byDay.get(day);
  if (!models.has(model)) models.set(model, [0, 0, 0, 0, 0]);
  add(models.get(model), vals);
  if (!byProject.has(project)) byProject.set(project, [0, 0, 0, 0, 0]);
  add(byProject.get(project), vals);
}

const out = [];
out.push(`# Claude usage — ${month || `last ${days} days`}`, "");
out.push(`Rollover ${pad(ROLLOVER_HOUR)}:00 local. ${events.length.toLocaleString("en-US")} assistant messages across ${byDay.size} days.`, "");
out.push("| Date | Model | In | Out | Think | Cache rd | Cache wr | Hit % | Est. USD |");
out.push("|---|---|--:|--:|--:|--:|--:|--:|--:|");

const grand = [0, 0, 0, 0, 0];
let grandCost = 0;
const unpriced = new Set();
for (const day of [...byDay.keys()].sort().reverse()) {
  const models = byDay.get(day);
  for (const model of [...models.keys()].sort()) {
    const [i, o, cr, cc, th] = models.get(model);
    add(grand, [i, o, cr, cc, th]);
    const totalIn = i + cr + cc;
    const hit = totalIn ? `${Math.round((cr / totalIn) * 100)}%` : "-";
    const c = costUsd(model, i, o, cr, cc);
    let cstr = "?";
    if (c === null) unpriced.add(model);
    else {
      grandCost += c;
      cstr = usd(c);
    }
    out.push(`| ${day} | ${model.replace("claude-", "")} | ${human(i)} | ${human(o)} | ${human(th)} | ${human(cr)} | ${human(cc)} | ${hit} | ${cstr} |`);
  }
}

const [gi, go, gcr, gcc, gth] = grand;
const gTotalIn = gi + gcr + gcc;
out.push("", "## Total", "");
out.push(`- input **${human(gi)}** · output **${human(go)}** · thinking **${human(gth)}**`);
out.push(`- cache read **${human(gcr)}** · cache write **${human(gcc)}**`);
if (gTotalIn)
  out.push(`- **cache hit rate ${((gcr / gTotalIn) * 100).toFixed(1)}%** — cache reads bill at 10% of input, so this is the number that moves cost`);
out.push(`- **${usd(grandCost)}** at pay-as-you-go API rates`);
out.push("- On a **Pro subscription this is not what you paid** — it is what the same traffic would have cost via the API. Useful as a relative measure of which days and models are expensive, not as a bill.");
out.push("- Rates in `brain-usage.mjs` are not authoritative. Token counts are exact.");
if (unpriced.size) out.push(`- unpriced models, excluded from cost: ${[...unpriced].sort().join(", ")}`);

if (argv.includes("--projects")) {
  out.push("", "## By project", "", "| Project | In | Out | Cache rd |", "|---|--:|--:|--:|");
  const sum = (a) => a.reduce((s, v) => s + v, 0);
  for (const [proj, [i, o, cr]] of [...byProject].sort((a, b) => sum(b[1]) - sum(a[1])))
    out.push(`| ${proj} | ${human(i)} | ${human(o)} | ${human(cr)} |`);
}

if (argv.includes("--blocks")) {
  out.push("", "## Rolling 5-hour blocks", "");
  const blocks = new Map(); // block start (local, hour floored to a multiple of 5) -> totals
  for (const { dt, usage } of events) {
    const a = new Date(dt);
    a.setHours(a.getHours() - (a.getHours() % 5), 0, 0, 0);
    const key = `${ymd(a)} ${pad(a.getHours())}:00`;
    if (!blocks.has(key)) blocks.set(key, [0, 0, 0, 0, 0]);
    add(blocks.get(key), tally(usage));
  }
  out.push("| Block start | In | Out | Cache rd |", "|---|--:|--:|--:|");
  for (const key of [...blocks.keys()].sort().reverse().slice(0, 12)) {
    const [i, o, cr] = blocks.get(key);
    out.push(`| ${key} | ${human(i)} | ${human(o)} | ${human(cr)} |`);
  }
}

const text = out.join("\n");
if (month) {
  const dest = join(VAULT, FOLDERS.ops, "Usage", `usage-${month}.md`);
  mkdirSync(dirname(dest), { recursive: true });
  const today = ymd(new Date());
  const header = `---\ntype: usage\nproject: brain\ntags: [usage, tokens, cost]\ncreated: ${today}\nupdated: ${today}\nstatus: active\n---\n\n`;
  writeFileSync(dest, `${header}${text}\n`, "utf8");
  console.log(`wrote ${dest}`);
} else console.log(text);
