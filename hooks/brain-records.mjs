// brain-records.mjs - detached at SessionEnd by brain-capture, after the flush it starts. Waits
// for that flush to finish, then commits and pushes the hook-written records (syncRecords), so the
// other boot pulls this session's log at its next session start.
//
//   brain-records.mjs [<session-id>]
//
// With no session id it syncs at once: run it by hand before rebooting into the other OS when the
// session ended less than two minutes ago and its flush may still be running.
//
// A failure is recorded for brain-session's `!! BRAIN RECORDS FAILING` line; the next session start
// retries the sync itself, so a reboot that kills this process loses nothing on this machine.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { STATE_DIR, syncRecords, logEvent, recordFailure, clearFailure } from "./brain-lib.mjs";

const sid = (process.argv[2] ?? "").replace(/[^a-z0-9-]/gi, "");
const sleep = (ms) => Bun.sleepSync(ms);

try {
  if (sid) {
    // The flush takes its lock a moment after brain-capture detaches it, and holds it through its
    // `claude -p` (120 s timeout).
    sleep(5_000);
    const lock = join(STATE_DIR, `flush-${sid}.lock`);
    for (let waited = 0; existsSync(lock) && waited < 200_000; waited += 2_000) sleep(2_000);
  }
  const r = syncRecords();
  logEvent({ hook: "records", sid: sid || null, ...r });
  if (r.failed) recordFailure("records", new Error(r.failed));
  else if (!r.busy) clearFailure("records");
  if (!sid) process.stdout.write(`${JSON.stringify(r)}\n`);
} catch {
  /* background process - never surface */
}
process.exit(0);
